---
phase: P3-ai-noticeboard-home
plan: "06"
subsystem: agent-posture
tags: [agent, system-prompt, suggest-and-act, posture, AGENTS.md, navigate, human-in-the-loop]
dependency_graph:
  requires: [P3-ai-noticeboard-02, P3-ai-noticeboard-03]
  provides: [SC-6, agent-posture-suggest-and-act, tool-gate-unlocked]
  affects:
    - apps/staff-web/server/plugins/agent-chat.ts
    - apps/staff-web/AGENTS.md
    - apps/staff-web/actions/navigate.ts
tech_stack:
  added: []
  patterns:
    - system-prompt-as-tool-gate
    - three-tier-agent-posture
    - human-in-the-loop-proposal
key_files:
  created: []
  modified:
    - apps/staff-web/server/plugins/agent-chat.ts
    - apps/staff-web/AGENTS.md
    - apps/staff-web/actions/navigate.ts
decisions:
  - "System prompt as tool gate pattern confirmed: the LLM will only call tools the prompt names. Plans 02/03 added the action files; this plan names them, which is the actual unlock."
  - "Four new tools named in system prompt: upsert-section-note, create-task, complete-task, propose-action"
  - "list-inbox-summary added to system prompt alongside the four new tools (was missing from P1b.1-07 prompt)"
  - "Gates-still-hold note is load-bearing and appears in both agent-chat.ts and AGENTS.md: worker opt-in/24h-window/approved-template chokepoint still fires on every approve-proposal run"
metrics:
  duration_seconds: 382
  completed_date: "2026-06-03"
  tasks_completed: 3
  files_changed: 3
---

# Phase P3 Plan 06: Agent Posture Summary

Updated the agent's enforced posture from "read-only for pilot" to "suggest + one-click act" (human-in-the-loop). The system prompt now names the four new authoring/propose tools (Plans 02/03 added the action files; this plan is what actually unlocks the LLM calling them). AGENTS.md documents the three-tier model with the load-bearing compliance note. navigate.ts drops email-centric vocabulary for gymos route names.

## What Was Built

### Task 1 — agent-chat.ts system prompt rewrite

`apps/staff-web/server/plugins/agent-chat.ts`

The `systemPrompt` string was updated with three changes:

1. **New tools added to the available tools list:**
   - `list-inbox-summary` — unread/open WhatsApp conversation counts for the Inbox card
   - `upsert-section-note` — write/replace the AI note on a dashboard section card
   - `create-task` — add a prioritized task to the noticeboard Tasks list
   - `complete-task` — mark a task done
   - `propose-action` — queue a one-click action (send-template-to-members or create-checkout-link) for coach approval

2. **READ-ONLY block removed:** The entire "You are READ-ONLY for the pilot. You cannot: ..." block was deleted.

3. **Suggest-and-act posture block added:**
   - Three-tier model (answer / author / propose)
   - "human-in-the-loop" language
   - Explicit compliance gate note: "One-click approve does NOT bypass compliance: the worker still enforces WhatsApp opt-in, the 24-hour window, and approved-template gates."

The gym-vocabulary guardrail block ("Never reference: email, Gmail, inbox...") was preserved unchanged.

**Final system prompt tool list (11 tools):** list-fill-rate, list-renewals, list-at-risk-members, list-inbox-summary, list-classes, list-members, view-screen, navigate, upsert-section-note, create-task, complete-task, propose-action.

### Task 2 — AGENTS.md rewrite

`apps/staff-web/AGENTS.md`

Major rewrite of the agent guide:

1. **Role section:** Updated from "read-only for pilot" to suggest-and-act description.

2. **Data Sources table:** Added `dashboard_notes`, `dashboard_tasks`, `dashboard_proposals` table entries.

3. **Agent Actions table:** Added Tier column + rows for all seven new actions: `upsert-section-note`, `create-task`, `complete-task`, `propose-action`, `approve-proposal`, `reject-proposal`, `list-inbox-summary`. Updated `send-template-to-members` and `create-checkout-link` to document they are called by `approve-proposal`, not directly by the agent.

4. **Section structure changed:** Replaced binary "What CAN / CANNOT" sections with single "How the Agent Acts" section (Tier 1 Read, Tier 2 Author, Tier 3 Propose). The `create-checkout-link` "Pilot-agent posture" note updated to reflect the propose->approve path.

5. **CRITICAL compliance note added verbatim:** "One-click approve is NOT a bypass — the worker still enforces opt-in, the 24-hour window, and approved-template gates."

6. **Adding a New Gym Action** step 6 added: document the action in the system prompt if it should be agent-callable.

The Forbidden Vocabulary, Adding a New Gym Action, and Conventions Inherited sections were preserved.

### Task 3 — navigate.ts vocabulary update

`apps/staff-web/actions/navigate.ts`

Two description-only changes (runtime `run()` logic untouched):

- Top-level `description`: was "Navigate the UI to a specific view or email thread..." → now "Navigate the staff UI to a specific gymos route (home, inbox, schedule, members, analytics, campaigns, forms, settings)..."
- `view` param `.describe(...)`: was the email view list (inbox, starred, sent, drafts, ...) → now "Gymos route to navigate to: home, inbox, schedule, members, analytics, campaigns, forms, settings"

The `writeAppState("navigate", nav)` call and all param handling are unchanged.

## Commits

| Task | Commit | Description |
|---|---|---|
| Task 1 | `ebd94a6a` | feat(P3-06): rewrite agent system prompt to suggest-and-act posture |
| Task 2 | `974d5bc7` | docs(P3-06): rewrite AGENTS.md to suggest-and-act three-tier posture |
| Task 3 | `b4be291d` | feat(P3-06): update navigate action description to gymos route vocabulary |

## Deviations from Plan

**[Rule 2 - Missing critical functionality] Added list-inbox-summary to system prompt**

- **Found during:** Task 1
- **Issue:** The plan's tool list specified the four new tools (upsert-section-note, create-task, complete-task, propose-action) but `list-inbox-summary` — shipped in Plan 02 — was not named in the P1b.1-07 system prompt and would be invisible to the LLM without it.
- **Fix:** Added `list-inbox-summary` to the prompt's tool list alongside the four new tools.
- **Files modified:** `apps/staff-web/server/plugins/agent-chat.ts`
- **Commit:** `ebd94a6a`

The plan's AGENTS.md section (Task 2) already included `list-inbox-summary` in the table — the prompt omission was an inconsistency worth fixing inline.

## Known Stubs

None. These are prompt text and description edits — there is no runtime data stub. Whether the LLM actually calls the new tools end-to-end is exercised in the Plan 07 e2e smoke test on the live Vercel deploy.

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/staff-web/server/plugins/agent-chat.ts` modified | FOUND |
| `apps/staff-web/AGENTS.md` modified | FOUND |
| `apps/staff-web/actions/navigate.ts` modified | FOUND |
| Commit `ebd94a6a` exists | FOUND |
| Commit `974d5bc7` exists | FOUND |
| Commit `b4be291d` exists | FOUND |
| agent-chat.ts: contains "upsert-section-note" | VERIFIED |
| agent-chat.ts: contains "create-task" | VERIFIED |
| agent-chat.ts: contains "complete-task" | VERIFIED |
| agent-chat.ts: contains "propose-action" | VERIFIED |
| agent-chat.ts: no "READ-ONLY for the pilot" | VERIFIED |
| agent-chat.ts: contains "human-in-the-loop" | VERIFIED |
| agent-chat.ts: contains 24-hour window + approved-template gate note | VERIFIED |
| agent-chat.ts: gym guardrail block preserved | VERIFIED |
| AGENTS.md: contains "upsert-section-note" | VERIFIED |
| AGENTS.md: contains "propose-action" | VERIFIED |
| AGENTS.md: contains "approve-proposal" | VERIFIED |
| AGENTS.md: contains "list-inbox-summary" | VERIFIED |
| AGENTS.md: no "read-only for the pilot" | VERIFIED |
| AGENTS.md: no "What the Agent CANNOT Do" | VERIFIED |
| AGENTS.md: Forbidden Vocabulary preserved | VERIFIED |
| AGENTS.md: opt-in + 24-hour window + approved-template + not-a-bypass | VERIFIED |
| navigate.ts: contains "gymos route" | VERIFIED |
| navigate.ts: no "email thread" | VERIFIED |
| navigate.ts: contains home/inbox/schedule/members/analytics route list | VERIFIED |
| navigate.ts: writeAppState runtime logic unchanged | VERIFIED |
| tsc --noEmit exits 0 | PASSED |
