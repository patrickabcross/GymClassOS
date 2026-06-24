---
phase: MC3-meta-lead-ads-crm-lifecycle
plan: "02"
subsystem: webhooks-worker
tags: [meta, lead-ads, leadgen, webhook, graph-api, pg-boss, queue, member-reconcile]

# Dependency graph
requires:
  - phase: MC3-meta-lead-ads-crm-lifecycle
    plan: "01"
    provides: "QUEUE_NAMES.META_LEAD, MetaLeadPayload, enqueueMetaLead(), meta_lead_id column on meta_lead_attribution"
  - phase: MC1-foundation-lead-event
    provides: "meta_lead_attribution table, insertWebhookEvent idempotency, getWhatsAppAppSecret/getWhatsAppVerifyToken, readAppSecretByKey"
  - phase: MC2-deep-funnel-lifecycle
    provides: "Contact/Purchase/Schedule lifecycle fire points that read meta_lead_id and pass leadId to enqueueMetaCapiEvent"
provides:
  - "POST + GET /webhooks/meta-lead — signature-verified Leadgen webhook with idempotency + enqueue"
  - "meta_lead provider value in edge-webhooks db.ts mirror + idempotency.ts WebhookProvider"
  - "registerMetaLeadWorker — Graph v23 retrieval + ingestMetaLead()"
  - "ingestMetaLead — dual-key member reconcile + meta_lead_id attribution + opt-in source='meta_lead_ads'"
  - "QUEUE_NAMES.META_LEAD in createQueue loop and worker index.ts"
affects: [MC3-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leadgen webhook mirrors whatsapp.ts exactly: raw-body-first read, same HMAC scheme (getWhatsAppAppSecret), same GET handshake (getWhatsAppVerifyToken), insertWebhookEvent idempotency with new provider='meta_lead'"
    - "leadgen_id precision-safe extraction: regex on raw string BEFORE JSON.parse (Pitfall 1)"
    - "Graph API retrieval race handled by pg-boss retry: throw on 404/code100 (availability lag), permanent return on code 190 (invalid token)"
    - "Dual-unique-key reconcile mirrors submissions.ts verbatim (byEmail/byPhone/fresh INSERT)"
    - "guard:allow-unscoped marker on every raw db.execute() touching gym/attribution tables"
    - "D-03 honored: NO enqueueMetaCapiEvent in the ingest path"
    - "D-07 honored: identity-less leads parked (return undefined), POST still 200"

key-files:
  created:
    - "services/edge-webhooks/src/routes/meta-lead.ts — POST + GET /webhooks/meta-lead route"
    - "services/worker/src/domain/meta-lead-ingest.ts — ingestMetaLead() domain module"
    - "services/worker/src/queues/meta-lead.ts — registerMetaLeadWorker() pg-boss handler"
  modified:
    - "services/edge-webhooks/src/lib/db.ts — provider enum +meta_lead"
    - "services/edge-webhooks/src/lib/idempotency.ts — WebhookProvider type +meta_lead"
    - "services/edge-webhooks/src/server.ts — app.route metaLeadRoutes"
    - "services/worker/src/index.ts — createQueue QUEUE_NAMES.META_LEAD + registerMetaLeadWorker"

key-decisions:
  - "MC3-02: leadgen_id extracted via regex on raw body BEFORE JSON.parse — Pitfall 1 (15-16 digit int exceeds Number.MAX_SAFE_INTEGER)"
  - "MC3-02: getWhatsAppAppSecret + getWhatsAppVerifyToken reused for Leadgen webhook — same Facebook App, same credentials (D-11)"
  - "MC3-02: ingestMetaLead signature takes formId as optional param — passed from queue handler for message payload context"
  - "MC3-02: phone normalized via minimal E.164 strip (prepend +, remove non [+\\d]) — no normalize-phone import (worker boundary); real-world formats (+44 7700 900000) handled"
  - "MC3-02: messages row inserted with kind:'meta_lead_ad' (Claude's Discretion — parity with form_submission; coach sees lead source in inbox thread)"
  - "MC3-02: meta_lead_attribution upsert uses COALESCE(EXCLUDED.meta_lead_id, ...) — preserves existing meta_lead_id if row exists before ingest"

# Metrics
duration: ~7min
completed: 2026-06-24
---

# Phase MC3 Plan 02: Meta Lead Ads Leadgen Webhook + Worker Ingest Summary

**Signature-verified Leadgen webhook at the edge (verify + idempotency + enqueue) and a worker handler that retrieves field_data from Graph v23 and ingests it as a member + lead conversation with meta_lead_id stored — a sibling of the website-form path that skips Lead CAPI (D-03) and writes opt-in source='meta_lead_ads' (LEAD-03)**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-24T10:55:55Z
- **Completed:** 2026-06-24T11:02:43Z
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `POST /webhooks/meta-lead` verifies the HMAC (same App Secret as WhatsApp — D-11), extracts `leadgen_id` precision-safely via regex on the raw body (Pitfall 1), records idempotency via `insertWebhookEvent({ provider: 'meta_lead', externalId: leadgenId })` (D-12), and enqueues a retrieval job exactly once on first delivery
- `GET /webhooks/meta-lead` echoes `hub.challenge` on mode=subscribe + token match (same handshake as WhatsApp)
- `meta_lead` provider value added to `edge-webhooks/src/lib/db.ts` enum mirror and `idempotency.ts` `WebhookProvider` type (Pitfall 3 avoided)
- `ingestMetaLead()` domain module: field_data → member (dual-unique-key reconcile), upserts lead conversation, inserts messages row with `{kind:'meta_lead_ad'}` payload, upserts `meta_lead_attribution` with `meta_lead_id = leadgenId` (LEAD-01), inserts `whatsapp_opt_in` with `source='meta_lead_ads'` (LEAD-03); NO Lead CAPI enqueue (D-03)
- `registerMetaLeadWorker()`: resolves `META_PAGE_ACCESS_TOKEN` from `app_secrets`, GETs `graph.facebook.com/v23.0/{leadgenId}`, treats code 190 as permanent (no retry), throws on all other errors (including 404/code100 availability lag — Pitfall 5) for pg-boss retry
- `QUEUE_NAMES.META_LEAD` added to `createQueue` loop in `worker/src/index.ts`; `registerMetaLeadWorker(boss)` registered after the CAPI sender
- `tsc --noEmit` clean on both `services/edge-webhooks` and `services/worker`; 152/152 worker tests pass

## Task Commits

1. **Task 1: edge-webhooks meta_lead provider + Leadgen route** — `6b353a37`
2. **Task 2: worker meta-lead-ingest — dual-key reconcile + meta_lead_id + opt-in** — `e54a9c9a`
3. **Task 3: worker META_LEAD queue handler + index wiring** — `2ba47c0f`

## Files Created/Modified

**Created:**
- `services/edge-webhooks/src/routes/meta-lead.ts` — POST + GET /webhooks/meta-lead (verify + idempotency + enqueue)
- `services/worker/src/domain/meta-lead-ingest.ts` — `ingestMetaLead()` (dual-key reconcile, meta_lead_id, opt-in, NO Lead CAPI)
- `services/worker/src/queues/meta-lead.ts` — `registerMetaLeadWorker()` (Graph retrieval, retry, permanent-token detection)

**Modified:**
- `services/edge-webhooks/src/lib/db.ts` — `webhookEvents.provider` enum extended with `"meta_lead"`
- `services/edge-webhooks/src/lib/idempotency.ts` — `WebhookProvider` type extended with `"meta_lead"`
- `services/edge-webhooks/src/server.ts` — `app.route("/webhooks", metaLeadRoutes)` added
- `services/worker/src/index.ts` — `QUEUE_NAMES.META_LEAD` in `createQueue` loop; `registerMetaLeadWorker(boss)` registration

## Decisions Made

- `leadgen_id` extracted via regex on the raw body (`/"leadgen_id"\s*:\s*"?(\d+)"?/`) BEFORE `JSON.parse()` — prevents silent precision loss for 15-16 digit integers (Pitfall 1). Single-change assumption documented in a comment (Meta sends one change per POST in practice).
- `getWhatsAppAppSecret` and `getWhatsAppVerifyToken` reused directly for the Leadgen webhook — same Facebook App credentials, no new secret resolver needed (D-11).
- `ingestMetaLead` receives `formId` as an optional parameter (passed from the queue handler) so the `messages` row payload carries full context for the coach inbox.
- Phone normalization in the worker: strip non `[+\d]` characters, prepend `+` — handles `+44 7700 900000` → `+447700900000`. No external normalize-phone import (worker boundary constraint).
- `meta_lead_attribution` upsert uses `COALESCE(EXCLUDED.meta_lead_id, meta_lead_attribution.meta_lead_id)` to preserve an existing `meta_lead_id` if the attribution row pre-existed (lifecycle event fired before ingest).
- `messages` row inserted with `{kind:'meta_lead_ad', leadgenId, formId, fieldData}` payload — Claude's Discretion pick for parity with `form_submission` (coach sees lead source in inbox thread).

## Deviations from Plan

None — plan executed exactly as written. The `formId` parameter added to `ingestMetaLead()` is a minor additive extension that improves the message payload context (Claude's Discretion, explicitly permitted in CONTEXT.md).

## D-Constraint Compliance

| Decision | Status |
|----------|--------|
| D-03: NO Lead CAPI enqueue on ingest | Honored — explicit comment in ingestMetaLead; `enqueueMetaCapiEvent` not imported |
| D-07: Identity-less leads parked, POST still 200 | Honored — `ingestMetaLead` returns `undefined`; edge route always returns 200 after verify |
| D-08: Page token from app_secrets key 'META_PAGE_ACCESS_TOKEN' | Honored — `readAppSecretByKey("META_PAGE_ACCESS_TOKEN", db)` in queue handler |
| D-09: Page subscription is an operator step | Documented in ops note comment in `meta-lead.ts` queue handler |
| D-10: edge verifies + enqueues; worker retrieves + ingests | Honored — architecture maintained |
| D-11: Same HMAC scheme as WhatsApp | Honored — `getWhatsAppAppSecret` + `getWhatsAppVerifyToken` reused |
| D-12: Idempotency on leadgen_id, provider='meta_lead' | Honored — `insertWebhookEvent({ provider: 'meta_lead', externalId: leadgenId })` |
| LEAD-03: WhatsApp follow-up via existing chokepoint | Honored — opt-in row written; NO new outbound path added |
| MC1-03: Worker never imports apps/staff-web schema | Honored — all DB access is raw `db.execute(sql\`...\`)` with `guard:allow-unscoped` |

## Operator Setup Required Before Live Traffic

**The following steps must be completed before real Meta Lead Ads traffic can be processed:**

1. **Page access token in Settings** — Enter the Page access token as `META_PAGE_ACCESS_TOKEN` in `/gymos/settings/integrations` → "Meta Conversion Tracking" card. The token must be from a user with **Leads Access** on the Page (not just Page Admin).

2. **Page subscription** — Subscribe the Facebook App to the Page's `leadgen` field:
   ```
   POST https://graph.facebook.com/v23.0/{PAGE_ID}/subscribed_apps
     ?access_token={PAGE_ACCESS_TOKEN}
     &subscribed_fields=leadgen
   ```
   Or via Meta App Dashboard → Products → Webhooks → Subscribe to Page / `leadgen` field.

3. **App permissions** — The Facebook App needs `leads_retrieval` + `pages_manage_ads` permissions. These may require Meta App Review (submit for review in the App Dashboard). Allow 5-7 business days.

4. **Token type recommendation** — For production stability, use a **Business Manager System User token** (does not expire, tied to the business, not a personal account). Long-lived Page tokens from a personal account can be invalidated if the user changes their password or revokes app permission.

5. **Migration v34 must be applied** (if not already done via MC3-01 deployment) — `meta_lead_attribution.meta_lead_id TEXT` column required:
   ```sql
   ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT;
   ```

## Known Stubs

None — all referenced paths are fully wired. `META_PAGE_ACCESS_TOKEN` being absent causes a clean unconfigured-skip (log.warn + return), not a stub.

## Self-Check

Files created/exist:
- `services/edge-webhooks/src/routes/meta-lead.ts` — exists (created Task 1)
- `services/worker/src/domain/meta-lead-ingest.ts` — exists (created Task 2)
- `services/worker/src/queues/meta-lead.ts` — exists (created Task 3)

Commits verified: `6b353a37`, `e54a9c9a`, `2ba47c0f` — all on master branch.
