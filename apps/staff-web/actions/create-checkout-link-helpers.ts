/**
 * Pure helper functions for create-checkout-link.
 *
 * Extracted to a separate module so Vitest can test them without importing
 * the defineAction wrapper (which transitively loads CJS React from
 * @agent-native/core and causes "module is not defined" in ESM Vitest).
 *
 * These helpers encode the Connect session-building logic and the guard.
 */

import type { ConnectedAccount } from "../server/lib/connected-account.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSessionInput {
  memberId: string;
  priceId: string;
  mode: "payment" | "subscription";
  acctId: string;
  baseUrl: string;
}

export interface CheckoutSessionArgs {
  /** The first argument to stripe.checkout.sessions.create — the session params. */
  params: Record<string, unknown>;
  /** The second argument (request options) — always { stripeAccount }. */
  opts: { stripeAccount: string };
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * Assert the connected account is ready to accept charges.
 *
 * Throws with a human-readable "Stripe not connected — finish onboarding in Settings"
 * message if the account is null or chargesEnabled is false.
 */
export function validateConnectedAccount(
  acct: ConnectedAccount | null,
): asserts acct is ConnectedAccount & { chargesEnabled: true } {
  if (!acct || !acct.chargesEnabled) {
    throw new Error(
      "Stripe not connected — finish onboarding in Settings (connected account not ready for charges).",
    );
  }
}

// ---------------------------------------------------------------------------
// Session params builder
// ---------------------------------------------------------------------------

/**
 * Build the stripe.checkout.sessions.create call arguments.
 *
 * - ALWAYS sets top-level metadata.memberId (load-bearing for P1b-07 reducer).
 * - In subscription mode ALSO sets subscription_data.metadata.memberId (Pitfall 2 fix).
 * - Passes { stripeAccount: acctId } as the second arg (direct charge on connected account).
 * - Does NOT include application_fee_amount or application_fee_percent
 *   (decision: no platform fee for now).
 *   // TODO(P2): add application_fee_percent here when per-studio platform fee is configured.
 */
export function buildCheckoutParams(
  input: CheckoutSessionInput,
): CheckoutSessionArgs {
  const { memberId, priceId, mode, acctId, baseUrl } = input;

  const baseParams: Record<string, unknown> = {
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { memberId },
    success_url: `${baseUrl}/gymos/members/${memberId}?checkout=success`,
    cancel_url: `${baseUrl}/gymos/members/${memberId}?checkout=cancelled`,
  };

  if (mode === "subscription") {
    // Pitfall 2: Stripe does NOT copy checkout.session metadata onto the
    // subscription object. The invoice.paid reducer reads sub.metadata?.memberId
    // so BOTH must be set independently.
    baseParams.subscription_data = { metadata: { memberId } };
  }

  return {
    params: baseParams,
    opts: { stripeAccount: acctId },
  };
}
