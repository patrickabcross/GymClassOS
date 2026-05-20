import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();
const mockDb = { execute: executeMock } as any;

vi.mock("./env.js", () => ({
  getEnv: () => ({
    PGCRYPTO_MASTER_KEY: "test-master-key-1234567890abcdef",
    STRIPE_SECRET_KEY: "sk_test_envfallback",
  }),
}));

import { writeSecret, readSecret, getStripeSecretKey } from "./secrets.js";

describe("secrets", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("writeSecret runs INSERT...ON CONFLICT with pgp_sym_encrypt", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    await writeSecret("stripe_restricted_key", "rk_test_abc", mockDb);
    const sqlObj = executeMock.mock.calls[0][0];
    const sqlStr = JSON.stringify(sqlObj);
    expect(sqlStr).toContain("INSERT INTO secrets");
    expect(sqlStr).toContain("pgp_sym_encrypt");
    expect(sqlStr).toContain("ON CONFLICT");
  });

  it("readSecret returns plaintext when row exists", async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ plaintext: "rk_test_decrypted" }],
    });
    const result = await readSecret("stripe_restricted_key", mockDb);
    expect(result).toBe("rk_test_decrypted");
  });

  it("readSecret returns null when row missing", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const result = await readSecret("missing_key", mockDb);
    expect(result).toBeNull();
  });

  it("readSecret uses pgp_sym_decrypt + updates last_used_at", async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ plaintext: "v" }] });
    await readSecret("k", mockDb);
    const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
    expect(sqlStr).toContain("UPDATE secrets");
    expect(sqlStr).toContain("pgp_sym_decrypt");
    expect(sqlStr).toContain("last_used_at = NOW()");
  });

  it("getStripeSecretKey prefers DB over env", async () => {
    executeMock.mockResolvedValueOnce({
      rows: [{ plaintext: "rk_test_from_db" }],
    });
    const key = await getStripeSecretKey(mockDb);
    expect(key).toBe("rk_test_from_db");
  });

  it("getStripeSecretKey falls back to env on DB miss", async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const key = await getStripeSecretKey(mockDb);
    expect(key).toBe("sk_test_envfallback");
  });
});
