---
phase: AE1-forms-write-tools
plan: "03"
subsystem: agent-chat / view-screen / docs
tags: [agent-exposure, system-prompt, context-awareness, two-exposure-rule, forms]
dependency_graph:
  requires: [AE1-01, AE1-02]
  provides: [AEX-01, AEX-04]
  affects: [apps/staff-web/actions/view-screen.ts, apps/staff-web/server/plugins/agent-chat.ts, apps/staff-web/AGENTS.md]
tech_stack:
  added: []
  patterns: [per-tab-system-prompt, view-screen-forms-branch, two-exposure-rule, propose-action-gating]
key_files:
  created: []
  modified:
    - apps/staff-web/actions/view-screen.ts
    - apps/staff-web/server/plugins/agent-chat.ts
    - apps/staff-web/AGENTS.md
decisions:
  - "Forms section in system prompt inserted after suggest-template-vars and before How you act tiers — keeps functional clusters together"
  - "publish-form never appears as a standalone tool bullet; only mention routes through propose-action"
  - "Two-exposure note in AGENTS.md mirrors the existing create-class-definition/occurrence note pattern"
metrics:
  duration_minutes: 18
  completed_date: "2026-06-18"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase AE1 Plan 03: Agent Exposure (System Prompt + Context Awareness) Summary

**One-liner:** Per-tab Forms system prompt section + view-screen forms branch complete the two-exposure rule for all 7 AE1 forms actions, with publish-form permanently gated through propose-action.

## What Was Built

This was the final wave of AE1: agent exposure. Waves 1 (AE1-01) and 2 (AE1-02) shipped the 7 action files and wired the propose→approve gate for publish-form. This wave made those actions callable by the agent.

### Task 1: view-screen.ts forms branch (AEX-01)

Added a `nav.view === "forms"` branch that fires before the generic email branch in `view-screen.ts run()`. When the coach is on `/gymos/forms`, the agent now receives:

- `screen.forms` — list of all non-archived forms (id, title, status, slug, updatedAt)
- `screen.selectedForm` — full form row with parsed `fields` and `settings` JSON when `nav.formId` is set

Both queries use dynamic `import()` of `getDb/schema` and `isNull/eq` from `drizzle-orm`. Both carry `// guard:allow-unscoped — single-tenant gym forms`.

### Task 2: agent-chat.ts per-tab Forms section (AEX-01 + AEX-04)

Two changes to the system prompt:

1. Updated the `propose-action` tool line to include `'publish-form'` in the allowed actionName list (alongside `'send-template-to-members'` and `'create-checkout-link'`).

2. Inserted a Forms tab section between `suggest-template-vars` and the "How you act — three tiers" block, naming all 7 actions:
   - 6 direct actions: create-form, update-form-fields, update-form-meta, unpublish-form, archive-form, restore-form
   - publish-form: routed through propose-action only — `- publish-form —` does NOT appear as a standalone tool bullet anywhere

### Task 3: AGENTS.md documentation (AEX-04 two-exposure rule)

Added to the Agent Actions table:
- 7 rows covering all forms actions (create-form through publish-form)
- publish-form row explicitly states "Gated — reached only via `propose-action({actionName:"publish-form"})"; NOT called directly by the agent"
- Updated the `propose-action` row's Use For to include `publish-form` in the actionName list

Added a "Two-exposure rule — AE1 forms actions" note after the table, mirroring the existing create-class-definition/occurrence note pattern.

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed per the spec without any deviations or auto-fixes required.

## Verification Results

- `cd apps/staff-web && npx tsc --noEmit` — exits 0 (no errors)
- `npx prettier --check AGENTS.md` — reports no issues
- Grep confirms: all 6 direct forms actions named in agent-chat.ts Forms section
- Grep confirms: `propose-action({ actionName: "publish-form"` present in system prompt
- Grep confirms: no standalone `- publish-form —` bullet in agent-chat.ts (only via propose-action)
- Grep confirms: all 7 actions documented in AGENTS.md with publish-form marked gated

## AE1 Phase Complete

AE1 (Forms Write Tools) is fully complete across all 3 waves:

| Wave | Plan | Delivered |
|------|------|-----------|
| 1 | AE1-01 | 6 direct write actions (create, update-fields, update-meta, unpublish, archive, restore) + form-field-schema.ts |
| 2 | AE1-02 | publish-form gated action + gate atomicity (ACTION_ALLOWLIST + Zod enum + approve-proposal dispatch) |
| 3 | AE1-03 | view-screen forms branch (AEX-01) + system prompt per-tab section + AGENTS.md docs (AEX-04) |

Requirements satisfied: AEF-01, AEF-02, AEF-03, AEF-04, AEF-05, AEF-06, AEX-01, AEX-02, AEX-04.

AEX-03 (live-refresh hook for the Forms tab loader) is tracked separately in the AE1 research as a follow-up — the current forms route uses an RR v7 loader; `useChangeVersion("action") + useRevalidator` wiring was scoped out of AE1-03 (no plan task covers it). This is a UX enhancement (the page can be manually refreshed in the meantime), not a correctness requirement for agent-callable actions.

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 77ed91b5 | Task 1 | feat(AE1-03): add forms branch to view-screen for AEX-01 context-awareness |
| e9609266 | Task 2 | feat(AE1-03): restructure agent-chat.ts system prompt with per-tab Forms section |
| 7ea0571e | Task 3 | docs(AE1-03): document 7 forms actions in AGENTS.md (two-exposure rule AEX-04) |

## Self-Check: PASSED

- FOUND: apps/staff-web/actions/view-screen.ts
- FOUND: apps/staff-web/server/plugins/agent-chat.ts
- FOUND: apps/staff-web/AGENTS.md
- FOUND: .planning/phases/AE1-forms-write-tools/AE1-03-SUMMARY.md
- FOUND commit 77ed91b5 (Task 1 — view-screen forms branch)
- FOUND commit e9609266 (Task 2 — agent-chat.ts system prompt)
- FOUND commit 7ea0571e (Task 3 — AGENTS.md documentation)
