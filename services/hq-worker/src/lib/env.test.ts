import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnv, _resetEnvForTests } from "./env.js";

// Snapshot of the original process.env so we can restore it after each test.
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  _resetEnvForTests();
});

afterEach(() => {
  // Restore the original env — prevents leakage between tests.
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  _resetEnvForTests();
});

// Valid base env shared across tests that need a working DATABASE_URL_UNPOOLED.
const VALID_HQ_URL =
  "postgres://user:password@ep-hq-direct.us-east-2.aws.neon.tech/neondb";

describe("hq-worker env schema", () => {
  it("parses successfully with a valid DATABASE_URL_UNPOOLED", () => {
    process.env.DATABASE_URL_UNPOOLED = VALID_HQ_URL;
    // Clear PORT so the default kicks in; vitest sets NODE_ENV=test so
    // we assert on the schema-accepted value rather than "development".
    delete process.env.PORT;
    const env = getEnv();
    expect(env.DATABASE_URL_UNPOOLED).toBe(VALID_HQ_URL);
    expect(env.PORT).toBe(3003);
    // NODE_ENV=test is set by vitest — just confirm it's a valid enum value.
    expect(["development", "production", "test"]).toContain(env.NODE_ENV);
    expect(env.LOG_LEVEL).toBe("info");
  });

  // PITFALL #1 — pg-boss requires LISTEN/NOTIFY + advisory locks;
  // the pooler connection breaks these primitives.
  it("rejects a DATABASE_URL_UNPOOLED that contains -pooler (PITFALL #1)", () => {
    process.env.DATABASE_URL_UNPOOLED =
      "postgres://user:password@ep-hq-pooler.us-east-2.aws.neon.tech/neondb";
    expect(() => getEnv()).toThrow(
      /Invalid hq-worker env|DATABASE_URL_UNPOOLED must not include -pooler/i,
    );
  });

  it("defaults PORT to 3003 when PORT is not set", () => {
    process.env.DATABASE_URL_UNPOOLED = VALID_HQ_URL;
    delete process.env.PORT;
    const env = getEnv();
    expect(env.PORT).toBe(3003);
  });

  it("uses the PORT value when it is explicitly set", () => {
    process.env.DATABASE_URL_UNPOOLED = VALID_HQ_URL;
    process.env.PORT = "4000";
    const env = getEnv();
    expect(env.PORT).toBe(4000);
  });

  // PII-up boundary (HQ-FND-06 / D-11): hq-worker must NOT require any
  // studio credential. Parsing MUST succeed without WHATSAPP_*, STRIPE_*,
  // or PGCRYPTO_* in the environment. If this test fails it means someone
  // added a required studio secret to the env schema — which violates the
  // hard PII boundary.
  it("parses successfully WITHOUT any studio credential present (PII-up boundary)", () => {
    // Ensure all known studio credential keys are absent.
    const STUDIO_CREDENTIAL_KEYS = [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "MYUTIK_API_KEY",
      "MYUTIK_PHONE_NUMBER_ID",
      "STRIPE_SECRET_KEY",
      "PGCRYPTO_MASTER_KEY",
      "SECRETS_ENCRYPTION_KEY",
      "BETTER_AUTH_SECRET",
    ];
    for (const key of STUDIO_CREDENTIAL_KEYS) {
      delete process.env[key];
    }
    process.env.DATABASE_URL_UNPOOLED = VALID_HQ_URL;

    // Should not throw — hq-worker holds no studio secrets.
    const env = getEnv();
    expect(env.DATABASE_URL_UNPOOLED).toBe(VALID_HQ_URL);
  });

  it("fails when DATABASE_URL_UNPOOLED is missing entirely", () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    expect(() => getEnv()).toThrow(/Invalid hq-worker env/i);
  });

  it("defaults GIT_SHA to 'dev' when unset", () => {
    process.env.DATABASE_URL_UNPOOLED = VALID_HQ_URL;
    delete process.env.GIT_SHA;
    const env = getEnv();
    expect(env.GIT_SHA).toBe("dev");
  });

  it("parses an explicit LOG_LEVEL", () => {
    process.env.DATABASE_URL_UNPOOLED = VALID_HQ_URL;
    process.env.LOG_LEVEL = "debug";
    const env = getEnv();
    expect(env.LOG_LEVEL).toBe("debug");
  });
});
