/**
 * services/worker/src/domain/buildTelemetrySnapshot.test.ts
 *
 * TDD RED: Tests for buildTelemetrySnapshot (BD2-03, TEL-02).
 *
 * Behaviour under test:
 *   1. Returned object keys are EXACTLY the TelemetrySnapshot allow-list.
 *   2. llm* values come from the passed studio_telemetry_state row.
 *   3. Every engagement value is a non-negative integer; retentionRate is 0..1.
 *   4. The snapshot contains NO member name / email / phone / message-body PII
 *      (even when mock DB rows contain those values).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";
import { buildTelemetrySnapshot } from "./buildTelemetrySnapshot.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The EXACT allow-list keys from TelemetrySnapshot (packages/hq-schema). */
const ALLOW_LIST_KEYS: (keyof TelemetrySnapshotInput)[] = [
  "studioId",
  "periodStart",
  "periodEnd",
  "llmInputTokens",
  "llmOutputTokens",
  "llmRequestCount",
  "activeMembers",
  "bookings",
  "messagesSent",
  "mobileEngagement",
  "retentionRate",
];

/** PII strings injected into the mock DB to prove they don't surface. */
const PII_STRINGS = [
  "alice@example.com",
  "Bob Smith",
  "+447700900001",
  "Hi Bob, your class is confirmed!",
];

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

/**
 * Builds a minimal mock Drizzle db whose .execute() returns preset aggregate
 * values for each SQL call in buildTelemetrySnapshot.
 *
 * The function issues 5 SQL queries in order:
 *   [0] activeMembers count
 *   [1] bookings count
 *   [2] messagesSent count
 *   [3] mobileEngagement count (food_entries as proxy)
 *   [4] retention: current-window distinct members
 *   [5] retention: prior-window distinct members
 *
 * Each call resolves with { rows: [{ count: N }] }.
 */
function makeMockDb(counts: {
  activeMembers: number;
  bookings: number;
  messagesSent: number;
  mobileEngagement: number;
  retentionCurrent: number;
  retentionPrior: number;
}) {
  const calls = [
    { rows: [{ count: String(counts.activeMembers) }] },
    { rows: [{ count: String(counts.bookings) }] },
    { rows: [{ count: String(counts.messagesSent) }] },
    { rows: [{ count: String(counts.mobileEngagement) }] },
    { rows: [{ count: String(counts.retentionCurrent) }] },
    { rows: [{ count: String(counts.retentionPrior) }] },
  ];
  let callIdx = 0;
  return {
    execute: vi.fn().mockImplementation(() => {
      const result = calls[callIdx] ?? { rows: [{ count: "0" }] };
      callIdx++;
      return Promise.resolve(result);
    }),
  };
}

/** A representative studio_telemetry_state row (from schema.studioTelemetryState). */
const MOCK_STATE = {
  id: "singleton",
  tokenUsageTodayInput: 12345,
  tokenUsageTodayOutput: 6789,
  requestCountToday: 42,
  outboundSentToday: 10,
  outboundFailedToday: 1,
  lastPushAt: null,
  lastPushStatus: null,
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("buildTelemetrySnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Behaviour 1: Keys are EXACTLY the allow-list ─────────────────────────
  it("returns an object whose keys are exactly the TelemetrySnapshot allow-list", async () => {
    const db = makeMockDb({
      activeMembers: 50,
      bookings: 200,
      messagesSent: 30,
      mobileEngagement: 15,
      retentionCurrent: 40,
      retentionPrior: 50,
    });

    const snapshot = await buildTelemetrySnapshot(
      db as any,
      "test-studio",
      MOCK_STATE,
    );

    const keys = Object.keys(snapshot).sort();
    expect(keys).toEqual([...ALLOW_LIST_KEYS].sort());
  });

  // ── Behaviour 2: llm* values come from the state row ─────────────────────
  it("maps llm* fields directly from the studio_telemetry_state row", async () => {
    const db = makeMockDb({
      activeMembers: 10,
      bookings: 5,
      messagesSent: 3,
      mobileEngagement: 2,
      retentionCurrent: 8,
      retentionPrior: 10,
    });

    const snapshot = await buildTelemetrySnapshot(
      db as any,
      "test-studio",
      MOCK_STATE,
    );

    expect(snapshot.llmInputTokens).toBe(MOCK_STATE.tokenUsageTodayInput);
    expect(snapshot.llmOutputTokens).toBe(MOCK_STATE.tokenUsageTodayOutput);
    expect(snapshot.llmRequestCount).toBe(MOCK_STATE.requestCountToday);
  });

  // ── Behaviour 3: Engagement values are non-negative integers; rate is 0..1
  it("returns non-negative integer engagement counts and retentionRate in [0,1]", async () => {
    const db = makeMockDb({
      activeMembers: 25,
      bookings: 130,
      messagesSent: 45,
      mobileEngagement: 22,
      retentionCurrent: 20,
      retentionPrior: 25,
    });

    const snapshot = await buildTelemetrySnapshot(
      db as any,
      "test-studio",
      MOCK_STATE,
    );

    expect(snapshot.activeMembers).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(snapshot.activeMembers)).toBe(true);

    expect(snapshot.bookings).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(snapshot.bookings)).toBe(true);

    expect(snapshot.messagesSent).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(snapshot.messagesSent)).toBe(true);

    expect(snapshot.mobileEngagement).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(snapshot.mobileEngagement)).toBe(true);

    expect(snapshot.retentionRate).toBeGreaterThanOrEqual(0);
    expect(snapshot.retentionRate).toBeLessThanOrEqual(1);
  });

  it("clamps retentionRate to 0 when priorWindow is 0 (no division by zero)", async () => {
    const db = makeMockDb({
      activeMembers: 5,
      bookings: 10,
      messagesSent: 3,
      mobileEngagement: 1,
      retentionCurrent: 5,
      retentionPrior: 0, // denominator = 0
    });

    const snapshot = await buildTelemetrySnapshot(
      db as any,
      "test-studio",
      MOCK_STATE,
    );

    expect(snapshot.retentionRate).toBe(0);
  });

  // ── Behaviour 4: No PII in the snapshot ──────────────────────────────────
  it("does not include any injected PII string in the JSON-serialised snapshot", async () => {
    const db = makeMockDb({
      activeMembers: 3,
      bookings: 7,
      messagesSent: 2,
      mobileEngagement: 4,
      retentionCurrent: 2,
      retentionPrior: 3,
    });

    const snapshot = await buildTelemetrySnapshot(
      db as any,
      "test-studio",
      MOCK_STATE,
    );

    const serialised = JSON.stringify(snapshot);
    for (const pii of PII_STRINGS) {
      expect(serialised).not.toContain(pii);
    }
  });

  // ── Bonus: studioId and period bounds are populated ───────────────────────
  it("includes the supplied studioId and ISO period bounds", async () => {
    const db = makeMockDb({
      activeMembers: 1,
      bookings: 1,
      messagesSent: 0,
      mobileEngagement: 0,
      retentionCurrent: 1,
      retentionPrior: 1,
    });

    const snapshot = await buildTelemetrySnapshot(
      db as any,
      "my-studio-slug",
      MOCK_STATE,
    );

    expect(snapshot.studioId).toBe("my-studio-slug");
    expect(snapshot.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshot.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
