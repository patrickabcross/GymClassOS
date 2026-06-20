// video-list-compositions — CV3-01
//
// List all video_compositions metadata ordered by most recently updated.
// Does NOT return the full spec — derive minimal poster data (format, sceneCount,
// posterText, posterColor) on the server so list cards can render a CSS poster.
//
// Read action: http: { method: "GET" }, readOnly: true.
// guard:allow-unscoped — single-tenant video (no ownableColumns).
//
// Two-exposure: defined here (auto-registered) AND named in agent-chat.ts
// Video tab section AND documented in apps/staff-web/AGENTS.md.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { desc } from "drizzle-orm";
import { parseSpec, defaultSpec } from "../server/lib/video-spec.js";

export default defineAction({
  description:
    "List all studio video compositions (id, title, status, slug, updatedAt, format, " +
    "sceneCount, posterText, posterColor). Does NOT return the full spec — use " +
    "video-get-composition to fetch the complete spec. " +
    "Ordered by most recently updated first. " +
    "Returns {compositions: [{id, title, status, slug, updatedAt, createdAt, format, sceneCount, posterText, posterColor}]}.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,

  run: async () => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant video
    const rows = await db
      .select({
        id: schema.videoCompositions.id,
        title: schema.videoCompositions.title,
        status: schema.videoCompositions.status,
        slug: schema.videoCompositions.slug,
        spec: schema.videoCompositions.spec,
        updatedAt: schema.videoCompositions.updatedAt,
        createdAt: schema.videoCompositions.createdAt,
      })
      .from(schema.videoCompositions)
      .orderBy(desc(schema.videoCompositions.updatedAt));

    const compositions = rows.map((r) => {
      let format: string = "square";
      let sceneCount = 0;
      let posterText = r.title || "Untitled";
      let posterColor = "#0F172A";

      try {
        const spec = parseSpec(r.spec);
        format = spec.format;
        sceneCount = spec.scenes.length;
        if (spec.scenes.length > 0) {
          posterText = spec.scenes[0].text;
          if (spec.scenes[0].bgColor) posterColor = spec.scenes[0].bgColor;
        }
      } catch {
        const def = defaultSpec();
        format = def.format;
        sceneCount = def.scenes.length;
      }

      return {
        id: r.id,
        title: r.title,
        status: r.status,
        slug: r.slug,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        format,
        sceneCount,
        posterText,
        posterColor,
      };
    });

    return { compositions };
  },
});
