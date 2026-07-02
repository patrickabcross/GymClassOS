import type Stripe from "stripe";
import { sql } from "drizzle-orm";
import { schema, getDb } from "../../lib/db.js";
import { enqueueMetaCapiEvent } from "@gymos/queue";
import { toMajorUnits, getMemberHashes, getOrUpsertAttribution } from "../metaLifecycle.js";
import { resolveStageEvent } from "../../lib/stage-event-map.js";
import { lookupPassTypeByPrice } from "./pass-type-grant.js";

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
 *   - passes: deterministic id = `pass_sub_<invoiceId>` (one pass per invoice =
 *     one pass per billing cycle) + ON CONFLICT (id) DO NOTHING.
 *
 * Subscription grant strategy (quick-260702-g8f):
 *   invoice.paid fires on EVERY paid invoice — the first subscription invoice AND
 *   every renewal. A pass is granted per-cycle keyed on the invoice id so renewals
 *   each produce a fresh pass and replays are no-ops (same invoice id → ON CONFLICT).
 *   Grants use pass_type.credits (null → 999 unlimited sentinel) and expiry =
 *   current_period_end. No keyword fallback for subscriptions — if no pass_types row
 *   matches the price, only the subscription mirror + payment row are recorded.
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

  // MC2 LIFE-02: memberId resolved from invoice metadata; falls back to
  // subscription metadata for subscription renewals where the invoice
  // itself may not carry memberId.
  let resolvedMemberId: string | null =
    (full.metadata?.memberId as string) ?? null;

  if (subId && customerId) {
    // Refetch subscription for current_period_end.
    // Pass {} as params (no expand needed) then opts for the stripeAccount header.
    const sub = await stripe.subscriptions.retrieve(subId, {}, opts);
    // Fall back to subscription metadata when invoice metadata lacks memberId.
    resolvedMemberId = resolvedMemberId ?? ((sub.metadata?.memberId as string) ?? null);
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

    // -----------------------------------------------------------------------
    // Pass grant — one pass per invoice cycle (quick-260702-g8f)
    //
    // Derive priceId from the first subscription item (the price the member
    // is actually on; multi-item subs are rare in this use case).
    // -----------------------------------------------------------------------
    const priceId = (sub as any).items?.data?.[0]?.price?.id as
      | string
      | undefined;
    const pt = priceId ? await lookupPassTypeByPrice(tx, priceId) : null;

    if (pt && resolvedMemberId && subId) {
      const granted = pt.credits ?? 999; // null credits = unlimited sentinel

      // Derive periodEnd ROBUSTLY — never epoch-0 (an immediately-expired pass means
      // the member silently can't book any classes). In recent Stripe API versions
      // current_period_end moved OFF the subscription object onto the subscription
      // ITEM and is also on the invoice line. Resolve in priority order so we always
      // get a future timestamp:
      //   (1) invoice line period.end — most authoritative for this billing cycle
      //   (2) subscription item current_period_end — per-item override (Stripe 2024+)
      //   (3) subscription current_period_end — classic location
      // Only if ALL three are missing fall back to ~1 billing cycle from now.
      // NEVER use ?? 0 as default — epoch 0 = 1970-01-01 = immediately expired.
      const resolvedPeriodEndEpoch =
        (full.lines?.data?.[0]?.period?.end as number | undefined) ??
        ((sub as any).items?.data?.[0]?.current_period_end as
          | number
          | undefined) ??
        ((sub as any).current_period_end as number | undefined) ??
        Math.floor(Date.now() / 1000) + 31 * 86400; // ~1 billing cycle fallback
      const periodEnd = new Date(resolvedPeriodEndEpoch * 1000).toISOString();

      const passId = `pass_sub_${full.id}`; // deterministic: one pass per invoice cycle
      await tx.execute(sql`
        INSERT INTO passes (id, member_id, granted, source, stripe_subscription_id, product_name, expires_at, pass_type_id, created_at)
        VALUES (
          ${passId},
          ${resolvedMemberId},
          ${granted},
          'subscription',
          ${subId},
          ${pt.name},
          ${periodEnd},
          ${pt.id},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }
    // If no pt: leave existing behavior — subscription mirror + payment row only.
    // No keyword fallback for subscriptions (invoice.paid has no description keyword).
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

  // MC2 LIFE-02: Purchase CAPI event for the renewal. Best-effort (D-17).
  // Keyed on the invoice id — each renewal invoice is unique so renewals each
  // report; a replayed invoice.paid webhook reuses the id and dedupes.
  if (resolvedMemberId && full.amount_paid != null) {
    try {
      const db = getDb();
      const currency = (full.currency ?? "gbp").toLowerCase();
      const attr = await getOrUpsertAttribution(db, resolvedMemberId);
      const { hashedEmail, hashedPhone } = await getMemberHashes(db, resolvedMemberId);
      await enqueueMetaCapiEvent({
        eventId: `purchase:${full.id}`,
        memberId: resolvedMemberId,
        eventName: resolveStageEvent(null, "purchase"),
        actionSource: "system_generated",
        stageKey: "purchase",
        eventTime: Math.floor(Date.now() / 1000),
        value: toMajorUnits(full.amount_paid, currency),
        currency,
        hashedEmail,
        hashedPhone,
        fbc: attr.fbc,
        fbp: attr.fbp,
        leadId: attr.metaLeadId, // MC3 (LEAD-02): undefined for non-Lead-Ad members (additive)
      });
    } catch (err) {
      console.error(
        "[invoice-paid] Purchase CAPI enqueue failed — non-fatal (D-17):",
        err,
      );
    }
  }
}
