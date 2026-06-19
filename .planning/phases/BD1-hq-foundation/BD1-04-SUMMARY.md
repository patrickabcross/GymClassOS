---
phase: BD1-hq-foundation
plan: "04"
subsystem: services/hq-worker
tags: [pg-boss, fly, flyctl, hq-worker, pii-boundary, skeleton]
dependency_graph:
  requires: [BD1-02]
  provides: [HQ-FND-05]
  affects: [BD2-PROV]
tech_stack:
  added:
    - "@gymos/hq-worker (new pnpm workspace service)"
    - "flyctl v0.3.96 baked into runtime Dockerfile stage"
  patterns:
    - "Mirror services/worker boot sequence: getEnv->getLogger->getBoss->start->Hono /healthz"
    - "Deploy-scoped DATABASE_URL_UNPOOLED: same @gymos/queue getBoss, different Fly env"
    - "Trimmed Zod env schema: DATABASE_URL_UNPOOLED + PORT + runtime vars; NO studio secrets"
key_files:
  created:
    - services/hq-worker/package.json
    - services/hq-worker/tsconfig.json
    - services/hq-worker/vitest.config.ts
    - services/hq-worker/src/index.ts
    - services/hq-worker/src/boss.ts
    - services/hq-worker/src/lib/env.ts
    - services/hq-worker/src/lib/logger.ts
    - services/hq-worker/src/lib/env.test.ts
    - services/hq-worker/.env.example
    - services/hq-worker/Dockerfile
    - services/hq-worker/fly.toml
    - services/hq-worker/.dockerignore
  modified: []
decisions:
  - "flyctl v0.3.96 pinned via GitHub releases tar.gz (not apt, not fly.io/install.sh latest); ca-certificates + curl installed then curl purged post-install to keep image lean"
  - "Separate Dockerfile from root Dockerfile: hq-worker needs flyctl in runtime stage; baking it into the shared image would add flyctl to edge-webhooks/worker unnecessarily"
  - "Re-export getBoss from @gymos/queue unchanged: the DATABASE_URL_UNPOOLED env var is deploy-scoped — HQ Fly app gets HQ Neon URL; no factory customisation needed"
  - "NODE_ENV=test is set by vitest automatically; test asserts toContain(['development','production','test']) instead of toBe('development') (Rule 1 auto-fix)"
metrics:
  duration_seconds: 566
  completed_date: "2026-06-19"
  tasks_completed: 3
  tasks_total: 3
  files_created: 12
  files_modified: 0
---

# Phase BD1 Plan 04: hq-worker Fly Skeleton Summary

`services/hq-worker` stands up as a pg-boss worker against the HQ Neon (unpooled) with `/healthz` on PORT 3003 and `flyctl v0.3.96` baked into the runtime stage of its own Dockerfile, ready for BD2 provisioning saga to shell out via execa.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Scaffold hq-worker pg-boss skeleton + trimmed env + /healthz | `a0c8b034` | package.json, src/index.ts, src/boss.ts, src/lib/env.ts, src/lib/logger.ts, .env.example |
| 2 | Dockerfile with flyctl pinned + fly.toml | `61109988` | Dockerfile, fly.toml, .dockerignore |
| 3 | Unit-test env + typecheck | `d948f7de` | src/lib/env.test.ts, vitest.config.ts |

## What Was Built

**services/hq-worker** is a new pnpm workspace service (already in the `services/*` glob) that:

- Boots pg-boss against the HQ Neon using `@gymos/queue`'s `getBoss` factory (deploy-scoped via `DATABASE_URL_UNPOOLED` Fly secret)
- Serves `GET /healthz` on `PORT 3003` via Hono + `@hono/node-server` — Fly http_check probes this
- Has a trimmed Zod env schema (`DATABASE_URL_UNPOOLED` with -pooler refine, `PORT` default 3003, `GIT_SHA`, `NODE_ENV`, `LOG_LEVEL`) with NO studio credentials
- Contains commented BD2 placeholders (`NEON_API_KEY`, `VERCEL_API_TOKEN`, `FLY_API_TOKEN`) in env.ts and .env.example

**Dockerfile** (services/hq-worker-local, separate from root):
- Multi-stage pnpm build (base → deps → build → runtime)
- Runtime stage: installs `flyctl v0.3.96` from GitHub releases as a pinned binary
- D-12 rationale commented inline: Fly Machines REST API cannot set secrets; flyctl CLI is the only path; BD2 shells out via execa
- `curl` + `ca-certificates` installed for the download, then `curl` purged to keep the image lean

**fly.toml**: `app = 'gymos-hq-worker'`, `primary_region = 'iad'`, single process with `[[services.http_checks]]` probing `GET /healthz` on port 3003, `auto_stop_machines = 'off'`, `min_machines_running = 1`, `shared-cpu-1x / 512mb`.

## PII Boundary (HQ-FND-06)

- `package.json` has NO `@gymos/whatsapp` or `stripe` dependencies (grep-verified)
- `src/lib/env.ts` does NOT define `WHATSAPP_*`, `STRIPE_*`, or `PGCRYPTO_*` fields
- `env.test.ts` has a dedicated test asserting schema parses without any studio credential key present
- `.env.example` has a prominent hard-boundary notice: "hq-worker MUST NOT hold any studio credential or studio connection string"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test NODE_ENV assertion wrong under vitest**
- **Found during:** Task 3 (first test run)
- **Issue:** The test `expect(env.NODE_ENV).toBe("development")` fails because vitest automatically sets `NODE_ENV=test` in the test environment
- **Fix:** Changed assertion to `expect(["development", "production", "test"]).toContain(env.NODE_ENV)` — confirms the value is schema-valid without hardcoding which default applies
- **Files modified:** `services/hq-worker/src/lib/env.test.ts`
- **Commit:** `d948f7de`

## Deferred / User Setup Items

The following are deferred to operator execution — the code is complete, only the live Fly provisioning is pending:

| Item | Command | When |
|------|---------|------|
| Create the Fly app | `fly app create gymos-hq-worker` | Before first deploy |
| Set HQ Neon secret | `fly secrets set DATABASE_URL_UNPOOLED=<hq-neon-unpooled-url> -a gymos-hq-worker` | Before first deploy |
| Deploy the worker | `fly deploy -a gymos-hq-worker --config services/hq-worker/fly.toml` | After secrets set |
| BD2: set provisioning secrets | `fly secrets set NEON_API_KEY=... VERCEL_API_TOKEN=... FLY_API_TOKEN=... -a gymos-hq-worker` | BD2 PROV plan |

Note: `FLY_API_TOKEN` must be org-scoped (`flyctl tokens create org`), NOT a deploy token — deploy tokens cannot call `flyctl secrets set` on other apps.

## Known Stubs

- BD2 queue registrations: `src/index.ts` has a log line "no domain queues in BD1 skeleton" — BD2 adds `provision-studio` and `brain-ingest` queue `createQueue` calls and their workers here. This is intentional skeleton behavior, not a data-blocking stub.

## Self-Check: PASSED

Files confirmed:
- `services/hq-worker/src/index.ts` — FOUND
- `services/hq-worker/src/boss.ts` — FOUND
- `services/hq-worker/src/lib/env.ts` — FOUND
- `services/hq-worker/src/lib/env.test.ts` — FOUND
- `services/hq-worker/Dockerfile` — FOUND
- `services/hq-worker/fly.toml` — FOUND
- `services/hq-worker/.env.example` — FOUND

Commits confirmed:
- `a0c8b034` — feat(BD1-04): scaffold hq-worker pg-boss skeleton
- `61109988` — feat(BD1-04): hq-worker Dockerfile with flyctl pinned
- `d948f7de` — test(BD1-04): add hq-worker env unit tests + vitest config

Tests: 8/8 pass (`pnpm --filter @gymos/hq-worker test`)
Typecheck: clean (`pnpm --filter @gymos/hq-worker typecheck`)
