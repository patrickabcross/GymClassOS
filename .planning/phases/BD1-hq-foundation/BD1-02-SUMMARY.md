---
phase: BD1-hq-foundation
plan: "02"
subsystem: packages/hq-schema + apps/hq/server/db
tags: [hq, schema, drizzle, migrations, neon, pii-boundary]
dependency_graph:
  requires: [BD1-01]
  provides: [HQ-FND-03, hq-schema-package, hq-db-plugin]
  affects: [BD1-03, BD1-04, BD2]
tech_stack:
  added:
    - "@gymos/hq-schema (new workspace package — Drizzle schema + migration list for HQ Neon)"
  patterns:
    - "runMigrations({ table: 'hq_migrations' }) — distinct from staff-web 'mail_migrations' to avoid version-space collision"
    - "createGetDb(mergedSchema) — dispatch+brain+hq schemas merged into a single Drizzle handle"
    - "PII-up boundary: no column in hq-schema schema.ts may match *connection*/*database_url*/*dsn*"
    - "HQ_MIGRATIONS_TABLE constant exported from @gymos/hq-schema so consumer never duplicates the string"
    - "hqMigrations array (additive only) consumed by apps/hq db plugin; BD1-03 appends seed at v2"
key_files:
  created:
    - packages/hq-schema/package.json
    - packages/hq-schema/tsconfig.json
    - packages/hq-schema/src/schema.ts
    - packages/hq-schema/src/migrations.ts
    - packages/hq-schema/src/index.ts
    - apps/hq/server/db/schema.ts
    - apps/hq/.env.example
  modified:
    - apps/hq/package.json (added @gymos/hq-schema workspace:* dep)
    - apps/hq/server/db/index.ts (merged schema; mirrors staff-web createGetDb + Proxy)
    - apps/hq/server/plugins/db.ts (replaced dispatchDbPlugin with runMigrations against hq_migrations)
    - pnpm-lock.yaml
decisions:
  - "HqMigrationEntry type defined inline in migrations.ts (not imported from @agent-native/core/db/migrations) because that subpath is not exported by the core package.json exports map"
  - "apps/hq/server/db/schema.ts added as re-export barrel matching staff-web pattern; lets hq app code import HQ tables via local db module"
  - "dispatchDbPlugin replaced — HQ needs its own migration bookkeeping table (hq_migrations) not dispatch's; runMigrations subsumes the dispatch plugin's role"
metrics:
  duration: "537 seconds (~9 min)"
  completed_date: "2026-06-19"
  tasks: 3
  files_changed: 10
---

# Phase BD1 Plan 02: HQ Schema Package + DB Plugin Summary

**One-liner:** New `@gymos/hq-schema` workspace package with additive `hq_app_meta` foundation table + migration list, wired into `apps/hq` via `runMigrations` against HQ's own dedicated Neon (env-documented, never hardcoded).

## What Was Built

### packages/hq-schema

A new internal workspace package (`packages/*` glob already covered it — no `pnpm-workspace.yaml` change needed):

- `src/schema.ts` — HQ Drizzle table definitions. BD1 contains one table: `hq_app_meta` (single-row sentinel recording HQ org ID, super-admin user ID, schema version, and `seeded_at`). BD1-03 writes the first row; BD2 adds domain tables here.
- `src/migrations.ts` — Ordered `HqMigrationEntry[]` list consumed by `runMigrations`. Version 1: `CREATE TABLE IF NOT EXISTS hq_app_meta (...)`. A clearly-marked comment block at version 2 documents where BD1-03 appends the HQ org + super-admin seed migration.
- `src/index.ts` — Re-exports schema + migrations + the `HQ_MIGRATIONS_TABLE = "hq_migrations"` constant.
- `package.json` — `@gymos/hq-schema`, private, ESM, `drizzle-orm ^0.45.2` + `@agent-native/core workspace:*` deps, `typecheck` script.
- `tsconfig.json` — ESM bundler moduleResolution, strict, noEmit (matches `@gymos/queue` precedent).

### apps/hq data layer

- `server/db/schema.ts` (new) — Re-exports `@gymos/hq-schema/schema` (hq_app_meta). BD2 domain tables land here via hq-schema package updates.
- `server/db/index.ts` (updated) — Merges dispatch schema (`@agent-native/dispatch/db`) + Brain schema (`./brain-schema.ts`) + HQ schema (`./schema.ts`) into a single `mergedSchema` passed to `createGetDb`. Exposes `db` Proxy for backwards compat (mirrors staff-web exactly). Re-registers Brain shareable resources.
- `server/plugins/db.ts` (updated) — Replaced the previous `dispatchDbPlugin` re-export with `runMigrations(hqMigrations, { table: HQ_MIGRATIONS_TABLE })`. Uses the `hq_migrations` bookkeeping table (distinct from staff-web's `mail_migrations`).
- `package.json` (updated) — Added `"@gymos/hq-schema": "workspace:*"` dependency.
- `.env.example` (new) — Documents `DATABASE_URL` (HQ Neon POOLED) and `DATABASE_URL_UNPOOLED` (HQ Neon UNPOOLED/direct) with the explicit "HQ's OWN dedicated Neon project — NEVER a studio Neon. NEVER commit a real value." warning.

## Commits

| Commit | What |
|--------|------|
| `ba2c0b1d` | feat(BD1-02): scaffold @gymos/hq-schema workspace package |
| `718d333e` | feat(BD1-02): wire apps/hq db plugin to @gymos/hq-schema via runMigrations |

## Verification Results

- `pnpm --filter @gymos/hq-schema typecheck` → exit 0 (no errors)
- `pnpm --filter @gymos/hq typecheck` → exit 0 (no errors)
- `pnpm guard:no-drizzle-push` → "clean (no `drizzle-kit push` in any build/deploy path)"
- `grep -Ei "connection|database_url|dsn" packages/hq-schema/src/schema.ts` → hits only in JSDoc comment lines (the constraint documentation itself), no actual column definitions
- `grep -q "hq_migrations\|HQ_MIGRATIONS_TABLE" apps/hq/server/plugins/db.ts` → found
- `grep -q "runMigrations" apps/hq/server/plugins/db.ts` → found
- `grep -q "@gymos/hq-schema" apps/hq/package.json` → found
- `grep -i "never a studio\|own dedicated" apps/hq/.env.example` → found

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `@agent-native/core/db/migrations` subpath not in core exports map**
- **Found during:** Task 3 (typecheck run)
- **Issue:** `packages/hq-schema/src/migrations.ts` initially imported `MigrationEntry` from `@agent-native/core/db/migrations`, but that subpath is not listed in the core `package.json` exports map (only `./db`, `./db/schema`, `./db/drizzle-config` are exported). TypeScript would fail to resolve it.
- **Fix:** Defined `HqMigrationEntry` inline in `migrations.ts` (matching the shape of `MigrationEntry` exactly — `{ version: number; sql: string | { postgres?: string; sqlite?: string } }`). `runMigrations` in core accepts `Array<MigrationEntry>` and `HqMigrationEntry` is structurally identical, so TypeScript accepts the assignment.
- **Files modified:** `packages/hq-schema/src/migrations.ts`
- **Commit:** `ba2c0b1d`

**2. [Rule 1 - Bug] apps/hq/server/db/index.ts previously exported `mergedSchema as schema` (named re-export) but staff-web exports the default `schema` object**
- **Found during:** Task 2 (wiring review)
- **Issue:** The BD1-01 `index.ts` exported `mergedSchema as schema` which hides the `schema` property behind a rename. Code that imports `{ schema }` would get the merged schema, but the Proxy's typing relies on `schema` being available. Rewriting to `export const schema = { ...dispatchSchema, ...brainSchema, ...hqSchema }` and then `createGetDb(schema)` + `export { schema }` matches the staff-web pattern exactly.
- **Fix:** Rewrote `server/db/index.ts` to use `export const schema = {...}` then pass it to `createGetDb`. Added explicit `db` Proxy export matching staff-web.
- **Files modified:** `apps/hq/server/db/index.ts`
- **Commit:** `718d333e`

## User Setup Items

**1. HQ Neon project (external dependency — cannot be automated)**

Before BD1-03 (auth seeding) can run and before deploying apps/hq to Vercel, the operator must provision the HQ Neon project:

1. Create a new Neon project named `gymos-hq` (Neon Console → New Project, or `neon_mcp create_project`). This must be a **new project separate from `gymos-demo`** — never the studio Neon.
2. Copy the **POOLED** connection string into `DATABASE_URL` (apps/hq environment on Vercel, and `.env` for local runs).
3. Copy the **UNPOOLED** (direct, no `-pooler`) connection string into `DATABASE_URL_UNPOOLED` (services/hq-worker Fly environment, BD1-04).

Migration apply (live-apply against the provisioned HQ Neon) is deferred on this external dependency. The migration code is complete and typechecks; it runs automatically at apps/hq startup once `DATABASE_URL` is set.

## Known Stubs

None. This plan sets up structural plumbing only:
- `hq_app_meta` is an empty table until BD1-03 writes the seed row.
- `hqMigrations` has version 1 only; BD1-03 appends version 2 (seed), BD2 appends versions 3+.
- These are intentional, documented extension points — not stubs that block this plan's goal.

## Self-Check: PASSED

- `packages/hq-schema/package.json` → EXISTS, name `@gymos/hq-schema`
- `packages/hq-schema/src/schema.ts` → EXISTS, no PII columns
- `packages/hq-schema/src/migrations.ts` → EXISTS, BD1-03 extension point comment present
- `packages/hq-schema/src/index.ts` → EXISTS, exports `HQ_MIGRATIONS_TABLE`
- `apps/hq/server/plugins/db.ts` → EXISTS, contains `runMigrations` + `HQ_MIGRATIONS_TABLE`
- `apps/hq/server/db/index.ts` → EXISTS, contains `createGetDb`
- `apps/hq/.env.example` → EXISTS, contains HQ Neon warning
- Commits `ba2c0b1d` + `718d333e` → verified in `git log --oneline -5`
