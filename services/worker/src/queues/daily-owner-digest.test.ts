/**
 * services/worker/src/queues/daily-owner-digest.test.ts
 *
 * BD4-02 / GOD-01: Unit tests for the daily owner digest pure helper.
 *
 * Tests cover buildDigestVars — the numeric digest assembly function:
 *   - Happy path: all fields present → correct string conversions.
 *   - Empty input: all fields absent → safe zero defaults, no NaN, no PII.
 *   - Retention formatting: decimal → percentage string (rounded, no decimal point).
 */

import { describe, it, expect } from "vitest";
import { buildDigestVars } from "./daily-owner-digest.js";

describe("buildDigestVars", () => {
  it("assembles correct string values from a full snapshot", () => {
    const vars = buildDigestVars({
      activeMembers: 18,
      bookings: 42,
      retentionRate: 0.72,
    });
    expect(vars).toEqual({
      "1": "18",
      "2": "42",
      "3": "72%",
    });
  });

  it("returns safe zero defaults when snapshot is empty — no NaN, no undefined, no PII", () => {
    const vars = buildDigestVars({});
    expect(vars).toEqual({
      "1": "0",
      "2": "0",
      "3": "0%",
    });
  });

  it("rounds retentionRate correctly (0.755 → 76%)", () => {
    const vars = buildDigestVars({ retentionRate: 0.755 });
    expect(vars["3"]).toBe("76%");
  });

  it("handles zero retentionRate — returns 0%, not NaN%", () => {
    const vars = buildDigestVars({ retentionRate: 0 });
    expect(vars["3"]).toBe("0%");
  });

  it("handles perfect retention (1.0) — returns 100%", () => {
    const vars = buildDigestVars({ retentionRate: 1.0 });
    expect(vars["3"]).toBe("100%");
  });

  it("returns strings (not numbers) for all fields — template vars must be strings", () => {
    const vars = buildDigestVars({ activeMembers: 5, bookings: 10, retentionRate: 0.5 });
    expect(typeof vars["1"]).toBe("string");
    expect(typeof vars["2"]).toBe("string");
    expect(typeof vars["3"]).toBe("string");
  });

  it("active members zero with other fields present", () => {
    const vars = buildDigestVars({ activeMembers: 0, bookings: 5, retentionRate: 0.3 });
    expect(vars["1"]).toBe("0");
    expect(vars["2"]).toBe("5");
    expect(vars["3"]).toBe("30%");
  });
});
