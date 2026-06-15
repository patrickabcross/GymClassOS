import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getPlatformStripe } from "../server/lib/stripe.js";
import { readConnectedAccount } from "../server/lib/connected-account.js";
import {
  validateConnectedAccount,
  buildCheckoutParams,
  resolveProductKey,
} from "./create-checkout-link-helpers.js";

/**
 * CONNECT: Generate a Stripe hosted Checkout URL on the studio's connected
 * account for a known member (lead) to purchase a class pass or recurring
 * membership.
 *
 * CRITICAL CONTRACTS (do NOT remove these comments):
 *
 * 1. Direct charge via { stripeAccount } — the checkout session is created ON
 *    the connected account (not the platform). Prices MUST live on the connected
 *    account; platform-account prices 404 under { stripeAccount }.
 *
 * 2. metadata.memberId — load-bearing for the P1b-07 checkout.session.completed
 *    reducer (services/worker) which binds the granted pass to this member.
 *    Without this, the payment records but NO pass credits are granted.
 *
 * 3. subscription_data.metadata.memberId (Pitfall 2) — Stripe does NOT copy
 *    checkout session metadata onto the subscription object. The invoice.paid
 *    reducer reads sub.metadata?.memberId so BOTH must be set in subscription mode.
 *
 * 4. No application_fee_* params (decision: no platform fee for now).
 *    // TODO(P2): add application_fee_percent here when per-studio platform fee is configured.
 *
 * 5. Stripe Product keyword contract (unchanged from P1c-02):
 *    The Product's DESCRIPTION must contain one of: 10-pack, 5-pack, drop-in, 1-class
 *    for the P1b-07 reducer to grant pass credits on checkout.session.completed.
 *    For subscription mode, pass credits are granted via invoice.paid reducer.
 *
 * Use this AFTER the lead has been contacted via WhatsApp. Send the returned
 * URL to the member inside a WhatsApp message so they can pay in one click.
 * Also used directly from the public /embed/buy flow (Plan 05 Task 3).
 */
export default defineAction({
  description:
    "Generate a Stripe hosted Checkout URL for a contacted lead to buy a class pass (mode:payment) or membership subscription (mode:subscription). " +
    "The session is created on the studio's connected account so revenue flows directly to the studio. " +
    "metadata.memberId + subscription_data.metadata.memberId (for subscriptions) are set so the P1b-07 reducers " +
    "bind the pass/subscription to this member on checkout completion. " +
    "Returns { url, sessionId, productName, mode }. " +
    "Use this after a lead has been identified in the inbox and you want to send them a payment link via WhatsApp.",
  schema: z.object({
    memberId: z
      .string()
      .min(1)
      .describe("gym_members.id of the contacted lead — must be non-empty"),
    productKey: z
      .enum(["drop-in", "membership"])
      .optional()
      .describe(
        "Resolve price+mode server-side from STRIPE_PRICE_* env. " +
          "Use this from staff UI so price IDs never reach the client. " +
          "Takes precedence over priceId/mode when present.",
      ),
    priceId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Stripe Price ID on the connected account (e.g. price_xxx). " +
          "For pack purchases the Product's DESCRIPTION must contain: 10-pack, 5-pack, drop-in, or 1-class. " +
          "For subscription memberships the price must be recurring. " +
          "Ignored when productKey is provided.",
      ),
    productName: z
      .string()
      .default("pass")
      .describe("Display name shown in the UI (not sent to Stripe)"),
    mode: z
      .enum(["payment", "subscription"])
      .default("payment")
      .describe(
        "payment = one-off pack/drop-in purchase; subscription = recurring membership. " +
          "Ignored when productKey is provided.",
      ),
  }),
  http: { method: "POST" },
  run: async ({ memberId, productKey, priceId, productName, mode }) => {
    // ------------------------------------------------------------------
    // 0. Resolve productKey (staff UI path) OR validate raw priceId
    // ------------------------------------------------------------------
    let resolvedPriceId: string;
    let resolvedMode: "payment" | "subscription";
    let resolvedProductName: string;

    if (productKey) {
      // Staff-UI path: resolve price + mode server-side from STRIPE_PRICE_* env.
      // productKey wins over any caller-supplied priceId/mode/productName.
      const resolved = resolveProductKey(productKey);
      resolvedPriceId = resolved.priceId;
      resolvedMode = resolved.mode;
      // Use caller's explicit productName if they overrode the default, otherwise
      // use the resolved label.
      resolvedProductName =
        productName !== "pass" ? productName : resolved.productName;
    } else {
      // Agent propose→approve path or /embed/buy path: caller supplies raw priceId.
      if (!priceId) {
        throw new Error("Either productKey or priceId is required");
      }
      resolvedPriceId = priceId;
      resolvedMode = mode;
      resolvedProductName = productName;
    }

    // ------------------------------------------------------------------
    // 1. Guard: connected account must exist and have charges enabled
    // ------------------------------------------------------------------
    const acct = await readConnectedAccount();
    validateConnectedAccount(acct);

    // ------------------------------------------------------------------
    // 2. Build session params + stripeAccount request option
    // ------------------------------------------------------------------
    const platform = await getPlatformStripe();
    const baseUrl =
      process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";

    const { params, opts } = buildCheckoutParams({
      memberId,
      priceId: resolvedPriceId,
      mode: resolvedMode,
      acctId: acct.id,
      baseUrl,
    });

    // ------------------------------------------------------------------
    // 3. Create session on the connected account
    // ------------------------------------------------------------------
    // The Stripe SDK's checkout.sessions.create overloads can confuse
    // TypeScript when passing { stripeAccount } as a second arg. Cast to any
    // to avoid overload-resolution issues — the runtime call is correct.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await (platform.checkout.sessions.create as any)(
      params,
      opts,
    );

    return {
      url: session.url,
      sessionId: session.id,
      productName: resolvedProductName,
      mode: resolvedMode,
    };
  },
});
