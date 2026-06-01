import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit.js";

describe("checkRateLimit", () => {
  it("allows the first 60 requests from one IP within the window", () => {
    const ip = `test-ip-allows-${Date.now()}`;
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit(ip, now)).toBe(true);
    }
  });

  it("rejects the 61st request from the same IP within the window", () => {
    const ip = `test-ip-61st-${Date.now()}`;
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      checkRateLimit(ip, now);
    }
    // 61st call should be rejected
    expect(checkRateLimit(ip, now)).toBe(false);
  });

  it("a different IP key is not throttled by another IP", () => {
    const ip1 = `test-ip-a-${Date.now()}`;
    const ip2 = `test-ip-b-${Date.now()}`;
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      checkRateLimit(ip1, now);
    }
    // ip1 is exhausted; ip2 should still be allowed
    expect(checkRateLimit(ip2, now)).toBe(true);
  });

  it("resets the window after the window time has elapsed", () => {
    const ip = `test-ip-reset-${Date.now()}`;
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      checkRateLimit(ip, now);
    }
    // Should be rejected at the 61st call within the same window
    expect(checkRateLimit(ip, now)).toBe(false);

    // After 15 minutes + 1ms, the window resets
    const future = now + 15 * 60 * 1000 + 1;
    expect(checkRateLimit(ip, future)).toBe(true);
  });

  it("allows unknown/empty IP (fail open)", () => {
    expect(checkRateLimit("", Date.now())).toBe(true);
  });
});
