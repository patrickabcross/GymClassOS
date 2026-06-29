/**
 * Role resolver for the RunStudio mobile API.
 *
 * Resolves an email address → app role using two env-var allowlists:
 *   RUNSTUDIO_OPERATOR_EMAILS — admin role (RunStudio operator chrome gate)
 *   RUNSTUDIO_TEACHER_EMAILS  — teacher role (NEW; does not exist yet in web code)
 *
 * RUNSTUDIO_OPERATOR_EMAILS is the canonical admin allowlist for mobile roles
 * (NOT GYMOS_ADMIN_EMAILS).
 *
 * GYMOS_ADMIN_EMAILS gates staff-web nav tab visibility with empty-list-passes-
 * everyone semantics — a different concept. Do NOT use GYMOS_ADMIN_EMAILS here.
 *
 * NOTE: resolveRole does NOT apply the Patrick-fallback that root.tsx applies for
 * operator chrome. That fallback is a web-tab gating concern; the mobile role
 * resolver should require explicit configuration. An unconfigured deploy has no
 * admin via env — the operator must set RUNSTUDIO_OPERATOR_EMAILS explicitly.
 * This is intentional and diverges from the root.tsx pattern on purpose.
 *
 * Precedence: admin > teacher > member
 */

export type AppRole = "admin" | "teacher" | "member";

export function resolveRole(email: string): AppRole {
  const adminEmails = (process.env.RUNSTUDIO_OPERATOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const teacherEmails = (process.env.RUNSTUDIO_TEACHER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const e = email.toLowerCase().trim();

  if (adminEmails.includes(e)) return "admin";
  if (teacherEmails.includes(e)) return "teacher";
  return "member";
}
