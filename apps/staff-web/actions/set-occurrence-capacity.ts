// set-occurrence-capacity — AES-02
//
// Change a class occurrence's capacity directly. Rejects (without mutating)
// any request to set the capacity below the current number of active bookings,
// returning { error: "CAPACITY_BELOW_BOOKINGS", bookingCount, requestedCapacity }.
//
// Agent-only mutation: no `http` key (write actions are agent-only per
// apps/staff-web/AGENTS.md "Adding a New Gym Action" step 2).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq, and, count } from "drizzle-orm";

export default defineAction({
  description:
    "Change a class occurrence's capacity. Rejected if the new capacity is " +
    "below the current number of active bookings — returns {error:'CAPACITY_BELOW_BOOKINGS', " +
    "bookingCount, requestedCapacity} with no mutation. Returns {updated:true, occurrenceId, capacity} on success.",
  schema: z.object({
    occurrenceId: z.string().min(1),
    capacity: z.number().int().min(1).max(500),
  }),
  run: async ({ occurrenceId, capacity }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables
    const [occ] = await db
      .select({
        id: schema.classOccurrences.id,
        status: schema.classOccurrences.status,
      })
      .from(schema.classOccurrences)
      .where(eq(schema.classOccurrences.id, occurrenceId))
      .limit(1);
    if (!occ) return { error: "OCCURRENCE_NOT_FOUND" };
    if (occ.status !== "scheduled")
      return { error: "OCCURRENCE_NOT_SCHEDULABLE", status: occ.status };

    // guard:allow-unscoped — single-tenant gym tables
    const [row] = await db
      .select({ bookingCount: count() })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.occurrenceId, occurrenceId),
          eq(schema.bookings.status, "booked"),
        ),
      );
    const bookingCount = Number(row?.bookingCount ?? 0);

    if (capacity < bookingCount) {
      return {
        error: "CAPACITY_BELOW_BOOKINGS",
        bookingCount,
        requestedCapacity: capacity,
      };
    }

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classOccurrences)
      .set({ capacity })
      .where(eq(schema.classOccurrences.id, occurrenceId));
    return { updated: true, occurrenceId, capacity };
  },
});
