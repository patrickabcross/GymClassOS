// deactivate-schedule-rule — MPV Phase 2
//
// Cancels a recurring series:
//   1. Marks the rule inactive (active = false) so the nightly materialiser
//      stops generating future occurrences for it.
//   2. Cancels future, not-yet-started occurrences that belong to the rule AND
//      have NO active bookings (status -> 'cancelled'). Past/started occurrences
//      are left untouched (they are history), and any future occurrence that
//      already has a booked member is PRESERVED — cancelling it bluntly here
//      would strand that member's booking + pass credit. Those must be cancelled
//      individually through the gated `cancel-occurrence` flow, which refunds
//      pass credits atomically. We report how many were skipped for that reason.
//
// Returns {deactivated:true, occurrencesCancelled, occurrencesKeptWithBookings}
//       | {error:'RULE_NOT_FOUND' | 'RULE_ALREADY_INACTIVE'}

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, gt, inArray } from "drizzle-orm";

export default defineAction({
  description:
    "Cancel a recurring class series: deactivate the rule so the nightly materialiser stops " +
    "generating future occurrences, and cancel future not-yet-started occurrences of the series " +
    "that have no bookings. Future occurrences that already have a booked member are preserved " +
    "(cancel those individually so pass credits are refunded). " +
    "Returns {deactivated:true, occurrencesCancelled, occurrencesKeptWithBookings} | {error:'RULE_NOT_FOUND'|'RULE_ALREADY_INACTIVE'}.",
  schema: z.object({
    id: z.string().min(1).describe("Schedule rule id"),
  }),
  run: async (input) => {
    const db = getDb();
    const nowIso = new Date().toISOString();

    // guard:allow-unscoped — single-tenant gym tables
    const [rule] = await db
      .select({
        id: schema.classScheduleRules.id,
        active: schema.classScheduleRules.active,
      })
      .from(schema.classScheduleRules)
      .where(eq(schema.classScheduleRules.id, input.id))
      .limit(1);

    if (!rule) {
      return { error: "RULE_NOT_FOUND" } as const;
    }
    if (!rule.active) {
      return { error: "RULE_ALREADY_INACTIVE" } as const;
    }

    // 1. Stop future materialisation.
    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classScheduleRules)
      .set({ active: false })
      .where(eq(schema.classScheduleRules.id, input.id));

    // 2. Find this rule's future, not-yet-started, still-scheduled occurrences.
    // startsAt is stored as an ISO-8601 UTC string ("…Z"), so lexicographic
    // comparison against nowIso is chronologically correct.
    // guard:allow-unscoped — single-tenant gym tables
    const futureOccs = await db
      .select({ id: schema.classOccurrences.id })
      .from(schema.classOccurrences)
      .where(
        and(
          eq(schema.classOccurrences.ruleId, input.id),
          eq(schema.classOccurrences.status, "scheduled"),
          gt(schema.classOccurrences.startsAt, nowIso),
        ),
      );

    const futureIds = futureOccs.map((o) => o.id);
    if (futureIds.length === 0) {
      return {
        deactivated: true,
        occurrencesCancelled: 0,
        occurrencesKeptWithBookings: 0,
      } as const;
    }

    // Which of those have an active ('booked') booking? Keep those.
    // guard:allow-unscoped — single-tenant gym tables
    const bookedRows = await db
      .select({ occurrenceId: schema.bookings.occurrenceId })
      .from(schema.bookings)
      .where(
        and(
          inArray(schema.bookings.occurrenceId, futureIds),
          eq(schema.bookings.status, "booked"),
        ),
      )
      .groupBy(schema.bookings.occurrenceId);

    const bookedIds = new Set(bookedRows.map((r) => r.occurrenceId));
    const cancellableIds = futureIds.filter((id) => !bookedIds.has(id));

    if (cancellableIds.length > 0) {
      // guard:allow-unscoped — single-tenant gym tables
      await db
        .update(schema.classOccurrences)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(schema.classOccurrences.id, cancellableIds),
            // re-assert scheduled to avoid racing a concurrent booking
            eq(schema.classOccurrences.status, "scheduled"),
          ),
        );
    }

    return {
      deactivated: true,
      occurrencesCancelled: cancellableIds.length,
      occurrencesKeptWithBookings: bookedIds.size,
    } as const;
  },
});
