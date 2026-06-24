# Meta Lead Ads — Operator Setup (D-09)

**Phase:** MC3-meta-lead-ads-crm-lifecycle
**Decision ref:** D-09 — Page/webhook subscription is a deliberate operator/ops action, not automated by MC3. Automated OAuth Page-connect is a deferred future onboarding phase.

This runbook covers the one-time steps required to connect a studio's Meta Lead Ads (Instant Forms) to the RunStudio webhook pipeline. Complete these steps in order; none can be automated from within the app.

---

## 1. Prerequisites

Before proceeding, confirm the following are in place:

- A Facebook Page running Lead Ads / Instant Forms (active ad campaigns or test forms).
- The RunStudio Facebook App has been granted (or will be granted) the following permissions:
  - **`leads_retrieval`** — required to call `GET /{leadgen_id}` to retrieve submitted field data.
  - **`pages_manage_ads`** — required to subscribe to the Page's lead events.
  - Note: both permissions may require **Meta App Review** before use in production. Submit for review early — approval typically takes 2–7 business days and is a hard calendar dependency before production traffic can flow. In test mode (whitelisted test users) these gates are bypassed.

---

## 2. Page Access Token

The worker calls the Graph API with a Page-scoped access token to retrieve lead field data. This token must be entered in the app.

**Recommended: System User token (non-expiring)**

1. In **Meta Business Manager** → Business Settings → Users → System Users.
2. Create or select a System User with **Admin** role.
3. Grant the System User **Manage** access to the Facebook Page.
4. Generate a token for this System User; select the app and include the `leads_retrieval` and `pages_manage_ads` permissions.
5. The generated token does not expire and is the safest long-lived credential.

**Alternative: Long-lived User token**

1. Use a User token from a person with **Leads Access** on the Page.
2. Exchange for a long-lived token (60-day expiry) via the token exchange endpoint.
3. Note: user tokens expire and must be rotated; System User tokens are preferred.

**The token holder (user or system user) MUST have Leads Access on the Page:**

- Business Manager → All Tools → Pages → select the Page → Page Access → assign **Leads Access** to the user or system user.

**Enter the token in the app:**

1. Go to `/gymos/settings/integrations` → **Meta Conversion Tracking** card.
2. Locate the **Page Access Token (Lead Ads)** field.
3. Paste the token and click **Save**.
4. Confirm the card shows "Lead Ads: connected".

The token is stored encrypted in `app_secrets` under the key `META_PAGE_ACCESS_TOKEN` and is never logged or returned to the browser.

---

## 3. Webhook Subscription — Subscribe the App to the Page's `leadgen` field

Meta delivers Lead Ad submissions as webhook events to the `leadgen` field of the Page object. You must subscribe the Facebook App to this field for the studio's Page.

### Option A: Meta App Dashboard (manual, no API call)

1. Meta App Dashboard → **Webhooks** (left nav) → **Page** object.
2. Click **Subscribe** next to the `leadgen` field.
3. Enter the callback URL and verify token (see below).
4. Click **Verify and Save**.

### Option B: Graph API call (scripted or one-off via Graph Explorer)

```
POST https://graph.facebook.com/v23.0/{PAGE_ID}/subscribed_apps
  ?subscribed_fields=leadgen
  &access_token={PAGE_ACCESS_TOKEN}
```

Replace `{PAGE_ID}` with the studio's Facebook Page ID (found in Page Settings → About → Page ID), and `{PAGE_ACCESS_TOKEN}` with the token configured in step 2.

### Callback URL and verify token

| Parameter | Value |
|-----------|-------|
| Callback URL | `https://<fly-app>.fly.dev/webhooks/meta-lead` (the edge-webhooks endpoint for Lead Ads) |
| Verify token | The **same** value already configured as the WhatsApp webhook verify token. The GET verification handshake reuses the WhatsApp verify token — both webhooks live on the same Facebook App and the same Hono receiver. |

---

## 4. App Secret / Signing

The Lead Ads webhook payload is signed with the same **Facebook App Secret** already in use for the WhatsApp webhook. No separate secret needs to be configured at the edge — the existing `FB_APP_SECRET` (or equivalent Fly env var) covers both webhook routes.

Confirm the App Secret is set in Fly secrets:

```
flyctl secrets list --app <gymos-edge-webhooks>
```

Look for `FB_APP_SECRET` (or whatever the edge-webhooks receiver uses for HMAC validation). If missing, set it from the Meta App Dashboard → App Settings → Basic → App Secret.

---

## 5. Verification — End-to-End Test

After completing steps 1–4, submit a test lead and confirm the pipeline delivers it to the RunStudio DB.

1. **Submit a test lead** using Meta's **Lead Ads Testing Tool**:
   - Meta App Dashboard → Lead Ads Testing Tool (or `business.facebook.com/ads/leadgen/test-leads`).
   - Select the Page and form, submit a test entry.
2. **Check edge-webhooks logs** (`flyctl logs --app <gymos-edge-webhooks>`) — you should see a `[meta-lead] received leadgen_id=...` log line and `[meta-lead] enqueued` confirming the job was queued.
3. **Check worker logs** (`flyctl logs --app <gymos-worker>`) — you should see the Graph API call, field_data retrieval, and `[meta-lead] ingested member_id=...`.
4. **Confirm in the app** — open `/gymos` inbox; the new lead should appear as a conversation with `status='lead'`. Open the member's profile to confirm `meta_lead_id` is recorded in the attribution row.
5. **Lifecycle events** — once the lead replies on WhatsApp (Contact), purchases (Purchase), or attends a class (Schedule), the corresponding CAPI event will include `lead_id` and the lead will advance in Meta's Leads Center.

---

## 6. Troubleshooting

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| Graph API `code 190` on lead retrieval | Invalid or expired Page access token | Re-enter the token in Settings → Meta Conversion Tracking → Page Access Token (Lead Ads) |
| Graph API `code 100` or `404` on retrieval | Lead data not yet available (Meta latency) | Worker retries automatically with backoff; check worker logs again in 5–10 minutes |
| `Missing Leads Access` / permission error on retrieval | Token holder does not have Leads Access on the Page | Grant Leads Access in Business Manager → Page Access → Leads Access for the system user or user |
| No `leadgen` events received at all | Webhook not subscribed or callback URL misconfigured | Re-verify the webhook subscription (step 3); confirm callback URL matches the deployed edge-webhooks URL exactly |
| Signature verification failure at edge | App Secret mismatch or missing `FB_APP_SECRET` Fly secret | Set `FB_APP_SECRET` in Fly secrets to match the App Secret in Meta App Dashboard → Basic Settings |
| `TEMPLATE_NOT_APPROVED` on WhatsApp follow-up | The outbound WhatsApp template for lead follow-up is not yet approved | Submit the template for Meta approval; worker will queue sends once the template status is `approved` |

---

*Reference: D-09 — Automated Page subscription (OAuth Page-connect onboarding flow) is deferred to a future phase. This manual operator runbook is the intended MC3 connection method.*

*Last updated: 2026-06-24*
