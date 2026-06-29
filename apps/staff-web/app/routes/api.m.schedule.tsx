// GET /api/m/schedule
// Member-side schedule — returns occurrences for the next 7 days, with
// class metadata, booking counts, and a flag indicating whether the
// X-Demo-Member-Id member is already booked into each.
//
// Demo-grade: no studio-timezone bucketing (uses ISO date string of startsAt).
// Production (SCH-07) uses the studio's IANA timezone for DST-safe bucketing.
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireMemberOrDemo } from "../../server/lib/member-session";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const member = await requireMemberOrDemo(request);
  const db = getDb();

  const nowIso = new Date().toISOString();
  const sevenDaysIso = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Query A — occurrences in window + class metadata
  // guard:allow-unscoped — demo D-07
  const occurrences = await db
    .select({
      id: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      capacity: schema.classOccurrences.capacity,
      status: schema.classOccurrences.status,
      room: schema.classOccurrences.room,
      className: schema.classDefinitions.name,
      category: schema.classDefinitions.category,
      durationMin: schema.classDefinitions.durationMin,
    })
    .from(schema.classOccurrences)
    .leftJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .where(
      and(
        gte(schema.classOccurrences.startsAt, nowIso),
        lte(schema.classOccurrences.startsAt, sevenDaysIso),
        eq(schema.classOccurrences.status, "scheduled"),
      ),
    )
    .orderBy(asc(schema.classOccurrences.startsAt));

  // Query B — booking counts per occurrence (single grouped query)
  // guard:allow-unscoped — demo D-07
  const countRows = await db
    .select({
      occurrenceId: schema.bookings.occurrenceId,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.bookings)
    .where(eq(schema.bookings.status, "booked"))
    .groupBy(schema.bookings.occurrenceId);
  const bookingCounts: Record<string, number> = {};
  for (const r of countRows) bookingCounts[r.occurrenceId] = Number(r.count);

  // Query C — which occurrences is THIS member already booked into?
  // guard:allow-unscoped — demo D-07
  const myBookings = await db
    .select({ occurrenceId: schema.bookings.occurrenceId })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.memberId, member.id),
        eq(schema.bookings.status, "booked"),
      ),
    );
  const mySet = new Set(myBookings.map((b) => b.occurrenceId));

  const items = occurrences.map((o) => ({
    ...o,
    bookedCount: bookingCounts[o.id] ?? 0,
    isBookedByMe: mySet.has(o.id),
    full: (bookingCounts[o.id] ?? 0) >= o.capacity,
  }));

  return { items };
}
