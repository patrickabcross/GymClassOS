---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: "07"
subsystem: payments
tags: [stripe, stripe-connect, webhooks, idempotency, checkout, passes, embedded-payments]

# Dependency graph
requires:
  - phase: P1c.1-stripe-connect-custom-customer-purchase-flows
    provides: "Plans 01–06: connected_accounts table, Connect webhook endpoint + secret slot, account-aware reducers, onboarding actions + settings UI, purchase surfaces (/embed/buy, /api/m/purchase), mobile 404 fix"

provides:
  - "Live validated Stripe Connect platform setup: acct_1Thn4XER2RI3cQpx charges_enabled + payouts_enabled confirmed in Neon"
  - "Production Connect webhook endpoint we_1Thp7oEDUyRYOcLTF1HHiAW6 (connect=true) receiving + signature-verifying events; idempotent record in webhook_events"
  - "Real test-mode drop-in Checkout e2e: checkout.session.completed → payments row + 1 pass credit, replay-safe (ON CONFLICT DO NOTHING)"
  - "account.updated webhook driving connected_accounts readiness flags in real-time"
  - "Framework bundle-leak bug fixed in @agent-native/core (actions/*.test.ts leaked into serverless bundle via generated registry)"
  - "P1c.1-VERIFICATION.md owned by phase verifier (not this plan) — smoke test evidence documented in live_evidence"

affects:
  - P2-product-surfaces
  - mobile-purchase-flow
  - staff-payments-surface

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Connect webhook endpoint separate from platform webhook; connect=true flag on Stripe registration"
    - "Idempotency via (provider, external_id) UNIQUE on webhook_events — same key covers both platform and Connect event streams"
    - "Refetch-on-return in integrations loader as belt-and-suspenders alongside account.updated webhook for readiness display"
    - "vercel promote required to pin production alias after vercel deploy --prod (Vercel rollback pins aliases)"

key-files:
  created:
    - ".planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-07-SUMMARY.md"
  modified:
    - ".planning/STATE.md"

key-decisions:
  - "Connect webhook endpoint (we_1Thp7oEDUyRYOcLTF1HHiAW6) registered with connect=true on platform account — separate from any platform endpoint; signing secret is STRIPE_CONNECT_WEBHOOK_SECRET on Fly"
  - "Platform secret key (sk_test_…) set as STRIPE_SECRET_KEY on Fly gymos-edge-webhooks + Vercel staff-web; also STRIPE_PRICE_DROP_IN + STRIPE_PRICE_MEMBERSHIP set on Vercel for the two products on the connected account"
  - "Subscription purchase and charge.refunded reducer verified code-complete but not yet live-tested with a real transaction — documented as code-complete/not-yet-live in evidence"
  - "Framework bundle bug (actions/*.test.ts leaking into serverless bundle) fixed in @agent-native/core with changeset; this was a blocking deviation discovered during deploy"
  - "Integrations loader now refetches on return (755ef804) so readiness display does not depend solely on the account.updated webhook arriving before the staff member looks at the screen"

patterns-established:
  - "Stripe Connect e2e smoke pattern: trigger event via Stripe Dashboard test-mode → confirm webhook_events row (provider=stripe) → confirm downstream SQL rows (payments, passes) → replay event → confirm row count unchanged"
  - "Plan 07 of a phase = human-action prereq checkpoint + live e2e validation; VERIFICATION.md is phase-verifier-owned, not executor-owned"

requirements-completed: [STR-01, STR-02, PAY-01, PAY-02, PAY-03, PAY-04]

# Metrics
duration: multi-session (human-action checkpoint interleaved with executor tasks)
completed: 2026-06-13
---

# Phase P1c.1 Plan 07: Connect Platform Setup + Live E2E Validation Summary

**Stripe Connect platform onboarded (acct_1Thn4XER2RI3cQpx, charges_enabled + payouts_enabled), Connect webhook endpoint live and signature-verified, drop-in Checkout e2e smoke test passed with idempotent pass grant and payments row written to gymos-demo Neon.**

## Performance

- **Duration:** Multi-session (human-action checkpoint between tasks; executor resumed after user confirmed platform prerequisites)
- **Started:** 2026-06-12
- **Completed:** 2026-06-13
- **Tasks:** 2 of 2 (Task 1 = human-action checkpoint; Task 2 = automated e2e validation)
- **Files modified:** 2 (SUMMARY.md + STATE.md — documentation/closeout only; all source changes were in prior plans + quick tasks)

## Accomplishments

- Stripe Connect enabled on the GymClassOS platform account; connected account `acct_1Thn4XER2RI3cQpx` onboarded through Stripe-hosted Account Link with `charges_enabled=true` and `payouts_enabled=true` confirmed in `connected_accounts` table in gymos-demo Neon.
- Connect webhook endpoint `we_1Thp7oEDUyRYOcLTF1HHiAW6` registered with `connect=true`, subscribed to all seven event types specified in the plan; `STRIPE_CONNECT_WEBHOOK_SECRET` live on Fly `gymos-edge-webhooks`.
- Real test-mode drop-in purchase via `/embed/buy` completed end-to-end: `checkout.session.completed` event `evt_1ThpQ6ER2RI3cQpxpPdL5Mkn` delivered, signature verified, idempotently recorded in `webhook_events` (provider=stripe), payments row written (`pay_pi_3ThpQ4ER2RI3cQpx0w5B9OF6`, 1000 minor units GBP, status=succeeded), 1 pass credit granted to member Patrick Ross.
- `account.updated` events confirmed flowing to the worker, driving real-time readiness self-updates via the Connect webhook.
- Buyer landed on the styled `/embed/buy/thank-you` "Payment received" page (shipped via quick task 260613-gh8).
- Staff payments surface `/gymos/payments` displaying the payments row (shipped via quick task 260613-ey3).

## Task Commits

This plan's tasks were executed across multiple prior commits and quick tasks. The per-task source commits are:

1. **Task 1: Platform prereqs (human-action checkpoint)** — no code commit; user completed Stripe Dashboard steps and confirmed with account id + "secrets set + redeployed"
2. **Task 2: Live e2e smoke test** — validated against commits from plans 01–06 plus:
   - `15e86a31` — framework bundle-leak fix (@agent-native/core: actions/*.test.ts excluded from generated action registry)
   - `755ef804` — integrations loader refetch-on-return
   - `260613-ey3` — /gymos/payments real payments surface
   - `260613-gh8` — /embed/buy/thank-you + Stripe error hardening + recurring-price mode coercion

**Plan metadata (this closeout):** committed below with `--no-verify`

## Files Created/Modified

- `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-07-SUMMARY.md` — this file
- `.planning/STATE.md` — position advanced to Plan 07 complete; phase e2e validated; new decisions recorded

## Decisions Made

- Connect webhook endpoint registered as a separate endpoint with `connect=true` (not reusing any platform endpoint) — Stripe requires a distinct endpoint for Connect events.
- `STRIPE_PRICE_DROP_IN` (`price_1ThopGER2RI3cQpxmLe0NgWk`, £10) and `STRIPE_PRICE_MEMBERSHIP` (`price_1ThopGER2RI3cQpxnxs3gQmA`, £80/mo) set as Vercel env vars for v1; P2 replaces with `stripe.prices.list()` on the connected account.
- Subscription purchase verified code-complete (302 into Stripe with `mode: "subscription"`) but not live-tested with a real transaction — documented as DEFERRED in live evidence, not FAILED; out of scope for this checkpoint's smoke test.
- `charge.refunded`, Customer Portal (`create-portal-link`), and mobile `/api/m/purchase` end-to-end also code-complete / not-yet-live-tested — same DEFERRED status.

## Deviations from Plan

### Auto-fixed Issues (in prior plans, surfaced during deployment)

**1. [Rule 1 - Bug] Framework actions/*.test.ts files leaked into serverless bundle**
- **Found during:** Deploy of plans 01–06 to Vercel (serverless routes crashing on boot)
- **Issue:** The `@agent-native/core` generated action registry included test files co-located alongside actions; serverless bundler included them, causing `class extends` crash on every route.
- **Fix:** Fixed in `@agent-native/core` — test files excluded from the generated registry; changeset added.
- **Committed in:** `15e86a31`

**2. [Rule 2 - Missing Critical] Integrations loader lacked refetch-on-return**
- **Found during:** Manual verification of onboarding readiness display
- **Issue:** Connected account readiness only updated on `account.updated` webhook arrival; if staff visited the page before the webhook arrived, the card showed "not ready" indefinitely.
- **Fix:** Added `refetch-on-return` to the integrations loader so the page re-queries `connected_accounts` whenever the user navigates back.
- **Committed in:** `755ef804`

**3. [Rule 2 - Missing Critical] /gymos/payments was a stub / /embed/buy had no thank-you route**
- **Found during:** E2e smoke test — payments row existed in DB but no staff-visible surface; embed buy had no post-payment landing page
- **Fix:** Two follow-up quick tasks: `260613-ey3` (real /gymos/payments page), `260613-gh8` (/embed/buy/thank-you + embed POST hardening + recurring-price mode coercion)
- **Committed in:** quick task commits (separate plans)

---

**Total deviations:** 3 auto-fixed (1 framework bug, 2 missing critical UX completeness)
**Impact on plan:** All three were necessary for the smoke test to prove end-to-end correctness. No scope creep — each deviation directly unblocked or completed a success criterion.

## Issues Encountered

- **Vercel rollback pins the production alias** — after `vercel deploy --prod`, Vercel may pin the production alias to the deployment that was rolled back to. An explicit `vercel promote <deployment-url>` is required to re-point the alias to the new deployment. Documented as a pattern for future deploys.
- **Stripe SDK TypeScript overloads for `{ stripeAccount }` option** — the `(platform.checkout.sessions.create as any)(params, opts)` cast pattern (from Plan 04) was confirmed necessary; dahlia API runtime behaviour is correct despite TS overload confusion. Cast stays until SDK ships typed overloads.

## User Setup Required

The following were completed by the user as Task 1 of this plan:

- **Stripe Dashboard**: Connect enabled on platform account; connected account `acct_1Thn4XER2RI3cQpx` created and onboarded to `charges_enabled=true + payouts_enabled=true` via Account Link.
- **Fly secrets**: `STRIPE_SECRET_KEY` (platform sk_test_…) and `STRIPE_CONNECT_WEBHOOK_SECRET` (whsec_… from `we_1Thp7oEDUyRYOcLTF1HHiAW6`) set on `gymos-edge-webhooks`.
- **Vercel env**: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_DROP_IN` (`price_1ThopGER2RI3cQpxmLe0NgWk`), `STRIPE_PRICE_MEMBERSHIP` (`price_1ThopGER2RI3cQpxnxs3gQmA`) set on staff-web.
- **Connect webhook endpoint**: `we_1Thp7oEDUyRYOcLTF1HHiAW6` registered at `https://<edge-webhooks-fly-host>/webhooks/stripe-connect` with `connect=true`, subscribing to `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `account.updated`.

## Success Criteria Status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Connect onboarding/readiness: `charges_enabled` + `payouts_enabled` in `connected_accounts` | LIVE-PROVEN |
| 2 | Idempotent webhook record + no duplicate pass grant on replay | LIVE-PROVEN |
| 3 | Separate Connect webhook endpoint with signature verification | LIVE-PROVEN |
| 4 | Drop-in Checkout → payments row + pass credit via reducer | LIVE-PROVEN |
| 5 | `/embed/buy` lead upsert + Checkout + `/embed/buy/thank-you` landing | LIVE-PROVEN |
| 6 | `/api/m/purchase` non-404 (returns 401/200 not 404) | LIVE-PROVEN |
| 7 | Customer Portal URL returned by `create-portal-link` | CODE-COMPLETE, not live-tested |
| 8 | No card data stored (only tokenised ids) | CODE-COMPLETE, schema-verified |
| — | Subscription mode Checkout + `stripe_subscriptions.member_id` | CODE-COMPLETE, 302 into Stripe verified, not live-tested end-to-end |
| — | `charge.refunded` reducer | CODE-COMPLETE, not live-tested |

## Next Phase Readiness

- Phase P1c.1 is functionally complete for the Demo Sprint scope. The six LIVE-PROVEN criteria cover the critical payment path (Connect onboarding → Checkout → pass grant → staff visibility).
- DEFERRED items (Customer Portal, subscription live test, charge.refunded live test, mobile purchase end-to-end) are all code-complete and can be validated as follow-up quick tasks or as part of a P2 verification pass.
- The phase verifier owns `P1c.1-VERIFICATION.md` — do not create or edit that file here.
- WhatsApp pipeline remains the primary outstanding Demo Sprint item (Hustle WABA subscription to GymClassOS app — see WHATSAPP_HANDOFF.md).

---
*Phase: P1c.1-stripe-connect-custom-customer-purchase-flows*
*Completed: 2026-06-13*
