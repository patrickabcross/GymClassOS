---
phase: quick-260622-mpv
plan: 01
type: auto
autonomous: true
depends_on: [260622-lp3]
---

# Phase 2 — Recurring Classes Engine

## Objective

Build the recurrence engine: schema (class_schedule_rules + rule_id on class_occurrences), DST-correct generator lib (TDD), nightly worker job, three actions (create/update/deactivate-schedule-rule), and UI toggle in NewClassDialog to create recurring rules instead of single occurrences.

## Context

- Phase spec: `.planning/SESSION-2026-06-22-recurring-classes-handoff.md`
- Phase 1 (trainers) is DONE — see 260622-lp3 SUMMARY.
- Latest migration version = 26. Phase 2 starts at v27.
- Worker pattern: housekeeping.ts (register consumer FIRST, then schedule).
- Worker DB mirror: services/worker/src/lib/db.ts — must be updated in sync with schema.ts.

## Tasks

### Task 1 — Schema: class_schedule_rules + rule_id on class_occurrences (type="auto")

**Goal:** Add migrations v27–v30 to `apps/staff-web/server/plugins/db.ts` and corresponding Drizzle defs to `apps/staff-web/server/db/schema.ts`.

Migrations (additive only, no DROP/RENAME):
- v27: CREATE TABLE IF NOT EXISTS class_schedule_rules (id TEXT PK, definition_id TEXT NOT NULL, days_of_week TEXT NOT NULL — JSON array of 0-6, time_of_day TEXT NOT NULL — "HH:MM" studio-local, location TEXT, capacity INTEGER NOT NULL DEFAULT 12, trainer_id TEXT, starts_on TEXT NOT NULL — ISO date, ends_on TEXT — null = open-ended, active INTEGER NOT NULL DEFAULT 1, generated_through TEXT — date cursor, created_at TEXT NOT NULL DEFAULT (datetime('now')))
- v28: ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS rule_id TEXT
- v29: CREATE UNIQUE INDEX IF NOT EXISTS idx_class_occurrences_rule_starts ON class_occurrences (rule_id, starts_at) WHERE rule_id IS NOT NULL
  (NOTE: Postgres supports partial indexes with WHERE; SQLite also supports partial indexes. This is safe for both dialects.)
- v30: CREATE INDEX IF NOT EXISTS idx_schedule_rules_active ON class_schedule_rules (active, starts_on)

Drizzle defs in schema.ts:
- Export `classScheduleRules` table (mirrors DDL)
- Add `ruleId: text("rule_id")` nullable to `classOccurrences`
- Mirror both in `services/worker/src/lib/db.ts` for the worker job

**Verify:** `cd apps/staff-web && pnpm typecheck` exits 0.

**Done criteria:** v27-v30 present in db.ts; classScheduleRules exported from schema.ts; ruleId on classOccurrences in schema.ts; same in worker db.ts.

### Task 2 — DST-correct recurrence generator (TDD, type="auto", tdd="true")

**Goal:** `services/worker/src/domain/recurrence-generator.ts` — pure function `generateOccurrences(rule, windowEndDate)` that returns ISO UTC instants correctly handling Europe/London DST.

**Behavior:**
- Input: a rule (definition_id, days_of_week: number[], time_of_day: "HH:MM", starts_on: ISO date, ends_on?: ISO date, generated_through?: ISO date)
- Window: from `max(rule.starts_on, rule.generated_through ?? rule.starts_on)` to `windowEndDate`
- For each date in the window where `date.getDay()` (0=Sun … 6=Sat) is in `days_of_week`:
  - Convert "HH:MM" + date in Europe/London TZ to UTC using `Intl.DateTimeFormat` offset method
  - Return ISO UTC string
- Returns `{ startsAtUtc: string; ruleId: string }[]`

**DST offset computation (no external dep — Node.js Intl):**
```
function londonUtcOffset(date: Date): number {
  // Returns the UTC offset in minutes for Europe/London on the given date.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(date);
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  // "GMT+1" → +60, "GMT" → 0, "GMT-1" → -60
  const match = tzPart.match(/GMT([+-]\d+)?/);
  const hours = match?.[1] ? parseInt(match[1]) : 0;
  return hours * 60;
}
```
Then: `utcMs = localMs - offsetMinutes * 60000`

**Test file:** `services/worker/src/domain/recurrence-generator.test.ts`

5 required test cases:
1. `Mon 2026-07-06` (BST) + time_of_day "18:00" → startsAt ends in "...17:00:00.000Z"
2. `Mon 2026-01-05` (GMT) + time_of_day "18:00" → startsAt ends in "...18:00:00.000Z"
3. Rule with days_of_week [1, 3] (Mon/Wed) generates 2 occurrences per week
4. Rule with generated_through set skips already-generated dates
5. Rule with ends_on does not generate occurrences past ends_on

**Verify:** `cd services/worker && pnpm test -- recurrence-generator` passes ALL 5 cases (real run, paste output).

**Done criteria:** Test file exists + all 5 tests pass with real command output.

### Task 3 — Worker job: materialize-class-occurrences (type="auto")

**Goal:** `services/worker/src/queues/materialize-class-occurrences.ts` following `housekeeping.ts` pattern. Register consumer first, then schedule daily at 04:00 UTC.

Steps:
1. Add `CLASS_MATERIALIZE: "class-materialize"` to `packages/queue/src/types.ts` QUEUE_NAMES
2. Create `services/worker/src/queues/materialize-class-occurrences.ts`:
   - Import getDb, getLogger, generateOccurrences
   - Worker reads all active class_schedule_rules (active = 1)
   - For each rule: call generateOccurrences(rule, windowEnd = now + 56 days)
   - For each occurrence: INSERT INTO class_occurrences (id, definition_id, rule_id, starts_at, ends_at, capacity, location, trainer_id, status, created_at) via ON CONFLICT DO NOTHING (rule_id, starts_at partial index)
   - endsAt = starts_at + definition.duration_min minutes (fetch from class_definitions)
   - Update generated_through on the rule after successful insert batch
3. Register in `services/worker/src/index.ts` — add createQueue for 'class-materialize', call `registerMaterializeClassOccurrences(boss)`, log

**Worker DB mirror:** Add `classScheduleRules` and `ruleId` on `classOccurrences` to `services/worker/src/lib/db.ts`.

**Verify:** `cd services/worker && pnpm typecheck && pnpm build` exits 0.

**Done criteria:** Queue registered in QUEUE_NAMES; materialize-class-occurrences.ts compiles; index.ts boots the job; typecheck + build pass.

### Task 4 — Actions: create-schedule-rule, update-schedule-rule, deactivate-schedule-rule (type="auto")

**Goal:** Three new actions in `apps/staff-web/actions/` with two-exposure in agent-chat.ts + AGENTS.md.

**create-schedule-rule** (POST mutation):
- Params: definitionId (required), daysOfWeek (number[] 0-6), timeOfDay ("HH:MM"), location?, capacity?, trainerId?, startsOn (ISO date), endsOn? (ISO date)
- Validates definitionId exists → DEFINITION_NOT_FOUND
- Inserts rule row with nanoid('rule_')
- Immediately generates the first 8-week window (calls generateOccurrences + inserts occurrences) so occurrences appear without waiting for the cron
- Returns {id, definitionId, daysOfWeek, timeOfDay, startsOn}
- `// guard:allow-unscoped — single-tenant`

**update-schedule-rule** (POST mutation):
- Params: id (required), timeOfDay?, location?, capacity?, trainerId?, endsOn?
- Partial patch (cannot change definition_id, days_of_week, starts_on — these are identity fields of the series)
- Returns {updated: true} | {updated: false, reason} | {error: 'RULE_NOT_FOUND'}

**deactivate-schedule-rule** (POST mutation):
- Params: id (required), cancelFutureOccurrences?: boolean (default true)
- Sets rule.active = 0
- If cancelFutureOccurrences: UPDATE class_occurrences SET status='cancelled' WHERE rule_id = id AND starts_at > NOW() AND status = 'scheduled'
- Returns {deactivated: true, occurrencesCancelled: number}

Two-exposure:
- All three auto-register via actions-registry.ts (auto-discovered)
- Add to agent-chat.ts Schedule section: create-schedule-rule, update-schedule-rule, deactivate-schedule-rule bullets
- Add to apps/staff-web/AGENTS.md actions table: 3 new rows

**Verify:** `cd apps/staff-web && pnpm typecheck` exits 0.

**Done criteria:** 3 action files exist; two-exposed in agent-chat.ts + AGENTS.md.

### Task 5 — UI: "Repeat weekly" toggle in NewClassDialog (type="auto")

**Goal:** Extend `NewClassDialog.tsx` with a "Repeat weekly" toggle. When ON, show a day-of-week multi-select (Mon–Sun); on submit, call `create-schedule-rule` instead of `create-class-occurrence`.

UI changes to `apps/staff-web/app/components/gymos/NewClassDialog.tsx`:
- Add `repeat` boolean state (default false)
- Add `selectedDays` number[] state (default [])
- After the Trainer select, add a toggle row: a Checkbox (shadcn) + label "Repeat weekly"
- When repeat=true: show a day-of-week multi-select using shadcn ToggleGroup (Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6 Sun=0) — horizontal row of day buttons (Mon, Tue, Wed, Thu, Fri, Sat, Sun), each toggles in/out of selectedDays
- On submit when repeat=true: validate selectedDays.length > 0 (toast "Pick at least one day"), then call create-schedule-rule({definitionId, daysOfWeek: selectedDays, timeOfDay: HH:MM from datetime, location, capacity, trainerId, startsOn: YYYY-MM-DD from datetime}), NOT create-class-occurrence
- On submit when repeat=false: existing flow unchanged
- resetForm() clears repeat=false, selectedDays=[]
- Add useActionMutation("create-schedule-rule") alongside the existing createDef + createOcc
- No window.confirm; no custom dropdowns; shadcn only; Tabler icons only

Check if ToggleGroup is available in staff-web shadcn components. If not, use a simple row of shadcn Button variants (outline/default) that toggle selected state.

**Verify:** `cd apps/staff-web && pnpm typecheck` exits 0.

**Done criteria:** NewClassDialog has the repeat toggle + day picker; submit routing to create-schedule-rule when repeat=true; typecheck clean.

## Verification

After all 5 tasks:
1. `cd apps/staff-web && pnpm typecheck` — exit 0
2. `cd services/worker && pnpm typecheck && pnpm build` — exit 0
3. `cd services/worker && pnpm test -- recurrence-generator` — all 5 cases pass

## Success Criteria

- Migrations v27-v30 in db.ts (additive, no drizzle-kit push)
- DST-correct generator tested (BST 17:00Z / GMT 18:00Z assertions both pass)
- Worker job `class-materialize` registered and boots cleanly
- Three actions created and two-exposed
- NewClassDialog has working repeat toggle
- All typechecks pass
