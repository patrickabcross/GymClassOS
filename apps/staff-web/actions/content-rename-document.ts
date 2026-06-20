// content-rename-document — CV2-01
//
// Rename a content document. Updates title, recomputes slug, and sets updatedAt.
// Thin but intentional — gives the agent and the inline rename UI a clear verb
// separate from the full update-document action.
//
// Agent-callable mutation: no `http` key (POST via action endpoint).
// DIRECT — no propose-action gate.
//
// Two-exposure: action file (auto-registered) + agent-chat.ts Content section
// + AGENTS.md table.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { eq } from "drizzle-orm";
import { slugify } from "../server/lib/content-slug.js";

export default defineAction({
  description:
    "Rename a content document ({id, title}). " +
    "Updates the title, recomputes the slug, and sets updatedAt. " +
    "Returns {error:'NOT_FOUND'} if the document does not exist. " +
    "Returns {renamed:true, title, slug} on success.",
  schema: z.object({
    id: z.string().min(1).describe("Content document id"),
    title: z.string().min(1).max(500).describe("New document title"),
  }),

  run: async ({ id, title }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant content
    const [doc] = await db
      .select({ id: schema.contentDocuments.id })
      .from(schema.contentDocuments)
      .where(eq(schema.contentDocuments.id, id))
      .limit(1);

    if (!doc) return { error: "NOT_FOUND" };

    const slug = slugify(title) || id;
    const updatedAt = new Date().toISOString();

    // guard:allow-unscoped — single-tenant content
    await db
      .update(schema.contentDocuments)
      .set({ title, slug, updatedAt })
      .where(eq(schema.contentDocuments.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { renamed: true, title, slug };
  },
});
