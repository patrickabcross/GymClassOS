// list-pass-types — C47
//
// Returns the full pass-type catalog (active + inactive) for the staff
// catalog UI, plus a derived pick-list of existing class categories.
//
// Staff catalog UI actions are NOT agent-facing LLM tools. This action is
// UI-only (GET over HTTP). Do NOT add to agent-chat.ts tool list.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { isNotNull, asc } from "drizzle-orm";

export default defineAction({
  description:
    "List all pass types (active and inactive) in the studio catalog, " +
    "plus the distinct class categories derived from class_definitions. " +
    "Staff catalog UI action — NOT an agent LLM tool.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables
    const rawPassTypes = await db
      .select({
        id: schema.passTypes.id,
        name: schema.passTypes.name,
        credits: schema.passTypes.credits,
        pricePennies: schema.passTypes.pricePennies,
        stripePriceId: schema.passTypes.stripePriceId,
        validityDays: schema.passTypes.validityDays,
        allCategories: schema.passTypes.allCategories,
        allowedCategories: schema.passTypes.allowedCategories,
        active: schema.passTypes.active,
        createdAt: schema.passTypes.createdAt,
      })
      .from(schema.passTypes)
      .orderBy(schema.passTypes.name);

    const passTypes = rawPassTypes.map((r) => ({
      id: r.id,
      name: r.name,
      credits: r.credits !== null ? Number(r.credits) : null,
      pricePennies: r.pricePennies !== null ? Number(r.pricePennies) : null,
      stripePriceId: r.stripePriceId ?? null,
      validityDays: r.validityDays !== null ? Number(r.validityDays) : null,
      allCategories: Boolean(r.allCategories),
      allowedCategories: (() => {
        try {
          const parsed = JSON.parse(r.allowedCategories ?? "[]");
          return Array.isArray(parsed) ? (parsed as string[]) : [];
        } catch {
          return [] as string[];
        }
      })(),
      active: Boolean(r.active),
      createdAt: r.createdAt,
    }));

    // Derive the category pick-list from existing class_definitions.
    // guard:allow-unscoped — single-tenant gym tables
    const categoryRows = await db
      .selectDistinct({ category: schema.classDefinitions.category })
      .from(schema.classDefinitions)
      .where(isNotNull(schema.classDefinitions.category))
      .orderBy(asc(schema.classDefinitions.category));

    const categories = categoryRows
      .map((r) => r.category as string)
      .filter(Boolean)
      .sort();

    return { passTypes, categories };
  },
});
