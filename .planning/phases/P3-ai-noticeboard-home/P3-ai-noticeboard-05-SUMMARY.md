---
phase: P3-ai-noticeboard-home
plan: "05"
subsystem: ui
tags: [react, shadcn-ui, tabler-icons, useActionQuery, useActionMutation, optimistic-ui, noticeboard, dashboard]
dependency_graph:
  requires:
    - phase: P3-ai-noticeboard-04
      provides: gymos._index.tsx noticeboard scaffold + loader returning notes/tasks/proposals
    - phase: P3-ai-noticeboard-02
      provides: list-inbox-summary, upsert-section-note, create-task, complete-task actions
    - phase: P3-ai-noticeboard-03
      provides: approve-proposal, reject-proposal actions + propose-action
  provides:
    - AiTodayStrip component (idle/active, IconMessage, pending badge)
    - BoardCard component (4 sections: inbox/schedule/members/revenue, metric subheading, note inset, proposal zone)
    - TasksSection component (priority strips, complete toggle, empty state)
    - gymos._index.tsx fully wired (scaffold placeholders replaced with live components)
  affects:
    - apps/staff-web/app/routes/gymos._index.tsx
    - apps/staff-web/app/components/gymos/Noticeboard/AiTodayStrip.tsx
    - apps/staff-web/app/components/gymos/Noticeboard/BoardCard.tsx
    - apps/staff-web/app/components/gymos/Noticeboard/TasksSection.tsx
tech_stack:
  added: []
  patterns:
    - useSectionMetric pattern (all 4 metric hooks called unconditionally in single hook, switched by section)
    - optimistic-mutation-useState (local state flag for immediate UI response before server round-trip)
    - per-section-config object (SECTION_CONFIG const with label/navView/navLabel/emptyNote/proposalActionName)
    - AlertDialog-gate-for-sends (AlertDialog wrapping Approve for send-template-to-members; direct approve for create-checkout-link)
key_files:
  created:
    - apps/staff-web/app/components/gymos/Noticeboard/AiTodayStrip.tsx
    - apps/staff-web/app/components/gymos/Noticeboard/BoardCard.tsx
    - apps/staff-web/app/components/gymos/Noticeboard/TasksSection.tsx
  modified:
    - apps/staff-web/app/routes/gymos._index.tsx
key-decisions:
  - "useSectionMetric calls all 4 metric hooks unconditionally (React rules of hooks) and switches by section param"
  - "BoardCard receives full proposals array and filters internally by actionName === config.proposalActionName — avoids parent needing to know card-to-proposal mapping"
  - "ProposalRow uses local useState for optimistic status (pending|loading|dismissed) instead of React Query cache manipulation — simpler for a non-list mutation"
  - "Per-task Approve in TasksSection scrolls to data-proposal-id attribute on card (V1 lightweight) rather than duplicating AlertDialog"
  - "Revenue card MRR rendered at text-2xl font-semibold (noticeboard card scale) per UI-SPEC §Non-Blocking Open Questions resolution #3"
  - "relative time helper is pure JS (no date-fns-tz) — sufficient for note timestamps; accurate time zone handling deferred to P4"
requirements-completed: [SC-1, SC-2, SC-3, SC-4, SC-5]
duration: 11min
completed: "2026-06-03"
---

# Phase P3 Plan 05: Noticeboard Components Summary

**Three UI components built to the approved UI-SPEC (AiTodayStrip + BoardCard x4 + TasksSection) and wired into the /gymos noticeboard route: live metric subheadings via useActionQuery, optimistic approve/reject/complete mutations, AlertDialog gate for WhatsApp sends.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-03T17:24:52Z
- **Completed:** 2026-06-03T17:35:31Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- AiTodayStrip: full-width strip with idle/active states, IconMessage (not sparkle/wand/robot), pending proposals badge — built to UI-SPEC §AiTodayStrip
- BoardCard: 4-section configurable component with per-section metric queries (Skeleton loading / Tooltip error), AI note inset, proposal zone with AlertDialog gate for `send-template-to-members` and direct approve for `create-checkout-link` (clipboard copy on success)
- TasksSection: priority strips via `border-l-4` color, optimistic complete toggle (IconCircle → IconCircleCheck + opacity-50 line-through), empty state with CTA copy
- gymos._index.tsx: scaffold placeholder divs replaced; all three components wired with correct props from loader data; grid layout matches UI-SPEC responsive breakpoints

## Task Commits

1. **Task 1: AiTodayStrip + TasksSection** - `81d7944c` (feat)
2. **Task 2: BoardCard** - `b823f407` (feat)
3. **Task 3: Wire into noticeboard route** - `b2d78dcd` (feat)

## Files Created/Modified

- `apps/staff-web/app/components/gymos/Noticeboard/AiTodayStrip.tsx` — Full-width AI-today strip, idle/active states, IconMessage, pending badge
- `apps/staff-web/app/components/gymos/Noticeboard/BoardCard.tsx` — Section card: metric subheading (Skeleton/Tooltip), note inset, proposal zone (AlertDialog for sends)
- `apps/staff-web/app/components/gymos/Noticeboard/TasksSection.tsx` — Priority-stripped task list, optimistic complete toggle, empty state
- `apps/staff-web/app/routes/gymos._index.tsx` — Scaffold placeholders replaced with live AiTodayStrip + 4x BoardCard + TasksSection

## Decisions Made

- **useSectionMetric calls all hooks unconditionally:** React's rules of hooks require hooks to be called in the same order on every render. All 4 metric hooks (inbox, schedule, members, revenue) are called at the top of `useSectionMetric`, then the appropriate result is returned based on `section`. This is the correct pattern for conditional hook results.
- **ProposalRow local state vs React Query cache:** The proposal zone uses a local `useState<"pending"|"loading"|"dismissed">` for optimistic transitions rather than manipulating the React Query cache. Since proposals are loaded via SSR loader (not useActionQuery), there is no live query key to invalidate client-side. The loader re-runs on navigation; `useDbSync` polling will refresh proposals on the next 2s poll cycle.
- **Per-task Approve scrolls to card (V1):** The TasksSection's Approve button for tasks with `proposalId` scrolls to `data-proposal-id` attribute on the matching ProposalRow in a BoardCard. This avoids duplicating the AlertDialog logic; the full interaction gate lives only in BoardCard.
- **Revenue subheading uses net30d from list-revenue:** The plan specified `mrrPounds` as the `text-2xl` PRIMARY metric value and net30d as the subheading. This matches the UI-SPEC §Revenue card: MRR is visually dominant, net growth is the subheading.

## Deviations from Plan

None — plan executed exactly as written. The relative-time helper was implemented as pure JS (no date-fns-tz dependency) which the UI-SPEC §Non-Blocking Open Questions explicitly lists as acceptable for V1 note timestamps.

## Known Stubs

None. All components are fully wired:
- AiTodayStrip renders real loader data (ai_today note)
- BoardCard fetches live metrics via useActionQuery and renders real proposals from the loader
- TasksSection renders real tasks from the loader with real complete-task mutations
- All approve/reject/complete mutations call real action endpoints

The live metric subheadings, the propose→approve→execute click-path, and real board content (agent-authored notes + tasks + proposals) are deferred to the Plan 07 e2e smoke on the live Vercel deploy. The UI is structurally complete and wired; the data population depends on the agent calling the Tier 2/3 actions (Plan 06 posture update enables this).

## Self-Check: PASSED

| Check | Result |
|---|---|
| `AiTodayStrip.tsx` exists | FOUND |
| `AiTodayStrip.tsx` contains "IconMessage" | FOUND |
| `AiTodayStrip.tsx` contains no sparkle/wand/robot imports | VERIFIED (only in comment) |
| `AiTodayStrip.tsx` contains "AI READY" and "AI NOTE" | FOUND |
| `AiTodayStrip.tsx` contains "pending" badge | FOUND |
| `AiTodayStrip.tsx` contains "min-h-[44px]" | FOUND |
| `TasksSection.tsx` contains "border-l-4", "border-l-red-500", "border-l-amber-400" | FOUND |
| `TasksSection.tsx` contains "IconCircle" and "IconCircleCheck" | FOUND |
| `TasksSection.tsx` contains "No tasks yet" | FOUND |
| `TasksSection.tsx` contains "The agent will create tasks here" | FOUND |
| `TasksSection.tsx` uses useActionMutation("complete-task") with onMutate + onError | FOUND |
| `BoardCard.tsx` contains useActionQuery for all 5 list-* actions | FOUND |
| `BoardCard.tsx` contains useActionMutation("approve-proposal") | FOUND |
| `BoardCard.tsx` contains useActionMutation("reject-proposal") | FOUND |
| `BoardCard.tsx` AlertDialog title: "Send ... WhatsApp message..." | FOUND |
| `BoardCard.tsx` AlertDialog description: "will be skipped by the worker. This action cannot be undone." | FOUND |
| `BoardCard.tsx` parses paramsJson (JSON.parse) and reads memberIds + templateName | FOUND |
| `BoardCard.tsx` uses plain <div> for label (not CardTitle) | VERIFIED |
| `BoardCard.tsx` uses Skeleton for loading | FOUND |
| `BoardCard.tsx` uses Tooltip-wrapped "—" for error | FOUND |
| `BoardCard.tsx` revenue branch renders MRR with "text-2xl font-semibold" | FOUND |
| `BoardCard.tsx` clipboard copy for create-checkout-link | FOUND |
| `gymos._index.tsx` imports AiTodayStrip, BoardCard, TasksSection | FOUND |
| `gymos._index.tsx` has grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-4 | FOUND |
| `gymos._index.tsx` data-noticeboard-* placeholder divs removed | VERIFIED (count: 0) |
| `tsc --noEmit` exits 0 | PASSED |
| Commit `81d7944c` exists | FOUND |
| Commit `b823f407` exists | FOUND |
| Commit `b2d78dcd` exists | FOUND |
