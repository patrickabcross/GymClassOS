---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 04
subsystem: infra

tags:
  - hono
  - stripe
  - whatsapp
  - fly
  - docker
  - drizzle
  - neon
  - pg-boss
  - webhooks
  - idempotency
  - hmac

requires:
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/01
    provides: apps/staff-web/ monorepo refactor (schema source-of-truth)
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/02
    provides: webhook_events composite UNIQUE(provider, external_id) + payments/whatsapp_opt_in/etc additive migration
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/03
    provides: "@gymos/queue publishers (enqueueStripeEvent + enqueueInboundWhatsApp with discriminated InboundWhatsAppPayload) + @gymos/whatsapp verifySignature"

provides:
  - "apps/edge-webhooks/ — Hono receiver compiled and ready for fly deploy"
  - "Raw-body-first HMAC discipline on both endpoints (line-order enforced in source)"
  - "ON CONFLICT (provider, external_id) DO NOTHING idempotency via insertWebhookEvent helper"
  - "Structured InboundWhatsAppPayload enqueue (HIGH #6) — receiver constructs typed kind:'message' / kind:'status' variants from Meta webhook fields"
  - "Pinned Stripe apiVersion '2026-04-22.dahlia' via Stripe.LatestApiVersion cast"
  - "Zod-validated env at boot (fail-fast on missing/malformed DATABASE_URL / DATABASE_URL_UNPOOLED / STRIPE_* / WHATSAPP_*)"
  - "Two-process fly.toml (web on 3001 + worker on 3002) with dedicated worker http_checks (MEDIUM #10)"
  - "Multi-stage repo-root Dockerfile that compiles both apps/edge-webhooks AND apps/worker"
  - "Worker /healthz placeholder on port 3002 — same endpoint contract Plan 05 will preserve"

affects:
  - P1b-05 (worker consumes pg-boss inbound-whatsapp + stripe-event queues this receiver publishes to; must preserve /healthz contract on port 3002)
  - P1b-06 (worker send chokepoint — receiver feeds inbound, worker handles outbound)
  - P1b-07 (Stripe event reducers — receiver delivers events to the queue this consumes)
  - P1b-09 (validation cutover — Meta + Stripe webhook URLs flip from templates/mail to https://gymos-edge-webhooks.fly.dev/webhooks/*)

tech-stack:
  added:
    - "Hono ^4.6 (Fly.io webhook receiver framework)"
    - "@hono/node-server ^1.13"
    - "Stripe SDK 19.3.1 (LatestApiVersion 2025-10-29.clover; runtime-pinned to 2026-04-22.dahlia via cast)"
    - "@neondatabase/serverless 1.1 + drizzle-orm 0.45 (neon-serverless WebSocket driver)"
    - "@gymos/edge-webhooks workspace package"
    - "@gymos/worker workspace package (stub, real impl in Plan 05)"
    - "Docker (multi-stage Node 22 alpine + pnpm 10.29.1 via corepack)"
    - "Fly.io two-process app topology"
  patterns:
    - "Raw-body-first HMAC discipline: await c.req.text() ALWAYS precedes verifySignature() / stripe.webhooks.constructEvent() — enforced by grep-able line order in the source"
    - "insertWebhookEvent(args) → { inserted: boolean, eventKey } — caller enqueues only when inserted=true. Idempotent against Stripe replay + Meta retries"
    - "Local Drizzle schema mirror for cross-app DB access: define only the columns this app reads/writes using drizzle-orm/pg-core directly, rather than importing the full schema across app boundaries (sidesteps RESEARCH Open Question #2 + dialect-typing-as-sqlite friction)"
    - "Vitest vi.hoisted() for mock fns referenced inside vi.mock() factories (avoids TDZ on hoisted mock calls)"
    - "Two-process Fly app: separate [[services]] block exposes worker /healthz on internal_port 3002 for Fly's internal health-checker, without publicly routing it (MEDIUM #10 — silently-hung workers detected)"
    - "Stripe API version pin via Stripe.LatestApiVersion cast — keeps runtime pin while allowing future-dated literal that the installed SDK's types don't yet know about"
    - "Worker stub /healthz contract preservation: stub binds to PORT (default 3002) and exposes /healthz so the real Plan 05 impl can overwrite src/index.ts without touching fly.toml or rebuilding the image"

key-files:
  created:
    - "apps/edge-webhooks/package.json — @gymos/edge-webhooks workspace package"
    - "apps/edge-webhooks/tsconfig.json — bundler moduleResolution + exclude tests from dist"
    - "apps/edge-webhooks/src/lib/env.ts — Zod-validated boot env"
    - "apps/edge-webhooks/src/lib/db.ts — local pg-core webhook_events mirror + neon-serverless Drizzle client"
    - "apps/edge-webhooks/src/lib/stripe.ts — pinned-apiVersion Stripe client"
    - "apps/edge-webhooks/src/lib/idempotency.ts — insertWebhookEvent helper"
    - "apps/edge-webhooks/src/routes/whatsapp.ts — GET verify-token + POST inbound/status with structured-payload enqueue"
    - "apps/edge-webhooks/src/routes/stripe.ts — POST with raw-body-first constructEvent"
    - "apps/edge-webhooks/src/server.ts — Hono app builder + /healthz"
    - "apps/edge-webhooks/src/index.ts — @hono/node-server entrypoint"
    - "apps/edge-webhooks/src/lib/idempotency.test.ts (3 tests)"
    - "apps/edge-webhooks/src/routes/stripe.test.ts (5 tests incl. tampered/dedup/healthz)"
    - "apps/edge-webhooks/src/routes/whatsapp.test.ts (7 tests incl. 2 HIGH #6 structured-payload assertions)"
    - "apps/edge-webhooks/fly.toml — region iad + min_machines_running=1 + auto_stop=false + two-process block + worker http_checks"
    - "apps/edge-webhooks/.env.example + .dockerignore"
    - "apps/worker/package.json + tsconfig.json + src/index.ts (placeholder /healthz on port 3002 — Plan 05 replaces src/index.ts)"
    - "Dockerfile (repo root) — multi-stage Node 22 alpine + pnpm 10.29.1, builds both apps"
    - ".dockerignore (repo root)"
  modified:
    - "pnpm-lock.yaml — new edge-webhooks + worker workspace deps locked"

key-decisions:
  - "Cross-app schema imports replaced with local pg-core mirror in apps/edge-webhooks/src/lib/db.ts. Cleaner than importing apps/staff-web/server/db/schema.ts: (a) dialect-agnostic @agent-native/core/db/schema helpers type as SQLite at typecheck time, mismatching the neon-serverless pg driver; (b) tsconfig rootDir errors on cross-app source files. Drift risk explicitly accepted — keep this file's column list in sync with apps/staff-web webhookEvents (source of truth). Plan 09 will extract packages/db/ to eliminate."
  - "Stripe apiVersion pinned via `as Stripe.LatestApiVersion` cast. Installed SDK 19.3.1 literal-types apiVersion as '2025-10-29.clover'; plan targets '2026-04-22.dahlia' (released after SDK shipped its types). Cast keeps the runtime pin (PITFALL #3 honoured) without delaying P1b waiting for SDK 19.4."
  - "Worker /healthz stub created NOW (apps/worker/src/index.ts), not deferred to Plan 05. Without it, the fly.toml worker health check (MEDIUM #10) would fail on first deploy and the two-process topology can't be verified end-to-end. Plan 05 replaces src/index.ts with the real pg-boss consumer while keeping the same /healthz contract on port 3002."
  - "Vitest mock factories use vi.hoisted(() => ({...})) for shared mock fns. Plain const + vi.fn() fails because vi.mock() is hoisted above all imports — referencing a const declared below it causes TDZ ReferenceError. vi.hoisted is the documented Vitest escape."

patterns-established:
  - "Raw-body-first HMAC: await c.req.text() ALWAYS precedes verifySignature() / constructEvent(). Line-order enforced by grep — comment block right above the read documents the invariant."
  - "Idempotency-then-enqueue: every webhook handler calls insertWebhookEvent first; only enqueues when inserted=true. Duplicates ack 200 to stop Meta/Stripe retries."
  - "Structured discriminated enqueue payloads (HIGH #6): receiver constructs `{ kind: 'message', externalId, from, messageType, body?, timestamp? }` or `{ kind: 'status', statusFor, newStatus, timestamp, errorCode? }` directly from Meta webhook fields. NO synthetic string concat for the worker→receiver boundary (dedup keys for webhook_events can still concat, but the queue payload must be typed)."
  - "Cross-app DB access via local pg-core mirror (until packages/db/ extraction in Plan 09)"
  - "Stub-with-contract pattern: where a downstream plan will replace a file, the placeholder preserves the wire contract (port, endpoint, response shape) so deployment topology validates before the real impl ships"

requirements-completed:
  - WEB-01
  - WEB-02
  - WEB-03

duration: 9min
completed: 2026-05-20
---

# Phase P1b Plan 04: Edge-Webhooks Fly Receiver Summary

**Hono-based Fly receiver (apps/edge-webhooks/) verifying Stripe + WhatsApp signatures against raw bodies before any parse, dedup'ing via webhook_events ON CONFLICT DO NOTHING, and enqueueing typed InboundWhatsAppPayload variants to pg-boss — ready for fly deploy to region iad.**

## Performance

- **Duration:** ~9 minutes (execution time only; pnpm install ran twice at ~2min each)
- **Started:** 2026-05-20T16:35:00Z (approx)
- **Completed:** 2026-05-20T16:44:31Z
- **Tasks:** 3 of 4 executed atomically; Task 4 is a human-verify checkpoint (auto-approved in current auto-mode; user runs fly deploy + 7 smoke tests out-of-band)
- **Files created:** 18 (12 source + 3 test + fly.toml + Dockerfile + .dockerignore + .env.example + worker stub set)

## Accomplishments

- Stripe + WhatsApp webhook receiver with raw-body-first HMAC discipline (PITFALL #9): `await c.req.text()` runs at line 17 of stripe.ts (BEFORE `constructEvent` at line 24) and at line 28 of whatsapp.ts (BEFORE `verifySignature` at line 33). Comment blocks immediately above each `c.req.text()` call call out the invariant.
- ON CONFLICT (provider, external_id) DO NOTHING idempotency via `insertWebhookEvent` helper — returns `{ inserted, eventKey }`; enqueue only fires on `inserted=true`. Stripe replays + Meta retries collapse to a single worker job.
- HIGH #6 contract honoured end-to-end: WhatsApp routes construct `{ kind: "message", externalId, from, messageType, body?, timestamp? }` or `{ kind: "status", statusFor, newStatus, timestamp, errorCode? }` directly from Meta webhook fields. No synthetic string concat crosses the receiver↔worker boundary. Three tests assert the exact enqueue arg shape including the failed-status `errorCode: "131047"` propagation.
- Pinned Stripe apiVersion `'2026-04-22.dahlia'` via `Stripe.LatestApiVersion` cast (PITFALL #3). Installed SDK 19.3.1's literal is `'2025-10-29.clover'`; cast keeps the runtime pin without delaying P1b on an SDK bump.
- Zod-validated boot env (env.ts): rejects missing/malformed `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (with `-pooler` guard per PITFALL #1), `STRIPE_*`, `WHATSAPP_*`. Fail-fast — process exits at startup on bad env.
- Two-process Fly topology: web on internal_port 3001 + worker on internal_port 3002, each with its own `[[services]]` block and `http_checks` to `/healthz`. The worker block is NOT publicly routed but Fly's internal checker probes it (MEDIUM #10 — silently-hung worker machines now visible).
- Repo-root Dockerfile: multi-stage Node 22 alpine + pnpm 10.29.1 via corepack, builds both `@gymos/edge-webhooks` and `@gymos/worker`. fly.toml `[processes]` selects which entrypoint runs without rebuilding.
- Worker `/healthz` placeholder on port 3002 (`apps/worker/src/index.ts`) — preserves the contract Plan 05's real pg-boss consumer will overwrite.
- 15 vitest tests pass: 3 idempotency, 5 stripe (incl. tampered-body-returns-400-BEFORE-any-DB-write, missing-header 400, new-event enqueue, dedup skip, healthz), 7 whatsapp (incl. verify-token handshake 200/403, bad HMAC 401, structured message payload assertion, structured status payload assertion, failed-status errorCode propagation, duplicate skips enqueue).
- Both `pnpm --filter @gymos/edge-webhooks build` and `pnpm --filter @gymos/worker build` exit 0 and emit `dist/index.js` (test files excluded from dist via tsconfig).

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold apps/edge-webhooks/ with Hono + Stripe + Drizzle + env validation** — `9add0578` (feat)
2. **Task 2: Implement Hono routes — WhatsApp + Stripe + /healthz** — `341a0ad7` (feat)
3. **Task 3: fly.toml + Dockerfile + worker stub for MEDIUM #10 health check** — `3486c7f7` (feat)
4. **Task 4: Deploy to Fly + smoke-test signatures, idempotency, healthz** — checkpoint:human-verify (auto-approved in auto-mode; user runs `fly auth login` + `fly launch` + `fly secrets set` + `fly deploy` + the 7 smoke tests documented in plan §how-to-verify before Plan 09 cutover)

**Plan metadata commit:** to follow (docs commit at end of this summary)

## Files Created/Modified

### Created

| Path | Purpose |
|---|---|
| `apps/edge-webhooks/package.json` | `@gymos/edge-webhooks` workspace package (Hono 4, Stripe 19, Drizzle 0.45, @neondatabase/serverless 1.1, @gymos/queue, @gymos/whatsapp, @agent-native/core) |
| `apps/edge-webhooks/tsconfig.json` | bundler moduleResolution + `exclude: ["src/**/*.test.ts"]` so build dist drops test files |
| `apps/edge-webhooks/.env.example` | Env vars contract (DATABASE_URL pooled + DATABASE_URL_UNPOOLED unpooled per PITFALL #1, STRIPE_*, WHATSAPP_*) |
| `apps/edge-webhooks/.dockerignore` | Per-app docker context exclude |
| `apps/edge-webhooks/src/lib/env.ts` | Zod-validated boot env; `-pooler` URL guard; PORT default 3001; `_resetEnvForTests` test export |
| `apps/edge-webhooks/src/lib/db.ts` | Local pg-core `webhook_events` schema mirror + neon-serverless Drizzle client (deviation from PLAN's cross-app schema import — file header documents rationale) |
| `apps/edge-webhooks/src/lib/stripe.ts` | `getStripe()` with `STRIPE_API_VERSION = "2026-04-22.dahlia" as Stripe.LatestApiVersion` pin |
| `apps/edge-webhooks/src/lib/idempotency.ts` | `insertWebhookEvent({provider, eventType, externalId, payloadRaw})` → `{inserted, eventKey}`; uses `.onConflictDoNothing({target:[provider, externalId]})` |
| `apps/edge-webhooks/src/routes/whatsapp.ts` | GET verify-token handshake + POST inbound/status. Raw-body-first (line 28), HMAC verify after (line 33). Structured-payload enqueue per HIGH #6. |
| `apps/edge-webhooks/src/routes/stripe.ts` | POST raw-body-first (line 17) constructEvent (line 24); 400 on tamper BEFORE any DB write; dedup acks 200 |
| `apps/edge-webhooks/src/server.ts` | Hono app builder mounting /webhooks/* + /healthz |
| `apps/edge-webhooks/src/index.ts` | @hono/node-server entrypoint — `getEnv()` first for fail-fast |
| `apps/edge-webhooks/src/lib/idempotency.test.ts` | 3 tests: new row, conflict dedup, idOverride |
| `apps/edge-webhooks/src/routes/stripe.test.ts` | 5 tests: tampered 400 BEFORE DB, missing-header 400, valid new 200+enqueue, dedup 200 no-enqueue, healthz JSON |
| `apps/edge-webhooks/src/routes/whatsapp.test.ts` | 7 tests: verify-token 200, verify-token 403, bad HMAC 401, structured message enqueue (HIGH #6), structured status enqueue (HIGH #6), failed-status errorCode propagation, dedup skip |
| `apps/edge-webhooks/fly.toml` | region iad; min_machines_running=1; auto_stop=false; two-process [processes] (web on 3001 + worker on 3002); dedicated worker [[services]] + http_checks (MEDIUM #10) |
| `apps/worker/package.json` | `@gymos/worker` workspace stub |
| `apps/worker/tsconfig.json` | Includes `types: ["node"]` for `process.*` access |
| `apps/worker/src/index.ts` | Placeholder Hono /healthz on PORT (default 3002) — preserves contract for Plan 05 replacement |
| `Dockerfile` (repo root) | Multi-stage Node 22 alpine + pnpm 10.29.1 via corepack; builds both apps |
| `.dockerignore` (repo root) | node_modules / dist / .env / .git / .planning / templates excluded |

### Modified

| Path | Change |
|---|---|
| `pnpm-lock.yaml` | New `apps/edge-webhooks` + `apps/worker` workspace entries + transitive deps locked |

## Decisions Made

1. **Local pg-core schema mirror in db.ts instead of cross-app schema import.** PLAN Task 1 step 4 suggested `import * as schema from "../../../staff-web/server/db/schema.js"`. Two issues: (a) tsconfig `rootDir` rejects files outside the package; (b) `@agent-native/core/db/schema` helpers default to SQLite types at typecheck time, which mismatch the neon-serverless pg driver in this app. Solution: mirror only the columns we touch (webhookEvents — 8 cols) using `drizzle-orm/pg-core` directly. RESEARCH Open Question #2 escape hatch — Plan 09 will extract `packages/db/`.

2. **Stripe apiVersion pin via `as Stripe.LatestApiVersion` cast.** Plan specified `'2026-04-22.dahlia'`; installed SDK 19.3.1's type only knows `'2025-10-29.clover'`. Cast keeps the runtime pin (PITFALL #3 — never let Stripe float the version) while satisfying types. SDK bumps to 19.x with the dahlia literal will let us drop the cast.

3. **Worker /healthz stub created in this plan, not deferred.** fly.toml's MEDIUM #10 worker http_check would fail on first deploy without an actual listener on port 3002. Stubbing in Plan 04 + replacing in Plan 05 lets us verify the two-process Fly topology end-to-end before the real worker ships.

4. **`vi.hoisted()` for Vitest mock factory state.** Plain `const mock = vi.fn()` referenced inside a `vi.mock(...)` factory hits TDZ because `vi.mock()` is hoisted above all imports (including the const). Documented Vitest pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-app schema import would fail typecheck on two axes**
- **Found during:** Task 1 (Scaffold lib helpers — typecheck after Step 4)
- **Issue:** Plan Task 1 Step 4 wrote `import * as schema from "../../../staff-web/server/db/schema.js"`. TSC errored with TS6059 (file outside rootDir) AND a cascade of TS2345/2322 errors because `@agent-native/core/db/schema`'s dialect-agnostic helpers resolve to SQLite types at typecheck time, mismatching the pg driver here.
- **Fix:** Defined a local Drizzle pg-core mirror of `webhook_events` (the only table this app touches) in `apps/edge-webhooks/src/lib/db.ts`. File header documents the drift risk and points at Plan 09's `packages/db/` extraction as the durable fix.
- **Files modified:** `apps/edge-webhooks/src/lib/db.ts`
- **Verification:** `pnpm --filter @gymos/edge-webhooks typecheck` exits 0
- **Committed in:** `9add0578` (Task 1)

**2. [Rule 3 - Blocking] Stripe SDK 19.3.1 literal-types apiVersion as '2025-10-29.clover', not '2026-04-22.dahlia'**
- **Found during:** Task 1 (typecheck stripe.ts)
- **Issue:** Plan specified `apiVersion: "2026-04-22.dahlia"` (the version Stripe released AFTER SDK 19.3.1 shipped its types). TSC errored: `Type '"2026-04-22.dahlia"' is not assignable to type '"2025-10-29.clover"'`.
- **Fix:** Cast via `as Stripe.LatestApiVersion`. Runtime pin intact (Stripe accepts any valid version string); types satisfied; can drop cast once SDK adds the dahlia literal.
- **Files modified:** `apps/edge-webhooks/src/lib/stripe.ts`
- **Verification:** Typecheck passes; `STRIPE_API_VERSION` exported for traceability.
- **Committed in:** `9add0578` (Task 1)

**3. [Rule 1 - Bug] webhook_events.receivedAt was inferred as required (no DB default) in the local pg-core mirror**
- **Found during:** Task 1 (typecheck idempotency.ts after fixing db.ts)
- **Issue:** Source-of-truth `apps/staff-web/server/db/schema.ts` declares `receivedAt: text("received_at").notNull().default(now())`. When mirroring with pg-core directly, omitting the default makes the column "required at insert" in Drizzle's types — so `insertWebhookEvent` failed typecheck (`Property 'receivedAt' is missing`).
- **Fix:** Added `.default(sql\`now()\`)` to the mirror's receivedAt column. Matches the real Postgres column DEFAULT created by P1b-02 migration.
- **Files modified:** `apps/edge-webhooks/src/lib/db.ts`
- **Verification:** Typecheck passes; insertWebhookEvent omits receivedAt and DB fills it.
- **Committed in:** `9add0578` (Task 1)

**4. [Rule 3 - Blocking] Vitest `vi.mock()` factory referencing top-level `const mock = vi.fn()` hit TDZ**
- **Found during:** Task 2 (first test run after writing route tests)
- **Issue:** `const enqueueStripeEvent = vi.fn()` declared at module scope and referenced inside `vi.mock("@gymos/queue", () => ({ enqueueStripeEvent }))` — Vitest hoists vi.mock above all imports, so the factory ran before the const was initialized. ReferenceError aborted both route test files.
- **Fix:** Refactored both route test files to use `const mocks = vi.hoisted(() => ({ ... }))` and reference `mocks.enqueueStripeEvent` etc. inside the factories. Documented Vitest pattern.
- **Files modified:** `apps/edge-webhooks/src/routes/stripe.test.ts`, `apps/edge-webhooks/src/routes/whatsapp.test.ts`
- **Verification:** All 15 tests pass.
- **Committed in:** `341a0ad7` (Task 2)

**5. [Rule 2 - Missing Critical] Worker tsconfig.json missed `types: ["node"]`, breaking the placeholder build**
- **Found during:** Task 3 (typecheck of worker stub)
- **Issue:** `apps/worker/src/index.ts` references `process.env.GIT_SHA` and `process.env.PORT`. Default tsconfig types didn't include node, so `Cannot find name 'process'` (TS2591). Without `@types/node` resolved in `types`, the build fails and the fly.toml worker process can't start.
- **Fix:** Added `"types": ["node"]` to `apps/worker/tsconfig.json` compilerOptions.
- **Files modified:** `apps/worker/tsconfig.json`
- **Verification:** `pnpm --filter @gymos/worker typecheck && pnpm --filter @gymos/worker build` exit 0; `apps/worker/dist/index.js` emitted.
- **Committed in:** `3486c7f7` (Task 3)

**6. [Rule 2 - Missing Critical] edge-webhooks tsconfig included tests in dist**
- **Found during:** Task 3 (post-build dist inspection)
- **Issue:** PLAN's tsconfig had `include: ["src/**/*"]` only, so build emitted `idempotency.test.js`, `stripe.test.js`, `whatsapp.test.js` into dist. Tests have `vi.*` imports that would crash at runtime if Node loaded those compiled JS files in production.
- **Fix:** Added `"exclude": ["src/**/*.test.ts"]` to `apps/edge-webhooks/tsconfig.json`.
- **Files modified:** `apps/edge-webhooks/tsconfig.json`
- **Verification:** Rebuild produces clean dist (no `.test.js` files). Tests still run via vitest.
- **Committed in:** `3486c7f7` (Task 3)

---

**Total deviations:** 6 auto-fixed (4 blocking, 2 missing-critical)
**Impact on plan:** All deviations are correctness/build/test-infrastructure fixes that the plan couldn't have predicted (Stripe SDK version, Vitest hoist semantics, Drizzle dialect typing, tsconfig defaults). No scope creep. All within Task scope.

## Authentication Gates

None encountered. Task 4's Fly deploy would gate on `fly auth login`, but it's a `checkpoint:human-verify` (not auto), and auto-mode policy auto-approves human-verify checkpoints.

## Known Stubs

| File | Reason | Resolved By |
|---|---|---|
| `apps/worker/src/index.ts` (placeholder /healthz) | Plan 04 needs a listener on port 3002 NOW so fly.toml's MEDIUM #10 worker http_check passes on first deploy. The pg-boss consumer loop is out of scope for Plan 04. | Plan P1b-05 (Worker — Inbound WhatsApp consumer) overwrites src/index.ts with the real worker, preserving the /healthz contract (port 3002, JSON `{ok, version, app:"worker"}`). |

This stub is intentional and documented in the file's comment header. The fly.toml health-check contract is preserved across the replacement.

## Issues Encountered

- **Stripe SDK version lag:** Plan targeted Stripe API `'2026-04-22.dahlia'` but installed SDK 19.3.1 only types `'2025-10-29.clover'` as `LatestApiVersion`. Resolved via cast; SDK 19.4+ will let us drop the cast.
- **Cross-app TS imports:** `@agent-native/core/db/schema` dialect-agnostic helpers default to SQLite types at typecheck time, mismatching the pg driver. Combined with tsconfig rootDir constraints, made cross-app schema imports unworkable. Resolved via local mirror.
- **Vitest hoist semantics:** `vi.mock()` factories can't close over top-level `const`s. Resolved via `vi.hoisted()`.

## User Setup Required

Task 4 is gated on user-side Fly deployment. The plan's `<how-to-verify>` block (Task 4) lists the 7 steps:

1. `flyctl version` + `fly auth signup` / `fly auth login`
2. `fly launch --copy-config --no-deploy --name gymos-edge-webhooks --region iad`
3. `fly secrets set -a gymos-edge-webhooks DATABASE_URL=... DATABASE_URL_UNPOOLED=... STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=... GIT_SHA=$(git rev-parse --short HEAD)`
4. `fly deploy -a gymos-edge-webhooks --remote-only`
5. `fly status` + `fly checks list` — confirm BOTH web AND worker checks pass (MEDIUM #10)
6. 6 smoke tests: /healthz, WA verify handshake, WA bad sig 401, Stripe tampered 400, Stripe valid via CLI, Stripe replay dedup, pgboss.job table row visible
7. Latency budget check: warm path < 200ms

Reply `approved` to continue to Plan P1b-05. Deferred verification is captured in `.planning/STATE.md` so Plan 05 + 09 can probe `webhook_events` and `pgboss.job` once the receiver is live.

## Next Phase Readiness

- **Plan P1b-05 (Worker — Inbound WhatsApp consumer):** Can replace `apps/worker/src/index.ts` immediately. The pg-boss queue contract is set: `enqueueInboundWhatsApp` publishes the typed `InboundWhatsAppPayload` discriminated union; worker consumes via `boss.work(QUEUE_NAMES.INBOUND_WHATSAPP, ...)`. Use `DATABASE_URL_UNPOOLED` for the worker's pg-boss connection (PITFALL #1 — pg-boss needs LISTEN/NOTIFY which the pooler proxy doesn't pipe). Preserve the /healthz contract on port 3002.
- **Plan P1b-06 (Worker sendMessage chokepoint):** Receiver is producer-only — no outbound work happens here. Worker owns the chokepoint.
- **Plan P1b-07 (Stripe reducers):** Receiver's enqueue contract for Stripe is minimal: `{ eventId: string }`. Reducer re-fetches the full event from Stripe (via SDK with the same pinned apiVersion) to read fresh state.
- **Plan P1b-09 (Validation cutover):** Receiver is ready to take Meta's webhook URL flip from `templates/mail`/`apps/staff-web` to `https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp`. The replay-twice idempotency test from success criterion #1 will exercise this receiver's ON CONFLICT path against live Neon webhook_events.

## Self-Check

Files claimed created exist on disk:

- FOUND: apps/edge-webhooks/package.json
- FOUND: apps/edge-webhooks/tsconfig.json
- FOUND: apps/edge-webhooks/.env.example
- FOUND: apps/edge-webhooks/.dockerignore
- FOUND: apps/edge-webhooks/src/lib/env.ts
- FOUND: apps/edge-webhooks/src/lib/db.ts
- FOUND: apps/edge-webhooks/src/lib/stripe.ts
- FOUND: apps/edge-webhooks/src/lib/idempotency.ts
- FOUND: apps/edge-webhooks/src/routes/whatsapp.ts
- FOUND: apps/edge-webhooks/src/routes/stripe.ts
- FOUND: apps/edge-webhooks/src/server.ts
- FOUND: apps/edge-webhooks/src/index.ts
- FOUND: apps/edge-webhooks/src/lib/idempotency.test.ts
- FOUND: apps/edge-webhooks/src/routes/stripe.test.ts
- FOUND: apps/edge-webhooks/src/routes/whatsapp.test.ts
- FOUND: apps/edge-webhooks/fly.toml
- FOUND: apps/worker/package.json
- FOUND: apps/worker/tsconfig.json
- FOUND: apps/worker/src/index.ts
- FOUND: Dockerfile
- FOUND: .dockerignore

Commits claimed exist in git log:

- FOUND: 9add0578 (Task 1)
- FOUND: 341a0ad7 (Task 2)
- FOUND: 3486c7f7 (Task 3)

## Self-Check: PASSED

---

*Phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks*
*Plan: 04*
*Completed: 2026-05-20*
