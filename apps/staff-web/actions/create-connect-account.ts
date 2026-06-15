import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getPlatformStripe } from "../server/lib/stripe.js";
import {
  readConnectedAccount,
  upsertConnectedAccountId,
} from "../server/lib/connected-account.js";

/**
 * create-connect-account — Create the studio's Custom-equivalent Stripe
 * connected account using controller properties (NOT deprecated `type: "custom"`).
 *
 * IDEMPOTENT: if a connected_accounts row already exists, returns the existing
 * account id without creating a second one. A studio should have exactly one
 * connected account.
 *
 * NOT in the agent system prompt — staff-invoked only from
 * /gymos/settings/integrations. The agent has no need to create accounts
 * autonomously; onboarding is a deliberate staff action. Add to agent-chat.ts
 * system prompt only when autonomous account creation becomes a product
 * requirement.
 *
 * The 4 controller properties reproduce a legacy Custom account:
 *   - stripe_dashboard.type: "none"      → white-label, studio never sees Stripe
 *   - fees.payer: "application"          → PLATFORM pays Stripe processing fees
 *   - losses.payments: "application"     → PLATFORM liable for negative balances
 *   - requirement_collection: "application" → PLATFORM owns KYC (we drive Account Links)
 *
 * guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
 */
export default defineAction({
  description:
    "Create the studio's Stripe connected account (Custom-equivalent via controller properties). " +
    "Idempotent — returns the existing account if one already exists. " +
    "Staff-invoked from /gymos/settings/integrations only; not an agent tool.",
  schema: z.object({
    studioLabel: z
      .string()
      .default("hustle")
      .describe(
        "Descriptive label for the studio (stored in connected_accounts.studio_label). " +
          "Not sent to Stripe — for internal reference only.",
      ),
  }),
  http: { method: "POST" },
  run: async ({ studioLabel }) => {
    // Idempotency: if a connected account already exists for this studio, return it.
    // Single-tenant — there should be at most one row in connected_accounts.
    const existing = await readConnectedAccount();
    if (existing) {
      return { accountId: existing.id, created: false };
    }

    // Create a Custom-equivalent connected account via controller properties.
    // Per RESEARCH §Pattern 1 and ROADMAP D-record 2026-06-12 locked decisions.
    const platform = await getPlatformStripe();
    const account = await platform.accounts.create({
      controller: {
        stripe_dashboard: { type: "none" },
        fees: { payer: "application" },
        losses: { payments: "application" },
        requirement_collection: "application",
      },
      country: "GB",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Persist the account id immediately. Readiness flags are filled later
    // by the Plan 03 account.updated reducer when the studio completes KYC.
    await upsertConnectedAccountId(account.id, studioLabel);

    return { accountId: account.id, created: true };
  },
});
