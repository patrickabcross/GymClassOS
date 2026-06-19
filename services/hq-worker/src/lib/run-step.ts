/**
 * services/hq-worker/src/lib/run-step.ts
 *
 * Per-step idempotency helper for the provisioning saga.
 *
 * Each forward step in the saga is wrapped in runStep(db, runId, N, fn):
 *   - If step_N_at is already set (non-null) → skip; return { skipped: true }.
 *   - Otherwise → execute fn(); on success, mark step_N_at with current ISO
 *     timestamp; return fn's output.
 *   - If fn() throws → step_N_at is NOT marked (so a retry re-runs the step);
 *     the error propagates to the saga catch, which triggers compensation.
 *
 * Race-condition safety (note): A single pg-boss worker processes a given runId
 * at a time (expireInSeconds:600, retryLimit:3 set on boss.send call in
 * registerProvisionStudio — see Pitfall P-07). The read-then-write is therefore
 * safe without a pessimistic lock.
 *
 * Reference: BD2-RESEARCH.md Pattern 4 (runStep canonical implementation).
 */

import { eq } from "drizzle-orm";
import { getHqDb, hqProvisioningRuns } from "./db.js";
import type { HqDb, HqProvisioningRun } from "./db.js";

/** Valid step numbers for the provisioning saga. */
export type StepNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Map step number to the Drizzle column key for step_N_at. */
const stepColMap: Record<StepNum, keyof HqProvisioningRun> = {
  1: "step1At",
  2: "step2At",
  3: "step3At",
  4: "step4At",
  5: "step5At",
  6: "step6At",
  7: "step7At",
  8: "step8At",
};

/** Sentinel returned when a step is skipped (already completed). */
export type SkippedResult = { skipped: true; runId: string };

/**
 * Execute a single saga step with idempotency semantics.
 *
 * If step_N_at is already set, the step is skipped and { skipped: true } is
 * returned without calling fn(). This means a retried saga run resumes at the
 * first incomplete step, never duplicating Neon/Vercel/Fly resources.
 *
 * The db handle is obtained from getHqDb() so tests mock that function
 * via vi.mock('./db.js') rather than passing a db argument.
 *
 * @param runId   - The provisioning_run.id being processed.
 * @param stepNum - Which step (1..8) to check/mark.
 * @param fn      - Async function to execute if step is not yet complete.
 * @returns fn's return value, or { skipped: true } if step was already done.
 */
export async function runStep<T>(
  runId: string,
  stepNum: StepNum,
  fn: () => Promise<T>,
): Promise<T | SkippedResult> {
  const db = getHqDb();

  // Read current run to check step completion status.
  const rows = await db
    .select()
    .from(hqProvisioningRuns)
    .where(eq(hqProvisioningRuns.id, runId))
    .limit(1);

  const run = rows[0];
  if (!run) {
    throw new Error(`run ${runId} not found`);
  }

  const stepCol = stepColMap[stepNum];
  if (run[stepCol] !== null && run[stepCol] !== undefined) {
    // Step already completed on a previous attempt — skip without calling fn.
    return { skipped: true, runId } satisfies SkippedResult;
  }

  // Execute the step.
  const output = await fn();

  // Mark step complete — atomic because only one pg-boss worker processes
  // a given runId at a time (see module docstring re: race-condition safety).
  const now = new Date().toISOString();
  await db
    .update(hqProvisioningRuns)
    .set({ [stepCol]: now, updatedAt: now })
    .where(eq(hqProvisioningRuns.id, runId));

  return output;
}
