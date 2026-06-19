---
phase: BD2-telemetry-provisioning
plan: "03"
subsystem: studio-telemetry
tags: [telemetry, token-usage, trigger, postgres, drizzle, pii-free, tdd]
requirements: [TEL-01, TEL-02]
depends_on: []
provides: [studio_telemetry_state, accumulate_token_usage_trigger, buildTelemetrySnapshot]
affects: [BD2-04-telemetry-push-job]
tech_stack:
  added: ["@gymos/hq-schema dep in @gymos/worker"]
  patterns: [pg-AFTER-INSERT-trigger, drizzle-mirror, tdd-red-green]
key_files:
  created:
    - services/worker/src/domain/buildTelemetrySnapshot.ts
    - services/worker/src/domain/buildTelemetrySnapshot.test.ts
  modified:
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/server/db/schema.ts
    - services/worker/src/lib/db.ts
    - services/worker/package.json
decisions:
  - "studio_telemetry_state uses TEXT for updated_at to match existing studio schema convention (not INTEGER epoch)"
  - "Trigger creation wrapped in DO $$ IF NOT EXISTS pg_trigger block — no DROP, additive only (CLAUDE.md)"
  - "mobileEngagement proxy = food_entries COUNT (mobile-app-only table in studio schema; BD3 may refine)"
  - "retentionRate approximation = distinct bookers this window / prior window (documented proxy, not exact cohort intersection)"
  - "buildTelemetrySnapshot signature takes a pre-read state row to avoid read-then-read race in the push job"
  - "@gymos/hq-schema added as workspace dep to services/worker (Rule-3 auto-fix: missing dep blocked typecheck)"
metrics:
  duration_seconds: 975
  completed_date: "2026-06-19"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 4
---

# Phase BD2 Plan 03: Studio-Side Telemetry Capture Summary

**One-liner:** Postgres AFTER INSERT trigger on `token_usage` accumulates into `studio_telemetry_state` singleton (fork-safe, zero core edits); `buildTelemetrySnapshot` computes PII-free aggregate engagement/retention counts matching the TelemetrySnapshot allow-list exactly.

## What Was Built

### Task 1 — Studio migration: studio_telemetry_state + trigger

Added two migrations to `apps/staff-web/server/plugins/db.ts` (versions 14 and 15):

**v14 — `studio_telemetry_state` table:** Singleton row (`id='singleton'`) that accumulates token usage since the last telemetry push. Columns: `token_usage_today_input`, `token_usage_today_output`, `request_count_today`, `outbound_sent_today`, `outbound_failed_today`, `last_push_at`, `last_push_status`, `updated_at`.

**v15 — `accumulate_token_usage()` trigger:** Postgres `AFTER INSERT ON token_usage` trigger that upserts the singleton row using `ON CONFLICT (id) DO UPDATE SET ... + EXCLUDED.*`. Entirely fork-safe — zero `@agent-native/core` modifications. Idempotency: wrapped in `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_token_usage_accumulate') THEN CREATE TRIGGER … END $$` so re-running the migration is a no-op. No DROP TRIGGER / DROP FUNCTION anywhere (CLAUDE.md additive-only constraint enforced).

### Task 2 — Drizzle schema mirrors

- `apps/staff-web/server/db/schema.ts`: Added `studioTelemetryState` table declaration using the existing `table/text/integer` helpers from `@agent-native/core/db/schema`.
- `services/worker/src/lib/db.ts`: Added `pgTable("studio_telemetry_state", {...})` mirror (pg-core direct, following the existing KEEP IN SYNC pattern); added `studioTelemetryState` to the `schema` export object so the BD2-04 push job can `db.select().from(schema.studioTelemetryState)`.

### Task 3 — buildTelemetrySnapshot (TDD)

**File:** `services/worker/src/domain/buildTelemetrySnapshot.ts`

`buildTelemetrySnapshot(db, studioId, state)` issues 6 raw SQL COUNT aggregates:
1. `activeMembers` — `COUNT(DISTINCT member_id) FROM bookings WHERE status != 'cancelled'` in window
2. `bookings` — `COUNT(*) FROM bookings` in window
3. `messagesSent` — `COUNT(*) FROM messages WHERE direction='out'` in window
4. `mobileEngagement` — `COUNT(*) FROM food_entries` in window (mobile-only signal)
5/6. Retention current vs prior window distinct member counts → `retentionRate` clamped to [0,1], 0 on zero denominator

The returned object has EXACTLY the 11 keys of `TelemetrySnapshot` from `@gymos/hq-schema/telemetry`. No extra keys. No PII columns ever selected.

**Tests:** 6 passing — key allow-list exact match, llm* from state, non-negative integer engagement values, zero-denominator safety, PII-free JSON output, period bound formats.

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| `grep studio_telemetry_state apps/staff-web/server/plugins/db.ts` confirms table | PASS |
| `grep AFTER INSERT ON token_usage` confirms trigger | PASS |
| `grep -niE "DROP TRIGGER\|DROP FUNCTION\|DROP TABLE"` returns nothing (comments only) | PASS |
| `grep pg_trigger WHERE tgname` confirms idempotent trigger creation | PASS |
| `guard-no-drizzle-push` passes | PASS |
| `studioTelemetryState` in staff-web schema + worker schema export | PASS |
| Worker typecheck (`tsc --noEmit`) passes | PASS |
| `pnpm --filter @gymos/worker test -- buildTelemetrySnapshot` 6/6 green | PASS |
| `grep -niE "first_name\|last_name\|email\|phone_e164\|\.body" buildTelemetrySnapshot.ts` comment-only | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing @gymos/hq-schema dependency in services/worker**
- **Found during:** Task 3 (typecheck after implementing buildTelemetrySnapshot)
- **Issue:** `tsc --noEmit` failed with TS2307: Cannot find module '@gymos/hq-schema/telemetry'. The worker's package.json did not declare the hq-schema workspace package as a dependency.
- **Fix:** Added `"@gymos/hq-schema": "workspace:*"` to dependencies in `services/worker/package.json`, ran `pnpm install` to symlink it.
- **Files modified:** `services/worker/package.json`
- **Commit:** bf208f6a

## Known Stubs

None. All data flows are wired: trigger accumulates into the state table; buildTelemetrySnapshot reads aggregate SQL and returns the allow-list shape. The BD2-04 push job (next plan) will call buildTelemetrySnapshot and POST to HQ.

## Deferred Items

**Live DB apply is deferred-on-external-dependency.** The studio migration (versions 14+15) runs when `runMigrations` executes against a studio Neon at provisioning time (BD2-05/06 saga Step 2). The gymos-demo Neon does NOT have the trigger installed yet — applies automatically on next worker restart after provisioning flows through the saga. No manual action required before BD2-04.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| apps/staff-web/server/plugins/db.ts | FOUND |
| apps/staff-web/server/db/schema.ts | FOUND |
| services/worker/src/lib/db.ts | FOUND |
| services/worker/src/domain/buildTelemetrySnapshot.ts | FOUND |
| services/worker/src/domain/buildTelemetrySnapshot.test.ts | FOUND |
| Commit ede2fe17 (migration) | FOUND |
| Commit 8f50766e (schema mirrors) | FOUND |
| Commit bf208f6a (snapshot + tests) | FOUND |
