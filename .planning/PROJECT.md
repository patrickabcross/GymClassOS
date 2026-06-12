# GymClassOS

> **NOTE (2026-05-17, late):** Earlier in this session I claimed agent-native templates were all web (React Router v7) and the member surface should be a PWA. That was wrong — `packages/mobile-app` exists in agent-native upstream as a full Expo 55 + Expo Router + React Native 0.83.9 app (iOS/Android/web). Decision REVERSED: member surface is now `packages/mobile-app` forked & extended. Demo via Expo Go on customer's phone. Production via EAS Build under customer's Apple Dev Account. PWA references throughout this file should be read as "Expo native app" — surgically corrected in the key places below; if you find a stale "PWA" reference, the native decision wins.

## What This Is

GymClassOS is a boutique fitness studio management platform — staff back-office web app and a native member-facing mobile app (React Native via Expo), with direct integrations to WhatsApp Business API and Stripe — built by adapting Builder.io's MIT-licensed `agent-native` framework into a vertical product. The staff back-office adapts agent-native's Mail and Calendar web templates; the member app forks agent-native's `packages/mobile-app` (Expo + RN). The first deployment is a signed gym studio customer; the same fork pattern is intended to seed future verticals in other industries.

## Core Value

Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp conversations + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent — without staff cobbling together WhatsApp, calendar, calorie-tracking, and CRM tools.

## Current Milestone: v1.1 UI Redesign — GymClassOS Design System

> **Branch-isolated milestone (2026-06-12):** lives on `redesign/ui-refresh`. The v1.0 Demo Sprint milestone continues independently on `master` in a separate working copy; this milestone merges when ready, NOT coupled to the 2026-07-15 ship date.

**Goal:** Replace the agent-native template-fork look with a studio-skinnable GymClassOS design system and gym-domain naming across all three surfaces, so the product reads as a real vertical product sellable beyond Hustle.

**Target features:**
- **GymClassOS design system** — theme tokens (color, typography, logo, radius) skinnable per studio; Hustle ships as the first skin via configuration, not hardcoding
- **Staff web redesign** — visual refresh + information-architecture and naming pass retiring Mail-template vocabulary (`InboxPage`, `DraftQueuePage`, email-shaped concepts) in favor of gym-domain language
- **Public widgets redesign** — `/embed/schedule` booking widget + lead-capture forms styled to embed cleanly on any studio site, themed by the same tokens
- **Member mobile app redesign** — Expo app aligned to the same design language
- **Product naming audit (Claude as PM)** — systematic rename of surfaces, features, and labels for gym-domain clarity, captured as a naming decision record

**Key constraints carried in:**
- No local dev server (Nitro/Vite bug) — staff-web verifies via Fly deploy, mobile via EAS/Expo Go, widgets via deployed embeds
- Fork boundary holds: `templates/` and `packages-vendored/*` never edited in place; redesign work lands in `apps/staff-web/features/*`, `apps/staff-web/app/*`, and the forked `packages/mobile-app`
- Baseline `gsd:ui-review` audit is the first work item — no prior audit exists; the redesign must target documented weaknesses, not vibes

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
*Last updated: 2026-06-12 — Milestone v1.1 UI Redesign started on branch `redesign/ui-refresh` (studio-skinnable GymClassOS design system + gym-domain naming across staff web, public widgets, member mobile app; parallel track, merge when ready).*

*Earlier: 2026-05-26 — P1b.1 Customer Pilot Enablement live-accepted on `gym-class-os.vercel.app` after iterative live-fix wave; P1c Public Site Integrations drafted (forms fork + `/embed/schedule` booking widget); validated requirements section refreshed from "(None yet)" to the shipped surfaces; next-up workstreams: WhatsApp deep wire + Mobile EAS build + P1c plan-phase.*

*Earlier: 2026-05-17 — major scope revision (Demo Sprint + Production v1 two-milestone shape; mobile = native Expo not PWA; Stripe direct restricted-key; calorie counter in v1; pg-boss replaces BullMQ/Redis). See PLATFORM-VISION.md for the reconciliation log.*
