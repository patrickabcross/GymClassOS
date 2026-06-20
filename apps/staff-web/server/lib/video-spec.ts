// video-spec.ts — CV3-01
//
// VideoSpec Zod schema + TS types + helpers.
// Source of truth for the spec stored in video_compositions.spec (JSON TEXT).
//
// Pure module — NO DB, NO side effects. Lives in server/lib (NEVER server/plugins
// — Nitro Vite bundling rule: server/plugins causes build failure on Vercel).
//
// Exports:
//   VideoSpecSchema — Zod schema for validation (reject malformed, never persist)
//   VideoSpec, VideoScene — TS types
//   DIMENSIONS — pixel dimensions per format
//   defaultSpec() — minimal valid two-scene spec
//   specForClassPromo(input) — agent helper: 3-scene ~15s promo from class details
//   recomputeDuration(spec) — sync top-level durationInFrames to sum of scenes
//   parseSpec(json) — JSON.parse then schema.parse; throws on malformed

import { z } from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const SceneSchema = z.object({
  type: z.enum(["title", "textOverImage", "outro"]),
  /** Required headline / CTA text on the scene — must be non-empty. */
  text: z.string().min(1),
  /** Optional secondary text below the headline. */
  subtitle: z.string().optional(),
  /** Optional image URL for textOverImage scenes. */
  imageUrl: z.string().optional(),
  /** Optional background colour hex (defaults to neutral). */
  bgColor: z.string().optional(),
  /** Duration of this scene in frames. Must be a positive integer. */
  durationInFrames: z.number().int().positive(),
});

export const VideoSpecSchema = z.object({
  format: z.enum(["square", "landscape"]),
  fps: z.number().int().positive(),
  /** Total composition duration = sum of all scene durationInFrames. */
  durationInFrames: z.number().int().positive(),
  /** At least one scene required — an empty scenes array is malformed. */
  scenes: z.array(SceneSchema).min(1),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type VideoSpec = z.infer<typeof VideoSpecSchema>;
export type VideoScene = z.infer<typeof SceneSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────

/** Pixel dimensions per format. Used by VideoPreviewPlayer to set compositionWidth/Height. */
export const DIMENSIONS: Record<VideoSpec["format"], { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * defaultSpec — minimal valid two-scene composition.
 * Used when creating a new composition with no content, and as a fallback
 * when parseSpec() fails (so the Player never crashes on corrupted JSON).
 */
export function defaultSpec(): VideoSpec {
  const fps = 30;
  const scenes: VideoScene[] = [
    {
      type: "title",
      text: "Your Class Title",
      subtitle: "Book your spot today",
      bgColor: "#0F172A",
      durationInFrames: 90, // 3 s at 30fps
    },
    {
      type: "outro",
      text: "Book Now",
      bgColor: "#1E293B",
      durationInFrames: 60, // 2 s at 30fps
    },
  ];
  const durationInFrames = scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  return { format: "square", fps, durationInFrames, scenes };
}

/**
 * specForClassPromo — build a ~15-second promo from a class/offer context.
 * The agent calls this via video-create-composition { fromClass: { className, ... } }.
 * Result is guaranteed to pass VideoSpecSchema.safeParse.
 */
export function specForClassPromo(input: {
  className: string;
  classTime?: string;
  offer?: string;
  catchphrase?: string;
}): VideoSpec {
  const { className, classTime, offer, catchphrase } = input;
  const fps = 30;

  // Scene 1 — title: class name headline (~5 s)
  const titleScene: VideoScene = {
    type: "title",
    text: className,
    subtitle: classTime ? `Join us ${classTime}` : "Join us — all levels welcome",
    bgColor: "#0F172A",
    durationInFrames: 150, // 5 s
  };

  // Scene 2 — textOverImage: details (offer / time) (~7 s)
  const midText = offer ?? (classTime ? `${className} at ${classTime}` : `${className} — reserve your spot`);
  const midSubtitle = classTime && offer
    ? `${classTime} · ${offer}`
    : classTime
    ? `Every session at ${classTime}`
    : "Limited spots available";

  const midScene: VideoScene = {
    type: "textOverImage",
    text: midText,
    subtitle: midSubtitle,
    bgColor: "#1E293B",
    durationInFrames: 210, // 7 s
  };

  // Scene 3 — outro: CTA (~3 s)
  const outroScene: VideoScene = {
    type: "outro",
    text: catchphrase ?? "Book Now — Don't Miss Out",
    bgColor: "#0F172A",
    durationInFrames: 90, // 3 s
  };

  const scenes: VideoScene[] = [titleScene, midScene, outroScene];
  const durationInFrames = scenes.reduce((sum, s) => sum + s.durationInFrames, 0); // = 450 (15 s)

  return { format: "square", fps, durationInFrames, scenes };
}

/**
 * recomputeDuration — sync the top-level durationInFrames to the sum of scenes.
 * Called server-side by video-update-composition before persisting so the stored
 * spec is always internally consistent.
 * Pure: returns a new object, does not mutate the argument.
 */
export function recomputeDuration(spec: VideoSpec): VideoSpec {
  const durationInFrames = spec.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  return { ...spec, durationInFrames };
}

/**
 * parseSpec — deserialise a stored JSON TEXT column value into a VideoSpec.
 * Throws on invalid JSON or schema mismatch.
 * Callers (loaders, actions) should catch and fall back to defaultSpec().
 */
export function parseSpec(json: string): VideoSpec {
  const raw: unknown = JSON.parse(json); // throws SyntaxError on invalid JSON
  return VideoSpecSchema.parse(raw); // throws ZodError on invalid shape
}
