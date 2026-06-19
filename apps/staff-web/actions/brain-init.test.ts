/**
 * Unit tests for brain-init — GOB-02 class catalog build logic.
 *
 * Strategy: test the pure `buildCatalogBody` exported helper, avoiding any
 * DB / defineAction dependencies (same pattern as create-checkout-link.test.ts).
 *
 * Tests cover:
 * 1. Two class defs → JSON.parse-able string with 2 entries preserving
 *    name / description / durationMin / category.
 * 2. Empty input → "[]".
 * 3. Null fields (description, category) survive serialisation round-trip.
 */
import { describe, expect, it } from "vitest";
// Import from the pure helpers file (not brain-init.ts) — brain-init.ts imports
// @agent-native/core which uses CJS React, breaking ESM vitest. This mirrors the
// create-checkout-link.test.ts → create-checkout-link-helpers.ts pattern.
import { buildCatalogBody } from "./brain-init-helpers.js";

describe("buildCatalogBody", () => {
  it("serialises two class defs into a JSON array with correct fields", () => {
    const defs = [
      {
        name: "Yoga Flow",
        description: "Morning flow session",
        durationMin: 60,
        category: "Yoga",
      },
      {
        name: "HIIT",
        description: null,
        durationMin: 45,
        category: null,
      },
    ];

    const result = buildCatalogBody(defs);
    const parsed = JSON.parse(result);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);

    expect(parsed[0]).toMatchObject({
      name: "Yoga Flow",
      description: "Morning flow session",
      durationMin: 60,
      category: "Yoga",
    });

    expect(parsed[1]).toMatchObject({
      name: "HIIT",
      description: null,
      durationMin: 45,
      category: null,
    });
  });

  it("returns '[]' for an empty array", () => {
    const result = buildCatalogBody([]);
    expect(result).toBe("[]");
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([]);
  });

  it("preserves null description and category in round-trip", () => {
    const defs = [
      { name: "Boxing", description: null, durationMin: 30, category: null },
    ];
    const parsed = JSON.parse(buildCatalogBody(defs));
    expect(parsed[0].description).toBeNull();
    expect(parsed[0].category).toBeNull();
  });
});
