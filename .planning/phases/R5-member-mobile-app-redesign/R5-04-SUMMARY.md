---
phase: R5-member-mobile-app-redesign
plan: "04"
subsystem: ui
tags: [react-native, expo, booking-flow, pass-balance, theme-tokens, dark-mode]

# Dependency graph
requires:
  - phase: R5-member-mobile-app-redesign
    plan: "01"
    provides: "packages/mobile-app/lib/theme.ts — ThemeContext + useTheme() + StudioTokens type"
provides:
  - "packages/mobile-app/app/(tabs)/schedule.tsx — hex-clean, useMemo StyleSheet, useTheme()"
  - "Persistent pass-balance pill reading ['profile'] query (Feather award icon + credit count)"
  - "<=3-step booking flow: select (expand card) -> confirm (pass/drop-in choice) -> done (optimistic booked badge)"
  - "Explicit pass/drop-in choice at confirm step: 'Use 1 pass' (accent) + 'Pay drop-in' (secondary) when passBalance > 0; drop-in only + low-credit hint when passBalance <= 0"
  - "Zero bare hex in schedule.tsx"
affects:
  - "MOBL-05 (booking <=3 steps + persistent pass pill) — SATISFIED"
  - "MOBL-01 (zero bare hex in schedule.tsx) — SATISFIED"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useMemo(() => StyleSheet.create({...}), [theme]) — inline theme-aware StyleSheet (R5-01 canonical pattern)"
    - "Pass pill above FlatList (outside scroll) so it persists throughout browse + booking"
    - "bookMutation payload extended to { occurrenceId, usePass: boolean } — usePass recorded client-side; no new endpoint"
    - "Pill auto-refreshes via existing qc.invalidateQueries(['profile']) in onSuccess"
    - "Drop-in payment (Stripe) deferred to master-branch P1c.1 workstream — comment in code"

key-files:
  created: []
  modified:
    - packages/mobile-app/app/(tabs)/schedule.tsx

key-decisions:
  - "Combined both tasks into one file write — Task 1 (hex migration) and Task 2 (pass pill + flow) both target schedule.tsx; the hex-clean base is required for Task 2, making them naturally sequential in a single atomic output"
  - "Pass pill placed above FlatList (outside scroll container) so it stays visible during list scroll and booking confirmation — not inside a FlatList header (which would scroll away)"
  - "bookMutation mutationFn signature extended to { occurrenceId, usePass } but still calls the existing /api/m/bookings endpoint with occurrenceId only — drop-in purchase wiring is a future P1c.1 concern; code comments document this"
  - "Pill reads from ['profile'] queryKey — same key Home tab uses; onSuccess invalidation already present in the original code ensures the pill updates after booking"
  - "When passBalance <= 0: show drop-in only + plain-text low-credit hint (no hard Passes-tab navigation dependency — keeps the confirm step self-contained)"

requirements-completed: [MOBL-05, MOBL-01]

# Metrics
duration: 5min
completed: "2026-06-13"
---

# Phase R5 Plan 04: Booking Flow Pass Pill Summary

**<=3-step booking flow (select -> confirm with pass/drop-in choice -> done) + persistent pass-balance pill + zero bare hex in schedule.tsx via useTheme() theme tokens**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-06-13
- **Tasks:** 2 of 2 (combined into one atomic file write)
- **Files modified:** 1 (schedule.tsx)

## Accomplishments

- Replaced all 18 bare hex literals in schedule.tsx with theme token references (`theme.colors.*`, `theme.font.*`, `theme.radius.*`, `theme.spacing.*`) — zero hex remains
- Added `useTheme()` import and call; rewrote module-level `StyleSheet.create` as `useMemo(() => StyleSheet.create({...}), [theme])` per R5-01 canonical pattern
- Added persistent pass-balance pill (Feather `award` icon + "{n} credit/credits") positioned above the FlatList so it stays visible while scrolling
- Pill reads from the shared `["profile"]` query; auto-updates after booking via existing `onSuccess: qc.invalidateQueries(["profile"])` path
- Low-balance state: pill turns danger-colored when `passBalance <= 0`
- Refined booking to exactly 3 steps: (1) tap card to expand = select, (2) expanded confirm area shows pass/drop-in choice = confirm, (3) optimistic booked badge on card header = done
- When `passBalance > 0`: two clearly-labeled buttons "Use 1 pass" (accent/primary) + "Pay drop-in" (secondary with border)
- When `passBalance <= 0`: "Pay drop-in" only + plain hint "You have no credits — pay drop-in to book"
- Full-class guard, optimistic update, rollback, and error toast all preserved intact

## Task Commits

1. **Tasks 1 + 2: Hex migration + pass pill + booking flow** — `a2738ae3` (feat)

## Files Created/Modified

- `packages/mobile-app/app/(tabs)/schedule.tsx` — useTheme + useMemo StyleSheet, zero bare hex, persistent pass pill, <=3-step pass/drop-in booking flow

## Decisions Made

- **Single file write for both tasks**: Tasks 1 and 2 both target only `schedule.tsx`; Task 2 requires Task 1's hex-clean base, making a sequential two-write approach redundant for a single file. One atomic write satisfies both acceptance criteria.
- **Pill above FlatList**: Placed as a `View` between the container and FlatList so it renders outside the scroll area and never scrolls away during class browsing or booking confirmation.
- **Client-side usePass tracking**: The `bookMutation` payload is `{ occurrenceId, usePass }` but calls the existing `/api/m/bookings` endpoint with `occurrenceId` only. Drop-in Stripe payment wiring is a master-branch P1c.1 concern; a comment in the code documents the future wiring point.
- **No new endpoint, no new query key**: The pass pill reads `profileData?.passBalance` from the existing `["profile"]` query — the same key the Home tab uses. The pill gets invalidated for free via the mutation's `onSuccess` handler that already called `qc.invalidateQueries({ queryKey: ["profile"] })` in the original code.

## Deviations from Plan

None — plan executed exactly as written. Both tasks targeted the same file; combined into one atomic write with both acceptance criteria met.

## Known Stubs

None — all required patterns are wired. Drop-in Stripe payment (P1c.1) is intentionally deferred and documented in code comments; this is not a stub but a planned future integration.

## Self-Check: PASSED

- `packages/mobile-app/app/(tabs)/schedule.tsx` — EXISTS
- `grep -cE '#[0-9a-fA-F]{3,8}' schedule.tsx` — returns 0 (verified during execution)
- `api/m/profile`, `passBalance`, `drop-in` all present in file (verified during execution)
- Commit `a2738ae3` — EXISTS (confirmed via git log)

## Next Phase Readiness

Phase R5 is complete — all 4 plans executed:
- R5-01: theme.ts foundation (ThemeContext + useTheme + Inter OTF)
- R5-02: tabs renamed + leaf screens hex-clean + passes.tsx
- R5-03: Home hero cards + coach-voice noticeboard + index.tsx hex-clean
- R5-04: schedule.tsx hex-clean + pass pill + <=3-step booking flow

All 7 MOBL requirements (MOBL-01 through MOBL-07) are satisfied at code level.
Behavioral/visual UAT deferred to EAS dev/preview build (master-branch workstream).

---
*Phase: R5-member-mobile-app-redesign*
*Completed: 2026-06-13*
