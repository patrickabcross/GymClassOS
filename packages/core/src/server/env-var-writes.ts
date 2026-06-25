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
 * GymClassOS fork: this is a hard fork of agent-native; every deploy is
 * single-tenant by definition (one Vercel project per customer — CLAUDE.md
 * tenancy rule). With one tenant per deploy, the "one tenant overwriting
 * another" hazard does not exist, so the production gate is OFF by default.
 *
 * To opt INTO the upstream multi-tenant SaaS gate (refuse request-time env
 * writes in production), set `AGENT_NATIVE_MULTI_TENANT=true`. The legacy
 * `AGENT_NATIVE_SINGLE_TENANT=true` env var is still honoured as a no-op
 * (matches the new default) for back-compat with already-set Vercel configs.
 */
export function isEnvVarWriteAllowed(): boolean {
  // GymClassOS fork: explicit multi-tenant opt-in restores the upstream gate.
  if (/^(1|true)$/i.test(process.env.AGENT_NATIVE_MULTI_TENANT ?? "")) {
    if (process.env.NODE_ENV === "production") return false;
    if (process.env.AGENT_NATIVE_ALLOW_ENV_VAR_WRITES === "1") return true;
    return isDevEnvironment() && isLocalDatabase();
  }
  // GymClassOS fork default: single-tenant-per-deploy — env-var writes allowed.
  return true;
}
