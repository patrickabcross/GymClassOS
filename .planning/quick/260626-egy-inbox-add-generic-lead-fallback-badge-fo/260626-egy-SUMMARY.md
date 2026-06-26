---
phase: quick-260626-egy
plan: 01
subsystem: staff-web/inbox
tags: [inbox, leads, badge, ui]
dependency_graph:
  requires: [quick-260625-x34]
  provides: [INBX-MERGE-01]
  affects: [apps/staff-web/app/routes/gymos.messages.tsx]
tech_stack:
  added: []
  patterns: [tabler-icon-fallback]
key_files:
  modified:
    - apps/staff-web/app/routes/gymos.messages.tsx
decisions:
  - "IconUserPlus chosen for generic lead badge — distinct from the member-profile IconUser used by the switch default branch"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-26T09:29:37Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick 260626-egy: Add generic "Lead" fallback badge for source-less leads

Single-file fix to `apps/staff-web/app/routes/gymos.messages.tsx` so leads with no resolved source (no `whatsapp_opt_in` row, no `form_submission`) now render a visible "Lead" badge with an `IconUserPlus` icon instead of being visually indistinguishable from member rows.

## What Was Built

Three targeted edits, no schema migration, no new query:

1. **Icon import** — added `IconUserPlus` to the `@tabler/icons-react` named-import block (alphabetical, after `IconUser`).

2. **Loader fallback** — changed the `leadSource` assignment in `conversationsRows.map()`:
   ```
   Before: sourceMap[c.id] ?? null
   After:  sourceMap[c.id] ?? { type: "lead", label: "Lead" }
   ```
   Non-lead (member) rows still receive `null as null` — no badge.

3. **`sourceIcon()` case** — added `case "lead": return IconUserPlus;` above `default: return IconUser;`, giving the fallback badge a distinct icon.

The badge render block (~line 1047) was already generic (`c.leadSource.type` / `.label`) and required no change.

## Verification

- `npx tsc --noEmit` scoped to `gymos.messages`: **TSC CLEAN** — no errors referencing this file.
- Prettier applied: file formatted per project convention.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `21b63fd7` | feat(quick-260626-egy): add generic Lead fallback badge for source-less leads |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the fallback badge is fully wired: loader produces `{ type: "lead", label: "Lead" }`, `sourceIcon("lead")` returns `IconUserPlus`, badge render block reads both generically.

## Self-Check: PASSED

- [x] `apps/staff-web/app/routes/gymos.messages.tsx` modified (verified via Read after edit)
- [x] Commit `21b63fd7` exists (`git rev-parse --short HEAD` confirmed)
- [x] tsc clean for this file
- [x] No schema migration, no new query
- [x] Tabler icons only (IconUserPlus)
