import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Mark a noticeboard task as completed. Sets status='completed' and stamps completed_at. " +
    "Called by the coach (clicking Mark done) or by the agent after it finishes the task's work. " +
    "Returns { taskId, completed }.",
  schema: z.object({
    taskId: z.string().min(1).describe("dashboard_tasks.id to complete"),
  }),
  run: async ({ taskId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db
      .update(schema.dashboardTasks)
      .set({ status: "completed", completedAt: new Date().toISOString() })
      .where(eq(schema.dashboardTasks.id, taskId));
    return { taskId, completed: true };
  },
});
