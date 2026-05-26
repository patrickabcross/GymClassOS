import { isLocalDatabase } from "../db/client.js";
import { isDevEnvironment } from "./auth.js";

/**
 * Whether deployment-wide `process.env` writes (and .env file writes) are safe.
 *
 * Production never allows request-time env writes, even with the escape hatch.
 * Env vars are deployment-wide globals and one tenant could otherwise
 * overwrite shared keys for every other tenant. Per-user/org credentials
 * should use `app_secrets` instead.
 *
 * GymClassOS fork: AGENT_NATIVE_SINGLE_TENANT=true opts a deploy into the
 * single-tenant model (one Vercel project per customer). With one tenant per
 * deploy, the "one tenant overwriting another" hazard does not exist, so the
 * production gate is loosened in this mode. Upstream multi-tenant SaaS
 * behaviour is unchanged when the flag is absent.
 */
export function isEnvVarWriteAllowed(): boolean {
  // GymClassOS fork: single-tenant-per-deploy override.
  if (/^(1|true)$/i.test(process.env.AGENT_NATIVE_SINGLE_TENANT ?? "")) {
    return true;
  }
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.AGENT_NATIVE_ALLOW_ENV_VAR_WRITES === "1") return true;
  return isDevEnvironment() && isLocalDatabase();
}
