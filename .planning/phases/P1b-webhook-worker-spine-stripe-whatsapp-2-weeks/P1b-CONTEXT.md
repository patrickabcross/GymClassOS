# Phase P1b: Webhook + Worker Spine (Stripe + WhatsApp) — Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Every external event from Stripe or Meta is received by an always-on Fly.io webhook receiver, HMAC-verified against raw body BEFORE any JSON parse, persisted to `webhook_events` idempotently, and reduced by pg-boss workers running against the same Neon Postgres (no Redis). Every outbound WhatsApp send goes through a single `sendMessage()` chokepoint in `apps/worker/` that enforces 24h-window + `whatsapp_opt_in` gates by reading `conversations.last_inbound_at` at call time. Stripe restricted-API-key is stored pgcrypto-encrypted and rotation-capable.

**In scope (18 requirements):**
- **WEB-01..06** — apps/edge-webhooks Hono receiver on Fly always-on; raw-body HMAC verify; webhook_events ON CONFLICT DO NOTHING; pg-boss worker; idempotent re-runs; Stripe constructEvent + apiVersion pin + refetch-from-Stripe.
- **STR-03..07** — Five Stripe reducers: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. All idempotent (verified by replay-twice test).
- **WA-03..09** — Inbound materialisation + dedup on `(provider, external_id)`; ordinal-guarded message status updates; worker chokepoint sendMessage(); 24h-window enforcement; opt-in gate; daily template-sync housekeeping; thin `packages/whatsapp/` adapter.

**Out of scope this phase (kicked elsewhere — see Deferred):**
- NOTIF-01..05 (template reminders) → P2 — they CONSUME the spine, building them here couples scope.
- WAIT-01..06 (waitlist + reply-to-confirm) → P2.
- BKG-03/04 (atomic booking) → P2.
- INBX-04 (template picker polish), INBX-05 full spec (hours-left calc + design) → P2. The P1b UI ships a minimal window-state badge + send-button gate because the data must flow for WA-05/06 enforcement, but the polished version is P2.
- Customer's actual Stripe account creation + Meta template approval → P0 (FND-06/07).

**Quality bar:** Production. Single migration is strictly additive (CLAUDE.md no-breaking-DB-changes). All gates enforced at BOTH UI (defence in depth) AND worker layer (chokepoint = source of truth). All access goes through `accessFilter`/`assertAccess` per AGENTS.md unscoped-query guard.

</domain>

<decisions>
## Implementation Decisions

### Deploy topology

- **D-01:** **One Fly app, two processes** via `[processes]` block in `fly.toml`. `web` process runs Hono receiver on port 3001; `worker` process runs pg-boss subscriber (no exposed port). Same Docker image; Fly auto-restarts processes independently. Baseline cost ~$5/mo (one shared-cpu-1x machine). ARCHITECTURE.md proposed shape ratified.
- **D-02:** **Fly region = `lhr` (London).** First customer is UK-based; lowest member-phone latency to Meta + acceptable to Neon (verify Neon's gymos-demo region at plan-time; if Neon is `eu-west-1`/Ireland or `fra1`/Frankfurt, lhr is closest). If Neon turns out to be us-east, planner re-evaluates.
- **D-03:** **Stripe webhook hosted on the same Fly app** as WhatsApp. `apps/edge-webhooks/` exposes `POST /webhooks/whatsapp`, `GET /webhooks/whatsapp` (Meta verify_token), and `POST /webhooks/stripe`. Shared pg-boss producer, shared `webhook_events` table, shared raw-body HMAC discipline (`stripe.webhooks.constructEvent()` for Stripe). One deploy, one log stream.

### Demo cutover

- **D-04:** **Parallel-run cutover**, not hard cutover. Stand up `apps/edge-webhooks` on Fly at a separate URL. Replay synthetic Meta + Stripe payloads against it until green (HMAC verify, idempotency, enqueue, processing all verified). Then update Meta's webhook subscription URL in Meta Business Manager — old URL stops, Fly URL starts. Demo UI continues to read from Neon either way; no inbox break.
- **D-05:** **Delete `templates/mail/app/routes/webhooks.whatsapp.tsx`** as the last task of P1b (after Meta URL flip is verified). Don't keep it as a fallback — AGENTS.md "no backwards-compat shims" + the dead-code-rots rule.

### Repo layout & fork-boundary refactor

- **D-06:** **Refactor `templates/mail/` → `apps/staff-web/` as Task 1 of P1b** (~1–2 days mechanical move). This is the first task before any webhook/worker code lands. Includes: copy `templates/mail/app/` → `apps/staff-web/app/`, copy `templates/mail/server/db/schema.ts` → `apps/staff-web/server/db/schema.ts`, copy gymos.* routes (gymos.tsx, gymos.schedule.tsx, gymos.members.*.tsx, /api/m/*), copy `.env.local` → `apps/staff-web/.env.local`, set up `apps/staff-web/package.json` with own deps, wire workspace into root `pnpm-workspace.yaml`. Templates/mail goes back to upstream-clean (no gymos.* routes).
- **D-07:** Reasoning: the demo-time fork-boundary loosening (D0 commit `98c0e926`) was always tagged "post-demo P0 audit moves to apps/staff-web/". Since we're already creating `apps/` for `apps/edge-webhooks` and `apps/worker` in P1b, do the staff-web move at the same time to avoid TWO sets of merge conflicts with upstream (one when we add apps/, another when we move staff-web later). Tradeoff: P1b is ~2 days longer than minimum, but avoids redoing the apps/ git churn twice. P0 audit still validates the result.
- **D-08:** Three new top-level workspace packages and apps land in P1b:
  - `apps/staff-web/` — moved from templates/mail/ (Task 1)
  - `apps/edge-webhooks/` — NEW Hono receiver (Fly)
  - `apps/worker/` — NEW pg-boss worker (Fly, same app as edge-webhooks)
  - `packages/whatsapp/` — NEW thin adapter (transport only)
  - `packages/queue/` — NEW typed pg-boss publisher
  - `packages/db/` — extracted Drizzle schema + client (so all three apps import the same schema) — note: this may already be feasible by importing from `apps/staff-web/server/db/` but the planner decides whether to extract.

### sendMessage() chokepoint + WhatsApp adapter shape

- **D-09:** `packages/whatsapp/` is **transport ONLY**. Exports `sendText(to, body)` and `sendTemplate(to, templateName, vars)` — just typed wrappers around Graph API calls (default impl uses `@great-detail/whatsapp`; one-file swap to hand-rolled `fetch` if SDK goes stale, per WA-09 + PITFALL #19). NO gate logic in this package.
- **D-10:** `apps/worker/src/domain/sendMessage.ts` is **the chokepoint**. Signature: `sendMessage({ memberId, payload, db, boss }) → Promise<MessageId>`. Inside, in order:
  1. Read `whatsapp_opt_in` for memberId — refuse with typed `NoOptInError` if absent.
  2. Read `conversations.last_inbound_at` for the member — compute window.
  3. If `payload.type !== 'template'` AND out-of-window → throw typed `WindowExpiredError`. No Meta API call.
  4. If template → validate templateName exists in `whatsapp_templates` with status=approved.
  5. Insert message row with status='queued' (idempotency key on `singletonKey` from pg-boss).
  6. Call `packages/whatsapp/sendText` or `sendTemplate`. On 2xx, UPDATE messages SET status='sent', external_id=<wamid>. On 4xx/5xx, UPDATE status='failed', error_code=<...>.
  7. Status webhook from Meta later flips status to 'delivered'/'read'/'failed' via ordinal-guarded UPDATE.
- **D-11:** The worker is the ONLY caller of `packages/whatsapp/`. staff-web NEVER imports it (compile-time enforced by `apps/staff-web/package.json` not depending on `packages/whatsapp/`). Lint rule or pnpm catalogue scope check enforces this if needed.

### Queue API & staff-web ↔ worker interface

- **D-12:** **Shared typed publisher `packages/queue/`**. Exports: `enqueueOutboundWhatsApp(args)`, `enqueueStripeEvent(args)`, `enqueueInboundWhatsApp(args)`, `enqueueClassReminder(args)` (last one stubbed — NOTIF-01 ships in P2 but the queue contract is defined now so worker file structure doesn't churn). Imported by `apps/staff-web` (Vercel) and `apps/edge-webhooks` (Fly). Single typed contract — queue-name + payload-shape changes caught at compile time.
- **D-13:** **pg-boss `singletonKey`** discipline per queue:
  - `outbound-whatsapp`: `singletonKey = msg_<localMessageId>` — staff retry of same draft doesn't double-send.
  - `stripe-event`: `singletonKey = stripe_<event.id>` — replay produces one job.
  - `inbound-whatsapp`: `singletonKey = wamid_<external_id>` — duplicate Meta deliveries deduped.
- **D-14:** Concurrency profile (planner verifies at task-spec time):
  - `outbound-whatsapp`: concurrency=1, rate=80/sec/phone (Meta's published cap). Single-machine for now.
  - `stripe-event`: concurrency=3.
  - `inbound-whatsapp`: concurrency=5.
  - Cron / housekeeping: singletons.

### Schema additions (one migration, additive only)

- **D-15:** **One Drizzle migration** adds all P1b tables in one file. Strictly additive — no rename, no drop, no breaking ALTER. Tables:
  - `whatsapp_opt_in` (member_id PK, opted_in_at, evidence_message_id, evidence_payload) — per WA-07.
  - `whatsapp_templates` (name PK, status, components_json, last_synced_at) — per WA-08.
  - `whatsapp_window_state` — **deferred decision**: planner picks between materialised table (with refresh job) vs computed view over `conversations.last_inbound_at`. Default: VIEW (simpler, always fresh; DB-04 ledger pattern is the precedent for derived-not-stored).
  - `stripe_customers` (id PK, member_id, stripe_customer_id, raw_json, updated_at).
  - `stripe_subscriptions` (id PK, member_id, stripe_subscription_id, status, plan_id, current_period_end, raw_json, updated_at).
  - `payments` (id PK, member_id, stripe_payment_intent_id, amount_minor_units, currency, status, raw_json, occurred_at).
  - Stripe restricted-key encrypted storage (pgcrypto) — single row in a `secrets` table or env-only? **Planner decides**, but per STR-01 it's stored encrypted in DB so the rotation UI (P1b success criterion #6) can read it. Default: `secrets (name PK, ciphertext, updated_at, last_used_at)` with pgcrypto.
- **D-16:** `pg-boss` runs its own schema migration on first connect (`pgboss.*` tables). Single shared Neon project; the application schema and queue schema coexist. Verified production-safe per pg-boss docs.
- **D-17:** `webhook_events` table already exists from D2 demo. P1b extends it: drop the demo's "simple text PK" assumption by adding a `UNIQUE (provider, external_id)` constraint additively (CHECK if column types align; if not, the planner introduces a new column not a rename). All inserts use `ON CONFLICT (provider, external_id) DO NOTHING`.

### Outbound send UX (staff inbox)

- **D-18:** **Optimistic insert + worker upserts status**. Coach clicks Send → action inserts `messages` row with status='queued' + enqueues via `packages/queue/enqueueOutboundWhatsApp` + returns 200 to client. UI immediately renders the message with a clock icon. Worker processes the job: status flips queued → sent → delivered/read via status webhook. If worker rejects (`NoOptInError`/`WindowExpiredError`), status flips to 'failed' with `error_code` visible.
- **D-19:** **UI pre-gates AND worker enforces** — defence in depth, per PROJECT.md "rejected at sender layer (not just discouraged in UI)" = BOTH layers exist. Inbox loader exposes `windowState` ({ inWindow: boolean, hoursLeft: number | null }) + `optInState` ({ hasOptIn: boolean }) per conversation. Send button disables for out-of-window with hint "use template"; template picker disables for no-opt-in. Worker re-checks at send time (UI hints not trusted — stale page state, race conditions).
- **D-20:** **Window-state indicator in conversation list AND thread header.** List row: small green dot ("14h left in window") or grey badge ("out of window — template only"). Thread header: same, prominent. Coach scans inbox and instantly knows which threads they can free-text vs need a template. This is part of P1b's UI deliverable (the data must flow; spec-perfect INBX-05 polish is P2).
- **D-21:** **TanStack Query refetch on focus + on-send invalidate** for status sync. No SSE infra. Status flips lag a few seconds at most — acceptable for 1-coach-per-studio v1.

### Stripe scope & validation depth

- **D-22:** **All 5 Stripe handlers ship in P1b** (checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted, charge.refunded). Each is an idempotent reducer function (~30–80 LOC). The architectural work (HMAC verify, webhook_events insert, pg-boss enqueue, single-tx atomicity) is shared; adding all five is mostly fixture wrangling, not new architecture. Risk-mitigation rationale: a Day-1 refund or subscription churn that the spine silently misses produces phantom pass balances which are painful to reconcile later.
- **D-23:** **Validation bar = integration tests for the 4 P1b success-criteria scenarios + unit tests for gate functions**:
  1. `stripe trigger checkout.session.completed` twice → exactly 1 `payments` row + 1 pass grant (verified by SQL count).
  2. Replay the same WA inbound payload twice → exactly 1 `messages` row.
  3. Call `sendMessage()` for a member with `last_inbound_at` > 24h, type='text' → throws `WindowExpiredError` typed exception; no fetch to Meta.
  4. POST to `/webhooks/stripe` with mutated body → 400 before any business work.
  Plus unit tests for `sendMessage()` gate logic (opt-in, window, template lookup) using stubbed adapter.
  NO 50-concurrent webhook stress test (deferred to BKG-03 in P2, which has the actual concurrency contract).
- **D-24:** Test infra: Vitest for unit + integration; Stripe CLI (`stripe trigger`) for Stripe replays; saved JSON fixtures (captured from demo's real WA inbound payloads, scrubbed of PII) for WhatsApp tests. Test DB = a separate Neon branch (`gymos-demo` → branch `test`) so tests don't pollute demo data.

### P0 dependencies & credential strategy

- **D-25:** **P1b builds against test credentials; P0 swaps in real creds at cutover.** Stripe = test mode (`sk_test_...`) for the entire P1b dev cycle. WhatsApp = the demo's existing Meta dev sandbox + the staff number already configured for D2-02. P0 (separate phase, runs AFTER P1b in this revised order) is a credential-swap exercise: customer creates Stripe acct → generates restricted key → we paste into the rotation UI → verified. WhatsApp templates submitted to Meta during P0 (FND-06); the SYNC mechanism (WA-08) ships in P1b populated with fixture templates the customer's eventual approvals will replace.
- **D-26:** **Implies ROADMAP order change:** original sequence was P0 → P1a → P1b → P2. Effective sequence with this decision is P1a (data foundation) → P1b (this phase) → P0 (credential-swap + onboarding) → P2 (product surfaces). Planner / roadmapper may want to flag this in STATE.md / ROADMAP.md note. (Decision: P1b doesn't formally re-order P0 — P0 still tracks the FND-06/07 customer-side work — but P1b doesn't BLOCK on P0 finishing.)

### Phase boundary discipline

- **D-27:** **P1b ships exactly the 18 listed reqs.** NOTIF-* (template reminders), WAIT-* (waitlist), BKG-03 (atomic booking), INBX-04/05 (full template picker UX + window indicator spec) all stay in P2. The P1b UI ships a minimal window-state badge + send-button gate (the data must flow for WA-05/06 enforcement and is INBX-05-compatible), but the polished version remains P2.

### Claude's Discretion

Planner / executor picks these — not user-facing visionary decisions:

- Exact fly.toml shape (release_command for pg-boss schema migrate? machine type? autoscale=false for now?)
- `whatsapp_window_state` as materialised table vs view (default: VIEW)
- Where `packages/db/` lives or whether it gets extracted at all (default: keep schema in `apps/staff-web/server/db/` and have edge-webhooks + worker import via `pnpm workspace` reference — extract only if cyclic import emerges).
- pg-boss `retentionDays`, `archiveCompletedAfterSeconds`, `deleteAfterDays` tuning.
- Stripe SDK `apiVersion` exact string (latest stable at plan-phase time, then pinned).
- Error-code surface in failed message bubbles: friendly string vs raw error_code.
- Window-badge exact copy ("14h left" vs "in window" vs hours-only).
- Worker startup order (boss start → migrations → subscribe; or migrations first → boss → subscribe).
- Whether the rotation UI is a new route (`/gymos/settings/integrations`) or inline in an existing settings surface (deferred to P2/SET-02 anyway, but P1b needs the storage + validity-check endpoint).
- Test fixture format / location.
- Logging shape (Pino is the planned stack but full PII redaction config lands in P1a/OBS-01 — P1b uses Pino with sensible defaults).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase scope & requirements

- `.planning/ROADMAP.md` §"Phase P1b: Webhook + Worker Spine (Stripe + WhatsApp)" — phase goal, 6 success criteria (replay-twice idempotency, WA dedup, WindowExpiredError, NoOptInError, tampered-body 400, key rotation), risk callouts.
- `.planning/REQUIREMENTS.md` §"Webhook & Worker Spine" (WEB-01..06), §"Stripe Integration" (STR-03..07 — five reducers + STR-01 encrypted key), §"WhatsApp Integration" (WA-03..09 — inbound/outbound state, ordinal-guarded status, chokepoint, window gate, opt-in gate, template sync, thin adapter).
- `.planning/REQUIREMENTS.md` header mobile-note (PWA references are stale = native Expo equivalent — irrelevant to P1b but referenced from D2 context).

### Prior-phase context

- `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md` — Claude's-Discretion §"WA-01/02 demo path" (defers the production webhook spine to P1b explicitly; locks the ngrok+templates/mail demo path).
- `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-02-whatsapp-webhook-outbound-PLAN.md` — the existing demo receiver design (HMAC verify + idempotency + conversation upsert by phoneE164).
- `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-02-whatsapp-webhook-outbound-SUMMARY.md` — env-gated outbound send pattern; what to migrate away from.
- `.planning/STATE.md` §"Decisions" (recent entries D2-D02 / D2-03 etc.) — locked in WhatsApp send pattern, optimistic UI pattern, idempotency conventions.
- `.planning/STATE.md` §"Blockers" — Stripe Checkout pause (D1-03 never shipped); customer-facing P0 blockers (Stripe account, Meta Business Manager).

### Project constraints & conventions

- `./CLAUDE.md` (root + symlinked from templates/mail/CLAUDE.md) — single source for: project name + value, two-month timeline (2026-07-15), constraints (PCI/Meta/Reliability/Tenancy), full stack table, what NOT to use (banned: managed WA providers, Stripe Connect, drizzle-kit push, Express bodyParser-before-HMAC). GSD workflow enforcement.
- `./AGENTS.md` — six rules, four-area feature checklist, no-breaking-DB-changes guard (additive only), no-unscoped-queries guard (`accessFilter`/`assertAccess`), optimistic-UI default, no-emojis-as-icons, integration-webhooks queue pattern (`integration_pending_tasks` … but adapted here to pg-boss).

### Stack & architecture decisions

- `.planning/research/STACK.md` — Hono on Fly for receivers; pg-boss on Neon (NO Redis); `@great-detail/whatsapp` v9 (currently maintained fork — PITFALL #19 mirror); Stripe Node SDK 17.x with pinned apiVersion; Drizzle 0.45.x line (NOT 1.0-beta).
- `.planning/research/ARCHITECTURE.md` §"System Overview (Per Studio Deploy)" diagram — three-tier model (edge-webhooks Fly + worker Fly + Neon + staff-web Vercel); §"Component Responsibilities" table (edge-webhooks owns webhook_events writes only; worker owns ALL cross-system writes); §"Source-of-Truth Boundaries" (Stripe + Meta are external sources of truth; staff-web reads but never writes).
- `.planning/research/PITFALLS.md` — directly relevant:
  - §1 (24h-window violation → Meta suspension) — chokepoint enforcement pattern
  - §2 (Stripe non-idempotent handler → double-grant) — single-tx insert + business work
  - §8 (webhooks on Vercel → cold-start storms) — Fly always-on `min_machines=1`
  - §9 (body parser before HMAC) — `await request.text()` BEFORE any JSON.parse
  - §11 (WA status dedup) — ordinal-guarded UPDATE never downgrades
  - §17 (WA opt-in) — `whatsapp_opt_in` table + sender-gate refusal
  - §19 (`@great-detail/whatsapp` single-maintainer) — thin adapter package
  - §20 (worker at-least-once → duplicate sends) — pg-boss `singletonKey` per job
- `.planning/research/SUMMARY.md` — top-level synthesis (read for the "two-milestone" frame and the explicit Stripe-direct + pg-boss replacements of older choices).
- `.planning/research/FEATURES.md` — feature-by-feature breakdown referenced by REQUIREMENTS.

### Existing code to migrate / build on

- `templates/mail/app/routes/webhooks.whatsapp.tsx` — the demo WA webhook receiver. P1b D-04: parallel-run, then D-05: delete this file last task.
- `templates/mail/app/routes/gymos.tsx` lines 494, 527 (and the env-gated outbound send action) — the call site to refactor; goes from env-gated direct Meta call → enqueue via `packages/queue/`.
- `templates/mail/server/db/schema.ts` line 318 (`webhookEvents` table) — extend with composite unique constraint; do NOT rename or drop.
- `templates/mail/server/plugins/auth.ts` — `publicPaths: ["/webhooks/whatsapp", ...]` already accommodates webhooks; refactor target moves these to `apps/staff-web/server/plugins/auth.ts`.
- `templates/mail/` ENTIRE directory — Task 1 of P1b: refactor to `apps/staff-web/` per D-06.

### External docs (P1b-specific)

- `https://docs.stripe.com/webhooks/signature` — `stripe.webhooks.constructEvent()` is the only correct signature pattern; raw-body required.
- `https://docs.stripe.com/api/events/types` — five P1b event types to handle.
- `https://docs.stripe.com/api/webhook_endpoints` — registering the Fly URL.
- `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks` — webhook payload shape; HMAC SHA-256 with app_secret; status webhook ordering (sent < delivered < read).
- `https://developers.facebook.com/docs/whatsapp/cloud-api/messages/template-messages` — template send shape (template name + language + components/variables); approval status states.
- `https://github.com/timgit/pg-boss/blob/master/docs/readme.md` — pg-boss API: `boss.start()`, `boss.send(name, data, { singletonKey })`, `boss.work(name, handler)`, `boss.schedule(name, cron, data)` for housekeeping.
- `https://hono.dev/docs/api/request#req-text` — `c.req.text()` for raw body (BEFORE any `c.req.json()`).
- `https://fly.io/docs/apps/processes/` — `[processes]` block in fly.toml for the two-process model (D-01).
- `https://github.com/great-detail/whatsapp` — current SDK (v9, Cloud API v23, includes `event.verifySignature(appSecret)`).
- `https://orm.drizzle.team/docs/migrations` — `drizzle-kit generate` + `drizzle-kit migrate` (NEVER `push` — guarded by CLAUDE.md).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets (currently in templates/mail/, moving to apps/staff-web/ in Task 1)

- **`templates/mail/server/db/schema.ts`** — 12 GymClassOS tables already defined (`gymMembers`, `coaches`, `conversations`, `messages`, `classDefinitions`, `classOccurrences`, `bookings`, `passes`, `passDebits`, `foodItems`, `foodEntries`, `agentSessions`, `webhookEvents`). All additive P1b tables co-exist; no breaking changes needed.
- **`templates/mail/server/db/index.ts`** — `getDb()` singleton. Reuse from edge-webhooks + worker (probably extract to packages/db/ if cyclic import emerges; otherwise pnpm workspace import from apps/staff-web).
- **`templates/mail/app/routes/webhooks.whatsapp.tsx`** — Reference for HMAC verify (lines 47–67), idempotency check (lines 89–105), conversation upsert by phoneE164 (lines 124–156). Pattern is correct; P1b port is structural (RR v7 route → Hono route) not logical.
- **`templates/mail/app/routes/gymos.tsx`** — Current send action (env-gated direct Meta call). P1b refactor: replace direct call with `enqueueOutboundWhatsApp({ messageId, memberId, payload })`. Insert messages row with status='queued' optimistically. UI already supports `?sent=1` redirect ACK (per D1-04) — that becomes optimistic update instead.
- **`pnpm-workspace.yaml`** — already configured for the agent-native monorepo (templates/* and packages/* both included). Adding `apps/*` is one line.

### Established patterns

- **Idempotency-by-PK on webhook_events** — D2-D02 uses SELECT-then-INSERT; P1b upgrades to `ON CONFLICT (provider, external_id) DO NOTHING` per WEB-03. The transaction wrapping (INSERT + business work in same TX) is NEW for P1b (demo skipped this).
- **Raw-body-first HMAC discipline** — D2-D02 already does this for WA (`await request.text()` before JSON.parse). Port unchanged to Hono via `await c.req.text()`.
- **Optimistic UI** — D2-03 booking flow established the TanStack Query optimistic pattern with onMutate/setQueryData + onError rollback + onSuccess invalidate. Outbound WA send re-uses this shape (D-18).
- **Pass-balance derivation** — D1-02 pattern: SUM(grants) − SUM(debits) as two separate aggregations (never chain leftJoin). P1b Stripe checkout reducer inserts into `passes` (grant); refund handler inserts NEGATIVE entry into `pass_debits`. Same pattern.
- **No backwards-compat shims** — AGENTS.md + CLAUDE.md. Delete `templates/mail/app/routes/webhooks.whatsapp.tsx` cleanly when Meta URL is flipped (don't stub it out).

### Integration points

- **edge-webhooks → worker**: pg-boss `boss.send(queueName, payload, { singletonKey })`. Receivers do NO business logic — they verify + persist + enqueue + return 200.
- **worker → Meta**: via `packages/whatsapp/` thin adapter — ONLY caller.
- **worker → Stripe**: via Stripe Node SDK with pinned apiVersion. Worker refetches event from Stripe API (don't trust payload — WEB-06 + PITFALL #2).
- **staff-web → pg-boss**: via `packages/queue/` typed publisher. Direct DB insert for `messages` (status='queued'); enqueue for the send job.
- **staff-web → Stripe (Checkout)**: direct SDK call from action (the only place staff-web touches Stripe — the Checkout link generation; webhooks reconcile state back). This was D1-03's pattern (paused but architecturally validated).
- **All apps → Neon**: via Drizzle. Vercel apps use `neon-http`; Fly apps use `neon-serverless` (WS). Documented in ARCHITECTURE.md.

</code_context>

<specifics>
## Specific Ideas

- **fly.toml processes shape:** `[processes]\nweb = "node dist/server.js"\nworker = "node dist/worker.js"`
- **Webhook URLs after cutover:**
  - WhatsApp: `https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp` (replaces ngrok URL in Meta Business Manager)
  - Stripe: `https://gymos-edge-webhooks.fly.dev/webhooks/stripe` (registered in Stripe dashboard with the 5 events selected)
- **Window-state badge copy (D-20):**
  - In-window: "🟢 in window · 14h left" (green dot, hours-left if hoursLeft > 0)
  - Out-of-window: "⚫ out of window · template only" (grey dot)
  - (These are user-authored visual content per AGENTS.md "emoji exceptions for status indicators" — not icons.)
- **Failed message bubble copy (D-19):**
  - `WindowExpiredError`: "Couldn't send — outside 24-hour window. Use a template."
  - `NoOptInError`: "Couldn't send — member hasn't opted in to WhatsApp messages."
  - `TemplateNotApproved`: "Couldn't send — template '{name}' isn't approved yet."
- **Stripe rotation UI placement:** behind `/gymos/settings/integrations` (new route). Just a textarea for the new key + a "Validate & rotate" button that calls Stripe with the new key, checks scopes, then atomically updates the encrypted secret. Coach must be admin (AUTH-04 — placeholder, full role check in P1a).
- **pg-boss singletonKey convention:** `<queue-name>:<external-id>` — e.g. `outbound-whatsapp:msg_abc123`, `stripe-event:evt_xyz789`, `inbound-whatsapp:wamid_ABCDEF`. Conveys both the dedup scope AND what to grep for in logs.

</specifics>

<deferred>
## Deferred Ideas

Came up during P1b discussion; belong in other phases.

- **NOTIF-01..05** (24h/2h class reminders, payment_failed template, pass_expiring template, no-show detection, pass expiry by TZ) — **P2.** They CONSUME the spine; P1b builds the spine. Stub the `enqueueClassReminder` publisher in `packages/queue/` so P2 doesn't churn the queue contract.
- **WAIT-01..06** (waitlist + reply-to-confirm + TTL) — **P2.** Reply-to-confirm uses pg-boss `sendAfter` for TTL expiry; relies on P1b being shipped.
- **BKG-03/04** (atomic booking + entitlement resolution + pass debit in single TX) — **P2.** Different concurrency contract (50-concurrent test); orthogonal to webhook spine.
- **INBX-04** (template picker UX in inbox) — **P2.** P1b ships minimal send-button gate + window-state badge but not the polished picker.
- **INBX-05** (full window indicator spec — hours-left calc, design polish) — **P2.** P1b ships the indicator at a functional level; design polish later.
- **SET-01..03** (settings UI: template list, Stripe rotation UI polish, system health dashboard) — **P2.** P1b ships a rotation endpoint + bare-bones UI behind /gymos/settings/integrations; full settings surface later.
- **50-concurrent webhook stress test** — **deferred** (re-evaluate post-launch). BKG-03 in P2 owns the concurrency contract; P1b validates idempotency via 2× replay, not stress.
- **Chaos test (worker crash mid-job)** — **deferred.** pg-boss claims at-least-once is enforced; we accept that on trust until first real customer incident.
- **SSE channel for live message status** — **post-v1.** TanStack refetch-on-focus is good enough for 1-coach-per-studio. Reconsider for multi-coach studios.
- **`integration_pending_tasks` queue pattern from agent-native AGENTS.md** — different problem (cross-platform webhook → SQL queue → processor for Slack/Telegram). pg-boss is the GymClassOS-specific implementation choice; both patterns coexist (one for agent-native templates, one for GymClassOS webhooks).
- **Stripe Customer Portal link generation** (PAY-04) — **P2.** P1b sets up the customer state mirror tables (`stripe_customers`); the staff-web link-generation UX is P2.
- **Per-customer (per-studio) deploy script `scripts/deploy.sh <studio>`** (DEP-01..04) — **P1a/P0.** P1b deploys for the one-customer demo studio; scripted-multi-studio comes when N > 1.
- **Pino PII-redacted logging across all apps** (OBS-01) — **P1a.** P1b uses Pino with sensible defaults; full redaction config in P1a.
- **`/healthz` queue-depth endpoint** (OBS-02) — **P1a.** P1b's `/healthz` returns just `200 OK + version` if needed for Fly health checks; full metrics in P1a.

### Reviewed Todos (not folded)

None — `gsd-tools todo match-phase P1b` returned 0 matches.

</deferred>

---

*Phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks*
*Context gathered: 2026-05-20*
