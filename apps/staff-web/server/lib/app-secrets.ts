/**
 * Staff-web reader for the framework `app_secrets` table.
 *
 * WHY `resolveSecret()` from @agent-native/core is NOT used here:
 * `resolveSecret()` is request-scoped — it reads the HTTP session to
 * determine scope / scope_id, then decrypts the matching row. The
 * sync-templates action runs inside a React Router action() where the
 * logged-in user is always "support@myutik.com" (scope_id), not the
 * studio staff account that saved the MYÜTIK key. Resolving by session
 * would miss the row.
 *
 * This reader mirrors `services/worker/src/lib/appSecrets.ts` exactly
 * (single-tenant resolve-by-key, AES-256-GCM decrypt, returns null on
 * any failure) but resolves the DB internally via `getDb()` so callers
 * pass only the key name.
 *
 * Key material: sha256(SECRETS_ENCRYPTION_KEY || BETTER_AUTH_SECRET) —
 * mirrors getEncryptionKey() in packages/core/src/secrets/storage.ts.
 * staff-web already carries BETTER_AUTH_SECRET (required for auth), so
 * the resolver is active with no new env vars.
 */

import { createHash, createDecipheriv } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

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
export async function readAppSecretByKey(key: string): Promise<string | null> {
  // 1. Derive key material — mirrors getEncryptionKey() in storage.ts.
  const material =
    process.env.SECRETS_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;

  if (!material) {
    return null;
  }

  // 2. Build the AES key: sha256(material) → 32 bytes.
  const aesKey = createHash("sha256").update(material).digest();

  // 3. Query latest row for this key.
  // guard:allow-unscoped — app_secrets is studio-global (one Neon DB per studio), no ownableColumns
  const result = await (getDb() as any).execute(sql`
    SELECT encrypted_value FROM app_secrets
    WHERE key = ${key}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  // 4. Row-shape handling — mirrors appSecrets.ts in the worker.
  const rows = (result as any)?.rows ?? (result as any);
  if (!rows || rows.length === 0) return null;

  // 5. Decrypt — swallow every failure so a bad/rotated/corrupt value never
  //    crashes the caller.
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
