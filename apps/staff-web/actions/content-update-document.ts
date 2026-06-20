// content-update-document — CV2-01
//
// Update a content document's title and/or body. Only the supplied fields change.
// If title changes, the slug is recomputed from the new title. An empty patch
// (no fields changing) returns {updated: false, reason: "no changes"}.
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
    "Update a content document's title and/or body. Only supplied fields change. " +
    "body is the COMPLETE Tiptap HTML body (replaces, not merges — pass the full new body). " +
    "If title changes, the slug is recomputed automatically. " +
    "An empty patch (nothing changes) returns {updated:false, reason:'no changes'}. " +
    "Returns {error:'NOT_FOUND'} if the document does not exist. " +
    "Use for: 'rewrite the intro paragraph to be more energetic', " +
    "'update the body of this document with the new class schedule'. " +
    "Pass the COMPLETE new body HTML — this replaces the existing body, it does not merge.",
  schema: z.object({
    id: z.string().min(1).describe("Content document id"),
    title: z.string().max(500).optional().describe("New document title"),
    body: z.string().optional().describe("Complete new Tiptap HTML body (replaces existing)"),
  }),

  run: async ({ id, title, body }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant content
    const [doc] = await db
      .select()
      .from(schema.contentDocuments)
      .where(eq(schema.contentDocuments.id, id))
      .limit(1);

    if (!doc) return { error: "NOT_FOUND" };

    const updates: Partial<typeof schema.contentDocuments.$inferInsert> = {};

    if (title !== undefined && title !== doc.title) {
      updates.title = title;
      updates.slug = slugify(title) || id;
    }
    if (body !== undefined && body !== doc.body) {
      updates.body = body;
    }

    if (Object.keys(updates).length === 0) {
      return { updated: false, reason: "no changes" };
    }

    updates.updatedAt = new Date().toISOString();

    // guard:allow-unscoped — single-tenant content
    await db
      .update(schema.contentDocuments)
      .set(updates)
      .where(eq(schema.contentDocuments.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { updated: true };
  },
});
