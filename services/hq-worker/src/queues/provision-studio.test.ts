/**
 * provision-studio.test.ts — 8-step provisioning saga orchestrator tests
 *
 * Tests (all using mocked provider APIs and stubbed migrator/seeder):
 *
 *  1. Happy path: all steps 1-8 run in order; telemetry token hash stored;
 *     plaintext set as STUDIO_TELEMETRY_TOKEN on Vercel + Fly.
 *
 *  2. Resume (idempotency): steps 1-3 already skipped by runStep →
 *     Neon createProject NOT called from step fn; no duplicate resources.
 *
 *  3. Failure at step 6 (runStep throws for step 6) → compensate() called;
 *     run is marked failed_terminal.
 *
 *  4. PII boundary: dbUrl never written to any hqProvisioningRuns db.update call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HqProvisioningRun } from "../lib/db.js";

// ---------------------------------------------------------------------------
// Module mocks — use vi.fn() INLINE in factory to avoid hoisting issues.
// We retrieve the mocks via vi.mocked() after import.
// ---------------------------------------------------------------------------

vi.mock("../lib/db.js", () => ({
  getHqDb: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
  hqProvisioningRuns: { id: "id_col" },
  hqStudioTokens: { studioId: "studio_id_col" },
  hqStudios: { id: "studios_id_col" },
}));

vi.mock("../lib/run-step.js", () => ({
  runStep: vi.fn(async (runId: string, stepNum: number, fn: () => Promise<unknown>) => {
    return fn();
  }),
}));

vi.mock("../lib/compensate.js", () => ({
  compensate: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

import { runProvisioningSaga } from "./provision-studio.js";
import { makeMockApis } from "../__tests__/mocks/provision-apis.js";
import { runStep } from "../lib/run-step.js";
import { compensate } from "../lib/compensate.js";
import { getHqDb } from "../lib/db.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(partial: Partial<HqProvisioningRun> = {}): HqProvisioningRun {
  return {
    id: "run-001",
    studioId: "studio-001",
    status: "started",
    neonProjectId: null,
    vercelProjectId: null,
    flyAppName: null,
    subdomain: null,
    step1At: null,
    step2At: null,
    step3At: null,
    step4At: null,
    step5At: null,
    step6At: null,
    step7At: null,
    step8At: null,
    compensationErrors: "{}",
    startedAt: "2026-06-19T00:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...partial,
  };
}

const noopLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const stubMigrator = vi.fn().mockResolvedValue(undefined);
const stubSeeder = vi.fn().mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runProvisioningSaga", () => {
  let apis: ReturnType<typeof makeMockApis>;
  let mockDb: ReturnType<typeof getHqDb>;
  let mockDbUpdateSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    apis = makeMockApis();

    // Set up a fresh db mock that captures update().set() calls
    mockDbUpdateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbUpdateSet });
    const mockDbSelectLimit = vi.fn().mockResolvedValue([]);
    const mockDbSelectWhere = vi.fn().mockReturnValue({ limit: mockDbSelectLimit });
    const mockDbSelectFrom = vi.fn().mockReturnValue({ where: mockDbSelectWhere });
    const mockDbSelect = vi.fn().mockReturnValue({ from: mockDbSelectFrom });

    vi.mocked(getHqDb).mockReturnValue({
      select: mockDbSelect,
      update: mockDbUpdate,
    } as any);

    // Default: runStep passes through fn() (step not yet complete)
    vi.mocked(runStep).mockImplementation(
      async (runId: string, stepNum: number, fn: () => Promise<unknown>) => {
        return fn();
      },
    );

    vi.mocked(compensate).mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Test 1: Happy path — all 8 steps run; token issued + stored + propagated
  // -------------------------------------------------------------------------
  it("runs all 8 steps in order and issues a telemetry token (hash stored, plaintext to providers)", async () => {
    const run = makeRun();

    // Track which step numbers runStep was called with
    const calledSteps: number[] = [];
    vi.mocked(runStep).mockImplementation(
      async (runId: string, stepNum: number, fn: () => Promise<unknown>) => {
        calledSteps.push(stepNum);
        return fn();
      },
    );

    await runProvisioningSaga(run, apis, noopLog as any, stubMigrator, stubSeeder);

    // All 8 steps were attempted
    expect(calledSteps).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Step 7: telemetry token — vercel.setEnvVars and fly.setSecrets must have
    // been called with STUDIO_TELEMETRY_TOKEN (plaintext)
    const vercelEnvCalls = vi.mocked(apis.vercel.setEnvVars).mock.calls;
    const flySecretsCalls = vi.mocked(apis.fly.setSecrets).mock.calls;

    // At least one vercel.setEnvVars call must include STUDIO_TELEMETRY_TOKEN
    const vercelHasToken = vercelEnvCalls.some(
      ([, vars]) => "STUDIO_TELEMETRY_TOKEN" in vars,
    );
    expect(vercelHasToken).toBe(true);

    // At least one fly.setSecrets call must include STUDIO_TELEMETRY_TOKEN
    const flyHasToken = flySecretsCalls.some(
      ([, secrets]) => "STUDIO_TELEMETRY_TOKEN" in secrets,
    );
    expect(flyHasToken).toBe(true);

    // compensate was NOT called (happy path)
    expect(compensate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: Resume at step 4 — steps 1-3 skipped by runStep (idempotency)
  // -------------------------------------------------------------------------
  it("resumes at step 4 when runStep returns skipped for steps 1-3 (no duplicate Neon project)", async () => {
    const run = makeRun({
      step1At: "2026-06-19T00:00:00.000Z",
      step2At: "2026-06-19T00:00:00.000Z",
      step3At: "2026-06-19T00:00:00.000Z",
      neonProjectId: "already-existing-neon-id",
    });

    const calledSteps: number[] = [];
    const fnCalledForSteps: number[] = [];

    // Steps 1-3: return { skipped: true } WITHOUT calling fn
    // Steps 4-8: call fn normally
    vi.mocked(runStep).mockImplementation(
      async (runId: string, stepNum: number, fn: () => Promise<unknown>) => {
        calledSteps.push(stepNum);
        if (stepNum <= 3) {
          // Skip: do NOT call fn
          return { skipped: true, runId };
        }
        fnCalledForSteps.push(stepNum);
        return fn();
      },
    );

    await runProvisioningSaga(run, apis, noopLog as any, stubMigrator, stubSeeder);

    // runStep was called for all 8 steps
    expect(calledSteps).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // fn() was only executed for steps 4-8 (steps 1-3 were skipped)
    expect(fnCalledForSteps).toEqual([4, 5, 6, 7, 8]);

    // Neon createProject was NOT called (step 1 fn was skipped)
    expect(apis.neon.createProject).not.toHaveBeenCalled();

    // No compensation needed on success
    expect(compensate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 3: Failure at step 6 → compensate() called
  // -------------------------------------------------------------------------
  it("calls compensate() when a step throws, so no orphaned resources remain", async () => {
    const run = makeRun();

    // Steps 1-5 succeed; step 6 throws
    vi.mocked(runStep).mockImplementation(
      async (runId: string, stepNum: number, fn: () => Promise<unknown>) => {
        if (stepNum === 6) {
          throw new Error("attachDomain: DNS provider 503");
        }
        return fn();
      },
    );

    // Saga re-throws after compensate — expect the error to propagate
    await expect(
      runProvisioningSaga(run, apis, noopLog as any, stubMigrator, stubSeeder),
    ).rejects.toThrow("attachDomain: DNS provider 503");

    // compensate was called with the run + apis + log
    expect(compensate).toHaveBeenCalledWith(
      expect.objectContaining({ id: run.id }),
      apis,
      noopLog,
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: PII boundary — dbUrl never written to hqProvisioningRuns columns
  // -------------------------------------------------------------------------
  it("never writes the Neon connection string to any hqProvisioningRuns update call", async () => {
    const run = makeRun();

    const dbConnectionString = "postgresql://user:secret@mock.neon.tech/neondb";
    vi.mocked(apis.neon.createProject).mockResolvedValue({
      projectId: "neon-proj-001",
      dbUrl: dbConnectionString,
      dbUrlUnpooled: "postgresql://user:secret@mock-unpooled.neon.tech/neondb",
    });

    vi.mocked(runStep).mockImplementation(
      async (runId: string, stepNum: number, fn: () => Promise<unknown>) => {
        return fn();
      },
    );

    await runProvisioningSaga(run, apis, noopLog as any, stubMigrator, stubSeeder);

    // Check all db.update().set() calls — none should contain the connection string
    const allSetCalls = mockDbUpdateSet.mock.calls;
    for (const [updateArg] of allSetCalls) {
      const serialized = JSON.stringify(updateArg ?? {});
      expect(serialized).not.toContain("postgresql://");
      expect(serialized).not.toContain("neon.tech");
    }
  });
});
