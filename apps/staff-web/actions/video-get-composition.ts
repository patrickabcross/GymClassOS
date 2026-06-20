// video-get-composition — CV3-01
//
// Fetch a single video_compositions row by id, including the full spec JSON string.
// Used by the editor route on mount and by the agent before editing scene copy.
//
// Read action: http: { method: "GET" }, readOnly: true.
// guard:allow-unscoped — single-tenant video (no ownableColumns).
//
// Two-exposure: defined here (auto-registered) AND named in agent-chat.ts
// Video tab section AND documented in apps/staff-web/AGENTS.md.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Fetch a single video composition's full spec JSON by id. " +
    "Returns {id, title, spec, status, slug, createdAt, updatedAt}. " +
    "spec is a JSON string representing the complete VideoSpec object " +
    "(format/fps/durationInFrames/scenes). " +
    "Returns {error: 'NOT_FOUND'} if the composition does not exist. " +
    "Use this before editing scene copy — read the current spec, modify scenes, " +
    "then call video-update-composition with the complete new spec object.",
  schema: z.object({
    id: z.string().min(1).describe("Video composition id"),
  }),
  http: { method: "GET" },
  readOnly: true,

  run: async ({ id }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant video
    const [row] = await db
      .select()
      .from(schema.videoCompositions)
      .where(eq(schema.videoCompositions.id, id))
      .limit(1);

    if (!row) return { error: "NOT_FOUND" };

    return {
      id: row.id,
      title: row.title,
      spec: row.spec,
      status: row.status,
      slug: row.slug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});
