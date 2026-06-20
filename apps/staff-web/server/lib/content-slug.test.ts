// content-slug.test.ts — Unit tests for the pure slugify helper.
// Run via: npx vitest run --config vitest.unit.config.ts server/lib/content-slug.test.ts

import { describe, it, expect } from "vitest";
import { slugify } from "./content-slug.js";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Welcome to HIIT!")).toBe("welcome-to-hiit");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
  });

  it("handles already slugged strings with underscores", () => {
    expect(slugify("Already-slugged_v2")).toBe("already-slugged-v2");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("strips accents and non-ascii punctuation", () => {
    // café → caf (e-acute stripped), & stripped, co kept
    // the exact output: "caf-co"
    expect(slugify("café & co")).toBe("caf-co");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("!hello world!")).toBe("hello-world");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("handles digits in title", () => {
    expect(slugify("HIIT 30min Class")).toBe("hiit-30min-class");
  });
});
