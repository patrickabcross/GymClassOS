import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, gte, lt, sql } from "drizzle-orm";

export default defineAction({
  description:
    "List the gym's class definitions (e.g. 'Yoga', 'HIIT') along with a count of occurrences in a recent window. " +
    "Use this when asked what classes the gym offers, what's on the schedule, or for class catalog context. " +
    "Returns one row per class definition with name, default duration, default capacity, and the count of occurrences in the last N days.",
  schema: z.object({
    windowDays: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .default(14)
      .describe(
        "Window size (days both backward and forward) for the occurrence count",
      ),
  }),
  http: { method: "GET" },
  run: async ({ windowDays }) => {
    const db = getDb();
    const sinceIso = new Date(Date.now() - windowDays * 86400000).toISOString();
    const untilIso = new Date(Date.now() + windowDays * 86400000).toISOString();

    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
    // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
    const rows = await db
      .select({
        id: schema.classDefinitions.id,
        name: schema.classDefinitions.name,
        durationMin: schema.classDefinitions.durationMin,
        defaultCapacity: schema.classDefinitions.defaultCapacity,
        occurrencesInWindow: sql<number>`COUNT(${schema.classOccurrences.id})`,
      })
      .from(schema.classDefinitions)
      .leftJoin(
        schema.classOccurrences,
        and(
          eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
          gte(schema.classOccurrences.startsAt, sinceIso),
          lt(schema.classOccurrences.startsAt, untilIso),
        ),
      )
      .groupBy(
        schema.classDefinitions.id,
        schema.classDefinitions.name,
        schema.classDefinitions.durationMin,
        schema.classDefinitions.defaultCapacity,
      )
      .orderBy(schema.classDefinitions.name);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      durationMin: Number(r.durationMin),
      defaultCapacity: Number(r.defaultCapacity),
      occurrencesInWindow: Number(r.occurrencesInWindow ?? 0),
    }));
  },
});
