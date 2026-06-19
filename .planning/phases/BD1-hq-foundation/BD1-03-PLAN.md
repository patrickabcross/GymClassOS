---
phase: BD1-hq-foundation
plan: 03
type: execute
wave: 3
depends_on: ["01", "02"]
files_modified:
  - apps/hq/server/plugins/auth.ts
  - packages/hq-schema/src/migrations.ts
  - packages/hq-schema/src/index.ts
  - apps/hq/.env.example
  - apps/hq/server/plugins/auth.test.ts
autonomous: true
requirements: [HQ-FND-01, HQ-FND-04]
user_setup:
  - service: hq-auth
    why: "HQ is a single super-admin app (D-05). The operator's email allowlist + Better-auth secret are deploy-level config Claude cannot generate."
    env_vars:
      - name: HQ_SUPER_ADMIN_EMAIL
        source: "The operator's email (the single super-admin). Used by the auth allowlist and to link the super-admin to the seeded HQ org on first sign-in."
      - name: BETTER_AUTH_SECRET
        source: "Generate a strong random secret for HQ's OWN Better-auth instance (e.g. openssl rand -base64 32). MUST be different from any studio's BETTER_AUTH_SECRET — deployment-level isolation (D-06)."

must_haves:
  truths:
    - "The operator can sign in to apps/hq as a single super-admin via Better-auth"
    - "A studio staff credential cannot authenticate to HQ, and an HQ admin cannot authenticate to a studio — there is no shared session store (deployment-level isolation)"
    - "An HQ org + super-admin link is seeded inside runMigrations (at migration time, not app boot) so Brain/Dispatch accessFilter/orgId queries return non-empty results"
    - "Navigating to HQ Brain or Dispatch routes returns real (non-empty) results because the seed gives accessFilter a known orgId from first boot"
  artifacts:
    - path: "apps/hq/server/plugins/auth.ts"
      provides: "HQ Better-auth plugin, single-super-admin allowlist"
      contains: "createAuthPlugin"
    - path: "packages/hq-schema/src/migrations.ts"
      provides: "Additive migration seeding the HQ org (Pitfall F-02)"
      contains: "ON CONFLICT"
  key_links:
    - from: "apps/hq/server/plugins/auth.ts"
      to: "HQ_SUPER_ADMIN_EMAIL"
      via: "single-super-admin allowlist gate"
      pattern: "HQ_SUPER_ADMIN_EMAIL"
    - from: "packages/hq-schema/src/migrations.ts"
      to: "HQ org seed"
      via: "INSERT ... ON CONFLICT DO NOTHING in runMigrations"
      pattern: "ON CONFLICT"
---

<objective>
Make `apps/hq` sign-in-able as a single super-admin and seed the HQ org at migration time so Brain/Dispatch return data (not empty arrays). Isolation is deployment-level: HQ has its own Better-auth instance + its own Neon — a studio credential can never authenticate to HQ and vice versa.

Purpose: HQ-FND-01 (operator sign-in + studio/HQ auth isolation) and HQ-FND-04 (org seed so accessFilter/orgId queries return results — Pitfall F-02). The org seed is the canary for all BD3 Brain/Dispatch functionality.
Output: apps/hq/server/plugins/auth.ts (single-super-admin gate) + an additive seed migration in packages/hq-schema + a unit test proving the allowlist/isolation logic.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md
@.planning/research/SUMMARY.md
@.planning/research/PITFALLS.md
@CLAUDE.md
@AGENTS.md

<read_first>
Bounding decisions (BD1-CONTEXT.md):
- D-05: Better-auth single super-admin for v2.0 (email/password + magic link acceptable; OAuth deferred). Multi-user/roles is HQ-FUT-01 (do NOT build roles).
- D-06: Isolation is DEPLOYMENT-LEVEL — HQ has its own Better-auth instance + its own Neon. A studio staff credential cannot authenticate to HQ and HQ admin cannot authenticate to a studio; there is no shared session store. The separate Neon + separate BETTER_AUTH_SECRET already give isolation. The single-super-admin allowlist is an ADDITIONAL gate so only the operator's email reaches HQ surfaces.
- D-10: Seed an HQ org + super-admin row INSIDE runMigrations (not at app boot) so Brain/Dispatch accessFilter/orgId queries return non-empty results immediately (Pitfall F-02).

Pitfall F-02 (PITFALLS.md / SUMMARY.md): accessFilter scopes to orgId; with no HQ org, every query returns zero rows. Prevention: create a FIXED HQ org + super-admin link in runMigrations; do NOT replace accessFilter with allow-unscoped.

Precedent to mirror:
- apps/staff-web/server/plugins/auth.ts — createAuthPlugin from @agent-native/core/server composed with an email-allowlist handler (parseAllowedEmails reads an env var, compares case-insensitively, redirects non-allowlisted to a denial page). Mirror this composition shape but with a SINGLE-super-admin allowlist (HQ_SUPER_ADMIN_EMAIL) and the D-05 auth method (email/password + magic link; do NOT require Google).
- packages/hq-schema/src/migrations.ts (from BD1-02) — the runMigrations ordered list. The seed is appended as a NEW version at the extension point BD1-02 left.

Framework identity tables: Better-auth manages user/session/account; the org model manages org rows. Grep @agent-native/core for the org + better-auth table/column names so the seed INSERTs target correct names. The seed MUST be idempotent (INSERT ... ON CONFLICT DO NOTHING) — runMigrations may re-run on every deploy against a shared prod DB; a non-idempotent seed would error or duplicate (no-breaking-DB-changes rule). Use a FIXED org id constant so the org is deterministic across deploys. Do NOT hardcode a real super-admin email in the migration; prefer linking the super-admin user to the seeded org on first Better-auth sign-in.

Constraints: additive only (new migration version, ON CONFLICT DO NOTHING, never alter/drop); no drizzle-kit push; no-local-dev-server (prove allowlist logic via a Vitest unit test on the pure helper, not by booting a server).
</read_first>

<interfaces>
From apps/staff-web/server/plugins/auth.ts (composition pattern to mirror):
```
import { createAuthPlugin, getH3App, getSession } from "@agent-native/core/server";
const authPlugin = createAuthPlugin({ /* method config */, publicPaths: [...] });
function parseAllowed(): string[] { /* read env, lowercase, filter */ }
const allowlistHandler = defineEventHandler(async (event) => { /* redirect non-allowlisted */ });
export default async function hqAuthPlugin(nitroApp) {
  await authPlugin(nitroApp);
  getH3App(nitroApp).use(allowlistHandler);
}
```
Seed migration shape (append a version):
```
{ version: N, sql: "INSERT INTO <org_table> (id, name, ...) VALUES ('<fixed-hq-org-id>', 'GymClassOS HQ', ...) ON CONFLICT (id) DO NOTHING" }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: HQ Better-auth plugin with single-super-admin gate</name>
  <read_first>apps/staff-web/server/plugins/auth.ts (full composition), @agent-native/core/server createAuthPlugin options (grep the type for email/password, magicLink, googleOnly), apps/hq/server (the dispatch-derived auth plugin BD1-01 produced)</read_first>
  <files>apps/hq/server/plugins/auth.ts, apps/hq/.env.example</files>
  <action>
Create/replace apps/hq/server/plugins/auth.ts (the HQ app has a dispatch-derived auth plugin from BD1-01 — adapt it). Mirror the staff-web composition but for a single super-admin:
- createAuthPlugin configured per D-05: enable email/password and/or magic link (do NOT require Google/OAuth). Set marketing fields (appName "GymClassOS HQ", a tagline making clear this is the operator control plane). Set publicPaths to the minimum HQ needs (sign-in routes + genuinely public assets); keep /_agent-native/* and /api/* authenticated.
- Add a single-super-admin allowlist handler: a pure isSuperAdmin(email) helper comparing case-insensitively against process.env.HQ_SUPER_ADMIN_EMAIL (a SINGLE email, not a comma-list). Non-matching authenticated users get redirected to an access-denied surface (reuse the dispatch/brain denial page or a minimal HQ one). EXPORT isSuperAdmin (and a parseSuperAdminEmail helper) so Task 3 can unit-test without a server.
- Compose: run createAuthPlugin first, then attach the allowlist handler (staff-web ordering — cookie set before the gate runs).
- Document HQ_SUPER_ADMIN_EMAIL and BETTER_AUTH_SECRET in apps/hq/.env.example with the note: "HQ's OWN Better-auth secret — MUST differ from any studio's; deployment-level isolation (D-06)."
Do NOT add roles or multi-user logic (HQ-FUT-01 deferred).
  </action>
  <verify>
    <automated>grep -q "createAuthPlugin" apps/hq/server/plugins/auth.ts && grep -q "HQ_SUPER_ADMIN_EMAIL" apps/hq/server/plugins/auth.ts && echo ok</automated>
  </verify>
  <acceptance_criteria>
    - apps/hq/server/plugins/auth.ts calls createAuthPlugin(...) and gates on HQ_SUPER_ADMIN_EMAIL (both grep-hittable).
    - It exports a pure isSuperAdmin / parseSuperAdminEmail helper (grep: export + helper name).
    - It does NOT force Google-only auth (prefer email/password + magic link per D-05).
    - apps/hq/.env.example documents HQ_SUPER_ADMIN_EMAIL + BETTER_AUTH_SECRET with the "MUST differ from any studio" isolation note (grep: "differ from any studio" or "deployment-level" hits).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Seed HQ org inside runMigrations (Pitfall F-02)</name>
  <read_first>packages/hq-schema/src/migrations.ts (the BD1-03 extension-point comment from BD1-02), @agent-native/core org + better-auth table/column names (grep core for org table DDL and user table), apps/staff-web migrations for the additive-migration idiom</read_first>
  <files>packages/hq-schema/src/migrations.ts, packages/hq-schema/src/index.ts</files>
  <action>
Append a NEW migration version to the exported migration list (at the BD1-02 extension point) that seeds the HQ org so accessFilter has a known orgId from first boot. The seed MUST:
- Use a FIXED, deterministic HQ org id (a stable constant HQ_ORG_ID exported from packages/hq-schema/src/index.ts).
- Be idempotent: INSERT ... ON CONFLICT (id) DO NOTHING (re-runnable on every deploy against the shared prod HQ DB — no-breaking-DB-changes rule).
- NOT hardcode a real super-admin email. Seed ONLY the org row here; the super-admin USER row is created by Better-auth at first sign-in and linked to HQ_ORG_ID via a minimal first-sign-in linking step (add a small note/hook referencing HQ_SUPER_ADMIN_EMAIL in auth.ts, or document the link clearly). This keeps the operator email out of the migration.
- Be strictly additive — no ALTER/DROP. If the org/membership table is framework-managed (most likely), the seed is INSERT-only; if there is an ordering risk (the framework may not have created the org table when runMigrations runs), defensively guard with CREATE TABLE IF NOT EXISTS matching the framework's columns, or order the seed migration after the framework's table creation — confirm which by reading how staff-web's org/better-auth tables come into existence.
- Export HQ_ORG_ID from packages/hq-schema/src/index.ts so apps/hq + BD3 Brain/Dispatch reference the same fixed org id.
  </action>
  <verify>
    <automated>grep -qi "ON CONFLICT" packages/hq-schema/src/migrations.ts && grep -q "HQ_ORG_ID" packages/hq-schema/src/index.ts && pnpm guard:no-drizzle-push</automated>
  </verify>
  <acceptance_criteria>
    - packages/hq-schema/src/migrations.ts contains an idempotent org seed (grep: "ON CONFLICT" and "GymClassOS HQ" or HQ_ORG_ID reference).
    - HQ_ORG_ID is exported from packages/hq-schema/src/index.ts (grep hit).
    - The migration is additive only — no DROP/ALTER ... DROP/RENAME/TRUNCATE (grep: those keywords return nothing in the seed migration).
    - pnpm guard:no-drizzle-push exits 0.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Unit-test the single-super-admin allowlist + isolation logic</name>
  <read_first>apps/hq/server/plugins/auth.ts (the exported isSuperAdmin/parseSuperAdminEmail helpers), apps/staff-web test conventions (vitest --run), services/edge-webhooks/src/lib/secrets.test.ts (a pure-function unit-test shape in this repo)</read_first>
  <files>apps/hq/server/plugins/auth.test.ts</files>
  <action>
Write a Vitest unit test on the pure exported allowlist helper (no server boot — honors the no-local-dev-server constraint). Cover:
- isSuperAdmin returns true ONLY for the configured HQ_SUPER_ADMIN_EMAIL (case-insensitive).
- isSuperAdmin returns false for any OTHER email — explicitly assert a representative STUDIO staff email (e.g. a typical coach@somegym.com) is rejected, encoding the HQ-FND-01 isolation truth ("a studio staff credential cannot authenticate to HQ") at the allowlist layer.
- Empty/unset HQ_SUPER_ADMIN_EMAIL: assert the chosen safe behavior (recommend: deny all when unset for the HQ control plane, since a missing operator email should not silently open HQ — DIFFERENT from staff-web's dev-fallback-allow-all; document the divergence in a code comment because HQ is the operator plane).
- Whitespace/trimming + mixed case handled.
Mock process.env per-test and reset between tests (mirror the worker env reset pattern). Run the test.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq test -- auth.test.ts 2>/dev/null || pnpm --filter @gymos/hq test</automated>
  </verify>
  <acceptance_criteria>
    - apps/hq/server/plugins/auth.test.ts exists and asserts both the operator-email-allowed and a studio-email-rejected case (grep: the test file references a non-operator/studio email and asserts rejection).
    - The HQ test suite passes (vitest run exits 0).
    - There is an explicit test (and code comment) for the unset HQ_SUPER_ADMIN_EMAIL behavior documenting HQ denies-by-default (divergence from staff-web).
  </acceptance_criteria>
</task>

</tasks>

<verification>
- apps/hq/server/plugins/auth.ts gates HQ on a single super-admin (HQ_SUPER_ADMIN_EMAIL) over HQ's own Better-auth instance (own BETTER_AUTH_SECRET, own Neon) — deployment-level isolation.
- packages/hq-schema seeds a fixed HQ org idempotently inside runMigrations (Pitfall F-02) so accessFilter/orgId queries return data; HQ_ORG_ID is exported.
- A passing Vitest unit test proves the operator is allowed and a studio credential is rejected, without a dev server.
- guard:no-drizzle-push clean; seed is additive only.
</verification>

<success_criteria>
HQ-FND-01 + HQ-FND-04 satisfied: operator can sign in to apps/hq as the single super-admin; studio creds cannot authenticate to HQ (proven by unit test + deployment-level isolation); the HQ org seed exists at migration time so Brain/Dispatch return non-empty results.
</success_criteria>

<output>
After completion, create `.planning/phases/BD1-hq-foundation/BD1-03-SUMMARY.md`
</output>
