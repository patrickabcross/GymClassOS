---
status: partial
phase: BD2-telemetry-provisioning
source: [BD2-VERIFICATION.md]
started: 2026-06-19
updated: 2026-06-19
blocker: external-dependency (HQ deploy + provider API tokens + studio provisioning; StudioMigrator/StudioSeeder live wiring)
---

## Current Test

[awaiting external provisioning — HQ Vercel + hq-worker Fly deploys, provider API tokens as Fly secrets, real StudioMigrator/StudioSeeder]

## Tests

### 1. Live telemetry round-trip
expected: A provisioned studio's worker POSTs a TelemetrySnapshot to the deployed HQ /api/telemetry with its bearer token; the snapshot appears in hq_telemetry_snapshots and last_telemetry_received_at updates. (Code-verified via 192 unit tests; live round-trip pending HQ deploy + a provisioned studio.)
result: [pending — deferred on external dependency]

### 2. Signup → dashboard → Fly worker log
expected: `curl POST /api/signup` returns 202; the run card appears in the operator /provisioning dashboard; Fly logs show provision-studio + hq-watchdog queue registration. Requires HQ Vercel + hq-worker Fly deploys.
result: [pending — deferred on external dependency]

### 3. Live saga end-to-end (8 steps)
expected: With NEON_API_KEY, VERCEL_BEARER_TOKEN, VERCEL_TEAM_ID, FLY_API_TOKEN, FLY_ORG_SLUG, GYMOS_WORKER_IMAGE set as hq-worker Fly secrets AND real StudioMigrator/StudioSeeder implementations, a signup provisions an independent Neon + Vercel + Fly studio; a deliberate mid-saga failure triggers LIFO rollback with no orphaned resources. (Saga + rollback + idempotency unit-tested with mocks.)
result: [pending — deferred on external dependency]

### 4. HQ Neon migrations applied (v4-v7)
expected: After HQ Neon provisioning, v4-v7 tables (hq_studios, hq_provisioning_runs, hq_telemetry_snapshots, hq_token_usage, hq_studio_tokens) exist.
result: [pending — deferred on external dependency]

### 5. Watchdog clean tick
expected: With hq-worker deployed, the every-5-min watchdog logs cleanly when no stuck runs / no stale-telemetry studios exist.
result: [pending — deferred on external dependency]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

None are code defects — all are external provisioning/deploy steps + the two intentionally-stubbed StudioMigrator/StudioSeeder (saga steps 2-3) that need live-run implementations. Operator enablement checklist:
- Provision HQ Neon (BD1 item) + apply migrations.
- Deploy apps/hq (Vercel) + services/hq-worker (Fly).
- Set provider tokens as hq-worker Fly secrets: NEON_API_KEY, VERCEL_BEARER_TOKEN, VERCEL_TEAM_ID, FLY_API_TOKEN (org-scoped), FLY_ORG_SLUG, GYMOS_WORKER_IMAGE.
- Implement real StudioMigrator (drizzle migrate against new studio Neon) + StudioSeeder (seed + studio admin) replacing the console.warn stubs in provision-studio.ts.
- Then run tests 1-5 (`/gsd:verify-work BD2`).
