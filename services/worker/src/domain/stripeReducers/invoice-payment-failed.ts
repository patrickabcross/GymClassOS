import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { schema } from "../../lib/db.js";

/**
 * STR-04 (failure path): invoice.payment_failed.
 *
 * REFETCHES the invoice from Stripe (PITFALL #4) so we see the current
 * failure reason and amount. Marks the subscription past_due and inserts
 * (or upgrades) a payments row with status='failed' for the payment_intent.
 *
 * Idempotency:
 *   - stripe_subscriptions: UPDATE keyed on stripe_subscription_id — replay
 *     just re-sets the same status. No INSERT/upsert is needed because
 *     the row was already created by an earlier invoice.paid or
 *     customer.subscription.created event (Stripe ordering rules — a
 *     payment can't fail for a sub Stripe didn't create first).
 *   - payments: ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET status='failed'
 *     — a payment may have been recorded as pending earlier; collapse it
 *     to 'failed' on replay.
 */
export async function invoicePaymentFailed(
  event: Stripe.Event,
  tx: any,
  stripe: Stripe,
  stripeAccount?: string,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  // Pass { stripeAccount } so the refetch resolves against the connected account
  // (not the platform) — Pitfall 3. undefined opts = platform event = no-op.
  const opts = stripeAccount ? { stripeAccount } : undefined;
  // See invoice-paid.ts — cast to `any` for legacy top-level fields
  // (`subscription` / `payment_intent`) on the dahlia API surface.
  const full = (await stripe.invoices.retrieve(
    invoice.id!,
    { expand: ["subscription"] },
    opts,
  )) as any;

  const subId =
    typeof full.subscription === "string"
      ? full.subscription
      : full.subscription?.id;

  if (subId) {
    await tx
      .update(schema.stripeSubscriptions)
      .set({
        status: "past_due",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.stripeSubscriptions.stripeSubscriptionId, subId));
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
        amountMinorUnits: full.amount_due ?? 0,
        currency: full.currency ?? "usd",
        status: "failed",
        rawJson: JSON.stringify(full),
        occurredAt: new Date(full.created * 1000).toISOString(),
      })
      .onConflictDoUpdate({
        target: schema.payments.stripePaymentIntentId,
        set: { status: "failed" },
      });
  }
}
