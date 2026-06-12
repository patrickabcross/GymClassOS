import type Stripe from "stripe";
import { schema } from "../../lib/db.js";

/**
 * STR-04 (success path): invoice.paid.
 *
 * REFETCHES the invoice AND the subscription from Stripe (PITFALL #4 + WEB-06).
 * Upserts the subscriptions mirror with current_period_end from the fresh
 * subscription, and inserts a payments row keyed on the payment_intent.
 *
 * Idempotency:
 *   - stripe_subscriptions: ON CONFLICT (stripe_subscription_id) DO UPDATE
 *     — last write wins, so replays converge.
 *   - payments: ON CONFLICT (stripe_payment_intent_id) DO NOTHING
 *     — a paid invoice never goes back to pending; the first row stands.
 */
export async function invoicePaid(
  event: Stripe.Event,
  tx: any,
  stripe: Stripe,
  stripeAccount?: string,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;

  // REFETCH (PITFALL #4).
  // Pass { stripeAccount } so refetches resolve against the connected account
  // (not the platform) — Pitfall 3. undefined opts = platform event = no-op.
  const opts = stripeAccount ? { stripeAccount } : undefined;
  // Cast to `any` for the legacy top-level `subscription` / `payment_intent`
  // fields: in the dahlia (2026-04-22) API surface these have moved (the
  // SDK 19.x types reflect the latest shape, but our pinned API version
  // still returns them at runtime via the expand list). Runtime is correct;
  // types lag.
  const full = (await stripe.invoices.retrieve(
    invoice.id!,
    { expand: ["subscription", "customer"] },
    opts,
  )) as any;

  const subId =
    typeof full.subscription === "string"
      ? full.subscription
      : full.subscription?.id;
  const customerId =
    typeof full.customer === "string" ? full.customer : full.customer?.id;

  if (subId && customerId) {
    // Refetch subscription for current_period_end.
    // Pass {} as params (no expand needed) then opts for the stripeAccount header.
    const sub = await stripe.subscriptions.retrieve(subId, {}, opts);
    await tx
      .insert(schema.stripeSubscriptions)
      .values({
        stripeSubscriptionId: subId,
        memberId: (sub.metadata?.memberId as string) ?? "",
        status: sub.status,
        planId: (sub as any).plan?.id ?? null,
        currentPeriodEnd: new Date(
          ((sub as any).current_period_end ?? 0) * 1000,
        ).toISOString(),
        rawJson: JSON.stringify(sub),
      })
      .onConflictDoUpdate({
        target: schema.stripeSubscriptions.stripeSubscriptionId,
        set: {
          status: sub.status,
          currentPeriodEnd: new Date(
            ((sub as any).current_period_end ?? 0) * 1000,
          ).toISOString(),
          rawJson: JSON.stringify(sub),
          updatedAt: new Date().toISOString(),
        },
      });
  }

  const piId =
    typeof full.payment_intent === "string"
      ? full.payment_intent
      : full.payment_intent?.id;
  if (piId) {
    await tx
      .insert(schema.payments)
      .values({
        id: `pay_${piId}`,
        memberId: (full.metadata?.memberId as string) ?? null,
        stripePaymentIntentId: piId,
        amountMinorUnits: full.amount_paid ?? 0,
        currency: full.currency ?? "usd",
        status: "succeeded",
        rawJson: JSON.stringify(full),
        occurredAt: new Date(full.created * 1000).toISOString(),
      })
      .onConflictDoNothing({
        target: schema.payments.stripePaymentIntentId,
      });
  }
}
