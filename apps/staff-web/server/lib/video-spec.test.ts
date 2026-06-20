// video-spec.test.ts — CV3-01
//
// Unit tests for VideoSpec Zod schema + helpers.
// Run with: npx vitest run --config vitest.unit.config.ts server/lib/video-spec.test.ts
//
// TDD: written BEFORE the implementation (RED phase).

import { describe, it, expect } from "vitest";
import {
  VideoSpecSchema,
  defaultSpec,
  specForClassPromo,
  recomputeDuration,
  parseSpec,
} from "./video-spec.js";

// ─── defaultSpec ──────────────────────────────────────────────────────────────

describe("defaultSpec()", () => {
  it("returns a valid VideoSpec that passes VideoSpecSchema.safeParse", () => {
    const result = VideoSpecSchema.safeParse(defaultSpec());
    expect(result.success).toBe(true);
  });

  it("has format 'square'", () => {
    expect(defaultSpec().format).toBe("square");
  });

  it("has fps 30", () => {
    expect(defaultSpec().fps).toBe(30);
  });

  it("has at least one 'title' scene and one 'outro' scene", () => {
    const spec = defaultSpec();
    const types = spec.scenes.map((s) => s.type);
    expect(types).toContain("title");
    expect(types).toContain("outro");
  });

  it("durationInFrames equals sum of scene durationInFrames", () => {
    const spec = defaultSpec();
    const sum = spec.scenes.reduce((acc, s) => acc + s.durationInFrames, 0);
    expect(spec.durationInFrames).toBe(sum);
  });
});

// ─── format enum ─────────────────────────────────────────────────────────────

describe("VideoSpecSchema — format enum", () => {
  it("accepts 'square'", () => {
    const spec = { ...defaultSpec(), format: "square" };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("accepts 'landscape'", () => {
    const spec = { ...defaultSpec(), format: "landscape" };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("rejects unknown format", () => {
    const spec = { ...defaultSpec(), format: "portrait" };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(false);
  });
});

// ─── scene.type enum ─────────────────────────────────────────────────────────

describe("VideoSpecSchema — scene.type enum", () => {
  const base = defaultSpec();

  it("accepts 'title' scene type", () => {
    const spec = {
      ...base,
      scenes: [{ type: "title", text: "Hello", durationInFrames: 60 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("accepts 'textOverImage' scene type", () => {
    const spec = {
      ...base,
      scenes: [{ type: "textOverImage", text: "Hello", durationInFrames: 60 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("accepts 'outro' scene type", () => {
    const spec = {
      ...base,
      scenes: [{ type: "outro", text: "Bye", durationInFrames: 60 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("rejects unknown scene type", () => {
    const spec = {
      ...base,
      scenes: [{ type: "unknown", text: "Hello", durationInFrames: 60 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(false);
  });
});

// ─── scene.durationInFrames constraints ──────────────────────────────────────

describe("VideoSpecSchema — scene.durationInFrames", () => {
  const base = defaultSpec();

  it("rejects zero durationInFrames", () => {
    const spec = {
      ...base,
      scenes: [{ type: "title", text: "Hello", durationInFrames: 0 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects negative durationInFrames", () => {
    const spec = {
      ...base,
      scenes: [{ type: "title", text: "Hello", durationInFrames: -30 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects non-integer durationInFrames", () => {
    const spec = {
      ...base,
      scenes: [{ type: "title", text: "Hello", durationInFrames: 30.5 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(false);
  });
});

// ─── scenes array constraints ─────────────────────────────────────────────────

describe("VideoSpecSchema — scenes array", () => {
  it("rejects empty scenes array", () => {
    const spec = { ...defaultSpec(), scenes: [] };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("accepts a single-scene spec", () => {
    const spec = {
      ...defaultSpec(),
      scenes: [{ type: "title" as const, text: "Hello", durationInFrames: 90 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });
});

// ─── scene optional fields ────────────────────────────────────────────────────

describe("VideoSpecSchema — scene optional fields", () => {
  const base = defaultSpec();

  it("accepts scene with all optional fields", () => {
    const spec = {
      ...base,
      scenes: [{
        type: "textOverImage" as const,
        text: "Hello",
        subtitle: "Sub",
        imageUrl: "https://example.com/img.jpg",
        bgColor: "#0F172A",
        durationInFrames: 90,
      }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("accepts scene without optional fields", () => {
    const spec = {
      ...base,
      scenes: [{ type: "title" as const, text: "Hello", durationInFrames: 90 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("rejects scene with empty text (text is required and non-empty)", () => {
    const spec = {
      ...base,
      scenes: [{ type: "title" as const, text: "", durationInFrames: 90 }],
    };
    expect(VideoSpecSchema.safeParse(spec).success).toBe(false);
  });
});

// ─── specForClassPromo ───────────────────────────────────────────────────────

describe("specForClassPromo()", () => {
  it("returns a spec that passes VideoSpecSchema.safeParse", () => {
    const spec = specForClassPromo({ className: "HIIT Blast" });
    expect(VideoSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("includes a title scene with the class name", () => {
    const spec = specForClassPromo({ className: "Yoga Flow" });
    const titleScene = spec.scenes.find((s) => s.type === "title");
    expect(titleScene).toBeDefined();
    expect(titleScene?.text).toContain("Yoga Flow");
  });

  it("includes an outro scene", () => {
    const spec = specForClassPromo({ className: "Pilates" });
    const outroScene = spec.scenes.find((s) => s.type === "outro");
    expect(outroScene).toBeDefined();
  });

  it("total durationInFrames is approximately 15s at fps (450 frames ± 90)", () => {
    const spec = specForClassPromo({ className: "Spin Class" });
    expect(spec.durationInFrames).toBeGreaterThanOrEqual(360);
    expect(spec.durationInFrames).toBeLessThanOrEqual(540);
  });

  it("incorporates classTime when provided", () => {
    const spec = specForClassPromo({ className: "Yoga", classTime: "7am" });
    const textContent = spec.scenes.map((s) => `${s.text} ${s.subtitle ?? ""}`).join(" ");
    expect(textContent).toContain("7am");
  });

  it("incorporates catchphrase in outro when provided", () => {
    const spec = specForClassPromo({ className: "HIIT", catchphrase: "No limits!" });
    const outroScene = spec.scenes.find((s) => s.type === "outro");
    expect(outroScene?.text).toContain("No limits!");
  });

  it("uses a default CTA in outro when no catchphrase provided", () => {
    const spec = specForClassPromo({ className: "Yoga" });
    const outroScene = spec.scenes.find((s) => s.type === "outro");
    expect(outroScene?.text.length).toBeGreaterThan(0);
  });
});

// ─── recomputeDuration ───────────────────────────────────────────────────────

describe("recomputeDuration()", () => {
  it("sets top-level durationInFrames to sum of scene durationInFrames", () => {
    const spec = defaultSpec();
    // Manually mutate a scene duration
    const mutated = { ...spec, scenes: spec.scenes.map((s, i) => i === 0 ? { ...s, durationInFrames: 200 } : s) };
    const result = recomputeDuration(mutated);
    const expectedSum = result.scenes.reduce((acc, s) => acc + s.durationInFrames, 0);
    expect(result.durationInFrames).toBe(expectedSum);
  });

  it("returns the spec (pure function — does not mutate)", () => {
    const spec = defaultSpec();
    const result = recomputeDuration(spec);
    expect(result).not.toBe(spec); // new object
  });
});

// ─── parseSpec ───────────────────────────────────────────────────────────────

describe("parseSpec()", () => {
  it("parses valid JSON spec string into VideoSpec", () => {
    const spec = defaultSpec();
    const json = JSON.stringify(spec);
    const parsed = parseSpec(json);
    expect(parsed.format).toBe(spec.format);
    expect(parsed.fps).toBe(spec.fps);
    expect(parsed.scenes.length).toBe(spec.scenes.length);
  });

  it("throws on invalid JSON string", () => {
    expect(() => parseSpec("not-json")).toThrow();
  });

  it("throws on invalid spec shape (malformed JSON object)", () => {
    expect(() => parseSpec(JSON.stringify({ format: "bad", scenes: [] }))).toThrow();
  });
});
