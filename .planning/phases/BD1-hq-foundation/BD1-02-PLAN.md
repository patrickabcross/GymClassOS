---
phase: BD1-hq-foundation
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - packages/hq-schema/package.json
  - packages/hq-schema/tsconfig.json
  - packages/hq-schema/src/index.ts
  - packages/hq-schema/src/schema.ts
  - packages/hq-schema/src/migrations.ts
  - apps/hq/server/db/index.ts
  - apps/hq/server/db/schema.ts
  - apps/hq/server/plugins/db.ts
  - apps/hq/.env.example
autonomous: true
requirements: [HQ-FND-03]
user_setup:
  - service: neon
    why: "HQ runs against its own dedicated Neon project (D-08), separate from every studio Neon. Claude cannot create the operator's Neon project without the operator's Neon account; the connection string must be provided as an env var."
    env_vars:
      - name: DATABASE_URL
        source: "HQ Neon project (create a NEW project, e.g. gymos-hq — Neon Console > New Project, or Neon MCP create_project). Use the POOLED connection string for the HQ Vercel app."
      - name: DATABASE_URL_UNPOOLED
        source: "Same HQ Neon project — the UNPOOLED (direct, no -pooler) connection string, for the hq-worker / pg-boss in BD1-04."

must_haves:
  truths:
    - "packages/hq-schema exists as a Drizzle schema workspace package consumable by apps/hq and (later) services/hq-worker"
    - "apps/hq has a db plugin that applies HQ migrations additively via runMigrations (no drizzle-kit push, no destructive SQL)"
    - "HQ connects to its OWN dedicated Neon project via DATABASE_URL env (documented, never hardcoded, never a studio Neon)"
    - "The HQ migration table namespace is distinct (hq_migrations) so it never collides with framework/staff-web migration bookkeeping"
  artifacts:
    - path: "packages/hq-schema/package.json"
      provides: "@gymos/hq-schema workspace package"
      contains: "@gymos/hq-schema"
    - path: "packages/hq-schema/src/schema.ts"
      provides: "HQ Drizzle table definitions (empty/foundation set in BD1; BD2 fills domain tables)"
    - path: "apps/hq/server/plugins/db.ts"
      provides: "runMigrations plugin for HQ Neon (additive only)"
      contains: "runMigrations"
  key_links:
    - from: "apps/hq/server/db/index.ts"
      to: "packages/hq-schema"
      via: "import * as schema from @gymos/hq-schema"
      pattern: "@gymos/hq-schema"
    - from: "apps/hq/server/plugins/db.ts"
      to: "DATABASE_URL"
      via: "Neon connection (framework createGetDb / runMigrations reads DATABASE_URL)"
      pattern: "runMigrations"
---

<objective>
Create the HQ data layer: a new workspace package `packages/hq-schema` (the HQ Drizzle schema, foundation-only in BD1 — BD2 fills the domain tables), and wire `apps/hq` to its own dedicated HQ Neon project with an additive `runMigrations` db plugin.

Purpose: Give apps/hq a database substrate that obeys the project-wide no-breaking-DB-changes rule (additive only, no drizzle-kit push) and the PII-up boundary (HQ Neon is separate from every studio Neon; HQ never holds a studio connection string). BD1-03 seeds the HQ org + super-admin into this layer; BD2 adds telemetry/provisioning tables here.
Output: packages/hq-schema package + apps/hq/server/db + apps/hq/server/plugins/db.ts (runMigrations) + documented HQ Neon env contract.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md
@.planning/research/ARCHITECTURE.md
@CLAUDE.md
@AGENTS.md

<read_first>
Bounding decisions (BD1-CONTEXT.md):
- D-07: New workspace package packages/hq-schema holds the HQ Drizzle schema (studio registry, provisioning_runs, telemetry tables land here in BD2). Added to pnpm-workspace.yaml in BD1 (NOTE: the `packages/*` glob already covers it — verify, do not duplicate).
- D-08: HQ runs against its OWN dedicated Neon project (separate from every studio Neon). Provide the connection-string env for the operator; never co-locate with a studio DB. Never hardcode the connection string.
- D-09: Schema changes are strictly additive via runMigrations in the HQ app's db plugin — no drizzle-kit push, no destructive SQL (carries the project-wide no-breaking-DB-changes rule).

Precedent to mirror EXACTLY:
- apps/staff-web/server/db/index.ts — `createGetDb(schema)` + a `db` Proxy + `export { schema }`. Mirror this shape for apps/hq.
- apps/staff-web/server/plugins/db.ts — `runMigrations([{version, sql}, ...], { table: "mail_migrations" })`. Mirror this shape but use table `"hq_migrations"`. Migrations are an ordered list of additive SQL statements (CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS). Use `intType()` from @agent-native/core/db for integer columns (matches the staff-web precedent for cross-dialect safety).
- Schema column helpers: `import { table, text, integer, real, now } from "@agent-native/core/db/schema";` (see apps/staff-web/server/db/schema.ts line 1).

Constraints from CLAUDE.md / AGENTS.md:
- NO drizzle-kit push (guard-no-drizzle-push.mjs enforces this; createDrizzleConfig throws against Neon). Migrations run via runMigrations only.
- Strictly additive SQL: no DROP/RENAME/TRUNCATE/destructive ALTER.
- PII-up boundary: do NOT add any column whose name matches *connection*/*database_url*/*dsn* (BD1-06 adds a guard that fails the build on this; design the schema to never need one — HQ stores provider resource IDs only, never studio connection strings).

No-local-dev-server constraint: verify via typecheck + grep + (optionally) a Neon MCP replay; never boot a dev server.
</read_first>

<interfaces>
From apps/staff-web/server/db/index.ts (mirror this):
```ts
import { createGetDb } from "@agent-native/core/db";
import * as schema from "./schema.js";
export const getDb = createGetDb(schema);
export const db = new Proxy({} as any, { get(_, prop) { return (getDb() as any)[prop]; } });
export { schema };
```
From apps/staff-web/server/plugins/db.ts (mirror this; change table name):
```ts
import { runMigrations, intType } from "@agent-native/core/db";
export default runMigrations(
  [ { version: 1, sql: `CREATE TABLE IF NOT EXISTS ... ` } ],
  { table: "hq_migrations" },
);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold packages/hq-schema workspace package</name>
  <read_first>apps/staff-web/server/db/schema.ts (column helper imports + table shape), packages/queue/package.json or services/worker/package.json (workspace package.json shape for an internal @gymos/* package), pnpm-workspace.yaml (confirm packages/* glob)</read_first>
  <files>packages/hq-schema/package.json, packages/hq-schema/tsconfig.json, packages/hq-schema/src/index.ts, packages/hq-schema/src/schema.ts, packages/hq-schema/src/migrations.ts</files>
  <action>
Create the packages/hq-schema workspace package:
- package.json: `"name": "@gymos/hq-schema"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`, `"main": "./src/index.ts"` (source-consumed like other internal workspace packages; no build step needed if consumers compile it — match how @gymos/queue is consumed), `"exports": { ".": "./src/index.ts", "./schema": "./src/schema.ts", "./migrations": "./src/migrations.ts" }`. Dependencies: `"drizzle-orm": "^0.45.2"`, `"@agent-native/core": "workspace:*"`. devDependencies: `"typescript": "catalog:"`, `"@types/node": "^22.0.0"`. Add a `"typecheck": "tsc --noEmit"` script.
- tsconfig.json: extend the repo's base tsconfig pattern (copy the shape from services/worker/tsconfig.json), `module`/`moduleResolution` ESM, `strict: true`, `noEmit` true for typecheck.
- src/schema.ts: HQ Drizzle table definitions. In BD1, define ONLY the foundation tables needed for HQ-FND (the HQ org + super-admin seed lands here via runMigrations in BD1-03; the framework's Better-auth user/org/session tables are framework-managed, so do NOT redefine them — instead define an `hq_app_meta` foundation table, e.g. a single-row table recording the seeded HQ org id, schema version, and `seeded_at`, that BD1-03's seed writes to and Brain/Dispatch readiness checks can read). Use `import { table, text, integer } from "@agent-native/core/db/schema";`. CRITICAL: do NOT add any column matching *connection*/*database_url*/*dsn* (PII-up guard, BD1-06).
- src/migrations.ts: export an ordered array of additive migration statements (the `{ version, sql }[]` list) that apps/hq/server/plugins/db.ts will pass to runMigrations. In BD1 this contains the foundation table(s) from schema.ts as `CREATE TABLE IF NOT EXISTS` statements. The HQ org + super-admin SEED statements are appended here in BD1-03 (leave a clearly-marked extension point comment: `// BD1-03 appends the HQ org + super-admin seed migration here`).
- src/index.ts: re-export `* from "./schema.js"` and `* from "./migrations.js"`, plus a `HQ_MIGRATIONS_TABLE = "hq_migrations"` constant.
  </action>
  <verify>
    <automated>node -e "const p=require('./packages/hq-schema/package.json'); if(p.name!=='@gymos/hq-schema') process.exit(1); console.log('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `packages/hq-schema/package.json` exists with `"name": "@gymos/hq-schema"` (grep hit) and a `drizzle-orm` dependency.
    - `packages/hq-schema/src/schema.ts`, `src/migrations.ts`, `src/index.ts` all exist.
    - No PII-shaped column: `grep -Ei "connection|database_url|dsn" packages/hq-schema/src/schema.ts` returns NOTHING (or only inside a comment forbidding them).
    - `src/migrations.ts` contains a marked extension point for the BD1-03 seed (grep: `grep -i "BD1-03" packages/hq-schema/src/migrations.ts` hits).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Wire apps/hq to packages/hq-schema (db index + runMigrations plugin)</name>
  <read_first>apps/staff-web/server/db/index.ts, apps/staff-web/server/plugins/db.ts, apps/hq/package.json (from BD1-01 — add the hq-schema dep)</read_first>
  <files>apps/hq/server/db/index.ts, apps/hq/server/db/schema.ts, apps/hq/server/plugins/db.ts, apps/hq/package.json</files>
  <action>
Wire apps/hq to the HQ schema:
- Add `"@gymos/hq-schema": "workspace:*"` to apps/hq/package.json dependencies; run `pnpm install` at repo root so the workspace link resolves.
- apps/hq/server/db/schema.ts: re-export the HQ schema — `export * from "@gymos/hq-schema/schema";` (so HQ app code imports HQ tables via the local db module, mirroring staff-web's `export { schema }` indirection). If the Brain surfaces copied in BD1-01 expect specific Brain tables, keep those Brain table definitions here too (Brain template tables are framework/Brain-managed and are fine to define locally — they are NOT PII-up-boundary-relevant since they live in HQ Neon, but still must not store studio connection strings).
- apps/hq/server/db/index.ts: mirror apps/staff-web/server/db/index.ts exactly — `createGetDb(schema)` + `db` Proxy + `export { schema }`, importing from `./schema.js`.
- apps/hq/server/plugins/db.ts: `import { runMigrations } from "@agent-native/core/db";` and `import { HQ_MIGRATIONS_TABLE, hqMigrations } from "@gymos/hq-schema";` then `export default runMigrations(hqMigrations, { table: HQ_MIGRATIONS_TABLE });`. The migration table MUST be `hq_migrations` (distinct from staff-web's `mail_migrations`) so HQ bookkeeping never collides.
- apps/hq/.env.example: document `DATABASE_URL=` (HQ Neon POOLED) and `DATABASE_URL_UNPOOLED=` (HQ Neon UNPOOLED, no -pooler) with a comment: "HQ's OWN dedicated Neon project (e.g. gymos-hq). NEVER a studio Neon. NEVER commit a real value." Do NOT hardcode any real connection string anywhere.
  </action>
  <verify>
    <automated>grep -q "hq_migrations\|HQ_MIGRATIONS_TABLE" apps/hq/server/plugins/db.ts && grep -q "runMigrations" apps/hq/server/plugins/db.ts && echo ok</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/server/plugins/db.ts` calls `runMigrations(...)` against table `hq_migrations` (grep both `runMigrations` and `hq_migrations`/`HQ_MIGRATIONS_TABLE`).
    - `apps/hq/server/db/index.ts` mirrors the staff-web `createGetDb` + Proxy shape (grep: `createGetDb` present).
    - `apps/hq/package.json` depends on `@gymos/hq-schema` (grep hit).
    - `apps/hq/.env.example` documents DATABASE_URL + DATABASE_URL_UNPOOLED with the "HQ's OWN Neon, never a studio Neon" warning (grep: `grep -i "never a studio\|own dedicated" apps/hq/.env.example` hits).
    - NO `drizzle-kit push` anywhere in apps/hq scripts (grep: `grep -r "drizzle-kit push" apps/hq` returns nothing in scripts; `db:push` may be absent entirely — preferred).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Typecheck the HQ data layer end to end</name>
  <read_first>packages/hq-schema/src/index.ts, apps/hq/server/db/index.ts, apps/hq/server/plugins/db.ts</read_first>
  <files>packages/hq-schema/src/schema.ts, apps/hq/server/db/schema.ts</files>
  <action>
Run `pnpm --filter @gymos/hq-schema typecheck` and `pnpm --filter @gymos/hq typecheck`. Resolve any type errors from the schema/db wiring (e.g. missing exports, drizzle column type mismatches, ESM import-extension issues — internal packages use `.js` import specifiers in TS ESM). Do NOT boot a dev server. If runMigrations' expected migration-list type differs from the `{ version, sql }[]` shape exported by hq-schema, adjust the hq-schema export to match the type the framework's runMigrations expects (read the runMigrations signature from @agent-native/core/db). Confirm the guard-no-drizzle-push guard still passes for the new files.
  </action>
  <verify>
    <automated>pnpm guard:no-drizzle-push</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq-schema typecheck` exits 0.
    - `pnpm --filter @gymos/hq typecheck` exits 0.
    - `pnpm guard:no-drizzle-push` exits 0 (no drizzle-kit push introduced).
  </acceptance_criteria>
</task>

</tasks>

<verification>
- packages/hq-schema is a consumable @gymos/hq-schema workspace package with foundation HQ tables + an additive migration list.
- apps/hq/server/db + apps/hq/server/plugins/db.ts wire HQ to its own Neon via runMigrations against `hq_migrations` (additive, no push).
- HQ Neon connection comes from DATABASE_URL env (documented in .env.example, never hardcoded, never a studio Neon).
- No PII-shaped (*connection*/*database_url*/*dsn*) column in hq-schema.
- Typecheck clean; guard-no-drizzle-push clean.
</verification>

<success_criteria>
HQ-FND-03 satisfied: HQ runs against its own dedicated Neon project (env-documented), schema changes apply additively via runMigrations (no drizzle-kit push, no destructive SQL), and the HQ schema package is ready for BD1-03's org/super-admin seed and BD2's domain tables.
</success_criteria>

<output>
After completion, create `.planning/phases/BD1-hq-foundation/BD1-02-SUMMARY.md`
</output>
