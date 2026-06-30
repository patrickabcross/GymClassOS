// POST /api/m/teacher/check-in   { bookingId }
// Tap-to-check-in (TCH-02) — a pure CALLER of the existing mark-booking-attended
// attendance chokepoint. There is NO new attendance write path here: the booking
// status flip AND the Meta `Schedule` CAPI event both fire inside
// mark-booking-attended.run() (the single attendance writer). This route only
// (a) gates the caller as a teacher, (b) verifies the booking's occurrence is
// owned by that teacher, then (c) invokes the chokepoint.
//
// Ownership: booking → occurrence → trainer_id must equal this teacher's
// trainerId. A null trainerId always 403s. A booking whose occurrence belongs to
// another teacher 403s — a teacher can only check in members for sessions they own.
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireTeacher } from "../../server/lib/teacher-session";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const teacher = await requireTeacher(request); // 401/403 inside

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad input", { status: 400 });
  }
  const bookingId = body?.bookingId;
  if (!bookingId || typeof bookingId !== "string") {
    return new Response("bookingId required", { status: 400 });
  }

  const db = getDb();

  // Ownership: booking → occurrence → trainer_id must equal this teacher's trainerId
  // guard:allow-unscoped — single-tenant gym tables
  const [row] = await db
    .select({ occTrainerId: schema.classOccurrences.trainerId })
    .from(schema.bookings)
    .leftJoin(
      schema.classOccurrences,
      eq(schema.bookings.occurrenceId, schema.classOccurrences.id),
    )
    .where(eq(schema.bookings.id, bookingId))
    .limit(1);
  if (!row) {
    return new Response(JSON.stringify({ error: "BOOKING_NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!teacher.trainerId || row.occTrainerId !== teacher.trainerId) {
    throw new Response("Forbidden", { status: 403 });
  }

  // Call the SOLE attendance chokepoint (approve-proposal.ts pattern). Do NOT
  // replicate the UPDATE — the Meta Schedule CAPI event fires inside .run().
  const mod = await import("../../actions/mark-booking-attended.js");
  const parsed = mod.default.schema.safeParse({ bookingId });
  if (!parsed.success) return new Response("Bad input", { status: 400 });
  const result = await mod.default.run(parsed.data);
  return result; // {attended:true} | {error:"BOOKING_NOT_FOUND"|"BOOKING_CANCELLED"}
}
