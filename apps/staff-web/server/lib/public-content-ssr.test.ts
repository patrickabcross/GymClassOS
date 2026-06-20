// public-content-ssr.test.ts — CV4-01
// Unit tests for renderPublicContentHtml (pure URL → {html, status} function).
// Uses vi.mock for the DB so no real Neon connection is needed.
// Run: npx vitest run --config vitest.unit.config.ts server/lib/public-content-ssr.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock getDb + schema before importing the module under test ───────────────

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(),
  schema: {
    contentDocuments: {
      slug: "slug_col",
      id: "id_col",
      status: "status_col",
    },
  },
}));

import { renderPublicContentHtml } from "./public-content-ssr.js";
import { getDb } from "../db/index.js";

// ─── Test data ────────────────────────────────────────────────────────────────

const publishedDoc = {
  id: "doc-1",
  title: "My Published Post",
  body: "<p>Hello <strong>world</strong></p>",
  status: "published",
  slug: "my-published-post",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const draftDoc = {
  ...publishedDoc,
  id: "doc-2",
  status: "draft",
  slug: "my-draft-post",
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

describe("renderPublicContentHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 8: a published doc slug returns status 200 and html containing title and sanitized body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(makeDb([publishedDoc]) as any);

    const { html, status } = await renderPublicContentHtml("/c/my-published-post");
    expect(status).toBe(200);
    expect(html).toContain("My Published Post");
    // Body p + strong survive sanitization
    expect(html).toContain("<p>");
    expect(html).toContain("<strong>");
    expect(html).toContain("Hello");
    expect(html).not.toContain("<script");
  });

  it("Test 9: a draft doc slug returns status 404", async () => {
    // Slug lookup → draft doc; ID fallback → empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(makeDb([draftDoc], []) as any);

    const { status } = await renderPublicContentHtml("/c/my-draft-post");
    expect(status).toBe(404);
  });

  it("Test 10: an unknown slug returns status 404", async () => {
    // Both slug and id lookups return empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(makeDb([], []) as any);

    const { status } = await renderPublicContentHtml("/c/nonexistent-slug");
    expect(status).toBe(404);
  });
});
