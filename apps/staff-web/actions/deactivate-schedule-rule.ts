// deactivate-schedule-rule — MPV Phase 2
//
// Marks a class schedule rule as inactive (active = false / 0).
// The rule row is preserved for history; future materialiser runs will skip it.
// Already-generated future occurrences are NOT deleted — each occurrence retains
// its own lifecycle (booked/scheduled/cancelled). If the operator wants to cancel
// upcoming generated occurrences too, they must do so through cancel-class-occurrence.
//
// Returns {deactivated: true} | {error: 'RULE_NOT_FOUND'} | {error: 'RULE_ALREADY_INACTIVE'}

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Deactivate a class schedule rule so the nightly materialiser stops generating future occurrences for it. " +
    "The rule row is preserved for history; existing occurrences are not affected. " +
    "Returns {deactivated:true} | {error:'RULE_NOT_FOUND'} | {error:'RULE_ALREADY_INACTIVE'}.",
  schema: z.object({
    id: z.string().min(1).describe("Schedule rule id"),
  }),
  run: async (input) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables
    const [rule] = await db
      .select({
        id: schema.classScheduleRules.id,
        active: schema.classScheduleRules.active,
      })
      .from(schema.classScheduleRules)
      .where(eq(schema.classScheduleRules.id, input.id))
      .limit(1);

    if (!rule) {
      return { error: "RULE_NOT_FOUND" };
    }

    if (!rule.active) {
      return { error: "RULE_ALREADY_INACTIVE" };
    }

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classScheduleRules)
      .set({ active: false })
      .where(eq(schema.classScheduleRules.id, input.id));

    return { deactivated: true };
  },
});
