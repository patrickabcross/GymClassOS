import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getStripeClient } from "../server/lib/stripe.js";

/**
 * EMBED-05: Generate a Stripe hosted Checkout URL for a known member (lead)
 * to purchase a class pass or membership.
 *
 * CRITICAL: The session is created with metadata.memberId so the P1b-07
 * checkout.session.completed reducer (services/worker/src/domain/stripeReducers/
 * checkout-session-completed.ts) can bind the granted pass to this member.
 * Without metadata.memberId the payment is recorded but NO pass credits are
 * granted and the member has no link to the payment — see Pitfall 7.
 *
 * Use this AFTER the lead has been contacted via WhatsApp. Send the returned
 * URL to the member inside a WhatsApp message so they can pay in one click.
 */
export default defineAction({
  description:
    "Generate a Stripe hosted Checkout URL for a contacted lead to buy a class pass or membership. " +
    "Use this after a lead has been identified in the inbox and you want to send them a payment link via WhatsApp. " +
    "The Checkout session includes metadata.memberId so the P1b-07 payment webhook automatically binds " +
    "the purchased pass to this member on checkout.session.completed. Returns { url, sessionId, productName }.",
  schema: z.object({
    memberId: z
      .string()
      .min(1)
      .describe("gym_members.id of the contacted lead — must be non-empty"),
    priceId: z
      .string()
      .min(1)
      .describe(
        "Stripe Price ID for the pass/membership product (e.g. price_xxx). " +
          "The Stripe Product's DESCRIPTION must contain one of: 10-pack, 5-pack, drop-in, or 1-class " +
          "for the P1b-07 reducer to grant pass credits on checkout.session.completed.",
      ),
    productName: z
      .string()
      .default("pass")
      .describe("Display name shown in the UI (not sent to Stripe)"),
  }),
  http: { method: "POST" },
  run: async ({ memberId, priceId, productName }) => {
    const stripe = await getStripeClient();
    const baseUrl =
      process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";

    // CRITICAL: metadata.memberId is the contract the P1b-07 reducer relies on
    // to bind the pass to this member. Never remove this field.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { memberId },
      success_url: `${baseUrl}/gymos/members/${memberId}?checkout=success`,
      cancel_url: `${baseUrl}/gymos/members/${memberId}?checkout=cancelled`,
    });

    return {
      url: session.url,
      sessionId: session.id,
      productName,
    };
  },
});
