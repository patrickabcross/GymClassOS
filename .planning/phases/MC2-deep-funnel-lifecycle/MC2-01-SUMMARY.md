---
phase: MC2-deep-funnel-lifecycle
plan: "01"
subsystem: meta-capi / queue / worker
tags: [meta, capi, lifecycle, payload, worker, queue]
dependency_graph:
  requires: [MC1-05]
  provides: [extended MetaCapiEventPayload, metaLifecycle.ts helper module, per-stage CAPI write-back]
  affects: [services/worker/src/queues/meta-capi-event.ts, packages/queue/src/types.ts]
tech_stack:
  added: []
  patterns: [zero-decimal currency conversion, SHA-256 PII hashing, member-keyed upsert]
key_files:
  created:
    - packages/queue/src/lifecycle-payload.test.ts
    - services/worker/src/domain/metaLifecycle.ts
    - services/worker/src/domain/metaLifecycle.test.ts
  modified:
    - packages/queue/src/types.ts
    - services/worker/src/queues/meta-capi-event.ts
decisions:
  - "Additive-only MetaCapiEventPayload extension — three optional fields, no field removed or renamed"
  - "markerCol chosen from fixed literal map (not user input) so sql.raw is safe for per-stage UPDATE"
  - "Worker tsc required @gymos/queue build before typecheck — queue dist/ is the type source"
metrics:
  duration: 249s
  completed_date: "2026-06-23"
  tasks_completed: 3
  files_changed: 5
---

# Phase MC2 Plan 01: CAPI Foundation Extension Summary

Extended the MC1 CAPI contract and worker handler additively so the three MC2 fire points (Contact, Purchase, Schedule) can flow through the existing single sender with zero breaking changes.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend MetaCapiEventPayload with value/currency/stageKey | d641cb4 | packages/queue/src/types.ts, packages/queue/src/lifecycle-payload.test.ts |
| 2 | Build metaLifecycle worker helper (toMajorUnits + hashing + attribution upsert) | f358bd9b | services/worker/src/domain/metaLifecycle.ts, services/worker/src/domain/metaLifecycle.test.ts |
| 3 | Extend CAPI handler — custom_data + per-stage marker write-back | 91de9ff1 | services/worker/src/queues/meta-capi-event.ts |

## What Was Built

**Task 1 — MetaCapiEventPayload extension (packages/queue/src/types.ts)**

Three optional fields added additively:
- `value: z.number().nonnegative().optional()` — major units (caller divides before enqueue)
- `currency: z.string().length(3).optional()` — ISO-4217 lowercase 3-char code
- `stageKey: z.enum(["lead", "contact", "purchase", "schedule"]).optional()` — drives per-stage marker write-back

Seven lifecycle-payload tests cover: parse with all three fields, parse with none, reject bad stageKey, reject negative value, reject 2-char currency, accept all four valid stageKey values, accept zero value. All 30 queue tests pass.

**Task 2 — metaLifecycle.ts helper module (services/worker/src/domain/)**

Exports four pure/DB helpers for Wave 2 fire points to reuse:
- `ZERO_DECIMAL_CURRENCIES` — 16-currency Set (bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf)
- `toMajorUnits(amountMinorUnits, currency)` — case-insensitive zero-decimal-aware conversion
- `getMemberHashes(db, memberId)` — fetches email+phone via raw SQL, returns SHA-256 hashes; omits fields when null/empty
- `getOrUpsertAttribution(db, memberId)` — INSERT ON CONFLICT DO NOTHING to guarantee row, then SELECT fbc/fbp/client_ip/client_user_agent

All DB calls use `// guard:allow-unscoped — single-tenant meta attribution` (4 markers). No cross-app schema import (MC1-03 decision). Nine toMajorUnits unit tests; 152/152 worker tests pass.

**Task 3 — Worker CAPI handler extension (services/worker/src/queues/meta-capi-event.ts)**

Two additive changes only — no existing logic touched:

A) After capiBody construction: `if (data.value != null && data.currency)` guard adds `custom_data: { value, currency }` to the event array element. Contact/Schedule omit it automatically by not populating those fields.

B) After the existing `lead_status='sent'` UPDATE in the success block: `if (data.stageKey && data.stageKey !== "lead")` guard looks up `markerCol` from a fixed literal map (`contact_sent_at | purchase_sent_at | schedule_sent_at`) and stamps it with `sql.raw(markerCol) = NOW()`. The `sql.raw` is safe because markerCol comes from a fixed literal object, never from payload free-text.

Worker `tsc --noEmit` is clean (0 errors). Required building `@gymos/queue` first so the worker's `dist/index.d.ts` reflects the new payload fields.

## Decisions Made

- Additive-only MetaCapiEventPayload extension — three optional fields, no existing field renamed or removed; backward compatible with all MC1 Lead event callers
- `markerCol` from fixed literal map (not user input) → `sql.raw` is safe
- Worker typecheck requires `pnpm --filter @gymos/queue build` to regenerate `dist/index.d.ts` before tsc sees new payload fields; this is the standard workspace build order

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| @gymos/queue (30 total) | 30 | PASS |
| @gymos/worker (152 total) | 152 | PASS |

## Deviations from Plan

None — plan executed exactly as written. The only non-plan step was running `pnpm --filter @gymos/queue build` before the worker typecheck, which was expected (workspace package dist rebuild) and not a deviation.

## Known Stubs

None. All exported helpers are fully implemented. DB helpers (getMemberHashes, getOrUpsertAttribution) will be exercised by Wave 2 fire point plans (MC2-02 Contact, MC2-03 Purchase, MC2-04 Schedule) which import and call them.
