---
phase: MC1-foundation-lead-event
verified: 2026-06-23T12:30:00Z
updated: 2026-06-23T12:45:00Z
status: human_needed
score: 8/8 must-haves verified
resolved_gaps:
  - truth: "On send result the worker writes back lead_status + lead_sent_at on meta_lead_attribution via raw parameterized SQL"
    status: resolved
    reason: "Worker UPDATE statements referenced a 'last_error' column absent from the v32 DDL/Drizzle schema — every write-back would have Postgres-errored. RESOLVED by gap-fix commit c7e5af91: migration v33 (ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS last_error TEXT) + lastError: text(\"last_error\") on the metaLeadAttribution Drizzle export. Worker column name 'last_error' confirmed matching."
    fix_commit: c7e5af91
human_verification:
  - test: "Submit form and observe in Meta Events Manager Test Events"
    expected: "One deduplicated Lead event appears (browser + server counted once), fbc populated when parent URL had fbclid"
    why_human: "Requires a live Vercel deploy with configured Pixel ID + CAPI token + Test Event Code and a real Meta Events Manager session to confirm dedup"
  - test: "D-03 BETTER_AUTH_SECRET parity: fly secrets list -a <worker-app> then compare to Vercel BETTER_AUTH_SECRET"
    expected: "Values are byte-for-byte identical and boot self-test logs '[worker] boot self-test: app_secrets decrypt OK'"
    why_human: "Requires reading Fly and Vercel environment variables directly — not verifiable from codebase; deferred per MC1-03-SUMMARY"
  - test: "5xx retry behavior against live Meta Graph API"
    expected: "A simulated 5xx from Meta causes pg-boss to retry up to 5 times with backoff; lead_status eventually flips to 'sent' on success or 'failed' on final attempt"
    why_human: "Requires simulating Meta API failures in a live Fly worker environment"
  - test: "Operator walkthrough: enter Pixel ID + token + Test Event Code in /gymos/settings/integrations, click Save, then Send test event"
    expected: "Badge shows 'Configured — no sends yet' after save; 'Test event queued' message appears; Meta Test Events tab shows a Lead within 30s; badge flips to 'Active' on reload"
    why_human: "Requires a deployed Vercel + Fly environment with a connected Meta account"
---

# Phase MC1: Foundation + Lead Event — Verification Report

**Phase Goal:** A public-form submission fires a deduplicated `Lead` to the studio's own Meta Pixel (browser + server), with ad-click attribution captured across the iframe boundary and durable server-side retry — all configured by the operator in Settings, provable end-to-end in Meta's Test Events.

**Verified:** 2026-06-23T12:30:00Z (gap-fix re-checked 12:45:00Z)
**Status:** human_needed (all code-verifiable must-haves pass; only deploy-time/Meta-live checks remain)
**Re-verification:** Yes — `last_error` gap closed by commit c7e5af91

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `studio_owner_config` has `meta_pixel_id`, `meta_test_event_code`, `meta_stage_event_map` columns | VERIFIED | Migration v31 (db.ts line 389-393); schema.ts lines 661-663 |
| 2 | `meta_lead_attribution` table exists keyed uniquely by `member_id` | VERIFIED | Migration v32 (db.ts lines 395-414); schema.ts line 733-749 with `.notNull().unique()` on memberId |
| 3 | `stageEventMap` resolver returns 4 defaults when config is null, honors overrides | VERIFIED | `server/lib/stage-event-map.ts` + 18-test Vitest suite (SUMMARY reports ALL PASS) |
| 4 | `META_CAPI_TOKEN` is a registered required secret | VERIFIED | `register-secrets.ts` line 184 inside `registerRequiredSecret` |
| 5 | `META_CAPI_EVENT` queue + `MetaCapiEventPayload` Zod schema + `enqueueMetaCapiEvent` with singletonKey on `event_id` | VERIFIED | `packages/queue/src/types.ts` line 11, 100-118; `publish.ts` line 96-106 with singletonKey on `data.eventId`; re-exported from barrel and queue-client |
| 6 | Worker POSTs to Graph v23 with correct payload, `test_event_code` top-level, correct error split, token never logged | VERIFIED | `meta-capi-event.ts` has Graph v23 endpoint (line 156), top-level `test_event_code` (line 151), `is_transient`/`code 190` split (lines 200-210), `includeMetadata:true` final-attempt isolation, no `log.*token` value calls |
| 7 | Worker write-back to `meta_lead_attribution` via raw parameterized SQL with `guard:allow-unscoped` | VERIFIED (gap-fixed) | `last_error` column added by migration v33 + Drizzle `lastError: text("last_error")` (commit c7e5af91); worker column name confirmed matching. Write-back UPDATEs now resolve |
| 8 | embed.js + public form + submissions.ts wiring: fbclid threading, Pixel load, shared event_id, unconditional CAPI enqueue (D-14) | VERIFIED | embed-snippet.ts has `readCookie`+`buildAttributionParams`+`fb.1.` synthesis; public-form-ssr.ts has `fbq('init')`, `fbq('track','Lead')` with `eventID: EVENT_ID` generated before fetch; submissions.ts has `hashForCapi`, `effectiveEventId = metaEventId ?? nanoid()`, unconditional `enqueueMetaCapiEvent` call, no `if(metaEventId)` gate |

**Score:** 8/8 truths verified (truth #7 closed by gap-fix commit c7e5af91)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/staff-web/server/plugins/db.ts` | VERIFIED | v31 (meta config columns) and v32 (meta_lead_attribution) present; strictly additive; no DROP/RENAME |
| `apps/staff-web/server/db/schema.ts` | VERIFIED | `metaLeadAttribution` exported with all required columns; `studioOwnerConfig` has 3 new meta columns |
| `apps/staff-web/server/lib/stage-event-map.ts` | VERIFIED | Exports `resolveStageEvent` and `DEFAULT_STAGE_EVENT_MAP`; accepts string/object/null; never throws |
| `apps/staff-web/server/lib/stage-event-map.test.ts` | VERIFIED | 18 tests covering all behavior cases |
| `apps/staff-web/server/register-secrets.ts` | VERIFIED | `META_CAPI_TOKEN` registered via `registerRequiredSecret` |
| `packages/queue/src/types.ts` | VERIFIED | `META_CAPI_EVENT: "meta-capi-event"` in QUEUE_NAMES; `MetaCapiEventPayload` with `eventTime: z.number().int()` |
| `packages/queue/src/publish.ts` | VERIFIED | `enqueueMetaCapiEvent` with `singletonKey: meta-capi-event:${data.eventId}`, `retryLimit: 5`, `retryBackoff: true` |
| `apps/staff-web/app/lib/queue-client.ts` | VERIFIED | Re-exports `enqueueMetaCapiEvent` from `@gymos/queue` |
| `services/worker/src/queues/meta-capi-event.ts` | PARTIAL | All CAPI logic correct EXCEPT write-back UPDATE statements reference non-existent `last_error` column |
| `services/worker/src/lib/stage-event-map.ts` | VERIFIED | Worker-local copy of resolver; accepts string OR object; defaults correct |
| `services/worker/src/index.ts` | VERIFIED | `META_CAPI_EVENT` in createQueue loop; `registerMetaCapiEventWorker` registered; boot self-test for BETTER_AUTH_SECRET drift present |
| `apps/staff-web/features/forms/lib/embed-snippet.ts` | VERIFIED | `readCookie`, `buildAttributionParams`, `fb.1.` synthesis, iframe src appended |
| `apps/staff-web/features/forms/lib/public-form-ssr.ts` | VERIFIED | Pixel base code injected with sanitized pixelId; `EVENT_ID` generated before fetch; fbq Lead with `eventID: EVENT_ID`; POST body carries `event_id/fbc/fbp/fbclid/page_url` |
| `apps/staff-web/features/forms/handlers/submissions.ts` | VERIFIED | `hashForCapi`, `effectiveEventId = metaEventId ?? nanoid()`, meta_lead_attribution upsert, unconditional `enqueueMetaCapiEvent` |
| `apps/staff-web/server/lib/meta-capi-test-send.ts` | VERIFIED | Exports `enqueueMetaTestLead`; ENQUEUES (no `graph.facebook.com`); token presence-check only; Unix-second `eventTime` |
| `apps/staff-web/app/routes/gymos.settings.integrations.tsx` | VERIFIED | `save-meta-config`, `rotate-meta-token`, `send-meta-test-event` intents; loader returns `meta` object with `tokenConfigured` by-key; `writeAppSecret` with `scope: "workspace", scopeId: "global"` on both write paths; Meta Conversion Tracking card with `IconAd2`, status badge, masked token, optimistic fetchers |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `studio_owner_config.meta_pixel_id` | `renderFormPage pixelId` | `renderPublicFormHtml` raw sql select + parameter thread | WIRED | public-form-ssr.ts line 270 resolves pixel_id and passes to renderFormPage |
| `public-form-ssr.ts EVENT_ID` | `submissions.ts body.event_id` | POST body field shared with fbq eventID | WIRED | EVENT_ID generated line 616; passed in body line 626; read in submissions.ts line 463 |
| `submissions.ts` | `meta_lead_attribution + meta-capi-event queue` | upsert + `enqueueMetaCapiEvent` | WIRED | Lines 492-539 in submissions.ts; unconditional enqueue with try/catch |
| `enqueueMetaCapiEvent` | `QUEUE_NAMES.META_CAPI_EVENT` | `boss.send` with singletonKey on `eventId` | WIRED | publish.ts line 102 |
| `meta-capi-event.ts handler` | `Meta Graph CAPI v23` | `fetch POST` with `access_token` query param | WIRED | Line 156: `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${token}` |
| `meta-capi-event.ts handler` | `studio_owner_config + app_secrets` | `readAppSecretByKey` + raw sql config read | WIRED | Lines 65-100: config read then token decrypt |
| `send-meta-test-event intent` | `meta-capi-event queue (worker sole sender)` | `enqueueMetaTestLead` | WIRED | Settings route calls `enqueueMetaTestLead`; no direct Meta call in staff-web |
| `writeAppSecret scope:workspace scopeId:global` | Same `app_secrets` row on save + rotate | Same fixed `(scope, scope_id, key)` tuple | WIRED | Both intents use `scope:"workspace", scopeId:"global"` — UPSERT always hits same row (D-11) |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `public-form-ssr.ts` | `pixelId` | `studio_owner_config.meta_pixel_id` via raw sql | Yes — reads live DB row | FLOWING |
| `submissions.ts` | `effectiveEventId` | `body.event_id ?? nanoid()` | Yes — always populated | FLOWING |
| `submissions.ts` | `hashedEmail/Phone` | `createHash('sha256').update(normalized)` | Yes — computed from form body | FLOWING |
| `meta-capi-event.ts` | `token` | `readAppSecretByKey("META_CAPI_TOKEN", db)` | Yes — reads app_secrets (when BETTER_AUTH_SECRET matches) | FLOWING (deploy-gated) |
| `gymos.settings.integrations.tsx` | `meta.tokenConfigured` | `readAppSecretByKey("META_CAPI_TOKEN") !== null` | Yes — by-key presence check | FLOWING |
| `meta-capi-event.ts` | write-back `lead_status` | UPDATE meta_lead_attribution ... SET lead_status, last_error | No — `last_error` column missing from DDL; UPDATE fails with Postgres error | DISCONNECTED |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — no running server available locally (NitroViteError, per SUMMARY notes). All key behaviors have been statically verified. Behavioral confirmation is deferred to deploy-time human verification.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PIX-01 | MC1-04 | Public form loads studio Pixel + fires browser Lead sharing event_id | SATISFIED | `fbq('init', pixelId)` + `fbq('track', 'Lead', {}, { eventID: EVENT_ID })` in public-form-ssr.ts |
| PIX-02 | MC1-04 | `embed.js` reads `fbclid`+`_fbc`/`_fbp` from parent page and passes into iframe | SATISFIED | `readCookie` + `buildAttributionParams` + fbc synthesis in embed-snippet.ts |
| CAPI-01 | MC1-01, MC1-05 | Studio Meta config storage + stageEventMap resolver + META_CAPI_TOKEN as app_secret | SATISFIED | v31 columns on studio_owner_config; register-secrets.ts; writeAppSecret in settings intents |
| CAPI-02 | MC1-01 | `meta_lead_attribution` table keyed by member_id | SATISFIED | v32 migration; metaLeadAttribution Drizzle export with `memberId.notNull().unique()` |
| CAPI-03 | MC1-04 | `/api/submit` persists fbc/fbp/event_id/pageUrl + enqueues meta-capi-event (no direct Meta call) | SATISFIED | submissions.ts reads all attribution fields; unconditional enqueueMetaCapiEvent; no graph.facebook.com reference |
| CAPI-04 | MC1-02, MC1-03 | pg-boss queue + Fly worker POSTs to Graph v23 with hashed PII, retrying on 5xx; per-event isolation | PARTIALLY SATISFIED | Queue contract wired; worker handler structurally correct (endpoint, error split, retries, isolation). BLOCKED in production: write-back UPDATE statements will fail (last_error column missing) — but this affects status persistence only, not the actual CAPI POST or retry logic. The Meta send itself proceeds; only the DB write-back is broken. |
| CAPI-05 | MC1-04 | Browser Lead + server Lead share identical event_id for Meta dedup | SATISFIED | EVENT_ID generated before fetch, passed in body, used in `fbq('track','Lead',{},{eventID:EVENT_ID})` |
| CAPI-06 | MC1-05 | Meta Conversion Tracking card in Settings with Pixel ID + masked token + status + test-send | SATISFIED | Card present with all 3 intents, by-key token presence, status badge, optimistic UI, test send enqueues to worker |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `services/worker/src/queues/meta-capi-event.ts` | 184, 226, 244, 269 | `SET last_error = ...` in UPDATE statements — column not in v32 DDL | BLOCKER | Every write-back to `meta_lead_attribution` fails with Postgres column-not-found error; `lead_status` and `lead_sent_at` never get updated; Settings health badge stays "never sent" forever; D-09 last-send health is permanently broken until the column is added |

---

## Human Verification Required

### 1. Meta Test Events — End-to-End Dedup Proof

**Test:** Deploy to Vercel + Fly. Configure studio in Settings with Pixel ID, CAPI token, Test Event Code. Visit a page with `?fbclid=<test>` containing the embed form. Submit the form. Open Meta Events Manager → Test Events tab.

**Expected:** One Lead event appears (not two). Event Match Quality shows `fbc` populated from the synthesized `fb.1.<ts>.<fbclid>` value.

**Why human:** Requires a live Meta account, deployed Vercel instance, and real-time Meta Events Manager session. The dedup count (1 vs 2) is the definitive success criterion for CAPI-05 and cannot be verified from code alone.

### 2. BETTER_AUTH_SECRET Parity Check (D-03)

**Test:** Run `fly secrets list -a <worker-app>`, compare the `BETTER_AUTH_SECRET` to the Vercel Production env var value. Confirm they are byte-for-byte identical. After the next Fly restart, run `fly logs -a <worker-app>` and look for `[worker] boot self-test: app_secrets decrypt OK`.

**Expected:** The secret values match; the boot self-test logs "decrypt OK" (not the BOOT SELF-TEST error). If the self-test shows a failure, the `META_CAPI_TOKEN` decrypt will return null and every CAPI send silently skips.

**Why human:** `fly secrets list` shows only a digest, not the plaintext; Vercel env var values are not readable from code; deferred as a deploy-time gate per MC1-03-SUMMARY.

### 3. Retry Behavior Under 5xx

**Test:** Temporarily configure the worker to hit a non-existent endpoint (or intercept at the network layer) and confirm pg-boss retries the job with backoff up to 5 times before writing `lead_status = 'failed'`.

**Expected:** pg-boss job shows retry count incrementing; final attempt writes `lead_status = 'failed'` and does not crash the worker process.

**Why human:** Requires live Fly worker environment and simulated Meta API failures; not testable from the codebase.

### 4. Operator Settings Walkthrough (CAPI-06)

**Test:** Operator navigates to `/gymos/settings/integrations`. Enters Pixel ID (numeric), Test Event Code (e.g. `TEST12345`), and pastes the CAPI token. Clicks Save. Clicks "Send test event".

**Expected:** Card badge shows "Configured — no sends yet" after save. "Test event queued — check Meta Events Manager → Test Events in ~30s" message appears with an `eventId`. Meta Test Events tab shows a Lead within ~30 seconds. Reloading Settings shows badge "Active".

**Why human:** Requires a deployed Vercel + running Fly worker + configured Meta Pixel. The test proves the full token+pixel+worker path (D-10) including the masked-token reveal UX.

---

## Gaps Summary

**One code-level blocker found** blocking full goal achievement:

The `meta_lead_attribution` table's v32 DDL (and corresponding Drizzle schema) does not include a `last_error TEXT` column, but all four UPDATE write-back paths in `services/worker/src/queues/meta-capi-event.ts` (lines 184, 226, 244, 269) attempt to SET this column. When the worker sends a CAPI event — success or failure — Postgres will reject the UPDATE with `column "last_error" of relation "meta_lead_attribution" does not exist`. The actual Meta Graph API POST proceeds correctly; only the status write-back is broken.

**Practical consequences:**
- `lead_status` never gets written to `'sent'` or `'failed'` for any CAPI send
- `lead_sent_at` never gets written
- The Settings card health badge (`lastSendStatus`) always shows "never sent"
- The D-09 requirement (config completeness AND last-send health status) is broken in production

**Fix required (additive, no drop/rename):**
1. Add a migration v33 to `apps/staff-web/server/plugins/db.ts`: `ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS last_error TEXT;`
2. Add `lastError: text("last_error")` to the `metaLeadAttribution` export in `apps/staff-web/server/db/schema.ts`

All other code-verifiable must-haves for PIX-01, PIX-02, CAPI-01, CAPI-02, CAPI-03, CAPI-04 (send path only), CAPI-05, CAPI-06 are correctly implemented and wired. The remaining verification items (dedup proof in Test Events, BETTER_AUTH_SECRET parity, retry simulation, operator walkthrough) are deploy-time human checks as specified in the verification focus.

---

_Verified: 2026-06-23T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
