---
phase: MA3-teacher-session-surface
plan: 03
subsystem: mobile-teacher-ui
tags: [expo, expo-router, react-native, tanstack-query, teacher, role-branch, optimistic-ui, feather]

# Dependency graph
requires:
  - phase: MA3-01
    provides: "GET /api/m/me {role, userId, email, trainerId}; resolveRole (RUNSTUDIO_TEACHER_EMAILS)"
  - phase: MA3-02
    provides: "GET /api/m/teacher/schedule {items,trainerLinked}; GET /api/m/teacher/roster?occurrenceId=; POST /api/m/teacher/check-in {bookingId}"
  - phase: MA4-03
    provides: "AgentFabAndSheet role-switch (isAdmin → admin ops endpoint/title); lib/whoami.ts fetchRole"
provides:
  - "lib/use-role.ts — useRole() hook reading GET /api/m/me once (TanStack Query, 5m staleTime), defaults to member"
  - "Role-branched tab set: member 5-tab vs teacher Schedule tab (href toggle), Profile shared"
  - "FAB hidden for teachers (role !== member && !isAdmin) — TCH-03; member coach + MA4 admin ops sheet preserved"
  - "Teacher assigned-schedule tab (app/(tabs)/teacher-schedule.tsx) — TCH-01, empty-states-not-errors"
  - "Roster + optimistic tap-to-check-in screen (app/teacher-roster.tsx) — TCH-02"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-branch via Expo Router href: undefined|null (tabs stay declared unconditionally — never unmount Tabs.Screen)"
    - "useRole defaults to member while loading (safe fallback); role discovery is UX-only, server requireTeacher is the boundary"
    - "Optimistic check-in mirrors schedule.tsx bookMutation (onMutate cache patch + onError rollback + onSuccess invalidate)"
    - "Empty states are copy keyed on trainerLinked (unlinked vs no-sessions), genuine errors keep a Retry view"

key-files:
  created:
    - packages/mobile-app/lib/use-role.ts
    - packages/mobile-app/app/(tabs)/teacher-schedule.tsx
    - packages/mobile-app/app/teacher-roster.tsx
  modified:
    - packages/mobile-app/app/_layout.tsx
    - packages/mobile-app/app/(tabs)/_layout.tsx

key-decisions:
  - "FAB gate reconciled with MA4: `role !== \"member\" && !isAdmin` (not the plan's literal `role !== \"member\"`). The plan predates MA4's shipped admin ops FAB; the literal would have clobbered it. Result: members → coach FAB, admins → MA4 ops sheet, teachers → no FAB. Still hidden while role is null (no AI flash for teachers)."
  - "FAB role source left on MA4's fetchRole/whoami (useState/useEffect) — untouched, to not clobber MA4. useRole (GET /api/m/me) is the role source for the tab branch only. Two cheap cached role calls (whoami + me); functionally equivalent {role}."
  - "Teacher tab set = Schedule + Profile; admin sees Profile only (admin ops live in the FAB ops sheet, MA4). Member keeps the original 5 tabs."
  - "Empty-state distinguishes trainerLinked=false (contact studio) vs linked+no-sessions (no sessions this week) — never an error toast (MA3-02 Pitfall 3 honoured client-side)."

requirements-completed: [TCH-01, TCH-02, TCH-03]

# Metrics
duration: 8min
completed: 2026-06-30
---

# Phase MA3 Plan 03: Mobile Teacher Surface Summary

**Role-branches the Expo app off GET /api/m/me: a `useRole` hook drives an href-toggled tab set (member 5-tab vs teacher Schedule + Profile), the agent FAB is hidden for teachers while the MA4 admin ops sheet is preserved (TCH-03), and a teacher gets an assigned-schedule list (TCH-01) plus a roster screen with optimistic tap-to-check-in (TCH-02) driving the existing mark-booking-attended chokepoint.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-30T20:35:49Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `lib/use-role.ts` — `useRole()` reads `GET /api/m/me` once (TanStack Query `["me"]`, 5-min staleTime), returns `{ role, trainerId, isLoading }`, defaults to `member` so the member surface is the safe fallback
- `app/_layout.tsx` — FAB gated: `if (role !== "member" && !isAdmin) return null;` (after the existing sign-in early-return). Teachers get NO AI surface (TCH-03); members keep the coach FAB; admins keep the MA4 "RunStudio Ops" sheet. Registered the pushed `teacher-roster` Stack.Screen
- `app/(tabs)/_layout.tsx` — `useRole()` branches the tab set via `href`: member → Home/Classes/Passes/Log, teacher → Schedule, Profile shared by all. Every `<Tabs.Screen>` stays declared unconditionally (Expo Router idiom)
- `app/(tabs)/teacher-schedule.tsx` (TCH-01) — `GET /api/m/teacher/schedule` grouped by day (mirrors member `schedule.tsx`, booking/pass stripped); each session Pressable → `router.push("/teacher-roster", {occurrenceId, title})`; empty states are copy keyed on `trainerLinked`; genuine errors keep a Retry view
- `app/teacher-roster.tsx` (TCH-02) — `useLocalSearchParams` → `occurrenceId/title`; `GET /api/m/teacher/roster?occurrenceId=`; optimistic check-in mutation (`onMutate` patches the row to `attended`, `onError` rolls back + inline toast, `onSuccess` invalidates) → `POST /api/m/teacher/check-in {bookingId}`; attended rows show a Checked-in tick; loading/error/empty all handled; no AI surface

## Task Commits

Each task committed atomically on master:

1. **Task 1: useRole hook + FAB teacher-gate + role-branched tab set (TCH-03 + routing)** — `5c04c2dc` (feat)
2. **Task 2: Teacher assigned-schedule tab (TCH-01)** — `34b97f1c` (feat)
3. **Task 3: Roster + tap-to-check-in screen (TCH-02)** — `3be6cc4d` (feat)

## Verification Results
- **tsc (scoped, per task):** mobile `npx tsc --noEmit` filtered to `use-role|_layout` / `teacher-schedule` / `teacher-roster` — CLEAN for all five MA3-03 files.
- **Acceptance greps (all present):** `export function useRole`; `role !== "member"` FAB gate; `teacher-roster` Stack.Screen; `useRole` + `href:` + `teacher-schedule` in tabs layout; `/api/m/teacher/schedule` + `teacher-roster` nav + `trainerLinked` + empty copy in the schedule tab; `/api/m/teacher/roster` + `/api/m/teacher/check-in` + `useLocalSearchParams` + `onMutate` + `attended` in the roster screen.
- **Prettier:** ran on all five files (no reformatting needed).
- **Full mobile tsc:** ONE pre-existing error in `app/(tabs)/index.tsx:546` (`fontVariant` readonly-tuple vs RN `FontVariant[]`) — a member-Home file NOT touched by this plan. Logged to `deferred-items.md`, not fixed (scope boundary). MA3-03's own five files are fully tsc-clean.

## Decisions Made
See `key-decisions` frontmatter. The load-bearing one: the FAB gate is `role !== "member" && !isAdmin`, not the plan's literal `role !== "member"`, to reconcile with MA4's already-shipped admin ops FAB (the plan predates it). This is the only intentional divergence from the plan text.

## Deviations from Plan

### Reconciliation with MA4 (Rule 2 — preserve shipped critical functionality)

**1. FAB gate widened to keep the admin ops sheet**
- **Found during:** Task 1
- **Issue:** The plan's literal FAB gate `if (role !== "member") return null;` would have hidden the agent FAB for admins too — clobbering MA4-03's admin "RunStudio Ops" sheet (shipped, AI-01/02/03 complete). The plan was authored assuming MA4 was not yet built (see its own TCH-03 ordering note).
- **Fix:** Gate is `if (role !== "member" && !isAdmin) return null;` — hides only teachers. Members → coach FAB, admins → MA4 ops sheet, teachers → no FAB. The literal `role !== "member"` substring is still present (acceptance criterion satisfied) and the truth table is correct (null/loading → hidden, member → shown, teacher → hidden, admin → shown).
- **Files modified:** `packages/mobile-app/app/_layout.tsx`
- **Commit:** `5c04c2dc`

**2. FAB role source left on MA4's fetchRole/whoami**
- **Found during:** Task 1
- **Issue:** The plan implies switching the FAB to `useRole`. MA4 wired the FAB to `lib/whoami.ts` `fetchRole()` (useState/useEffect) and the `isAdmin` endpoint/title switch.
- **Fix:** Left MA4's FAB role mechanism untouched (do-not-clobber). `useRole` (GET /api/m/me) is used only for the tab-set branch in `(tabs)/_layout.tsx` — exactly where the plan's acceptance criteria require it. The two role endpoints (whoami + me) both return `{role}` and are cheap/cached.
- **Files modified:** none beyond the gate line above.
- **Commit:** `5c04c2dc`

## Deferred Issues
- Pre-existing `fontVariant` readonly-tuple tsc error in `app/(tabs)/index.tsx:546` (member Home, unmodified by this plan) — see `.planning/phases/MA3-teacher-session-surface/deferred-items.md`. Out of scope; runtime-safe.

## Known Stubs
None. All three screens are wired to the live MA3-02 teacher endpoints; the check-in posts to the real attendance chokepoint. No hardcoded empty data, placeholders, or TODOs.

## Device-gated checks (deferred to the EAS build — MA1-03 pattern)
On-device iOS verification is blocked on the customer's Apple Developer account / EAS build (same gate as MA1/MA3 server work). Defer, do NOT block plan completion. To verify when a build is available (Android device/simulator works now without the Apple gate):
- Sign in as a teacher (email in `RUNSTUDIO_TEACHER_EMAILS`, `trainers.user_id` linked) → lands on the teacher tab set (Schedule + Profile), NOT the member booking tabs; the agent FAB is absent.
- Teacher Schedule lists assigned sessions; an unlinked teacher and a teacher with no sessions each see a clear empty state (not an error).
- Tap a session → roster; tap a member → optimistic Checked-in tick; confirm `POST /api/m/teacher/check-in` fired and the booking flipped to `attended` (and the Meta Schedule CAPI fired inside the chokepoint).
- Sign in as a member → coach FAB present, 5 member tabs. Sign in as admin → MA4 ops FAB present.

**Runtime prerequisite (OPERATOR, from MA3-01, still required):** apply migration v37 to Neon `billowing-sun-51091059`; populate `trainers.user_id` by email per teacher; set `RUNSTUDIO_TEACHER_EMAILS` on Vercel. Until then every login resolves to `member` and the teacher routes 403 (the app safely shows the member surface).

## Self-Check: PASSED

All three created files present on disk; both modified files updated; all three task commits exist in git (5c04c2dc, 34b97f1c, 3be6cc4d).

---
*Phase: MA3-teacher-session-surface*
*Completed: 2026-06-30*
