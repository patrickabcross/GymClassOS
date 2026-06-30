# MA2-04 — Verification Checkpoints (Summary)

**Status:** Deferred — operator-config + EAS/device-gated (no buildable code; verification plan)
**Date:** 2026-06-30

MA2-04 is the verification-only plan for the Member Booking Surface. It contains no source changes — its two checkpoints are external-state verification that cannot be completed in this environment. They are recorded here (and in MA2-VERIFICATION.md, status `human_needed`) as tracked UAT debt, consistent with the MA1-03 / MA4 / MA3 device-gate pattern.

The buildable phase (MA2-01/02/03) is complete and code-verified 5/5 (MEM-01..05) against the actual codebase. The booking transaction is a structural mirror of the production-proven `cancel-occurrence.ts` refund pattern.

## Checkpoint 1 — Stripe connected-account configuration (operator)

Required for end-to-end MEM-04 only (a member who already holds a pass books without any Stripe config):

- [ ] Create 3 products on the **connected** account with credit keywords in the **description**: `drop-in` (1-class), `5-pack`, `10-pack` (the `checkout-session-completed` reducer grants credits by matching these keywords).
- [ ] Set env on staff-web (Vercel, Production): `STRIPE_PRICE_DROP_IN`, `STRIPE_PRICE_5_PACK`, `STRIPE_PRICE_10_PACK` → the connected-account price ids.
- [ ] Confirm `GET /api/m/purchase` returns all three products (not 503).

## Checkpoint 2 — On-device walkthrough (EAS dev build on a physical iPhone, against the live deploy)

Same external gate as MA1-03 (Expo Go dead-ends at SDK 54; Simulator needs a Mac). Walkthrough of the 4 success criteria:

- [ ] Anonymous browse: open the app signed-out → schedule loads (no login wall at entry); tapping **Book** prompts sign-in.
- [ ] Sign-in resume (MEM-02): after sign-in the member returns to the same class and the booking completes.
- [ ] Pass-holder optimistic book (MEM-03): booking appears instantly; verify on Neon a `+1 pass_debits` row + `bookings.pass_id` set; full class shows "just filled up" + rollback.
- [ ] No-pass path (MEM-04): product picker → Stripe Checkout → return → poll-for-grant → auto-book; or graceful "contact the studio" if Stripe is partial.
- [ ] Home surface (MEM-05): upcoming-bookings list + pass balance render, scoped to the member.

## Deploy prerequisite

These MA2 commits (and all MA4/MA3 work this session) are on `master` but **not yet deployed** — the live Vercel deploy still runs the pre-session code. A `git push origin master` is required before any on-device walkthrough against the live deploy.

---

*Plan: MA2-member-booking-surface / MA2-04*
*Verification deferred 2026-06-30 — tracked in MA2-VERIFICATION.md (human_needed)*
