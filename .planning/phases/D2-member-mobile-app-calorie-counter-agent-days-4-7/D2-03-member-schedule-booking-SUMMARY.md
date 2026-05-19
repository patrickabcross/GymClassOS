---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 03
subsystem: member-schedule-booking
tags: [react-native, tanstack-query, drizzle, react-router-v7, optimistic-ui, expo-router]

# Dependency graph
requires:
  - phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
    plan: 01
    provides:
      - "apiFetch wrapper (packages/mobile-app/lib/api.ts) injecting X-Demo-Member-Id from AsyncStorage"
      - "requireDemoMember server gate (templates/mail/server/lib/demo-member.ts)"
      - "TanStack Query provider singleton wrapping the Expo Router tree"
      - "packages/mobile-app/app/(tabs)/schedule.tsx placeholder ready to overwrite"
      - "auth.ts publicPaths includes /api/m (no merge needed)"
  - phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
    plan: 01
    provides:
      - "Staff schedule loader pattern (templates/mail/app/routes/gymos.schedule.tsx) — leftJoin classOccurrences + classDefinitions, separate booking-count groupBy aggregation"
      - "Naive INSERT booking pattern (no atomic capacity check) — explicit BKG-03/BKG-04 deferral"

provides:
  - "GET /api/m/schedule — 7-day window of upcoming occurrences joined with class metadata, booking counts, and per-occurrence isBookedByMe flag"
  - "POST /api/m/bookings — naive INSERT for the X-Demo-Member-Id member; idempotent on (occurrence, member, 'booked')"
  - "Mobile Schedule tab — day-grouped occurrence cards with inline expand, optimistic booking via TanStack Query mutation, error rollback + toast, profile cache invalidation on success"
  - "Optimistic-UI pattern (CLAUDE.md compliant) for future mobile mutations to reuse: onMutate setQueryData + onError rollback + onSuccess invalidate"

affects:
  - D2-04-member-home-tab (Home tab's upcomingBooking now refreshes after schedule booking — qc.invalidateQueries(['profile']) is the hook)
  - D2-06-agent-chat-sse-tools (book_class agent tool will hit the same /api/m/bookings endpoint — agent-native single-source-of-truth rule)
  - P1b/P2 (BKG-03/BKG-04 atomic capacity check + pass debit replaces the naive INSERT in /api/m/bookings action)

# Tech tracking
tech-stack:
  added: []  # All deps were installed in D2-01
  patterns:
    - "Three-query schedule shape: list occurrences (window + status) + groupBy bookings count + member-bookings set — mirrors D1-01 plus a third member-scoped query"
    - "Idempotent demo booking: SELECT for (occurrenceId, memberId, status='booked') first; return existing.id if found; only INSERT on miss"
    - "Optimistic mutation: cancelQueries → snapshot previous → setQueryData → return ctx; onError restores ctx.previous; onSuccess invalidates related queries"
    - "Inline-expand booking UX (D-claude-discretion default): expand under card with Confirm button instead of full-screen modal"

key-files:
  created:
    - "templates/mail/app/routes/api.m.schedule.tsx (84 lines)"
    - "templates/mail/app/routes/api.m.bookings.tsx (81 lines)"
  modified:
    - "packages/mobile-app/app/(tabs)/schedule.tsx (20-line placeholder → 275-line full screen)"

key-decisions:
  - "Schedule view density = day-grouped vertical FlatList (D-claude-discretion default per CONTEXT.md) — mobile-optimised; one section per UTC date bucket; chronological card order within each day"
  - "Booking flow = inline expand under card with 'Confirm booking' button (CONTEXT.md D-claude-discretion default) — not a separate modal; aligns with mobile thumb-zone ergonomics"
  - "Demo-grade idempotency lives at the API: SELECT existing booking with status='booked' before INSERT. No DB UNIQUE constraint added (would change schema; out of scope for D2)"
  - "Optimistic update increments bookedCount by 1 client-side — keeps the X/Y capacity label honest even before the round-trip lands"
  - "Server query window uses ISO string comparison (gte/lte) directly on text column. classOccurrences.startsAt is text (ISO with timezone offset per schema), so string comparison is timezone-safe for ordering"

patterns-established:
  - "Mobile mutation pattern: useMutation with onMutate (snapshot + optimistic setQueryData), onError (rollback to ctx.previous + setBookError toast), onSuccess (invalidateQueries for cross-tab refresh)"
  - "Day-bucketing on mobile: items.startsAt.slice(0,10) as the UTC date key + toLocaleDateString for display; production switch to studio IANA TZ (SCH-07) is a one-function change"
  - "Inline-expand UX: single expandedId state in the parent component; tap toggles; collapsed-by-default; Booked rows skip the expand entirely (read-only badge)"

requirements-completed:
  - MEMBR-01
  - MEMBR-02

# Metrics
duration: 3min
completed: 2026-05-19
---

# Phase D2 Plan 03: Member Schedule + Booking Summary

**Mobile-side schedule surface and booking action. `/api/m/schedule` returns the next 7 days joined with booking counts and a per-occurrence `isBookedByMe` flag scoped to the X-Demo-Member-Id member; `/api/m/bookings` POST is the naive demo-grade INSERT (idempotent on duplicate book attempts); the mobile Schedule tab renders day-grouped cards with inline-expand booking and optimistic UI (CLAUDE.md mandate) that flips the card to 'Booked' instantly with rollback on server error.**

## Performance

- **Duration:** ~3 min (157 seconds wall clock)
- **Started:** 2026-05-19T12:51:30Z
- **Completed:** 2026-05-19T12:54:07Z
- **Tasks:** 3/3 complete
- **Files created:** 2
- **Files modified:** 1
- **Files deleted:** 0
- **Auto-fixes:** 0

## Accomplishments

- `/api/m/schedule` loader queries occurrences in a 7-day window joined with class definitions, aggregates booking counts in a separate `groupBy`, and computes a per-occurrence `isBookedByMe` flag from a member-scoped third query — three queries total (no leftJoin fan-out that would double-count, per the D1-02 lesson).
- `/api/m/bookings` POST action is gated by `requireDemoMember`, returns 200 + existing `bookingId` if the member already has a `status='booked'` row for the occurrence (idempotency), otherwise inserts a new row. Naive INSERT — no atomic capacity check / no pass debit (BKG-03/BKG-04 deferred per CONTEXT.md `<deferred>`).
- Mobile Schedule tab is fully wired: TanStack Query `useQuery(['schedule'])` against the new endpoint, day-grouped `FlatList` rendering, inline-expand booking with `Confirm booking` button, optimistic `setQueryData` updating `isBookedByMe + bookedCount` instantly, `onError` rollback restoring previous cache with a 4-second toast, `onSuccess` invalidating `['profile']` so the Home tab's `upcomingBooking` refreshes.
- Both tsc projects pass clean (mail + mobile-app).

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: `/api/m/schedule` loader** — `faf26d7c` (feat)
2. **Task 2: `/api/m/bookings` POST action** — `11ad5d36` (feat)
3. **Task 3: Mobile Schedule tab with optimistic booking** — `57ee093a` (feat)

**Plan metadata:** to be committed with this SUMMARY + STATE.md + ROADMAP.md update.

## Files Created/Modified

**Created (server):**
- `templates/mail/app/routes/api.m.schedule.tsx` — 84 lines; 3-query loader (occurrences in window + booking counts + member-bookings) producing items[] with bookedCount, isBookedByMe, full
- `templates/mail/app/routes/api.m.bookings.tsx` — 81 lines; POST action with requireDemoMember gate + idempotency SELECT + naive INSERT; GET returns 405

**Modified (mobile):**
- `packages/mobile-app/app/(tabs)/schedule.tsx` — 20-line D2-01 placeholder → 275-line full implementation (useQuery + useMutation + FlatList + day grouping + inline expand + optimistic UI)

## Decisions Made

- **View density = day-grouped vertical FlatList.** CONTEXT.md `<decisions>` `Claude's Discretion` block listed three options (week-grid / day-by-day / flat list); the day-grouped vertical scroll matches the staff schedule's information density while staying mobile-thumb-friendly. Section headers use `toLocaleDateString("en-GB", { weekday, month, day })` for human-readable day labels.
- **Booking flow = inline expand under card with `Confirm booking` button.** CONTEXT.md `<decisions>` Claude's Discretion default was inline-expand vs full-modal — inline keeps users in scroll context, requires fewer taps, and avoids modal-stack complexity. Single `expandedId` state in the parent component; tap-card toggles. `isBookedByMe` cards skip the expand entirely (read-only Booked pill replaces the chevron).
- **Demo-grade idempotency at the API layer, not via DB constraint.** The action does a SELECT-then-INSERT for the (occurrenceId, memberId, 'booked') triple. A DB UNIQUE constraint would be the production answer but it changes the schema — out of scope for D2 and unnecessary for demo since concurrent self-booking from one member is essentially impossible.
- **Optimistic increment includes `bookedCount + 1`** alongside the `isBookedByMe = true` flip. Keeps the X/Y capacity label honest even before the server round-trip lands. If the server rejects the booking (e.g. capacity exceeded in P2 atomic mode), the rollback restores both fields cleanly.
- **No retry button on booking errors.** The error toast says "[error message]" and disappears after 4s; user can tap-expand the same card again to retry. Adding a dedicated retry button on the toast would add UI surface area for a corner case that won't happen in demo (the only realistic error is network failure, where the retry is to just tap again).
- **Server uses ISO-string comparison via `gte/lte` directly on `classOccurrences.startsAt`** (a text column per the schema). String comparison on ISO 8601 is byte-equal to chronological order when offsets are consistent — which they are for seeded data and will be for production where occurrences are always written with `Z` suffix or fixed offset.

## Deviations from Plan

**None.** Plan executed exactly as written. All three tasks landed cleanly, both tsc projects pass without warnings, no Rule 1-4 deviations needed.

## Demo limitations (acknowledged)

The following are explicitly deferred per CONTEXT.md `<deferred>` and `<decisions>`:

- **No atomic capacity check or pass debit** (BKG-03 / BKG-04 → P1b/P2). Two members can race-book the last spot and both succeed. Demo customer has approved this trade.
- **UTC day bucketing** (SCH-07 → P2). Classes near studio-local midnight will render in the wrong day section if studio is not UTC. Fix is a one-function change in `dayKey()`.
- **No cancellation** (MEMBR-04 → P2). Once a member books, the Schedule tab shows the Booked pill but offers no way to undo. Cancellation will be a third TanStack mutation in this same component.
- **No waitlist** (BKG-05 → P2). Full-capacity occurrences show "This class is full" text in the expand, with no Join Waitlist button.
- **No conflict detection** (MEMBR-06 → P2). Two overlapping classes can be booked back-to-back from the same member.

## Issues Encountered

- **Cannot run Expo Go smoke test from CLI.** The 6-step manual verification at the bottom of the plan (browse day-grouped list, tap card, see optimistic Booked, switch to Home, see upcomingBooking update, pull-to-refresh, retry duplicate) requires a physical phone running Expo Go pointed at a local dev server with `DEMO_MODE=true` in `templates/mail/.env.local`. The same blocker exists from D2-01 Task 5; surfacing it again so the user can run the schedule-specific flow alongside the picker flow.

## Self-Check: PASSED

Verified post-write:
- All 3 modified/created files exist on disk (`templates/mail/app/routes/api.m.{schedule,bookings}.tsx`, `packages/mobile-app/app/(tabs)/schedule.tsx`)
- All 3 task commits present in `git log --oneline`: `faf26d7c`, `11ad5d36`, `57ee093a`
- `pnpm --filter mail exec tsc --noEmit` exits 0 (no output)
- `pnpm --filter @agent-native/mobile-app exec tsc --noEmit` exits 0 (no output)
- All artifact min-line targets met: api.m.schedule.tsx 84/60, api.m.bookings.tsx 81/40, schedule.tsx 275/150
- All `must_haves.key_links` regex patterns match in the corresponding files
- `requireDemoMember` referenced in both new server routes (gate + import)
- `setQueryData`, `onMutate`, `onError`, `invalidateQueries` all present in schedule.tsx (optimistic UI mandate)

## Next Plan Readiness

**Ready for:**
- **D2-04 (member Home tab)** — `qc.invalidateQueries(['profile'])` is wired in this plan's onSuccess; the Home tab can rely on `['profile']` as its query key and trust it'll refresh after any booking.
- **D2-06 (agent chat + tools)** — the `book_class` agent tool can call POST `/api/m/bookings` server-side directly with the same payload shape and member resolution, satisfying agent-native single-source-of-truth (AGENTS.md Rule 3).

**No blockers** beyond the persistent D2-wide Expo Go smoke-test deferral (carry-over from D2-01 Task 5).

---

*Phase: D2-member-mobile-app-calorie-counter-agent-days-4-7*
*Completed: 2026-05-19*
