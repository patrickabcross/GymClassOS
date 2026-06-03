import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Create a prioritized task on the noticeboard Tasks list. " +
    "priority: 1=high, 2=medium, 3=low. Optionally link to a proposal via proposalId " +
    "so the task row shows a one-click Approve button. Returns { taskId }.",
  schema: z.object({
    title: z
      .string()
      .min(1)
      .max(200)
      .describe("Short task title (the headline line)"),
    body: z
      .string()
      .max(1000)
      .optional()
      .describe("Optional detail shown under the title"),
    priority: z.coerce
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .default(2)
      .describe("1=high, 2=medium, 3=low"),
    proposalId: z
      .string()
      .optional()
      .describe(
        "Optional dashboard_proposals.id to attach a one-click action to this task",
      ),
  }),
  run: async ({ title, body, priority, proposalId }) => {
    const db = getDb();
    const id = `dtask_${nanoid()}`;
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db.insert(schema.dashboardTasks).values({
      id,
      title,
      body: body ?? null,
      priority,
      status: "open",
      proposalId: proposalId ?? null,
      createdAt: new Date().toISOString(),
    });
    return { taskId: id };
  },
});
