/**
 * Worker-local reader for the framework `app_secrets` table.
 *
 * WHY this is reimplemented here instead of importing from @agent-native/core:
 * 1. The worker does NOT depend on @agent-native/core — it would pull in the
 *    entire framework (Nitro, H3, LibSQL, browser-oriented deps) just for one
 *    decrypt function.
 * 2. `resolveSecret()` from @agent-native/core is request-scoped (it reads the
 *    session to resolve scope/scopeId). A headless pg-boss cron has no HTTP
 *    request, so the request-scoped resolver cannot be used.
 *
 * Key material: this reader mirrors `getEncryptionKey()` from
 * packages/core/src/secrets/storage.ts exactly — it derives the AES-256-GCM
 * key via SHA-256(SECRETS_ENCRYPTION_KEY || BETTER_AUTH_SECRET). The shared
 * BETTER_AUTH_SECRET on the worker Fly app is the cheapest activation path
 * (one `fly secrets set BETTER_AUTH_SECRET=<same-value-as-staff-web>`). If
 * staff-web later switches to a separate SECRETS_ENCRYPTION_KEY the worker
 * checks it first, matching the framework precedence.
 */

import { createHash, createDecipheriv } from "node:crypto";
import { sql } from "drizzle-orm";
import type { getDb } from "./db.js";
import { getLogger } from "./logger.js";

/** One-time debug log when key material is absent (mirrors _warnedFallback in storage.ts). */
let _warned = false;

/**
 * Read and decrypt a value from the framework `app_secrets` table by its
 * registered key name (e.g. "MYUTIK_API_KEY", "WHATSAPP_ACCESS_TOKEN").
 *
 * Returns null — never throws — when:
 *  - No key material is configured (SECRETS_ENCRYPTION_KEY + BETTER_AUTH_SECRET both absent).
 *  - No matching row exists in app_secrets.
 *  - The encrypted_value is corrupt, has the wrong key, or its GCM tag fails.
 *
 * SINGLE-TENANT scope: one Neon DB per studio, so we resolve by key alone
 * without any scope / scope_id filter.
 */
export async function readAppSecretByKey(
  key: string,
  db: ReturnType<typeof getDb>,
): Promise<string | null> {
  // 1. Derive key material — mirrors getEncryptionKey() in storage.ts.
  const material =
    process.env.SECRETS_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;

  if (!material) {
    if (!_warned) {
      _warned = true;
      getLogger().debug(
        "[worker/appSecrets] Neither SECRETS_ENCRYPTION_KEY nor BETTER_AUTH_SECRET is set " +
          "— app_secrets resolver inactive; falling back to pgcrypto secrets table + env.",
      );
    }
    return null;
  }

  // 2. Build the AES key: sha256(material) → 32 bytes.
  const aesKey = createHash("sha256").update(material).digest();

  // 3. Query latest row for this key.
  // guard:allow-unscoped — app_secrets is studio-global (one Neon DB per studio), no ownableColumns
  const result = await db.execute(sql`
    SELECT encrypted_value FROM app_secrets
    WHERE key = ${key}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  // 4. Row-shape handling — mirrors secrets.ts readSecret pattern.
  const rows = (result as any)?.rows ?? (result as any);
  if (!rows || rows.length === 0) return null;

  // 5. Decrypt — swallow every failure so a bad/rotated/corrupt value never
  //    crashes the caller (mirrors readAppSecret catch in storage.ts).
  try {
    const enc = rows[0].encrypted_value as string;
    if (!enc.startsWith("v1:")) return null;
    const [, ivHex, ctHex, tagHex] = enc.split(":");
    if (!ivHex || !ctHex || !tagHex) return null;
    const d = createDecipheriv(
      "aes-256-gcm",
      aesKey,
      Buffer.from(ivHex, "hex"),
    );
    d.setAuthTag(Buffer.from(tagHex, "hex"));
    const pt = Buffer.concat([
      d.update(Buffer.from(ctHex, "hex")),
      d.final(),
    ]).toString("utf8");
    return pt;
  } catch {
    return null;
  }
}
