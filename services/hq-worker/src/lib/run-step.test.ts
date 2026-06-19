/**
 * run-step.test.ts — Per-step idempotency helper tests
 *
 * Tests:
 *  1. step_3_at null → calls fn(), marks step_3_at, returns output
 *  2. step_3_at already set → does NOT call fn() (skip), returns { skipped: true }
 *  3. fn() throws → step_3_at NOT marked (retry will re-run the step)
 *  4. run not found → throws
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HqProvisioningRun } from "./db.js";

// ---------------------------------------------------------------------------
// Mock getHqDb — runStep calls getHqDb() internally.
// We intercept the calls via a mock db object.
// ---------------------------------------------------------------------------

const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpdateWhere = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();

vi.mock("./db.js", () => {
  return {
    getHqDb: () => ({
      select: mockSelect,
      update: mockUpdate,
    }),
    hqProvisioningRuns: {
      // Fake column objects used in eq() — just need to be present
      id: "id_col",
      step1At: "step_1_at_col",
      step2At: "step_2_at_col",
      step3At: "step_3_at_col",
      step4At: "step_4_at_col",
      step5At: "step_5_at_col",
      step6At: "step_6_at_col",
      step7At: "step_7_at_col",
      step8At: "step_8_at_col",
    },
  };
});

// Import after mocking
import { runStep } from "./run-step.js";

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

/** Set up the db mock to return a specific run from select(). */
function setupSelectReturning(run: HqProvisioningRun | null) {
  const result = run ? [run] : [];
  mockWhere.mockResolvedValue(result);
  mockLimit.mockResolvedValue(result);
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  // The chain: db.select().from(table).where(cond).limit(1)
  // runStep calls .limit(1) at the end, which should resolve to the rows array
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue(result);
}

/** Set up the db mock for the update chain. Returns the mocked set fn. */
function setupUpdate() {
  const whereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  mockUpdate.mockReturnValue({ set: setMock });
  return { whereMock, setMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdate();
  });

  // -------------------------------------------------------------------------
  // Test 1: step_3_at null → calls fn(), marks step_3_at, returns output
  // -------------------------------------------------------------------------
  it("calls fn() and marks step_3_at when step_3_at is null", async () => {
    const run = makeRun({ step3At: null });
    setupSelectReturning(run);
    const { setMock } = setupUpdate();

    const fn = vi.fn().mockResolvedValue({ value: "step-3-result" });

    const result = await runStep("run-001", 3, fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: "step-3-result" });

    // Verify step_3_at was marked (db.update was called with step3At)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ step3At: expect.any(String) }),
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: step_3_at already set → skip, fn() NOT called
  // -------------------------------------------------------------------------
  it("skips fn() and returns { skipped: true } when step_3_at is already set", async () => {
    const run = makeRun({ step3At: "2026-06-19T00:00:00.000Z" });
    setupSelectReturning(run);

    const fn = vi.fn().mockResolvedValue({ value: "should-not-run" });

    const result = await runStep("run-001", 3, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: true });
    // db.update should NOT have been called (we're skipping)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 3: fn() throws → step_3_at NOT marked, error propagates
  // -------------------------------------------------------------------------
  it("does NOT mark step_3_at when fn() throws (retry will re-run the step)", async () => {
    const run = makeRun({ step3At: null });
    setupSelectReturning(run);

    const fn = vi.fn().mockRejectedValue(new Error("step 3 failed"));

    await expect(runStep("run-001", 3, fn)).rejects.toThrow("step 3 failed");

    // db.update must NOT have been called
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: run not found → throws
  // -------------------------------------------------------------------------
  it("throws when the run is not found", async () => {
    setupSelectReturning(null);

    const fn = vi.fn().mockResolvedValue("never");

    await expect(runStep("run-001", 3, fn)).rejects.toThrow(
      /run run-001 not found/,
    );

    expect(fn).not.toHaveBeenCalled();
  });
});
