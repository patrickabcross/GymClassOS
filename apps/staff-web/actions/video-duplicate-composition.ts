// video-duplicate-composition — CV3-01
//
// Duplicate an existing video composition as a new draft titled "{source} (Copy)".
// The copy is ALWAYS 'draft' regardless of source status. spec is copied verbatim.
// Accepts an optional client-generated newId for optimistic UI.
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
import { nanoid } from "nanoid";
import { slugify } from "../server/lib/content-slug.js";

export default defineAction({
  description:
    "Duplicate a video composition as a new draft. " +
    "The copy gets the title '{source title} (Copy)', status 'draft' (never copies published state), " +
    "spec is copied verbatim, and a fresh id + timestamps. " +
    "An optional newId can be supplied for optimistic UI. " +
    "Returns {error:'NOT_FOUND'} if the source composition does not exist. " +
    "Returns {id, title, status, slug} on success.",
  schema: z.object({
    id: z.string().min(1).describe("Source video composition id"),
    newId: z.string().optional().describe("Pre-generated id for optimistic UI"),
  }),

  run: async ({ id, newId }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant video
    const [source] = await db
      .select()
      .from(schema.videoCompositions)
      .where(eq(schema.videoCompositions.id, id))
      .limit(1);

    if (!source) return { error: "NOT_FOUND" };

    const copyId = newId ?? nanoid();
    const title = `${source.title} (Copy)`;
    const slug = slugify(title) || copyId;
    const now = new Date().toISOString();

    // guard:allow-unscoped — single-tenant video
    await db.insert(schema.videoCompositions).values({
      id: copyId,
      title,
      spec: source.spec, // verbatim copy
      status: "draft",
      slug,
      createdAt: now,
      updatedAt: now,
    });

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { id: copyId, title, status: "draft", slug };
  },
});
