---
phase: MC1-foundation-lead-event
plan: 05
subsystem: staff-web-settings
tags: [meta, capi, settings, ui, secrets, studio-config]

# Dependency graph
requires:
  - phase: MC1-foundation-lead-event plan 01
    provides: studio_owner_config.meta_pixel_id/meta_test_event_code + meta_lead_attribution table
  - phase: MC1-foundation-lead-event plan 02
    provides: enqueueMetaCapiEvent() in staff-web queue-client
  - phase: MC1-foundation-lead-event plan 03
    provides: Fly worker as sole CAPI sender (D-01) + lead_status/lead_sent_at write-back

provides:
  - Meta Conversion Tracking card at /gymos/settings/integrations (CAPI-06)
  - save-meta-config intent: Pixel ID + Test Event Code → studio_owner_config; token → app_secrets
  - rotate-meta-token intent: token-only replace (same scope/scopeId row)
  - send-meta-test-event intent: enqueues synthetic Lead via worker (D-01)
  - enqueueMetaTestLead() helper in server/lib/meta-capi-test-send.ts
  - Loader returns meta config + last-send health (D-09)

affects:
  - MC2+ (last-send health visible in UI; token stored via writeAppSecret readable by worker)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Path B presence detection: readAppSecretByKey !== null (by-key, bypasses scoping quirk D-11)"
    - "writeAppSecret with scope=workspace, scopeId=global — single stable row, no competing duplicate"
    - "D-01 pattern: staff-web enqueues, worker is sole CAPI sender (enforced in route + helper)"
    - "Masked token field: configured state shows 'Replace token' reveal; never prefilled (D-11)"
    - "Optimistic useFetcher per concern: metaConfigFetcher + metaTestFetcher separate from Stripe"

key-files:
  created:
    - apps/staff-web/server/lib/meta-capi-test-send.ts
  modified:
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx

key-decisions:
  - "Path B presence detection chosen (not Path A): dist/ is gitignored — editing dist would break next build; readAppSecretByKey !== null is by-key (same D-11 fix) and avoids dist rebuild"
  - "writeAppSecret imported from @agent-native/core (main barrel, already in dist) — not @agent-native/core/secrets (dist not rebuilt)"
  - "D-01 enforced in both helper and route: no fetch to Meta from staff-web; the helper file contains no Meta Graph API URL"
  - "studio_owner_config uses id='singleton' (confirmed from schema.ts); ON CONFLICT (id) upserts the singleton row"

# Metrics
duration: ~30min
completed: 2026-06-23
---

# Phase MC1 Plan 05: Settings Card Summary

**Meta Conversion Tracking settings card — Pixel ID + masked CAPI token (app_secrets) + test-send enqueue — CAPI-06 complete**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-23T11:05:00Z
- **Completed:** 2026-06-23T11:10:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `apps/staff-web/server/lib/meta-capi-test-send.ts` — exports `enqueueMetaTestLead()` which ENQUEUES a synthetic well-formed Lead (SHA-256 hashed email, Unix-seconds eventTime) and NEVER calls the Meta Graph API directly (D-01 enforced)
- Extended `apps/staff-web/app/routes/gymos.settings.integrations.tsx`:
  - **Loader**: reads `meta_pixel_id` + `meta_test_event_code` from `studio_owner_config`, resolves token presence by-key via `readAppSecretByKey !== null` (D-11 scoping fix — any operator login sees correct state), reads last-send health from `meta_lead_attribution.lead_status` (D-09)
  - **save-meta-config**: digits-only Pixel ID + Test Event Code → `studio_owner_config` ON CONFLICT singleton; token (if provided) → `writeAppSecret({key:"META_CAPI_TOKEN", scope:"workspace", scopeId:"global"})` — single stable row (D-02/D-11)
  - **rotate-meta-token**: same fixed scope/scopeId UPSERT, token only
  - **send-meta-test-event**: calls `enqueueMetaTestLead()` — ENQUEUE, no direct Meta API (D-01)
  - **Meta Conversion Tracking card UI**: `IconAd2`, status badge (Active / Last send failed / Configured no sends yet / Not configured), masked token field with "Replace token" reveal, save button with `fetcher.state` optimistic state, test-send result with `eventId`

## Task Commits

1. **Task 1: meta-capi-test-send.ts helper** - `1e9117b7` (feat)
2. **Task 2+3 (combined): route loader/intents + card UI** - `d36a7b2d` + `e08c0981` (feat/chore)

## Files Created/Modified

- `apps/staff-web/server/lib/meta-capi-test-send.ts` — NEW: `enqueueMetaTestLead({ pixelId, memberId })` helper; ENQUEUE only, no Meta Graph API call
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — EXTENDED: loader `meta` object, 3 new action intents, Meta Conversion Tracking card JSX

## Decisions Made

- **Path B presence detection**: `readAppSecretByKey("META_CAPI_TOKEN") !== null` — avoids needing dist rebuild for `appSecretExistsByKey`; is functionally identical (by-key resolve, D-11 fix). The attempted Path A (barrel re-export) was reverted because `packages/core/dist/` is gitignored and tsc uses the dist for `moduleResolution: bundler`.
- **`writeAppSecret` from `@agent-native/core` main barrel**: already in dist/index.js (confirmed). The `@agent-native/core/secrets` subpath was not used because it would need the dist/secrets/index.js to be updated too.
- **`studio_owner_config` pk is `'singleton'`**: confirmed from `apps/staff-web/server/db/schema.ts` line 647 — `id: text("id").primaryKey(), // always 'singleton'`.
- **D-01 enforcement**: `meta-capi-test-send.ts` contains no `graph.facebook.com` reference (verified); route `send-meta-test-event` intent calls only `enqueueMetaTestLead()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Path A barrel re-export caused tsc TS2305 (dist not rebuilt)**
- **Found during:** Task 2 TypeScript check
- **Issue:** `moduleResolution: "bundler"` resolves `@agent-native/core/secrets` to `dist/secrets/index.js` which is gitignored — updating only the src barrel doesn't propagate to tsc without a `pnpm build`
- **Fix:** Switched to Path B (`readAppSecretByKey !== null`) as the plan explicitly documented as an acceptable fallback; reverted barrel change and changeset
- **Files modified:** Reverted `packages/core/src/secrets/index.ts`, deleted `.changeset/meta-secret-presence.md`

## Post-Deploy Operator Walkthrough (CAPI-06 Verification)

Since no local dev server is available, verification requires a deployed instance:

1. Go to `/gymos/settings/integrations`
2. Enter Pixel ID (digits only), Test Event Code (e.g. `TEST12345`), and paste the Conversions API token
3. Click **Save** — observe "Configuration saved" confirmation
4. Confirm the card badge shows "Configured — no sends yet"
5. Click **Send test event** — observe "Test event queued — check Meta Events Manager → Test Events in ~30s" with `event_id`
6. Open Meta Events Manager → Test Events tab — confirm a `Lead` event arrives (sent by the Fly worker, not staff-web)
7. Reload settings — badge should show "Active" (last_send_status = 'sent')

This walkthrough proves the full token+pixel+worker path (D-10) while honoring D-01 (staff-web only enqueues).

## Known Stubs

None — all functionality is wired. The card correctly shows "Not configured" until the operator enters config.

## Self-Check: PASSED

- `apps/staff-web/server/lib/meta-capi-test-send.ts` — FOUND
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — FOUND (contains save-meta-config, rotate-meta-token, send-meta-test-event, Meta Conversion Tracking card)
- Commit `1e9117b7` — FOUND
- Commit `d36a7b2d` — FOUND
- Commit `e08c0981` — FOUND
- D-01: no `graph.facebook.com` in either file — CONFIRMED

---
*Phase: MC1-foundation-lead-event*
*Completed: 2026-06-23*
