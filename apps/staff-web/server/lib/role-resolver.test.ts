// role-resolver.test.ts — Unit tests for resolveRole pure function.
// Run via: cd apps/staff-web && npx vitest run --config vitest.unit.config.ts server/lib/role-resolver.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRole } from "./role-resolver.js";

describe("resolveRole", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save current env vars
    originalEnv.RUNSTUDIO_OPERATOR_EMAILS =
      process.env.RUNSTUDIO_OPERATOR_EMAILS;
    originalEnv.RUNSTUDIO_TEACHER_EMAILS = process.env.RUNSTUDIO_TEACHER_EMAILS;
  });

  afterEach(() => {
    // Restore env vars
    if (originalEnv.RUNSTUDIO_OPERATOR_EMAILS === undefined) {
      delete process.env.RUNSTUDIO_OPERATOR_EMAILS;
    } else {
      process.env.RUNSTUDIO_OPERATOR_EMAILS =
        originalEnv.RUNSTUDIO_OPERATOR_EMAILS;
    }
    if (originalEnv.RUNSTUDIO_TEACHER_EMAILS === undefined) {
      delete process.env.RUNSTUDIO_TEACHER_EMAILS;
    } else {
      process.env.RUNSTUDIO_TEACHER_EMAILS =
        originalEnv.RUNSTUDIO_TEACHER_EMAILS;
    }
  });

  it("returns 'admin' for an email in RUNSTUDIO_OPERATOR_EMAILS", () => {
    process.env.RUNSTUDIO_OPERATOR_EMAILS = "ops@studio.com";
    process.env.RUNSTUDIO_TEACHER_EMAILS = "";
    expect(resolveRole("ops@studio.com")).toBe("admin");
  });

  it("returns 'teacher' for an email in RUNSTUDIO_TEACHER_EMAILS (and not in operator list)", () => {
    process.env.RUNSTUDIO_OPERATOR_EMAILS = "ops@studio.com";
    process.env.RUNSTUDIO_TEACHER_EMAILS = "coach@studio.com";
    expect(resolveRole("coach@studio.com")).toBe("teacher");
  });

  it("returns 'member' for an email in neither list", () => {
    process.env.RUNSTUDIO_OPERATOR_EMAILS = "ops@studio.com";
    process.env.RUNSTUDIO_TEACHER_EMAILS = "coach@studio.com";
    expect(resolveRole("member@x.com")).toBe("member");
  });

  it("admin > teacher precedence: email in BOTH operator and teacher lists resolves to 'admin'", () => {
    process.env.RUNSTUDIO_OPERATOR_EMAILS = "dual@studio.com";
    process.env.RUNSTUDIO_TEACHER_EMAILS = "dual@studio.com,coach@studio.com";
    expect(resolveRole("dual@studio.com")).toBe("admin");
  });

  it("is case-insensitive and whitespace-tolerant: '  Ops@Studio.com ' matches 'ops@studio.com'", () => {
    process.env.RUNSTUDIO_OPERATOR_EMAILS = "ops@studio.com";
    process.env.RUNSTUDIO_TEACHER_EMAILS = "";
    expect(resolveRole("  Ops@Studio.com ")).toBe("admin");
  });

  it("empty RUNSTUDIO_TEACHER_EMAILS means every non-admin is member", () => {
    process.env.RUNSTUDIO_OPERATOR_EMAILS = "ops@studio.com";
    process.env.RUNSTUDIO_TEACHER_EMAILS = "";
    expect(resolveRole("coach@studio.com")).toBe("member");
  });
});
