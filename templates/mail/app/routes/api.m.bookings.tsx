// POST /api/m/bookings — body { occurrenceId: string }
// Inserts a bookings row for the X-Demo-Member-Id member.
//
// Demo-grade: NO atomic capacity check, NO entitlement resolution, NO pass debit.
// Production (BKG-03/BKG-04) wraps capacity check + entitlement + pass debit in
// a single SQL transaction with SELECT ... FOR UPDATE on the occurrence row.
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader(_: LoaderFunctionArgs) {
  // GET is not supported — clients use /api/m/schedule to read.
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const member = await requireDemoMember(request);

  let occurrenceId: string;
  try {
    const json = (await request.json()) as { occurrenceId?: string };
    occurrenceId = String(json.occurrenceId ?? "");
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!occurrenceId) {
    return new Response(JSON.stringify({ error: "Missing occurrenceId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  // Idempotency for the demo: if this member already has a 'booked' row for
  // this occurrence, return the existing booking id instead of inserting again.
  // guard:allow-unscoped — demo D-07
  const existing = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.occurrenceId, occurrenceId),
        eq(schema.bookings.memberId, member.id),
        eq(schema.bookings.status, "booked"),
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);
  if (existing) {
    return new Response(
      JSON.stringify({ bookingId: existing.id, alreadyBooked: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const bookingId = `bkg_${crypto.randomUUID()}`;
  await db.insert(schema.bookings).values({
    id: bookingId,
    occurrenceId,
    memberId: member.id,
    status: "booked",
    bookedByUserId: null, // self-booked from member app
    bookedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ bookingId, alreadyBooked: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
