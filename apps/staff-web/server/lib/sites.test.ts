import { describe, it, expect } from "vitest";
import { resolveSites } from "./sites.js";

// ---------------------------------------------------------------------------
// Unit tests for the pure resolveSites resolver (GSG-01).
//
// Covers: null/undefined/empty → [], JSON string array, pre-parsed array,
// malformed JSON, non-array JSON, non-string/empty filtering,
// trim + de-dupe, and empty array.
// ---------------------------------------------------------------------------

describe("resolveSites — null / undefined / empty input (gym-agnostic default)", () => {
  it("null → []", () => {
    expect(resolveSites(null)).toEqual([]);
  });

  it("undefined → []", () => {
    expect(resolveSites(undefined)).toEqual([]);
  });

  it("empty string → []", () => {
    expect(resolveSites("")).toEqual([]);
  });
});

describe("resolveSites — JSON string array", () => {
  it('\'["Norwich","Wymondham"]\' → ["Norwich","Wymondham"]', () => {
    expect(resolveSites('["Norwich","Wymondham"]')).toEqual([
      "Norwich",
      "Wymondham",
    ]);
  });
});

describe("resolveSites — pre-parsed array (JSONB / Neon HTTP driver branch)", () => {
  it('["A","B"] → ["A","B"]', () => {
    expect(resolveSites(["A", "B"])).toEqual(["A", "B"]);
  });

  it("[] → []", () => {
    expect(resolveSites([])).toEqual([]);
  });
});

describe("resolveSites — malformed / non-array JSON (never throws, falls back to [])", () => {
  it("malformed JSON → [] (no throw)", () => {
    expect(resolveSites("not-json{{{")).toEqual([]);
  });

  it('"{}": object JSON → []', () => {
    expect(resolveSites("{}")).toEqual([]);
  });
});

describe("resolveSites — non-string / empty element filtering", () => {
  it('\'[1,2,"x"]\' → ["x"] (drops non-strings)', () => {
    expect(resolveSites('[1,2,"x"]')).toEqual(["x"]);
  });

  it('\'["A",""," ","A"]\' → ["A"] (trim, drop empties, de-dupe, stable order)', () => {
    expect(resolveSites('["A",""," ","A"]')).toEqual(["A"]);
  });
});
