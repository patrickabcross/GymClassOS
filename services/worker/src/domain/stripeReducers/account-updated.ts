import type Stripe from "stripe";
import { sql } from "drizzle-orm";

/**
 * P1c.1-03: account.updated reducer.
 *
 * Upserts readiness flags (charges_enabled, payouts_enabled, requirements_due,
 * disabled_reason) into `connected_accounts` so the staff-web onboarding
 * surface reflects Stripe's current state in real-time.
 *
 * Unlike other reducers, NO refetch is needed here — the account.updated
 * event carries the full Stripe.Account object in data.object. stripeAccount
 * param is accepted for dispatch-table uniformity but is unused.
 *
 * Idempotency:
 *   ON CONFLICT (id) DO UPDATE — replaying the same event re-writes the same
 *   flags from the same object; result is identical.
 */
export async function accountUpdated(
  event: Stripe.Event,
  tx: any,
  _stripe: Stripe,
  _stripeAccount?: string,
): Promise<void> {
  const acct = event.data.object as Stripe.Account;
  const currentlyDue = acct.requirements?.currently_due ?? [];
  const disabledReason = acct.requirements?.disabled_reason ?? null;

  await tx.execute(sql`
    INSERT INTO connected_accounts
      (id, charges_enabled, payouts_enabled, requirements_due, disabled_reason, raw_json, created_at, updated_at)
    VALUES (
      ${acct.id},
      ${acct.charges_enabled ?? false},
      ${acct.payouts_enabled ?? false},
      ${JSON.stringify(currentlyDue)},
      ${disabledReason},
      ${JSON.stringify(acct)},
      NOW()::text,
      NOW()::text
    )
    ON CONFLICT (id) DO UPDATE SET
      charges_enabled  = EXCLUDED.charges_enabled,
      payouts_enabled  = EXCLUDED.payouts_enabled,
      requirements_due = EXCLUDED.requirements_due,
      disabled_reason  = EXCLUDED.disabled_reason,
      raw_json         = EXCLUDED.raw_json,
      updated_at       = NOW()::text
  `);
}
