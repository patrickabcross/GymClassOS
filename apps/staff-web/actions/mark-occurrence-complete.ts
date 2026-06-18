// mark-occurrence-complete — AES-06
//
// Mark a PAST scheduled class occurrence as completed. Rejects a future
// occurrence (startsAt > now) with { error: "OCCURRENCE_IN_FUTURE" }. An
// already-completed occurrence is a no-op success; a cancelled occurrence is
// rejected.
//
// Agent-only mutation: no `http` key (write actions are agent-only per
// apps/staff-web/AGENTS.md "Adding a New Gym Action" step 2).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Mark a past class occurrence as completed. Rejects a future occurrence " +
    "(returns {error:'OCCURRENCE_IN_FUTURE'}). An already-completed occurrence is a no-op success. " +
    "Returns {completed:true} or {error}.",
  schema: z.object({
    occurrenceId: z.string().min(1),
  }),
  run: async ({ occurrenceId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables
    const [occ] = await db
      .select({
        id: schema.classOccurrences.id,
        status: schema.classOccurrences.status,
        startsAt: schema.classOccurrences.startsAt,
      })
      .from(schema.classOccurrences)
      .where(eq(schema.classOccurrences.id, occurrenceId))
      .limit(1);
    if (!occ) return { error: "OCCURRENCE_NOT_FOUND" };
    if (occ.status === "completed") return { completed: true };
    if (occ.status === "cancelled") return { error: "OCCURRENCE_CANCELLED" };
    if (new Date(occ.startsAt) > new Date())
      return { error: "OCCURRENCE_IN_FUTURE" };

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classOccurrences)
      .set({ status: "completed" })
      .where(eq(schema.classOccurrences.id, occurrenceId));
    return { completed: true };
  },
});
