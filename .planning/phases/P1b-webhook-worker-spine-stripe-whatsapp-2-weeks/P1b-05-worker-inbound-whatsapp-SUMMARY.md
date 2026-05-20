---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 05
subsystem: infra

tags:
  - pg-boss
  - worker
  - fly
  - whatsapp
  - drizzle
  - neon
  - idempotency
  - tdd
  - vitest
  - pino

requires:
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/01
    provides: apps/staff-web/ monorepo refactor (canonical messages/conversations/webhook_events schema)
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/02
    provides: messages.external_id partial UNIQUE WHERE NOT NULL (HIGH #4 backing) + messages.updated_at column (Blocker #2) + messages.error_code column
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/03
    provides: "@gymos/queue InboundWhatsAppPayload discriminated union (HIGH #6) + getBoss singleton bound to DATABASE_URL_UNPOOLED"
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/04
    provides: apps/worker/ scaffold with /healthz on port 3002 stub (this plan replaces src/index.ts while preserving the endpoint contract per MEDIUM #10)

provides:
  - "apps/worker/ — real pg-boss subscriber loop replacing the Plan 04 placeholder; same /healthz contract on port 3002 for Fly's worker process check"
  - "Concurrency=5 inbound-whatsapp queue handler that dispatches on typed payload.kind discriminator (HIGH #6) — no synthetic-string parsing across receiver↔worker"
  - "Race-safe message materialisation: INSERT messages ... ON CONFLICT (external_id) DO NOTHING (HIGH #4 + WA-03), backed by Plan 02's partial UNIQUE index"
  - "Ordinal-guarded status updates via single SQL UPDATE with CASE rank guard — never downgrades (PITFALL #11 + WA-04), writes updated_at = NOW() (Blocker #2)"
  - "Typed error classes (NoOptInError, WindowExpiredError, TemplateNotApprovedError) — ready for Plan 06 sendMessage chokepoint to import"
  - "Local Drizzle pg-core schema mirror (webhook_events + gym_members + conversations + messages) — carries forward Plan 04's deviation pattern; Plan 09 extracts packages/db/"
  - "Index.ts structured so Plan 06 + Plan 07 can register their boss.work() calls with one-line insertions before the admin server start"

affects:
  - P1b-06 (worker sendMessage chokepoint — imports errors.ts; registers outbound-whatsapp boss.work alongside inbound)
  - P1b-07 (Stripe event reducers — registers stripe-event boss.work alongside inbound; uses same getBoss/getDb/getLogger/getEnv primitives)
  - P1b-08 (staff-web outbound rotation — reads messages.updated_at + messages.status set by this plan's ordinal-guarded UPDATE)
  - P1b-09 (validation cutover — confirms end-to-end Meta webhook → Fly receiver → pg-boss → worker → DB trace this plan completes)

tech-stack:
  added:
    - "pg-boss ^12.18 (subscriber side — boss.work with localConcurrency + batchSize options; v12 API)"
    - "pino ^9.5 (structured worker logging; PII redaction config deferred to OBS-01/P1a)"
    - "nanoid ^5.1 (conversation + message ID generation)"
    - "vitest ^2.0 (worker unit tests; same version as edge-webhooks)"
  patterns:
    - "TDD red→green for domain helpers: tests written first (failing imports), then impl files added — both messageStatus + conversations followed the cycle"
    - "Ordinal-guarded status UPDATE: SET status = ${new}, ${ts-cols COALESCE} ... WHERE external_id = ? AND (CASE status ...) < ${new_rank}. Single round-trip, monotonic, idempotent on replay."
    - "Race-safe messages INSERT: .onConflictDoNothing({ target: schema.messages.externalId }).returning({id}) → if insertResult.length === 0, ON CONFLICT triggered → return duplicate_wamid. Belt-and-braces against the receiver-layer dedup."
    - "Typed-payload dispatch: switch on payload.kind from a Zod discriminatedUnion ('message' | 'status') — no parsing synthetic strings (e.g. wamid_status_X_ts_Y) for routing. The synthetic concat survives ONLY as the webhook_events dedup key written by the receiver."
    - "Worker bootstrap: env validate (Zod, fail-fast on -pooler) → getBoss + on('error', log) → await boss.start() → register all queues → bind /healthz on PORT 3002. Idempotent — boss.start() auto-creates pgboss.* schema if missing (D-16)."
    - "Plan 04 stub→real-impl swap pattern: Plan 04 binds /healthz on port 3002 with a placeholder body; Plan 05 replaces src/index.ts while preserving the same endpoint shape so the fly.toml worker http_check stays passing across deploys (MEDIUM #10)."

key-files:
  created:
    - "apps/worker/src/lib/env.ts (Zod boot env with -pooler guard + WA/Stripe/PGCRYPTO secrets validated)"
    - "apps/worker/src/lib/db.ts (local pg-core mirror — webhook_events, gym_members, conversations, messages — keyed off DATABASE_URL_UNPOOLED)"
    - "apps/worker/src/lib/errors.ts (NoOptInError, WindowExpiredError, TemplateNotApprovedError — for Plan 06)"
    - "apps/worker/src/lib/logger.ts (Pino with LOG_LEVEL env; redaction TODO at P1a)"
    - "apps/worker/src/boss.ts (re-export getBoss from @gymos/queue — D-12 single source of truth)"
    - "apps/worker/src/queues/inbound-whatsapp.ts (boss.work handler — dispatch on payload.kind, concurrency=5, marks webhook_events.processed_at)"
    - "apps/worker/src/domain/conversations.ts (upsertConversationAndMessage — race-safe INSERT with onConflictDoNothing on externalId)"
    - "apps/worker/src/domain/messageStatus.ts (applyOrdinalStatusUpdate + STATUS_RANK + MessageStatus type)"
    - "apps/worker/src/domain/conversations.test.ts (5 tests covering unknown_phone, first conversation creation, conflict target, duplicate_wamid, existing-conv update)"
    - "apps/worker/src/domain/messageStatus.test.ts (7 tests covering rank ordering, throw-on-unknown, CASE SQL, updated_at=NOW(), updatedRows, unix→ISO conversion, errorCode propagation)"
  modified:
    - "apps/worker/package.json (full deps: pg-boss, drizzle-orm, pino, @gymos/queue, @gymos/whatsapp, stripe, nanoid, date-fns, neon-serverless, ws)"
    - "apps/worker/tsconfig.json (rootDir src + exclude *.test.ts from dist)"
    - "apps/worker/src/index.ts (Plan 04 stub replaced — env→boss.start→registerInboundWhatsApp→admin /healthz on port 3002; structured for Plan 06/07 to slot in one boss.work each)"

decisions:
  - id: D-P1b-05-01
    summary: "pg-boss v12 WorkOptions API mapping — used batchSize: 5 + localConcurrency: 5 instead of plan's literal teamSize / teamConcurrency"
    rationale: "pg-boss v12 dropped v11's teamSize / teamConcurrency from WorkOptions. The dropping was noted in Plan 03 SUMMARY (per-queue retentionSeconds / deleteAfterSeconds also moved off ConstructorOptions). Plan 05's <action> text used the deprecated names; mapping localConcurrency=5 preserves D-14 semantics (5 in-process workers per node) and batchSize=5 lets each fetch up to 5 jobs per poll for burst throughput. Plan 06 / Plan 07 should use the same naming."
  - id: D-P1b-05-02
    summary: "Local Drizzle pg-core mirror for worker schema reads (NOT cross-app schema import from apps/staff-web/server/db/schema.ts)"
    rationale: "Plan literal Task 1 step 4 imports schema from ../../../staff-web/server/db/schema.js. Same dialect-typing-as-sqlite friction Plan 04 hit (RESEARCH Open Question #2). Local mirror covers only the columns this worker reads/writes (webhook_events, gym_members, conversations, messages) using drizzle-orm/pg-core. KEEP IN SYNC with apps/staff-web until Plan 09 extracts packages/db/."
  - id: D-P1b-05-03
    summary: "registerInboundWhatsAppWorker stub commit shipped at Task 1, real impl at Task 2 — instead of commenting out the import"
    rationale: "Plan suggested commenting the import in Task 1 and uncommenting at Task 2. Taking that path leaves an uncompilable commit in history. Instead, Task 1 ships a thin stub function (throws if called) so apps/worker/src/index.ts compiles + the Task 1 commit is independently valid; Task 2 overwrites the stub body with the real boss.work() registration. Same outcome, no broken intermediate commit."

metrics:
  duration_seconds: 501
  task_count: 3
  test_count: 12
  files_created: 10
  files_modified: 3
  deviations_auto_fixed: 1
  completed_date: "2026-05-20"
---

# Phase P1b Plan 05: Worker Inbound WhatsApp Summary

**One-liner:** Worker tier replaced the Plan 04 placeholder — pg-boss subscriber dispatches inbound-whatsapp jobs on typed `payload.kind` discriminator (HIGH #6), materialises conversations + messages with race-safe `onConflictDoNothing` on the partial-UNIQUE external_id (HIGH #4), and ordinal-guards status transitions with `updated_at = NOW()` (PITFALL #11 + Blocker #2), all bound to Neon's UNPOOLED endpoint (PITFALL #1).

## What Shipped

### Worker bootstrap (Task 1 — commit `9c7caf59`)

`apps/worker/src/index.ts` replaces the Plan 04 stub. Flow:

1. `getEnv()` — Zod-validated boot env. `DATABASE_URL_UNPOOLED` is required and refuses any URL containing `-pooler` (PITFALL #1). WhatsApp + Stripe + `PGCRYPTO_MASTER_KEY` are validated up-front so Plan 06 / 07 can `getEnv()` and read directly without re-validating.
2. `getBoss()` — re-export of `@gymos/queue`'s singleton (D-12). Worker hooks `boss.on("error", log)` then `await boss.start()` which auto-creates the `pgboss.*` schema on first run (D-16).
3. `registerInboundWhatsAppWorker(boss)` — calls `boss.work("inbound-whatsapp", { batchSize: 5, localConcurrency: 5 }, handler)`. Plan 06 + Plan 07 register their `boss.work()` calls on the same `boss` instance, one line each, before the admin server starts.
4. `serve({ fetch: admin.fetch, port: env.PORT })` — Hono admin app exposes `GET /healthz` returning `{ ok: true, version, app: "worker" }`. The endpoint contract is identical to the Plan 04 stub so the Fly worker `http_checks` block (MEDIUM #10) keeps passing across the deploy.

Other Task 1 files:

- `lib/db.ts` — local Drizzle pg-core mirror of the four tables this worker touches (webhook_events, gym_members, conversations, messages). Sidesteps the same dialect-typing friction Plan 04 hit (decision D-P1b-05-02).
- `lib/errors.ts` — `NoOptInError`, `WindowExpiredError`, `TemplateNotApprovedError` typed for Plan 06 to import as soon as it lands.
- `lib/logger.ts` — Pino with `LOG_LEVEL` env. Full PII redaction config is OBS-01 / P1a; minimal defaults here.
- `boss.ts` — re-export `getBoss` from `@gymos/queue` so worker imports a stable local symbol (D-12 single source).

### Domain helpers + queue handler (Task 2 — commit `5b645e18`)

`apps/worker/src/domain/messageStatus.ts` — `applyOrdinalStatusUpdate(db, externalId, newStatus, timestampUnix, errorCode?)`. Single SQL UPDATE with CASE rank guard:

```sql
UPDATE messages
SET status = $newStatus,
    sent_at      = COALESCE(sent_at,      CASE WHEN $newStatus = 'sent'      THEN $iso END),
    delivered_at = COALESCE(delivered_at, CASE WHEN $newStatus = 'delivered' THEN $iso END),
    read_at      = COALESCE(read_at,      CASE WHEN $newStatus = 'read'      THEN $iso END),
    error_code   = COALESCE(error_code,   CASE WHEN $newStatus = 'failed'    THEN $errorCode END),
    updated_at = NOW()
WHERE external_id = $externalId
  AND (CASE status WHEN 'queued' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE -1 END) < $newRank
```

Monotonic (never downgrades), idempotent on replay (rank-strict-greater WHERE), writes `updated_at = NOW()` (Blocker #2).

`apps/worker/src/domain/conversations.ts` — `upsertConversationAndMessage(db, msg, rawPayload)`. Looks up member by `phoneE164`, upserts conversation (insert-or-update last_inbound_at + unread_count + preview), then:

```ts
const insertResult = await db
  .insert(schema.messages)
  .values({ id, conversationId, externalId, direction: "in", messageType, body, payload: rawPayload, status: "delivered" })
  .onConflictDoNothing({ target: schema.messages.externalId })
  .returning({ id: schema.messages.id });

if (insertResult.length === 0) return { processed: false, reason: "duplicate_wamid" };
```

`onConflictDoNothing` targets the partial UNIQUE index from Plan 02 (HIGH #4). Two concurrent jobs racing on the same wamid produce exactly one row.

`apps/worker/src/queues/inbound-whatsapp.ts` — `boss.work("inbound-whatsapp", { batchSize: 5, localConcurrency: 5 }, handler)`. Handler parses job.data via `InboundWhatsAppPayload` Zod discriminated union, then dispatches on `data.kind`:

- `kind === "status"` — reads `data.statusFor` / `data.newStatus` / `data.timestamp` / `data.errorCode` directly (HIGH #6 — no synthetic-string parsing). Calls `applyOrdinalStatusUpdate`. Then best-effort marks the matching `webhook_events` row's `processed_at` via the dedup key the Plan 04 receiver wrote (`wamid_status_${id}_${ts}_${status}`). The dedup key only survives here as a bookkeeping marker — routing is purely on `data.kind`.
- `kind === "message"` — loads the raw payload from `webhook_events` (if present), short-circuits on `processedAt` (idempotency), calls `upsertConversationAndMessage`, marks `processed_at`.

### Tests (12 total, all passing)

`messageStatus.test.ts` (7 tests):

1. `STATUS_RANK` enforces strict ordering 0 < 1 < 2 < 3 < 4
2. `applyOrdinalStatusUpdate` throws on unknown status
3. SQL contains `CASE status` with all 5 status names (rank guard)
4. SQL contains `updated_at = NOW()` (Blocker #2 explicit assertion)
5. Returns `updatedRows` from execute result
6. Unix `1700000000` converts to `2023-11-14T22:13:20.000Z`
7. `errorCode` `131047` propagates for failed status

`conversations.test.ts` (5 tests):

1. Returns `{ processed: false, reason: "unknown_phone" }` when no member
2. Creates conversation + message for known member with no prior conversation
3. Messages INSERT calls `.onConflictDoNothing({ target: <externalId> })` (HIGH #4 explicit assertion)
4. Returns `{ processed: false, reason: "duplicate_wamid" }` when ON CONFLICT triggers (race)
5. Updates existing conversation with `unread_count = prev + 1`

```
Test Files: 2 passed (2)
Tests:     12 passed (12)
```

### pgboss schema (deferred to Task 3 deploy)

On first `boss.start()` Fly run, pg-boss auto-applies its schema migration creating tables under `pgboss.*` (at minimum `job`, `archive`, `version`, `subscription`). No code action required — handled by the library against `DATABASE_URL_UNPOOLED`.

### End-to-end traces (deferred to Task 3 fly deploy)

The plan's Task 3 is `checkpoint:human-verify` covering:

- Inbound trace: real Meta WA message → webhook_events row → pgboss.job row with `data = { kind: "message", externalId, from, ... }` → messages row materialised, conversations row updated.
- Status trace: outbound message → status webhook → pgboss.job row with `data = { kind: "status", statusFor, newStatus, ... }` → messages.status advances, messages.updated_at populated.
- Replay-twice idempotency: same WA payload sent twice → 1 row in webhook_events (receiver dedup) AND 1 row in messages (worker onConflictDoNothing — belt-and-braces).

Per project `auto_advance: true`, Task 3 was **auto-approved** at checkpoint time. The user will execute `fly deploy` + the SQL verification queries during the next demo / production sweep (Plan 09 validation cutover formally re-runs the trace).

## Self-Check Stub Scan

Scanned `apps/worker/src/**` for stub patterns (`= []`, `= null` flowing to UI, "TODO", "not available", "placeholder"):

- `apps/worker/src/queues/inbound-whatsapp.ts` — no stubs (real impl).
- `apps/worker/src/domain/{conversations,messageStatus}.ts` — no stubs.
- `apps/worker/src/lib/errors.ts` — typed errors defined but unused in this plan (intentional — Plan 06 consumes; documented in file header).
- `apps/worker/src/lib/logger.ts` — comment "Full PII redaction config is OBS-01 / P1a" — intentional, future plan tracks the gap (OBS-01).

No UI-facing stubs (worker is headless). No `Known Stubs` section required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pg-boss v12 WorkOptions API renamed**

- **Found during:** Task 2 typecheck
- **Issue:** Plan literal `{ teamSize: 5, teamConcurrency: 5 }` failed `tsc --noEmit` with `TS2769: Object literal may only specify known properties, and 'teamSize' does not exist in type 'WorkOptions'`. pg-boss v12 dropped v11's teamSize / teamConcurrency in favour of `batchSize` (fetch count per poll) + `localConcurrency` (in-process workers).
- **Fix:** Renamed to `{ batchSize: 5, localConcurrency: 5 }`. D-14 concurrency=5 semantic preserved — 5 in-process workers per node, each batch-fetching up to 5 jobs per poll. Inline comment in inbound-whatsapp.ts documents the rename for Plan 06 / 07.
- **Files modified:** `apps/worker/src/queues/inbound-whatsapp.ts`
- **Commit:** `5b645e18`

### Documented architectural carryovers (not deviations — same as Plan 04)

**Local Drizzle pg-core mirror in `apps/worker/src/lib/db.ts`** instead of cross-app schema import from `apps/staff-web/server/db/schema.ts`. Plan literal Task 1 step 4 reaches into `../../../staff-web/server/db/schema.js`. Plan 04 hit the same friction — `@agent-native/core/db/schema` helpers resolve to SQLite types at typecheck time and conflict with the neon-serverless pg driver. Local mirror covers only what this worker reads/writes. KEEP IN SYNC with apps/staff-web until Plan 09 extracts `packages/db/`.

### Authentication gates

None in this plan. Fly deploy + Neon secret set was carried forward from Plan 04 (DATABASE_URL_UNPOOLED is already a Fly secret; verified in Plan 04's deploy step).

## Notes for Plan 06 (Send chokepoint) + Plan 07 (Stripe reducers)

**Imports already wired:**

- `apps/worker/src/lib/errors.ts` exports `NoOptInError`, `WindowExpiredError`, `TemplateNotApprovedError`. Plan 06's `sendMessage` chokepoint imports + throws these instances; the queue handler in `apps/worker/src/queues/outbound-whatsapp.ts` should catch them and write `messages.error_code` from `err.code`.
- `apps/worker/src/boss.ts` re-exports `getBoss` from `@gymos/queue` — Plan 06 / 07 register their workers against the same singleton.
- `apps/worker/src/lib/env.ts` already validates `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `STRIPE_SECRET_KEY`, `PGCRYPTO_MASTER_KEY` — Plan 06 / 07 call `getEnv()` and consume directly.

**Where to register the next boss.work():**

`apps/worker/src/index.ts` lines 34–38:

```ts
  await registerInboundWhatsAppWorker(boss);
  log.info("[worker] inbound-whatsapp queue registered");
  // ← Plan 06 inserts: await registerOutboundWhatsAppWorker(boss);
  // ← Plan 07 inserts: await registerStripeEventWorker(boss);
```

One-line insertions; no other file structure changes needed.

**pg-boss v12 WorkOptions naming for Plan 06 / 07:** use `batchSize` + `localConcurrency` (NOT v11's `teamSize` / `teamConcurrency`). See decision D-P1b-05-01 above.

**For the outbound-whatsapp queue:** D-13's idempotency key is already wired by `enqueueOutboundWhatsApp` in `packages/queue` (singletonKey = `outbound-whatsapp:${messageId}`). Plan 06's handler reads `payload.payload` (the discriminated union with `type: "text" | "template"`) and dispatches the actual Meta send + writes `messages.status` / `messages.external_id` (wamid) back. Use `getDb()` from `apps/worker/src/lib/db.ts`.

**For the stripe-event queue:** D-13's idempotency key is `stripe-event:stripe_${eventId}`. Plan 07's handler resolves the Stripe secret via pgcrypto (`PGCRYPTO_MASTER_KEY` already validated), retrieves the event via `stripe.events.retrieve(eventId)` (per WEB-05 — never trust queue payload), then reduces into `stripe_customers` / `stripe_subscriptions` / `payments`.

---

## Self-Check: PASSED

Files verified to exist on disk:

- FOUND: `apps/worker/src/lib/env.ts`
- FOUND: `apps/worker/src/lib/db.ts`
- FOUND: `apps/worker/src/lib/errors.ts`
- FOUND: `apps/worker/src/lib/logger.ts`
- FOUND: `apps/worker/src/boss.ts`
- FOUND: `apps/worker/src/index.ts`
- FOUND: `apps/worker/src/queues/inbound-whatsapp.ts`
- FOUND: `apps/worker/src/domain/conversations.ts`
- FOUND: `apps/worker/src/domain/conversations.test.ts`
- FOUND: `apps/worker/src/domain/messageStatus.ts`
- FOUND: `apps/worker/src/domain/messageStatus.test.ts`

Commits verified in git log:

- FOUND: `9c7caf59` (Task 1 — bootstrap)
- FOUND: `5b645e18` (Task 2 — handler + domain + tests)

Build + tests verified locally:

- `pnpm --filter @gymos/worker typecheck` → exit 0
- `pnpm --filter @gymos/worker test` → 12 passed
- `pnpm --filter @gymos/worker build` → emitted `dist/`
