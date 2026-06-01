import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be before any import that transitively loads env.js or db.js.
// ---------------------------------------------------------------------------

const executeMock = vi.fn();
const mockDb = { execute: executeMock } as any;

vi.mock("./env.js", () => ({
  getEnv: () => ({
    PGCRYPTO_MASTER_KEY: "test-master-key-1234567890abcdef",
    WHATSAPP_VERIFY_TOKEN: "vt_envfallback_12345678",
    WHATSAPP_APP_SECRET: "as_envfallback_12345678",
  }),
}));

import {
  readSecret,
  getWhatsAppVerifyToken,
  getWhatsAppAppSecret,
  _resetSecretsCacheForTests,
} from "./secrets.js";

describe("edge-webhooks secrets", () => {
  beforeEach(() => {
    executeMock.mockReset();
    _resetSecretsCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // readSecret
  // -------------------------------------------------------------------------

  it("readSecret returns plaintext when row exists", async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ plaintext: "secret_value" }],
    });
    const result = await readSecret("whatsapp_app_secret", mockDb);
    expect(result).toBe("secret_value");
  });

  it("readSecret returns null when row missing", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const result = await readSecret("nonexistent_key", mockDb);
    expect(result).toBeNull();
  });

  it("readSecret SQL contains UPDATE secrets + pgp_sym_decrypt + last_used_at = NOW()", async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ plaintext: "v" }] });
    await readSecret("k", mockDb);
    const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
    expect(sqlStr).toContain("UPDATE secrets");
    expect(sqlStr).toContain("pgp_sym_decrypt");
    expect(sqlStr).toContain("last_used_at = NOW()");
  });

  // -------------------------------------------------------------------------
  // getWhatsAppVerifyToken
  // -------------------------------------------------------------------------

  it("getWhatsAppVerifyToken prefers DB over env", async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ plaintext: "vt_from_db" }],
    });
    const token = await getWhatsAppVerifyToken(mockDb);
    expect(token).toBe("vt_from_db");
  });

  it("getWhatsAppVerifyToken falls back to env on DB miss", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const token = await getWhatsAppVerifyToken(mockDb);
    expect(token).toBe("vt_envfallback_12345678");
  });

  // -------------------------------------------------------------------------
  // getWhatsAppAppSecret
  // -------------------------------------------------------------------------

  it("getWhatsAppAppSecret prefers DB over env", async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ plaintext: "as_from_db" }],
    });
    const secret = await getWhatsAppAppSecret(mockDb);
    expect(secret).toBe("as_from_db");
  });

  it("getWhatsAppAppSecret falls back to env on DB miss", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const secret = await getWhatsAppAppSecret(mockDb);
    expect(secret).toBe("as_envfallback_12345678");
  });

  // -------------------------------------------------------------------------
  // TTL cache — key correctness guarantee for the inbound hot path
  // -------------------------------------------------------------------------

  it("cache: second call within TTL does NOT re-query DB", async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ plaintext: "as_cached" }],
    });

    const first = await getWhatsAppAppSecret(mockDb);
    const second = await getWhatsAppAppSecret(mockDb);

    expect(first).toBe("as_cached");
    expect(second).toBe("as_cached");
    // Only one DB query fired — second call served from cache.
    expect(executeMock.mock.calls.length).toBe(1);
  });

  it("cache: after TTL expires, next call re-queries DB", async () => {
    vi.useFakeTimers();

    executeMock
      .mockResolvedValueOnce({ rows: [{ plaintext: "as_v1" }] })
      .mockResolvedValueOnce({ rows: [{ plaintext: "as_v2" }] });

    const first = await getWhatsAppAppSecret(mockDb);
    expect(first).toBe("as_v1");
    expect(executeMock.mock.calls.length).toBe(1);

    // Advance past the 60s TTL.
    vi.advanceTimersByTime(60_001);

    const second = await getWhatsAppAppSecret(mockDb);
    expect(second).toBe("as_v2");
    // Two DB queries total — cache expired so re-resolved.
    expect(executeMock.mock.calls.length).toBe(2);
  });

  it("cache: verify token and app secret are cached independently", async () => {
    executeMock
      .mockResolvedValueOnce({ rows: [{ plaintext: "vt_db" }] })
      .mockResolvedValueOnce({ rows: [{ plaintext: "as_db" }] });

    const vt = await getWhatsAppVerifyToken(mockDb);
    const as = await getWhatsAppAppSecret(mockDb);

    expect(vt).toBe("vt_db");
    expect(as).toBe("as_db");
    expect(executeMock.mock.calls.length).toBe(2);

    // Second calls — both served from cache.
    const vt2 = await getWhatsAppVerifyToken(mockDb);
    const as2 = await getWhatsAppAppSecret(mockDb);
    expect(vt2).toBe("vt_db");
    expect(as2).toBe("as_db");
    expect(executeMock.mock.calls.length).toBe(2); // still 2, no new queries
  });
});
