---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - services/edge-webhooks/src/lib/env.ts
  - services/edge-webhooks/src/lib/stripe.ts
  - services/edge-webhooks/src/routes/stripe.ts
  - services/edge-webhooks/src/routes/stripe.test.ts
  - services/edge-webhooks/src/server.ts
autonomous: true
requirements: [STR-01]
must_haves:
  truths:
    - "POST /webhooks/stripe-connect verifies events with the Connect signing secret and rejects tampered bodies with 400 before any DB work"
    - "Connect events are deduped via the same webhook_events (provider, external_id) spine and enqueued with event.account as stripeAccount"
    - "The existing /webhooks/stripe platform endpoint is unchanged"
  artifacts:
    - path: "services/edge-webhooks/src/routes/stripe.ts"
      provides: "New stripeConnectRoutes handler reading event.account + separate secret"
      contains: "stripe-connect"
    - path: "services/edge-webhooks/src/lib/env.ts"
      provides: "STRIPE_CONNECT_WEBHOOK_SECRET env var"
      contains: "STRIPE_CONNECT_WEBHOOK_SECRET"
  key_links:
    - from: "services/edge-webhooks/src/routes/stripe.ts"
      to: "enqueueStripeEvent"
      via: "passes stripeAccount: event.account"
      pattern: "stripeAccount"
    - from: "services/edge-webhooks/src/server.ts"
      to: "stripeConnectRoutes"
      via: "app.route mount"
      pattern: "stripe-connect|stripeConnect"
---

<objective>
Add the separate Stripe **Connect** webhook endpoint. Connect events arrive on their own endpoint with their own signing secret and carry a top-level `event.account = "acct_xxx"`. Mirror the existing platform `/webhooks/stripe` handler exactly (raw-body-first HMAC, idempotent insert, enqueue) but verify with `STRIPE_CONNECT_WEBHOOK_SECRET` and thread `event.account` into the queue payload's `stripeAccount` field (added in Plan 01).

Purpose: Success criterion #3 — Connect webhooks verified + routed through the same idempotency spine. Without this, none of the connected-account events (`account.updated`, `checkout.session.completed`, `invoice.paid`, ...) reach the worker.
Output: `POST /webhooks/stripe-connect` live in edge-webhooks; new env var; tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-RESEARCH.md

<interfaces>
<!-- Existing platform handler to mirror (services/edge-webhooks/src/routes/stripe.ts) -->
```typescript
stripeRoutes.post("/stripe", async (c) => {
  const sigHeader = c.req.header("stripe-signature");
  if (!sigHeader) return c.text("Missing stripe-signature", 400);
  const raw = await c.req.text();                 // RAW BODY FIRST (PITFALL #9)
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch { return c.text("invalid signature", 400); }
  const result = await insertWebhookEvent({ provider: "stripe", eventType: event.type, externalId: event.id, payloadRaw: raw });
  if (!result.inserted) return c.text("ok (dedup)", 200);
  await enqueueStripeEvent({ eventId: event.id });
  return c.text("ok", 200);
});
```
<!-- env.ts already validates STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/) -->
<!-- enqueueStripeEvent now accepts { eventId, stripeAccount? } (Plan 01) -->
<!-- server.ts mounts: app.route("/webhooks", whatsappRoutes); app.route("/webhooks", stripeRoutes); -->
</interfaces>

**Idempotency note:** the `webhook_events (provider, external_id)` UNIQUE is shared across platform + Connect events. Stripe event ids (`evt_...`) are globally unique, so platform and Connect events never collide on `external_id` — reuse `provider: "stripe"` verbatim.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add STRIPE_CONNECT_WEBHOOK_SECRET to env validation</name>
  <files>services/edge-webhooks/src/lib/env.ts</files>
  <action>
Add `STRIPE_CONNECT_WEBHOOK_SECRET: z.string().regex(/^whsec_/)` to `EnvSchema` immediately after `STRIPE_WEBHOOK_SECRET`. This is a DIFFERENT `whsec_` than the platform secret (RESEARCH §Connect webhooks). It will be set as a Fly secret in Plan 06 — fail-fast validation here ensures the service refuses to boot without it once the Connect endpoint ships.

NOTE: This makes the env var REQUIRED. To avoid blocking local test runs / the current deploy before Plan 06 sets the secret, the test setup must provide it (see `_resetEnvForTests` usage in stripe.test.ts — supply a `whsec_test_...` value in the test's process.env mock).
  </action>
  <verify>
    <automated>pnpm --filter edge-webhooks test -- env</automated>
  </verify>
  <done>EnvSchema rejects a missing/malformed STRIPE_CONNECT_WEBHOOK_SECRET; valid whsec_ value passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add the /webhooks/stripe-connect handler + mount it</name>
  <files>services/edge-webhooks/src/routes/stripe.ts, services/edge-webhooks/src/routes/stripe.test.ts, services/edge-webhooks/src/server.ts</files>
  <behavior>
    - Test: POST /webhooks/stripe-connect with a tampered body → constructEvent throws → 400 "invalid signature", and insertWebhookEvent is NOT called, enqueueStripeEvent is NOT called (assert mock call counts = 0). Mirrors success criterion #5 for the Connect endpoint.
    - Test: POST /webhooks/stripe-connect with a valid signed event whose `account: "acct_x"` → insertWebhookEvent called with provider "stripe" + the event id; enqueueStripeEvent called with `{ eventId, stripeAccount: "acct_x" }`; returns 200 "ok".
    - Test: a duplicate (insertWebhookEvent returns inserted:false) → returns 200 "ok (dedup)" and enqueueStripeEvent NOT called.
    - Test: missing stripe-signature header → 400 "Missing stripe-signature".
  </behavior>
  <action>
In `stripe.ts`, add a second handler on the SAME `stripeRoutes` Hono instance (or a new `stripeConnectRoutes` instance — either works; keep it in this file). Mirror the platform handler EXACTLY, with two differences:

1. Verify with `env.STRIPE_CONNECT_WEBHOOK_SECRET` (not the platform secret).
2. Read `const connectedAccountId = event.account;` after constructEvent, and enqueue `{ eventId: event.id, stripeAccount: connectedAccountId ?? undefined }`.

```typescript
stripeRoutes.post("/stripe-connect", async (c) => {
  const env = getEnv();
  const sigHeader = c.req.header("stripe-signature");
  if (!sigHeader) return c.text("Missing stripe-signature", 400);
  const raw = await c.req.text();                 // RAW BODY FIRST (PITFALL #9)
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw, sigHeader, env.STRIPE_CONNECT_WEBHOOK_SECRET,
    );
  } catch { return c.text("invalid signature", 400); }

  const connectedAccountId = event.account ?? undefined; // "acct_xxx" on Connect endpoint

  const result = await insertWebhookEvent({
    provider: "stripe", eventType: event.type, externalId: event.id, payloadRaw: raw,
  });
  if (!result.inserted) return c.text("ok (dedup)", 200);

  await enqueueStripeEvent({ eventId: event.id, stripeAccount: connectedAccountId });
  return c.text("ok", 200);
});
```

If you create a separate `stripeConnectRoutes` instance, export it and mount it in `server.ts` with `app.route("/webhooks", stripeConnectRoutes);` alongside the existing two. If you reuse `stripeRoutes`, no server.ts change is needed — but still confirm the route is reachable. Add the four behavior tests to `stripe.test.ts` (clone the existing platform-handler describe block; the mock for `getStripe().webhooks.constructEvent` already exists — reuse its pattern, returning an event object with an `account` field).
  </action>
  <verify>
    <automated>pnpm --filter edge-webhooks test -- stripe</automated>
  </verify>
  <done>All four Connect-endpoint tests pass; platform /stripe tests still green; route mounted and reachable.</done>
</task>

</tasks>

<verification>
- `pnpm --filter edge-webhooks test` fully green (platform + Connect + env + whatsapp).
- Tampered Connect body → 400 before any insert/enqueue (mock counts asserted = 0).
- Valid Connect event enqueues with stripeAccount threaded from event.account.
- Live registration of the endpoint in the Stripe Dashboard + the env secret are MANUAL steps handled in Plan 06 (not this plan).
</verification>

<success_criteria>
- Connect endpoint exists, verifies with its own secret, dedups via the shared spine, enqueues with stripeAccount (success criterion #3 code path).
- Platform endpoint untouched and still passing.
</success_criteria>

<output>
After completion, create `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-02-SUMMARY.md`
</output>
