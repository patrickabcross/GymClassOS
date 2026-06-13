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
result: [pending] — POSSIBLE GAP. `create-checkout-link` is wired and works, but is only reachable via the noticeboard Revenue card's propose→approve flow (`BoardCard.tsx`). No direct "send checkout link" button exists in `gymos.inbox.tsx` or `gymos.members_.$id.tsx`. If the propose→approve path satisfies the criterion, this passes; if a literal button on those surfaces is required, a small UI addition is needed.

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
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- Criterion 4 (checkout-link from inbox/member profile) is the only item that may require a code change rather than just a manual test. Decision needed: does the existing noticeboard propose→approve flow satisfy it, or is a direct UI trigger required?
