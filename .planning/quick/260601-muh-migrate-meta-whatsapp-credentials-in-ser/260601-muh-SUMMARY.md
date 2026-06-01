---
phase: quick-260601-muh
plan: 01
subsystem: whatsapp-credentials
tags: [whatsapp, secrets, db-first, rotation, worker, edge-webhooks, ttl-cache]
dependency_graph:
  requires: [P1b-02 (secrets table + pgcrypto), P1b-06 (sendMessage chokepoint), P1b-08 (writeSecret pattern)]
  provides: [WA-05 DB-first creds for outbound send, WA-08 DB-first creds for template sync]
  affects: [services/worker, services/edge-webhooks, packages/whatsapp]
tech_stack:
  added: []
  patterns: [DB-first/env-fallback secret resolution, in-memory TTL cache on hot path, optional-creds injection via 2nd function arg]
key_files:
  created:
    - services/edge-webhooks/src/lib/secrets.ts
    - services/edge-webhooks/src/lib/secrets.test.ts
    - services/edge-webhooks/vitest.config.ts
  modified:
    - services/worker/src/lib/secrets.ts
    - services/worker/src/lib/secrets.test.ts
    - services/worker/src/domain/sendMessage.ts
    - services/worker/src/domain/sendMessage.test.ts
    - services/worker/src/queues/housekeeping.ts
    - packages/whatsapp/src/sdk-impl.ts
    - packages/whatsapp/src/types.ts
    - packages/whatsapp/src/index.ts
    - services/edge-webhooks/src/lib/env.ts
    - services/edge-webhooks/src/routes/whatsapp.ts
    - services/edge-webhooks/src/routes/whatsapp.test.ts
decisions:
  - "WhatsApp creds now DB-first via pgcrypto secrets table with env fallback — same pattern as Stripe restricted key; no fly secrets set WHATSAPP_* needed once staff save keys in Settings UI"
  - "edge-webhooks inbound hot path uses 60s in-memory TTL cache so POST /webhooks/whatsapp does not hit Postgres on every message"
  - "sendText/sendTemplate accept optional WhatsAppCreds 2nd arg; env-default singleton path preserved for backward compat — existing callers unaffected"
  - "getWhatsAppBusinessAccountId returns null (not throw) — WABA ID is optional; templates-sync handler already guards absence and skips cleanly"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-01"
  tasks: 3
  files: 11
---

# Quick Task 260601-muh: Migrate Meta WhatsApp Credentials to DB-First Secrets

**One-liner:** DB-first WhatsApp credential resolution via pgcrypto secrets table with env fallback + 60s TTL cache on the edge-webhooks inbound hot path — in-app Settings UI is now single source of truth for both Fly processes.

## What Was Done

### Task 1: Worker WhatsApp secret readers + adapter cred injection + consumer switch

Added three new readers to `services/worker/src/lib/secrets.ts`, mirroring `getStripeSecretKey`:

| Reader | DB key | Env fallback | On miss |
|---|---|---|---|
| `getWhatsAppAccessToken(db)` | `whatsapp_access_token` | `WHATSAPP_ACCESS_TOKEN` | throw |
| `getWhatsAppPhoneNumberId(db)` | `whatsapp_phone_number_id` | `WHATSAPP_PHONE_NUMBER_ID` | throw |
| `getWhatsAppBusinessAccountId(db)` | `whatsapp_business_account_id` | `WHATSAPP_BUSINESS_ACCOUNT_ID` | return null |

`packages/whatsapp/src/sdk-impl.ts` updated: `getSdk(token?)` and `getPhoneNumberId(id?)` now accept explicit values; `sendText` and `sendTemplate` accept an optional `WhatsAppCreds` 2nd arg; env-default singleton path preserved.

`sendMessage.ts` resolves creds once DB-first before the adapter call block and passes them as the 2nd arg — no process.env reads remain.

`housekeeping.ts` templates-sync handler now reads `wabaId` via `getWhatsAppBusinessAccountId(db)` and `accessToken` via `getWhatsAppAccessToken(db)` — no env reads remain.

### Task 2: edge-webhooks secrets reader + TTL cache + whatsapp route switch

- `services/edge-webhooks/src/lib/env.ts`: added `PGCRYPTO_MASTER_KEY: z.string().min(16)` (required for decrypt SQL); WHATSAPP_* fields retained as env fallback.
- NEW `services/edge-webhooks/src/lib/secrets.ts`: `readSecret` (mirrors worker), 60s in-memory TTL cache (`resolveCached`), `getWhatsAppVerifyToken` + `getWhatsAppAppSecret` (both DB-first -> env -> throw).
- `services/edge-webhooks/src/routes/whatsapp.ts`: GET handler now async; POST handler resolves `appSecret` via `getWhatsAppAppSecret(getDb())` AFTER `await c.req.text()` (PITFALL #9 raw-body-first discipline preserved).
- NEW `services/edge-webhooks/vitest.config.ts`: per-package unit test config (auto-fix Rule 3 — missing config caused tests to fall through to root integration config).

### Task 3: Typecheck + full suites + residual env reads confirmation

- `tsc --noEmit` clean: `@gymos/worker`, `@gymos/edge-webhooks`, `@gymos/whatsapp`
- Worker vitest: 63/63 tests pass
- edge-webhooks vitest: 25/25 tests pass (10 new secrets tests + 15 existing)
- Grep confirms zero residual `process.env.WHATSAPP_*` / `env.WHATSAPP_*` reads in `sendMessage.ts`, `housekeeping.ts`, `whatsapp.ts`
- Env schema fields (`WHATSAPP_ACCESS_TOKEN`, etc.) retained in both `env.ts` files
- No live Meta API call added (live WABA send/receive test deferred per plan)

## Commits

| # | Hash | Message |
|---|---|---|
| 1 | a3948c35 | feat(260601-muh): worker WhatsApp secret readers + adapter cred injection |
| 2 | 2b0c4519 | feat(260601-muh): edge-webhooks secrets reader + TTL cache + whatsapp route switch |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing per-package vitest config for edge-webhooks**
- **Found during:** Task 2 — first run of `pnpm --filter @gymos/edge-webhooks run test`
- **Issue:** No `vitest.config.ts` in `services/edge-webhooks/` — test runner fell through to root `vitest.config.ts` which only covers `tests/integration/**`, finding no test files and exiting with code 1
- **Fix:** Created `services/edge-webhooks/vitest.config.ts` matching the worker's config (`include: ["src/**/*.test.ts"]`, `environment: "node"`)
- **Files modified:** `services/edge-webhooks/vitest.config.ts`
- **Commit:** 2b0c4519

**2. [Rule 2 - Missing critical functionality] sendMessage.test.ts needed secrets module mock**
- **Found during:** Task 1 — after adding `getWhatsAppAccessToken/getWhatsAppPhoneNumberId` imports to sendMessage.ts, the test's mockDb lacked an `execute` method needed by `readSecret`
- **Fix:** Updated `sendMessage.test.ts` to mock `../lib/secrets.js` returning `{ getWhatsAppAccessToken: vi.fn().mockResolvedValue("wa_test_token"), getWhatsAppPhoneNumberId: vi.fn().mockResolvedValue("11111111"), ... }`; updated two `toHaveBeenCalledWith` assertions to include `TEST_CREDS` as 2nd arg
- **Files modified:** `services/worker/src/domain/sendMessage.test.ts`
- **Commit:** a3948c35

**3. [Rule 2 - Missing critical functionality] whatsapp.test.ts needed secrets + db mocks**
- **Found during:** Task 2 — after switching whatsapp.ts to use `getWhatsAppVerifyToken/getWhatsAppAppSecret`, the route tests would attempt a real Neon connection via `getDb()`
- **Fix:** Added mocks for `../lib/secrets.js` (returning env-equivalent values) and `../lib/db.js` (returning `{}`) to `whatsapp.test.ts`; added `PGCRYPTO_MASTER_KEY` to env mock
- **Files modified:** `services/edge-webhooks/src/routes/whatsapp.test.ts`
- **Commit:** 2b0c4519

## Known Stubs

None. All code paths are functional. The live WABA send/receive test is explicitly deferred (customer-gated — requires real credentials in `app_secrets` + Meta-approved templates). The code is ready; the test cannot run without production credentials.

## Test Results

```
@gymos/worker:        12 files | 63 tests — all PASSED
@gymos/edge-webhooks:  4 files | 25 tests — all PASSED
@gymos/worker tsc:     CLEAN (0 errors)
@gymos/edge-webhooks tsc: CLEAN (0 errors)
@gymos/whatsapp tsc:   CLEAN (0 errors)
```

## Self-Check: PASSED

Files created/modified verified present:
- `services/edge-webhooks/src/lib/secrets.ts` — FOUND
- `services/edge-webhooks/src/lib/secrets.test.ts` — FOUND
- `services/edge-webhooks/vitest.config.ts` — FOUND
- `services/worker/src/lib/secrets.ts` — FOUND (3 new readers)
- `packages/whatsapp/src/types.ts` — FOUND (WhatsAppCreds type)

Commits verified:
- a3948c35 — FOUND in git log
- 2b0c4519 — FOUND in git log
