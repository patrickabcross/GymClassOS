---
phase: MC3-meta-lead-ads-crm-lifecycle
verified: 2026-06-24T00:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
human_verification:
  - test: "Submit a test lead via Meta's Lead Ads Testing Tool"
    expected: "lead appears in /gymos inbox as status='lead' conversation; worker logs show [meta-lead] ingested; meta_lead_id stored on attribution row; Contact/Purchase/Schedule CAPI events carry user_data.lead_id once member engages"
    why_human: "Requires a live Meta App with leadgen webhook subscription, Page access token in app_secrets, and the edge-webhooks Fly deployment to be reachable from Meta — cannot simulate programmatically"
  - test: "Apply migration v34 to gymos-demo Neon DB"
    expected: "ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT executes without error; column visible in DB"
    why_human: "Migration-drift gotcha: db.ts runMigrations is NOT auto-run; must be applied by hand after deploy (documented in MEMORY.md)"
  - test: "Enter META_PAGE_ACCESS_TOKEN in Settings → Meta Conversion Tracking → Page Access Token (Lead Ads)"
    expected: "Card shows 'Lead Ads: connected'; worker resolves the token at execution time via readAppSecretByKey"
    why_human: "Requires a real Page access token and a running Vercel deployment with the operator settings UI"
---

# Phase MC3: Meta Lead Ads + CRM Lifecycle Verification Report

**Phase Goal:** Leads captured inside Facebook/Instagram (Instant Forms) land in the studio DB and advance through the same lifecycle reported back to Meta's Leads Center via lead_id, so in-platform leads get the same deep-funnel optimisation as website-form leads.
**Verified:** 2026-06-24
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A signed Meta Leadgen webhook is signature-verified, idempotency-recorded on leadgen_id (as STRING to avoid precision loss), and enqueues a retrieval job exactly once | VERIFIED | `services/edge-webhooks/src/routes/meta-lead.ts` lines 64-146: `const raw = await c.req.text()` is the first statement; `verifySignature(raw, sigHeader, appSecret)` on line 74; leadgen_id extracted via regex before JSON.parse (line 108); `insertWebhookEvent({ provider: "meta_lead", ... })` + `if (result.inserted) { await enqueueMetaLead(...) }` pattern lines 119-140 |
| 2 | The worker retrieves field_data via Graph GET /{leadgen_id}, reconciles a member via dual-unique-key, stores meta_lead_id, writes opt-in source='meta_lead_ads', does NOT enqueue a Lead CAPI event | VERIFIED | `services/worker/src/domain/meta-lead-ingest.ts`: byEmail/byPhone dual-key reconcile lines 112-181; meta_lead_attribution INSERT with meta_lead_id lines 242-248; whatsapp_opt_in INSERT with source='meta_lead_ads' lines 256-265; explicit D-03 comment line 267: "NO Lead CAPI enqueue"; `enqueueMetaCapiEvent` does not appear in the file |
| 3 | A Contact/Purchase/Schedule CAPI event for a member with a stored meta_lead_id carries user_data.lead_id as a plain unhashed string; a member without one is unchanged | VERIFIED | `meta-capi-event.ts` line 134: `if (data.leadId) userData.lead_id = data.leadId;`; `metaLifecycle.ts` lines 154-172: SELECT includes `meta_lead_id`; returns `metaLeadId` field; `fireContactCapiIfFirstReply` passes `leadId: attr.metaLeadId` (line 236); `checkout-session-completed.ts` line 134: `leadId: attr.metaLeadId`; `invoice-paid.ts` line 131: `leadId: attr.metaLeadId`; `mark-booking-attended.ts` line 138: `leadId: (attrTyped.meta_lead_id as string | null) ?? undefined` |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/queue/src/types.ts` | QUEUE_NAMES.META_LEAD, MetaLeadPayload, leadId? on MetaCapiEventPayload | VERIFIED | Line 13: `META_LEAD: "meta-lead"`; lines 126: `leadId: z.string().optional()`; lines 140-146: `MetaLeadPayload` with leadgenId/formId/pageId/adId |
| `packages/queue/src/publish.ts` | enqueueMetaLead() with retryLimit:5, no singletonKey | VERIFIED | Lines 116-126: `export async function enqueueMetaLead`; `retryLimit: 5, retryBackoff: true, expireInSeconds: 60 * 60`; no singletonKey in the function body |
| `apps/staff-web/server/db/schema.ts` | metaLeadId column, 'meta_lead_ads' enum value, 'meta_lead' provider enum | VERIFIED | Line 751: `metaLeadId: text("meta_lead_id")`; line 416: includes `"meta_lead_ads"`; line 389: includes `"meta_lead"` in provider enum |
| `apps/staff-web/server/plugins/db.ts` | Migration v34 adding meta_lead_id, additive only | VERIFIED | Lines 438-440: `version: 34, sql: "ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT"`; no DROP/RENAME/TRUNCATE |
| `services/worker/src/queues/meta-capi-event.ts` | user_data.lead_id injection when payload.leadId present | VERIFIED | Line 134: `if (data.leadId) userData.lead_id = data.leadId;` with comment "MC3 (LEAD-02): in-platform Lead Ad lead_id — PLAIN string, NOT hashed" |
| `services/worker/src/domain/metaLifecycle.ts` | getOrUpsertAttribution returns metaLeadId; Contact passes leadId | VERIFIED | Lines 154-155: SELECT includes `meta_lead_id`; lines 142-172: return type includes `metaLeadId?: string`; line 236: `leadId: attr.metaLeadId` in enqueueMetaCapiEvent call |
| `services/edge-webhooks/src/routes/meta-lead.ts` | POST + GET /meta-lead — raw-body verify, idempotency, enqueue | VERIFIED | Exists at 148 lines; `verifySignature` on line 74; `enqueueMetaLead` on line 127; `"leadgen"` on line 98; leadgen_id regex on line 108; `await c.req.text()` is line 64 (first statement in POST handler) |
| `services/edge-webhooks/src/lib/db.ts` | provider enum includes "meta_lead" | VERIFIED | Line 28: `{ enum: ["stripe", "whatsapp", "meta_lead"] }` |
| `services/edge-webhooks/src/lib/idempotency.ts` | WebhookProvider includes "meta_lead" | VERIFIED | Line 3: `export type WebhookProvider = "stripe" \| "whatsapp" \| "meta_lead";` |
| `services/edge-webhooks/src/server.ts` | metaLeadRoutes registered | VERIFIED | Line 4: `import { metaLeadRoutes }` ; line 29: `app.route("/webhooks", metaLeadRoutes)` |
| `services/worker/src/domain/meta-lead-ingest.ts` | dual-key reconcile, meta_lead_id, opt-in source='meta_lead_ads', no Lead CAPI enqueue, guard:allow-unscoped | VERIFIED | All present; `enqueueMetaCapiEvent` absent; 12 guard:allow-unscoped markers; no import from apps/staff-web |
| `services/worker/src/queues/meta-lead.ts` | META_LEAD handler, Graph v23 retrieval, code-190 permanent, retryable on other errors | VERIFIED | Line 83: `graph.facebook.com/v23.0/${data.leadgenId}`; line 70: `readAppSecretByKey("META_PAGE_ACCESS_TOKEN")`; lines 104-112: code 190 permanent return; line 128: throw for all other non-200 |
| `services/worker/src/index.ts` | META_LEAD in createQueue loop + registerMetaLeadWorker called | VERIFIED | Line 56: `QUEUE_NAMES.META_LEAD` in createQueue array; lines 121-122: `await registerMetaLeadWorker(boss)` |
| `apps/staff-web/app/routes/gymos.settings.integrations.tsx` | META_PAGE_ACCESS_TOKEN save/read, hasPageToken, masked input, never prefilled | VERIFIED | 3 occurrences of META_PAGE_ACCESS_TOKEN (loader read line 157-158, writeAppSecret line 394); `hasPageToken` lines 105/157/184; `name="pageToken"` type="password" line 862; no `value=` on the input element |
| `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md` | Operator runbook with leadgen, Page token, leads_retrieval, /webhooks/meta-lead | VERIFIED | Exists; contains all required items; covers token entry, webhook subscription, permissions, signing, verification, troubleshooting |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| edge-webhooks/routes/meta-lead.ts | enqueueMetaLead (MC3-01) | enqueue only when insertWebhookEvent inserted===true | WIRED | Line 126: `if (result.inserted) { await enqueueMetaLead({...}) }` |
| services/worker/src/queues/meta-lead.ts | Meta Graph v23 GET /{leadgen_id} | fetch with Page access token from app_secrets | WIRED | Line 83: `graph.facebook.com/v23.0/${data.leadgenId}?access_token=${pageToken}` |
| services/worker/src/domain/meta-lead-ingest.ts | meta_lead_attribution.meta_lead_id + whatsapp_opt_in.source='meta_lead_ads' | raw SQL upsert with guard:allow-unscoped | WIRED | Lines 242-265: attribution upsert with leadgenId + opt-in INSERT with 'meta_lead_ads' |
| lifecycle fire points (Contact/Purchase/Schedule) | meta_lead_attribution.meta_lead_id | getOrUpsertAttribution SELECT + enqueueMetaCapiEvent({ leadId }) | WIRED | metaLifecycle.ts SELECT includes meta_lead_id; returns metaLeadId; all four fire points pass leadId |
| services/worker/src/queues/meta-capi-event.ts | Meta Graph v23 user_data | if (data.leadId) userData.lead_id = data.leadId | WIRED | Line 134 confirmed |
| Settings card Page token field | app_secrets META_PAGE_ACCESS_TOKEN | writeAppSecret({ key: 'META_PAGE_ACCESS_TOKEN' }) | WIRED | Lines 392-397: `if (pageToken) { await writeAppSecret({ key: "META_PAGE_ACCESS_TOKEN", ... }) }` |
| MC3-02 worker meta-lead handler | META_PAGE_ACCESS_TOKEN | readAppSecretByKey('META_PAGE_ACCESS_TOKEN') | WIRED | Line 70: `const pageToken = await readAppSecretByKey("META_PAGE_ACCESS_TOKEN", db)` |

### CLAUDE.md Compliance Checks

| Check | Status | Evidence |
|-------|--------|---------|
| Additive migration only (no DROP/RENAME/push) | VERIFIED | Migration v34: `ADD COLUMN IF NOT EXISTS meta_lead_id TEXT` only; no destructive SQL |
| guard:allow-unscoped on worker raw SQL | VERIFIED | 12 markers across meta-lead-ingest.ts; markers also present in meta-capi-event.ts and metaLifecycle.ts |
| Worker does NOT import from apps/staff-web | VERIFIED | No `import.*apps/staff-web` in meta-lead-ingest.ts or meta-lead.ts (worker queue handler) |
| Repeatable-per-client: META_PAGE_ACCESS_TOKEN resolved by key from app_secrets | VERIFIED | readAppSecretByKey("META_PAGE_ACCESS_TOKEN", db) — no HUSTLE hardcoding anywhere in MC3 files |
| 'meta_lead' enum in BOTH staff-web schema.ts and edge-webhooks db.ts mirror | VERIFIED | schema.ts line 389; edge-webhooks db.ts line 28 — both include "meta_lead" |
| 'meta_lead_ads' in whatsappOptIn.source enum | VERIFIED | schema.ts line 416 |
| Page token never prefilled into input value (masked) | VERIFIED | Input is `type="password"` with no `value=` attribute; masked replacement UI for configured state |
| No HUSTLE hardcoding in MC3 files | VERIFIED | No occurrences of "HUSTLE" in edge-webhooks/routes/meta-lead.ts, worker/domain/meta-lead-ingest.ts, worker/queues/meta-lead.ts |

### D-03 Anti-Double-Count Compliance

| Check | Status | Evidence |
|-------|--------|---------|
| meta-lead-ingest.ts contains NO enqueueMetaCapiEvent | VERIFIED | grep returned no matches; explicit D-03 comment at line 267 |
| meta-lead-ingest.ts does NOT enqueue a Lead CAPI event | VERIFIED | Only DB writes (member reconcile, conversation, attribution, opt-in); no queue import |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LEAD-01 | MC3-02 + MC3-03 | Meta Lead Ads submissions received, signature-verified, ingested as gym_members + lead conversations with meta_lead_id | SATISFIED | edge-webhooks route (HMAC + idempotency + enqueue); worker handler (Graph retrieval + ingestMetaLead); Settings UI (META_PAGE_ACCESS_TOKEN entry point) |
| LEAD-02 | MC3-01 | Lead-Ad leads advance through Contact/Purchase/Schedule lifecycle reported back to Meta keyed on lead_id | SATISFIED | MetaCapiEventPayload.leadId? field; user_data.lead_id injection in CAPI handler; getOrUpsertAttribution returning metaLeadId; all four fire points passing leadId; migration v34 meta_lead_id column |
| LEAD-03 | MC3-02 | WhatsApp follow-up routes through existing opt-in/window/template chokepoint, no bypass | SATISFIED | ingestMetaLead only writes whatsapp_opt_in with source='meta_lead_ads' (ON CONFLICT DO NOTHING); no new outbound send path added; no direct WhatsApp send in ingest |

REQUIREMENTS.md shows all three (LEAD-01, LEAD-02, LEAD-03) as Complete with Phase MC3 assignment. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | All inspected files contain substantive, wired implementations |

The `enqueueClassReminder` stub in `packages/queue/src/publish.ts` is a pre-existing placeholder from P1b scope (clearly labeled "STUB for P2 NOTIF-01"), not a MC3 artifact.

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| META_LEAD queue name defined in package | `grep 'META_LEAD.*meta-lead' packages/queue/src/types.ts` | `META_LEAD: "meta-lead"` found | PASS |
| enqueueMetaLead exported and has no singletonKey | inspect publish.ts | function exists, no singletonKey in body | PASS |
| raw body before JSON.parse in edge route | `await c.req.text()` is line 64, first statement of POST handler | confirmed | PASS |
| D-03: no Lead CAPI enqueue in ingest path | grep enqueueMetaCapiEvent in meta-lead-ingest.ts | 0 matches | PASS |
| code-190 permanent, other errors retryable | meta-lead.ts lines 104-128 | `return` on code 190; `throw` on all other non-ok | PASS |
| Migration v34 additive | db.ts line 439 | ADD COLUMN IF NOT EXISTS only | PASS |

Step 7b: SKIPPED — integration relies on a live Meta webhook delivery + Fly deployment; cannot exercise end-to-end without external services. All behavioral checks above are static analysis against the code.

### Human Verification Required

**1. End-to-End Lead Ads Pipeline Test**

Test: Submit a test lead via Meta's Lead Ads Testing Tool (Meta App Dashboard → Lead Ads Testing Tool). Submit a form for a Page subscribed to the `leadgen` field on the deployed edge-webhooks endpoint.

Expected: Edge-webhooks logs show HMAC pass + enqueue; worker logs show Graph GET + field_data retrieval + `[meta-lead] ingest complete`; member appears in `/gymos` inbox with status='lead' conversation; `meta_lead_id` stored on the attribution row in DB.

Why human: Requires a live Meta App with page subscription, a valid Page access token in app_secrets, and the edge-webhooks Fly deployment receiving real Meta POST notifications — not simulatable from static code checks alone.

**2. Migration v34 Application**

Test: Run `ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT` against the gymos-demo Neon DB.

Expected: Column added without error; subsequent ingestMetaLead calls write meta_lead_id values to the table.

Why human: Migration-drift gotcha — db.ts runMigrations is NOT auto-run; operator must apply v34 by hand after deploy (documented in MEMORY.md).

**3. Page Access Token Entry and Detection**

Test: Navigate to `/gymos/settings/integrations` → Meta Conversion Tracking card → Page Access Token (Lead Ads) field → paste a valid Page token → Save.

Expected: Card shows "Lead Ads: connected"; `app_secrets` row created under key `META_PAGE_ACCESS_TOKEN`; no prefill of the actual token value visible in the UI after save.

Why human: Requires a running Vercel deployment and a valid Page access token to exercise the full save-and-display cycle.

**4. Operator Page Subscription (D-09)**

Test: Subscribe the Facebook App to the studio Page's `leadgen` field via either the Meta App Dashboard or the Graph API `POST /{PAGE_ID}/subscribed_apps?subscribed_fields=leadgen` call.

Expected: Meta begins delivering leadgen notifications to `/webhooks/meta-lead` on the edge-webhooks host; GET handshake succeeds with the existing WhatsApp verify token.

Why human: Requires access to the Meta App Dashboard and the studio's Facebook Page — manual operator step (D-09 deliberate non-automation, documented in MC3-LEAD-ADS-OPS-NOTE.md).

### Gaps Summary

No implementation gaps found. All must-haves are VERIFIED at all levels (exists, substantive, wired). The only outstanding items are runtime/ops prerequisites that are deliberately not automated (D-09) and the migration-drift gotcha (known project-wide pattern for db.ts migrations):

1. Migration v34 (`meta_lead_id TEXT`) must be applied to gymos-demo Neon by hand after deploy.
2. Operator must enter `META_PAGE_ACCESS_TOKEN` in Settings before the worker can retrieve lead field_data.
3. Operator must subscribe the Facebook App to the Page's `leadgen` field (one-time step, documented in MC3-LEAD-ADS-OPS-NOTE.md).

These are documented human_verification items, not code gaps.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
