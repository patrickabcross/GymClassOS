// GET /api/m/teacher/schedule
// Teacher-side schedule (TCH-01) — returns ONLY the occurrences assigned to the
// requesting teacher (class_occurrences.trainer_id === their trainerId) for the
// next 7 days, status 'scheduled', with class metadata.
//
// Empty-state, NOT error (Pitfall 3): a teacher whose trainers.user_id is not
// yet linked (trainerId === null) OR who simply has no upcoming sessions gets
// HTTP 200 { items: [], trainerLinked } — never a 500. requireTeacher 401/403s
// non-teachers before any query runs.
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireTeacher } from "../../server/lib/teacher-session";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const teacher = await requireTeacher(request); // 401/403 inside
  if (!teacher.trainerId) return { items: [], trainerLinked: false };

  const db = getDb();
  const nowIso = new Date().toISOString();
  const sevenDaysIso = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // guard:allow-unscoped — single-tenant gym tables
  const items = await db
    .select({
      id: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      capacity: schema.classOccurrences.capacity,
      status: schema.classOccurrences.status,
      room: schema.classOccurrences.room,
      location: schema.classOccurrences.location,
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
        eq(schema.classOccurrences.trainerId, teacher.trainerId),
        gte(schema.classOccurrences.startsAt, nowIso),
        lte(schema.classOccurrences.startsAt, sevenDaysIso),
        eq(schema.classOccurrences.status, "scheduled"),
      ),
    )
    .orderBy(asc(schema.classOccurrences.startsAt));

  return { items, trainerLinked: true };
}
