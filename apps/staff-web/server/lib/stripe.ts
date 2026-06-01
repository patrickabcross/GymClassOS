import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

/**
 * Stripe API version pin.
 *
 * PITFALL #3: pinning prevents Stripe from floating the API version.
 * SDK 19.3.1 types LatestApiVersion as '2025-10-29.clover'; the cast keeps
 * the runtime pin intact. Drop the cast when the SDK ships the dahlia literal.
 *
 * Matches services/worker/src/lib/stripe.ts + gymos.settings.integrations.tsx.
 */
export const STRIPE_API_VERSION =
  "2026-04-22.dahlia" as Stripe.LatestApiVersion;

/**
 * Resolve the active Stripe restricted key.
 *
 * Priority: secrets table (pgcrypto-decrypted) → env STRIPE_SECRET_KEY → throw.
 *
 * Mirrors services/worker/src/lib/secrets.ts getStripeSecretKey, but reads
 * directly from the staff-web Drizzle instance (no cross-package dependency).
 *
 * The secrets table is studio-global; guard:allow-unscoped applies.
 */
async function getStripeSecretKey(): Promise<string> {
  const masterKey = process.env.PGCRYPTO_MASTER_KEY;
  if (masterKey) {
    const db = getDb();
    // guard:allow-unscoped — secrets is studio-global config (single-tenant)
    const result = await (db as any).execute(sql`
      UPDATE secrets
      SET last_used_at = NOW()
      WHERE name = 'stripe_restricted_key'
      RETURNING pgp_sym_decrypt(ciphertext::bytea, ${masterKey}) AS plaintext
    `);
    const rows = (result as any)?.rows ?? (result as any);
    if (rows && rows.length > 0 && rows[0].plaintext) {
      return rows[0].plaintext as string;
    }
  }

  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) return envKey;

  throw new Error(
    "No Stripe key configured — visit /gymos/settings/integrations to add your Stripe restricted API key.",
  );
}

/**
 * Build a Stripe SDK instance using the active restricted key.
 *
 * Reads the key fresh from the secrets table on every call so key rotation
 * written by /gymos/settings/integrations is picked up immediately without
 * restarting the server.
 */
export async function getStripeClient(): Promise<Stripe> {
  const key = await getStripeSecretKey();
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
