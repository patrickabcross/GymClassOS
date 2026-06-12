---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: "02"
subsystem: payments
tags: [stripe, stripe-connect, webhooks, hono, tdd, edge-webhooks]

requires:
  - phase: P1c.1-stripe-connect-custom-customer-purchase-flows
    provides: "Plan 01 — enqueueStripeEvent with optional stripeAccount field; connected_accounts table"

provides:
  - "POST /webhooks/stripe-connect endpoint — raw-body HMAC with STRIPE_CONNECT_WEBHOOK_SECRET, idempotent insert via shared webhook_events spine, enqueues with stripeAccount threaded from event.account"
  - "STRIPE_CONNECT_WEBHOOK_SECRET env var required in EnvSchema (fail-fast validation)"

affects:
  - P1c.1-06
  - services/edge-webhooks

tech-stack:
  added: []
  patterns:
    - "Connect handler mirrors platform handler exactly — two-difference pattern (different secret + thread event.account)"
    - "Shared idempotency spine: provider='stripe' for both platform + Connect events (Stripe event IDs are globally unique)"
    - "TDD RED-GREEN cycle for webhook handler"

key-files:
  created: []
  modified:
    - services/edge-webhooks/src/lib/env.ts
    - services/edge-webhooks/src/routes/stripe.ts
    - services/edge-webhooks/src/routes/stripe.test.ts

key-decisions:
  - "Reuse stripeRoutes Hono instance for Connect handler (no new instance, no server.ts change needed)"
  - "provider='stripe' for Connect events — Stripe event IDs are globally unique so no external_id collision with platform events"
  - "STRIPE_CONNECT_WEBHOOK_SECRET made required in EnvSchema — service refuses to boot without it; Plan 06 sets the Fly secret"

patterns-established:
  - "Two-difference mirror pattern: Connect handler = platform handler + different whsec_ + thread event.account"

requirements-completed: [STR-01]

duration: 4min
completed: 2026-06-12
---

# Phase P1c.1 Plan 02: Stripe Connect Webhook Endpoint Summary

**POST /webhooks/stripe-connect verifies with a separate STRIPE_CONNECT_WEBHOOK_SECRET, dedups through the shared webhook_events spine, and enqueues with event.account as stripeAccount — implemented via TDD with 4 passing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-12T15:32:23Z
- **Completed:** 2026-06-12T15:36:19Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `STRIPE_CONNECT_WEBHOOK_SECRET: z.string().regex(/^whsec_/)` to EnvSchema immediately after `STRIPE_WEBHOOK_SECRET` — fail-fast validation so the service refuses to boot without the secret
- Added `POST /stripe-connect` handler on the existing `stripeRoutes` Hono instance (no `server.ts` change needed); mirrors the platform handler with exactly two differences: separate `STRIPE_CONNECT_WEBHOOK_SECRET` + `event.account` threaded to `enqueueStripeEvent` as `stripeAccount`
- 4 Connect-endpoint tests added via TDD RED-GREEN cycle; all 31 tests pass (platform + Connect + env + whatsapp)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add STRIPE_CONNECT_WEBHOOK_SECRET to env validation** - `245ac035` (feat)
2. **Task 2 RED: Add failing tests for /webhooks/stripe-connect handler** - `b292a6f7` (test)
3. **Task 2 GREEN: Add /webhooks/stripe-connect handler** - `d21a6bc8` (feat)

## Files Created/Modified

- `services/edge-webhooks/src/lib/env.ts` - Added `STRIPE_CONNECT_WEBHOOK_SECRET` to EnvSchema
- `services/edge-webhooks/src/routes/stripe.ts` - Added `POST /stripe-connect` handler (44 lines) on `stripeRoutes`
- `services/edge-webhooks/src/routes/stripe.test.ts` - Added 4 Connect-endpoint tests + updated env mock with `STRIPE_CONNECT_WEBHOOK_SECRET`

## Decisions Made

- **Reuse `stripeRoutes` Hono instance:** Adding the handler directly to the existing `stripeRoutes` avoids a separate `stripeConnectRoutes` export and a `server.ts` mount change. The route is already reachable via `app.route("/webhooks", stripeRoutes)`.
- **`provider: "stripe"` for Connect events:** Stripe event IDs (`evt_...`) are globally unique across platform + Connect — there is no external_id collision risk. The shared `(provider, external_id)` UNIQUE constraint correctly dedups both event streams.
- **STRIPE_CONNECT_WEBHOOK_SECRET as required (not optional):** Fail-fast is better than a silent runtime miss. Test mocks supply a `whsec_connect_xxx` value so tests are unaffected by the required field.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required by this plan. Plan 06 handles the Fly `fly secrets set STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...` step when the Stripe Connect webhook is registered in the Dashboard.

## Next Phase Readiness

- Connect webhook endpoint is live in code; route verifies, dedups, and enqueues with `stripeAccount`
- Platform `/webhooks/stripe` endpoint untouched and still passing
- Plan 06 (Fly deploy + Stripe Dashboard webhook registration + env secret) can proceed

---
*Phase: P1c.1-stripe-connect-custom-customer-purchase-flows*
*Completed: 2026-06-12*
