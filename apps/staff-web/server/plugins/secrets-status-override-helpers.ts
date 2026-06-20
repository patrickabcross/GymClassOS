/**
 * Pure, framework-free helpers for secrets-status-override.ts.
 *
 * Extracted into a separate file so the unit test can import them without
 * pulling in nitropack/runtime or @agent-native/core — the same pattern used
 * by actions/create-checkout-link-helpers.ts and actions/brain-init-helpers.ts
 * (BD4-01 decision: ESM vitest cannot import CJS-bound framework modules).
 *
 * SECURITY: This file must NEVER return or accept plaintext secret values.
 * Only masked last4 strings (e.g. "••••WXYZ") flow through the payload builder.
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SecretPresence {
  key: string;
  present: boolean;
  last4?: string;
}

/**
 * Builds the SecretStatusPayload[] array from a registry snapshot + a
 * pre-resolved presence map.
 *
 * This function is PURE — no I/O, no framework imports, safe to call from
 * unit tests. The plugin's middleware body calls it after resolving presence
 * from readAppSecretByKey.
 *
 * Rules:
 *  - kind === "api-key": status = present ? "set" : "unset"; last4 from map.
 *  - kind === "oauth": status always "unset" in this override — out of scope.
 *    The studio registry has no oauth-kind entries; this branch is defensive.
 *    oauthProvider / oauthConnectUrl are passed through for completeness.
 *  - updatedAt is NOT set: readAppSecretByKey doesn't surface a timestamp
 *    and the client only needs `status` + `last4`.
 *  - Plaintext NEVER enters the returned payload (caller is responsible for
 *    masking before building the presence map).
 */
export function buildSecretStatusPayload(
  secrets: {
    key: string;
    label: string;
    description?: string;
    docsUrl?: string;
    scope: "user" | "org" | "workspace";
    kind: "api-key" | "oauth";
    required?: boolean;
    oauthProvider?: string;
    oauthConnectUrl?: string;
  }[],
  presenceByKey: Map<string, { present: boolean; last4?: string }>,
): Array<Record<string, unknown>> {
  return secrets.map((secret) => {
    const base: Record<string, unknown> = {
      key: secret.key,
      label: secret.label,
      description: secret.description,
      docsUrl: secret.docsUrl,
      scope: secret.scope,
      kind: secret.kind,
      required: !!secret.required,
      status: "unset",
    };

    if (secret.kind === "oauth") {
      // OAuth presence is out of scope for this fix — only api-key status is
      // resolved by-key here. Emit oauth entries with status="unset" so they
      // are never WORSE than the framework default. In practice, the studio
      // registry has no oauth-kind entries, so this branch is defensive only.
      if (secret.oauthProvider !== undefined) {
        base.oauthProvider = secret.oauthProvider;
      }
      if (secret.oauthConnectUrl !== undefined) {
        base.oauthConnectUrl = secret.oauthConnectUrl;
      }
      return base;
    }

    // api-key — resolve status from the presence map.
    const presence = presenceByKey.get(secret.key);
    if (presence?.present) {
      base.status = "set";
      if (presence.last4 !== undefined) {
        base.last4 = presence.last4;
      }
    }

    return base;
  });
}
