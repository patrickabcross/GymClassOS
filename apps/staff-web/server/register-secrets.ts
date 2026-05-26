import { registerRequiredSecret } from "@agent-native/core/secrets";

// ─── GymClassOS staff-web required secrets ───────────────────────────────────
//
// Registering secrets here surfaces them in Settings → API Keys with a working
// Save button (POST /_agent-native/secrets/:key → writeAppSecret → encrypted
// app_secrets row). At resolution time, getOwnerApiKey() and resolveSecret()
// read from app_secrets first; ENV vars remain a deploy-level fallback only on
// local/single-tenant contexts (this fork already has the AGENT_NATIVE_SINGLE_
// TENANT escape hatch wired in credential-provider.ts).
//
// File lives OUTSIDE server/plugins/ on purpose: Nitro's plugin auto-discovery
// expects a defineNitroPlugin-shaped default export and silently skips files
// that don't match. Keeping registration as a side-effect module imported at
// the top of server/plugins/agent-chat.ts guarantees the registerRequiredSecret
// calls run at boot before any request handler resolves a secret. This mirrors
// the proven pattern in templates/voice/server/register-secrets.ts and
// templates/slides/server/register-secrets.ts.
//
// Scope decision — `scope: "user"` (not "org"):
//   The framework's POST /_agent-native/secrets/:key handler refuses
//   org-scoped writes unless the caller has an active org AND owner/admin
//   role (`canMutateOrgScope`). GymClassOS staff-web does NOT set
//   AUTO_CREATE_DEFAULT_ORG and has no org-provisioning UX in the pilot
//   surface, so org-scoped registration would 403 on save — defeating the
//   purpose of the in-app key UI. User scope works without any org setup;
//   the per-customer pilot has 1-2 staff so the duplicated paste cost is
//   negligible. Revisit when AUTH-02 introduces org-based ACL.

// ─── Anthropic (right-rail Chat agent) ───────────────────────────────────────
registerRequiredSecret({
  key: "ANTHROPIC_API_KEY",
  label: "Anthropic API Key",
  description:
    "Powers the right-rail agent that answers gym questions (renewals, fill rate, at-risk members). Without this, the chat sidebar shows 'Connect Builder.io' or returns a missing-credentials error.",
  docsUrl: "https://console.anthropic.com/settings/keys",
  scope: "user",
  kind: "api-key",
  required: true,
  validator: async (value) => {
    if (!value) return { ok: false, error: "Key is empty." };
    if (typeof value !== "string" || value.length < 20) {
      return { ok: false, error: "Key looks too short." };
    }
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": value,
          "anthropic-version": "2023-06-01",
        },
      });
      if (res.ok) return true;
      if (res.status === 401) {
        return { ok: false, error: "Anthropic rejected this key (401)." };
      }
      return { ok: false, error: `Anthropic returned ${res.status}.` };
    } catch (err: any) {
      return {
        ok: false,
        error: `Could not reach Anthropic: ${err?.message ?? err}`,
      };
    }
  },
});

// ─── WhatsApp Cloud API ──────────────────────────────────────────────────────
//
// IMPORTANT: registering these surfaces them in Settings → API Keys so the
// customer can SEE which credentials the deploy needs and rotate them from
// the UI. However, the staff-web webhook receiver
// (apps/staff-web/app/routes/webhooks.whatsapp.tsx) and the worker / edge-
// webhooks services on Fly currently read these from `process.env` directly,
// NOT from app_secrets. Until those handlers are migrated to `resolveSecret`,
// the in-app paste must be paired with the matching `fly secrets set` /
// `vercel env add` for the webhook to actually work in production.
//
// Tracking this migration is out of scope for the credential-gate livefix.

registerRequiredSecret({
  key: "WHATSAPP_ACCESS_TOKEN",
  label: "WhatsApp Access Token",
  description:
    "Meta WhatsApp Business permanent system-user token. Used to send outbound templates from /gymos. Also set via `fly secrets set WHATSAPP_ACCESS_TOKEN=…` on the Fly worker until handlers migrate to app_secrets.",
  docsUrl:
    "https://developers.facebook.com/docs/whatsapp/business-management-api/get-started",
  scope: "user",
  kind: "api-key",
  required: true,
  validator: async (value) => {
    if (!value) return { ok: false, error: "Token is empty." };
    if (typeof value !== "string" || value.length < 20) {
      return { ok: false, error: "Token looks too short." };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/v23.0/me?access_token=${encodeURIComponent(value)}`,
      );
      if (res.ok) return true;
      if (res.status === 401 || res.status === 400) {
        return { ok: false, error: "Meta rejected this token." };
      }
      return { ok: false, error: `Meta returned ${res.status}.` };
    } catch (err: any) {
      return {
        ok: false,
        error: `Could not reach Meta Graph API: ${err?.message ?? err}`,
      };
    }
  },
});

registerRequiredSecret({
  key: "WHATSAPP_PHONE_NUMBER_ID",
  label: "WhatsApp Phone Number ID",
  description:
    "Meta WhatsApp phone number ID — the FROM number for outbound. Find at Meta Business → WhatsApp → API Setup. Also set via `fly secrets set` on the Fly worker.",
  docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
  scope: "user",
  kind: "api-key",
  required: true,
});

registerRequiredSecret({
  key: "WHATSAPP_APP_SECRET",
  label: "WhatsApp App Secret",
  description:
    "Meta App Secret used to verify inbound WhatsApp webhook signatures (X-Hub-Signature-256). Also set via `fly secrets set` on the Fly edge-webhooks service and as a Vercel env var on staff-web.",
  docsUrl: "https://developers.facebook.com/docs/facebook-login/security",
  scope: "user",
  kind: "api-key",
  required: true,
});

registerRequiredSecret({
  key: "WHATSAPP_VERIFY_TOKEN",
  label: "WhatsApp Webhook Verify Token",
  description:
    "Random string you pick. Meta echoes it back when you subscribe to the webhook URL. Also set via `fly secrets set` and as a Vercel env var on staff-web.",
  docsUrl:
    "https://developers.facebook.com/docs/graph-api/webhooks/getting-started",
  scope: "user",
  kind: "api-key",
  required: true,
});

// WHATSAPP_BUSINESS_ACCOUNT_ID — optional in services/worker/src/lib/env.ts
// and only read by housekeeping.ts for template sync. Not used by staff-web
// at all (the inbox UI reads templates from the local DB, not from Meta).
// Skipping registration for now to avoid an "unset required" onboarding step
// the user can't action from the staff-web UI. Re-add as `required: false`
// when the template-sync worker job is exposed from staff-web.
