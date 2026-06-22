// update-schedule-rule — MPV Phase 2
//
// Partial patch on a schedule rule's mutable fields.
// Identity fields (definition_id, days_of_week, starts_on) cannot be changed —
// those are the series identity. To change them, deactivate the rule and create a new one.
//
// Mutable fields: timeOfDay, location, capacity, trainerId, endsOn.
//
// Returns {updated: true} | {updated: false, reason} | {error: 'RULE_NOT_FOUND'}

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

type RulePatch = Partial<
  Pick<
    InferInsertModel<typeof schema.classScheduleRules>,
    "timeOfDay" | "location" | "capacity" | "trainerId" | "endsOn"
  >
>;

export default defineAction({
  description:
    "Partial patch on a class schedule rule's mutable fields (timeOfDay, location, capacity, trainerId, endsOn). " +
    "Identity fields (definitionId, daysOfWeek, startsOn) cannot be changed — create a new rule instead. " +
    "Returns {updated:true} | {updated:false, reason} | {error:'RULE_NOT_FOUND'}.",
  schema: z.object({
    id: z.string().min(1).describe("Schedule rule id"),
    timeOfDay: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
      .optional(),
    location: z.string().max(120).nullable().optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    trainerId: z.string().nullable().optional(),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .nullable()
      .optional(),
  }),
  run: async (input) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables
    const [rule] = await db
      .select({ id: schema.classScheduleRules.id })
      .from(schema.classScheduleRules)
      .where(eq(schema.classScheduleRules.id, input.id))
      .limit(1);

    if (!rule) {
      return { error: "RULE_NOT_FOUND" };
    }

    // Build the patch — only supplied fields.
    const patch: RulePatch = {};
    if (input.timeOfDay !== undefined) patch.timeOfDay = input.timeOfDay;
    if (input.location !== undefined) patch.location = input.location;
    if (input.capacity !== undefined) patch.capacity = input.capacity;
    if (input.trainerId !== undefined) patch.trainerId = input.trainerId;
    if (input.endsOn !== undefined) patch.endsOn = input.endsOn;

    if (Object.keys(patch).length === 0) {
      return { updated: false, reason: "no changes" };
    }

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classScheduleRules)
      .set(patch)
      .where(eq(schema.classScheduleRules.id, input.id));

    return { updated: true };
  },
});
