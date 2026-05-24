import type Stripe from "stripe";
import { sql } from "drizzle-orm";
import { schema } from "../../lib/db.js";

type TxClient = any; // Drizzle transaction client — keep loose for now

/**
 * STR-03: checkout.session.completed.
 *
 * REFETCHES session from Stripe (PITFALL #4 + WEB-06) — the webhook payload
 * is treated as a notification only; the source of truth is the live
 * Stripe API. Upserts customer mirror, inserts payment row, and grants
 * passes with deterministic IDs so replay is a no-op.
 *
 * Idempotency:
 *   - stripe_customers: ON CONFLICT (stripe_customer_id) DO NOTHING
 *   - payments: ON CONFLICT (stripe_payment_intent_id) DO NOTHING
 *   - passes: deterministic id = `pass_<paymentIntentId>_<lineItemId>`
 *     + ON CONFLICT (id) DO NOTHING
 */
export async function checkoutSessionCompleted(
  event: Stripe.Event,
  tx: TxClient,
  stripe: Stripe,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  // REFETCH for current state (PITFALL #4 + WEB-06).
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price.product", "customer"],
  });

  const customerId =
    typeof fullSession.customer === "string"
      ? fullSession.customer
      : fullSession.customer?.id;

  const memberId =
    (fullSession.metadata?.memberId as string | undefined) ?? null;

  if (customerId) {
    await tx
      .insert(schema.stripeCustomers)
      .values({
        stripeCustomerId: customerId,
        memberId,
        rawJson: JSON.stringify(fullSession.customer ?? { id: customerId }),
      })
      .onConflictDoNothing({
        target: schema.stripeCustomers.stripeCustomerId,
      });
  }

  // payments row keyed on payment_intent (idempotent).
  const paymentIntentId =
    typeof fullSession.payment_intent === "string"
      ? fullSession.payment_intent
      : fullSession.payment_intent?.id;

  if (paymentIntentId) {
    await tx
      .insert(schema.payments)
      .values({
        id: `pay_${paymentIntentId}`,
        memberId,
        stripePaymentIntentId: paymentIntentId,
        amountMinorUnits: fullSession.amount_total ?? 0,
        currency: fullSession.currency ?? "usd",
        status: "succeeded",
        rawJson: JSON.stringify(fullSession),
        occurredAt: new Date(fullSession.created * 1000).toISOString(),
      })
      .onConflictDoNothing({
        target: schema.payments.stripePaymentIntentId,
      });
  }

  // Grant passes — deterministic IDs make replay safe.
  // Demo: simple "pack" detection by line item description. P2 builds
  // pass_products table.
  for (const li of fullSession.line_items?.data ?? []) {
    const credits = passCreditsForLineItem(li);
    if (credits === null || !memberId || !paymentIntentId) continue;

    const passId = `pass_${paymentIntentId}_${li.id}`;
    await tx.execute(sql`
      INSERT INTO passes (id, member_id, granted, source, stripe_charge_id, product_name, expires_at, created_at)
      VALUES (
        ${passId},
        ${memberId},
        ${credits},
        'purchase',
        ${paymentIntentId},
        ${li.description ?? "pack"},
        NULL,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
}

/**
 * Demo helper: map line item to pass credits.
 * Production (P2): pass_products table keyed on price/product id.
 */
function passCreditsForLineItem(li: Stripe.LineItem): number | null {
  const desc = (li.description ?? "").toLowerCase();
  if (desc.includes("10-pack") || desc.includes("10 pack")) return 10;
  if (desc.includes("5-pack") || desc.includes("5 pack")) return 5;
  if (desc.includes("1-class") || desc.includes("drop-in")) return 1;
  return null; // unknown SKU — skip pass grant
}
