---
phase: BD1-hq-foundation
plan: "03"
subsystem: apps/hq/server/plugins/auth + packages/hq-schema
tags: [hq, auth, better-auth, single-super-admin, isolation, seed, migration, vitest]
dependency_graph:
  requires: [BD1-01, BD1-02]
  provides: [HQ-FND-01, HQ-FND-04, hq-auth-plugin, hq-org-seed, HQ_ORG_ID]
  affects: [BD1-04, BD2, BD3]
tech_stack:
  added: []
  patterns:
    - "isSuperAdmin + parseSuperAdminEmail extracted to auth-helpers.ts (no server deps) so vitest can load without CJS/ESM issues"
    - "Export from helpers file + re-export from plugin entry point pattern (unit-testable pure helpers, no server boot)"
    - "HQ deny-by-default when HQ_SUPER_ADMIN_EMAIL unset — deliberate divergence from staff-web dev-fallback-allow-all"
    - "Migration constants extracted to constants.ts to avoid circular import (migrations.ts imports constants.ts; index.ts re-exports both)"
    - "Postgres + SQLite dialect variants in migration v2/v3 sql objects"
key_files:
  created:
    - apps/hq/server/plugins/auth-helpers.ts
    - apps/hq/server/plugins/auth.test.ts
    - packages/hq-schema/src/constants.ts
  modified:
    - apps/hq/server/plugins/auth.ts
    - apps/hq/.env.example
    - packages/hq-schema/src/migrations.ts
    - packages/hq-schema/src/index.ts
decisions:
  - "auth-helpers.ts extracted from auth.ts to decouple pure helpers from @agent-native/core/server imports (vitest cannot load h3/Better-auth in the current monorepo ESM environment)"
  - "constants.ts introduced to avoid circular import: migrations.ts needs HQ_ORG_ID at module init time; having it in index.ts (which re-exports migrations.ts) would be a cycle"
  - "Migration v2 and v3 are separate entries for FK ordering: organization row (v2) must exist before member row (v3)"
  - "HQ denies all when HQ_SUPER_ADMIN_EMAIL is unset — documented divergence from staff-web dev-fallback"
  - "Super-admin USER row is NOT seeded (operator email must not appear in DB); Better-auth creates it on first sign-in"
metrics:
  duration: "545 seconds (~9 min)"
  completed_date: "2026-06-19"
  tasks: 3
  files_changed: 7
---

# Phase BD1 Plan 03: HQ Better-auth + Org Seed Summary

**One-liner:** HQ single-super-admin Better-auth gate (deny-by-default, deployment-level isolation) + idempotent HQ org seed in runMigrations so Brain/Dispatch accessFilter returns non-empty results; 19 passing unit tests with no server boot.

## What Was Built

### apps/hq/server/plugins/auth-helpers.ts (new)

Pure helper functions with no framework imports — unit-testable by vitest:

- `parseSuperAdminEmail(): string | null` — reads `HQ_SUPER_ADMIN_EMAIL`, trims + lowercases, returns null when unset/empty.
- `isSuperAdmin(email: string): boolean` — compare case-insensitively against the configured email; returns false (deny) when env var is null. Documented divergence from staff-web's dev-fallback-allow-all.

### apps/hq/server/plugins/auth.ts (replaced)

Full HQ Better-auth plugin replacing the previous `dispatchAuthPlugin` re-export:

- `createAuthPlugin` with `marketing` (GymClassOS HQ branding) and `publicPaths: ["/access-denied"]`. No `googleOnly` — email/password auth per D-05.
- Allowlist handler: runs after the framework auth plugin, skips framework routes (`/_*`), reads the session email, calls `_isSuperAdmin`, redirects non-admins to `/access-denied`.
- Re-exports `parseSuperAdminEmail` and `isSuperAdmin` from `auth-helpers.ts` so external code can import them from a single entry point.

### apps/hq/.env.example (updated)

Added `HQ_SUPER_ADMIN_EMAIL` with documentation: "Leave unset → ALL sign-ins are denied (deny-by-default, safe failure mode)." Updated `BETTER_AUTH_SECRET` comment: "HQ's OWN Better-auth secret — MUST differ from any studio's BETTER_AUTH_SECRET. Deployment-level isolation (D-06)."

### packages/hq-schema/src/constants.ts (new)

Fixed, deterministic org identity constants:

- `HQ_ORG_ID = "hq-org-gymclassos-v1"` — stable Better-auth org ID seeded in migration v2. Never change post-seed.
- `HQ_ORG_SLUG = "gymclassos-hq"` — URL slug for the HQ org.
- `HQ_ORG_MEMBER_ID = "hq-member-seed-v1"` — ID for the placeholder member row.

### packages/hq-schema/src/migrations.ts (updated)

Two new migration entries appended at the BD1-03 extension point:

- **v2 (org seed):** `INSERT INTO "organization" (id, name, slug, ...) VALUES (HQ_ORG_ID, 'GymClassOS HQ', HQ_ORG_SLUG, ...) ON CONFLICT (id) DO NOTHING` + `INSERT INTO hq_app_meta (id, hq_org_id, ...) ON CONFLICT (id) DO NOTHING`. Postgres + SQLite dialect variants.
- **v3 (member seed):** `INSERT INTO "member" (id, organization_id, user_id, role, ...) VALUES (HQ_ORG_MEMBER_ID, HQ_ORG_ID, 'hq-super-admin-placeholder', 'owner', ...) ON CONFLICT (id) DO NOTHING`. Separate version for FK ordering (organization must exist before member).

Ordering guarantee: Nitro loads plugins alphabetically (`auth.ts` before `db.ts`), so Better-auth creates `organization`/`member` tables before `runMigrations` runs the seed inserts.

### packages/hq-schema/src/index.ts (updated)

Added `export * from "./constants.js"` so `HQ_ORG_ID`, `HQ_ORG_SLUG`, `HQ_ORG_MEMBER_ID` are publicly accessible via `@gymos/hq-schema`. BD3 Brain/Dispatch imports `HQ_ORG_ID` from here.

### apps/hq/server/plugins/auth.test.ts (new)

19 Vitest unit tests in 5 `describe` blocks, all passing, no server boot:

- `parseSuperAdminEmail` — unset, empty, whitespace-only, correct, trimming.
- `isSuperAdmin` operator allowed — exact match, case-insensitive, trimmed.
- **`isSuperAdmin` studio staff rejected (HQ-FND-01 isolation)** — asserts `coach@somegym.com`, `manager@thefitnessstudio.co.uk`, a suffix-spoofed email, and a same-domain-different-localpart email are all rejected.
- **`isSuperAdmin` deny-by-default (env unset)** — documented divergence from staff-web; operator's own email is still rejected when env var is missing.
- Edge cases — empty string, whitespace-only env.

## Commits

| Commit | What |
|--------|------|
| `0ed8c205` | feat(BD1-03): HQ Better-auth plugin with single-super-admin gate |
| `f7854956` | feat(BD1-03): seed HQ org inside runMigrations (Pitfall F-02) |
| `447d5694` | test(BD1-03): unit-test HQ single-super-admin allowlist + isolation (HQ-FND-01) |

## Verification Results

- `pnpm --filter @gymos/hq test` → 19/19 passed (Test Files 1 passed, Tests 19 passed)
- `pnpm --filter @gymos/hq typecheck` → exit 0
- `pnpm --filter @gymos/hq-schema typecheck` → exit 0
- `pnpm guard:no-drizzle-push` → "clean (no `drizzle-kit push` in any build/deploy path)"
- `grep -q "createAuthPlugin" apps/hq/server/plugins/auth.ts` → found
- `grep -q "HQ_SUPER_ADMIN_EMAIL" apps/hq/server/plugins/auth.ts` → found
- `grep -qi "ON CONFLICT" packages/hq-schema/src/migrations.ts` → found
- `grep -q "HQ_ORG_ID" packages/hq-schema/src/constants.ts` → found
- No `DROP`/`TRUNCATE`/`RENAME` SQL statements in migrations → clean

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Importing from auth.ts in vitest fails (CJS/ESM import chain)**
- **Found during:** Task 3 (first test run)
- **Issue:** `import { isSuperAdmin } from "./auth.js"` in the test file triggered a chain load of `@agent-native/core/server` → `h3`, `react`, `@opentelemetry/...`, all of which have CJS/ESM boundary issues in vitest's Vite ESM runner. Tests collected but errored before running.
- **Fix:** Extracted `parseSuperAdminEmail` + `isSuperAdmin` into `auth-helpers.ts` with zero framework imports. Test file imports from `auth-helpers.ts` directly. `auth.ts` imports helpers and re-exports them (renamed to avoid TypeScript's re-export + local import conflict).
- **Files modified:** `apps/hq/server/plugins/auth-helpers.ts` (new), `apps/hq/server/plugins/auth.ts` (re-exports), `apps/hq/server/plugins/auth.test.ts` (import changed)
- **Commit:** `447d5694`

**2. [Rule 1 - Bug] Circular import: migrations.ts importing from index.ts**
- **Found during:** Task 2 (planning the import graph)
- **Issue:** If `migrations.ts` imported constants from `index.ts`, and `index.ts` re-exports from `migrations.ts`, TypeScript would detect a circular dependency (module init order undefined).
- **Fix:** Introduced `constants.ts` as a leaf module with no local imports. Both `migrations.ts` and `index.ts` import from `constants.ts`; `index.ts` re-exports it via `export * from "./constants.js"`.
- **Files modified:** `packages/hq-schema/src/constants.ts` (new), `packages/hq-schema/src/migrations.ts` (imports constants.ts), `packages/hq-schema/src/index.ts` (re-exports constants.ts)
- **Commit:** `f7854956`

## User Setup Items

**1. HQ_SUPER_ADMIN_EMAIL (env-provided, cannot be automated)**

The operator must set `HQ_SUPER_ADMIN_EMAIL` to their email address in the HQ Vercel environment before deploying apps/hq. Until this is set, all sign-ins to HQ are denied (deny-by-default).

**2. BETTER_AUTH_SECRET (env-provided, must differ from studio secrets)**

Generate a fresh secret (`openssl rand -base64 32`) for the HQ app's own Better-auth instance. This MUST be different from any studio's BETTER_AUTH_SECRET — it is the primary deployment-level isolation mechanism (D-06).

**3. Org member link on first sign-in**

Migration v3 seeds a placeholder member row with `user_id = 'hq-super-admin-placeholder'`. When the operator signs in for the first time, Better-auth creates the real user row (with their actual user ID). BD3 must add a first-sign-in hook that links the real user to `HQ_ORG_ID` via a `member` row (or update the placeholder). Without this, the org query returns data (because the org row exists) but the user is not a member of it.

**4. Live migration apply against HQ Neon (deferred on external dependency)**

The migration SQL is verified as additive + idempotent + typechecked. Live apply against the provisioned HQ Neon (from BD1-02 User Setup) is deferred until `DATABASE_URL` is populated. Migrations run automatically at `apps/hq` startup.

## Known Stubs

**HQ org member link (partial stub)**

Migration v3 seeds a placeholder member row (`user_id = 'hq-super-admin-placeholder'`). This is an intentional stub — it ensures the `member` table has a row so org-scoped queries don't return empty, but the `user_id` is not the real operator user ID until first sign-in. BD3 must complete this by updating the member row to the real `user_id` on the operator's first sign-in. This stub does NOT block BD1's goal (HQ is sign-in-able and the org seed exists); it is documented as a BD3 dependency.

## Self-Check: PASSED

- `apps/hq/server/plugins/auth.ts` → EXISTS, contains `createAuthPlugin` + `HQ_SUPER_ADMIN_EMAIL`
- `apps/hq/server/plugins/auth-helpers.ts` → EXISTS, exports `isSuperAdmin` + `parseSuperAdminEmail`
- `apps/hq/server/plugins/auth.test.ts` → EXISTS, 19 tests, all passing
- `apps/hq/.env.example` → EXISTS, contains `HQ_SUPER_ADMIN_EMAIL` + `BETTER_AUTH_SECRET` with isolation note
- `packages/hq-schema/src/constants.ts` → EXISTS, exports `HQ_ORG_ID`, `HQ_ORG_SLUG`, `HQ_ORG_MEMBER_ID`
- `packages/hq-schema/src/migrations.ts` → EXISTS, contains v2 + v3 with `ON CONFLICT DO NOTHING`
- `packages/hq-schema/src/index.ts` → EXISTS, re-exports `constants.ts`
- Commits `0ed8c205` + `f7854956` + `447d5694` → verified in git log
