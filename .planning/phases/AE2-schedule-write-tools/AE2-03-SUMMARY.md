---
phase: AE2-schedule-write-tools
plan: 03
subsystem: staff-web-schedule-agent
tags: [agent-exposure, system-prompt, view-screen, two-exposure-rule, context-awareness]
requires:
  - "AE2-01 direct actions (set-occurrence-capacity, update-class-definition, mark-occurrence-complete)"
  - "AE2-02 gated actions (cancel-occurrence, reschedule-occurrence) + propose->approve gate wiring"
  - "create-path actions (create-class-definition, create-class-occurrence) from 95e1f0da"
provides:
  - "view-screen schedule branch — upcoming occurrences + booking counts + selected occurrence (AEX-01)"
  - "agent-chat.ts per-tab Schedule section naming all 5 direct/create actions + propose-action routing for the 2 gated ones (AEX-01)"
  - "AGENTS.md schedule-action documentation + AE2 two-exposure note (AEX-04)"
  - "AES-01 satisfied — create path is now agent-driven"
affects:
  - "AE2 phase complete — full schedule lifecycle is agent-driven, gated where high-risk, live-refreshing, context-aware"
  - "AE3 (Members) follows the same per-tab view-screen + system-prompt + AGENTS.md pattern"
tech-stack:
  added: []
  patterns:
    - "view-screen per-tab branch: nav?.view === 'schedule' before the generic email else-if; dynamic-import getDb/schema + drizzle helpers"
    - "Two-exposure completion: action in registry (Waves 1+2) + named in system prompt (this wave) = agent-callable"
    - "Gated actions exposed ONLY via propose-action bullets — never as standalone direct-tool bullets"
key-files:
  created: []
  modified:
    - "apps/staff-web/actions/view-screen.ts"
    - "apps/staff-web/server/plugins/agent-chat.ts"
    - "apps/staff-web/AGENTS.md"
decisions:
  - "Schedule branch placed as a sibling else-if AFTER the AE1-03 forms branch, BEFORE the generic email else-if (so /gymos/schedule never falls through to Gmail logic) — mirrors AE1-03 exactly"
  - "System-prompt ships LAST (this wave) so the agent never hallucinates calls to actions that did not yet exist (STATE.md constraint + RESEARCH Pitfall 4)"
  - "cancel-occurrence / reschedule-occurrence named ONLY through propose-action bullets — grep-verified no standalone direct-tool bullets exist"
metrics:
  duration: "6m"
  tasks: 3
  files: 3
  completed: "2026-06-18"
---

# Phase AE2 Plan 03: Schedule Write Tools (Agent Exposure) Summary

Exposed the AE2 schedule write tools to the agent — the LAST wave. Added a `schedule` branch to `view-screen` (upcoming occurrences + booking counts + selected occurrence, so the agent is context-aware of the Schedule tab before writing), added a per-tab Schedule section to the `agent-chat.ts` system prompt (naming the 5 direct/create actions and routing cancel + reschedule through `propose-action`), and documented all schedule actions in AGENTS.md with the two gated actions marked. This completes AES-01 (agent-driven create path), AEX-01 (context-aware per-tab prompt), and AEX-04 (two-exposure rule) for every AE2 action. No new action files — they all shipped in AE2-01/02 and 95e1f0da.

## What Shipped

- **`view-screen` schedule branch (AEX-01)** — a `nav?.view === "schedule"` branch placed adjacent to the AE1-03 forms branch and BEFORE the generic `else if (nav?.view)` email branch (so `/gymos/schedule` does not fall through into Gmail logic). It dynamically imports `getDb`/`schema` from `../server/db/index.js` and `eq, and, count, gte, asc` from `drizzle-orm`, then: (1) selects up to 30 upcoming occurrences (`startsAt >= now`, inner-joined to `classDefinitions` for the class name, ordered ascending), (2) counts active bookings per occurrence (`status='booked'`, `Number()`-wrapped against pg `count()` string surfacing) into `screen.schedule.upcomingOccurrences`, and (3) when `nav.occurrenceId` is set, loads the selected occurrence row + its booking count into `screen.selectedOccurrence`. Every query carries `// guard:allow-unscoped — single-tenant gym tables`.
- **`agent-chat.ts` Schedule section (AEX-01 + AEX-04)** — two edits mirroring AE1-03's Forms work: (1) the `propose-action` tool line's allowed `actionName` list now includes `'cancel-occurrence'` and `'reschedule-occurrence'` alongside the existing three; (2) a new per-tab Schedule section (inserted after the Forms section, before the "How you act — three tiers" block) names `create-class-definition`, `create-class-occurrence`, `update-class-definition`, `set-occurrence-capacity`, and `mark-occurrence-complete` as direct tools, and routes CANCEL + RESCHEDULE exclusively through `propose-action({ actionName: "cancel-occurrence" | "reschedule-occurrence", ... })`. Neither gated action appears as a standalone direct-tool bullet (grep-verified).
- **AGENTS.md documentation (AEX-04)** — flipped the `create-class-definition`/`create-class-occurrence` rows from "(UI-driven for now; AE2 will expose to agent)" to agent-exposed wording; added five new rows (`set-occurrence-capacity`, `update-class-definition`, `mark-occurrence-complete`, `cancel-occurrence`, `reschedule-occurrence`) with the two gated actions marked "**Gated — reached only via `propose-action`; NOT called directly by the agent**"; extended the `propose-action` row's actionName list; and replaced the old "deferred to Phase AE2" two-exposure note with an "AE2 schedule actions" note documenting full exposure.

## Verification

- `cd apps/staff-web && npx tsc --noEmit` exits 0 after Task 1 and Task 2.
- `npx prettier --check AGENTS.md` reports no issues after Task 3.
- grep confirms agent-chat.ts names all 5 direct/create actions (create-class-definition, create-class-occurrence, update-class-definition, set-occurrence-capacity, mark-occurrence-complete) AND contains `propose-action({ actionName: "cancel-occurrence"` and `propose-action({ actionName: "reschedule-occurrence"`.
- grep confirms NO standalone `- cancel-occurrence —` or `- reschedule-occurrence —` direct-tool bullets exist in agent-chat.ts (gated only via propose-action).
- **Whole-phase two-exposure check:** every AE2 action (create path + AE2-01 direct + AE2-02 gated) appears in all three surfaces — agent-chat.ts (or via propose-action for the two gated), AGENTS.md, and the on-disk `.generated/actions-registry.ts`. All seven confirmed present.

Runtime DB replay against `gymos-demo` was not performed (the no-local-dev-server constraint applies project-wide). Functional verification rolls into the live Vercel deploy: ask the agent "create a HIIT class on Monday at 7am with 15 spots" → confirm a draft occurrence row + Schedule-tab live-refresh; then "cancel Friday's spin" (an occurrence with bookings) → confirm a pending `dashboard_proposals` row with `action_name='cancel-occurrence'` (not auto-cancelled).

## Deviations from Plan

None — plan executed exactly as written. The schedule branch was inserted as a sibling `else if` after the forms branch (the plan offered "before or after" either-way placement; after-forms keeps the chain ordering identical to AE1-03).

## Known Stubs

None. The view-screen branch queries real schema tables; the system prompt names actions that all exist in the registry; AGENTS.md documents shipped actions.

## Commits

- `5abb30fd` feat(AE2-03): add schedule branch to view-screen for AEX-01 context-awareness
- `e8a0fa5c` feat(AE2-03): add per-tab Schedule section to agent-chat.ts system prompt
- `9e0e150e` feat(AE2-03): document schedule actions in AGENTS.md (two-exposure rule)

## Self-Check: PASSED

All three modified files exist on disk; all three task commits (5abb30fd, e8a0fa5c, 9e0e150e) exist in git.
