---
phase: MC2-deep-funnel-lifecycle
plan: "02"
subsystem: meta-capi / worker / inbound-whatsapp
tags: [meta, capi, lifecycle, contact, inbound, worker, whatsapp]
dependency_graph:
  requires: [MC2-01]
  provides: [fireContactCapiIfFirstReply, memberId return from upsertConversationAndMessage, Contact CAPI wire in inbound-whatsapp]
  affects: [services/worker/src/domain/conversations.ts, services/worker/src/domain/metaLifecycle.ts, services/worker/src/queues/inbound-whatsapp.ts]
tech_stack:
  added: []
  patterns: [best-effort try/catch around CAPI enqueue (D-17), contact_sent_at null gate for idempotency, memberId propagated up from domain function to queue handler]
key_files:
  created: []
  modified:
    - services/worker/src/domain/conversations.ts
    - services/worker/src/domain/metaLifecycle.ts
    - services/worker/src/queues/inbound-whatsapp.ts
decisions:
  - "fireContactCapiIfFirstReply caller omits stageEventMapConfig arg — helper defaults to Contact via resolveStageEvent(null, contact); CAPI handler also resolves config at send time so renamed events still flow"
  - "contact_sent_at stamp deferred to CAPI handler success path (Plan 01) — retry-until-success semantics; rapid double-inbound collapsed by pg-boss singletonKey"
  - "result type in inbound-whatsapp.ts widened to include memberId? to accept the updated conversations.ts return"
metrics:
  duration: 140s
  completed_date: "2026-06-23"
  tasks_completed: 2
  files_changed: 3
---

# Phase MC2 Plan 02: Contact CAPI on First WhatsApp Reply Summary

Fires a Contact CAPI event the first time a lead replies on WhatsApp — gated on the durable `contact_sent_at` marker so repeat inbounds are no-ops — by propagating `memberId` up from the conversation domain function and wiring a best-effort Contact enqueue in the inbound worker path.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Return memberId from upsertConversationAndMessage + add fireContactCapiIfFirstReply helper | cd225c28 | services/worker/src/domain/conversations.ts, services/worker/src/domain/metaLifecycle.ts |
| 2 | Wire Contact fire into inbound-whatsapp.ts (inbound branch only, best-effort) | f846a9dd | services/worker/src/queues/inbound-whatsapp.ts |

## What Was Built

**Task 1 — conversations.ts return type extension**

`upsertConversationAndMessage` return type changed from `{ processed: boolean; reason?: string }` to `{ processed: boolean; reason?: string; memberId?: string }`. The success return (previously `return { processed: true }`) now returns `return { processed: true, memberId: member.id }`. The two `{ processed: false, reason }` early-returns are unchanged — no memberId needed for skipped/duplicate paths.

**Task 1 — fireContactCapiIfFirstReply helper (metaLifecycle.ts)**

New exported helper added to `services/worker/src/domain/metaLifecycle.ts`:

1. Calls `getOrUpsertAttribution(db, memberId)` to ensure the attribution row exists and read fbc/fbp (D-04/D-05).
2. Reads `contact_sent_at` from `meta_lead_attribution` — returns early (no-op) if non-null (idempotency gate).
3. Calls `getMemberHashes(db, memberId)` for SHA-256 hashed email + phone.
4. Resolves event name via `resolveStageEvent(stageEventMapConfig ?? null, "contact")` (LIFE-04).
5. Enqueues via `enqueueMetaCapiEvent` with `eventId = memberId:contact`, `actionSource = "system_generated"`, `stageKey = "contact"`.

The `contact_sent_at` marker is NOT stamped here — it is written by the Plan 01 CAPI handler on confirmed send success. This ensures correct retry-until-success semantics if the enqueue or Meta API call fails.

Two new imports added to `metaLifecycle.ts`: `enqueueMetaCapiEvent` from `@gymos/queue` and `resolveStageEvent` from `../lib/stage-event-map.js`.

**Task 2 — inbound-whatsapp.ts wiring**

Three changes in `services/worker/src/queues/inbound-whatsapp.ts`:

1. Import: `import { fireContactCapiIfFirstReply } from "../domain/metaLifecycle.js"` added.
2. `result` variable type widened to `{ processed: boolean; reason?: string; memberId?: string }`.
3. After the "message materialised" log and before the `if (row) { processedAt }` block, a best-effort Contact fire added:
   ```
   if (data.direction !== "out" && result.processed && result.memberId) {
     try { await fireContactCapiIfFirstReply(db, result.memberId); }
     catch (err) { log.warn(..., "Contact CAPI enqueue failed — non-fatal (D-17)"); }
   }
   ```
   The guard ensures the fire only happens for the inbound branch (not the outbound mirror) and only when a new message was materialised.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| @gymos/worker (152 total) | 152 | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The fire point is fully wired. `fireContactCapiIfFirstReply` calls the real `enqueueMetaCapiEvent` — Contact events will flow through the Plan 01 CAPI handler (which sends to Meta and stamps `contact_sent_at`) as soon as the Fly worker is running with valid CAPI config.

## Self-Check: PASSED

- `services/worker/src/domain/conversations.ts` — exists, `memberId: member.id` in processed:true return confirmed.
- `services/worker/src/domain/metaLifecycle.ts` — exists, `fireContactCapiIfFirstReply` exported, event_id formula `${memberId}:contact`, `actionSource: "system_generated"`, `stageKey: "contact"`, `contact_sent_at` null gate present, no UPDATE statement.
- `services/worker/src/queues/inbound-whatsapp.ts` — exists, 2 hits for `fireContactCapiIfFirstReply` (import + call), inbound-only guard, try/catch with D-17 tag, positioned after "message materialised" log and before processedAt update.
- Commits `cd225c28` and `f846a9dd` confirmed in git log.
- Worker tsc --noEmit: 0 errors.
- 152/152 tests pass.
