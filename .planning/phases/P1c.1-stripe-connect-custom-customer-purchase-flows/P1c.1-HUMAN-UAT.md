---
status: partial
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
source: [P1c.1-VERIFICATION.md]
started: 2026-06-13
updated: 2026-06-13
---

## Current Test

[awaiting human testing]

## Tests

### 1. Staff checkout-link from inbox / member profile (Success Criterion 4)
expected: A coach can generate + send a Stripe checkout link directly from the inbox conversation or a member profile (staff surface).
result: RESOLVED (2026-06-13, quick task 260613-oul) — a `CheckoutLinkButton` ("Payment link" dropdown → Drop-in / Membership → Dialog with the Checkout URL + copy-to-clipboard) is now on the member profile header (`gymos.members_.$id.tsx`), calling `create-checkout-link` with the member's id + a server-resolved `productKey` (no price IDs on the client). Deployed + promoted to production; route loads 200. WhatsApp send and the inbox-header affordance were intentionally deferred (copy-to-clipboard MVP; send would require routing through the worker's compliance chokepoint).

### 2. Membership subscription purchase — live end-to-end (Success Criterion 2b)
expected: Completing a test-mode subscription checkout on the connected account activates the subscription and records it via the invoice.paid reducer.
result: [pending] — code-complete; `/embed/buy?...&mode=subscription` confirmed to 302 into Stripe, and recurring prices now auto-coerce to subscription mode. Not yet completed end-to-end in test mode.

### 3. Customer Portal (create-portal-link) — live (Success Criterion 7)
expected: A member with a prior purchase can open the Stripe Customer Portal on the connected account to manage their subscription / payment method.
result: [pending] — `create-portal-link` wired correctly; requires a `stripe_customers` row (a completed purchase) to exercise.

### 4. Mobile purchase on device (Success Criterion 6)
expected: A logged-in demo member opens the mobile purchase screen, fetches products, and completes a Checkout in a browser sheet.
result: [pending] — `/api/m/purchase` is live (non-404, auth-gated); needs an on-device walkthrough via Expo Go.

## Summary

total: 4
passed: 1
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

- Criterion 4 RESOLVED via quick task 260613-oul (direct checkout-link button on member profile, deployed to prod).
- Remaining 3 items (subscription purchase live, Customer Portal live, mobile purchase on device) are manual live-tests of already-code-complete, mechanism-proven paths — tracked as follow-up UAT, not code gaps.
