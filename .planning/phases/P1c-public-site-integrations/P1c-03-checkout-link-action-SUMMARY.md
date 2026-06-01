---
phase: P1c-public-site-integrations
plan: "03"
subsystem: payments
tags: [stripe, checkout, defineAction, pgcrypto, staff-web]

requires:
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
    provides: "P1b-07 checkout-session-completed reducer that reads metadata.memberId; P1b-08 pgcrypto secrets table for the restricted Stripe key"
  - phase: P1c-public-site-integrations
    provides: "P1c-01 lead migration adding conversations.status='lead'"

provides:
  - "create-checkout-link POST action: generates a Stripe hosted Checkout session with metadata.memberId (EMBED-05)"
  - "apps/staff-web/server/lib/stripe.ts: getStripeClient() helper reading pgcrypto-encrypted restricted key"
  - "AGENTS.md Stripe Product keyword documentation (Pitfall 7 mitigation)"

affects:
  - P1c-04
  - P1c-05
  - P2

tech-stack:
  added: []
  patterns:
    - "Staff-web Stripe client: getStripeClient() reads fresh from secrets table via pgcrypto on every call (mirrors worker pattern); falls back to STRIPE_SECRET_KEY env; throws with /gymos/settings/integrations redirect hint"
    - "defineAction POST with Zod schema.min(1) guards on both memberId and priceId"
    - "metadata.memberId contract: Stripe Checkout session must carry this field or P1b-07 reducer skips pass grant"

key-files:
  created:
    - apps/staff-web/actions/create-checkout-link.ts
    - apps/staff-web/server/lib/stripe.ts
  modified:
    - apps/staff-web/AGENTS.md

key-decisions:
  - "Staff-web Stripe client created fresh (apps/staff-web/server/lib/stripe.ts) rather than cross-importing from services/worker — avoids cross-package dialect friction and keeps apps fully independent"
  - "Stripe API version pinned to '2026-04-22.dahlia' as Stripe.LatestApiVersion (matches worker + integrations page; PITFALL #3 mitigation)"
  - "create-checkout-link NOT added to agent system prompt — pilot read-only posture; staff calls it from UI only"
  - "productName passed through as return value only — actual pass-credit mapping is driven by Stripe Product description keyword in the reducer, not by this action"

patterns-established:
  - "Staff-web secrets read: (db as any).execute(sql`UPDATE secrets SET last_used_at=NOW() WHERE name=? RETURNING pgp_sym_decrypt(ciphertext::bytea, ?) AS plaintext`) — mirrors worker readSecret() without cross-package import"
  - "Action return shape for payment links: { url, sessionId, productName } — url is the Checkout URL to send via WhatsApp"

requirements-completed:
  - EMBED-05

duration: 8min
completed: "2026-06-01"
---

# Phase P1c Plan 03: Checkout Link Action Summary

**Stripe hosted Checkout POST action with metadata.memberId contract, pgcrypto-backed staff-web Stripe client, and Pitfall 7 keyword documentation in AGENTS.md**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-01T12:24:00Z
- **Completed:** 2026-06-01T12:32:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `create-checkout-link` POST action (EMBED-05): takes memberId + priceId, creates a Stripe hosted Checkout session with `metadata: { memberId }`, returns `{ url, sessionId, productName }`
- Created `apps/staff-web/server/lib/stripe.ts`: `getStripeClient()` reads the pgcrypto-encrypted restricted key from the secrets table (DB-first, env fallback, clear error pointing to /gymos/settings/integrations)
- Documented the action in AGENTS.md with a table row and a full "Stripe Product setup" note detailing the 10-pack/5-pack/drop-in/1-class keyword requirement so the P1b-07 reducer grants pass credits on `checkout.session.completed` (Pitfall 7 mitigation)

## Task Commits

1. **Task 1: Create the create-checkout-link action** - `42258426` (feat)
2. **Task 2: Document the action + Stripe Product keyword requirement in AGENTS.md** - `d9f3c0e0` (docs)

## Files Created/Modified

- `apps/staff-web/actions/create-checkout-link.ts` — POST action: Zod schema (memberId.min(1), priceId.min(1), productName.default("pass")), calls getStripeClient(), creates hosted Checkout session with metadata.memberId, returns { url, sessionId, productName }
- `apps/staff-web/server/lib/stripe.ts` — getStripeClient() helper: reads pgcrypto-decrypted restricted key from secrets table (PGCRYPTO_MASTER_KEY env → UPDATE + RETURNING pgp_sym_decrypt), falls back to STRIPE_SECRET_KEY env, throws with /gymos/settings/integrations redirect hint; pins apiVersion '2026-04-22.dahlia'
- `apps/staff-web/AGENTS.md` — Added create-checkout-link row to Agent Actions table; added "Stripe Product setup" subsection with keyword table + explicit Pitfall 7 warning + pilot-agent posture note

## Decisions Made

- **Staff-web Stripe client is a new file, not imported from services/worker.** The worker's `getStripeSecretKey` is the reference implementation, but cross-package import would introduce dialect-typing friction and break the apps-as-independent-deployables model. The staff-web copy uses the same pgcrypto `UPDATE … RETURNING pgp_sym_decrypt` pattern.
- **Stripe API version pinned to `'2026-04-22.dahlia' as Stripe.LatestApiVersion`.** SDK 19.3.1 types `LatestApiVersion` as `'2025-10-29.clover'`; the cast keeps the runtime pin intact. Drop when SDK ships the dahlia literal. This matches the pin in `services/worker/src/lib/stripe.ts` and `gymos.settings.integrations.tsx`.
- **`create-checkout-link` not added to the agent system prompt.** Per the pilot read-only agent posture, coaches invoke it from the UI. The AGENTS.md note explicitly documents this and says when to change it.

## Stripe Client Helper — Was It Existing or Created?

A staff-web Stripe client helper did **not** exist before this plan. `apps/staff-web/server/lib/stripe.ts` was created fresh. The existing reference in `gymos.settings.integrations.tsx` uses `new Stripe(key, ...)` directly inline (probe only, not a reusable helper). The new `getStripeClient()` is the canonical staff-web Stripe instantiation point.

## Stripe apiVersion Pin

`"2026-04-22.dahlia" as Stripe.LatestApiVersion` — matches `services/worker/src/lib/stripe.ts` and `apps/staff-web/app/routes/gymos.settings.integrations.tsx`.

## metadata.memberId Binding Contract

The Checkout session is created with:
```typescript
metadata: { memberId }
```
The P1b-07 reducer reads `fullSession.metadata?.memberId` (line ~39 of `checkout-session-completed.ts`). If this field is null, the payment row is inserted but no pass is granted and no member link is created. This is the core contract that `create-checkout-link` satisfies.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. The action calls real Stripe APIs; pass grants happen in the worker reducer when the webhook fires. No data flows to UI rendering from this action without a real Stripe key and Price ID being present.

## Next Phase Readiness

- EMBED-05 is complete; the checkout link can now be generated from the UI or wired into the lead-funnel flow
- P1c-04 (embed/schedule widget or forms wiring) can proceed — this action is independently usable
- Studio onboarding step: create Stripe Products whose descriptions include `10-pack`, `5-pack`, `drop-in`, or `1-class` before using this action in production

---
*Phase: P1c-public-site-integrations*
*Completed: 2026-06-01*
