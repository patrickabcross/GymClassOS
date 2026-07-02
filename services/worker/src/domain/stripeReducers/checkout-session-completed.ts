import type Stripe from "stripe";
import { sql } from "drizzle-orm";
import { schema, getDb } from "../../lib/db.js";
import { enqueueMetaCapiEvent } from "@gymos/queue";
import { toMajorUnits, getMemberHashes, getOrUpsertAttribution } from "../metaLifecycle.js";
import { resolveStageEvent } from "../../lib/stage-event-map.js";
import { lookupPassTypeByPrice } from "./pass-type-grant.js";

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
 *
 * Pass grant strategy (quick-260702-g8f):
 *   1. Subscription mode checkouts → SKIP; invoice.paid is the sole grant path
 *      for subscriptions to avoid double-granting on both checkout + first invoice.
 *   2. Payment mode with a price matching pass_types.stripe_price_id → pass_type-driven
 *      grant: pass_type_id stamped, credits from pass_type (null → 999 unlimited sentinel),
 *      expiry from validity_days.
 *   3. Payment mode with no matching pass_types row → legacy keyword fallback (description
 *      keywords "10-pack", "5-pack", "drop-in"/"1-class"); pass_type_id = NULL (allow-all).
 */
export async function checkoutSessionCompleted(
  event: Stripe.Event,
  tx: TxClient,
  stripe: Stripe,
  stripeAccount?: string,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  // REFETCH for current state (PITFALL #4 + WEB-06).
  // Pass { stripeAccount } so the refetch resolves against the connected account
  // (not the platform) — Pitfall 3. When stripeAccount is undefined (platform
  // event), the opts arg is undefined which is a no-op to the SDK.
  const opts = stripeAccount ? { stripeAccount } : undefined;
  const fullSession = await stripe.checkout.sessions.retrieve(
    session.id,
    { expand: ["line_items.data.price.product", "customer"] },
    opts,
  );

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
  //
  // Pass-type-driven grant: if the line item price matches pass_types.stripe_price_id,
  // stamp pass_type_id and use the type's credits/validity_days.
  // Legacy keyword fallback: no matching pass_types row → match by description keyword;
  // pass_type_id stays NULL (= allow-all; existing members never break).
  //
  // Subscription mode: NO pass here — invoice.paid is the sole grant path for
  // subscriptions. Granting on both checkout AND invoice would double-grant on the
  // first billing cycle.
  for (const li of fullSession.line_items?.data ?? []) {
    // Subscription grants live ONLY in invoice.paid.
    if (fullSession.mode === "subscription") continue;

    if (!memberId || !paymentIntentId) continue;

    const priceId =
      typeof li.price === "string" ? li.price : li.price?.id;
    const pt = priceId ? await lookupPassTypeByPrice(tx, priceId) : null;

    const passId = `pass_${paymentIntentId}_${li.id}`;

    if (pt) {
      // Pass-type-driven grant: stamp pass_type_id, use pass_type credits + expiry.
      const granted = pt.credits ?? 999; // null credits = unlimited sentinel
      const expiresAt =
        pt.validityDays != null
          ? new Date(Date.now() + pt.validityDays * 86400000).toISOString()
          : null;
      await tx.execute(sql`
        INSERT INTO passes (id, member_id, granted, source, stripe_charge_id, product_name, expires_at, pass_type_id, created_at)
        VALUES (
          ${passId},
          ${memberId},
          ${granted},
          'purchase',
          ${paymentIntentId},
          ${li.description ?? pt.name},
          ${expiresAt},
          ${pt.id},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `);
    } else {
      // Legacy keyword fallback — pass_type_id = NULL (allow-all for pre-catalog members).
      const credits = passCreditsForLineItem(li);
      if (credits === null) continue;
      await tx.execute(sql`
        INSERT INTO passes (id, member_id, granted, source, stripe_charge_id, product_name, expires_at, pass_type_id, created_at)
        VALUES (
          ${passId},
          ${memberId},
          ${credits},
          'purchase',
          ${paymentIntentId},
          ${li.description ?? "pack"},
          NULL,
          NULL,
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }
  }

  // MC2 LIFE-02: Purchase CAPI event. Best-effort (D-17) — never roll back the
  // reducer on a queue failure. Keyed on the checkout session id so a replay
  // dedupes (singletonKey) and renewals (distinct sessions/invoices) each report.
  if (memberId && fullSession.amount_total != null) {
    try {
      const db = getDb();
      const currency = (fullSession.currency ?? "gbp").toLowerCase();
      const attr = await getOrUpsertAttribution(db, memberId);
      const { hashedEmail, hashedPhone } = await getMemberHashes(db, memberId);
      await enqueueMetaCapiEvent({
        eventId: `purchase:${fullSession.id}`,
        memberId,
        eventName: resolveStageEvent(null, "purchase"),
        actionSource: "system_generated",
        stageKey: "purchase",
        eventTime: Math.floor(Date.now() / 1000),
        value: toMajorUnits(fullSession.amount_total, currency),
        currency,
        hashedEmail,
        hashedPhone,
        fbc: attr.fbc,
        fbp: attr.fbp,
        leadId: attr.metaLeadId, // MC3 (LEAD-02): undefined for non-Lead-Ad members (additive)
      });
    } catch (err) {
      console.error(
        "[checkout-session-completed] Purchase CAPI enqueue failed — non-fatal (D-17):",
        err,
      );
    }
  }
}

/**
 * Legacy helper: map line item to pass credits by description keyword.
 *
 * Used as fallback when no pass_types row matches the line item price.
 * The pass_type-driven path (see above) supersedes this for items with a known
 * stripe_price_id. Kept for backward compatibility with pre-catalog products.
 *
 * Exported for testing.
 */
export function passCreditsForLineItem(li: Stripe.LineItem): number | null {
  const desc = (li.description ?? "").toLowerCase();
  if (desc.includes("10-pack") || desc.includes("10 pack")) return 10;
  if (desc.includes("5-pack") || desc.includes("5 pack")) return 5;
  if (desc.includes("1-class") || desc.includes("drop-in")) return 1;
  return null; // unknown SKU — skip pass grant
}
