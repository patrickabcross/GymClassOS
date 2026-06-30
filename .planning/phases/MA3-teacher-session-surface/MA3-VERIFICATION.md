---
phase: MA3-teacher-session-surface
verified: 2026-06-30T22:05:00Z
status: human_needed
score: 3/3 requirements verified (code); on-device iOS verification device-gated
human_verification:
  - test: "Teacher signs in (email in RUNSTUDIO_TEACHER_EMAILS, trainers.user_id linked) and lands on the teacher tab set (Schedule + Profile), no member booking tabs, no agent FAB"
    expected: "Silent teacher landing; FAB absent; teacher tabs only"
    why_human: "Requires EAS dev build on a physical iPhone (Apple Developer gate, same as MA1-03); cannot run from Windows simulator"
  - test: "Teacher with no assigned sessions / unlinked trainer sees a clear empty state, not an error"
    expected: "'No sessions assigned to you this week.' (linked) or 'not linked to a trainer yet — contact the studio.' (unlinked)"
    why_human: "On-device runtime + live Neon data state; device-gated"
  - test: "Teacher taps a session → roster → taps a member → optimistic Checked-in tick; POST /api/m/teacher/check-in fires and booking flips to attended (Meta Schedule CAPI fires inside chokepoint)"
    expected: "Optimistic tick, server confirms attended, CAPI Schedule event enqueued"
    why_human: "On-device optimistic UI + live attendance write; device-gated"
---

# Phase MA3: Teacher Session Surface Verification Report

**Phase Goal:** A teacher opens the same app, lands silently in a teacher view of the schedule showing their assigned sessions, opens a session's roster, and checks members in — driving the existing attendance chokepoint — with no access to any admin or AI surface.
**Verified:** 2026-06-30T22:05:00Z
**Status:** human_needed (all code verified; only on-device iOS checks remain, device-gated per MA1-03 precedent)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | trainers.user_id exists as nullable TEXT (never boolean-as-int) | ✓ VERIFIED | schema.ts:289 `userId: text("user_id")` in `trainers` export, after `homeLocation`; migration db.ts:534-535 `version: 37` / `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS user_id TEXT` |
| 2 | requireTeacher resolves trainerId and 403s non-teachers WITHOUT claiming a gym_members row | ✓ VERIFIED | teacher-session.ts:77-89 — 401 no session, 403 `resolveRole(session.email) !== "teacher"`, then `resolveTrainerIdForUser`; zero references to gymMembers/claimMember/requireMember in the file |
| 3 | GET /api/m/me returns {role,...} for any authenticated caller (no member row) | ✓ VERIFIED | api.m.me.tsx:15-24 returns `{role, userId, email, trainerId}`; trainerId only for teachers; no requireMember; Nitro delegator me.get.ts present |
| 4 | Teacher schedule scoped to trainerId, empty-state-not-error | ✓ VERIFIED | api.m.teacher.schedule.tsx:17 returns `{items:[], trainerLinked:false}` when trainerId null; scoped `eq(classOccurrences.trainerId, teacher.trainerId)` |
| 5 | Teacher roster ownership-gated | ✓ VERIFIED | api.m.teacher.roster.tsx:31 `occ.trainerId !== teacher.trainerId` → 403; null trainerId always 403s; 400 no occurrenceId, 404 unknown |
| 6 | Check-in calls mark-booking-attended as caller; NO new attendance write | ✓ VERIFIED | api.m.teacher.check-in.tsx:56-59 `mod.default.schema.safeParse` + `mod.default.run`; zero `update(schema.bookings)`/`set({status` in file; ownership-gated line 50 |
| 7 | Agent FAB hidden for teachers; admin ops FAB preserved | ✓ VERIFIED | _layout.tsx:100 `if (role !== "member" && !isAdmin) return null;` — members→coach, admins→ops sheet, teachers→none |
| 8 | Teacher lands on teacher tab set, not member tabs | ✓ VERIFIED | (tabs)/_layout.tsx:18 `useRole()`; member tabs `href: isMember ? undefined : null`; teacher-schedule `href: isTeacher ? undefined : null` |
| 9 | Member coach SSE stays member-gated (403s a teacher) | ✓ VERIFIED | api.m.agent.stream.tsx:85 `requireMemberOrDemo`; member-session.ts:130/144 throws 403 "No membership on file" when no gym_members row matches — a teacher has none |
| 10 | Admin SSE requireAdmin would 403 a teacher (MA4, on master) | ✓ VERIFIED | admin-session.ts:32-38 `requireAdmin` throws 403 when `ctx.role !== "admin"` — a teacher 403s |
| 11 | Migration is additive-only (no rename/drop) | ✓ VERIFIED | Only DDL is `ADD COLUMN IF NOT EXISTS`; no DROP/RENAME/TRUNCATE in v37 |

**Score:** 11/11 code truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/staff-web/server/db/schema.ts` | trainers.userId text column | ✓ VERIFIED | Line 289, plain `text("user_id")` |
| `apps/staff-web/server/plugins/db.ts` | additive migration v37 | ✓ VERIFIED | Lines 533-536 |
| `apps/staff-web/server/lib/teacher-session.ts` | requireTeacher + sessionFromRequest + resolveTrainerIdForUser | ✓ VERIFIED | All three exported; no gym_members |
| `apps/staff-web/app/routes/api.m.me.tsx` + `server/routes/api/m/me.get.ts` | role surface + delegator | ✓ VERIFIED | Both present |
| `apps/staff-web/app/routes/api.m.teacher.schedule.tsx` + delegator | scoped schedule | ✓ VERIFIED | Both present (delegator confirmed in teacher/ dir) |
| `apps/staff-web/app/routes/api.m.teacher.roster.tsx` + delegator | ownership-gated roster | ✓ VERIFIED | Both present |
| `apps/staff-web/app/routes/api.m.teacher.check-in.tsx` + delegator | chokepoint caller | ✓ VERIFIED | Both present (check-in.post.ts) |
| `packages/mobile-app/lib/use-role.ts` | useRole hook | ✓ VERIFIED | Reads /api/m/me, defaults member |
| `packages/mobile-app/app/_layout.tsx` | FAB gate + teacher-roster Stack.Screen | ✓ VERIFIED | Gate line 100; Stack.Screen line 213 |
| `packages/mobile-app/app/(tabs)/_layout.tsx` | role-branched tabs | ✓ VERIFIED | href toggles by role |
| `packages/mobile-app/app/(tabs)/teacher-schedule.tsx` | assigned list + empty states | ✓ VERIFIED | trainerLinked-keyed empty copy; navigates to roster |
| `packages/mobile-app/app/teacher-roster.tsx` | roster + optimistic check-in | ✓ VERIFIED | onMutate/onError/onSuccess; attended tick |

All three Nitro delegators present under `server/routes/api/m/teacher/` (schedule.get.ts, roster.get.ts, check-in.post.ts).

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| teacher-session.ts | role-resolver.ts | `resolveRole(session.email) !== "teacher"` | ✓ WIRED |
| teacher-session.ts | trainers.user_id | `eq(schema.trainers.userId, userId)` | ✓ WIRED |
| api.m.me.tsx | teacher-session.ts | sessionFromRequest + resolveTrainerIdForUser | ✓ WIRED |
| check-in.tsx | mark-booking-attended.ts | `mod.default.run(parsed.data)` | ✓ WIRED |
| check-in.tsx | class_occurrences.trainer_id | ownership `row.occTrainerId !== teacher.trainerId` | ✓ WIRED |
| _layout.tsx (mobile) | GET /api/m/me (via useRole/whoami) | FAB gate `role !== "member" && !isAdmin` | ✓ WIRED |
| teacher-roster.tsx | POST /api/m/teacher/check-in | useMutation apiFetch | ✓ WIRED |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| TCH-01 (assigned schedule + roster, scoped, empty-state) | MA3-01/02/03 | ✓ SATISFIED | schema/migration v37, requireTeacher, scoped schedule + roster endpoints, teacher tab + roster screen |
| TCH-02 (check-in drives chokepoint) | MA3-02/03 | ✓ SATISFIED | check-in route is pure caller of mark-booking-attended; optimistic mobile check-in |
| TCH-03 (no admin/AI surface for teachers) | MA3-01/03 | ✓ SATISFIED | FAB hidden for teachers; member coach SSE 403s teacher; admin SSE requireAdmin 403s teacher |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| `apps/staff-web/actions/mark-booking-attended.ts` (lines 88/95) | `db.execute` type-inference TS2339 | ℹ️ Info | PRE-EXISTING, unmodified by MA3, runtime-safe (live chokepoint). Logged in deferred-items.md. NOT an MA3 gap. |
| `packages/mobile-app/app/(tabs)/index.tsx:546` | `fontVariant` readonly-tuple TS2769 | ℹ️ Info | PRE-EXISTING, member-Home, unmodified by MA3. NOT an MA3 gap. |

No stubs, TODOs, placeholders, or hollow data found in MA3 surfaces. All endpoints wired to live Drizzle queries / the real attendance chokepoint.

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
| -------- | ----- | ------ | ------ |
| MA3 staff-web files type-check | `tsc --noEmit -p tsconfig.json` filtered to MA3 files | NO_ERRORS_IN_MA3_FILES | ✓ PASS |
| Nitro delegators exist | Glob `server/routes/api/m/teacher/*.ts` | schedule.get.ts, roster.get.ts, check-in.post.ts | ✓ PASS |
| No new attendance write in check-in | grep `update(schema.bookings)` | 0 matches | ✓ PASS |
| Migration additive-only | grep DROP/RENAME/TRUNCATE in v37 | none | ✓ PASS |

### Human Verification Required

On-device iOS verification (teacher landing, empty states, optimistic check-in) is EAS/Apple-gated — same gate as MA1-03 (Windows host, no iOS simulator; needs EAS dev build under the customer's Apple Developer account). Classified device-gated, not a code gap. See frontmatter `human_verification`.

Operator runtime steps are config, not code gaps:
- Apply migration v37 to Neon `billowing-sun-51091059` (DONE per task prompt)
- Populate `trainers.user_id` by email per HUSTLE teacher
- Set `RUNSTUDIO_TEACHER_EMAILS` on Vercel (until set, all users resolve to role=member)

### Gaps Summary

No code gaps. All three requirements (TCH-01, TCH-02, TCH-03) are fully implemented and wired: the additive trainers.user_id column + migration v37, the requireTeacher gate (no member-row claim), the role surface and three ownership-gated teacher endpoints (check-in is a pure caller of the single attendance chokepoint — no second write path), and the mobile role-branched UI with the agent FAB hidden for teachers while preserving MA4's admin ops sheet. The two tsc errors present in the tree are pre-existing in files untouched by MA3 and are logged in deferred-items.md.

Status is human_needed solely because the on-device iOS flow (silent teacher landing, empty states, optimistic check-in) can only be confirmed on an EAS dev build behind the Apple Developer gate — the same device-gate accepted for MA1-03.

---

_Verified: 2026-06-30T22:05:00Z_
_Verifier: Claude (gsd-verifier)_
