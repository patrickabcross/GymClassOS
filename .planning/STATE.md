---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Merged redesign/ui-refresh (v1.1 UI Redesign — R1–R5 complete) into master
last_updated: "2026-06-14T00:00:00.000Z"
last_activity: 2026-06-14
progress:
  total_phases: 14
  completed_phases: 2
  total_plans: 15
  completed_plans: 17
  percent: 50
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-12 — Milestone v1.1 UI Redesign started)
Roadmap: `.planning/ROADMAP.md` (v1.1 phases R1–R5 at top; v1.0 preserved below under separate milestone header)
Requirements: `.planning/REQUIREMENTS.md` (30 v1.1 reqs across 6 categories — AUDT, DSGN, NAME, SWEB, WDGT, MOBL)

**Core value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android Expo app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent.

**Just merged:** v1.1 UI Redesign (`redesign/ui-refresh`) — phases R1–R5 all complete (audit baseline, design-system token layer, naming & IA pass, staff-web visual refresh + embed widgets, member mobile app redesign). Now folded into `master`.

**Current focus:** Resume v1.0 production work (P1c.1 Stripe Connect complete; P2/P3 surfaces remain)

1. **WhatsApp integration deep wire** — migrate `services/worker/` and `services/edge-webhooks/` to read Meta credentials from `app_secrets` (not `process.env`) so the in-app Settings UI is the single source of truth; wire the WA-08 template sync cron so real approved Meta templates replace the seeded stubs; full end-to-end test of outbound send + inbound delivery/read callbacks against the verified WABA.
2. **Mobile app (member surface)** — resume D2 work (Task 4 of in-app agent was pending; D2-06 verification deferred); harden the Expo fork against the iteration that landed during the staff-web pilot fixes; cut an EAS preview build under the customer's existing Apple Developer Account.
3. **P1c — Public Site Integrations (drafted)** — fork agent-native's `templates/forms/` for embeddable lead-capture / signup forms, plus ship a public `/embed/schedule` booking widget so visitors on `doyouhustle.co.uk` can book classes + buy Stripe Checkout passes without signing into GymOS. The real commercial unlock vs Mindbody/Bsport. Phase drafted in ROADMAP.md; run `/gsd:plan-phase P1c` when ready to schedule against the timeline.

## Current Position

Milestone: v1.0 Production (P1c.1 complete) + v1.1 UI Redesign merged in (R1–R5 complete)
Phase: P1c.1 complete; v1.1 R1–R5 complete
Plan: Not started (next v1.0 phase unscheduled)
Status: v1.1 redesign merged into master 2026-06-14; P1c.1 e2e smoke test PASSED (2026-06-13)
Last activity: 2026-06-13

> **Branch note:** All v1.0 Demo Sprint position/detail in the Accumulated Context section below reflects `master` state at branch time (2026-06-12) and is kept for reference. Do not execute v1.0 work from this branch.

**Progress bar:** [░░░░░░░░░░] 0% (0/5 phases)

### v1.1 Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| R1. Audit Baseline | Document before-state; produce naming inventory | AUDT-01, AUDT-02 | Complete |
| R2. Design System Token Layer | CSS token system + skin injector + Inter self-hosted | DSGN-01..05 | Not started |
| R3. Naming & IA Pass | Gym-domain labels → code identifiers → route renames | NAME-01..07 | Not started |
| R4. Staff Web + Embed Widgets | Visual redesign across staff surfaces + embeds | SWEB-01..08, WDGT-01..03 | Not started |
| R5. Member Mobile App | Dark-first themed Expo app with token file | MOBL-01..07 | Not started |

**Next action:** `/gsd:execute-phase R2` (Design System Token Layer)

## Performance Metrics

**v1.1 milestone start:** 2026-06-12
**v1.0 reference velocity (from master):**

- P1b.1 (8 plans): live-accepted 2026-05-26
- P1c (7 plans): complete 2026-06-01
- P3 (6/7 plans): in progress on master

## Accumulated Context

### v1.1 Roadmap Decisions

- **2026-06-12 — Phase prefix R (not integer) to avoid .planning/phases/ collisions at merge time.** v1.0 uses D0–D2, P0, P1a, P1b, P1b.1, P1c, P2, P3. This branch uses R1, R2, R3, R4, R5.
- **2026-06-12 — 5 phases despite coarse granularity setting.** The pitfall-enforced ordering (audit first, tokens before labels, labels before identifiers/routes) creates 4 hard dependency boundaries. SWEB+WDGT merged into R4 (both consume tokens; WDGT-03 is a verification criterion, not a separate surface). Mobile is R5 (independent from web, can in theory parallel R3/R4, but solo dev context means sequential). 5 phases is the minimum coherent structure for this work.
- **2026-06-12 — Hustle brand hex is an open dependency.** hustle.css cannot be finalised until Hustle confirms their hex values. Placeholder values with TODO comments ship in R2; final values applied when received.
- **2026-06-12 — No local dev server constraint carried into all phases.** All verification is via Vercel/Fly deploy (staff web + widgets) and Expo Go / EAS (mobile). No phase plan should include a local HTTP walkthrough step.
- **2026-06-12 — NAME-05 (no DB enum renames) is a standing constraint throughout R3.** drizzle-kit#1409 + live Hustle DB table-lock risk. Display labels only.
- **2026-06-12 (R1-03) — Mobile real-device Expo Go impossible.** App Store Expo Go runs SDK 56; the app is SDK 55; no EAS dev client exists. User approved react-native-web + headless Chromium fallback with /api/m/* fixture interception. Re-shootable at R5 once EAS dev client built. Same filenames, same INDEX.md manifest structure.
- **2026-06-12 (R1-03) — /api/m/* is production-gated to 401.** The Vercel deploy returns 401 on all member API routes (NODE_ENV check). This affects real phones too, not just headless capture. Flagged for the master-branch mobile/EAS workstream to resolve before any real-device testing.
- **2026-06-12 (R1-03) — Google OAuth requires CDP attach to real browser.** Automated Chromium is blocked by Google's bot-detection during OAuth. Auth detection must check for the better-auth.session_token cookie, not the URL (because /gymos returns 200 unauthenticated).
- **2026-06-12 — Fork boundary holds throughout R1–R5.** templates/* and packages-vendored/* never edited. All changes land in apps/staff-web/ or packages/mobile-app/.
- Phase P1c.1 inserted after Phase P1c (2026-06-12): Stripe Connect (Custom accounts) + customer purchase flows (URGENT) — **reverses the 2026-05-17 direct-restricted-key decision** per user. Locked: Custom connected accounts (white-label) onboarded via Stripe-hosted Account Links; direct charges, NO application fee for now; packs + drop-ins AND subscriptions (+ Customer Portal); purchase surfaces = staff-sent checkout links + public embed buy flow + member mobile purchase screen (prereq: fix /api/m/* 404 on Vercel). Closes Demo Sprint audit gaps PAY-01/STR-02.
- Phase P1b.1 inserted after Phase P1b: Customer Pilot Enablement — strip email chrome from /gymos, rename Compose→Templates with real Meta Cloud API send, add Analytics tab, provision staff logins for signed customer, ground AgentSidebar in gym data instead of email actions (URGENT — customer waiting post-2026-05-25 demo)
- Phase P3 added (2026-06-03) to Milestone 2 (Production v1), after P2: **AI Noticeboard Home** — replace `/gymos` landing with a Polsia-style noticeboard dashboard (Inbox/Schedule/Members/Revenue cards + AI-today header + AI-curated Tasks). Agent shifts from read-only to **suggest + one-click act** (coach approves; existing send/checkout actions execute; worker compliance gates stay in force). Computed progress subheadings from existing `list-*` actions; agent authors section notes + tasks persisted in SQL. Four-area scope (UI/SQL/actions/AGENTS.md). Not planned yet → `/gsd:plan-phase P3`.

### v1.0 Accumulated Context (from master — preserved for reference)

**P1c-WIDE VERIFICATION CONSTRAINT:** The local `agent-native dev` server cannot boot (`NitroViteError: Vite environment "nitro" is unavailable` → 503 on server routes) — same class of issue as the Vercel/Netlify Nitro-bundling crash; staff-web only runs reliably on Fly. So NO plan can run a local HTTP walkthrough. Verify the SUBSTANCE by replaying the handler/action SQL against the live `gymos-demo` Neon DB via Neon MCP (and clean up test rows), OR defer runtime checks to an e2e smoke test. This constraint applies equally to v1.1 work on this branch.

- **2026-05-17 (mid-session) — Two-milestone restructure:** Demo Sprint (week 1) + Production v1 (weeks 2-9). Demo deliberately cuts corners (skipped atomic transactions, hardcoded data on non-golden paths, single-studio config). Production rebuilds every corner-cut.
- **2026-05-17 (mid-session) — Stripe direct restricted-API-key (NOT Connect):** Studio owns merchant relationship. No application_fee / no deauth handler.
- **2026-05-17 (mid-session) — pg-boss on Neon (NOT BullMQ + Redis):** Queue lives in same Neon DB; no Redis service.
- **2026-05-17 (mid-session) — Calorie counter built fresh (NOT fork OpenNutriTracker):** OpenNutriTracker is Flutter + GPL v3 — incompatible.
- **2026-05-17 (late) — Member surface = Expo fork of `packages/mobile-app`** (NOT web PWA as decided earlier same day). Discovered upstream has a full Expo 55 + Expo Router + RN 0.83.9 mobile app — that's the fork target. Reverses the mid-session PWA-only decision.
- **2026-05-17 (executing D0) — Demo-time fork-boundary loosened:** For demo speed, we edit inside `templates/mail/` directly instead of copy-out to `apps/staff-web/features/`. Post-demo refactor (P0 audit task) will move to the proper fork-boundary layout.
- [Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2-4]: D1-04: Top-nav lives inline in gymos.tsx for now (sibling routes being built in parallel by other agents); lift to shared layout post-wave. Send-ack via redirect ?sent=1 (server-driven, survives full SSR nav). INBX-07 fork-boundary relocation deferred to P0 audit.
- [Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2-4]: Pass-balance everywhere = grant SUM minus debit SUM; do them as two separate aggregations, never as a chained leftJoin through pass_debits (fan-out double-counts granted)
- [Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2-4]: Cross-surface deep-links between GymClassOS staff routes use search params (?conversation=<id>), reusing existing inbox loader logic — no router config changes needed
- [Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2-4]: D1-01: Dialog open/close state driven by URL search param `?book=<occurrenceId>` instead of React useState — loader re-runs on param change so booking counts refresh automatically with no client cache to invalidate
- [Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2-4]: D1-01: Booking action is naive INSERT only — atomic capacity check + entitlement resolution + pass debit explicitly deferred to BKG-03/BKG-04 (production v1, single-txn with SELECT FOR UPDATE on occurrence row)
- [Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2-4]: D1-01: Schedule day-bucketing uses UTC date for the demo — production must switch to studio IANA TZ (SCH-07) so classes near midnight don't render on the wrong column across a DST boundary
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-01: Bottom-sheet impl locked to @gorhom/bottom-sheet 5.2.14 (not RN Modal fallback). Pitfall #4 mitigation (react-native-worklets/plugin) wired in babel.config.js. Single import target packages/mobile-app/lib/bottom-sheet-impl.ts — D2-06 consumes AgentSheetContainer from there with no interpretation needed. One-file swap to RN Modal available if Expo Go runtime fails.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-01: Hardcoded D-10 macro targets (2100/130/250/60) live in the /api/m/profile response under today.target* keys, not in mobile-app code. D2-04 Home tab reads them as plain data; P2/CAL-06 will swap source (Mifflin-St Jeor against profile) without changing the consumer.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-01: DELETE upstream multi-app components (AppCard, AppForm, AppWebView) instead of preserving as reusable primitives — they all transitively imported @agent-native/shared-app-config which is no longer needed; D-02 mandates no backwards-compat stubs. None were imported by any GymClassOS code.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-01: auth.ts publicPaths extended once for ALL D2 mobile + WA routes (/api/m, /pick-member, /webhooks/whatsapp). D2-02 won't need to touch the same file — avoids parallel-edit merge conflict.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-02: WhatsApp webhook hosted in templates/mail/ + ngrok tunnel (NOT apps/edge-webhooks/ on Fly) — production target deferred to P1b/WEB-01. Single RR v7 resource route at /webhooks/whatsapp.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-02: Raw-body-first HMAC discipline: await request.text() BEFORE any JSON.parse (Pitfall #9). Idempotency via webhook_events keyed on whatsapp:<wamid>. Conversation upsert by gym_members.phoneE164.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-02: Outbound send is env-gated (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID present → real Meta v23 POST; absent → existing stub send with console.warn). 24h-window enforcement NOT in code (deferred P1b WA-05/06).
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-03: Member schedule view density = day-grouped vertical FlatList (mobile thumb-friendly); booking flow = inline expand under card with Confirm button (CONTEXT.md Claude's Discretion default)
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-03: Optimistic booking via TanStack onMutate setQueryData + onError rollback + onSuccess invalidate['profile']; CLAUDE.md mandate honoured (no spinner-after-click). Pattern reusable for D2-04/D2-05 mobile mutations.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-03: Demo-grade idempotency at API layer (SELECT then INSERT for (occurrence, member, 'booked'))—no DB UNIQUE constraint added (out of scope); naive INSERT confirms BKG-03/BKG-04 atomic capacity check + pass debit explicitly deferred to P1b/P2.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-04: Pure-RN KcalRing (no react-native-svg dep) — half-disc clipping + transform rotate per half; 1deg resolution acceptable for demo. Reanimated/SVG arc swap available in P2 if smoother animation needed.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-04: useFocusEffect(refetch) pattern for cross-tab data freshness — Expo Router primitive; necessary complement to qc.invalidateQueries since the Home tab isn't always mounted. Pattern reusable for any tab consuming server data mutated elsewhere.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-04: Macro line spacing preserved via explicit {"  "} JSX double-space literals — JSX collapses whitespace between expressions; prettier respects the explicit string literal. Documented as a reusable pattern for any future multi-space-formatted display.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-05: Server-side OFF proxy with ODbL UA `GymClassOS-Demo/0.1 (https://gymos.local; demo@gymos.local)` — three benefits: UA is server-controlled, future cache table (CAL-09) drops in without mobile change, single requireDemoMember gate. Pattern reusable for any future external nutrition data source (USDA CAL-05).
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-05: 5-state lookup machine for barcode flow (scanning/loading/found/notfound/error) — CAL-02 critical-path requires the "OFF doesn't have this product" branch with a "Scan again" button. Pure-RN scanner overlay (no SVG) consistent with D2-04 KcalRing policy.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-05: hasNutritionData flag at API boundary — when OFF has a product but no kcal data (~5-10% of UK products), UI shows amber warning instead of silently logging 0 kcal. Pitfall #7 mitigation visible in API contract, not buried in UI.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-05: Dual cache invalidation contract for any food-logging surface — every mutation MUST fire `qc.invalidateQueries({queryKey:['food-entries']})` AND `qc.invalidateQueries({queryKey:['profile']})` so Food tab and Home tab both refresh on next focus. Agent tool log_food_nl (D2-06) must honour this same pattern.
- [Phase D2-member-mobile-app-calorie-counter-agent-days-4-7]: D2-05: Barcode flow logs at hardcoded 100g default; search flow lets user pick quantity. Asymmetry justified: scanning a packaged product is a wow-moment demo flow where 100g default keeps friction low. CAL-04 adds quantity adjustment to barcode flow in P2.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-01: All GymClassOS staff code moved from templates/mail/ to apps/staff-web/ (236 files, 53,672 LOC); templates/mail/ restored upstream-clean; pnpm-workspace.yaml extended with apps/* glob; Drizzle baseline regenerated for Postgres dialect. Plan 02 onwards extend apps/staff-web/server/db/schema.ts (never templates/mail/).
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-01: Deviation from D-05 cutover order — templates/mail/webhooks.whatsapp.tsx deleted in Task 2 (not deferred to Plan 09) because its imports referenced removed GymClassOS schema. Cutover semantics preserved because identical file lives at apps/staff-web/app/routes/webhooks.whatsapp.tsx; Plan 09's "delete the demo webhook" now refers to the apps/staff-web copy.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-01: Added "/" (exact-match) to apps/staff-web/server/plugins/auth.ts publicPaths so the root _index.tsx redirect to /gymos bypasses upstream Mail's Google sign-in interstitial. matchesPathList() treats "/" as exact-only — no prefix-match risk. Plan 08 (Stripe key rotation UI at /gymos/settings/integrations) will extend this list further.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-02: P1b additive migration shipped to gymos-demo Neon — 6 new tables (whatsapp_opt_in, whatsapp_templates, stripe_customers, stripe_subscriptions, payments, secrets) + pgcrypto extension + composite UNIQUE(provider, external_id) on webhook_events + partial UNIQUE on messages.external_id WHERE NOT NULL + whatsapp_window_state VIEW. All 9 verification queries pass.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-02: drizzle-kit migrate hung due to D0.4 MCP-applied baseline; applied 0001 directly via @neondatabase/serverless (statement-by-statement split on --> statement-breakpoint), then seeded drizzle.__drizzle_migrations with SHA-256 hashes of both 0000 + 0001 so future migrate calls are no-ops. Pattern reusable for any future Neon migration where the tracking table is out-of-sync.
- [Phase P1b]: P1b-03: Used named import { PgBoss } from pg-boss (v12 dropped default export); used Client from @great-detail/whatsapp v9 (not SDK); pg-boss v12 ConstructorOptions no longer accepts retentionDays/archiveCompletedAfterSeconds/deleteAfterDays — moved to per-queue retentionSeconds/deleteAfterSeconds in publish.ts. Pinned versions: pg-boss@12.18.2, @great-detail/whatsapp@9.0.0.
- [Phase P1b]: P1b-03: Guard script guard-no-whatsapp-in-staff-web.mjs uses Node-native recursive readdirSync walk instead of execSync grep — Windows-friendly, no platform-shell coupling. Wired into root pnpm guards chain.
- [Phase P1b]: P1b-03: HIGH #6 contract upgrade — InboundWhatsAppPayload now z.discriminatedUnion('kind', [message, status]) with explicit per-variant fields (statusFor/newStatus/timestamp/errorCode?). Receiver (Plan 04) constructs from structured Meta webhook fields; worker (Plan 05) reads typed fields directly — no synthetic-string concat across the receiver↔worker boundary.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-04: Local pg-core webhook_events mirror in apps/edge-webhooks/src/lib/db.ts (NOT cross-app schema import). Avoids tsconfig rootDir error + dialect-typing-as-sqlite friction from @agent-native/core/db/schema helpers; Plan 09 extracts packages/db/ to eliminate duplication.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-04: Stripe apiVersion pinned to '2026-04-22.dahlia' via 'as Stripe.LatestApiVersion' cast. SDK 19.3.1 literal-types LatestApiVersion as '2025-10-29.clover'; cast keeps runtime pin (PITFALL #3) without delaying P1b on SDK bump. Drop cast when SDK ships dahlia literal.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-04: Worker /healthz stub (apps/worker/src/index.ts) created in Plan 04 NOT deferred to Plan 05. Required so fly.toml worker http_check (MEDIUM #10) passes on first deploy and two-process topology can be verified end-to-end. Plan 05 overwrites src/index.ts with real pg-boss consumer while preserving /healthz contract on port 3002.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-04: Vitest mock factories use vi.hoisted(() => ({...})) for shared mock fns referenced inside vi.mock(). Plain const + vi.fn() fails with TDZ ReferenceError because vi.mock() is hoisted above all imports. Documented Vitest pattern.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-05: pg-boss v12 dropped v11's teamSize/teamConcurrency from WorkOptions — mapped to batchSize: 5 (jobs/poll) + localConcurrency: 5 (in-process workers). D-14 concurrency=5 semantic preserved. Plan 06/07 must use same v12 names.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-05: Local Drizzle pg-core mirror in apps/worker/src/lib/db.ts (NOT cross-app schema import from apps/staff-web) — same pattern Plan 04 used; sidesteps dialect-typing-as-sqlite friction. Plan 09 extracts packages/db/.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-05: registerInboundWhatsAppWorker shipped as stub at Task 1 commit + real impl at Task 2 (instead of plan's 'comment out the import' trick). Keeps every commit independently compilable. Plan 06/07 should follow the same pattern when adding outbound-whatsapp + stripe-event workers.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-06: sendMessage chokepoint (apps/worker/src/domain/sendMessage.ts) is the SINGLE call site of @gymos/whatsapp in the worker. Composes 3 gates in order: opt-in → window → template-approved. Throws typed errors (NoOptInError, WindowExpiredError, TemplateNotApprovedError) BEFORE any Meta API call (verified by tests counting fetch mock calls = 0).
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-06: Status state machine split between sendMessage (post-Meta-call: 4xx terminal sets status='failed', returns externalId=''; 5xx re-throws for pg-boss retry; 2xx sets status='sent'+external_id) and outbound-whatsapp queue handler (pre-Meta-call gate refusals: catches typed errors, writes status='failed' with the typed .code, returns normally to mark job complete).
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-06: Drizzle mock pattern in vitest — Drizzle's query builder is a thenable, so awaiting calls .then(resolve) directly with the rows array. Mock the terminal chain method (.limit(1) or .where()) with mockResolvedValueOnce(rows) instead of mocking .then. Pattern reusable for Plan 07 (stripe-event) + any future worker test.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-06: For staff-web (Plan 08) — failed-bubble copy can map directly off messages.error_code values. Stable typed codes: NO_OPT_IN, WINDOW_EXPIRED, TEMPLATE_NOT_APPROVED. Pre-flight UX hints (read whatsapp_opt_in + conversations.last_inbound_at) MAY disable Send / nudge to template, but MUST NOT bypass the worker chokepoint — D-19 defence in depth: UI cache can be stale.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-07: stripe-event pg-boss queue handler runs reducer + webhook_events.processed_at UPDATE in single Drizzle transaction (WEB-06). 6 reducers (checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.{updated,deleted}, charge.refunded) — every reducer EXCEPT subscription-deleted refetches via stripe.X.retrieve (PITFALL #4); subscription-deleted is documented exception (resource gone, refetch 404s). Deterministic-key idempotency: pay_<piId>, pass_<piId>_<liId>, pdebit_refund_<chgId>_<passId> + ON CONFLICT DO NOTHING/UPDATE. Concurrency=3 via pg-boss v12 names (batchSize:3 + localConcurrency:3). pgcrypto-backed writeSecret/readSecret enables Plan 08 rotation without worker restart. Stripe SDK 19.3.1 Invoice retrieve cast to any for legacy subscription/payment_intent top-level fields (dahlia API returns them at top level via expand; SDK types lag). 49/49 worker tests green.
- [Phase P1b-webhook-worker-spine-stripe-whatsapp-2-weeks]: P1b-08: Inbox Send refactored from direct Meta fetch to enqueueOutboundWhatsApp + status='queued' optimistic insert (D-18). Loader fans-out whatsapp_window_state VIEW + whatsapp_opt_in table; UI badges use Tabler IconPointFilled (LOW #12, not the ● U+25CF char). /gymos/settings/integrations validates Stripe restricted key via accounts.retrieve() then UPSERTs pgp_sym_encrypt(plain, PGCRYPTO_MASTER_KEY) — worker's getStripeSecretKey reads fresh each Stripe-event job so rotation is zero-restart. Two auto-fixes: added stripe ^19.0.0 dep (Rule 3 blocking) + added Settings link in GymosTopNav (Rule 2 missing critical UX — feature undiscoverable without it). Plan referenced gymos.tsx but actual inbox lives in gymos._index.tsx; edits applied there. (db as any).execute(sql`…`) cast pattern for raw SQL against Neon Postgres mirrors Plans 04/05.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-01: Reverted outer-wrapper AgentSidebar (non-gymos paths) from gym-themed strings back to Mail original — required for plan's exactly-once acceptance criteria; gym empty-state + 3 chip prompts now scoped to /gymos/* only (was leaking onto /inbox /sent /settings via prior rebrand commit abe558fa).
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-01: AppLayout per-surface-family branching — third early-return alongside BARE_ROUTES.has() and isStandardLayoutPath(); AppLayoutInner email hooks (useEmails/useSettings/useLabels/useGoogleAuthStatus) mechanically inert on /gymos/* since React only runs hooks of mounted components (Pitfall 1 from RESEARCH.md confirmed by code).
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-02: Composable Nitro plugin pattern (await createAuthPlugin then getH3App(nitroApp).use(handler)) appends an allowlist hook AFTER framework auth session is set; CUSTOMER_ALLOWED_EMAILS env (empty = dev fallback). Plan referenced /_better_auth/* paths that don't exist — actual framework paths are /_agent-native/auth/* + /_agent-native/google/* (verified by reading core/dist/server/auth.js). Sign-out lives on the denial page CTA (POST /_agent-native/auth/logout), NOT in the middleware, to avoid the OAuth-loop trap (Pitfall 4).
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-03: Three primitive read actions (list-fill-rate, list-classes, list-members) shipped as defineAction GET endpoints. Used ../server/db/index.js import path (ESM .js convention matches sibling actions); guard:allow-unscoped marker on each query (gym tables exempt per research §6). Schema deviation auto-fixed: gym_members uses firstName+lastName (not single name); list-members returns composed name plus raw firstName/lastName for agent ergonomics.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-04: whatsapp_templates.category seeded as lowercase ('utility') to match Drizzle enum constraint; passes table has no status column so renewals/at-risk filter on expires_at IS NOT NULL AND >= now; standalone tsx seed scripts load .env.local then .env via dotenv before dynamic-importing @agent-native/core/db (avoids module-eval ordering issues with DATABASE_URL). Idempotent via onConflictDoNothing on text PK.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-07: Mail action files (archive-email, list-emails, etc.) intentionally NOT deleted from apps/staff-web/actions/ — they auto-register but the gym systemPrompt doesn't name them so the LLM has no signal to call them. systemPrompt-as-tool-gate pattern (cheap to reverse, dogfooding-friendly). Deletion belongs to P0 audit.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-07: mentionProviders set to empty object {} rather than removed — framework accepts empty object; reserves slot for P2 gym mention providers (@member, @class, @conversation) without touching plugin signature.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-07: templates/mail/AGENTS.md preserved upstream-clean (578 lines) for future BuilderIO/agent-native fork merges — fork-boundary discipline. apps/staff-web/AGENTS.md fully replaced with 85-line gym guide; apps/staff-web/CLAUDE.md still @-includes it so Claude Code dev sessions read gym instructions on every session.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-06: /gymos/analytics loader uses Promise.all over 5 aggregation closures. fillRate split into two parallel queries (capacity-from-occurrences + booked-from-inner-join) to avoid leftJoin fan-out multi-counting capacity — pattern mirrors gymos.members.tsx granted/debit split.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-06: 'Active pass' definition in staff-web = expires_at IS NULL OR expires_at >= now() (passes table has no status column). Same definition shared with list-at-risk-members + members.$id balance calc. AGENTS.md table that lists passes.status (added by Plan 07 sibling) is incorrect and needs a follow-up.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-06: react-router v7 framework mode no longer exports json() — every staff-web loader returns plain objects; ~/* TS alias does not exist in apps/staff-web/tsconfig.json (only @/* + @shared/*). Future PLAN.md templates should not reference json() or ~/components/*.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-05: TemplatesDialog uses @/ path alias (not ~/ as plan said) — apps/staff-web/tsconfig.json only configures @/* paths; same alias every existing staff-web component uses. Plan instructions overridden by project convention per CLAUDE.md.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-05: Pitfall 3 resolved without action-handler guard — sdk-impl Object.values({}) returns [] for hello_world (0 vars), Meta accepts empty components array. No extra code needed.
- [Phase P1b.1-customer-pilot-enablement]: P1b.1-05: fetcher.submit targets action='/gymos' explicitly so the dialog can fire from inside the existing reply <Form> without action-routing collision.
- [Phase P1c-public-site-integrations]: P1c-01: conversations.status had NO pre-existing CHECK constraint (plain text col) — migration 0003 ADDED a new conversations_status_check (open/closed/snoozed/lead); DROP IF EXISTS was a no-op
- [Phase P1c-public-site-integrations]: P1c-01: 0003 lead-funnel migration applied directly to gymos-demo Neon via Neon MCP (not runMigrations); dedup DELETE removed 0 rows (no duplicate emails/phones in seed)
- [Phase P1c-public-site-integrations]: P1c-03: Staff-web Stripe client created fresh in apps/staff-web/server/lib/stripe.ts (not cross-imported from worker); reads pgcrypto-encrypted key from secrets table; pins apiVersion 2026-04-22.dahlia
- [Phase P1c-public-site-integrations]: P1c-03: create-checkout-link NOT in agent system prompt — pilot read-only posture; staff invokes from UI only; AGENTS.md documents when to add it
- [Phase P1c-public-site-integrations]: P1c-02: templates/forms/ forked into apps/staff-web/features/forms/ (fork boundary in FORMS.md; templates/forms/ untouched). Lead upsert uses raw db.execute(sql`... ON CONFLICT ...`) NOT Drizzle onConflictDo* — targets P1c-01 partial unique indexes (email/phone_e164) + conversations(member_id,channel). LOAD-BEARING FK-safety: re-SELECT canonical id after EACH upsert (member by email/phone, conversation by member_id+channel) and bind downstream FKs to resolvedMemberId/resolvedConvId — the fresh nanoid is INSERT-candidate only, discarded when ON CONFLICT hits an existing row (no orphan FK). messageType='text' for the lead note (payload JSON holds form context; no new enum value → no migration). appStatePut + fireIntegrations dropped (the status='lead' conversation IS the notification).
- [Phase P1c-public-site-integrations]: P1c-02: THIS plan owns ALL P1c public-route plumbing — auth.ts (publicPaths += /f, /api/forms/public, /api/submit, /embed; allowlistHandler skip block extended) + 00-public-cors.ts (CORS before auth, OPTIONS→204, PUBLIC_EMBED_PREFIXES). P1c-04/05/06 must NOT edit auth.ts/00-public-cors.ts (parallel-edit conflict avoidance). /f/:slug routed at explicit Nitro path server/routes/f/[...slug].get.ts so it doesn't collide with the staff-web app catch-all. Rate limit 60/15min/IP in-memory Map (effective on Fly single machine; Vercel-KV upgrade caveat in FORMS.md). Public anonymous endpoints do NOT wrap in runWithRequestContext; gym tables carry guard:allow-unscoped (single-tenant).
- [Phase P1c-public-site-integrations]: P1c-04: RR v7 loader/action (Path B) for forms routes — staff-web has no useForms hooks; AgentToggleButton/ShareButton/VisibilityBadge stripped (pilot single-tenant); default inbox excludes leads (ne filter); two filter chips in header; tsconfig features/**/* added
- [Phase P1c-public-site-integrations]: P1c-05: forms.id=schedule-enquiry (stable PK+slug); schedule query: classOccurrences innerJoin classDefinitions status=scheduled+startsAt>=now; zero new runtime deps; occurrenceId rides in data{} JSON through submissions.ts
- [Phase P1c-public-site-integrations]: P1c-06: BASE origin baked into IIFE at request time via buildEmbedScript(baseOrigin) factory; safeBase sanitiser rejects non-http(s) values before interpolation; ev.origin !== BASE is first statement in message handler (RESEARCH Pitfall 6)
- [Phase P1c-public-site-integrations]: P1c-06: Checkpoint Task 2 (human-verify) auto-approved — NitroViteError dev-server constraint; runtime verification deferred to P1c-07 on live Vercel deploy
- [Phase P1c-public-site-integrations]: P1c-07: Part C (Checkout->pass) DEFERRED not FAILED — studio Stripe restricted key not configured; code verified at unit level; re-verify when studio Stripe setup complete
- [Phase P1c-public-site-integrations]: P1c-07: Name-extraction heuristic gap — submissions.ts matches 'name'/'first name' labels only; seeded form uses 'Your name' so first_name saves as 'Lead' not actual name; funnel functional; recommended fix: broaden heuristic or update seed label
- [Phase P3-ai-noticeboard-home]: Three dedicated tables over application_state for dashboard state (typed queries, ORDER BY, WHERE filtering, process-restart durable)
- [Phase P3-ai-noticeboard-home]: dashboard_notes UNIQUE on section enables upsert-by-section-key — ON CONFLICT (section) DO UPDATE replaces note atomically
- [Phase P3-ai-noticeboard-home]: conversations.unreadCount Drizzle export confirmed (unread_count column) — used in FILTER (WHERE unreadCount > 0) aggregate for list-inbox-summary
- [Phase P3-ai-noticeboard-home]: upsert-section-note uses deterministic id=dnote_{section} to ensure ON CONFLICT (section) is unambiguous and never creates ghost rows
- [Phase P3-ai-noticeboard-home]: complete-task updates by taskId only (no ownership check) — single-tenant guard:allow-unscoped pattern
- [Phase P3-ai-noticeboard-home]: approve-proposal uses dynamic import + mod.default.schema.safeParse() before run() — stored JSON re-validated against target action's own Zod schema (Pitfall 2 prevention)
- [Phase P3-ai-noticeboard-home]: ACTION_ALLOWLIST hardcoded in approve-proposal — only send-template-to-members and create-checkout-link may execute via proposal; worker chokepoint gates stay in force (no @gymos/whatsapp in staff-web)
- [Phase P3-ai-noticeboard-home]: Inbox redirect targets updated from /gymos to /gymos/inbox (P3-04 relocation)
- [Phase P3-ai-noticeboard-home]: gymos.compose.tsx re-export updated to gymos.inbox when _index lost its action export (Rule 3 auto-fix in P3-04)
- [Phase P3-ai-noticeboard-home]: System prompt as tool gate: naming tools in the prompt is the actual unlock mechanism — Plans 02/03 added the action files; Plan 06 names them so the LLM will call them
- [Phase P3-ai-noticeboard-home]: Gates-still-hold note appears in both agent-chat.ts and AGENTS.md: worker opt-in/24h-window/approved-template chokepoint still fires on every approve-proposal; one-click approve is not a bypass
- [Phase P3-ai-noticeboard-home]: useSectionMetric calls all 4 metric hooks unconditionally then switches by section param (React rules of hooks)
- [Phase P3-ai-noticeboard-home]: BoardCard receives full proposals array and filters internally by actionName — avoids parent knowing card-to-proposal mapping
- [Phase P3-ai-noticeboard-home]: AlertDialog gate for send-template-to-members proposals; direct approve for create-checkout-link (reversible)
- [Phase quick-260608-g74]: Worker reimplements AES-256-GCM decrypt locally (no @agent-native/core dep); readAppSecretByKey returns null on any failure; app_secrets is now first source in 4 resolvers with existing pgcrypto+env fallbacks intact
- [Phase P1c.1-stripe-connect-custom-customer-purchase-flows]: integer({ mode: 'boolean' }) used for chargesEnabled/payoutsEnabled in connectedAccounts (matches schema.ts convention; dialect-agnostic via core helper)
- [Phase P1c.1-stripe-connect-custom-customer-purchase-flows]: singletonKey for Stripe events unchanged (stripe-event:stripe_eventId only); stripeAccount not included — replayed Connect events must still dedup by eventId
- [Phase P1c.1-stripe-connect-custom-customer-purchase-flows]: getPlatformStripe() resolves stripe_platform_secret_key from pgcrypto secrets → STRIPE_SECRET_KEY env → throw; getStripeClient() kept deprecated for rollback — Platform key needed for Connect operations; restricted-key model deprecated but not deleted per plan rollback-insurance requirement
- [Phase P1c.1-stripe-connect-custom-customer-purchase-flows]: Settings integrations ?stripe=refresh handled at loader level (server redirect to fresh Account Link) not client-side — Cleaner UX with no JS flash; loader handles redirect before page renders
- [Phase P1c.1]: h3 v2 API fix: event.req as unknown as Request replaces toWebRequest(event); as any cast on loader/action args for TypedServerRequest→Request bridge
- [Phase P1c.1]: PILOT_PRODUCTS uses env vars (STRIPE_PRICE_DROP_IN etc.) for v1; P2 replaces with stripe.prices.list() on connected account
- [Phase P1c.1-stripe-connect-custom-customer-purchase-flows]: Reuse stripeRoutes Hono instance for Connect handler — no new export, no server.ts change — Route already mounted via app.route('/webhooks', stripeRoutes); adding handler inline is simpler
- [Phase P1c.1-stripe-connect-custom-customer-purchase-flows]: provider='stripe' for Connect events — Stripe event IDs globally unique, no external_id collision with platform events — The shared (provider, external_id) UNIQUE constraint correctly dedups both event streams
- [Phase P1c.1]: Extracted buildCheckoutParams/validateConnectedAccount to helpers module — defineAction wrapper can't be imported in Vitest (CJS React conflict); pure helpers are testable
- [Phase P1c.1]: Nitro .get.ts + .post.ts split for /embed/buy — matches schedule widget convention and lets Nitro serve raw HTML bypassing RR7
- [Phase P1c.1]: (platform.checkout.sessions.create as any)(params, opts) cast — Stripe SDK TypeScript overloads confuse { stripeAccount } as second arg; runtime is correct
- [Phase P1c.1-07-closeout]: Connect webhook endpoint we_1Thp7oEDUyRYOcLTF1HHiAW6 registered connect=true on platform account; STRIPE_CONNECT_WEBHOOK_SECRET live on Fly gymos-edge-webhooks; platform sk_test_ set as STRIPE_SECRET_KEY on Fly + Vercel; STRIPE_PRICE_DROP_IN + STRIPE_PRICE_MEMBERSHIP set on Vercel
- [Phase P1c.1-07-closeout]: Subscription + charge.refunded + Customer Portal + mobile /api/m/purchase end-to-end are CODE-COMPLETE but not yet live-tested with real transactions — DEFERRED to P2/quick verification, not FAILED
- [Phase P1c.1-07-closeout]: vercel promote required after vercel deploy --prod to pin the production alias — rollback pins aliases and new deploys do not automatically win the alias back
- [Phase P1c.1-07-closeout]: Framework bundle-leak bug (actions/*.test.ts in serverless bundle via generated registry) fixed in @agent-native/core with changeset (commit 15e86a31); integrations loader refetch-on-return added (commit 755ef804) so readiness display is not solely webhook-driven
- **P1c-02 deviation (0004 migration):** P1c-01's migration 0003 created only `form_submissions`; it OMITTED the `forms` + `responses` tables the forked forms handler reads/writes. `apps/staff-web/server/db/migrations/0004_p1c_forms_responses.sql` (strictly additive) closes the gap and is applied to `gymos-demo` Neon. Any plan that adds new forms-feature tables must continue the direct-to-Neon-via-MCP apply pattern (0001-0004), not runMigrations.

**Live deployment state (master):**

- Staff-web: `https://gym-class-os.vercel.app` (Vercel, auto-deploys from `master`)
- Worker + edge-webhooks: Fly app `gymos-edge-webhooks`
- Neon project: `gymos-demo` (id `billowing-sun-51091059`)
- Demo data: 260 members / 423 class occurrences / 4,162 bookings / 200 active subs / 90 conversations / 453 messages

### Decisions (v1.0 — from master history)

Decisions are logged in `PROJECT.md` Key Decisions table. Key ones affecting this branch:

- **2026-05-17 — Two-milestone restructure:** Demo Sprint (week 1) + Production v1 (weeks 2-9). Demo deliberately cuts corners (skipped atomic transactions, hardcoded data on non-golden paths, single-studio config). Production rebuilds every corner-cut.
- **2026-05-17 — Stripe direct restricted-API-key (NOT Connect):** Studio owns merchant relationship. No application_fee / no deauth handler.
- **2026-05-17 — pg-boss on Neon (NOT BullMQ + Redis):** Queue lives in same Neon DB; no Redis service.
- **2026-05-17 — Calorie counter built fresh (NOT fork OpenNutriTracker):** OpenNutriTracker is Flutter + GPL v3 — incompatible.
- **2026-05-17 (late) — Member surface = Expo fork of `packages/mobile-app`** (NOT web PWA). Discovered upstream has a full Expo 55 + Expo Router + RN 0.83.9 mobile app — that's the fork target.
- **2026-05-17 — Demo-time fork-boundary loosened:** For demo speed, we edit inside `templates/mail/` directly instead of copy-out. Post-demo refactor (P0 audit task) will move to proper fork-boundary layout.

### Phase Decisions (v1.0 — condensed)

Key patterns discovered during v1.0 execution that apply to v1.1:

- react-router v7 framework mode no longer exports `json()` — every loader returns plain objects
- `@/` path alias (not `~/`) in apps/staff-web/tsconfig.json — use `@/*` paths in all staff-web files
- `db.execute(sql\`…\`)` cast pattern for raw SQL against Neon Postgres (used in P1b/P1c plans)
- System prompt as tool gate: naming tools in the AGENTS.md system prompt is the actual unlock mechanism
- Tags pattern: `guard:allow-unscoped` on gym table queries (single-tenant, no accessFilter needed)

### Quick Tasks Completed (v1.0 — from master history)

| # | Description | Date | Commit | Status |
|---|-------------|------|--------|--------|
| 260524-r8f | Fix staff-web OAuth: redirect Mail routes to /gymos, remove Mail account hook, narrow Google scopes | 2026-05-24 | 1c60a41e | Done |
| 260531-kbm | Redesign /gymos/analytics dashboard for stronger visual hierarchy with display sizes | 2026-05-31 | 3d082eb7 | Done |
| 260531-n7i | Core missed-session re-engagement campaign: opt-in capture + opt-out gate, send-template-to-members batch action, /gymos/campaigns UI | 2026-05-31 | cc114b8f | Verified |
| 260601-muh | Migrate Meta WhatsApp credentials in services/worker + services/edge-webhooks from process.env to pgcrypto-backed secrets table | 2026-06-01 | a3948c35 | Done |
| 260603-gxh | Build GoHighLevel contacts CSV importer | 2026-06-03 | d255db06 | Done |
| 260604-fj3 | Add MYÜTIK verify-echo branch to edge-webhooks WhatsApp POST handler | 2026-06-04 | 9dabc513 | Done |
| 260604-nwb | Fix pg-boss "Database not opened" 500 on edge-webhooks inbound | 2026-06-04 | 3dfd99d7 | Done |
| 260604-op8 | Fix inbound 42P10 — worker message INSERT onConflictDoNothing partial-index predicate | 2026-06-04 | 6f70e2a1 | Done |
| 260607-pjc | Register MYUTIK_API_KEY in staff-web Settings | 2026-06-07 | pending | Done |
| fast | Fix 404 on React Router action POSTs | 2026-06-07 | 6edc640d | Done |
| 260608-fb8 | Repoint worker templates-sync cron from Meta Graph to MYÜTIK Template Extract API | 2026-06-08 | 6c46964f | Done |
| 260608-g74 | Worker reads credentials from framework app_secrets table | 2026-06-08 | a1d66c11 | Done |
| 260608-gn1 | Add Update templates button to inbox TemplatesDialog | 2026-06-08 | 368f450c | Done |
| 260609-fcm | AI auto-fill of WhatsApp template variables in TemplatesDialog | 2026-06-09 | 0a5b48e1 | Done |
| 260609-qe9 | Route worker outbound WhatsApp sends through MYÜTIK | 2026-06-09 | 5cc4ab82 | Done |
| 260611-dxv | CSV bulk-upload interface for Leads view | 2026-06-11 | cf3b76df | Done |
| 260611-rrh | Fix WhatsApp webhook consumer dropping MYÜTIK outbound mirrors | 2026-06-11 | 00863fc1 | Done |
| Phase R1 P02 | 3 | 2 tasks | 5 files |
| Phase R1 P01 | 185 | 2 tasks | 1 files |
| Phase R1-audit-baseline P03 | 240 | 5 tasks | 15 files |
| Phase R2-design-system-token-layer P01 | 15 | 3 tasks | 6 files |
| Phase R2-design-system-token-layer P02 | 20 | 2 tasks | 2 files |
| Phase R2-design-system-token-layer P04 | 5 | 2 tasks | 6 files |
| Phase R2-design-system-token-layer P03 | 25 | 2 tasks | 9 files |
| Phase R3-naming-ia-pass P01 | 25 | 4 tasks | 9 files |
| Phase R3-naming-ia-pass P02 | 4 | 2 tasks | 8 files |
| Phase R3-naming-ia-pass P03 | 12 | 3 tasks | 13 files |
| Phase R3-naming-ia-pass P04 | 5 | 3 tasks | 4 files |
| Phase R4-staff-web-visual-refresh P01 | 12 | 2 tasks | 1 files |
| Phase R4-staff-web-visual-refresh P02 | 12 | 2 tasks | 1 files |
| Phase R4-staff-web-visual-refresh P03 | 172 | 2 tasks | 1 files |
| Phase R4-staff-web-visual-refresh P05 | 10 | 2 tasks | 1 files |
| Phase R4-staff-web-visual-refresh P07 | 2 | 2 tasks | 2 files |
| Phase R4-staff-web-visual-refresh P04 | 18 | 2 tasks | 2 files |
| Phase R4-staff-web-visual-refresh P06 | 4 | 2 tasks | 1 files |
| Phase R5 P01 | 12 | 3 tasks | 6 files |
| Phase R5-member-mobile-app-redesign P02 | 10 | 3 tasks | 7 files |
| Phase R5-member-mobile-app-redesign P03 | 3 | 2 tasks | 2 files |
| Phase R5 P04 | 5 | 2 tasks | 1 files |

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260524-r8f | Fix staff-web OAuth: redirect Mail routes to /gymos, remove Mail account hook, narrow Google scopes | 2026-05-24 | 1c60a41e | — | [260524-r8f-fix-staff-web-oauth-redirect-mail-routes](./quick/260524-r8f-fix-staff-web-oauth-redirect-mail-routes/) |
| 260531-kbm | Redesign /gymos/analytics dashboard for stronger visual hierarchy with display sizes | 2026-05-31 | 3d082eb7 | — | [260531-kbm-redesign-gymos-analytics-dashboard-for-s](./quick/260531-kbm-redesign-gymos-analytics-dashboard-for-s/) |
| 260531-n7i | Core missed-session re-engagement campaign: opt-in capture + opt-out gate, send-template-to-members batch action, /gymos/campaigns UI | 2026-05-31 | (merge of cc114b8f) | Verified | [260531-n7i-build-core-missed-session-re-engagement-](./quick/260531-n7i-build-core-missed-session-re-engagement-/) |
| 260601-muh | Migrate Meta WhatsApp credentials in services/worker + services/edge-webhooks from process.env to pgcrypto-backed secrets table (DB-first + env fallback; edge-webhooks gets new reader + 60s TTL cache on inbound hot path; live WABA test deferred) | 2026-06-01 | a3948c35 | — | [260601-muh-migrate-meta-whatsapp-credentials-in-ser](./quick/260601-muh-migrate-meta-whatsapp-credentials-in-ser/) |
| 260603-gxh | Build GoHighLevel contacts CSV importer (apps/staff-web/scripts/import-ghl-contacts.ts) — header auto-detect, E.164 phone normalize (UK +44), within-file + DB dedupe, dry-run default + --commit; marketing consent → whatsapp_opt_in (source='import'). User runs real dry-run against GHL export | 2026-06-03 | d255db06 | — | [260603-gxh-build-gohighlevel-contacts-csv-importer-](./quick/260603-gxh-build-gohighlevel-contacts-csv-importer-/) |
| 260604-fj3 | Add MYÜTIK verify-echo branch to edge-webhooks WhatsApp POST handler — authenticated `event:"verify"` → echo `{challenge}` so MYÜTIK (signs Meta-style with whatsapp_app_secret) completes its verify handshake; closes `challenge_not_echoed`. Needs manual `fly deploy` of gymos-edge-webhooks | 2026-06-04 | 9dabc513 | — | [260604-fj3-add-myutik-verify-echo-branch-to-edge-we](./quick/260604-fj3-add-myutik-verify-echo-branch-to-edge-we/) |
| 260604-nwb | Fix pg-boss "Database not opened" 500 on edge-webhooks inbound — `@gymos/queue` boss made publish-only (supervise/schedule/migrate off) + idempotent `startBoss()`; enqueue path awaits it; web entrypoint warm-starts. First real MYÜTIK inbound exposed that the web process never started its boss (worker uses a separate one) | 2026-06-04 | 3dfd99d7 | — | [260604-nwb-fix-pg-boss-database-not-opened-in-edge-](./quick/260604-nwb-fix-pg-boss-database-not-opened-in-edge-/) |
| 260604-op8 | Fix inbound 42P10 — worker message INSERT `onConflictDoNothing` now supplies the partial-index predicate (`where external_id is not null`) so ON CONFLICT matches the partial unique index; also promote conversation `status='open'` on any inbound (lead→inbox, reactivate closed/snoozed). Real member-matched inbound was failing 5× retries (unread inflated, 0 messages stored) | 2026-06-04 | 6f70e2a1 | — | [260604-op8-fix-inbound-message-insert-partial-index](./quick/260604-op8-fix-inbound-message-insert-partial-index/) |
| 260607-pjc | Register `MYUTIK_API_KEY` in staff-web Settings → API Keys (the gear button on the AI input) via one additive `registerRequiredSecret()` — the outbound `whatsapp:send` credential for sending replies/campaigns through the MYÜTIK relay (`POST myutik.com/api/channels/whatsapp/send`, from phoneNumberId 302631896256150). scope `user`, kind `api-key`, required `true`, no validator. UI-only registration; no worker wiring | 2026-06-07 | (pending) | — | [260607-pjc-add-myutik-api-key-input-to-staff-web-se](./quick/260607-pjc-add-myutik-api-key-input-to-staff-web-se/) |
| fast | Fix 404 on React Router action POSTs — add `apps/staff-web/server/routes/[...page].post.ts` mounting the method-agnostic `createH3SSRHandler` on POST. Catch-all was GET-only (`[...page].get.ts`), so RR framework-mode action `.data` POSTs (`POST /gymos/compose.data` from inbox send-text Form + send-template fetcher) 404'd before reaching the SSR handler. Fixes WhatsApp template/text send from /gymos/inbox. Needs Vercel redeploy + manual retest | 2026-06-07 | 6edc640d | — | — |
| 260608-fb8 | Repoint worker `templates-sync` cron from Meta Graph to the MYÜTIK Template Extract API (`GET myutik.com/api/channels/whatsapp/templates`, `x-api-key` + `phoneNumberId=302631896256150`). New `getMyutikApiKey`/`getMyutikPhoneNumberId` resolvers (DB secrets → env), optional `MYUTIK_API_KEY`/`MYUTIK_PHONE_NUMBER_ID` env, pagination via `paging.next`, and **lowercases Meta's UPPERCASE status** so `templateGate` (`status='approved'`) matches. Meta resolvers kept. Verified key live (200 OK). Needs `fly secrets set MYUTIK_API_KEY=…` on worker + redeploy | 2026-06-08 | 6c46964f | — | [260608-fb8-repoint-worker-template-sync-to-myutik-t](./quick/260608-fb8-repoint-worker-template-sync-to-myutik-t/) |
| 260608-g74 | Worker reads credentials from the framework `app_secrets` table (the store the staff-web Settings UI writes to). New `readAppSecretByKey(key, db)` (`services/worker/src/lib/appSecrets.ts`) — local AES-256-GCM decrypt mirroring `packages/core/src/secrets/storage.ts`, key material `SECRETS_ENCRYPTION_KEY ?? BETTER_AUTH_SECRET`, single-tenant resolve-by-key, returns null (never throws) on miss/corrupt. Layered as FIRST source in `getMyutikApiKey`/`getMyutikPhoneNumberId`/`getWhatsAppAccessToken`/`getWhatsAppPhoneNumberId` (precedence: app_secrets → pgcrypto secrets → env). Stripe/WABA-id unchanged. Backwards-compatible. **Activate by setting shared `BETTER_AUTH_SECRET` as a Fly secret on the worker + redeploy** | 2026-06-08 | a1d66c11 | — | [260608-g74-worker-reads-credentials-from-app-secret](./quick/260608-g74-worker-reads-credentials-from-app-secret/) |
| 260608-gn1 | Add "Update templates" button to the inbox Templates dialog — on-demand MYÜTIK template sync (staff-web side, no worker dependency). New `apps/staff-web/server/lib/app-secrets.ts` `readAppSecretByKey(key)` (resolve-by-key AES-256-GCM decrypt). New `_intent="sync-templates"` branch at top of `gymos.inbox.tsx` action: reads `MYUTIK_API_KEY` from app_secrets, paginates MYÜTIK, upserts `whatsapp_templates` with **lowercase status/category + object-wrapped `componentsJson`** (`{components:[...]}` to match the dialog parser + seed). `TemplatesDialog.tsx` gets an IconRefresh outline button (separate `syncFetcher`, "Updating…" state, settle toast); list refreshes via RR loader revalidation. Also fixed the worker `syncTemplates.ts` bare-array `componentsJson` bug to object-wrapped. Works on the live deploy without the worker | 2026-06-08 | 368f450c | — | [260608-gn1-add-update-templates-button-to-inbox-tem](./quick/260608-gn1-add-update-templates-button-to-inbox-tem/) |
| 260609-fcm | AI auto-fill of WhatsApp template `{{N}}` variables in the inbox TemplatesDialog. New pure write-back action `apps/staff-web/actions/suggest-template-vars.ts` (`defineAction`, NO `http`, NO LLM — `writeAppState` to `gymos-template-vars-<conv>-<template>`, `guard:allow-unscoped`). On selecting an approved template with `>=1` var, TemplatesDialog fires `sendToAgentChat` to the **ACTIVE** chat thread (`openSidebar:true`) once per (conv,template) via a `dispatched` ref, polls the state key, and merges suggestions into non-edited slots only (never clobbers coach-typed input); inline `Filling with AI…` indicator (IconMessageChatbot) with a 30s timeout. Loader passes compact `memberContext`; `agent-chat.ts` + `apps/staff-web/AGENTS.md` name the tool with `{{1}}=first name` mapping guidance. Send path untouched — nothing auto-sends. **Follow-ups (same day): the initial `background:true,newTab:true` version created a ghost thread that never ran (404 loop) — switched to the active thread (commit `0a5b48e1`); also fixed double-encode in the action (`52892c07`) + spinner timeout (`ca5cdbce`). WORKS IN PROD (ANTHROPIC_API_KEY confirmed in staff-web Vercel env).** | 2026-06-09 | 0a5b48e1 | — | [260609-fcm-ai-auto-fill-of-whatsapp-template-variab](./quick/260609-fcm-ai-auto-fill-of-whatsapp-template-variab/) |
| 260609-qe9 | Rewire the worker outbound WhatsApp send chokepoint to route ALL sends through MYÜTIK (the GymClassOS Meta app is NOT approved → direct Graph rejected with code 100/subcode 33). New `services/worker/src/domain/sendViaMyutik.ts` POSTs `https://myutik.com/api/channels/whatsapp/send` (`x-api-key` + `phoneNumberId`), extracts `wamid` from `result.messages[0].id`, throws `.status`-carrying errors. `sendMessage.ts` rewired so `sendViaMyutik` is the SOLE send call site (`@gymos/whatsapp` direct-Meta path removed); gates 1-5 + status state machine unchanged; keeps leading `+`; template → single body component with params ordered by placeholder #; status map 4xx→terminal `failed`, 502/no-wamid→retry. Also fixed a pre-existing pino `LOG_LEVEL` crash. 79/79 worker tests + `tsc` green. **DEPLOYED to Fly (`gymos-edge-webhooks` web+worker rolled healthy); `MUTIK_API_KEY` confirmed all-scopes. NEXT (morning): send a fresh template from /gymos/inbox → verify messages row `status='sent'` + `external_id` (wamid) + actually arrives. Old stuck row won't resend (job retries exhausted). See WHATSAPP_HANDOFF.md 2026-06-09 section.** | 2026-06-09 | 5cc4ab82 | — | [260609-qe9-route-worker-outbound-whatsapp-sends-thr](./quick/260609-qe9-route-worker-outbound-whatsapp-sends-thr/) |
| 260611-dxv | CSV bulk-upload interface for Leads view — shared csv-leads.ts library (extracted from CLI importer), import-leads defineAction (dryRun preview + commit with FK-safe re-select), ImportLeadsDialog (shadcn Dialog + column mapping + counts + sample preview), wired into /gymos/inbox?filter=leads with useRevalidator for instant refresh. No schema changes. | 2026-06-11 | cf3b76df, 697b2645 | Done | [260611-dxv-add-csv-bulk-upload-interface-with-colum](./quick/260611-dxv-add-csv-bulk-upload-interface-with-colum/) |
| 260613-ey3 | Build the real GymClassOS payments page: `list-payments` defineAction GET (LEFT JOIN payments→gym_members, order by occurred_at DESC, LIMIT 100, guard:allow-unscoped) + `/gymos/payments` rewired from Coming Soon stub to real shadcn Table (Date/Member/Amount/Status) with colour-coded badges, `Intl.NumberFormat` £ formatting, and clean empty state "No payments yet — they'll appear here as members pay". Closes PAY-VIEW audit gap. | 2026-06-13 | 086adf1d, 267baf98 | Done | [260613-ey3-build-the-real-gymos-payments-page-list-](./quick/260613-ey3-build-the-real-gymos-payments-page-list-/) |
| 260611-rrh | Fix WhatsApp webhook consumer dropping MYÜTIK outbound mirrors. Receiver (edge-webhooks) now detects `messages[0].from === metadata.phone_number_id` → direction='out' and carries `contacts[0].wa_id` as customerWaId; queue payload extended backward-compatibly (direction defaults 'in'); worker `materialiseOutboundMirror` matches member by customerWaId, inserts direction='out' (status 'sent', wamid dedup via existing partial unique index so self-sends collapse), sets last_outbound_at + preview, no unread bump / no opt-in capture / no status promote. Backfill script `services/worker/scripts/backfill-outbound-mirrors.ts` (dry-run default, --commit) recovers June 5+10 stranded replies from webhook_events and recounts unread as inbound-after-last-outbound. 127 tests green. | 2026-06-11 | 00863fc1, b61086c1, 05179009 | Done | [260611-rrh-fix-whatsapp-webhook-consumer-dropping-o](./quick/260611-rrh-fix-whatsapp-webhook-consumer-dropping-o/) |
| Phase P1b.1-customer-pilot-enablement P01 | 7min | 2 tasks | 2 files |
| Phase P1b.1-customer-pilot-enablement P02 | 25min | 2 tasks | 3 files |
| Phase P1b.1-customer-pilot-enablement P03 | 15min | 3 tasks | 3 files |
| Phase P1b.1-customer-pilot-enablement P04 | 35min | 3 tasks | 4 files |
| Phase P1b.1-customer-pilot-enablement P07 | 12min | 2 tasks | 2 files |
| Phase P1b.1-customer-pilot-enablement P06 | 5min | 1 tasks | 1 files |
| Phase P1b.1-customer-pilot-enablement PP05 | 6min | 2 tasks | 2 files |
| Phase P1c-public-site-integrations P01 | 25min | 3 tasks | 2 files |
| Phase P1c-public-site-integrations P03 | 8 | 2 tasks | 3 files |
| Phase P1c-public-site-integrations P02 | 10min | 4 tasks | 18 files |
| Phase P1c-public-site-integrations P04 | 25 | 2 tasks | 8 files |
| Phase P1c-public-site-integrations P05 | 8 | 2 tasks | 4 files |
| Phase P1c-public-site-integrations P06 | 3 | 1 tasks | 2 files |
| Phase P1c-public-site-integrations P07 | 8min | 1 tasks | 1 files |
| Phase P3-ai-noticeboard-home P01 | 428 | 2 tasks | 2 files |
| Phase P3-ai-noticeboard-home P02 | 440 | 3 tasks | 4 files |
| Phase P3-ai-noticeboard-home P03 | 519 | 3 tasks | 3 files |
| Phase P3-ai-noticeboard-home P04 | 556 | 3 tasks | 4 files |
| Phase P3-ai-noticeboard-home P06 | 382 | 3 tasks | 3 files |
| Phase P3-ai-noticeboard-home P05 | 671 | 3 tasks | 4 files |
| Phase P1c.1-stripe-connect-custom-customer-purchase-flows P01 | 5min | 2 tasks | 4 files |
| Phase P1c.1-stripe-connect-custom-customer-purchase-flows P04 | 8min | 3 tasks | 6 files |
| Phase P1c.1 P06 | 45min | 3 tasks | 15 files |
| Phase P1c.1-stripe-connect-custom-customer-purchase-flows P02 | 4min | 2 tasks | 3 files |
| Phase P1c.1 P05 | 35min | 3 tasks | 9 files |
| Phase P1c.1-stripe-connect-custom-customer-purchase-flows P03 | 18min | 2 tasks | 13 files |

### Carried-over concerns (from v1.1 redesign)

- **Hustle brand hex values** — still placeholder in `hustle.css`; finalise when the customer confirms brand hex.
- **No local dev server** — all verification via Vercel/Fly/Expo Go/EAS. Plans must account for this.
- **Live customer (Hustle) on deployed app** — any future route rename needs redirect shims verified on the live deploy before old routes are removed (standing caution; R3 renames already shipped with shims).

## Session Continuity

Last session: 2026-06-14 (merge of redesign/ui-refresh into master)
Stopped at: Merged v1.1 UI Redesign (R1–R5 complete) into master
Resume file: None

### ▶ PICK UP HERE — v1.1 redesign merged; resume v1.0 production

The v1.1 UI Redesign (R1–R5) is complete and merged into `master`. Remaining work is on the v1.0 production track:

- **WhatsApp deep wire** — finish the `app_secrets` credential migration + WA-08 template-sync cron + live WABA end-to-end test (see `WHATSAPP_HANDOFF.md`).
- **Mobile EAS build** — resume D2 (in-app agent Task 4, D2-06 verification) and cut an EAS preview build.
- **P1c Public Site Integrations** — `/gsd:plan-phase P1c` when ready (forms fork + `/embed/schedule` booking widget).
- **P2 / P3 staff + member surfaces** — next major v1.0 phases (unscheduled).

Deferred manual UAT from P1c.1 (subscription / refund / Customer Portal / mobile live-tests) is tracked in `.planning/phases/P1c.1-*/P1c.1-HUMAN-UAT.md`.
