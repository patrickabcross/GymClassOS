# Project Research Summary — GymOS

**Project:** GymOS — boutique fitness studio management platform (fork of `BuilderIO/agent-native`)
**Domain:** Vertical SaaS — WhatsApp-first staff inbox + class scheduling/bookings/passes + Stripe Connect billing; mobile features (Phase 3+) embed into customer's existing React Native app
**Researched:** 2026-05-17
**Confidence:** HIGH overall. MEDIUM on a handful of specifically-flagged spots (Vercel × React Router v7 middleware seam; BullMQ vs pg-boss queue choice; `@great-detail/whatsapp` single-maintainer risk; per-customer-deploy ops mechanics for Fly+Vercel+Neon).

> The four underlying research files (`STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`) are the long-form source of truth. This SUMMARY is the document the roadmapper and requirements step will rely on — every load-bearing decision, convergence, and open question is restated here.

---

## Executive Summary

GymOS is a **fork-and-ship** project, not a green-field build. The single most consequential discovery across all four research files is that `BuilderIO/agent-native` is NOT a Next.js codebase — it is **React Router v7 (framework mode) + Vite + Drizzle ORM + H3 + Better-auth + Radix/Tailwind v4**, with `@neondatabase/serverless` already wired as a first-class option. Every architectural choice flows from "stay merge-tractable with upstream." Drop Next.js, drop Prisma, drop NextAuth. The only DB swap at fork time is configuring Drizzle for `neon-http`/`neon-serverless` instead of LibSQL.

The competitive thesis is **WhatsApp-as-canonical-channel with member context inside the conversation**. Every incumbent (Mindbody, Glofox, TeamUp, Mariana Tek, PushPress, Pike13) defaults to SMS+email; none surface member state (next class, pass balance, subscription health) inside the inbox. That whitespace is what the signed customer signed for, and it is the *only* differentiator dimension worth defending in v1. Trying to beat Mindbody on feature *breadth* in two months is suicide; trying to beat them on conversational depth is the strategy. The roadmap must protect this — every "table-stakes" feature that doesn't ship breaks the deal, but every "MarTech / multi-location / web member portal" feature that sneaks in eats the whole deadline.

The risk surface is concentrated in **three integration spines** that must be built before any product feature: (1) WhatsApp Cloud API with 24h-window enforcement at the *sender layer* (Meta-account-suspension risk if violated); (2) Stripe Connect with atomic idempotent webhook handlers and `refund_application_fee: true` defaults (silent state corruption + revenue leak risk); (3) the agent-native fork boundary (`templates/` pristine, copies live in `apps/staff-web/features/*`, two git remotes from day zero — without this discipline, the framework's value evaporates within months). All three are foundational; all three must be in place by end of Phase 1 or Phase 2 product work will be built on sand.

---

## Key Findings

### Recommended Stack

The stack is **forced by the agent-native fork decision** — there is essentially no choice on the framework layer, and that's a feature (every dependency choice that matches upstream lowers the merge cost forever). The novel decisions are all on the *Fly.io side* (the new deployables: webhook receiver + worker), where agent-native is silent.

**Core technologies (locked by upstream — do NOT swap):**

- **React Router v7 (framework mode, ~7.13.x)** — staff web app routing + SSR. **This is the Next.js replacement.** Loader/action model, no React Server Components complexity.
- **Vite 6** — paired natively with RR v7. Vite 5 will not work.
- **Drizzle ORM (^0.45.x)** — schema + queries. Do NOT jump to 1.0-beta mid-ship. `drizzle-kit generate + migrate` only; `drizzle-kit push` is banned (agent-native ships `guard:no-drizzle-push` — keep it).
- **`@neondatabase/serverless` (^1.1.x)** — DB driver. `neon-http` from Vercel (stateless, cold-start friendly, single-shot only); `neon-serverless` (WebSocket) from Fly worker for transactional work.
- **Better-auth (^1.6.x)** — staff auth via `runAuthGuard` from `@agent-native/core/server`. Two roles (admin, coach) is enough for v1.
- **H3 (^2.0.x)** — server runtime inside RR app. Do not replace; extend.
- **Radix UI + Tailwind v4 + shadcn/ui (additive) + Lucide + Sonner + React Hook Form + Zod 4 + TanStack Query + date-fns + date-fns-tz** — already in agent-native; treated as locked-in.

**Core technologies (new for the Fly side — actual decisions):**

- **Hono (^4.x)** — webhook receiver framework on Fly. Chosen specifically because raw-body handling (`c.req.raw`) is the cleanest path for Stripe + WhatsApp signature verification.
- **`@great-detail/whatsapp` (^9.x)** — Cloud API client. Meta's official SDK is paused (Issue #31). This fork is the only maintained option, but it's single-maintainer — **mirror to our own GitHub org at Phase 0** and wrap in a thin adapter so a swap to hand-rolled Graph API calls is a one-file change.
- **Stripe Node SDK (^17.x)** — `apiVersion` ALWAYS explicitly pinned (never floating). Use `stripe.webhooks.constructEvent()` — never hand-roll HMAC.
- **BullMQ (^5.x) + Upstash Redis (fixed-price plan, fly-private)** — job queue + Redis on Fly. *Open question:* if v1 job volume stays under ~1k jobs/day, **pg-boss** on Neon is a simpler alternative (eliminates Redis). Flagged for Phase 2 milestone revisit.
- **pnpm 10.x** — required; agent-native is a pnpm workspace using `catalog:` versions that only work under pnpm.

**Deployment topology (the three apps per studio):**

| App | Where | What |
|---|---|---|
| `apps/staff-web` | Vercel | React Router v7 SSR — inbox, schedule, members, settings |
| `apps/edge-webhooks` | Fly.io (always-on, `min_machines = 1`) | Hono receiver: verify signatures, persist raw to `webhook_events`, enqueue to BullMQ, ack <100ms |
| `apps/worker` | Fly.io (same Fly app, sibling process) | BullMQ consumers: WhatsApp inbound parser, WhatsApp outbound sender (24h gate + template gate), Stripe event reducers, reminders, housekeeping |

**Full detail:** `.planning/research/STACK.md`.

---

### Expected Features

Feature research compared GymOS against 13 competitors (Mindbody, Glofox, TeamUp, Mariana Tek, PushPress, Pike13, Arketa, Zen Planner, Vibefam, Virtuagym, Wellyx, StudioGrowth, ClassPass). The MoSCoW cut below is the **v1 ship list**.

**Must have (table stakes — studios will not switch without these):**

- **Class schedule** — recurring weekly templates + materialised instances + per-instance overrides (cancel, swap instructor, change capacity).
- **Class booking with capacity limit** — atomic capacity check + booking insert in one transaction.
- **Waitlist with auto-promote** — FIFO; on cancel, transactionally promote head + send WhatsApp offer; reply-to-confirm via keyword classifier.
- **Pass / package balance with debit-on-book** — append-only ledger (NOT a mutable integer column).
- **Recurring membership subscription** (Stripe Subscription) + **drop-in single-class purchase** (Stripe Checkout → 1-credit pass).
- **Cancel-booking with window** + **late-cancel = forfeit credit** (v1 mode; fee charging deferred to v1.x).
- **No-show detection** (post-class BullMQ job).
- **WhatsApp inbound webhook + outbound free-text (in-window) + outbound template (out-of-window)** — with hard 24h-window enforcement at the sender layer.
- **Member directory + member profile** (bookings/passes/payments/comms timeline).
- **Coach/instructor assignment** to class instances.
- **Staff login with admin/coach roles** (Better-auth, two roles only).
- **Stripe webhook handlers** for: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `account.application.deauthorized`.
- **Time-zone correct class display** — IANA zone names (NOT offsets like `+02:00`), separate "rule" vs "occurrence" storage.

**Should have (differentiators — why a studio picks GymOS over Mindbody):**

- **Member context panel inside the WhatsApp conversation** — the signature feature. No competitor does this.
- **WhatsApp as the canonical notification channel** for class reminders, waitlist offers, payment-failed, pass-expiring.
- **Reply-to-confirm / reply-to-cancel** for waitlist offers and reminders (keyword classifier + per-conversation `pending_action` with TTL).
- **Coach books member into class from inside the conversation** (inline inbox action, reuses booking transaction).
- **Class reminders via WhatsApp template** (24h-before, 2h-before, scheduled via BullMQ delayed jobs).

**Defer to v1.x (add post-launch when customer reports concrete pain):**

Voice + photo messages · Late-cancel **fee charging** (replaces forfeit-only) · Stripe Customer Portal link sending · Pause subscription · Class series / multi-week blocks · Intro-offer flow with conversion tracking.

**Defer to Phase 3+ (per PROJECT.md scope):**

Mobile features in customer's RN app (Phase 3) · Operational reporting (Phase 4 — Analytics template fork) · Knowledge base (Phase 4 — Content template fork) · Calorie counter (Phase 5 — Calorie tracker template fork) · AI-suggested replies (the `agent-native` foundation keeps the door open).

**Anti-features (specifically NOT in v1):**

Branded mobile app from scratch · Multi-location / franchise · Web member portal · Marketing automation orchestration · Spot picking / floor plan · Door access / Kisi · In-app retail / POS · 1:1 personal training appointments · Multi-currency / international tax · Push notifications outside WhatsApp · Refunds UI for staff (use Stripe Dashboard) · Email marketing channel · Real-time presence · Inbound voice calls · Booking via SMS or web form · Family / household sub-accounts · Gift cards · Referral programs.

**Phase-0 audit questions for the signed customer:**
1. Do their class types need spot picking / reformer / bike selection? (Default: no.)
2. Do they do 1:1 personal training? (Default: no.)
3. Staffed check-in or 24/7 door access? (Default: staffed; no Kisi.)
4. Is their WhatsApp number free of 2FA + personal-WhatsApp history?

**Full detail:** `.planning/research/FEATURES.md`.

---

### Architecture Approach

The architecture is shaped by three load-bearing decisions from PROJECT.md, each of which reverberates through every component:

1. **Single-tenant code, multi-tenant deploy** — NO `studio_id` columns anywhere. One Neon project + one Vercel deploy + one Fly app per studio. Tenancy lives in DNS and env vars, not SQL.
2. **agent-native is upstream, not a starter** — `templates/` is pristine; `packages-vendored/core/` is never edited in-place; modifications go in `apps/staff-web/features/*` (copies) or `apps/staff-web/app/lib/*` (wrappers).
3. **Webhooks are first-class infrastructure, not side routes** — raw-body requirements, signature verification, idempotency, tight ack timeouts. Their own deployable on Fly.

**Major components:**

1. **`apps/staff-web` (Vercel)** — React Router v7 SSR. Owns drafts, member CRM edits, schedule definitions, template metadata, settings. Reads everything. **Never** writes Stripe-mirrored or WhatsApp-mirrored tables directly. Outbound WhatsApp sends are enqueued, not direct API calls.
2. **`apps/edge-webhooks` (Fly, always-on)** — Hono. Verifies HMAC with raw body, inserts to `webhook_events` (PK = external event ID), enqueues, returns 200 in <100ms. Write-only to one table.
3. **`apps/worker` (Fly, sibling process)** — Node + BullMQ. Owns ALL cross-system writes: conversation/message materialisation, outbound send with 24h-window + template gate, Stripe event reducers, pass debit ledger, reminders, housekeeping. Idempotent by design.
4. **Neon Postgres** — source of truth for everything except card data (Stripe owns) and WhatsApp delivery status (Meta owns, mirrored via status webhooks).
5. **Redis (Upstash on Fly, private)** — BullMQ persistence. Not durable customer data — replay from `webhook_events` if lost.
6. **agent-native vendored** — `packages-vendored/core/` + `templates/` consumed as workspace deps; never edited.

**Source-of-truth boundaries:**

| Concern | Source of Truth | Reconciliation |
|---|---|---|
| Card data, customer/subscription IDs | Stripe | Stripe webhooks → worker → DB. Staff-web NEVER writes these. |
| WhatsApp delivery status | Meta | Status webhooks → worker → ordinal-guarded UPDATE (`sent < delivered < read < failed`). |
| Class/booking/pass state | GymOS Postgres | Direct writes from staff-web actions or worker. |
| Template approval state | Meta | Worker housekeeping job pulls Meta's API daily. |

**Five canonical patterns:**

1. **Webhook Receiver → Idempotency Table → Worker Queue** — every external webhook.
2. **Outbound Send → Queue → Worker → Persist** — every WhatsApp outbound.
3. **Stripe Event Reducers (one function per event type)** — single endpoint, dispatch table.
4. **Pass Debits as Append-Only Ledger** — balance = `sum(grants) − sum(debits)`. `SELECT ... FOR UPDATE` + `CHECK (balance >= 0)`.
5. **Per-Studio Env Var Contract (No In-DB Config)** — all per-studio config via Zod-validated env vars.

**Full detail:** `.planning/research/ARCHITECTURE.md`.

---

### Critical Pitfalls

PITFALLS catalogued 26 across critical/high/medium severity. The five most decisive:

1. **Sending WhatsApp outside the 24-hour window without a template** (CRITICAL — Meta account suspension). Single `sendMessage()` chokepoint in the worker enforces window state. UI greying is necessary but not sufficient — the worker is the only authoritative gate.

2. **Stripe webhook handler isn't atomically idempotent** (CRITICAL — silent state corruption). `INSERT INTO webhook_events (id = event.id) ON CONFLICT DO NOTHING` + business work *in one DB transaction*. Refetch from Stripe API rather than trusting event payload. Always pin `apiVersion`.

3. **Class capacity double-booking** + **pass-balance negative-balance race** (both CRITICAL). Atomic SQL with preconditions (`INSERT ... WHERE booked_count < capacity RETURNING`), CHECK constraints (`balance >= 0`), append-only ledger. 50-concurrent test against 12-seat class.

4. **DST timezone bug from storing recurring classes as `timestamptz`** (CRITICAL — bites twice a year). Two-column pattern: `schedule_rule (weekday, local_time, timezone TEXT)` for the rule (IANA name), `class_occurrence` materialised by worker.

5. **Modifying agent-native templates in-place destroys the upstream merge story** (CRITICAL for vertical-SaaS-factory thesis). Two git remotes from day zero, `templates/` read-only, modifications via copies, bi-weekly `git merge upstream/main`, `MODIFICATIONS.md` with <5 entries ever.

**Next tier (HIGH severity, Phase 1 prevention):** Webhooks on Vercel instead of Fly (#8) · body parser before signature verify (#9) · Neon HTTP driver misuse for transactions (#10) · WhatsApp status webhook dedup (#11) · Stripe Connect app-fee refund + deauth (#13) · Per-studio config drift, deploy script from day one (#14) · `drizzle-kit push` (#15) · RR v7 × Vercel middleware (#16) · WhatsApp opt-in (#17) · Waitlist auto-promotion races (#18) · `@great-detail/whatsapp` mirror + adapter (#19) · BullMQ at-least-once duplicate sends (#20).

**Cross-cutting:** Premature extraction into a "vertical framework" (#7) — `git grep` for `Tenant`/`Vertical`/`StudioConfig`/`Plugin` types monthly.

**Full detail:** `.planning/research/PITFALLS.md`.

---

## Convergent Themes (Where ≥2 Research Files Agree)

| Theme | STACK | FEATURES | ARCH | PITFALLS |
|---|:---:|:---:|:---:|:---:|
| **Webhook-spine-first build order** | • | | ✓ | ✓ |
| **24h-window enforcement at sender layer, not UI** | ✓ | ✓ | ✓ | ✓ |
| **Atomic + idempotent Stripe webhooks non-negotiable** | ✓ | ✓ | ✓ | ✓ |
| **Append-only pass-debit ledger (NOT mutable balance)** | | ✓ | ✓ | ✓ |
| **Schedule = `rule` + `occurrence` tables, IANA TZ, worker materialises** | | ✓ | ✓ | ✓ |
| **agent-native fork discipline (templates/ read-only, two remotes, monthly merges)** | ✓ | | ✓ | ✓ |
| **Webhooks on Fly only, never Vercel functions** | ✓ | | ✓ | ✓ |
| **Hono on Fly for clean raw-body signature verify** | ✓ | | ✓ | ✓ |
| **`@great-detail/whatsapp` single-maintainer — mirror + adapter at Phase 0** | ✓ | | ✓ | ✓ |
| **No `studio_id` anywhere — tenancy in DNS + env vars** | ✓ | • | ✓ | ✓ |
| **Phase 0 RR v7 + Better-auth on Vercel validation** | ✓ | | ✓ | ✓ |
| **Per-customer deploy script + `studios/<studio>/env.yml` from N=1** | | | ✓ | ✓ |
| **Member context panel in conversation = THE differentiator** | | ✓ | ✓ | |
| **Drop-in = Stripe Checkout → 1-credit pass (not a separate code path)** | | ✓ | ✓ | |
| **Template approvals are calendar dependencies (≤48h) — submit Phase 0** | ✓ | ✓ | | ✓ |
| **WhatsApp opt-in Meta-policy-enforced — schema + sender gate Phase 1** | | ✓ | | ✓ |

When a theme appears in 3–4 files, the roadmap must treat it as a first-class constraint.

---

## Implications for Roadmap

PROJECT.md Phases 0–5 are the structural backbone; v1 = Phases 0–2 only.

### Phase 0 — Framework Audit + De-Risking (≈3–5 days, blocking)

**Rationale:** PROJECT.md mandates a template-by-template audit. Three research-driven items get bolted on because of long lead times (template approvals) or architectural commitments (Vercel × RR v7 validation, agent-native fork mechanics).

**Deliverables:**
1. Audit each of the 5 agent-native templates + `audit/decision.md` (fork-clean vs adapt vs build-fresh).
2. Hello-world deploy: RR v7 + Better-auth + Neon to Vercel — validates the MEDIUM-confidence pairing.
3. Two git remotes set up; `MODIFICATIONS.md` committed at repo root.
4. Mirror `@great-detail/whatsapp` to your GitHub org; pin to mirror's git SHA.
5. Submit WhatsApp templates to Meta: `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`, `intro_followup` (≤48h approval).
6. Customer onboarding checklist run: 2FA off, no personal-WhatsApp history, Meta Business Manager set up; class-type confirmation (no spot picking / 1:1 PT / 24-7 door).
7. Test strategy decision: Vitest for non-UI; Playwright for UI/E2E.

**Avoids:** Pitfalls #6, #16, #19, #23, #26.

**Research needs:** LOW. The audit IS the research.

---

### Phase 1 — Webhook + Worker Spine + Schema Foundation (≈2.5–3 weeks)

**Rationale — most convergent finding across all four files.** ARCHITECTURE orders this before product (Steps 5–9). PITFALLS catalogues 12 of 20 HIGH/CRITICAL pitfalls as Phase-1 prevention. Once the spine exists, product work is "fill in domain logic." Build product on a half-built spine → build on sand.

**Deliverables (in build order):**

1. `packages/db/` schema skeleton — `members`, `conversations`, `messages`, `class_definitions`, `class_sessions`, `bookings`, `waitlist`, `passes`, `pass_debits`, `stripe_customers`, `stripe_subscriptions`, `payments`, `whatsapp_templates`, `whatsapp_window_state`, `whatsapp_opt_in`, `webhook_events`, `audit_log`. **Lock expensive-to-change decisions:** append-only `pass_debits` ledger, `schedule_rule` + `class_occurrence` two-table with IANA TZ, `webhook_events.id` PK.
2. `apps/staff-web` hello-world deployed to Vercel with Better-auth.
3. `apps/edge-webhooks` on Fly with Hono + `/healthz` + stub `/webhooks/stripe`. Verify with Stripe CLI. `min_machines = 1`.
4. `apps/worker` on Fly with BullMQ + Redis; do-nothing job verifies round-trip.
5. First Stripe reducer end-to-end (`customer.created`). **Lock idempotency atomicity here.**
6. WhatsApp inbound webhook + processor — HMAC verify with raw body; conversation/message materialisation; dedup `(event_type, external_id) UNIQUE`.
7. WhatsApp outbound send infrastructure — single `sendMessage()` chokepoint with 24h-window + template gate.
8. Stripe Connect OAuth onboarding (one-shot per studio); `refund_application_fee: true` default; `account.application.deauthorized` handler.
9. `scripts/deploy.sh <studio>` + `studios/<studio>/env.yml` (sops-encrypted). No manual deploys.
10. Pino logger with PII redaction config.
11. `whatsapp_opt_in` table + sender-gate check.

**Pitfalls addressed:** #1, #2, #4 (schema), #5 (schema), #8, #9, #10, #11, #13, #14, #15, #17, #19, #20, #22, #25.

**Research needs:** **MEDIUM — likely needs `/gsd:research-phase`** on two narrow questions:
- (a) Vercel-to-Fly Redis routing options (expose Upstash publicly, or proxy through a Fly internal HTTP endpoint? Architecture recommends the latter but flags it as "Decision needed at Phase 1").
- (b) BullMQ vs pg-boss commit point (depends on volume estimates from REQUIREMENTS).

---

### Phase 2 — Product Surfaces (≈4–5 weeks)

**Rationale:** Once Phase 1 is solid, Phase 2 is mostly *consuming* the spine. Two parallelisable tracks: (a) WhatsApp inbox surface, (b) Class/booking/pass surface (DB-only, no external API). Differentiators cluster at the boundary.

**Deliverables (loose parallel order):**

1. Inbox UI (fork from `templates/mail/`, copy-out + modify). Read-only first.
2. Member directory + member profile (read-mostly over already-populated mirrors).
3. **Member context panel** inside inbox — the differentiator.
4. Outbound send action — full queue path + UI window-state indicator. Highest-risk; do after spine proven.
5. Schedule UI + class CRUD (fork from `templates/calendar/`). Recurring rule editor; instance materialisation worker job.
6. Booking transaction — atomic capacity + entitlement + pass debit in one SQL transaction. 50-concurrent integration test.
7. Waitlist with auto-promote — synchronous cancel + promote; idempotent `jobId`; reconciliation cron.
8. Cancel-booking with window + late-cancel forfeit (v1 mode).
9. No-show detection (post-class BullMQ job).
10. Stripe Checkout / Portal link generation (direct SDK calls in staff-web).
11. **"Book into class" inline action inside conversation** — second differentiator.
12. Reply-to-confirm keyword classifier + `pending_action` row with TTL.
13. Class reminders via WhatsApp template (BullMQ delayed jobs, 24h-before + 2h-before, idempotent).
14. Pass expiry end-of-day in studio TZ.
15. Settings UI — template mgmt, Stripe Connect status, integration health.

**Pitfalls addressed:** #1 (UI), #3, #4 (flows), #5 (engine + UI), #18, #20, #21, #24.

**Research needs:** **LOW–MEDIUM.** One candidate for `/gsd:research-phase`: **inbox real-time update strategy** (TanStack Query polling vs SSE vs Postgres LISTEN/NOTIFY) — Pitfall #24 motivates avoiding plain polling but the right alternative depends on staff-volume from REQUIREMENTS.

---

### Phase 3+ — Out of v1 Scope (for context only)

| Phase | Scope | Research-flag |
|---|---|---|
| **Phase 3** | Mobile features in customer's RN app | **Needs research at Phase 3 planning** — depends entirely on customer's existing RN codebase (Expo vs bare, current auth, push setup). Pitfall #17 + push token scoping re-engage. |
| **Phase 4** | Reporting (Analytics template fork) + KB (Content template fork) | Standard. App-fee reconciliation report from Pitfall #13 lives here. |
| **Phase 5** | Calorie counter + OpenFoodFacts | Standard. LLM-fill for natural-language is the only novel bit. |

### Phase Ordering Rationale

- **Phase 0 before Phase 1:** audit + template-submission lead time + Vercel/RR v7 validation are gates.
- **Phase 1 (spine) before Phase 2 (product):** loudest convergent theme. Every product feature consumes the spine.
- **Within Phase 2, inbox and schedule tracks can parallelise** — they share only the member profile (integration point ≈ week 4). Solo-dev = "switch contexts" not "run in parallel" but either track can pause without halting the other.
- **Differentiators cluster late in Phase 2** — they depend on both tracks. NOT optional — they are why the customer signed.

### Research Flags

**Phases likely needing `/gsd:research-phase`:**
- **Phase 1:** Vercel ↔ Fly Redis routing; BullMQ vs pg-boss commit point.
- **Phase 2:** Inbox real-time update strategy.
- **Phase 3:** Mobile integration patterns (contingent on customer's RN codebase).

**Standard patterns (skip research-phase):**
- **Phase 0:** Audit IS the research.
- **Phase 4:** Reporting + KB well-trodden; agent-native templates encode the shape.
- **Phase 5:** Calorie + OpenFoodFacts standard.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Framework verified by direct repo inspection. MEDIUM on `@great-detail/whatsapp` (single-maintainer); MEDIUM on BullMQ-vs-pg-boss; MEDIUM-LOW on exact RR v7 patch version (pin to upstream). |
| **Features** | HIGH | Verified across 13 competitors. HIGH on table-stakes + WhatsApp constraint rules; MEDIUM on pass-debit priority semantics for hybrid pass+membership cases (opinionated rule). |
| **Architecture** | HIGH | Receiver/worker/idempotency topology verified against Stripe, Hono, WhatsApp Cloud API docs. MEDIUM on agent-native fork mechanics until Phase 0 confirms; MEDIUM on Vercel↔Fly Redis routing (resolve at Phase 1). |
| **Pitfalls** | HIGH | Integration-specific have direct vendor-doc support + 2026 community write-ups. MEDIUM for per-customer-deploy specifics (M365/multi-tenant ops literature transferred; abstract pattern documented, exact tooling fresh ground). |

**Overall confidence:** **HIGH** — MEDIUM items are well-flagged, each carries a specific mitigation, none invalidate the v1 plan.

### Gaps to Address (consolidated from all four files, deduplicated)

**Customer-facing (Phase 0 onboarding conversation):**
1. Class types need spot picking / reformer / bike selection? (Default: no.)
2. Offer 1:1 personal training? (Default: no.)
3. Staffed check-in only, or 24/7 door access? (Default: staffed.)
4. WhatsApp number readiness: 2FA off, no personal history, Meta Business Manager set up?
5. Currently use a POS for retail/merch? (If yes, they keep it.)
6. Cancellation window policy (hours before class) — default per studio.
7. Late-cancel default mode: forfeit credit only (v1)? Confirm.
8. Recurring membership pricing structure — need full price list to set up Stripe.
9. Default class capacity, typical recurring schedule shape.
10. Existing member list — opt-in evidence available?

**Technical-decision (Phase 1 planning):**
1. **BullMQ vs pg-boss** — depends on outbound + reminder + Stripe-event volume.
2. **Vercel ↔ Fly Redis routing** — public Upstash OR Fly internal HTTP endpoint (recommended).
3. **Inbox real-time update strategy** — polling vs SSE vs LISTEN/NOTIFY.
4. **Phase 0 audit outcome** — fork-clean vs adapt vs build-fresh.

**Cross-cutting policy (REQUIREMENTS):**
1. Idempotency-key strategy for staff actions (explicit `Idempotency-Key` header OR natural keys?).
2. Audit log scope — which staff actions log to `audit_log`? Default: all writes.
3. Member data deletion / GDPR posture per studio.
4. Backup + DR cadence + studio-facing recovery SLA.

---

## Sources

Full source lists live in each research file. Aggregated highlights:

**Primary (HIGH confidence):**
- `BuilderIO/agent-native` repository (web-inspected 2026-05-17)
- React Router v7 docs, Stripe docs (webhooks + Connect), Meta WhatsApp docs + Issue #31, Drizzle ORM docs, Neon docs, Better-auth docs, shadcn/ui docs, Vercel changelog + community threads, Fly.io blueprints, Hono docs, PostgreSQL docs, BullMQ docs.

**Secondary (MEDIUM confidence):**
- Stripe webhook patterns (Appycodes 2026, HookRay 2026, Simplico 2026)
- WhatsApp integration (Chatarmin, Gurusup, ChatArchitect, Sanuker, Infobip, Hookdeck)
- 13 competitor feature analyses (Vibefam, G2, StudioGrowth, Wellyx, Capterra, etc.)
- Booking concurrency (Amitav Roy, HackerNoon, Adam Djellouli)
- Forking discipline (Meta Engineering Apr 2026, Preset fork drift, GitHub friendly-fork)
- Neon + Drizzle (BuildPilot, Vibe-eval, Raxxo, Encore)
- Multi-tenant ops (Qrvey, Entro, Clerk, WorkOS, CloudZero)

**Tertiary (LOW confidence — flagged):**
- `@great-detail/whatsapp` npm + GitHub (single-maintainer; mitigation = Phase 0 mirror)
- Per-customer-deploy with Neon + Vercel + Fly tooling specifics (abstract pattern documented; exact combination is fresh ground)

**Project context files:**
- `C:\Users\dimet\hustle\.planning\PROJECT.md`
- `C:\Users\dimet\hustle\.planning\research\STACK.md`
- `C:\Users\dimet\hustle\.planning\research\FEATURES.md`
- `C:\Users\dimet\hustle\.planning\research\ARCHITECTURE.md`
- `C:\Users\dimet\hustle\.planning\research\PITFALLS.md`

---

*Research synthesis for: GymOS — boutique fitness studio management platform*
*Synthesized: 2026-05-17*
*Ready for roadmap: yes*
