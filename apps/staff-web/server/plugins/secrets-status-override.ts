/**
 * Studio-side fix for the Settings → "API Keys & Connections" display bug.
 *
 * WHAT THIS DOES:
 *   Shadows GET /_agent-native/secrets (collection root) with a by-key
 *   (studio-global) status resolver that mirrors readAppSecretByKey — so ALL
 *   staff logins see saved keys as "set", not just the account that originally
 *   pasted them.
 *
 * WHY THE BUG EXISTED:
 *   The framework's list handler resolves api-key presence via
 *   resolveScopeId(event, "user") → filters app_secrets by scope='user' AND
 *   scope_id=<session email>. Keys saved by support@myutik.com show as "unset"
 *   for every other staff login even though the app works at runtime (which
 *   resolves by key alone via readAppSecretByKey).
 *
 * SCOPE OF THIS OVERRIDE:
 *   - ONLY intercepts collection GET at the exact path /_agent-native/secrets
 *     (with optional trailing slash, no sub-path segments after "secrets").
 *   - Writes (POST), tests (POST …/test), deletes (DELETE), ad-hoc secrets,
 *     and OAuth flows all fall through (return next()) so @agent-native/core
 *     handles them unchanged.
 *   - @agent-native/core is NOT edited in-place (root AGENTS.md hard rule).
 *
 * SINGLE-TENANT GUARANTEE:
 *   Resolves by key name alone against this studio's Neon DB — mirrors exactly
 *   how readAppSecretByKey works (one Neon project per studio, no scope_id
 *   filter needed).
 *
 * SECURITY:
 *   No plaintext secret value is ever included in the response payload.
 *   Only a presence flag + masked last4 (e.g. "••••WXYZ") are emitted.
 */

import { defineNitroPlugin } from "nitropack/runtime";
import type { H3Event } from "h3";
import { listRequiredSecrets } from "@agent-native/core/secrets";
import { readAppSecretByKey } from "../lib/app-secrets.js";
import "../register-secrets.js";

// Pure helpers live in a separate file with no framework imports so the unit
// test can import them without pulling in nitropack/runtime or @agent-native/core
// (BD4-01 decision: ESM vitest cannot import CJS-bound framework modules).
export type { SecretPresence } from "./secrets-status-override-helpers.js";
export { buildSecretStatusPayload } from "./secrets-status-override-helpers.js";

// ---------------------------------------------------------------------------
// Nitro plugin — registers the middleware that intercepts collection-GET
// ---------------------------------------------------------------------------

export default defineNitroPlugin(async (nitroApp) => {
  // The override middleware: intercept GET /_agent-native/secrets (collection
  // root only), return by-key resolved status. Fall through for everything else.
  const overrideMiddleware = async (
    event: H3Event,
    next: () => Promise<unknown>,
  ): Promise<unknown> => {
    try {
      // Only intercept GET requests.
      if (event.method !== "GET") {
        return next();
      }

      // Match the collection root exactly: pathname must be
      // /_agent-native/secrets or /_agent-native/secrets/ — no sub-segments.
      const pathname = event.url?.pathname ?? "";
      const stripped = pathname.replace(/\/+$/, ""); // remove trailing slashes
      if (stripped !== "/_agent-native/secrets") {
        return next();
      }

      // ── Collection GET: resolve by-key (studio-global) status ──────────

      const secrets = listRequiredSecrets();

      // Build the presence map without ever logging plaintext values.
      const presenceByKey = new Map<
        string,
        { present: boolean; last4?: string }
      >();

      for (const s of secrets) {
        if (s.kind !== "api-key") continue;
        // readAppSecretByKey returns the plaintext server-side so we can
        // compute last4. The plaintext never leaves this function.
        const v = await readAppSecretByKey(s.key);
        presenceByKey.set(s.key, {
          present: v != null,
          // Mask: reveal only last 4 chars. e.g. "••••WXYZ"
          last4: v ? "••••" + v.slice(-4) : undefined,
        });
      }

      return buildSecretStatusPayload(secrets, presenceByKey);
    } catch (err: unknown) {
      // Never 500 the Settings panel — degrade to core's handler on any error.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        "[secrets-status-override] Error resolving by-key status; falling back to core handler.",
        msg,
      );
      return next();
    }
  };

  // Unshift so our override runs BEFORE @agent-native/core's /_agent-native/secrets
  // handler which is pushed (via getH3App().use()) and therefore lands at the END
  // of ~middleware. A pushed handler that returns a non-undefined result
  // short-circuits the chain — so our override must be FIRST to win.
  const h3 = (nitroApp as Record<string, unknown>).h3 as
    | Record<string, unknown>
    | undefined;
  if (h3 && Array.isArray(h3["~middleware"])) {
    h3["~middleware"].unshift(overrideMiddleware);
  } else {
    // h3 or ~middleware not yet initialised at plugin load time (edge case:
    // this plugin may load before core-routes-plugin finishes). Warn and
    // skip — the worst outcome is the old per-user-scope display behaviour.
    console.warn(
      "[secrets-status-override] nitroApp.h3['~middleware'] not available at plugin load time; override skipped.",
    );
  }
});
