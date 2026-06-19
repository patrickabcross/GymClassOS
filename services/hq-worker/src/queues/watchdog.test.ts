// services/hq-worker/src/queues/watchdog.test.ts
//
// Unit tests for the HQ watchdog recurring job.
//
// Four behaviours tested:
//   1. Stuck runs (query returns rows) -> log.error called with alert info.
//   2. Stale telemetry (query returns rows) -> log.warn called with studio info.
//   3. Clean tick (both queries return empty) -> no log.error or log.warn called.
//   4. Schedule registered: boss.schedule called with "every 5 min" cron + tz UTC.
//
// Pattern: mock getHqDb (canned SQL rows) + getLogger.
// The handler is extracted from the registered boss.work() callback and called
// directly so we can test it without a real pg-boss instance.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLogError = vi.fn();
const mockLogWarn = vi.fn();
const mockLogInfo = vi.fn();

const mockExecute = vi.fn();

vi.mock("../lib/logger.js", () => ({
  getLogger: () => ({
    error: mockLogError,
    warn: mockLogWarn,
    info: mockLogInfo,
    debug: vi.fn(),
  }),
}));

vi.mock("../lib/db.js", () => ({
  getHqDb: () => ({
    execute: mockExecute,
  }),
  // Export table objects (needed for any imports from db.js)
  hqProvisioningRuns: {},
  hqStudios: {},
  hqStudioTokens: {},
  hqTelemetrySnapshots: {},
  hqTokenUsage: {},
}));

// Mock drizzle-orm sql tagged template (return a mock SQL object)
vi.mock("drizzle-orm", () => ({
  sql: new Proxy(
    function sql(strings: TemplateStringsArray, ...values: unknown[]) {
      return { __sql: true, strings, values };
    },
    {
      get(target, prop) {
        if (prop === "raw") return (s: string) => ({ __raw: s });
        return target[prop as keyof typeof target];
      },
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

import { registerWatchdog } from "./watchdog.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STUCK_RUN = {
  id: "run-stuck-1",
  studioId: "studio-a",
  status: "started",
  startedAt: "2026-06-18T10:00:00.000Z",
};

const STALE_STUDIO = {
  id: "studio-b",
  slug: "studio-b",
  lastTelemetryReceivedAt: "2026-06-17T00:00:00.000Z",
};

/** Build a mock boss that captures work/schedule registrations. */
function makeBoss() {
  let capturedWorker: (() => Promise<void>) | null = null;

  const boss = {
    work: vi.fn((queue: string, handler: () => Promise<void>) => {
      capturedWorker = handler;
      return Promise.resolve("job-id");
    }),
    schedule: vi.fn().mockResolvedValue(undefined),
    _capturedWorker: () => capturedWorker,
  };
  return boss;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerWatchdog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Behavior 1: stuck runs → log.error ────────────────────────────────────
  it("logs an error when stuck provisioning runs are detected", async () => {
    // First execute = stuck runs query, second = stale telemetry query
    mockExecute
      .mockResolvedValueOnce({ rows: [STUCK_RUN] })   // stuck runs
      .mockResolvedValueOnce({ rows: [] });             // stale telemetry (empty)

    const boss = makeBoss();
    await registerWatchdog(boss as unknown as import("pg-boss").PgBoss);

    // Invoke the registered worker handler
    const handler = boss._capturedWorker();
    expect(handler).toBeTruthy();
    await handler!();

    expect(mockLogError).toHaveBeenCalledOnce();
    const errorCall = mockLogError.mock.calls[0];
    expect(errorCall[0]).toMatchObject({
      alert: "stuck-provisioning-runs",
      count: 1,
    });
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  // ── Behavior 2: stale telemetry → log.warn ────────────────────────────────
  it("logs a warning when studios have missing telemetry", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })               // stuck runs (empty)
      .mockResolvedValueOnce({ rows: [STALE_STUDIO] });  // stale telemetry

    const boss = makeBoss();
    await registerWatchdog(boss as unknown as import("pg-boss").PgBoss);

    const handler = boss._capturedWorker();
    await handler!();

    expect(mockLogWarn).toHaveBeenCalledOnce();
    const warnCall = mockLogWarn.mock.calls[0];
    expect(warnCall[0]).toMatchObject({
      alert: "missing-telemetry",
      count: 1,
    });
    expect(mockLogError).not.toHaveBeenCalled();
  });

  // ── Behavior 3: clean tick → no alert ────────────────────────────────────
  it("does not log error or warn on a clean tick (both queries empty)", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })   // stuck runs (empty)
      .mockResolvedValueOnce({ rows: [] });  // stale telemetry (empty)

    const boss = makeBoss();
    await registerWatchdog(boss as unknown as import("pg-boss").PgBoss);

    const handler = boss._capturedWorker();
    await handler!();

    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  // ── Behavior 4: schedule registered correctly ─────────────────────────────
  it("registers boss.schedule with '*/5 * * * *' cron + UTC timezone", async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const boss = makeBoss();
    await registerWatchdog(boss as unknown as import("pg-boss").PgBoss);

    expect(boss.schedule).toHaveBeenCalledOnce();
    expect(boss.schedule).toHaveBeenCalledWith(
      "hq-watchdog",
      "*/5 * * * *",
      {},
      expect.objectContaining({ tz: "UTC" }),
    );

    // Consumer registered first (before schedule)
    const workCallOrder = boss.work.mock.invocationCallOrder[0];
    const scheduleCallOrder = boss.schedule.mock.invocationCallOrder[0];
    expect(workCallOrder).toBeLessThan(scheduleCallOrder);
  });
});
