# GymOS

## What This Is

GymOS is a boutique fitness studio management platform — staff web app, member mobile features, and direct integrations with WhatsApp Business API and Stripe — built by adapting Builder.io's MIT-licensed `agent-native` framework into a vertical product. The first deployment is a signed gym studio customer; the same fork pattern is intended to seed future verticals in other industries.

## Core Value

Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp conversations + class bookings + member context), and members book / pay / log activity from the studio's existing mobile app — without staff cobbling together WhatsApp, calendar, and CRM tools.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. The detailed REQ-IDs live in REQUIREMENTS.md. -->

**v1 (Phases 0-2, ship by ~2026-07-15):**

- [ ] Framework audit completed — `audit/<template>.md` for each of the 5 agent-native templates + `audit/decision.md` ruling on fork-clean vs adapt vs build-fresh
- [ ] Postgres data model deployed on Neon (members, conversations, messages, classes, bookings, passes, payments, coaches, templates, meals, content)
- [ ] WhatsApp Business API integration (Meta direct): inbound webhook + outbound sender + template management + 24h-window enforcement + delivery/read receipts
- [ ] Stripe integration: OAuth onto studio's existing account + idempotent webhook handlers for the listed event set + Checkout/Portal link generation
- [ ] Staff web app: WhatsApp client (adapted from Mail template) + member directory
- [ ] Class schedule (adapted from Calendar template) + bookings/capacity/waitlists + pass-balance debit logic

**Post-v1 (Phases 3-5, after first customer is live):**

- [ ] Mobile features integrated into customer's existing React Native app (class browser, bookings, passes, profile, push notifications)
- [ ] Operational reporting (Analytics template fork) + knowledge base (Content template fork)
- [ ] Calorie counter (Calorie tracker template fork) + OpenFoodFacts integration

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Multi-tenant schema** — using single-tenant code with per-customer deploy instead (one Neon project + one Vercel deploy + one Fly app per studio). Avoids studio_id leakage everywhere and keeps the schema crisp.
- **New mobile app build / App Store / Play Store submission** — mobile is updates to the customer's existing app. No per-studio Apple Developer Account flow, no per-studio branding-at-build-time, no Fastlane pipeline.
- **Managed WhatsApp providers (Twilio, MessageBird, Vonage)** — direct Meta integration for cost and control.
- **Card data storage** — Stripe holds everything; we hold tokenised IDs only.
- **Sending WhatsApp outside the 24-hour window without an approved template** — Meta will flag / suspend the number.
- **Storing payment data anywhere other than Stripe** — see above; tokenised IDs only, never PAN.
- **Premature abstraction into a generic "vertical SaaS framework"** — build GymOS cleanly first, observe what's actually reusable when vertical #2 begins, *then* extract.
- **Cross-channel CRM beyond WhatsApp** — email/SMS/app channels exist in the conversation model but are not active surfaces in v1.
- **Member self-service web portal** — member-facing surface is mobile only in v1.

## Context

**Source framework.** Builder.io's `agent-native` (`https://github.com/BuilderIO/agent-native`, MIT) ships five templates that map onto GymOS surfaces:

| Template | GymOS surface |
|---|---|
| Mail | Staff WhatsApp client |
| Calendar | Class schedule |
| Calorie tracker | Member calorie counter |
| Content | Knowledge base (staff + member) |
| Analytics | Operational reporting |

Phase 0 audits each template's fit before any product code is written.

**Vertical-SaaS factory framing.** GymOS is the first of multiple vertical products planned off the same agent-native foundation. Subsequent businesses (other verticals, not other gym customers) will get their own modified template sets. Decisions made here should keep the agent-native-modifications layer distinguishable from the GymOS-specific layer — without prematurely extracting a framework.

**Tenancy model.** Single-tenant code, multi-tenant deploy. One Neon project + one Vercel deploy + one Fly app per studio customer. No `studio_id` columns anywhere. New customers get a deployment, not a tenant row.

**Customer status.** A specific gym studio is signed as the v1 launch customer and is waiting on this. They have an existing branded React Native mobile app (stack known, repo access confirmed) — Phase 3 integrates GymOS features into that app rather than replacing it.

**Team.** Solo (one developer + Claude). Phases run sequentially; parallelization happens within a phase between independent plans.

## Constraints

- **Tech stack — Postgres:** Neon (managed Postgres). CLI and MCP server installed locally.
- **Tech stack — Web:** Vercel hosting + TypeScript end-to-end.
- **Tech stack — Long-running services / webhooks:** Fly.io. WhatsApp inbound webhook and Stripe webhook receivers live here; stateless API routes can live on Vercel.
- **Tech stack — Mobile:** TypeScript on top of the customer's existing React Native app (Expo vs bare workflow determined by that codebase, confirmed at Phase 3 planning time).
- **Tech stack — Nutrition data:** OpenFoodFacts (free, packaged-food focus, no API key required) for the calorie counter; LLM fills gaps for natural-language descriptions it can't match.
- **Timeline:** Hard deadline under 2 months from 2026-05-17 — target ship date on or before **2026-07-15** for Phases 0-2 (v1). Phases 3-5 follow after first customer is live. *This is aggressive for solo work; every differentiator must justify its cost against this deadline.*
- **Compliance — PCI:** Card data never stored anywhere other than Stripe. Tokenised customer / subscription IDs only.
- **Compliance — Meta:** Outbound WhatsApp messages outside the 24h window must use an approved template; non-template sends out of window MUST be rejected at the sender layer (not just discouraged in UI).
- **Reliability — Stripe webhooks:** Handlers MUST be idempotent. Stripe replays events out of order and retries on transient failures; non-idempotent handlers silently corrupt member/pass/payment state.
- **Distribution — Mobile:** No new App Store / Play Store submissions in this project. Mobile work is updates to the customer's existing app under their existing developer accounts.
- **Architecture — Tenancy:** Single-tenant code, multi-tenant deploy. No `studio_id` in schema, no tenant scoping in queries.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork `BuilderIO/agent-native` as foundation | Free five-template head start across mail/calendar/analytics/content/calorie-tracker; MIT-licensed; AI-native UX shape matches the product vision | — Pending (validated in Phase 0 audit) |
| Postgres on Neon | User already has CLI + MCP set up; managed Postgres avoids ops overhead; branching speeds up dev workflows | — Pending |
| Vercel (web) + Fly.io (long-running / webhooks) | Vercel handles stateless API + UI; Fly handles always-on webhook receivers and any background workers | — Pending |
| WhatsApp Business API direct from Meta | Avoids per-message markup of managed providers; full control over template lifecycle; user is willing to absorb the integration complexity | — Pending |
| Stripe OAuth onto studio's existing account | Studio retains merchant control; faster onboarding (no new merchant account); cleaner liability story | — Pending |
| Single-tenant code, multi-tenant deploy | Keeps schema clean, eliminates whole class of tenant-isolation bugs, fits per-customer deploy model used by future verticals | — Pending |
| OpenFoodFacts for nutrition data | Free, no API key, broad packaged-food coverage; LLM fills natural-language gaps | — Pending |
| Mobile = code update to customer's existing RN app | No new submission friction; reuses existing branding/auth; avoids per-studio Apple Dev Account playbook | — Pending |
| Don't extract a generic "vertical framework" yet | Premature abstraction risk; let two verticals exist before deciding what's truly reusable | — Pending |

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
*Last updated: 2026-05-17 after initialization*
