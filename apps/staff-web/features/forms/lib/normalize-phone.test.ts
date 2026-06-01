import { describe, expect, it } from "vitest";
import { normalizePhone } from "./normalize-phone.js";

describe("normalizePhone", () => {
  it("normalizes UK mobile with spaces (07721 123456)", () => {
    expect(normalizePhone("07721 123456")).toBe("+447721123456");
  });

  it("normalizes 12-digit format starting with 447", () => {
    expect(normalizePhone("447721123456")).toBe("+447721123456");
  });

  it("normalizes pre-normalised with spaces (+44 7721 123456)", () => {
    expect(normalizePhone("+44 7721 123456")).toBe("+447721123456");
  });

  it("returns null for garbage input", () => {
    expect(normalizePhone("garbage")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("normalizes 11-digit format without leading 0 (7721123456 - 10 digits)", () => {
    // 10 digits starting with 7 — treated as UK mobile without the leading 0
    expect(normalizePhone("7721123456")).toBe("+447721123456");
  });
});
