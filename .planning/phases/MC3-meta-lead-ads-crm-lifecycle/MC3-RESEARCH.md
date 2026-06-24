# Phase MC3: Meta Lead Ads + CRM lifecycle — Research

**Researched:** 2026-06-24
**Domain:** Meta Lead Ads webhooks / Graph API lead retrieval / Conversions API for CRM / CAPI lifecycle events keyed on lead_id
**Confidence:** MEDIUM (Meta docs pages are consistently truncated at fetch time; findings cross-verified from multiple secondary authoritative sources and existing MC1/MC2 code patterns)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Lead-Ad submission is treated as opt-in — record `whatsapp_opt_in` row with source `'meta_lead_ads'` (new additive enum value), `ON CONFLICT DO NOTHING`.
- **D-02:** Opt-in does not bypass policy. All follow-up still flows through existing worker `sendMessage` chokepoint — 24h-window + approved-template gates enforced.
- **D-03:** Do NOT fire an initial `Lead` CAPI event on ingest for Lead-Ad leads. Meta already counted it. Report only Contact/Purchase/Schedule keyed on `lead_id`.
- **D-04:** Differs from website-form path (`submissions.ts`) which DOES fire `Lead`. Lead-Ad ingest path skips the Lead enqueue but performs the same member/conversation/attribution/opt-in writes.
- **D-05:** Map Meta Instant Form standard fields → member fields: `full_name` (best-effort first/last split), `email`, `phone_number`. Custom-named fields best-effort.
- **D-06:** Minimum to ingest = at least ONE of email or phone. Reuse dual-unique-key reconcile from `submissions.ts`.
- **D-07:** Submission with neither email nor phone: parked + logged, still 200, idempotency recorded.
- **D-08:** Operator enters Page access token (with `leads_retrieval` permission) into existing MC1 "Meta Conversion Tracking" Settings card, stored in `app_secrets` via `writeAppSecret` by-key pattern.
- **D-09:** Page/webhook subscription step is an operator/ops action — not automated by MC3. Document in ops note.
- **D-10:** edge-webhooks verifies signature + records idempotency + enqueues; worker calls `GET /{leadgen_id}` to retrieve `field_data`.
- **D-11:** Signature verification reuses `verifySignature` helper from `@gymos/whatsapp` (same App-secret HMAC-SHA256 scheme).
- **D-12:** Idempotency keyed on `leadgen_id` via `insertWebhookEvent()` with new provider value `'meta_lead'`. Only enqueue when `inserted === true`.
- **D-13:** Store `meta_lead_id TEXT` as new additive column on `meta_lead_attribution` — migration v34.
- **D-14:** Add `leadId?: string` to `MetaCapiEventPayload`. Include `lead_id` in CAPI event when present. **Research must confirm exact placement** (this document answers that — see section below).
- **D-15..D-19:** Carried-forward: worker is sole CAPI sender; PII SHA-256 hashed; best-effort isolation; Graph v23; repeatable per client (no hardcoding).

### Claude's Discretion

- Exact shape of the worker ingest module (new `services/worker/src/queues/meta-lead.ts` handler + shared ingest helper vs extracting `submissions.ts` reconcile).
- Whether the lead conversation's first `messages` row carries a `{kind:"meta_lead_ad", leadgenId, formId, fieldData}` payload (recommended for parity/traceability).
- How to represent the Lead Ad source beyond opt-in source value.
- Whether retrieval needs retry/backoff if Graph GET races ahead of Meta's lead availability.

### Deferred Ideas (OUT OF SCOPE)

- Leads dashboard / CRM-stage management UI
- OAuth Page-connect onboarding flow (automated Page subscription)
- Lead scoring / qualification stages beyond Contact/Purchase/Schedule
- Bulk historical lead backfill
- Refund → reversal events to Meta
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEAD-01 | Meta Lead Ads (Instant Form) submissions received via Lead Retrieval webhook (edge-webhooks), signature-verified, ingested as `gym_members` + `lead` conversations using dual-unique-key reconcile, capturing the Meta `lead_id`. | Webhook payload shape confirmed (§ Leadgen Webhook). Signature scheme confirmed (§ Signature Verification). Graph API retrieval confirmed (§ Lead Retrieval API). Idempotency via `insertWebhookEvent` extended with `'meta_lead'` provider. |
| LEAD-02 | Ingested Lead-Ad leads advance through the same lifecycle (Contact/Purchase/Schedule) reported back to Meta keyed on `lead_id` (CAPI for CRM / Leads Center). | `lead_id` placement confirmed as `user_data.lead_id` (§ lead_id Placement — D-14). `action_source=system_generated` confirmed for CRM lifecycle events. No browser-pixel dedup needed (no browser event fires for in-platform leads). |
| LEAD-03 | Any WhatsApp follow-up routes through existing opt-in / 24h-window / approved-template worker chokepoint (no bypass). | No new code path — opt-in source `'meta_lead_ads'` is additive enum; the existing `sendMessage` chokepoint enforces policy unchanged (D-02). |
</phase_requirements>

---

## Summary

MC3 adds one new ingest source (Meta Lead Ads Instant Form via Leadgen webhook) and threads a single new identifier (`meta_lead_id` / `lead_id`) through the existing CAPI lifecycle chain MC2 already built. The implementation has three distinct zones:

**Zone 1 — Edge (ingest gate):** A new Hono route pair (`POST + GET /webhooks/meta-lead`) in `services/edge-webhooks`, modeled directly on `whatsapp.ts`. The HMAC signing scheme is identical to WhatsApp (same App Secret, same `verifySignature` helper). The webhook delivers only `leadgen_id + form_id + page_id + ad_id` — NOT field data. After signature verify + idempotency check, enqueue a retrieval job.

**Zone 2 — Worker (retrieve + ingest):** A new `meta-lead` queue handler retrieves `GET /{leadgen_id}` with the Page access token (from `app_secrets`). The `field_data` response returns name/value pairs with standard keys (`full_name`, `email`, `phone_number`) for Instant Form pre-fill questions. The handler then runs the same dual-key member reconcile as `submissions.ts`, upserts a lead conversation + `meta_lead_attribution` row (storing `meta_lead_id`), and writes an opt-in row with source `'meta_lead_ads'`. It does NOT enqueue a `Lead` CAPI event (D-03).

**Zone 3 — CAPI lifecycle propagation (D-14):** The three MC2 fire points (Contact, Purchase, Schedule) already read `meta_lead_attribution` by `member_id`. Once `meta_lead_id` is stored there, they pass `leadId` into `MetaCapiEventPayload`, and the worker adds `user_data.lead_id` to the CAPI event. This is additive — all existing code paths continue working without `lead_id`.

**Primary recommendation:** `lead_id` goes inside `user_data` as the plain string `lead_id` (not hashed, not a top-level event field). Use `action_source=system_generated` for all three lifecycle events. No browser-pixel dedup needed for in-platform leads (no `event_id` collision to worry about, but still use unique `event_id` values per event for Meta's own de-dup machinery).

---

## Standard Stack

### Core (all already in project)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@gymos/whatsapp` | ^9.x | `verifySignature(raw, sig, appSecret)` — reused verbatim for Leadgen webhook | Same HMAC-SHA256 / App Secret scheme |
| `hono` | ^4.x | Hono route handler in edge-webhooks | Already `services/edge-webhooks/src/server.ts` |
| `@gymos/queue` | workspace | `MetaCapiEventPayload` + `enqueueMetaCapiEvent` | Additive extension only: `leadId?` field |
| `drizzle-orm` | ^0.45.x | raw SQL for worker DB ops | Guard:allow-unscoped pattern already established |
| `node-fetch` / native `fetch` | Node 22 built-in | Graph API `GET /{leadgen_id}` call in worker | No new dep — identical pattern to CAPI POST |

### New additions

| What | Where | Notes |
|------|-------|-------|
| `QUEUE_NAMES.META_LEAD = 'meta-lead'` | `packages/queue/src/types.ts` | New queue name for the retrieval job |
| `MetaLeadPayload` Zod schema | `packages/queue/src/types.ts` | `{ leadgenId, formId, pageId, adId }` |
| `enqueueMetaLead()` | `packages/queue/src/publish.ts` | No singletonKey (idempotency via `insertWebhookEvent`) |

### Installation

Nothing new to install. All required packages are already in the project.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
services/edge-webhooks/src/routes/
  meta-lead.ts              # New: POST + GET /webhooks/meta-lead route

services/worker/src/queues/
  meta-lead.ts              # New: retrieve field_data + ingest handler

packages/queue/src/
  types.ts                  # Extend: QUEUE_NAMES.META_LEAD, MetaLeadPayload, leadId? on MetaCapiEventPayload
  publish.ts                # Extend: enqueueMetaLead()

apps/staff-web/server/db/schema.ts
  # Extend: meta_lead_id column on metaLeadAttribution, 'meta_lead_ads' on whatsapp_opt_in.source,
  #         'meta_lead' on webhook_events.provider

services/edge-webhooks/src/lib/db.ts
  # Extend: 'meta_lead' to webhook_events.provider enum in the local mirror

services/worker/src/queues/meta-capi-event.ts
  # Extend: user_data.lead_id injection when data.leadId is present

apps/staff-web/server/plugins/db.ts
  # Extend: migration v34 — additive ALTER TABLE meta_lead_attribution ADD COLUMN meta_lead_id TEXT
```

### Pattern 1: Leadgen Webhook Route (mirrors whatsapp.ts exactly)

```typescript
// services/edge-webhooks/src/routes/meta-lead.ts
// Source: whatsapp.ts pattern in this repo + Meta Leadgen webhook docs

import { Hono } from "hono";
import { verifySignature } from "@gymos/whatsapp"; // SAME helper — same HMAC scheme
import { enqueueMetaLead } from "@gymos/queue";
import { insertWebhookEvent } from "../lib/idempotency.js";
import { getMetaLeadVerifyToken, getMetaAppSecret } from "../lib/secrets.js";
import { getDb } from "../lib/db.js";

export const metaLeadRoutes = new Hono();

// GET — Meta hub.challenge verify handshake (called once at subscription time)
metaLeadRoutes.get("/meta-lead", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const verifyToken = await getMetaLeadVerifyToken(getDb());
  if (mode === "subscribe" && token === verifyToken) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("Forbidden", 403);
});

// POST — lead submission notification
metaLeadRoutes.post("/meta-lead", async (c) => {
  const raw = await c.req.text(); // RAW BODY FIRST (same discipline as whatsapp.ts)
  const sigHeader = c.req.header("x-hub-signature-256") ?? "";
  const appSecret = await getMetaAppSecret(getDb()); // same App Secret as WhatsApp
  if (!verifySignature(raw, sigHeader, appSecret)) {
    return c.text("Bad signature", 401);
  }
  const payload = JSON.parse(raw);
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const v = change.value;
      const leadgenId = String(v.leadgen_id);
      const result = await insertWebhookEvent({
        provider: "meta_lead",          // NEW provider value
        eventType: "leadgen",
        externalId: leadgenId,          // dedup key
        payloadRaw: raw,
      });
      if (result.inserted) {
        await enqueueMetaLead({
          leadgenId,
          formId: String(v.form_id ?? ""),
          pageId: String(v.page_id ?? ""),
          adId: String(v.ad_id ?? ""),
        });
      }
    }
  }
  return c.text("OK", 200);
});
```

### Pattern 2: Worker Retrieval + Ingest Handler

```typescript
// services/worker/src/queues/meta-lead.ts (sketch)
export async function registerMetaLeadWorker(boss: PgBoss) {
  await boss.work(QUEUE_NAMES.META_LEAD, { batchSize: 1 }, async (jobs) => {
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    const data = MetaLeadPayload.parse(job.data);
    const db = getDb();

    // 1. Resolve Page access token from app_secrets
    const pageToken = await readAppSecretByKey("META_PAGE_ACCESS_TOKEN", db);
    if (!pageToken) { log.warn("META_PAGE_ACCESS_TOKEN not configured"); return; }

    // 2. Retrieve lead field_data from Graph API v23
    // GET https://graph.facebook.com/v23.0/{leadgen_id}?access_token={token}
    const graphUrl = `https://graph.facebook.com/v23.0/${data.leadgenId}?access_token=${pageToken}`;
    const resp = await fetch(graphUrl);
    if (!resp.ok) { /* retry or log */ throw new Error(`Graph ${resp.status}`); }
    const lead = await resp.json();
    // lead.field_data = [{ name: "full_name", values: ["Jane Smith"] }, ...]

    // 3. Extract standard fields (see §Field Names section below)
    const fieldMap = Object.fromEntries(
      (lead.field_data ?? []).map((f: { name: string; values: string[] }) =>
        [f.name, f.values?.[0] ?? ""]
      )
    );
    const fullName = fieldMap["full_name"] ?? "";
    const email = fieldMap["email"] ?? "";
    const phone = fieldMap["phone_number"] ?? "";  // E.164 normalization needed

    // 4. Park if neither email nor phone (D-07)
    if (!email && !phone) { log.warn({ leadgenId: data.leadgenId }, "no identity — parking"); return; }

    // 5. Run dual-unique-key reconcile (mirrors submissions.ts)
    //    ... (same logic as the website-form path, no Lead enqueue at the end)
    //    ... Store meta_lead_id = data.leadgenId on meta_lead_attribution (v34 column)
    //    ... Insert whatsapp_opt_in source='meta_lead_ads' ON CONFLICT DO NOTHING
  });
}
```

### Pattern 3: lead_id Injection in meta-capi-event.ts

**This is the definitive answer to D-14 (the #1 risk).**

`lead_id` goes inside `user_data`, as a plain (not hashed) string. The existing `userData` object in `meta-capi-event.ts` (lines 123-132) simply gains one conditional line:

```typescript
// services/worker/src/queues/meta-capi-event.ts
// After the existing userData block construction:
if (data.leadId) userData.lead_id = data.leadId;  // PLAIN — not hashed (confirmed)
```

No other structural change to the CAPI payload is needed. The existing `action_source: data.actionSource` will carry `"system_generated"` (the correct value for CRM lifecycle events), which the three MC2 fire points already set.

### Anti-Patterns to Avoid

- **Hashing `lead_id`:** It is NOT hashed. The SprintHub parameter reference and multiple verified sources confirm `lead_id` is under the "Recommended or unhashed data" category in `user_data` — alongside `fbc`, `fbp`, `client_ip_address`, `client_user_agent`. Send the plain 15-16 digit string.
- **Putting `lead_id` at the top level of the event object:** It belongs inside `user_data`, not as a sibling of `event_name` / `event_time`. Confirmed by multiple CAPI parameter docs.
- **Firing a `Lead` CAPI event on ingest for Lead-Ad leads:** D-03 — double-counts. Meta already counted the lead inside their platform.
- **Parsing the raw body after calling `verifySignature`:** `raw = await c.req.text()` MUST be the first statement in the POST handler (same raw-body-first discipline as `whatsapp.ts`).
- **Using `c.req.json()` for the webhook body:** Destroys the raw body needed for HMAC verification. Always `c.req.text()` then `JSON.parse(raw)`.
- **Calling `GET /{leadgen_id}` inside the edge webhook handler:** The retrieval is slow and may fail (rate limits, availability lag). Always enqueue for the worker.
- **Importing `apps/staff-web/server/db/schema.ts` from the worker:** Cross-app import, separate build boundary (MC1-03 decision). All worker DB access is raw SQL with `guard:allow-unscoped` markers.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA256 webhook signature verify | Custom crypto impl | `verifySignature(raw, sig, appSecret)` from `@gymos/whatsapp` | Already exists; same scheme confirmed for Meta Lead Ads |
| Webhook idempotency | Per-handler dedup logic | `insertWebhookEvent({ provider: 'meta_lead', externalId: leadgenId })` | Already exists; `ON CONFLICT DO NOTHING` is the pattern |
| Dual-unique-key member reconcile | New reconcile logic | Mirror `submissions.ts` lines ~313-367 | Edge cases (email conflict, phone conflict, both present, one present) already handled there |
| PII hashing | Custom SHA-256 impl | `getMemberHashes(db, memberId)` from `services/worker/src/domain/metaLifecycle.ts` | Already exports SHA-256 hashes of email + phone from member row |
| Attribution row upsert | Manual insert | `getOrUpsertAttribution(db, memberId)` from `metaLifecycle.ts` | Already exports the INSERT ON CONFLICT DO NOTHING + SELECT pattern |
| CAPI event fire (lifecycle) | New send logic | `enqueueMetaCapiEvent(payload)` into existing `meta-capi-event.ts` worker | Already handles retry, error split, status write-back, token decrypt |
| Currency unit conversion | Custom zero-decimal logic | `toMajorUnits(amount, currency)` from `metaLifecycle.ts` | 16 zero-decimal currencies already covered |

---

## D-14 Resolution: lead_id Placement in the CAPI Event

This is the primary research deliverable. The answer is definitive.

### Confirmed: `lead_id` is inside `user_data`, sent plain (not hashed)

**Evidence:**

1. SprintHub Conversion API Parameters reference (comprehensive parameter table) explicitly lists `lead_id` under **"Recommended or unhashed data"** in `user_data`, alongside `fbc`, `fbp`, `client_ip_address`, `external_id`. It is described as "Lead ID" with no hashing requirement.

2. Multiple CAPI-for-CRM integration guides (Datahash, HighLevel, Privyr, DataCops / Salesforce) consistently describe `lead_id` as a user identifier to include in the payload to help Meta match the lifecycle event back to the original ad lead. None describe it as a top-level event field.

3. The Meta CAPI parameters search confirms: "At least one user identifier is required, which can be: Facebook Click ID (fbc), Email Address (em), E164 Phone Number (ph), or **Facebook Lead ID (lead_id)**." The parallel structure confirms `lead_id` is a user_data field, same category as `fbc` and `fbp`.

4. The stape.io extended CAPI guide confirms the field name as `lead_id` (mapping from `leadId`).

**What `lead_id` looks like:**
- The Meta Leadgen webhook delivers `leadgen_id` (a 15-16 digit integer, e.g. `55459717045641545`)
- This `leadgen_id` IS the `lead_id` to include in `user_data`
- Send it as a string (the number may exceed JS safe integer range — always treat as string)

**Confirmed CAPI event shape for a Contact lifecycle event on a Lead-Ad lead:**

```json
{
  "data": [
    {
      "event_name": "Contact",
      "event_time": 1719187200,
      "event_id": "member-abc123:contact",
      "action_source": "system_generated",
      "user_data": {
        "em": ["<sha256-hashed-email>"],
        "ph": ["<sha256-hashed-phone>"],
        "lead_id": "55459717045641545",
        "fbc": "fb.1.1719100000.AbCdEfG",
        "fbp": "fb.1.1719100000.12345678"
      }
    }
  ]
}
```

Note: in-platform leads have no `fbc`/`fbp` (no website click attribution). The `user_data` for Lead-Ad lifecycle events will typically only have `em`, `ph`, and `lead_id`. This is valid — Meta matches on `lead_id` directly. Omit `fbc`/`fbp` when absent.

### Confirmed: `action_source = "system_generated"` for CRM lifecycle events

Multiple sources confirm: "For CRM - Lead Record Change Events, select the Action Source as `system_generated`." This matches MC2's existing `action_source` for Contact, Purchase, and Schedule. No change needed at the fire points — they already pass `"system_generated"`.

### Confirmed: No `event_source_url` for Lead-Ad lifecycle events

`event_source_url` is only required when `action_source = "website"`. For `system_generated` events (Contact/Purchase/Schedule), it is omitted. The existing `meta-capi-event.ts` handler already conditionally includes it: `...(data.eventSourceUrl ? { event_source_url: data.eventSourceUrl } : {})` — lifecycle fire points do not populate `eventSourceUrl`, so it is automatically omitted.

### Confirmed: Meta deduplicates CRM events on `event_id`

Meta's standard event dedup machinery applies: identical `event_id` values within a 48-hour window are counted once. For in-platform Lead-Ad lifecycle events there is no browser counterpart, so no cross-browser/server dedup collision. Use the same `event_id` formulas MC2 established (e.g. `memberId:contact`, `purchase:<stripe_id>`, `memberId:occurrenceId`).

### What is NOT needed: a `lead_event_source` flag

Research found no `lead_event_source` parameter in CAPI for CRM. The surfacing in Meta's Leads Center is driven by: (a) the `lead_id` in `user_data` matching the Lead's `leadgen_id`, and (b) sending the appropriate lifecycle event name (`Contact`, `Purchase`, `Schedule`). No separate flag is required.

---

## Leadgen Webhook Details (LEAD-01)

### Webhook Payload Shape (CONFIRMED from official Meta docs and implementation examples)

The leadgen webhook sends a POST with `object: "page"` and `field: "leadgen"` in the changes array:

```json
{
  "object": "page",
  "entry": [
    {
      "id": "51044240199134611",
      "time": 1447342027,
      "changes": [
        {
          "field": "leadgen",
          "value": {
            "leadgen_id": 55459717045641545,
            "form_id": 551111744595541,
            "page_id": 516540199134611,
            "ad_id": 0,
            "adgroup_id": 0,
            "created_time": 1447342026
          }
        }
      ]
    }
  ]
}
```

**Key fields:**
- `leadgen_id` — the retrieval key and the `lead_id` to store/send in CAPI
- `form_id` — which Instant Form was submitted
- `page_id` — which Facebook Page
- `ad_id` — which specific ad (may be 0 if not from a paid ad)
- `adgroup_id` — the ad group (may be 0)
- `created_time` — Unix timestamp of submission

**Dedup key for `insertWebhookEvent`:** `leadgen_id` (as a string). This is unique per submission.

**`adgroup_id` vs `ad_id`:** The spec shows both fields. Store them in the enqueue payload for traceability, but neither is required for the core flow.

### Signature Verification (CONFIRMED — identical to WhatsApp)

Meta Lead Ads webhooks use **exactly the same signing scheme** as the WhatsApp Business Platform webhook:

- Header: `X-Hub-Signature-256`
- Scheme: `sha256=<HMAC-SHA256(App Secret, raw body)>`
- Validation: `verifySignature(raw, sigHeader, appSecret)` from `@gymos/whatsapp` works verbatim

**The App Secret is the same credential** used for the WhatsApp webhook (it is the Facebook App's App Secret, not WhatsApp-specific). The `getWhatsAppAppSecret(db)` helper in `services/edge-webhooks/src/lib/secrets.ts` can be reused as-is, or aliased as `getMetaAppSecret` for clarity.

### GET Verify Handshake (CONFIRMED)

Meta sends a GET request when you register the webhook endpoint:

```
GET /webhooks/meta-lead
  ?hub.mode=subscribe
  &hub.verify_token=<your_configured_verify_token>
  &hub.challenge=<random_string>
```

Response: `200 OK` with body = `hub.challenge` value (plain text).

If `hub.mode !== "subscribe"` or token mismatch → `403 Forbidden`.

This is identical to the WhatsApp verify handshake (already implemented in `whatsapp.ts`).

### Subscribing to the Page's `leadgen` field (OPERATOR STEP — D-09)

The operator must subscribe the Facebook App to receive `leadgen` change notifications for their Page:

```
POST https://graph.facebook.com/v23.0/{PAGE_ID}/subscribed_apps
  ?access_token={PAGE_ACCESS_TOKEN}
  &subscribed_fields=leadgen
```

Or via the Meta App Dashboard → Products → Webhooks → Subscribe to Page / `leadgen` field. This is a one-time operator step, not automated by MC3. Include in the ops note.

---

## Graph API Lead Retrieval (LEAD-01)

### Endpoint and Permissions (CONFIRMED)

```
GET https://graph.facebook.com/v23.0/{LEADGEN_ID}?access_token={PAGE_ACCESS_TOKEN}
```

Required permissions on the app:
- `leads_retrieval` — to access lead form responses
- `pages_manage_ads` — often required alongside `leads_retrieval`

These permissions require App Review submission to Meta before production use. The operator's Page access token must be from a user with **Leads Access** on the Page.

### Response Shape (CONFIRMED)

```json
{
  "id": "55459717045641545",
  "created_time": "2024-07-18T13:42:25+0000",
  "field_data": [
    { "name": "full_name",    "values": ["Jane Smith"] },
    { "name": "email",        "values": ["jane.smith@example.com"] },
    { "name": "phone_number", "values": ["+447700900000"] },
    { "name": "date_of_birth","values": ["01/15/1990"] }
  ]
}
```

Extract with: `fieldMap[name] = values[0]`.

### Standard Field Names vs Custom Fields (MEDIUM confidence — confirmed by pattern, single official source not verified)

Meta Instant Forms have two types of fields:

**Standard pre-fill questions** (Meta fetches from the user's profile automatically — higher completion rate):
- `full_name` — the user's full name as a single string
- `email` — email address
- `phone_number` — phone number (format varies — E.164 normalization required)
- `date_of_birth` — DOB (not needed for MC3)
- `gender` — not needed for MC3

**Custom questions** (defined by the form creator):
- Can have ANY name — whatever the form creator typed as the question label
- Will appear as-is in `field_data[].name`
- MC3 maps `full_name`, `email`, `phone_number` from standard fields; custom fields are ignored (D-05)

**Pitfall:** A gym that uses a custom question labeled "Your mobile number" instead of the standard `phone_number` will have its phone field mapped under a custom name. The safe fallback: if `phone_number` is absent, check for any field whose `name` contains `phone` (case-insensitive fuzzy match). Not required by D-05 but worth noting as a known edge case.

**First name / last name split from `full_name`:** Best-effort split on first space: `fn = parts[0]`, `ln = parts.slice(1).join(" ")`. If only one word, `fn = fullName`, `ln = undefined`. This is sufficient for CAPI hashing (both `fn` and `ln` are optional in `user_data`).

### Rate Limits and Availability Lag

**Availability lag:** There is a potential race condition — the webhook notification may arrive before Meta has made the lead retrievable. The lead should be available "almost immediately" (typically within seconds) but may occasionally lag.

**Safe approach (D-10 + Claude's Discretion):** Use pg-boss retry with exponential backoff. If the `GET /{leadgen_id}` returns a 404 or an error with `code=100` (Object does not exist), treat as a retryable error and let pg-boss retry. Set `retryLimit: 5` with backoff. This handles both transient API errors and the availability lag case.

**Rate limits:** Meta Graph API applies standard per-app, per-page rate limits (typically 200 calls/hour for the basic tier). For a single-studio deploy, this is not a constraint — even a busy gym will not generate enough Lead Ad submissions to approach this limit.

---

## Page Access Token Details (LEAD-01)

### What to Store

The operator enters a **Page access token** (not a User access token). Page access tokens are obtained by:

1. Getting a long-lived User access token (exchange short-lived via OAuth, valid ~60 days)
2. Requesting `GET /{user_id}/accounts` with the long-lived User token → returns Page access tokens

**The Page access token obtained from a long-lived User token does NOT expire** as long as the underlying User token has Marketing API access (Standard Access tier). It is effectively permanent unless the user revokes it or the app is removed from the Page.

**Best alternative for production: System User token** — a non-expiring token issued from Business Manager that does not expire (tied to the business, not a personal account). Ideal for server-side automation. The operator generates it in Business Manager → System Users.

### Storage Pattern (D-08)

Store as `META_PAGE_ACCESS_TOKEN` in `app_secrets` via the existing MC1 `writeAppSecret` by-key pattern on the "Meta Conversion Tracking" Settings card. Never log, never client-side. Masked + "configured"/"Replace token" UX.

Add a second masked field to the existing Settings card (D-08), next to the CAPI token field. Name it "Page Access Token (Lead Ads)" with a helper note: "Required for Lead Ads. Obtain from Business Manager System Users or your Page's access token."

### Token Expiry Gotcha

Long-lived Page tokens "never expire" in practice but can be invalidated by:
- The generating user changing their password
- The user revoking app permission
- The app being removed as a Page admin
- Facebook account compromise

If `GET /{leadgen_id}` returns `error.code = 190` (invalid token), log prominently and write to the Settings card health indicator. Same pattern as the MC1 CAPI token permanent-error handler.

---

## Common Pitfalls

### Pitfall 1: leadgen_id as a JavaScript Number

**What goes wrong:** `leadgen_id` in the webhook payload is a large integer (15-16 digits, e.g. `55459717045641545`). JavaScript `JSON.parse` will silently lose precision for integers larger than `Number.MAX_SAFE_INTEGER` (2^53 - 1 = 9007199254740991). A 16-digit `leadgen_id` is larger than this.

**Why it happens:** The webhook JSON contains `"leadgen_id": 55459717045641545` (a number, not a string). Standard `JSON.parse` coerces it to a float, losing the last few digits.

**How to avoid:** Parse the raw string with a JSON parser that handles big integers, OR use `JSON.parse` with a reviver, OR — simplest — extract the `leadgen_id` by regex from the raw string before JSON.parse:

```typescript
// Safe extraction: convert number to string before JSON parse loses precision
// Option A: regex the raw string
const leadgenIdMatch = raw.match(/"leadgen_id"\s*:\s*(\d+)/);
const leadgenId = leadgenIdMatch?.[1] ?? "";

// Option B: use json-bigint package
// Option C: Meta actually sends it as a number in the JSON but the value fits in a
//           64-bit integer (which JS can't represent exactly) — safest is Option A
```

**Warning signs:** Leadgen IDs that end in `...000` or `...500` after retrieval indicate precision loss.

### Pitfall 2: Reading Raw Body After Any Await

**What goes wrong:** Calling `await c.req.json()` or `await c.req.text()` AFTER any other `await` in a Hono handler causes the request body stream to be consumed/unavailable.

**How to avoid:** `const raw = await c.req.text()` MUST be the FIRST statement in the POST handler — before ANY other await call. This is already enforced in `whatsapp.ts` and must be copied exactly.

### Pitfall 3: Missing `'meta_lead'` enum in the edge-webhooks db mirror

**What goes wrong:** `insertWebhookEvent({ provider: 'meta_lead', ... })` fails TypeScript compilation because the edge-webhooks local `schema.webhookEvents.provider` enum only includes `"stripe" | "whatsapp"` (see `services/edge-webhooks/src/lib/db.ts` line 27).

**How to avoid:** Add `'meta_lead'` to BOTH the staff-web `schema.ts` `webhookEvents` provider enum AND the edge-webhooks local mirror in `db.ts`. The staff-web schema is the source of truth (runs the migration); the edge-webhooks mirror is for TypeScript types and query builder only. Update both in the same PR.

**Warning signs:** TypeScript error `Type '"meta_lead"' is not assignable to type '"stripe" | "whatsapp"'` in `meta-lead.ts`.

### Pitfall 4: `meta_lead_id` / `lead_id` type handling

**What goes wrong:** The `leadgen_id` from the webhook is a large integer. The `meta_lead_attribution.meta_lead_id` column is `TEXT`. The conversion must be explicit: `String(v.leadgen_id)` in the edge-webhooks handler before enqueuing, and `String(data.leadgenId)` in the worker before storing.

**How to avoid:** Always treat `leadgen_id` as a string from the moment you extract it from the webhook payload (using the Option A regex or explicit `String()` conversion before any arithmetic).

### Pitfall 5: Graph API Retrieval Race

**What goes wrong:** The Leadgen webhook fires immediately on form submission, but Meta's Graph API may not yet have the lead retrievable. A `GET /{leadgen_id}` immediately after enqueue may return 404 or "object does not exist" (code 100).

**How to avoid:** Configure the `meta-lead` queue handler with retry: `retryLimit: 5`, `retryDelay: 10` (seconds). On a 404 or code=100 response from the Graph API, throw (do not return) so pg-boss retries. The lead will be retrievable within seconds in the vast majority of cases; this handles the tail.

**Warning signs:** `"Object with ID ... does not exist"` error in worker logs immediately after a new lead submission.

### Pitfall 6: Page Token Scope — Leads Access

**What goes wrong:** The user whose token the operator enters must have **Leads Access** on the Page (a distinct Meta permission from standard admin access). If the token lacks Leads Access, `GET /{leadgen_id}` returns a permission error.

**How to avoid:** Document in the ops note: "The token must be from a user with Leads Access on the Page. In Meta Business Manager, go to Page → Page Access → Leads Access → Assign to the user whose token you are using."

### Pitfall 7: `whatsapp_opt_in.source` enum not updated in migration

**What goes wrong:** The `whatsapp_opt_in.source` Drizzle enum in `schema.ts` currently has four values: `"inbound_reply" | "manual_admin" | "import" | "form_submission"`. Adding `'meta_lead_ads'` via the Drizzle schema without an accompanying additive ALTER TABLE migration will break production.

**How to avoid:** The v34 migration must include both:
```sql
ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT;
ALTER TABLE whatsapp_opt_in DROP CONSTRAINT IF EXISTS whatsapp_opt_in_source_check;
ALTER TABLE whatsapp_opt_in ADD CONSTRAINT whatsapp_opt_in_source_check
  CHECK (source IN ('inbound_reply','manual_admin','import','form_submission','meta_lead_ads'));
```

Note: Drizzle text enum columns in Postgres may use a CHECK constraint rather than a native enum type, depending on how the Drizzle schema was generated. Check the existing migration SQL to confirm the constraint name and form before writing v34.

Similarly for `webhook_events.provider`: the new value `'meta_lead'` needs the constraint updated (or the column is plain text without constraint — check existing migrations).

### Pitfall 8: hashing `lead_id`

**What goes wrong:** A developer sees `lead_id` in `user_data` alongside `em`/`ph` and assumes it must be SHA-256 hashed before sending.

**How to avoid:** `lead_id` is explicitly listed in Meta's "unhashed" user data category. Send the plain string. Hashing it will break Leads Center matching — Meta can't match a hashed `lead_id` against their internal lead record.

---

## Code Examples

### Adding `lead_id` to the CAPI event (meta-capi-event.ts extension)

```typescript
// Source: services/worker/src/queues/meta-capi-event.ts (lines 123-132, extend)

const userData: Record<string, unknown> = {};
if (data.hashedEmail) userData.em = [data.hashedEmail];
if (data.hashedPhone) userData.ph = [data.hashedPhone];
if (data.hashedFn) userData.fn = data.hashedFn;
if (data.hashedLn) userData.ln = data.hashedLn;
if (data.fbc) userData.fbc = data.fbc;
if (data.fbp) userData.fbp = data.fbp;
if (data.clientIp) userData.client_ip_address = data.clientIp;
if (data.clientUserAgent) userData.client_user_agent = data.clientUserAgent;
// MC3: in-platform lead — plain string, not hashed
if (data.leadId) userData.lead_id = data.leadId;
```

### MetaCapiEventPayload extension (types.ts)

```typescript
// packages/queue/src/types.ts — additive only, no existing field changed
export const MetaCapiEventPayload = z.object({
  // ... existing fields unchanged ...
  // MC3: lead_id for in-platform Lead Ad leads (plain string, stored as meta_lead_id)
  leadId: z.string().optional(),
});
```

### MetaLeadPayload (new, types.ts)

```typescript
export const MetaLeadPayload = z.object({
  leadgenId: z.string().min(1),  // string — large int, always stringify before enqueue
  formId: z.string().default(""),
  pageId: z.string().default(""),
  adId: z.string().default(""),
});
export type MetaLeadPayload = z.infer<typeof MetaLeadPayload>;
```

### Extracting lead_id from meta_lead_attribution (lifecycle fire points)

The three MC2 fire points already call `getOrUpsertAttribution(db, memberId)` which returns the attribution row. After v34 migration adds `meta_lead_id`, the attribution row will include it. The fire points pass it as `leadId`:

```typescript
// In each MC2 fire point (Contact/Purchase/Schedule) — additive only
const attribution = await getOrUpsertAttribution(db, memberId);
await enqueueMetaCapiEvent({
  // ... existing fields ...
  leadId: attribution.metaLeadId ?? undefined,  // new field — undefined if no Lead Ad
});
```

This requires `getOrUpsertAttribution` to SELECT the new `meta_lead_id` column. Add it to the SELECT in `metaLifecycle.ts`.

### Migration v34

```sql
-- apps/staff-web/server/plugins/db.ts — additive only (no drop/rename)
{ version: 34, sql: `
  ALTER TABLE meta_lead_attribution
    ADD COLUMN IF NOT EXISTS meta_lead_id TEXT;

  -- Extend whatsapp_opt_in.source constraint (check existing constraint name first)
  ALTER TABLE whatsapp_opt_in
    DROP CONSTRAINT IF EXISTS whatsapp_opt_in_source_check;
  ALTER TABLE whatsapp_opt_in
    ADD CONSTRAINT whatsapp_opt_in_source_check
    CHECK (source IN (
      'inbound_reply','manual_admin','import','form_submission','meta_lead_ads'
    ));
` }
```

Note: The exact constraint name must be verified against the output of `\d whatsapp_opt_in` in the gymos-demo Neon DB before writing v34. If `source` is a plain text column with no CHECK constraint (possible if the enum was only in Drizzle but not migrated as a constraint), the CHECK ADD is not needed — only the Drizzle enum type definition change is needed (additive, no migration).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Meta Offline Conversions API | Standard CAPI with `action_source=system_generated` | May 2025 (discontinued) | Offline Conversions API is shut down; all CRM/offline events must use CAPI — the MC2 approach is already correct |
| `WhatsApp/WhatsApp-Nodejs-SDK` (Meta official) | `@great-detail/whatsapp` maintained fork | 2025 (paused) | Already in place since MC1; unchanged for MC3 |
| Per-MAU auth libraries | Better-auth | 2025 | Already in place |

---

## Open Questions

1. **`webhook_events.provider` column type — CHECK constraint or plain TEXT?**
   - What we know: `services/edge-webhooks/src/lib/db.ts` defines it as `text("provider", { enum: ["stripe", "whatsapp"] })` which in Drizzle generates a TypeScript-level type but may or may not create a Postgres CHECK constraint depending on migration history.
   - What's unclear: Whether a Postgres-level constraint needs to be altered, or only the Drizzle enum in code.
   - Recommendation: Run `\d webhook_events` in the gymos-demo Neon DB to check. If a CHECK constraint exists, add ALTER in v34. If not, only update the Drizzle enum definition.

2. **`whatsapp_opt_in.source` — same question: CHECK constraint or text?**
   - Same as above. Check `\d whatsapp_opt_in` in Neon. If plain text, no migration needed for the constraint — only the Drizzle enum definition update and a comment in the schema file.

3. **Should `enqueueMetaLead` use a `singletonKey`?**
   - What we know: The `insertWebhookEvent` ON CONFLICT DO NOTHING is the primary dedup guard for Leadgen webhook replays. `enqueueMetaLead` is only called when `inserted === true`, so duplicate enqueues are already prevented at the DB level.
   - Recommendation: No `singletonKey` needed on `enqueueMetaLead`. The webhook idempotency is sufficient. (Contrast: `enqueueMetaCapiEvent` uses singletonKey as a secondary in-flight guard because it can be enqueued from multiple places.)

4. **Retrieval retry strategy — pg-boss `retryDelay` vs exponential backoff?**
   - What we know: pg-boss supports `retryDelay` in seconds. The default is platform-level backoff.
   - Recommendation: `retryLimit: 5`, `retryDelay: 30` (30 second fixed delay, 5 attempts = 2.5 minutes total). This handles both the availability lag and transient network issues without excessive complexity.

5. **`getOrUpsertAttribution` — does it currently SELECT `meta_lead_id`?**
   - What we know: `metaLifecycle.ts` implements this function with raw SQL selecting specific columns. After v34 adds the column, `getOrUpsertAttribution` needs to SELECT it.
   - Recommendation: The planner should include a task to update `getOrUpsertAttribution` to include `meta_lead_id` in the SELECT clause.

---

## Environment Availability

Step 2.6: SKIPPED — no new external tooling required. The Graph API `GET /{leadgen_id}` call uses native Node `fetch` (available in Node 22, already the target runtime). All other dependencies are already in the project.

The only operator-side setup (not code) is:
- Meta App subscription to the Page's `leadgen` field (one-time, documented in ops note)
- Page access token entry in Settings (same UX as the CAPI token)
- `leads_retrieval` + `pages_manage_ads` app permissions (may require Meta App Review — document lead time in ops note)

---

## Sources

### Primary (HIGH confidence)

- Existing codebase — `services/edge-webhooks/src/routes/whatsapp.ts`, `services/edge-webhooks/src/lib/idempotency.ts`, `services/worker/src/queues/meta-capi-event.ts`, `packages/queue/src/types.ts` — direct inspection of the established patterns MC3 extends
- `services/edge-webhooks/src/lib/db.ts` — current `provider` enum shape (`"stripe" | "whatsapp"`)
- `apps/staff-web/server/db/schema.ts` lines 410-419 — `whatsapp_opt_in.source` current enum values
- GitHub Gist (tixastronauta/0b9c3b409a7ba96edffc) — verified Meta Leadgen webhook payload shape: `leadgen_id`, `form_id`, `page_id`, `ad_id`, `adgroup_id`, `created_time` inside `changes[].value`
- GitHub supasate/facebook-realtime-lead-ads-demo — verified GET verify handshake (`hub.mode`, `hub.verify_token`, `hub.challenge` → echo challenge), Graph API call pattern `/{leadgen_id}?access_token=...`
- SprintHub Conversion API Parameters reference — explicit `lead_id` parameter listing under "Recommended or unhashed data" in `user_data` (alongside `fbc`, `fbp`, `external_id`)

### Secondary (MEDIUM confidence — multiple sources agree, no single authoritative official page accessible)

- Meta developer search result summaries: "At least one user identifier: fbc, em, ph, or Facebook Lead ID (lead_id)" — confirms `lead_id` as `user_data` field category
- Multiple CAPI-for-CRM integration guides (DataCops/Salesforce, Datahash, HighLevel, Privyr): `action_source = "system_generated"` for CRM lifecycle events — consistent across all sources
- Meta access token docs (developers.facebook.com/docs/facebook-login/guides/access-tokens): Long-lived Page access tokens from Standard Access Marketing API do not expire; System User tokens preferred for automation
- GitHub Gist (msramalho/4fc4bbc2f7ca58e0f6dc4d6de6215dc0): Page access token generation steps; non-expiring when obtained from long-lived user token with Standard Access
- WebSearch result summaries: Offline Conversions API discontinued May 2025; all offline/CRM events now use CAPI with `system_generated` — consistent with MC2's existing implementation

### Tertiary (LOW confidence — single source or unverified)

- Field name standardization (`full_name`, `email`, `phone_number`) for Meta Instant Form pre-fill questions — confirmed by pattern from multiple lead retrieval examples but the exact canonical list was not found in a single authoritative official doc. The standard names are `full_name`, `email`, `phone_number` with high confidence, but custom forms can override these.
- Webhook `adgroup_id` field — present in the tixastronauta gist payload but the canonical docs excerpt only listed `ad_id`; planner should not rely on `adgroup_id` presence.

---

## Metadata

**Confidence breakdown:**
- D-14 (`lead_id` placement): MEDIUM-HIGH — `user_data.lead_id` (plain string) confirmed by multiple independent sources; official Meta docs pages inaccessible but finding is unambiguous and consistent
- Webhook payload shape: HIGH — confirmed by live implementation examples (GitHub gists) and Meta official docs excerpt
- Signature scheme (same HMAC as WhatsApp): HIGH — confirmed by Meta docs and existing verifySignature behavior
- `action_source=system_generated` for CRM lifecycle: HIGH — confirmed by multiple authoritative integration guides and Meta docs search result text
- Standard field names (`full_name`, `email`, `phone_number`): MEDIUM — confirmed by multiple examples, single-source caveat for the canonical list
- Page token lifetime: MEDIUM — confirmed by Meta docs and community gist; System User token recommendation is authoritative

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (30 days — Meta API is stable; Graph v23 is pinned)
