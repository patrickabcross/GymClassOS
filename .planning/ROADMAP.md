# Roadmap: GymOS

## Overview

GymOS v1 ships in **two milestones**:

1. **Demo Sprint** — Week 1 (by ~2026-05-24). A vertical slice across all surfaces — prototype quality, deliberate corner-cutting acceptable, throwaway code where useful. Goal: signed customer sees a working URL on their phone (member PWA) and laptop (staff back-office) within the week, with at least one of: real inbound WhatsApp message in the inbox, one outbound WhatsApp send, one Stripe Checkout completed in test mode, one class booked, one meal logged, one agent chat exchange.

2. **Production v1** — Weeks 2–9 (by ~2026-07-15). Hardens the demo into production code. Adds the requirements that didn't make the demo (full Stripe webhook spine, full WhatsApp 24h-window + opt-in enforcement at sender layer, atomic booking transactions, waitlist + reply-to-confirm, notifications, settings, per-studio deploy machinery).

The demo deliberately cuts corners that production cannot: skipping atomic transactions, hardcoded test data, relaxed window-checks, single-studio config, no full idempotency. The production milestone is "rebuild every demo corner-cut as production-grade." This separation lets the demo move fast without polluting the production design.

Post-v1 backlog (HealthKit + native mobile, Coach View with health context, CRM campaigns + segments, Knowledge Base, Reporting, bsport-migration productisation, A2A) lives in REQUIREMENTS.md and PLATFORM-VISION.md.

## Milestones

- [ ] **Milestone 1: Demo Sprint** (Week 1) — vertical slice for customer's first look
- [ ] **Milestone 2: Production v1** (Weeks 2–9) — harden + extend to production-ready

## Milestone 1: Demo Sprint

**Window:** 2026-05-17 → ~2026-05-24 (~7 days)
**Quality bar:** Prototype. Stubs OK. Hardcoded data OK on non-demo paths. Golden-path flows must work.
**Demo delivery:** URLs on customer's devices — staff back-office on laptop, member PWA installed to home screen on phone.

### Phase D0: Fork + Schema + Deploys (Days 1–2)

**Goal:** Fork agent-native, get the workspace running locally, deploy a hello-world staff-web to Vercel against a Neon database, schema in place.

**Requirements:** FND-02, FND-03, DB-01, DB-02 (partial, demo subset), AUTH-01 (seeded), MEMAUTH-01 (stubbed magic-link)

**Success criteria:**
1. `pnpm install && pnpm dev` in the fork runs the Mail + Calendar templates locally without errors
2. A hello-world page on the staff-web app loads on a public Vercel URL with Better-auth signing in a seeded test coach
3. Drizzle migration creates the demo-subset of tables on a fresh Neon project; `pnpm db:studio` shows them
4. No `studio_id` column anywhere in the schema (`grep -r "studio_id" packages/db` returns zero)

### Phase D1: Staff Surfaces Adapted from Mail + Calendar (Days 2–4)

**Goal:** The staff back-office shows recognisable Mail-as-inbox and Calendar-as-schedule surfaces with seeded data, plus a member directory and basic payments view.

**Requirements:** INBX-01, INBX-02, INBX-03, INBX-06 (thin), INBX-07, MEM-01, MEM-02, SCH-01, BKG-01, PAY-01, STR-01, STR-02

**Success criteria:**
1. Inbox screen loads with 3–5 seeded conversations, opens a message thread, lets coach type and send a message (sends to a real WhatsApp number via Meta API for at least one happy-path test)
2. Schedule screen renders the seeded week (Mon–Sun) with class occurrences in the studio's local timezone
3. Member directory lists 5–10 seeded members; clicking one opens a profile with their bookings + pass balance
4. Member context panel in the inbox shows next-class + pass-balance for the opened conversation's member (real data)
5. Stripe Checkout link generated for a 10-pack purchase + paid in Stripe test mode + resulting pass grant visible in member profile

### Phase D2: Member PWA + Calorie Counter + Agent (Days 4–7)

**Goal:** Member can install the PWA to their phone home screen, log in, browse + book a class, log a meal, and chat with the in-app agent.

**Requirements:** MEMBR-01, MEMBR-02, MEMBR-03, MEMBR-06 (basic manifest), CAL-01, CAL-02, CAL-03, AGENT-01, AGENT-02, AGENT-03, WA-01 (verify inbound), WA-02 (one outbound)

**Success criteria:**
1. Customer can open the PWA URL on their iPhone, hit "Share → Add to Home Screen," tap the resulting icon, and see the member home screen
2. Member can browse the seeded class schedule and book one class; pass balance reflects the debit
3. Member can search "banana" → find an Open Food Facts result → log it as a snack; daily totals (kcal + macros) update
4. Member can scan a barcode (using browser camera + ZXing) on a packaged food → see it logged with nutrition
5. Member can open the agent chat sheet, type "what classes are on tomorrow?" → agent replies with class list (via `view_schedule` tool... or stubbed if time-constrained, via `greet` + manual list)
6. Member can type "book me into the 7am yoga tomorrow" → agent uses `book_class` tool with confirmation step → booking appears
7. Member can type "I had a chicken caesar at Pret" → agent uses `log_food_nl` → food entry created
8. At least one real inbound WhatsApp message from a test phone surfaces in the staff inbox

**Risks (from PITFALLS.md, demo-relevant subset):**
- #1 (24h-window violation → Meta suspension) — demo only sends to ONE test number that has just messaged inbound; UI gate is enough for demo (worker-level gate is production work)
- #19 (`@great-detail/whatsapp` single-maintainer) — mirror at production stage, demo can use npm directly
- #16 (RR v7 × Vercel middleware edge cases) — flagged; hello-world deploy in D0 is the validation gate

**UI hint:** yes

## Milestone 2: Production v1

**Window:** ~2026-05-25 → ~2026-07-15 (~8 weeks)
**Quality bar:** Production. Atomic transactions. Idempotent everything. PII redacted logs. Per-studio deploy script. Real customer cutover lands in this window.

The production milestone is structured as 4 phases (preserving the prior coarse-grained roadmap shape). Each phase hardens demo corner-cuts AND adds the requirements that didn't make the demo.

### Phase P0: Audit & De-Risk (~3–5 days)

**Goal:** Long-lead-time and architectural risks neutralised before production code is written. Template audit completed. WhatsApp templates submitted to Meta (≤48h approval). `@great-detail/whatsapp` mirrored. Customer onboarding checklist signed off.

**Requirements:** FND-01, FND-04, FND-05, FND-06, FND-07, FND-08

**Success criteria:**
1. `audit/decision.md` exists with a fork-clean / adapt / build-fresh ruling per surface (Mail-as-inbox, Calendar-as-schedule, calorie-counter-fresh, member-PWA-shell, others noted post-v1)
2. Both git remotes set up (`origin` + `upstream` = `BuilderIO/agent-native`); `MODIFICATIONS.md` committed
3. `@great-detail/whatsapp` mirrored to the studio org's GitHub; package pinned to mirror git SHA
4. All four WhatsApp templates (`class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`) submitted to Meta — approval status visible in Meta Business Manager
5. Customer onboarding checklist signed off (Meta Business Manager + WhatsApp phone clean + Stripe account created + restricted key generated)

### Phase P1a: Data Foundation, Auth & Deploy (~2 weeks)

**Goal:** Coach + Member can log in to a production-deployed staff-web + member-PWA; schema has every table required by P1b and P2; adding a new studio is a single scripted command.

**Requirements:** DB-02, DB-03, DB-04, DB-05, DB-06, DB-07, AUTH-02, AUTH-03, AUTH-04, AUTH-05, MEMAUTH-02, MEMAUTH-03, MEMAUTH-04, DEP-01, DEP-02, DEP-03, DEP-04, OBS-01, OBS-02

**Success criteria:**
1. Coach sign-in via Better-auth with admin/coach role split enforced in UI + integration test
2. Member sign-in via magic-link delivered through WhatsApp template (no email channel)
3. `scripts/deploy.sh <studio>` deploys all three apps from a populated `studios/<studio>/env.yml`; fails-fast on missing/malformed env
4. `drizzle-kit migrate` runs cleanly against a fresh Neon project; `drizzle-kit push` is blocked; `grep -r "studio_id" packages/db/schema` returns zero
5. `pass_debits` CHECK constraint survives a 50-concurrent-debit test; recurring `schedule_rule` materialises across a DST boundary correctly in test
6. PWA passes a Lighthouse PWA audit (installable, service worker, manifest); installs to home screen on iOS Safari + Android Chrome
7. `/healthz` on edge-webhooks returns latency + queue-depth + last-processed JSON

### Phase P1b: Webhook + Worker Spine (Stripe + WhatsApp) (~2 weeks)

**Goal:** Every external event from Stripe or Meta is received, signature-verified, persisted idempotently, processed by a pg-boss worker. Every outbound WhatsApp send is gated at the worker layer by 24h-window + opt-in checks. Stripe restricted-key flow is rotation-capable.

**Requirements:** WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, STR-03, STR-04, STR-05, STR-06, STR-07, WA-03, WA-04, WA-05, WA-06, WA-07, WA-08, WA-09

**Success criteria:**
1. Replaying the same Stripe `checkout.session.completed` event twice via Stripe CLI produces exactly one `payments` row and exactly one pass grant
2. A WhatsApp inbound message from a real phone appears in `messages` within seconds; duplicate Meta deliveries produce no duplicate rows
3. Calling `sendMessage()` from the worker with a free-text body for a conversation whose `last_inbound_at` is > 24h returns a typed `WindowExpiredError` — no Meta API call made
4. Calling `sendMessage()` for a member with no row in `whatsapp_opt_in` returns a typed `NoOptInError` regardless of window state
5. Tampered webhook body to `/webhooks/stripe` or `/webhooks/whatsapp` returns 400 before any JSON parsing
6. Stripe restricted key validity check passes in settings UI; admin can rotate the key without downtime

**Risks (from PITFALLS.md):**
- #1, #2 (idempotency + window violation) — directly addressed by single sendMessage chokepoint + atomic webhook reducer
- #8 (webhooks on Vercel) — webhooks live only on Fly with `min_machines = 1`
- #9 (body parser before HMAC) — Hono `c.req.text()` before any JSON parsing
- #11 (WhatsApp status webhook dedup) — ordinal-guarded UPDATE on `messages.status`
- #17 (WhatsApp opt-in) — `whatsapp_opt_in` table + sender-gate refusal
- #19 (single-maintainer SDK) — thin adapter; mirror pinned
- #20 (worker at-least-once → duplicate sends) — pg-boss `singletonKey` per job

### Phase P2: Staff + Member Product Surfaces (~3–4 weeks)

**Goal:** Production-quality versions of every surface the demo showed, plus the surfaces the demo skipped. Coach runs a full day from staff-web; member runs their fitness life from the PWA.

**Requirements:** All remaining [P] requirements — INBX-04/05/08, MEM-03/04/05/06/07, SCH-02 through SCH-07, BKG-02/03/04/05/06, WAIT-01..06, PAY-02/03/04/05, MEMBR-04/05/07, CAL-04 through CAL-11, AGENT-04 through AGENT-09, NOTIF-01..05, RTC-01/02/03, SET-01/02/03

**Success criteria:**
1. **Differentiator #1:** Member context panel inside the inbox shows full context (next class, pass balance + expiry, active subscription, food adherence summary, lifetime bookings) without leaving the inbox
2. **Differentiator #2:** Coach can book a member from inside a conversation; flows through the same atomic booking transaction as the schedule UI
3. Recurring schedule materialises 8 weeks ahead via worker job; DST-correct
4. 50-concurrent booking test on a 12-seat class → exactly 12 succeed; pass balances never go negative
5. Waitlist promote + WhatsApp offer + reply-to-confirm cycle works end-to-end (one happy path + one TTL-expiry path)
6. Stripe Checkout links flow back to pass / subscription state via webhook reducer
7. 24h + 2h reminders fire idempotently; re-running the reminder generation produces no duplicate sends
8. Member can do full calorie counter loop: search/barcode/custom-entry/manual log + see daily and weekly totals + macro rings against profile-derived targets
9. In-app agent has full skill set (book, cancel, view schedule, view passes, log food NL, escalate to coach) with audited tool calls + persistent sessions + memory

**Risks (from PITFALLS.md):**
- #3 (class capacity double-booking) — atomic SQL + 50-concurrent test
- #4 (pass-balance race) — `SELECT ... FOR UPDATE` + ledger insert in same transaction
- #5 (DST in UI / engine) — schedule UI renders in studio-local TZ
- #18 (waitlist auto-promotion race) — synchronous cancel + promote, idempotent `singletonKey`, reconciliation cron
- #21 (pass expiry timezone) — end-of-day in studio's IANA TZ

**UI hint:** yes

## Progress

**Execution Order:**
Demo Sprint runs first (D0 → D1 → D2 over 7 days). Production v1 runs after (P0 → P1a → P1b → P2 over 8 weeks).

| Milestone / Phase | Requirements | Status | Completed |
|---|---|---|---|
| **Demo Sprint** | | | |
| D0. Fork + Schema + Deploys | 5 | Not started | - |
| D1. Staff Surfaces Adapted | 12 | Not started | - |
| D2. Member PWA + Calorie + Agent | 14 | Not started | - |
| **Production v1** | | | |
| P0. Audit & De-Risk | 6 | Not started | - |
| P1a. Data Foundation, Auth & Deploy | 19 | Not started | - |
| P1b. Webhook + Worker Spine | 18 | Not started | - |
| P2. Staff + Member Product Surfaces | 50+ | Not started | - |

**Coverage:** 130 v1 requirements mapped across two milestones (31 demo + 99 production).

---

*Roadmap created: 2026-05-17*
*Revised: 2026-05-17 — major restructure (Demo Sprint + Production v1 two-milestone shape; mobile = PWA; Stripe direct; calorie counter in v1)*
*Out of v1 scope: Native mobile (v1.x), HealthKit, Coach View with health context, CRM campaigns + segments, Knowledge Base, Operational Reporting, bsport-migration productisation, A2A. See REQUIREMENTS.md §Post-v1 Backlog and PLATFORM-VISION.md.*
