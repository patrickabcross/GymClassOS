# Phase P1b: Webhook + Worker Spine (Stripe + WhatsApp) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
**Areas discussed:** Deploy topology & demo cutover, Repo layout & adapter shape, Outbound send UX, Scope/validation/P0 deps

---

## Deploy topology & demo cutover

### Q1: edge-webhooks + worker process model on Fly

| Option | Description | Selected |
|--------|-------------|----------|
| One Fly app, two processes | Single fly.toml [processes] block; web (Hono receiver) + worker (pg-boss). Same image, ~$5/mo. Failure-isolated by Fly restarts. ARCHITECTURE.md proposed shape. | ✓ |
| Two separate Fly apps | Independent scaling/rollback/logs. ~2× baseline cost. | |
| One Fly app, ONE process | Hono + pg-boss in same event loop. Cheapest (~$3/mo). Risk: slow worker job blocks webhook ack budget. | |

**User's choice:** One Fly app, two processes (Recommended).
**Notes:** Failure-isolated process model + cost-efficient + matches architecture spec.

### Q2: Demo WhatsApp webhook cutover

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel run, flip Meta URL last | Stand up Fly receiver at new URL; replay synthetic payloads; flip Meta URL in one click. | ✓ |
| Hard cutover | Delete demo route + deploy new in same PR + repoint Meta. High blast radius. | |
| Keep both forever | Dead code as fallback. | |

**User's choice:** Parallel run, flip Meta URL last (Recommended).
**Notes:** Avoid breaking the live customer demo while P1b lands.

### Q3: Fly region for the gymos-demo app

| Option | Description | Selected |
|--------|-------------|----------|
| lhr (London) | UK customer; lowest Meta + Neon latency. | ✓ |
| iad (Virginia) | Cheapest/most documented. Adds ~150ms outbound. | |
| Match Neon project region at plan-time | Optimise DB round-trips first. | |

**User's choice:** lhr (London) (Recommended).
**Notes:** Customer is UK-based; lowest member-phone latency. Planner verifies Neon region at plan-time.

### Q4: Stripe webhook receiver placement

| Option | Description | Selected |
|--------|-------------|----------|
| Same Fly app, same Hono receiver | Both endpoints on apps/edge-webhooks. Shared idempotency, shared queue, one deploy. | ✓ |
| Separate Fly process for Stripe | Blast-radius isolation. Overkill at 1 customer. | |
| Stripe on Vercel, WA on Fly | Split brain across hosts. | |

**User's choice:** Same Fly app, same Hono receiver (Recommended).
**Notes:** Shared infrastructure for HMAC + idempotency + queue producer.

---

## Repo layout & adapter shape

### Q1: Refactor templates/mail/ → apps/staff-web/ in P1b?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer staff-web refactor to P0 audit | P1b creates only apps/edge-webhooks + apps/worker + packages/whatsapp. Tighter scope; templates/mail stays. | |
| Refactor in P1b as Task 1 | Move templates/mail/ → apps/staff-web/ first. Cleaner fork boundary. +1-2 days. | ✓ |
| Half-and-half copy | Copy gymos.* routes into apps/staff-web; leave templates/mail intact. Risky schema divergence. | |

**User's choice:** Refactor in P1b as Task 1.
**Notes:** User explicitly chose the bigger lift to avoid TWO sets of merge conflicts (one for apps/ creation now, another for staff-web move later). Bundles fork-boundary cleanup with apps/ creation.

### Q2: sendMessage() location and adapter shape

| Option | Description | Selected |
|--------|-------------|----------|
| packages/whatsapp = transport only; worker owns gates | Adapter does sendText/sendTemplate. Worker domain code is the chokepoint. Testable in isolation. WA-09 one-file-swap honoured. | ✓ |
| packages/whatsapp = transport + gates | Adapter takes full pipeline (memberId, payload, db). Conflicts with WA-09 thin-adapter spec. | |
| No package, all in worker | Worker calls @great-detail/whatsapp directly. Loses escape hatch (PITFALL #19). | |

**User's choice:** packages/whatsapp = transport ONLY; worker owns gates (Recommended).
**Notes:** Honours WA-09 thin-adapter contract; preserves test isolation.

### Q3: Queue API between staff-web and worker

| Option | Description | Selected |
|--------|-------------|----------|
| Shared packages/queue helper | Typed publisher functions imported by both apps. Queue-name + payload changes caught at compile time. | ✓ |
| Direct pg-boss client import everywhere | No abstraction; runtime typo risk. | |
| REST enqueue endpoint on edge-webhooks | Network hop + auth layer for internal traffic. Overkill in monorepo. | |

**User's choice:** Shared packages/queue helper (Recommended).
**Notes:** Single typed contract; mirrors "actions are the single source of truth" rule.

### Q4: Schema additions for P1b

| Option | Description | Selected |
|--------|-------------|----------|
| One additive migration adding all P1b tables | Single migration; easy to reason about; strictly additive per CLAUDE.md. | ✓ |
| Split: WhatsApp tables migration + Stripe tables migration | Two atomic migrations. Cleaner audit trail. | |
| Just-in-time per task | Schema half-finished between commits. | |

**User's choice:** One additive migration adding all P1b tables (Recommended).
**Notes:** Single migration; additive only.

---

## Outbound send UX

### Q1: Optimistic insert vs wait-for-ack

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic insert: queued → sent → delivered | Action inserts message + enqueues + returns. UI shows message immediately with clock icon. Status flips as worker progresses. CLAUDE.md mandate. | ✓ |
| Action waits for queue ack | Spinner ~50ms until job confirmed. Less optimistic. | |
| Synchronous send through worker | Blocks UI 1-3s. Defeats chokepoint pattern. | |

**User's choice:** Optimistic insert: 'queued' → 'sent' → 'delivered' (Recommended).
**Notes:** Coach never waits; optimistic UI default honoured.

### Q2: Worker rejection UX

| Option | Description | Selected |
|--------|-------------|----------|
| UI pre-gates AND worker enforces | Inbox loader exposes window/opt-in state; UI gates send button; worker re-validates. Defence in depth per PROJECT.md "BOTH layers". | ✓ |
| Worker-only rejection, UI shows error on message bubble | Simpler. Conflicts with PROJECT.md mandate. | |
| Block action server-side before enqueue | Couples staff-web to gate logic. Conflicts with chokepoint pattern. | |

**User's choice:** UI pre-gates AND worker enforces (Recommended).
**Notes:** Both layers; UI for instant feedback, worker for authoritative enforcement.

### Q3: Window-state indicator visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Show per-conversation in list + thread header | Green dot/grey badge on every row + prominent in thread header. Coach scans inbox at a glance. | ✓ |
| Only in thread header | Less clutter; must open thread to know. | |
| Hide; rely on disabled send button | Coach learns by failing to send. Worst flow. | |

**User's choice:** Show per-conversation in list + thread header (Recommended).
**Notes:** Data must flow for WA-05/06 enforcement; minimal viable INBX-05 ships here (full polish P2).

### Q4: Queue/worker progress sync mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| TanStack Query refetch on focus + on send | Status flips lag a few seconds. No SSE infra. RR v7 loader+action native. | ✓ |
| Short polling every 3s while thread open | Faster updates; more DB load. | |
| SSE channel for message status events | ~200ms updates. Significant infra (Vercel SSE = PITFALL #16 zone). | |

**User's choice:** TanStack Query refetch on focus + on send (Recommended).
**Notes:** Good enough for 1-coach-per-studio v1; no SSE infra to build.

---

## Scope, validation depth, P0 dependencies

### Q1: Stripe handler scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 5 reducers | checkout.session.completed, invoice.paid, invoice.payment_failed, subscription.updated/deleted, charge.refunded. Idempotent reducers; mostly fixture work after architecture lands. | ✓ |
| Checkout + invoice.paid only | Cover happy path; defer subscription churn + refund handlers. ~1-2 day savings; risk of phantom passes. | |
| Just checkout.session.completed | Bare minimum; not enough for a paying customer. | |

**User's choice:** All 5 reducers (Recommended).
**Notes:** Architecture work is shared; reducers are mostly fixture wrangling. Avoid Day-1 phantom passes.

### Q2: Validation depth

| Option | Description | Selected |
|--------|-------------|----------|
| Integration tests for 4 success-criteria + unit tests for gates | Stripe CLI replay, WA replay, sendMessage() typed errors, tampered HMAC 400. Vitest gate logic. ~1 day. | ✓ |
| Minimum: gate unit tests + manual replay | Half day. Risk of regression catches in production. | |
| Full bar: P1b criteria + 50-concurrent + chaos test | +2-3 days. BKG concern, not P1b. Overkill. | |

**User's choice:** Integration tests for the 4 P1b success-criteria scenarios + unit tests for gates (Recommended).
**Notes:** Matches the 4 explicit success criteria; 50-concurrent is BKG-03's contract in P2.

### Q3: P0 credential dependency strategy

| Option | Description | Selected |
|--------|-------------|----------|
| P1b builds against test creds; P0 swaps real creds at cutover | Stripe test mode + Meta dev sandbox. P0 = credential-swap exercise. WA-08 sync ships with fixture templates. | ✓ |
| Block P1b until P0 ships first | Wait for customer Stripe acct + Meta approval. Loses ~1 week if external deps slip. | |
| Stub Stripe entirely; ship WhatsApp half of P1b first | Two phases (P1b-wa / P1b-stripe). Workflow overhead. | |

**User's choice:** P1b builds against test creds; P0 swaps real creds at cutover (Recommended).
**Notes:** Implies P1b runs before P0 in this sequencing (vs ROADMAP order); P0 becomes credential-swap exercise.

### Q4: Phase boundary

| Option | Description | Selected |
|--------|-------------|----------|
| P1b ships exactly the 18 listed reqs (WEB-01..06, STR-03..07, WA-03..09) | NOTIF/WAIT/BKG-03/INBX-04 stay in P2. Minimum viable window indicator + send-button gate ships here as P1b support deliverable. | ✓ |
| P1b also ships NOTIF-01 (class reminders) | Proves pg-boss scheduling end-to-end. +1-2 days. | |
| P1b also ships INBX-04 + INBX-05 fully | Polish staff inbox. +2-3 days of UI; blends infra phase with UX. | |

**User's choice:** P1b ships exactly the 18 listed reqs (Recommended).
**Notes:** Tight scope; the indicator badge ships as a support deliverable but full INBX-05 polish remains P2.

---

## Claude's Discretion

Decisions left to the planner / executor (see CONTEXT.md §"Claude's Discretion" for full list):

- fly.toml exact shape (release_command for pg-boss schema migrate? machine type? autoscale=false?)
- whatsapp_window_state as materialised table vs view (default: VIEW)
- packages/db/ extraction decision (default: keep schema in apps/staff-web/server/db/ unless cyclic import emerges)
- pg-boss retentionDays / archiveCompletedAfterSeconds / deleteAfterDays tuning
- Stripe SDK apiVersion exact pin string (latest stable at plan-phase time)
- Error-code surface in failed message bubbles (friendly string vs raw code)
- Window-badge exact copy
- Worker startup order (boss start → migrations → subscribe; or migrations → boss → subscribe)
- Rotation UI placement specifics
- Test fixture format and location
- Pino logging defaults (full PII redaction in P1a)

## Deferred Ideas

See CONTEXT.md §deferred for the full list with target phases. Top items:

- NOTIF-01..05 → P2
- WAIT-01..06 → P2
- BKG-03/04 → P2
- INBX-04 / full INBX-05 → P2
- SET-01..03 → P2
- 50-concurrent webhook stress test → post-launch
- SSE for live message status → post-v1
- DEP-01..04 multi-studio deploy → P1a/P0
- OBS-01 full PII redaction → P1a
- OBS-02 full /healthz metrics → P1a
- Stripe Customer Portal link UX (PAY-04) → P2

### Reviewed Todos (not folded)

None — `gsd-tools todo match-phase P1b` returned 0 matches.
