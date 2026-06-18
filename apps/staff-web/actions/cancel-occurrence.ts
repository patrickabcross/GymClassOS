import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Cancel a class occurrence and atomically refund affected pass credits. " +
    "GATED — reached only via propose-action({actionName:'cancel-occurrence', params:{occurrenceId}}); " +
    "the agent never calls this directly. On approval it runs ONE transaction: active bookings -> cancelled, " +
    "a negative pass_debit per cancelled booking that used a pass, and the occurrence -> cancelled. " +
    "Idempotent — a second approve on an already-cancelled occurrence is a no-op. " +
    "Returns {cancelled:true, bookingsCancelled, creditsRefunded} or {error}.",
  schema: z.object({
    occurrenceId: z.string().min(1),
  }),
  run: async ({ occurrenceId }) => {
    const db = getDb();

    let bookingsCancelled = 0;
    let creditsRefunded = 0;
    let alreadyCancelled = false;
    let notFound = false;

    // ONE atomic transaction — bookings + refunds + occurrence, all-or-nothing.
    await db.transaction(async (tx) => {
      // 1. Re-check status INSIDE the transaction (idempotency — occurrence may
      //    have been cancelled between propose and approve, or on a double-click).
      // guard:allow-unscoped — single-tenant gym tables
      const [occ] = await tx
        .select({ status: schema.classOccurrences.status })
        .from(schema.classOccurrences)
        .where(eq(schema.classOccurrences.id, occurrenceId))
        .limit(1);
      if (!occ) {
        notFound = true;
        return;
      }
      if (occ.status === "cancelled") {
        alreadyCancelled = true;
        return; // already done — idempotent no-op
      }

      // 2. Fetch all active bookings with their passId.
      // guard:allow-unscoped — single-tenant gym tables
      const activeBookings = await tx
        .select({
          id: schema.bookings.id,
          passId: schema.bookings.passId,
        })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.occurrenceId, occurrenceId),
            eq(schema.bookings.status, "booked"),
          ),
        );

      // 3. Cancel every active booking (batch).
      if (activeBookings.length > 0) {
        const bookingIds = activeBookings.map((b) => b.id);
        // guard:allow-unscoped — single-tenant gym tables
        await tx
          .update(schema.bookings)
          .set({
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
          })
          .where(inArray(schema.bookings.id, bookingIds));
        bookingsCancelled = activeBookings.length;
      }

      // 4. Insert a negative pass_debit ONLY for bookings that used a pass
      //    (passId != null). Bookings with null passId are still cancelled
      //    above but have no credit to refund (RESEARCH Pitfall 2).
      const refundable = activeBookings.filter((b) => b.passId != null);
      for (const booking of refundable) {
        // guard:allow-unscoped — single-tenant gym tables
        await tx.insert(schema.passDebits).values({
          id: `pdebit_refund_${nanoid()}`,
          passId: booking.passId!,
          bookingId: booking.id,
          amount: -1, // negative = credit refund (schema allows negative)
          reason: "cancellation_refund",
          createdAt: new Date().toISOString(),
        });
      }
      creditsRefunded = refundable.length;

      // 5. Cancel the occurrence (last — only reached if all the above succeed).
      // guard:allow-unscoped — single-tenant gym tables
      await tx
        .update(schema.classOccurrences)
        .set({ status: "cancelled" })
        .where(eq(schema.classOccurrences.id, occurrenceId));
    });

    if (notFound) return { error: "OCCURRENCE_NOT_FOUND" };
    if (alreadyCancelled) return { cancelled: true, alreadyCancelled: true };
    return { cancelled: true, bookingsCancelled, creditsRefunded };
  },
});
