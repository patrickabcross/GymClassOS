# Requirements: GymOS

**Defined:** 2026-05-17
**Core Value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book / pay / log activity from the studio's existing mobile app.

> **Scope:** v1 = PROJECT.md Phases 0–2 only (target ship ≤ 2026-07-15). Phases 3–5 deferred to post-v1 milestones and live in §v2.

## v1 Requirements

### Foundation (Phase 0)

- [ ] **FND-01**: Each of the 5 agent-native templates audited with `audit/<template>.md` (Mail, Calendar, Calorie tracker, Content, Analytics) — fit/gap notes for the GymOS surface that template maps to
- [ ] **FND-02**: `audit/decision.md` rules fork-clean vs adapt vs build-fresh per template
- [ ] **FND-03**: Hello-world `apps/staff-web` (React Router v7 + Better-auth + Neon) deployed to Vercel — validates the framework × Vercel pairing flagged MEDIUM in research
- [ ] **FND-04**: Two git remotes configured (`origin` + `upstream` = `BuilderIO/agent-native`); `MODIFICATIONS.md` committed at repo root tracking every modification to vendored upstream code
- [ ] **FND-05**: `@great-detail/whatsapp` mirrored to studio org's GitHub; package pinned to mirror's git SHA (not npm)
- [ ] **FND-06**: WhatsApp templates submitted to Meta for approval: `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`, `intro_followup`
- [ ] **FND-07**: Customer onboarding checklist completed — Meta Business Manager set up; WhatsApp number 2FA off, no personal-WhatsApp history; class-mix confirmed (no spot-picking / 1:1 PT / 24-7 door)
- [ ] **FND-08**: Test strategy committed — Vitest for non-UI, Playwright for UI/E2E

### Schema & Database (Phase 1)

- [ ] **DB-01**: Drizzle schema deployed to Neon including: `members`, `coaches`, `conversations`, `messages`, `class_definitions`, `schedule_rule`, `class_occurrence` (materialised), `bookings`, `waitlist`, `passes` (grants), `pass_debits` (append-only ledger), `stripe_customers`, `stripe_subscriptions`, `payments`, `whatsapp_templates`, `whatsapp_window_state`, `whatsapp_opt_in`, `webhook_events`, `audit_log`
- [ ] **DB-02**: NO `studio_id` column anywhere in the schema (single-tenant code, multi-tenant deploy enforced by linter or test)
- [ ] **DB-03**: `pass_debits` is append-only — balance = `sum(grants) − sum(debits)`. Postgres CHECK constraint guarantees balance ≥ 0 atomically
- [ ] **DB-04**: Recurring schedules stored as `schedule_rule (weekday, local_time, timezone IANA)` + materialised `class_occurrence` rows (NOT `timestamptz` snapshots) — DST-safe by construction
- [ ] **DB-05**: `webhook_events` table with `external_id` PK + `provider`, `event_type`, `received_at`, `processed_at`, `payload_raw` — idempotency foundation
- [ ] **DB-06**: Migrations managed by `drizzle-kit generate + migrate` only; `drizzle-kit push` blocked by `guard:no-drizzle-push` script

### Webhook & Worker Spine (Phase 1)

- [ ] **WEB-01**: `apps/edge-webhooks` deployed to Fly.io as Hono app with `min_machines = 1` (always-on)
- [ ] **WEB-02**: Webhook receiver verifies HMAC against raw body BEFORE any JSON parsing (Stripe + WhatsApp)
- [ ] **WEB-03**: Webhook receiver inserts into `webhook_events` with `ON CONFLICT DO NOTHING`, enqueues to BullMQ, returns 200 in <100ms — does NO business logic
- [ ] **WEB-04**: `apps/worker` deployed to Fly.io (sibling process to edge-webhooks) running BullMQ consumers on Upstash Redis (private to Fly org)
- [ ] **WEB-05**: Worker job processing is idempotent — re-running with the same `external_id` produces the same DB state, never duplicates writes
- [ ] **WEB-06**: Stripe webhook handler wraps `webhook_events` insert + business work in a single DB transaction; refetches event from Stripe API rather than trusting payload; `apiVersion` explicitly pinned in Stripe SDK init

### Stripe Integration (Phase 1)

- [ ] **STR-01**: Stripe Connect OAuth flow lets the studio authorise GymOS onto their existing Stripe account (one-shot per studio at onboarding)
- [ ] **STR-02**: `checkout.session.completed` handler creates/updates `payments` row + grants pass if line item is a pack
- [ ] **STR-03**: `invoice.paid` and `invoice.payment_failed` handlers reconcile `stripe_subscriptions` state + write to `payments`
- [ ] **STR-04**: `customer.subscription.updated` and `customer.subscription.deleted` handlers reconcile membership status
- [ ] **STR-05**: `charge.refunded` handler defaults to `refund_application_fee: true`
- [ ] **STR-06**: `account.application.deauthorized` handler marks studio as disconnected and surfaces a re-onboard CTA
- [ ] **STR-07**: All Stripe handlers idempotent (verified by replaying the same event twice in tests — no duplicate `payments` or pass-balance changes)
- [ ] **STR-08**: No card data ever stored — only Stripe tokenised IDs in DB

### WhatsApp Integration (Phase 1)

- [ ] **WA-01**: Inbound webhook materialises `conversations` + `messages` from Meta payloads; dedup on `(provider_event_type, external_id)`
- [ ] **WA-02**: Message status webhooks (`sent`/`delivered`/`read`/`failed`) update `messages.status` via ordinal-guarded UPDATE (never downgrades)
- [ ] **WA-03**: Single `sendMessage()` chokepoint in the worker is the only path to Meta's send API — `staff-web` enqueues, never calls Meta directly
- [ ] **WA-04**: `sendMessage()` enforces the 24-hour window at call time by reading `conversations.last_inbound_at` from the DB (authoritative — UI hints are not trusted); sends outside the window MUST be approved templates or are rejected with a typed error
- [ ] **WA-05**: `whatsapp_opt_in` table tracks per-member opt-in evidence; `sendMessage()` refuses to send if no opt-in is recorded
- [ ] **WA-06**: WhatsApp template send path uses the approved template list from `whatsapp_templates` (synced daily by a worker housekeeping job)
- [ ] **WA-07**: WhatsApp client wrapped in a thin adapter (`packages/whatsapp/`) so swapping `@great-detail/whatsapp` for hand-rolled Graph API calls is a one-file change

### Staff Authentication (Phase 1)

- [ ] **AUTH-01**: Coach can sign in to staff-web with email + password via Better-auth
- [ ] **AUTH-02**: Coach session persists across browser refresh and SSR loaders
- [ ] **AUTH-03**: Coach can sign out from any page
- [ ] **AUTH-04**: Two roles supported (`admin`, `coach`); `admin` can manage class definitions + Stripe settings, `coach` cannot
- [ ] **AUTH-05**: Better-auth wired via `runAuthGuard` from `@agent-native/core/server` (matches upstream pattern)

### Per-Customer Deploy (Phase 1)

- [ ] **DEP-01**: `scripts/deploy.sh <studio>` deploys all 3 apps (staff-web → Vercel, edge-webhooks + worker → Fly) for the named studio — no manual deploys
- [ ] **DEP-02**: Per-studio config lives in `studios/<studio>/env.yml` (sops-encrypted); no per-studio config rows in the DB
- [ ] **DEP-03**: Boot-time Zod validation of env vars — missing or malformed config fails the deploy fast
- [ ] **DEP-04**: `scripts/deploy-all.sh` deploys every studio in `studios/` (for when N > 1)

### Observability & Hygiene (Phase 1)

- [ ] **OBS-01**: Pino logger configured across all 3 apps with PII redaction (phone numbers, emails, card last4 masked in logs)
- [ ] **OBS-02**: `/healthz` endpoint on edge-webhooks reports webhook receive latency, queue depth, last-processed timestamps

### Staff Web App — Inbox Surface (Phase 2)

- [ ] **INBX-01**: Coach can view list of conversations (sorted by last-activity), filter by unread, search by member name/phone
- [ ] **INBX-02**: Coach can open a conversation and see full message history with delivery status indicators
- [ ] **INBX-03**: Coach can send a free-text WhatsApp message when the conversation is inside the 24-hour window
- [ ] **INBX-04**: Coach can send an approved WhatsApp template when out-of-window; UI surfaces template picker
- [ ] **INBX-05**: UI surfaces window state indicator (in-window / out-of-window with hours-left) on every conversation
- [ ] **INBX-06**: **DIFFERENTIATOR** — Member context panel renders inside the conversation showing: next upcoming class, pass balance + expiry, active subscription, last payment, total bookings (no incumbent does this)
- [ ] **INBX-07**: Inbox forked from agent-native `templates/mail/` via copy-out into `apps/staff-web/features/inbox/` (NOT edited in `templates/`)

### Staff Web App — Members (Phase 2)

- [ ] **MEM-01**: Coach can view member directory (paginated, searchable by name + phone + email)
- [ ] **MEM-02**: Coach can view member profile with full timeline: bookings, passes, payments, conversations
- [ ] **MEM-03**: Coach can edit member's name, email, tags, and notes
- [ ] **MEM-04**: Member profile shows derived pass balance from `pass_debits` ledger (real-time)

### Staff Web App — Schedule & Bookings (Phase 2)

- [ ] **SCH-01**: Admin can define a `class_definition` (name, duration, default capacity, default instructor)
- [ ] **SCH-02**: Admin can create a `schedule_rule` (weekly recurrence: day-of-week + local-time + IANA timezone + start/end dates)
- [ ] **SCH-03**: Worker materialises future `class_occurrence` rows from active rules (configurable horizon, e.g. 8 weeks ahead)
- [ ] **SCH-04**: Admin can cancel, reschedule, or override a single `class_occurrence` without affecting the rule
- [ ] **SCH-05**: Admin can swap the instructor on a single occurrence or update its capacity
- [ ] **SCH-06**: Schedule UI renders weekly calendar view in studio's local timezone (DST-correct across boundaries) — forked from agent-native `templates/calendar/`
- [ ] **BKG-01**: Coach can book a member into a `class_occurrence` from the schedule UI
- [ ] **BKG-02**: **DIFFERENTIATOR** — Coach can book a member from inside the conversation (inline action in inbox)
- [ ] **BKG-03**: Booking transaction is atomic: capacity check + entitlement resolution + pass debit happen in a single SQL transaction; refuses overbooking under concurrent load (verified by 50-concurrent integration test)
- [ ] **BKG-04**: Entitlement resolution priority: active subscription > pass with earliest expiry > prompt-for-drop-in-purchase (configurable per studio if needed in v1.x)
- [ ] **BKG-05**: Coach can cancel a booking; if cancelled before the cancellation window, the pass debit is reversed (negative entry in `pass_debits`)
- [ ] **BKG-06**: Late-cancel (after window) forfeits the credit — no charge, no refund (v1 mode; fee-charging deferred to v1.x)

### Staff Web App — Waitlist (Phase 2)

- [ ] **WAIT-01**: When a class is at capacity, coach can add member to a FIFO waitlist
- [ ] **WAIT-02**: When a booking is cancelled, worker transactionally promotes the head of the waitlist + sends a `waitlist_offer` WhatsApp template
- [ ] **WAIT-03**: Promotion is idempotent — duplicate cancellation events do not double-promote
- [ ] **WAIT-04**: Member can reply to a waitlist offer with a keyword (e.g. "YES") to confirm the booking; the reply-to-confirm classifier resolves against a per-conversation `pending_action` row with TTL
- [ ] **WAIT-05**: If the head doesn't confirm within the TTL, offer expires and worker promotes the next member
- [ ] **WAIT-06**: A reconciliation cron heals waitlist drift hourly (catches edge cases where promotion logic was interrupted)

### Staff Web App — Payments (Phase 2)

- [ ] **PAY-01**: Coach can generate a Stripe Checkout link for a class drop-in (creates 1-credit pass on success — drop-ins flow through Checkout → pass, not a separate code path)
- [ ] **PAY-02**: Coach can generate a Stripe Checkout link for a pack purchase (creates N-credit pass on success)
- [ ] **PAY-03**: Coach can generate a Stripe Subscription Checkout link for recurring memberships
- [ ] **PAY-04**: Coach can generate a Stripe Customer Portal link to send to a member for self-service billing
- [ ] **PAY-05**: Refunds happen via Stripe Dashboard (NO refunds UI in staff-web v1)

### Notifications & Jobs (Phase 2)

- [ ] **NOTIF-01**: Worker sends a `class_reminder` template 24h and 2h before each class occurrence (BullMQ delayed jobs; idempotent by `jobId = occurrence_id + offset`)
- [ ] **NOTIF-02**: Worker sends `payment_failed` template when a Stripe `invoice.payment_failed` webhook fires
- [ ] **NOTIF-03**: Worker sends `pass_expiring` template when a pass has ≤7 days until expiry (daily cron)
- [ ] **NOTIF-04**: Worker runs no-show detection after each class occurrence ends; flags bookings where the member was not checked in (manual check-in UI deferred to v1.x — flag only for now)
- [ ] **NOTIF-05**: Worker expires passes at end-of-day in the studio's local timezone (DST-correct)

### Reply-to-Confirm (Phase 2)

- [ ] **RTC-01**: Inbound WhatsApp messages are checked against a `pending_action` row on the conversation; if matched, the action resolves (book / cancel / decline)
- [ ] **RTC-02**: Keyword classifier supports: YES / CONFIRM / OK / 👍 (book/confirm); NO / CANCEL / 👎 (decline)
- [ ] **RTC-03**: Out-of-spec replies during a `pending_action` are treated as freeform (action stays pending until TTL); staff sees the reply in inbox

### Settings (Phase 2)

- [ ] **SET-01**: Admin can view a list of WhatsApp templates (synced from Meta) with approval status
- [ ] **SET-02**: Admin can view Stripe Connect connection status + re-authorise button if `account.application.deauthorized` fired
- [ ] **SET-03**: Admin can view system health (queue depth, recent webhook errors, recent send failures)

## v2 Requirements

Deferred to post-v1 milestones per PROJECT.md.

### Mobile Integration (Phase 3 — post-v1)

- **MOB-01**: Member can browse class schedule in studio's existing React Native app
- **MOB-02**: Member can book a class from the mobile app (reuses Phase 2 booking transaction via API surface)
- **MOB-03**: Member can view + manage active passes from the mobile app
- **MOB-04**: Member can view + edit their profile from the mobile app
- **MOB-05**: Member receives push notifications for class reminders + waitlist offers (in addition to / replacing WhatsApp depending on opt-in)
- **MOB-06**: Identity reconciliation rule between studio's existing app user IDs and GymOS member rows (by phone number)

### Operational Reporting (Phase 4 — post-v1)

- **RPT-01**: Class attendance reports (occupancy, no-show rate by class type / instructor / time of day)
- **RPT-02**: Revenue reports (subscription MRR, drop-in revenue, pack purchases, refunds)
- **RPT-03**: Member retention cohorts
- **RPT-04**: App-fee reconciliation report (Stripe Connect application fees collected vs refunded)

### Knowledge Base (Phase 4 — post-v1)

- **KB-01**: Admin can author internal knowledge articles (forked from agent-native `templates/content/`)
- **KB-02**: Member-facing FAQ surface in mobile app

### Calorie Counter (Phase 5 — post-v1)

- **CAL-01**: Member can log meals via natural language input
- **CAL-02**: OpenFoodFacts lookup for packaged items
- **CAL-03**: LLM fills nutrition gaps for items OpenFoodFacts can't match
- **CAL-04**: Daily / weekly nutrition summaries

### v1.x (Post-launch quick-wins)

- **VOICE-01**: Inbound WhatsApp voice + photo messages rendered in inbox
- **LATE-01**: Late-cancel fee charging (replaces forfeit-only mode)
- **PAUSE-01**: Pause subscription action
- **SERIES-01**: Class series / multi-week blocks
- **INTRO-01**: Intro-offer flow with conversion tracking
- **CHKIN-01**: Manual check-in UI for no-show resolution
- **AI-01**: AI-suggested reply drafts in inbox (leverages agent-native foundation)

## Out of Scope

Explicitly excluded from v1. Reasoning preserved to prevent re-adding under deadline pressure.

| Feature | Reason |
|---------|--------|
| Multi-tenant schema (`studio_id` columns) | Architectural — single-tenant code, multi-tenant deploy. Eliminates tenant-leak bug class. |
| New mobile app / App Store / Play Store submission | Mobile is updates to customer's existing app under their existing dev accounts (Phase 3). No Fastlane, no per-studio Apple Dev Account. |
| Managed WhatsApp providers (Twilio, MessageBird, Vonage) | Direct Meta integration for cost + control; the user accepts the integration complexity. |
| Card data storage of any kind | PCI scope reduction; Stripe owns it. We hold tokenised IDs only. |
| Sending WhatsApp outside the 24h window without an approved template | Meta will suspend the number. Enforced at sender layer (WA-04). |
| Premature extraction into generic "vertical SaaS framework" | Build GymOS clean first; observe what's actually reusable when vertical #2 begins; *then* extract. (`git grep` for `Tenant`/`Vertical`/`StudioConfig`/`Plugin` monthly.) |
| Cross-channel CRM beyond WhatsApp (email, SMS) | Channels exist in `conversations.channel` but only `whatsapp` is an active surface in v1. |
| Member self-service web portal | Member-facing surface is mobile only in v1; staff-web is staff-only. |
| Branded mobile app from scratch | Mobile = updates to customer's existing RN app (Phase 3); no new builds. |
| Multi-location / franchise support | One studio per deploy. Multi-location is per-deploy at the topology level, not in-app. |
| Marketing automation orchestration | Out of scope. Use WhatsApp templates manually in v1. |
| Spot picking / floor plan / reformer-bike selection | Confirmed not needed for signed customer's class mix (FND-07). |
| Door access / Kisi integration | Staffed check-in confirmed (FND-07). |
| In-app retail / POS / merchandise | Studio keeps existing POS. |
| 1:1 personal training appointments | Group classes only — confirmed by customer (FND-07). Adding 1:1 is an L-complexity second booking primitive. |
| Refunds UI for staff in staff-web | Use Stripe Dashboard. Saves a stored-card-charge code path. |
| Email marketing channel | Not the differentiator. |
| Family / household sub-accounts | Defer until requested. |
| Gift cards | Defer until requested. |
| Referral programs | Defer until requested. |

## Traceability

Populated by the roadmapper when ROADMAP.md is created. Empty initially.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 — FND-08 | Phase 0 | Pending |
| DB-01 — DB-06 | Phase 1 | Pending |
| WEB-01 — WEB-06 | Phase 1 | Pending |
| STR-01 — STR-08 | Phase 1 | Pending |
| WA-01 — WA-07 | Phase 1 | Pending |
| AUTH-01 — AUTH-05 | Phase 1 | Pending |
| DEP-01 — DEP-04 | Phase 1 | Pending |
| OBS-01 — OBS-02 | Phase 1 | Pending |
| INBX-01 — INBX-07 | Phase 2 | Pending |
| MEM-01 — MEM-04 | Phase 2 | Pending |
| SCH-01 — SCH-06 | Phase 2 | Pending |
| BKG-01 — BKG-06 | Phase 2 | Pending |
| WAIT-01 — WAIT-06 | Phase 2 | Pending |
| PAY-01 — PAY-05 | Phase 2 | Pending |
| NOTIF-01 — NOTIF-05 | Phase 2 | Pending |
| RTC-01 — RTC-03 | Phase 2 | Pending |
| SET-01 — SET-03 | Phase 2 | Pending |

**Coverage (provisional — confirmed by roadmapper):**
- v1 requirements: 86 total (8 + 30 + 48)
- Mapped to phases: 86 (8 → Phase 0, 30 → Phase 1, 48 → Phase 2)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-17*
*Last updated: 2026-05-17 after initial definition*
