---
phase: MA2-member-booking-surface
plan: 04
type: execute
wave: 4
depends_on: [MA2-03]
files_modified: []
autonomous: false
requirements: [MEM-03, MEM-04]
must_haves:
  truths:
    - "The connected Stripe account has prices wired to STRIPE_PRICE_DROP_IN / 5_PACK / 10_PACK whose product descriptions contain the credit keywords (drop-in / 5-pack / 10-pack)"
    - "On a real device: browse anonymously, sign in at the Book wall, book with a pass (credit decrements), and buy-then-book a no-pass class end-to-end"
  artifacts: []
  key_links: []
---

<objective>
End-to-end verification of the member booking surface. The build (MA2-01..03) does not block on Stripe configuration — but MEM-04 only works end-to-end when the connected account's prices + product descriptions are set. This plan confirms operator config and runs the device walkthrough. It is checkpoint-only (no code), so it is its own plan per the GSD split rule (checkpoint + implementation never share a plan).

Purpose: prove all four MA2 success criteria on a real device and confirm the deferred Stripe operator-config dependency is satisfied (or explicitly note it as pending).
Output: a verification record in the SUMMARY; no source changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA2-member-booking-surface/MA2-CONTEXT.md
@.planning/phases/MA2-member-booking-surface/MA2-RESEARCH.md
@apps/staff-web/AGENTS.md

<interfaces>
Stripe product → credit mapping (apps/staff-web/AGENTS.md "Stripe Product setup"): the product DESCRIPTION on the CONNECTED account must contain a keyword for credits to be granted on checkout.session.completed:
  "10-pack"/"10 pack" → 10 credits; "5-pack"/"5 pack" → 5; "drop-in"/"1-class" → 1; anything else → 0 credits.
Env (studio Vercel deploy): STRIPE_PRICE_DROP_IN, STRIPE_PRICE_5_PACK, STRIPE_PRICE_10_PACK (prices must live on the CONNECTED account, not the platform account — RESEARCH Pitfall 6).
Pass grant is async: Stripe webhook → Fly worker (services/worker/src/domain/stripeReducers/checkout-session-completed.ts) → INSERT passes. The mobile client polls /api/m/profile for the grant.
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Confirm Stripe products + price env on the connected account (operator config)</name>
  <action>Operator/human checkpoint — no code change. Confirm the connected-account Stripe products, keyword descriptions, and STRIPE_PRICE_* env are configured so MEM-04 works end-to-end. This verifies the deferred operator-config dependency from MA2-CONTEXT. Follow the how-to-verify steps and record "configured" / "partial" + which are missing in the SUMMARY. A pass-holder can still book if Stripe is unconfigured, so a missing price is PENDING, not a phase failure.</action>
  <what-built>MA2-03 wires the no-pass path to GET/POST /api/m/purchase, which creates Checkout on the connected account using STRIPE_PRICE_* env vars; the Fly worker grants pass credits keyed off the product DESCRIPTION keyword. This is the deferred operator-config dependency from MA2-CONTEXT.</what-built>
  <how-to-verify>
    1. In the studio's Stripe dashboard (CONNECTED account), confirm three Products exist with prices, and each product DESCRIPTION contains the matching keyword: a drop-in product ("drop-in"), a 5-pack ("5-pack"), a 10-pack ("10-pack").
    2. In the studio's Vercel project env, confirm STRIPE_PRICE_DROP_IN, STRIPE_PRICE_5_PACK, STRIPE_PRICE_10_PACK are set to those CONNECTED-account price ids (not platform-account ids).
    3. Sanity: `GET /api/m/purchase` (authenticated as a member) returns all three products with non-empty priceId.
    If any price is missing the endpoint still works for pass-holders (booking degrades gracefully) — note it as PENDING rather than failing the phase.
  </how-to-verify>
  <resume-signal>Type "configured" (all three set + keyworded), "partial" (note which are missing), or describe issues.</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Device walkthrough of the four MA2 success criteria</name>
  <action>Human device checkpoint — no code change. Run the five-step walkthrough below on a real device against the live deploy and record a PASS/FAIL matrix per MA2 success criterion in the SUMMARY. Any FAIL becomes input for `/gsd:plan-phase MA2 --gaps`.</action>
  <what-built>The complete member booking surface: anonymous browse, auth wall at Book, atomic pass-debit booking, inline Stripe purchase with poll-for-grant, and the home upcoming-bookings list.</what-built>
  <how-to-verify>
    On a real device (or the EAS dev build / Android device used for MA1 device UAT), against the live deploy:
    1. **MEM-01:** Cold-launch signed OUT → the schedule is browsable (no force-redirect to sign-in). Tap Book on a class → prompted to sign in.
    2. **MEM-02:** Sign in → returned to the SAME class on the schedule and the booking resumes/completes (not just landing on a tab root).
    3. **MEM-03:** As a member WITH credits, book an open class → card flips to Booked immediately (optimistic) and the pass-balance pill/home balance decrements by 1 after refresh. Confirm in Neon that a +1 pass_debits row and bookings.pass_id were written. Try a full class → "class just filled up" and no phantom booking.
    4. **MEM-04:** As a member with NO credits, tap Book → product picker (drop-in + 5-pack + 10-pack) → buy via Stripe Checkout → return to app → credits appear (poll) → booking completes automatically. (If Stripe is only "partial" from Task 1, verify the picker + 503/"contact the studio" degrade path instead and note MEM-04 e2e as PENDING-on-config.)
    5. **MEM-05:** Home shows the upcoming-bookings list with the just-booked class; data is scoped to the signed-in member only.
    Record PASS/FAIL per criterion + any issues for a gap-closure pass.
  </how-to-verify>
  <resume-signal>Type "approved" (all PASS) or list the failing criteria / issues.</resume-signal>
</task>

</tasks>

<verification>
- Stripe connected-account products + price env confirmed (or PENDING noted).
- All four MA2 success criteria observed PASS on a real device (or specific failures logged for `/gsd:plan-phase MA2 --gaps`).
</verification>

<success_criteria>
- MEM-04 end-to-end confirmed (purchase → grant → booking) OR explicitly recorded as PENDING-on-Stripe-config with the picker/degrade path verified.
- The phase's four success criteria are device-verified or have logged gaps.
</success_criteria>

<output>
After completion, create `.planning/phases/MA2-member-booking-surface/MA2-04-SUMMARY.md` recording the PASS/FAIL matrix and any gaps.
</output>
