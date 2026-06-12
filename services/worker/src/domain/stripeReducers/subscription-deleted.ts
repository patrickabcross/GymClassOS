import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { schema } from "../../lib/db.js";

/**
 * STR-05 (deletion path): customer.subscription.deleted.
 *
 * EXCEPTION TO THE REFETCH RULE: the subscription resource is deleted in
 * Stripe; refetch would 404, so we cannot call stripe.subscriptions.retrieve
 * here (resource is deleted). The webhook payload carries the final state
 * of the subscription, so we use it directly to UPDATE the mirror row to
 * status='canceled'.
 *
 * Idempotency: the UPDATE is keyed by the deterministic stripe_subscription_id,
 * so replaying the same event is a no-op — it sets the same fields to the
 * same values on the same row.
 */
export async function subscriptionDeleted(
  event: Stripe.Event,
  tx: any,
  _stripe: Stripe,
  _stripeAccount?: string,
): Promise<void> {
  // EXCEPTION TO REFETCH RULE: the subscription is deleted in Stripe —
  // stripe.subscriptions.retrieve would 404. Use the event payload directly.
  // stripeAccount param accepted for dispatch-table uniformity but unused here.
  const sub = event.data.object as Stripe.Subscription;
  await tx
    .update(schema.stripeSubscriptions)
    .set({
      status: "canceled",
      rawJson: JSON.stringify(sub),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.stripeSubscriptions.stripeSubscriptionId, sub.id));
}
