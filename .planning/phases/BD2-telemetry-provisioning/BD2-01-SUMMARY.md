---
phase: BD2-telemetry-provisioning
plan: 01
subsystem: database
tags: [drizzle, postgres, sqlite, zod, migrations, hq-schema, telemetry, provisioning]

# Dependency graph
requires:
  - phase: BD1-hq-foundation
    provides: hq-schema package scaffold (hqAppMeta, migrations v1-v3, guard:hq-no-pii CI guard)

provides:
  - HQ migrations v4-v7 (hq_studios, hq_provisioning_runs, hq_telemetry_snapshots, hq_token_usage, hq_studio_tokens)
  - Drizzle table defs for all five BD2 domain tables in @gymos/hq-schema
  - TelemetrySnapshot Zod allow-list schema (exported from @gymos/hq-schema)
  - TelemetrySnapshotInput TypeScript type
  - 7-case vitest suite proving .strict() PII rejection

affects:
  - BD2-02 (saga/PROV plans import hqProvisioningRuns, hqStudios, hqStudioTokens)
  - BD2-03 (TEL ingest endpoint imports TelemetrySnapshot + hqTelemetrySnapshots + hqTokenUsage + hqStudioTokens)
  - BD3-HQB (Brain cohort queries read hq_telemetry_snapshots + hq_token_usage)
  - BD3-HQD (Dispatcher opt-in tables sit alongside hq_studios)

# Tech tracking
tech-stack:
  added:
    - zod ^4.3.6 (dep in @gymos/hq-schema)
    - vitest ^4.1.5 (devDep in @gymos/hq-schema)
  patterns:
    - Dual-dialect migration entries ({postgres, sqlite}) for HQ domain tables
    - Zod allow-list schema + .strict() at ingest boundary (not on schema export)
    - Per-package vitest.config.ts scoped to src/**/*.test.ts

key-files:
  created:
    - packages/hq-schema/src/telemetry.ts (TelemetrySnapshot Zod schema + TelemetrySnapshotInput type)
    - packages/hq-schema/src/telemetry.test.ts (7-case PII rejection + validation test suite)
    - packages/hq-schema/vitest.config.ts (scoped to src/**/*.test.ts)
  modified:
    - packages/hq-schema/src/migrations.ts (v4 hq_studios, v5 hq_provisioning_runs, v6 hq_telemetry_snapshots+hq_token_usage, v7 hq_studio_tokens)
    - packages/hq-schema/src/schema.ts (Drizzle table defs: hqStudios, hqProvisioningRuns, hqTelemetrySnapshots, hqTokenUsage, hqStudioTokens)
    - packages/hq-schema/src/index.ts (export * from ./telemetry.js added)
    - packages/hq-schema/package.json (zod dep, vitest devDep, test script, ./telemetry export path)

key-decisions:
  - "TelemetrySnapshot exported WITHOUT .strict() — callers apply .strict() at the ingest boundary to keep the schema composable"
  - "Dual-dialect migrations: postgres uses NOW(), sqlite uses datetime('now') — matching existing v2/v3 pattern"
  - "hq_provisioning_runs stores only neon_project_id/vercel_project_id/fly_app_name — NEVER a connection string (D-13)"
  - "hq_studio_tokens stores sha256 hash only (token_hash column) — studio holds plaintext, HQ never does (D-05)"
  - "v6 migration puts hq_telemetry_snapshots + hq_token_usage in one entry separated by ; (matches v2 pattern)"
  - "apps/hq/server/db/schema.ts already does export * from @gymos/hq-schema/schema — no change needed, new tables flow through automatically"
  - "Per-package vitest.config.ts added to hq-schema rather than relying on root config (which only covers tests/integration/**)"

patterns-established:
  - "Pattern: Zod allow-list + .strict() at boundary — schema owns the field list; ingest endpoint owns the strictness gate"
  - "Pattern: dual-dialect migration entries for all new HQ tables (postgres NOW() / sqlite datetime('now'))"

requirements-completed: [TEL-04, TEL-05, TEL-06, PROV-07, PROV-08, PROV-09]

# Metrics
duration: 35min
completed: 2026-06-19
---

# Phase BD2 Plan 01: HQ Schema Migrations v4-v7 + TelemetrySnapshot Summary

**Additive HQ migrations v4-v7 for five BD2 domain tables + Zod allow-list TelemetrySnapshot schema with sha256-hash token storage and 7-case PII-rejection test suite**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-19T12:30:00Z
- **Completed:** 2026-06-19T13:07:00Z
- **Tasks:** 3 (+ RED/GREEN commits for TDD task)
- **Files modified:** 7

## Accomplishments

- Five BD2 HQ domain tables added as additive migrations v4-v7 with dual-dialect SQL (postgres `NOW()` / sqlite `datetime('now')`) and full `IF NOT EXISTS` idempotency guards
- Drizzle ORM table definitions for all five tables exported from `@gymos/hq-schema` and auto-flowing into the merged `apps/hq` db schema via the existing `export *` chain
- `TelemetrySnapshot` Zod allow-list schema with 7 test cases proving `.strict()` structurally rejects PII fields (`member_email`, `memberName`) at parse time — not just by convention
- All CI guards pass: `guard:hq-no-pii` (no connection/dsn columns), `guard:no-drizzle-push` clean, `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Additive HQ migrations v4-v7** — `9d4f22bd` (feat)
2. **Task 2: Drizzle table defs + schema wiring** — `190c12ae` (feat)
3. **Task 3 RED: Failing TelemetrySnapshot tests** — `fe518bb6` (test)
4. **Task 3 GREEN: TelemetrySnapshot implementation** — `9c87e0d4` (feat)

## Files Created/Modified

- `packages/hq-schema/src/migrations.ts` — v4-v7 appended; v1-v3 byte-for-byte unchanged
- `packages/hq-schema/src/schema.ts` — hqStudios, hqProvisioningRuns, hqTelemetrySnapshots, hqTokenUsage, hqStudioTokens Drizzle defs
- `packages/hq-schema/src/telemetry.ts` — TelemetrySnapshot Zod allow-list schema + TelemetrySnapshotInput type
- `packages/hq-schema/src/telemetry.test.ts` — 7 vitest cases: valid parse, PII rejection ×2, missing field, negative count, rate out-of-range, non-integer
- `packages/hq-schema/src/index.ts` — `export * from "./telemetry.js"` added
- `packages/hq-schema/package.json` — zod dep, vitest devDep, test script, `./telemetry` export path
- `packages/hq-schema/vitest.config.ts` — scoped to `src/**/*.test.ts`

## Decisions Made

- `TelemetrySnapshot` exported without `.strict()` — the ingest endpoint calls `.strict()` so the schema stays composable for the push-job serialiser, which doesn't need strict mode
- `apps/hq/server/db/schema.ts` needed no change: it already `export * from "@gymos/hq-schema/schema"`, so all new tables flow through to the merged `schema` object in `index.ts` automatically
- Added a per-package `vitest.config.ts` in hq-schema because the root vitest config only covers `tests/integration/**` (the cross-app suite); per-package unit tests need their own config scoped to `src/**/*.test.ts`

## Deviations from Plan

**1. [Rule 3 - Blocking] Added vitest.config.ts to hq-schema**
- **Found during:** Task 3 (TDD RED)
- **Issue:** `pnpm --filter @gymos/hq-schema test` found no test files because vitest was picking up the root config (`tests/integration/**`), not `src/**/*.test.ts`
- **Fix:** Created `packages/hq-schema/vitest.config.ts` scoping to `src/**/*.test.ts`
- **Files modified:** `packages/hq-schema/vitest.config.ts` (created)
- **Verification:** 7 tests found and passed after adding config
- **Committed in:** `fe518bb6` (part of Task 3 RED commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking: missing vitest config)
**Impact on plan:** Fix was necessary for the test runner to find the test file. No scope creep.

## Issues Encountered

None beyond the vitest config blocking issue (documented as deviation above).

## User Setup Required

None — no external service configuration required for this plan. Live migration apply against HQ Neon is deferred-on-external-dependency (operator must have HQ Neon credentials).

## Next Phase Readiness

- All five BD2 HQ tables exist as additive migrations + Drizzle defs — BD2-02 (saga/PROV) and BD2-03 (TEL ingest) can reference these tables immediately
- `TelemetrySnapshot.strict()` is the structural PII gate for BD2-03 (HQ ingest endpoint) — import from `@gymos/hq-schema` or `@gymos/hq-schema/telemetry`
- `guard:hq-no-pii` remains clean — future plans adding HQ schema columns must pass this guard

---
*Phase: BD2-telemetry-provisioning*
*Completed: 2026-06-19*
