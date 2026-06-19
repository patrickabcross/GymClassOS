// GOB-03: Owner edit of brand-voice or ethos doc body.
//
// The .strict() schema structurally limits editable docs to brand-voice and
// ethos. The class-catalog doc (auto-seeded from class_definitions) cannot
// be edited via this action. Only the body field changes — docType, title,
// and seededAt are never touched by this action.
//
// guard:allow-unscoped — studio-global single-tenant Brain (no ownableColumns)

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Update the body of a studio Brain document. Only 'brand-voice' and 'ethos' " +
    "docs can be edited. Returns { updated: true, id } on success.",
  schema: z
    .object({
      id: z.enum(["brand-voice", "ethos"]).describe(
        "Which Brain doc to update. Only brand-voice and ethos are editable.",
      ),
      body: z
        .string()
        .max(20000)
        .describe("The new body content (Markdown). Max 20 000 characters."),
    })
    .strict(),
  // No http key → mutation (POST-only auto-mount)
  run: async ({ id, body }) => {
    const db = getDb();
    const nowIso = new Date().toISOString();

    // guard:allow-unscoped — studio-global single-tenant Brain
    await db
      .update(schema.studioBrainDocs)
      .set({ body, updatedAt: nowIso })
      .where(eq(schema.studioBrainDocs.id, id));

    return { updated: true, id };
  },
});
