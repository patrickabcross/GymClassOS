---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed P1c-01-schema-lead-migration-PLAN.md (0003 migration applied + verified live on gymos-demo Neon)
last_updated: "2026-06-01T12:27:59.036Z"
last_activity: 2026-06-01
progress:
  total_phases: 9
  completed_phases: 1
  total_plans: 8
  completed_plans: 10
  percent: 50
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-17 — major scope revision late in day)
Vision reference: `.planning/research/PLATFORM-VISION.md` (forward-looking; not architecture-of-record)
Roadmap: `.planning/ROADMAP.md` (two-milestone shape: Demo Sprint week 1 + Production v1 weeks 2-9)
Requirements: `.planning/REQUIREMENTS.md` (130 reqs across 20 categories — see [D] / [P] / [D+P] tags)

**Core value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android Expo app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent.

**Current focus:** Phase P1c — Public Site Integrations

1. **WhatsApp integration deep wire** — migrate `services/worker/` and `services/edge-webhooks/` to read Meta credentials from `app_secrets` (not `process.env`) so the in-app Settings UI is the single source of truth; wire the WA-08 template sync cron so real approved Meta templates replace the seeded stubs; full end-to-end test of outbound send + inbound delivery/read callbacks against the verified WABA.
2. **Mobile app (member surface)** — resume D2 work (Task 4 of in-app agent was pending; D2-06 verification deferred); harden the Expo fork against the iteration that landed during the staff-web pilot fixes; cut an EAS preview build under the customer's existing Apple Developer Account.
3. **P1c — Public Site Integrations (drafted)** — fork agent-native's `templates/forms/` for embeddable lead-capture / signup forms, plus ship a public `/embed/schedule` booking widget so visitors on `doyouhustle.co.uk` can book classes + buy Stripe Checkout passes without signing into GymOS. The real commercial unlock vs Mindbody/Bsport. Phase drafted in ROADMAP.md; run `/gsd:plan-phase P1c` when ready to schedule against the timeline.

## Current Position

Milestone: Demo Sprint (1 of 2) — Week 1 (target ~2026-05-24 — slipped to 2026-05-26 with live-fix wave)
Phase: P1c (Public Site Integrations) — EXECUTING
Plan: 2 of 7
Status: Ready to execute
Last activity: 2026-06-01

Progress: Demo Sprint [█████░░░░░] ~50% (P1b.1 closed; D2 mobile-app Task 4 + EAS build still open)

### Demo Sprint detail

| Step | Status | Notes |
|---|---|---|
| **D0.1** Fork agent-native | ✓ committed `98c0e926` | Merged `upstream/main` with `--allow-unrelated-histories`; CLAUDE.md conflict resolved (symlink → text with @AGENTS.md include) |
| **D0.2** pnpm install + boot | ✓ | pnpm upgraded to 10.29.1 via `npm i -g`; install took ~12min; Mail boots on `:8081`, 19 framework migrations auto-applied to Neon |
| **D0.3** Neon provisioned | ✓ | Project: **gymos-demo** (id: `billowing-sun-51091059`); connection in `.env.local` (gitignored) |
| **D0.4** Schema + seed | ✓ committed (schema) | 12 GymClassOS tables created in Neon via `mcp__Neon__run_sql_transaction`; seeded 5 members / 5 conversations / 12 messages / 3 class defs / 7 occurrences / 5 passes / 5 food items / 5 food entries |
| **D0.5** Vercel deploy | ⏳ PENDING | Needs `vercel login` (interactive — Vercel CLI already installed; user is `patrickalexanderross-3109`); needs `NITRO_PRESET=vercel` env var; Mail template currently configured for Netlify (`netlify.toml`). See "Resume notes" below. |
| **D1 inbox surface** | ✓ committed `a52af154` | `/gymos` route — list of conversations + selected thread + member context panel (the differentiator); demo-quality (reply persists to DB but stubs Meta call) |
| **D1 schedule surface** | ✓ committed (`f5cdbdc6` auth, `dd50fe62` loader+grid, `23ee58f2` action) 2026-05-19 | `/gymos/schedule` — week-grid of 7 seeded occurrences, click-card-to-book dialog with member select; demo-grade (no atomic capacity check / no pass debit; flagged for BKG-03/04) |
| **D1 members directory** | ✓ committed (`74bbe110` directory, `2cf77d50` profile) 2026-05-19 | `/gymos/members` + `/gymos/members/:id` profile — pass balance, bookings timeline, recent food, conversation deep-link |
| **D1 inbox gap-fill (D1-04)** | ✓ committed (`3eb967f3` top-nav, `dae915e3` send-ack) 2026-05-19 | Top-nav strip linking all four /gymos* surfaces + "Sent (demo)" banner after reply; INBX-01/02/03/06/07 verified |
| **D1 payments (D1-03)** | ⏸ DEFERRED at Task 1 checkpoint | `/gymos/payments` Stripe Checkout. Awaiting `STRIPE_SECRET_KEY=rk_test_…` in `templates/mail/.env.local` + dev server restart, then resume signal `stripe-ready`. Plan: `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-03-payments-stripe-checkout-PLAN.md`. |
| **D2 member mobile app** | ✓ D2-01 / D2-03 / D2-04 / D2-05 committed | Expo 55 + RN 0.83.9 fork; auth, schedule/booking, Home dashboard, Food tab + scanner all live |
| **D2 calorie counter** | ✓ D2-05 committed (`1812a43e`, `57ad0abb`, `d9c47592`, `bcbe63e4`) 2026-05-19 | OFF search proxy + OFF barcode proxy + food-entries CRUD; BarcodeScanner component; Food tab + food-add + food-barcode screens. CAL-01/CAL-02/CAL-03 complete; CAL-04/-05/-07/-09/-11 deferred to P2 per SUMMARY |
| **D2 in-app agent** | Tasks 1-3 ✓ committed (`07963917`, `2570c8b9`, `04aececd`); Task 4 demo PENDING | SSE route + Anthropic 3-tool loop + AgentSheet + FAB shipped and tsc-clean. Task 4 (live human-verify) blocked overnight on Expo Go setup; resume by booting Mail (`pnpm --filter mail dev`) + Expo (`cd packages/mobile-app && pnpm exec expo start --tunnel --port 19000 --clear` with `$env:EXPO_PUBLIC_API_BASE="http://<laptop-LAN-IP>:8081"`) then walking the 5 tests in D2-06-PLAN §how-to-verify. Reply `approved` to the checkpoint when all 5 pass → continuation agent writes SUMMARY.md + roadmap updates. |

### Production v1 detail

Not started — Demo Sprint runs first. See ROADMAP.md for the 4 production phases (P0 audit / P1a data foundation / P1b webhook spine / P2 product surfaces).

## Performance Metrics

**Velocity:**

- Total commits this session: 8 (planning + execution mixed)
- Schema changes: 12 GymClassOS tables added (composing on top of 32 framework tables = 44 total in Neon)
- Routes built: 1 demo-quality (`/gymos`)
- Files added: ~3500 from upstream merge + 1 new GymClassOS route + 1 auth-bypass edit + schema additions

**Time spent:**

- Scope reconciliation + planning artifact rewrites: ~60% of session
- Actual code (fork + schema + seed + route): ~40%

**Lesson for next session:** scope was reconciled twice mid-session (PWA decision reversed when `packages/mobile-app` discovered upstream). Catch upstream-survey findings BEFORE locking architectural decisions next time — saved scope-locking costs ~15 min of doc rewrites both times.

## Accumulated Context

### Roadmap Evolution

- Phase P1b.1 inserted after Phase P1b: Customer Pilot Enablement — strip email chrome from /gymos, rename Compose→Templates with real Meta Cloud API send, add Analytics tab, provision staff logins for signed customer, ground AgentSidebar in gym data instead of email actions (URGENT — customer waiting post-2026-05-25 demo)

### Decisions

Decisions are logged in `PROJECT.md` Key Decisions table. Recent ones affecting current work:

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

### Pending Todos

None tracked as TODOs; everything is in the roadmap / requirements.

### Blockers/Concerns

**Demo Sprint blockers:**

- **Vercel deploy needs interactive `vercel login`** — user is authenticated locally (`vercel whoami` = `patrickalexanderross-3109`), so this just means running `vercel link` + `vercel deploy` from inside `templates/mail/` after setting `NITRO_PRESET=vercel`. See Resume Notes below.
- **`NITRO_PRESET=vercel` + Mail's `netlify.toml`** — Mail template is preset for Netlify. Need to either set `NITRO_PRESET=vercel` in Vercel project env vars (and possibly add a `vercel.json`), OR deploy to Netlify instead. Decision deferred to next session.
- **Better-auth Google OAuth not configured** — Mail's auth plugin is `googleOnly: true`. We bypassed by adding `/gymos` to `publicPaths` for the demo. Member-side auth (PWA login) will need either: flip `googleOnly: false` and use email/password, OR add WhatsApp-OTP, OR set up Google OAuth proper. Decision in P1a.
- **WhatsApp send doesn't actually call Meta** — `/gymos` reply form persists to DB but doesn't call WhatsApp Cloud API. The single `sendMessage()` chokepoint with 24h-window + opt-in gate is Phase P1b work.

**Customer-facing blockers (Phase P0 of Production v1):**

- Customer's Stripe account creation + restricted API key generation (customer task)
- Customer's Meta Business Account setup + WhatsApp number readiness check (customer task)
- WhatsApp template approvals (≤48h Meta lead time — submit early in P0)

**General concerns:**

- ODbL attribution for Open Food Facts (`CAL-11`) — need to display attribution in calorie counter UI
- PWA web push on iOS 16.4+ — N/A now since mobile is native Expo, not PWA
- D2-01 Task 5 smoke test deferred — requires Expo Go on a physical phone (not runnable from CLI). User must run the 16-step verification in plan §how-to-verify before downstream D2 plans are fully verified.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260524-r8f | Fix staff-web OAuth: redirect Mail routes to /gymos, remove Mail account hook, narrow Google scopes | 2026-05-24 | 1c60a41e | — | [260524-r8f-fix-staff-web-oauth-redirect-mail-routes](./quick/260524-r8f-fix-staff-web-oauth-redirect-mail-routes/) |
| 260531-kbm | Redesign /gymos/analytics dashboard for stronger visual hierarchy with display sizes | 2026-05-31 | 3d082eb7 | — | [260531-kbm-redesign-gymos-analytics-dashboard-for-s](./quick/260531-kbm-redesign-gymos-analytics-dashboard-for-s/) |
| 260531-n7i | Core missed-session re-engagement campaign: opt-in capture + opt-out gate, send-template-to-members batch action, /gymos/campaigns UI | 2026-05-31 | (merge of cc114b8f) | Verified | [260531-n7i-build-core-missed-session-re-engagement-](./quick/260531-n7i-build-core-missed-session-re-engagement-/) |
| Phase P1b.1-customer-pilot-enablement P01 | 7min | 2 tasks | 2 files |
| Phase P1b.1-customer-pilot-enablement P02 | 25min | 2 tasks | 3 files |
| Phase P1b.1-customer-pilot-enablement P03 | 15min | 3 tasks | 3 files |
| Phase P1b.1-customer-pilot-enablement P04 | 35min | 3 tasks | 4 files |
| Phase P1b.1-customer-pilot-enablement P07 | 12min | 2 tasks | 2 files |
| Phase P1b.1-customer-pilot-enablement P06 | 5min | 1 tasks | 1 files |
| Phase P1b.1-customer-pilot-enablement PP05 | 6min | 2 tasks | 2 files |
| Phase P1c-public-site-integrations P01 | 25min | 3 tasks | 2 files |

## Session Continuity

Last session: 2026-06-01T12:27:50.079Z
Stopped at: Completed P1c-01-schema-lead-migration-PLAN.md (0003 migration applied + verified live on gymos-demo Neon)
Resume file: None

### Resume Notes — Next Session Quick-Start

**Re-orient:**

```bash
cd C:/Users/dimet/hustle
git log --oneline -20              # see the live-fix wave + P1c draft commits
cat .planning/STATE.md             # this file
cat .planning/ROADMAP.md           # full plan including new P1c entry
cat .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-LIVE-ACCEPTANCE.md   # what was accepted + carry-over items
```

**Live deployment state:**

- Staff-web: `https://gym-class-os.vercel.app` (Vercel, auto-deploys from `master`)
- Worker + edge-webhooks: Fly app `gymos-edge-webhooks` (two processes inside one app — `services/worker/` + `services/edge-webhooks/`)
- Neon project: `gymos-demo` (id `billowing-sun-51091059`)
- Demo data: 260 members / 423 class occurrences / 4,162 bookings / 200 active subs / 90 conversations / 453 messages (seeded via `pnpm --filter @gymos/staff-web db:seed-demo`)
- ANTHROPIC_API_KEY: stored in `app_secrets` table (saved via in-app Settings → API Keys), NOT in Vercel env
- WHATSAPP_* keys: registered in the framework secret UI (saved in `app_secrets`) but the WORKER still reads from `process.env.WHATSAPP_*` — see WhatsApp deep-wire workstream below

**Three parallel next-up tracks:**

#### 1. WhatsApp integration deep wire

Goal: in-app Settings UI becomes the single source of truth for Meta credentials (today the worker still needs `fly secrets set`).

```bash

# Files that need to migrate from process.env to readAppSecret:

services/worker/src/domain/sendMessage.ts       # outbound send
services/edge-webhooks/src/...                  # inbound webhook signature verification + verify-token

# After migration, drop the per-service Fly secrets and rely on app_secrets only.

# Open: P1b-09 (WA-08 template sync cron) — fetch real approved templates

# from Meta and replace the seeded 5 stub rows in whatsapp_templates.

```

Then end-to-end test:

1. In `/gymos`, open a conversation with an opted-in member whose phone you control
2. Templates → `hello_world` → Send template
3. Phone receives the message, message status moves `queued → sent → delivered → read`
4. Also test the worker chokepoint: send free-text to a conversation with `last_inbound_at` >24h ago, expect status to land at `failed` with errorCode `WINDOW_EXPIRED`

Full setup instructions in `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-WHATSAPP-SETUP.md`.

#### 2. Mobile app (member surface)

Goal: ship an EAS preview build under the customer's existing Apple Developer Account so they can hand the member experience to a real test cohort.

```bash

# Where it lives: packages/mobile-app/ (Expo 55 + RN 0.83.9 + Expo Router)

# Resume D2-06 Task 4 — in-app agent demo. Plan:

cat .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-06-*-PLAN.md

# Boot for local dev:

pnpm --filter @gymos/staff-web dev           # :8081 (the API the mobile app talks to)
cd packages/mobile-app
pnpm exec expo start --tunnel --port 19000 --clear
$env:EXPO_PUBLIC_API_BASE="http://<laptop-LAN-IP>:8081"

# → scan the QR with Expo Go on a phone

```

EAS build then: `cd packages/mobile-app && pnpm exec eas build --platform ios --profile preview` (customer's Apple Developer Account creds needed).

#### 3. P1c — Public Site Integrations (PLANNING IN PROGRESS — resume here)

**▶ THIS IS WHERE TO PICK UP IN THE MORNING.**

Goal: replace the customer's GoHighLevel-on-site footprint. Confirmed (2026-05-31) the studio uses GHL on `doyouhustle.co.uk` for exactly two jobs:

1. **Lead-capture forms** → covered by forking agent-native's `templates/forms/` (it's the right primitive, not overkill; small ~1–2 day lift) + wiring submissions into `gym_members` + a `status='lead'` conversation in `/gymos` so leads land in the inbox and the new WhatsApp campaign tooling can follow up.
2. **Class booking + payment** → CANNOT be done with forms; needs the separate `/embed/schedule` widget + anonymous booking + Stripe Checkout (~1–2 weeks; the real commercial unlock vs Mindbody/Bsport).

**State of the plan-phase run:**

- Phase dir created: `.planning/phases/P1c-public-site-integrations/` (empty — no CONTEXT/RESEARCH/PLAN yet)
- No CONTEXT.md yet. Chose to "answer key decisions now" inline, then PAUSED before answering.

**The 4 plan-time decisions to make (mull these overnight), from ROADMAP "Phase P1c" Risks:**

1. **Forms location** — `apps/forms/` standalone app vs `apps/staff-web/features/forms/` co-located (depends on whether the forms editor should live behind the same staff-web login).
2. **Anonymous booking auth model** — full anonymous + Stripe anti-fraud vs require email-verification before booking.
3. **Theming / brand fit** — URL-param theming only (`?accent=&radius=`) vs full CSS-variable injection to match the studio brand.
4. **Stripe approach** — hosted Checkout (faster to ship, safer demo default) vs embedded Payment Element (more integrated look).

Plus: **forms embed mechanism** — the template only ships an iframe / hosted `/f/:slug` page; P1c needs a real `<script>` snippet (P1c-05 in the draft).

**To resume:**

```bash
/gsd:plan-phase P1c
```

It will detect the existing phase dir; re-pick "answer key decisions now" (or just tell Claude the 4 answers above), it writes CONTEXT.md, then research → plan → verify. Full scope sketch (P1c-01..06) is in `.planning/ROADMAP.md` under "Phase P1c".

**Three Plan-08 criteria carry-over (from `P1b.1-LIVE-ACCEPTANCE.md`):**

1. Real WhatsApp send against the verified WABA (rolls into workstream 1)
2. Worker chokepoint rejecting out-of-window free-text against the LIVE deployment (rolls into workstream 1)
3. Negative auth test — non-allowlisted Google account lands on `/access-denied` (needs a second Google account to walk)

### Files Touched This Session

```
.planning/PROJECT.md              # full rewrite + late-session mobile reversal patch
.planning/REQUIREMENTS.md         # full rewrite — 130 reqs in two-milestone shape
.planning/ROADMAP.md              # full rewrite — Demo Sprint + Production v1
.planning/STATE.md                # this file
.planning/research/PLATFORM-VISION.md     # NEW — vision doc saved as reference
.planning/research/STACK.md       # BullMQ → pg-boss + Stripe direct refresh
.planning/research/ARCHITECTURE.md # BullMQ → pg-boss + topology refresh
.planning/research/SUMMARY.md     # staleness banner
.planning/research/PITFALLS.md    # staleness banner + Pitfall #20 reframe
.planning/research/FEATURES.md    # BullMQ → pg-boss in dep notes

templates/mail/server/db/schema.ts            # GymClassOS domain tables added
templates/mail/server/db/migrations/          # Drizzle-generated SQL
templates/mail/server/plugins/auth.ts         # publicPaths: ["/gymos"] for demo
templates/mail/app/routes/gymos.tsx           # NEW — WhatsApp inbox demo route
templates/mail/.env.local                     # gitignored — Neon DSN
.env.local                                    # gitignored — workspace-level env

CLAUDE.md                          # resolved upstream symlink conflict

+ ~3500 files from upstream merge (templates/, packages/, .agents/, etc.)

```

Memory files updated (in `~/.claude/projects/C--Users-dimet-hustle/memory/`):

- `project_gymos.md` — refreshed (mobile = Expo, RR v7 + Drizzle + Better-auth, Stripe direct)
- `project_gymos_mobile.md` — reversed twice; final: Expo fork of `packages/mobile-app`
- `project_gymos_stack.md` — pg-boss, Stripe direct, Expo native mobile
- `project_gymos_timeline.md` — two-milestone shape
- `project_gymos_roadmap.md` — Demo Sprint + Production v1
- `MEMORY.md` — index entries updated
