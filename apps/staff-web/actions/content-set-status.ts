// content-set-status.ts — CV4-01
//
// Toggle a content document's status between 'draft' and 'published'.
// DIRECT — no propose-action gate.
//
// On publish (status==='published'):
//   - If doc.slug is null/empty, assigns slug = slugify(doc.title) || doc.id
//     so the public URL /c/{slug} resolves immediately.
//   - Exposes the document to members via /api/m/content and the public via /c/{slug}.
// On unpublish (status==='draft'):
//   - Leaves slug intact (URL stays stable if re-published).
//   - Removes from all member-facing / public surfaces immediately.
//
// Two-exposure: action file (auto-registered) + agent-chat.ts Content tab section
// + AGENTS.md table.
//
// No `http` key — POST-only mutation via action endpoint.
// guard:allow-unscoped — single-tenant content

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { eq } from "drizzle-orm";
import { slugify } from "../server/lib/content-slug.js";

export default defineAction({
  description:
    "DIRECT — no approval gate. Toggle a content document's publish status between 'draft' and 'published'. " +
    "Publishing makes the document live at /c/{slug} and exposes it to members via /api/m/content. " +
    "The slug is auto-assigned from the title (or the document id if the title is empty) on first publish — " +
    "an existing slug is never overwritten (URL stays stable across publish/unpublish cycles). " +
    "Unpublishing reverts to 'draft' and removes the document from all member-facing/public surfaces immediately. " +
    "Confirm intent before publishing — a published document is accessible to the public. " +
    "Only published items reach members. " +
    "Returns { updated: true, status, slug } or { error: 'NOT_FOUND' }.",
  schema: z.object({
    id: z.string().min(1).describe("Content document id"),
    status: z
      .enum(["draft", "published"])
      .describe("Target status: 'published' to go live, 'draft' to take offline"),
  }),

  run: async ({ id, status }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant content
    const [doc] = await db
      .select()
      .from(schema.contentDocuments)
      .where(eq(schema.contentDocuments.id, id))
      .limit(1);

    if (!doc) return { error: "NOT_FOUND" };

    const updates: Partial<typeof schema.contentDocuments.$inferInsert> = {};
    updates.status = status;

    // On publish: assign slug if missing so /c/{slug} resolves
    if (status === "published") {
      const existing = doc.slug?.trim();
      if (!existing) {
        updates.slug = slugify(doc.title) || doc.id;
      }
      // If slug already set, leave it intact (stable URL)
    }
    // On unpublish: leave slug intact (URL stays stable on re-publish)

    updates.updatedAt = new Date().toISOString();

    // guard:allow-unscoped — single-tenant content
    await db
      .update(schema.contentDocuments)
      .set(updates)
      .where(eq(schema.contentDocuments.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return {
      updated: true,
      status,
      slug: updates.slug ?? doc.slug ?? null,
    };
  },
});
