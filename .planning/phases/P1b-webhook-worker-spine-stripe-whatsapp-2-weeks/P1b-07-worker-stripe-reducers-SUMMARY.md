---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 07
subsystem: worker-stripe-reducers
tags: [stripe, webhooks, idempotency, pgcrypto, pg-boss, drizzle-transaction]
status: complete
requirements: [WEB-06, STR-03, STR-04, STR-05, STR-06, STR-07]
dependency_graph:
  requires:
    - "P1b-01 (apps/worker pnpm workspace)"
    - "P1b-02 (stripe_customers + stripe_subscriptions + payments + secrets tables + pgcrypto extension + composite UNIQUE on webhook_events)"
    - "P1b-03 (@gymos/queue: StripeEventPayload schema + QUEUE_NAMES.STRIPE_EVENT)"
    - "P1b-04 (edge-webhooks Stripe verify + enqueue producer)"
    - "P1b-05 (apps/worker bootstrap + pg-boss + /healthz + env schema with PGCRYPTO_MASTER_KEY)"
  provides:
    - "stripe-event pg-boss consumer (D-22): 6 reducers in single TX with refetch + idempotency"
    - "pgcrypto-backed writeSecret/readSecret for STR-01 rotation-capable storage"
    - "getStripe(db) with apiVersion 2026-04-22.dahlia pinned + key resolved from secrets→env"
    - "Deterministic-key idempotency scheme reusable for any future webhook reducer"
  affects:
    - "Plan P1b-08 (staff-web): writeSecret('stripe_restricted_key', plaintext, db) is the rotation entry point — UI just calls it"
    - "Plan P1b-09 (validation): replay-twice tests run against this queue; fixtures listed below"
tech-stack:
  added:
    - "Stripe SDK 19.3.1 (already present from P1b-04)"
    - "pgcrypto pgp_sym_encrypt/pgp_sym_decrypt (extension enabled in P1b-02 migration)"
  patterns:
    - "Single Drizzle transaction wraps reducer + processed_at UPDATE (WEB-06)"
    - "Refetch-from-Stripe (PITFALL #4): every reducer ignores webhook payload except subscription-deleted (resource gone)"
    - "Deterministic-key idempotency: pay_<piId>, pass_<piId>_<liId>, pdebit_refund_<chgId>_<passId> + ON CONFLICT DO NOTHING"
    - "Last-write-wins for resources that mutate (subscriptions): onConflictDoUpdate"
    - "pg-boss v12 WorkOptions: batchSize + localConcurrency (NOT v11's teamSize/teamConcurrency)"
key-files:
  created:
    - "apps/worker/src/lib/secrets.ts"
    - "apps/worker/src/lib/secrets.test.ts"
    - "apps/worker/src/lib/stripe.ts"
    - "apps/worker/src/queues/stripe-event.ts"
    - "apps/worker/src/domain/stripeReducers/index.ts"
    - "apps/worker/src/domain/stripeReducers/dispatch.ts"
    - "apps/worker/src/domain/stripeReducers/checkout-session-completed.ts"
    - "apps/worker/src/domain/stripeReducers/checkout-session-completed.test.ts"
    - "apps/worker/src/domain/stripeReducers/invoice-paid.ts"
    - "apps/worker/src/domain/stripeReducers/invoice-paid.test.ts"
    - "apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts"
    - "apps/worker/src/domain/stripeReducers/subscription-updated.ts"
    - "apps/worker/src/domain/stripeReducers/subscription-updated.test.ts"
    - "apps/worker/src/domain/stripeReducers/subscription-deleted.ts"
    - "apps/worker/src/domain/stripeReducers/charge-refunded.ts"
    - "apps/worker/src/domain/stripeReducers/charge-refunded.test.ts"
  modified:
    - "apps/worker/src/lib/db.ts (extended schema mirror with stripe_customers + stripe_subscriptions + payments + passes + pass_debits + secrets)"
    - "apps/worker/src/index.ts (registerStripeEventWorker added alongside outbound-whatsapp)"
decisions:
  - "pg-boss v12: stripe-event WorkOptions = batchSize: 3 + localConcurrency: 3 (D-14 concurrency=3); plan said teamSize/teamConcurrency but v11's names were removed — same translation P1b-05/06 did for inbound/outbound queues"
  - "Stripe Invoice retrieve result cast to `any` for legacy top-level `subscription` / `payment_intent` fields. SDK 19.x types moved them but pinned dahlia API still returns them at top level. Runtime correct; types lag SDK"
  - "subscription-deleted is the lone reducer with NO refetch — Stripe resource is deleted, refetch would 404. Webhook payload IS source of truth here; UPDATE keyed by deterministic stripe_subscription_id preserves replay safety"
  - "Local Drizzle schema mirror extended in apps/worker/src/lib/db.ts (same dialect-typing-as-sqlite friction documented in P1b-04 + P1b-05 + P1b-06). Plan 09 will extract packages/db/"
metrics:
  duration_minutes: 11
  tasks_completed: 3
  files_created: 16
  files_modified: 2
  tests_added: 17
  tests_total: 49
  commits: 3
  completed: 2026-05-20T17:26:17Z
---

# Phase P1b Plan 07: Worker Stripe Reducers Summary

**One-liner:** Six idempotent Stripe webhook reducers + pgcrypto-backed secret rotation. Each reducer refetches from Stripe (no payload trust) and runs inside a single Drizzle transaction with the `webhook_events.processed_at` UPDATE — replay-safe by construction.

## What Shipped

### Task 1 — Secrets module (commit `054ac66e`)

- **`apps/worker/src/lib/secrets.ts`**: `writeSecret` / `readSecret` / `getStripeSecretKey`. Writes use `pgp_sym_encrypt(value, ${PGCRYPTO_MASTER_KEY})` + `INSERT … ON CONFLICT (name) DO UPDATE` (idempotent). Reads use `pgp_sym_decrypt` and bump `last_used_at = NOW()` for audit visibility. `getStripeSecretKey(db)` resolves DB → env → throw — Plan 08 just calls `writeSecret('stripe_restricted_key', plaintext, db)` and the next worker job picks it up with no restart.
- **`apps/worker/src/lib/stripe.ts`**: `getStripe(db)` returns a Stripe SDK instance pinned to `'2026-04-22.dahlia'` (PITFALL #3). Cast via `as Stripe.LatestApiVersion` — SDK 19.3.1 types lag the pinned API version; mirrors the same pattern in `apps/edge-webhooks/src/lib/stripe.ts`.
- **`apps/worker/src/lib/db.ts`**: schema mirror extended with `stripe_customers`, `stripe_subscriptions`, `payments`, `passes`, `pass_debits`, `secrets`. Same local-mirror rationale documented in P1b-04 / P1b-05 — Plan 09 extracts `packages/db/`.
- 6 unit tests (`writeSecret`, `readSecret` with row, `readSecret` with no row, decrypt + last_used_at, prefer-DB, env-fallback).

### Task 2a — Reducers chunk A + queue handler (commit `15fe2291`)

- **`checkout-session-completed.ts`** (STR-03): refetch session with `expand: [line_items.data.price.product, customer]` → upsert `stripe_customers` → insert `payments` keyed on `payment_intent` → grant passes with deterministic id `pass_<piId>_<liId>`. `passCreditsForLineItem` is a demo helper mapping description substrings ("10-pack" / "5-pack" / "drop-in") to credit counts; P2 builds a `pass_products` table.
- **`invoice-paid.ts`** (STR-04 success): refetch invoice + subscription → `onConflictDoUpdate` `stripe_subscriptions` (current_period_end refresh) → `onConflictDoNothing` `payments` (paid never reverts to pending).
- **`invoice-payment-failed.ts`** (STR-04 failure): refetch invoice → UPDATE `stripe_subscriptions` to `past_due` → `onConflictDoUpdate` `payments` to `failed` (collapses pending → failed on replay).
- **`dispatch.ts`** (3 entries) + **`index.ts`** barrel.
- **`stripe-event.ts`** queue handler: loads `webhook_events` row by `(provider, external_id)`, no-ops if `processed_at` set (STR-07), marks unhandled event types processed (no infinite retry), runs reducer + `processed_at` UPDATE in `db.transaction()` (WEB-06). Concurrency=3 via pg-boss v12 names `batchSize: 3, localConcurrency: 3`.
- **`apps/worker/src/index.ts`**: `registerStripeEventWorker(boss)` registered alongside inbound + outbound.
- 4 checkout + 2 invoice-paid = 6 new tests.

### Task 2b — Reducers chunk B (commit `ba608a0a`)

- **`subscription-updated.ts`** (STR-05): refetch subscription → `onConflictDoUpdate` `stripe_subscriptions` (status, current_period_end, raw_json).
- **`subscription-deleted.ts`** (STR-05): NO refetch (resource deleted in Stripe; refetch would 404 — lone documented exception). UPDATE keyed by deterministic `stripe_subscription_id` so replays are no-ops.
- **`charge-refunded.ts`** (STR-06): refetch charge → SELECT every pass with `stripe_charge_id = payment_intent` → INSERT NEGATIVE `pass_debits` row per pass (deterministic id `pdebit_refund_<chgId>_<passId>` + ON CONFLICT DO NOTHING) → UPDATE `payments.status = 'refunded'`. Pattern follows D1-02 ledger: `pass_balance = SUM(grants) − SUM(debits)`.
- **`dispatch.ts`** extended to all 6 keys.
- 2 subscription-updated + 3 charge-refunded = 5 new tests.

## Per-Reducer Confirmation Table

| Reducer                          | Stripe refetch                       | Idempotency mechanism                                                        | Deterministic ID                            |
| -------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------- |
| `checkout.session.completed`     | `stripe.checkout.sessions.retrieve`  | `onConflictDoNothing` × 2 (customers, payments) + `ON CONFLICT id DO NOTHING` (passes) | `pay_<piId>`, `pass_<piId>_<liId>`          |
| `invoice.paid`                   | `stripe.invoices.retrieve` + `stripe.subscriptions.retrieve` | `onConflictDoUpdate` (subs) + `onConflictDoNothing` (payments)               | `pay_<piId>`                                |
| `invoice.payment_failed`         | `stripe.invoices.retrieve`           | UPDATE keyed by `stripe_subscription_id` + `onConflictDoUpdate` (payments)   | `pay_<piId>`                                |
| `customer.subscription.updated`  | `stripe.subscriptions.retrieve`      | `onConflictDoUpdate` (subs)                                                  | (PK = `stripe_subscription_id`)             |
| `customer.subscription.deleted`  | **NONE — resource is deleted (refetch 404)** — documented exception | UPDATE keyed by `stripe_subscription_id` (no-op on replay)                   | (PK = `stripe_subscription_id`)             |
| `charge.refunded`                | `stripe.charges.retrieve`            | `ON CONFLICT id DO NOTHING` (pass_debits) + UPDATE keyed by `stripe_payment_intent_id` (payments) | `pdebit_refund_<chgId>_<passId>`            |

## Test Count

| Suite                                          | Before | After |
| ---------------------------------------------- | ------ | ----- |
| Pre-existing (gates + sendMessage + inbound)   | 32     | 32    |
| Secrets (Task 1)                               | 0      | 6     |
| stripeReducers/checkout-session-completed      | 0      | 4     |
| stripeReducers/invoice-paid                    | 0      | 2     |
| stripeReducers/subscription-updated            | 0      | 2     |
| stripeReducers/charge-refunded                 | 0      | 3     |
| **Total worker suite**                         | **32** | **49** |

All 49 tests green. `pnpm --filter @gymos/worker typecheck` exits 0. `pnpm --filter @gymos/worker build` exits 0.

## Decisions Made

1. **pg-boss v12 names — same as P1b-05/06.** Plan literal "teamSize=3, teamConcurrency=3" mapped to `batchSize: 3, localConcurrency: 3` because pg-boss v12 dropped the v11 WorkOptions keys. D-14 concurrency=3 semantic preserved.
2. **`Stripe.Invoice` retrieve result cast to `any`.** SDK 19.3.1 typed `Invoice` no longer exposes top-level `subscription` / `payment_intent` (the LatestApiVersion the SDK ships against — `2025-10-29.clover` — moved them). Our pinned `2026-04-22.dahlia` API still returns them at top level via `expand`. Runtime correct; the cast is the smallest possible defensive move until the SDK ships dahlia types. Documented inline in both `invoice-paid.ts` and `invoice-payment-failed.ts`.
3. **subscription-deleted is the lone refetch exception.** The Stripe resource is gone; refetching would 404. Webhook payload IS source of truth here, and the deterministic-key UPDATE preserves replay safety. Documented inline.
4. **Local schema mirror extended in `apps/worker/src/lib/db.ts`.** Same dialect-typing-as-sqlite friction documented in P1b-04 + P1b-05 + P1b-06. Plan 09 extracts `packages/db/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] pg-boss v12 WorkOptions naming**
- **Found during:** Task 2a (writing `stripe-event.ts`)
- **Issue:** Plan specified `{ teamSize: 3, teamConcurrency: 3 }` but pg-boss v12 (which is what's installed, per P1b-03 SUMMARY) does not accept those keys — they were renamed in the v11 → v12 upgrade.
- **Fix:** Used `{ batchSize: 3, localConcurrency: 3 }` — the v12 equivalents. D-14 concurrency=3 semantic preserved. Same fix P1b-05 + P1b-06 applied for inbound + outbound queues.
- **Files modified:** `apps/worker/src/queues/stripe-event.ts`
- **Commit:** `15fe2291`

**2. [Rule 1 — Bug] Stripe SDK Invoice type mismatch on `2026-04-22.dahlia`**
- **Found during:** Task 2a (typecheck after first GREEN)
- **Issue:** SDK 19.3.1 types `Stripe.Invoice` without top-level `subscription` / `payment_intent` (they moved in the SDK's typed LatestApiVersion `2025-10-29.clover`). Our pinned `2026-04-22.dahlia` API still returns them at top level via `expand`. Typecheck failed on 12 lines across two files.
- **Fix:** Cast the result of `stripe.invoices.retrieve(...)` to `any` at the call site. Smallest possible defensive move; documented inline. Drop the cast when SDK 19.x ships dahlia types.
- **Files modified:** `apps/worker/src/domain/stripeReducers/invoice-paid.ts`, `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts`
- **Commit:** `15fe2291`

**3. [Rule 2 — Auto-add missing critical functionality] Schema mirror extension**
- **Found during:** Task 1 (before any test ran)
- **Issue:** `apps/worker/src/lib/db.ts` only mirrored WhatsApp-side tables (P1b-05/06 scope). Plan 07 needs `stripe_customers`, `stripe_subscriptions`, `payments`, `passes`, `pass_debits`, `secrets` — without them, every reducer would fail to typecheck on `schema.X` lookups.
- **Fix:** Added all 6 table definitions matching the canonical schema in `apps/staff-web/server/db/schema.ts`. Verified column types match (`integer` for amount, `text` for ISO timestamps, enum constraints).
- **Files modified:** `apps/worker/src/lib/db.ts`
- **Commit:** `054ac66e`

### Out-of-scope discoveries

None deferred — every issue raised during execution was directly caused by Plan 07's changes and resolved inline.

## Notes for Plan P1b-08 (staff-web Stripe rotation UI)

- **Rotation entry point:** `writeSecret('stripe_restricted_key', plaintext, db)` from `apps/worker/src/lib/secrets.ts`. Staff-web should import this (or a parallel staff-web-side helper using the same SQL pattern — pgcrypto runs in the DB, not in app code).
- **Master key:** `process.env.PGCRYPTO_MASTER_KEY` — must be present in both worker and staff-web envs. Already declared in `apps/worker/src/lib/env.ts`.
- **No worker restart needed on rotation.** `getStripe(db)` resolves the key on every call. Next stripe-event job picks up the new key.
- **Audit:** `secrets.last_used_at` bumps on every read. Plan 08 settings UI can display "last used" without writing extra audit rows.
- **Auth route:** `/gymos/settings/integrations` (per STATE.md hint — extend `apps/staff-web/server/plugins/auth.ts` publicPaths if the page is gated).

## Notes for Plan P1b-09 (validation cutover replay-twice tests)

For each of the 6 reducers, run `stripe trigger <event>` twice with the receiver pointed at the worker via `apps/edge-webhooks`. Expected DB state after BOTH replays must equal the state after ONE replay.

Fixture event types:

| Reducer                          | `stripe trigger` event             |
| -------------------------------- | ---------------------------------- |
| `checkout.session.completed`     | `checkout.session.completed`       |
| `invoice.paid`                   | `invoice.paid`                     |
| `invoice.payment_failed`         | `invoice.payment_failed`           |
| `customer.subscription.updated`  | `customer.subscription.updated`    |
| `customer.subscription.deleted`  | `customer.subscription.deleted`    |
| `charge.refunded`                | `charge.refunded`                  |

Assertion shape for each:
1. Count rows in target table BEFORE first replay.
2. `stripe trigger <event>` → wait for worker log `[stripe-event] processed`.
3. Count rows AFTER first replay.
4. `stripe trigger <event>` → wait for `[stripe-event] already processed — skip`.
5. Count rows AFTER second replay = count AFTER first replay (success criterion #1).

For `charge.refunded` specifically, also assert `SELECT COUNT(*) FROM pass_debits WHERE pass_id = '<pass>' AND reason = 'stripe_refund'` is `1`, not `2`.

## Self-Check: PASSED

- `apps/worker/src/lib/secrets.ts` — FOUND
- `apps/worker/src/lib/secrets.test.ts` — FOUND
- `apps/worker/src/lib/stripe.ts` — FOUND
- `apps/worker/src/queues/stripe-event.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/checkout-session-completed.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/invoice-paid.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/subscription-updated.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/subscription-deleted.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/charge-refunded.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/dispatch.ts` — FOUND
- `apps/worker/src/domain/stripeReducers/index.ts` — FOUND
- Commit `054ac66e` (Task 1) — FOUND
- Commit `15fe2291` (Task 2a) — FOUND
- Commit `ba608a0a` (Task 2b) — FOUND

49/49 worker test suite green. Typecheck + build clean.
