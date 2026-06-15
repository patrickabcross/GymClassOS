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
 * @deprecated — restricted-key model replaced by Connect platform key (P1c.1);
 * kept dormant for rollback. Delete post-cutover once connect is confirmed live.
 *
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
 * @deprecated — restricted-key model replaced by Connect platform key (P1c.1);
 * kept dormant for rollback. Delete post-cutover once connect is confirmed live.
 *
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

/**
 * Resolve the platform Stripe key for Connect operations.
 *
 * Priority:
 *   1. secrets table — pgcrypto-decrypted `stripe_platform_secret_key`
 *      (same UPDATE...RETURNING pgp_sym_decrypt pattern as the restricted key)
 *   2. STRIPE_SECRET_KEY env var (fallback for local dev / CI)
 *   3. throw a clear error (never fall through silently)
 *
 * This is the key for the PLATFORM account — the one that creates + owns the
 * connected (Custom-equivalent) accounts. It is NOT the connected account's key.
 *
 * guard:allow-unscoped — secrets is studio-global config (single-tenant)
 */
async function getPlatformStripeKey(): Promise<string> {
  const masterKey = process.env.PGCRYPTO_MASTER_KEY;
  if (masterKey) {
    const db = getDb();
    // guard:allow-unscoped — secrets is studio-global config (single-tenant)
    const result = await (db as any).execute(sql`
      UPDATE secrets
      SET last_used_at = NOW()
      WHERE name = 'stripe_platform_secret_key'
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
    "No platform Stripe key configured — visit /gymos/settings/integrations to add your Stripe Connect platform key (stripe_platform_secret_key).",
  );
}

/**
 * Build a Stripe SDK instance for platform-level Connect operations.
 *
 * Use this for:
 *   - accounts.create (Custom-equivalent via controller properties)
 *   - accountLinks.create (hosted onboarding)
 *   - checkout.sessions.create({ stripeAccount }) for direct charges
 *   - billingPortal.sessions.create({ stripeAccount })
 *
 * For connected-account-scoped calls, pass the `{ stripeAccount: acctId }`
 * request option as the second/third argument — do NOT build a separate client.
 *
 * Reads the key fresh from the secrets table on every call so rotation is
 * zero-restart.
 */
export async function getPlatformStripe(): Promise<Stripe> {
  const key = await getPlatformStripeKey();
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
