# Phase MA3: Teacher Session Surface — Context

**Gathered:** 2026-06-30
**Status:** Ready for planning
**Source:** Research recommendations (defaulted for v1 momentum) + MA3-RESEARCH.md

<domain>
## Phase Boundary

A teacher opens the same app, lands silently in a teacher view of the schedule showing THEIR assigned sessions, opens a session's roster, and checks members in — driving the EXISTING `mark-booking-attended` attendance chokepoint as a caller (no new write path) — with no access to any admin or AI surface.
</domain>

<decisions>
## Implementation Decisions

### Teacher → assigned-sessions mapping (the keystone gap) — LOCKED
- `class_occurrences.trainer_id` is already POPULATED (LP3 engine + create-class-occurrence) and soft-refs `trainers`. The other column `instructor_user_id` is NULL everywhere (dead) — do NOT use it.
- `trainers` has only `id, name, home_location, active` — no email, no user_id. **Close the gap with ONE additive migration: `trainers.user_id` (TEXT, nullable, keyed to `user.id`).** Declare it `text` — NEVER boolean-as-int (active-column gotcha). Additive only; NOT auto-run — apply to Neon `billowing-sun-51091059` by hand per migration-drift discipline. Bump the next `runMigrations` version after v36.
- A teacher's assigned sessions = `class_occurrences WHERE trainer_id = (SELECT id FROM trainers WHERE user_id = <session user.id>)`. Add a resolver for session-user → trainerId.

### Teacher role resolution — LOCKED: env allowlist
- Teacher ROLE is decided by an email allowlist `RUNSTUDIO_TEACHER_EMAILS` (parallel to `RUNSTUDIO_OPERATOR_EMAILS`), via `resolveRole(email)` in `server/lib/role-resolver.ts`. Confirm/extend resolveRole to return `teacher` for these emails. Role is env-driven; the `trainers.user_id` link is ONLY for the assigned-sessions mapping, NOT for deciding role.
- `resolveRole` exists + is unit-tested but is currently CALLED NOWHERE. MA3 must surface it via a new `GET /api/m/me` endpoint so the client learns its role and renders the teacher landing.

### Teacher auth gate — LOCKED
- Add `requireTeacher(request)`: resolves the Better-auth session + role, returns the teacher identity, but does NOT claim/require a `gym_members` row (teachers have no member row — `requireMemberOrDemo` would 403 them). Mirror the session adapter in `member-session.ts`. 403 for non-teachers.

### Check-in (TCH-02) — LOCKED: caller of the existing chokepoint
- The teacher check-in route invokes the EXISTING `mark-booking-attended` action as a library call (pattern: `mod.default.schema` + `mod.default.run({ bookingId })`, per `approve-proposal.ts`). The Meta `Schedule` CAPI event still fires inside it; single attendance write path preserved; NO new attendance UPDATE. Gate so a teacher can only check in members for sessions they own (their trainerId).

### Admin/AI exclusion (TCH-03) — LOCKED
- The agent FAB is currently rendered for EVERYONE in `packages/mobile-app/app/_layout.tsx`. Hide it for `role !== "member"` (teachers get NO AI surface). The member coach SSE stays member-gated.
- The "admin SSE rejects a teacher" half of TCH-03 targets the endpoint MA4 builds (`requireAdmin` 403). MA3 satisfies its part (FAB hidden + member coach member-gated); the admin-SSE 403 is MA4's AI-03. **Ordering note: execute MA4 before/with MA3 for the full TCH-03 guarantee.**

### trainers.user_id population — LOCKED: manual SQL for v1
- Populate `trainers.user_id` for HUSTLE via a manual by-email SQL data step (HUSTLE has ~23 trainers; small). Do NOT build an `update-trainer` extension for this in v1. Document the data step in the plan/summary.

### Claude's Discretion
- Teacher schedule/roster UI layout (reuse staff schedule loader patterns where sensible); empty-state copy; exact `/api/m/me` payload shape; route names for teacher schedule/roster/check-in (e.g. `/api/m/teacher/*`).
</decisions>

<specifics>
## Specific Ideas

- Empty state: a teacher with no assigned sessions sees a clear empty state, NOT an error (success criterion 1).
- Reuse the staff schedule/roster query patterns; bookings → gym_members join for the roster.
- Mobile tabs today are member-oriented; the app branches on role from `/api/m/me`.
</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/MA3-teacher-session-surface/MA3-RESEARCH.md` — the trainers schema reality, role-resolver gap, chokepoint invocation pattern, TCH-03/MA4 dependency
- `apps/staff-web/server/db/schema.ts` — trainers + class_occurrences (add trainers.user_id)
- `apps/staff-web/server/lib/role-resolver.ts` — resolveRole (extend for teacher) + role unit test
- `apps/staff-web/server/lib/member-session.ts` — session adapter to mirror for requireTeacher
- `apps/staff-web/actions/mark-booking-attended.ts` — the attendance chokepoint to call (caller only)
- `packages/mobile-app/app/_layout.tsx` — agent FAB to role-gate; tabs in `app/(tabs)/`
- `apps/staff-web/AGENTS.md` — mark-booking-attended description + schedule data model
</canonical_refs>

<deferred>
## Deferred Ideas

- An `update-trainer` UI/action path to set `user_id` — deferred; v1 uses a manual SQL data step.
- Teacher AI surface — explicitly none in v1 (FAB hidden for teachers).
</deferred>

---

*Phase: MA3-teacher-session-surface*
*Context gathered: 2026-06-30 (research defaults for v1)*
