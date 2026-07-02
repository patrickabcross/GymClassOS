// update-pass-type — C47
//
// Edit or deactivate an existing pass type. Partial patch — only supplied
// fields are written. active:false deactivates (no hard delete).
// UI-callable (http: POST) — the catalog UI is the primary consumer.
// NOT an agent LLM tool; do NOT add to agent-chat.ts.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Edit or deactivate an existing pass type. Partial patch — only supplied fields change. " +
    "active:false deactivates (no hard delete). Returns {updated:true}, {updated:false, reason}, or {error}. " +
    "Staff catalog UI action — NOT an agent LLM tool.",
  schema: z.object({
    passTypeId: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    credits: z.number().int().min(1).nullable().optional(),
    pricePennies: z.number().int().min(0).nullable().optional(),
    stripePriceId: z.string().nullable().optional(),
    validityDays: z.number().int().min(1).nullable().optional(),
    allCategories: z.boolean().optional(),
    allowedCategories: z.array(z.string().min(1)).optional(),
    active: z.boolean().optional(),
  }),
  http: { method: "POST" },
  run: async ({
    passTypeId,
    name,
    credits,
    pricePennies,
    stripePriceId,
    validityDays,
    allCategories,
    allowedCategories,
    active,
  }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables
    const [existing] = await db
      .select({ id: schema.passTypes.id })
      .from(schema.passTypes)
      .where(eq(schema.passTypes.id, passTypeId))
      .limit(1);
    if (!existing) return { error: "PASS_TYPE_NOT_FOUND" };

    const updates: Partial<typeof schema.passTypes.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (credits !== undefined) updates.credits = credits;
    if (pricePennies !== undefined) updates.pricePennies = pricePennies;
    if (stripePriceId !== undefined) updates.stripePriceId = stripePriceId;
    if (validityDays !== undefined) updates.validityDays = validityDays;
    if (allCategories !== undefined) updates.allCategories = allCategories;
    if (allowedCategories !== undefined)
      updates.allowedCategories = JSON.stringify(allowedCategories);
    if (active !== undefined) updates.active = active;

    if (Object.keys(updates).length === 0)
      return { updated: false, reason: "no changes" };

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.passTypes)
      .set(updates)
      .where(eq(schema.passTypes.id, passTypeId));

    return { updated: true };
  },
});
