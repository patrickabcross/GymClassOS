---
phase: BD2-telemetry-provisioning
plan: "05"
subsystem: services/hq-worker provisioning saga
tags: [saga, rollback, idempotency, provisioning, pg-boss, neon, vercel, fly, telemetry-token]
dependency_graph:
  requires:
    - BD2-01 (hq-schema tables: hqProvisioningRuns, hqStudioTokens, hqStudios)
    - BD2-02 (NeonApi, VercelApi, FlyApi adapter interfaces + mocks)
    - BD2-04 (generateTelemetryToken + hashToken — moved to @gymos/hq-schema/token)
  provides:
    - compensate(run, apis, log) — LIFO teardown of completed provisioning steps
    - runStep(runId, stepNum, fn) — idempotent per-step execution wrapper
    - runProvisioningSaga(run, apis, log, migrator, seeder) — 8-step orchestrator
    - registerProvisionStudio(boss, apis) — pg-boss queue registration
    - @gymos/hq-schema/token — hashToken + generateTelemetryToken (canonical location)
  affects:
    - packages/hq-schema (token.ts added; index.ts + package.json updated)
    - apps/hq/server/lib/telemetry-token.ts (now re-exports from @gymos/hq-schema/token)
tech_stack:
  added:
    - drizzle-orm ^0.45.2 (hq-worker dep — was missing; transitive via hq-schema only)
    - "@neondatabase/serverless ^1.1.0 (hq-worker dep — getHqDb() neon-serverless driver)"
    - ws ^8.18.0 (hq-worker dep — required by neon-serverless WebSocket mode)
    - "@types/ws ^8.5.0 (hq-worker devDep — ws type declarations)"
  patterns:
    - LIFO compensation engine (compensate.ts) — built and tested BEFORE happy path (D-10)
    - Per-step idempotency via step_N_at timestamp columns (runStep.ts)
    - Saga orchestrator with injected migrator/seeder for test isolation
    - pg-boss handler receives Job[] array (pg-boss 12 pattern — batch size 1)
    - Token helpers in @gymos/hq-schema/token (avoids cross-rootDir import from hq-worker)
key_files:
  created:
    - services/hq-worker/src/lib/db.ts
    - services/hq-worker/src/lib/compensate.ts
    - services/hq-worker/src/lib/compensate.test.ts
    - services/hq-worker/src/lib/run-step.ts
    - services/hq-worker/src/lib/run-step.test.ts
    - services/hq-worker/src/queues/provision-studio.ts
    - services/hq-worker/src/queues/provision-studio.test.ts
    - packages/hq-schema/src/token.ts
  modified:
    - packages/hq-schema/src/index.ts (+ export ./token.js)
    - packages/hq-schema/package.json (+ ./token export path)
    - apps/hq/server/lib/telemetry-token.ts (re-exports from @gymos/hq-schema/token)
    - services/hq-worker/package.json (+ drizzle-orm, @neondatabase/serverless, ws, @types/ws)
decisions:
  - "BD2-05: LIFO compensation order confirmed as 7(revoke_token)→6(remove_dns)→5(delete_fly)→4(delete_vercel)→1(delete_neon); steps 2,3,8 have no compensation (project deletion covers 2/3; step 8 registry write is idempotent)"
  - "BD2-05: runStep() takes (runId, stepNum, fn) and calls getHqDb() internally — enables vi.mock('./db.js') in tests without passing a db argument"
  - "BD2-05: provision-studio.ts useMockApis param defaults to true so unit tests skip the live-run guard; registerProvisionStudio passes false for production"
  - "BD2-05: token helpers (hashToken, generateTelemetryToken) moved from apps/hq to @gymos/hq-schema/token — avoids tsc rootDir violation when hq-worker imports them"
  - "BD2-05: pg-boss 12 WorkHandler receives Job<T>[] (array, not single item); handler destructures jobs[0] (batch size defaults to 1)"
metrics:
  duration: "~19 minutes (1145 seconds)"
  completed: "2026-06-19"
  tasks: 3
  files: 8 created, 4 modified
---

# Phase BD2 Plan 05: Provisioning Saga Core Summary

LIFO compensation engine + per-step idempotency + 8-step provisioning saga; rollback built and unit-tested before any forward step; all 23 tests green; typecheck clean; guard:hq-no-pii passes.

## What Was Built

### Task 1: HQ-Neon db handle + LIFO compensation engine (ROLLBACK FIRST)

`services/hq-worker/src/lib/db.ts` — `getHqDb()` Drizzle handle (neon-serverless WebSocket driver against `DATABASE_URL_UNPOOLED`) with pg-core mirrors of the 5 HQ tables (`hqProvisioningRuns`, `hqStudios`, `hqStudioTokens`, `hqTelemetrySnapshots`, `hqTokenUsage`). Exports `HqProvisioningRun` inferred row type. Existing `getBoss` re-export in `boss.ts` untouched.

`services/hq-worker/src/lib/compensate.ts` — LIFO teardown engine per D-10 (built before the forward saga). Given a run row and a `ProvisionApis` bag, builds the reverse step list from `step_N_at` flags (7→6→5→4→1; steps 2/3/8 have no compensation), wraps each in try/catch (best-effort), collects errors, writes `status='failed_terminal'` + `compensationErrors` to the run row. Never receives or references a Neon connection string.

**4 tests verified:** LIFO order 5→4→1 when steps 1-5 complete, LIFO order 7→6→5→4→1 when all 8 complete, throwing compensation step doesn't abort rest (error recorded), resource IDs only (no connection strings in teardown calls).

### Task 2: Per-step idempotency helper (runStep)

`services/hq-worker/src/lib/run-step.ts` — `runStep(runId, stepNum, fn)` reads the run row from `getHqDb()`; if `step_N_at` is already set → returns `{ skipped: true }` without calling `fn()`; else calls `fn()`, marks `step_N_at` on success, does NOT mark on throw (so retry re-runs the step and saga catch triggers compensation).

**4 tests verified:** fn called + step marked when null, fn skipped when set, step not marked on fn throw, throws when run not found.

### Task 3: 8-step provisioning saga orchestrator

`services/hq-worker/src/queues/provision-studio.ts` — `runProvisioningSaga(run, apis, log, migrator, seeder)` wraps all 8 steps in `runStep()`:

1. Neon project (find-or-create via `apis.neon.findProjectBySlug` then `createProject`) → store `neon_project_id`; `dbUrl`/`dbUrlUnpooled` held IN-MEMORY only
2. Studio migrations (injected `migrator(dbUrlUnpooled)`)
3. Seed + admin (injected `seeder(dbUrl)`)
4. Vercel project + env vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `STUDIO_ID`) + deploy + waitForDeploy → store `vercel_project_id`
5. Fly app (find-or-create) + `setSecrets` (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `STUDIO_ID`) + createMachine + waitForMachineStart → store `fly_app_name`
6. Attach subdomain (Vercel `attachDomain`) → store `subdomain`
7. Issue telemetry token: `generateTelemetryToken()` → `hashToken()` stored in `hq_studio_tokens`; plaintext → `STUDIO_TELEMETRY_TOKEN` set on Vercel + Fly
8. Register studio: `hq_studios.status='active'`; `hq_provisioning_runs.status='completed'`

On any step failure: `compensate(run, apis, log)` called; error re-thrown (pg-boss marks job failed).

`registerProvisionStudio(boss, apis)` wires pg-boss worker + queue. Producer contract documented: `boss.send("provision-studio", { runId }, { expireInSeconds: 600, retryLimit: 3 })` (P-07).

**4 tests verified:** happy path all 8 steps + token propagation, resume at step 4 (steps 1-3 skipped by runStep, fn not called for skipped steps), failure at step 6 → compensate() called, PII boundary (no `postgresql://` in any `db.update.set()` call).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing drizzle-orm + @neondatabase/serverless + ws deps in hq-worker**
- **Found during:** Task 1 first test run
- **Issue:** `vitest` failed to load `drizzle-orm` because it was only a transitive dep (via `@gymos/hq-schema`), not declared in `hq-worker/package.json`
- **Fix:** Added `drizzle-orm ^0.45.2`, `@neondatabase/serverless ^1.1.0`, `ws ^8.18.0` to deps; `@types/ws ^8.5.0` to devDeps
- **Files modified:** `services/hq-worker/package.json`
- **Commit:** 51e3062c, f94deef4

**2. [Rule 3 - Blocking] Token helpers in apps/ crossed rootDir boundary**
- **Found during:** Task 3 typecheck (`tsc --noEmit`)
- **Issue:** `services/hq-worker` has `rootDir: ./src`; importing from `../../../../apps/hq/server/lib/telemetry-token.ts` violates it
- **Fix:** Moved canonical implementations of `hashToken` + `generateTelemetryToken` to `packages/hq-schema/src/token.ts`; added `./token` export path to `hq-schema/package.json`; `apps/hq/server/lib/telemetry-token.ts` now re-exports from `@gymos/hq-schema/token`
- **Files modified:** `packages/hq-schema/src/token.ts` (created), `packages/hq-schema/src/index.ts`, `packages/hq-schema/package.json`, `apps/hq/server/lib/telemetry-token.ts`
- **Commit:** f94deef4

**3. [Rule 3 - Blocking] pg-boss WorkHandler signature: array not single job**
- **Found during:** Task 3 typecheck
- **Issue:** pg-boss 12 `WorkHandler<T>` receives `Job<T>[]` (array), not `Job<T>`. Plan assumed single-item handler signature.
- **Fix:** Updated handler to receive `jobs: PgBossJob<ProvisionStudioPayload>[]` and destructure `jobs[0]`
- **Files modified:** `services/hq-worker/src/queues/provision-studio.ts`
- **Commit:** f94deef4

**4. [Rule 3 - Blocking] vi.mock hoisting with module-level const mocks**
- **Found during:** Task 3 first test run
- **Issue:** `compensateMock` referenced in `vi.mock()` factory before declaration (hoisting issue). Vitest hoists `vi.mock()` calls to top of file but the `const compensateMock = vi.fn()` binding hasn't run yet.
- **Fix:** Replaced module-level `const` captures with inline `vi.fn()` in mock factories; used `vi.mocked()` post-import to access mocks
- **Files modified:** `services/hq-worker/src/queues/provision-studio.test.ts`
- **Commit:** f94deef4

**5. [Rule 1 - Bug] runStep took db as parameter but called db.select() on it incorrectly**
- **Found during:** Task 2 first test run
- **Issue:** Test passed `mockSelect` (a function) as first arg; `runStep` called `db.select()` on it — `db.select is not a function`
- **Fix:** Changed `runStep` to call `getHqDb()` internally (same pattern as compensate); test mocks `./db.js` module instead of passing db
- **Files modified:** `services/hq-worker/src/lib/run-step.ts`, `services/hq-worker/src/lib/run-step.test.ts`
- **Commit:** 6d1205b5

## Known Stubs

- **`StudioMigrator` / `StudioSeeder`** in `registerProvisionStudio` pg-boss handler — wired as `console.warn` stubs logging "deferred-on-external-dependency". Live implementation will run `drizzle-kit migrate` against the new Neon + seed admin user. This is intentional per D-12; tests inject stubbed functions; no plan goal is blocked.

## Self-Check: PASSED

All 8 key files exist. Commits f94deef4, 6d1205b5, 51e3062c all present on master. 23 tests green. `tsc --noEmit` exit 0. `guard:hq-no-pii` exit 0.
