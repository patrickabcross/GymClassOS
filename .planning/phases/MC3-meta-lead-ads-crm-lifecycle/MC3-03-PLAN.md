---
phase: MC3-meta-lead-ads-crm-lifecycle
plan: "03"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.settings.integrations.tsx
  - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md
autonomous: true
requirements: [LEAD-01]
user_setup:
  - service: meta_lead_ads
    why: "Receive Meta Instant Form (Lead Ad) submissions"
    env_vars:
      - name: META_PAGE_ACCESS_TOKEN
        source: "Meta Business Manager → System Users (non-expiring) OR Page access token from a long-lived User token; user must have Leads Access on the Page"
    dashboard_config:
      - task: "Subscribe the Facebook App to the Page's `leadgen` webhook field"
        location: "Meta App Dashboard → Webhooks → Page → subscribe `leadgen` (or POST /{PAGE_ID}/subscribed_apps?subscribed_fields=leadgen). Webhook callback URL = the edge-webhooks /webhooks/meta-lead endpoint; verify token = the existing WhatsApp verify token."
      - task: "Grant the app leads_retrieval + pages_manage_ads permissions (may require Meta App Review)"
        location: "Meta App Dashboard → App Review → Permissions and Features"
must_haves:
  truths:
    - "The operator can paste a Page Access Token into the existing Meta Conversion Tracking Settings card and it is stored in app_secrets under META_PAGE_ACCESS_TOKEN (masked, never prefilled)"
    - "The card shows whether a Page token is configured (by-key presence), independent of which operator is logged in"
    - "An ops note documents the one-time Page subscription + permissions steps the operator must do outside the app"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.settings.integrations.tsx"
      provides: "Page Access Token masked field + save/rotate intent writing META_PAGE_ACCESS_TOKEN; by-key presence in loader"
      contains: "META_PAGE_ACCESS_TOKEN"
    - path: ".planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md"
      provides: "Operator setup steps (Page subscription, token, permissions)"
      contains: "leadgen"
  key_links:
    - from: "Settings card Page token field"
      to: "app_secrets META_PAGE_ACCESS_TOKEN"
      via: "writeAppSecret({ key: 'META_PAGE_ACCESS_TOKEN' })"
      pattern: "writeAppSecret"
    - from: "MC3-02 worker meta-lead handler"
      to: "META_PAGE_ACCESS_TOKEN"
      via: "readAppSecretByKey('META_PAGE_ACCESS_TOKEN')"
      pattern: "META_PAGE_ACCESS_TOKEN"
---

<objective>
Extend the existing MC1 "Meta Conversion Tracking" Settings card with a second masked secret field — the Page Access Token (Lead Ads) — stored in app_secrets under META_PAGE_ACCESS_TOKEN via the same writeAppSecret + by-key presence pattern MC1 established for the CAPI token (D-08). Plus an ops note documenting the one-time operator setup that MC3 deliberately does not automate (D-09): the Page `leadgen` subscription and the required app permissions.

Purpose: Self-serve, repeatable-per-client connection of Lead Ads with no new settings surface. The worker (MC3-02) reads META_PAGE_ACCESS_TOKEN to retrieve lead field_data; this plan is the operator's only entry point for that token.

Output: A Page Access Token field on the existing card (save + rotate intents, masked, by-key presence), and MC3-LEAD-ADS-OPS-NOTE.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-CONTEXT.md
@.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md
@.planning/phases/MC1-foundation-lead-event/MC1-05-SUMMARY.md

<interfaces>
<!-- Current contracts in apps/staff-web/app/routes/gymos.settings.integrations.tsx. Mirror these for the Page token. -->

Imports already present (line ~45-46):
```typescript
import { writeAppSecret } from "@agent-native/core";
import { readAppSecretByKey } from "../../server/lib/app-secrets.js";
```

Loader presence detection (line ~145) — the EXACT pattern to copy for the Page token:
```typescript
const hasMetaToken = (await readAppSecretByKey("META_CAPI_TOKEN")) !== null;
```

save-meta-config intent (line ~343-375) writes the CAPI token (only when a non-empty value is submitted):
```typescript
await writeAppSecret({
  key: "META_CAPI_TOKEN",
  value: <submitted>,
  scope: "workspace",
  scopeId: "global",
});
```

rotate-meta-token intent (line ~377-) — token-only replace, same fixed scope/scopeId (UPSERTs the same row, D-11).

UI (line ~446-812): `metaConfigFetcher = useFetcher<...>()`; the Meta Conversion Tracking card is a `<metaConfigFetcher.Form method="post">` with `_intent` hidden input; the CAPI token uses a masked field with a "Replace token" reveal (line ~759) shown only when configured; result banners gate on `metaConfigFetcher.data?.intent`.

KEY: the worker (MC3-02) resolves the Page token via `readAppSecretByKey("META_PAGE_ACCESS_TOKEN", db)` — the key MUST be exactly `META_PAGE_ACCESS_TOKEN`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Page Access Token field to the Meta Conversion Tracking card</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx (the file being modified — loader META_CAPI_TOKEN presence ~line 145; save-meta-config intent ~line 343; rotate-meta-token intent ~line 377; Meta card UI + masked CAPI token field ~line 693-812)
    - .planning/phases/MC1-foundation-lead-event/MC1-05-SUMMARY.md (the by-key presence + masked-field + writeAppSecret(scope:workspace,scopeId:global) pattern this mirrors)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "Page Access Token Details" + "Storage Pattern (D-08)"
  </read_first>
  <action>
    Mirror the existing CAPI-token plumbing for a second secret, key = `META_PAGE_ACCESS_TOKEN`. Do NOT refactor the existing CAPI token code — add alongside.

    1. Loader: add `const hasPageToken = (await readAppSecretByKey("META_PAGE_ACCESS_TOKEN")) !== null;` and include `hasPageToken` in the returned `meta` object (next to the existing token-presence flag).
    2. save-meta-config intent: after the existing META_CAPI_TOKEN write, add a parallel conditional write — only when a non-empty pageToken value is submitted:
       ```typescript
       const pageToken = String(form.get("pageToken") ?? "").trim();
       if (pageToken) {
         await writeAppSecret({
           key: "META_PAGE_ACCESS_TOKEN",
           value: pageToken,
           scope: "workspace",
           scopeId: "global",
         });
       }
       ```
       (Reuse the same intent so the operator saves Pixel ID + Test Event Code + CAPI token + Page token in one submit. No new intent required, but if the existing rotate-meta-token intent is the cleaner home for token-only replace, you may also accept `pageToken` there — keep the key exactly META_PAGE_ACCESS_TOKEN.)
    3. UI: inside the existing `<metaConfigFetcher.Form>`, add a masked input `name="pageToken"` labeled "Page Access Token (Lead Ads)" with helper text: "Required for Meta Lead Ads. Obtain from Business Manager → System Users (non-expiring) or your Page access token. The user must have Leads Access on the Page." When `meta.hasPageToken` is true, render it like the CAPI token's configured state (masked, "Replace token" reveal, never prefilled with the actual value). When false, show a plain empty field.
    4. Status hint (optional, low-effort): near the card badge, note "Lead Ads: connected" when hasPageToken, else "Lead Ads: not connected — see ops note". Keep it minimal (one line) per AGENTS.md clean-UI rule — do not add a second card or extra controls.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/routes/gymos.settings.integrations.tsx` contains `META_PAGE_ACCESS_TOKEN` (at least twice: loader presence read + writeAppSecret)
    - contains `name="pageToken"` (the new input)
    - contains `hasPageToken`
    - the Page token value is NEVER prefilled into the input `value` (masked — same as CAPI token)
    - the existing META_CAPI_TOKEN save/rotate logic is unchanged (still present)
    - `cd apps/staff-web && pnpm tsc --noEmit` passes
  </acceptance_criteria>
  <done>The operator can save a Page Access Token (masked) on the existing Meta card; it lands in app_secrets under META_PAGE_ACCESS_TOKEN; the loader reports its presence by-key for any operator login.</done>
</task>

<task type="auto">
  <name>Task 2: Lead Ads operator ops note</name>
  <files>.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md</files>
  <read_first>
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "Subscribing to the Page's leadgen field (OPERATOR STEP — D-09)" + "Graph API Lead Retrieval" permissions + "Page Access Token Details" + Pitfall 6 (Leads Access)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-CONTEXT.md § D-09 (subscription is an operator/ops action, not automated)
  </read_first>
  <action>
    Create .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md — a concise operator runbook (no code, plain steps). Cover, in order:
    1. **Prerequisites** — a Facebook Page running Lead Ads / Instant Forms; app permissions `leads_retrieval` + `pages_manage_ads` (note: may require Meta App Review before production; document the lead time as a calendar dependency).
    2. **Page Access Token** — obtain from Business Manager → System Users (recommended, non-expiring) OR a Page access token derived from a long-lived User token. The token-holder MUST have Leads Access on the Page (Business Manager → Page → Page Access → Leads Access). Enter it in /gymos/settings/integrations → Meta Conversion Tracking → "Page Access Token (Lead Ads)".
    3. **Webhook subscription** — subscribe the Facebook App to the Page's `leadgen` field. Two routes: (a) Meta App Dashboard → Webhooks → Page → subscribe `leadgen`; (b) `POST https://graph.facebook.com/v23.0/{PAGE_ID}/subscribed_apps?subscribed_fields=leadgen&access_token={PAGE_ACCESS_TOKEN}`. Callback URL = the edge-webhooks `/webhooks/meta-lead` endpoint. Verify token = the SAME value already configured for the WhatsApp webhook (the GET handshake reuses the WhatsApp verify token — same Facebook App).
    4. **Signing** — the App Secret is the same Facebook App Secret already used for the WhatsApp webhook; no separate secret to configure at the edge.
    5. **Verification** — submit a test lead via Meta's Lead Ads Testing Tool; confirm a member + lead conversation appears in /gymos and the lead's meta_lead_id is stored (lifecycle events will then carry user_data.lead_id once the lead replies/buys/attends).
    6. **Troubleshooting** — code 190 (invalid token) → re-enter the Page token; code 100 / 404 on retrieval → availability lag, the worker retries automatically; missing Leads Access → permission error on retrieval.
    Reference D-09 (this is a deliberate manual step; automated OAuth Page-connect is a deferred future onboarding phase).
  </action>
  <verify>
    <automated>test -f .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md && grep -q leadgen .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md` exists
    - contains `leadgen` (the webhook field)
    - contains `META_PAGE_ACCESS_TOKEN` or "Page Access Token"
    - contains `leads_retrieval`
    - contains `/webhooks/meta-lead`
    - documents that the subscription is a manual operator step (D-09)
  </acceptance_criteria>
  <done>A self-contained operator runbook covers token entry, leadgen subscription, permissions, signing, verification, and troubleshooting.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && pnpm tsc --noEmit` green
- grep: gymos.settings.integrations.tsx contains META_PAGE_ACCESS_TOKEN + name="pageToken" + hasPageToken; existing META_CAPI_TOKEN logic intact
- ops note exists with leadgen + Page token + leads_retrieval + /webhooks/meta-lead
- Page token never prefilled into the input value (masked)
</verification>

<success_criteria>
- The operator connects Lead Ads self-serve by pasting a Page Access Token into the existing Meta card; it is stored as META_PAGE_ACCESS_TOKEN in app_secrets and read by the MC3-02 worker (LEAD-01).
- Presence is reported by-key, correct for any operator login (D-11 pattern).
- The one-time Page subscription + permissions (deliberately not automated, D-09) are documented in an ops note.
- No new settings surface; no hardcoding to HUSTLE (repeatable per client, D-19).
</success_criteria>

<output>
After completion, create `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-03-SUMMARY.md`.
</output>
