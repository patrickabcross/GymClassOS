import type Stripe from "stripe";
import { schema } from "../../lib/db.js";

/**
 * STR-05 (update path): customer.subscription.updated.
 *
 * REFETCHES the subscription from Stripe (PITFALL #4) — webhooks for this
 * event can arrive out of order across e.g. concurrent plan changes; the
 * refetch guarantees the mirror reflects Stripe's current state regardless
 * of which event we process last.
 *
 * Idempotency:
 *   - stripe_subscriptions: ON CONFLICT (stripe_subscription_id) DO UPDATE
 *     — replay just re-writes the same fields from the same refetched object,
 *     so the result is identical.
 */
export async function subscriptionUpdated(
  event: Stripe.Event,
  tx: any,
  stripe: Stripe,
): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  // REFETCH for current state (PITFALL #4).
  const full = (await stripe.subscriptions.retrieve(sub.id)) as any;

  await tx
    .insert(schema.stripeSubscriptions)
    .values({
      stripeSubscriptionId: full.id,
      memberId: (full.metadata?.memberId as string) ?? "",
      status: full.status,
      planId: full.plan?.id ?? null,
      currentPeriodEnd: new Date(
        (full.current_period_end ?? 0) * 1000,
      ).toISOString(),
      rawJson: JSON.stringify(full),
    })
    .onConflictDoUpdate({
      target: schema.stripeSubscriptions.stripeSubscriptionId,
      set: {
        status: full.status,
        currentPeriodEnd: new Date(
          (full.current_period_end ?? 0) * 1000,
        ).toISOString(),
        rawJson: JSON.stringify(full),
        updatedAt: new Date().toISOString(),
      },
    });
}
