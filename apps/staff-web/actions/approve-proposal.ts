import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq } from "drizzle-orm";

// Only these two actions may ever be executed via a proposal. Both route
// through their own gates (send-template-to-members -> enqueueOutboundWhatsApp
// -> worker sendMessage() chokepoint: opt-in + 24h window + approved-template).
// This handler NEVER calls Meta or Stripe directly.
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
  "cancel-occurrence",
  "reschedule-occurrence",
] as const;

export default defineAction({
  description:
    "Approve a pending AI proposal and execute it via the existing gated action. " +
    "Looks up the proposal, validates it is pending and in the allowlist, re-validates the stored " +
    "params against the target action's schema, then runs it. For WhatsApp sends this still passes " +
    "the worker's opt-in/window/template gates. Returns { executed, result } or { error }.",
  schema: z.object({
    proposalId: z
      .string()
      .min(1)
      .describe("dashboard_proposals.id to approve and execute"),
  }),
  run: async ({ proposalId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    const [proposal] = await db
      .select()
      .from(schema.dashboardProposals)
      .where(
        and(
          eq(schema.dashboardProposals.id, proposalId),
          eq(schema.dashboardProposals.status, "pending"),
        ),
      )
      .limit(1);

    if (!proposal) return { error: "Proposal not found or already actioned" };
    if (
      !ACTION_ALLOWLIST.includes(
        proposal.actionName as (typeof ACTION_ALLOWLIST)[number],
      )
    ) {
      return { error: "Action not in allowlist" };
    }

    let rawParams: unknown;
    try {
      rawParams = JSON.parse(proposal.paramsJson);
    } catch {
      return { error: "Stored params are not valid JSON" };
    }

    // Dynamically import the target action and re-validate params against ITS schema
    // (Pitfall 2 — never call run() with unvalidated stored JSON).
    let mod: any;
    if (proposal.actionName === "send-template-to-members") {
      mod = await import("./send-template-to-members.js");
    } else if (proposal.actionName === "publish-form") {
      mod = await import("./publish-form.js");
    } else if (proposal.actionName === "cancel-occurrence") {
      mod = await import("./cancel-occurrence.js");
    } else if (proposal.actionName === "reschedule-occurrence") {
      mod = await import("./reschedule-occurrence.js");
    } else {
      mod = await import("./create-checkout-link.js");
    }
    const parsed = mod.default.schema.safeParse(rawParams);
    if (!parsed.success) {
      return {
        error: "Stored params failed validation",
        issues: parsed.error.issues,
      };
    }

    const result = await mod.default.run(parsed.data);

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.dashboardProposals)
      .set({
        status: "executed",
        executedAt: new Date().toISOString(),
        resultJson: JSON.stringify(result),
      })
      .where(eq(schema.dashboardProposals.id, proposalId));

    return { executed: true, result };
  },
});
