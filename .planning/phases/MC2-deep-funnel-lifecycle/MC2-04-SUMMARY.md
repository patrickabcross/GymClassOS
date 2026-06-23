---
phase: MC2-deep-funnel-lifecycle
plan: "04"
subsystem: staff-web / meta-capi / attendance
tags: [meta, capi, lifecycle, attendance, schedule, staff-web, chokepoint]
dependency_graph:
  requires: [MC2-01]
  provides: [mark-booking-attended action, LIFE-04 ops note, Schedule CAPI enqueue chokepoint]
  affects: [apps/staff-web/actions/mark-booking-attended.ts, apps/staff-web/AGENTS.md]
tech_stack:
  added: []
  patterns: [defineAction no-http mutation, best-effort try/catch enqueue (D-17), idempotent no-op on already-attended, SHA-256 PII hashing, guard:allow-unscoped single-tenant]
key_files:
  created:
    - apps/staff-web/actions/mark-booking-attended.ts
  modified:
    - apps/staff-web/AGENTS.md
decisions:
  - "mark-booking-attended is NOT added to agent-chat.ts (D-11 — minimal backend transition, not an agent surface)"
  - "Enqueue failure is best-effort (D-17) — try/catch isolates it from the status write"
  - "Idempotency via status==='attended' early return prevents second enqueue on re-mark"
  - "event_id is memberId:occurrenceId — verbatim from LIFE-03 spec; pg-boss singletonKey is the worker backstop"
  - "attendedAt uses new Date().toISOString() — consistent with text column convention in bookings table"
metrics:
  duration: 205s
  completed_date: "2026-06-23"
  tasks_completed: 2
  files_changed: 2
---

# Phase MC2 Plan 04: Attendance Chokepoint + LIFE-04 Ops Note Summary

Single attendance-transition chokepoint (`mark-booking-attended`) that flips `bookings.status='attended'` and fires exactly one Meta Schedule CAPI event per (member, occurrence), plus LIFE-04 ops note documenting Contact as the recommended campaign optimisation target.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Build mark-booking-attended action (status flip + Schedule enqueue) | ec92f8c5 | apps/staff-web/actions/mark-booking-attended.ts |
| 2 | LIFE-04 ops note + AGENTS.md action-table row + two-exposure decision | c7f202d2 | apps/staff-web/AGENTS.md |

## What Was Built

**Task 1 — mark-booking-attended action (apps/staff-web/actions/mark-booking-attended.ts)**

The single code path that sets `bookings.status = 'attended'`. Implements the full LIFE-03 flow:

1. SELECT booking (id, occurrenceId, memberId, status, attendedAt).
2. Not found → `{ error: "BOOKING_NOT_FOUND" }`.
3. Already attended → `{ attended: true }` early return — no second enqueue (idempotency).
4. Cancelled → `{ error: "BOOKING_CANCELLED" }`.
5. UPDATE bookings SET `status='attended'`, `attendedAt=new Date().toISOString()`.
6. Best-effort try/catch: resolve `stageEventMap` config, ensure attribution row (INSERT ON CONFLICT DO NOTHING), read fbc/fbp, fetch + SHA-256 hash member email/phone, then `enqueueMetaCapiEvent` with `eventId: memberId:occurrenceId`, `stageKey: "schedule"`, `actionSource: "system_generated"`.
7. Return `{ attended: true }`.

Key design decisions enforced:
- No `http` key — agent/staff-only mutation (D-11).
- Enqueue failure isolated via try/catch — never undoes status write (D-17).
- Does NOT write `schedule_sent_at` — the worker handler owns that on success.
- 6 `guard:allow-unscoped` markers on gym/attribution table queries.
- pg-boss singletonKey on `memberId:occurrenceId` is the worker backstop for concurrent re-marks.

`staff-web tsc --noEmit` clean (0 errors).

**Task 2 — AGENTS.md documentation (apps/staff-web/AGENTS.md)**

Three documentation additions:

A) New section "Meta Conversion Tracking — campaign optimisation target" (LIFE-04): documents Contact as the recommended primary Meta campaign optimisation target for top-of-funnel lead campaigns; explains the `stageEventMap` rename-without-code property.

B) Action-table row for `mark-booking-attended`: marks it as a staff/programmatic chokepoint, not an agent LLM tool; documents idempotency and D-17 best-effort enqueue.

C) Two-exposure note documenting `mark-booking-attended` (MC2 LIFE-03) as intentionally NOT in `agent-chat.ts` (D-11 decision on record for future agents).

`agent-chat.ts` is untouched — verified.

## Decisions Made

- `mark-booking-attended` is NOT added to `agent-chat.ts` (D-11 — minimal backend transition, not an agent surface)
- Enqueue failure is best-effort (D-17) — try/catch isolates it from the status write; no second status mutation on retry
- Idempotency: `status==="attended"` early return prevents double-enqueue on re-mark; pg-boss singletonKey is the concurrency backstop at the worker
- `event_id = memberId:occurrenceId` verbatim from LIFE-03 spec
- `attendedAt = new Date().toISOString()` — consistent with text column convention on `bookings.attendedAt`
- No migration needed — `attended` enum value and `attended_at` column pre-exist in schema

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `mark-booking-attended` is fully implemented: status flip, attendedAt stamp, attribution upsert, PII hashing, Schedule CAPI enqueue, D-17 error isolation. The ops note is complete. No placeholder text or empty data flows.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/staff-web/actions/mark-booking-attended.ts | FOUND |
| apps/staff-web/AGENTS.md | FOUND |
| .planning/phases/MC2-deep-funnel-lifecycle/MC2-04-SUMMARY.md | FOUND |
| Commit ec92f8c5 (Task 1) | FOUND |
| Commit c7f202d2 (Task 2) | FOUND |
