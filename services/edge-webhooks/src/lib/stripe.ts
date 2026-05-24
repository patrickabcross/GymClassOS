import Stripe from "stripe";
import { getEnv } from "./env.js";

/**
 * Stripe API version we pin against at runtime.
 *
 * PITFALL #3: pinning prevents Stripe from floating the API version on us;
 * event shapes change across versions and silently break our reducers.
 *
 * NOTE: The installed Stripe SDK (19.3.1) types `apiVersion` as the literal
 * `'2025-10-29.clover'` (its LatestApiVersion at build time). The plan
 * specified `'2026-04-22.dahlia'` (the version released after the SDK
 * shipped its types). Casting via `as Stripe.LatestApiVersion` keeps the
 * runtime pin intact (Stripe accepts any valid version string) while
 * satisfying TypeScript. Bump the SDK when 19.x adds the dahlia literal,
 * then drop the cast.
 */
export const STRIPE_API_VERSION =
  "2026-04-22.dahlia" as Stripe.LatestApiVersion;

let _stripe: Stripe | undefined;
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const env = getEnv();
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
  });
  return _stripe;
}

/** Test-only: reset cached stripe client so tests can re-mock cleanly. */
export function _resetStripeForTests(): void {
  _stripe = undefined;
}
