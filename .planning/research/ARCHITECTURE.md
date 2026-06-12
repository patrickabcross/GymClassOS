# Architecture Research — GymClassOS

**Domain:** Boutique fitness studio management platform (WhatsApp inbox + class schedule + Stripe + member CRM, with per-customer deploy)
**Researched:** 2026-05-17
**Confidence:** HIGH for component topology and webhook patterns (verified against Stripe, Hono, WhatsApp Cloud API, and agent-native sources); MEDIUM for the agent-native fork boundary (depends on Phase 0 audit findings); MEDIUM for per-deploy ops mechanics (validated against Fly + Vercel + Neon docs but unproven for this specific shape).

---

## The Three Architectural Decisions That Drive Everything Else

Before the diagrams, the three constraints from PROJECT.md that make this architecture different from a "standard SaaS":

1. **Single-tenant code, multi-tenant deploy.** No `studio_id` columns. One Neon project + one Vercel deploy + one Fly app per studio. The "tenant" lives in DNS and env vars, not in your SQL.
2. **agent-native is upstream, not a starter.** You're not writing a Mail app — you're forking one. The architecture must keep the agent-native layer mergeable while the GymClassOS-specific layer evolves.
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
│                │ pg-boss.send() (Postgres-backed queue)     │                 │
│                ▼                                            ▼                 │
└────────────────┼────────────────────────────────────────────┼─────────────────┘
                 │                                            │
                 │                                            │
                 │      (no Redis — pg-boss owns queue        │
                 │       state inside the same Neon DB)       │
                 │                                            │
                 ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      WORKER TIER (Fly.io, same app)                           │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  apps/worker  (Node + pg-boss workers + tiny Hono admin surface)     │   │
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
| **`apps/staff-web` (Vercel)** | Drafts, staff actions, member CRM edits, schedule definitions, template metadata, settings | All read views | Postgres (Drizzle/neon-http) — enqueues to pg-boss directly against the same Neon instance | The staff-facing UI. Stateless. SSR via React Router v7. Serverless-friendly. |
| **`apps/edge-webhooks` (Fly)** | `webhook_events` rows (raw payload + dedupe key) | None (write-only at the receive boundary) | Postgres (insert + pg-boss send) | Two jobs: verify signatures with raw body; persist + enqueue within 200–500ms ack window. Owns NO domain state. |
| **`apps/worker` (Fly)** | Conversations, messages (inbound + outbound state machines), members (from Stripe events), bookings (from WA bot replies post-v1), pass_debits, payments | `webhook_events`, all domain tables | Postgres (Drizzle/neon-serverless WS), pg-boss subscriber, Stripe API, WhatsApp Cloud API | Every cross-system write goes through here. Idempotent by design. Owns the 24h-window enforcement gate. |
| **Neon Postgres** | (data tier) | — | — | Source of truth for everything *except* card data (Stripe) and content blobs (object storage if needed later). Also hosts the pg-boss queue schema (`pgboss.*`) alongside the application schema. |
| **agent-native vendored packages** (`@agent-native/core`, copied templates) | NO runtime ownership | — | — | Provides framework primitives (auth, Drizzle config, UI components). Treated as a library. |

### Source-of-Truth Boundaries (Critical)

| Concern | Source of Truth | Local Cache/Mirror | Reconciliation |
|---|---|---|---|
| **Card data + customer/subscription IDs** | Stripe | `stripe_customers`, `stripe_subscriptions`, `payments` (mirrored from webhook events) | Stripe webhooks → worker → DB. NEVER write to these tables from the staff-web action layer. |
| **WhatsApp message delivery/read state** | Meta | `messages.delivery_status`, `messages.read_at` | Status webhooks → worker → DB. The send action enqueues; the worker updates on the API ack; status webhooks update further. |
| **Class/booking/pass state** | GymClassOS Postgres | (this is the only thing fully owned by you) | n/a — direct writes from staff-web actions or worker. |
| **Member identity (phone, name)** | GymClassOS Postgres, but seeded/updated by Stripe customer events for paying members | n/a | Stripe `customer.updated` events flow into the worker → upsert `members`. |
| **Template approval state** | Meta | `whatsapp_templates.status` | Worker housekeeping job pulls Meta's Template Management API daily; manual sync action available from settings. |

**Rule:** if a piece of data has an external source of truth, only the worker writes it locally. The staff-web app *reads* it but never *writes* it directly. This makes Stripe + WhatsApp webhook replay safe.

---

## Recommended Project Structure

```
gymos/                                  # fork of BuilderIO/agent-native
├── apps/                               # NEW — GymClassOS-specific deployables
│   ├── staff-web/                      # Vercel — React Router v7 SSR
│   │   ├── app/
│   │   │   ├── routes/                 # loader/action endpoints
│   │   │   │   ├── inbox/              # forked from agent-native Mail
│   │   │   │   ├── schedule/           # forked from agent-native Calendar
│   │   │   │   ├── members/            # GymClassOS-original
│   │   │   │   └── settings/           # GymClassOS-original
│   │   │   ├── components/             # GymClassOS-specific UI (composes agent-native primitives)
│   │   │   ├── features/               # business logic per surface
│   │   │   │   ├── whatsapp/           # send action, template picker, window check
│   │   │   │   ├── schedule/           # class CRUD, booking CRUD, capacity rules
│   │   │   │   ├── members/            # CRM read models, search
│   │   │   │   └── passes/             # pass balance read helpers
│   │   │   ├── lib/
│   │   │   │   ├── db.ts               # Drizzle client (neon-http)
│   │   │   │   ├── auth.ts             # Better-auth wrapper around runAuthGuard
│   │   │   │   ├── queue.ts            # pg-boss producer (publishes to Neon)
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
│   │   │   │   ├── queue.ts            # pg-boss producer
│   │   │   │   ├── idempotency.ts      # webhook_events insert-or-skip
│   │   │   │   └── env.ts
│   │   │   └── server.ts               # Hono app, bound to 0.0.0.0:3001
│   │   ├── Dockerfile
│   │   ├── fly.toml                    # services.internal_port=3001, hard ack timeout settings
│   │   └── package.json
│   │
│   └── worker/                         # Fly.io — pg-boss workers (can share Fly app with edge-webhooks)
│       ├── src/
│       │   ├── queues/
│       │   │   ├── whatsapp-inbound.ts # process verified webhook → materialise threads/messages
│       │   │   ├── whatsapp-outbound.ts # 24h-window gate, template gate, Graph send, persist ack
│       │   │   ├── stripe-events.ts    # reduce event → upsert mirrored state (member, sub, payment)
│       │   │   ├── reminders.ts        # class reminder scheduler (uses pg-boss sendAfter)
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
├── packages/                           # SHARED across apps/* (still GymClassOS-specific)
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
- **`apps/edge-webhooks` and `apps/worker` may merge into one Fly app** with two processes in `fly.toml` (sharing the Dockerfile and image). Splitting into two Fly apps is also valid but doubles your operational surface. **Recommendation: single Fly app, two processes** (`web` for edge-webhooks, `worker` for workers). One DB connection pool, one deploy command, zero Redis to provision.

---

## The agent-native Fork Boundary

This is the single most important architectural rule for staying mergeable with upstream. **Three layers, three different edit policies:**

| Layer | Location | Edit policy | Merge behaviour |
|---|---|---|---|
| **Upstream vendored** | `packages-vendored/core/`, `templates/*/` | NEVER edit in place | `git merge upstream/main` lands cleanly here every time |
| **Upstream adapted** | `apps/staff-web/app/routes/{inbox,schedule}/`, copied from `templates/mail` and `templates/calendar` | Edit freely | Merges from upstream require *manual* re-application — track in `.upstream-merge.md` checklist |
| **GymClassOS-original** | `apps/edge-webhooks/`, `apps/worker/`, `packages/db/`, `packages/domain-types/`, `apps/staff-web/app/routes/{members,settings}/`, all `apps/staff-web/app/features/` | Edit freely | Unrelated to upstream merges |

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

**Why this works:** the merge surface is small and confined (`templates/`, `packages-vendored/`). The high-churn area (`apps/`, `packages/`) is yours alone. The handful of GymClassOS-adapted routes have a documented manual reconciliation process — they're the cost of forking, paid in a few hours per upstream pull, not in re-engineering a framework.

**Future-proofing for vertical #2:** when you start the next vertical, this layer separation tells you what to extract. Anything in `packages/` that proved useful across both is a framework candidate. Until then, **do not pre-extract** (per PROJECT.md Key Decision).

---

## Architectural Patterns

### Pattern 1: Webhook Receiver → Idempotency Table → Worker Queue

**What:** External webhooks (WhatsApp inbound, Stripe events) are received by `apps/edge-webhooks`, verified, persisted to `webhook_events` (with the external event ID as the unique key), enqueued via `pg-boss.send()` against the same Neon instance, then acked with 200 OK. The actual domain work happens in `apps/worker`.

**When to use:** Every external webhook. Without exception.

**Trade-offs:**
- Receiver completes in <100ms — stays within Meta's and Stripe's ack windows
- Idempotent by construction — duplicate events insert-conflict and skip
- Worker can be slow, can retry, can run business logic that takes seconds
- Disaster recovery: pg-boss queue state lives in the same Neon DB as `webhook_events`; nothing to lose separately. Worst-case: replay un-`processed_at` rows from `webhook_events` straight into pg-boss.
- One service to provision, one secret to manage (DATABASE_URL); no Redis, no Upstash bill
- Two-process latency: action-on-event is enqueue + worker pickup, not synchronous
- Queue write contention is on Postgres — needs monitoring as volume grows (re-evaluate at the ~10k jobs/day per studio trigger in STACK.md)

---

### Pattern 2: Outbound Send — Action → Queue → Worker → Send → Persist

**What:** Staff hits "Send" in the inbox UI. The React Router `action` does NOT call the WhatsApp API directly. It:
1. Persists a `messages` row with `delivery_status = 'queued'`
2. Enqueues an `outbound` job
3. Returns 200 to the UI optimistically

The worker then re-checks the 24h-window state against DB (authoritative), gates on approved templates if outside window, calls WhatsApp Cloud API, and persists the result.

**When to use:** ALL outbound WhatsApp sends.

---

### Pattern 3: Stripe Event Reducers (One Function Per Event Type)

A dispatch table maps `event.type` to an idempotent reducer function. Each reducer updates the local mirror. Adding a new event type is a 1-file change.

---

### Pattern 4: Pass Debits as an Append-Only Ledger

Balance = `sum(passes.granted) - sum(pass_debits.amount)`. Never a mutable integer. Cancellation = negative debit insert. Concurrency-safe with row-level locks.

---

### Pattern 5: Per-Studio Env Var Contract (No In-DB Config)

All per-studio configuration lives in environment variables, validated at boot by a Zod schema. No `settings` table for things that differ between studios — there is only ever one studio per DB instance.

---

## Data Flow

### Key Flow 1: Inbound WhatsApp Message → Visible Thread

edge-webhooks verifies HMAC → inserts `webhook_events` (ON CONFLICT DO NOTHING) → enqueues → returns 200. Worker materialises conversation + message rows, updates `last_inbound_at` which drives the 24h-window clock.

### Key Flow 2: Outbound WhatsApp Send

staff-web action inserts message as `delivery_status='queued'` → enqueues outbound job → returns 200. Worker re-checks window against DB, calls Meta API, updates delivery status. Status webhooks from Meta flow back through the receiver to update `delivered`/`read`.

### Key Flow 3: Class Booking → Pass Debit

Transactional: lock session row + lock pass row → check capacity + balance → insert booking + insert pass_debit → commit.

### Key Flow 4: Stripe Webhook → Member Record Update

edge-webhooks receives → inserts `webhook_events` with `event.id` as PK → enqueues → worker dispatches to reducer → upserts mirror tables → marks `processed_at`.

---

## Scaling Considerations

The per-customer-deploy model means you scale to N studios, not M users. Each studio has its own isolated DB + deploy. First bottleneck is Fly worker throughput on outbound WhatsApp. Second is Neon connection limits from Fly during webhook storms. Third is per-customer deploy ops overhead (mitigate with a provision script once you onboard the second customer).

---

## Anti-Patterns

1. Calling external APIs from React Router actions (latency + no retry + no window enforcement)
2. Parsing JSON before signature verification (HMAC will not match re-stringified JSON)
3. Trusting the UI hint for the 24h window (DB re-check at send time is authoritative)
4. Storing pass balance as a mutable integer (concurrency + no audit trail)
5. Adding `studio_id` columns "just in case" (violates tenancy model, introduces the bug class you're avoiding)
6. Editing vendored agent-native code in place (next merge stomps the patch)
7. One Stripe webhook endpoint per event type (N endpoints to maintain; use one + dispatch table)

---

## Integration Points

| Service | Integration Pattern | Notes |
|---|---|---|
| **Meta WhatsApp Cloud API** | Inbound: HTTPS webhook to Fly (HMAC verify). Outbound: Graph API via `@great-detail/whatsapp`. | Per-studio WABA + phone number. Templates must be approved before use. |
| **Stripe** | Direct restricted-API-key model. Webhook endpoint on Fly. | Studio owns merchant relationship. No Connect platform model. |
| **Neon Postgres** | Drizzle ORM. neon-http from Vercel; neon-serverless WS from Fly. | One Neon project per studio. pg-boss shares the same DB. |

---

## Suggested Build Order (Architecture-Driven)

Phase 0: Fork + pnpm install + hello-world staff-web deploy + schema skeleton.
Phase 1: Webhook + worker spine (edge-webhooks + worker + pg-boss round-trip + Stripe spine end-to-end + WhatsApp inbound).
Phase 2: Domain surfaces (inbox UI + outbound send + schedule + members + Stripe Checkout links).
Phase 3+: Mobile integration, knowledge base, analytics, calorie counter.

---

## Comparison: Per-Customer Deploy vs Standard Tenancy-Row SaaS

Per-deploy eliminates the tenant-scoping bug class (critical for solo dev), maps naturally to WhatsApp's per-WABA and Stripe's per-account models, and provides physical data isolation. Cost is linear in studios (vs sublinear for shared infra). Revisit at ~30 studios.

---

## Sources

- Stripe webhook patterns, Hono webhook handling, WhatsApp webhook architecture, React Router v7 docs, pnpm workspace docs — see 2026-05-17 version for full URL list.
- `BuilderIO/agent-native` repository (inspected directly)
- GymClassOS internal: `.planning/PROJECT.md`, `.planning/research/STACK.md`

---

*Architecture research for: boutique fitness studio management platform (GymClassOS)*
*Researched: 2026-05-17*
*Confidence: HIGH on the receiver/worker/idempotency topology; MEDIUM on the agent-native fork mechanics until Phase 0 audit confirms the upstream layout. Queue choice locked to pg-boss 2026-05-17 (no Redis).*

---

---

# v1.1 Design System Integration Architecture

**Milestone:** v1.1 UI Redesign — GymClassOS Design System + Renaming Pass
**Branch:** `redesign/ui-refresh`
**Researched:** 2026-06-12
**Confidence:** HIGH — every claim grounded in direct file reads of the working tree

---

## DS-1. Current Token Architecture (What Exists Today)

### The Token Chain as Built

```
packages/core/src/styles/agent-native.css          (UPSTREAM — fork boundary, never edit)
  @theme {
    --color-background: hsl(var(--background));
    --color-primary:    hsl(var(--primary));
    --color-muted:      hsl(var(--muted));
    ... (full shadcn/ui token set)
    --radius-lg: var(--radius);
  }
  @plugin "@tailwindcss/typography"
  @import "tw-animate-css"

apps/staff-web/app/global.css                       (OURS — GymClassOS-owned)
  @import "tailwindcss"
  @import "@agent-native/core/styles/agent-native.css"
  :root {
    --background: 0 0% 100%;      <- HARDCODED slate palette
    --primary: 220 10% 15%;       <- HARDCODED
    --radius: 0.5rem;              <- HARDCODED
    ... (full HSL token set)
  }
  .dark { ... }
  .email-list-row { ... }         <- email-legacy utility classes (~30 selectors)
  .email-body-content { ... }
  .compose-window { ... }
  .compose-editor { ... }
  .inbox-zero { ... }
```

Key finding: the seam for skinning already exists. `agent-native.css` defines the `@theme` bridge (CSS custom property → Tailwind utility). `global.css` defines the raw HSL values. Skinning requires replacing the `:root` block contents only. No new package is architecturally required.

### Existing Token Infrastructure in `packages/core`

`packages/core/src/server/design-token-utils.ts` (1023 lines, exported at `@agent-native/core/server/design-token-utils`): pure CSS/Tailwind-config parsing utilities used by the Design/Slides/Videos templates' `import-*` actions. Not yet wired to staff-web or mobile-app.

`packages/core/src/appearance/actions/set-appearance-preset`: an agent-callable `defineAction` that writes a preset to application-state. Presets are `default | warm | ocean | forest | rose | slate`. Works today but uses a fixed preset set — not per-studio arbitrary theming.

---

## DS-2. Token Package Placement Decision

**Decision: No new workspace package. Token skin CSS files live inside `apps/staff-web`.**

Three consumers have fundamentally different token mechanisms:

| Consumer | Token mechanism | CSS custom properties? |
|---|---|---|
| `apps/staff-web` (staff UI) | Tailwind v4 utilities via `@theme` bridge | YES |
| Public embeds (`/embed/schedule` etc.) | Same Tailwind build as staff-web — same server routes | YES — automatically |
| `packages/mobile-app` (Expo RN) | JavaScript constants — no CSS engine | NO |

A `packages/design-tokens` CSS package gives the mobile-app nothing. `packages/core` is the upstream fork boundary. The correct split is:

**Recommended file layout:**

```
apps/staff-web/
  app/
    skins/
      hustle.css        <- :root { --primary: …; --background: …; --radius: …; }
      default.css       <- neutral GymClassOS fallback
    global.css          <- remove hardcoded :root values; @theme bridge remains
  server/
    plugins/
      skin-injector.ts  <- NEW: reads GYMOS_STUDIO_SKIN, injects skin <style> in SSR head

packages/mobile-app/
  lib/
    theme.ts            <- NEW: JS color/typography constants per skin
```

**Component primitives** stay in `apps/staff-web/app/components/ui/` (shadcn/ui — already present: accordion, avatar, badge, button, card, chart, checkbox, command, dialog, dropdown-menu, and 30+ more). New GymClassOS-specific primitives (`ClassCard`, `MemberAvatar`, `PassBadge`) go in `apps/staff-web/app/components/gymos/`.

---

## DS-3. Per-Studio Skin Config Flow

### Why Env Vars, Not the Database

The `secrets` table (`apps/staff-web/server/db/schema.ts` line 415: `secrets.name TEXT PRIMARY KEY`, `secrets.ciphertext TEXT NOT NULL`) is for encrypted API credentials. Studio skin/branding is not secret and must be available before the DB connection is established (the SSR `<head>` renders on every request).

```
studios/hustle/env.yml
  GYMOS_STUDIO_SKIN=hustle
  GYMOS_STUDIO_NAME="Hustle"
  GYMOS_STUDIO_LOGO_URL=https://cdn.hustle.com/logo.svg

        | set via Vercel environment variables at deploy time
        v

apps/staff-web/server/plugins/skin-injector.ts
  reads process.env.GYMOS_STUDIO_SKIN -> "hustle"
  maps to apps/staff-web/app/skins/hustle.css
  injects <style> block into SSR <head> on every request

        v

:root CSS custom properties (from skin CSS) override global.css defaults

        v  (unchanged — fork boundary)

@theme bridge in packages/core/src/styles/agent-native.css

        v

Tailwind utility classes (bg-primary, text-foreground, etc.) resolve for this skin
```

### Config Placement Table

| Config type | Location | Reason |
|---|---|---|
| Skin identifier, studio display name, logo URL | `GYMOS_STUDIO_SKIN` etc. env vars | Not secret; available before DB; deploy-time stable |
| API keys (Stripe, WhatsApp, Anthropic) | `secrets` table (encrypted via pgcrypto) | Secret; runtime-fetched via Settings UI |
| Future fine-grained token overrides | Additional env vars or a `studio_config` table | Defer until second studio requires it |

---

## DS-4. Renaming-Pass Layering Strategy

### Rename Inventory (from direct file inspection)

**Email-legacy CSS class names in `apps/staff-web/app/global.css` (approx 30 selector blocks):**
`.email-list-row`, `.email-body-content`, `.compose-window`, `.compose-editor`, `.compose-image-*`, `.inbox-zero`, `.row-action-rail`, `.hover-actions`, `.bubble-toolbar`, `.slash-command-menu`, `.code-lang-*`

**Files consuming those class names:**
- `apps/staff-web/app/components/email/EmailListItem.tsx` — `.email-list-row`, `.row-action-rail`, `.hover-actions`
- `apps/staff-web/app/components/email/EmailThread.tsx` — `.email-body-content`
- Other files in `apps/staff-web/app/components/email/` — compose-editor, compose-window

**Route files with mail-template vocabulary:**
- `apps/staff-web/app/routes/draft-queue.tsx`
- `apps/staff-web/app/routes/draft-queue.$id.tsx`
- `apps/staff-web/app/routes/email.tsx`

**Page component files:**
- `apps/staff-web/app/pages/InboxPage.tsx`
- `apps/staff-web/app/pages/DraftQueuePage.tsx`

**Hooks and lib with mail-template names:**
- `apps/staff-web/app/hooks/use-emails.ts`
- `apps/staff-web/app/hooks/use-draft-queue.ts`
- `apps/staff-web/app/lib/inbox-tabs.ts`
- `apps/staff-web/app/lib/threads.ts`

### Three Layers and Conflict Risk

**Layer 1 — UI Label Renames (zero merge conflict risk)**

String literals in rendered TSX only: nav link text, page titles, toast messages. Files:
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx`
- `apps/staff-web/app/routes/gymos.*.tsx` (all gym routes)
- `apps/staff-web/app/components/layout/AppLayout.tsx`
- `apps/staff-web/app/components/layout/Sidebar.tsx`

All are GymClassOS-owned. Master branch never touches them. Do first.

**Layer 2 — CSS Class Renames (low conflict risk)**

Strategy: add new semantic selectors alongside the old ones in `global.css` (e.g. `.conversation-list-row` identical to `.email-list-row`), migrate component usages, remove old selectors in a cleanup commit. The `:root` token block and the utility-class section are physically separated in the file — `global.css` token edits and class rename edits should be in separate commits.

**Layer 3 — Code Identifier Renames (medium conflict risk — do last)**

TypeScript identifiers, file names, route segments. Route file renames are highest risk: `flatRoutes()` in `apps/staff-web/app/routes.ts` auto-discovers routes by filename. Strategy:

1. Keep old route files as thin redirect shims: `export function loader() { return redirect("/gymos/inbox") }`. Master-branch additions to `draft-queue.tsx` continue to compile.
2. New GymClassOS replacements live at new paths.
3. After the redesign branch is merged, remove shims in a follow-up commit.

### Execution Order

```
1. UI Labels (Layer 1)              — no dependencies; zero conflict risk; do first
2. Skin token CSS (DS-2 above)      — independent; can run in parallel with Layer 1
3. CSS class renames (Layer 2)      — group with global.css token edits in same PR
4. Code identifier renames (Layer 3) — after Layer 1+2; highest conflict potential
5. Route shims + cleanup            — last; shim-and-redirect pattern
```

---

## DS-5. Mobile-App Token Integration

React Native has no CSS engine. Colors are JavaScript values. The current mobile-app hardcodes hex strings directly in `packages/mobile-app/app/(tabs)/_layout.tsx` (confirmed: `backgroundColor: "#111111"`, `tabBarActiveTintColor: "#ffffff"`, `tabBarInactiveTintColor: "#666666"`, `borderTopColor: "#222222"`, `headerTintColor: "#ffffff"`).

**Pattern: JS Token Constants File**

```typescript
// packages/mobile-app/lib/theme.ts  (new file — GymClassOS-owned, fork-safe)
const SKINS = {
  hustle: {
    background:      "#111111",
    tabBarActive:    "#ffffff",
    tabBarInactive:  "#666666",
    border:          "#222222",
    primary:         "#ffffff",
  },
  default: {
    background:      "#0f0f0f",
    tabBarActive:    "#e5e5e5",
    tabBarInactive:  "#555555",
    border:          "#1a1a1a",
    primary:         "#e5e5e5",
  },
} as const;

const skin = (process.env.EXPO_PUBLIC_STUDIO_SKIN ?? "default") as keyof typeof SKINS;
export const colors = SKINS[skin] ?? SKINS.default;
```

`EXPO_PUBLIC_STUDIO_SKIN=hustle` is set in the EAS build profile in `eas.json`. The value is baked into the binary at build time — no runtime fetch needed. All screens import `{ colors } from "../../lib/theme"` rather than hardcoding hex strings.

Token parity with web is maintained manually for v1.1. A `studios/hustle/tokens.json` canonical source that both skin CSS and `theme.ts` are generated from is a future improvement.

---

## DS-6. Fork Boundary and Parallel-Branch Merge Constraints

### Files the Fork Boundary Protects (confirmed by inspection)

- `templates/*` — 22 upstream templates
- `packages-vendored/*`
- `packages/core/src/*` — including `agent-native.css` and `design-token-utils.ts`
- `packages/core/src/appearance/*` — upstream preset action

### Merge Conflict Surface

**MEDIUM risk:**

| File | Mitigation |
|---|---|
| `apps/staff-web/app/global.css` | Isolate `:root` block at top of file; keep utility-class section structurally intact during Phase 1; land token section edit as a single atomic commit |
| `apps/staff-web/app/components/layout/AppLayout.tsx` | Layer 1 label changes are minimal-diff; one small commit |

**LOW risk:** `apps/staff-web/app/components/gymos/*`, all `gymos.*.tsx` routes, `components/email/*` (master does not touch mail-template residue components).

**ZERO risk (new files, no master counterpart):**
- `apps/staff-web/app/skins/hustle.css`
- `apps/staff-web/app/skins/default.css`
- `apps/staff-web/server/plugins/skin-injector.ts`
- `packages/mobile-app/lib/theme.ts`
- Route shim files

**Strategy for first merge:** keep all Phase 1 changes additive (new files + single `:root` block edit). Higher-risk rename commits land in subsequent PRs after infrastructure is stable.

---

## DS-7. Build Order

```
packages/core (@agent-native/core)                      DO NOT MODIFY
        |
        |  @theme bridge — correct as-is
        v
Step 1: apps/staff-web/app/skins/hustle.css             CREATE
        apps/staff-web/app/skins/default.css            CREATE
        |
Step 2: apps/staff-web/app/global.css                   MODIFY — replace :root block
        |
Step 3: apps/staff-web/server/plugins/skin-injector.ts  CREATE
        |
Step 4: Public embeds (/embed/schedule etc.)            VERIFY — no code change needed
        |
Step 5a: UI label renames (Layer 1)                     MODIFY — gymos routes + layout
        |
Step 5b: CSS class renames (Layer 2)                    MODIFY — global.css + email components
        |
Step 5c: Code identifier renames (Layer 3)              MODIFY — pages, hooks, libs, route shims
        |
        +------ (independent of Steps 1-5) --------+
                                                    |
Step 6: packages/mobile-app/lib/theme.ts            CREATE
                                                    |
Step 7: Mobile screen hex replacements              MODIFY
```

Steps 1-4 are sequentially dependent. Steps 5a-5c are sequentially dependent. Step 6 is fully independent and can proceed in parallel with Steps 1-5.

### Build Order Table

| Step | What | Where | Blocks | Conflict risk |
|---|---|---|---|---|
| 1 | Create `skins/hustle.css`, `skins/default.css` | `apps/staff-web/app/skins/` | 2, 3 | Zero |
| 2 | Refactor `global.css` `:root` block only | `apps/staff-web/app/global.css` | 3 | Medium — isolate to file top |
| 3 | Write `skin-injector.ts` + wire `GYMOS_STUDIO_SKIN` | `apps/staff-web/server/plugins/` | 4 | Zero |
| 4 | Verify embeds pick up skin | verification only | — | — |
| 5a | UI label string renames | `routes/gymos.*`, `components/layout/`, `components/gymos/` | 5b | Low |
| 5b | CSS class additive aliases then migration | `global.css`, `components/email/*` | 5c | Low |
| 5c | Code identifier renames + route shims | `pages/`, `hooks/`, `lib/`, `routes/` | — | Medium |
| 6 | Create `packages/mobile-app/lib/theme.ts` | `packages/mobile-app/lib/` | 7 | Zero |
| 7 | Replace hex literals in mobile screens | `packages/mobile-app/app/` | — | Low |

---

## DS-8. New vs Modified Components Summary

### New Files (zero merge risk)

| File | Purpose |
|---|---|
| `apps/staff-web/app/skins/hustle.css` | Hustle studio CSS token values |
| `apps/staff-web/app/skins/default.css` | Neutral GymClassOS fallback |
| `apps/staff-web/server/plugins/skin-injector.ts` | Reads `GYMOS_STUDIO_SKIN`; injects `<style>` in SSR `<head>` |
| `packages/mobile-app/lib/theme.ts` | JS color/typography constants for React Native |

### Modified Files

| File | Change | Conflict risk |
|---|---|---|
| `apps/staff-web/app/global.css` | Replace `:root` HSL block; add semantic CSS class aliases | Medium |
| `apps/staff-web/app/components/layout/AppLayout.tsx` | UI label string changes | Low |
| `apps/staff-web/app/components/layout/Sidebar.tsx` | UI label string changes | Low |
| `apps/staff-web/app/components/gymos/GymosTopNav.tsx` | UI label string changes | Low |
| `apps/staff-web/app/routes/gymos.*.tsx` | Page title string changes | Low |
| `apps/staff-web/app/components/email/EmailListItem.tsx` | CSS class migration | Low |
| `apps/staff-web/app/components/email/EmailThread.tsx` | CSS class migration | Low |
| `apps/staff-web/app/routes/draft-queue.tsx` | Replace with redirect shim to `/gymos/inbox` | Low |
| `apps/staff-web/app/routes/draft-queue.$id.tsx` | Replace with redirect shim | Low |
| `apps/staff-web/app/routes/email.tsx` | Replace with redirect shim | Low |
| `packages/mobile-app/app/(tabs)/_layout.tsx` | Replace hex literals with `theme.colors.*` | Low |

### Untouched (confirmed fork boundary)

| Path | Reason |
|---|---|
| `templates/*` | Fork boundary |
| `packages-vendored/*` | Fork boundary |
| `packages/core/src/styles/agent-native.css` | `@theme` bridge is correct as-is |
| `packages/core/src/appearance/*` | Upstream preset system; GymClassOS skinning is deploy-time |

---

## DS-9. Integration Points Reference

| Integration Point | File(s) | Mechanism |
|---|---|---|
| Token definition | `apps/staff-web/app/skins/*.css` | CSS custom properties on `:root` |
| Token bridge (web) | `packages/core/src/styles/agent-native.css` | Already correct — no change needed |
| Skin selection | `GYMOS_STUDIO_SKIN` env var in `studios/<studio>/env.yml` | Deploy-time env var, not DB |
| Skin injection (SSR) | `apps/staff-web/server/plugins/skin-injector.ts` | Injects `<style>` in every SSR `<head>` |
| Embed token consumption | Shared Tailwind build via same `global.css` | Automatic — no separate wiring |
| Mobile token definition | `packages/mobile-app/lib/theme.ts` | JS constants; `EXPO_PUBLIC_STUDIO_SKIN` at EAS build |
| Mobile token consumption | All screen files under `packages/mobile-app/app/` | `import { colors } from "../../lib/theme"` |
| Encrypted API credentials | `apps/staff-web/server/db/schema.ts` `secrets` table | DB-backed pgcrypto; NOT for skin config |

---

*v1.1 design system integration research — 2026-06-12*
*Confidence: HIGH — all claims from direct file inspection of `C:\Users\dimet\gymclassos-br1` on branch `redesign/ui-refresh`*
*Files read: `apps/staff-web/app/global.css`, `apps/staff-web/components.json`, `packages/core/src/styles/agent-native.css`, `packages/core/src/server/design-token-utils.ts`, `packages/core/src/appearance/actions/`, `packages/core/package.json`, `apps/staff-web/package.json`, `apps/staff-web/server/db/schema.ts`, `apps/staff-web/app/routes/gymos.tsx`, full route file listing, `apps/staff-web/app/components/email/` listing, `apps/staff-web/app/components/gymos/` listing, `packages/mobile-app/app/(tabs)/_layout.tsx`, `packages/mobile-app/lib/api.ts`, `pnpm-workspace.yaml`, `.planning/PROJECT.md`*
