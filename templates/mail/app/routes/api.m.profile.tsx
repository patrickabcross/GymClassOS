// GET /api/m/profile
// Member home + profile data: { member, passBalance, upcomingBooking, today }.
// Consumed by the Home tab (D2-04 will refine) and the Profile tab.
//
// Pass balance follows the D1-02 two-aggregation pattern: SUM(passes.granted)
// minus SUM(passDebits.amount) as TWO SEPARATE queries — never chain leftJoin
// through pass_debits because the fan-out double-counts grants.
//
// Hardcoded macro targets per D-10 (2100/130/250/60). Production (P2 / CAL-06)
// derives them from Mifflin-St Jeor against the member's profile.
import { eq, and, gte, sql, asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const member = await requireDemoMember(request);
  const db = getDb();
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.slice(0, 10); // YYYY-MM-DD UTC for demo bucket

  // Pass balance — TWO SEPARATE aggregations (D1-02 lesson)
  // guard:allow-unscoped — demo D-07
  const grantedTotal = await db
    .select({ sum: sql<number>`COALESCE(SUM(${schema.passes.granted}), 0)` })
    .from(schema.passes)
    .where(eq(schema.passes.memberId, member.id))
    .then((r) => Number(r[0]?.sum ?? 0));

  // guard:allow-unscoped — demo D-07
  const debitsTotal = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)`,
    })
    .from(schema.passDebits)
    .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
    .where(eq(schema.passes.memberId, member.id))
    .then((r) => Number(r[0]?.sum ?? 0));

  const passBalance = grantedTotal - debitsTotal;

  // Upcoming booking: earliest future occurrence for this member, status='booked'
  // guard:allow-unscoped — demo D-07
  const upcoming = await db
    .select({
      bookingId: schema.bookings.id,
      occurrenceId: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      className: schema.classDefinitions.name,
    })
    .from(schema.bookings)
    .leftJoin(
      schema.classOccurrences,
      eq(schema.bookings.occurrenceId, schema.classOccurrences.id),
    )
    .leftJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .where(
      and(
        eq(schema.bookings.memberId, member.id),
        eq(schema.bookings.status, "booked"),
        gte(schema.classOccurrences.startsAt, nowIso),
      ),
    )
    .orderBy(asc(schema.classOccurrences.startsAt))
    .limit(1)
    .then((r) => r[0] ?? null);

  // Today's kcal total + macros
  // guard:allow-unscoped — demo D-07
  const todayTotals = await db
    .select({
      kcal: sql<number>`COALESCE(SUM(${schema.foodEntries.kcal}), 0)`,
      protein: sql<number>`COALESCE(SUM(${schema.foodEntries.proteinG}), 0)`,
      carbs: sql<number>`COALESCE(SUM(${schema.foodEntries.carbsG}), 0)`,
      fat: sql<number>`COALESCE(SUM(${schema.foodEntries.fatG}), 0)`,
    })
    .from(schema.foodEntries)
    .where(
      and(
        eq(schema.foodEntries.memberId, member.id),
        sql`substr(${schema.foodEntries.loggedAt}, 1, 10) = ${todayDate}`,
      ),
    )
    .then((r) => r[0] ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 });

  return {
    member: {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phoneE164: member.phoneE164,
      goal: member.goal,
    },
    passBalance,
    upcomingBooking: upcoming,
    today: {
      kcal: Number(todayTotals.kcal ?? 0),
      proteinG: Number(todayTotals.protein ?? 0),
      carbsG: Number(todayTotals.carbs ?? 0),
      fatG: Number(todayTotals.fat ?? 0),
      // Hardcoded targets per D-10 (production: Mifflin-St Jeor in P2/CAL-06)
      targetKcal: 2100,
      targetProteinG: 130,
      targetCarbsG: 250,
      targetFatG: 60,
    },
  };
}
