import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";

export default defineAction({
  description:
    "List class occurrences from the trailing N days with their fill rate (bookings / capacity). " +
    "Use this when asked which classes are not filling up, which classes had low attendance, " +
    "or for fill-rate analytics. Returns one row per occurrence with name, date, capacity, booked count, and fillPct.",
  schema: z.object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .default(7)
      .describe("Trailing days to look back from now (default 7, max 90)"),
  }),
  http: { method: "GET" },
  run: async ({ days }) => {
    const db = getDb();
    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
    const nowIso = new Date().toISOString();

    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
    // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
    const rows = await db
      .select({
        occurrenceId: schema.classOccurrences.id,
        className: schema.classDefinitions.name,
        startsAt: schema.classOccurrences.startsAt,
        capacity: schema.classOccurrences.capacity,
        booked: sql<number>`COUNT(CASE WHEN ${schema.bookings.status} = 'booked' OR ${schema.bookings.status} = 'attended' THEN 1 ELSE NULL END)`,
      })
      .from(schema.classOccurrences)
      .innerJoin(
        schema.classDefinitions,
        eq(schema.classDefinitions.id, schema.classOccurrences.definitionId),
      )
      .leftJoin(
        schema.bookings,
        eq(schema.bookings.occurrenceId, schema.classOccurrences.id),
      )
      .where(
        and(
          gte(schema.classOccurrences.startsAt, sinceIso),
          lt(schema.classOccurrences.startsAt, nowIso),
          ne(schema.classOccurrences.status, "cancelled"),
        ),
      )
      .groupBy(
        schema.classOccurrences.id,
        schema.classDefinitions.name,
        schema.classOccurrences.startsAt,
        schema.classOccurrences.capacity,
      )
      .orderBy(schema.classOccurrences.startsAt);

    return rows.map((r) => ({
      occurrenceId: r.occurrenceId,
      className: r.className,
      startsAt: r.startsAt,
      capacity: Number(r.capacity),
      booked: Number(r.booked ?? 0),
      fillPct:
        r.capacity > 0
          ? Math.round((Number(r.booked ?? 0) / Number(r.capacity)) * 100)
          : 0,
    }));
  },
});
