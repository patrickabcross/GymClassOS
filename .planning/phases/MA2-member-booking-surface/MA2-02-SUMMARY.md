---
phase: MA2-member-booking-surface
plan: 02
subsystem: mobile
tags: [expo, expo-router, react-native, better-auth, anonymous-browse, sign-in, home, tanstack-query]

# Dependency graph
requires:
  - phase: MA2-01
    provides: anonymous GET /api/m/schedule (getOptionalMember) + additive upcomingBookings[] on /api/m/profile
  - phase: MA1-auth-3-role-spine
    provides: expo-secure-store session token; sign-in.tsx claim-by-email/phone; AuthGate
provides:
  - Anonymous app entry — AuthGate no longer force-redirects tokenless users to /sign-in (the wall moves to the Book press in MA2-03)
  - lib/pending-booking.ts — in-session pending-booking intent store (set/get/clear occurrenceId)
  - Return-to-class after sign-in — a member who signs in mid-booking lands on /(tabs)/schedule
  - Home upcomingBookings[] list render (additive, falls back to the singular upcomingBooking card)
affects: [MA2-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-session intent store = module-level variable (no persistence) — set on Book press (MA2-03), read on sign-in success, cleared by the schedule resume"
    - "AuthGate degrades to bounce-off-sign-in-only; member tabs already crash-safe on 401 (existing Retry error state)"

key-files:
  created:
    - packages/mobile-app/lib/pending-booking.ts
  modified:
    - packages/mobile-app/app/_layout.tsx
    - packages/mobile-app/app/sign-in.tsx
    - packages/mobile-app/app/(tabs)/index.tsx

key-decisions:
  - "Auth wall removed at app entry by deleting only the `if (!token && !onSignIn) router.replace('/sign-in')` line — the bounce-off-sign-in (`if (token && onSignIn)`) is kept; AgentFabAndSheet (MA3/MA4 role gating) and Stack screens are untouched"
  - "Pending-booking intent is in-session only (module var), NOT persisted — a cold-start mid-flow is rare and a stale intent would surprise the member; MEM-02 only needs the sign-in→return hop within one run"
  - "sign-in return branch inlined in BOTH success paths (email + phone-claim) so /(tabs)/schedule appears literally in each; the 'unknown error — navigate anyway' fallback keeps its bare /(tabs) (error recovery, not a clean success)"
  - "Home list capped at 5 rows; section label flips 'Next class' → 'Upcoming' only when a list is shown; single-card + empty-state fallback preserved verbatim"

patterns-established:
  - "Pattern: move-the-wall — open app entry by removing the redirect, gate the specific action (Book) downstream, not the whole shell"

requirements-completed: [MEM-01, MEM-02, MEM-05]

# Metrics
duration: 4min
completed: 2026-06-30
---

# Phase MA2 Plan 02: Member Booking Surface (mobile entry / sign-in / home) Summary

**Anonymous browse + continuous return-to-class + Home upcoming list: AuthGate stops force-redirecting tokenless users (wall moves to the Book press in MA2-03), a new in-session pending-booking store carries the occurrenceId through sign-in so a mid-booking member lands back on /(tabs)/schedule, and Home renders the additive upcomingBookings[] list — one new file + three edits, no new dependency, no migration. MA3/MA4 _layout.tsx role gating (admin Ops FAB, teacher FAB-hide, teacher-roster screen) reconciled and untouched.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-30T20:55:35Z
- **Completed:** 2026-06-30T20:59:27Z
- **Tasks:** 3
- **Files:** 1 created + 3 modified

## Accomplishments
- **MEM-01 (client):** `AuthGate` in `app/_layout.tsx` no longer redirects anonymous (tokenless) users to `/sign-in`. The single force-redirect line was removed; the bounce-off-sign-in (`if (token && onSignIn) router.replace("/(tabs)")`) and the `checked` render-gate/spinner are kept. The AuthGate doc comment now states the wall sits at the Book action (MA2-03). Member-only tabs (Home/Passes/Profile) already degrade gracefully on a 401 via their existing "Couldn't load …" + Retry state — verified, not crashing.
- **MEM-02 (mechanism):** new `lib/pending-booking.ts` — a module-level in-session intent store (`setPendingBooking` / `getPendingBooking` / `clearPendingBooking`). `sign-in.tsx` imports `getPendingBooking` and, on both the email-success and phone-claim-success branches, routes to `/(tabs)/schedule` when an intent is pending (else `/(tabs)`). The intent is intentionally NOT cleared here — MA2-03's schedule screen consumes and clears it on focus (the resume leg).
- **MEM-05 (client):** `ProfileResponse` extended with the additive `upcomingBookings?[]`; the Home "Next class" hero now renders a capped (5) list of upcoming bookings (label flips to "Upcoming", divider between rows, each Pressable → `/(tabs)/schedule`, Feather `chevron-right`). When the list is absent/empty it falls back to the existing single `upcomingBooking` card and its "No upcoming class" empty state — no regression.

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: move auth wall off app entry (MEM-01 client) + pending-booking store (MEM-02 mechanism)** — `f26ca9da` (feat)
2. **Task 2: return member to schedule after sign-in with a pending booking (MEM-02)** — `537e5ab9` (feat)
3. **Task 3: render upcomingBookings[] list on Home (MEM-05 client)** — `9a0a1387` (feat)

## Files Created/Modified
- `packages/mobile-app/lib/pending-booking.ts` — **created.** In-session pending-booking intent store (set/get/clear occurrenceId); module-level variable, not persisted.
- `packages/mobile-app/app/_layout.tsx` — removed the tokenless force-redirect in `AuthGate`; updated the doc comment to state the wall is now at the Book press. AgentFabAndSheet + Stack screens untouched.
- `packages/mobile-app/app/sign-in.tsx` — import `getPendingBooking`; on both success branches route to `/(tabs)/schedule` when an intent is pending.
- `packages/mobile-app/app/(tabs)/index.tsx` — additive `upcomingBookings[]` type + Home list render with single-card fallback; also fixed the pre-existing `fontVariant` tsc error (see Deviations).

## Reconciliation with MA3/MA4 `_layout.tsx` (no regression)

The constraint flagged that `_layout.tsx` already carries MA3/MA4 changes on `master` and they must NOT be clobbered. How it was reconciled:
- **Edits were surgical:** only the AuthGate doc comment and the single `if (!token && !onSignIn) router.replace("/sign-in")` line were changed. The diff for `_layout.tsx` is +5/-6 lines, all inside `AuthGate`.
- **`AgentFabAndSheet` is byte-untouched** — its MA3/MA4 logic survives intact: the admin Ops FAB via `isAdmin` (`endpoint`/`title` switch), the teacher FAB-hide via `role !== "member" && !isAdmin`, the `fetchRole()`/`useRole` resolution, and the null-role flash guard.
- **The Stack screens are untouched** — the MA3-03 `teacher-roster` `<Stack.Screen>`, `food-add`, `food-barcode`, `sign-in`, `pick-member`, and `(tabs)` declarations are all preserved.
- Confirmed by grep: `router.replace("/(tabs)")` (bounce-off-sign-in) still present; `router.replace("/sign-in")` (force-redirect) gone.

## Decisions Made
- **In-session-only intent (no secure-store/AsyncStorage persistence)** — MEM-02 only needs the sign-in→return hop inside one app run; persisting a stale intent across a cold start would surprise the member mid-flow.
- **Inlined the return branch in both success paths** rather than a shared helper, so `/(tabs)/schedule` appears literally in each branch (matches the plan's acceptance grep and reads clearly).
- **Did not change the "unknown error — navigate anyway" fallback** in `handleSignIn` — it keeps its bare `/(tabs)` because it is an error-recovery navigation, not a confirmed success.
- **Home list capped at 5** and labelled "Upcoming" only when a list renders, per the AGENTS.md clean-UI / progressive-disclosure rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing `fontVariant` readonly-tuple tsc error in `index.tsx`**
- **Found during:** Task 3 (the first full `tsc --noEmit` after editing `index.tsx`).
- **Issue:** `fontVariant: ["tabular-nums"] as const` produced `readonly ["tabular-nums"]`, which RN's `TextStyle` rejects (it wants a mutable `FontVariant[]`). This was a pre-existing error logged in `MA3 deferred-items.md` as out-of-scope **while `index.tsx` was unmodified** — but Task 3 edits this file, so the success criteria ("tsc clean for changed mobile files") now require it clean.
- **Fix:** `fontVariant: ["tabular-nums" as const]` (element-level const → `"tabular-nums"[]`, a mutable array that IS assignable). Full `packages/mobile-app` `tsc --noEmit` now exits 0.
- **Files modified:** `packages/mobile-app/app/(tabs)/index.tsx`; marked RESOLVED in `.planning/phases/MA3-teacher-session-surface/deferred-items.md`.
- **Commit:** `9a0a1387`

## Issues Encountered
None blocking. The Task 1/Task 2 typechecks showed only the pre-existing `index.tsx` fontVariant error (resolved in Task 3); no other errors surfaced.

## Verification
- **`npx tsc --noEmit` (packages/mobile-app): EXIT 0 — fully clean** across the whole app (the only prior error, the `index.tsx` fontVariant tuple, is now fixed).
- **`npx prettier --write`** run on all four changed files.
- **No new dependency:** `package.json` untouched (no diff).
- **No migration:** mobile-only client changes; no server/db files touched.
- **Grep contract checks pass:** force-redirect line gone; bounce-off-sign-in kept; `setPendingBooking`/`getPendingBooking`/`clearPendingBooking` exported; `getPendingBooking` imported + used in both sign-in success branches; `/(tabs)/schedule` in both branches; `PHONE_REQUIRED` + deep-links present; `upcomingBookings` in type + render; singular `upcomingBooking` fallback present; no `Tabler` (Feather only).
- **On-device iOS verification DEFERRED (EAS/Apple-gated, MA1-03 pattern):** anonymous-browse-then-Book, sign-in return-to-class, and the Home list render against the live `/api/m/*` endpoints require an EAS dev build on a physical iPhone (Expo Go is a dead end at SDK 54; iOS Simulator needs a Mac). Static + tsc verification done here; functional walkthrough lands when the EAS/Apple gate opens. MA2-03's schedule resume is the consumer that closes the MEM-02 loop end-to-end.

## User Setup Required
None for this plan. (The Stripe `STRIPE_PRICE_*` / product-keyword operator setup carried from MA2-01 is for the MA2-03 no-pass purchase flow, not this plan — a member who already has a pass books without it.)

## Next Phase Readiness
- MA2-03 (schedule.tsx) now has everything it needs: anonymous browse reaches the schedule, the Book press can `setPendingBooking(occurrenceId)` + route to `/sign-in`, and the on-focus resume reads `getPendingBooking()` → re-issues the booking → `clearPendingBooking()`. The 402 NO_PASS branch (from MA2-01) drives the Stripe inline purchase; the 409 CAPACITY_FULL branch is the optimistic-rollback signal.
- Home already consumes `upcomingBookings[]`, so a booking made on the Classes tab reflects on Home (the existing `useFocusEffect` refetch is in place).

---
*Phase: MA2-member-booking-surface*
*Completed: 2026-06-30*

## Self-Check: PASSED

All 4 code files (1 created + 3 modified) + SUMMARY.md present on disk; all 3 task commits (f26ca9da, 537e5ab9, 9a0a1387) present in git history.
