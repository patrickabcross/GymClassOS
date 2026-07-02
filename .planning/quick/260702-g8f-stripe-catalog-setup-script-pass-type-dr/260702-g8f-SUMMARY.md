---
phase: quick-260702-g8f
plan: 01
subsystem: payments / worker / staff-web
tags: [stripe, pass-types, catalog, reducers, tdd, idempotency]
dependency_graph:
  requires: [C47-pass-types-schema]
  provides: [stripe-catalog-provisioned, pass_type_id-stamped-on-purchase, subscription-renewal-grants]
  affects: [passes, pass_types, stripe-reducers, booking-balance]
tech_stack:
  added: [pass-type-grant.ts helper]
  patterns: [deterministic-id + ON CONFLICT DO NOTHING, pass_type-driven grant, robust periodEnd derivation]
key_files:
  created:
    - apps/staff-web/scripts/setup-stripe-catalog.ts
    - services/worker/src/domain/stripeReducers/pass-type-grant.ts
  modified:
    - apps/staff-web/package.json
    - services/worker/src/domain/stripeReducers/checkout-session-completed.ts
    - services/worker/src/domain/stripeReducers/invoice-paid.ts
    - services/worker/src/domain/stripeReducers/checkout-session-completed.test.ts
    - services/worker/src/domain/stripeReducers/invoice-paid.test.ts
    - apps/staff-web/AGENTS.md
decisions:
  - "pass_type-driven grant supersedes keyword fallback; keyword fallback retained for pre-catalog prices (pass_type_id = NULL = allow-all)"
  - "lookupPassTypeByPrice extracted to pass-type-grant.ts shared helper (avoids duplication across checkout + invoice reducers)"
  - "invoice.paid is the sole grant path for subscriptions; checkout continues to skip subscription mode"
  - "periodEnd derives from invoice line period.end -> sub item -> sub object -> now+31d; never epoch-0"
metrics:
  duration: ~30min
  completed: "2026-07-02"
  tasks: 3
  files: 8
---

# Phase quick-260702-g8f Plan 01: Stripe Catalog Setup Script + pass_type-driven Grant Reducers — Summary

**One-liner:** Idempotent 8-item pass catalog provisioner + pass_type_id-stamped Stripe grant reducers (checkout + subscription renewal).

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Idempotent Stripe catalog setup script + pass_types upsert | `047944ad` |
| 2 TDD RED | Failing tests for pass_type-driven grant reducers | `ec6d9b62` |
| 2 TDD GREEN | pass_type-driven reducers implementation | `81b4e316` |
| 3 | Document catalog + pass_type grants in AGENTS.md | `8ec097c8` |

## Operator Run Command

```bash
# Test run first (safe — test key, test connected account):
STRIPE_SECRET_KEY=sk_test_... pnpm --filter @gymos/staff-web stripe:setup-catalog

# Production run (live key, HUSTLE connected account):
STRIPE_SECRET_KEY=sk_live_... pnpm --filter @gymos/staff-web stripe:setup-catalog --account=acct_1ToNIZEBDNMe9qqF
```

### Required environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `STRIPE_SECRET_KEY` | YES | Platform secret key (test or live). Script exits if missing. |
| `DATABASE_URL` | YES (for pass_types upsert) | Neon connection string for the target studio deploy. |
| `STRIPE_CONNECTED_ACCOUNT_ID` | optional | Override connected account. Falls back to CLI `--account=`, then DB row, then default `acct_1ToNIZEBDNMe9qqF`. |

The `pass_types` upsert writes to whichever `DATABASE_URL` the staff-web's `server/db/index.js` resolves. For HUSTLE: `gymos-demo` Neon project.

## Worker Test Results (Task 2 verification)

```
Test Files  2 passed (2)
Tests       16 passed (16)
```

Breakdown:
- 12 pre-existing tests: all pass (no regressions)
- 4 new checkout tests: PASS
  - pass_type match stamps pass_type_id + correct credits/expiry
  - unlimited pass_type (credits null) → granted = 999
  - subscription mode → no pass INSERT
  - unknown price + keyword → legacy grant + pass_type_id = NULL
- 2 new invoice tests: PASS (moved from RED to GREEN)
  - grant with deterministic id `pass_sub_<invoiceId>`
  - replay: ON CONFLICT DO NOTHING (idempotent)

Note: console noise `"[...] Purchase CAPI enqueue failed — non-fatal (D-17): No getDb export is defined on the mock"` is pre-existing behavior — `getDb` is intentionally absent from the db.js vi.mock (only `schema` is mocked), and the CAPI block's try/catch absorbs the error. This was the same before this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Enhancement] `lookupPassTypeByPrice` returns `name` in addition to `id, credits, validity_days`**

- **Found during:** Task 2 implementation
- **Issue:** Plan spec showed return type `{ id, credits, validityDays }` only, but the reducer needed `pt.name` for `product_name` in the passes INSERT (`product_name = pt name/'membership'`).
- **Fix:** Extended the SELECT to include `name` and added `name: string` to the `PassTypeRow` interface.
- **Files modified:** `services/worker/src/domain/stripeReducers/pass-type-grant.ts`
- **Commit:** `81b4e316`

None - all other plan items executed exactly as written.

## Known Stubs

None. The catalog script writes real data to Stripe + the app DB when run by the operator. The reducers wire real pass_type_id onto every Stripe-driven grant.

## Self-Check: PASSED

All key files exist and all 4 commits verified:
- `047944ad` feat: stripe catalog setup script
- `ec6d9b62` test: failing tests for pass_type-driven grant reducers (RED)
- `81b4e316` feat: pass_type-driven stripe grant reducers (GREEN)
- `8ec097c8` docs: document catalog + pass_type grants
