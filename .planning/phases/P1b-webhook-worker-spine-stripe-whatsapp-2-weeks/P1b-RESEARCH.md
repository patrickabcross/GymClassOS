# Phase P1b: Webhook + Worker Spine (Stripe + WhatsApp) — Research

**Researched:** 2026-05-20
**Domain:** Production webhook receivers (Hono on Fly), Postgres-backed job queue (pg-boss on Neon), Stripe Webhooks API (5 reducers), WhatsApp Cloud API (inbound + outbound + status + templates), thin transport adapter, encrypted-key rotation. Cross-cutting: monorepo refactor (`templates/mail/` → `apps/staff-web/`).
**Confidence:** HIGH on receiver/idempotency/Stripe-Connect-direct/pg-boss-API. **MEDIUM on `pg-boss × Neon-pooled-vs-unpooled` (advisory-locks + LISTEN/NOTIFY force unpooled — verified)**, on **lhr × us-east-1 cross-Atlantic latency** (verified Neon is in `us-east-1` despite UK customer — Fly region needs revisiting), and on **Stripe `apiVersion` exact string** (latest is `2026-04-22.dahlia` — pin at install). MEDIUM on `@great-detail/whatsapp` ecosystem health (single maintainer; mitigation = adapter pattern + mirror).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Deploy topology**
- **D-01:** One Fly app, two processes via `[processes]` block. `web` = Hono receiver on port 3001; `worker` = pg-boss subscriber (no exposed port). Same Docker image; Fly auto-restarts processes independently. Baseline cost ~$5/mo (one shared-cpu-1x machine).
- **D-02:** Fly region = `lhr` (London). First customer is UK-based. **NOTE this research surfaces a risk:** Neon project `gymos-demo` lives in `us-east-1` (verified in `.env.local` host `ep-holy-thunder-aqsb7xp1-pooler.c-8.us-east-1.aws.neon.tech`). lhr ⇄ us-east-1 is ~75-90ms RTT — each DB query in the webhook hot path pays that. Planner should re-evaluate (`iad` is the matching Fly region; or migrate Neon project to `eu-west-1` / `eu-central-1`). See §Open Questions.
- **D-03:** Stripe webhook hosted on the same Fly app as WhatsApp. `apps/edge-webhooks/` exposes `POST /webhooks/whatsapp`, `GET /webhooks/whatsapp` (Meta verify_token), `POST /webhooks/stripe`. Shared pg-boss producer, shared `webhook_events` table.

**Demo cutover**
- **D-04:** Parallel-run cutover. Stand up `apps/edge-webhooks` on Fly at a separate URL. Replay synthetic Meta + Stripe payloads against it until green. Then flip Meta's webhook subscription URL in Meta Business Manager.
- **D-05:** Delete `templates/mail/app/routes/webhooks.whatsapp.tsx` as the LAST task of P1b (after Meta URL flip verified).

**Repo layout & fork-boundary refactor**
- **D-06:** Refactor `templates/mail/` → `apps/staff-web/` as Task 1 of P1b (~1–2 days mechanical). Templates/mail goes back upstream-clean (no gymos.* routes).
- **D-07:** Reasoning: avoid TWO sets of merge conflicts (one when adding apps/, another when moving staff-web later).
- **D-08:** Three new top-level apps + three new packages: `apps/staff-web/` (moved), `apps/edge-webhooks/` (NEW), `apps/worker/` (NEW), `packages/whatsapp/` (NEW thin adapter), `packages/queue/` (NEW typed publisher), `packages/db/` (extracted Drizzle schema — planner decides whether to extract).

**sendMessage chokepoint & WhatsApp adapter shape**
- **D-09:** `packages/whatsapp/` is transport ONLY. Exports `sendText(to, body)` and `sendTemplate(to, name, vars)` — just typed wrappers around Graph API calls. Default impl uses `@great-detail/whatsapp`; one-file swap to hand-rolled `fetch`. NO gate logic in this package.
- **D-10:** `apps/worker/src/domain/sendMessage.ts` IS the chokepoint. Signature: `sendMessage({ memberId, payload, db, boss }) → Promise<MessageId>`. Inside, in order: opt-in check → window check → template-approved check → INSERT message row queued → call adapter → UPDATE status='sent'/'failed' with `external_id`. Status webhook later flips delivered/read.
- **D-11:** Worker is the ONLY caller of `packages/whatsapp/`. `apps/staff-web/package.json` MUST NOT depend on `packages/whatsapp/` (compile-time enforced).

**Queue API & staff-web ↔ worker interface**
- **D-12:** Shared typed publisher `packages/queue/`. Exports: `enqueueOutboundWhatsApp`, `enqueueStripeEvent`, `enqueueInboundWhatsApp`, `enqueueClassReminder` (stub for P2 NOTIF-01). Imported by `apps/staff-web` (Vercel) and `apps/edge-webhooks` (Fly).
- **D-13:** pg-boss `singletonKey` discipline:
  - `outbound-whatsapp`: `singletonKey = msg_<localMessageId>`
  - `stripe-event`: `singletonKey = stripe_<event.id>`
  - `inbound-whatsapp`: `singletonKey = wamid_<external_id>`
- **D-14:** Concurrency profile (planner verifies):
  - `outbound-whatsapp`: concurrency=1, rate=80/sec/phone
  - `stripe-event`: concurrency=3
  - `inbound-whatsapp`: concurrency=5
  - Cron / housekeeping: singletons.

**Schema additions (one migration, additive only)**
- **D-15:** ONE Drizzle migration adds all P1b tables. Strictly additive. Tables: `whatsapp_opt_in`, `whatsapp_templates`, `whatsapp_window_state` (VIEW default), `stripe_customers`, `stripe_subscriptions`, `payments`, plus `secrets` (pgcrypto) for Stripe restricted-key.
- **D-16:** pg-boss runs its own schema migration on first connect (`pgboss.*` tables). Verified production-safe per pg-boss docs.
- **D-17:** `webhook_events` already exists from demo (line 318, schema.ts). P1b extends it: add `UNIQUE (provider, external_id)` ADDITIVELY (no rename, no drop). All inserts use `ON CONFLICT (provider, external_id) DO NOTHING`.

**Outbound send UX**
- **D-18:** Optimistic insert + worker upserts status. Coach clicks Send → action inserts messages row status='queued' + enqueues + returns 200. Worker processes; on `NoOptInError`/`WindowExpiredError`, status flips to 'failed' with visible `error_code`.
- **D-19:** UI pre-gates AND worker enforces (defence in depth). Inbox loader exposes `windowState` + `optInState` per conversation. Send button disables for out-of-window; template picker disables for no-opt-in. Worker re-checks at send time.
- **D-20:** Window-state indicator in conversation list AND thread header. List row: small green dot ("14h left in window") or grey badge ("out of window — template only"). Thread header: same, prominent.
- **D-21:** TanStack Query refetch on focus + on-send invalidate for status sync. No SSE infra.

**Stripe scope & validation depth**
- **D-22:** ALL 5 Stripe reducers ship in P1b: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. (NOTE this is six events — context says "5 reducers" but lists six; treat as six handlers.)
- **D-23:** Validation = integration tests for 4 success-criteria scenarios + unit tests for gate functions. NO 50-concurrent stress test (deferred to BKG-03/P2).
- **D-24:** Test infra: Vitest unit+integration; Stripe CLI `stripe trigger`; saved JSON fixtures for WhatsApp; Neon branch `test` (off `gymos-demo`).

**P0 deps & creds**
- **D-25:** P1b builds against test creds (Stripe `sk_test_…` + Meta dev sandbox). P0 swaps real creds at cutover.
- **D-26:** ROADMAP order effectively becomes P1a → P1b → P0 → P2. P1b does not BLOCK on P0 finishing.

**Phase boundary discipline**
- **D-27:** P1b ships exactly the 18 listed reqs. NOTIF-*, WAIT-*, BKG-03, INBX-04/05 polished — all stay in P2.

### Claude's Discretion

Planner / executor picks these — not user-facing visionary decisions:
- Exact fly.toml shape (release_command for pg-boss schema migrate? machine type? autoscale=false?)
- `whatsapp_window_state` as materialised table vs view (default: VIEW)
- Where `packages/db/` lives or whether it gets extracted (default: keep schema in `apps/staff-web/server/db/` and import via workspace ref; extract only if cyclic import emerges)
- pg-boss `retentionDays`, `archiveCompletedAfterSeconds`, `deleteAfterDays` tuning
- Stripe SDK `apiVersion` exact string (latest stable at install time)
- Error-code surface in failed message bubbles
- Window-badge exact copy
- Worker startup order
- Rotation UI placement (new `/gymos/settings/integrations` or inline)
- Test fixture format / location
- Logging shape (Pino with sensible defaults; full PII redaction = P1a)

### Deferred Ideas (OUT OF SCOPE)

- **NOTIF-01..05** (24h/2h class reminders, payment_failed/pass_expiring templates, no-show, pass-expiry TZ) — **P2**. They CONSUME the spine. Stub `enqueueClassReminder` publisher only.
- **WAIT-01..06** (waitlist + reply-to-confirm + TTL) — **P2**.
- **BKG-03/04** (atomic booking + entitlement + pass debit in single TX) — **P2**. Different concurrency contract.
- **INBX-04** (template picker UX polish) — **P2**.
- **INBX-05** (full hours-left calc + design polish) — **P2**. P1b ships functional indicator only.
- **SET-01..03** (settings UI: template list, Stripe rotation UI polish, system health dashboard) — **P2**. P1b ships rotation ENDPOINT + bare-bones UI behind /gymos/settings/integrations.
- **50-concurrent webhook stress test** — deferred (BKG-03 in P2 owns concurrency contract).
- **Chaos test (worker crash mid-job)** — deferred.
- **SSE channel for live message status** — post-v1.
- **`integration_pending_tasks` pattern from agent-native** — different problem domain.
- **Stripe Customer Portal link generation** (PAY-04) — **P2**. P1b sets up `stripe_customers` mirror.
- **Per-customer (per-studio) deploy script** (DEP-01..04) — **P1a/P0**.
- **Pino PII-redacted logging across all apps** (OBS-01) — **P1a**.
- **`/healthz` queue-depth endpoint** (OBS-02) — **P1a**. P1b's `/healthz` returns just `200 OK + version`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WEB-01 | `apps/edge-webhooks` on Fly with `min_machines = 1` | §Fly.io two-process app shape; PITFALL #8 |
| WEB-02 | HMAC verify against raw body BEFORE JSON parse | §Hono raw-body pattern; demo's existing pattern in `webhooks.whatsapp.tsx`; PITFALL #9, #25 |
| WEB-03 | Receiver inserts `webhook_events` with `ON CONFLICT DO NOTHING`, enqueues via pg-boss, returns 200 in <100ms | §Webhook receiver pattern; §pg-boss send |
| WEB-04 | `apps/worker` on Fly running pg-boss against same Neon (NO Redis) | §pg-boss on Neon — UNPOOLED connection critical |
| WEB-05 | Worker idempotent — same external_id produces same state | §Stripe reducer pattern; §pg-boss singletonKey |
| WEB-06 | Stripe handler wraps webhook_events insert + business work in single TX; refetches from Stripe; `apiVersion` pinned | §Stripe webhook idiom; PITFALL #2 |
| STR-03 | `checkout.session.completed` → `payments` + pass grant atomic | §Stripe reducer 1 |
| STR-04 | `invoice.paid` + `invoice.payment_failed` → reconcile `stripe_subscriptions` + `payments` | §Stripe reducer 2 + 3 |
| STR-05 | `customer.subscription.updated/deleted` → reconcile membership status | §Stripe reducer 4 + 5 |
| STR-06 | `charge.refunded` → reverse pass grant (negative `pass_debits`) | §Stripe reducer 6 |
| STR-07 | All handlers idempotent (replay-twice tests pass) | §Single-tx idempotency pattern |
| WA-03 | Inbound webhook materialises `conversations` + `messages` from Meta; dedup on `(provider_event_type, external_id)` | §WhatsApp inbound processor; §webhook_events extension |
| WA-04 | Status webhooks update `messages.status` via ordinal-guarded UPDATE | §Ordinal status pattern; PITFALL #11 |
| WA-05 | Single `sendMessage()` chokepoint = only path to Meta's send API; staff-web NEVER calls Meta | §sendMessage chokepoint; D-09/10/11 |
| WA-06 | `sendMessage()` enforces 24h window by reading `conversations.last_inbound_at`; non-template out-of-window → typed error | §Window gate function; PITFALL #1 |
| WA-07 | `whatsapp_opt_in` table; `sendMessage()` refuses if no opt-in | §Opt-in gate; PITFALL #17 |
| WA-08 | Template send uses approved list from `whatsapp_templates`; synced daily by housekeeping job | §pg-boss schedule cron; §Meta template approval API |
| WA-09 | WhatsApp client wrapped in thin adapter `packages/whatsapp/` — swap to hand-rolled is one-file change | §Adapter shape; PITFALL #19 |
</phase_requirements>

## Summary

P1b builds the production webhook + worker spine that replaces the demo's `templates/mail/app/routes/webhooks.whatsapp.tsx` ngrok-tunnelled receiver. It is one of the most architecturally consequential phases: every external event from Stripe or Meta after this phase MUST land in `webhook_events`, MUST be enqueued via pg-boss, and MUST be processed by `apps/worker/`. Every outbound WhatsApp send MUST go through the `sendMessage()` chokepoint that enforces opt-in + 24h-window + template-approval gates.

The phase has three interlocking workstreams: (1) a one-time mechanical monorepo refactor moving `templates/mail/` → `apps/staff-web/` and standing up `apps/edge-webhooks/`, `apps/worker/`, `packages/whatsapp/`, `packages/queue/`; (2) the pg-boss-on-Neon queue infrastructure (with one critical pitfall: pg-boss needs the UNPOOLED Neon connection because it uses LISTEN/NOTIFY, advisory locks, and prepared statements that the pooler in transaction mode breaks); (3) the six Stripe reducers + the WhatsApp inbound/outbound/status flows.

Two cross-cutting risks surfaced during research that the planner should treat as load-bearing: **Neon's region is `us-east-1`, but the locked Fly region is `lhr`** — this is a ~75-90ms RTT mismatch on every DB query in the webhook hot path; planner should re-evaluate (move Fly to `iad`, or migrate Neon to `eu-west-1`). And **pg-boss MUST use the direct/unpooled Neon endpoint**, not the `-pooler` URL currently in `.env.local` — this is not negotiable.

**Primary recommendation:** Start with Task 1 (refactor → `apps/staff-web/`). The mechanical move is the biggest single risk to schedule; doing it first means the subsequent tasks (edge-webhooks scaffold, worker scaffold, schema migration, reducers, gates) land in a stable layout. Schedule Stripe reducers and WhatsApp inbound/outbound in parallel after the spine is up (Tasks 5-9 can fan out).

## Standard Stack

### Core (all P1b-specific additions on top of agent-native's existing stack)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Hono** | `^4.x` (verify at install with `npm view hono version`) | Edge-webhooks receiver framework | TS-native, first-class raw-body access via `c.req.text()`, designed for the Stripe/WhatsApp signature-verify pattern (PITFALL #9 mitigation). Agent-native does NOT use Hono; this is GymClassOS-specific to the Fly side. |
| **pg-boss** | `12.18.x` (verified 2026-05-02 release; STACK.md lists `^10.x` but is stale — use latest 12.x) | Postgres-backed job queue | Eliminates Redis. Runs in same Neon DB as application schema. `singletonKey` for idempotent enqueue. `boss.send()`, `boss.work()`, `boss.schedule()` API. **Requires UNPOOLED Neon endpoint.** |
| **`@great-detail/whatsapp`** | `^9.0.0` (April 2026; verified current — Cloud API v23) | WhatsApp Cloud API client (maintained fork) | Meta's official SDK is paused. Single-maintainer; mitigation = thin adapter (D-09) + mirror to studio org GitHub (FND-05, P0). API surface: `sdk.message.createMessage({phoneNumberID, to, type, ...})` for both text and template; `event.verifySignature(appSecret)` for webhook validation. Requires **Node 22+**. |
| **`stripe`** | `^19.x` (latest; verify with `npm view stripe version` at install) — pin `apiVersion: "2026-04-22.dahlia"` exactly | Stripe Node SDK | `stripe.webhooks.constructEvent(rawBody, sig, secret)` is the only correct webhook pattern (PITFALL #2). Always pin `apiVersion` constructor option (CLAUDE.md WEB-06 mandate). |
| **`pg`** | `^8.x` (peer of pg-boss) | Direct Postgres client (alternative to `@neondatabase/serverless` for pg-boss) | pg-boss accepts a connection string OR a `pg.Pool` instance. Use `pg` driver directly — `@neondatabase/serverless` WebSocket driver is NOT a substitute (pg-boss code reads pg's specific event API). |
| **Drizzle ORM** | `^0.45.x` (already in agent-native; do NOT jump to 1.0-beta) | DB schema + queries — same as existing | Inherit from `@agent-native/core`. |
| **`@neondatabase/serverless`** | `^1.1.x` (already in agent-native) | DB driver for Drizzle in worker and edge-webhooks | Use the WebSocket driver in long-running Fly processes (transactions, lower latency). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Pino** | `^9.x` | Structured logging on Fly | Minimal config in P1b: just JSON output + level. Full PII redaction = OBS-01 in P1a. |
| **Zod** | `^4.x` (already in agent-native) | Env-var validation + webhook payload runtime checks | All three new apps validate env on boot with Zod (fail-fast). |
| **date-fns** | `^4.1.x` (already in agent-native) | 24h-window math in `sendMessage()` | Use `differenceInHours(now, lastInboundAt) >= 24`. NO `date-fns-tz` needed here — UTC math is fine for the window check. |
| **Nanoid** | `^5.1.x` (already in agent-native) | Local `messages.id` generation pre-send | Use the catalog version (`pnpm catalog`). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg-boss | BullMQ + Redis | BullMQ is more mature for high-throughput, but adds Redis = another service, another secret, another bill. STACK.md trigger to revisit: pg-boss polling latency p95 > 2s OR Postgres write contention on queue tables. Solo-dev / one-studio / 2-month ship = pg-boss wins. |
| Hono on Fly | Express + raw-body middleware | Express works but every webhook tutorial fights `express.json()` middleware order (PITFALL #9). Hono has no auto-parse — `c.req.text()` is the obvious correct path. |
| `@great-detail/whatsapp` | Hand-rolled `fetch` calls to Graph API | Documented backup if SDK goes stale (PITFALL #19). Adapter shape (D-09) makes this a one-file swap. |
| pgcrypto column encryption | Fly Secrets only (env var) | pgcrypto required because STR-01 mandates "stored encrypted in DB" so the rotation UI can read it. Master key for `pgp_sym_encrypt` lives in Fly Secrets. |
| Direct Neon-pooled connection for pg-boss | Direct Neon UNPOOLED connection | pg-boss uses LISTEN/NOTIFY, advisory locks, and prepared statements — **all break under PgBouncer transaction-mode pooling.** Use unpooled (no `-pooler` suffix). Connection budget on Neon free/0.25 CU is ~112 concurrent. Pool size of 5-10 inside pg-boss is fine. |

**Installation (in the apps that need each):**

```bash
# apps/edge-webhooks/package.json
pnpm add hono stripe @great-detail/whatsapp pg-boss pg @neondatabase/serverless drizzle-orm zod pino nanoid
pnpm add -D @types/pg @types/node tsx vitest

# apps/worker/package.json
pnpm add stripe @great-detail/whatsapp pg-boss pg @neondatabase/serverless drizzle-orm zod pino date-fns nanoid
pnpm add -D @types/pg @types/node tsx vitest

# packages/whatsapp/package.json
pnpm add @great-detail/whatsapp zod

# packages/queue/package.json
pnpm add pg-boss pg zod
```

**Version verification (run at install time):**
```bash
npm view hono version              # expect ^4.x (latest as of May 2026 ~4.6+)
npm view pg-boss version           # expect 12.18.x (verified 2026-05-02)
npm view @great-detail/whatsapp version   # expect 9.x (verified 2026-04-17 v9.0.0)
npm view stripe version            # expect 19.x with apiVersion "2026-04-22.dahlia"
```

## Architecture Patterns

### Recommended Project Structure (post-refactor)

```
hustle/                                    # repo root
├── apps/                                  # NEW top-level
│   ├── staff-web/                         # moved from templates/mail/ in Task 1
│   │   ├── app/                           # RR v7 routes (gymos.*, webhooks.whatsapp.tsx removed last)
│   │   ├── server/
│   │   │   ├── db/                        # ← schema.ts STAYS here (no premature extract)
│   │   │   ├── plugins/                   # auth.ts publicPaths updates
│   │   │   └── handlers/
│   │   ├── react-router.config.ts
│   │   ├── vite.config.ts
│   │   ├── drizzle.config.ts              # uses @agent-native/core/db/drizzle-config
│   │   ├── netlify.toml                   # current — replace with vercel.json (see Discretion §Vercel deploy)
│   │   └── package.json
│   │
│   ├── edge-webhooks/                     # NEW Hono receiver (Fly web process)
│   │   ├── src/
│   │   │   ├── server.ts                  # Hono app, port 3001, healthz
│   │   │   ├── routes/
│   │   │   │   ├── whatsapp.ts            # GET (verify_token) + POST (HMAC + persist + enqueue)
│   │   │   │   └── stripe.ts              # POST (constructEvent + persist + enqueue)
│   │   │   ├── lib/
│   │   │   │   ├── db.ts                  # Drizzle (neon-serverless WS) — for webhook_events writes
│   │   │   │   ├── stripe.ts              # Stripe SDK init w/ pinned apiVersion + secret rotation hook
│   │   │   │   ├── idempotency.ts         # insertWebhookEvent helper (ON CONFLICT DO NOTHING)
│   │   │   │   └── env.ts                 # Zod-validated env
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── worker/                            # NEW pg-boss workers (Fly worker process)
│       ├── src/
│       │   ├── index.ts                   # boss.start() + register all workers + tiny healthz
│       │   ├── queues/
│       │   │   ├── outbound-whatsapp.ts   # boss.work('outbound-whatsapp', ...) → sendMessage()
│       │   │   ├── inbound-whatsapp.ts    # boss.work('inbound-whatsapp', ...) → materialise convo + message
│       │   │   ├── stripe-event.ts        # boss.work('stripe-event', ...) → dispatch to reducer
│       │   │   └── housekeeping.ts        # boss.schedule('templates-sync', '0 3 * * *', ...)
│       │   ├── domain/
│       │   │   ├── sendMessage.ts         # ← THE CHOKEPOINT (D-10)
│       │   │   ├── gates/
│       │   │   │   ├── windowGate.ts      # canSendFreeform(lastInboundAt, now): pure fn
│       │   │   │   ├── optInGate.ts       # hasOptIn(memberId, db): boolean
│       │   │   │   └── templateGate.ts    # isTemplateApproved(name, db): boolean
│       │   │   ├── stripeReducers/        # one file per event.type
│       │   │   │   ├── checkout-session-completed.ts
│       │   │   │   ├── invoice-paid.ts
│       │   │   │   ├── invoice-payment-failed.ts
│       │   │   │   ├── subscription-updated.ts
│       │   │   │   ├── subscription-deleted.ts
│       │   │   │   └── charge-refunded.ts
│       │   │   ├── conversations.ts       # upsertConversation, appendMessage
│       │   │   └── messageStatus.ts       # ordinal-guarded UPDATE
│       │   ├── lib/
│       │   │   ├── db.ts                  # Drizzle (neon-serverless WS, transaction-capable)
│       │   │   ├── stripe.ts              # Stripe SDK w/ rotation-aware key read
│       │   │   ├── env.ts
│       │   │   └── errors.ts              # NoOptInError, WindowExpiredError, TemplateNotApprovedError
│       │   └── boss.ts                    # shared PgBoss singleton (UNPOOLED conn string)
│       ├── Dockerfile                     # shared with edge-webhooks if same image
│       └── package.json
│
├── packages/                              # NEW workspace packages (alongside existing packages/*)
│   ├── whatsapp/                          # THIN transport adapter (D-09)
│   │   ├── src/
│   │   │   ├── index.ts                   # exports sendText, sendTemplate, verifySignature
│   │   │   ├── sdk-impl.ts                # current @great-detail/whatsapp implementation
│   │   │   └── types.ts
│   │   └── package.json                   # depends ONLY on @great-detail/whatsapp + zod
│   └── queue/                             # typed pg-boss publisher (D-12)
│       ├── src/
│       │   ├── index.ts                   # exports queue helpers
│       │   ├── boss.ts                    # getBoss(env): PgBoss singleton
│       │   ├── publish.ts                 # enqueueOutboundWhatsApp, enqueueStripeEvent, ...
│       │   └── types.ts                   # payload shapes (Zod schemas)
│       └── package.json
│
├── templates/                             # untouched fork
│   ├── mail/                              # ← back to upstream-clean after Task 1
│   │   └── ...                            # (no gymos.* routes, no webhooks.whatsapp.tsx, no GymClassOS schema additions)
│   └── ...
│
├── packages/                              # existing — agent-native vendored
│   └── core/
│
├── pnpm-workspace.yaml                    # add "apps/*"
├── fly.toml                               # ONE file at repo root or apps/edge-webhooks/fly.toml
└── package.json
```

### pnpm-workspace.yaml update

```yaml
packages:
  - packages/*           # existing — agent-native + new packages/whatsapp + packages/queue
  - templates/*
  - templates/*/desktop
  - apps/*               # NEW — apps/staff-web, apps/edge-webhooks, apps/worker

catalog:
  # ... existing entries preserved
```

### Pattern 1: Webhook Receiver → Idempotency Table → Worker Queue

**What:** External webhook → `apps/edge-webhooks` → verify signature on RAW body → INSERT `webhook_events` with ON CONFLICT DO NOTHING → enqueue via pg-boss `boss.send()` → return 200 in <100ms.

**When to use:** ALL external webhooks. WhatsApp inbound. WhatsApp status. Stripe events.

**Critical rule (PITFALL #9):** Read raw body FIRST. Never `c.req.json()` before signature verification.

**Example — Stripe receiver (`apps/edge-webhooks/src/routes/stripe.ts`):**

```typescript
// Source: STRIPE webhook docs (https://docs.stripe.com/webhooks/signature) + ARCHITECTURE.md Pattern 1
import { Hono } from "hono";
import Stripe from "stripe";
import { getDb } from "../lib/db.js";
import { schema } from "@gymos/db";       // OR relative import from apps/staff-web
import { enqueueStripeEvent } from "@gymos/queue";
import { env } from "../lib/env.js";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",          // PINNED — never floats (PITFALL #2)
});

export const stripeRoutes = new Hono();

stripeRoutes.post("/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.text("missing signature", 400);

  // 1. RAW BODY FIRST (PITFALL #9 — never c.req.json() before this)
  const raw = await c.req.text();

  // 2. constructEvent verifies HMAC + parses (atomically). Throws on tamper.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return c.text("invalid signature", 400);     // success criterion #5
  }

  // 3. Idempotency — INSERT ... ON CONFLICT DO NOTHING on (provider, external_id)
  const db = getDb();
  const inserted = await db
    .insert(schema.webhookEvents)
    .values({
      id: `stripe:${event.id}`,
      provider: "stripe",
      eventType: event.type,
      externalId: event.id,                       // NEW COLUMN — see §Schema additions
      payloadRaw: raw,
    })
    .onConflictDoNothing({
      target: [schema.webhookEvents.provider, schema.webhookEvents.externalId],
    })
    .returning({ id: schema.webhookEvents.id });

  if (inserted.length === 0) {
    return c.text("ok (dedup)", 200);             // Stripe retry — already processed
  }

  // 4. Enqueue for worker
  await enqueueStripeEvent({ eventId: event.id });

  return c.text("ok", 200);                       // total budget: <100ms
});
```

**WhatsApp inbound receiver (`apps/edge-webhooks/src/routes/whatsapp.ts`):** Mirrors the demo's existing pattern (`templates/mail/app/routes/webhooks.whatsapp.tsx` lines 47-67) but ported to Hono. Key differences:

```typescript
// Source: demo's existing webhooks.whatsapp.tsx — port to Hono signature
import { Hono } from "hono";
import crypto from "node:crypto";
import { verifySignature } from "@gymos/whatsapp";   // thin adapter wrapper
import { getDb } from "../lib/db.js";
import { schema } from "@gymos/db";
import { enqueueInboundWhatsApp } from "@gymos/queue";

export const whatsappRoutes = new Hono();

// Meta verify_token handshake (GET) — preserved from demo
whatsappRoutes.get("/whatsapp", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("Forbidden", 403);
});

// Inbound + status webhooks (POST)
whatsappRoutes.post("/whatsapp", async (c) => {
  const raw = await c.req.text();                   // PITFALL #9
  const sig = c.req.header("x-hub-signature-256") ?? "";

  // Option A: use adapter's verifier
  if (!verifySignature(raw, sig, env.WHATSAPP_APP_SECRET)) {
    return c.text("Bad signature", 401);
  }

  const payload = JSON.parse(raw);                  // safe AFTER verify
  const db = getDb();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      // INBOUND messages
      for (const msg of value?.messages ?? []) {
        await persistAndEnqueue(db, msg, raw, "inbound");
      }
      // STATUS updates (WA-04) — separate dedup namespace
      for (const status of value?.statuses ?? []) {
        await persistAndEnqueue(db, status, raw, "status", { isStatus: true });
      }
    }
  }
  return c.text("OK", 200);
});

async function persistAndEnqueue(db, item, raw, eventType, opts = {}) {
  const externalId = opts.isStatus ? `wamid_status_${item.id}` : item.id;
  const inserted = await db
    .insert(schema.webhookEvents)
    .values({
      id: `whatsapp:${externalId}`,
      provider: "whatsapp",
      eventType: opts.isStatus ? "messages.status" : "messages.inbound",
      externalId,
      payloadRaw: raw,
    })
    .onConflictDoNothing({
      target: [schema.webhookEvents.provider, schema.webhookEvents.externalId],
    })
    .returning({ id: schema.webhookEvents.id });

  if (inserted.length > 0) {
    await enqueueInboundWhatsApp({ externalId, isStatus: opts.isStatus });
  }
}
```

### Pattern 2: Outbound Send — Optimistic Insert → Queue → sendMessage() Chokepoint

**What:** Staff clicks Send in inbox → React Router `action` inserts `messages` row with status='queued' + calls `enqueueOutboundWhatsApp({ messageId })` + returns 200 optimistically. Worker dequeues → `sendMessage()` runs gates → calls adapter → updates message status.

**Code skeleton — `apps/worker/src/domain/sendMessage.ts` (THE chokepoint, D-10):**

```typescript
// Source: PITFALL #1 (24h window), PITFALL #17 (opt-in), PITFALL #20 (idempotent send)
import { sendText, sendTemplate } from "@gymos/whatsapp";
import { schema } from "@gymos/db";
import { differenceInHours } from "date-fns";
import { eq, and } from "drizzle-orm";
import {
  NoOptInError,
  WindowExpiredError,
  TemplateNotApprovedError,
} from "../lib/errors.js";

type SendMessageArgs = {
  memberId: string;
  messageId: string;                              // local PK (nanoid pre-generated in action)
  payload:
    | { type: "text"; body: string }
    | { type: "template"; name: string; vars: Record<string, string> };
  db: typeof db;
};

export async function sendMessage(args: SendMessageArgs): Promise<{ externalId: string }> {
  const { memberId, messageId, payload, db } = args;

  // 1. Opt-in gate (WA-07; PITFALL #17)
  const optIn = await db
    .select()
    .from(schema.whatsappOptIn)
    .where(eq(schema.whatsappOptIn.memberId, memberId))
    .limit(1)
    .then((r) => r[0]);
  if (!optIn) throw new NoOptInError(memberId);

  // 2. Lookup phone + conversation (need last_inbound_at)
  const member = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, memberId))
    .limit(1)
    .then((r) => r[0]);
  if (!member?.phoneE164) throw new Error("member has no phone");

  const conversation = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.memberId, memberId),
        eq(schema.conversations.channel, "whatsapp"),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  // 3. Window gate (WA-06; PITFALL #1)
  const lastInboundAt = conversation?.lastInboundAt
    ? new Date(conversation.lastInboundAt)
    : null;
  const inWindow =
    lastInboundAt && differenceInHours(new Date(), lastInboundAt) < 24;

  if (payload.type === "text" && !inWindow) {
    throw new WindowExpiredError(memberId, lastInboundAt);
  }

  // 4. Template-approved gate (WA-08)
  if (payload.type === "template") {
    const tpl = await db
      .select()
      .from(schema.whatsappTemplates)
      .where(eq(schema.whatsappTemplates.name, payload.name))
      .limit(1)
      .then((r) => r[0]);
    if (!tpl || tpl.status !== "approved") {
      throw new TemplateNotApprovedError(payload.name);
    }
  }

  // 5. Call adapter
  let externalId: string;
  try {
    if (payload.type === "text") {
      const result = await sendText({
        to: member.phoneE164.replace("+", ""),
        body: payload.body,
      });
      externalId = result.messageId;
    } else {
      const result = await sendTemplate({
        to: member.phoneE164.replace("+", ""),
        name: payload.name,
        vars: payload.vars,
      });
      externalId = result.messageId;
    }
  } catch (err: any) {
    // 4xx from Meta → mark failed, don't retry
    await db
      .update(schema.messages)
      .set({
        status: "failed",
        error: err.message?.slice(0, 500) ?? "send_failed",
      })
      .where(eq(schema.messages.id, messageId));
    if (err.status >= 400 && err.status < 500) return { externalId: "" };
    throw err;                                    // 5xx → let pg-boss retry
  }

  // 6. Mark sent
  await db
    .update(schema.messages)
    .set({
      status: "sent",
      externalId,
      sentAt: new Date().toISOString(),
    })
    .where(eq(schema.messages.id, messageId));

  // 7. Update conversation last_outbound_at
  if (conversation) {
    await db
      .update(schema.conversations)
      .set({ lastOutboundAt: new Date().toISOString() })
      .where(eq(schema.conversations.id, conversation.id));
  }

  return { externalId };
}
```

**Staff-web action call site (`apps/staff-web/app/routes/gymos.tsx`):** Replace the env-gated direct Meta call (currently around line 494-528) with:

```typescript
// Source: D-18 optimistic insert + enqueue
import { nanoid } from "nanoid";
import { enqueueOutboundWhatsApp } from "@gymos/queue";

export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const conversationId = fd.get("conversationId") as string;
  const body = (fd.get("body") as string).trim();
  if (!body) return redirect(`/gymos?conversation=${conversationId}`);

  const db = getDb();
  const conv = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
    .then((r) => r[0]);
  if (!conv) throw new Response("Not found", { status: 404 });

  const messageId = `msg_${nanoid()}`;

  // 1. OPTIMISTIC insert with status='queued'
  await db.insert(schema.messages).values({
    id: messageId,
    conversationId,
    direction: "out",
    messageType: "text",
    body,
    status: "queued",
    requestedByUserId: null,                   // P1a wires Better-auth session
  });

  // 2. Enqueue with singletonKey for dedup (D-13)
  await enqueueOutboundWhatsApp({
    messageId,
    memberId: conv.memberId,
    payload: { type: "text", body },
    singletonKey: `outbound-whatsapp:${messageId}`,
  });

  // 3. Return 200 — optimistic UI renders message with clock icon
  return redirect(`/gymos?conversation=${conversationId}`);
}
```

### Pattern 3: Stripe Event Reducers (One Function Per Event Type)

**What:** Worker dequeues `stripe-event` job → load `webhook_events.payloadRaw` → parse → dispatch to reducer keyed on `event.type` → reducer is idempotent + uses `event.id` as natural key + REFETCHES from Stripe (don't trust payload — WEB-06).

**Worker entrypoint (`apps/worker/src/queues/stripe-event.ts`):**

```typescript
// Source: ARCHITECTURE.md Pattern 3 + PITFALL #2
import { reducers } from "../domain/stripeReducers/index.js";
import { stripe } from "../lib/stripe.js";
import { getDb } from "../lib/db.js";
import { schema } from "@gymos/db";
import { eq, and } from "drizzle-orm";

export function registerStripeEventWorker(boss: PgBoss) {
  return boss.work(
    "stripe-event",
    { teamSize: 3, teamConcurrency: 3 },        // D-14: concurrency=3
    async ([job]) => {
      const { eventId } = job.data as { eventId: string };
      const db = getDb();

      const row = await db
        .select()
        .from(schema.webhookEvents)
        .where(
          and(
            eq(schema.webhookEvents.provider, "stripe"),
            eq(schema.webhookEvents.externalId, eventId),
          ),
        )
        .limit(1)
        .then((r) => r[0]);
      if (!row) return;

      if (row.processedAt) return;              // already done (D-23 replay test scenario)

      const event = JSON.parse(row.payloadRaw) as Stripe.Event;
      const reducer = reducers[event.type as keyof typeof reducers];
      if (!reducer) {
        // Unhandled type — log and mark processed so it doesn't replay
        await db
          .update(schema.webhookEvents)
          .set({ processedAt: new Date().toISOString() })
          .where(eq(schema.webhookEvents.id, row.id));
        return;
      }

      // CRITICAL: reducer + processedAt update in SINGLE transaction (WEB-06)
      await db.transaction(async (tx) => {
        await reducer(event, tx, stripe);
        await tx
          .update(schema.webhookEvents)
          .set({ processedAt: new Date().toISOString() })
          .where(eq(schema.webhookEvents.id, row.id));
      });
    },
  );
}
```

**Reducer 1 — `checkout-session-completed.ts` (STR-03):**

```typescript
// Source: Stripe Fulfill Orders pattern (https://docs.stripe.com/checkout/fulfillment) +
// PITFALL #2 (refetch from Stripe — don't trust payload)
export async function checkoutSessionCompleted(
  event: Stripe.Event,
  tx: TX,
  stripe: Stripe,
) {
  const session = event.data.object as Stripe.Checkout.Session;

  // REFETCH for current state (WEB-06)
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price.product", "customer"],
  });

  const customerId = typeof fullSession.customer === "string"
    ? fullSession.customer
    : fullSession.customer?.id;
  if (!customerId) return;                      // no-customer session — Connect onboarding etc

  // 1. Upsert stripe_customers
  await tx
    .insert(schema.stripeCustomers)
    .values({
      id: customerId,
      stripeCustomerId: customerId,
      memberId: fullSession.metadata?.memberId ?? null,    // set by Checkout link generation
      rawJson: JSON.stringify(fullSession.customer),
    })
    .onConflictDoNothing({ target: schema.stripeCustomers.stripeCustomerId });

  // 2. Insert payment row (idempotency: UNIQUE (stripe_payment_intent_id))
  const paymentIntentId =
    typeof fullSession.payment_intent === "string"
      ? fullSession.payment_intent
      : fullSession.payment_intent?.id;
  if (paymentIntentId) {
    await tx
      .insert(schema.payments)
      .values({
        id: `pay_${paymentIntentId}`,
        memberId: fullSession.metadata?.memberId ?? null,
        stripePaymentIntentId: paymentIntentId,
        amountMinorUnits: fullSession.amount_total ?? 0,
        currency: fullSession.currency ?? "usd",
        status: "succeeded",
        rawJson: JSON.stringify(fullSession),
        occurredAt: new Date(fullSession.created * 1000).toISOString(),
      })
      .onConflictDoNothing({ target: schema.payments.stripePaymentIntentId });
  }

  // 3. Grant pass if line item is a known pack product
  // (Demo: hardcoded product → 10-pack mapping; Production: products table in P2)
  for (const li of fullSession.line_items?.data ?? []) {
    const productId = typeof li.price?.product === "string"
      ? li.price.product
      : (li.price?.product as Stripe.Product)?.id;
    const passCredits = passCreditsForProduct(productId);    // helper: PRODUCT_ID → credits
    if (!passCredits) continue;

    await tx
      .insert(schema.passes)
      .values({
        id: `pass_${paymentIntentId}_${li.id}`,    // deterministic — replay-safe
        memberId: fullSession.metadata?.memberId,
        granted: passCredits,
        source: "purchase",
        stripeChargeId: paymentIntentId,
        productName: li.description ?? "pack",
        expiresAt: null,
      })
      .onConflictDoNothing();
  }
}
```

**Reducer 6 — `charge-refunded.ts` (STR-06):**

```typescript
// Source: STR-06 + DB-04 ledger pattern (refund = negative pass_debits)
export async function chargeRefunded(event: Stripe.Event, tx: TX, stripe: Stripe) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  // Find the pass(es) granted by this payment
  const passes = await tx
    .select()
    .from(schema.passes)
    .where(eq(schema.passes.stripeChargeId, paymentIntentId));

  for (const pass of passes) {
    // Insert NEGATIVE debit (ledger pattern — DB-04, established in D1-02 SUMMARY)
    await tx
      .insert(schema.passDebits)
      .values({
        id: `pdebit_refund_${charge.id}_${pass.id}`,  // deterministic — replay-safe
        passId: pass.id,
        amount: -pass.granted,                         // reverse the grant
        reason: "stripe_refund",
      })
      .onConflictDoNothing();
  }

  // Mark payment as refunded
  await tx
    .update(schema.payments)
    .set({ status: "refunded" })
    .where(eq(schema.payments.stripePaymentIntentId, paymentIntentId));
}
```

**Other reducers follow the same shape:**
- `invoice.paid` → upsert `stripe_subscriptions` (status, current_period_end) + insert/update `payments` row
- `invoice.payment_failed` → update `stripe_subscriptions.status` to 'past_due' + insert payment row with status='failed' (no NOTIF-02 enqueue — that's P2)
- `customer.subscription.updated` → upsert `stripe_subscriptions` from event.data.object (use event.created for last-write-wins)
- `customer.subscription.deleted` → set `stripe_subscriptions.status='canceled'` + `ended_at=now()`

### Pattern 4: pg-boss on Neon — UNPOOLED Connection (CRITICAL)

**What:** pg-boss is the queue. It runs in the same Neon Postgres database as the application schema. It auto-creates a `pgboss` schema with its own tables (`job`, `archive`, `version`, `subscription`, etc.) on first `boss.start()`. **It MUST connect via the UNPOOLED Neon endpoint** (no `-pooler` suffix on hostname) because:

1. pg-boss uses **LISTEN/NOTIFY** for fast job pickup (not just polling)
2. pg-boss uses **advisory locks** to coordinate workers across machines
3. pg-boss uses **prepared statements** for its hot path

All three are broken by PgBouncer transaction-mode pooling (which is what Neon's `-pooler` endpoint uses).

**Connection budget:** Neon free tier / 0.25 CU has `max_connections ≈ 112`. pg-boss default pool of 5-10 + Drizzle's separate WS pool (5-10) = safe.

**Example — `apps/worker/src/boss.ts`:**

```typescript
// Source: pg-boss docs (timgit.github.io/pg-boss) + Neon connection-method guide
import PgBoss from "pg-boss";

let _boss: PgBoss | undefined;

export function getBoss(): PgBoss {
  if (_boss) return _boss;

  // CRITICAL: use the UNPOOLED Neon endpoint. The DATABASE_URL in .env.local
  // currently has `-pooler` in the hostname — we need a SEPARATE env var for the
  // direct endpoint, named DATABASE_URL_UNPOOLED.
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED required for pg-boss");
  if (url.includes("-pooler")) {
    throw new Error(
      "DATABASE_URL_UNPOOLED must NOT include the -pooler hostname suffix",
    );
  }

  _boss = new PgBoss({
    connectionString: url,
    max: 10,                                  // pool size
    schema: "pgboss",                         // default; explicit for clarity
    retentionDays: 7,                         // archive completed jobs after 7d
    archiveCompletedAfterSeconds: 3600,       // archive 1h after success
    deleteAfterDays: 30,                      // delete archived rows after 30d
    // monitorStateIntervalSeconds: 30,        // emit state stats every 30s for /healthz
  });

  return _boss;
}
```

**Worker entrypoint (`apps/worker/src/index.ts`):**

```typescript
import { getBoss } from "./boss.js";
import { registerOutboundWhatsAppWorker } from "./queues/outbound-whatsapp.js";
import { registerInboundWhatsAppWorker } from "./queues/inbound-whatsapp.js";
import { registerStripeEventWorker } from "./queues/stripe-event.js";
import { registerHousekeeping } from "./queues/housekeeping.js";

const boss = getBoss();

boss.on("error", (err) => console.error("pgboss error", err));

await boss.start();                           // auto-creates pgboss.* schema
await registerOutboundWhatsAppWorker(boss);
await registerInboundWhatsAppWorker(boss);
await registerStripeEventWorker(boss);
await registerHousekeeping(boss);             // daily template-sync cron

// Tiny admin HTTP for Fly health checks
import { serve } from "@hono/node-server";
import { Hono } from "hono";
const admin = new Hono();
admin.get("/healthz", (c) => c.json({ ok: true, version: process.env.GIT_SHA }));
serve({ fetch: admin.fetch, port: 3002 });
```

**Publisher (`packages/queue/src/publish.ts`):**

```typescript
import { getBoss } from "./boss.js";
import { z } from "zod";

const OutboundWhatsAppPayload = z.object({
  messageId: z.string(),
  memberId: z.string(),
  payload: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), body: z.string() }),
    z.object({
      type: z.literal("template"),
      name: z.string(),
      vars: z.record(z.string(), z.string()),
    }),
  ]),
});

export async function enqueueOutboundWhatsApp(args: z.input<typeof OutboundWhatsAppPayload>) {
  const data = OutboundWhatsAppPayload.parse(args);
  const boss = getBoss();
  return boss.send("outbound-whatsapp", data, {
    singletonKey: `outbound-whatsapp:${data.messageId}`,    // D-13
    retryLimit: 3,
    retryBackoff: true,
    expireInSeconds: 60,                                     // PITFALL #20
  });
}

// Similar shape for enqueueStripeEvent, enqueueInboundWhatsApp, enqueueClassReminder (stub)
```

### Pattern 5: Ordinal-Guarded Status Updates (WA-04)

**What:** WhatsApp status webhooks (sent/delivered/read/failed) arrive out-of-order and at-least-once. Each status has an ordinal rank. UPDATE only when `new_status > current_status`.

```typescript
// Source: PITFALL #11 — ordinal-guarded UPDATE never downgrades
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,                                  // failed terminal — but allow downgrade if 'sent' then 'failed' later? Treat failed as max.
};

export async function applyStatusUpdate(
  db: DB,
  externalId: string,                          // wamid
  newStatus: "sent" | "delivered" | "read" | "failed",
  timestamp: string,
) {
  const newRank = STATUS_RANK[newStatus];
  // Single SQL UPDATE with rank guard — no read-modify-write race
  await db.execute(sql`
    UPDATE messages
    SET status = ${newStatus},
        ${newStatus === "delivered" ? sql`delivered_at = ${timestamp},` : sql``}
        ${newStatus === "read" ? sql`read_at = ${timestamp},` : sql``}
        ${newStatus === "sent" ? sql`sent_at = ${timestamp},` : sql``}
        updated_at = NOW()
    WHERE external_id = ${externalId}
      AND CASE status
            WHEN 'queued' THEN 0
            WHEN 'sent' THEN 1
            WHEN 'delivered' THEN 2
            WHEN 'read' THEN 3
            WHEN 'failed' THEN 4
            ELSE -1
          END < ${newRank}
  `);
}
```

### Anti-Patterns to Avoid

- **Parsing JSON before HMAC verify.** PITFALL #9. Re-stringify destroys the signature. Demo's code already does it right (`await request.text()` first); preserve this in the Hono port.
- **Vercel functions for webhooks.** PITFALL #8. Already designed against — Fly with `min_machines=1`.
- **`drizzle-kit push` against Neon.** Guard exists (`scripts/guard-no-drizzle-push.mjs`). PITFALL #15.
- **Trusting the Stripe event payload.** WEB-06. ALWAYS refetch via `stripe.X.retrieve(id)` in the reducer.
- **Using `@neondatabase/serverless` for pg-boss.** It's a WebSocket driver for HTTP-tunneled SQL — pg-boss reads `pg.Client` events directly. Use the standard `pg` driver.
- **Calling `packages/whatsapp/` from `apps/staff-web/`.** D-11. Worker is the only caller. Enforce by NOT adding `@gymos/whatsapp` to `apps/staff-web/package.json`.
- **`drizzle-kit push` for VIEW creation.** Drizzle Kit doesn't auto-generate `CREATE VIEW` from declared views consistently — use a custom SQL migration (`drizzle-kit generate --custom`) for the `whatsapp_window_state` VIEW.
- **One Stripe webhook per event type.** Anti-pattern #7 in ARCHITECTURE.md. ONE endpoint `/webhooks/stripe`; dispatch in the worker.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripe webhook HMAC verify | Hand-rolled `crypto.createHmac('sha256', secret).update(rawBody)` | `stripe.webhooks.constructEvent(raw, sig, secret)` | Stripe rotates signature schemes (sha256, future versions); SDK handles. Tolerance window for clock skew. |
| Postgres-backed job queue | Custom INSERT + SKIP LOCKED + cron table | **pg-boss** | Battle-tested. Handles LISTEN/NOTIFY, retries, backoff, archival, singletonKey, cron, dead letter. v12 line is stable. |
| WhatsApp Graph API client | Fetch wrappers with manual auth + retry | **`@great-detail/whatsapp` behind a thin adapter** | Already wraps Cloud API v23 quirks. Adapter (D-09) makes swap to hand-rolled a one-file change if maintainer goes silent. |
| Webhook idempotency | In-memory Set, Redis SET NX, Vercel KV | **`webhook_events` PK on `(provider, external_id)` with `ON CONFLICT DO NOTHING`** | DB is source of truth; no extra service; replays free. |
| Stripe API client | Raw HTTP fetch | **Stripe Node SDK** (`stripe` package) | Auto-pagination, idempotency-key headers, typed types matching `apiVersion`. |
| Column encryption | Application-level AES with custom KDF | **pgcrypto `pgp_sym_encrypt(value, master_key)`** | Used inside same TX as read. Audit log via same DB. Master key in Fly Secrets. |
| 24h-window check | "Set a cron to clear stale flags" | **Pure function `differenceInHours(now, lastInboundAt) >= 24`** | Stateless. Always-fresh from `conversations.last_inbound_at`. Pure = trivially testable. |
| Webhook signature for WhatsApp | Hand-rolled timing-safe compare | **`@great-detail/whatsapp`'s `event.verifySignature(appSecret)`** OR keep the demo's `crypto.timingSafeEqual` pattern (which is correct — port unchanged) | Either is acceptable; SDK version is more defensive about edge cases. |

**Key insight:** Every problem in this phase has a single canonical solution that exists in the ecosystem. The only thing GymClassOS writes by hand is the BUSINESS LOGIC inside the gates + reducers. Don't recreate plumbing.

## Runtime State Inventory

This is a refactor phase (Task 1: `templates/mail/` → `apps/staff-web/`) AND a webhook URL flip. Both have runtime-state implications.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (a) `webhook_events` table has demo rows from D2-02 inbound test — their PK is `whatsapp:<wamid>` text format. (b) `conversations.last_inbound_at` is populated from demo. (c) `messages` has demo rows including outbound demo-stub sends (status='sent' but no real Meta `external_id`). | (a) Keep demo rows — additive migration adds `external_id` column with `NULL` allowed; backfill not required (the dedup constraint kicks in for new events only). (b) No action — last_inbound_at is the source of truth the window gate reads. (c) No action — demo stubs already have status='sent' which is terminal. New schema's `external_id UNIQUE` column should be NULLABLE to accommodate these. |
| **Live service config** | (a) Meta Business Manager webhook URL currently points at the ngrok tunnel for `templates/mail/app/routes/webhooks.whatsapp.tsx`. (b) Stripe dashboard webhook endpoint NOT YET registered (D1-03 paused — STRIPE_SECRET_KEY pending). (c) Neon project `gymos-demo` is in `us-east-1` region (verified via .env.local hostname). | (a) **At cutover (last task of P1b):** flip Meta webhook URL from ngrok → `https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp`. Update verify_token if rotated. Test with Meta's "Send test webhook" before flipping. (b) Register Stripe webhook endpoint pointing at `https://gymos-edge-webhooks.fly.dev/webhooks/stripe` with the 6 event types selected; copy whsec into Fly Secrets. (c) **Re-evaluate Fly region** — lhr ⇄ us-east-1 RTT is ~75-90ms. Options: (i) deploy Fly to `iad` (us-east-1's Fly-region equivalent); (ii) migrate Neon to eu-west-1 (requires `neonctl project create` in new region + dump/restore — non-trivial); (iii) accept the latency for v1 and revisit. Recommend (i) for P1b speed. |
| **OS-registered state** | (a) ngrok tunnel currently running (D2-02 demo). (b) No Windows Task Scheduler / pm2 / launchd entries — agent-native uses Vite dev server only. (c) No Fly Machines deployed yet (apps/ doesn't exist). | (a) Kill ngrok tunnel as part of cutover (D-05 sequence). (b) No action. (c) `fly launch` creates Machines at first deploy; `min_machines = 1` per WEB-01. |
| **Secrets and env vars** | (a) `templates/mail/.env.local` contains `DATABASE_URL` (pooled), `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. (b) `STRIPE_SECRET_KEY` MISSING (D1-03 blocker). (c) No `DATABASE_URL_UNPOOLED` — must be added for pg-boss. (d) No `STRIPE_WEBHOOK_SECRET` — generated at Stripe dashboard webhook registration. (e) No `PGCRYPTO_MASTER_KEY` — Fly Secret for `pgp_sym_encrypt`. | (a) **Move env vars** from `templates/mail/.env.local` → `apps/staff-web/.env.local` AND set as Fly Secrets for `apps/edge-webhooks` + `apps/worker`. (b) Add `STRIPE_SECRET_KEY=sk_test_…` to all three apps when P0 / D1-03 unblocks; for P1b use a fresh test key. (c) **ADD `DATABASE_URL_UNPOOLED`** to edge-webhooks + worker Fly Secrets (this is the no-`-pooler` variant of the existing DATABASE_URL). (d) Generate at Stripe dashboard, set as Fly Secret. (e) Generate a 32-byte random key, set as Fly Secret on edge-webhooks + worker + staff-web (rotation UI reads it). |
| **Build artifacts / installed packages** | (a) `node_modules/` under templates/mail/ is symlinked into pnpm workspace — moving `templates/mail/` → `apps/staff-web/` requires `pnpm install` at root after the move. (b) `templates/mail/server/db/migrations/0000_late_professor_monster.sql` references SQLite syntax (`datetime('now')`, `INTEGER DEFAULT 1`) — production Neon uses Postgres. **This is a latent issue: the demo's migration file is SQLite-flavored but `agent-native/core` `createDrizzleConfig` switches dialect at runtime via DATABASE_URL detection.** The actual Neon schema was created via `mcp__Neon__run_sql_transaction` (per STATE.md D0.4), bypassing the SQLite migration. (c) No compiled binaries; no Docker images built yet. | (a) After the move, `git mv` for history preservation, then `pnpm install` at root. (b) **P1b's additive migration MUST be Postgres-flavored.** Use `drizzle-kit generate` with `DATABASE_URL=<neon url>` set so Drizzle Kit emits PG syntax (`TIMESTAMP DEFAULT NOW()`, `BOOLEAN`, etc.). Test against the Neon `test` branch before running on `gymos-demo`. (c) `Dockerfile` for both Fly apps; can share a single multi-stage Dockerfile in repo root if both apps use the same Node 22 + pnpm base. |

**Canonical answer:** After Task 1 (the refactor), every existing demo route still works because (a) the routes moved files, not URLs, and (b) `templates/mail/` becomes upstream-clean (no GymClassOS code there to break). After P1b cutover, the only "old string" still cached at runtime is **the ngrok URL in Meta Business Manager** — which gets flipped as the last P1b task.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All three apps | ✓ (assumed; agent-native requires 20+) | Need **22+** for `@great-detail/whatsapp` v9 | — (hard requirement) |
| pnpm | Workspace | ✓ | 10.29.1 (per STATE.md) | — |
| Neon Postgres | All three apps + pg-boss | ✓ | Postgres 16 in `gymos-demo` project | — |
| Neon `pgcrypto` extension | Stripe key encryption (STR-01) | ✗ NOT YET ENABLED | n/a | `CREATE EXTENSION IF NOT EXISTS pgcrypto;` in the P1b migration's pre-step (Neon supports it natively) |
| Fly.io CLI (`flyctl`) | Deploy edge-webhooks + worker | ⚠ Unknown — may need install | — | Install per-machine: `iwr https://fly.io/install.ps1 \| iex` on Windows |
| Fly.io account + org | Deploy | ⚠ Customer/dev unknown if account exists | — | `fly auth signup` (free; one-machine cost is $5/mo) |
| Stripe CLI | Local webhook testing + replay-twice tests | ⚠ Unknown | — | Install: `scoop install stripe` or download from stripe.com/docs/stripe-cli |
| Stripe test mode account | All testing | ✓ (assumed — generic test keys) | — | Use `sk_test_*` from any Stripe account; webhooks against `https://gymos-edge-webhooks.fly.dev/webhooks/stripe` |
| Meta dev sandbox | WhatsApp integration tests | ✓ (per D-25 — existing from D2-02 demo) | — | — |
| `@great-detail/whatsapp` v9 | `packages/whatsapp/` adapter | ⚠ npm fetch — not yet installed | 9.0.0 (verified) | Hand-rolled fetch to Graph API v23 (one-file fallback per D-09) |
| Docker / Docker Desktop | Building Fly images locally | Optional — Fly builds remotely by default | — | `fly deploy --remote-only` (recommended) — no local Docker needed |
| pg-boss | Queue infrastructure | ⚠ Not yet installed | 12.18.x | None — pg-boss IS the queue. (BullMQ + Redis would require Redis service.) |

**Missing dependencies with no fallback:**
- Fly.io account if not already created — blocks deploy.
- Node 22+ on the developer machine — blocks local `pnpm install` of `@great-detail/whatsapp` v9.

**Missing dependencies with fallback:**
- pgcrypto: just `CREATE EXTENSION` in migration. Neon supports it.
- Stripe CLI: only needed for local replay tests; production webhooks come from Stripe directly.

## Common Pitfalls

### Pitfall 1: pg-boss against the pooled Neon endpoint

**What goes wrong:** Set `DATABASE_URL` to the `-pooler.us-east-1.aws.neon.tech` host; pg-boss connects; `boss.start()` runs schema migration; first `boss.send()` works; first `boss.work()` callback fires inconsistently OR silently fails because LISTEN/NOTIFY is dropped. Advisory locks return ERROR. Prepared statements throw "prepared statement does not exist."

**Why it happens:** Neon's `-pooler` endpoint runs PgBouncer in transaction mode. PITFALL #10 in research/PITFALLS.md covers this for application queries — but pg-boss specifically uses three pooler-incompatible features.

**How to avoid:** Use the UNPOOLED endpoint. Add `DATABASE_URL_UNPOOLED` env var (strip `-pooler` from the hostname of the existing DATABASE_URL). Guard in `boss.ts`: throw if `url.includes("-pooler")`.

**Warning signs:** Jobs enqueued but never processed. `pgboss.job` rows with `state='created'` piling up. ERRORs in worker logs mentioning "prepared statement" or "lock".

### Pitfall 2: Fly region `lhr` + Neon region `us-east-1` (cross-Atlantic latency)

**What goes wrong:** Each DB query in the webhook hot path pays ~75-90ms RTT. The receiver's INSERT INTO webhook_events + 200 OK now lives within a tight budget (Stripe expects <5s, Meta <20s). Per-request budget is fine, but the worker's processing — which makes 3-10 DB calls per job — slows to seconds-per-job. UI loaders on staff-web call the same DB across the Atlantic; perceived lag.

**Why it happens:** D-02 locked `lhr` based on customer's UK location. The Neon project lives in us-east-1 (created during D0 without region awareness — STATE.md D0.3 doesn't specify region; the .env.local URL exposes it).

**How to avoid:** Three options at planning time:
1. **Deploy Fly to `iad`** (us-east-1's Fly counterpart). Customer's phone-to-Meta latency is uniform globally (Meta is multi-region); only Meta-to-webhook latency increases from ~10ms (lhr→Meta-EU) to ~80ms (iad→Meta-EU). Acceptable.
2. **Migrate Neon to eu-west-1.** `neonctl project create --region-id aws-eu-west-1` + pg_dump/pg_restore from us-east-1 → eu-west-1. ~30 min of work + small data risk during cutover. Best long-term.
3. **Accept current setup.** Add to a "tech-debt" log; revisit if metrics flag.

Recommend **Option 1** for P1b speed; **Option 2** during P0 cutover when production credentials swap. Flag as Open Question — needs user decision.

### Pitfall 3: Stripe `apiVersion` left to float

**What goes wrong:** Stripe rolls a new default API version. Your existing event handlers receive subtly different payload shapes. Tests still pass against old fixtures; production silently mis-parses.

**Why it happens:** `new Stripe(key)` without `apiVersion` uses your account's default, which Stripe can upgrade automatically.

**How to avoid:** Pin `apiVersion: "2026-04-22.dahlia"` in every `new Stripe()` constructor. Use `--save-exact` for the `stripe` package version. Test fixtures captured at this version live in `tests/fixtures/stripe/`.

### Pitfall 4: Stripe event mutation between webhook receipt and processing

**What goes wrong:** Stripe webhook delivers event A; before worker processes it, a related state change occurs in Stripe (subscription got updated again). Worker reduces stale data.

**Why it happens:** Webhook payload is a snapshot. Asynchronous processing means time elapses.

**How to avoid:** WEB-06 + PITFALL #2 — every reducer REFETCHES via `stripe.X.retrieve(id)`. Treat webhook as a "something happened" trigger, not source of truth.

### Pitfall 5: Re-enqueue storm during cutover

**What goes wrong:** Meta retries the same wamid for up to 7 days. If demo's `templates/mail/webhooks.whatsapp.tsx` AND `apps/edge-webhooks/whatsapp.ts` are BOTH live during parallel-run (D-04), both write to `webhook_events`. The constraint catches it — but if the schema migration hasn't run yet, the demo's text-PK and the new composite-key collide unpredictably.

**Why it happens:** Two endpoints, one DB.

**How to avoid:** Sequence the cutover as: (a) migration runs FIRST (additive UNIQUE constraint + new columns) → (b) deploy edge-webhooks to NEW Fly URL → (c) Meta still pointed at ngrok → (d) test edge-webhooks via Stripe CLI + manual curl → (e) flip Meta URL → (f) wait 30s → (g) delete ngrok endpoint AND `templates/mail/app/routes/webhooks.whatsapp.tsx` (last P1b task per D-05).

### Pitfall 6: Drizzle's SQLite-flavored migration file vs Neon Postgres

**What goes wrong:** The existing `templates/mail/server/db/migrations/0000_late_professor_monster.sql` uses SQLite syntax (`datetime('now')`, INTEGER booleans). Running it against Postgres fails. P1b's new migration generated against same schema may inherit dialect confusion.

**Why it happens:** `createDrizzleConfig()` detects dialect from DATABASE_URL but the schema.ts uses `now()` from `@agent-native/core/db/schema` (a shim). The demo's schema was applied via raw SQL through MCP Neon, not Drizzle Kit.

**How to avoid:** Before generating the P1b migration, verify the existing schema state against Neon directly:
```bash
DATABASE_URL=<neon-direct-url> pnpm drizzle-kit introspect-pg
```
Compare with `schema.ts`. If drift, write a SQL pre-migration that reconciles. Then `drizzle-kit generate` for the additive changes only. Use `drizzle-kit generate --custom` for the VIEW + CHECK constraints + pgcrypto extension setup.

### Pitfall 7: Missing `external_id` backfill on existing webhook_events rows

**What goes wrong:** Migration adds `external_id` column + UNIQUE (provider, external_id) constraint. Existing demo rows have NULL external_id. UNIQUE on NULL allows multiple NULLs in Postgres — fine for the constraint, but the new code expects to read `external_id` and falls through to error paths.

**Why it happens:** The demo's `id` column is `whatsapp:<wamid>` — the wamid is embedded. New code wants it as a column.

**How to avoid:** In the same migration, backfill: `UPDATE webhook_events SET external_id = SUBSTRING(id FROM POSITION(':' IN id) + 1) WHERE external_id IS NULL;`. Then enforce NOT NULL on new column (or leave nullable for safety — UNIQUE works either way).

### Pitfall 8: Fly Secrets vs `.env.local` confusion

**What goes wrong:** Dev sets `WHATSAPP_APP_SECRET` in `apps/edge-webhooks/.env.local`; works locally; doesn't work in production because Fly only reads `fly secrets`.

**Why it happens:** Two env mechanisms.

**How to avoid:** Treat `.env.local` as dev-only. Production env = `fly secrets set` per app. Document in `apps/edge-webhooks/README.md` and `apps/worker/README.md`. CI step: validate that all required env vars are set via `fly secrets list`.

## Code Examples

### Existing demo HMAC verify (pattern to PRESERVE in port)

Source: `templates/mail/app/routes/webhooks.whatsapp.tsx` lines 52-67. This is **correct** — port to Hono unchanged:

```typescript
// RAW BODY FIRST — never request.json() before this
const raw = await request.text();              // → c.req.text() in Hono
const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
const expected =
  "sha256=" +
  crypto.createHmac("sha256", appSecret).update(raw).digest("hex");

const sigBuf = Buffer.from(sigHeader);
const expBuf = Buffer.from(expected);
if (
  sigBuf.length !== expBuf.length ||
  !crypto.timingSafeEqual(sigBuf, expBuf)
) {
  return new Response("Bad signature", { status: 401 });
}
```

### packages/whatsapp adapter — `sdk-impl.ts`

```typescript
// Source: @great-detail/whatsapp v9 API (GitHub README verified 2026-05-20)
import { SDK } from "@great-detail/whatsapp";

const sdk = new SDK({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
});

export async function sendText(args: { to: string; body: string }) {
  const result = await sdk.message.createMessage({
    phoneNumberID: process.env.WHATSAPP_PHONE_NUMBER_ID!,
    to: args.to,
    type: "text",
    text: { body: args.body },
  });
  return { messageId: result.messages[0].id };       // wamid
}

export async function sendTemplate(args: {
  to: string;
  name: string;
  vars: Record<string, string>;
  language?: string;
}) {
  const components = Object.values(args.vars).map((v) => ({
    type: "body",
    parameters: [{ type: "text", text: v }],
  }));
  const result = await sdk.message.createMessage({
    phoneNumberID: process.env.WHATSAPP_PHONE_NUMBER_ID!,
    to: args.to,
    type: "template",
    template: {
      name: args.name,
      language: { code: args.language ?? "en_US" },
      components,
    },
  });
  return { messageId: result.messages[0].id };
}

export function verifySignature(raw: string, signature: string, appSecret: string) {
  // Use @great-detail/whatsapp's verify if available, OR keep crypto.timingSafeEqual
  // from the demo (which is correct). Either path is fine — both end up at SHA-256 HMAC.
  const crypto = require("node:crypto");
  const expected = "sha256=" +
    crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}
```

### Schema additions (Drizzle, append to `apps/staff-web/server/db/schema.ts`)

```typescript
// Source: D-15 — single additive migration
import { table, text, integer, real, now } from "@agent-native/core/db/schema";

// WA-07: opt-in evidence
export const whatsappOptIn = table("whatsapp_opt_in", {
  memberId: text("member_id").primaryKey(),       // FK gym_members.id
  optedInAt: text("opted_in_at").notNull().default(now()),
  evidenceMessageId: text("evidence_message_id"),  // FK messages.id (inbound that triggered opt-in)
  evidencePayload: text("evidence_payload"),       // JSON of the inbound msg
  source: text("source", { enum: ["inbound_reply", "manual_admin", "import"] }).notNull(),
});

// WA-08: synced from Meta daily
export const whatsappTemplates = table("whatsapp_templates", {
  name: text("name").primaryKey(),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "paused", "disabled"],
  }).notNull(),
  category: text("category", { enum: ["utility", "marketing", "authentication"] }),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json").notNull(),       // raw Meta API response
  lastSyncedAt: text("last_synced_at").notNull().default(now()),
});

// STR-01 mirror
export const stripeCustomers = table("stripe_customers", {
  stripeCustomerId: text("stripe_customer_id").primaryKey(),
  memberId: text("member_id"),                              // nullable until matched
  rawJson: text("raw_json").notNull(),
  updatedAt: text("updated_at").notNull().default(now()),
});

// STR-04/05 mirror
export const stripeSubscriptions = table("stripe_subscriptions", {
  stripeSubscriptionId: text("stripe_subscription_id").primaryKey(),
  memberId: text("member_id").notNull(),
  status: text("status", {
    enum: ["active", "past_due", "canceled", "incomplete", "incomplete_expired", "trialing", "unpaid", "paused"],
  }).notNull(),
  planId: text("plan_id"),
  currentPeriodEnd: text("current_period_end"),
  rawJson: text("raw_json").notNull(),
  updatedAt: text("updated_at").notNull().default(now()),
});

// STR-03 + payments tracking
export const payments = table("payments", {
  id: text("id").primaryKey(),                              // `pay_<paymentIntentId>`
  memberId: text("member_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
  amountMinorUnits: integer("amount_minor_units").notNull(),
  currency: text("currency").notNull(),
  status: text("status", {
    enum: ["succeeded", "failed", "refunded", "pending"],
  }).notNull(),
  rawJson: text("raw_json").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

// STR-01: encrypted secret storage (pgcrypto)
export const secrets = table("secrets", {
  name: text("name").primaryKey(),                          // e.g. "stripe_restricted_key"
  ciphertext: text("ciphertext").notNull(),                 // pgp_sym_encrypt(value, master_key)
  updatedAt: text("updated_at").notNull().default(now()),
  lastUsedAt: text("last_used_at"),
});

// Extend webhook_events ADDITIVELY (D-17) — no rename, no drop
// In schema.ts, edit existing webhookEvents to ADD a column + later migration adds constraint:
export const webhookEvents = table("webhook_events", {
  id: text("id").primaryKey(),                              // existing — kept for compat
  provider: text("provider", { enum: ["stripe", "whatsapp"] }).notNull(),
  eventType: text("event_type").notNull(),
  externalId: text("external_id"),                          // NEW — nullable for existing rows
  payloadRaw: text("payload_raw").notNull(),
  receivedAt: text("received_at").notNull().default(now()),
  processedAt: text("processed_at"),
  error: text("error"),
});
// In custom migration SQL:
// ALTER TABLE webhook_events ADD COLUMN external_id TEXT;
// UPDATE webhook_events SET external_id = SUBSTRING(id FROM POSITION(':' IN id) + 1) WHERE external_id IS NULL;
// CREATE UNIQUE INDEX webhook_events_provider_external_id_unique ON webhook_events (provider, external_id);
```

### Window-state VIEW (custom SQL in migration, D-15 default)

```sql
-- Source: D-15 + D-20 — VIEW reads conversations.last_inbound_at + computes window state
CREATE OR REPLACE VIEW whatsapp_window_state AS
SELECT
  c.member_id,
  c.id AS conversation_id,
  c.last_inbound_at,
  CASE
    WHEN c.last_inbound_at IS NULL THEN false
    WHEN (NOW() - c.last_inbound_at::TIMESTAMPTZ) < INTERVAL '24 hours' THEN true
    ELSE false
  END AS in_window,
  CASE
    WHEN c.last_inbound_at IS NULL THEN NULL
    WHEN (NOW() - c.last_inbound_at::TIMESTAMPTZ) >= INTERVAL '24 hours' THEN 0
    ELSE EXTRACT(EPOCH FROM (
      (c.last_inbound_at::TIMESTAMPTZ + INTERVAL '24 hours') - NOW()
    )) / 3600.0
  END AS hours_left
FROM conversations c
WHERE c.channel = 'whatsapp';
```

### Stripe rotation flow (STR-01 + P1b success criterion #6)

```typescript
// Source: STR-01 + Stripe API account.retrieve for validity check
// New route: POST /api/admin/integrations/rotate-stripe-key
import Stripe from "stripe";
import { sql } from "drizzle-orm";

export async function action({ request }) {
  // TODO P1a: assertAccess('admin', userId)
  const fd = await request.formData();
  const newKey = fd.get("key") as string;
  if (!newKey?.startsWith("rk_")) {
    return { error: "Must be a restricted key (rk_...)" };
  }

  // 1. Validate against Stripe — uses the NEW key
  const probe = new Stripe(newKey, { apiVersion: "2026-04-22.dahlia" });
  try {
    const account = await probe.accounts.retrieve();
    // Optionally check account.id matches expected studio
  } catch (err) {
    return { error: "Stripe rejected the key — invalid or insufficient scopes" };
  }

  // 2. Atomic swap — encrypt and update in one statement
  const db = getDb();
  await db.execute(sql`
    INSERT INTO secrets (name, ciphertext, updated_at)
    VALUES (
      'stripe_restricted_key',
      pgp_sym_encrypt(${newKey}, ${process.env.PGCRYPTO_MASTER_KEY!}),
      NOW()
    )
    ON CONFLICT (name) DO UPDATE SET
      ciphertext = EXCLUDED.ciphertext,
      updated_at = EXCLUDED.updated_at;
  `);

  // 3. Audit log (P1a will formalise audit_log table; for now console)
  console.log(`[secrets] rotated stripe_restricted_key at ${new Date().toISOString()}`);

  return { ok: true };
}

// Reader (in apps/worker/src/lib/stripe.ts):
export async function getStripeKey(db): Promise<string> {
  const row = await db.execute(sql`
    SELECT pgp_sym_decrypt(ciphertext::bytea, ${process.env.PGCRYPTO_MASTER_KEY!}) AS key
    FROM secrets WHERE name = 'stripe_restricted_key'
  `);
  return row[0].key as string;
}
```

### fly.toml — two-process app (D-01)

```toml
# Source: fly.io/docs/launch/processes/ verified 2026-05-20
app = "gymos-edge-webhooks"
primary_region = "iad"                  # see Pitfall #2 — re-evaluate vs lhr

[build]
  dockerfile = "Dockerfile"             # shared Dockerfile at repo root or per-app

[env]
  NODE_ENV = "production"
  PORT = "3001"

[processes]
  web = "node dist/edge-webhooks/index.js"
  worker = "node dist/worker/index.js"

[[services]]
  protocol = "tcp"
  internal_port = 3001
  processes = ["web"]                   # ONLY web gets HTTP routing — worker has no port

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [services.concurrency]
    type = "requests"
    hard_limit = 200
    soft_limit = 100

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  processes = ["web"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  processes = ["worker"]

[deploy]
  # OPTIONAL: pg-boss schema migrate runs IDEMPOTENTLY inside boss.start() — no release_command needed
  # If we add a Drizzle migration step, use:
  # release_command = "node dist/migrate.js"

# CRITICAL — keep machine warm (PITFALL #8)
[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = false           # NEVER scale to zero — PITFALL #8
  auto_start_machines = true
  min_machines_running = 1             # WEB-01 requirement
  processes = ["web"]
```

### Dockerfile (shared, repo root) — two-app build

```dockerfile
# Source: pnpm workspace + Node 22 + Fly best practices
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/edge-webhooks/package.json apps/edge-webhooks/
COPY apps/worker/package.json apps/worker/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter "@gymos/edge-webhooks..." --filter "@gymos/worker..."

FROM deps AS build
COPY . .
RUN pnpm --filter @gymos/edge-webhooks build
RUN pnpm --filter @gymos/worker build

FROM base AS runtime
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/edge-webhooks/dist /repo/apps/edge-webhooks/dist
COPY --from=build /repo/apps/worker/dist /repo/apps/worker/dist
COPY --from=build /repo/packages /repo/packages
# fly.toml `[processes]` selects which entrypoint runs
CMD ["node", "apps/edge-webhooks/dist/index.js"]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ + Redis on Fly | pg-boss in Neon | 2026-05-17 (PROJECT.md decision) | One fewer service, one fewer secret, one fewer bill. Trade: less mature rate-limit primitives. Re-evaluate at >10k jobs/day. |
| Stripe Connect (OAuth platform model) | Stripe restricted-API-key per studio | 2026-05-17 | Studio owns merchant relationship. Cleaner per-tenant deploy. No application_fee mechanics. |
| Webhook receivers on Vercel | Always-on Fly machine | STACK.md baseline | Stable IP for Meta allowlist. No cold-start storms. PITFALL #8. |
| Meta's official `WhatsApp/WhatsApp-Nodejs-SDK` | `@great-detail/whatsapp` v9 maintained fork | Official SDK paused mid-2025 (Issue #31) | Continues Cloud API v23 tracking. Single-maintainer risk mitigated via thin adapter (D-09). |
| Drizzle 1.0-beta | Drizzle 0.45.x line | n/a (never adopt beta mid-ship) | Stability over features for a 2-month ship. |
| Stripe API version floating | `apiVersion: "2026-04-22.dahlia"` PINNED | Stripe's current pinned release | Replay-safe across SDK upgrades. |
| Single-process Fly app | `[processes] web + worker` in fly.toml | Fly's multi-process feature now production-grade | One image, two entrypoints, two scaling profiles. |

**Deprecated/outdated:**
- `templates/mail/app/routes/webhooks.whatsapp.tsx` — delete LAST in P1b (D-05).
- Demo's env-gated direct Meta call in `gymos.tsx` — replace with `enqueueOutboundWhatsApp()`.
- Demo's text-PK webhook_events (`whatsapp:<wamid>`) — kept for compat; new code uses composite UNIQUE.

## Open Questions

1. **Fly region: `lhr` vs `iad` (cross-region latency to Neon `us-east-1`)?**
   - What we know: Customer is UK; Neon project is us-east-1; lhr⇄us-east-1 ~75-90ms RTT.
   - What's unclear: How latency-sensitive is the staff-web UI on Vercel? Vercel auto-routes to nearest region; if user's browser is UK and Vercel function is us-east, that's ~80ms one hop and another ~80ms on each DB call — same penalty staff-web pays.
   - Recommendation: **Default to `iad`** for P1b (matches DB region; no cross-Atlantic on webhook hot path). At P0 cutover, consider migrating Neon to eu-west-1 + Fly to lhr if customer-facing latency is the priority. Add to STATE.md as a known open question.

2. **Should `packages/db/` be extracted in P1b?**
   - What we know: D-08 allows planner discretion. Three apps need the same schema. Current `apps/staff-web/server/db/schema.ts` + `index.ts` could be imported via workspace path mapping.
   - What's unclear: Whether circular imports emerge between `packages/queue/` (which references schema types for payload validation) and `apps/staff-web/server/db/`.
   - Recommendation: **Try without extracting first.** Import directly from `apps/staff-web/server/db/` via a workspace symlink. If TypeScript resolution gets ugly (`../../../apps/staff-web/server/db/schema`), refactor to `packages/db/` mid-phase.

3. **pgbouncer-incompatible vs pooled connection for the staff-web side?**
   - What we know: staff-web on Vercel uses `@neondatabase/serverless` (HTTP driver) — that's a different connection path and works fine on the pooled endpoint. Only pg-boss needs unpooled.
   - What's unclear: Whether `apps/edge-webhooks` (Fly, but does only INSERTs into `webhook_events` + pg-boss send) should use pooled (for cap-headroom) or unpooled (consistency with worker). Drizzle on Neon via WebSocket driver is fine on pooled OR unpooled.
   - Recommendation: edge-webhooks uses pooled (it's stateless inserts); worker uses unpooled (pg-boss requirement). Document in `apps/*/README.md`.

4. **`whatsapp_window_state` as VIEW vs materialised table?**
   - What we know: D-15 default = VIEW.
   - What's unclear: Performance under load. VIEW recomputes per query — for a conversation list with N=100 conversations, that's 100 NOW()-comparisons per page load. Cheap.
   - Recommendation: VIEW. Revisit only if profiling shows it dominates.

5. **Stripe `account.retrieve()` scope assertions in rotation flow?**
   - What we know: STR-01 lists required scopes: Products/Prices, Customers, Subscriptions, PaymentIntents, SetupIntents, Charges (read), Refunds, Webhooks (read).
   - What's unclear: How to assert these from a `restricted_keys.retrieve()` or `account.retrieve()` call. Stripe doesn't expose restricted-key scopes via API — only by trying to make a call.
   - Recommendation: Validate by making a known-required call (e.g., `customers.list({limit: 1})`). If it succeeds, scopes are adequate. Document in `apps/staff-web/server/routes/admin.tsx`.

6. **Vercel deploy of `apps/staff-web/` — netlify.toml vs vercel.json?**
   - What we know: `templates/mail/` currently has `netlify.toml` (per STATE.md D0.5 blocker). Vercel deploy never completed in demo.
   - What's unclear: Whether moving to `apps/staff-web/` + adding `vercel.json` + `NITRO_PRESET=vercel` Just Works for RR v7 framework mode (PITFALL #16 — Vercel × RR v7 middleware edge cases).
   - Recommendation: Verify with a hello-world deploy of `apps/staff-web/` to Vercel as part of Task 1's acceptance criteria. If middleware breaks, fall back to Netlify (`netlify.toml` already present — just rename). Both hosts support RR v7; pick the one whose deploy worked end-to-end.

## Sources

### Primary (HIGH confidence)

- `templates/mail/app/routes/webhooks.whatsapp.tsx` (inspected) — demo HMAC verify + idempotency pattern (already correct; preserve in port)
- `templates/mail/server/db/schema.ts` lines 100-326 (inspected) — existing GymClassOS schema; `webhookEvents` at 318
- `templates/mail/app/routes/gymos.tsx` lines 490-530 (inspected) — send action call site to refactor
- `templates/mail/server/plugins/auth.ts` (inspected) — `publicPaths` pattern; webhook bypass entry already exists at line 70
- `packages/core/src/db/create-get-db.ts` (inspected) — confirms agent-native uses `drizzle-orm/neon-serverless` (WebSocket) on Neon URLs
- `packages/core/src/db/drizzle-config.ts` (inspected) — confirms `drizzle-kit push` guard against Neon URLs
- `.planning/research/ARCHITECTURE.md` — Patterns 1-5; webhook → idempotency → queue → worker; sendMessage chokepoint; stripe reducer dispatch; ledger pattern
- `.planning/research/STACK.md` — pg-boss locked over BullMQ; Stripe direct restricted-key; `@great-detail/whatsapp` v9 (April 2026)
- `.planning/research/PITFALLS.md` — pitfalls 1, 2, 8, 9, 11, 17, 19, 20 (all directly relevant to P1b)
- `CLAUDE.md` + `AGENTS.md` — no-breaking-DB-changes guard, raw-body-first HMAC, optimistic-UI default
- Stripe webhook docs: `https://docs.stripe.com/webhooks/signature`, `https://docs.stripe.com/checkout/fulfillment`, `https://docs.stripe.com/api/events/types`
- Stripe SDK versioning: `https://docs.stripe.com/sdks/set-version` (verified `apiVersion: "2026-04-22.dahlia"` as latest pinned)
- Meta Cloud API webhooks: `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks`
- Hono raw-body: `https://hono.dev/docs/api/request#req-text`
- Fly.io processes: `https://fly.io/docs/launch/processes/` (verified two-process pattern + per-process `[[vm]]` + `processes` filter)
- Fly.io min-machines: `https://fly.io/docs/blueprints/resilient-apps-multiple-machines/`
- Neon connection strategy: `https://neon.com/docs/connect/choose-connection` (verified unpooled requirement for LISTEN/NOTIFY + advisory locks + prepared statements)
- Neon pgcrypto: `https://neon.com/docs/extensions/pgcrypto` (verified native support)
- `@great-detail/whatsapp` v9 README (inspected via GitHub): `sdk.message.createMessage()` shape + `event.verifySignature()` + Node 22+ requirement

### Secondary (MEDIUM confidence)

- pg-boss API (v12.18 via README + npm): `boss.start()`, `boss.send()`, `boss.work()`, `boss.schedule()`, `singletonKey`, `retryLimit`, `expireInSeconds` — verified via WebFetch of pg-boss GitHub; some option details inferred from typical PgBoss patterns. Full doc reference: `https://github.com/timgit/pg-boss/blob/master/docs/readme.md`
- pg-boss issue #381 (connection-terminated with serverless DBs) — resolution unclear; mitigation = use unpooled endpoint + min connection settings
- Vercel × React Router v7 (PITFALL #16) — known middleware edge cases; recommended verification via hello-world deploy

### Tertiary (LOW confidence — flagged for validation)

- Exact `apps/staff-web/server/` import path from `apps/edge-webhooks/` and `apps/worker/` without extracting `packages/db/` — needs to be validated when Task 1 lands and the workspace links resolve. Fallback: extract to `packages/db/`.
- Whether `@great-detail/whatsapp` v9's `event.verifySignature()` is signature-compatible with Meta's current `X-Hub-Signature-256` header format — assume yes (per README), but if the demo's hand-rolled crypto works, the safer path is to keep that code in the adapter rather than depend on the SDK's verifier.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every library has a single canonical choice, verified against agent-native code or 2026 ecosystem docs.
- Architecture (receiver → queue → worker → adapter): HIGH — already established in ARCHITECTURE.md; P1b is implementation, not redesign.
- Pitfalls: HIGH — all 8 pitfalls flagged are concrete and have known mitigations.
- pg-boss × Neon pooling: HIGH after research — DOCUMENTED that pg-boss needs unpooled endpoint.
- Fly region × Neon region mismatch: HIGH — verified Neon is us-east-1, lhr decision should be revisited.
- Stripe `apiVersion`: HIGH — `2026-04-22.dahlia` verified as current.
- `@great-detail/whatsapp` API surface: MEDIUM-HIGH — v9 README confirmed `sdk.message.createMessage()` shape; some helper-method details may shift in minor versions.
- Validation depth: HIGH — D-23 locked four scenarios + unit tests; planner adds Vitest scaffolding.

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (30 days for stable areas; 7 days for pg-boss and `@great-detail/whatsapp` which have monthly publish cadence).
