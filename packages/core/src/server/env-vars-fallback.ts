// GymClassOS fork: env-vars POST fallback to app_secrets.
//
// Upstream `agent-native` returns a flat 403 from POST /_agent-native/env-vars
// whenever `isEnvVarWriteAllowed()` is false — which is always true in
// production, by design (deployment-wide env writes would let one tenant
// overwrite shared keys for every other tenant).
//
// The problem: there are four UI surfaces in the framework that POST to
// /_agent-native/env-vars (ApiKeySettings, OnboardingPanel, SettingsPanel
// LLM section, SettingsPanel Email Provider section). All of them break in
// production for an authenticated user trying to save their own key.
//
// This helper implements the same fallback shape the SecretsSection's
// /_agent-native/secrets POST handler uses: when an authenticated user
// posts a key, store it as a per-user (or per-org, if registered as org
// scope and the user is owner/admin) row in `app_secrets`. That table is
// already what `getOwnerApiKey()` and `resolveSecret()` read at runtime, so
// every existing UI works without any client changes.
//
// Authentication is still required — unauthenticated requests get the
// original 403.

import type { H3Event } from "h3";
import { getSession } from "./auth.js";
import { getOrgContext } from "../org/context.js";
import {
  listRequiredSecrets,
  type RegisteredSecret,
} from "../secrets/register.js";
import { writeAppSecret } from "../secrets/storage.js";

export interface EnvVarFallbackInput {
  key: string;
  value: string;
}

export interface EnvVarFallbackOk {
  ok: true;
  saved: string[];
}

export interface EnvVarFallbackErr {
  ok: false;
  status: number;
  error: string;
}

export type EnvVarFallbackResult = EnvVarFallbackOk | EnvVarFallbackErr;

/**
 * Attempt to persist env-var POST bodies to `app_secrets` when the
 * deployment-wide env-var write gate is closed.
 *
 * Returns `{ ok: true, saved }` on success, or `{ ok: false, status, error }`
 * to be applied to the H3 response by the caller. Callers should only invoke
 * this AFTER `isEnvVarWriteAllowed()` has returned false — when the gate is
 * open the existing .env file write path runs as before.
 */
export async function writeEnvVarsAsAppSecrets(
  event: H3Event,
  filtered: EnvVarFallbackInput[],
): Promise<EnvVarFallbackResult> {
  const session = await getSession(event).catch(() => null);
  const email = session?.email;
  if (!email) {
    return {
      ok: false,
      status: 403,
      error:
        "env-vars endpoint disabled on multi-tenant deployments and no authenticated user — sign in, then save again, or use /_agent-native/secrets/:key directly.",
    };
  }

  // Build a quick lookup of registered secrets so we can match scope per key.
  const registry = new Map<string, RegisteredSecret>();
  for (const secret of listRequiredSecrets()) {
    registry.set(secret.key, secret);
  }

  // Org context is needed for `scope: "org"` registrations. Resolve once.
  let orgCtx: Awaited<ReturnType<typeof getOrgContext>> | null = null;
  try {
    orgCtx = await getOrgContext(event);
  } catch {
    orgCtx = null;
  }
  const orgId = orgCtx?.orgId ?? null;
  const orgRole = orgCtx?.role ?? null;
  const canMutateOrg = orgRole === "owner" || orgRole === "admin";

  const saved: string[] = [];
  for (const { key, value } of filtered) {
    const registered = registry.get(key);
    let scope: "user" | "org" = "user";
    let scopeId: string = email;
    if (
      registered &&
      registered.scope === "org" &&
      orgId &&
      canMutateOrg
    ) {
      scope = "org";
      scopeId = orgId;
    }
    try {
      await writeAppSecret({ key, value, scope, scopeId });
      saved.push(key);
    } catch (err) {
      return {
        ok: false,
        status: 500,
        error:
          err instanceof Error
            ? `Failed to save ${key}: ${err.message}`
            : `Failed to save ${key}`,
      };
    }
  }

  return { ok: true, saved };
}
