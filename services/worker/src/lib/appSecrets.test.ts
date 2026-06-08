// Tests for readAppSecretByKey — worker-local app_secrets reader (WA-08).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCipheriv,
  createHash,
  randomBytes,
  createDecipheriv,
} from "node:crypto";

// Mock the logger to avoid env-validation requirements during tests.
vi.mock("./logger.js", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an encrypted_value string with the same AES-256-GCM scheme as
 *  packages/core/src/secrets/storage.ts encryptValue(). */
function encryptForTest(plaintext: string, material: string): string {
  const aesKey = createHash("sha256").update(material).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${ct.toString("hex")}:${tag.toString("hex")}`;
}

/** Build a minimal mock db object whose execute() returns the given rows. */
function makeDb(rows: Record<string, unknown>[] = []) {
  return { execute: vi.fn().mockResolvedValueOnce({ rows }) } as any;
}

// ---------------------------------------------------------------------------
// Import under test AFTER mocks are registered.
// ---------------------------------------------------------------------------

// We need to re-import the module for each test so the module-level _warned
// flag resets. However vitest caches modules — we reset via vi.resetModules()
// inside each test that cares about the flag.

import { readAppSecretByKey } from "./appSecrets.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const SECRET_MATERIAL = "super-secret-material-for-tests-abc123";

beforeEach(() => {
  // Ensure a known key material is set by default.
  process.env.BETTER_AUTH_SECRET = SECRET_MATERIAL;
  delete process.env.SECRETS_ENCRYPTION_KEY;
});

afterEach(() => {
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.SECRETS_ENCRYPTION_KEY;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("readAppSecretByKey", () => {
  it("(a) happy path — decrypts and returns plaintext when row exists + key material set", async () => {
    const plaintext = "my-secret-api-key-value";
    const encrypted = encryptForTest(plaintext, SECRET_MATERIAL);
    const db = makeDb([{ encrypted_value: encrypted }]);

    const result = await readAppSecretByKey("MYUTIK_API_KEY", db);

    expect(result).toBe(plaintext);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("(b) no row — returns null when db returns empty rows", async () => {
    const db = makeDb([]);

    const result = await readAppSecretByKey("MYUTIK_API_KEY", db);

    expect(result).toBeNull();
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("(c) no key material — returns null and does NOT query the db", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.SECRETS_ENCRYPTION_KEY;

    const db = { execute: vi.fn() } as any;

    const result = await readAppSecretByKey("MYUTIK_API_KEY", db);

    expect(result).toBeNull();
    // Short-circuits before any DB call.
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("(d) corrupt encrypted_value — returns null and does not throw", async () => {
    const db = makeDb([{ encrypted_value: "garbage-not-valid-payload" }]);

    // Should not throw.
    const result = await readAppSecretByKey("MYUTIK_API_KEY", db);
    expect(result).toBeNull();
  });

  it("(d2) wrong key — GCM auth-tag failure returns null and does not throw", async () => {
    const encrypted = encryptForTest("secret-value", "wrong-key-material-xyz");
    const db = makeDb([{ encrypted_value: encrypted }]);

    // BETTER_AUTH_SECRET is different from the key used to encrypt.
    process.env.BETTER_AUTH_SECRET = "completely-different-key-material-abc";

    const result = await readAppSecretByKey("MYUTIK_API_KEY", db);
    expect(result).toBeNull();
  });

  it("(d3) v1: prefix missing — returns null without throwing", async () => {
    const db = makeDb([{ encrypted_value: "not-v1-format" }]);

    const result = await readAppSecretByKey("MYUTIK_API_KEY", db);
    expect(result).toBeNull();
  });

  it("prefers SECRETS_ENCRYPTION_KEY over BETTER_AUTH_SECRET", async () => {
    const altMaterial = "alternative-encryption-key-value-xyz";
    process.env.SECRETS_ENCRYPTION_KEY = altMaterial;
    process.env.BETTER_AUTH_SECRET = "should-not-be-used";

    const plaintext = "value-encrypted-with-alt-key";
    const encrypted = encryptForTest(plaintext, altMaterial);
    const db = makeDb([{ encrypted_value: encrypted }]);

    const result = await readAppSecretByKey("WHATSAPP_ACCESS_TOKEN", db);
    expect(result).toBe(plaintext);
  });
});
