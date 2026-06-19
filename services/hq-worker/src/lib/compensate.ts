/**
 * services/hq-worker/src/lib/compensate.ts
 *
 * LIFO compensation engine for the provisioning saga (D-10).
 *
 * D-10: Rollback (compensation) is built and tested BEFORE the happy-path
 * forward steps. This file must exist and pass tests before provision-studio.ts
 * is written.
 *
 * Contract:
 *  - compensate(run, apis, log) builds a LIFO teardown list from the step_N_at
 *    flags on the run row.
 *  - Each teardown is attempted in reverse step order (7→6→5→4→1).
 *    Steps 2 and 3 have no compensation — project deletion covers DB + seed data.
 *    Step 8 has no compensation — registry write is idempotent and harmless to leave.
 *  - Each compensation step is wrapped in try/catch; errors are collected but
 *    NEVER re-raised (best-effort teardown).
 *  - On completion, the run row is updated:
 *      status = 'failed_terminal'
 *      compensation_errors = JSON of step→error map (empty '{}' on clean teardown)
 *      updated_at = now()
 *
 * PII boundary (D-13):
 *  compensate receives only provider RESOURCE IDs from the run row
 *  (neon_project_id, vercel_project_id, fly_app_name, subdomain, studio_id).
 *  It NEVER receives or touches a Neon connection string.
 */

import { eq } from "drizzle-orm";
import { getHqDb, hqProvisioningRuns, hqStudioTokens } from "./db.js";
import type { HqProvisioningRun } from "./db.js";
import type { ProvisionApis } from "./provision-apis/types.js";

/** Pino-compatible logger interface (subset used here). */
interface Logger {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
}

/**
 * Compensation step descriptor.
 * Only resource IDs are stored — connection strings are never part of compensation.
 */
interface CompensationStep {
  step: number;
  action: string;
  resourceId: string;
}

/**
 * Execute a single compensation step against the provider APIs.
 *
 * Steps and their teardown actions:
 *   7 → revoke_token    — mark hq_studio_tokens.revoked_at (DB, not a provider call)
 *   6 → remove_dns      — vercel.deleteProject also removes the domain; no separate DNS call needed
 *   5 → delete_fly_app  — apis.fly.deleteApp(fly_app_name)
 *   4 → delete_vercel   — apis.vercel.deleteProject(vercel_project_id)
 *   1 → delete_neon     — apis.neon.deleteProject(neon_project_id)
 */
async function executeCompensationStep(
  comp: CompensationStep,
  apis: ProvisionApis,
): Promise<void> {
  switch (comp.action) {
    case "revoke_token": {
      // Mark the studio token as revoked in HQ DB.
      // resourceId is the studioId (the token table is keyed on studio_id).
      const db = getHqDb();
      await db
        .update(hqStudioTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(eq(hqStudioTokens.studioId, comp.resourceId));
      break;
    }
    case "remove_dns": {
      // Step 6 domain attachment is reversed by deleting the Vercel project
      // (done in step 4 compensation). If step 4 completed and step 6 did too,
      // step 4 compensation already handles domain removal. We only need this
      // when step 6 is done but step 4 isn't (which can't happen in sequential
      // saga ordering, but we handle it defensively). No separate DNS provider
      // call is needed for gymclassos.com subdomain (Vercel manages the zone).
      // This step is a logical placeholder so the LIFO list is complete.
      break;
    }
    case "delete_fly_app": {
      await apis.fly.deleteApp(comp.resourceId);
      break;
    }
    case "delete_vercel": {
      await apis.vercel.deleteProject(comp.resourceId);
      break;
    }
    case "delete_neon": {
      await apis.neon.deleteProject(comp.resourceId);
      break;
    }
    default: {
      throw new Error(`Unknown compensation action: ${comp.action}`);
    }
  }
}

/**
 * LIFO compensation (rollback) engine.
 *
 * Called by the saga on any step failure. Tears down completed steps in
 * reverse order (7→6→5→4→1; steps 2,3,8 have no compensation).
 * Best-effort: errors are collected but never re-raised.
 * Finally writes status='failed_terminal' + compensationErrors to the run row.
 *
 * @param run    - The provisioning run row (resource IDs + step_N_at flags).
 * @param apis   - Provider API bag (NeonApi, VercelApi, FlyApi).
 * @param log    - Pino logger.
 */
export async function compensate(
  run: HqProvisioningRun,
  apis: ProvisionApis,
  log: Logger,
): Promise<void> {
  // Build LIFO list — only for completed steps, highest step first.
  // Steps 2 and 3 have no compensation (project deletion covers cleanup).
  // Step 8 has no compensation (registry mark is idempotent; harmless to leave).
  const completed: CompensationStep[] = [];

  if (run.step7At && run.studioId) {
    completed.push({ step: 7, action: "revoke_token", resourceId: run.studioId });
  }
  if (run.step6At && run.subdomain) {
    completed.push({ step: 6, action: "remove_dns", resourceId: run.subdomain });
  }
  if (run.step5At && run.flyAppName) {
    completed.push({ step: 5, action: "delete_fly_app", resourceId: run.flyAppName });
  }
  if (run.step4At && run.vercelProjectId) {
    completed.push({ step: 4, action: "delete_vercel", resourceId: run.vercelProjectId });
  }
  // Steps 2 and 3 — no compensation entry.
  if (run.step1At && run.neonProjectId) {
    completed.push({ step: 1, action: "delete_neon", resourceId: run.neonProjectId });
  }

  log.info(
    { runId: run.id, compensating: completed.map((c) => c.step) },
    "[compensate] starting LIFO teardown",
  );

  const errors: Record<string, string> = {};

  for (const comp of completed) {
    try {
      log.info(
        { runId: run.id, step: comp.step, action: comp.action },
        "[compensate] executing compensation step",
      );
      await executeCompensationStep(comp, apis);
      log.info(
        { runId: run.id, step: comp.step },
        "[compensate] step teardown succeeded",
      );
    } catch (err) {
      // Best-effort: record error but continue with remaining compensations.
      const msg = err instanceof Error ? err.message : String(err);
      errors[`step_${comp.step}`] = msg;
      log.error(
        { runId: run.id, step: comp.step, action: comp.action, err },
        "[compensate] compensation step failed — continuing",
      );
    }
  }

  // Write final status to the run row.
  const db = getHqDb();
  await db
    .update(hqProvisioningRuns)
    .set({
      status: "failed_terminal",
      compensationErrors: JSON.stringify(errors),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(hqProvisioningRuns.id, run.id));

  log.info(
    { runId: run.id, errors },
    "[compensate] LIFO teardown complete — run marked failed_terminal",
  );
}
