import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getPlatformStripe } from "../server/lib/stripe.js";

/**
 * create-account-link — Generate a Stripe-hosted Account Link URL for the
 * connected studio to complete KYC onboarding.
 *
 * IMPORTANT: Account Links are single-use and short-lived (~5 minutes).
 *   - If the user abandons onboarding, Stripe calls the refresh_url.
 *   - The settings page handles ?stripe=refresh by re-calling this action
 *     and redirecting to the fresh link.url.
 *
 * IMPORTANT: return_url does NOT mean onboarding is complete.
 *   - Readiness (charges_enabled, payouts_enabled) comes from the
 *     account.updated webhook → Plan 03 reducer → connected_accounts table.
 *   - The settings page reads readiness from the table, never from the
 *     return URL query param.
 *
 * NOT in the agent system prompt — staff-invoked from settings only.
 * The agent has no need to generate onboarding links autonomously.
 *
 * guard:allow-unscoped — connected_accounts/secrets are studio-global config (single-tenant)
 */
export default defineAction({
  description:
    "Generate a Stripe-hosted Account Link URL for the studio to complete Connect onboarding (KYC). " +
    "The link is single-use and short-lived. On ?stripe=refresh the settings page re-calls this action. " +
    "Staff-invoked from /gymos/settings/integrations only; not an agent tool.",
  schema: z.object({
    accountId: z
      .string()
      .regex(/^acct_/, "accountId must be a Stripe connected account id (acct_…)")
      .describe("The connected account id (acct_xxx) to generate an onboarding link for."),
  }),
  http: { method: "POST" },
  run: async ({ accountId }) => {
    const BASE =
      process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";

    const platform = await getPlatformStripe();
    const link = await platform.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      // refresh_url: called by Stripe when the link expires or the user comes back
      // without completing. The settings page reads ?stripe=refresh, re-calls this
      // action, and redirects to the fresh link.url.
      refresh_url: `${BASE}/gymos/settings/integrations?stripe=refresh`,
      // return_url: called after the user returns from onboarding.
      // NOTE: this does NOT confirm onboarding is complete — the account.updated
      // webhook (→ Plan 03 reducer → connected_accounts table) is authoritative.
      return_url: `${BASE}/gymos/settings/integrations?stripe=return`,
    });

    return { url: link.url };
  },
});
