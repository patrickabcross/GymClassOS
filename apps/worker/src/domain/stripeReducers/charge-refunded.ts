import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { schema } from "../../lib/db.js";

/**
 * STR-06: charge.refunded.
 *
 * REFETCH the charge from Stripe (PITFALL #4) so we use Stripe's current
 * refund state — refund_amount may differ from the event payload after
 * partial refunds or retries.
 *
 * Insert NEGATIVE pass_debits for each pass granted by this payment_intent.
 * Pattern follows D1-02 ledger: pass_balance = SUM(grants) − SUM(debits).
 * Mark payments.status='refunded' so downstream surfaces see the reversal.
 *
 * Idempotency:
 *   - pass_debits: deterministic id = `pdebit_refund_<chargeId>_<passId>`
 *     + ON CONFLICT (id) DO NOTHING — replay inserts no extra debit row.
 *   - payments: UPDATE keyed on stripe_payment_intent_id — replay just
 *     re-sets status='refunded'.
 */
export async function chargeRefunded(
  event: Stripe.Event,
  tx: any,
  stripe: Stripe,
): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  // REFETCH (PITFALL #4) — current refund state.
  const full = await stripe.charges.retrieve(charge.id);

  const piId =
    typeof full.payment_intent === "string"
      ? full.payment_intent
      : full.payment_intent?.id;
  if (!piId) return;

  // Find every pass granted by this payment_intent. Passes were inserted by
  // checkout-session-completed with stripe_charge_id = paymentIntentId.
  // guard:allow-unscoped — Stripe webhook processor; no per-user scoping
  const passes = await tx
    .select()
    .from(schema.passes)
    .where(eq(schema.passes.stripeChargeId, piId));

  for (const pass of passes) {
    const debitId = `pdebit_refund_${full.id}_${pass.id}`;
    // Deterministic ID — replay-safe via ON CONFLICT DO NOTHING.
    await tx.execute(sql`
      INSERT INTO pass_debits (id, pass_id, amount, reason, created_at)
      VALUES (
        ${debitId},
        ${pass.id},
        ${-(pass.granted ?? 0)},
        'stripe_refund',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }

  // Mark payment refunded.
  await tx
    .update(schema.payments)
    .set({ status: "refunded" })
    .where(eq(schema.payments.stripePaymentIntentId, piId));
}
