// video-rename-composition — CV3-01
//
// Rename a video composition. Updates title, recomputes slug, sets updatedAt.
// Thin verb (mirrors content-rename-document) — gives the agent and the inline
// rename UI a clear rename path separate from the full update action.
//
// Agent-callable mutation: no `http` key (POST via action endpoint).
// DIRECT — no propose-action gate.
//
// Two-exposure: action file (auto-registered) + agent-chat.ts Video section
// + AGENTS.md table.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { eq } from "drizzle-orm";
import { slugify } from "../server/lib/content-slug.js";

export default defineAction({
  description:
    "Rename a video composition ({id, title}). " +
    "Updates the title, recomputes the slug, and sets updatedAt. " +
    "Returns {error:'NOT_FOUND'} if the composition does not exist. " +
    "Returns {renamed:true, title, slug} on success.",
  schema: z.object({
    id: z.string().min(1).describe("Video composition id"),
    title: z.string().min(1).max(500).describe("New composition title"),
  }),

  run: async ({ id, title }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant video
    const [row] = await db
      .select({ id: schema.videoCompositions.id })
      .from(schema.videoCompositions)
      .where(eq(schema.videoCompositions.id, id))
      .limit(1);

    if (!row) return { error: "NOT_FOUND" };

    const slug = slugify(title) || id;
    const updatedAt = new Date().toISOString();

    // guard:allow-unscoped — single-tenant video
    await db
      .update(schema.videoCompositions)
      .set({ title, slug, updatedAt })
      .where(eq(schema.videoCompositions.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { renamed: true, title, slug };
  },
});
