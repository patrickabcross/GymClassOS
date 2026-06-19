---
phase: BD3
plan: "01"
subsystem: hq-brain
tags: [classification-engine, telemetry, health-signals, cohorts, studio-console, tdd]
dependency_graph:
  requires: [BD2-01, BD2-02, BD2-03, BD2-04, BD2-05, BD2-06]
  provides: [HQB-classification-engine, GET-api-studios, list-studios-action]
  affects: [BD3-02-console-ui]
tech_stack:
  added: []
  patterns:
    - "Deterministic health classification over telemetry aggregates (no LLM)"
    - "Staleness gate runs first — stale studio never shown as healthy (D-02/HQB-03)"
    - "getDbExec() raw SQL for DISTINCT ON subquery (mirrors usage-metrics.ts)"
    - "Shared query helper factored to avoid route/action duplication"
    - "TDD RED→GREEN: tests written before implementation"
key_files:
  created:
    - packages/hq-schema/src/constants.ts (appended 8 threshold constants)
    - apps/hq/server/lib/studio-health.ts
    - apps/hq/server/lib/studio-health.test.ts
    - apps/hq/server/lib/list-studios-query.ts
    - apps/hq/app/routes/api.studios.ts
    - apps/hq/actions/list-studios.ts
    - apps/hq/vitest.config.ts
  modified:
    - packages/hq-schema/package.json (added ./constants subpath export)
decisions:
  - "Used getDbExec() raw SQL (not db.execute()) for DISTINCT ON query — LibSQL Drizzle type has no .execute() method at compile time; getDbExec() is the established pattern in apps/hq (usage-metrics.ts)"
  - "Added apps/hq/vitest.config.ts scoped to server/**/*.test.ts + node env — apps/hq has no per-package vitest config; the vite.config.ts is react-router SSR and causes preamble errors with pure TS tests"
  - "Added ./constants subpath export to hq-schema/package.json — RESEARCH.md uses @gymos/hq-schema/constants import; export was missing from package.json"
  - "Factored shared query into list-studios-query.ts helper — both api.studios.ts (route) and list-studios.ts (action) call queryStudiosWithHealth() with no duplication"
metrics:
  duration_seconds: 838
  completed_date: "2026-06-19"
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 1
key_links:
  - from: apps/hq/app/routes/api.studios.ts
    to: apps/hq/server/lib/list-studios-query.ts
    via: queryStudiosWithHealth()
  - from: apps/hq/actions/list-studios.ts
    to: apps/hq/server/lib/list-studios-query.ts
    via: queryStudiosWithHealth()
  - from: apps/hq/server/lib/list-studios-query.ts
    to: apps/hq/server/lib/studio-health.ts
    via: classifyStudioHealth()
  - from: apps/hq/server/lib/studio-health.ts
    to: packages/hq-schema/src/constants.ts
    via: "@gymos/hq-schema/constants"
---

# Phase BD3 Plan 01: HQB Classification Engine + Studio Console Read Model Summary

**One-liner:** Deterministic studio health classification (staleness-first, no LLM) over hq_telemetry_snapshots with a DISTINCT ON read-model route and agent action returning one row per studio with health signals and 30-day token spend.

## What Was Built

### Task 1: Threshold constants + classifyStudioHealth engine (TDD)

Eight threshold constants appended additively to `packages/hq-schema/src/constants.ts`:
- `TELEMETRY_STALENESS_HOURS = 26` (25h watchdog + 1h buffer)
- `DORMANT_ACTIVE_MEMBERS_THRESHOLD = 5`
- `UNDER_MESSAGING_THRESHOLD = 10`
- `LOW_RETENTION_THRESHOLD = 0.5`
- `POWER_USER_RETENTION_THRESHOLD = 0.75`, `POWER_USER_ACTIVE_MEMBERS_THRESHOLD = 20`, `POWER_USER_MESSAGES_THRESHOLD = 50`
- `HIGH_TOKEN_SPEND_THRESHOLD = 10000`

`classifyStudioHealth()` in `apps/hq/server/lib/studio-health.ts` implements the staleness-first classification gate (D-02/HQB-03). Order:
1. `lastTelemetryReceivedAt === null` → `{status:"stale", cohort:"unknown", signals:["No telemetry received"]}`
2. `ageHours > TELEMETRY_STALENESS_HOURS` → `{status:"stale", ...signals:["{N}h ago"]}`
3. `snapshot === null` → `{status:"stale", ...signals:["No snapshot data"]}`
4. Engagement signal checks: dormant, under-messaging, low-retention → at-risk if any trip
5. Power-user cohort: all positive → `{cohort:"power-user"}` if no at-risk signal

13 unit tests in `studio-health.test.ts` covering all branches. All pass.

### Task 2: list-studios action + GET /api/studios resource route

`apps/hq/server/lib/list-studios-query.ts` contains the shared `queryStudiosWithHealth()` helper. Uses `getDbExec()` raw SQL (established pattern in apps/hq) with the DISTINCT ON (studio_id) ORDER BY received_at DESC subquery from BD3-RESEARCH.md + 30-day token spend SUM via `INTERVAL '30 days'`.

`apps/hq/app/routes/api.studios.ts` — GET /api/studios resource route returning `StudiosResponse { studios: StudioConsoleRow[] }`. Carries `guard:allow-unscoped` comment. Mirrors `api.provisioning-runs.ts` pattern exactly.

`apps/hq/actions/list-studios.ts` — `defineAction` exposing the same data to the HQB Brain/Dispatcher agent. Schema is `z.object({}).strict()` (no inputs needed — returns all studios).

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 (TDD: constants + engine) | `ca4eb189` | feat(BD3-01): classifyStudioHealth engine + threshold constants (HQB-02/03/04) |
| Task 2 (route + action) | `29938364` | feat(BD3-01): list-studios action + GET /api/studios resource route (HQB-01) |

## Verification Results

- `pnpm -F @gymos/hq exec vitest --run --config vitest.config.ts studio-health` — 13/13 passed
- `pnpm -F @gymos/hq exec tsc --noEmit` — clean (exit 0)
- `node scripts/guard-hq-no-pii.mjs` — clean (no PII-shaped columns)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ./constants subpath export to hq-schema/package.json**
- **Found during:** Task 1 setup
- **Issue:** RESEARCH.md specifies `import from "@gymos/hq-schema/constants"` but the package.json exports map had no `./constants` entry. Without it, the subpath import would resolve to undefined at runtime even though the barrel re-exports it.
- **Fix:** Added `"./constants": "./src/constants.ts"` to the exports map in package.json.
- **Files modified:** `packages/hq-schema/package.json`
- **Commit:** `ca4eb189`

**2. [Rule 3 - Blocking] Used getDbExec() instead of db.execute() for raw SQL**
- **Found during:** Task 2 typecheck
- **Issue:** The plan specifies `db.execute<Row>(sql\`...\`)` mirroring watchdog.ts, but `getDb()` in apps/hq returns a LibSQL-typed Drizzle instance which has no `.execute()` method in its TypeScript types. `tsc --noEmit` failed with `TS2339: Property 'execute' does not exist`.
- **Fix:** Used `getDbExec().execute({ sql, args })` from `@agent-native/core/db` instead — the same pattern used by `apps/hq/server/lib/usage-metrics.ts` for raw SQL in the web app context.
- **Files modified:** `apps/hq/server/lib/list-studios-query.ts`
- **Commit:** `29938364`

**3. [Rule 3 - Blocking] Added apps/hq/vitest.config.ts**
- **Found during:** Task 1 verification setup
- **Issue:** apps/hq had no vitest.config.ts. The package.json `test` script runs `vitest --run` which uses the vite.config.ts (react-router SSR build) — this causes preamble-detection failures for pure TS server tests.
- **Fix:** Created `apps/hq/vitest.config.ts` scoped to `server/**/*.test.ts` with `environment: "node"` — matching the pattern used by `packages/hq-schema/vitest.config.ts`.
- **Files modified:** `apps/hq/vitest.config.ts` (new)
- **Commit:** `ca4eb189`

### Out-of-Scope Issues (Deferred)

- **Pre-existing:** `packages/hq-schema` typecheck fails with `TS2591: Cannot find name 'crypto'` in `token.ts` (missing `@types/node`). This existed before BD3-01 (confirmed via git stash test). Not caused by any change in this plan. Logged to deferred-items.

## Known Stubs

None. The classification engine is fully wired. The route and action both call `queryStudiosWithHealth()` which returns real data from hq_telemetry_snapshots. The `StudioConsoleRow.health` field contains the full `StudioHealthSignals` object. No placeholder or hardcoded empty data.

## Self-Check

Files created/modified:

- [x] `packages/hq-schema/src/constants.ts` — exists (modified, appended)
- [x] `packages/hq-schema/package.json` — exists (modified, added ./constants export)
- [x] `apps/hq/server/lib/studio-health.ts` — exists
- [x] `apps/hq/server/lib/studio-health.test.ts` — exists
- [x] `apps/hq/server/lib/list-studios-query.ts` — exists
- [x] `apps/hq/app/routes/api.studios.ts` — exists
- [x] `apps/hq/actions/list-studios.ts` — exists
- [x] `apps/hq/vitest.config.ts` — exists

Commits:

- [x] `ca4eb189` — Task 1
- [x] `29938364` — Task 2
