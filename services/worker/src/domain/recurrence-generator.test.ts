/**
 * TDD: recurrence-generator — DST-correct occurrence generation in Europe/London.
 *
 * Critical assertions (from Phase 2 spec):
 *   - Same "18:00" London wall-clock → "17:00:00.000Z" in July (BST = UTC+1)
 *   - Same "18:00" London wall-clock → "18:00:00.000Z" in January (GMT = UTC+0)
 *
 * Run: cd services/worker && pnpm test -- recurrence-generator
 */
import { describe, it, expect } from "vitest";
import { generateOccurrences } from "./recurrence-generator.js";

const BASE_RULE = {
  id: "rule_test_01",
  definitionId: "def_test_01",
  active: 1,
  capacity: 12,
  location: null as string | null,
  trainerId: null as string | null,
  endsOn: null as string | null,
  generatedThrough: null as string | null,
};

describe("generateOccurrences — DST correctness", () => {
  it("case 1: Monday 2026-07-06 at 18:00 London (BST = UTC+1) → UTC 17:00:00.000Z", () => {
    const rule = {
      ...BASE_RULE,
      daysOfWeek: "[1]", // Monday
      timeOfDay: "18:00",
      startsOn: "2026-07-06",
    };
    // Window: 2026-07-06 to 2026-07-07 (just one day)
    const occurrences = generateOccurrences(rule, "2026-07-07");
    expect(occurrences).toHaveLength(1);
    // 18:00 BST (UTC+1) = 17:00:00 UTC
    expect(occurrences[0].startsAtUtc).toMatch(/2026-07-06T17:00:00\.000Z/);
  });

  it("case 2: Monday 2026-01-05 at 18:00 London (GMT = UTC+0) → UTC 18:00:00.000Z", () => {
    const rule = {
      ...BASE_RULE,
      id: "rule_test_02",
      daysOfWeek: "[1]", // Monday
      timeOfDay: "18:00",
      startsOn: "2026-01-05",
    };
    // Window: 2026-01-05 to 2026-01-06 (just one day)
    const occurrences = generateOccurrences(rule, "2026-01-06");
    expect(occurrences).toHaveLength(1);
    // 18:00 GMT (UTC+0) = 18:00:00 UTC
    expect(occurrences[0].startsAtUtc).toMatch(/2026-01-05T18:00:00\.000Z/);
  });

  it("case 3: Mon/Wed rule generates 2 occurrences per week within a 7-day window", () => {
    const rule = {
      ...BASE_RULE,
      id: "rule_test_03",
      daysOfWeek: "[1,3]", // Monday and Wednesday
      timeOfDay: "10:00",
      startsOn: "2026-07-06", // This is a Monday
    };
    // Window: 2026-07-06 (Mon) to 2026-07-13 (next Mon, exclusive)
    const occurrences = generateOccurrences(rule, "2026-07-13");
    expect(occurrences).toHaveLength(2);
    // Should have Monday 2026-07-06 and Wednesday 2026-07-08
    const utcTimes = occurrences.map((o) => o.startsAtUtc);
    expect(utcTimes.some((t) => t.startsWith("2026-07-06"))).toBe(true);
    expect(utcTimes.some((t) => t.startsWith("2026-07-08"))).toBe(true);
  });

  it("case 4: generatedThrough skips already-generated dates", () => {
    const rule = {
      ...BASE_RULE,
      id: "rule_test_04",
      daysOfWeek: "[1]", // Monday only
      timeOfDay: "09:00",
      startsOn: "2026-07-06", // Mon
      // Mark 2026-07-06 and 2026-07-13 as already generated
      generatedThrough: "2026-07-13",
    };
    // Window: up to 2026-07-21 (Mon 2026-07-20 is within window)
    const occurrences = generateOccurrences(rule, "2026-07-21");
    // Only 2026-07-20 should be generated (06 and 13 are <= generatedThrough)
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].startsAtUtc).toMatch(/2026-07-20/);
  });

  it("case 5: ends_on stops generation — no occurrences past ends_on", () => {
    const rule = {
      ...BASE_RULE,
      id: "rule_test_05",
      daysOfWeek: "[1]", // Monday only
      timeOfDay: "08:00",
      startsOn: "2026-07-06",
      endsOn: "2026-07-07", // Rule ends before the second Monday
    };
    // Window extends to 2026-07-20 but rule ends 2026-07-07
    const occurrences = generateOccurrences(rule, "2026-07-20");
    // Only 2026-07-06 should be generated (ends_on 2026-07-07 excludes 2026-07-13)
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].startsAtUtc).toMatch(/2026-07-06/);
  });
});
