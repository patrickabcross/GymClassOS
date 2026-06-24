// mark-booking-attended — MC2 LIFE-03
//
// The single attendance-transition chokepoint: the FIRST and ONLY code path
// that sets bookings.status = 'attended' + stamps attended_at.
//
// After flipping the booking, best-effort enqueues exactly one Meta Schedule
// CAPI event keyed memberId:occurrenceId. An enqueue failure MUST NOT undo the
// status write (D-17). The worker handler stamps schedule_sent_at on success.
//
// Idempotency: if the booking is already 'attended' the action returns early
// without a second enqueue. pg-boss singletonKey on memberId:occurrenceId is
// the concurrency backstop in the worker.
//
// Agent-only mutation: no `http` key (write actions are agent/staff-only per
// apps/staff-web/AGENTS.md "Adding a New Gym Action" step 2).
//
// D-11 (MC2): minimal backend transition — NOT added to the agent-chat.ts
// system prompt (not an agent LLM tool; staff/programmatic only).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { resolveStageEvent } from "../server/lib/stage-event-map.js";

export default defineAction({
  description:
    "Attendance chokepoint — the sole writer of bookings.status='attended'. " +
    "Flips a booking to attended + stamps attended_at, then enqueues one Meta " +
    "Schedule CAPI event keyed memberId:occurrenceId. Re-marking an already-attended " +
    "booking is a no-op (no second enqueue). Enqueue failure never undoes the status write (D-17). " +
    "Returns {attended:true} or {error:'BOOKING_NOT_FOUND'|'BOOKING_CANCELLED'}.",
  schema: z.object({
    bookingId: z.string().min(1),
  }),
  run: async ({ bookingId }) => {
    const db = getDb();

    // 1. Fetch the booking
    // guard:allow-unscoped — single-tenant gym tables
    const [booking] = await db
      .select({
        id: schema.bookings.id,
        occurrenceId: schema.bookings.occurrenceId,
        memberId: schema.bookings.memberId,
        status: schema.bookings.status,
        attendedAt: schema.bookings.attendedAt,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId))
      .limit(1);

    // 2. Not found
    if (!booking) return { error: "BOOKING_NOT_FOUND" };

    // 3. Already attended — idempotent no-op, do NOT re-enqueue
    if (booking.status === "attended") return { attended: true };

    // 4. Cancelled — cannot mark attended
    if (booking.status === "cancelled") return { error: "BOOKING_CANCELLED" };

    // 5. Flip status to attended + stamp attended_at
    const attendedAt = new Date().toISOString();
    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.bookings)
      .set({ status: "attended", attendedAt })
      .where(eq(schema.bookings.id, bookingId));

    // 6. Best-effort Schedule CAPI enqueue — failure MUST NOT undo the status write (D-17)
    try {
      const { enqueueMetaCapiEvent } = await import(
        "../app/lib/queue-client.js"
      );

      // Resolve the configured event name for "schedule" stage (default: "Schedule")
      // guard:allow-unscoped — single-tenant meta config
      const [cfg] = await db
        .select({ map: schema.studioOwnerConfig.metaStageEventMap })
        .from(schema.studioOwnerConfig)
        .limit(1);
      const eventName = resolveStageEvent(cfg?.map ?? null, "schedule");

      // Ensure attribution row exists (D-04) — INSERT ON CONFLICT DO NOTHING
      // guard:allow-unscoped — single-tenant meta attribution
      await db.execute(sql`
        INSERT INTO meta_lead_attribution (id, member_id, created_at, updated_at)
        VALUES (${nanoid()}, ${booking.memberId}, NOW(), NOW())
        ON CONFLICT (member_id) DO NOTHING
      `);

      // Read fbc/fbp/meta_lead_id from attribution row
      const attrRows = await db.execute(sql`
        SELECT fbc, fbp, meta_lead_id FROM meta_lead_attribution WHERE member_id = ${booking.memberId} LIMIT 1
      `); // guard:allow-unscoped — single-tenant meta attribution
      const attr =
        ((attrRows as { rows?: unknown[] })?.rows ??
          (attrRows as unknown[]) ??
          [])[0] ?? {};
      const attrTyped = attr as Record<string, string | null>;

      // Fetch member email + phone for SHA-256 hashing
      // guard:allow-unscoped — single-tenant gym tables
      const [m] = await db
        .select({
          email: schema.gymMembers.email,
          phone: schema.gymMembers.phoneE164,
        })
        .from(schema.gymMembers)
        .where(eq(schema.gymMembers.id, booking.memberId))
        .limit(1);

      const hashedEmail = m?.email
        ? createHash("sha256")
            .update(m.email.toLowerCase().trim())
            .digest("hex")
        : undefined;
      const hashedPhone = m?.phone
        ? createHash("sha256")
            .update(m.phone.replace(/\D/g, ""))
            .digest("hex")
        : undefined;

      // Enqueue — event_id is memberId:occurrenceId per LIFE-03 spec
      await enqueueMetaCapiEvent({
        eventId: `${booking.memberId}:${booking.occurrenceId}`,
        memberId: booking.memberId,
        eventName,
        actionSource: "system_generated",
        stageKey: "schedule",
        eventTime: Math.floor(Date.now() / 1000),
        hashedEmail,
        hashedPhone,
        fbc: attrTyped.fbc ?? undefined,
        fbp: attrTyped.fbp ?? undefined,
        leadId: (attrTyped.meta_lead_id as string | null) ?? undefined, // MC3 (LEAD-02)
      });
    } catch (err) {
      console.error(
        "[mark-booking-attended] Schedule CAPI enqueue failed — non-fatal (D-17):",
        err,
      );
    }

    // 7. Return success
    return { attended: true };
  },
});
