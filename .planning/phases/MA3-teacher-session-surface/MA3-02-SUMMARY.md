---
phase: MA3-teacher-session-surface
plan: 02
subsystem: teacher-api
tags: [react-router, nitro, drizzle, postgres, neon, teacher, attendance, chokepoint, ownership-gate]

# Dependency graph
requires:
  - phase: MA3-01
    provides: "requireTeacher(request) gate + resolveTrainerIdForUser + trainers.user_id (migration v37); class_occurrences.trainer_id populated by LP3"
  - phase: MC2 (LIFE-03)
    provides: "mark-booking-attended attendance chokepoint (sole bookings.status='attended' writer; fires Meta Schedule CAPI)"
provides:
  - "GET /api/m/teacher/schedule — teacher's assigned occurrences (trainer_id scoped, next 7d, scheduled); 200 empty-state {items:[], trainerLinked} for unlinked/no-session teachers (never an error)"
  - "GET /api/m/teacher/roster?occurrenceId= — booked|attended bookings joined to gym_members, ownership-gated by trainer_id (403 foreign occurrence)"
  - "POST /api/m/teacher/check-in {bookingId} — caller of mark-booking-attended (single write path; CAPI preserved), ownership-gated by trainer_id"
  - "Three Nitro delegators under server/routes/api/m/teacher/ (five ../ depth)"
affects: [MA3-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Teacher resource routes reuse the api.m.schedule.tsx Query-A shape, scoped by trainer_id"
    - "Programmatic attendance write via the mark-booking-attended chokepoint (approve-proposal.ts mod.default.schema + run pattern) — no second write path"
    - "Ownership gate: booking/occurrence → trainer_id === requireTeacher().trainerId; null trainerId always 403s on owned-resource routes"
    - "Nested Nitro delegators (server/routes/api/m/teacher/) need five ../ to reach app/routes"

key-files:
  created:
    - apps/staff-web/app/routes/api.m.teacher.schedule.tsx
    - apps/staff-web/server/routes/api/m/teacher/schedule.get.ts
    - apps/staff-web/app/routes/api.m.teacher.roster.tsx
    - apps/staff-web/server/routes/api/m/teacher/roster.get.ts
    - apps/staff-web/app/routes/api.m.teacher.check-in.tsx
    - apps/staff-web/server/routes/api/m/teacher/check-in.post.ts
  modified:
    - apps/staff-web/AGENTS.md

key-decisions:
  - "Schedule loader returns 200 {items:[], trainerLinked:false} when trainerId is null (unlinked teacher) — an empty state, NOT an error (Pitfall 3 / success criterion 1)"
  - "Roster + check-in are ownership-gated BEFORE any data is returned/written: a null trainerId OR a foreign occurrence's trainer_id always 403s — never leaks another teacher's session"
  - "Check-in is a pure CALLER of mark-booking-attended (mod.default.schema.safeParse + mod.default.run); NO new attendance UPDATE — the Meta Schedule CAPI event still fires inside the chokepoint (single write path preserved). Static check: 0 update(schema.bookings)/set({status writes in the new code"
  - "No new agent LLM tool added (teachers have no AI surface — TCH-03); the four-area Actions obligation is satisfied by AGENTS.md documentation only"
  - "Schedule loader additionally selects class_occurrences.location (present in schema v24) on top of the member-schedule field set"

requirements-completed: [TCH-01, TCH-02]

# Metrics
duration: 4min
completed: 2026-06-30
---

# Phase MA3 Plan 02: Teacher Resource Endpoints Summary

**Three teacher resource routes — assigned schedule (TCH-01), per-session roster (TCH-01, ownership-gated), and tap-to-check-in (TCH-02, a caller of the existing mark-booking-attended chokepoint with no new attendance write path) — each gated by requireTeacher and scoped by class_occurrences.trainer_id, plus three nested Nitro delegators and AGENTS.md docs.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-30T20:26:38Z
- **Completed:** 2026-06-30T20:30:57Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `GET /api/m/teacher/schedule` — occurrences scoped to the teacher's `trainerId` (next 7 days, status `scheduled`); an unlinked teacher (`trainerId` null) or one with no sessions gets HTTP 200 `{ items: [], trainerLinked }` — empty state, never an error
- `GET /api/m/teacher/roster?occurrenceId=` — `booked`+`attended` bookings joined to `gym_members` name, ownership-gated by `trainer_id` (403 on a foreign occurrence, 400 without `occurrenceId`, 404 unknown)
- `POST /api/m/teacher/check-in {bookingId}` — drives the EXISTING `mark-booking-attended` chokepoint as a library caller; NO new attendance write path; Meta Schedule CAPI still fires inside `.run()`; ownership-gated by `trainer_id`
- Three nested Nitro delegators at the correct five-`../` depth; all three endpoints documented in `apps/staff-web/AGENTS.md` Member API table

## Task Commits

Each task was committed atomically on master:

1. **Task 1: Teacher assigned-schedule endpoint (TCH-01) + Nitro delegator** - `488738db` (feat)
2. **Task 2: Per-session roster endpoint with ownership gate (TCH-01) + Nitro delegator** - `dfc803d6` (feat)
3. **Task 3: Check-in action route (TCH-02) — caller of mark-booking-attended + ownership gate + Nitro POST delegator + AGENTS.md** - `7887a5e4` (feat)

## Files Created/Modified
- `apps/staff-web/app/routes/api.m.teacher.schedule.tsx` - NEW: assigned-schedule loader (requireTeacher, trainer_id scope, empty-state)
- `apps/staff-web/server/routes/api/m/teacher/schedule.get.ts` - NEW: Nitro GET delegator (five ../)
- `apps/staff-web/app/routes/api.m.teacher.roster.tsx` - NEW: per-occurrence roster loader with ownership gate
- `apps/staff-web/server/routes/api/m/teacher/roster.get.ts` - NEW: Nitro GET delegator (five ../)
- `apps/staff-web/app/routes/api.m.teacher.check-in.tsx` - NEW: check-in action calling mark-booking-attended (no new write path)
- `apps/staff-web/server/routes/api/m/teacher/check-in.post.ts` - NEW: Nitro POST delegator (five ../)
- `apps/staff-web/AGENTS.md` - Documented the three teacher endpoints in the Member API table (incl. the check-in-is-a-caller / no-new-write / no-new-agent-tool notes)

## Verification Results
- **tsc (scoped, per task):** `npx tsc --noEmit -p tsconfig.json` filtered to `teacher.schedule` / `teacher.roster` / `teacher.check-in` — CLEAN for all six new files.
- **Static no-new-attendance-write check:** `grep -c "update(schema.bookings)\|set({ status" app/routes/api.m.teacher.check-in.tsx` → **0**. Check-in writes attendance ONLY via `mod.default.run(parsed.data)`.
- **Ownership-gate checks:** `occ.trainerId !== teacher.trainerId` (roster) and `row.occTrainerId !== teacher.trainerId` (check-in) both present; both also 403 on a null `trainerId`.
- **Empty-state check:** `trainerLinked: false` present in schedule loader (200, not error).
- **Prettier:** ran on all six files (no reformatting needed).
- **Full-project tsc:** two PRE-EXISTING errors surfaced in `actions/mark-booking-attended.ts` (`db.execute` type-inference, lines 88/95) — that file is byte-identical to its MC3-01 state (commit `6f753b27`), unmodified by this plan. Logged to `deferred-items.md`, not fixed (scope boundary). MA3-02's own surface is fully tsc-clean.

## Decisions Made
See `key-decisions` frontmatter above. Summary: empty-state-not-error for unlinked/no-session teachers; ownership gate fires before any data return/write and a null trainerId always 403s on owned-resource routes; check-in is a pure caller of the single attendance chokepoint (CAPI preserved, zero new write paths); no new agent tool (teachers have no AI — TCH-03), docs satisfy the four-area Actions obligation.

## Deviations from Plan
None - plan executed exactly as written. (The schedule loader additionally selects `class_occurrences.location`, which the plan's own code block included; it is a real schema column from LP3 v24.)

## Deferred Issues
- Pre-existing `db.execute` tsc type-inference errors in `actions/mark-booking-attended.ts` (unmodified by this plan) — see `.planning/phases/MA3-teacher-session-surface/deferred-items.md`. Out of scope; runtime-safe (live chokepoint).

## Known Stubs
None. All three endpoints are wired to live Drizzle queries / the real attendance chokepoint. No hardcoded empty data, placeholders, or TODOs.

## Manual / runtime prerequisites (OPERATOR — from MA3-01, still required)
These endpoints return real data only after the MA3-01 operator steps are done on Neon `billowing-sun-51091059`: (1) apply migration v37 (`ALTER TABLE trainers ADD COLUMN IF NOT EXISTS user_id TEXT`); (2) populate `trainers.user_id` by email per teacher; (3) set `RUNSTUDIO_TEACHER_EMAILS` on Vercel. Until then every login resolves to `role: member` and the teacher routes 403. Building/shipping MA3-02 is not blocked by this.

## Next Phase Readiness
- MA3-03 (mobile teacher screens) can consume all three endpoints: `GET /api/m/teacher/schedule` for the landing list, `GET /api/m/teacher/roster?occurrenceId=` for a session's members, and `POST /api/m/teacher/check-in {bookingId}` for tap-to-check-in. Role is learned from `GET /api/m/me` (MA3-01).

## Self-Check: PASSED

All six created files present on disk; AGENTS.md modified; all three task commits exist in git (488738db, dfc803d6, 7887a5e4).

---
*Phase: MA3-teacher-session-surface*
*Completed: 2026-06-30*
