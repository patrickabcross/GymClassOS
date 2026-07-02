// create-pass-type — C47
//
// Create a new pass type in the studio catalog.
// UI-callable (http: POST) — the catalog UI is the primary consumer.
// NOT an agent LLM tool; do NOT add to agent-chat.ts.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Create a new pass type in the studio catalog. " +
    "Returns { id, name }. " +
    "Staff catalog UI action — NOT an agent LLM tool.",
  schema: z.object({
    name: z.string().min(1).max(120),
    /** null / omit = unlimited credits (no per-booking cap) */
    credits: z.number().int().min(1).optional(),
    /** price in pence; null / omit = not for sale / manual grant only */
    pricePennies: z.number().int().min(0).optional(),
    /** Stripe Price ID on the connected account — for later Stripe linking */
    stripePriceId: z.string().optional(),
    /** validity window in days; null / omit = never expires */
    validityDays: z.number().int().min(1).optional(),
    /** true = books any class category; overrides allowedCategories */
    allCategories: z.boolean().optional().default(false),
    /** array of category strings this pass allows (ignored when allCategories is true) */
    allowedCategories: z.array(z.string().min(1)).optional().default([]),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const db = getDb();
    const id = `ptype_${nanoid()}`;
    const now = new Date().toISOString();

    // guard:allow-unscoped — single-tenant gym tables
    await db.insert(schema.passTypes).values({
      id,
      name: input.name,
      credits: input.credits ?? null,
      pricePennies: input.pricePennies ?? null,
      stripePriceId: input.stripePriceId ?? null,
      validityDays: input.validityDays ?? null,
      allCategories: input.allCategories ?? false,
      allowedCategories: JSON.stringify(input.allowedCategories ?? []),
      active: true,
      createdAt: now,
    });

    return { id, name: input.name };
  },
});
