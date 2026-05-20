import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBoss, _resetBossForTests } from "./boss.js";

describe("getBoss", () => {
  const savedUrl = process.env.DATABASE_URL_UNPOOLED;
  beforeEach(() => _resetBossForTests());
  afterEach(() => {
    if (savedUrl) process.env.DATABASE_URL_UNPOOLED = savedUrl;
    else delete process.env.DATABASE_URL_UNPOOLED;
  });

  it("throws if DATABASE_URL_UNPOOLED is missing", () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    expect(() => getBoss()).toThrow(/DATABASE_URL_UNPOOLED is not set/);
  });

  it("throws if DATABASE_URL_UNPOOLED contains -pooler", () => {
    process.env.DATABASE_URL_UNPOOLED =
      "postgres://user:pass@ep-foo-pooler.c-8.us-east-1.aws.neon.tech/db";
    expect(() => getBoss()).toThrow(/-pooler/);
  });

  it("does not throw with a clean (unpooled) URL", () => {
    process.env.DATABASE_URL_UNPOOLED =
      "postgres://user:pass@ep-foo.c-8.us-east-1.aws.neon.tech/db";
    // We don't actually connect — just verify construction succeeds
    expect(() => getBoss()).not.toThrow();
  });
});
