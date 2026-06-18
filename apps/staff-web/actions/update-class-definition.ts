// update-class-definition — AES-05
//
// Edit a class definition's name, duration, default capacity, or category.
// Only the supplied fields are written; the action NEVER touches the active
// flag, instructor, or description. An empty patch is a no-op success.
//
// Agent-only mutation: no `http` key (write actions are agent-only per
// apps/staff-web/AGENTS.md "Adding a New Gym Action" step 2).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Edit a class definition's name, duration, default capacity, or category. " +
    "Only the supplied fields change; never touches the active flag, instructor, or description. " +
    "Returns {updated:true} or {updated:false, reason} or {error}.",
  schema: z.object({
    definitionId: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
    defaultCapacity: z.number().int().min(1).max(500).optional(),
    category: z.string().min(1).max(60).optional(),
  }),
  run: async ({
    definitionId,
    name,
    durationMin,
    defaultCapacity,
    category,
  }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables
    const [def] = await db
      .select({ id: schema.classDefinitions.id })
      .from(schema.classDefinitions)
      .where(eq(schema.classDefinitions.id, definitionId))
      .limit(1);
    if (!def) return { error: "DEFINITION_NOT_FOUND" };

    const updates: Partial<typeof schema.classDefinitions.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (durationMin !== undefined) updates.durationMin = durationMin;
    if (defaultCapacity !== undefined)
      updates.defaultCapacity = defaultCapacity;
    if (category !== undefined) updates.category = category;
    if (Object.keys(updates).length === 0)
      return { updated: false, reason: "no changes" };

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classDefinitions)
      .set(updates)
      .where(eq(schema.classDefinitions.id, definitionId));
    return { updated: true };
  },
});
