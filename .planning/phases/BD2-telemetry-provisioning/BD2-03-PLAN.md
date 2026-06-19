---
phase: BD2-telemetry-provisioning
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/plugins/db.ts
  - apps/staff-web/server/db/schema.ts
  - services/worker/src/lib/db.ts
  - services/worker/src/domain/buildTelemetrySnapshot.ts
  - services/worker/src/domain/buildTelemetrySnapshot.test.ts
autonomous: true
requirements: [TEL-01, TEL-02]
must_haves:
  truths:
    - "Every token_usage INSERT in a studio Neon accumulates input/output token + request counts into the studio_telemetry_state singleton (via AFTER INSERT trigger)"
    - "buildTelemetrySnapshot computes PII-free aggregate engagement/retention metrics from studio tables (counts/rates only)"
    - "No member name/email/phone/message content is read into any telemetry value"
  artifacts:
    - path: "apps/staff-web/server/plugins/db.ts"
      provides: "Additive migration: studio_telemetry_state table + accumulate_token_usage() trigger on token_usage"
      contains: "accumulate_token_usage"
    - path: "services/worker/src/domain/buildTelemetrySnapshot.ts"
      provides: "Aggregate engagement/retention SQL builder returning a TelemetrySnapshot-shaped object"
      exports: ["buildTelemetrySnapshot"]
  key_links:
    - from: "token_usage INSERT (recordUsage in @agent-native/core)"
      to: "studio_telemetry_state singleton"
      via: "Postgres AFTER INSERT trigger (fork-safe, no core modification)"
      pattern: "AFTER INSERT ON token_usage"
---

<objective>
Studio-side telemetry CAPTURE (TEL-01, TEL-02). Install — via an additive studio migration — the `studio_telemetry_state` singleton + an `AFTER INSERT` trigger on `token_usage` that accumulates token counts (the fork-safe Option A from BD1-ANTHROPIC-AUDIT, requiring ZERO `@agent-native/core` changes). Then build the aggregate engagement/retention SQL (`buildTelemetrySnapshot`) that the BD2-04 push job will serialize and POST to HQ.

Purpose: HQ can only see aggregate, PII-free telemetry. This plan is where the counts are produced inside the studio deploy. The trigger is installed into every provisioned studio Neon at provisioning Step 3 (BD2-05/06 run studio migrations against the new Neon), so this migration lives in the studio migration list.
Output: studio migration (table + trigger), the snapshot builder + a unit test proving aggregates are counts-only, and the worker-side schema mirror for the new table.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md
@.planning/phases/BD2-telemetry-provisioning/BD2-RESEARCH.md
@.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md

<interfaces>
<!-- Studio migrations are an inline runMigrations array in apps/staff-web/server/plugins/db.ts. Latest version is 13 → append 14+. -->
From apps/staff-web/server/plugins/db.ts:
```typescript
import { runMigrations, intType } from "@agent-native/core/db";
export default runMigrations([ /* versions 1..13 exist; append 14+ */ ], { table: "mail_migrations" });
```

<!-- The accumulator SQL is in BD2-RESEARCH.md "Pattern 5: Token-Usage Accumulator (TEL-01)" Option A — use it VERBATIM. -->
<!-- token_usage is created by @agent-native/core's recordUsage path (BD1-ANTHROPIC-AUDIT §1.5); it has input_tokens / output_tokens columns. The trigger references those. -->

From services/worker/src/lib/db.ts — the worker mirrors studio tables it reads with drizzle-orm/pg-core directly (NOT @agent-native/core helpers, which resolve to SQLite types). Mirror studio_telemetry_state here the same way.

Studio domain tables available for aggregates (from apps/staff-web/AGENTS.md Data Sources): gym_members, bookings, class_occurrences, messages (direction in/out), passes, stripe_subscriptions. retention proxy = members with a booking in window / total active members.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Studio migration — studio_telemetry_state singleton + AFTER INSERT trigger on token_usage</name>
  <read_first>apps/staff-web/server/plugins/db.ts (full — confirm latest version number, the runMigrations array shape, intType() usage), BD2-RESEARCH.md "Pattern 5" Option A (the exact CREATE FUNCTION accumulate_token_usage + CREATE TRIGGER SQL), BD1-ANTHROPIC-AUDIT §1.5 (token_usage table is created by core's recordUsage; has input_tokens/output_tokens), §2.6 risk #1 (aborted-run partial rows still fire the trigger — acceptable).</read_first>
  <files>apps/staff-web/server/plugins/db.ts</files>
  <action>
    Append two new migration versions to the studio `runMigrations` array (do NOT touch 1-13; additive only):
    - **next version (14)** — `CREATE TABLE IF NOT EXISTS studio_telemetry_state` (singleton): `id TEXT PRIMARY KEY` (always 'singleton'), `token_usage_today_input INTEGER NOT NULL DEFAULT 0`, `token_usage_today_output INTEGER NOT NULL DEFAULT 0`, `request_count_today INTEGER NOT NULL DEFAULT 0`, plus reset/push bookkeeping columns the BD2-04 push job needs: `outbound_sent_today INTEGER NOT NULL DEFAULT 0`, `outbound_failed_today INTEGER NOT NULL DEFAULT 0`, `last_push_at TEXT`, `last_push_status TEXT`, `updated_at TEXT NOT NULL DEFAULT NOW()`. Use `intType()` if the file's pattern requires it for Postgres/SQLite parity (this studio DB is Postgres/Neon — but follow the file's existing dual-dialect convention; if entries are plain Postgres SQL, match that).
    - **next version (15)** — the `CREATE OR REPLACE FUNCTION accumulate_token_usage()` + `CREATE TRIGGER trg_token_usage_accumulate AFTER INSERT ON token_usage FOR EACH ROW EXECUTE FUNCTION accumulate_token_usage()` from BD2-RESEARCH Pattern 5 Option A VERBATIM. The function does an `INSERT ... ON CONFLICT (id) DO UPDATE` accumulating NEW.input_tokens / NEW.output_tokens / +1 request into the singleton. CRITICAL: this is plpgsql — it can ONLY run on Postgres. Guard for the SQLite dev path: wrap in the `{ postgres: "...", sqlite: "-- no-op: triggers are postgres-only in studio deploys" }` dual form so SQLite dev/test does not error. Use `CREATE OR REPLACE FUNCTION` (idempotent) and make the trigger creation idempotent (drop-if-exists is destructive — instead use `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_token_usage_accumulate') THEN CREATE TRIGGER ...; END IF; END $$;` so re-running the migration is safe and additive, never a destructive drop).
    NEVER use DROP TRIGGER / DROP FUNCTION (destructive — CLAUDE.md). The IF NOT EXISTS guard + CREATE OR REPLACE keep it additive.
  </action>
  <acceptance_criteria>
    - `grep -n "studio_telemetry_state" apps/staff-web/server/plugins/db.ts` confirms the table migration.
    - `grep -n "AFTER INSERT ON token_usage\|accumulate_token_usage" apps/staff-web/server/plugins/db.ts` confirms function + trigger.
    - `grep -niE "DROP TRIGGER|DROP FUNCTION|DROP TABLE|TRUNCATE" apps/staff-web/server/plugins/db.ts` returns NOTHING.
    - `grep -n "pg_trigger WHERE tgname" apps/staff-web/server/plugins/db.ts` confirms idempotent (non-destructive) trigger creation.
    - `pnpm guards` passes (guard-no-drizzle-push + additive checks).
  </acceptance_criteria>
  <done>studio_telemetry_state + the fork-safe accumulate trigger are installed additively and idempotently in the studio migration list; no @agent-native/core file touched.</done>
</task>

<task type="auto">
  <name>Task 2: Mirror studio_telemetry_state in staff-web Drizzle schema + worker pg mirror</name>
  <read_first>apps/staff-web/server/db/schema.ts (find how existing tables are declared — the @agent-native/core/db/schema helpers), services/worker/src/lib/db.ts (full — the pg-core mirror pattern + the `schema` export object + the "KEEP IN SYNC" deviation comment).</read_first>
  <files>apps/staff-web/server/db/schema.ts, services/worker/src/lib/db.ts</files>
  <action>
    Add `studio_telemetry_state` as a Drizzle table in BOTH places, matching the migration columns exactly:
    - `apps/staff-web/server/db/schema.ts`: declare it with the same `table/text/integer` helpers the file already uses (so staff-web routes/actions can read it if needed). Export it from the file's schema barrel/object.
    - `services/worker/src/lib/db.ts`: add a `pgTable("studio_telemetry_state", {...})` mirror (camelCase keys → snake_case columns: tokenUsageTodayInput: integer("token_usage_today_input"), etc.) and ADD it to the exported `schema` object so the BD2-04 push job can `db.select().from(schema.studioTelemetryState)` and reset it.
    Both follow the existing "KEEP IN SYNC" convention.
  </action>
  <acceptance_criteria>
    - `grep -n "studio_telemetry_state\|studioTelemetryState" apps/staff-web/server/db/schema.ts` shows the table + export.
    - `grep -n "studioTelemetryState" services/worker/src/lib/db.ts` shows the pg mirror AND its membership in the `schema = { ... }` export object.
    - `pnpm --filter @gymos/worker exec tsc --noEmit` (or the worker's typecheck) passes.
  </acceptance_criteria>
  <done>studio_telemetry_state is a typed Drizzle table in both staff-web and the worker mirror; both typecheck.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: buildTelemetrySnapshot — PII-free aggregate engagement/retention SQL</name>
  <read_first>BD2-CONTEXT.md D-02 (aggregate metrics: active members, bookings, messages sent, mobile-app engagement, retention rate — counts/rates only), packages/hq-schema/src/telemetry.ts field names (after BD2-01: studioId, periodStart, periodEnd, llmInputTokens/Output/RequestCount, activeMembers, bookings, messagesSent, mobileEngagement, retentionRate) — match these EXACTLY so the BD2-04 POST body validates against TelemetrySnapshot, services/worker/src/lib/db.ts (getDb + schema), apps/staff-web/AGENTS.md Data Sources table (gym_members, bookings, messages, passes).</read_first>
  <files>services/worker/src/domain/buildTelemetrySnapshot.ts, services/worker/src/domain/buildTelemetrySnapshot.test.ts</files>
  <behavior>
    - Given a mocked db returning fixed counts + a studio_telemetry_state row, `buildTelemetrySnapshot(db, studioId, state)` returns an object whose keys are EXACTLY the TelemetrySnapshot allow-list (studioId, periodStart, periodEnd, llmInputTokens, llmOutputTokens, llmRequestCount, activeMembers, bookings, messagesSent, mobileEngagement, retentionRate) — no extra keys.
    - llm* values come from the passed `state` (token_usage_today_input/output, request_count_today).
    - Every engagement value is a non-negative integer; retentionRate is 0..1.
    - The returned object contains NO member name/email/phone/message-body value (assert the snapshot is JSON-stringifiable and contains none of the seeded PII strings the test injects into the mock member rows).
  </behavior>
  <action>
    Create `buildTelemetrySnapshot(db, studioId, state)` returning the TelemetrySnapshot-shaped object. Use Drizzle `count()` / SQL aggregate queries (NEVER select PII columns): activeMembers = count of gym_members with a booking in the last 30d (or members with active pass); bookings = count of bookings in window; messagesSent = count of messages WHERE direction='out' in window; mobileEngagement = a count proxy (e.g. distinct members with a booking via mobile / or food_entries count — pick a documented count proxy, counts only); retentionRate = (members active this window who were also active prior window) / (prior-window active), clamped 0..1, default 0 when denominator is 0. periodStart/periodEnd = window bounds as ISO strings. llm* from `state`. Return ONLY allow-list keys.
    Write `buildTelemetrySnapshot.test.ts` mocking `getDb`/the db with fixed aggregate results and a state row, implementing the four behaviors.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test -- buildTelemetrySnapshot</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/worker test -- buildTelemetrySnapshot` passes (4 behavior cases green).
    - The test asserts the returned object's keys are a subset of the TelemetrySnapshot allow-list (no extra keys).
    - The test asserts no injected PII string appears in `JSON.stringify(snapshot)`.
    - `grep -niE "first_name|last_name|email|phone_e164|\.body" services/worker/src/domain/buildTelemetrySnapshot.ts` returns NOTHING (no PII columns selected).
  </acceptance_criteria>
  <done>buildTelemetrySnapshot emits exactly the aggregate allow-list, counts/rates only, with a passing test proving no PII leaks into the snapshot.</done>
</task>

</tasks>

<verification>
- Studio migration installs the table + trigger additively and idempotently (no destructive SQL); `pnpm guards` passes.
- studio_telemetry_state typed in staff-web + worker mirror; both typecheck.
- buildTelemetrySnapshot test green; snapshot keys match TelemetrySnapshot allow-list; zero PII.
</verification>

<success_criteria>
- TEL-01: token usage accumulates into studio_telemetry_state via fork-safe trigger (no core edit).
- TEL-02: aggregate PII-free engagement/retention metrics computed by buildTelemetrySnapshot.
</success_criteria>

<output>
After completion, create `.planning/phases/BD2-telemetry-provisioning/BD2-03-SUMMARY.md`
</output>
