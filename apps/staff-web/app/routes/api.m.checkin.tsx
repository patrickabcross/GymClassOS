// POST /api/m/checkin   { occurrenceId }
// Member self-check-in (DE6-01) — a pure CALLER of the existing
// mark-booking-attended attendance chokepoint. There is NO new attendance
// write path here. This route:
//   (a) gates the caller as a member (requireMember → Bearer session),
//   (b) validates the occurrence is scheduled and inside the temporal window,
//   (c) checks the member has a 'booked'|'attended' booking for this occurrence,
//   (d) if already attended, returns success idempotently (no second call),
//   (e) otherwise calls mark-booking-attended.run — the sole attendance writer.
//
// QR payload: the mobile app extracts occurrenceId from `runstudio-checkin:<id>`.
// Temporal window: [startsAt - 45m, endsAt + 15m] (generous for gym-door scanning).
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireMember } from "../../server/lib/member-session";
import type { ActionFunctionArgs } from "react-router";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const member = await requireMember(request); // throws 401/403/409

  let occurrenceId: string;
  try {
    const json = (await request.json()) as { occurrenceId?: string };
    occurrenceId = String(json.occurrenceId ?? "").trim();
  } catch {
    return jsonResponse({ error: "Missing occurrenceId" }, 400);
  }
  if (!occurrenceId) {
    return jsonResponse({ error: "Missing occurrenceId" }, 400);
  }

  const db = getDb();

  // Load the occurrence joined to class name
  // guard:allow-unscoped — single-tenant gym tables
  const [occ] = await db
    .select({
      id: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      status: schema.classOccurrences.status,
      className: schema.classDefinitions.name,
    })
    .from(schema.classOccurrences)
    .leftJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .where(eq(schema.classOccurrences.id, occurrenceId))
    .limit(1);

  if (!occ) {
    return jsonResponse({ error: "OCCURRENCE_NOT_FOUND" }, 404);
  }
  if (occ.status !== "scheduled") {
    return jsonResponse({ error: "OCCURRENCE_UNAVAILABLE" }, 409);
  }

  // Temporal window check: [startsAt - 45m, endsAt + 15m]
  const now = Date.now();
  const startMs = Date.parse(occ.startsAt);
  const endMs = Date.parse(occ.endsAt);
  if (now < startMs - 45 * 60_000 || now > endMs + 15 * 60_000) {
    return jsonResponse({ error: "CHECKIN_WINDOW_CLOSED" }, 409);
  }

  // Find this member's booking for the occurrence
  // guard:allow-unscoped — single-tenant gym tables
  const [booking] = await db
    .select({ id: schema.bookings.id, status: schema.bookings.status })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.occurrenceId, occurrenceId),
        eq(schema.bookings.memberId, member.id),
        inArray(schema.bookings.status, ["booked", "attended"]),
      ),
    )
    .limit(1);

  if (!booking) {
    return jsonResponse({ error: "NOT_BOOKED" }, 409);
  }

  // Idempotent: already attended → return success without re-calling chokepoint
  if (booking.status === "attended") {
    return jsonResponse(
      { attended: true, className: occ.className, startsAt: occ.startsAt },
      200,
    );
  }

  // Call the SOLE attendance chokepoint. Do NOT replicate the UPDATE here.
  const mod = await import("../../actions/mark-booking-attended.js");
  const parsed = mod.default.schema.safeParse({ bookingId: booking.id });
  if (!parsed.success) {
    return jsonResponse({ error: "Bad input" }, 400);
  }
  const result = await mod.default.run(parsed.data);

  if ("error" in result) {
    if (result.error === "BOOKING_CANCELLED") {
      return jsonResponse({ error: "BOOKING_CANCELLED" }, 409);
    }
    return jsonResponse({ error: result.error }, 404);
  }

  return jsonResponse(
    { attended: true, className: occ.className, startsAt: occ.startsAt },
    200,
  );
}
