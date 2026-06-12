import { Hono } from "hono";
import type Stripe from "stripe";
import { enqueueStripeEvent } from "@gymos/queue";
import { getEnv } from "../lib/env.js";
import { getStripe } from "../lib/stripe.js";
import { insertWebhookEvent } from "../lib/idempotency.js";

export const stripeRoutes = new Hono();

stripeRoutes.post("/stripe", async (c) => {
  const env = getEnv();
  const sigHeader = c.req.header("stripe-signature");
  if (!sigHeader) return c.text("Missing stripe-signature", 400);

  // 1. RAW BODY FIRST (PITFALL #9) — MUST come BEFORE constructEvent below.
  //    Line-order enforced by plan acceptance grep: A < B.
  const raw = await c.req.text();

  // 2. constructEvent verifies HMAC + parses atomically. Throws on tamper.
  //    Per success criterion #5: tampered body returns 400 BEFORE any
  //    business work (no DB insert, no enqueue).
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      sigHeader,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return c.text("invalid signature", 400);
  }

  // 3. Idempotency — ON CONFLICT (provider, external_id) DO NOTHING.
  const result = await insertWebhookEvent({
    provider: "stripe",
    eventType: event.type,
    externalId: event.id,
    payloadRaw: raw,
  });

  if (!result.inserted) {
    // Stripe retry — already in the pipeline. Acknowledge to stop retries.
    return c.text("ok (dedup)", 200);
  }

  // 4. Enqueue for worker.
  await enqueueStripeEvent({ eventId: event.id });

  return c.text("ok", 200); // budget <100ms
});

// Stripe Connect webhook — separate signing secret, carries event.account = "acct_xxx".
// Mirrors the platform handler exactly except:
//   1. Verified with STRIPE_CONNECT_WEBHOOK_SECRET (not the platform secret).
//   2. event.account is threaded into the enqueue payload as stripeAccount.
// Idempotency: Stripe event ids (evt_...) are globally unique across platform +
// Connect — reuse provider: "stripe" verbatim; no collision risk on external_id.
stripeRoutes.post("/stripe-connect", async (c) => {
  const env = getEnv();
  const sigHeader = c.req.header("stripe-signature");
  if (!sigHeader) return c.text("Missing stripe-signature", 400);

  // RAW BODY FIRST (PITFALL #9).
  const raw = await c.req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      sigHeader,
      env.STRIPE_CONNECT_WEBHOOK_SECRET,
    );
  } catch {
    return c.text("invalid signature", 400);
  }

  // "acct_xxx" present on all Connect events; undefined on platform events.
  const connectedAccountId = event.account ?? undefined;

  const result = await insertWebhookEvent({
    provider: "stripe",
    eventType: event.type,
    externalId: event.id,
    payloadRaw: raw,
  });

  if (!result.inserted) {
    return c.text("ok (dedup)", 200);
  }

  await enqueueStripeEvent({ eventId: event.id, stripeAccount: connectedAccountId });

  return c.text("ok", 200);
});
