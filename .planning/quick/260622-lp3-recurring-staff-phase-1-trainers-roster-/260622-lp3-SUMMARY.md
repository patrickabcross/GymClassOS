---
phase: quick-260622-lp3
plan: 01
subsystem: staff-web / schedule
tags: [schema, trainers, actions, ui, schedule, lp3]
dependency_graph:
  requires: [schema.classOccurrences (existing), create-class-occurrence (existing), gymos.schedule.tsx loader]
  provides: [trainers table, list-trainers, create-trainer, update-trainer, trainer+location columns on class_occurrences, ManageTrainersDialog, NewClassDialog trainer/location selects]
  affects: [gymos.schedule.tsx, NewClassDialog.tsx, agent-chat.ts system prompt]
tech_stack:
  added: []
  patterns: [reactivate-or-create dedupe (lower(name) lookup before insert), idempotent seed (ON CONFLICT DO NOTHING), expression index (lower(name)), __none__ sentinel for Radix Select, loader Query E pattern]
key_files:
  created:
    - apps/staff-web/actions/list-trainers.ts
    - apps/staff-web/actions/create-trainer.ts
    - apps/staff-web/actions/update-trainer.ts
    - apps/staff-web/app/components/gymos/ManageTrainersDialog.tsx
  modified:
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/actions/create-class-occurrence.ts
    - apps/staff-web/server/plugins/agent-chat.ts
    - apps/staff-web/AGENTS.md
    - apps/staff-web/app/components/gymos/NewClassDialog.tsx
    - apps/staff-web/app/routes/gymos.schedule.tsx
decisions:
  - "Reactivate-or-create dedupe pattern for create-trainer: lower(name) lookup before insert, mirrors member-upsert gotcha lesson"
  - "__none__ sentinel (not empty string) for Radix Select location + trainer — Radix Select cannot use empty string as value"
  - "Loader Query E (SSR-stable) over client-side fetch for trainers list — mirrors established classTypes Query D pattern"
  - "Dialog (not Sheet) for ManageTrainersDialog — matches NewClassDialog/book-dialog idiom on this screen"
  - "Deactivate-not-delete: active:false is the only removal path for trainers"
  - "Plain ON CONFLICT DO NOTHING (not ON CONFLICT (lower(name))) for cross-dialect seed safety"
metrics:
  duration: ~25min
  completed: 2026-06-22
  tasks: 3
  files: 11
---

# Quick Task 260622-LP3: Trainers Roster (Phase 1) Summary

One-liner: Additive trainers table + 23-name idempotent seed + list/create/update actions + Location+Trainer selects in NewClassDialog + ManageTrainersDialog roster manager — full data/action/UI foundation for LP3 Phase 2 (recurrence rules) and Phase 3 (HUSTLE timetable population).

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Schema migrations v22-v26 + Drizzle defs | 0d011df2 |
| 2 | Trainer actions + extended create-class-occurrence + two-exposure docs | 91b16fb7 |
| 3 | Schedule UI — Trainer+Location selects in NewClassDialog + ManageTrainersDialog | 652b5a40 |

## What Was Built

### Task 1 — Schema

Five new migration blocks in `apps/staff-web/server/plugins/db.ts`, all appended before the version-15 trigger block (migrations apply by version number):

- **v22** — `CREATE TABLE IF NOT EXISTS trainers (id TEXT PK, name TEXT NOT NULL, home_location TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')))`
- **v23** — `CREATE UNIQUE INDEX IF NOT EXISTS idx_trainers_name_lower ON trainers (lower(name))` — expression index, dedupe target
- **v24** — `ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS location TEXT`
- **v25** — `ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS trainer_id TEXT`
- **v26** — idempotent INSERT of 23 HUSTLE trainers (`trn_seed_01`..`trn_seed_23`) with `ON CONFLICT DO NOTHING`. "Ben O''Connor" correctly escaped.

`schema.ts` exports:
- `trainers` table (integer-boolean `active` matching `studioOwnerConfig` pattern)
- `location` + `trainerId` nullable columns on `classOccurrences`

### Task 2 — Actions

- **list-trainers** (`GET`): returns `[{id, name, homeLocation}]` for active trainers ordered by name; `guard:allow-unscoped`
- **create-trainer** (POST mutation): reactivate-or-create via `lower(name)` lookup before insert; `guard:allow-unscoped`
- **update-trainer** (POST mutation): partial patch (name/homeLocation/active); `NAME_IN_USE` collision guard; no hard delete; `guard:allow-unscoped`
- **create-class-occurrence**: extended with optional `trainerId` + `location` in Zod schema and insert values; existing fields untouched; return shape preserved

Two-exposure complete:
- Action files auto-registered in `.generated/actions-registry.ts`
- `agent-chat.ts` Schedule section: `create-class-occurrence` params updated; 3 new trainer action bullets added
- `AGENTS.md`: 3 new table rows; `create-class-occurrence` row updated; LP3 two-exposure callout added

### Task 3 — UI

- **gymos.schedule.tsx**: Query E (active trainers, mirrors Query D) added to loader; `trainers` in return; ManageTrainersDialog imported and mounted in header next to NewClassDialog
- **NewClassDialog.tsx**: `trainers` prop added; Location Select (Norwich / Wymondham / `__none__`) after Room; Trainer Select (roster + `__none__`) after Location; both mapped to `undefined` on submit when sentinel; `resetForm()` clears both; existing optimistic close-then-revalidate flow preserved
- **ManageTrainersDialog.tsx** (NEW): Dialog with `IconUsers` trigger labelled "Trainers"; scrollable trainer list with inline edit (name Input + home-location Select + Save/Cancel) and deactivate (Remove button → `update-trainer({active:false})`); Add trainer form (name + location); `create-trainer` + `update-trainer` wired via `useActionMutation`; optimistic toast + `revalidator.revalidate()`; shadcn Dialog/Select/Input/Label/Button; Tabler IconUsers/IconPencil/IconCheck/IconX; no emojis; no `window.confirm`; no custom dropdowns

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All 23 trainer names are seeded on Vercel boot. All UI surfaces are wired to real data (loader Query E). No placeholder data flows to the UI.

## Self-Check

- [x] `apps/staff-web/server/plugins/db.ts` — versions 22-26 present
- [x] `apps/staff-web/server/db/schema.ts` — `export const trainers` present; `location`/`trainerId` on classOccurrences
- [x] `apps/staff-web/actions/list-trainers.ts` — exists, `defineAction` with `http: GET`
- [x] `apps/staff-web/actions/create-trainer.ts` — exists, `defineAction` (POST mutation)
- [x] `apps/staff-web/actions/update-trainer.ts` — exists, `defineAction` (POST mutation)
- [x] `apps/staff-web/app/components/gymos/ManageTrainersDialog.tsx` — exists, `useActionMutation`
- [x] All 3 task commits exist: 0d011df2, 91b16fb7, 652b5a40
- [x] `pnpm typecheck` exit 0 (final run confirmed)

## Self-Check: PASSED
