import { describe, it, expect } from "vitest";
import { isInWindow, WINDOW_HOURS } from "./windowGate.js";

describe("isInWindow (WA-06; PITFALL #1)", () => {
  const now = new Date("2026-05-20T12:00:00.000Z");

  it("returns false for null lastInboundAt", () => {
    expect(isInWindow(null, now)).toBe(false);
  });

  it("returns true for inbound just now", () => {
    const lastInbound = new Date("2026-05-20T11:59:00.000Z");
    expect(isInWindow(lastInbound, now)).toBe(true);
  });

  it("returns true for inbound 23h59m ago", () => {
    const lastInbound = new Date("2026-05-19T12:01:00.000Z");
    expect(isInWindow(lastInbound, now)).toBe(true);
  });

  it("returns false for inbound exactly 24h ago", () => {
    const lastInbound = new Date("2026-05-19T12:00:00.000Z");
    expect(isInWindow(lastInbound, now)).toBe(false);
  });

  it("returns false for inbound 24h01s ago", () => {
    const lastInbound = new Date("2026-05-19T11:59:59.000Z");
    expect(isInWindow(lastInbound, now)).toBe(false);
  });

  it("returns false for inbound 48h ago", () => {
    const lastInbound = new Date("2026-05-18T12:00:00.000Z");
    expect(isInWindow(lastInbound, now)).toBe(false);
  });

  it("exposes WINDOW_HOURS = 24", () => {
    expect(WINDOW_HOURS).toBe(24);
  });
});
