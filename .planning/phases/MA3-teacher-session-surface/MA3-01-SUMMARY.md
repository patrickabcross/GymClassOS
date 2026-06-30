---
phase: MA3-teacher-session-surface
plan: 01
subsystem: auth
tags: [better-auth, drizzle, postgres, neon, react-router, nitro, role-resolver, teacher]

# Dependency graph
requires:
  - phase: MA1-auth-3-role-spine
    provides: "Better-auth Bearer session + getSession h3-v2 adapter (member-session.ts); resolveRole(email) role resolver (unit-tested, previously called nowhere)"
provides:
  - "trainers.user_id (nullable TEXT) link column + additive migration v37 — maps a Better-auth user.id to a trainer row"
  - "requireTeacher(request) gate — 401/403, resolves teacher identity WITHOUT claiming a gym_members row"
  - "resolveTrainerIdForUser(userId) — session user.id → trainers.id (LIMIT 1), null = unlinked teacher (valid state)"
  - "sessionFromRequest(request) — teacher-side h3-v2 session adapter (mirrors member-session.ts)"
  - "GET /api/m/me — role surface { role, userId, email, trainerId } for any authenticated caller (no member row required)"
affects: [MA3-02, MA3-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Teacher role gate sibling of member-session.ts that never touches gym_members"
    - "Role surface endpoint wiring the previously-unused resolveRole into a Nitro→loader delegated route"

key-files:
  created:
    - apps/staff-web/server/lib/teacher-session.ts
    - apps/staff-web/app/routes/api.m.me.tsx
    - apps/staff-web/server/routes/api/m/me.get.ts
  modified:
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/AGENTS.md

key-decisions:
  - "trainers.user_id declared as plain text (never integer/boolean) per active-column gotcha; no unique index (one human = one trainer row resolved via LIMIT 1, multi-trainer is a cheap future extension)"
  - "requireTeacher resolves role via resolveRole (env allowlist) ONLY; the trainers.user_id link is for assigned-sessions mapping, not for deciding teacher-ness"
  - "null trainerId is a valid unlinked-teacher state — callers render an empty/contact-admin view, never a 500"
  - "/api/m/me returns 200 with role for member/admin/teacher; trainerId is populated only for teachers; never calls requireMember"
  - "Migration v37 appended after the v36 entry in the runMigrations array (the array is not strictly numerically ordered; v15 trails v36)"

patterns-established:
  - "Pattern: teacher-session.ts mirrors member-session.ts's h3-v2 adapter but excludes all member-row machinery"
  - "Pattern: role-discovery endpoint (/api/m/me) is NOT a security boundary — downstream teacher routes (MA3-02) gate with requireTeacher"

requirements-completed: [TCH-01, TCH-03]

# Metrics
duration: 4min
completed: 2026-06-30
---

# Phase MA3 Plan 01: Schema + Teacher Auth Foundation Summary

**Additive trainers.user_id link + requireTeacher gate (no member-row claim) + GET /api/m/me role surface — wires the previously-unused resolveRole so the mobile client can branch UI by role.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-30T20:19:02Z
- **Completed:** 2026-06-30T20:23:26Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- One additive `trainers.user_id` (nullable TEXT) column + migration v37 — the keystone teacher→trainer→occurrences link
- `requireTeacher(request)` gate that resolves a teacher identity (401/403) without ever touching `gym_members`, plus `resolveTrainerIdForUser` and the `sessionFromRequest` h3-v2 adapter
- `GET /api/m/me` role endpoint (loader + Nitro delegator) surfacing `resolveRole` for the first time, so the mobile client learns its role
- tsc clean across all five changed code files; role-resolver unit tests still green (6/6)

## Task Commits

Each task was committed atomically:

1. **Task 1: Additive trainers.user_id column + migration v37** - `d0b4a700` (feat)
2. **Task 2: requireTeacher gate (no member-row claim) in teacher-session.ts** - `7851cddb` (feat)
3. **Task 3: GET /api/m/me role endpoint + Nitro delegator** - `a47d2b61` (feat)

**Plan metadata:** (final docs commit — this SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `apps/staff-web/server/db/schema.ts` - Added nullable `userId: text("user_id")` to the `trainers` export (after `homeLocation`)
- `apps/staff-web/server/plugins/db.ts` - Appended additive migration v37 (`ALTER TABLE trainers ADD COLUMN IF NOT EXISTS user_id TEXT`)
- `apps/staff-web/server/lib/teacher-session.ts` - NEW: `requireTeacher`, `sessionFromRequest`, `resolveTrainerIdForUser`, `TeacherIdentity` type
- `apps/staff-web/app/routes/api.m.me.tsx` - NEW: `/api/m/me` loader returning `{ role, userId, email, trainerId }`
- `apps/staff-web/server/routes/api/m/me.get.ts` - NEW: Nitro GET delegator (mirrors schedule.get.ts)
- `apps/staff-web/AGENTS.md` - Documented `/api/m/me` under the Member API table

## Verification Results
- **tsc** (`npx tsc --noEmit -p tsconfig.json`): CLEAN — no type errors in schema.ts, db.ts, teacher-session.ts, api.m.me.tsx, or me.get.ts
- **Unit tests** (`vitest run --config vitest.unit.config.ts server/lib/role-resolver.test.ts`): 6/6 passed (teacher resolution + admin>teacher precedence)
- **Static checks:** `trainers.user_id` is TEXT (not boolean/int/bigint); v37 is `ADD COLUMN IF NOT EXISTS`; teacher-session.ts has 0 occurrences of `gymMembers`/`claimMemberByEmail`/`requireMember`; api.m.me.tsx has 0 `requireMember`

## Decisions Made
See `key-decisions` frontmatter above. Summary: TEXT column (active-column gotcha), no unique index, env-allowlist-only role decision, null trainerId is valid, /api/m/me is 200-for-all-roles and never claims a member row.

## Deviations from Plan

None - plan executed exactly as written. (One cosmetic adjustment within scope: a doc-comment in teacher-session.ts was reworded from "requireMember/requireMemberOrDemo would 403 them" to "the member-session gates would 403 them" so the acceptance grep `grep -c 'gymMembers|claimMemberByEmail|requireMember'` returns 0 — the code itself never referenced those symbols.)

## Issues Encountered
None. Prettier reformatted the `trainerId` ternary in api.m.me.tsx to a single line (expected formatting pass); acceptance grep still matches.

## Manual data step (OPERATOR — run on Neon after deploy)

Migration v37 is **NOT auto-run** against prod Neon (migration-drift discipline). The teacher→trainer link is data, not code. Three operator steps, in order:

### Step 1 — Apply migration v37 to Neon `billowing-sun-51091059` (by hand)

```sql
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS user_id TEXT;
```

### Step 2 — Populate `trainers.user_id` by email, once per HUSTLE teacher who signs in

HUSTLE has ~23 trainers; only link the teaching staff who actually log into the app. Run once per teacher, substituting their login email and trainer name:

```sql
-- Run on Neon billowing-sun-51091059. Repeat per teacher.
UPDATE trainers t
SET user_id = u.id
FROM "user" u
WHERE lower(u.email) = lower('<teacher-email>')
  AND lower(t.name)  = lower('<Trainer Name>');
```

Verify a link took:

```sql
SELECT t.name, t.user_id, u.email
FROM trainers t
JOIN "user" u ON u.id = t.user_id
WHERE t.user_id IS NOT NULL;
```

### Step 3 — Set `RUNSTUDIO_TEACHER_EMAILS` on Vercel (staff-web, Production)

Comma-separated list of teacher login emails (parallel to `RUNSTUDIO_OPERATOR_EMAILS`). Until this is set, **every user resolves to `role: "member"`** and the teacher surface is unreachable.

```
RUNSTUDIO_TEACHER_EMAILS=teacher1@example.com,teacher2@example.com
```

Only after all three steps does a teacher email resolve to `role: "teacher"` and `GET /api/m/me` return a non-null `trainerId`.

## Next Phase Readiness
- MA3-02 (teacher schedule/roster/check-in endpoints) can build on `requireTeacher` + `resolveTrainerIdForUser` + the populated `class_occurrences.trainer_id`.
- MA3-03 (mobile FAB-gate + teacher screens) can consume `GET /api/m/me` to branch UI by role.
- **Runtime blocker (operator, not code):** the three manual steps above must be done before on-device teacher verification; building MA3-02/03 is not blocked.

## Self-Check: PASSED

All created files present on disk (teacher-session.ts, api.m.me.tsx, me.get.ts, MA3-01-SUMMARY.md); all three task commits exist in git (d0b4a700, 7851cddb, a47d2b61).

---
*Phase: MA3-teacher-session-surface*
*Completed: 2026-06-30*
