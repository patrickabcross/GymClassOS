---
phase: AE3-members-campaigns-write-tools
plan: 02
subsystem: staff-web-campaigns
tags: [campaigns, segments, agent-actions, application-state, live-refresh]
requires:
  - "@agent-native/core application_state (writeAppState/readAppState)"
  - "send-template-to-members action (existing send gate)"
  - "whatsapp_opt_in opt-in gate (reused verbatim)"
provides:
  - "save-segment agent action (writes filter specs to gymos-campaign-segments app-state key)"
  - "matchesSpec evaluator + SegmentFilters/EvalMember types (exported from gymos.campaigns.tsx)"
  - "composable 3-axis segment builder UI + at-risk preset"
affects:
  - "apps/staff-web/app/routes/gymos.campaigns.tsx"
  - "apps/staff-web/actions/ (new save-segment action)"
tech-stack:
  added: []
  patterns:
    - "Segment = stored filter spec in application_state (no schema change)"
    - "app_state WRITE in action (request context exists), READ client-side via GET /_agent-native/application-state/:key (loader throws)"
    - "useChangeVersions(['action']) + useRevalidator live-refresh, plus client re-fetch of segments"
key-files:
  created:
    - "apps/staff-web/actions/save-segment.ts"
  modified:
    - "apps/staff-web/app/routes/gymos.campaigns.tsx"
decisions:
  - "Single app-state key gymos-campaign-segments holding a segments[] array (one fetch returns all) — read-modify-write inside the action"
  - "save-segment rejects an empty filter set (NO_FILTERS) so an 'everyone' segment is never saved by accident"
  - "At-risk preset is a selectable built-in segment; 'Customize as a new segment' pre-fills the builder (notAttendedInDays=14)"
  - "Eligible count recomputes per selected segment as matchesSpec(allMembers) ∩ the reused opt-in gate — gate not forked"
metrics:
  duration: 6m
  completed: 2026-06-18
  tasks: 3
  files: 2
---

# Phase AE3 Plan 02: Members + Campaigns Write Tools (Campaigns Segment Builder) Summary

Replaced the single hardcoded at-risk segment in the Campaigns tab with a composable, spec-driven segment builder (3 AND-composed axes) and added the agent-only `save-segment` action — both writing the identical filter spec to the same `application_state` key, with no schema change.

## What Shipped

- **`save-segment.ts` (AEM-04)** — agent-only `defineAction` that does a read-modify-write of the `gymos-campaign-segments` app-state array (`readAppState` → push → `writeAppState`). AND-composed filters: `minClassesAttended`, `notAttendedInDays`, `inquiryBefore`, `inquiryAfter`. Rejects an all-undefined filter set with `{error:"NO_FILTERS"}`. No `http` key (direct per AEX-02), `guard:allow-unscoped` on the framework-scoped app-state access, not in any gate file.
- **`gymos.campaigns.tsx` loader (AEM-03)** — over-fetches all members (limit 500) with three computed axis columns: `attendedCount` (COUNT attended bookings), `lastAttendedAt` (MAX class_occurrences.starts_at over attended bookings), `createdAt` (inquiry/lead date). Every correlated subquery keeps the literal `"gym_members"."id"` qualifier (no Postgres 42702). Exports a module-level `matchesSpec` evaluator + `SegmentFilters`/`EvalMember` types. Keeps the at-risk computation as a built-in preset. Generalizes the opt-in eligible gate over ALL members (reused verbatim, not forked). The loader does NOT read app_state.
- **`gymos.campaigns.tsx` component** — a "New segment" `Popover` (shadcn, progressive disclosure) with name + the three axis inputs, optimistic save via the `save-segment` action endpoint (UI/agent parity). A segment chooser shows the at-risk preset alongside custom segments. Saved segments are read client-side via `GET /_agent-native/application-state/gymos-campaign-segments`. `useChangeVersions(["action"])` + `useRevalidator` re-runs the loader AND re-fetches segments so an agent-built segment appears without a reload. The send footer's recipient list is the selected segment's matched ∩ eligible members.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | save-segment agent action | cf138062 | apps/staff-web/actions/save-segment.ts |
| 2 | Spec-driven evaluator + at-risk preset in loader | 792d37f3 | apps/staff-web/app/routes/gymos.campaigns.tsx |
| 3 | Segment builder UI + client read + live-refresh | b598e245 | apps/staff-web/app/routes/gymos.campaigns.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 component made independently compilable**
- **Found during:** Task 2
- **Issue:** The loader return shape changed (`counts.eligible` removed; `allMembers`/generalized `eligibleMemberIds` added), but the component (rewritten in Task 3) still referenced `counts.eligible`, so Task 2's `tsc --noEmit` would fail — violating the per-task atomic-commit + compile gate.
- **Fix:** Added a minimal `eligibleCount = eligibleMemberIds.length` local in the component and swapped the `counts.eligible` references to it, so Task 2 compiles standalone. Task 3 then replaced these with the per-segment `eligibleForSegment`/`eligibleCount` computation.
- **Files modified:** apps/staff-web/app/routes/gymos.campaigns.tsx
- **Commit:** 792d37f3 (Task 2), superseded by b598e245 (Task 3)

Otherwise the plan executed as written.

## Authentication Gates

None.

## Verification

- `cd apps/staff-web && npx tsc --noEmit` exits 0 after each task.
- `gymos-campaign-segments` appears in BOTH `save-segment.ts` and `gymos.campaigns.tsx` (same key) — confirmed.
- The campaigns loader contains NO `readAppState()` call (only documentation comments reference the name) — confirmed.
- The literal `"gym_members"."id"` qualifier is present in all 5 correlated-subquery occurrences (no 42702) — confirmed.
- `save-segment.ts` has no `http:` key and is not referenced in `propose-action.ts` / `approve-proposal.ts` (AEX-02 direct) — confirmed.
- Route hits `/_agent-native/application-state/`, uses `useChangeVersions(["action"])`, and submits to `/_agent-native/actions/save-segment` — confirmed.

## Human UAT (deferred — cannot be asserted by tsc; no local dev server)

On the live Vercel deploy:
1. Build a segment in the UI (e.g. attended ≥ 4, not attended in 21 days) → matched + eligible counts render; the at-risk preset stays selectable.
2. After AE3-03 exposes `save-segment` to the agent, ask the agent to "build a segment of members who attended 4+ classes but haven't been in 3 weeks" → the named segment appears in the Campaigns tab without a reload (actionVersion re-fetch).

## Known Stubs

None. (The `placeholder=` attributes flagged by the stub scan are legitimate HTML input hints, not unwired data.)

## Notes for Downstream (AE3-03)

- Agent exposure of `save-segment` (system-prompt Campaigns section in `agent-chat.ts` + AGENTS.md Agent Actions row + any `view-screen` campaigns branch) is intentionally NOT done here — it ships LAST per the system-prompt-ships-last constraint. The action is callable via its HTTP endpoint now (used by the UI), but the agent has no signal to call it until AE3-03 names it.
- The same `gymos-campaign-segments` app-state key and the `SegmentFilters` shape are the contract between the action and the route — keep them identical when extending.

## Self-Check: PASSED

- Created files exist: `save-segment.ts`, `gymos.campaigns.tsx` (modified), `AE3-02-SUMMARY.md`.
- Commits exist: cf138062, 792d37f3, b598e245.
