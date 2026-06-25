---
phase: quick
plan: 260625-mvn
subsystem: staff-web
tags: [bug-fix, brain, schema, migration, scroll]
dependency_graph:
  requires: []
  provides: [brain-page-scroll, v36-boolean-migration]
  affects: [gymos.brain, db.ts, schema.ts]
tech_stack:
  added: []
  patterns: [h-full overflow-y-auto scroll container, guarded idempotent DO block migration]
key_files:
  created: []
  modified:
    - apps/staff-web/app/routes/gymos.brain.tsx
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/server/plugins/db.ts
decisions:
  - v36 migration placed BEFORE v15 (trigger migration) in the runMigrations array, consistent with how v35 was placed above v15
  - integer("active", { mode:"boolean" }) declaration left unchanged in schema.ts — the core wrapper already emits BOOLEAN; do NOT import or switch to boolean() from drizzle-orm/pg-core
  - HUSTLE prod outage already hotfixed by hand on Neon billowing-sun-51091059 (trainers.active + class_schedule_rules.active altered to BOOLEAN); v36 is the durability/repeatability fix and is a guaranteed NO-OP on that database
metrics:
  duration: ~12 min
  completed: 2026-06-25
  tasks: 3
  files: 3
---

# Quick 260625-mvn: Brain Page Scroll + Durable active-column Corrective Summary

One-liner: Guarded idempotent migration v36 converts trainers/schedule-rules active columns to Postgres BOOLEAN (no-op on HUSTLE prod, already hotfixed), plus Brain page gains `h-full overflow-y-auto` scroll container on both return paths.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | v36 guarded idempotent migration — converts `trainers.active` + `class_schedule_rules.active` INTEGER → BOOLEAN with `USING (active <> 0)` | 647e1dcd | apps/staff-web/server/plugins/db.ts |
| 2 | Schema.ts comment cleanup — clarify that `integer("active", { mode:"boolean" })` already emits Postgres BOOLEAN via core wrapper | 5f6ba925 | apps/staff-web/server/db/schema.ts |
| 3 | Brain page scroll fix — wrap both loading + main return in `<div className="h-full w-full overflow-y-auto bg-background text-foreground">` | 126445fa | apps/staff-web/app/routes/gymos.brain.tsx |

## Key Decisions Made

- **v36 NO-OP on HUSTLE prod:** The production Neon database `billowing-sun-51091059` already had `trainers.active` and `class_schedule_rules.active` hotfixed to BOOLEAN by hand when the schedule outage was discovered. Migration v36 is strictly a durability/repeatability fix for future deployments (new studio tenants, fresh Neon projects, CI environments). The DO block's `atttypid = 23` (int4) guard means it silently does nothing when the column is already BOOLEAN (atttypid 16).
- **Drizzle declaration unchanged:** `integer("active", { mode: "boolean" })` is ALREADY the correct declaration. The `@agent-native/core` schema `table()` wrapper internally emits a Postgres BOOLEAN for this combination. Switching to `boolean(...)` from `drizzle-orm/pg-core` would be incorrect (that export doesn't exist in the core schema wrapper) and could break the SQLite dev path. Schema.ts changes are comment-only.
- **Value-preserving USING cast:** `USING (active <> 0)` converts existing `1` → `true`, `0` → `false`. No data loss, no DROP/RENAME/TRUNCATE (CLAUDE.md hard constraint honoured).
- **Scroll pattern from integrations page:** `gymos.settings.integrations.tsx` uses `<div className="h-full w-full overflow-y-auto bg-background text-foreground">` as the outermost wrapper. Applied identically to both return paths in `gymos.brain.tsx`.

## Deviations from Plan

None — plan executed exactly as specified in the constraints.

## Known Stubs

None — no stubs introduced.

## Self-Check: PASSED

- `apps/staff-web/server/plugins/db.ts` — modified, committed 647e1dcd
- `apps/staff-web/server/db/schema.ts` — modified, committed 5f6ba925
- `apps/staff-web/app/routes/gymos.brain.tsx` — modified, committed 126445fa
- TypeScript: zero errors in modified files (pre-existing errors in legacy mail-template files are unrelated and pre-dated this task)
- Prettier: all three files formatted
