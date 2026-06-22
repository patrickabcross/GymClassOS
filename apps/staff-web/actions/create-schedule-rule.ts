// create-schedule-rule — MPV Phase 2
//
// Creates a recurring class schedule rule and immediately generates the first
// 8-week window of occurrences so the schedule UI shows them without waiting
// for the next cron run.
//
// Params:
//   definitionId (required) — must exist and be active
//   daysOfWeek   (required) — array of weekday numbers 0-6 (0=Sun)
//   timeOfDay    (required) — "HH:MM" in Europe/London studio-local time
//   location     (optional) — "Norwich" | "Wymondham"
//   capacity     (optional) — defaults to definition.defaultCapacity
//   trainerId    (optional) — soft-ref to trainers.id
//   startsOn     (required) — ISO date "YYYY-MM-DD"
//   endsOn       (optional) — ISO date "YYYY-MM-DD"; null = open-ended
//
// Returns { id, definitionId, daysOfWeek, timeOfDay, startsOn }

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import {
  generateOccurrences,
  type ScheduleRule,
} from "../server/lib/recurrence-generator.js";

const WINDOW_DAYS = 56; // 8 weeks

function windowEndDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

function addMinutesToIso(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

export default defineAction({
  description:
    "Create a recurring class schedule rule (weekly repeat). " +
    "Stores the rule and immediately generates the first 8-week window of occurrences. " +
    "daysOfWeek is an array of weekday numbers (0=Sun … 6=Sat). " +
    "timeOfDay is 'HH:MM' in Europe/London studio-local time (BST/GMT auto-corrected). " +
    "Returns {id, definitionId, daysOfWeek, timeOfDay, startsOn}.",
  schema: z.object({
    definitionId: z.string().min(1),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .describe("Weekday numbers: 0=Sun, 1=Mon, … 6=Sat"),
    timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
    location: z.string().max(120).optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    trainerId: z.string().optional(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .optional(),
  }),
  run: async (input) => {
    const db = getDb();

    // 1. Validate definition exists and is active.
    // guard:allow-unscoped — single-tenant gym tables
    const [def] = await db
      .select({
        id: schema.classDefinitions.id,
        durationMin: schema.classDefinitions.durationMin,
        defaultCapacity: schema.classDefinitions.defaultCapacity,
        active: schema.classDefinitions.active,
      })
      .from(schema.classDefinitions)
      .where(eq(schema.classDefinitions.id, input.definitionId))
      .limit(1);

    if (!def) {
      return { error: "DEFINITION_NOT_FOUND" };
    }

    const capacity = input.capacity ?? def.defaultCapacity;
    const ruleId = `rule_${nanoid(12)}`;
    const now = new Date().toISOString();

    // 2. Insert the rule.
    // guard:allow-unscoped — single-tenant gym tables
    await db.insert(schema.classScheduleRules).values({
      id: ruleId,
      definitionId: input.definitionId,
      daysOfWeek: JSON.stringify(input.daysOfWeek),
      timeOfDay: input.timeOfDay,
      location: input.location ?? null,
      capacity,
      trainerId: input.trainerId ?? null,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      active: true,
      generatedThrough: null,
      createdAt: now,
    });

    // 3. Immediately generate the first 8-week window so occurrences are visible.
    const stubRule: ScheduleRule = {
      id: ruleId,
      definitionId: input.definitionId,
      daysOfWeek: JSON.stringify(input.daysOfWeek),
      timeOfDay: input.timeOfDay,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      generatedThrough: null,
      active: 1,
      capacity,
      location: input.location ?? null,
      trainerId: input.trainerId ?? null,
    };

    const occurrences = generateOccurrences(stubRule, windowEndDate());
    let lastDate: string | null = null;

    for (const occ of occurrences) {
      const occId = `cocc_${nanoid(12)}`;
      const endsAt = addMinutesToIso(occ.startsAtUtc, def.durationMin);

      // guard:allow-unscoped — single-tenant gym tables
      // onConflictDoNothing() is backed by the partial unique index
      // idx_class_occurrences_rule_starts (rule_id, starts_at WHERE rule_id IS NOT NULL)
      await db
        .insert(schema.classOccurrences)
        .values({
          id: occId,
          definitionId: input.definitionId,
          ruleId,
          startsAt: occ.startsAtUtc,
          endsAt,
          capacity,
          location: input.location ?? null,
          trainerId: input.trainerId ?? null,
          status: "scheduled",
          createdAt: now,
        })
        .onConflictDoNothing();

      lastDate = occ.startsAtUtc.slice(0, 10);
    }

    // 4. Advance generated_through.
    if (lastDate) {
      // guard:allow-unscoped — single-tenant gym tables
      await db
        .update(schema.classScheduleRules)
        .set({ generatedThrough: lastDate })
        .where(eq(schema.classScheduleRules.id, ruleId));
    }

    return {
      id: ruleId,
      definitionId: input.definitionId,
      daysOfWeek: input.daysOfWeek,
      timeOfDay: input.timeOfDay,
      startsOn: input.startsOn,
      occurrencesGenerated: occurrences.length,
    };
  },
});
