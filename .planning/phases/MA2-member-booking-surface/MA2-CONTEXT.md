# Phase MA2: Member Booking Surface — Context

**Gathered:** 2026-06-30
**Status:** Ready for planning
**Source:** User decisions (locked) + MA2-RESEARCH.md

<domain>
## Phase Boundary

Anyone can open the app and browse the schedule without logging in. A member who taps Book is walked from sign-in (if needed) through to a confirmed booking — paying inline via Stripe when they have no active pass — and can see their upcoming bookings and pass balance on a home surface. Pure wiring of existing `/api/m/*` endpoints + existing mobile member tabs; NO new schema, NO migration, NO new dependency.
</domain>

<decisions>
## Implementation Decisions

### No-pass purchase path (MEM-03) — LOCKED: Product picker
- When a signed-in member with NO active pass taps Book, show a **product picker** offering drop-in + 5-pack + 10-pack, then open Stripe Checkout for the chosen product.
- Source the product list from `/api/m/purchase` (GET) — confirm/extend it to return the configured products (drop-in / 5-pack / 10-pack) with prices; the POST returns the hosted Checkout URL for the chosen product.
- Pack purchases save the member money and use all configured Stripe products — do not collapse to drop-in only.

### Home surface (MEM-05) — LOCKED: List of upcoming bookings
- Render an `upcomingBookings[]` list on Home (not just the single "next class" card).
- Add an additive `upcomingBookings[]` field to the `/api/m/profile` response (NO migration — derived query). Keep the existing single-card data too if convenient, but the Home UI shows the list.

### Post-sign-in return (MEM-02) — LOCKED: Return to that class
- When a signed-out member taps Book and signs in, carry the `occurrenceId` through the sign-in flow and return them to the same class so they can complete the booking in one continuous flow (not just land on the schedule).

### Booking + pass debit (MEM-02) — the real work
- `/api/m/bookings` POST currently inserts a booking row but does NOT debit a pass, has NO atomic capacity check, and never sets `bookings.pass_id` (its own comment says "Demo-grade"). MA2 MUST add an atomic transaction: capacity check + entitlement (active pass) resolution + positive `pass_debits` entry + set `bookings.pass_id`.
- Mirror the proven refund pattern in `apps/staff-web/actions/cancel-occurrence.ts` so refunds reconcile against the SAME `passId`. `bookings.pass_id` column already exists (no migration).
- Pass is debited **on booking**, never on purchase (success criterion 2). "Active" pass = `expires_at` NULL or future; balance = SUM(granted) − SUM(debited); never chain-join through `pass_debits`.

### Public browse vs gated book (MEM-01) — two regressions to fix
- `/api/m/schedule` is currently `requireMember`-gated (401s anonymously). Add an **anonymous read branch** (e.g. `getOptionalMember`) so anyone can browse the schedule without a token.
- `packages/mobile-app/app/_layout.tsx` `AuthGate` currently force-redirects to `/sign-in` on no token (hard wall at app entry). Move the auth wall to the **Book press**, not app entry.

### Async pass-grant race (MEM-04) — the correctness risk
- `/api/m/purchase` returns a hosted Stripe Checkout URL; the pass is granted **asynchronously** by the Fly worker after `checkout.session.completed`. The booking does NOT auto-complete.
- Pattern: open Checkout via `expo-web-browser`; Stripe's `success_url` is a plain web page (NOT a deep link), so on return to the app **poll `/api/m/profile`** until the pass grant appears, THEN re-issue the booking (POST `/api/m/bookings`). Use optimistic UI per AGENTS.md (setQueryData, rollback on error/no-capacity 409).

### Claude's Discretion
- Exact picker UI (sheet vs screen); poll interval/backoff + timeout copy for the grant wait; how occurrenceId is threaded through sign-in (route param vs stored intent); precise `upcomingBookings[]` shape.
</decisions>

<specifics>
## Specific Ideas

- Mobile member tabs already scaffolded and using `apiFetch` (Bearer): `packages/mobile-app/app/(tabs)/schedule.tsx`, `passes.tsx`, `index.tsx`. MA2 wires them to the real booking/purchase/profile behavior.
- `/api/m/profile` already returns `{member, passBalance, upcomingBooking, today}` (verified live) — Home is mostly done; only the plural list + booking flow are new.
- Member booking stays REST `/api/m/*` — NO agent tool, NO four-area agent contract (that's a staff-web concern).
</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/MA2-member-booking-surface/MA2-RESEARCH.md` — endpoint shapes, the demo-grade booking gap, async-grant race, AuthGate wall
- `apps/staff-web/app/routes/api.m.bookings.tsx` — booking endpoint to upgrade (add atomic capacity + pass debit)
- `apps/staff-web/actions/cancel-occurrence.ts` — proven pass-debit/refund transaction pattern to mirror
- `apps/staff-web/app/routes/api.m.schedule.tsx` — needs anonymous read branch (MEM-01)
- `apps/staff-web/app/routes/api.m.purchase.tsx` + `apps/staff-web/app/routes/api.m.profile.tsx` — purchase + home data
- `apps/staff-web/server/lib/member-session.ts` — `requireMember`; add/confirm `getOptionalMember`
- `packages/mobile-app/app/_layout.tsx` (AuthGate), `app/(tabs)/{schedule,passes,index}.tsx`, `lib/api.ts`
- `apps/staff-web/AGENTS.md` — Member API section + Stripe product/keyword setup
</canonical_refs>

<deferred>
## Deferred Ideas

- Stripe `STRIPE_PRICE_*` env vars + product descriptions (must contain `drop-in`/`5-pack`/`10-pack` keywords) on the CONNECTED account — an operator/verification step for end-to-end MEM-04, NOT a build blocker (a member who already has a pass can book without Stripe configured). Plan should include a verify step, not block on it.
</deferred>

---

*Phase: MA2-member-booking-surface*
*Context gathered: 2026-06-30 (user decisions + research)*
