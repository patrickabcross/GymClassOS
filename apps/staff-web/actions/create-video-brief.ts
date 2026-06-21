// create-video-brief — video content pipeline, stage 1 ("the hook/angle/script")
//
// The agent authors a short-form video brief — hook, angle, and a spoken
// script / shot list — for the coach (trainer) to shoot. Stored as a spec in
// the framework application_state table under the key gymos-video-briefs — NO
// schema change (mirrors save-segment's app-state pattern, so there is no Neon
// migration to apply by hand). The Video studio reads the IDENTICAL key, so the
// agent and the UI stay in sync.
//
// This is stage 1 of the pipeline: brief -> dispatch to trainer -> shoot ->
// edit (Remotion) -> approve/post. Only the brief is created here; dispatch is
// a separate, coach-initiated step (compliance: a WhatsApp send to the coach
// needs an open 24h window or an approved template).
//
// Agent-callable mutation: no `http` key, so the live-refresh source:"action"
// signal the Video studio listens for is not suppressed (matches save-segment).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import {
  readAppState,
  writeAppState,
} from "@agent-native/core/application-state";
import { nanoid } from "nanoid";

// Single app-state key holding an array of briefs (one fetch returns all).
const BRIEFS_KEY = "gymos-video-briefs";

export default defineAction({
  description:
    "Author a short-form video brief for the coach to shoot: a hook (the scroll-stopping " +
    "opening line), an angle (the content idea / why it lands), and a script (what the coach " +
    "says to camera, or a short shot list). Optionally tie it to a class. Saves the brief to the " +
    "Video studio (status 'draft') — it does NOT send anything. Use this when the coach asks for " +
    "video ideas / content, or to feed the studio's content pipeline. " +
    "Returns {saved:true, briefId, title} | {error}.",
  schema: z
    .object({
      title: z.string().min(1).max(120),
      hook: z.string().min(1).max(280),
      angle: z.string().min(1).max(500),
      script: z.string().min(1).max(2000),
      classId: z.string().max(64).optional(),
      format: z.enum(["reel", "short", "story"]).optional(),
    })
    .strict(),
  run: async ({ title, hook, angle, script, classId, format }) => {
    // guard:allow-unscoped — application_state is framework-scoped, no ownable gym table touched
    const existing = (await readAppState(BRIEFS_KEY)) as {
      briefs?: unknown[];
    } | null;
    const briefs = Array.isArray(existing?.briefs) ? existing!.briefs! : [];

    const briefId = `vbr_${nanoid()}`;
    briefs.unshift({
      id: briefId,
      title,
      hook,
      angle,
      script,
      classId: classId ?? null,
      format: format ?? "reel",
      status: "draft", // draft -> dispatched -> shot -> edited -> posted
      createdAt: new Date().toISOString(),
    });

    // Pass the object directly — writeAppState JSON.stringifies internally.
    // guard:allow-unscoped — application_state is framework-scoped
    await writeAppState(BRIEFS_KEY, { briefs });
    return { saved: true, briefId, title };
  },
});
