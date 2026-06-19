// apps/hq/server/lib/studio-health.test.ts
//
// Unit tests for the HQB health classification engine.
//
// These tests are pure-function tests — no DB, no framework, no dev server
// required (P1c constraint). They cover:
//
//   - Staleness gate: null/stale last_telemetry_received_at → "stale" first,
//     even if the snapshot has great numbers (HQB-03, D-02).
//   - Signal checks: dormant, under-messaging, low-retention → "at-risk".
//   - Power-user cohort: all positive signals → "power-user".
//   - Healthy-but-not-power-user: good numbers, below power-user bar → "healthy".
//   - Signals array: each tripped signal has a human-readable reason (D-01).

import { describe, it, expect } from "vitest";
import {
  classifyStudioHealth,
  type StudioHealthSignals,
} from "./studio-health.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-19T12:00:00Z");

/** A snapshot with all signals in the "healthy" range. */
const HEALTHY_SNAPSHOT = {
  studioId: "studio-alpha",
  periodStart: "2026-06-12T00:00:00Z",
  periodEnd: "2026-06-19T00:00:00Z",
  llmInputTokens: 5000,
  llmOutputTokens: 5000,
  llmRequestCount: 100,
  activeMembers: 25,
  bookings: 80,
  messagesSent: 60,
  mobileEngagement: 50,
  retentionRate: 0.85,
};

/** Timestamp that is "fresh" — 1 hour old relative to NOW. */
const FRESH_AT = "2026-06-19T11:00:00Z";

/** Timestamp that is stale — 27 hours old relative to NOW (beyond 26h threshold). */
const STALE_AT = "2026-06-18T09:00:00Z";

// ---------------------------------------------------------------------------
// Staleness gate (must run BEFORE any engagement check — HQB-03, D-02)
// ---------------------------------------------------------------------------

describe("staleness gate", () => {
  it("returns stale when lastTelemetryReceivedAt is null", () => {
    const result = classifyStudioHealth(HEALTHY_SNAPSHOT, null, NOW);
    expect(result.status).toBe("stale");
    expect(result.cohort).toBe("unknown");
    expect(result.isStale).toBe(true);
    expect(result.isDormant).toBe(false);
    expect(result.isUnderMessaging).toBe(false);
    expect(result.isLowRetention).toBe(false);
    expect(result.signals).toContain("No telemetry received");
  });

  it("returns stale when lastTelemetryReceivedAt is older than TELEMETRY_STALENESS_HOURS, even if snapshot has great numbers", () => {
    // The snapshot has perfect numbers — staleness gate must win
    const result = classifyStudioHealth(HEALTHY_SNAPSHOT, STALE_AT, NOW);
    expect(result.status).toBe("stale");
    expect(result.cohort).toBe("unknown");
    expect(result.isStale).toBe(true);
    // At least one signal string that mentions hours
    expect(result.signals.some((s) => s.includes("h ago"))).toBe(true);
  });

  it("returns stale when snapshot is null but timestamp is recent", () => {
    const result = classifyStudioHealth(null, FRESH_AT, NOW);
    expect(result.status).toBe("stale");
    expect(result.cohort).toBe("unknown");
    expect(result.isStale).toBe(true);
    expect(result.signals).toContain("No snapshot data");
  });
});

// ---------------------------------------------------------------------------
// At-risk signals
// ---------------------------------------------------------------------------

describe("dormant signal", () => {
  it("sets isDormant true and status at-risk when activeMembers is below threshold", () => {
    const snapshot = { ...HEALTHY_SNAPSHOT, activeMembers: 3 };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    expect(result.isDormant).toBe(true);
    expect(result.status).toBe("at-risk");
    expect(result.cohort).toBe("at-risk");
    expect(
      result.signals.some((s) => s.toLowerCase().includes("active members")),
    ).toBe(true);
  });

  it("does NOT set isDormant when activeMembers equals threshold", () => {
    // Threshold is 5; 5 is NOT dormant (strictly less than)
    const snapshot = { ...HEALTHY_SNAPSHOT, activeMembers: 5 };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    expect(result.isDormant).toBe(false);
  });
});

describe("under-messaging signal", () => {
  it("sets isUnderMessaging true and status at-risk when messagesSent is below threshold", () => {
    const snapshot = { ...HEALTHY_SNAPSHOT, messagesSent: 5 };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    expect(result.isUnderMessaging).toBe(true);
    expect(result.status).toBe("at-risk");
    expect(result.cohort).toBe("at-risk");
    expect(
      result.signals.some((s) => s.toLowerCase().includes("messages sent")),
    ).toBe(true);
  });
});

describe("low-retention signal", () => {
  it("sets isLowRetention true and status at-risk when retentionRate is below threshold", () => {
    const snapshot = { ...HEALTHY_SNAPSHOT, retentionRate: 0.3 };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    expect(result.isLowRetention).toBe(true);
    expect(result.status).toBe("at-risk");
    expect(result.cohort).toBe("at-risk");
    expect(
      result.signals.some((s) => s.toLowerCase().includes("retention")),
    ).toBe(true);
  });
});

describe("multiple signals", () => {
  it("accumulates all tripped signals into the signals array", () => {
    const snapshot = {
      ...HEALTHY_SNAPSHOT,
      activeMembers: 2,
      messagesSent: 3,
      retentionRate: 0.2,
    };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    expect(result.isDormant).toBe(true);
    expect(result.isUnderMessaging).toBe(true);
    expect(result.isLowRetention).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Power-user cohort
// ---------------------------------------------------------------------------

describe("power-user cohort", () => {
  it("returns power-user cohort when all thresholds are met and no at-risk signal", () => {
    // activeMembers >= 20, retentionRate >= 0.75, messagesSent >= 50
    const snapshot = {
      ...HEALTHY_SNAPSHOT,
      activeMembers: 30,
      retentionRate: 0.9,
      messagesSent: 70,
    };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    expect(result.status).toBe("healthy");
    expect(result.cohort).toBe("power-user");
    expect(result.isStale).toBe(false);
    expect(result.signals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Healthy-but-not-power-user
// ---------------------------------------------------------------------------

describe("healthy-but-not-power-user", () => {
  it("returns healthy status and healthy cohort when no at-risk signal but below power-user bar", () => {
    // Good studio, but not enough activeMembers to be power-user
    const snapshot = {
      ...HEALTHY_SNAPSHOT,
      activeMembers: 10, // >= DORMANT_THRESHOLD(5) but < POWER_USER(20)
      retentionRate: 0.8, // >= LOW_RETENTION_THRESHOLD(0.5)
      messagesSent: 30, // >= UNDER_MESSAGING_THRESHOLD(10) but < POWER_USER(50)
    };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    expect(result.status).toBe("healthy");
    expect(result.cohort).toBe("healthy");
    expect(result.isStale).toBe(false);
    expect(result.isDormant).toBe(false);
    expect(result.signals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Signals array: human-readable reasons (D-01 operator auditability)
// ---------------------------------------------------------------------------

describe("signals array content", () => {
  it("signals array is empty for a fully healthy power-user studio", () => {
    const result = classifyStudioHealth(HEALTHY_SNAPSHOT, FRESH_AT, NOW);
    expect(result.signals).toHaveLength(0);
  });

  it("each tripped signal contains a human-readable description", () => {
    const snapshot = { ...HEALTHY_SNAPSHOT, activeMembers: 1 };
    const result = classifyStudioHealth(snapshot, FRESH_AT, NOW);
    // Signal must be a non-empty string with useful context
    expect(result.signals[0]).toMatch(/\d/); // contains a number (the actual count)
  });
});

// ---------------------------------------------------------------------------
// Default `now` parameter (no explicit Date passed)
// ---------------------------------------------------------------------------

describe("default now parameter", () => {
  it("uses the current time when now is not provided", () => {
    // Fresh timestamp — should classify as stale=false (we can't control wall clock
    // so just verify it doesn't throw and returns a valid result)
    const result = classifyStudioHealth(HEALTHY_SNAPSHOT, FRESH_AT);
    expect(["healthy", "at-risk", "stale"]).toContain(result.status);
  });
});
