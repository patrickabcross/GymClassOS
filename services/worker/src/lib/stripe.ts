import Stripe from "stripe";
import type { getDb } from "./db.js";
import { getStripeSecretKey } from "./secrets.js";

/**
 * Stripe API version we pin against at runtime.
 *
 * PITFALL #3: pinning prevents Stripe from floating the API version on us;
 * event shapes change across versions and silently break our reducers.
 *
 * NOTE: The installed Stripe SDK (19.3.1) types `apiVersion` as the literal
 * `'2025-10-29.clover'` (its LatestApiVersion at build time). The plan
 * specifies `'2026-04-22.dahlia'` (the version released after the SDK
 * shipped its types). Casting via `as Stripe.LatestApiVersion` keeps the
 * runtime pin intact (Stripe accepts any valid version string) while
 * satisfying TypeScript. Bump the SDK when 19.x adds the dahlia literal,
 * then drop the cast. Mirrors apps/edge-webhooks/src/lib/stripe.ts.
 */
export const STRIPE_API_VERSION =
  "2026-04-22.dahlia" as Stripe.LatestApiVersion;

/**
 * Build a Stripe SDK instance using the active restricted key.
 *
 * Resolves the key via getStripeSecretKey(db) (secrets table → env fallback),
 * so a rotation written by staff-web (Plan 08) is picked up on the very next
 * call here without restarting the worker.
 */
export async function getStripe(db: ReturnType<typeof getDb>): Promise<Stripe> {
  const key = await getStripeSecretKey(db);
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
