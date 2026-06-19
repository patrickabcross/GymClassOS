import { describe, it, expect } from "vitest";
import { isOwnerInWindow, OWNER_WINDOW_HOURS } from "./ownerWindowGate.js";

describe("isOwnerInWindow (HQD-03 / D-07 mirror; 24h Meta policy)", () => {
  it("OWNER_WINDOW_HOURS is 24", () => {
    expect(OWNER_WINDOW_HOURS).toBe(24);
  });

  it("returns false when lastInboundAt is null (owner never messaged HQ)", () => {
    expect(isOwnerInWindow(null)).toBe(false);
  });

  it("returns true when lastInboundAt is 23 hours ago (within window)", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");
    const lastInbound = new Date("2026-06-18T13:00:00.000Z"); // 23h ago
    expect(isOwnerInWindow(lastInbound, now)).toBe(true);
  });

  it("returns false when lastInboundAt is 25 hours ago (outside window)", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");
    const lastInbound = new Date("2026-06-18T11:00:00.000Z"); // 25h ago
    expect(isOwnerInWindow(lastInbound, now)).toBe(false);
  });

  it("returns false when lastInboundAt is exactly 24 hours ago (boundary — not strictly inside)", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");
    const lastInbound = new Date("2026-06-18T12:00:00.000Z"); // exactly 24h
    expect(isOwnerInWindow(lastInbound, now)).toBe(false);
  });
});
