// video-update-composition — CV3-01
//
// Update a video composition's title and/or spec (COMPLETE replacement, not merge).
// If spec is supplied → VideoSpecSchema.safeParse validation; on failure return
// { error: "INVALID_SPEC", issues } and DO NOT write (malformed spec rejection
// must-have from CV3-01 plan).
// On valid spec: run recomputeDuration then persist JSON.stringify.
// If title changes: recompute slug.
// Empty patch → { updated: false, reason: "no changes" }.
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
import {
  VideoSpecSchema,
  recomputeDuration,
} from "../server/lib/video-spec.js";

export default defineAction({
  description:
    "Update a video composition's title and/or spec. " +
    "spec is the COMPLETE new VideoSpec object (replaces, not merges — pass the full " +
    "scenes array). The spec is validated by VideoSpecSchema before persisting — " +
    "malformed specs are rejected with {error:'INVALID_SPEC', issues} and never written. " +
    "durationInFrames is recomputed server-side from scene durations. " +
    "If title changes, slug is recomputed. An empty patch returns {updated:false, reason:'no changes'}. " +
    "Returns {error:'NOT_FOUND'} if the composition does not exist. " +
    "Use for: 'update the second scene subtitle to be more punchy', " +
    "'change the background colour of all scenes to dark blue'. " +
    "Always pass the COMPLETE new spec — this replaces the existing spec, it does not merge.",
  schema: z.object({
    id: z.string().min(1).describe("Video composition id"),
    title: z.string().max(500).optional().describe("New composition title"),
    spec: VideoSpecSchema.optional().describe(
      "Complete new VideoSpec object (replaces existing spec). Pass all scenes.",
    ),
  }),

  run: async ({ id, title, spec: suppliedSpec }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant video
    const [row] = await db
      .select()
      .from(schema.videoCompositions)
      .where(eq(schema.videoCompositions.id, id))
      .limit(1);

    if (!row) return { error: "NOT_FOUND" };

    const updates: Partial<typeof schema.videoCompositions.$inferInsert> = {};

    if (title !== undefined && title !== row.title) {
      updates.title = title;
      updates.slug = slugify(title) || id;
    }

    if (suppliedSpec !== undefined) {
      // Validate — reject malformed specs and never persist them
      const parsed = VideoSpecSchema.safeParse(suppliedSpec);
      if (!parsed.success) {
        return { error: "INVALID_SPEC", issues: parsed.error.issues };
      }
      // Recompute top-level durationInFrames from scene durations
      const recomputed = recomputeDuration(parsed.data);
      updates.spec = JSON.stringify(recomputed);
    }

    if (Object.keys(updates).length === 0) {
      return { updated: false, reason: "no changes" };
    }

    updates.updatedAt = new Date().toISOString();

    // guard:allow-unscoped — single-tenant video
    await db
      .update(schema.videoCompositions)
      .set(updates)
      .where(eq(schema.videoCompositions.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { updated: true };
  },
});
