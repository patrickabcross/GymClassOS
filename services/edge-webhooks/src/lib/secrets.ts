import { sql } from "drizzle-orm";
import { getEnv } from "./env.js";
import type { getDb } from "./db.js";

/**
 * Read a secret from the `secrets` table, decrypted via pgcrypto.
 * Bumps last_used_at = NOW() for audit visibility.
 * Returns null if no row exists for the given name.
 *
 * Mirrors services/worker/src/lib/secrets.ts#readSecret exactly — same SQL,
 * same rows-access pattern. Keep in sync until packages/db/ extraction (Plan 09).
 */
export async function readSecret(
  name: string,
  db: ReturnType<typeof getDb>,
): Promise<string | null> {
  const env = getEnv();
  // guard:allow-unscoped — secrets is studio-global (one studio per deploy)
  const result = await db.execute(sql`
    UPDATE secrets
    SET last_used_at = NOW()
    WHERE name = ${name}
    RETURNING pgp_sym_decrypt(ciphertext::bytea, ${env.PGCRYPTO_MASTER_KEY}) AS plaintext
  `);
  const rows = (result as any)?.rows ?? (result as any);
  if (!rows || rows.length === 0) return null;
  return rows[0].plaintext as string;
}

// ---------------------------------------------------------------------------
// In-memory TTL cache — keeps the inbound POST hot path off Postgres on every
// webhook. A successful resolution (DB or env) is cached for TTL_MS.
// ---------------------------------------------------------------------------

const TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
  value: string;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

/** Resolve `name` via `resolver`, served from cache until TTL expires. */
async function resolveCached(
  name: string,
  resolver: () => Promise<string>,
): Promise<string> {
  const entry = cache.get(name);
  if (entry && entry.expires > Date.now()) {
    return entry.value;
  }
  const value = await resolver();
  cache.set(name, { value, expires: Date.now() + TTL_MS });
  return value;
}

/**
 * Resolve the WhatsApp webhook verify-token (used in the GET handshake).
 * Priority: secrets.whatsapp_verify_token → env WHATSAPP_VERIFY_TOKEN → throw.
 * Cached in-memory for 60 s so the GET handshake path is cheap.
 */
export function getWhatsAppVerifyToken(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  return resolveCached("whatsapp_verify_token", async () => {
    const fromDb = await readSecret("whatsapp_verify_token", db);
    if (fromDb) return fromDb;
    const env = getEnv();
    if (env.WHATSAPP_VERIFY_TOKEN) return env.WHATSAPP_VERIFY_TOKEN;
    throw new Error(
      "No WhatsApp verify token available — neither secrets.whatsapp_verify_token nor env WHATSAPP_VERIFY_TOKEN is set",
    );
  });
}

/**
 * Resolve the WhatsApp app secret (used for HMAC signature verification).
 * Priority: secrets.whatsapp_app_secret → env WHATSAPP_APP_SECRET → throw.
 * Cached in-memory for 60 s so the POST inbound hot path avoids a DB round-trip
 * on every webhook call.
 *
 * Env fallback is retained (HARD requirement per plan constraints): even if the
 * DB read returns null/transient error, env still answers.
 */
export function getWhatsAppAppSecret(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  return resolveCached("whatsapp_app_secret", async () => {
    const fromDb = await readSecret("whatsapp_app_secret", db);
    if (fromDb) return fromDb;
    const env = getEnv();
    if (env.WHATSAPP_APP_SECRET) return env.WHATSAPP_APP_SECRET;
    throw new Error(
      "No WhatsApp app secret available — neither secrets.whatsapp_app_secret nor env WHATSAPP_APP_SECRET is set",
    );
  });
}

/** Test-only: clear the in-memory cache so each test starts fresh. */
export function _resetSecretsCacheForTests(): void {
  cache.clear();
}
