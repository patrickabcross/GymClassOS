// create-class-definition — AES-04
//
// Creates a new class type (definition) in the gym catalog.
// Does NOT schedule an occurrence — pair with create-class-occurrence.
//
// This is the single source of truth for creating a class_definitions row.
// The UI calls this first when staff pick "New class type" in the schedule
// dialog; v1.2 Phase AE2 will expose this as an agent tool by adding a
// system-prompt bullet in agent-chat.ts.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Create a new class type (definition) in the gym catalog. Returns { id, name }. " +
    "Does NOT schedule an occurrence — pair with create-class-occurrence.",
  schema: z.object({
    name: z.string().min(1).max(120),
    durationMin: z.number().int().min(5).max(480),
    defaultCapacity: z.number().int().min(1).max(500).optional().default(12),
    category: z.string().min(1).max(60).optional(),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const db = getDb();
    const id = `cdef_${nanoid()}`;
    const now = new Date().toISOString();

    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per P1b.1-RESEARCH.md §6
    await db.insert(schema.classDefinitions).values({
      id,
      name: input.name,
      durationMin: input.durationMin,
      defaultCapacity: input.defaultCapacity,
      category: input.category ?? null,
      active: true,
      createdAt: now,
    });

    return { id, name: input.name };
  },
});
