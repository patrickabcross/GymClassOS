// GET /api/m/teacher/roster?occurrenceId=
// Per-session roster (TCH-01) — booked|attended bookings joined to member name,
// for ONE occurrence the requesting teacher owns.
//
// Ownership gate: the occurrence's trainer_id MUST equal the teacher's trainerId
// BEFORE any roster is returned (403 otherwise). A null trainerId always 403s —
// an unlinked teacher can never view another teacher's class. 400 if occurrenceId
// is missing; 404 if the occurrence does not exist.
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireTeacher } from "../../server/lib/teacher-session";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const teacher = await requireTeacher(request); // 401/403 inside
  const occurrenceId = new URL(request.url).searchParams.get("occurrenceId");
  if (!occurrenceId) {
    throw new Response("occurrenceId required", { status: 400 });
  }

  const db = getDb();

  // Ownership gate: the occurrence must be assigned to this teacher's trainerId
  // guard:allow-unscoped — single-tenant gym tables
  const [occ] = await db
    .select({ trainerId: schema.classOccurrences.trainerId })
    .from(schema.classOccurrences)
    .where(eq(schema.classOccurrences.id, occurrenceId))
    .limit(1);
  if (!occ) throw new Response("Not found", { status: 404 });
  if (!teacher.trainerId || occ.trainerId !== teacher.trainerId) {
    throw new Response("Forbidden", { status: 403 });
  }

  // Roster: booked|attended bookings joined to member name
  // guard:allow-unscoped — single-tenant gym tables
  const roster = await db
    .select({
      bookingId: schema.bookings.id,
      memberId: schema.bookings.memberId,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
      status: schema.bookings.status,
    })
    .from(schema.bookings)
    .leftJoin(
      schema.gymMembers,
      eq(schema.bookings.memberId, schema.gymMembers.id),
    )
    .where(
      and(
        eq(schema.bookings.occurrenceId, occurrenceId),
        inArray(schema.bookings.status, ["booked", "attended"]),
      ),
    );

  return { occurrenceId, roster };
}
