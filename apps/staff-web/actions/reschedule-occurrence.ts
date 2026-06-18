import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import { addMinutes } from "date-fns";

export default defineAction({
  description:
    "Reschedule a class occurrence to a new start time. GATED — reached only via " +
    "propose-action({actionName:'reschedule-occurrence', params:{occurrenceId, startsAt}}); the agent never " +
    "calls this directly when the class has bookings. Recomputes endsAt from the definition's duration. " +
    "Returns {rescheduled:true, startsAt, endsAt} or {error}.",
  schema: z.object({
    occurrenceId: z.string().min(1),
    startsAt: z
      .string()
      .min(1)
      .describe("New ISO datetime, studio-local with tz offset"),
  }),
  run: async ({ occurrenceId, startsAt }) => {
    // Validate the new start time parses.
    const start = new Date(startsAt);
    if (isNaN(start.getTime())) return { error: "INVALID_STARTS_AT" };

    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables
    const [occ] = await db
      .select({
        id: schema.classOccurrences.id,
        definitionId: schema.classOccurrences.definitionId,
        status: schema.classOccurrences.status,
      })
      .from(schema.classOccurrences)
      .where(eq(schema.classOccurrences.id, occurrenceId))
      .limit(1);
    if (!occ) return { error: "OCCURRENCE_NOT_FOUND" };
    if (occ.status !== "scheduled")
      return { error: "OCCURRENCE_NOT_SCHEDULABLE", status: occ.status };

    // Resolve the definition's duration to recompute endsAt (Pitfall 8).
    // guard:allow-unscoped — single-tenant gym tables
    const [def] = await db
      .select({ durationMin: schema.classDefinitions.durationMin })
      .from(schema.classDefinitions)
      .where(eq(schema.classDefinitions.id, occ.definitionId))
      .limit(1);
    if (!def) return { error: "DEFINITION_NOT_FOUND" };

    const endsAt = addMinutes(start, def.durationMin).toISOString();

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classOccurrences)
      .set({ startsAt, endsAt }) // startsAt stored verbatim; endsAt UTC instant
      .where(eq(schema.classOccurrences.id, occurrenceId));
    return { rescheduled: true, startsAt, endsAt };
  },
});
