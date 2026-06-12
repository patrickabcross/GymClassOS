import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { sql } from "drizzle-orm";
import { getPlatformStripe } from "../server/lib/stripe.js";
import { readConnectedAccount } from "../server/lib/connected-account.js";
import { getDb } from "../server/db/index.js";

/**
 * CONNECT: Open a Stripe Customer Portal session on the studio's connected account
 * for member self-service (subscription management, payment method updates).
 *
 * Staff-only — invoke from /gymos/members/:id UI so the member can manage their
 * subscription without calling staff. NOT an agent LLM tool.
 *
 * Flow:
 * 1. Guard: connected account must have chargesEnabled.
 * 2. Look up the member's connected-account cus_ id from stripe_customers.
 * 3. Call billingPortal.sessions.create with { stripeAccount } (RESEARCH §Portal).
 * 4. Return { url } — staff sends or displays this link to the member.
 *
 * Returns { error } instead of throwing when the member has no Stripe customer yet
 * (they must complete a purchase first to be in the connected account's customer list).
 *
 * guard:allow-unscoped — stripe_customers is studio-global (single-tenant);
 * connected_accounts is studio-global config.
 */
export default defineAction({
  description:
    "Open a Stripe Customer Portal session on the connected account for a member to manage their subscription or update their payment method. " +
    "Returns { url } — open this URL for the member (e.g. copy it into WhatsApp). " +
    "NOT an agent LLM tool; invoked by staff from the member detail page.",
  schema: z.object({
    memberId: z
      .string()
      .min(1)
      .describe("gym_members.id of the member needing portal access"),
  }),
  http: { method: "POST" },
  run: async ({ memberId }) => {
    // ------------------------------------------------------------------
    // 1. Guard: connected account must be ready for charges
    // ------------------------------------------------------------------
    const acct = await readConnectedAccount();
    if (!acct || !acct.chargesEnabled) {
      throw new Error(
        "Stripe not connected — finish onboarding in Settings (connected account not ready for charges).",
      );
    }

    // ------------------------------------------------------------------
    // 2. Resolve member's connected-account customer id
    //
    // stripe_customers stores the cus_ id on the connected account (written
    // by the P1b-07 checkout.session.completed reducer when it creates/finds
    // the customer). The portal session must use THIS customer id — not a
    // platform-account customer id.
    //
    // guard:allow-unscoped — stripe_customers is studio-global (single-tenant)
    // ------------------------------------------------------------------
    const db = getDb();
    const result = await (db as any).execute(sql`
      SELECT stripe_customer_id
      FROM stripe_customers
      WHERE member_id = ${memberId}
      LIMIT 1
    `);
    const rows = (result as any)?.rows ?? (result as any) ?? [];
    const cusId: string | null =
      rows && rows.length > 0
        ? (rows[0]?.stripe_customer_id as string | null | undefined) ?? null
        : null;

    if (!cusId) {
      return {
        error:
          "Member has no Stripe customer yet — they must complete a purchase first to access the Customer Portal.",
      };
    }

    // ------------------------------------------------------------------
    // 3. Create Customer Portal session on the connected account
    //
    // Omit `configuration` — uses the connected account's default portal config
    // (set up by the studio in their Stripe Dashboard → Billing → Customer portal).
    // RESEARCH §Portal: billingPortal.sessions.create with { stripeAccount }.
    // ------------------------------------------------------------------
    const platform = await getPlatformStripe();
    const baseUrl =
      process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";

    const portal = await platform.billingPortal.sessions.create(
      {
        customer: cusId,
        return_url: `${baseUrl}/gymos/members/${memberId}`,
      },
      { stripeAccount: acct.id },
    );

    return { url: portal.url };
  },
});
