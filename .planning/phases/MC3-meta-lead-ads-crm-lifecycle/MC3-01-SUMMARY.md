---
phase: MC3-meta-lead-ads-crm-lifecycle
plan: "01"
subsystem: database
tags: [meta, capi, lead-ads, pg-boss, queue, postgres, drizzle]

# Dependency graph
requires:
  - phase: MC2-deep-funnel-lifecycle
    provides: "getOrUpsertAttribution, fireContactCapiIfFirstReply, enqueueMetaCapiEvent, MetaCapiEventPayload, all four lifecycle fire points (Contact/Purchase/Schedule)"
  - phase: MC1-foundation-lead-event
    provides: "meta_lead_attribution table, META_CAPI_EVENT queue, worker CAPI sender, metaLifecycle.ts shared helpers"
provides:
  - "QUEUE_NAMES.META_LEAD queue name + MetaLeadPayload Zod schema + enqueueMetaLead() helper for MC3-02 ingest"
  - "leadId?: z.string().optional() on MetaCapiEventPayload — additive, backward-compatible"
  - "user_data.lead_id injection in worker CAPI handler (plain string, not hashed, per RESEARCH D-14)"
  - "meta_lead_id TEXT column on meta_lead_attribution via migration v34"
  - "getOrUpsertAttribution returns metaLeadId; all four lifecycle fire points pass leadId through"
  - "'meta_lead_ads' enum value on whatsapp_opt_in.source (additive, TypeScript-level)"
  - "'meta_lead' enum value on webhook_events.provider (additive, TypeScript-level)"
affects: [MC3-02, MC3-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "leadId passthrough pattern: getOrUpsertAttribution reads new column, fire points spread it into enqueueMetaCapiEvent, CAPI handler injects conditionally"
    - "No singletonKey on enqueueMetaLead — idempotency is at the edge (insertWebhookEvent ON CONFLICT) not the queue"
    - "Additive-only migration: one IF NOT EXISTS ALTER TABLE per version (v34 continues v31/v32/v33 pattern)"

key-files:
  created:
    - "packages/queue/src/types.ts (extended — new META_LEAD queue name, MetaLeadPayload, leadId?)"
    - "packages/queue/src/publish.ts (extended — enqueueMetaLead)"
    - "packages/queue/src/lifecycle-payload.test.ts (extended — 5 new MC3 tests)"
  modified:
    - "packages/queue/src/index.ts — exports MetaLeadPayload + enqueueMetaLead"
    - "apps/staff-web/server/db/schema.ts — metaLeadId on metaLeadAttribution, two enum values"
    - "apps/staff-web/server/plugins/db.ts — migration v34"
    - "services/worker/src/queues/meta-capi-event.ts — user_data.lead_id injection"
    - "services/worker/src/domain/metaLifecycle.ts — getOrUpsertAttribution SELECT + return type + Contact fire point"
    - "services/worker/src/domain/stripeReducers/checkout-session-completed.ts — Purchase fire point"
    - "services/worker/src/domain/stripeReducers/invoice-paid.ts — Purchase renewal fire point"
    - "apps/staff-web/actions/mark-booking-attended.ts — Schedule fire point"

key-decisions:
  - "MC3-01: lead_id goes in user_data (NOT top-level event field) as a plain unhashed string — confirmed by RESEARCH D-14 (SprintHub parameter reference + multiple CAPI-for-CRM guides)"
  - "MC3-01: No singletonKey on enqueueMetaLead — insertWebhookEvent ON CONFLICT is the dedup gate; singletonKey would be redundant (Open Question 3)"
  - "MC3-01: whatsapp_opt_in.source and webhook_events.provider are plain TEXT columns with no Postgres CHECK constraint — v34 migration only adds meta_lead_id column; enum values are TypeScript-level only (PLAN context, verified)"
  - "MC3-01: migration v34 must be applied to gymos-demo Neon by hand after deploy (migration-drift gotcha — db.ts migrations NOT auto-run)"

patterns-established:
  - "Pattern: All four lifecycle fire points (Contact/Purchase/Schedule/mark-booking-attended) read meta_lead_id from attribution row and thread it as leadId into enqueueMetaCapiEvent. The CAPI handler injects user_data.lead_id only when present — all pre-MC3 code paths continue unchanged."

requirements-completed: [LEAD-02]

# Metrics
duration: ~20min
completed: 2026-06-24
---

# Phase MC3 Plan 01: Meta Lead Ads Foundation Summary

**meta_lead_id threaded through all four lifecycle CAPI fire points via v34 migration + MetaLeadPayload queue contract, enabling MC3-02 to ingest Lead-Ad leads that advance through Meta's Leads Center keyed on lead_id**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-24T11:30:00Z
- **Completed:** 2026-06-24T11:42:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Queue package now exposes `QUEUE_NAMES.META_LEAD`, `MetaLeadPayload` Zod schema, and `enqueueMetaLead()` — the contract MC3-02 consumes to enqueue Lead Ads retrieval jobs
- `MetaCapiEventPayload` extended with optional `leadId` field (additive, backward-compatible — non-Lead-Ad members unchanged)
- All four lifecycle fire points (Contact, Purchase via both Stripe reducers, Schedule) read `meta_lead_id` from the attribution row and pass it through to the CAPI event; the worker handler injects `user_data.lead_id` as a plain string (confirmed not hashed per RESEARCH D-14)
- Migration v34 adds `meta_lead_id TEXT` to `meta_lead_attribution` additively; `whatsapp_opt_in.source` and `webhook_events.provider` Drizzle enums extended with `'meta_lead_ads'` and `'meta_lead'` respectively
- 35/35 queue tests + 152/152 worker tests pass; queue build + staff-web + worker `tsc --noEmit` all clean

## Task Commits

1. **Task 1: Queue contract — META_LEAD + MetaLeadPayload + leadId? + enqueueMetaLead()** — `3a45d3e7` (feat — TDD: RED then GREEN)
2. **Task 2: Schema + migration v34 — meta_lead_id column + two additive enum values** — `c77b402a` (feat)
3. **Task 3: lead_id passthrough — CAPI handler + all four lifecycle fire points** — `6f753b27` (feat)

**Plan metadata commit:** (docs commit follows)

## Files Created/Modified

- `packages/queue/src/types.ts` — Added QUEUE_NAMES.META_LEAD, MetaLeadPayload schema+type, leadId? on MetaCapiEventPayload
- `packages/queue/src/publish.ts` — Added enqueueMetaLead() (no singletonKey)
- `packages/queue/src/index.ts` — Exports MetaLeadPayload + enqueueMetaLead
- `packages/queue/src/lifecycle-payload.test.ts` — 5 new MC3 tests (35 total)
- `apps/staff-web/server/db/schema.ts` — metaLeadId column on metaLeadAttribution; enum extensions
- `apps/staff-web/server/plugins/db.ts` — Migration v34 (additive ALTER TABLE)
- `services/worker/src/queues/meta-capi-event.ts` — user_data.lead_id injection line
- `services/worker/src/domain/metaLifecycle.ts` — getOrUpsertAttribution: SELECT meta_lead_id, return metaLeadId; Contact fire point wires leadId
- `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` — Purchase fire point wires leadId
- `services/worker/src/domain/stripeReducers/invoice-paid.ts` — Purchase renewal fire point wires leadId
- `apps/staff-web/actions/mark-booking-attended.ts` — Schedule fire point SELECTs meta_lead_id, wires leadId

## Decisions Made

- `lead_id` placement confirmed as `user_data.lead_id` (plain string, NOT hashed, NOT top-level event field) — backed by RESEARCH D-14 (SprintHub CAPI parameter table + multiple third-party CAPI-for-CRM integration guides)
- `enqueueMetaLead()` has NO `singletonKey` — idempotency is at the webhook edge (`insertWebhookEvent` ON CONFLICT DO NOTHING) not the queue layer; contrast with `enqueueMetaCapiEvent` which uses singletonKey because it can be enqueued from multiple places
- `whatsapp_opt_in.source` and `webhook_events.provider` are plain TEXT columns with no Postgres CHECK constraint, confirmed by PLAN context — so v34 only needs the `ALTER TABLE meta_lead_attribution ADD COLUMN` line; no constraint ALTER needed for the two new enum values

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**CRITICAL: migration v34 must be applied to gymos-demo Neon by hand after deploy.**

db.ts migrations are NOT auto-run on deploy (migration-drift gotcha from project memory). Apply v34 manually:

```sql
ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT;
```

Run against `gymos-demo` (project id `billowing-sun-51091059`) via Neon MCP or Neon console SQL editor. Verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'meta_lead_attribution' AND column_name = 'meta_lead_id';
```

## Known Stubs

None — this plan is purely additive infrastructure (queue contract + schema + passthrough). The `meta_lead_id` column will be `NULL` for all existing members until MC3-02 writes it on Lead-Ad ingest. Lifecycle fire points send `user_data.lead_id` only when the column is non-null — existing behavior is identical to pre-MC3.

## Next Phase Readiness

MC3-02 can now:
- Import `enqueueMetaLead`, `MetaLeadPayload`, `QUEUE_NAMES.META_LEAD` from `@gymos/queue`
- Enqueue retrieval jobs when the Leadgen webhook fires (idempotency via `insertWebhookEvent` with `provider: 'meta_lead'`)
- Write `meta_lead_id` to `meta_lead_attribution` after Graph API retrieval — lifecycle events will automatically carry `user_data.lead_id` in all subsequent CAPI fires

---
*Phase: MC3-meta-lead-ads-crm-lifecycle*
*Completed: 2026-06-24*
