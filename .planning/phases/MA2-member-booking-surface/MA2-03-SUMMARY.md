---
phase: MA2-member-booking-surface
plan: 03
subsystem: mobile
tags: [expo, react-native, tanstack-query, expo-web-browser, stripe-checkout, optimistic-ui, polling, booking]

# Dependency graph
requires:
  - phase: MA2-01
    provides: atomic POST /api/m/bookings (402 NO_PASS / 409 CAPACITY_FULL); GET /api/m/purchase products + POST {url}; /api/m/profile passBalance
  - phase: MA2-02
    provides: lib/pending-booking.ts (set/get/clear); AuthGate wall moved off app entry; sign-in returns to /(tabs)/schedule on a pending intent
provides:
  - Book-press auth gate on the schedule (signed-out tap stores intent + routes to /sign-in)
  - Resume-on-focus that re-issues the pending booking exactly once after sign-in (server-authoritative)
  - Optimistic booking with distinct error branches — NO_PASS opens the product picker, CAPACITY_FULL rolls back with a soft message
  - lib/purchase-poll.ts pollForGrant — polls /api/m/profile (2s/30s) until passBalance rises
  - components/ProductPickerSheet.tsx — presentational drop-in/5-pack/10-pack picker, drop-in default-highlighted
  - Full no-pass purchase round-trip: POST purchase -> WebBrowser hosted Checkout -> poll-for-grant -> re-book; timeout + 503 graceful degrade
affects: [MA2-04, member-mobile-booking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auth wall at the action, not the shell: handleBookPress checks getSessionToken() and stores a pending intent before /sign-in"
    - "Server-authoritative resume: the on-focus re-book always mutates and lets onError(NO_PASS) open the picker — never trusts a stale client passBalance"
    - "Async-grant race handled by poll-on-return: browser dismiss = 'user came back', success determined by polling profile, then a second booking POST"
    - "Presentational sheet owns no data/side-effects; the screen owns products fetch + purchase + poll + re-book"

key-files:
  created:
    - packages/mobile-app/lib/purchase-poll.ts
    - packages/mobile-app/components/ProductPickerSheet.tsx
  modified:
    - packages/mobile-app/app/(tabs)/schedule.tsx

key-decisions:
  - "Single Book action replaces the old two-button 'Use 1 pass' / 'Pay drop-in' stub; handleBookPress branches pass-holder (mutate) vs no-pass (picker), and the server NO_PASS branch is the safety net for a stale client balance"
  - "Resume-on-focus always mutates (server-authoritative) rather than branching on client passBalance, because the just-signed-in member's profile may not have refetched yet"
  - "Product picker opens only when GET /api/m/purchase returns a non-empty list; an empty list (Stripe products unconfigured) degrades to a 'contact the studio' message"
  - "pollForGrant clamps a failed start-read to 0 so a sentinel can never register as a false-positive grant; a transient read failure mid-loop is 'no change yet', not success"

patterns-established:
  - "Pattern: poll-on-return for async grants — read baseline, open browser, poll target endpoint to a deadline, then complete the dependent write"

requirements-completed: [MEM-02, MEM-03, MEM-04]

# Metrics
duration: 7min
completed: 2026-06-30
---

# Phase MA2 Plan 03: Member Booking Surface (mobile booking + purchase) Summary

**The schedule's booking flow wired end-to-end: a signed-out Book tap stores the occurrence intent and routes to sign-in (resumed once on focus); a signed-in pass-holder books optimistically; a 409 rolls back with a soft 'just filled up'; a 402 opens a drop-in/5-pack/10-pack picker that runs POST /api/m/purchase -> expo-web-browser hosted Checkout -> pollForGrant (2s/30s) -> a second booking POST. Browser return is treated only as 'user came back' — the grant is observed by polling, never assumed. Timeout and 503 (Stripe unconfigured) both degrade gracefully; a pass-holder always books. One edited screen + two new files, no new dependency, no migration.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-30T21:03:23Z
- **Completed:** 2026-06-30T21:10:39Z
- **Tasks:** 2
- **Files:** 2 created + 1 modified

## Accomplishments

- **MEM-02 (Book-press gate + resume):** `handleBookPress(occurrenceId)` reads `getSessionToken()`; a tokenless tap calls `setPendingBooking(occurrenceId)` and `router.push("/sign-in")` and returns without mutating. A `useFocusEffect` reads `getPendingBooking()` on focus and, once a session token exists, `clearPendingBooking()`s and re-issues the booking. A `resumedRef` guards a single fire. The resume is server-authoritative — it always mutates and lets `onError(NO_PASS)` open the picker rather than trusting a possibly-stale client `passBalance`.
- **MEM-03 (optimistic client booking):** the existing optimistic mutation (`onMutate` snapshot + `setQueryData` mark booked + bump count; `onSuccess` invalidate `["profile"]`) keeps its shape; `onError` now branches: roll back from `ctx.previous`, then NO_PASS/402 -> `startPurchaseFlow(vars.occurrenceId)` (no red error), CAPACITY_FULL/409 -> "Sorry — this class just filled up." (soft toast), else the generic message.
- **MEM-04 (inline purchase):** `lib/purchase-poll.ts` `pollForGrant({intervalMs=2000, timeoutMs=30000})` reads a baseline `passBalance`, then polls `/api/m/profile` to a deadline and resolves `true` the moment the balance rises. `components/ProductPickerSheet.tsx` is a presentational bottom-sheet listing the configured products (drop-in default-highlighted via a keyword match, Feather `zap`/`credit-card`/`chevron-right`/`x`). `schedule.tsx` fetches the products with a `["purchase-products"]` query enabled only once a purchase starts; on select it `POST`s `/api/m/purchase`, opens the hosted Checkout via `WebBrowser.openBrowserAsync(url)`, then `pollForGrant()` -> on grant re-`POST`s `/api/m/bookings` + optimistically marks the card booked + invalidates `["profile"]`/`["schedule"]`; on timeout shows "Purchase processing — your credits will appear shortly. Tap Book again in a moment."
- **Graceful degrade:** an empty `GET /api/m/purchase` product list (Stripe products not configured) closes the picker and shows "Online payment isn't set up yet — please contact the studio."; a `503` from `POST /api/m/purchase` (no connected account) surfaces the same copy. A pass-holder is never affected — the picker only opens on the no-pass path.

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: Book-press auth gate + resume + optimistic NO_PASS/CAPACITY branches (MEM-02, MEM-03 client)** — `77502c3d` (feat)
2. **Task 2: no-pass product picker + Stripe purchase -> poll-for-grant -> re-book (MEM-04)** — `672724bd` (feat)

## Files Created/Modified

- `packages/mobile-app/lib/purchase-poll.ts` — **created.** `pollForGrant` — baseline-read + interval poll of `/api/m/profile` to a timeout; sentinel-safe (a failed read is "no change", never a false positive).
- `packages/mobile-app/components/ProductPickerSheet.tsx` — **created.** Presentational `Modal` bottom-sheet; props `{visible, products, onSelect, onClose}`; drop-in default-highlighted; Feather icons; owns no data or side-effects.
- `packages/mobile-app/app/(tabs)/schedule.tsx` — auth-gate `handleBookPress`, `useFocusEffect` resume, reworked `bookMutation.onError` branches, `startPurchaseFlow` + `handleSelectProduct` (purchase -> browser -> poll -> re-book), `["purchase-products"]` query, empty-list/503 degrade, in-flight banner, and the rendered `ProductPickerSheet`. The stale two-button "Pay drop-in" stub (which booked without paying) is replaced by a single gated **Book** action.

## Decisions Made

- **Single Book action.** The old expanded UI offered "Use 1 pass" and a "Pay drop-in" stub that booked without charging (a correctness bug). Both are replaced by one **Book** button routed through `handleBookPress`; pass-vs-no-pass is decided by `passBalance` for the button and re-checked authoritatively by the server (the NO_PASS branch opens the picker for a stale client).
- **Server-authoritative resume.** The on-focus resume always `mutate`s rather than branching on client `passBalance`, because a just-signed-in member's `["profile"]` query may not have refetched; the server's 402 drives the picker if they truly have no credit.
- **Poll baseline clamped.** `pollForGrant` clamps a failed start-read to `0` and treats a `null` mid-loop read as "no change yet" so a sentinel can never be mistaken for a grant.
- **Picker gated on a non-empty product list.** Opening the sheet requires `products.length > 0`; an empty list is the Stripe-unconfigured degrade signal, handled before the sheet ever shows.

## Deviations from Plan

None — plan executed exactly as written. Task 1's `startPurchaseFlow` was introduced as a single-line intent-setter so the Task 1 commit typechecks standalone; Task 2 added the picker, products query, and purchase handler that consume that intent (the plan's own Task 1 -> Task 2 hand-off).

## Issues Encountered

None blocking. The two pre-existing `tsc` errors in `apps/staff-web/actions/mark-booking-attended.ts` are server-side, in a file this plan does not touch, and are already logged in `.planning/phases/MA3-teacher-session-surface/deferred-items.md` — out of scope (this plan is mobile-only and `packages/mobile-app` `tsc --noEmit` is fully clean).

## Verification

- **`npx tsc --noEmit` (packages/mobile-app): EXIT 0** after each task — clean across `schedule.tsx` + the two new files (and the whole app).
- **`npx prettier --write`** run on all three files.
- **No new dependency:** `git diff packages/mobile-app/package.json` empty (`expo-web-browser`, `expo-router`, `@expo/vector-icons` all already present).
- **No migration:** mobile-only client changes; no server/db files touched.
- **Grep contract checks pass:** `pollForGrant` export + `2000`/`30000`; `ProductPickerSheet` + `onSelect`/`products`; `pollForGrant`/`openBrowserAsync`/`/api/m/purchase` (GET list + POST) in `schedule.tsx`; `processing` + `contact the studio` degrade copy; `getSessionToken`/`setPendingBooking`/`getPendingBooking`/`useFocusEffect`/`NO_PASS`/`CAPACITY_FULL`/`just filled up` all present; `not wired here` removed; no `Tabler` (Feather only).
- **On-device iOS verification DEFERRED (EAS/Apple-gated, MA1-03 pattern):** the full walkthroughs — signed-out Book -> sign-in -> auto-resume; pass-holder optimistic + pill decrement; full class -> rollback + "filled up"; no-pass -> picker -> Checkout -> poll -> booking; poll timeout -> "tap Book again" — require an EAS dev build on a physical iPhone (Expo Go dead-ends at SDK 54; Simulator needs a Mac). Static + tsc verification done here; functional verification is MA2-04's formal device pass.

## User Setup Required

None for this plan's code. **Operator/config dependency (carried from MA2-01, for end-to-end MEM-04 only):** `STRIPE_PRICE_DROP_IN` / `STRIPE_PRICE_5_PACK` / `STRIPE_PRICE_10_PACK` must be set on the connected account and the Stripe product **descriptions** must contain the credit keywords (`drop-in`/`5-pack`/`10-pack`) for credits to be granted. If unset, `GET /api/m/purchase` returns an empty list (picker degrades to "contact the studio") and `POST` returns 503 — a member who already has a pass still books.

## Next Phase Readiness

- The booking surface is fully wired; **MA2-04** is the formal device/UAT pass that exercises the five flows above on a real iPhone once the EAS/Apple gate opens, plus any Stripe operator-config verification.
- The async-grant `pollForGrant` pattern + the auth-gate-at-the-action pattern are reusable for any future "pay-then-act" mobile flow.

---
*Phase: MA2-member-booking-surface*
*Completed: 2026-06-30*

## Self-Check: PASSED

All 3 code files (2 created + 1 modified) + SUMMARY.md present on disk; both task commits (77502c3d, 672724bd) present in git history.
