# GymClassOS

> **NOTE (2026-05-17, late):** Earlier in this session I claimed agent-native templates were all web (React Router v7) and the member surface should be a PWA. That was wrong — `packages/mobile-app` exists in agent-native upstream as a full Expo 55 + Expo Router + React Native 0.83.9 app (iOS/Android/web). Decision REVERSED: member surface is now `packages/mobile-app` forked & extended. Demo via Expo Go on customer's phone. Production via EAS Build under customer's Apple Dev Account. PWA references throughout this file should be read as "Expo native app" — surgically corrected in the key places below; if you find a stale "PWA" reference, the native decision wins.

## What This Is

GymClassOS is a boutique fitness studio management platform — staff back-office web app and a native member-facing mobile app (React Native via Expo), with direct integrations to WhatsApp Business API and Stripe — built by adapting Builder.io's MIT-licensed `agent-native` framework into a vertical product. The staff back-office adapts agent-native's Mail and Calendar web templates; the member app forks agent-native's `packages/mobile-app` (Expo + RN). The first deployment is a signed gym studio customer; the same fork pattern is intended to seed future verticals in other industries.

## Core Value

Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp conversations + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent — without staff cobbling together WhatsApp, calendar, calorie-tracking, and CRM tools.

## Current Milestone: v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher

> **Started 2026-06-19.** Introduces an entirely new product layer (the operator HQ) plus a new tier of capability (gym-owner brain/dispatcher + member activation) and self-serve provisioning of fully independent per-customer systems. Prior milestone v1.2 (Agentic Tab Editing — phases AE1–AE3) is COMPLETE (code-verified, pushed, live on Vercel; live agent+browser UAT pending). v1.0 Production work and the Mobile Demo (AE4) phase remain tracked separately in the roadmap.

**Goal:** A gym signs up on the GymClassOS site and gets a fully provisioned, independent system with zero human steps; the operator (you) gets a brain/dispatcher to understand and grow your gym-owner customers; each gym gets its own brain/dispatcher to activate its members — all with no member PII ever leaving the studio deploy.

**Three tiers:** Tier 1 = You / GymClassOS HQ (operator). Tier 2 = Gym-owners (your customers). Tier 3 = Gym members (your customers' customers). Both Tier 1 and Tier 2 get their own Brain + Dispatcher.

**Target features (requirement categories refined in REQUIREMENTS.md):**
- **HQ-FND** — `apps/hq` forked from agent-native **Dispatch + Brain** templates; own Neon project; single super-admin Better-auth login; fork-boundary discipline preserved.
- **PROV** — **zero-touch self-serve provisioning**: signup on the GymClassOS site → HQ orchestrates Neon (create project) + Vercel (deploy `staff-web`) + Fly (edge-webhooks + worker), runs migrations + seed + admin user, sets per-customer secrets, subdomain/DNS, **idempotent retries + rollback on partial failure**, then registers the customer + issues a telemetry token. Signup → live system, no human step.
- **TEL** — telemetry pipeline: per-studio AI **token-usage** instrumentation (net-new) + aggregate **mobile-app / user engagement + retention** metrics, pushed up on a schedule authenticated by the per-studio token; HQ ingests, **never queries a studio's Neon**. No PII.
- **HQB** — HQ **Brain** (Tier 1): model of your gym-owner customers + per-installation performance; at-risk / health cohorts ("sets of clients").
- **HQD** — HQ **Dispatcher** (Tier 1): generates marketing **Content + Video** for the GymClassOS website (agent-native Content + Video tools) from Brain insights; messages gym-owners **about system/product features only — never about their members**.
- **GOB** — Gym-owner **Brain** (Tier 2, in the studio deploy): their classes, fitness methods, studio brand + ethos.
- **GOD** — Gym-owner **Dispatcher** (Tier 2, in the studio deploy): **daily studio digest** to the owner + **daily heartbeat reactivation campaigns** to members + the **activation layer** driving GymClassOS usage; all member sends go through the existing worker chokepoint (opt-in / 24h-window / approved-template).

**Key constraints carried in:**
- **Completely independent per-customer systems** (own Neon + Vercel + Fly each); single-tenant code preserved; HQ sits *above* tenants and provisions them. No `studio_id`, no tenant scoping.
- **Hard PII boundary:** Tier-1 dispatcher → gym-owners only, system topics only. Member-facing comms live at Tier 2 inside the studio deploy where member data legitimately lives. **No member/lead PII ever flows up to HQ** — telemetry is aggregate engagement + token usage only.
- agent-native fork-boundary discipline: `templates/` untouched; HQ work in `apps/hq`, Tier-2 work in `apps/staff-web` + worker.
- No breaking DB changes — strictly additive (both the HQ Neon and each studio Neon).
- Provisioning automation (Neon/Vercel/Fly APIs + rollback) is the key risk → research-first milestone.
- Solo dev; single super-admin for HQ v2.0; multi-user/roles deferred.
- No local dev server (Nitro/Vite bug) for staff-web — verify via deploy or unit tests + `tsc`.
- Phase prefix **`BD`** to avoid `.planning/phases/` collisions with existing AE/R/D/P dirs.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] **Workspace bootstrapped from `BuilderIO/agent-native` fork** — Mail template copied to `apps/staff-web/`, Calendar pattern adapted for schedule, member app forks `packages/mobile-app/`. *Validated in Phase D0 (2026-05-17).*
- [x] **`apps/staff-web` deployed to Vercel** — Better-auth + Neon Postgres connected, agent reads `ANTHROPIC_API_KEY` from `app_secrets` (in-app Settings UI is the source of truth). *Validated in Phase P1b.1 (2026-05-26, live-accepted).*
- [x] **Drizzle schema migrated to Neon** — gym_members, conversations, messages, class_definitions, class_occurrences, bookings, passes, pass_debits, whatsapp_templates, whatsapp_opt_in, stripe_customers/subscriptions/payments, secrets, webhook_events, agent_sessions, food_items, food_entries — all live in `gymos-demo`. *Validated through D0 → P1b.*
- [x] **Staff back-office surfaces** — `/gymos` WhatsApp inbox with member context panel (differentiator), `/gymos/schedule` month-grid calendar, `/gymos/members` + detail, `/gymos/payments`, `/gymos/analytics` (Fill Rate / Cancellation / Pass Utilisation + MRR / Net Growth / ARPM / Drop-in Revenue using Hustle's published prices), `/gymos/settings/integrations`. *Validated in Phase P1b.1 (2026-05-26).*
- [x] **Gym-aware right-rail agent** — 5 gym actions (`list-fill-rate`, `list-classes`, `list-members`, `list-renewals`, `list-at-risk-members`) + `list-revenue` registered as `defineAction` LLM tools; gym systemPrompt forbids email vocabulary. *Validated in Phase P1b.1 (2026-05-26).*
- [x] **Customer Pilot Enablement** — auth allowlist, `/access-denied` branded denial page, sign-out, Templates dialog (WhatsApp template send through worker chokepoint), demo seed of 3 months of activity (260 members / 423 classes / 4,162 bookings / 200 active subs). *Validated in Phase P1b.1 (2026-05-26, live-accepted in lieu of formal walkthrough).*
- [x] **Webhook + worker spine** — `services/edge-webhooks/` (Hono receiver, Stripe + WhatsApp signature verification) + `services/worker/` (pg-boss subscriber, sendMessage chokepoint with opt-in / 24h-window / template-approved gates). *Validated in Phase P1b (8/9 plans, 2026-05-23).*
- [x] **Stripe Connect (Custom-equivalent) + customer purchase flows** — GymClassOS platform account with a white-label connected account (`acct_1Thn4XER2RI3cQpx`, onboarded to charges/payouts-enabled via Account Link); separate `/webhooks/stripe-connect` endpoint (signature-verified, idempotent, account-scoped reducers); direct charges on the connected account for drop-ins (pass grant) + membership subscriptions; staff `/gymos/payments` list + member-profile checkout-link button; public `/embed/buy`. STR-01, STR-02, PAY-01–04. *Validated end-to-end in Phase P1c.1 (2026-06-13, live test-mode purchase → webhook → payment row + pass credit). Deferred manual UAT: subscription/refund/portal/mobile live-tests (mechanism proven).*
- [x] **v1.1 Audit baseline (AUDT-01, AUDT-02)** — before-state screenshots of all three surfaces (20 staff-web + 3 embed + 8 mobile PNGs, INDEX.md manifest with deploy SHA) in `.planning/ui-reviews/baseline/`; NAMING-RECORD.md inventories 60+ email-vocabulary items across 4 rename layers with proposed targets, gating R3–R5 scope. Reusable Playwright harness in `scripts/ui-baseline/`. Mobile captured via react-native-web fallback (Expo Go SDK 56 vs app SDK 55 — on-device re-shoot at R5). *Validated in Phase R1 (2026-06-12).*
- [x] **v1.2 Agentic tab editing — Members + Campaigns (AEM-01..04, AEX-01/03/04)** — `update-member` agent action edits only first/last name, email, phone, notes via a `.strict()` Zod schema (consent/opt-in structurally excluded; phone validated E.164 and rejected, never normalized; collision pre-checks); composable Campaigns segment builder (`save-segment`) stores named filter specs in `application_state` (no schema change), with UI controls + the agent writing the identical spec, at-risk retained as a built-in preset; both actions two-exposed (registry + `agent-chat.ts` + `apps/staff-web/AGENTS.md`), run direct (no propose→approve), with `useChangeVersions(["action"])` live-refresh on members/detail/campaigns. *Code-validated in Phase AE3 (2026-06-19); 3 live agent+browser items in AE3-HUMAN-UAT.md await the Vercel deploy.*

### Active

<!-- Current scope. Building toward these. The detailed REQ-IDs live in REQUIREMENTS.md. -->

**v1.1 UI Redesign (this branch — `redesign/ui-refresh`):** see Current Milestone section above; detailed REQ-IDs in REQUIREMENTS.md once defined.

**v1.0 workstreams (continuing on `master`, listed for context — NOT this branch's scope):**

- [ ] **WhatsApp integration deep wire** — migrate `services/worker/` + `services/edge-webhooks/` to read Meta credentials from `app_secrets` (so the in-app Settings UI is the single source of truth, not `fly secrets set`); wire **P1b-09** WA-08 template sync cron so real approved Meta templates replace the seeded stubs; end-to-end test of outbound send + inbound delivery/read callbacks against the verified WABA
- [ ] **Mobile app (member surface)** — resume D2 work (Task 4 of in-app agent was pending; D2-06 verification deferred); harden the Expo fork against iteration that landed during the staff-web pilot fixes; cut an EAS preview build under the customer's existing Apple Developer Account
- [ ] **P1c — Public Site Integrations (drafted, not yet planned)** — fork agent-native's `templates/forms/` for embeddable lead-capture / signup forms whose submissions land in `/gymos` as conversations; ship public `/embed/schedule` booking widget for `doyouhustle.co.uk` (anonymous Stripe Checkout + pass binding via P1b-07 reducer); cross-origin `postMessage` callbacks. The real commercial unlock vs Mindbody/Bsport. Run `/gsd:plan-phase P1c` when ready

**Carry-over from P1b.1 live-acceptance (three Plan-08 criteria not formally walked):**

- [ ] Real WhatsApp send against the verified WABA (rolls into WhatsApp deep wire)
- [ ] Worker chokepoint out-of-window rejection against the LIVE deployment (rolls into WhatsApp deep wire)
- [ ] Negative auth test — non-allowlisted Google account lands on `/access-denied` (needs a second Google account)

**Production v1 (Weeks 2–9, ship by ~2026-07-15) — harden + extend the demo:**

- [ ] Framework audit completed — `audit/<template>.md` for each adapted agent-native template + `audit/decision.md` ruling on fork-clean vs adapt vs build-fresh per surface
- [ ] Drizzle schema production-grade on Neon: append-only `pass_debits` ledger with CHECK constraints, `schedule_rule` + `class_occurrence` two-table TZ-correct (IANA), `webhook_events` idempotency, `audit_log`
- [ ] WhatsApp Business API integration (Meta direct, via `@great-detail/whatsapp` SDK fork): inbound webhook + outbound sender + template management + 24h-window enforcement at sender layer + opt-in gate + delivery/read receipts
- [ ] Stripe integration: **direct restricted-API-key model** (studio gives us a scoped key on their own account, stored encrypted) + idempotent webhook handlers for the listed event set + Checkout/Portal link generation + per-studio webhook signing secret
- [ ] Webhook + worker spine on Fly.io (`apps/edge-webhooks` Hono receiver + `apps/worker` pg-boss subscriber against Neon; no Redis)
- [ ] Staff web app (RR v7 + Better-auth + agent-native templates): WhatsApp inbox surface + member context panel (differentiator) + class schedule + bookings + waitlist + payments + member CRM + settings
- [ ] Member-facing PWA (RR v7, mobile-optimised, installable to home screen): browse + book classes, view passes + history, profile, calorie counter (food search + barcode + meal logging + daily macro rings), in-app agent with skill set
- [ ] Calorie counter built fresh in agent-native style (NOT a fork of OpenNutriTracker — incompatible Flutter + GPL v3 license), using Open Food Facts + USDA Food Data Central as nutrition data sources
- [ ] Per-customer deploy script (`scripts/deploy.sh <studio>` + `studios/<studio>/env.yml`) deploying all three apps (Vercel staff-web, Fly edge-webhooks + worker)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Multi-tenant schema** — using single-tenant code with per-customer deploy instead (one Neon project + one Vercel deploy + one Fly app per studio). Avoids `studio_id` leakage everywhere and keeps the schema crisp.
- **Building member mobile from scratch (NOT adapting `packages/mobile-app`)** — the fork-and-extend path is the rule; do NOT spin up a new Expo project. Always start from `packages/mobile-app` in the upstream fork.
- **Fresh per-studio App Store / Play Store listings** — overwrites customer's existing app on their existing Apple Developer Account (their existing bundle ID + listing). No new submissions / no Fastlane-per-studio-from-scratch.
- **HealthKit integration in week 1 demo** — deferred from demo sprint scope (Expo Go doesn't support custom native modules). Production v1 enables HealthKit via `react-native-health` once we move to EAS Dev Client / production builds. Coach View with health context follows.
- **Managed WhatsApp providers (Twilio, MessageBird, Vonage)** — direct Meta integration for cost and control.
- **Cross-channel CRM (email / SMS / push as parallel channels)** — WhatsApp is the only active member channel in v1. Postmark / Twilio / APNs are deferred.
- **Stripe Connect (OAuth platform model)** — using direct restricted-API-key model instead (studio creates Stripe account, gives scoped key, we store encrypted). Avoids Connect onboarding ceremony, application-fee logic, and `account.application.deauthorized` handling. Aligns with "studio owns merchant relationship" thesis.
- **Card data storage** — Stripe holds everything; we hold tokenised IDs only.
- **Sending WhatsApp outside the 24-hour window without an approved template** — Meta will flag / suspend the number. Enforced at sender layer (worker chokepoint), not just UI.
- **Premature abstraction into a generic "vertical SaaS framework"** — build GymClassOS cleanly first, observe what's actually reusable when vertical #2 begins, *then* extract.
- **Multi-channel campaign engine + segment builder** — deferred from v1. Segment builder + campaigns are post-v1 (covered in PLATFORM-VISION.md reference doc).
- **A2A (Agent-to-Agent) cross-app signed calls** — one workspace, one auth context for v1; A2A overkill until multiple deployments coexist.
- **Forking OpenNutriTracker** — Flutter + GPL v3 (would force the whole codebase to GPL v3, killing commercial distribution). Used as inspiration only.
- **bsport migration tooling productisation** — the migration playbook lives in PLATFORM-VISION.md as future onboarding tooling. When the signed customer is ready to cut over from bsport, the work happens; productising the playbook is post-v1.

## Context

**Source framework.** Builder.io's `agent-native` (`https://github.com/BuilderIO/agent-native`, MIT) ships 22 templates. The README headlines 11 (Mail, Calendar, Content, Slides, Video, Analytics, Clips, Design, Dispatch, Forms, Brain). GymClassOS adapts a subset for the studio domain:

| Template | GymClassOS surface | When |
|---|---|---|
| Mail | Staff WhatsApp inbox | Demo Sprint + production v1 |
| Calendar | Class schedule + bookings | Demo Sprint + production v1 |
| Content | Knowledge base | Post-v1 |
| Analytics | Operational reporting | Post-v1 |
| Forms | Onboarding intake / waivers | If needed |
| Brain | Coach knowledge / member context retrieval | Post-v1 |

**Calorie counter is built fresh** (no `Calorie tracker` template exists upstream — verified 2026-05-17 by direct README + grep). Reference: OpenNutriTracker (Flutter, GPL v3 — read for product/UX inspiration only; no code copied). Data sources: Open Food Facts + USDA Food Data Central. Lives as a new app/surface inside the agent-native workspace using RR v7 + Drizzle + shadcn + agent-skill tools.

**Vertical-SaaS factory framing.** GymClassOS is the first of multiple vertical products planned off the same agent-native foundation. Subsequent businesses (other verticals, not other gym customers) will get their own modified template sets. Decisions made here should keep the agent-native-modifications layer distinguishable from the GymClassOS-specific layer — without prematurely extracting a framework.

**Tenancy model.** Single-tenant code, multi-tenant deploy. One Neon project + one Vercel deploy + one Fly app per studio customer. No `studio_id` columns anywhere. New customers get a deployment, not a tenant row.

**Customer status.** A specific gym studio is signed as the v1 launch customer and is expecting a **prototype-quality demo this week**. They will see the demo via a URL on their phone (member PWA install-to-home-screen) and a URL on their laptop (staff back-office). Production cutover follows after demo feedback.

**Team.** Solo (one developer + Claude). Within the Demo Sprint week, scope is deliberately thin-but-end-to-end. Within production v1, phases run sequentially; parallelization happens within a phase between independent plans.

## Constraints

- **Tech stack — Postgres:** Neon (managed Postgres). CLI + MCP server installed locally.
- **Tech stack — Web:** Vercel hosting + TypeScript end-to-end. Framework: **React Router v7 framework mode** (matches agent-native upstream — verified). ORM: **Drizzle**. Auth: **Better-auth** (via `runAuthGuard` from `@agent-native/core/server`).
- **Tech stack — Long-running services / webhooks:** Fly.io. WhatsApp inbound webhook + Stripe webhook receivers live here (Hono app). Background worker (pg-boss subscriber against Neon, NO Redis) runs as a sibling process in the same Fly app.
- **Tech stack — Queue:** pg-boss on Neon. No Redis. No BullMQ. Postgres handles queueing in its own `pgboss.*` schema alongside the application schema.
- **Tech stack — Member surface:** Native iOS/Android app via **Expo 55 + Expo Router + React Native 0.83.9**, forked from agent-native's `packages/mobile-app`. Demo via **Expo Go** on customer's phone this week; production via **EAS Build** + customer's existing Apple Developer Account (overwrites their existing app on their account).
- **Tech stack — WhatsApp:** `@great-detail/whatsapp` (^9.x, mirrored to studio org's GitHub at fork time; pin to mirror git SHA — the official Meta `WhatsApp/WhatsApp-Nodejs-SDK` is paused per Issue #31). Wrapped in a thin adapter so the SDK can be swapped for hand-rolled Graph API calls in one file change.
- **Tech stack — Stripe:** Stripe Node SDK with `apiVersion` explicitly pinned. **Direct restricted-API-key model** (studio creates Stripe account, generates restricted key, we store encrypted in Postgres via `pgcrypto`). NOT Stripe Connect.
- **Tech stack — Nutrition data:** Open Food Facts (free, packaged-food focus, no API key required) + USDA Food Data Central as fallback for natural-language items not in OFF. LLM fills gaps for descriptions neither matches.
- **Tech stack — Agent runtime:** Anthropic SDK (Claude). One shared `ANTHROPIC_API_KEY` per workspace. Agent endpoints stream via SSE. Skills + tools live in `packages/shared/agent-skills/`.
- **Timeline:** **Demo this week (~2026-05-24)** for the signed customer's first look. **Production v1 by ~2026-07-15** — 8 weeks of work to harden the demo + extend to full production scope. *Aggressive for solo work; every differentiator must justify its cost against the deadline.*
- **Compliance — PCI:** Card data never stored anywhere other than Stripe. Tokenised customer / subscription IDs only.
- **Compliance — Meta:** Outbound WhatsApp messages outside the 24h window MUST use an approved template; non-template sends out of window MUST be rejected at the sender layer (not just discouraged in UI).
- **Compliance — WhatsApp opt-in:** Members must have recorded opt-in evidence (`whatsapp_opt_in` table) before any outbound. Sender refuses if no opt-in row exists.
- **Reliability — Stripe webhooks:** Handlers MUST be idempotent. Stripe replays events out of order and retries on transient failures; non-idempotent handlers silently corrupt member/pass/payment state.
- **Architecture — Tenancy:** Single-tenant code, multi-tenant deploy. No `studio_id` in schema, no tenant scoping in queries.
- **Architecture — agent-native fork boundary:** `templates/` and `packages-vendored/*` are NEVER edited in place. Modifications go in `apps/staff-web/features/*` (copies) or `apps/staff-web/app/lib/*` (wrappers). Two git remotes (`origin` + `upstream`); `MODIFICATIONS.md` tracks every modification. Preserves upstream merge tractability.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork `BuilderIO/agent-native` as foundation | Mature template head start across mail / calendar / content / analytics / forms / brain / dispatch + others; MIT-licensed; AI-native UX shape matches the product vision | — Pending Phase 0 audit |
| React Router v7 + Drizzle + Better-auth + H3 stack | Locked by agent-native upstream (verified by direct repo inspection 2026-05-17). Mismatching the stack kills the merge story. | — Locked |
| Postgres on Neon | User already has CLI + MCP set up; managed Postgres avoids ops overhead; branching speeds up dev workflows | — Locked |
| Vercel (web) + Fly.io (long-running / webhooks) | Vercel handles stateless API + UI; Fly handles always-on webhook receivers and background workers | — Locked |
| pg-boss on Neon (no Redis, no BullMQ) | Eliminates Redis as a service; queue lives in the same DB as the app data; one service to provision, one secret. Re-evaluate at >10k jobs/day per studio. | — Locked |
| WhatsApp Business API direct from Meta (no Twilio) | Avoids per-message markup of managed providers; full control over template lifecycle; differentiator clarity | — Locked |
| **Stripe direct restricted-API-key (NOT Connect)** | Studio owns merchant relationship outright; cleaner than Connect; no application-fee or deauth handling; bsport-migration story works cleanly | — Locked 2026-05-17 |
| Single-tenant code, multi-tenant deploy | Keeps schema clean, eliminates whole class of tenant-isolation bugs, fits per-customer deploy model used by future verticals | — Locked |
| Open Food Facts + USDA Food Data Central for nutrition | Free, no API key for OFF; broad packaged-food coverage; LLM fills natural-language gaps | — Locked |
| **Member surface = Expo native app forked from agent-native `packages/mobile-app`** | agent-native ships a working Expo 55 + Expo Router + RN 0.83.9 + iOS/Android/web mobile-app in `packages/mobile-app`. Forking it satisfies "modify agent-native products" and avoids reinventing a mobile shell. Demo this week via Expo Go (no native modules needed); production via EAS Build under customer's existing Apple Dev Account. | — Locked 2026-05-17 (REVERSED earlier mid-session PWA decision after `packages/mobile-app` was discovered) |
| **Calorie counter built fresh in agent-native style (NOT fork OpenNutriTracker)** | OpenNutriTracker is Flutter + GPL v3 — wrong stack AND wrong license for proprietary commercial distribution. Use as inspiration only. | — Locked 2026-05-17 |
| Demo this week + production v1 by 2026-07-15 (two milestones) | Customer demo pressure forces a vertical slice now; production hardens what the demo taught us | — Locked 2026-05-17 |
| Don't extract a generic "vertical framework" yet | Premature abstraction risk; let two verticals exist before deciding what's truly reusable | — Locked |
| Vision doc (PLATFORM-VISION.md) is reference, NOT architecture-of-record | New scope doc had several conflicts with current constraints (Next.js+Prisma misidentification of agent-native, Hetzner self-host, native mobile, Twilio multi-channel, tenant_id+RLS). Reconciled item-by-item 2026-05-17. | — Locked |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-19 — Milestone v2.0 (Self-Serve Platform + Two-Tier Brain/Dispatcher) started. Introduces operator HQ (`apps/hq` from Dispatch+Brain+Content+Video), zero-touch self-serve provisioning of independent per-customer systems, PII-free telemetry up, and a Tier-2 gym-owner brain/dispatcher (digest + heartbeat reactivation). v1.2 Agentic Tab Editing complete (live, UAT pending).*

*Earlier: 2026-06-18 — v1.2 Agentic Tab Editing: phases AE1 (Forms) + AE2 (Schedule) complete. AE3 (Members + Campaigns) next.*

*Earlier: 2026-06-13 — P1c.1 Stripe Connect (Custom-equivalent) + customer purchase flows completed and validated end-to-end against production (live test-mode drop-in purchase flowed Checkout → Connect webhook → payment row + pass credit). STR-01/02 + PAY-01–04 moved to Validated. Deferred manual UAT (subscription/refund/Customer Portal/mobile live-tests) tracked in P1c.1-HUMAN-UAT.md — all extensions of the now-proven mechanism.*

*Earlier: 2026-06-12 — Phase R1 (Audit Baseline) complete: before-state screenshots + naming decision record committed; two discoveries flagged for master: `/api/m/*` member API is production-gated to 401 (mobile app cannot fetch live data), and Expo Go can no longer run the SDK 55 app (EAS dev client needed).*

*Earlier: 2026-06-12 — Milestone v1.1 UI Redesign started on branch `redesign/ui-refresh` (studio-skinnable GymClassOS design system + gym-domain naming across staff web, public widgets, member mobile app; parallel track, merge when ready).*

*Earlier: 2026-05-26 — P1b.1 Customer Pilot Enablement live-accepted on `gym-class-os.vercel.app` after iterative live-fix wave; P1c Public Site Integrations drafted (forms fork + `/embed/schedule` booking widget); validated requirements section refreshed from "(None yet)" to the shipped surfaces; next-up workstreams: WhatsApp deep wire + Mobile EAS build + P1c plan-phase.*

*Earlier: 2026-05-17 — major scope revision (Demo Sprint + Production v1 two-milestone shape; mobile = native Expo not PWA; Stripe direct restricted-key; calorie counter in v1; pg-boss replaces BullMQ/Redis). See PLATFORM-VISION.md for the reconciliation log.*
