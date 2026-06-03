# Roadmap: GymClassOS

## Overview

GymClassOS v1 ships in **two milestones**:

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

**Plans:** 4 plans

- [x] D1-01-schedule-surface-PLAN.md — Build /gymos/schedule week-grid + book-from-occurrence dialog (SCH-01, BKG-01) — completed 2026-05-19 (commits f5cdbdc6, dd50fe62, 23ee58f2)
- [x] D1-02-members-directory-PLAN.md — Build /gymos/members + /gymos/members/:id profile with bookings + pass balance (MEM-01, MEM-02)
- [ ] D1-03-payments-stripe-checkout-PLAN.md — Build /gymos/payments with Stripe test-mode Checkout + pass grant (PAY-01, STR-01, STR-02)
- [x] D1-04-inbox-gap-fill-PLAN.md — Add top-nav strip + send acknowledgement + INBX-* audit comments (INBX-01, INBX-02, INBX-03, INBX-06 thin, INBX-07)

### Phase D2: Member Mobile App + Calorie Counter + Agent (Days 4–7)

**Goal:** Member opens an Expo Go link on their phone, loads the GymClassOS member app (forked from agent-native's `packages/mobile-app`), logs in (demo-stub picker), browses + books a class, logs a meal via search + barcode, and chats with the in-app agent that can `greet` / `book_class` (with confirmation) / `log_food_nl`. At least one real WhatsApp message round-trip (inbound + outbound) lands in the staff inbox.

> **CORRECTION (2026-05-17 late):** Earlier text in this file said "PWA" for the member surface. Replaced — member surface is native via Expo + RN, forked from upstream `packages/mobile-app`. Demo via Expo Go (no native module compile, no Apple Dev Account this week). Production via EAS Build later. Read "PWA" / "web manifest" / "install-to-home-screen" elsewhere in this file as native Expo Go install for the demo and EAS Build install for production.

**Requirements:** MEMBR-01, MEMBR-02, MEMBR-03, CAL-01, CAL-02, CAL-03, AGENT-01, AGENT-02, AGENT-03, WA-01, WA-02, MEMAUTH-01 (stubbed picker)

**Success criteria:**
1. Customer can open the Expo Go QR on their iPhone and load the GymClassOS member app (member-picker first launch → 4 tabs after pick)
2. Member can browse the seeded class schedule and book one class from the mobile Schedule tab; the booking reflects in /gymos staff member-profile
3. Member can search "banana" → find an Open Food Facts result → log it as a snack from the Food tab; daily totals (kcal + macros) update on Home + Food tabs
4. Member can scan a barcode (using `expo-camera` built-in scanner) on a packaged food → see it logged with OFF nutrition data
5. Member can open the agent chat sheet from a persistent FAB on every screen
6. Member can type "book me into the 7am yoga tomorrow" → agent uses `book_class` tool WITH explicit confirmation turn (D-13) → booking appears in DB
7. Member can type "I had a chicken caesar at Pret" → agent uses `log_food_nl` → food entry created via OFF top-match
8. At least one real inbound WhatsApp message from a test phone surfaces in the staff inbox AND one real outbound from staff inbox is delivered to the test phone

**Plans:** 5/6 plans executed

- [x] D2-01-mobile-shell-auth-PLAN.md — Strip upstream tabs, install deps, build 4-tab GymClassOS shell + member-picker + AsyncStorage + TanStack Query + apiFetch wrapper + requireDemoMember server helper + `/api/m/members/list` + `/api/m/profile`. Includes the @gorhom/bottom-sheet × Expo Go SDK 55 compatibility spike (Pitfall #4). (MEMAUTH-01 stubbed, MEMBR-03 server side)
- [x] D2-02-whatsapp-webhook-outbound-PLAN.md — `templates/mail/app/routes/webhooks.whatsapp.tsx` HMAC-verified inbound receiver (ngrok-tunnelled) + augment `gymos.tsx` send action with real Meta Graph API v23 POST. (WA-01, WA-02)
- [x] D2-03-member-schedule-booking-PLAN.md — `/api/m/schedule` 7-day window + `/api/m/bookings` POST + mobile Schedule tab with day-grouped cards + optimistic UI booking. (MEMBR-01, MEMBR-02)
- [x] D2-04-member-home-tab-PLAN.md — SVG-free KcalRing component + Home tab with greeting / pass-balance pill / next-class card / kcal ring + macros. (MEMBR-03)
- [x] D2-05-food-calorie-counter-PLAN.md — OFF search + barcode proxy endpoints + food-entries CRUD + BarcodeScanner component (`expo-camera`) + Food tab + /food-add search screen + /food-barcode scan screen. (CAL-01, CAL-02, CAL-03) — completed 2026-05-19 (commits `1812a43e`, `57ad0abb`, `d9c47592`, `bcbe63e4`; SUMMARY in `D2-05-food-calorie-counter-SUMMARY.md`)
- [ ] D2-06-agent-chat-sse-tools-PLAN.md — `/api/m/agent/stream` SSE route with Anthropic Sonnet 4.6 + prompt caching + manual 3-tool loop (greet / book_class with confirmation / log_food_nl) + `react-native-sse` consumer + AgentSheet component + persistent FAB. (AGENT-01, AGENT-02, AGENT-03)

**Risks (from PITFALLS.md, demo-relevant subset):**
- #1 (24h-window violation → Meta suspension) — demo only sends to ONE test number that has just messaged inbound; UI gate is enough for demo (worker-level gate is production work)
- #19 (`@great-detail/whatsapp` single-maintainer) — mirror at production stage, demo can use npm directly
- #16 (RR v7 × Vercel middleware edge cases) — flagged; hello-world deploy in D0 is the validation gate
- D2-RESEARCH #4 (`@gorhom/bottom-sheet` × Expo Go SDK 55 worklets) — Wave 0 spike in D2-01 decides between gorhom and RN `<Modal>` fallback before D2-06 lands
- D2-RESEARCH #7 (OFF returns null nutriments) — Food tab + barcode screen surface a warning when kcal=0 instead of silently logging junk

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

**Plans:** 9 plans

- [x] P1b-01-monorepo-refactor-staff-web-PLAN.md — Move templates/mail/ → apps/staff-web/; templates/mail/ back to upstream-clean; regenerate Drizzle migration for PG dialect (no requirement IDs — pure refactor) — completed 2026-05-20 (commits `1b601f3c`, `7efcbf9a`, `a126010a`, `b8cb721a`, `51e67e67`; SUMMARY in `P1b-01-monorepo-refactor-staff-web-SUMMARY.md`)
- [x] P1b-02-schema-migration-additive-PLAN.md — Single additive Drizzle migration: whatsapp_opt_in, whatsapp_templates, stripe_customers, stripe_subscriptions, payments, secrets (pgcrypto); whatsapp_window_state VIEW; extend webhook_events with (provider, external_id) UNIQUE + backfill; extend messages with delivered_at/read_at/error_code (WEB-03/05, WA-04/06/07/08, STR-03..07)
- [x] P1b-03-packages-queue-whatsapp-PLAN.md — packages/queue (typed pg-boss publishers + UNPOOLED guard) + packages/whatsapp (thin transport adapter); D-11 compile-time guard that apps/staff-web cannot import @gymos/whatsapp (WA-09)
- [x] P1b-04-edge-webhooks-fly-receiver-PLAN.md — apps/edge-webhooks Hono receiver on Fly region iad (research override of CONTEXT D-02 lhr); two-process fly.toml; raw-body HMAC + idempotent insert + enqueue (WEB-01/02/03)
- [x] P1b-05-worker-inbound-whatsapp-PLAN.md — apps/worker bootstrap + inbound-whatsapp queue handler (concurrency=5); upsertConversationAndMessage + ordinal-guarded status updates (WEB-04/05, WA-03/04)
- [x] P1b-06-worker-sendmessage-chokepoint-PLAN.md — Three gates (opt-in, window, template-approved) + sendMessage chokepoint + outbound-whatsapp queue (concurrency=1); typed errors NoOptInError/WindowExpiredError/TemplateNotApprovedError (WA-05/06/07/08/09)
- [x] P1b-07-worker-stripe-reducers-PLAN.md — 6 Stripe reducers (checkout.session.completed, invoice.paid/payment_failed, subscription.updated/deleted, charge.refunded) + single TX + apiVersion pin '2026-04-22.dahlia' + pgcrypto-encrypted secrets storage + rotation-capable getStripeSecretKey (WEB-06, STR-03..07)
- [x] P1b-08-staffweb-outbound-rotation-PLAN.md — /gymos Send action refactored to enqueue (no direct Meta) + loader exposes whatsapp_window_state + opt-in; UI badges + Send gate + D-19 failed-bubble copy; /gymos/settings/integrations Stripe key rotation (WA-05/08)
- [ ] P1b-09-validation-cutover-PLAN.md — WA-08 daily template-sync cron via pg-boss schedule + integration tests for the 4 D-23 scenarios + Meta/Stripe URL flip + DELETE templates/mail/webhooks.whatsapp.tsx (D-05 last task) (WA-08)

### Phase P1b.1: Customer Pilot Enablement (INSERTED — 2026-05-25)

**Goal:** Hand the deployed staff-web to the signed customer as a real pilot tool. After the successful 2026-05-25 demo, the customer immediately needs (a) accounts to log in with and (b) the ability to actually send WhatsApp messages from the inbox via approved templates. Plus the cosmetic + functional cleanup the demo exposed: `/gymos` looks like an email client, the AI sidebar isn't gym-aware, and Analytics is missing from the top-nav.

**Scope:**
1. **Strip email chrome from `/gymos/*`** — the email AppLayout (`apps/staff-web/app/components/layout/AppLayout.tsx`) wraps gymos routes today, bleeding email-only UI (hamburger, "Important"/"Other" tabs, email sidebar, email Compose button, refresh, bell) on top of `GymosTopNav`. Short-circuit `/gymos/*` to a bare gymos layout: only `GymosTopNav` + content + right-rail Chat.
2. **Rename "Compose" → "Templates" + open WhatsApp template picker.** WhatsApp Business cannot send free-text outside the 24h window; the button must reflect that. Clicking opens a `<Dialog>` listing approved templates (queried from Meta, or seeded `whatsapp_templates` for the first pilot), variable form for the chosen template, and sends via the P1b-06 worker `sendMessage` chokepoint (which already enforces opt-in + window + template gates).
3. **Add Analytics tab to GymosTopNav** — new `/gymos/analytics` route showing booking fill rate, cancellation rate, no-shows, pass utilisation (read-only dashboards for first pilot; exact metric list finalised at plan time).
4. **Provision staff logins for customer** — Better-auth accounts for the studio's coach(es) + owner. Email/password seeded by us, or magic-link via email (decide at plan time). Customer logs in to `gym-class-os.vercel.app` and reaches `/gymos` without our help.
5. **Ground the AI assistant in gym data, not email.** AgentSidebar in `AppLayout.tsx:138` already shows gym-flavored suggestions, but the agent's tools + system prompt still come from the Mail template's `apps/staff-web/AGENTS.md`. Replace (or layer) with a gymos AGENTS.md describing actions like `list-classes`, `list-bookings`, `list-cancellations`, `member-retention`; write the matching actions in `apps/staff-web/actions/` where they don't exist; verify the agent answers the three suggestion prompts end-to-end.

**Requirements:** AUTH-01 (extend to customer accounts), WA-05/-06/-07 (template send path — most shipped in P1b-06, this surfaces it in UI), INBX-01/-02 (gym-focused inbox chrome), AGENT-04/-05 (gym-aware agent surface — pulled forward from P2 for pilot)

**Success criteria:**
1. Customer signs in to `https://gym-class-os.vercel.app` with their own credentials and lands on `/gymos` without a redirect to `/inbox` or any email surface.
2. `/gymos/*` shows only the gymos top-nav (Inbox / Schedule / Members / Payments / Analytics / Settings) + content + right-rail Chat. No hamburger, no "Important"/"Other 25", no email Compose, no email sidebar.
3. Clicking "Templates" from a conversation opens a dialog of approved WhatsApp templates; selecting one + filling variables + Send enqueues an outbound that arrives on a test WhatsApp number via Meta Cloud API.
4. `/gymos/analytics` loads and shows at least three real metrics from the seeded data (fill rate, cancellation rate, pass utilisation — exact set finalised at plan time).
5. Asking the right-rail Chat "which classes haven't been filled in the last week?" returns a real answer from gym data (not an email-assistant response); same for "provide renewal numbers" and "which customers should I reach out to?".
6. Sending free-text WhatsApp to a number whose 24h window has expired is rejected by the worker with the typed `WindowExpiredError` (no Meta API call made) — confirms P1b-06 gates still hold from the new UI.

**Depends on:** Phase P1b (P1b-06 sendMessage chokepoint + P1b-08 outbound-rotation UI both ✓)

**Risks:**
- **WhatsApp templates not yet approved by Meta.** P0 success criterion 4 (templates submitted) hasn't been hit; the first pilot may have zero approved templates, leaving the Templates button useless except for 24h-window replies. Plan-phase decides: ship Templates UI now and gate behind seeded test templates, or pull P0 template submission forward.
- **Better-auth for non-Google customer accounts** — staff-web has only seen Google OAuth in the demo path. Plan-phase decides email/password vs. email magic-link and verifies Better-auth's email transport.
- **Agent action surface drift.** If `apps/staff-web/actions/` lacks the actions the new gymos AGENTS.md describes, the agent will hallucinate. Plan-phase verifies action inventory before writing AGENTS.md.

**Plans:** 8/8 — phase live-accepted 2026-05-26

- [x] P1b.1-01-bare-gymos-layout-PLAN.md — Strip email chrome from /gymos/* (AppLayout early-return for /gymos paths) and add Analytics tab to GymosTopNav (INBX-01, INBX-02)
- [x] P1b.1-02-auth-allowlist-access-denied-PLAN.md — CUSTOMER_ALLOWED_EMAILS env allowlist hook in auth.ts + branded /access-denied route (AUTH-01)
- [x] P1b.1-03-gym-actions-part-a-PLAN.md — Create list-fill-rate, list-classes, list-members defineAction files (AGENT-04)
- [x] P1b.1-04-gym-actions-and-template-seed-PLAN.md — Create list-renewals, list-at-risk-members + seed 5 whatsapp_templates rows including approved hello_world (AGENT-05, WA-05)
- [x] P1b.1-05-templates-dialog-PLAN.md — Templates picker dialog beside Send in gymos._index.tsx reply form, routes through enqueueOutboundWhatsApp with type:'template' payload (WA-05, WA-06, WA-07)
- [x] P1b.1-06-analytics-route-PLAN.md — /gymos/analytics route with Fill Rate / Cancellation Rate / Pass Utilisation metric cards (INBX-01)
- [x] P1b.1-07-gym-agent-surface-PLAN.md — Rewrite agent-chat.ts systemPrompt + replace apps/staff-web/AGENTS.md with gym version (AGENT-04, AGENT-05)
- [~] P1b.1-08-end-to-end-verification-PLAN.md — Live-accepted 2026-05-26 in lieu of formal walkthrough. VERIFICATION.md scaffold remains as reference but user signed off in-situ after a wave of live-fixes (sign-out button, month-grid calendar, members detail link, MRR/net-growth analytics cards, agent provider wiring, env-vars→app_secrets fallback, Gmail-scope sign-in fix, Builder.io card removal). See `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-LIVE-ACCEPTANCE.md`.

**▶ Next up (post-P1b.1):**
1. **WhatsApp integration deep wire** — migrate `services/worker/` and `services/edge-webhooks/` to read Meta credentials from `app_secrets` (so the in-app Settings UI is the single source of truth, not `fly secrets set`); wire WA-08 template sync cron to replace seeded stubs with real Meta approvals; end-to-end test of outbound send + inbound delivery/read callbacks against the verified WABA.
2. **Mobile app (member surface)** — resume D2 work (Task 4 of in-app agent was pending; D2-06 verification deferred); cut an EAS preview build under the customer's existing Apple Developer Account so the studio can hand the member experience to a real test cohort.

### Phase P1c: Public Site Integrations (~2–3 weeks — DRAFT, not yet planned)

**Goal:** Productize the pilot for *visitors* — people who land on the studio's marketing site (`doyouhustle.co.uk`) but haven't signed in to anything. Two surfaces:

1. **Forms app fork** — copy `templates/forms/` into `apps/forms/` (or `apps/staff-web/features/forms/` — decided at plan time). Studios build their own lead-capture / trial-signup / contact / membership-inquiry forms in the staff back-office, embed them on the marketing site with a `<script>` snippet, and submissions land in Neon as conversations (showing up in `/gymos`) or in a dedicated `/gymos/leads` queue. ~1–2 days lift.
2. **Schedule + booking embed widget** — public route `/embed/schedule` (and possibly `/embed/book/:occurrenceId`) renderable in an `<iframe>` or via a hosted `<script>` snippet that mounts a widget. Visitor sees the live class schedule, clicks a slot, completes Stripe Checkout (drop-in or 10-pack purchase) without signing into GymOS. Cross-origin `postMessage` for "I just booked" callbacks so the host site can react (analytics, redirect, etc.). ~1–2 weeks lift — the real commercial unlock; most boutique studios pay Mindbody/Bsport mainly for this widget.

**Scope (subject to plan-phase refinement):**

- **P1c-01 — Fork forms template into the workspace.** Following the same boundary discipline as `apps/staff-web/`: `apps/forms/` (standalone) or `apps/staff-web/features/forms/` (co-located). Plan-phase picks based on whether the customer wants forms editor in the same login as staff-web.
- **P1c-02 — Forms submission → conversations queue.** Submitted form data POSTs to a public action; server creates / upserts a `gym_members` row keyed by email or phone; opens a `conversations` row in `status='lead'`; appears in `/gymos` (or a sibling `/gymos/leads` tab — UI decision).
- **P1c-03 — Public `/embed/schedule` route.** Reads the same `class_occurrences` data as the staff schedule but with anonymous access (no auth gate). Server-rendered HTML for SEO; minimal JS for click → booking flow. Themeable via URL params (`?accent=#000&radius=8`).
- **P1c-04 — Anonymous booking flow + Stripe Checkout.** Visitor picks a slot → enters name+email+phone → server creates pending `gym_members` + `bookings` row → redirects to Stripe Checkout → webhook (`P1b-07` reducer) creates a pass + binds it to the booking on success. Capacity check lives in the worker (atomic — see PITFALL #3).
- **P1c-05 — Cross-origin embed plumbing.** `<script src="https://gym-class-os.vercel.app/embed.js">` snippet that injects a styled iframe; `postMessage` API for `booking:completed` and `booking:cancelled` callbacks; sample integration doc for `doyouhustle.co.uk`.
- **P1c-06 — End-to-end test.** Embed the widget on a throwaway page, complete a real booking + Stripe Checkout from a clean browser, verify pass appears in `/gymos/members/{id}` + lead conversation appears in `/gymos`.

**Requirements:** New (to be added to REQUIREMENTS.md at plan-phase): FORMS-01..FORMS-04, EMBED-01..EMBED-06. PITFALL #3 (atomic capacity) is in scope; PITFALL #4 (pass-balance race) is in scope for the Checkout webhook reducer.

**Depends on:**
- P1b-07 Stripe webhook reducer (✓ shipped — needed for Checkout→pass binding)
- P1b-06 sendMessage chokepoint (✓ shipped — booking confirmation WhatsApp message will route through it)
- The deferred P1c work below can start in parallel with the WhatsApp deep wire + Mobile app workstreams, OR stack after them — see plan-phase

**Risks:**
- **Cross-origin auth model for the embed.** Visitor isn't logged in; submission must be safe against bots (rate limit + maybe lightweight CAPTCHA on POST). Decision at plan-phase: full anonymous + Stripe-anti-fraud, or require email-verification before booking.
- **Theming / brand fit.** Studio brand likely doesn't match GymClassOS defaults. Plan-phase decides theming scope: URL params only, or full CSS-variable injection.
- **Capacity races at scale.** Embed widget might surface a class as "1 spot left" to multiple visitors simultaneously; PITFALL #3 atomic capacity check must hold under the anonymous flow too.
- **Stripe Checkout vs. embedded Payment Element.** Checkout is faster to ship; embedded element looks more integrated. Plan-phase picks; Checkout is the safer demo default.

**Requirements (registered 2026-06-01):** FORMS-01..04, EMBED-01..06 (10 [P] reqs — now in REQUIREMENTS.md).

**Plans:** 7/7 plans complete
- [ ] P1c-01-PLAN.md (wave 0) — additive lead schema migration: conversations.status 'lead' CHECK, gym_members email/phone partial-unique, conversations (member_id,channel) unique, form_submissions table
- [ ] P1c-02-PLAN.md (wave 1) — fork templates/forms → features/forms; lead-upsert submission handler; CORS + auth publicPaths + UK phone E.164 normaliser [FORMS-01, FORMS-03]
- [ ] P1c-03-PLAN.md (wave 1) — create-checkout-link action (Stripe hosted Checkout w/ metadata.memberId for the P1b-07 reducer) [EMBED-05]
- [ ] P1c-04-PLAN.md (wave 2) — staff forms builder at /gymos/forms + Forms tab + /gymos?filter=leads inbox filter [FORMS-02]
- [ ] P1c-05-PLAN.md (wave 2) — SSR /embed/schedule widget + URL-param theming + enquire→lead CTA + seeded enquiry form [EMBED-01, EMBED-02, EMBED-03]
- [ ] P1c-06-PLAN.md (wave 3) — /embed.js <script> snippet (origin-checked postMessage relay + iframe auto-resize) [FORMS-04, EMBED-04]
- [ ] P1c-07-PLAN.md (wave 4) — end-to-end smoke test: embed → lead → Checkout → pass [EMBED-06]

---

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

### Phase P3: AI Noticeboard Home (~1–2 weeks)

**Goal:** Replace the `/gymos` post-login landing with an old-school noticeboard/bulletin-board dashboard (Polsia-style; fits the gym brand). A board of section cards is the first thing a coach/manager sees after login. The existing right-rail agent chat stays but gains the ability to **author** dashboard content — turning the agent from read-only Q&A into a human-in-the-loop operator that surfaces recommendations and recently-taken actions, and maintains a prioritized Tasks list.

**Locked decisions (from discussion 2026-06-03 — fixed, do not relitigate):**
1. **AI role = "Suggest + one-click act".** AI proposes an action (draft a win-back WhatsApp to lapsing members, promote an under-filled class); coach approves with one click; AI executes via the **existing** actions (`send-template-to-members`, `create-checkout-link`, `navigate`). Deliberate shift from the read-only pilot posture to human-in-the-loop. **CRITICAL:** existing WhatsApp compliance gates (opt-in + 24h window + approved-template, enforced at the worker chokepoint) MUST stay in force — one-click approve does NOT bypass them. Coach approves every send.
2. **Progress subheadings = computed** from existing `list-*` actions wherever a real metric exists (`list-fill-rate`, `list-renewals`, `list-at-risk-members`, `list-revenue`, inbox unread/open counts); AI-written prose only fills gaps + section bodies.
3. **V1 sections** = Inbox (WhatsApp), Schedule, Members, Revenue — PLUS an "AI today" status header strip (what the agent just did / is working on) and an AI-curated overall **Tasks** section (prioritized; each task can carry a one-click action).

**Four-area scope (agent-native contract — all four required):**
- **UI:** new noticeboard route + section cards (noticeboard aesthetic; shadcn primitives; Tabler icons; CSR via `ClientOnly` — logged-in page, SSR not required).
- **Storage (SQL):** the agent now authors dashboard state → additive persistence for per-section AI notes + Tasks list + pending one-click action proposals (new tables e.g. `dashboard_notes` / `dashboard_tasks`, or `application_state`). Strictly additive migrations applied direct-to-Neon-via-MCP per the P1c `0001–0004` pattern (`db.ts` does NOT auto-run gymos migrations).
- **Actions:** new `defineAction` ops for the agent to upsert section content, create/complete tasks, and the propose→approve→execute handshake (approve invokes existing send/checkout actions; gates intact).
- **Skills/AGENTS.md:** update `apps/staff-web/AGENTS.md` to teach the board-authoring + suggest-and-act role; revise the now-outdated "read-only for pilot" / "Agent CANNOT send WhatsApp" notes to reflect the human-in-the-loop one-click model.

**Success criteria:**
1. `/gymos` post-login home renders the noticeboard with 4 section cards (Inbox, Schedule, Members, Revenue) + AI-today header + Tasks section
2. Each section's progress subheading shows a real computed metric from the existing `list-*` actions (not placeholder text)
3. The agent can populate a section body with a recommendation or recent-action note that persists in SQL and survives reload
4. The agent can create/complete Tasks; coach sees them prioritized
5. A propose→approve→execute round-trip works for at least one action (e.g. send-template-to-members), and the approve path is gated by the existing opt-in/24h/template checks at the worker — an out-of-window or no-opt-in send is still rejected
6. `apps/staff-web/AGENTS.md` updated so the agent's documented posture matches the shipped suggest-and-act behavior

**Constraints (carried into planning):** single-tenant (no `studio_id`); gym domain tables don't use `ownableColumns()` so no `accessFilter` on them; staff-web MUST NOT import `@gymos/whatsapp` (sends go through queue→worker chokepoint); local `agent-native dev` can't boot (Nitro/Vite) → verify by replaying SQL against `gymos-demo` Neon via MCP or defer to an e2e smoke (no local HTTP walkthrough).

**Depends on:** P1b.1 (send-template-to-members + opt-in/template gates — both ✓), P1c (lead/conversation surfaces — ✓). Sequence after P2 product surfaces, or pull forward independently since it sits on already-shipped actions.

**UI hint:** yes

**Plans:** 4/7 plans executed

Plans:
- [x] P3-ai-noticeboard-01-dashboard-storage-PLAN.md (wave 1) — additive migration 0005 (dashboard_notes/tasks/proposals) applied to gymos-demo Neon + Drizzle schema exports [SC-3, SC-4, SC-5]
- [x] P3-ai-noticeboard-02-authoring-actions-PLAN.md (wave 2) — list-inbox-summary + upsert-section-note + create-task + complete-task actions [SC-2, SC-3, SC-4]
- [x] P3-ai-noticeboard-03-propose-approve-handshake-PLAN.md (wave 2) — propose-action + approve-proposal (allowlist + re-validate, gates intact) + reject-proposal [SC-5]
- [x] P3-ai-noticeboard-04-route-restructure-PLAN.md (wave 3) — move inbox to /gymos/inbox; noticeboard route loader scaffold; GymosTopNav Home+Inbox tabs [SC-1]
- [ ] P3-ai-noticeboard-05-noticeboard-components-PLAN.md (wave 4) — AiTodayStrip + BoardCard (4 sections, computed metrics) + TasksSection wired to the route [SC-1, SC-2, SC-3, SC-4, SC-5]
- [ ] P3-ai-noticeboard-06-agent-posture-PLAN.md (wave 3) — system prompt + AGENTS.md suggest-and-act rewrite + navigate vocabulary [SC-6]
- [ ] P3-ai-noticeboard-07-e2e-smoke-PLAN.md (wave 5) — live Vercel + Neon e2e: board render, agent authoring, propose->approve->execute with worker gate proof [SC-1..SC-6]

## Progress

**Execution Order:**
Demo Sprint runs first (D0 → D1 → D2 over 7 days). Production v1 runs after (P0 → P1a → P1b → P2 over 8 weeks).

| Milestone / Phase | Requirements | Status | Completed |
|---|---|---|---|
| **Demo Sprint** | | | |
| D0. Fork + Schema + Deploys | 5 | ✓ Complete | 2026-05-17 |
| D1. Staff Surfaces Adapted | 12 | ✓ Complete | 2026-05-19 |
| D2. Member PWA + Calorie + Agent | 3/6 | ◐ In Progress (Task 4 + EAS build outstanding) | partial |
| **Production v1** | | | |
| P0. Audit & De-Risk | 6 | Not started | - |
| P1a. Data Foundation, Auth & Deploy | 19 | Not started | - |
| P1b. Webhook + Worker Spine | 18 | ◐ 8/9 plans (P1b-09 WA-08 template sync still open — rolls into Next-up WhatsApp work) | 8/9 by 2026-05-23 |
| **P1b.1. Customer Pilot Enablement** | 8 | ✓ **Live-accepted** | **2026-05-26** (8/8 plans + live-fix wave) |
| **P1c. Public Site Integrations** | 10 | ✓ **Complete** (7/7 plans; lead funnel verified live on deploy; Stripe Checkout deferred to studio Stripe setup) | **2026-06-01** |
| P2. Staff + Member Product Surfaces | 50+ | Not started | - |
| P3. AI Noticeboard Home | 4/7 | In Progress|  |

**Active workstreams (next up):**
- **WhatsApp deep wire** — migrate worker + edge-webhooks credentials from `process.env` to `app_secrets`; wire WA-08 template sync (P1b-09); live test against verified WABA
- **Mobile app** — finish D2-06 Task 4 + cut EAS build for customer's Apple Developer Account
- **Studio Stripe setup** — restricted key + Products tagged with pack keywords (`10-pack`/`5-pack`/`drop-in`); unblocks D1-03 payments AND the P1c Checkout-link → pass loop (customer task)
- ✓ **Public site integrations (P1c — SHIPPED 2026-06-01)** — forked agent-native's forms template + `/embed/schedule` widget + `/embed.js` snippet live on `gym-class-os.vercel.app`; lead funnel (form → `/gymos` lead) verified end-to-end. GHL lead-capture replaced; booking-payment loop pending studio Stripe setup.

**Coverage:** 130 v1 requirements mapped across two milestones (31 demo + 99 production).

---

## Backlog

Unsequenced parking lot (999.x). Promote with `/gsd:review-backlog` when ready.

### Phase 999.1: `@gymos/shared-types` contract package for the mobile↔backend API/schema seam (BACKLOG)

**Goal:** Formalize the mobile↔backend contract as a real package boundary. Today `packages/mobile-app` consumes the `/api/m/*` routes (8 routes in `apps/staff-web/app/routes/api.m.*.tsx`) and the `apps/staff-web` Drizzle schema/types via workspace/relative imports + convention. Extract the shared request/response types (and relevant Drizzle-derived types) into a versioned package both `apps/staff-web` and `packages/mobile-app` depend on — or generate a typed client from the route contracts.

**Why:** (a) catches backend↔mobile contract drift at compile time *now*, and (b) is the prerequisite that turns SEED-001 (extracting the mobile app into its own repo) into a mechanical move-and-rewire instead of a rearchitecture.

**Requirements:** TBD
**Plans:** 0 plans
**Scope:** Medium (a focused phase). Not urgent — do before any mobile repo split; candidate for P0-audit or P2. Related: `SEED-001-extract-mobile-app-own-repo`.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.2: Dedicated GymClassOS Meta Business portfolio + business verification (BACKLOG)

**Goal:** Stand up a dedicated "GymClassOS" Meta Business portfolio and complete its business verification, separate from the current "Myütik" business that owns the WhatsApp app (app ID `1638609197193795`).

**Why:** Vertical-SaaS-factory model wants one clean, verified business portfolio per product (separate apps, system users, billing, audit). Business verification is a prerequisite for WhatsApp **Embedded Signup** and is done once per business. Verification takes **days** of Meta review, so creating the portfolio + starting verification is the one piece worth doing early/in parallel — it is non-destructive and does not touch the live app or the demo path.

**Context:** Surfaced 2026-06-02 while connecting the first customer (Hustle). Hustle's WhatsApp number lives in a different Meta business than the app, forcing a cross-business WABA partner-share gated behind Hustle's billing manager. Pairs with 999.3.

**Requirements:** TBD
**Plans:** 0 plans
**Scope:** Small/ops (mostly Meta dashboard + verification docs). Do NOT migrate the app here — that's 999.3, after the demo.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.3: Transfer app to GymClassOS business + WhatsApp Embedded Signup for self-onboarding (BACKLOG)

**Goal:** After the first-customer demo is working: (a) transfer the GymClassOS app from the Myütik business into the new GymClassOS business (App Dashboard → Settings → Advanced → change business — a **transfer, not recreate**, which generally preserves the app ID + app secret so Fly secrets keep working; verify before relying on it), then re-test the WhatsApp webhook + Fly secrets; (b) build WhatsApp **Embedded Signup** (Tech Provider flow) so studio #2+ can self-onboard their own WABA via a Meta login flow.

**Why:** Replaces the manual cross-business partner-share + billing-admin dance hit with Hustle. Embedded Signup is the correct, scalable onboarding path for additional studios and is the payoff for the verified business portfolio in 999.2.

**Context:** Surfaced 2026-06-02. Depends on 999.2 (verified GymClassOS business) being done first; sequence after Milestone 1 demo is live.

**Requirements:** TBD
**Plans:** 0 plans
**Scope:** Medium (app transfer is ops + re-test; Embedded Signup is a real feature — Tech Provider config, signup UI, token capture, per-studio secret wiring).

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---

*Roadmap created: 2026-05-17*
*Revised: 2026-05-17 — major restructure (Demo Sprint + Production v1 two-milestone shape; mobile = PWA; Stripe direct; calorie counter in v1)*
*Revised: 2026-05-19 — D2 plan list registered (6 plans), success criteria realigned to native Expo flow (was inherited PWA wording), MEMBR-06 dropped from D2 (PWA manifest is N/A for native Expo Go; rolled into P1a EAS work)*
*Revised: 2026-06-01 — P1c Public Site Integrations planned (7 plans) + executed + verified live on deploy → marked Complete. Migrations 0003+0004 applied to gymos-demo Neon. FORMS-01..04 + EMBED-01..06 added (140 reqs total). Checkout-link + visual-browser checks deferred (studio Stripe setup / dev-server NitroViteError).*
*Out of v1 scope: Native mobile (v1.x), HealthKit, Coach View with health context, CRM campaigns + segments, Knowledge Base, Operational Reporting, bsport-migration productisation, A2A. See REQUIREMENTS.md §Post-v1 Backlog and PLATFORM-VISION.md.*

