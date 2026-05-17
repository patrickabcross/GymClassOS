# Architecture Research — GymOS

**Domain:** Boutique fitness studio management platform (WhatsApp inbox + class schedule + Stripe + member CRM, with per-customer deploy)
**Researched:** 2026-05-17
**Confidence:** HIGH for component topology and webhook patterns (verified against Stripe, Hono, WhatsApp Cloud API, and agent-native sources); MEDIUM for the agent-native fork boundary (depends on Phase 0 audit findings); MEDIUM for per-deploy ops mechanics (validated against Fly + Vercel + Neon docs but unproven for this specific shape).

---

## The Three Architectural Decisions That Drive Everything Else

Before the diagrams, the three constraints from PROJECT.md that make this architecture different from a "standard SaaS":

1. **Single-tenant code, multi-tenant deploy.** No `studio_id` columns. One Neon project + one Vercel deploy + one Fly app per studio. The "tenant" lives in DNS and env vars, not in your SQL.
2. **agent-native is upstream, not a starter.** You're not writing a Mail app — you're forking one. The architecture must keep the agent-native layer mergeable while the GymOS-specific layer evolves.
3. **Webhooks (WhatsApp + Stripe) are first-class infrastructure, not a side route.** They have raw-body requirements, signature verification, idempotency requirements, and tight ack timeouts. They live in their own deployable, not as `apps/staff-web` routes.

Everything below follows from these three.

---

## Standard Architecture

### System Overview (Per Studio Deploy)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                EXTERNAL                                       │
│   ┌────────────────┐   ┌────────────────┐   ┌─────────────────────────────┐  │
│   │  Meta Cloud    │   │  Stripe        │   │  Customer's RN Mobile App   │  │
│   │  API (WA)      │   │  (Connect)     │   │  (post-v1)                  │  │
│   └───────┬────────┘   └───────┬────────┘   └──────────────┬──────────────┘  │
└───────────┼────────────────────┼────────────────────────────┼─────────────────┘
            │ inbound webhook    │ webhook events             │ HTTPS (Bearer)
            │ Graph API outbound │ API calls                  │
            ▼                    ▼                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      EDGE / WEBHOOK TIER (Fly.io app)                         │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  apps/edge-webhooks  (Hono, always-on Fly machine)                   │   │
│   │  - POST /webhooks/whatsapp   (verify HMAC, persist raw, enqueue)     │   │
│   │  - POST /webhooks/stripe     (constructEvent, persist raw, enqueue)  │   │
│   │  - GET  /webhooks/whatsapp   (Meta verify_token challenge)           │   │
│   │  - GET  /healthz                                                      │   │
│   └────────────┬────────────────────────────────────────────┬────────────┘   │
│                │ insert webhook_event (idempotency PK)      │                 │
│                │ enqueue BullMQ job                         │                 │
│                ▼                                            ▼                 │
└────────────────┼────────────────────────────────────────────┼─────────────────┘
                 │                                            │
                 │                            ┌───────────────┴──────────────┐
                 │                            │   Redis (Upstash on Fly)     │
                 │                            │   - BullMQ queues            │
                 │                            │   - rate-limit counters      │
                 │                            └───────────────┬──────────────┘
                 │                                            │
                 ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      WORKER TIER (Fly.io, same app)                           │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  apps/worker  (Node + BullMQ workers + tiny Hono admin surface)      │   │
│   │  Queues:                                                              │   │
│   │   - whatsapp-inbound       (parse messages, materialise threads)     │   │
│   │   - whatsapp-outbound      (24h-window gate, template gate, send)    │   │
│   │   - stripe-events          (reduce events → member/payment state)    │   │
│   │   - reminders              (scheduled class reminders, queue WA)     │   │
│   │   - housekeeping           (templates sync, KPI rollups)             │   │
│   └────────────┬───────────────────────────────────────────┬─────────────┘   │
│                │ writes via Drizzle (neon-serverless WS)   │                 │
└────────────────┼───────────────────────────────────────────┼─────────────────┘
                 │                                           │
                 │  ┌────────────────────────────────────────┴──────────────┐  │
                 │  │  Stripe Node SDK / @great-detail/whatsapp HTTP calls  │  │
                 │  └───────────────────────────────────────────────────────┘  │
                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DATA TIER                                        │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  Neon Postgres (1 project per studio)                                │   │
│   │   Tables (no studio_id):                                              │   │
│   │    - members, member_contacts, coaches, staff_users                  │   │
│   │    - conversations, messages, message_attachments                    │   │
│   │    - whatsapp_templates, whatsapp_window_state                       │   │
│   │    - class_definitions, class_sessions, bookings, waitlist           │   │
│   │    - passes, pass_debits (append-only ledger), pass_products         │   │
│   │    - stripe_customers, stripe_subscriptions, payments                │   │
│   │    - webhook_events (idempotency table — raw payload + processed_at) │   │
│   │    - audit_log (who-did-what for staff actions)                      │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
                 ▲
                 │ Drizzle (neon-http on Vercel; neon-serverless WS on Fly)
                 │
┌────────────────┴─────────────────────────────────────────────────────────────┐
│                     STAFF WEB TIER (Vercel, per-studio deploy)                │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  apps/staff-web  (React Router v7 framework mode + Better-auth)      │   │
│   │  Routes (loader = read; action = write):                              │   │
│   │   - /              (dashboard)                                        │   │
│   │   - /inbox        (WhatsApp client, adapted from agent-native Mail)  │   │
│   │   - /schedule     (class schedule, adapted from Calendar)            │   │
│   │   - /members      (member directory + profile + CRM)                 │   │
│   │   - /settings     (templates, Stripe Connect, integrations)          │   │
│   │  - Outbound WA sends go through action → enqueue (NOT direct send)   │   │
│   │  - All Stripe writes go through Stripe SDK (Stripe is source of      │   │
│   │    truth); webhook reconciles back                                   │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
                 ▲
                 │ HTTPS (Better-auth session cookie)
                 │
            ┌────┴────┐
            │  Staff  │
            │ Browser │
            └─────────┘
```

### Component Responsibilities

| Component | Owns (writes) | Reads | Talks To | Why It Exists |
|---|---|---|---|---|
| **`apps/staff-web` (Vercel)** | Drafts, staff actions, member CRM edits, schedule definitions, template metadata, settings | All read views | Postgres (Drizzle/neon-http), enqueues to Redis via internal API to worker | The staff-facing UI. Stateless. SSR via React Router v7. Serverless-friendly. |
| **`apps/edge-webhooks` (Fly)** | `webhook_events` rows (raw payload + dedupe key) | None (write-only at the receive boundary) | Postgres (insert-only), Redis (enqueue) | Two jobs: verify signatures with raw body; persist + enqueue within 200–500ms ack window. Owns NO domain state. |
| **`apps/worker` (Fly)** | Conversations, messages (inbound + outbound state machines), members (from Stripe events), bookings (from WA bot replies post-v1), pass_debits, payments | `webhook_events`, all domain tables | Postgres (Drizzle/neon-serverless WS), Stripe API, WhatsApp Cloud API | Every cross-system write goes through here. Idempotent by design. Owns the 24h-window enforcement gate. |
| **Neon Postgres** | (data tier) | — | — | Source of truth for everything *except* card data (Stripe) and content blobs (object storage if needed later). |
| **Redis (Upstash on Fly)** | BullMQ job state, rate-limit counters | — | — | Job queue persistence + retries + DLQ. Not durable customer data — if you lose Redis you replay from `webhook_events`. |
| **agent-native vendored packages** (`@agent-native/core`, copied templates) | NO runtime ownership | — | — | Provides framework primitives (auth, Drizzle config, UI components). Treated as a library. |

### Source-of-Truth Boundaries (Critical)

| Concern | Source of Truth | Local Cache/Mirror | Reconciliation |
|---|---|---|---|
| **Card data + customer/subscription IDs** | Stripe | `stripe_customers`, `stripe_subscriptions`, `payments` (mirrored from webhook events) | Stripe webhooks → worker → DB. NEVER write to these tables from the staff-web action layer. |
| **WhatsApp message delivery/read state** | Meta | `messages.delivery_status`, `messages.read_at` | Status webhooks → worker → DB. The send action enqueues; the worker updates on the API ack; status webhooks update further. |
| **Class/booking/pass state** | GymOS Postgres | (this is the only thing fully owned by you) | n/a — direct writes from staff-web actions or worker. |
| **Member identity (phone, name)** | GymOS Postgres, but seeded/updated by Stripe customer events for paying members | n/a | Stripe `customer.updated` events flow into the worker → upsert `members`. |
| **Template approval state** | Meta | `whatsapp_templates.status` | Worker housekeeping job pulls Meta's Template Management API daily; manual sync action available from settings. |

**Rule:** if a piece of data has an external source of truth, only the worker writes it locally. The staff-web app *reads* it but never *writes* it directly. This makes Stripe + WhatsApp webhook replay safe.

---

## Recommended Project Structure

```
gymos/                                  # fork of BuilderIO/agent-native
├── apps/                               # NEW — GymOS-specific deployables
│   ├── staff-web/                      # Vercel — React Router v7 SSR
│   │   ├── app/
│   │   │   ├── routes/                 # loader/action endpoints
│   │   │   │   ├── inbox/              # forked from agent-native Mail
│   │   │   │   ├── schedule/           # forked from agent-native Calendar
│   │   │   │   ├── members/            # GymOS-original
│   │   │   │   └── settings/           # GymOS-original
│   │   │   ├── components/             # GymOS-specific UI (composes agent-native primitives)
│   │   │   ├── features/               # business logic per surface
│   │   │   │   ├── whatsapp/           # send action, template picker, window check
│   │   │   │   ├── schedule/           # class CRUD, booking CRUD, capacity rules
│   │   │   │   ├── members/            # CRM read models, search
│   │   │   │   └── passes/             # pass balance read helpers
│   │   │   ├── lib/
│   │   │   │   ├── db.ts               # Drizzle client (neon-http)
│   │   │   │   ├── auth.ts             # Better-auth wrapper around runAuthGuard
│   │   │   │   ├── queue.ts            # BullMQ producer (publishes to Redis)
│   │   │   │   └── env.ts              # Zod-validated env contract
│   │   │   └── root.tsx
│   │   ├── react-router.config.ts
│   │   ├── vite.config.ts
│   │   ├── drizzle.config.ts           # delegates to @agent-native/core/db/drizzle-config
│   │   └── package.json
│   │
│   ├── edge-webhooks/                  # Fly.io — Hono receiver
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── whatsapp.ts         # GET (verify_token) + POST (HMAC verify, persist, enqueue)
│   │   │   │   └── stripe.ts           # POST (constructEvent, persist, enqueue)
│   │   │   ├── lib/
│   │   │   │   ├── db.ts               # Drizzle client (neon-serverless WS)
│   │   │   │   ├── queue.ts            # BullMQ producer
│   │   │   │   ├── idempotency.ts      # webhook_events insert-or-skip
│   │   │   │   └── env.ts
│   │   │   └── server.ts               # Hono app, bound to 0.0.0.0:3001
│   │   ├── Dockerfile
│   │   ├── fly.toml                    # services.internal_port=3001, hard ack timeout settings
│   │   └── package.json
│   │
│   └── worker/                         # Fly.io — BullMQ workers (can share Fly app with edge-webhooks)
│       ├── src/
│       │   ├── queues/
│       │   │   ├── whatsapp-inbound.ts # process verified webhook → materialise threads/messages
│       │   │   ├── whatsapp-outbound.ts # 24h-window gate, template gate, Graph send, persist ack
│       │   │   ├── stripe-events.ts    # reduce event → upsert mirrored state (member, sub, payment)
│       │   │   ├── reminders.ts        # class reminder scheduler (uses BullMQ delayed jobs)
│       │   │   └── housekeeping.ts     # template sync, KPI rollups, log shipping
│       │   ├── domain/                 # idempotent state-machine functions
│       │   │   ├── conversations.ts    # upsert thread, append message
│       │   │   ├── windows.ts          # 24h-window state machine
│       │   │   ├── passes.ts           # debit ledger logic (atomic balance check + insert)
│       │   │   └── stripe-reducers.ts  # one function per Stripe event type
│       │   ├── lib/
│       │   │   ├── db.ts               # Drizzle (neon-serverless WS)
│       │   │   ├── whatsapp.ts         # thin wrapper over @great-detail/whatsapp
│       │   │   ├── stripe.ts           # Stripe SDK client with pinned apiVersion
│       │   │   └── env.ts
│       │   └── index.ts                # boots workers; tiny Hono admin (GET /healthz, GET /metrics)
│       ├── Dockerfile
│       ├── fly.toml
│       └── package.json
│
├── packages/                           # SHARED across apps/* (still GymOS-specific)
│   ├── db/                             # Drizzle schema lives here ONCE
│   │   ├── schema/
│   │   │   ├── members.ts
│   │   │   ├── conversations.ts
│   │   │   ├── messages.ts
│   │   │   ├── classes.ts
│   │   │   ├── bookings.ts
│   │   │   ├── passes.ts
│   │   │   ├── stripe.ts
│   │   │   ├── whatsapp.ts             # templates + window_state
│   │   │   ├── webhook_events.ts       # idempotency table
│   │   │   └── audit.ts
│   │   ├── migrations/                 # output of drizzle-kit generate
│   │   └── index.ts                    # re-exports schema + a getClient(env) helper
│   ├── domain-types/                   # Zod schemas + branded types shared across apps
│   └── config/                         # shared env Zod schema (each app extends it)
│
├── templates/                          # UNTOUCHED fork from agent-native (DO NOT EDIT in-place)
│   ├── mail/                           # source for inbox copy-out
│   ├── calendar/                       # source for schedule copy-out
│   ├── content/                        # source for KB copy-out (post-v1)
│   ├── analytics/                      # source for reporting copy-out (post-v1)
│   └── calorie/                        # source for calorie counter copy-out (post-v1)
│
├── packages-vendored/                  # the @agent-native/* packages from upstream
│   └── core/                           # consumed via workspace: protocol; do NOT edit
│
├── pnpm-workspace.yaml                 # apps/*, packages/*, packages-vendored/*, templates/* (only if needed)
├── package.json                        # root scripts: dev:web, dev:worker, dev:edge, db:generate, db:migrate
├── .upstream-merge.md                  # CHECKLIST for merging from BuilderIO/agent-native
└── README.md
```

### Structure Rationale

- **`apps/`:** Each is a deployable artefact. Three apps × N studios = 3N deploys, but **the code is N=1**. Per-studio config differences are entirely env-var driven.
- **`packages/db/`:** Schema lives in ONE place — both Vercel (`staff-web`) and Fly (`edge-webhooks`, `worker`) import it. Migrations are generated from this single source. Avoids the agent-native trap of "schema fragmented across templates".
- **`templates/`:** Untouched. This is the upstream payload. You copy *out* of here into `apps/staff-web/app/routes/{inbox,schedule}/` and modify the copies. When you `git merge upstream/main`, conflicts land in `templates/` (where you can resolve them cleanly) — your copies in `apps/staff-web/` are unaffected by the merge.
- **`packages-vendored/`:** The `@agent-native/core` package (and any sibling packages from upstream you depend on). Consumed via pnpm workspace `workspace:*` protocol so your code says `import { runAuthGuard } from "@agent-native/core/server"` and it resolves locally. Never edit these files — patches go into your own wrapper modules in `apps/staff-web/app/lib/`.
- **`apps/edge-webhooks` and `apps/worker` may merge into one Fly app** with two processes in `fly.toml` (sharing the Dockerfile and image). Splitting into two Fly apps is also valid but doubles your operational surface. **Recommendation: single Fly app, two processes** (`web` for edge-webhooks, `worker` for workers). One Redis, one DB connection pool, one deploy command.

---

## The agent-native Fork Boundary

This is the single most important architectural rule for staying mergeable with upstream. **Three layers, three different edit policies:**

| Layer | Location | Edit policy | Merge behaviour |
|---|---|---|---|
| **Upstream vendored** | `packages-vendored/core/`, `templates/*/` | NEVER edit in place | `git merge upstream/main` lands cleanly here every time |
| **Upstream adapted** | `apps/staff-web/app/routes/{inbox,schedule}/`, copied from `templates/mail` and `templates/calendar` | Edit freely | Merges from upstream require *manual* re-application — track in `.upstream-merge.md` checklist |
| **GymOS-original** | `apps/edge-webhooks/`, `apps/worker/`, `packages/db/`, `packages/domain-types/`, `apps/staff-web/app/routes/{members,settings}/`, all `apps/staff-web/app/features/` | Edit freely | Unrelated to upstream merges |

**Mechanics:**

```bash
# Once at fork time:
git clone https://github.com/BuilderIO/agent-native gymos
cd gymos
git remote rename origin upstream
git remote add origin git@github.com:<you>/gymos.git
git checkout -b main
git push -u origin main

# Per upstream merge (do this monthly, not at the end):
git fetch upstream
git merge upstream/main          # conflicts land in templates/ and packages-vendored/
# resolve, run pnpm install, run tests, commit
# then: for each "upstream adapted" route, diff templates/* vs your apps/staff-web/app/routes/*
#       and cherry-pick relevant upstream changes manually
```

**Why this works:** the merge surface is small and confined (`templates/`, `packages-vendored/`). The high-churn area (`apps/`, `packages/`) is yours alone. The handful of GymOS-adapted routes have a documented manual reconciliation process — they're the cost of forking, paid in a few hours per upstream pull, not in re-engineering a framework.

**Future-proofing for vertical #2:** when you start the next vertical, this layer separation tells you what to extract. Anything in `packages/` that proved useful across both is a framework candidate. Until then, **do not pre-extract** (per PROJECT.md Key Decision).

---

## Architectural Patterns

### Pattern 1: Webhook Receiver → Idempotency Table → Worker Queue

**What:** External webhooks (WhatsApp inbound, Stripe events) are received by `apps/edge-webhooks`, verified, persisted to `webhook_events` (with the external event ID as the unique key), enqueued to BullMQ, then acked with 200 OK. The actual domain work happens in `apps/worker`.

**When to use:** Every external webhook. Without exception.

**Trade-offs:**
- ✅ Receiver completes in <100ms — stays within Meta's and Stripe's ack windows
- ✅ Idempotent by construction — duplicate events insert-conflict and skip
- ✅ Worker can be slow, can retry, can run business logic that takes seconds
- ✅ Disaster recovery: lose Redis? Replay un-`processed_at` rows from `webhook_events`
- ❌ Two-process latency: action-on-event is enqueue + worker pickup, not synchronous
- ❌ Requires Redis (the BullMQ alternative is pg-boss — see STACK.md trade-off)

**Example (edge-webhooks/src/routes/stripe.ts, sketch):**

```typescript
import { Hono } from "hono";
import Stripe from "stripe";
import { db } from "../lib/db";
import { webhookEvents } from "@gymos/db/schema";
import { stripeEventsQueue } from "../lib/queue";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-04-30" });

export const stripeRoutes = new Hono();

stripeRoutes.post("/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.text("missing signature", 400);

  // CRITICAL: raw body — c.req.raw, not c.req.json()
  const raw = await c.req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return c.text("invalid signature", 400);
  }

  // Insert-or-skip on event.id (unique constraint)
  const inserted = await db
    .insert(webhookEvents)
    .values({
      id: event.id,                // PK, unique → duplicate inserts fail
      source: "stripe",
      type: event.type,
      payload: raw,                // store raw for replay
      receivedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    // Already seen this event — Stripe is retrying. Ack and skip.
    return c.text("ok (dedup)", 200);
  }

  await stripeEventsQueue.add(event.type, { eventId: event.id });
  return c.text("ok", 200);
});
```

The same pattern applies to WhatsApp: verify HMAC with `event.verifySignature(appSecret)` from `@great-detail/whatsapp`, insert into `webhook_events` keyed by `entry[].changes[].value.messages[].id` (and/or `statuses[].id`), enqueue.

---

### Pattern 2: Outbound Send — Action → Queue → Worker → Send → Persist

**What:** Staff hits "Send" in the inbox UI. The React Router `action` does NOT call the WhatsApp API directly. It:
1. Persists a `messages` row with `delivery_status = 'queued'`
2. Enqueues an `outbound` job
3. Returns 200 to the UI optimistically

The worker then:
1. Locks the conversation
2. Re-checks the 24h-window state (DB authoritative — UI may be stale)
3. If outside window, checks the message is a pre-approved template (rejects otherwise)
4. Calls WhatsApp Cloud API
5. Updates `messages.delivery_status = 'sent'` and stores `wamid` (WhatsApp message ID)
6. Later, a `status` webhook flips `delivered` / `read` / `failed`

**When to use:** ALL outbound WhatsApp sends. Even "test send" from settings.

**Trade-offs:**
- ✅ UI latency stays under 200ms regardless of WhatsApp API latency
- ✅ Retries on transient failures (network, Meta rate-limit) are free via BullMQ
- ✅ 24h-window enforcement happens at the sender, not the UI — *cannot* be bypassed
- ✅ Audit log of every send attempt (the queued message row is the audit)
- ❌ Send "feels async" — staff click send and the dot doesn't immediately flip to "delivered". Solve in UI with delivery_status polling or SSE from the worker via a Postgres LISTEN/NOTIFY channel (the second is overkill for v1).

**The 24h-window enforcement gate** is non-negotiable per project constraints (Meta will suspend the number). It lives in `apps/worker/src/domain/windows.ts` as a pure function:

```typescript
// Pure, testable, deterministic
export function canSendFreeform(
  lastInboundAt: Date | null,
  now: Date,
): { allowed: boolean; reason?: "no_inbound" | "window_expired" } {
  if (!lastInboundAt) return { allowed: false, reason: "no_inbound" };
  const ageMs = now.getTime() - lastInboundAt.getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return { allowed: false, reason: "window_expired" };
  return { allowed: true };
}
```

The worker calls this before every send. If the result is "not allowed", the message must be a template send — and the worker validates against `whatsapp_templates.status = 'APPROVED'`.

---

### Pattern 3: Stripe Event Reducers (One Function Per Event Type)

**What:** Stripe events flow into a single worker queue. A dispatch table maps `event.type` → a reducer function. Each reducer is idempotent (uses `event.id` and/or the event's natural key) and updates the local mirror.

**When to use:** All Stripe webhook processing.

**Trade-offs:**
- ✅ Adding a new event type is a 1-file change
- ✅ Each reducer is independently testable with a captured Stripe event fixture
- ✅ Out-of-order replay is safe if every reducer is order-independent (use the event's `created` timestamp for last-write-wins on mirror fields)
- ❌ N reducer functions to maintain — but the alternative (one big switch) doesn't scale

**Example:**

```typescript
// apps/worker/src/domain/stripe-reducers.ts
const reducers = {
  "customer.created": async (e: Stripe.Event, db: DB) => { /* upsert member */ },
  "customer.updated": async (e: Stripe.Event, db: DB) => { /* upsert member */ },
  "checkout.session.completed": async (e, db) => { /* create payment row, grant pass */ },
  "invoice.paid": async (e, db) => { /* mark subscription as active */ },
  "customer.subscription.updated": async (e, db) => { /* mirror sub state */ },
  "customer.subscription.deleted": async (e, db) => { /* mark cancelled */ },
} as const;

export async function reduceStripeEvent(event: Stripe.Event, db: DB) {
  const reducer = reducers[event.type as keyof typeof reducers];
  if (!reducer) return; // unhandled type, log and move on
  await reducer(event, db);
  await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
}
```

---

### Pattern 4: Pass Debits as an Append-Only Ledger

**What:** A member's pass balance is NOT a mutable integer field. It's the difference between:
- pass grants (`passes` table — one row per "you bought 10 classes")
- pass debits (`pass_debits` table — append-only, one row per booking that consumed a class)

Current balance = `sum(passes.granted) - sum(pass_debits.amount)` for the relevant pass type.

**When to use:** Any time a finite resource is granted and consumed. Class passes, day passes, personal training credits.

**Trade-offs:**
- ✅ Full audit history (who used what, when, for which class) — trivially reportable
- ✅ Cancellation = insert a credit row (negative debit), not a balance edit
- ✅ Race-condition-safe: use `INSERT ... WHERE NOT EXISTS (... pre-check balance)` in a single statement (or wrap in a transaction with `SELECT ... FOR UPDATE` on the pass row)
- ❌ Reads require an aggregate query — denormalise into a `passes.remaining` cache column updated transactionally if reads dominate (v1 doesn't need this)

**Example booking flow:**

```typescript
// Inside a transaction:
//  1. SELECT pass with FOR UPDATE
//  2. Compute current balance = granted - sum(existing debits)
//  3. If balance <= 0, abort booking
//  4. INSERT booking row
//  5. INSERT pass_debits row referencing booking_id
//  6. COMMIT
```

This is the only domain area that genuinely needs transactional discipline in v1. Everything else (conversations, messages, Stripe mirrors) is upsert-based and inherently idempotent.

---

### Pattern 5: Per-Studio Env Var Contract (No In-DB Config)

**What:** All per-studio configuration lives in environment variables, validated at boot by a Zod schema. The Postgres DB has NO `settings` or `config` table for things that distinguish one studio from another — because there's only ever one studio per DB.

**When to use:** Every config knob that differs per customer.

**Per-deploy env vars (Zod-validated):**

```typescript
// packages/config/src/env.ts
export const sharedEnvSchema = z.object({
  // Identity
  STUDIO_SLUG: z.string(),              // for logging only
  STUDIO_TIMEZONE: z.string(),          // IANA, e.g. "Europe/London"
  STUDIO_DISPLAY_NAME: z.string(),
  STUDIO_PRIMARY_LOCALE: z.string().default("en-GB"),

  // Data tier
  DATABASE_URL: z.string().url(),       // Neon connection string

  // Redis (Fly only)
  REDIS_URL: z.string().url().optional(),

  // Stripe (per-studio, since OAuth onto their account)
  STRIPE_CONNECTED_ACCOUNT_ID: z.string().startsWith("acct_"),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),      // platform key
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),

  // WhatsApp (per-studio — each studio has their own WABA + phone number)
  WHATSAPP_PHONE_NUMBER_ID: z.string(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string(),
  WHATSAPP_ACCESS_TOKEN: z.string(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string(),
  WHATSAPP_APP_SECRET: z.string(),       // for HMAC signature verify

  // Better-auth
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
});
```

**Why this works:**
- New studio = new `.env` per app + 3 deploys. No `INSERT INTO studios` step.
- Secrets rotate per-studio via `fly secrets set` / `vercel env` — no rotation surface in code.
- Onboarding script is a deploy script, not a SaaS admin UI.

**Trade-offs:**
- ❌ No central "list all studios" view — solve with deploy-tracking (CSV, Notion, deploy CI) not with a DB
- ❌ Studio metadata changes need a re-deploy — acceptable at v1 scale (handful of studios)

---

## Data Flow

### Key Flow 1: Inbound WhatsApp Message → Visible Thread

```
[Member sends WhatsApp message]
    │
    ▼
[Meta Cloud API delivers webhook]
    │
    ▼
[Fly: edge-webhooks POST /webhooks/whatsapp]
    │ 1. Read raw body
    │ 2. Verify HMAC signature (X-Hub-Signature-256, sha256=...)
    │ 3. Parse payload → extract entry[].changes[].value.messages[]
    │ 4. For each message: INSERT webhook_events (id = wamid)
    │    - ON CONFLICT DO NOTHING (idempotency)
    │ 5. Enqueue 'whatsapp-inbound' job with { wamid }
    │ 6. Return 200 OK (< 100ms target)
    ▼
[Redis: BullMQ queue]
    │
    ▼
[Fly: worker — whatsapp-inbound processor]
    │ 1. Load raw payload from webhook_events
    │ 2. Find-or-create member by phone (E.164 normalised)
    │ 3. Find-or-create conversation for member (channel = 'whatsapp')
    │ 4. INSERT message row { conversation_id, wamid, direction='in', body, media_ref?, received_at }
    │    - PK = wamid → idempotency on the message itself too
    │ 5. UPDATE conversation { last_inbound_at = now() }  ← drives 24h-window
    │ 6. UPDATE webhook_events { processed_at = now() }
    │ 7. (Optional) emit Postgres NOTIFY for live UI update — defer to post-v1
    ▼
[Staff-web revalidates /inbox loader on next visit or via polling]
```

**Failure modes:**
- Receiver crash after persisting webhook_events but before enqueueing → housekeeping job scans for un-`processed_at` events older than 1 minute and re-enqueues.
- Worker crash mid-process → BullMQ retries with backoff. Domain function is idempotent (wamid PK), safe to re-run.
- DB outage → receiver returns 500; Meta retries (up to ~7 days per Meta docs). No data loss.

### Key Flow 2: Outbound WhatsApp Send (Free-form)

```
[Staff types reply, hits Send in /inbox UI]
    │
    ▼
[Vercel: staff-web action POST /inbox/:conversationId/send]
    │ 1. Check Better-auth session
    │ 2. SELECT conversation.last_inbound_at (UI check is a hint; DB is authoritative)
    │ 3. INSERT message row { direction='out', body, delivery_status='queued', requested_by=user.id }
    │ 4. Enqueue 'whatsapp-outbound' job { messageId }
    │ 5. Return 200 (UI shows message with "queued" indicator)
    ▼
[Redis: BullMQ outbound queue]
    │
    ▼
[Fly: worker — whatsapp-outbound processor]
    │ 1. SELECT message + conversation
    │ 2. canSendFreeform(conversation.last_inbound_at, now())
    │    - If NOT allowed: UPDATE message { delivery_status='rejected', error='window_expired' }
    │    - DONE. UI shows red badge with reason.
    │ 3. If allowed: Call WhatsApp Cloud API via @great-detail/whatsapp
    │ 4. On 200: UPDATE message { delivery_status='sent', wamid=response.id }
    │ 5. On 4xx: UPDATE message { delivery_status='failed', error=...} — no retry
    │ 6. On 5xx / network: throw → BullMQ retries with exponential backoff
    ▼
[Meta delivers, then sends status webhooks: sent → delivered → read]
    │
    ▼
[Receiver → enqueue → worker updates message.delivery_status]
```

**Outbound template send** is the same flow except step 2 picks the template + variables instead of free-form body, and step 1 doesn't require `last_inbound_at` (templates are valid outside the window).

### Key Flow 3: Class Booking → Pass Debit

```
[Staff books a member into a class via /schedule UI]
    │  (Post-v1: member books themselves from mobile app via authenticated API)
    ▼
[Vercel: staff-web action POST /schedule/:sessionId/book]
    │ BEGIN TRANSACTION
    │  1. SELECT class_sessions FOR UPDATE       — locks the session row
    │  2. Check capacity: bookings count < session.capacity
    │     - If full: INSERT into waitlist, COMMIT, return "waitlisted"
    │  3. SELECT member's active pass FOR UPDATE
    │  4. Compute balance = pass.granted - SUM(pass_debits where pass_id = ...)
    │  5. If balance <= 0: ROLLBACK, return "no_credits"
    │  6. INSERT booking { session_id, member_id, booked_by, booked_at }
    │  7. INSERT pass_debits { pass_id, booking_id, amount = 1, debited_at }
    │ COMMIT
    │ Return success → loader revalidates → UI updates
    ▼
[Async: reminders queue picks up new booking → schedules class reminder job]
```

**Cancellation flow:** if cancellation > N hours before class start (per studio policy), INSERT a credit row (`pass_debits` with negative amount) instead of mutating the booking. The booking gets `cancelled_at` set. Late cancels keep the debit.

### Key Flow 4: Stripe Webhook → Member Record Update

```
[Stripe sends customer.subscription.updated event]
    │
    ▼
[Fly: edge-webhooks POST /webhooks/stripe]
    │ 1. Read raw body (c.req.text())
    │ 2. stripe.webhooks.constructEvent(raw, sig, secret) — throws if invalid
    │ 3. INSERT webhook_events (id = event.id) ON CONFLICT DO NOTHING
    │ 4. If insert happened: enqueue 'stripe-events' job { eventId }
    │ 5. Return 200 OK
    ▼
[Redis: BullMQ stripe-events queue]
    │
    ▼
[Fly: worker — stripe-events processor]
    │ 1. SELECT webhook_events.payload, parse Stripe.Event
    │ 2. Dispatch to reducer for event.type
    │ 3. Reducer (e.g. for subscription.updated):
    │    - UPSERT stripe_subscriptions by sub.id
    │    - UPDATE member.subscription_status (last-write-wins on event.created)
    │ 4. UPDATE webhook_events { processed_at = now() }
    ▼
[Member's profile in /members reflects new status on next loader run]
```

### State Management Inside Staff-Web

React Router v7 owns the "state" question — there is no Redux/Zustand needed:

- **Server state:** loaders return data; actions revalidate it. TanStack Query for client-side polling (e.g. inbox new-message indicator).
- **Form state:** React Hook Form (already in agent-native).
- **Ephemeral UI state:** React local state, occasionally `useReducer` for complex modals.
- **Cross-route state:** URL search params for filters, pagination, selected conversation.

Resist the urge to add a global state library. The loader/action model is the state library.

---

## Scaling Considerations

The per-customer-deploy model changes the scaling question. You don't scale to "1M users" — you scale to **N studios**, where each studio has its own contained universe of (typically) 50–500 members.

| Scale | Architecture Adjustments |
|---|---|
| **1 studio (v1)** | Single Neon free tier + single Vercel hobby project + single Fly app (1 small machine, two processes). Redis on the smallest Upstash plan. Total cost: < $30/month per studio. |
| **5–10 studios** | Same architecture, N copies. Deploy automation matters now — script the `vercel link && fly launch && neonctl project create` sequence. Centralised logging (Better Stack) becomes mandatory to see across deploys. |
| **20–50 studios** | The per-studio cost dominates (Neon paid tier per project, Fly machine minimums). Consider Neon's "branch per customer" model with one project as a cheaper alternative IF the tenancy decision is revisitable. Per-studio deploys still work, but you'll want CD pipelines + a small "ops" SQLite/Notion to track which version is on which deploy. |
| **100+ studios** | The single-tenant code, multi-tenant deploy decision becomes a question worth re-opening. Either: (a) invest in Pulumi/Terraform-driven deploy automation; (b) introduce shared infrastructure with hard tenant isolation. This is a vertical-#2-or-later concern. |

### Scaling Priorities

1. **First bottleneck (per studio): Fly worker throughput on outbound WhatsApp during busy hours.** WhatsApp Cloud API rate limits per phone number can become tight if a studio sends to hundreds of members at once. Mitigation: BullMQ concurrency tuning, `pacer` rate limit pattern, batch reminders with jitter.
2. **Second bottleneck: Neon serverless connection limits from the Fly worker during webhook storms.** Mitigation: use the `neon-serverless` WebSocket driver with a connection pool, not per-request HTTP. (Already documented in STACK.md.)
3. **Third bottleneck: per-customer deploy ops overhead.** Mitigation: a single `scripts/provision-studio.ts` that does Neon + Vercel + Fly + secrets in one command. Worth writing once you onboard the second customer, not before.

---

## Anti-Patterns

### Anti-Pattern 1: Calling External APIs From React Router Actions

**What people do:** A `/inbox/send` action calls `whatsappClient.sendMessage(...)` directly, awaits the response, returns to the UI.

**Why it's wrong:**
- Vercel serverless functions cold-start: WhatsApp API latency + JIT warmup can push action times over Vercel's timeout
- No retry on transient failures — user sees error, hits resend, you've sent twice
- 24h-window check happens in the action where state can be stale by milliseconds vs. an inbound that just arrived

**Do this instead:** action persists `messages.delivery_status='queued'` and enqueues. The worker on Fly does the actual send. UI reflects status changes via revalidation or polling.

### Anti-Pattern 2: Parsing JSON Before Signature Verification

**What people do:** Hono's `c.req.json()` or Express's `app.use(express.json())` runs globally, then the webhook route gets parsed JSON, then someone tries to JSON.stringify it back to verify the signature.

**Why it's wrong:** Key ordering, whitespace, and number formatting are not preserved by parse + stringify. The HMAC will not match. Stripe's docs explicitly call this out as the #1 webhook footgun.

**Do this instead:** Use `c.req.text()` (Hono) or `express.raw({type: '*/*'})` mounted ONLY on the webhook route, BEFORE any global `express.json()`. Pass the raw bytes to `stripe.webhooks.constructEvent()` or `event.verifySignature()`.

### Anti-Pattern 3: Trusting WhatsApp's "the message is in the 24h window" UI hint

**What people do:** Check `lastInboundAt` once in the loader, render the UI as "you can reply free-form", staff replies, action sends free-form.

**Why it's wrong:** The clock keeps ticking. By the time the action runs, the window might have expired. Meta will reject (or worse, flag) the send.

**Do this instead:** The UI hint is a hint. The worker re-checks against the DB at send time. The worker is the only place where the window check has authority.

### Anti-Pattern 4: Storing Pass Balance as a Mutable Integer

**What people do:** `members.classes_remaining INTEGER NOT NULL DEFAULT 0`. Decrement on booking, increment on cancellation.

**Why it's wrong:**
- Lost updates under concurrency (two near-simultaneous bookings both read 1, both decrement to 0, one class is overbooked)
- No audit trail — "why does this member have 3 credits, they bought 10 and only came to 5 classes" requires guessing
- Cancellation refund logic gets entangled with booking logic

**Do this instead:** Append-only `pass_debits` ledger (see Pattern 4). Balance is derived. Concurrency-safe with row-level locks on the pass grant row.

### Anti-Pattern 5: Adding `studio_id` Columns "Just in Case"

**What people do:** "What if we want to consolidate later? Let's add `studio_id NOT NULL` to every table now and just set it to 'studio_a' for this deploy."

**Why it's wrong:**
- Violates the architectural decision in PROJECT.md (per-customer deploy is the point)
- Every query now needs `WHERE studio_id = ?` discipline — exactly the bug class single-tenant-deploy is meant to eliminate
- "Later consolidation" requires schema-wide migration regardless of whether the column existed
- Drags in tenant-scoping middleware, RLS policies, per-tenant audit complexity

**Do this instead:** No `studio_id`. If you ever want consolidation, you'll add it then with a schema migration; doing it preemptively costs you discipline now for no gain.

### Anti-Pattern 6: Editing Vendored agent-native Code In Place

**What people do:** "There's a small bug in `@agent-native/core/server/runAuthGuard`, let me just patch it in `packages-vendored/core/`."

**Why it's wrong:** Next upstream merge stomps your patch. You discover this when auth silently breaks two weeks later.

**Do this instead:** Wrap, don't edit. Create `apps/staff-web/app/lib/auth.ts` that imports from `@agent-native/core/server` and re-exports a patched version. If the patch is non-trivial, file an upstream PR. Worst case, document the patch in `.upstream-merge.md` so future-you knows it needs reapplying after each merge.

### Anti-Pattern 7: One Stripe Webhook Endpoint Per Event Type

**What people do:** Configure `/webhooks/stripe/checkout-completed`, `/webhooks/stripe/customer-updated`, etc. in the Stripe dashboard.

**Why it's wrong:** N endpoints to maintain, N idempotency tables, N points of failure, harder dashboard config, can't replay events centrally.

**Do this instead:** ONE endpoint `/webhooks/stripe`. The dispatcher in the worker maps `event.type` to a reducer. Single idempotency table.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| **Meta WhatsApp Cloud API** | Inbound: HTTPS webhook to Fly (HMAC verify with WHATSAPP_APP_SECRET). Outbound: Graph API HTTPS POST via `@great-detail/whatsapp`. | Per-studio WABA + phone number. Receiver must register via Meta dashboard with `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Meta has IP allowlist option — use it once stable. Templates must be approved in Meta Business Manager before use. |
| **Stripe Connect** | OAuth flow puts `stripe_user_id` (acct_...) into env var (`STRIPE_CONNECTED_ACCOUNT_ID`). Webhook endpoint configured in Stripe dashboard during onboarding. All API calls use the platform key with `Stripe-Account: <connected_id>` header (handled by SDK if you pass `stripeAccount` option). | Note: connecting the same studio twice consumes the OAuth code; subsequent attempts fail. Plan onboarding as a one-shot. Listen for `account.updated` for charges_enabled / payouts_enabled transitions before opening payment surfaces to staff. |
| **Neon Postgres** | Drizzle ORM. From Vercel: `neon-http` driver (cold-start friendly). From Fly: `neon-serverless` WebSocket driver (better latency for transactional work). | One Neon **project** per studio (gives you a separate database + connection string + isolated compute). Use Neon branches for dev/staging *within* a studio's project. Run migrations via `drizzle-kit migrate` in a deploy step (Fly worker boot is a fine hook for v1; later, move to CI). |
| **OpenFoodFacts (post-v1)** | Public HTTPS API, no auth. From worker for nutrition lookup. Cache results in DB. | LLM fallback for natural-language descriptions per STACK.md. |
| **Customer's existing React Native app (post-v1, Phase 3)** | Their app calls authenticated GymOS API (lives in `apps/staff-web` actions/loaders or a new `apps/mobile-api` Hono service on Fly — decide at Phase 3 planning). | Auth: Better-auth's mobile session pattern (Bearer token) or a separate API-key model. Determined when reading their codebase. |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| **staff-web ↔ Postgres** | Drizzle queries from loaders/actions | Reads + GymOS-owned writes (bookings, member CRM, schedule, templates). Never writes Stripe-mirrored or WhatsApp-mirrored tables. |
| **staff-web ↔ Redis/BullMQ** | Enqueue-only (producer) via shared `packages/queue` helper. The Vercel function needs the Redis URL. | Vercel→Upstash Redis works fine; the Upstash REST API or `ioredis` with TLS both work. **Decision needed at Phase 1:** whether Vercel can reach Fly's private Upstash Redis (probably not — need a public Upstash plan). Alternative: staff-web doesn't enqueue directly; it calls a small internal HTTP endpoint on the Fly worker which enqueues. Adds one hop but keeps Redis private. **Recommendation: Fly internal HTTP endpoint** for cleaner secrets boundary. |
| **edge-webhooks ↔ Postgres** | Drizzle inserts to `webhook_events` only | The receiver is allowed to touch ONE table. Anything else is the worker's job. |
| **edge-webhooks ↔ Redis/BullMQ** | Enqueue (producer) | Co-located on Fly, private network, no auth surface. |
| **worker ↔ Postgres** | Drizzle reads + writes across all tables | The worker is the only place that writes Stripe mirrors, conversation/message state, pass debits. |
| **worker ↔ External APIs** | Stripe SDK + `@great-detail/whatsapp` | All retries, rate-limit handling, error classification lives here. |
| **agent-native vendored code ↔ GymOS code** | One-way: GymOS imports from `@agent-native/*`, never the reverse | Enforced by the directory structure and pnpm workspace topology. If GymOS code "needs to be" in `@agent-native/core/`, it's a refactor smell — wrap, don't reach back. |

---

## Suggested Build Order (Architecture-Driven)

This ordering minimises blocking dependencies between components. The phase numbering aligns with PROJECT.md.

### Phase 0 — Foundation (cannot skip)

1. **Fork agent-native, set up upstream remote, pnpm install** — verifies the framework boots.
2. **Audit the 5 templates** (per PROJECT.md). The decision here (fork-clean / adapt / build-fresh) gates structure choices below.
3. **Stand up `apps/staff-web` with a "hello, authenticated world"** — Vercel + Better-auth + Neon connection. Validates the deployment path before adding domain code (de-risks the MEDIUM-confidence Vercel/RR-v7 pairing flagged in STACK.md).
4. **Define `packages/db/schema/` skeleton** — even empty tables for the major entities. Run first migration. Validates the Drizzle config delegation pattern.

### Phase 1 — Webhook + Worker Spine (blocks everything else WhatsApp/Stripe-touching)

5. **Stand up `apps/edge-webhooks` on Fly** with a `/healthz` and a stub `/webhooks/stripe` that just inserts to `webhook_events`. Verify with Stripe CLI.
6. **Stand up `apps/worker` on Fly** with BullMQ + a do-nothing job. Verify queue round-trip.
7. **Wire the `webhook_events → queue → worker` pattern end-to-end** with Stripe (easier to test than WhatsApp). Implement the first reducer (`customer.created`). This is the architectural skeleton — once this works, everything else is filling in domain logic.
8. **Add WhatsApp inbound webhook** to `edge-webhooks` with HMAC verify. Inbound is easier than outbound (no template/window complexity).
9. **Add WhatsApp inbound processor** to worker — materialise conversations + messages.

### Phase 2 — Domain Surfaces

10. **Build the inbox UI** (`apps/staff-web/app/routes/inbox/`) — fork from agent-native Mail template, read-only first. Validates the staff-web ↔ DB read path on real data flowing in from the worker.
11. **Add outbound send action** — full queue path including 24h-window enforcement. This is the highest-risk feature; do it after the spine is proven.
12. **Build the schedule UI + booking flow** — forked from Calendar template. Add the pass-debit ledger pattern. Mostly DB-bound, no external API surface, so it's parallelisable with WhatsApp outbound if needed.
13. **Build the members directory** — read-mostly UI over the data already populated by Stripe webhooks + WhatsApp inbound.
14. **Add Stripe Checkout / Portal link generation actions** — these are direct SDK calls (idempotent on Stripe's side), no queue needed. They live in `staff-web`.

### Phase 3+ — Out of v1 architecture scope

- Mobile integration into customer's RN app (Phase 3) — adds either an API surface on staff-web or a new `apps/mobile-api` on Fly. Decide at Phase 3 planning after reading customer's codebase.
- Knowledge base, analytics, calorie counter — fork additional templates, follow the same staff-web pattern.

**What blocks what:**

```
[Fork + pnpm install]
    ↓
[Hello-world staff-web deploy]   [Schema skeleton + migrations]
    ↓                                 ↓
    └──────────────┬──────────────────┘
                   ↓
        [Hello-world Fly app (edge + worker + Redis)]
                   ↓
        [webhook_events + Stripe spine working end-to-end]
                   ↓
   ┌───────────────┼─────────────────────────────┐
   ↓               ↓                              ↓
[WA inbound]   [Stripe reducers fleshed out]  [Schedule + bookings + passes]
   ↓               ↓                              (DB-only, can go in parallel)
[Inbox UI]     [Member directory]
   ↓
[Outbound send + 24h gate + templates]
   ↓
[Reminders queue]
```

---

## Comparison: Per-Customer Deploy vs Standard Tenancy-Row SaaS

| Dimension | Standard (tenancy column) | GymOS (per-customer deploy) |
|---|---|---|
| **Schema** | Every table has `tenant_id NOT NULL`; every query has `WHERE tenant_id = ?`. RLS policies, middleware enforcement. | No tenant column. Every table is "this studio's data" by virtue of which DB you connected to. |
| **Onboarding** | `INSERT INTO tenants(...)`; provision per-tenant resources (Stripe Connect, WhatsApp WABA) referenced by `tenant_id`. | `neonctl projects create`, `vercel link`, `fly launch`, populate env vars, deploy. A script, but a script that runs *infrastructure*. |
| **Deploy unit** | One deploy serves N tenants. Code changes ship instantly to all. | N deploys for N studios. Rollouts are per-studio (good: blast radius is one customer; bad: rolling out a fix to 20 studios is 20 deploys). |
| **Data isolation** | Logical (enforced by app code or RLS). A bug in `WHERE` clauses can leak across tenants. | Physical (different DB connection strings). A bug cannot leak across studios — there is no other studio's data on the connection. |
| **Cross-tenant operations** | Easy (one query joins across all tenants). Useful for billing, analytics, support. | Hard (would require connecting to N DBs). Need an external rollup layer if cross-studio analytics ever matter. |
| **Cost** | Sublinear in tenants (shared infra). | Linear in tenants (each gets their own Neon + Vercel + Fly). At v1 cost is fine; at 50+ studios it's a real number. |
| **Operational overhead** | One backup, one migration, one monitoring dashboard. | N of each. Needs centralised log aggregation (Better Stack) and a deploy registry to stay sane. |
| **Compliance / data residency** | Hard — all data in one place. | Easy — provision each studio's Neon project in the right region. |
| **Schema migrations** | One migration, deployed once. Run on the shared DB. | N migrations to run. Plan: bake migrations into the worker boot — `drizzle-kit migrate` on startup, fails fast if schema drift. |
| **Noisy neighbour risk** | Real. One large studio can degrade others. | Zero — they have separate infra. |
| **Tenant-scoping bug class** | Constant vigilance required (linter rules, code review for "where's the tenant filter?"). | Doesn't exist — schema has no concept of "another tenant". |

**Why GymOS chose per-deploy:**
- Eliminates the entire tenant-scoping bug class (the deciding factor — solo dev, limited code-review capacity)
- Matches the vertical-SaaS-factory mental model (each vertical = a fork = its own infra)
- WhatsApp Business API is *naturally* per-WABA per-phone-number, which maps cleanly to per-deploy
- Stripe Connect is *naturally* per-connected-account, which maps cleanly to per-deploy
- At target scale (handful of studios for v1, dozens long-term), the cost penalty is acceptable

**When to revisit:** if you grow past ~30 studios, or if the operational overhead of N deploys starts exceeding the engineering cost a tenant-column model would have. Set a checkpoint at the 10-studio mark.

---

## Sources

- Stripe webhook patterns: [Stripe Webhook Security: Signature Verification, Idempotency, and Local Testing](https://dev.to/whoffagents/stripe-webhook-security-signature-verification-idempotency-and-local-testing-1lk3), [Stripe Webhooks End-to-End](https://appycodes.dev/blog/stripe-webhooks-end-to-end-2026/), [Stripe official docs — Receive Stripe events](https://docs.stripe.com/webhooks), [Stripe official docs — Connect webhooks](https://docs.stripe.com/connect/webhooks), [Stripe Connect OAuth reference](https://docs.stripe.com/connect/oauth-reference)
- Hono webhook handling: [Hono Stripe Webhook example](https://hono.dev/examples/stripe-webhook)
- WhatsApp webhook architecture: [Building a Scalable Webhook Architecture for Custom WhatsApp Solutions](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions), [Building WhatsApp Business Bots with the Official API: Architecture, Webhooks, and Automation Patterns](https://dev.to/achiya-automation/building-whatsapp-business-bots-with-the-official-api-architecture-webhooks-and-automation-1ce4), [Stop Doing Business Logic in Webhook Endpoints](https://dev.to/elvissautet/stop-doing-business-logic-in-webhook-endpoints-i-dont-care-what-your-lead-engineer-says-8o0)
- Gym/studio domain patterns: [Wellyx Smart Gym Software](https://wellyx.com/), [Vibefam](https://vibefam.com/), [Gym management software comparison](https://wellyx.com/blog/top-gym-management-software/), [ClassPass payouts architecture (Modern Treasury case study)](https://www.moderntreasury.com/customers/classpass)
- Stripe Connect multi-tenant patterns: [Building a Multi-Tenant SaaS with Stripe Connect in 2026](https://dev.to/diven_rastdus_c5af27d68f3/building-a-multi-tenant-saas-with-stripe-connect-in-2026-jjn), [Managing Webhook Events for Connected Accounts](https://cecilphillip.dev/managing-webhook-events-for-connected-accounts)
- Tenancy model trade-offs: [Choosing the right SaaS architecture: Multi-Tenant vs. Single-Tenant (Clerk)](https://clerk.com/blog/multi-tenant-vs-single-tenant), [Single-tenant vs multi-tenant (WorkOS)](https://workos.com/blog/singletenant-vs-multitenant), [Single-Tenant Vs. Multi-Tenant Cloud (CloudZero)](https://www.cloudzero.com/blog/single-tenant-vs-multi-tenant/)
- React Router v7 framework mode: [Route Module docs](https://reactrouter.com/start/framework/route-module), [Data Loading docs](https://reactrouter.com/start/framework/data-loading), [Actions docs](https://reactrouter.com/start/framework/actions), [Picking a Mode](https://reactrouter.com/start/modes)
- pnpm workspace patterns: [pnpm Workspaces docs](https://pnpm.io/workspaces), [Monorepo Architecture with pnpm Workspace](https://dev.to/yasinatesim/monorepo-architecture-with-pnpm-workspace-turborepo-changesets-g0j)
- `BuilderIO/agent-native` repository (inspected for STACK.md, same source authoritative for fork boundary mechanics here)
- GymOS internal: `C:\Users\dimet\hustle\.planning\PROJECT.md`, `C:\Users\dimet\hustle\.planning\research\STACK.md`

---

*Architecture research for: boutique fitness studio management platform (GymOS)*
*Researched: 2026-05-17*
*Confidence: HIGH on the receiver/worker/idempotency topology; MEDIUM on the agent-native fork mechanics until Phase 0 audit confirms the upstream layout; MEDIUM on Vercel↔Fly Redis routing (resolve at Phase 1).*
