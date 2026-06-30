---
phase: MA2-member-booking-surface
plan: 01
subsystem: api
tags: [react-router, drizzle, neon, postgres, transactions, stripe-passes, member-api, booking]

# Dependency graph
requires:
  - phase: MA1-auth-3-role-spine
    provides: requireMember / sessionFromRequest h3-v2 adapter shim; bearer→session→gym_members claim
provides:
  - getOptionalMember(request) — session-only member resolution that never throws 401 (anon browse)
  - Anonymous read branch on GET /api/m/schedule (browse public, no member-scoped data for anon)
  - Atomic pass-debit-on-booking transaction in POST /api/m/bookings (capacity + FIFO active-pass + pass_debits +1 + bookings.pass_id)
  - 402 NO_PASS / 409 CAPACITY_FULL / 409 OCCURRENCE_UNAVAILABLE / 404 OCCURRENCE_NOT_FOUND error contract
  - Additive upcomingBookings[] on GET /api/m/profile (member-scoped, limit 10)
affects: [MA2-02, MA2-03, MA2-04, member-mobile-booking, cancel-occurrence-refund-reconciliation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-member resolution: requireMember minus throws minus lazy-claim, reusing sessionFromRequest"
    - "Booking = one db.transaction mirroring cancel-occurrence.ts; positive pass_debit is the +1 mirror of the -1 refund"
    - "Per-pass remaining via separate SUM aggregation (never chain-join pass_debits)"
    - "Postgres FOR UPDATE row lock applied via narrow cast over the LibSQL compile-time driver type"

key-files:
  created: []
  modified:
    - apps/staff-web/server/lib/member-session.ts
    - apps/staff-web/app/routes/api.m.schedule.tsx
    - apps/staff-web/app/routes/api.m.bookings.tsx
    - apps/staff-web/app/routes/api.m.profile.tsx
    - apps/staff-web/AGENTS.md

key-decisions:
  - "getOptionalMember does NOT lazy-claim-by-email — the GET read stays side-effect-free; claim happens on first write/profile via requireMember"
  - "FOR UPDATE lock applied via `(query as any).for('update')` because getDb() is typed LibSQL at compile time but runs on Neon Postgres; the in-txn capacity count is the correctness floor if the lock no-ops"
  - "Idempotency pre-check moved INSIDE the transaction so a double-click returns the existing booking without a second insert"
  - "upcomingBookings[] is additive — the singular upcomingBooking field is preserved for back-compat"

patterns-established:
  - "Pattern: anonymous read branch — resolve member optionally, skip member-scoped queries, default member flags to false/empty"
  - "Pattern: booking debit mirrors cancel-occurrence refund against the same pass_id so the ledger reconciles"

requirements-completed: [MEM-01, MEM-03, MEM-05]

# Metrics
duration: 5min
completed: 2026-06-30
---

# Phase MA2 Plan 01: Member Booking Surface (server) Summary

**Server contract for "browse public, book authenticated, debit-on-booking": getOptionalMember enables anonymous schedule browse, POST /api/m/bookings becomes one atomic transaction (capacity + FIFO active-pass + pass_debits +1 + bookings.pass_id) mirroring cancel-occurrence, and /api/m/profile gains an additive upcomingBookings[] — zero migration, zero new dependency.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-30T20:47:03Z
- **Completed:** 2026-06-30T20:52:16Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `getOptionalMember(request): Member | null` — `requireMember` minus all throws and minus the lazy claim; reuses the `sessionFromRequest` h3-v2 shim (RESEARCH Pitfall 5). Never 401s.
- `GET /api/m/schedule` resolves the member optionally; Query A (occurrences) + Query B (counts) run for everyone, Query C (per-member booked-set) is skipped for anonymous callers so `isBookedByMe` defaults false. Anonymous browse now returns 200, never 401.
- `POST /api/m/bookings` rewritten as ONE `db.transaction`: in-txn idempotency pre-check → `FOR UPDATE` occurrence lock + status check → capacity count → FIFO active-pass pick → booking insert with `pass_id` → `+1` `pass_debits` row (`reason:'class_booking'`). Distinguishable error codes: 402 NO_PASS, 409 CAPACITY_FULL, 409 OCCURRENCE_UNAVAILABLE, 404 OCCURRENCE_NOT_FOUND.
- The positive debit is the exact mirror of `cancel-occurrence.ts`'s `-1` refund against the same `pass_id`, so a later cancellation reconciles against the booking's pass.
- `GET /api/m/profile` gains an additive `upcomingBookings[]` (member-scoped, status booked, future, `asc(startsAt)`, `limit 10`) alongside the preserved singular `upcomingBooking`.

## Task Commits

Each task was committed atomically:

1. **Task 1: getOptionalMember + anonymous /api/m/schedule read (MEM-01 server)** — `f5bf9850` (feat)
2. **Task 2: atomic pass-debit booking transaction (MEM-03 server)** — `727e5e40` (feat)
3. **Task 3: additive upcomingBookings[] on /api/m/profile (MEM-05 server)** — `e61a0301` (feat)

## Files Created/Modified
- `apps/staff-web/server/lib/member-session.ts` — added `getOptionalMember` (session-only, no throws, no lazy claim)
- `apps/staff-web/app/routes/api.m.schedule.tsx` — anonymous read branch via `getOptionalMember`; Query C guarded behind a non-null member
- `apps/staff-web/app/routes/api.m.bookings.tsx` — full rewrite to one atomic transaction (capacity + FIFO active-pass + pass_debits +1 + pass_id); JSON error contract
- `apps/staff-web/app/routes/api.m.profile.tsx` — additive `upcomingBookings[]` list query + field
- `apps/staff-web/AGENTS.md` — Member API table rows for `/api/m/schedule` (anon read branch) and `/api/m/bookings` (atomic transaction + error codes)

## Decisions Made
- **No lazy claim in `getOptionalMember`** — keeps the public GET side-effect-free. A session whose `gym_members` row is not yet linked returns `null` (browse-only); the claim still happens on the first write/profile call via `requireMember`.
- **FOR UPDATE via narrow cast** — `getDb()` is typed `LibSQLDatabase` at compile time (SQLite has no `FOR UPDATE`) but the runtime driver is Neon Postgres. The lock is applied with `(occQuery as any).for("update")`; the in-transaction capacity count is the correctness floor if the lock clause is ever a no-op. This keeps `tsc` clean while still locking on prod.
- **Idempotency moved inside the transaction** — a concurrent double-book returns the existing booking id rather than racing a second insert.
- **`upcomingBookings[]` additive** — the singular `upcomingBooking` is untouched (back-compat for existing Home consumers).

## Deviations from Plan

None - plan executed exactly as written. (The `.for("update")` narrow cast is the plan's own contingency for the LibSQL compile-time type — explicitly anticipated in Task 2's action notes — not a deviation.)

## Issues Encountered
- Two pre-existing `tsc` errors in `actions/mark-booking-attended.ts` (`Property 'execute' does not exist on type 'LibSQLDatabase'`, lines 88/95) surfaced in the project-wide `tsc --noEmit`. These are byte-identical to their MA3-02 state, are NOT in any file this plan touched, and are already logged to `.planning/phases/MA3-teacher-session-surface/deferred-items.md`. Out of scope (Scope Boundary). All four files this plan modified are `tsc`-clean.

## Verification
- `npx tsc --noEmit` (apps/staff-web): clean for all four modified files; only the two pre-existing unrelated `mark-booking-attended.ts` errors remain.
- `npx prettier --write` run on all changed files.
- No migration: `git diff` shows no change to `server/plugins/db.ts` and no new file under `server/db/migrations/`.
- No new dependency: `git diff` of `apps/staff-web/package.json` is empty (`nanoid` already a dep, used by `cancel-occurrence.ts`).
- Grep contract checks pass: one `db.transaction`, `+1` `pass_debits` with `reason:"class_booking"`, booking insert sets `passId`, `NO_PASS`/`CAPACITY_FULL` + 402/409 statuses, active-pass filter (`expiresAt` NULL-or-future) with FIFO `NULLS LAST` + `createdAt` order, no `leftJoin` for balance, `nanoid` import; profile has `upcomingBookings` + `limit(10)`, singular field preserved.
- **Booking behavior live-replay (active-pass→booking+debit+passId / no-pass→402 / full→409 / duplicate→idempotent) deferred to deploy smoke.** No Neon MCP tool is available in this environment and the standing v1.0 constraint (local `agent-native dev` cannot boot — `NitroViteError`) precludes a local HTTP walkthrough. The transaction is a structural mirror of the production-proven `cancel-occurrence.ts` pattern; verify on the next Vercel deploy via a curl smoke (a member with 1 credit booking an open class → 1 booking row with `pass_id` + 1 `pass_debits` amount 1; second identical POST idempotent; a 0-credit member → 402 + 0 new rows).

## User Setup Required
None for this plan's code. Operator/config note carried from MA2 research (for end-to-end MEM-04 in later plans, NOT this plan): `STRIPE_PRICE_*` env vars + Stripe product descriptions containing the credit keywords (`drop-in`/`5-pack`/`10-pack`) must be set on the connected account. A member who already has a pass can book without any Stripe configuration.

## Next Phase Readiness
- Server booking contract is the surface MA2-02 (mobile book flow) and MA2-03 wire against: the 402 NO_PASS branch is the trigger for the Stripe inline purchase → poll → re-book flow; the 409 CAPACITY_FULL branch is the optimistic-UI rollback signal.
- `upcomingBookings[]` is ready for the Home list render (MEM-05 client half).
- Anonymous `/api/m/schedule` unblocks the MEM-01 AuthGate move (wall at Book press, not app entry) in the mobile plan.

---
*Phase: MA2-member-booking-surface*
*Completed: 2026-06-30*

## Self-Check: PASSED

All 5 modified files + SUMMARY.md present on disk; all 3 task commits (f5bf9850, 727e5e40, e61a0301) present in git history.
