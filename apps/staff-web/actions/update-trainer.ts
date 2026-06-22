// update-trainer — LP3
//
// Edit a trainer's name, home location, or active status. No hard delete —
// use active:false to deactivate. An empty patch is a safe no-op.
//
// If a name change would collide with another trainer's lower(name), returns
// {error:"NAME_IN_USE"} and makes no change.
//
// Two-exposed: action file + agent-chat.ts Schedule section + AGENTS.md table.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { sql, eq, and, ne } from "drizzle-orm";

export default defineAction({
  description:
    "Edit a trainer's name, home location, or deactivate them ({id, name?, homeLocation?, active?}). " +
    "active:false deactivates — no hard delete exists. " +
    "Returns {updated:true} | {updated:false, reason} | {error:'TRAINER_NOT_FOUND'|'NAME_IN_USE'}.",
  schema: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    homeLocation: z.string().max(120).optional(),
    active: z.boolean().optional(),
  }),
  run: async ({ id, name, homeLocation, active }) => {
    const db = getDb();

    // Resolve the trainer by id.
    // guard:allow-unscoped — single-tenant gym tables
    const [trainer] = await db
      .select({ id: schema.trainers.id, name: schema.trainers.name })
      .from(schema.trainers)
      .where(eq(schema.trainers.id, id))
      .limit(1);

    if (!trainer) return { error: "TRAINER_NOT_FOUND" };

    // If renaming, check for lower(name) collision with a DIFFERENT trainer.
    if (name !== undefined) {
      // guard:allow-unscoped — single-tenant gym tables
      const [collision] = await db
        .select({ id: schema.trainers.id })
        .from(schema.trainers)
        .where(
          and(
            sql`lower(${schema.trainers.name}) = lower(${name})`,
            ne(schema.trainers.id, id),
          ),
        )
        .limit(1);
      if (collision) return { error: "NAME_IN_USE" };
    }

    // Build partial update object from supplied fields only.
    const updates: Partial<typeof schema.trainers.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (homeLocation !== undefined) updates.homeLocation = homeLocation;
    if (active !== undefined) updates.active = active;

    if (Object.keys(updates).length === 0)
      return { updated: false, reason: "no changes" };

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.trainers)
      .set(updates)
      .where(eq(schema.trainers.id, id));

    return { updated: true };
  },
});
