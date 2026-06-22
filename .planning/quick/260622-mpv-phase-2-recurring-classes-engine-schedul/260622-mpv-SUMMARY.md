---
phase: quick
plan: 260622-mpv
subsystem: schedule/recurrence
tags: [recurring-classes, DST, materialiser, schedule-rule, UI]
dependency-graph:
  requires: [quick-260622-lp3]
  provides: [recurring-class-engine, schedule-rule-actions, repeat-weekly-ui]
  affects: [apps/staff-web, services/worker, packages/queue]
tech-stack:
  added: []
  patterns:
    - "DST-correct UTC conversion via Intl.DateTimeFormat timeZoneName:'shortOffset'"
    - "Partial unique index + ON CONFLICT DO NOTHING for idempotent materialiser inserts"
    - "pg-boss boss.work() before boss.schedule() for consumer-first registration"
    - "Cross-package pure utility copy (server/lib/recurrence-generator.ts) to avoid cross-package import"
key-files:
  created:
    - apps/staff-web/server/db/schema.ts (classScheduleRules table + ruleId on classOccurrences)
    - apps/staff-web/server/lib/recurrence-generator.ts
    - apps/staff-web/actions/create-schedule-rule.ts
    - apps/staff-web/actions/update-schedule-rule.ts
    - apps/staff-web/actions/deactivate-schedule-rule.ts
    - services/worker/src/domain/recurrence-generator.ts
    - services/worker/src/domain/recurrence-generator.test.ts
    - services/worker/src/queues/materialize-class-occurrences.ts
  modified:
    - apps/staff-web/server/plugins/db.ts (migrations v27-v30)
    - apps/staff-web/server/plugins/agent-chat.ts (two-exposure Schedule section)
    - apps/staff-web/AGENTS.md (three new action rows + MPV two-exposure note)
    - apps/staff-web/app/components/gymos/NewClassDialog.tsx (Repeat weekly toggle)
    - services/worker/src/lib/db.ts (classScheduleRules + classOccurrences + durationMin)
    - services/worker/src/index.ts (registerMaterializeClassOccurrences)
    - packages/queue/src/types.ts (CLASS_MATERIALIZE queue name)
decisions:
  - "DST conversion uses Intl.DateTimeFormat shortOffset string parse — zero deps, works in Node 22+"
  - "ON CONFLICT DO NOTHING via .onConflictDoNothing() (Drizzle) backed by partial unique index — avoids db.execute() which is not on LibSQL Drizzle type"
  - "recurrence-generator.ts copied to server/lib/ (not imported from services/worker) — cross-package imports are forbidden at runtime in this monorepo structure"
  - "Rule identity fields (definitionId, daysOfWeek, startsOn) are immutable after creation — must deactivate+recreate to change series identity"
metrics:
  duration: ~2 sessions (context compaction mid-task-4)
  completed: 2026-06-22
  tasks-completed: 5
  files-changed: 14
---

# Phase quick Plan 260622-mpv: Recurring Classes Engine Summary

DST-correct weekly recurring class rules with nightly materialiser, three agent actions, and "Repeat weekly" toggle in NewClassDialog.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Schema migrations v27-v30 | ab6f5676 | server/plugins/db.ts, server/db/schema.ts, services/worker/src/lib/db.ts |
| 2 | TDD DST-correct recurrence generator | c496c173 | services/worker/src/domain/recurrence-generator.ts + .test.ts |
| 3 | Worker nightly materialiser | 9b86ad3d | services/worker/src/queues/materialize-class-occurrences.ts, index.ts, packages/queue/src/types.ts |
| 4 | Three schedule-rule actions + two-exposure | bd14a081 | actions/create-schedule-rule.ts, update-schedule-rule.ts, deactivate-schedule-rule.ts, server/lib/recurrence-generator.ts, agent-chat.ts, AGENTS.md |
| 5 | Repeat weekly toggle in NewClassDialog | 9120b7bf | app/components/gymos/NewClassDialog.tsx |

## What Was Built

### Schema (migrations v27-v30)

- **v27** — `class_schedule_rules` table: id, definition_id, days_of_week (JSON TEXT), time_of_day (HH:MM local), location, capacity, trainer_id, starts_on, ends_on, active, generated_through (cursor), created_at
- **v28** — `ALTER TABLE class_occurrences ADD COLUMN rule_id TEXT` (nullable; null = manual one-off)
- **v29** — `CREATE UNIQUE INDEX idx_class_occurrences_rule_starts ON class_occurrences (rule_id, starts_at) WHERE rule_id IS NOT NULL` — partial index that backs idempotent `ON CONFLICT DO NOTHING` inserts
- **v30** — `CREATE INDEX idx_schedule_rules_active ON class_schedule_rules (active, starts_on)` — cron query fast path

### Recurrence Generator (DST-correct)

`services/worker/src/domain/recurrence-generator.ts` — pure function, no DB, no external dependencies.

DST algorithm: build "naive UTC" treating studio-local HH:MM as if it were UTC, then look up the `Europe/London` UTC offset at that instant via `Intl.DateTimeFormat({ timeZoneName: 'shortOffset' })`, parse "GMT±N" string to minutes, subtract to get true UTC.

- 2026-07-06 18:00 BST → `2026-07-06T17:00:00.000Z` (BST = UTC+1)
- 2026-01-05 18:00 GMT → `2026-01-05T18:00:00.000Z` (GMT = UTC+0)

All 5 TDD cases pass. 143 tests pass across 20 files.

### Nightly Materialiser (Worker)

`services/worker/src/queues/materialize-class-occurrences.ts` — pg-boss consumer + cron schedule at 04:00 UTC daily.

- Reads all active rules (`active = 1`)
- Generates occurrences for the next 56 days (8-week rolling window) per rule
- Inserts via `ON CONFLICT DO NOTHING` — idempotent (backed by partial unique index v29)
- Advances `generated_through` cursor after each rule
- Gracefully skips rules whose class definition is inactive
- Logs `{rulesProcessed, totalInserted, totalSkipped}` on each run

### Three Agent Actions

All DIRECT (no propose-action gate), two-exposed in agent-chat.ts Schedule section + AGENTS.md table.

- **create-schedule-rule** — inserts rule AND immediately generates the first 8-week window so occurrences are visible without waiting for the 04:00 cron
- **update-schedule-rule** — partial patch on mutable fields (timeOfDay, location, capacity, trainerId, endsOn); identity fields cannot be changed
- **deactivate-schedule-rule** — sets active=false; preserves existing occurrences

### UI — Repeat Weekly Toggle

`NewClassDialog.tsx` gains:
- A `Switch` labelled "Repeat weekly" with a `IconRepeat` icon
- When on: 7 circular day buttons (Su/Mo/Tu/We/Th/Fr/Sa) — `aria-pressed` for accessibility
- Date/time field label adapts to "Start date & time"; Room field is hidden (not applicable to rules)
- Submit button label adapts: "Schedule class" vs "Create recurring schedule"
- Toast confirms occurrences generated: "Recurring schedule created — N occurrences generated"
- `useActionMutation("create-schedule-rule")` added; pending state covers all 3 mutations

## Verify Gate Results

```
cd apps/staff-web && pnpm typecheck  → exit 0 (no errors)
cd services/worker && pnpm typecheck  → exit 0
cd services/worker && pnpm build      → exit 0
cd services/worker && pnpm test       → 143 passed (20 files) — all 5 recurrence-generator cases pass
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] db.execute() type error on LibSQL**
- **Found during:** Task 4 (first typecheck after writing create-schedule-rule.ts)
- **Issue:** `db.execute(sql\`...\`)` is not on the `LibSQLDatabase` type — the dev DB is LibSQL and Drizzle's LibSQL adapter doesn't expose `.execute()` directly
- **Fix:** Replaced raw SQL INSERT with `db.insert(schema.classOccurrences).values({...}).onConflictDoNothing()` — Drizzle's typed insert with `.onConflictDoNothing()` is cross-dialect and backed by the same partial unique index in both SQLite and Postgres
- **Files modified:** apps/staff-web/actions/create-schedule-rule.ts
- **Commit:** bd14a081

**2. [Rule 3 - Blocking] Cross-package import would fail at runtime**
- **Found during:** Task 4 (code review before typecheck)
- **Issue:** create-schedule-rule.ts initially imported `generateOccurrences` from `../../services/worker/src/domain/recurrence-generator.js` — this import path traverses outside the `apps/staff-web` package and would not resolve at runtime in Vercel's bundling
- **Fix:** Copied `recurrence-generator.ts` to `apps/staff-web/server/lib/recurrence-generator.ts` and updated the import
- **Files modified:** apps/staff-web/server/lib/recurrence-generator.ts (new), apps/staff-web/actions/create-schedule-rule.ts (import path)
- **Commit:** bd14a081

## Known Stubs

None. All data flows are wired: rules → occurrences → schedule UI (via existing `list-classes` / schedule loaders that already query `class_occurrences`). The repeat-weekly submit path calls `create-schedule-rule` which immediately generates occurrences.

## DB Changes (Additive Only)

| Version | Statement | Additive? |
|---------|-----------|-----------|
| v27 | CREATE TABLE IF NOT EXISTS class_schedule_rules | Yes |
| v28 | ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS rule_id TEXT | Yes |
| v29 | CREATE UNIQUE INDEX IF NOT EXISTS idx_class_occurrences_rule_starts ... WHERE rule_id IS NOT NULL | Yes |
| v30 | CREATE INDEX IF NOT EXISTS idx_schedule_rules_active | Yes |

No DROP, no TRUNCATE, no RENAME. All additive.
