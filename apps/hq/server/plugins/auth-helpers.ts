/**
 * apps/hq/server/plugins/auth-helpers.ts
 *
 * Pure allowlist helpers — no server imports, no @agent-native/core imports.
 * Importable in unit tests without a dev server or heavy transitive deps.
 *
 * These are the exported test surface for the HQ single-super-admin gate.
 * auth.ts imports from here; auth.test.ts imports from here directly.
 */

/**
 * Parse the single configured super-admin email from the environment.
 *
 * Returns the email trimmed + lowercased, or null if the env var is absent
 * or empty. Callers must treat null as "deny all" (not "allow all").
 */
export function parseSuperAdminEmail(): string | null {
  const raw = process.env.HQ_SUPER_ADMIN_EMAIL ?? "";
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Returns true ONLY when `email` exactly matches the configured
 * HQ_SUPER_ADMIN_EMAIL (case-insensitive, trimmed).
 *
 * INTENTIONAL DIVERGENCE FROM STAFF-WEB:
 *   staff-web's allowlist allows all authenticated users when
 *   CUSTOMER_ALLOWED_EMAILS is unset (dev fallback for convenience).
 *
 *   HQ DENIES ALL when HQ_SUPER_ADMIN_EMAIL is unset — a missing operator
 *   email must not silently open the operator control plane. This is the
 *   safe failure mode for a control plane. An unset env var is a
 *   misconfiguration, not a dev convenience.
 *
 * HQ-FND-01 isolation proof:
 *   - Any studio staff email (e.g. coach@somegym.com) is rejected unless
 *     the operator has configured that exact email as HQ_SUPER_ADMIN_EMAIL.
 *   - Combined with deployment-level isolation (separate BETTER_AUTH_SECRET
 *     + separate Neon), a studio credential cannot authenticate to HQ.
 */
export function isSuperAdmin(email: string): boolean {
  const configured = parseSuperAdminEmail();
  if (!configured) return false; // deny-by-default when unset
  return email.trim().toLowerCase() === configured;
}
