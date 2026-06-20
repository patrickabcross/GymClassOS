// public-video-ssr.test.ts — CV4-01
// Unit tests for renderPublicVideoHtml (pure URL → {html, status} function).
// Uses vi.mock for the DB so no real Neon connection is needed.
// Run: npx vitest run --config vitest.unit.config.ts server/lib/public-video-ssr.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock getDb + schema before importing the module under test ───────────────

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(),
  schema: {
    videoCompositions: {
      slug: "slug_col",
      id: "id_col",
      status: "status_col",
    },
  },
}));

import { renderPublicVideoHtml } from "./public-video-ssr.js";
import { getDb } from "../db/index.js";

// ─── Test data ────────────────────────────────────────────────────────────────

const validSpec = JSON.stringify({
  format: "square",
  fps: 30,
  durationInFrames: 150,
  scenes: [
    {
      type: "title",
      text: "Morning HIIT",
      subtitle: "Join us 7am",
      bgColor: "#0F172A",
      durationInFrames: 90,
    },
    {
      type: "outro",
      text: "Book Now",
      bgColor: "#1E293B",
      durationInFrames: 60,
    },
  ],
});

const publishedComp = {
  id: "vid-1",
  title: "My Promo Video",
  spec: validSpec,
  status: "published",
  slug: "my-promo-video",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const draftComp = {
  ...publishedComp,
  id: "vid-2",
  status: "draft",
  slug: "my-draft-video",
};

const malformedSpecComp = {
  ...publishedComp,
  id: "vid-3",
  title: "Malformed Spec Video",
  spec: "NOT VALID JSON {{{",
  slug: "malformed-spec",
};

// ─── Fluent mock DB builder ────────────────────────────────────────────────────

function makeDb(rows1: unknown[], rows2: unknown[] = []) {
  let call = 0;
  const makeChain = (rows: unknown[]) => {
    const thenFn = (fn: (r: unknown[]) => unknown) => Promise.resolve(fn(rows));
    const chain = {
      where: () => chain,
      limit: () => chain,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: thenFn as any,
    };
    return { from: () => chain };
  };
  return {
    select: () => {
      call++;
      return call === 1 ? makeChain(rows1) : makeChain(rows2);
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("renderPublicVideoHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: a published composition slug returns status 200 with title, Watch caption, and poster element", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(makeDb([publishedComp]) as any);

    const { html, status } = await renderPublicVideoHtml("/v/my-promo-video");
    expect(status).toBe(200);
    // Title escaped and present
    expect(html).toContain("My Promo Video");
    // Watch caption
    expect(html.toLowerCase()).toContain("watch");
    // Poster element (div or figure with 'poster' in class attribute)
    expect(html).toMatch(/class="poster[\s"]/);
    expect(html).not.toContain("<script");
  });

  it("Test 2: a draft composition slug returns status 404", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(makeDb([draftComp]) as any);

    const { status } = await renderPublicVideoHtml("/v/my-draft-video");
    expect(status).toBe(404);
  });

  it("Test 3: an unknown slug returns status 404", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(makeDb([], []) as any);

    const { status } = await renderPublicVideoHtml("/v/unknown-slug");
    expect(status).toBe(404);
  });

  it("Test 4: a composition with malformed spec JSON renders 200 (parseSpec fallback, never throws)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(makeDb([malformedSpecComp]) as any);

    const { html, status } = await renderPublicVideoHtml("/v/malformed-spec");
    expect(status).toBe(200);
    // Title still present
    expect(html).toContain("Malformed Spec Video");
    // Watch caption still present
    expect(html.toLowerCase()).toContain("watch");
    // Should not throw
    expect(html).toMatch(/class="poster[\s"]/);
  });
});
