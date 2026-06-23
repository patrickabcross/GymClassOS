import { describe, it, expect } from "vitest";
import { toMajorUnits, ZERO_DECIMAL_CURRENCIES } from "./metaLifecycle.js";

// MC2-01 Task 2: toMajorUnits unit tests
// DB helpers (getMemberHashes, getOrUpsertAttribution) require a live DB
// and are not unit-tested here — they follow the same raw-SQL pattern as
// the existing worker DB helpers which rely on integration tests.

describe("ZERO_DECIMAL_CURRENCIES", () => {
  it("contains exactly the 16 specified currencies", () => {
    const expected = [
      "bif",
      "clp",
      "djf",
      "gnf",
      "jpy",
      "kmf",
      "krw",
      "mga",
      "pyg",
      "rwf",
      "ugx",
      "vnd",
      "vuv",
      "xaf",
      "xof",
      "xpf",
    ];
    expect(ZERO_DECIMAL_CURRENCIES.size).toBe(expected.length);
    for (const code of expected) {
      expect(
        ZERO_DECIMAL_CURRENCIES.has(code),
        `Expected '${code}' in ZERO_DECIMAL_CURRENCIES`,
      ).toBe(true);
    }
  });
});

describe("toMajorUnits", () => {
  it("converts GBP 2999 minor units to 29.99 major units", () => {
    expect(toMajorUnits(2999, "gbp")).toBeCloseTo(29.99, 10);
  });

  it("passes through JPY 500 unchanged (zero-decimal)", () => {
    expect(toMajorUnits(500, "jpy")).toBe(500);
  });

  it("passes through KRW 1000 unchanged (zero-decimal)", () => {
    expect(toMajorUnits(1000, "krw")).toBe(1000);
  });

  it("converts USD 100 minor units to 1.00 major units", () => {
    expect(toMajorUnits(100, "usd")).toBeCloseTo(1.0, 10);
  });

  it("is case-insensitive — GBP (uppercase) 2999 -> 29.99", () => {
    expect(toMajorUnits(2999, "GBP")).toBeCloseTo(29.99, 10);
  });

  it("is case-insensitive — JPY (uppercase) 500 -> 500 (zero-decimal)", () => {
    expect(toMajorUnits(500, "JPY")).toBe(500);
  });

  it("handles zero amount for any currency", () => {
    expect(toMajorUnits(0, "gbp")).toBe(0);
    expect(toMajorUnits(0, "jpy")).toBe(0);
  });

  it("converts EUR 1000 -> 10.00 (non-zero-decimal)", () => {
    expect(toMajorUnits(1000, "eur")).toBeCloseTo(10.0, 10);
  });
});
