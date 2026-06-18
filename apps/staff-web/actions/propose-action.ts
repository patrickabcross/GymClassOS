import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Propose a one-click action for the coach to approve on the noticeboard. " +
    "Use this AFTER gathering data (e.g. list-at-risk-members) when you want to recommend a send/checkout. " +
    "The coach approves with one click; the existing gated action then executes (WhatsApp still passes the " +
    "worker's opt-in + 24h-window + approved-template gates — you are NOT bypassing them). " +
    "actionName must be 'send-template-to-members', 'create-checkout-link', 'publish-form', 'cancel-occurrence', or 'reschedule-occurrence'. " +
    "params must match that action's schema exactly. Returns { proposalId }.",
  schema: z.object({
    taskId: z
      .string()
      .optional()
      .describe("Optional dashboard_tasks.id to link this proposal to a task"),
    actionName: z
      .enum([
        "send-template-to-members",
        "create-checkout-link",
        "publish-form",
        "cancel-occurrence",
        "reschedule-occurrence",
      ])
      .describe(
        "The existing gated action this proposal will execute on approval",
      ),
    params: z
      .record(z.string(), z.unknown())
      .describe(
        "Params for the target action (e.g. {memberIds, templateName} for send-template-to-members)",
      ),
    rationale: z
      .string()
      .max(500)
      .describe(
        "Why you are recommending this — shown to the coach before they approve",
      ),
  }),
  run: async ({ taskId, actionName, params, rationale }) => {
    const db = getDb();
    const id = `dprop_${nanoid()}`;
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db.insert(schema.dashboardProposals).values({
      id,
      taskId: taskId ?? null,
      actionName,
      paramsJson: JSON.stringify(params ?? {}),
      rationale,
      status: "pending",
      proposedAt: new Date().toISOString(),
    });
    return { proposalId: id };
  },
});
