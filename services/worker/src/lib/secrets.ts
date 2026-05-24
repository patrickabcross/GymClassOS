import { sql } from "drizzle-orm";
import { getEnv } from "./env.js";
import type { getDb } from "./db.js";

/**
 * Write a secret to the `secrets` table, encrypted via pgcrypto.
 * Used by the Stripe rotation flow (Plan P1b-08 ships the staff-web UI).
 *
 * STR-01 mandate: Stripe restricted key stored encrypted in DB so the
 * rotation UI can read it. Master key lives in env (Fly Secret).
 *
 * Idempotent via ON CONFLICT (name) DO UPDATE — calling writeSecret twice
 * with the same name just rotates the ciphertext.
 */
export async function writeSecret(
  name: string,
  plaintext: string,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  const env = getEnv();
  // guard:allow-unscoped — secrets is studio-global (one studio per deploy)
  await db.execute(sql`
    INSERT INTO secrets (name, ciphertext, updated_at)
    VALUES (
      ${name},
      pgp_sym_encrypt(${plaintext}, ${env.PGCRYPTO_MASTER_KEY}),
      NOW()
    )
    ON CONFLICT (name) DO UPDATE
      SET ciphertext = EXCLUDED.ciphertext,
          updated_at = EXCLUDED.updated_at
  `);
}

/**
 * Read a secret from the `secrets` table, decrypted via pgcrypto.
 * Also bumps last_used_at = NOW() for audit visibility.
 * Returns null if no row exists for the given name.
 */
export async function readSecret(
  name: string,
  db: ReturnType<typeof getDb>,
): Promise<string | null> {
  const env = getEnv();
  // guard:allow-unscoped — secrets is studio-global
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

/**
 * Resolve the active Stripe restricted key.
 * Priority: secrets table → env STRIPE_SECRET_KEY → throw.
 * Rotation-capable: write to secrets via writeSecret('stripe_restricted_key', ...).
 */
export async function getStripeSecretKey(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  const fromDb = await readSecret("stripe_restricted_key", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  if (env.STRIPE_SECRET_KEY) return env.STRIPE_SECRET_KEY;
  throw new Error(
    "No Stripe key available — neither secrets.stripe_restricted_key nor env STRIPE_SECRET_KEY is set",
  );
}
