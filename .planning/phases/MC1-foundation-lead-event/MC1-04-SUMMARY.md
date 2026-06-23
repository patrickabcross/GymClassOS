---
phase: MC1-foundation-lead-event
plan: 04
subsystem: forms / meta-capi
tags: [meta, pixel, capi, attribution, forms, embed, fbc, fbp, dedup]

# Dependency graph
requires:
  - phase: MC1-foundation-lead-event plan 01
    provides: meta_lead_attribution table schema (member_id UNIQUE, initial_event_id, fbc, fbp, fbclid, etc.)
  - phase: MC1-foundation-lead-event plan 02
    provides: enqueueMetaCapiEvent() + MetaCapiEventPayload contract (frozen)

provides:
  - Parent-page fbclid/_fbc/_fbp capture + fbc synthesis in embed.js (PIX-02)
  - Studio Meta Pixel (from studio_owner_config.meta_pixel_id) loaded on public form pages (PIX-01)
  - Browser Lead event with shared event_id for CAPI dedup (CAPI-05)
  - Server-side meta_lead_attribution persist (always fires) + meta-capi-event enqueue (D-14)

affects:
  - MC1-03 (worker sender — the enqueued meta-capi-event jobs are now being produced)
  - MC2 (lifecycle events — meta_lead_attribution.initial_event_id + member_id provide the dedup anchor)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Synchronous query-param threading (embed.js → iframe src) avoids Pixel-fires-before-data race (D-12)"
    - "fbc synthesis: fb.1.<Date.now()ms>.<fbclid> when fbclid present but no _fbc cookie (D-13)"
    - "Single EVENT_ID generated before fetch(); shared between fbq('track','Lead',{},{eventID}) and POST body.event_id (CAPI-05)"
    - "D-14 always-enqueue: effectiveEventId = metaEventId ?? nanoid() — server Lead fires even when no browser event_id"
    - "PII pre-hashed SHA-256 by caller before enqueue: email(toLower+trim), phone(digits-only), fn(lower+alpha-only), ln(lower+trim)"
    - "meta_lead_attribution upsert: ON CONFLICT(member_id) DO UPDATE with COALESCE to preserve first-touch attribution on re-submit"
    - "guard:allow-unscoped on studio_owner_config pixelId read + meta_lead_attribution upsert (both single-tenant)"
    - "pixelId sanitized to digits-only before interpolation into inline <script>"

key-files:
  created: []
  modified:
    - apps/staff-web/features/forms/lib/embed-snippet.ts
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/handlers/submissions.ts

key-decisions:
  - "Route files (f/[...slug].get.ts, preview/[...slug].get.ts) unchanged — they are thin re-exports of renderPublicForm; pixelId resolution lives inside renderPublicFormHtml which already owns the DB handle"
  - "pixelId resolved per-request inside renderPublicFormHtml (not cached) to stay consistent with real-time config changes; the studio_owner_config row changes rarely"
  - "No postMessage for attribution threading — synchronous query-param approach avoids the race where Pixel fires before fbc/fbp data arrives (D-12 per RESEARCH)"
  - "D-14 trade-off documented in code: when no browser event_id, browser<->server dedup is impossible but server Lead fires; organic leads produce a server Lead with a server-minted nanoid as eventId"
  - "meta_lead_attribution upsert separated into its own try/catch from the CAPI enqueue try/catch so attribution persist failure is independently logged without blocking either the enqueue or the submission response"

# Metrics
duration: 241s
completed: 2026-06-23
---

# Phase MC1 Plan 04: Attribution & Submit Wiring Summary

**Browser-side fbclid/_fbc/_fbp capture via embed.js + studio Pixel load on public form pages + shared event_id dedup wiring + server-side SHA-256 hashing, meta_lead_attribution upsert (always), and unconditional meta-capi-event enqueue (D-14)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-23T~11:29Z
- **Completed:** 2026-06-23T~11:33Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

### Task 1: embed.js — fbclid/_fbc/_fbp capture + fbc synthesis (PIX-02)
Added `readCookie()` and `buildAttributionParams()` inside the embed IIFE string. `buildAttributionParams()` reads `fbclid` from `location.search` (parent page), `_fbc` and `_fbp` from parent cookies, and synthesizes `fbc = 'fb.1.' + Date.now() + '.' + fbclid` when fbclid is present but no `_fbc` cookie (D-13 millisecond timestamp). The iframe `src` assembly in `injectEmbeds()` appends these attribution params after `buildParams(accent, radius)` using `encodeURIComponent`. Fully synchronous — no postMessage — avoiding the race where the Pixel would fire before fbc/fbp data is ready (D-12).

### Task 2: public-form-ssr.ts — studio Pixel + shared event_id Lead (PIX-01, CAPI-05)
- `renderPublicFormHtml` now resolves `studio_owner_config.meta_pixel_id` via raw `sql` select (guard:allow-unscoped), sanitizes to digits-only, and passes it as the new trailing `pixelId?: string` param to `renderFormPage`
- `renderFormPage` injects the full Meta Pixel base code (`fbq('init', pixelId)` + `fbq('track', 'PageView')`) only when `pixelId` is non-empty — form still works without it
- Browser generates `EVENT_ID = 'mc1_' + random + timestamp` BEFORE the `fetch()` call (Pitfall 2)
- POST body extended with `event_id`, `fbc`, `fbp`, `fbclid` (from `searchParams` on the iframe URL), `page_url` (prefers `document.referrer`, falls back to `location.href`)
- On submit success: `fbq('track', 'Lead', {}, { eventID: EVENT_ID })` fires with camelCase `eventID` using the identical `EVENT_ID` (CAPI-05 dedup)
- Route re-exports (`f/[...slug].get.ts`, `preview/[...slug].get.ts`) unchanged

### Task 3: submissions.ts — PII hashing + attribution persist + unconditional CAPI enqueue (CAPI-03, D-14)
- `createHash` from `node:crypto` + `hashForCapi(normalized)` helper at module level
- Reads `body.fbc/fbp/fbclid/event_id/page_url` + `user-agent` header
- `effectiveEventId = metaEventId ?? nanoid()` — server Lead always fires (D-14 LOCKED)
- PII normalized then hashed: email `toLowerCase().trim()`, phone `replace(/\D/g,'')` (no `+`), fn `toLowerCase().replace(/[^a-z]/g,'')`, ln `toLowerCase().trim()`
- `meta_lead_attribution` upsert keyed on `resolvedMemberId` (post dual-unique-key reconcile) with `ON CONFLICT (member_id) DO UPDATE`; COALESCE preserves first-touch fbc/fbp/fbclid; `effectiveEventId` stored as `initial_event_id`
- `enqueueMetaCapiEvent` called unconditionally with all MetaCapiEventPayload fields; wrapped in try/catch — submission never fails on enqueue error

## MetaCapiEventPayload fields sent (all match MC1-02 frozen contract)

| Field | Source |
|-------|--------|
| `eventId` | `effectiveEventId` (browser `body.event_id` ?? server `nanoid()`) |
| `memberId` | `resolvedMemberId` (post dual-unique-key reconcile) |
| `eventName` | `"Lead"` |
| `actionSource` | `"website"` |
| `eventTime` | `Math.floor(Date.now() / 1000)` Unix seconds |
| `eventSourceUrl` | `metaPageUrl` (body.page_url) |
| `hashedEmail` | SHA-256 of `email.toLowerCase().trim()` |
| `hashedPhone` | SHA-256 of `phoneE164.replace(/\D/g,'')` |
| `hashedFn` | SHA-256 of `firstName.toLowerCase().replace(/[^a-z]/g,'')` |
| `hashedLn` | SHA-256 of `lastName.toLowerCase().trim()` |
| `fbc` | `metaFbc` (body.fbc plain) |
| `fbp` | `metaFbp` (body.fbp plain) |
| `clientIp` | `ip` |
| `clientUserAgent` | `userAgent` header |

Note: `pixelId` is NOT in the payload — worker resolves it from `studio_owner_config` at execution time (MC1-02 decision, unchanged).

## Task Commits

1. **Task 1: embed.js attribution capture** — `329fe768` (feat)
2. **Task 2: public-form-ssr.ts Pixel + shared event_id** — `9a8797a5` (feat)
3. **Task 3: submissions.ts hash PII + attribution + CAPI enqueue** — `ca8e2ed3` (feat)

## Files Modified

- `apps/staff-web/features/forms/lib/embed-snippet.ts` — Added `readCookie()` + `buildAttributionParams()` inside IIFE; iframe src appends attribution params
- `apps/staff-web/features/forms/lib/public-form-ssr.ts` — Added `sql` import; `renderPublicFormHtml` resolves `meta_pixel_id`; `renderFormPage` accepts `pixelId?`; Pixel base code emitted; `EVENT_ID` generated before fetch; POST body extended; fbq Lead fires on success
- `apps/staff-web/features/forms/handlers/submissions.ts` — Added `createHash` import + `hashForCapi()`; reads attribution body fields; `effectiveEventId = metaEventId ?? nanoid()`; PII hashed; `meta_lead_attribution` upsert; unconditional `enqueueMetaCapiEvent` call

## Decisions Made

- Route files unchanged — `renderPublicForm(event)` public signature stable; pixelId resolution belongs in `renderPublicFormHtml` (has DB handle)
- Synchronous query-param threading chosen over postMessage to avoid fbc/fbp race condition (D-12 RESEARCH)
- meta_lead_attribution upsert and CAPI enqueue each have independent try/catch so a failure in one does not block the other or the submission response
- D-14 always-enqueue: when no browser `event_id`, `effectiveEventId` = server-minted `nanoid()`; browser<->server dedup is impossible but the server Lead is never skipped

## Deviations from Plan

None — plan executed exactly as written. The `sql` import was already available from drizzle-orm (the plan's instructions for `renderPublicFormHtml` DB access matched the existing pattern in the file).

## Post-Deploy Verification

No local dev server available (NitroViteError). Verify after `git push origin master` → Vercel deploy:

1. **PIX-01** — Visit `/f/{slug}` with a configured `meta_pixel_id` in `studio_owner_config`; check browser DevTools Network for `facebook.net/en_US/fbevents.js` loaded.
2. **PIX-02** — Navigate to the customer site with `?fbclid=<test>` in the URL; inspect embed iframe src in DevTools → should see `fbc=fb.1.{timestamp}.{fbclid}` in the iframe URL.
3. **CAPI-05** — Submit the form; check Meta Test Events dashboard for one `Lead` event showing browser + server dedup (two signals, one event counted).
4. **D-14** — Directly POST to `/api/submit/{id}` without `event_id`; verify `meta_lead_attribution.initial_event_id` is populated with a server-minted nanoid and the meta-capi-event job appears in the pg-boss queue.

## Known Stubs

None — all data paths are wired end-to-end. The CAPI Lead will be enqueued but not yet sent to Meta until MC1-03 (worker sender) is deployed and the `META_CAPI_TOKEN` secret is set on the worker.

## Self-Check: PASSED

- `apps/staff-web/features/forms/lib/embed-snippet.ts` — FOUND (contains `buildAttributionParams`, `readCookie`, `fb.1.`)
- `apps/staff-web/features/forms/lib/public-form-ssr.ts` — FOUND (contains `fbq('init'`, `fbq('track', 'Lead'`, `eventID: EVENT_ID`, `meta_pixel_id`, `event_id`)
- `apps/staff-web/features/forms/handlers/submissions.ts` — FOUND (contains `enqueueMetaCapiEvent`, `meta_lead_attribution`, `hashForCapi`, `effectiveEventId`, `Math.floor(Date.now() / 1000)`)
- Commit `329fe768` — verified via commit log
- Commit `9a8797a5` — verified via commit log
- Commit `ca8e2ed3` — verified via commit log
