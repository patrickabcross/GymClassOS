// video-set-status.ts — CV4-01
//
// Toggle a video composition's status between 'draft' and 'published'.
// DIRECT — no propose-action gate.
//
// On publish (status==='published'):
//   - If composition.slug is null/empty, assigns slug = slugify(composition.title) || composition.id
//     so the public URL /v/{slug} resolves immediately.
//   - Exposes the composition to the public via /v/{slug}.
// On unpublish (status==='draft'):
//   - Leaves slug intact (URL stays stable if re-published).
//   - Removes from the public surface immediately.
//
// Status toggle is INDEPENDENT of spec validity — the spec is not parsed here.
//
// Two-exposure: action file (auto-registered) + agent-chat.ts Video tab section
// + AGENTS.md table.
//
// No `http` key — POST-only mutation via action endpoint.
// guard:allow-unscoped — single-tenant video

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { eq } from "drizzle-orm";
import { slugify } from "../server/lib/content-slug.js";

export default defineAction({
  description:
    "DIRECT — no approval gate. Toggle a video composition's publish status between 'draft' and 'published'. " +
    "Publishing makes the composition live at /v/{slug} (public SSR page with poster + Watch caption). " +
    "The slug is auto-assigned from the title (or the composition id if the title is empty) on first publish — " +
    "an existing slug is never overwritten (URL stays stable across publish/unpublish cycles). " +
    "Unpublishing reverts to 'draft' and removes the composition from all public surfaces immediately. " +
    "Confirm intent before publishing — a published composition is accessible to the public. " +
    "Returns { updated: true, status, slug } or { error: 'NOT_FOUND' }.",
  schema: z.object({
    id: z.string().min(1).describe("Video composition id"),
    status: z
      .enum(["draft", "published"])
      .describe("Target status: 'published' to go live, 'draft' to take offline"),
  }),

  run: async ({ id, status }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant video
    const [composition] = await db
      .select()
      .from(schema.videoCompositions)
      .where(eq(schema.videoCompositions.id, id))
      .limit(1);

    if (!composition) return { error: "NOT_FOUND" };

    const updates: Partial<typeof schema.videoCompositions.$inferInsert> = {};
    updates.status = status;

    // On publish: assign slug if missing so /v/{slug} resolves
    if (status === "published") {
      const existing = composition.slug?.trim();
      if (!existing) {
        updates.slug = slugify(composition.title) || composition.id;
      }
      // If slug already set, leave it intact (stable URL)
    }
    // On unpublish: leave slug intact (URL stays stable on re-publish)

    updates.updatedAt = new Date().toISOString();

    // guard:allow-unscoped — single-tenant video
    await db
      .update(schema.videoCompositions)
      .set(updates)
      .where(eq(schema.videoCompositions.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return {
      updated: true,
      status,
      slug: updates.slug ?? composition.slug ?? null,
    };
  },
});
