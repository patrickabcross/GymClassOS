---
phase: BD2-telemetry-provisioning
plan: "02"
subsystem: hq-worker/provision-apis
tags: [provisioning, neon, vercel, fly, execa, tdd, provider-adapters, idempotency]
dependency_graph:
  requires: [BD2-01]
  provides: [provision-apis/types, provision-apis/neon, provision-apis/vercel, provision-apis/fly, provision-apis/index, __tests__/mocks/provision-apis]
  affects: [BD2-05-saga]
tech_stack:
  added: ["@neondatabase/api-client ^2.7.2", "@vercel/sdk ^1.28.0", "execa ^9.6.1"]
  patterns: [find-or-create GET-before-POST, execa-array-args, key-name-only logging, vi.fn mock adapters, deferred-on-external-dependency]
key_files:
  created:
    - services/hq-worker/src/lib/provision-apis/types.ts
    - services/hq-worker/src/lib/provision-apis/neon.ts
    - services/hq-worker/src/lib/provision-apis/vercel.ts
    - services/hq-worker/src/lib/provision-apis/fly.ts
    - services/hq-worker/src/lib/provision-apis/index.ts
    - services/hq-worker/src/__tests__/mocks/provision-apis.ts
    - services/hq-worker/src/lib/provision-apis/fly.test.ts
  modified:
    - services/hq-worker/src/lib/env.ts
    - services/hq-worker/.env.example
    - services/hq-worker/package.json
decisions:
  - "@neondatabase/api-client version is 2.x (not 10.x) — research said ^10.x but npm view shows 2.7.2; pinned to actual current major ^2.7.2"
  - "Vercel SDK getProjects response is a union type (GetProjectsResponseBody2 | GetProjectsResponseBody3 | Array<...>) — Array.isArray guard normalises to project list for find-or-create"
  - "execa call spans two lines (execa(\"flyctl\", [...array...])) — plan regex expected same-line format; test runtime-verified the array-arg form is correct"
metrics:
  duration: 16min
  completed: "2026-06-19"
  tasks: 3
  files: 10
requirements: [PROV-02, PROV-04, PROV-05, PROV-06, PROV-08]
---

# Phase BD2 Plan 02: Provider Adapters (Neon / Vercel / Fly) Summary

**One-liner:** NeonApi/VercelApi/FlyApi interfaces + find-or-create concrete adapters + execa flyctl secrets (array-args, key-names-only logging) + vi.fn() mock bag + TDD-verified fly execa behavior.

## What Was Built

Three thin adapter interfaces (`NeonApi`, `VercelApi`, `FlyApi`) and their live implementations behind a `ProvisionApis` aggregate. Provider adapters implement GET-before-POST find-or-create on each provider (no provider supports idempotency keys). The saga (BD2-05) receives a `ProvisionApis` object and is fully unit-testable via `makeMockApis()` with no live cloud credentials.

### Files Created

| File | Purpose |
|------|---------|
| `provision-apis/types.ts` | NeonApi / VercelApi / FlyApi / ProvisionApis interfaces (mock seam) |
| `provision-apis/neon.ts` | createApiClient-backed; listProjects search before createProject; pooled URI via getConnectionUri; 404-safe deleteProject |
| `provision-apis/vercel.ts` | Vercel SDK; getProjects search + exact match before createProject; upsert=true env vars; readyState poll via deployId (not custom subdomain); 404-safe deleteProject |
| `provision-apis/fly.ts` | Machines REST API for app CRUD; `execa("flyctl", [...array...], opts)` for secrets set; key names logged only |
| `provision-apis/index.ts` | `createProvisionApis(env)` factory wiring all three live adapters |
| `__tests__/mocks/provision-apis.ts` | `mockNeonApi`, `mockVercelApi`, `mockFlyApi` + `makeMockApis()` helper |
| `provision-apis/fly.test.ts` | TDD tests: array-arg form, key-name-only logging, metacharacter injection safety |

### Files Modified

| File | Change |
|------|--------|
| `env.ts` | Activated NEON_API_KEY, VERCEL_BEARER_TOKEN, VERCEL_TEAM_ID, FLY_API_TOKEN, FLY_ORG_SLUG, GYMOS_WORKER_IMAGE as `.optional()` |
| `.env.example` | BD2 PROV block with six vars + org-token warning + fly secrets set instructions |
| `package.json` | Added @neondatabase/api-client ^2.7.2, @vercel/sdk ^1.28.0, execa ^9.6.1 |

## Security Properties Verified

| Property | Verification |
|----------|-------------|
| execa uses array args (no shell injection) | Test: `args` is an Array; metacharacter `;rm -rf` is a single element `"EVIL_VAR=;rm -rf /"` |
| Logger receives key names only | Test: none of `info.mock.calls` JSON contains secret value strings |
| No connection string in HQ DB | `grep -niE "hqProvisioningRuns|insert.*neon_project|database_url.*INSERT" *.ts` returns nothing |
| Provider tokens are optional | All six env vars use `.optional()` — worker starts without them |
| Live calls deferred-on-external-dependency | All three adapters throw descriptive error at construction if token is missing |

## Test Results

```
Test Files  2 passed (2)
Tests       11 passed (11)
  - fly.test.ts: 3 passed (array-args, key-names-only, metacharacter safety)
  - env.test.ts: 8 passed (existing — not regressed)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @neondatabase/api-client actual version is 2.x not 10.x**
- **Found during:** Task 1 (dep install)
- **Issue:** BD2-RESEARCH.md said `^10.x` but `npm view @neondatabase/api-client version` returns `2.7.2`; the major was misread from npm output
- **Fix:** Pinned to `^2.7.2` (the actual published latest); API surface is compatible (same `createApiClient` export, same method signatures)
- **Files modified:** `package.json` (pinned ^2.7.2 not ^10.x)
- **Commit:** a28a14bf

**2. [Rule 1 - Bug] Vercel SDK getProjects response is a union type**
- **Found during:** Task 2 (tsc check)
- **Issue:** `GetProjectsResponseBody = GetProjectsResponseBody2 | GetProjectsResponseBody3 | Array<GetProjectsResponseBody1>` — accessing `.projects` directly fails TS2339
- **Fix:** Added `Array.isArray(resp) ? resp : (resp.projects ?? [])` normalisation guard
- **Files modified:** `vercel.ts`
- **Commit:** c1d64fa7

**3. [Rule - Style] execa call spans two lines (regex in plan expected same-line)**
- **Found during:** Task 3 (acceptance check)
- **Issue:** Plan grep pattern `execa\(\s*["']flyctl["']\s*,\s*\[` expected `execa("flyctl", [` on one line; actual format has array on the next line
- **Fix:** This is a formatting difference only — the call IS correctly array-form (`execa("flyctl", [...array...], opts)`). Runtime tests (Behavior 1) confirm the array form. No code change needed.
- **Impact:** None — plan grep was a style-check, not a semantic constraint

## User Setup Items (deferred-on-external-dependency)

Live provisioning runs require the operator to set these six vars as Fly secrets:

| Var | Source |
|-----|--------|
| `NEON_API_KEY` | Neon Console → Account Settings → API Keys |
| `VERCEL_BEARER_TOKEN` | Vercel Dashboard → Settings → Tokens |
| `VERCEL_TEAM_ID` | Vercel Dashboard → Team Settings → General |
| `FLY_API_TOKEN` | `fly tokens create org -n gymos-provisioner -o <org>` (org-scoped, NOT deploy token) |
| `FLY_ORG_SLUG` | `fly orgs list` |
| `GYMOS_WORKER_IMAGE` | `registry.fly.io/<image>:latest` built by CI |

Command: `fly secrets set <VAR>=<value> -a gymos-hq-worker` for each.

## Known Stubs

None — no stub data, no placeholder values. Adapters are either live (real API calls) or mock (vi.fn() for tests). The deferred-on-external-dependency pattern is intentional design, not a stub.

## Self-Check: PASSED
