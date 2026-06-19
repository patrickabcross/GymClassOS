---
phase: BD2-telemetry-provisioning
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/hq-schema/src/migrations.ts
  - packages/hq-schema/src/schema.ts
  - packages/hq-schema/src/telemetry.ts
  - packages/hq-schema/src/index.ts
  - packages/hq-schema/src/telemetry.test.ts
  - apps/hq/server/db/schema.ts
autonomous: true
requirements: [TEL-04, TEL-05, TEL-06, PROV-07, PROV-08, PROV-09]
must_haves:
  truths:
    - "HQ Neon has hq_studios, hq_provisioning_runs, hq_telemetry_snapshots, hq_token_usage, hq_studio_tokens tables after runMigrations"
    - "TelemetrySnapshot Zod schema rejects any unknown/PII field at parse time (.strict())"
    - "No HQ schema column name matches *connection*/*database_url*/*dsn* (passes guard:hq-no-pii)"
  artifacts:
    - path: "packages/hq-schema/src/migrations.ts"
      provides: "Additive v4-v7 CREATE TABLE migrations for HQ domain tables"
      contains: "version: 7"
    - path: "packages/hq-schema/src/schema.ts"
      provides: "Drizzle table defs for the 5 BD2 HQ tables"
      contains: "hq_provisioning_runs"
    - path: "packages/hq-schema/src/telemetry.ts"
      provides: "Canonical TelemetrySnapshot Zod .strict() schema shared by ingest + studio push"
      exports: ["TelemetrySnapshot"]
  key_links:
    - from: "apps/hq/server/db/schema.ts"
      to: "@gymos/hq-schema"
      via: "re-export of new BD2 tables into the merged HQ db schema"
      pattern: "hqProvisioningRuns|provisioningRuns"
---

<objective>
Extend the HQ schema (packages/hq-schema) additively with the five BD2 domain tables and the canonical `TelemetrySnapshot` Zod schema. This is the foundation both the TEL and PROV tracks build on — it is the SOLE owner of `packages/hq-schema/src/*` so no other Wave-1 plan can collide on the migrations file.

Purpose: Provisioning state (runs + studio registry + per-studio token hash) and telemetry storage (snapshots + token usage) must exist before the saga (BD2-05), ingest endpoint (BD2-04), or dashboard (BD2-06) can be wired. The Zod schema is the structural PII-up boundary (D-04/D-06).
Output: v4-v7 migrations, Drizzle table defs, `telemetry.ts` schema, a passing unit test proving PII rejection, and the merged HQ db schema wiring.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md
@.planning/phases/BD2-telemetry-provisioning/BD2-RESEARCH.md

<interfaces>
<!-- Existing HQ schema patterns the executor MUST follow. -->

From packages/hq-schema/src/schema.ts — table helper import (Postgres+SQLite dual-dialect via core helpers):
```typescript
import { table, text, integer, now } from "@agent-native/core/db/schema";
export const hqAppMeta = table("hq_app_meta", {
  id: text("id").primaryKey(),
  schemaVersion: integer("schema_version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(now()),
});
```

From packages/hq-schema/src/migrations.ts — additive migration entry shape (consumed by apps/hq runMigrations):
```typescript
export type HqMigrationEntry = { version: number; sql: string | { postgres?: string; sqlite?: string }; };
export const hqMigrations: HqMigrationEntry[] = [ /* v1,v2,v3 exist; append v4-v7 */ ];
```

From apps/hq/server/db/index.ts — the merged schema consumes hq-schema via apps/hq/server/db/schema.ts:
```typescript
import * as hqSchema from "./schema.js";
export const schema = { ...dispatchSchema, ...brainSchema, ...hqSchema };
```

Canonical table SQL is in BD2-RESEARCH.md "Pattern 4" (hq_studios, hq_provisioning_runs, hq_telemetry_snapshots, hq_token_usage, hq_studio_tokens) — use it VERBATIM (column names already vetted against guard:hq-no-pii: neon_project_id / vercel_project_id / fly_app_name only, NO connection/dsn columns).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add additive v4-v7 migrations for the five HQ domain tables</name>
  <read_first>packages/hq-schema/src/migrations.ts (full — note v1-v3 exist, ON CONFLICT idempotency, the "BD2 appends version 4+" comment block), BD2-RESEARCH.md "Pattern 4: Saga State Machine Schema" (the exact SQL).</read_first>
  <files>packages/hq-schema/src/migrations.ts</files>
  <action>
    Append four migration entries to the `hqMigrations` array (do NOT modify v1/v2/v3):
    - **version 4** — `CREATE TABLE IF NOT EXISTS hq_studios` with columns: id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL (the slug UNIQUE constraint is the DB-level idempotency guard for PROV-08, Pitfall P-03), display_name TEXT NOT NULL, owner_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', plan_id TEXT, provisioned_at TEXT, created_at TEXT NOT NULL DEFAULT NOW(). Provide BOTH `postgres` and `sqlite` variants in the `{ postgres, sqlite }` object form (sqlite uses `datetime('now')` instead of `NOW()`) — match the dual-dialect pattern in v2/v3.
    - **version 5** — `CREATE TABLE IF NOT EXISTS hq_provisioning_runs` per BD2-RESEARCH Pattern 4 VERBATIM: id PK, studio_id REFERENCES hq_studios(id), status DEFAULT 'started', provider resource IDs neon_project_id / vercel_project_id / fly_app_name / subdomain (NEVER a connection string — D-13/Pitfall P-05), step_1_at..step_8_at TEXT (NULL = not run), compensation_errors TEXT NOT NULL DEFAULT '{}', started_at/completed_at/updated_at. Dual-dialect.
    - **version 6** — `CREATE TABLE IF NOT EXISTS hq_telemetry_snapshots` (id, studio_id FK, period_start, period_end, payload_json TEXT, received_at, last_telemetry_received_at, UNIQUE(studio_id, period_start)) AND `CREATE TABLE IF NOT EXISTS hq_token_usage` (studio_id FK, date, input_tokens/output_tokens/request_count INTEGER DEFAULT 0, updated_at, PRIMARY KEY(studio_id, date)). Two statements in one migration entry (separated by `;` like v2). Dual-dialect.
    - **version 7** — `CREATE TABLE IF NOT EXISTS hq_studio_tokens` (studio_id PK REFERENCES hq_studios(id), token_hash TEXT NOT NULL UNIQUE, created_at, revoked_at). Dual-dialect.
    ALL columns additive; NO column name may contain connection/database_url/dsn (guard:hq-no-pii). Use `IF NOT EXISTS` everywhere.
  </action>
  <acceptance_criteria>
    - `grep -c "version: [4567]" packages/hq-schema/src/migrations.ts` returns 4 (one each for v4,v5,v6,v7).
    - `grep -E "connection|database_url|dsn" packages/hq-schema/src/migrations.ts` returns NOTHING (case-insensitive: `grep -iE` also empty for column-name context).
    - `grep -c "CREATE TABLE IF NOT EXISTS hq_" packages/hq-schema/src/migrations.ts` returns >= 5 (5 new tables).
    - `node scripts/guard-hq-no-pii.mjs` (or `pnpm guards`) exits 0.
  </acceptance_criteria>
  <done>Five HQ domain tables created additively as v4-v7; existing v1-v3 untouched; guard:hq-no-pii passes.</done>
</task>

<task type="auto">
  <name>Task 2: Add Drizzle table definitions + barrel export + merged HQ schema wiring</name>
  <read_first>packages/hq-schema/src/schema.ts (full — the table()/text()/integer()/now() helper import + the BD2 extension-point comment), packages/hq-schema/src/index.ts (barrel re-exports), apps/hq/server/db/schema.ts (how hq-schema tables enter the merged HQ db handle), apps/hq/server/db/index.ts.</read_first>
  <files>packages/hq-schema/src/schema.ts, packages/hq-schema/src/index.ts, apps/hq/server/db/schema.ts</files>
  <action>
    In `packages/hq-schema/src/schema.ts`, add Drizzle `table(...)` definitions matching the v4-v7 SQL EXACTLY (column names → camelCase JS keys, e.g. `step1At: text("step_1_at")`, `neonProjectId: text("neon_project_id")`, `compensationErrors: text("compensation_errors").notNull().default("{}")`). Export: `hqStudios`, `hqProvisioningRuns`, `hqTelemetrySnapshots`, `hqTokenUsage`, `hqStudioTokens`. Use the same `table/text/integer/now` import already at the top of the file. integer columns (input_tokens etc.) use `.notNull().default(0)`.
    The barrel `index.ts` already does `export * from "./schema.js"` — confirm no change needed there for these (it will re-export automatically); you WILL add the telemetry export in Task 3.
    In `apps/hq/server/db/schema.ts`, ensure the new tables are re-exported so the merged `schema` in `apps/hq/server/db/index.ts` (which does `import * as hqSchema from "./schema.js"`) picks them up. If `apps/hq/server/db/schema.ts` re-exports from `@gymos/hq-schema`, the new tables flow through automatically — verify with grep; if it enumerates tables explicitly, add the five.
  </action>
  <acceptance_criteria>
    - `grep -E "hqStudios|hqProvisioningRuns|hqTelemetrySnapshots|hqTokenUsage|hqStudioTokens" packages/hq-schema/src/schema.ts` shows all five exports.
    - `grep -n "step_1_at\|neon_project_id\|fly_app_name" packages/hq-schema/src/schema.ts` confirms column-name parity with the SQL.
    - `pnpm --filter @gymos/hq-schema exec tsc --noEmit` (or root `pnpm typecheck` scoped to hq-schema) passes with no errors.
    - From repo root, `grep -rE "hqProvisioningRuns|provisioningRuns" apps/hq/server/db/` confirms the table is reachable through the merged HQ schema.
  </acceptance_criteria>
  <done>Five Drizzle tables exported from hq-schema and reachable via the merged apps/hq db schema; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Canonical TelemetrySnapshot Zod .strict() schema + PII-rejection test</name>
  <read_first>BD2-RESEARCH.md "Pattern 7: HQ Ingest Endpoint" (the fields the ingest reads: periodStart, periodEnd, llmInputTokens, llmOutputTokens, llmRequestCount) and "Pattern 9 → What CAN be unit-tested" (Zod strict rejection), BD2-CONTEXT.md D-02 (aggregate metrics list: active members, bookings, messages sent, mobile-app engagement, retention rate), BD1-ANTHROPIC-AUDIT.md §2.4 (MUST-capture vs MUST-NOT-capture field lists).</read_first>
  <files>packages/hq-schema/src/telemetry.ts, packages/hq-schema/src/telemetry.test.ts, packages/hq-schema/src/index.ts</files>
  <behavior>
    - A valid snapshot (all aggregate fields: studioId, periodStart, periodEnd ISO strings; llmInputTokens/llmOutputTokens/llmRequestCount; activeMembers, bookings, messagesSent, retentionRate, mobileEngagement — all numbers) parses successfully.
    - `TelemetrySnapshot.strict().safeParse({ ...valid, member_email: "x@y.com" })` returns `success: false` (PII field structurally rejected — Pitfall P-06).
    - `TelemetrySnapshot.strict().safeParse({ ...valid, memberName: "Bob" })` returns `success: false`.
    - A snapshot missing a required count field returns `success: false`.
    - Negative counts rejected (`.int().nonnegative()` / `.min(0)`); a rate outside 0..1 rejected.
  </behavior>
  <action>
    Create `packages/hq-schema/src/telemetry.ts` exporting `TelemetrySnapshot` — a `z.object({...})` allow-list of ONLY aggregate counts/rates/timestamps (no names/emails/phones/content; see BD1-ANTHROPIC-AUDIT §2.4 MUST-NOT list). Fields: `studioId: z.string().min(1)`, `periodStart`/`periodEnd: z.string()` (ISO; use `.datetime()` if push job emits RFC3339, else `.min(1)` — document the choice), token aggregates `llmInputTokens`/`llmOutputTokens`/`llmRequestCount: z.number().int().nonnegative()`, engagement aggregates `activeMembers`/`bookings`/`messagesSent`/`mobileEngagement: z.number().int().nonnegative()`, `retentionRate: z.number().min(0).max(1)`. Export the type `TelemetrySnapshotInput = z.infer<typeof TelemetrySnapshot>`. Do NOT call `.strict()` on the export itself — callers apply `.strict()` at the ingest boundary (so the schema stays composable); but the test MUST prove `.strict()` rejects extras. Add `export * from "./telemetry.js"` to `packages/hq-schema/src/index.ts`.
    Write `telemetry.test.ts` (vitest) implementing the five behaviors above.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq-schema test -- telemetry</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq-schema test -- telemetry` passes (all 5 behavior cases green).
    - `grep -n "export.*TelemetrySnapshot" packages/hq-schema/src/index.ts` confirms barrel export.
    - The test file contains an assertion that `.strict().safeParse({...valid, member_email})` has `success === false`.
  </acceptance_criteria>
  <done>TelemetrySnapshot schema exists, is barrel-exported, and a passing test proves .strict() structurally rejects PII fields (D-04/D-06).</done>
</task>

</tasks>

<verification>
- v4-v7 migrations are additive (CREATE TABLE IF NOT EXISTS only); v1-v3 byte-for-byte unchanged.
- `pnpm guards` passes (guard:hq-no-pii green — no connection/dsn columns).
- `pnpm --filter @gymos/hq-schema test` and tsc both pass.
- The five tables are reachable through `apps/hq/server/db/index.ts`'s merged `schema`.
</verification>

<success_criteria>
- The five BD2 HQ tables exist as additive migrations + Drizzle defs.
- TelemetrySnapshot Zod schema rejects PII under `.strict()` (proven by test).
- HQ schema still passes guard:hq-no-pii.
</success_criteria>

<output>
After completion, create `.planning/phases/BD2-telemetry-provisioning/BD2-01-SUMMARY.md`
</output>
