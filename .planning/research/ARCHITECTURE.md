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

---

# v1.2 Agentic Tab Editing -- Integration Architecture

**Milestone:** v1.2 -- Agent WRITE tools for Forms, Schedule, Members tabs in `apps/staff-web`
**Researched:** 2026-06-18
**Confidence:** HIGH -- all claims from direct inspection of working-tree files on `master`

---

## AE-1. The Core Question: New defineAction vs Refactor /api/ Handlers

**Decision: New `defineAction` files for every write operation. Do NOT refactor the existing `/api/forms/[...path].ts` HTTP handler into a shared utility layer.**

### Why Not Extract the /api/ Handler Logic?

`apps/staff-web/server/routes/api/forms/[...path].ts` is a monolithic H3 catch-all handler (329 lines). Its internals use H3 types (`H3Event`, `readBody`, `setResponseStatus`, `getRequestURL`), manual path segment parsing, and raw body access -- none accessible from a `defineAction` `run()` context. Extracting a shared CRUD service layer would require stripping all H3 coupling from the handler, creating intermediate service functions, and wiring both the H3 handler and `defineAction` `run()` to call them. That refactor is non-trivial risk to a working Forms surface mid-v1.2 with low reward.

The correct model is already established by the codebase: `actions/send-template-to-members.ts` is `defineAction`; the `/api/forms` HTTP handler is a separate thing; they both call `getDb()` + `schema.*` directly. There is no shared service layer for WhatsApp sends, and the codebase works fine. Follow that pattern.

**Rule:** For v1.2, each write operation becomes a standalone `defineAction` file that reads/writes Drizzle directly. The existing `/api/forms/[...path].ts` handler stays untouched. Over time (post-v1.2) the UI can migrate its `useFetcher` calls to point at the action endpoints (the correct long-term direction per Rule #3), but that is optional scope-creep outside v1.2.

---

## AE-2. Per-Tab Context-Awareness -- How the Agent Knows the Active Tab

### Current State (Confirmed by Inspection)

`apps/staff-web/app/hooks/use-navigation-state.ts` exports `useNavigationState()` which writes a `NavigationState` object to `/_agent-native/application-state/navigation` on a debounced PUT (500ms). The current interface includes `view`, `threadId`, `focusedEmailId`, `selectedThreadIds`, `search`, `label` -- all inbox/mail template vocabulary. The gym tabs (Forms, Schedule, Members) are not represented in the navigation state sync or in `view-screen.ts` branch logic.

The navigation state is **auto-injected into every user message as a `<current-screen>` block** -- the agent passively receives the active tab without calling `view-screen` first. This is the primary context delivery mechanism.

### What Needs to Change

**Step 1: Extend the NavigationState interface** in `use-navigation-state.ts`:

```typescript
export interface NavigationState {
  // existing fields unchanged
  view: string;           // add: "forms" | "form-builder" | "schedule" | "members" | "member-detail"
  formId?: string;        // active form in builder
  occurrenceId?: string;  // active occurrence in schedule detail pane
  memberId?: string;      // active member in detail view
  selectedDate?: string;  // active date in schedule grid (YYYY-MM-DD)
}
```

**Step 2: Call `sync()` from each tab's route component.** Currently none of the gym tab routes call `useNavigationState`. Each needs `sync()` called on mount (and on relevant state changes).

**Step 3: Update `view-screen.ts`** to branch on the new gym views and return relevant domain data. When `nav.view === "form-builder"` and `nav.formId` is set, fetch and return the form's fields + settings + status + responseCount.

**Step 4: Update the system prompt in `agent-chat.ts`** with per-tab capability descriptions. This is the largest single leverage point in the milestone.

### System Prompt Per-Tab Tool Guidance Pattern

```
When the user is on the Forms tab (view: "forms" or "form-builder"):
  Write tools: create-form, update-form, publish-form (propose->approve), archive-form, restore-form, unpublish-form
  Read tools: list-forms, get-form, view-screen

When the user is on the Schedule tab (view: "schedule"):
  Write tools: create-class-occurrence, update-occurrence-capacity, complete-occurrence,
               cancel-occurrence (propose->approve), reschedule-occurrence (propose->approve)
  Read tools: list-classes, list-fill-rate, list-occurrences

When the user is on the Members tab (view: "members" or "member-detail"):
  Write tools: update-member-profile (name, phone, email, notes ONLY; never consent or opt-in fields)
  Read tools: list-members, list-at-risk-members
```

---

## AE-3. The Propose->Approve Gate -- Per-Operation HITL Decision

The existing `propose-action` -> `approve-proposal` -> action pipeline is live. `approve-proposal.ts` has a hard `ACTION_ALLOWLIST`: `["send-template-to-members", "create-checkout-link"]`. New gateable actions must be added to both this allowlist AND to the Zod enum in `propose-action.ts` (two places -- update in the same commit).

### Decision Table: Direct vs Gate

| Operation | Gate? | Rationale |
|---|---|---|
| Create a DRAFT form | Direct | Invisible to members until published; reversible |
| Update a DRAFT form (title, description, fields, settings) | Direct | Same -- draft state, reversible |
| Publish a form (draft -> published) | **Gate** | Irreversible user-facing effect: public URL becomes live |
| Unpublish a form (published -> draft) | Direct | Removes public access; low risk |
| Archive a form (soft-delete) | Direct | Reversible via restore |
| Restore a form | Direct | Reversible |
| Create a class occurrence | Direct | No members affected yet |
| Update occurrence capacity | Direct | Action validates capacity >= current booking count; returns error if not |
| Cancel a class occurrence | **Gate** | Affects members with bookings; cancel-occurrence.ts should return {error:"BOOKINGS_EXIST", bookingCount} if bookings > 0, forcing the proposal path |
| Reschedule a class occurrence | **Gate** | Members booked based on original time |
| Mark occurrence completed | Direct | Administrative only; no member-facing effect |
| Update member profile (name, phone, email, notes) | Direct | Staff CRM edit, low risk |
| Update whatsapp_opt_in | **Never via agent** | GDPR/PECR -- excluded from Zod schema with `.strict()` |
| Update marketing_consent | **Never via agent** | Same compliance rationale |

### Extending the Allowlist

1. Add the new gated action names to `ACTION_ALLOWLIST` in `approve-proposal.ts`
2. Add the `import("./action-name.js")` branches in the dynamic dispatch in `approve-proposal.ts`
3. Extend the Zod enum in `propose-action.ts` to include the new action names
4. Do both in the same commit

No schema changes required -- `dashboard_proposals.action_name` is already a free `text` column.

---

## AE-4. Data Flow -- Per-Tab Detail

### Tab 1: Forms

**Tables:** `forms` (id, title, description, slug, fields JSON, settings JSON, status, createdAt, updatedAt, deletedAt), `responses` (read-only from agent).

**New actions:**

| Action | Inputs | HITL | Notes |
|---|---|---|---|
| `list-forms.ts` | `archived?: boolean` | Read | `http: { method: "GET" }` |
| `get-form.ts` | `formId: string` | Read | Returns fields+settings parsed from JSON |
| `create-form.ts` | `title: string, description?: string, fields?: Field[], settings?: object` | Direct | nanoid id, slugify(title), status:"draft" |
| `update-form.ts` | `formId: string, title?, description?, fields?, settings?` | Direct | Partial patch; schema MUST NOT include status; use `.strict()` |
| `publish-form.ts` | `formId: string` | **Gate** | status -> "published"; validate not deleted |
| `unpublish-form.ts` | `formId: string` | Direct | status -> "draft" |
| `archive-form.ts` | `formId: string` | Direct | deletedAt = now() |
| `restore-form.ts` | `formId: string` | Direct | deletedAt = null |

**Slug generation note:** `create-form.ts` must copy the `slugify()` + `makeUniqueSlug()` pure functions from the existing `/api/forms` handler -- they have no external dependencies. Do NOT import from the HTTP handler file (wrong layer boundary).

**Navigation sync:**
- `gymos.forms._index.tsx`: call `sync({ view: "forms" })` on mount
- `gymos.forms.$id.tsx`: call `sync({ view: "form-builder", formId: id })` on mount

**view-screen branch:** When `nav.view === "form-builder"` and `nav.formId` is set, fetch form by `nav.formId` and return fields + settings + status + responseCount.

### Tab 2: Schedule

**Tables:** `class_definitions`, `class_occurrences`, `bookings` (read for impact assessment).

**New actions:**

| Action | Inputs | HITL | Notes |
|---|---|---|---|
| `list-occurrences.ts` | `month?: string (YYYY-MM), definitionId?: string` | Read | Returns occurrences with booking counts |
| `create-class-occurrence.ts` | `definitionId: string, startsAt: string (ISO), endsAt: string (ISO), capacity?: number, instructorUserId?, room?` | Direct | status defaults to "scheduled"; validate definitionId exists |
| `update-occurrence-capacity.ts` | `occurrenceId: string, capacity: number` | Direct | Validate `capacity >= current booking count`; return `{error:"CAPACITY_TOO_LOW", bookingCount}` if not |
| `cancel-occurrence.ts` | `occurrenceId: string` | **Gate** | Count bookings with status="booked"; if > 0 return `{error:"BOOKINGS_EXIST", bookingCount}` without mutating -- agent then uses propose-action with impact in rationale |
| `reschedule-occurrence.ts` | `occurrenceId: string, startsAt: string (ISO), endsAt: string (ISO)` | **Gate** | |
| `complete-occurrence.ts` | `occurrenceId: string` | Direct | status -> "completed" |

**Navigation sync:**
- `gymos.schedule.tsx`: call `sync({ view: "schedule", selectedDate: date })` on day-cell select; extend with `occurrenceId` when occurrence detail pane is open

### Tab 3: Members

**Tables:** `gym_members` only. `whatsapp_opt_in` (separate table) and `marketing_consent` (column on `gym_members`) are explicitly excluded.

**New actions:**

| Action | Inputs | HITL | Notes |
|---|---|---|---|
| `update-member-profile.ts` | `memberId: string, firstName?, lastName?, email?, phoneE164?, notes?` | Direct | Zod schema uses `.strict()` and MUST NOT include marketingConsent, whatsappOptIn, userId. Add comment in file documenting deliberate exclusion. |

**Navigation sync:**
- `gymos.members.tsx`: call `sync({ view: "members" })` on mount
- `gymos.members_.$id.tsx`: call `sync({ view: "member-detail", memberId: id })` on mount

---

## AE-5. Optimistic UI Reconciliation with Agent Mutations

### The Problem

The three tab routes use RR v7 `loader` + `useFetcher` for their mutations. Loader data does NOT auto-refresh when the agent mutates the same rows via a `defineAction` call. After the agent updates a form title, the Forms tab still shows the old title until the user manually refreshes.

### The Solution: useChangeVersion + "action" source

The `real-time-sync` skill confirms: `useDbSync()` emits `source: "action"` after every non-GET `defineAction` completes. Templates fold this into query keys:

```typescript
// apps/staff-web/app/routes/gymos.forms._index.tsx
import { useChangeVersion } from "@agent-native/core/client";
import { useQuery } from "@tanstack/react-query";
import { useLoaderData } from "react-router";

export default function FormsIndex() {
  const initialForms = useLoaderData<typeof loader>().forms; // SSR hydration
  const v = useChangeVersion("action");
  const { data: forms = initialForms } = useQuery({
    queryKey: ["forms", v],
    queryFn: () => fetch("/_agent-native/actions/list-forms").then(r => r.json()),
    initialData: initialForms,
    staleTime: 2_000,
    placeholderData: (prev) => prev, // no flicker on refetch
  });
  // render forms...
}
```

**Key properties:**
- SSR hydration via `initialData` -- no blank flash on first navigation
- `staleTime: 2_000` prevents double-fetch when loader data is fresh
- Agent `defineAction` call emits `source: "action"`, `useChangeVersion("action")` increments, queryKey changes, React Query refetches -- tab updates within 2-second poll cycle
- UI-initiated mutations that POST to `/_agent-native/actions/:name` also trigger the same event -- one live-refresh mechanism covers both agent and UI writes
- `useDbSync({ ignoreSource: TAB_ID })` prevents the writing tab from refetching its own writes (jitter prevention per real-time-sync skill)

**For proposal-gated operations:** when the agent creates a `publish-form` or `cancel-occurrence` proposal, `dashboard_proposals` is written. The noticeboard at `/gymos` loads this table on navigation. Coach sees the proposal card on their next page visit.

---

## AE-6. New vs Modified Files

### New Files (15 actions + 0 schema changes, all additive)

| File | Purpose |
|---|---|
| `apps/staff-web/actions/list-forms.ts` | Read all non-deleted forms with response counts |
| `apps/staff-web/actions/get-form.ts` | Read single form with fields + settings |
| `apps/staff-web/actions/create-form.ts` | Create draft form (nanoid id, slugify title) |
| `apps/staff-web/actions/update-form.ts` | Patch safe fields only (not status); `.strict()` |
| `apps/staff-web/actions/publish-form.ts` | Draft -> published (HITL gated) |
| `apps/staff-web/actions/unpublish-form.ts` | Published -> draft (direct) |
| `apps/staff-web/actions/archive-form.ts` | Soft-delete (direct) |
| `apps/staff-web/actions/restore-form.ts` | Restore soft-deleted form (direct) |
| `apps/staff-web/actions/list-occurrences.ts` | Read occurrences with booking counts |
| `apps/staff-web/actions/create-class-occurrence.ts` | Create new occurrence (direct) |
| `apps/staff-web/actions/update-occurrence-capacity.ts` | Patch capacity (direct; validates vs booking count) |
| `apps/staff-web/actions/cancel-occurrence.ts` | Cancel occurrence (HITL gated) |
| `apps/staff-web/actions/reschedule-occurrence.ts` | Update starts_at/ends_at (HITL gated) |
| `apps/staff-web/actions/complete-occurrence.ts` | Mark occurrence completed (direct) |
| `apps/staff-web/actions/update-member-profile.ts` | Patch safe profile fields only; `.strict()` |

### Modified Files

| File | Change | Risk |
|---|---|---|
| `apps/staff-web/server/plugins/agent-chat.ts` | Add per-tab capability sections to system prompt; add all 15 new actions to tool list | Low |
| `apps/staff-web/app/hooks/use-navigation-state.ts` | Extend NavigationState interface with formId?, occurrenceId?, memberId?, selectedDate? | Low |
| `apps/staff-web/actions/view-screen.ts` | Add branches for form-builder, schedule, member-detail views | Low |
| `apps/staff-web/actions/approve-proposal.ts` | Add publish-form, cancel-occurrence, reschedule-occurrence to ACTION_ALLOWLIST + dynamic import branches | Low |
| `apps/staff-web/actions/propose-action.ts` | Extend Zod enum for new gated action names | Low |
| `apps/staff-web/app/routes/gymos.forms._index.tsx` | Add sync() on mount; migrate list fetch to useQuery + useChangeVersion("action") | Medium |
| `apps/staff-web/app/routes/gymos.forms.$id.tsx` | Add sync() with formId; migrate form fetch to useQuery | Medium |
| `apps/staff-web/app/routes/gymos.schedule.tsx` | Add sync() with selectedDate; migrate occurrence list to useQuery | Medium |
| `apps/staff-web/app/routes/gymos.members.tsx` | Add sync({ view: "members" }) on mount | Low |
| `apps/staff-web/app/routes/gymos.members_.$id.tsx` | Add sync({ view: "member-detail", memberId }) on mount | Low |
| `apps/staff-web/AGENTS.md` | Add all 15 new actions to Agent Actions table; document HITL decisions | Low |

### Explicitly Untouched

| File | Why |
|---|---|
| `apps/staff-web/server/routes/api/forms/[...path].ts` | Existing HTTP handler stays as-is; no refactor |
| `apps/staff-web/server/db/schema.ts` | No schema changes -- v1.2 uses existing tables |
| `apps/staff-web/server/db/forms-schema.ts` | No schema changes |

---

## AE-7. Suggested Build Order

**Forms first** -- simplest domain (single table, no booking impact, no compliance adjacency), logic proven by the existing `/api/forms` handler, directly demo-relevant (schedule-enquiry form). Schedule second -- most operationally used tab. Members last -- simplest technically but highest compliance attention (consent field exclusion).

Within each tab: **Actions first, then navigation sync, then system prompt, then useQuery migration.** This order lets the agent use the tools via `/_agent-native/actions/:name` before the UI wiring is complete, enabling independent end-to-end testing.

**Wave 1 -- Forms**
1. `list-forms.ts` + `get-form.ts` (read; deploy to verify registry pickup)
2. `create-form.ts` + `update-form.ts` (direct write; include slugify helpers)
3. `unpublish-form.ts` + `archive-form.ts` + `restore-form.ts` (direct)
4. `publish-form.ts` (gated; extend approve-proposal.ts allowlist + propose-action.ts enum in same commit)
5. Extend NavigationState + add sync() to gymos.forms._index.tsx + gymos.forms.$id.tsx
6. Update view-screen.ts for form-builder branch
7. Update agent-chat.ts system prompt for Forms section
8. Migrate forms routes to useQuery + useChangeVersion("action")
9. Update AGENTS.md table

**Wave 2 -- Schedule**
1. `list-occurrences.ts` (read)
2. `create-class-occurrence.ts` + `update-occurrence-capacity.ts` + `complete-occurrence.ts` (direct)
3. `cancel-occurrence.ts` + `reschedule-occurrence.ts` (gated; extend allowlist + enum)
4. Navigation sync + view-screen branch for schedule
5. System prompt update for Schedule section
6. useQuery migration for schedule
7. AGENTS.md update

**Wave 3 -- Members**
1. `update-member-profile.ts` (direct; consent exclusion documented in Zod schema with `.strict()`)
2. Navigation sync + view-screen branch for member-detail
3. System prompt update for Members section
4. AGENTS.md update

**Wave 4 -- Integration**
1. End-to-end agent test: create form -> update -> publish via propose->approve
2. Verify live-refresh: agent edits form, open Forms tab updates within 2s without manual refresh
3. Verify compliance gate: Zod `.parse({memberId:"x", whatsappOptIn:true})` on update-member-profile throws
4. Verify cancel-occurrence refuses direct execution when bookings exist

---

## AE-8. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| approve-proposal.ts allowlist + propose-action.ts Zod enum are two separate places that must stay in sync | Medium | Update both in same commit; add comment in approve-proposal.ts referencing propose-action.ts enum |
| update-form.ts accidentally including status field lets agent publish without gate | High | Use `z.object({...}).strict()` on update-form schema; omit status entirely; add code comment |
| cancel-occurrence with active bookings executed directly instead of via proposal | High | Inside cancel-occurrence.ts `run()`: count bookings with status="booked"; if > 0 return `{error:"BOOKINGS_EXIST", bookingCount}` without mutating. Agent must then call propose-action with impact in rationale. |
| useQuery migration double-fetch on first load | Low | `initialData: loaderData.forms` + `staleTime: 2000` eliminates redundant client fetch |
| Stale .generated/actions-registry.js after adding new action files | Medium | No local dev server -- trigger Vercel deploy after each wave to verify registry pickup. AGENTS.md "Adding a New Gym Action" step 4 already documents this. |
| Navigation state 500ms debounce vs immediate agent action | Low | Human-paced message flow means 500ms never matters in practice. Flag in PITFALLS.md for any future automated agent flows. |
| Agent attempts to update consent fields | Low | Zod `.strict()` on update-member-profile throws parse error before `run()` is reached. Verifiable with a unit test. |

---

## AE-9. Integration Points Reference

| Integration Point | File | Mechanism |
|---|---|---|
| Agent tool registration | `apps/staff-web/server/plugins/agent-chat.ts` | `loadActionsFromStaticRegistry(actionsRegistry)` auto-picks up new actions; system prompt must also name them |
| Action registry | `.generated/actions-registry.js` (gitignored) | Regenerated on dev server start or Vercel build |
| Active tab context delivery | NavigationState -> application-state/navigation | `useNavigationState().sync()` from each route component |
| Agent passive context | `<current-screen>` auto-injection in every user message | Framework does this automatically from navigation application-state |
| Agent active context | `view-screen` action | Extended per AE-4 with gym view branches |
| HITL gate | propose-action -> dashboard_proposals -> noticeboard -> approve-proposal | Existing pipeline; only allowlist + enum entries need adding |
| UI live-refresh after agent write | `useChangeVersion("action")` folded into React Query query keys | `useDbSync` emits `source:"action"` after every non-GET defineAction |
| UI optimistic mutations | `onMutate` cache update -> fire action -> `onError` rollback | Mandated by AGENTS.md conventions |
| No local dev verification | `tsc` + `vitest` for action unit tests, then Vercel deploy | Confirmed constraint in PROJECT.md v1.2 |

---

*v1.2 agentic tab editing integration architecture -- 2026-06-18*
*Confidence: HIGH -- all claims from direct inspection of `apps/staff-web/` working tree on `master` branch*
*Files read: `apps/staff-web/server/plugins/agent-chat.ts`, `apps/staff-web/actions/approve-proposal.ts`, `apps/staff-web/actions/propose-action.ts`, `apps/staff-web/actions/send-template-to-members.ts`, `apps/staff-web/server/routes/api/forms/[...path].ts`, `apps/staff-web/app/hooks/use-navigation-state.ts`, `apps/staff-web/actions/view-screen.ts`, `apps/staff-web/app/routes/gymos.forms._index.tsx`, `apps/staff-web/app/routes/gymos.schedule.tsx`, `apps/staff-web/app/routes/gymos.members.tsx`, `apps/staff-web/server/db/schema.ts`, `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.planning/PROJECT.md`, `AGENTS.md`*


---

---

# v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher — Integration Architecture

**Milestone:** v2.0 — Operator HQ (`apps/hq`) + Zero-touch Provisioning + PII-free Telemetry + Tier-2 Gym-owner Brain/Dispatcher
**Researched:** 2026-06-19
**Confidence:** HIGH for component topology (from direct repo inspection); MEDIUM for provisioning state-machine (Neon/Vercel/Fly APIs confirmed to exist; exact idempotency contracts unverified in prod); MEDIUM for Anthropic SDK token instrumentation (usage fields confirmed in SDK docs; exact wrapper integration point needs BD1 audit of createAgentChatPlugin internals)

---

## V2-0. The Three Structural Decisions That Drive v2.0

Before diagrams: the constraints from PROJECT.md that shape this milestone's architecture.

1. **apps/hq is a NEW deployable above the tenant layer.** It has its own Neon project, its own Better-auth instance, its own pnpm workspace app. It is NOT a super-admin route inside `apps/staff-web`. The existing per-studio deploys are untouched; HQ sits above them.
2. **HQ never queries a studio Neon.** All cross-tier data flows upward (studio → HQ telemetry push). HQ reads its own Neon exclusively. This is the structural PII boundary: member data never leaves the studio Neon, because HQ has no credentials to reach it.
3. **Provisioning runs inside HQ's own Fly worker.** The provisioning orchestrator is a multi-step, long-running workflow with external API calls (Neon API, Vercel API, Fly Machines API). It cannot run in a Vercel serverless function (timeout) or in an H3 loader (same problem). It runs as a pg-boss job inside a dedicated `services/hq-worker` Fly process against HQ's Neon.

---

## V2-1. System Overview (Three Tiers + HQ Layer)

```
 TIER 1 — OPERATOR HQ  (single instance, operator-only access)
 ┌────────────────────────────────────────────────────────────────────┐
 │  apps/hq  (Vercel — separate project from apps/staff-web)          │
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  React Router v7 SSR — single super-admin Better-auth login  │  │
 │  │  /hq               dashboard / pilot report                  │  │
 │  │  /hq/studios       provisioned studio list + health          │  │
 │  │  /hq/brain         HQ Brain (gym-owner knowledge base)       │  │
 │  │  /hq/dispatch      HQ Dispatcher (comms to gym-owners only)  │  │
 │  │  /hq/content       website content generation (Content tmpl) │  │
 │  │  /hq/content/video video generation (Videos template)        │  │
 │  │  POST /api/signup  public signup endpoint (no auth guard)     │  │
 │  │  POST /api/telemetry  ingest endpoint (token auth, no session)│  │
 │  └──────────────────────┬───────────────────────────────────────┘  │
 │                         │ Drizzle / neon-http                       │
 │                         ▼                                           │
 │  HQ Neon Postgres  (hq-prod — single project)                      │
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  hq_studios           provisioned customer registry          │  │
 │  │  hq_provisioning_runs step-by-step saga log                  │  │
 │  │  hq_studio_tokens     per-studio bearer token hashes         │  │
 │  │  hq_telemetry_snapshots  aggregate metrics, NO PII           │  │
 │  │  hq_token_usage       AI token counts by studio + date       │  │
 │  │  brain_*              Brain template tables (gym-owner model) │  │
 │  │  dispatch_*           Dispatch template tables                │  │
 │  │  documents / compositions  Content + Video template tables   │  │
 │  │  pgboss.*             HQ worker queue schema                  │  │
 │  └──────────────────────────────────────────────────────────────┘  │
 │                                                                     │
 │  services/hq-worker  (Fly.io — separate app from gymos-edge-webhooks)  │
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  pg-boss workers:                                            │  │
 │  │   provision-studio    Saga orchestrator (8 forward steps)    │  │
 │  │   brain-ingest        HQ Brain distillation queue            │  │
 │  └──────────────────────────────────────────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────┘
           │ authenticated telemetry POST (aggregate only, no PII)
           │ per-studio bearer token
           ▼
 TIER 2 — STUDIO DEPLOY  (one per gym customer, fully independent)
 ┌────────────────────────────────────────────────────────────────────┐
 │  apps/staff-web  (Vercel per-studio)                               │
 │  EXISTING routes + ADDITIVE in v2.0:                               │
 │   /gymos/brain      Tier-2 Brain (classes, fitness methods, brand) │
 │   /gymos/settings   extended with digest/heartbeat toggles         │
 │  NEW: anthropic.ts wrapper instruments every SDK call              │
 │                         │ Drizzle / neon-http                      │
 │                         ▼                                          │
 │  Studio Neon Postgres  (per-studio — unchanged table topology)     │
 │  ADDITIVE tables in v2.0:                                          │
 │   studio_telemetry_state   token accumulator singleton             │
 │   studio_owner_config      owner phone, timezone, GOD toggles      │
 │   brain_*                  GOB Brain template tables               │
 │                                                                    │
 │  services/worker  (Fly.io per-studio — EXTENDED, not replaced)    │
 │  EXISTING queues: inbound-whatsapp, outbound-whatsapp,             │
 │                   stripe-event, class-reminder, housekeeping       │
 │  NEW queues (v2.0):                                                │
 │   telemetry-push       cron 02:00 UTC daily                        │
 │   daily-owner-digest   cron 06:00 studio-tz daily                 │
 │   heartbeat-reactivate cron 09:00 studio-tz daily                 │
 └────────────────────────────────────────────────────────────────────┘
           │
  Tier-3 members via mobile + WhatsApp — architecture unchanged
```

---

## V2-2. Component Responsibilities (New and Modified)

### New Components

| Component | Location | Responsibility | Owns (writes) | Never writes |
|---|---|---|---|---|
| `apps/hq` | Vercel — separate deploy | Operator dashboard: studio list, HQ Brain, HQ Dispatcher, Content/Video generation | HQ Neon only | ANY studio Neon — structurally impossible (no studio DB URL in HQ env) |
| `packages/hq-schema` | pnpm workspace package | Drizzle schema for HQ Neon (shared between `apps/hq` and `services/hq-worker`) | Schema definitions only | — |
| `services/hq-worker` | Fly.io — new app `hq-worker` | Provisioning Saga orchestrator + HQ Brain ingest queue | HQ Neon (provisioning runs, telemetry) | Studio Neons |
| HQ signup endpoint | `apps/hq/server/routes/api/signup.ts` | Public H3 route: validate signup, insert `hq_studios`, enqueue `provision-studio` | `hq_studios` | — |
| HQ telemetry ingest | `apps/hq/server/routes/api/telemetry.ts` | Token-authenticated public route: validate, Zod-parse, upsert snapshots | `hq_telemetry_snapshots`, `hq_token_usage` | Any member-level data — Zod schema rejects PII fields at parse time |
| Anthropic wrapper | `apps/staff-web/server/lib/anthropic.ts` (new) | Wraps `anthropic.messages.create`; extracts `usage.input_tokens + output_tokens`; calls accumulator | `studio_telemetry_state` token columns | Nothing else |
| Telemetry push job | `services/worker/src/queues/telemetry-push.ts` (new) | Daily cron: read `studio_telemetry_state`, assemble `TelemetrySnapshot`, POST to HQ ingest, reset accumulators | `studio_telemetry_state.last_push_at` | HQ Neon directly |
| Daily digest job | `services/worker/src/queues/daily-owner-digest.ts` (new) | Generates owner day-summary; enqueues outbound-whatsapp for owner phone | `messages` (via queue enqueue) | Bypasses sendMessage — NEVER |
| Heartbeat reactivate job | `services/worker/src/queues/heartbeat-reactivate.ts` (new) | Queries at-risk members; enqueues one outbound-whatsapp per member (up to batch limit) | Enqueues to `outbound-whatsapp` only | Member data sent to HQ |

### Modified Components

| Component | Location | Change | Category | Risk |
|---|---|---|---|---|
| `services/worker/src/index.ts` | Existing | Register 3 new pg-boss queues + workers + 3 cron schedules | TEL + GOD | Low — additive |
| `services/worker/src/lib/env.ts` | Existing | Add `HQ_INGEST_URL`, `STUDIO_TELEMETRY_TOKEN`, `STUDIO_ID`, `STUDIO_TIMEZONE` (all optional; absent = feature disabled) | TEL + GOD | Low |
| `apps/staff-web/server/db/schema.ts` | Existing | Add `studio_telemetry_state`, `studio_owner_config`, Brain template tables | TEL + GOD + GOB | Low — additive |
| `apps/staff-web/server/plugins/agent-chat.ts` | Existing | Replace direct Anthropic SDK call with `anthropic.ts` wrapper; add `ask-brain` to tool list + system prompt | TEL + GOB | Medium |
| `packages/queue/src/types.ts` | Existing | Add `TelemetryPushPayload`, `DailyDigestPayload`, `HeartbeatReactivatePayload` Zod types | TEL + GOD | Low |
| `packages/queue/src/index.ts` | Existing | Export 3 new enqueue helpers | TEL + GOD | Low |
| `pnpm-workspace.yaml` | Existing | Add `packages/hq-schema`, `services/hq-worker` to workspace | HQ-FND | Low |

---

## V2-3. Fork-Boundary Discipline for `apps/hq`

`apps/hq` adapts four upstream templates: Dispatch, Brain, Content, Videos. The fork-boundary rule is identical to how `apps/staff-web` adapts Mail + Calendar:

```
gymos/
├── apps/
│   ├── staff-web/                    EXISTING — unchanged topology
│   └── hq/                           NEW sibling app
│       ├── app/
│       │   └── routes/
│       │       ├── hq._index.tsx     HQ dashboard (original)
│       │       ├── hq.studios.tsx    Studio list + health (original)
│       │       ├── hq.brain.tsx      COPY from templates/brain/app/routes/
│       │       ├── hq.dispatch.tsx   COPY from templates/dispatch/app/routes/
│       │       ├── hq.content.tsx    COPY from templates/content/app/routes/
│       │       └── hq.videos.tsx     COPY from templates/videos/app/routes/
│       ├── actions/
│       │   ├── run.ts                COPY from templates/brain/actions/run.ts
│       │   ├── ask-brain.ts          COPY from templates/brain/actions/ask-brain.ts
│       │   ├── list-studios.ts       ORIGINAL — HQ-specific
│       │   ├── trigger-provision.ts  ORIGINAL — enqueues provision-studio job
│       │   └── ...                   other brain/dispatch/content/video action copies
│       ├── server/
│       │   ├── db/
│       │   │   ├── schema.ts         imports from packages/hq-schema (NOT staff-web schema)
│       │   │   └── migrations/       HQ-only migrations (separate from studio migrations)
│       │   ├── plugins/
│       │   │   ├── agent-chat.ts     HQ agent; HQD system prompt constraint built in
│       │   │   └── db.ts             runMigrations for HQ Neon
│       │   └── middleware/
│       │       └── auth.ts           Better-auth against HQ Neon (separate instance)
│       ├── react-router.config.ts
│       ├── vite.config.ts
│       ├── drizzle.config.ts         points to HQ_DATABASE_URL (NOT studio DATABASE_URL)
│       ├── vercel.json               separate Vercel project
│       └── package.json              name: "@gymos/hq"
│
├── packages/
│   ├── queue/                        EXISTING + extended
│   └── hq-schema/                   NEW
│       ├── src/
│       │   ├── schema.ts             hq_studios, hq_provisioning_runs, hq_studio_tokens,
│       │   │                         hq_telemetry_snapshots, hq_token_usage
│       │   ├── telemetry.ts          TelemetrySnapshot Zod schema (shared with worker)
│       │   └── index.ts
│       └── package.json              name: "@gymos/hq-schema"
│
├── services/
│   ├── edge-webhooks/                EXISTING — unchanged
│   ├── worker/                       EXISTING + extended (3 new queues)
│   └── hq-worker/                   NEW
│       ├── src/
│       │   ├── queues/
│       │   │   ├── provision-studio.ts  Saga orchestrator
│       │   │   └── brain-ingest.ts      HQ Brain distillation
│       │   ├── lib/
│       │   │   ├── db.ts             Drizzle WS → HQ_DATABASE_URL_UNPOOLED
│       │   │   ├── env.ts            NEON_API_KEY, VERCEL_API_TOKEN, FLY_API_TOKEN, etc.
│       │   │   └── provision-apis/
│       │   │       ├── neon.ts       Neon Management API wrapper
│       │   │       ├── vercel.ts     Vercel API wrapper
│       │   │       └── fly.ts        Fly Machines API wrapper
│       │   └── index.ts              boots HQ worker; healthz PORT 3003
│       ├── fly.toml                  separate Fly app (hq-worker)
│       └── package.json              name: "@gymos/hq-worker"
│
└── templates/                        UNTOUCHED — fork boundary preserved
    ├── brain/                        source for hq/actions/ copy-out
    ├── dispatch/                     source for hq/actions/ copy-out
    ├── content/                      source for hq/routes/ copy-out
    └── videos/                       source for hq/routes/ copy-out
```

**Copy-out discipline:** Brain, Dispatch, Content, and Video template files are COPIED into `apps/hq/` then modified. Originals in `templates/` stay untouched. `apps/hq/server/db/schema.ts` imports from `packages/hq-schema`, not from any template barrel.

---

## V2-4. Provisioning Saga State Machine

### Why a Saga, Not a Transaction

Provisioning involves calls to three external APIs (Neon, Vercel, Fly) plus HQ DB writes. There is no distributed transaction across external APIs. The Saga pattern — forward steps with registered compensations, LIFO rollback on failure — is the correct model.

### Steps (Forward)

```
Step 0: STARTED
  Insert hq_provisioning_runs (status='started', all step_N_at = NULL)
  Idempotency: if run row exists for this studio_id with status NOT IN
  ('failed_terminal','completed'), skip insert and resume from last completed step

Step 1: NEON_CREATED
  POST https://console.neon.tech/api/v2/projects
    { name: "<studio-slug>", region_id: "aws-eu-west-2", pg_version: 16 }
  Response includes project.id + connection_uri (pooled) + connection_uri_unpooled
  Write neon_project_id + db URLs to hq_provisioning_runs; raw credentials
  stored encrypted in HQ secrets table
  Compensation: DELETE /v2/projects/{project_id}

Step 2: MIGRATIONS_RUN
  Connect to new Neon (DATABASE_URL_UNPOOLED from Step 1)
  Run drizzle-kit migrate against apps/staff-web schema
  Compensation: none (Step 1 compensation deletes the project)

Step 3: SEED_RUN
  Run studio seed script against new Neon:
    - Create admin user (owner_email from signup)
    - Default class definitions
    - Default WhatsApp templates
    - INSERT studio_owner_config (owner_phone, studio_timezone from signup form)
  Compensation: none (project deletion handles cleanup)

Step 4: VERCEL_PROJECT_CREATED
  POST https://api.vercel.com/v9/projects
    { name: "gymos-<studio-slug>", framework: "react-router",
      gitRepository: { type: "github", repo: "<fork-org/gymos>" } }
  PUT /v9/projects/{id}/env  -- set DATABASE_URL, BETTER_AUTH_SECRET,
    ANTHROPIC_API_KEY, HQ_INGEST_URL, STUDIO_ID, STUDIO_TIMEZONE, etc.
  POST /v13/deployments  -- trigger initial deploy
  Write vercel_project_id to hq_provisioning_runs
  Compensation: DELETE /v9/projects/{project_id}

Step 5: FLY_APP_CREATED
  POST https://api.machines.dev/v1/apps
    { app_name: "gymos-<studio-slug>-worker", org_slug: "<fly-org>" }
  Set Fly secrets via flyctl or Machines API:
    DATABASE_URL_UNPOOLED, WHATSAPP_ACCESS_TOKEN, STRIPE_SECRET_KEY, etc.
  POST /v1/apps/{name}/machines  -- create machine with pre-built gymos-worker image
    (web process: edge-webhooks; worker process: pg-boss workers)
  Write fly_app_name to hq_provisioning_runs
  Compensation: DELETE /v1/apps/gymos-<studio-slug>-worker

Step 6: DNS_CONFIGURED
  Set subdomain CNAME via Vercel project domain API or registrar API
  Write subdomain to hq_provisioning_runs
  Compensation: remove DNS record

Step 7: TOKEN_ISSUED
  Generate 256-bit random telemetry token (nanoid-based, opaque)
  Compute token_hash = sha256(token)
  INSERT hq_studio_tokens (studio_id, token_hash) ON CONFLICT DO NOTHING
  Set STUDIO_TELEMETRY_TOKEN on Vercel project env + Fly app secret
  Compensation: revoke (UPDATE hq_studio_tokens SET revoked_at=NOW())

Step 8: REGISTERED  (terminal success)
  UPDATE hq_studios SET status='active', provisioned_at=NOW()
  UPDATE hq_provisioning_runs SET status='completed', completed_at=NOW()
  Send "your studio is live" email to owner
  No compensation needed
```

### Idempotency Contract

Each step checks `step_N_at IS NULL` before executing. If already set, skip forward.

- Neon: on 409 (duplicate project name), read the existing `project_id` from the error response and proceed.
- Vercel: on 409 (project name conflict), fetch the existing project by name and continue.
- Fly: on 400 (app name taken), treat as success and continue.
- Token issuance: `ON CONFLICT (studio_id) DO NOTHING` — second call is a no-op.

### Rollback (Compensation)

On step N failure after step N-1 succeeded, execute compensations in reverse (LIFO):
- Each compensation is best-effort; failures are logged to `hq_provisioning_runs.compensation_errors` JSON, not re-raised.
- Terminal failure: set `status='failed_terminal'`, `hq_studios.status='provision_failed'`. HQ UI exposes manual cleanup.

### Where It Runs

The `provision-studio` pg-boss job runs in `services/hq-worker` against HQ Neon only. pg-boss drives exponential back-off retries. Job payload: `{ studioId, slug, ownerEmail, planId }`.

### Signup Trigger

The marketing site signup form POSTs to `POST /api/signup` in `apps/hq/server/routes/api/signup.ts`:
1. Validate email + plan; check no duplicate `hq_studios` row.
2. INSERT `hq_studios` (status='pending').
3. Enqueue `provision-studio` job.
4. Return 202. Redirect to `/pending` page. Completion email sent at Step 8.

This endpoint is in `publicPaths` for the HQ Better-auth guard — no session required.

---

## V2-5. Telemetry Contract

### PII Boundary (Structural, Not Policy)

Four structural mechanisms prevent member PII from reaching HQ:

| Mechanism | What it enforces |
|---|---|
| HQ Neon has no studio DB credentials | HQ cannot query any studio's `gym_members`, `conversations`, or any other studio table. The only path from studio to HQ is the authenticated telemetry POST. |
| `TelemetrySnapshot` Zod schema with strict parsing | The ingest endpoint calls `TelemetrySnapshot.parse(body)` in strict mode. Any payload field not in the schema causes a 400 rejection. The schema has no `phone`, `email`, `name`, `memberId`, or `conversationId` field. |
| HQD system prompt constraint (text) | "You MUST NEVER send messages about specific members or reference member PII. HQ Neon contains only aggregate telemetry — no member records." The agent has nothing to leak even if the constraint were bypassed, because HQ Neon physically contains no member data. |
| Separate auth instances | `apps/hq` Better-auth is a separate instance against HQ Neon. Studio staff cannot log in to HQ. HQ operators cannot log in to studio staff-web. Session boundary is a deployment boundary. |

### Telemetry Payload Schema

```typescript
// packages/hq-schema/src/telemetry.ts
export const TelemetrySnapshot = z.object({
  studioId: z.string(),               // from STUDIO_ID env var (NOT derived from member data)
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),

  // Engagement — aggregate counts, no PII
  activeMembers7d: z.number().int(),
  activeMembers30d: z.number().int(),
  newMembersThisPeriod: z.number().int(),
  classesHeld: z.number().int(),
  totalBookings: z.number().int(),
  avgFillRate: z.number(),            // 0-1 ratio

  // Retention
  atRiskCount: z.number().int(),
  churnedThisPeriod: z.number().int(),

  // AI token usage — counts only, no content
  llmInputTokens: z.number().int(),
  llmOutputTokens: z.number().int(),
  llmRequestCount: z.number().int(),

  // Worker health
  outboundMessagesSent: z.number().int(),
  outboundMessagesFailed: z.number().int(),
});
```

### Token Authentication

```
POST https://hq.gymclassos.com/api/telemetry
Authorization: Bearer <STUDIO_TELEMETRY_TOKEN>
Content-Type: application/json
<TelemetrySnapshot JSON>
```

HQ ingest handler steps:
1. Extract `Bearer <token>`.
2. Compute `sha256(token)`.
3. `SELECT studio_id FROM hq_studio_tokens WHERE token_hash = $1 AND revoked_at IS NULL`.
4. `TelemetrySnapshot.strict().parse(body)` — rejects unknown fields.
5. `INSERT INTO hq_telemetry_snapshots ... ON CONFLICT (studio_id, period_start) DO UPDATE`.
6. `INSERT INTO hq_token_usage ... ON CONFLICT (studio_id, date) DO UPDATE SET ... = ... + $delta`.
7. Enqueue `brain-ingest` job to HQ pg-boss.
8. Return 200.

### Token-Usage Instrumentation (Studio Side)

All Anthropic calls in `apps/staff-web` route through `createAgentChatPlugin` in `agent-chat.ts`. The wrapper intercepts at the SDK level:

```typescript
// apps/staff-web/server/lib/anthropic.ts  (NEW)
import Anthropic from "@anthropic-ai/sdk";
import { accumulateTokenUsage } from "./telemetry-accumulator.js";

const client = new Anthropic();

export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
) {
  const response = await client.messages.create(params);
  // response.usage is always present on non-streaming responses
  await accumulateTokenUsage(
    response.usage.input_tokens,
    response.usage.output_tokens,
  );
  return response;
}
```

`accumulateTokenUsage` does an atomic SQL increment on `studio_telemetry_state`:

```typescript
await db.execute(sql`
  UPDATE studio_telemetry_state
  SET token_usage_today_input  = token_usage_today_input  + ${inputTokens},
      token_usage_today_output = token_usage_today_output + ${outputTokens},
      request_count_today      = request_count_today + 1,
      updated_at               = NOW()
  WHERE id = 'singleton'
`);
```

The telemetry push job at 02:00 UTC reads these totals and resets them after successful push.

### HQ Tables

```sql
-- packages/hq-schema — new tables
CREATE TABLE hq_studios (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  owner_email   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  plan_id       TEXT,
  provisioned_at TEXT,
  created_at    TEXT NOT NULL DEFAULT NOW()
);

CREATE TABLE hq_provisioning_runs (
  id                  TEXT PRIMARY KEY,
  studio_id           TEXT NOT NULL REFERENCES hq_studios(id),
  status              TEXT NOT NULL DEFAULT 'started',
  neon_project_id     TEXT,
  vercel_project_id   TEXT,
  fly_app_name        TEXT,
  subdomain           TEXT,
  step_1_at TEXT, step_2_at TEXT, step_3_at TEXT, step_4_at TEXT,
  step_5_at TEXT, step_6_at TEXT, step_7_at TEXT, step_8_at TEXT,
  compensation_errors TEXT NOT NULL DEFAULT '{}',
  started_at          TEXT NOT NULL DEFAULT NOW(),
  completed_at        TEXT,
  updated_at          TEXT NOT NULL DEFAULT NOW()
);

CREATE TABLE hq_studio_tokens (
  studio_id   TEXT PRIMARY KEY REFERENCES hq_studios(id),
  token_hash  TEXT NOT NULL UNIQUE,   -- sha256(token); raw token never stored
  created_at  TEXT NOT NULL DEFAULT NOW(),
  revoked_at  TEXT
);

CREATE TABLE hq_telemetry_snapshots (
  id           TEXT PRIMARY KEY,
  studio_id    TEXT NOT NULL REFERENCES hq_studios(id),
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at  TEXT NOT NULL DEFAULT NOW(),
  UNIQUE(studio_id, period_start)
);

CREATE TABLE hq_token_usage (
  studio_id     TEXT NOT NULL REFERENCES hq_studios(id),
  date          TEXT NOT NULL,         -- YYYY-MM-DD
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT NOW(),
  PRIMARY KEY(studio_id, date)
);
```

### Studio Tables (Additive)

```sql
-- apps/staff-web/server/db/schema.ts — additive migration
CREATE TABLE studio_telemetry_state (
  id                       TEXT PRIMARY KEY DEFAULT 'singleton',
  token_usage_today_input  INTEGER NOT NULL DEFAULT 0,
  token_usage_today_output INTEGER NOT NULL DEFAULT 0,
  request_count_today      INTEGER NOT NULL DEFAULT 0,
  outbound_sent_today      INTEGER NOT NULL DEFAULT 0,
  outbound_failed_today    INTEGER NOT NULL DEFAULT 0,
  last_push_at             TEXT,
  last_push_status         TEXT,   -- 'ok' | 'error'
  last_push_error          TEXT,
  updated_at               TEXT NOT NULL DEFAULT NOW()
);

CREATE TABLE studio_owner_config (
  id                   TEXT PRIMARY KEY DEFAULT 'singleton',
  owner_phone_e164     TEXT NOT NULL,
  studio_timezone      TEXT NOT NULL DEFAULT 'Europe/London',
  digest_enabled       INTEGER NOT NULL DEFAULT 1,
  heartbeat_enabled    INTEGER NOT NULL DEFAULT 1,
  heartbeat_batch_size INTEGER NOT NULL DEFAULT 50,
  created_at           TEXT NOT NULL DEFAULT NOW(),
  updated_at           TEXT NOT NULL DEFAULT NOW()
);
```

---

## V2-6. Tier-2 Gym-owner Brain (GOB)

GOB is the Brain template adapted for a gym studio's own knowledge: classes, fitness methods, instructor bios, studio ethos, brand voice. It runs INSIDE each studio deploy, not in HQ.

**Component placement:**
- Copy `templates/brain/app/routes/` into `apps/staff-web/app/routes/gymos.brain.tsx`
- Copy `templates/brain/actions/` into `apps/staff-web/actions/` (prefixed `brain-*` to avoid collision)
- Add Brain template tables to `apps/staff-web/server/db/schema.ts` via additive migration: `brain_sources`, `brain_raw_captures`, `brain_knowledge`, `brain_proposals`, `brain_sync_runs`, `brain_ingest_queue`

**System prompt integration:** `apps/staff-web/server/plugins/agent-chat.ts` system prompt gains a Brain section; `ask-brain` is added to the tool list so the gym-facing agent can query studio knowledge (class descriptions, instructor specialties, studio policies).

**What GOB does NOT contain:** member data. GOB sources are staff-authored or imported from public studio content (website copy, class descriptions). The PII boundary holds because GOB has no fields for member records.

---

## V2-7. Tier-2 Gym-owner Dispatcher (GOD)

### Job 1: `daily-owner-digest` (cron: 06:00 studio-tz)

1. pg-boss cron fires at 06:00 local time (from `studio_owner_config.studio_timezone`).
2. Worker calls existing domain functions (reused as pure functions, not via HTTP): `list-fill-rate` logic, `list-renewals` logic, `list-at-risk-members` logic.
3. Assembles digest data. Calls Anthropic SDK (through `anthropic.ts` wrapper) to generate natural-language summary.
4. Looks up owner phone from `studio_owner_config.owner_phone_e164`.
5. Inserts `messages` row (status='queued'). Enqueues to `outbound-whatsapp` queue with template `owner_daily_digest`.
6. The existing `sendMessage` chokepoint applies all gates (opt-in, window, template-approved) identically to staff sends. No backdoor.

### Job 2: `heartbeat-reactivate` (cron: 09:00 studio-tz)

1. pg-boss cron fires at 09:00 local time.
2. Run `list-at-risk-members` SQL query. Get list of at-risk member IDs.
3. For each (up to `studio_owner_config.heartbeat_batch_size = 50` per day):
   a. Skip if no `whatsapp_opt_in` row (opt-in pre-checked here AND re-checked in chokepoint).
   b. INSERT `messages` row (status='queued', messageId='msg_`<nanoid>`').
   c. `enqueueOutboundWhatsApp({ messageId, memberId, payload: { type: 'template', name: 'member_reactivation', vars: {...} } })`.
4. Accumulate `outbound_sent_today` in `studio_telemetry_state`.

The existing `sendMessage` chokepoint in `services/worker/src/domain/sendMessage.ts` is the ONLY path to the WhatsApp API. GOD does not call `sendViaMyutik` directly.

---

## V2-8. HQ Brain (HQB) and HQ Dispatcher (HQD)

### HQB: Gym-owner Model

HQB is the Brain template inside `apps/hq`, pointed at HQ Neon. Sources:
- `hq_telemetry_snapshots` (aggregate metrics, no PII) — each studio is a `brain_sources` row; each telemetry period becomes a `brain_raw_captures` entry processed by the Brain distillation pipeline into `brain_knowledge`.
- HQ-authored notes about studios (provisioning history, health notes, plan info).

The HQ agent uses `ask-brain` to answer: "Which studios are at risk of churning?", "What's Hustle's engagement trend over the last 30 days?", "Which studios are not using the digest feature?".

### HQD: Gym-owner Dispatcher

HQD is the Dispatch template inside `apps/hq`. Destinations are gym-owner contact details. The system prompt enforces the operator communication constraint:

```
HQD CONSTRAINT: You may only send messages to gym-owners about GymClassOS
product features, system updates, onboarding guidance, or aggregate performance
insights (never quoting specific member counts from a studio's data unless
derived from their own telemetry snapshot). You MUST NEVER send a message that
references, implies knowledge of, or derives from any specific gym member,
booking, conversation, or any PII. HQ Neon contains only aggregate telemetry
and studio registry data — never member records.
```

HQD uses the Dispatch template's `dispatchDestinations` table for gym-owner contact info. Outbound messages flow through the operator's own WhatsApp Business account (separate WABA from any studio's WABA).

---

## V2-9. Data Flow Diagrams

### Flow 1: Signup to Provisioned Studio (PROV)

```
Marketing site form → POST /api/signup (apps/hq, public)
  validate + INSERT hq_studios (status='pending')
  enqueueProvisionStudio to HQ pg-boss → return 202
    ↓
services/hq-worker: provision-studio job
  Step 1 → Neon project created → project_id + db URLs saved
  Step 2 → migrations run against new Neon
  Step 3 → seed (admin user, class defs, owner_config row)
  Step 4 → Vercel project created + env vars set + deploy triggered
  Step 5 → Fly app + machines created + secrets set
  Step 6 → subdomain DNS configured
  Step 7 → telemetry token generated + hashed → stored + set as env var
  Step 8 → hq_studios status='active' → owner email sent
```

### Flow 2: Daily Telemetry Push (TEL)

```
services/worker (studio) — 02:00 UTC cron
  telemetry-push job
    1. SELECT FROM studio_telemetry_state (singleton row)
    2. COUNT active members 7d/30d, classes, bookings
    3. Assemble TelemetrySnapshot → Zod validate (no PII fields exist)
    4. POST https://hq.gymclassos.com/api/telemetry
         Authorization: Bearer <STUDIO_TELEMETRY_TOKEN>
    5. On 200: RESET accumulator columns, UPDATE last_push_at='ok'
    6. On error: log, keep accumulators (retry accumulates into next day)
        ↓
apps/hq POST /api/telemetry (token-authenticated, no session)
  sha256(token) → lookup hq_studio_tokens → get studio_id
  TelemetrySnapshot.strict().parse(body) → rejects PII
  UPSERT hq_telemetry_snapshots
  UPSERT hq_token_usage
  enqueue brain-ingest to HQ pg-boss
  return 200
        ↓
services/hq-worker: brain-ingest job
  process new snapshot → brain_raw_captures → Brain distillation pipeline
  → brain_knowledge entries (gym-owner aggregate performance facts)
```

### Flow 3: Heartbeat Reactivation (GOD)

```
services/worker (studio) — 09:00 studio-tz cron
  heartbeat-reactivate job
    1. list-at-risk-members SQL → at-risk member IDs
    2. For each (up to batch_size):
       pre-check opt-in → skip if missing
       INSERT messages (status='queued', messageId='msg_<nanoid>')
       enqueueOutboundWhatsApp({ messageId, memberId, template: 'member_reactivation' })
    3. accumulate outbound_sent_today in studio_telemetry_state
        ↓
outbound-whatsapp queue (EXISTING — unchanged)
  sendMessage chokepoint:
    hasOptIn re-check (defence in depth)
    isInWindow gate
    isTemplateApproved gate
    sendViaMyutik (EXISTING path)
    UPDATE messages.status = 'sent' | 'failed'
```

---

## V2-10. New vs Modified Components (Canonical List)

### New Files / Packages

| Component | Location | Category |
|---|---|---|
| `apps/hq/` (entire app) | `apps/hq/` | HQ-FND |
| `packages/hq-schema/` | `packages/hq-schema/` | HQ-FND |
| `services/hq-worker/` | `services/hq-worker/` | HQ-FND + PROV |
| `services/hq-worker/src/queues/provision-studio.ts` | above | PROV |
| `services/hq-worker/src/lib/provision-apis/neon.ts` | above | PROV |
| `services/hq-worker/src/lib/provision-apis/vercel.ts` | above | PROV |
| `services/hq-worker/src/lib/provision-apis/fly.ts` | above | PROV |
| `apps/hq/server/routes/api/signup.ts` | `apps/hq/` | PROV |
| `apps/hq/server/routes/api/telemetry.ts` | `apps/hq/` | TEL |
| `apps/hq/actions/list-studios.ts` | `apps/hq/` | HQ-FND |
| `apps/hq/actions/trigger-provision.ts` | `apps/hq/` | PROV |
| Brain action copies in `apps/hq/actions/` | `apps/hq/` | HQB |
| Dispatch action copies in `apps/hq/actions/` | `apps/hq/` | HQD |
| Content + Video route copies in `apps/hq/app/routes/` | `apps/hq/` | HQD |
| `apps/staff-web/server/lib/anthropic.ts` | `apps/staff-web/` | TEL |
| `apps/staff-web/server/lib/telemetry-accumulator.ts` | `apps/staff-web/` | TEL |
| `services/worker/src/queues/telemetry-push.ts` | `services/worker/` | TEL |
| `services/worker/src/queues/daily-owner-digest.ts` | `services/worker/` | GOD |
| `services/worker/src/queues/heartbeat-reactivate.ts` | `services/worker/` | GOD |
| `apps/staff-web/app/routes/gymos.brain.tsx` | `apps/staff-web/` | GOB |
| Brain action copies in `apps/staff-web/actions/brain-*.ts` | `apps/staff-web/` | GOB |
| Brain tables migration | `apps/staff-web/server/db/migrations/` | GOB |
| `studio_telemetry_state` migration | `apps/staff-web/server/db/migrations/` | TEL |
| `studio_owner_config` migration | `apps/staff-web/server/db/migrations/` | GOD |
| `packages/hq-schema/src/telemetry.ts` | `packages/hq-schema/` | TEL |
| `services/hq-worker/src/queues/brain-ingest.ts` | `services/hq-worker/` | HQB |

### Modified Files

| File | Change | Category | Risk |
|---|---|---|---|
| `services/worker/src/index.ts` | Register 3 new queues + cron schedules | TEL + GOD | Low — additive |
| `services/worker/src/lib/env.ts` | Add optional env vars for TEL + GOD | TEL + GOD | Low |
| `apps/staff-web/server/db/schema.ts` | Add 2 new tables + Brain tables | TEL + GOD + GOB | Low — additive |
| `apps/staff-web/server/plugins/agent-chat.ts` | Anthropic wrapper + brain tool exposure | TEL + GOB | Medium |
| `packages/queue/src/types.ts` | 3 new payload types | TEL + GOD | Low |
| `packages/queue/src/index.ts` | 3 new enqueue helpers | TEL + GOD | Low |
| `pnpm-workspace.yaml` | Add 2 new workspace members | HQ-FND | Low |

### Explicitly Untouched

| Path | Reason |
|---|---|
| `templates/*` | Fork boundary — all adaptation via copy-out |
| `services/worker/src/domain/sendMessage.ts` | GOD reuses the chokepoint without modification |
| `services/worker/src/queues/outbound-whatsapp.ts` | No change — GOD enqueues TO this queue |
| `apps/staff-web/server/db/schema.ts` existing tables | No modifications — strictly additive migrations |
| `services/edge-webhooks/` | Not involved in v2.0 |

---

## V2-11. Build Order (Dependency-Ordered)

```
Priority 1 — Foundation (everything depends on this):
  HQ-FND: packages/hq-schema + apps/hq skeleton (auth, routes, agent-chat)
           + HQ Neon project provisioned manually
           + services/hq-worker skeleton (boss.ts, env.ts, index.ts)
           + pnpm-workspace.yaml additions

Priority 2 — Parallel after HQ-FND:

  PROV: services/hq-worker/queues/provision-studio.ts (Saga)
        + provision-apis/* (neon.ts, vercel.ts, fly.ts)
        + apps/hq/server/routes/api/signup.ts
        + hq_studios / hq_provisioning_runs / hq_studio_tokens tables

  TEL:  packages/hq-schema/src/telemetry.ts (TelemetrySnapshot Zod schema)
        + apps/hq/server/routes/api/telemetry.ts (ingest endpoint)
        + hq_telemetry_snapshots / hq_token_usage tables
        + apps/staff-web/server/lib/anthropic.ts (SDK wrapper)
        + studio_telemetry_state migration
        + services/worker/src/queues/telemetry-push.ts

Priority 3 — Parallel after Priority 2:

  HQB:  apps/hq brain route + action copies + HQB system prompt
        + services/hq-worker brain-ingest queue
        (depends on HQ-FND + TEL telemetry snapshots as Brain input)

  HQD:  apps/hq dispatch route + action copies + HQD system prompt constraint
        + Dispatch operator WhatsApp account setup
        (depends on HQ-FND only; can overlap with HQB in same phase)

  GOB:  apps/staff-web brain route + action copies + brain tables migration
        + GOB section in agent-chat.ts system prompt
        (depends on HQ-FND fork-boundary discipline confirmed + TEL wrapper in place)

  GOD:  services/worker daily-owner-digest + heartbeat-reactivate queues
        + studio_owner_config migration
        + packages/queue type + enqueue additions
        + member_reactivation + owner_daily_digest template registration
        (depends on TEL accumulator in place; PROV provides owner_config seed)

Priority 4 — Integration:
  PROV end-to-end test (signup form → live studio with telemetry pushing to HQ)
  HQB feeding from real telemetry snapshots
  GOD sends flowing through real sendMessage chokepoint
```

### Recommended Phase Grouping for Roadmap

| Phase | Categories | Rationale |
|---|---|---|
| BD1: HQ Foundation | HQ-FND | Creates `apps/hq`, HQ Neon, HQ auth, `services/hq-worker` skeleton, workspace wiring. Prerequisite for all other phases. |
| BD2: Telemetry + Provisioning | TEL + PROV (parallel plans) | Both depend only on BD1. TEL (studio instrumentation) ships independently of PROV. Provisioning Saga is the highest-risk deliverable — ship early to discover API gotchas. |
| BD3: HQ Brain + Dispatcher | HQB + HQD (parallel plans) | Both inside `apps/hq`; HQB needs BD2 telemetry snapshots as Brain input. Can be parallel plans within one phase. |
| BD4: Studio Brain + Dispatcher | GOB + GOD (parallel plans) | Studio-side additions. GOB is additive (Brain route + tables). GOD reuses existing worker + chokepoint — low risk. Can be parallel plans. |

---

## V2-12. Anti-Patterns (v2.0-specific)

### Anti-Pattern 1: HQ polling studio Neons for telemetry

**What people do:** Give HQ connection strings for each studio Neon; HQ runs aggregate queries directly.
**Why wrong:** Breaks single-tenant isolation; HQ credential leak exposes all studios; N connection pools in HQ; member PII directly accessible.
**Instead:** Studio-push model (V2-5). HQ receives aggregate, PII-stripped snapshots on a schedule.

### Anti-Pattern 2: Provisioning steps in a Vercel serverless function

**What people do:** Signup handler runs all 8 steps synchronously inside the H3 route.
**Why wrong:** Vercel function timeout (max 300s Pro) is exceeded by 8 sequential external API chains; no idempotent re-entry on failure; no retry.
**Instead:** Enqueue a pg-boss job; provisioning runs in `services/hq-worker` with per-step idempotency and exponential back-off.

### Anti-Pattern 3: GOD heartbeat bypassing sendMessage

**What people do:** Heartbeat job calls `sendViaMyutik` directly to avoid queue overhead.
**Why wrong:** Bypasses opt-in gate, window gate, and template-approved gate; violates Meta policy; corrupts `messages` delivery state.
**Instead:** Insert a `messages` row and enqueue to `outbound-whatsapp`. The chokepoint is inviolable.

### Anti-Pattern 4: Editing `templates/brain/` in place for HQ adaptations

**What people do:** Modify the upstream Brain template directly because copy-out seems wasteful.
**Why wrong:** Next `git merge upstream/main` overwrites those changes.
**Instead:** Copy target files from `templates/brain/` into `apps/hq/` and modify the copies. `templates/` is the merge landing zone.

### Anti-Pattern 5: Storing the raw telemetry token in the database

**What people do:** Store `token TEXT` in `hq_studio_tokens` for easy lookup.
**Why wrong:** DB leak exposes all studio telemetry endpoints to spoofing; raw tokens in DB are a standard credential-leak vector.
**Instead:** Store only `token_hash = sha256(token)`. The raw token lives only in Fly/Vercel secrets. Lookup uses `WHERE token_hash = sha256($incoming)`.

---

## V2-13. Integration Points Reference

| Integration Point | Files | Mechanism |
|---|---|---|
| Signup trigger | `apps/hq/server/routes/api/signup.ts` | Public H3 route; INSERT `hq_studios`; enqueue `provision-studio` |
| Provisioning Saga | `services/hq-worker/src/queues/provision-studio.ts` | pg-boss single-worker job; per-step `step_N_at` idempotency |
| Neon project API | `services/hq-worker/src/lib/provision-apis/neon.ts` | `POST https://console.neon.tech/api/v2/projects` with `Authorization: Bearer <NEON_API_KEY>` |
| Vercel project API | `services/hq-worker/src/lib/provision-apis/vercel.ts` | Vercel SDK or `POST https://api.vercel.com/v9/projects` + env + deployment |
| Fly Machines API | `services/hq-worker/src/lib/provision-apis/fly.ts` | `POST https://api.machines.dev/v1/apps` + `POST .../machines` |
| Telemetry token issuance | `provision-studio.ts` Step 7 | nanoid → sha256 → `hq_studio_tokens`; raw token → Vercel/Fly secret |
| AI token instrumentation | `apps/staff-web/server/lib/anthropic.ts` | Wraps `anthropic.messages.create`; reads `response.usage.*`; calls accumulator |
| Telemetry push (studio→HQ) | `services/worker/src/queues/telemetry-push.ts` | pg-boss cron 02:00 UTC; `POST /api/telemetry` with bearer token |
| Telemetry ingest (HQ) | `apps/hq/server/routes/api/telemetry.ts` | Token hash lookup → Zod parse → upsert snapshots + usage |
| HQB Brain ingest | `services/hq-worker/src/queues/brain-ingest.ts` | Triggered after ingest; processes snapshot → `brain_raw_captures` → distillation |
| GOD digest send | `services/worker/src/queues/daily-owner-digest.ts` | INSERT messages + enqueue outbound-whatsapp for owner phone |
| GOD heartbeat send | `services/worker/src/queues/heartbeat-reactivate.ts` | INSERT messages + enqueue outbound-whatsapp per at-risk member (batch) |
| sendMessage chokepoint | `services/worker/src/domain/sendMessage.ts` | UNCHANGED — all GOD sends flow through this |

---

## V2-14. Scaling Considerations

| Concern | At 10 studios | At 100 studios | At 500+ studios |
|---|---|---|---|
| HQ Neon load | Negligible | Minimal | Enable Neon autoscaling; add read replica for Brain queries |
| Telemetry ingest | ~10 daily POSTs | ~100 daily POSTs | Batch ingest endpoint + rate limit per token |
| Provisioning Saga concurrency | Sequential fine (rare event) | Sequential fine | Set pg-boss `localConcurrency > 1` on provision queue |
| HQB Brain distillation | ~10 captures/day | ~100 captures/day | HQ worker concurrency bump; Brain jobs are CPU not I/O |
| hq-worker Fly machine | 1 small machine | 1 medium machine | 2-3 machines for HA |
| Per-studio worker/Neon | Independent at every scale level | Independent | Each studio's own resources — linear in N studios, not per user |

---

## Sources

- Direct inspection of `C:\Users\dimet\hustle` working tree on `master` (2026-06-19):
  `apps/staff-web/server/db/schema.ts`, `services/worker/src/index.ts`, `services/worker/src/queues/outbound-whatsapp.ts`, `services/worker/src/domain/sendMessage.ts`, `services/worker/src/queues/housekeeping.ts`, `services/worker/src/lib/env.ts`, `packages/queue/src/types.ts`, `packages/queue/src/boss.ts`, `services/edge-webhooks/fly.toml`, `templates/brain/server/db/schema.ts`, `templates/dispatch/server/db/schema.ts`, `templates/content/server/db/schema.ts`, `apps/staff-web/server/plugins/agent-chat.ts`, `apps/staff-web/server/lib/app-secrets.ts`, `pnpm-workspace.yaml`, `.planning/PROJECT.md`, `.planning/research/ARCHITECTURE.md` (v1.0-v1.2 sections)
- Neon Management API (`api-docs.neon.tech/reference/createproject`, `neon.com/blog/provision-postgres-neon-api`) — MEDIUM confidence: API confirmed to exist and accept project creation; idempotency on duplicate project names follows standard 409 pattern
- Vercel API + SDK (`vercel.com/changelog/vercel-ts`, `vercel.com/docs/project-configuration/vercel-ts`) — MEDIUM confidence: Vercel SDK and REST API confirmed; TypeScript types available
- Fly Machines API (`fly.io/docs/machines/api/`, `fly.io/docs/machines/api/apps-resource/`) — MEDIUM confidence: `POST /v1/apps` confirmed; `org_slug` required; machine creation via Machines resource confirmed
- Anthropic TypeScript SDK (`platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript`) — HIGH confidence: `response.usage.input_tokens` + `response.usage.output_tokens` fields are documented and stable
- Saga pattern (`dev.to/gabrielanhaia/saga-compensation-for-a-payments-flow-that-actually-unwinds`) — HIGH confidence in pattern; LIFO compensation stack is standard
- pg-boss v12 patterns — HIGH confidence: `boss.schedule()` + `boss.work()` + `boss.createQueue()` proven in existing `services/worker/` codebase

---

*v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher integration architecture — 2026-06-19*
*Confidence: HIGH for component topology, fork-boundary discipline, PII boundary mechanisms, and chokepoint reuse (all from direct repo inspection and proven patterns); MEDIUM for provisioning API specifics (APIs confirmed but not tested); MEDIUM for Anthropic token wrapper integration point (needs BD1 audit of createAgentChatPlugin internals to identify exact call-site)*
