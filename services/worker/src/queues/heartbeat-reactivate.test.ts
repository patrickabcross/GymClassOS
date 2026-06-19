/**
 * services/worker/src/queues/heartbeat-reactivate.test.ts
 *
 * BD4-02 / GOD-04, GOD-05: Pure-helper unit tests for the heartbeat reactivation job.
 *
 * Tests are intentionally pure-function-only (no DB, no pg-boss, no mocks needed):
 *   - isSuppressed    — 3/90-day suppression ceiling (GOD-04 day-one requirement)
 *   - isExcludedOptOut — synchronous opt-out exclusion (GOD-04 defense-in-depth)
 *   - buildReactivationVars — brand-voice personalization + generic fallback (GOD-05)
 */

import { describe, it, expect } from "vitest";
import {
  isSuppressed,
  isExcludedOptOut,
  buildReactivationVars,
} from "./heartbeat-reactivate.js";

// ---------------------------------------------------------------------------
// GOD-04: isSuppressed — 3/90-day suppression ceiling
// ---------------------------------------------------------------------------

describe("isSuppressed", () => {
  it("returns false when attempt count is 0 (never contacted)", () => {
    expect(isSuppressed(0)).toBe(false);
  });

  it("returns false when attempt count is 1 (well below ceiling)", () => {
    expect(isSuppressed(1)).toBe(false);
  });

  it("returns false when attempt count is 2 (one below the 3-attempt ceiling)", () => {
    expect(isSuppressed(2)).toBe(false);
  });

  it("returns true when attempt count equals 3 (at the ceiling)", () => {
    expect(isSuppressed(3)).toBe(true);
  });

  it("returns true when attempt count exceeds 3 (above the ceiling)", () => {
    expect(isSuppressed(4)).toBe(true);
    expect(isSuppressed(10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GOD-04: isExcludedOptOut — synchronous opt-out exclusion
// ---------------------------------------------------------------------------

describe("isExcludedOptOut", () => {
  it("returns true when no opt-in row exists (undefined) — member never opted in", () => {
    expect(isExcludedOptOut(undefined)).toBe(true);
  });

  it("returns true when opted_out_at is set — member opted out", () => {
    expect(isExcludedOptOut({ optedOutAt: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("returns true when opted_out_at is an arbitrary non-null string", () => {
    expect(isExcludedOptOut({ optedOutAt: "some-date" })).toBe(true);
  });

  it("returns false when opted_out_at is null — member is actively opted in", () => {
    expect(isExcludedOptOut({ optedOutAt: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GOD-05: buildReactivationVars — brand-voice personalization + generic fallback
// ---------------------------------------------------------------------------

describe("buildReactivationVars", () => {
  it("returns a generic fallback in var '1' when brandVoice is null (GOB not seeded)", () => {
    const vars = buildReactivationVars(null);
    expect(vars).toHaveProperty("1");
    // Must be the generic fallback — no brand PII, human-readable
    expect(vars["1"]).toBeTruthy();
    expect(typeof vars["1"]).toBe("string");
    // The generic fallback should NOT be empty
    expect(vars["1"].length).toBeGreaterThan(5);
    // Should match the expected generic string (documented in implementation)
    expect(vars["1"]).toBe("We miss you at the studio!");
  });

  it("returns a non-generic brand-derived var '1' when brandVoice is provided", () => {
    const brandVoice = "Energetic, friendly — we push each other to be better every session.";
    const vars = buildReactivationVars(brandVoice);
    expect(vars).toHaveProperty("1");
    expect(typeof vars["1"]).toBe("string");
    expect(vars["1"].length).toBeGreaterThan(0);
    // Brand-derived: should NOT be the generic fallback string
    expect(vars["1"]).not.toBe("We miss you at the studio!");
  });

  it("returns var '1' derived from first non-empty line of brandVoice", () => {
    const brandVoice = "Come back stronger.\nWe believe in you.";
    const vars = buildReactivationVars(brandVoice);
    // First non-empty line is "Come back stronger." — trimmed/truncated to fit template var
    expect(vars["1"]).toBeTruthy();
    expect(vars["1"]).not.toBe("We miss you at the studio!");
  });

  it("handles brandVoice with leading whitespace/empty lines gracefully", () => {
    const brandVoice = "\n\n  Real results, real community.\n";
    const vars = buildReactivationVars(brandVoice);
    expect(vars["1"]).toBeTruthy();
    expect(vars["1"]).not.toBe("We miss you at the studio!");
  });

  it("truncates very long brand voice lines to a safe template-var length", () => {
    const longVoice = "A".repeat(300);
    const vars = buildReactivationVars(longVoice);
    // Template vars must fit within Meta's 160-char field limit; implementation truncates
    expect(vars["1"].length).toBeLessThanOrEqual(160);
  });
});
