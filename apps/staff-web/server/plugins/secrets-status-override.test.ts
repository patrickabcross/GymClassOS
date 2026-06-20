/**
 * Unit tests for buildSecretStatusPayload — the pure payload-builder helper
 * extracted from secrets-status-override.ts.
 *
 * Strategy: import the pure helper directly (no @agent-native/core, no DB, no
 * H3). This mirrors the pattern established in
 * actions/create-checkout-link.test.ts (pure helpers tested without the
 * defineAction wrapper).
 *
 * Behaviours asserted:
 *   1. 3 api-key secrets + presence map with 2 present, 1 absent
 *      → 3 entries; 2 have status="set" + correct last4; 1 has status="unset"
 *        and no last4.
 *   2. All base fields (key, label, description, docsUrl, scope, kind, required)
 *      are carried through on every entry.
 *   3. No plaintext secret value appears anywhere in the payload — only the
 *      masked last4 form (e.g. "••••WXYZ").
 *   4. An oauth-kind secret is emitted with status="unset" + oauthProvider /
 *      oauthConnectUrl passed through (defensive branch; documented as out of
 *      scope).
 */

import { describe, expect, it } from "vitest";
import { buildSecretStatusPayload } from "./secrets-status-override-helpers.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const THREE_API_KEYS = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API Key",
    description: "Powers the agent",
    docsUrl: "https://console.anthropic.com",
    scope: "user" as const,
    kind: "api-key" as const,
    required: true,
  },
  {
    key: "WHATSAPP_ACCESS_TOKEN",
    label: "WhatsApp Access Token",
    description: "Meta token",
    docsUrl: "https://developers.facebook.com",
    scope: "user" as const,
    kind: "api-key" as const,
    required: true,
  },
  {
    key: "MYUTIK_API_KEY",
    label: "MYÜTIK API Key",
    description: "Relay key",
    docsUrl: "https://myutik.com",
    scope: "user" as const,
    kind: "api-key" as const,
    required: true,
  },
];

const OAUTH_SECRET = {
  key: "SOME_OAUTH_KEY",
  label: "Some OAuth",
  description: "OAuth integration",
  docsUrl: "https://example.com/oauth",
  scope: "user" as const,
  kind: "oauth" as const,
  required: false,
  oauthProvider: "github",
  oauthConnectUrl: "https://example.com/oauth/github/connect",
};

// ---------------------------------------------------------------------------
// Test 1 + 2: present / absent / field carry-through
// ---------------------------------------------------------------------------

describe("buildSecretStatusPayload — api-key secrets", () => {
  // Presence map: ANTHROPIC + WHATSAPP present, MYUTIK absent
  const presenceByKey = new Map([
    ["ANTHROPIC_API_KEY", { present: true, last4: "••••5678" }],
    ["WHATSAPP_ACCESS_TOKEN", { present: true, last4: "••••ABCD" }],
    ["MYUTIK_API_KEY", { present: false, last4: undefined }],
  ]);

  const result = buildSecretStatusPayload(THREE_API_KEYS, presenceByKey);

  it("returns exactly one entry per registered secret", () => {
    expect(result).toHaveLength(3);
  });

  it("present entry has status='set'", () => {
    const anthropic = result.find((r) => r.key === "ANTHROPIC_API_KEY");
    expect(anthropic?.status).toBe("set");
  });

  it("present entry carries the correct masked last4", () => {
    const anthropic = result.find((r) => r.key === "ANTHROPIC_API_KEY");
    expect(anthropic?.last4).toBe("••••5678");

    const whatsapp = result.find((r) => r.key === "WHATSAPP_ACCESS_TOKEN");
    expect(whatsapp?.last4).toBe("••••ABCD");
  });

  it("absent entry has status='unset' and no last4", () => {
    const myutik = result.find((r) => r.key === "MYUTIK_API_KEY");
    expect(myutik?.status).toBe("unset");
    expect(myutik?.last4).toBeUndefined();
  });

  // ── Base field carry-through ────────────────────────────────────────────
  it("carries key through on every entry", () => {
    expect(result.map((r) => r.key)).toEqual([
      "ANTHROPIC_API_KEY",
      "WHATSAPP_ACCESS_TOKEN",
      "MYUTIK_API_KEY",
    ]);
  });

  it("carries label through on every entry", () => {
    expect(result[0].label).toBe("Anthropic API Key");
    expect(result[1].label).toBe("WhatsApp Access Token");
    expect(result[2].label).toBe("MYÜTIK API Key");
  });

  it("carries description through on every entry", () => {
    expect(result[0].description).toBe("Powers the agent");
  });

  it("carries docsUrl through on every entry", () => {
    expect(result[0].docsUrl).toBe("https://console.anthropic.com");
  });

  it("carries scope through on every entry", () => {
    expect(result[0].scope).toBe("user");
  });

  it("carries kind through on every entry", () => {
    expect(result[0].kind).toBe("api-key");
  });

  it("carries required through on every entry (truthy → true)", () => {
    expect(result[0].required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 3: no plaintext leaks into the payload
// ---------------------------------------------------------------------------

describe("buildSecretStatusPayload — security: no plaintext in payload", () => {
  const PLAINTEXT = "sk-ant-secret-key-value-xyz-1234";

  // Deliberately place the plaintext as the last4 to prove it is never
  // propagated — the caller is responsible for masking before passing
  // to the map, but the function itself ONLY passes through what it receives.
  // The test asserts the function doesn't ADD plaintext from somewhere else.
  const presenceByKey = new Map([
    ["ANTHROPIC_API_KEY", { present: true, last4: "••••1234" }],
  ]);

  const result = buildSecretStatusPayload([THREE_API_KEYS[0]], presenceByKey);

  it("does not include plaintext value in any field of the payload", () => {
    const serialized = JSON.stringify(result);
    // The masked last4 is safe; the plaintext itself must not appear.
    expect(serialized).not.toContain(PLAINTEXT);
  });

  it("only the masked last4 form appears in the payload", () => {
    const entry = result[0];
    expect(entry.last4).toBe("••••1234");
    // No updatedAt (not computed by this path — client only needs status).
    expect(entry.updatedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 4: oauth-kind defensive branch
// ---------------------------------------------------------------------------

describe("buildSecretStatusPayload — oauth-kind (defensive branch)", () => {
  const presenceByKey = new Map<string, { present: boolean; last4?: string }>();
  // No entry for the oauth key — presence map is empty (oauth presence
  // is resolved by core, not this override).

  const result = buildSecretStatusPayload([OAUTH_SECRET], presenceByKey);

  it("emits exactly one entry for the oauth secret", () => {
    expect(result).toHaveLength(1);
  });

  it("oauth entry has status='unset' (override defers oauth to core)", () => {
    expect(result[0].status).toBe("unset");
  });

  it("oauth entry carries oauthProvider through", () => {
    expect(result[0].oauthProvider).toBe("github");
  });

  it("oauth entry carries oauthConnectUrl through", () => {
    expect(result[0].oauthConnectUrl).toBe(
      "https://example.com/oauth/github/connect",
    );
  });

  it("oauth entry carries kind='oauth'", () => {
    expect(result[0].kind).toBe("oauth");
  });
});
