/**
 * Provider adapter factory — wires the three live adapters into a ProvisionApis bag.
 *
 * Use `createProvisionApis(env)` in production (saga worker).
 * Use `makeMockApis()` from `src/__tests__/mocks/provision-apis.ts` in unit tests.
 *
 * All three adapters throw a "deferred-on-external-dependency" error at construction
 * time if their required env var is not set. This surfaces config failures early (at
 * saga startup) rather than midway through a provisioning run.
 */

import { createFlyApi } from "./fly.js";
import { createNeonApi } from "./neon.js";
import { createVercelApi } from "./vercel.js";
import type { ProvisionApis } from "./types.js";

export type { NeonApi, VercelApi, FlyApi, ProvisionApis } from "./types.js";

/**
 * Create the live provider API bag.
 *
 * Throws immediately if any required provider env var is missing.
 * Live provisioning runs are deferred-on-external-dependency (D-12) until
 * the operator sets all six vars via Fly secrets.
 *
 * @param env - Subset of hq-worker Env containing provider tokens
 */
export function createProvisionApis(env: {
  NEON_API_KEY?: string | undefined;
  VERCEL_BEARER_TOKEN?: string | undefined;
  VERCEL_TEAM_ID?: string | undefined;
  FLY_API_TOKEN?: string | undefined;
  FLY_ORG_SLUG?: string | undefined;
  GYMOS_WORKER_IMAGE?: string | undefined;
}): ProvisionApis {
  return {
    neon: createNeonApi(env),
    vercel: createVercelApi(env),
    fly: createFlyApi(env),
  };
}
