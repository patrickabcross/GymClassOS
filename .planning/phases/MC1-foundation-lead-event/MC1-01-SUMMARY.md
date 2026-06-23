---
phase: MC1-foundation-lead-event
plan: "01"
subsystem: staff-web / schema / worker-contracts
tags: [meta-capi, schema, migrations, drizzle, secrets, resolver, tdd]
dependency_graph:
  requires: []
  provides:
    - meta_lead_attribution table (v32 migration + Drizzle export)
    - studio_owner_config Meta columns: meta_pixel_id, meta_test_event_code, meta_stage_event_map (v31 migration + Drizzle export)
    - resolveStageEvent() pure resolver with 4 defaults (stage-event-map.ts)
    - META_CAPI_TOKEN registered as required secret slot
  affects:
    - apps/staff-web/server/plugins/db.ts (migrations v31 + v32)
    - apps/staff-web/server/db/schema.ts (studioOwnerConfig + metaLeadAttribution exports)
    - apps/staff-web/server/lib/stage-event-map.ts (new file)
    - apps/staff-web/server/lib/stage-event-map.test.ts (new file)
    - apps/staff-web/server/register-secrets.ts (META_CAPI_TOKEN)
tech_stack:
  added: []
  patterns:
    - TDD (red/green) for pure resolver
    - text() for JSONB/TIMESTAMPTZ columns (no new column-type imports — matches schema.ts pattern)
    - registerRequiredSecret() for app_secrets slot
    - runMigrations() versions (v31, v32) in server/plugins/db.ts — additive, idempotent
key_files:
  created:
    - apps/staff-web/server/lib/stage-event-map.ts
    - apps/staff-web/server/lib/stage-event-map.test.ts
  modified:
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/server/register-secrets.ts
decisions:
  - "meta_stage_event_map Drizzle column uses text() (not jsonb()) — no jsonb helper exists in @agent-native/core/db/schema; JSON.parse in resolver. Matches existing schema.ts pattern for all non-primitive columns."
  - "Timestamp columns in metaLeadAttribution use text() in the Drizzle export (consistent with all other timestamp columns in schema.ts), even though the DDL v32 uses TIMESTAMPTZ. The Neon HTTP driver returns ISO strings via both; behaviour is identical."
  - "resolveStageEvent accepts string | Record<string,string> | null | undefined to handle both the TEXT-column case (JSON string) and JSONB-driver case (pre-parsed object). Both branches guard empty/null values and fall back to defaults."
  - "META_CAPI_TOKEN is user-scoped in app_secrets (not org-scoped) — matches WHATSAPP_ACCESS_TOKEN and all other secrets; staff-web has no org provisioning UX."
metrics:
  duration: "336s (~6 min)"
  completed: "2026-06-23T10:29:05Z"
  tasks: 3
  files: 5
---

# Phase MC1 Plan 01: Data + Config Foundation Summary

**One-liner:** Additive DB migration + Drizzle schema for Meta lead attribution table and studio owner config columns; tested pure stageEventMap resolver with 4-event defaults; META_CAPI_TOKEN secret slot registered.

## What Was Built

### Task 1 — Migrations v31 + v32 (`31b5c18e`)

Appended two idempotent, strictly additive migration entries to `runMigrations([...])` in `apps/staff-web/server/plugins/db.ts`:

**v31** — Three additive columns on the `studio_owner_config` singleton:
- `meta_pixel_id TEXT` — the studio's Meta Pixel ID
- `meta_test_event_code TEXT` — Test Event Code for Meta Events Manager verification
- `meta_stage_event_map JSONB` — JSON object mapping stage keys to Meta event names (null = resolver applies defaults)

**v32** — New `meta_lead_attribution` table:
- `member_id TEXT NOT NULL UNIQUE` — natural key (one row per member)
- Attribution fields: `fbc`, `fbp`, `fbclid`, `initial_event_id`, `page_url`, `client_ip`, `client_user_agent`
- Lifecycle markers: `lead_sent_at`, `lead_status`, `contact_sent_at`, `purchase_sent_at`, `schedule_sent_at` (all `TIMESTAMPTZ`)
- `CREATE INDEX IF NOT EXISTS idx_meta_lead_attribution_member ON meta_lead_attribution(member_id)`
- Both migrations use Postgres types (`JSONB`, `TIMESTAMPTZ`, `NOW()`), not SQLite `datetime('now')`

### Task 2 — Drizzle exports (`4e98663a`)

`apps/staff-web/server/db/schema.ts`:

- `studioOwnerConfig` — added `metaPixelId`, `metaTestEventCode`, `metaStageEventMap` using `text()` (JSON stored as string; resolver parses)
- `metaLeadAttribution` — new export mapping `meta_lead_attribution` table; `memberId` is `.notNull().unique()`; all 14 columns match v32 DDL exactly; uses `text()` for timestamps (consistent with file's existing pattern)

### Task 3 — Resolver (TDD) + Secret Registration (`686f9c9b` + `66d5498d`)

**`apps/staff-web/server/lib/stage-event-map.ts`** (new, pure, no I/O):
- `DEFAULT_STAGE_EVENT_MAP = { lead: "Lead", contact: "Contact", purchase: "Purchase", schedule: "Schedule" }`
- `resolveStageEvent(configJson, stage)` — accepts `string | Record<string,string> | null | undefined`; never throws; malformed JSON → default; empty/null map values → default; partial overrides fall back to default for missing keys

**`apps/staff-web/server/lib/stage-event-map.test.ts`** (18 tests, all passing):
- null/undefined/empty → 4 default values
- Full JSON string override
- Partial JSON (missing key → default)
- Malformed JSON (never throws)
- Object-input branch (JSONB driver pre-parsed object)
- Edge cases: empty map `{}`, null value in map, empty-string value in map

**`apps/staff-web/server/register-secrets.ts`**:
- `registerRequiredSecret({ key: "META_CAPI_TOKEN", label: "Meta Conversions API Token", ... })` added
- Documented that it lives in `app_secrets` only (not env var); read by Fly worker via `readAppSecretByKey`; requires `BETTER_AUTH_SECRET` to match Vercel (D-03 / Pitfall 4)

## Decisions Made

- `meta_stage_event_map` uses `text()` in Drizzle (not `jsonb()`) because no `jsonb` helper is imported in `@agent-native/core/db/schema`; matches existing schema.ts pattern
- `resolveStageEvent` accepts both `string` and `Record<string,string>` to handle TEXT-column (JSON string) and JSONB-driver (pre-parsed object) cases
- All timestamp columns in `metaLeadAttribution` use `text()` in the Drizzle export for consistency with the rest of the file (all other timestamps are `text()` even for `TIMESTAMPTZ` DDL columns)
- `META_CAPI_TOKEN` is `scope: "user"` (not org) — matches all other secrets; no org provisioning in staff-web

## Verification Results

| Check | Result |
|-------|--------|
| `grep "version: 31"` in db.ts | FOUND (line 389) |
| `grep "version: 32"` in db.ts | FOUND (line 395) |
| `grep "meta_lead_attribution"` in db.ts | FOUND (v32 CREATE TABLE + index) |
| `grep "meta_stage_event_map JSONB"` in db.ts | FOUND (v31 ALTER TABLE) |
| `grep "metaLeadAttribution"` in schema.ts | FOUND (line 733) |
| `grep "meta_pixel_id"` in schema.ts | FOUND (line 661) |
| `grep "initial_event_id"` in schema.ts | FOUND (line 739) |
| 18 Vitest unit tests | ALL PASS |
| `npx tsc --noEmit` in apps/staff-web | NO NEW ERRORS |
| `META_CAPI_TOKEN` in register-secrets.ts | FOUND (registerRequiredSecret) |
| stage-event-map.ts in server/lib/ (not plugins/) | CONFIRMED |

## Post-Deploy Action Required

**IMPORTANT: v31 + v32 migrations are NOT auto-applied to the gymos-demo Neon DB by the Vercel build.** They run via `runMigrations` on app boot. After deploying this commit to Vercel, confirm both migrations are applied to `gymos-demo` (project id `billowing-sun-51091059`) by checking the migration version table or running:

```sql
-- Verify v31 applied:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'studio_owner_config'
  AND column_name IN ('meta_pixel_id', 'meta_test_event_code', 'meta_stage_event_map');

-- Verify v32 applied:
SELECT table_name FROM information_schema.tables
WHERE table_name = 'meta_lead_attribution';
```

This is the recurring migration-drift gotcha from project memory — migrations only run on first Nitro request that hits the migration-gated route.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan only creates schema contracts and a pure resolver. No UI rendering, no data source wiring in this plan.

## Self-Check: PASSED

Files exist and commits are present:
