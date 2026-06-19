/**
 * apps/hq/server/plugins/auth.test.ts
 *
 * Unit tests for the HQ single-super-admin allowlist helpers.
 *
 * DESIGN CONSTRAINT: No server boot — honors the no-local-dev-server constraint
 * (NitroViteError: Vite environment "nitro" is unavailable). The tests import
 * only the pure exported helpers (isSuperAdmin, parseSuperAdminEmail) from
 * auth.ts, which read process.env directly.
 *
 * ISOLATION PROOF (HQ-FND-01): A studio staff credential cannot authenticate
 * to HQ via the allowlist layer. The test explicitly asserts that a
 * representative studio-staff email (e.g. coach@somegym.com) is rejected even
 * when that email is not the configured HQ_SUPER_ADMIN_EMAIL. Deployment-level
 * isolation (separate secret + separate Neon) gives the primary guarantee;
 * this allowlist is the additional software gate.
 *
 * DIVERGENCE FROM STAFF-WEB (documented here for reviewers):
 * staff-web's parseAllowedEmails returns [] when CUSTOMER_ALLOWED_EMAILS is
 * unset, and the allowlistHandler treats an empty list as "allow all authenticated
 * users" (dev fallback). HQ INTENTIONALLY DIVERGES:
 *   - parseSuperAdminEmail returns null when HQ_SUPER_ADMIN_EMAIL is unset.
 *   - isSuperAdmin returns false (deny) for every email when null.
 *   - This is the right policy for the operator control plane: if the operator
 *     email is not configured, no one gets in. A silent open-gate would be a
 *     security misconfiguration, not a dev convenience.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Isolate process.env per test — save/restore the real env so tests don't
// leak into each other (mirrors the worker env reset pattern in secrets.test.ts).
// ---------------------------------------------------------------------------
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = { HQ_SUPER_ADMIN_EMAIL: process.env.HQ_SUPER_ADMIN_EMAIL };
  delete process.env.HQ_SUPER_ADMIN_EMAIL;
});

afterEach(() => {
  if (savedEnv.HQ_SUPER_ADMIN_EMAIL === undefined) {
    delete process.env.HQ_SUPER_ADMIN_EMAIL;
  } else {
    process.env.HQ_SUPER_ADMIN_EMAIL = savedEnv.HQ_SUPER_ADMIN_EMAIL;
  }
});

// Import from auth-helpers.ts directly — it has NO @agent-native/core deps,
// so vitest can load it without triggering the CJS/ESM issues that come from
// importing the full auth.ts plugin (which imports h3, better-auth, React, etc.).
// auth.ts re-exports these helpers; tests import them here at the source.
import { isSuperAdmin, parseSuperAdminEmail } from "./auth-helpers.js";

// ---------------------------------------------------------------------------
// parseSuperAdminEmail
// ---------------------------------------------------------------------------

describe("parseSuperAdminEmail", () => {
  it("returns null when HQ_SUPER_ADMIN_EMAIL is unset", () => {
    // env was cleared in beforeEach
    expect(parseSuperAdminEmail()).toBeNull();
  });

  it("returns null when HQ_SUPER_ADMIN_EMAIL is empty string", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "";
    expect(parseSuperAdminEmail()).toBeNull();
  });

  it("returns null when HQ_SUPER_ADMIN_EMAIL is only whitespace", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "   ";
    expect(parseSuperAdminEmail()).toBeNull();
  });

  it("returns the lowercased email when set", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "Operator@GymClassOS.com";
    expect(parseSuperAdminEmail()).toBe("operator@gymclassos.com");
  });

  it("trims leading/trailing whitespace", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "  operator@gymclassos.com  ";
    expect(parseSuperAdminEmail()).toBe("operator@gymclassos.com");
  });
});

// ---------------------------------------------------------------------------
// isSuperAdmin — operator email allowed
// ---------------------------------------------------------------------------

describe("isSuperAdmin — operator email", () => {
  it("returns true for the exact configured operator email", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    expect(isSuperAdmin("operator@gymclassos.com")).toBe(true);
  });

  it("is case-insensitive (uppercase input)", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    expect(isSuperAdmin("OPERATOR@GYMCLASSOS.COM")).toBe(true);
  });

  it("is case-insensitive (mixed case env var)", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "Operator@GymClassOS.com";
    expect(isSuperAdmin("operator@gymclassos.com")).toBe(true);
  });

  it("trims whitespace from the input email", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    expect(isSuperAdmin("  operator@gymclassos.com  ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isSuperAdmin — studio staff credentials are rejected (HQ-FND-01 isolation)
//
// These tests encode the HQ-FND-01 truth: "a studio staff credential cannot
// authenticate to HQ." The deployment-level isolation (separate BETTER_AUTH_SECRET
// + separate Neon) provides the primary guarantee. The allowlist is the
// additional software gate. This test proves the gate rejects studio emails.
// ---------------------------------------------------------------------------

describe("isSuperAdmin — studio staff credentials rejected (HQ-FND-01 isolation)", () => {
  it("rejects a representative studio coach email", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    // A coach at a customer studio — must never reach HQ surfaces.
    expect(isSuperAdmin("coach@somegym.com")).toBe(false);
  });

  it("rejects a studio manager email", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    expect(isSuperAdmin("manager@thefitnessstudio.co.uk")).toBe(false);
  });

  it("rejects an email that is close to but not the operator email", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    // Attacker appending a suffix after a partial match
    expect(isSuperAdmin("operator@gymclassos.com.attacker.io")).toBe(false);
  });

  it("rejects an email that only shares the domain", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    expect(isSuperAdmin("other@gymclassos.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSuperAdmin — deny-by-default when HQ_SUPER_ADMIN_EMAIL is unset
//
// This is the CRITICAL divergence from staff-web. If the env var is not
// configured, the HQ control plane must deny ALL access — not allow all.
// An unset email is a misconfiguration, not a dev convenience.
// ---------------------------------------------------------------------------

describe("isSuperAdmin — deny-by-default when HQ_SUPER_ADMIN_EMAIL is unset", () => {
  // Note: env cleared in beforeEach — HQ_SUPER_ADMIN_EMAIL is NOT set here.

  it("returns false for the operator's own email when env var is unset", () => {
    // Even if someone knows the operator email and tries to sign in, they are
    // denied if the env var is not configured. This is the safe failure mode.
    // DIVERGENCE: staff-web allows all when CUSTOMER_ALLOWED_EMAILS is empty.
    //             HQ denies all when HQ_SUPER_ADMIN_EMAIL is unset.
    expect(isSuperAdmin("operator@gymclassos.com")).toBe(false);
  });

  it("returns false for any studio email when env var is unset", () => {
    expect(isSuperAdmin("coach@somegym.com")).toBe(false);
  });

  it("returns false for an empty string email when env var is unset", () => {
    expect(isSuperAdmin("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSuperAdmin — edge cases
// ---------------------------------------------------------------------------

describe("isSuperAdmin — edge cases", () => {
  it("returns false for an empty string email (configured env)", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "operator@gymclassos.com";
    expect(isSuperAdmin("")).toBe(false);
  });

  it("returns false when env var is set to empty string", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "";
    expect(isSuperAdmin("operator@gymclassos.com")).toBe(false);
  });

  it("handles whitespace-only env var as unset (deny all)", () => {
    process.env.HQ_SUPER_ADMIN_EMAIL = "   ";
    expect(isSuperAdmin("operator@gymclassos.com")).toBe(false);
  });
});
