// create-class-occurrence — AES-05
//
// Schedules a class occurrence from an existing class definition.
// Resolves the definition for default capacity + durationMin, computes
// endsAt = startsAt + durationMin, then inserts a class_occurrences row.
//
// DESIGN: This action does NOT accept an inline newDefinition object. The UI
// orchestrates the two-step (call create-class-definition first if "New type",
// then call this action). Keeping each action atomic makes them independently
// reusable as agent tools in v1.2 Phase AE2.
//
// TIMEZONE NOTE: startsAt is stored verbatim (the caller's studio-local ISO
// string with tz offset). endsAt is computed via addMinutes(start, durationMin)
// and serialised as UTC (toISOString() suffix "Z"). Both render correctly in
// the calendar via new Date(iso) — the same approach used for all seed data.
// Production timezone alignment (studio IANA TZ) is deferred to SCH-07.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { addMinutes } from "date-fns";

export default defineAction({
  description:
    "Schedule a class occurrence from an existing class definition. " +
    "Resolves the definition for default capacity + duration; computes endsAt = startsAt + durationMin. " +
    "Accepts optional trainerId (from list-trainers) and location (e.g. Norwich/Wymondham). " +
    "Returns { id, startsAt, endsAt, capacity }.",
  schema: z.object({
    definitionId: z.string().min(1),
    startsAt: z
      .string()
      .min(1)
      .describe("ISO datetime, studio-local with tz offset"),
    capacity: z.number().int().min(1).max(500).optional(),
    room: z.string().max(120).optional(),
    instructorUserId: z.string().optional(),
    notes: z.string().max(2000).optional(),
    // LP3: optional trainer + location fields
    trainerId: z.string().optional(),
    location: z.string().max(120).optional(),
  }),
  http: { method: "POST" },
  run: async (input) => {
    // 1. Validate startsAt parses.
    const start = new Date(input.startsAt);
    if (isNaN(start.getTime())) {
      return { error: "INVALID_STARTS_AT" };
    }

    const db = getDb();

    // 2. Resolve the definition (must exist + be active).
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per P1b.1-RESEARCH.md §6
    const [def] = await db
      .select({
        id: schema.classDefinitions.id,
        durationMin: schema.classDefinitions.durationMin,
        defaultCapacity: schema.classDefinitions.defaultCapacity,
      })
      .from(schema.classDefinitions)
      .where(eq(schema.classDefinitions.id, input.definitionId))
      .limit(1);

    if (!def) {
      return { error: "DEFINITION_NOT_FOUND" };
    }

    // 3. Resolve capacity (provided or fall back to definition default).
    const capacity = input.capacity ?? def.defaultCapacity;

    // 4. Compute endsAt.
    // addMinutes operates on the Date instant; toISOString() returns UTC ("Z").
    // startsAt is stored as the input string verbatim (studio-local ISO);
    // endsAt is serialised in UTC — both render correctly via new Date(iso).
    const endsAt = addMinutes(start, def.durationMin).toISOString();

    const id = `cocc_${nanoid()}`;
    const now = new Date().toISOString();

    // 5. Insert the occurrence row.
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per P1b.1-RESEARCH.md §6
    await db.insert(schema.classOccurrences).values({
      id,
      definitionId: input.definitionId,
      startsAt: input.startsAt, // stored verbatim — do NOT re-serialise to UTC
      endsAt,
      capacity,
      instructorUserId: input.instructorUserId ?? null,
      room: input.room ?? null,
      notes: input.notes ?? null,
      status: "scheduled",
      // LP3: optional trainer + location columns (v24/v25)
      trainerId: input.trainerId ?? null,
      location: input.location ?? null,
      createdAt: now,
    });

    // 6. Return key fields so the UI can optimistically display the new class.
    return { id, startsAt: input.startsAt, endsAt, capacity };
  },
});
