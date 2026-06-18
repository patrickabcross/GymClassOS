---
phase: AE1-forms-write-tools
plan: "02"
subsystem: forms-write-tools
tags: [forms, publish, gate, propose-approve, drizzle]
dependency_graph:
  requires: [AE1-01]
  provides: [publish-form-gated-action, gate-atomicity-AEX-02]
  affects: [approve-proposal, propose-action, dashboardProposals-schema]
tech_stack:
  added: []
  patterns:
    - "Gated action: agent proposes via propose-action; coach approves via approve-proposal; action dispatched via dynamic import"
    - "Gate atomicity: ACTION_ALLOWLIST + dispatch branch + Zod enum + Drizzle text enum all updated in one commit"
    - "Fields pre-validation: z.array(FormFieldSchema).safeParse() before any status=published UPDATE"
key_files:
  created:
    - apps/staff-web/actions/publish-form.ts
  modified:
    - apps/staff-web/actions/approve-proposal.ts
    - apps/staff-web/actions/propose-action.ts
    - apps/staff-web/server/db/schema.ts
decisions:
  - "dashboardProposals.actionName Drizzle text enum is TypeScript-only (plain TEXT in Postgres); adding publish-form requires zero Postgres migration"
  - "Guard comment guard:allow-unscoped placed on both SELECT and UPDATE in publish-form.ts (single-tenant gym forms, no ownableColumns)"
  - "dispatch chain uses else-if not a lookup table — matches existing approve-proposal.ts pattern; only 3 members so no refactor needed"
metrics:
  duration_seconds: 137
  completed_date: "2026-06-18"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 3
---

# Phase AE1 Plan 02: GATED Publish-Form Action Summary

**One-liner:** publish-form gated defineAction with fields re-validation, wired atomically through approve-proposal + propose-action + Drizzle schema in one commit (AEX-02).

## What Was Built

Wave 2 of AE1: the single gated action in the forms lifecycle. The agent can now _propose_ publishing a form; a coach approves via the noticeboard; `approve-proposal` dispatches to `publish-form`, which re-validates the stored `fields` JSON against `FormFieldSchema` before flipping `status='published'`. Malformed fields block the publish without corrupting state.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create publish-form gated action | 1f45b901 | apps/staff-web/actions/publish-form.ts (new) |
| 2 | Atomic gate wiring (4 edits, 1 commit) | 3125c971 | approve-proposal.ts, propose-action.ts, server/db/schema.ts |

## Gate Locations (all 4 confirmed by grep)

| Location | File | Change |
|----------|------|--------|
| ACTION_ALLOWLIST | approve-proposal.ts line 13 | `"publish-form"` added (3rd member) |
| Dynamic-import dispatch | approve-proposal.ts lines 63-64 | `else if (proposal.actionName === "publish-form") { mod = await import("./publish-form.js"); }` |
| Zod enum | propose-action.ts line 23 | `"publish-form"` in `z.enum([...])` (3rd member) |
| Drizzle text enum | server/db/schema.ts line 479 | `"publish-form"` in `dashboardProposals.actionName` enum array |

## Verification Results

- `cd apps/staff-web && npx tsc --noEmit` — exits 0 (both after Task 1 and after Task 2)
- No new `.sql` file in `apps/staff-web/server/db/migrations/` — Drizzle text enum is TypeScript-only
- `git status --short apps/staff-web/server/db/migrations/` returned empty
- Prettier run on all 4 modified files — `propose-action.ts` reformatted enum to multi-line (correct)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `publish-form.ts` makes a real Drizzle UPDATE; the gate wiring is real. No placeholders or hardcoded values that flow to UI rendering.

## Requirements Satisfied

- **AEF-04** — Agent publishes a form via propose→approve (never auto-publishes). Code-complete; system-prompt exposure deferred to AE1-03 per the two-exposure rule.
- **AEX-02** — Gate wired atomically: ACTION_ALLOWLIST + dispatch branch + propose-action Zod enum + dashboardProposals.actionName Drizzle text enum all include "publish-form" in one commit.
