---
phase: MC2-deep-funnel-lifecycle
plan: "03"
subsystem: meta-capi / worker / stripe-reducers
tags: [meta, capi, lifecycle, purchase, stripe, worker]
dependency_graph:
  requires: [MC2-01]
  provides: [Purchase CAPI event from checkout.session.completed, Purchase CAPI event from invoice.paid]
  affects:
    - services/worker/src/domain/stripeReducers/checkout-session-completed.ts
    - services/worker/src/domain/stripeReducers/invoice-paid.ts
tech_stack:
  added: []
  patterns: [best-effort try/catch D-17, stripe-object keyed eventId, toMajorUnits zero-decimal conversion, subscription-metadata memberId fallback]
key_files:
  created: []
  modified:
    - services/worker/src/domain/stripeReducers/checkout-session-completed.ts
    - services/worker/src/domain/stripeReducers/invoice-paid.ts
decisions:
  - "eventId = purchase:<session_id> for checkout; purchase:<invoice_id> for renewals — Stripe object ids are unique per charge event so replays dedupes and renewals each report"
  - "amount_total=0 (free checkout) IS sent — guard is != null not > 0 (valid zero-value CAPI purchase)"
  - "null memberId triggers silent skip — no CAPI fire without attribution target"
  - "resolvedMemberId hoisted above if(subId) block; subscription metadata fallback set inside block after sub retrieve"
  - "Best-effort D-17: enqueue failure isolated by try/catch, reducer never rolls back"
metrics:
  duration: 180s
  completed_date: "2026-06-23"
  tasks_completed: 2
  files_changed: 2
---

# Phase MC2 Plan 03: Stripe Purchase CAPI Fire Points Summary

Wired Purchase CAPI events into both Stripe webhook reducers — initial checkout sessions and subscription renewal invoices — carrying correct revenue value and currency for Meta value-based bidding (LIFE-02).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Enqueue Purchase from checkout.session.completed | b2e458d8 | services/worker/src/domain/stripeReducers/checkout-session-completed.ts |
| 2 | Enqueue Purchase from invoice.paid (renewals) | acc25e7b | services/worker/src/domain/stripeReducers/invoice-paid.ts |

## What Was Built

**Task 1 — checkout.session.completed Purchase enqueue**

After the existing pass-grant `for` loop, a best-effort Purchase CAPI enqueue block was added. It:

- Guards on `memberId && fullSession.amount_total != null` — null memberId skips silently; `amount_total === 0` (free checkout) IS sent (valid zero-value purchase)
- Calls `getOrUpsertAttribution(db, memberId)` to ensure attribution row + read fbc/fbp
- Calls `getMemberHashes(db, memberId)` for SHA-256 hashed email + phone
- Enqueues via `enqueueMetaCapiEvent` with `eventId = purchase:<session_id>`, `stageKey = "purchase"`, `value = toMajorUnits(amount_total, currency)`, `currency` from session (defaulting "gbp" if null)
- Wraps entirely in `try/catch` with `console.error("[checkout-session-completed] Purchase CAPI enqueue failed — non-fatal (D-17)")` — reducer never rolls back on queue failure

Three new imports added: `{ enqueueMetaCapiEvent }` from `@gymos/queue`, `{ toMajorUnits, getMemberHashes, getOrUpsertAttribution }` from `../metaLifecycle.js`, `{ resolveStageEvent }` from `../../lib/stage-event-map.js`. `getDb` added to existing `../../lib/db.js` import.

**Task 2 — invoice.paid Purchase enqueue (renewals)**

Same import additions. Additionally:

- `let resolvedMemberId: string | null = (full.metadata?.memberId as string) ?? null` hoisted above the `if (subId && customerId)` block so it is in scope for the enqueue at the end of the function
- Inside the block, after `sub` is retrieved: `resolvedMemberId = resolvedMemberId ?? ((sub.metadata?.memberId as string) ?? null)` — subscription metadata fallback for renewal invoices where the invoice itself may not carry memberId
- Best-effort enqueue at function end: `eventId = purchase:<invoice_id>` — each renewal invoice gets a unique id, so renewals each report distinctly; a replayed `invoice.paid` webhook reuses the same invoice id and pg-boss singletonKey dedupes it

## Idempotency Analysis

| Scenario | Behaviour |
|----------|-----------|
| Same checkout session replayed | eventId `purchase:<session_id>` → pg-boss singletonKey collapses duplicate |
| Subscription renewal (new invoice) | eventId `purchase:<in_new_id>` → distinct from prior renewals → each reports |
| Same renewal invoice replayed | Same `in_...` id → singletonKey dedupes |
| No memberId on invoice | `resolvedMemberId` stays null → guard fails → no enqueue |
| Queue failure | try/catch → console.error → reducer continues normally |

## Verification

- Worker `tsc --noEmit` clean (0 errors) after both edits
- All grep acceptance criteria verified:
  - `purchase:${fullSession.id}` in checkout-session-completed.ts
  - `toMajorUnits(fullSession.amount_total, currency)` in checkout-session-completed.ts
  - `stageKey: "purchase"` and `actionSource: "system_generated"` in both files
  - `purchase:${full.id}` and `toMajorUnits(full.amount_paid, currency)` in invoice-paid.ts
  - `resolvedMemberId` with `sub.metadata?.memberId` fallback in invoice-paid.ts
  - `non-fatal (D-17)` try/catch in both files

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both fire points are fully wired. Revenue value flows from Stripe `amount_total` / `amount_paid` through `toMajorUnits` to the CAPI `custom_data.value` field (handler extension landed in MC2-01 Task 3).
