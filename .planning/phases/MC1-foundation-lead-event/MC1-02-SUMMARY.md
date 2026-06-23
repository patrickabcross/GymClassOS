---
phase: MC1-foundation-lead-event
plan: 02
subsystem: infra
tags: [meta, capi, queue, pg-boss, zod, typescript]

# Dependency graph
requires:
  - phase: MC1-foundation-lead-event plan 01
    provides: meta_lead_attribution table + META_CAPI_TOKEN secret registration + stageEventMap resolver

provides:
  - META_CAPI_EVENT queue name ("meta-capi-event") in QUEUE_NAMES const
  - MetaCapiEventPayload Zod schema (frozen wire contract for MC1-03 and MC1-04)
  - enqueueMetaCapiEvent() with singletonKey on eventId + retryLimit 5 + 24h expiry
  - staff-web queue-client re-export of enqueueMetaCapiEvent
  - MetaCapiEventPayload type re-exported from @gymos/queue index

affects:
  - MC1-03 (worker sender — builds the queue consumer against this payload shape)
  - MC1-04 (submit handler — calls enqueueMetaCapiEvent from queue-client)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "singletonKey on shared event_id for browser<->server dedup (D-15 / CAPI-04)"
    - "pixelId excluded from queue payload — resolved by worker at execution time"
    - "PII pre-hashed SHA-256 by caller before enqueue — raw PII never enters the queue"
    - "24h job expiry (expireInSeconds:86400) within Meta 48h dedup window"

key-files:
  created: []
  modified:
    - packages/queue/src/types.ts
    - packages/queue/src/publish.ts
    - packages/queue/src/index.ts
    - apps/staff-web/app/lib/queue-client.ts

key-decisions:
  - "pixelId is NOT in MetaCapiEventPayload — worker resolves it from studio_owner_config at execution time to avoid stale Pixel ID in queued jobs (RESEARCH Open Question 1)"
  - "singletonKey: meta-capi-event:{eventId} deduplicates on the shared browser<->server event_id (browser Pixel sends event_id, server CAPI enqueue uses same ID)"
  - "expireInSeconds:86400 (24h) chosen because jobs older than 48h would be outside Meta's dedup window and re-sending would create duplicate conversions"
  - "retryLimit:5 with retryBackoff:true mirrors enqueueStripeEvent retry profile"

patterns-established:
  - "Queue payload schema pattern: separate Zod schema in types.ts, publisher in publish.ts, re-exported from index.ts, re-exported in staff-web queue-client"

requirements-completed: [CAPI-04]

# Metrics
duration: 5min
completed: 2026-06-23
---

# Phase MC1 Plan 02: Queue Contract Summary

**`meta-capi-event` pg-boss queue contract: MetaCapiEventPayload Zod schema with pre-hashed PII, plain attribution signals, and singleton-keyed enqueueMetaCapiEvent() publisher — frozen interface for MC1-03 worker + MC1-04 submit wiring**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-23T10:33:15Z
- **Completed:** 2026-06-23T10:38:14Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Defined the frozen `MetaCapiEventPayload` Zod schema that MC1-03 (worker consumer) and MC1-04 (submit handler) both build against verbatim
- Added `enqueueMetaCapiEvent()` with `singletonKey` on `eventId` so a duplicate enqueue of the same shared browser/server `event_id` collapses to one pg-boss job
- Re-exported from `@gymos/queue` index barrel + staff-web `queue-client` indirection layer, matching the established pattern

## MetaCapiEventPayload — Frozen Field List

MC1-03 and MC1-04 executors: build against this shape exactly.

```typescript
{
  // Required
  eventId:        string  // shared browser<->server event_id (dedup key)
  memberId:       string  // attribution lookup + idempotency
  eventName:      string  // "Lead" for MC1 (resolved from stageEventMap)
  actionSource:   string  // "website" for form leads
  eventTime:      number  // Unix SECONDS (NOT milliseconds) — z.number().int()

  // Optional — plain fields
  eventSourceUrl: string | undefined

  // Pre-hashed PII (SHA-256 hex) — caller hashes before enqueue
  hashedEmail:    string | undefined
  hashedPhone:    string | undefined
  hashedFn:       string | undefined   // first name
  hashedLn:       string | undefined   // last name

  // Attribution + match signals — PLAIN, never hashed
  fbc:            string | undefined   // _fbc cookie (click ID)
  fbp:            string | undefined   // _fbp cookie (browser ID)
  clientIp:       string | undefined
  clientUserAgent: string | undefined
}
```

**Note:** `pixelId` is NOT in the payload — the worker resolves it from `studio_owner_config` at execution time.

## Task Commits

1. **Task 1: META_CAPI_EVENT queue name + MetaCapiEventPayload schema** - `fe795bc0` (feat)
2. **Task 2: enqueueMetaCapiEvent() publisher + staff-web re-export** - `392237aa` (feat)

## Files Created/Modified

- `packages/queue/src/types.ts` — Added `META_CAPI_EVENT: "meta-capi-event"` to QUEUE_NAMES and the full `MetaCapiEventPayload` Zod schema + type export
- `packages/queue/src/publish.ts` — Added `enqueueMetaCapiEvent()` with singletonKey + retryLimit 5 + retryBackoff + 24h expiry; imported MetaCapiEventPayload
- `packages/queue/src/index.ts` — Re-exported `enqueueMetaCapiEvent` from publish.js and `MetaCapiEventPayload` from types.js
- `apps/staff-web/app/lib/queue-client.ts` — Added `enqueueMetaCapiEvent` import + re-export alongside existing `enqueueOutboundWhatsApp`

## Decisions Made

- `pixelId` excluded from payload: worker resolves from `studio_owner_config` at execution time — avoids stale Pixel ID baked into long-lived queued jobs (RESEARCH Open Question 1 recommendation)
- `singletonKey: meta-capi-event:{eventId}` — the `eventId` is the shared browser/server dedup key; pg-boss singleton collapse prevents double-reporting even if submit handler is called twice
- `expireInSeconds: 86400` (24h) — comfortably within Meta's 48h dedup window; jobs older than 48h would create duplicate conversions if re-sent
- `retryLimit: 5` with `retryBackoff: true` — mirrors `enqueueStripeEvent` profile (durable, transient-failure tolerant)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - queue contract is internal; no external service configuration required.

## Next Phase Readiness

- MC1-03 (worker sender): read `MetaCapiEventPayload` field list above, subscribe to `QUEUE_NAMES.META_CAPI_EVENT` queue, resolve `pixelId` from `studio_owner_config`, send via Meta Graph API v23
- MC1-04 (submit handler): import `enqueueMetaCapiEvent` from `~/lib/queue-client`, hash PII with SHA-256, set `eventTime: Math.floor(Date.now() / 1000)`, pass `fbc`/`fbp` plain
- MC1-03 and MC1-04 can now proceed in parallel against this frozen interface

---
*Phase: MC1-foundation-lead-event*
*Completed: 2026-06-23*

## Self-Check: PASSED

- `packages/queue/src/types.ts` — FOUND (contains META_CAPI_EVENT + MetaCapiEventPayload)
- `packages/queue/src/publish.ts` — FOUND (contains enqueueMetaCapiEvent)
- `packages/queue/src/index.ts` — FOUND (re-exports both)
- `apps/staff-web/app/lib/queue-client.ts` — FOUND (re-exports enqueueMetaCapiEvent)
- Commit `fe795bc0` — FOUND
- Commit `392237aa` — FOUND
