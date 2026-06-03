import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq } from "drizzle-orm";

export default defineAction({
  description:
    "Dismiss a pending AI proposal without executing it. Sets status='rejected' and stamps rejected_at " +
    "so the agent has feedback and does not immediately re-propose the same thing. Returns { rejected }.",
  schema: z.object({
    proposalId: z.string().min(1).describe("dashboard_proposals.id to dismiss"),
  }),
  run: async ({ proposalId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db
      .update(schema.dashboardProposals)
      .set({ status: "rejected", rejectedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.dashboardProposals.id, proposalId),
          eq(schema.dashboardProposals.status, "pending"),
        ),
      );
    return { rejected: true };
  },
});
