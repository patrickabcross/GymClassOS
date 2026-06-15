---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: "03"
subsystem: payments
tags: [stripe, stripe-connect, webhooks, workers, tdd, reducers]

# Dependency graph
requires:
  - phase: P1c.1-stripe-connect-custom-customer-purchase-flows
    provides: "Plan 01: connectedAccounts schema + StripeEventPayload.stripeAccount; Plan 02: Connect webhook enqueues with event.account"
provides:
  - "All 6 existing reducers accept stripeAccount param and pass { stripeAccount } opts to every stripe.X.retrieve"
  - "stripe-event.ts threads stripeAccount from payload as 4th positional arg to reducer"
  - "account.updated reducer upserts chargesEnabled/payoutsEnabled/requirementsDue/disabledReason into connected_accounts"
  - "dispatch table updated with 7th entry: account.updated -> accountUpdated"
affects:
  - P1c.1-04
  - P1c.1-05
  - P1c.1-06

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "stripeAccount opt guard: `const opts = stripeAccount ? { stripeAccount } : undefined` — undefined opts is SDK no-op for platform events"
    - "account.updated reads entirely from event.data.object (no refetch) — documented exception to PITFALL #4 rule"
    - "TDD: test file written first (RED), then implementation (GREEN), existing tests updated to match new 3-arg retrieve signature"

key-files:
  created:
    - services/worker/src/domain/stripeReducers/account-updated.ts
    - services/worker/src/domain/stripeReducers/account-updated.test.ts
  modified:
    - services/worker/src/queues/stripe-event.ts
    - services/worker/src/domain/stripeReducers/dispatch.ts
    - services/worker/src/domain/stripeReducers/checkout-session-completed.ts
    - services/worker/src/domain/stripeReducers/checkout-session-completed.test.ts
    - services/worker/src/domain/stripeReducers/invoice-paid.ts
    - services/worker/src/domain/stripeReducers/invoice-paid.test.ts
    - services/worker/src/domain/stripeReducers/invoice-payment-failed.ts
    - services/worker/src/domain/stripeReducers/subscription-updated.ts
    - services/worker/src/domain/stripeReducers/subscription-updated.test.ts
    - services/worker/src/domain/stripeReducers/subscription-deleted.ts
    - services/worker/src/domain/stripeReducers/charge-refunded.ts
    - services/worker/src/domain/stripeReducers/charge-refunded.test.ts

key-decisions:
  - "opts guard pattern: pass undefined (not { stripeAccount: undefined }) — confirmed SDK tolerates undefined opts; simpler than checking field presence"
  - "subscription-deleted is the documented no-refetch exception (resource deleted in Stripe); stripeAccount param accepted for uniformity but underscore-prefixed"
  - "account.updated: no refetch needed — full Stripe.Account in data.object; _stripeAccount underscore-prefixed as unused"
  - "Existing tests updated (subscription-updated + charge-refunded) to match new (id, {}, opts) retrieve call signature rather than old (id) — required for backward compat validation"

requirements-completed: [STR-01, STR-02, PAY-01, PAY-02]

# Metrics
duration: 18min
completed: 2026-06-12
---

# Phase P1c.1 Plan 03: Worker Reducer Account-Awareness Summary

**All 6 Stripe reducers thread `{ stripeAccount }` into every `stripe.X.retrieve` call (Pitfall 3 closed), plus a new `account.updated` reducer upserts readiness flags into `connected_accounts` via idempotent ON CONFLICT upsert.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-12T15:50:00Z
- **Completed:** 2026-06-12T16:08:14Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 13 (11 modified + 2 created)

## Accomplishments

- Threaded `stripeAccount` from `StripeEventPayload` through `stripe-event.ts` as the 4th positional arg to every reducer call
- Widened all 6 existing reducer signatures to `(event, tx, stripe, stripeAccount?: string)` and applied the `opts = stripeAccount ? { stripeAccount } : undefined` guard pattern to every `stripe.X.retrieve` call
- Created `account-updated.ts`: upserts `connected_accounts` row idempotently on every `account.updated` event; reads everything from `event.data.object` (no Stripe refetch — documented exception)
- Registered `account.updated` in the dispatch table as the 7th reducer
- All 90 worker tests green (87 pre-existing + 3 new for account-updated)

## Task Commits

1. **Task 1: Thread stripeAccount through handler + all 6 reducers** - `2d3a7492` (feat)
2. **Task 2: Add account.updated reducer + register in dispatch** - `477bb2d2` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `services/worker/src/queues/stripe-event.ts` — extract `stripeAccount` from payload; pass as 4th arg to reducer
- `services/worker/src/domain/stripeReducers/dispatch.ts` — import + register `accountUpdated`
- `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` — widen sig, pass opts to sessions.retrieve
- `services/worker/src/domain/stripeReducers/invoice-paid.ts` — widen sig, pass opts to invoices.retrieve + subscriptions.retrieve
- `services/worker/src/domain/stripeReducers/invoice-payment-failed.ts` — widen sig, pass opts to invoices.retrieve
- `services/worker/src/domain/stripeReducers/subscription-updated.ts` — widen sig, pass opts to subscriptions.retrieve
- `services/worker/src/domain/stripeReducers/subscription-deleted.ts` — widen sig (_stripeAccount unused — no-refetch exception)
- `services/worker/src/domain/stripeReducers/charge-refunded.ts` — widen sig, pass opts to charges.retrieve
- `services/worker/src/domain/stripeReducers/account-updated.ts` — NEW: ON CONFLICT upsert reducer
- `services/worker/src/domain/stripeReducers/account-updated.test.ts` — NEW: 3 unit tests
- `services/worker/src/domain/stripeReducers/checkout-session-completed.test.ts` — updated: stripeAccount assertions
- `services/worker/src/domain/stripeReducers/invoice-paid.test.ts` — updated: stripeAccount assertions
- `services/worker/src/domain/stripeReducers/subscription-updated.test.ts` — updated: new retrieve call signature
- `services/worker/src/domain/stripeReducers/charge-refunded.test.ts` — updated: new retrieve call signature

## Decisions Made

- Used `const opts = stripeAccount ? { stripeAccount } : undefined` guard rather than always passing `{ stripeAccount: undefined }`. Both are SDK no-ops for platform events, but explicit `undefined` opts is cleaner and avoids any potential SDK overload confusion.
- `subscription-deleted.ts` does not retrieve (resource is gone); `_stripeAccount` accepted for dispatch uniformity.
- `account.updated` reads from `event.data.object` exclusively (no refetch). The full `Stripe.Account` object is present in the event; refetching would be redundant and would require a stripeAccount param — not needed here.
- Updated existing tests for `subscription-updated` and `charge-refunded` to reflect the new `(id, {}, opts)` call signature, validating that platform-event backward compatibility holds via `undefined` opts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing tests expected old `retrieve(id)` signature, broke after refactor**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `subscription-updated.test.ts` asserted `subRetrieve.toHaveBeenCalledWith("sub_abc")` (1 arg). After change to `retrieve(sub.id, {}, opts)`, test failed with 3-arg mismatch.
- **Fix:** Updated `subscription-updated.test.ts` to assert `("sub_abc", {}, undefined)` and `charge-refunded.test.ts` similarly.
- **Files modified:** subscription-updated.test.ts, charge-refunded.test.ts
- **Verification:** All 90 tests green after fix
- **Committed in:** 2d3a7492 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — test signature mismatch from signature widening)
**Impact on plan:** Necessary to maintain test correctness. No scope creep.

## Issues Encountered

None — plan executed cleanly.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- Worker is now fully Connect-aware: all reducers accept stripeAccount and route Stripe API calls correctly
- `account.updated` events will keep `connected_accounts.charges_enabled/payouts_enabled` live
- Plans 04/05/06 (checkout/portal/mobile purchase) depend on reducers being account-scoped — this plan satisfies that prerequisite
- Subscription `memberId` read contract intact; write-side fix (setting `subscription_data.metadata.memberId` in Checkout) lands in Plan 04 as designed

---
*Phase: P1c.1-stripe-connect-custom-customer-purchase-flows*
*Completed: 2026-06-12*
