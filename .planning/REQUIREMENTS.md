# Requirements: GymOS

**Defined:** 2026-05-17 (revised 2026-05-17 — major scope pivot)
**Core Value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent.

> **MOBILE NOTE:** "PWA" and "web app" references in MEMBR-*, MEMAUTH-*, and CAL-* requirements below are stale — corrected mid-session after discovering `packages/mobile-app` upstream. Read those reqs as native Expo / RN equivalents. The intent is identical (book class, log food, chat with agent on phone); the mechanism is native, not web PWA. Surgical corrections at the requirement level not done due to time pressure — implementations will use Expo APIs where the requirement text says browser APIs (e.g. `expo-camera` instead of `MediaDevices.getUserMedia`).

> **Two milestones:**
> - **Demo Sprint** — week 1 (by ~2026-05-24). Prototype quality. Vertical slice across all surfaces.
> - **Production v1** — weeks 2–9 (by ~2026-07-15). Hardens + extends the demo.
>
> Items marked **D** ship in the Demo Sprint. Items marked **P** ship in Production v1. Items marked **D+P** start in demo as a stub/thin slice and harden to production in v1.

## v1 Requirements

### Foundation

- [ ] **FND-01** [P]: Each adapted agent-native template audited with `audit/<template>.md` + `audit/decision.md` ruling fork-clean vs adapt vs build-fresh per surface (Mail → inbox, Calendar → schedule; others noted for post-v1)
- [ ] **FND-02** [D]: Workspace bootstrapped from `BuilderIO/agent-native` fork; `pnpm install` succeeds; `pnpm dev` runs the Mail + Calendar templates locally
- [ ] **FND-03** [D]: Hello-world `apps/staff-web` (RR v7 + Better-auth + Neon) deployed to Vercel — validates the framework × host pairing flagged MEDIUM in research
- [ ] **FND-04** [P]: Two git remotes configured (`origin` + `upstream` = `BuilderIO/agent-native`); `MODIFICATIONS.md` committed at repo root tracking every modification to vendored upstream code
- [ ] **FND-05** [P]: `@great-detail/whatsapp` mirrored to studio org's GitHub; package pinned to mirror's git SHA (not npm)
- [ ] **FND-06** [P]: WhatsApp templates submitted to Meta for approval: `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`
- [ ] **FND-07** [P]: Customer onboarding checklist completed — Meta Business Manager set up; WhatsApp number 2FA off, no personal-WhatsApp history; class-mix confirmed (no spot-picking / 1:1 PT / 24-7 door); studio's own Stripe account created + restricted API key generated
- [ ] **FND-08** [P]: Test strategy committed — Vitest for non-UI, Playwright for UI/E2E

### Schema & Database

- [ ] **DB-01** [D]: Drizzle schema deployed to Neon including (demo subset): `members`, `coaches`, `conversations`, `messages`, `class_definitions`, `class_occurrences`, `bookings`, `passes`, `pass_debits`, `food_items`, `food_entries`, `agent_sessions`, `webhook_events`
- [ ] **DB-02** [D+P]: NO `studio_id` column anywhere in the schema (single-tenant code, multi-tenant deploy)
- [ ] **DB-03** [P]: Drizzle schema extended to production: `waitlist`, `whatsapp_templates`, `whatsapp_window_state`, `whatsapp_opt_in`, `stripe_customers`, `stripe_subscriptions`, `payments`, `audit_log`, `agent_skills`, `agent_memory`, plus `pgboss.*` queue schema
- [ ] **DB-04** [P]: `pass_debits` is append-only — balance = `sum(grants) − sum(debits)`. Postgres CHECK constraint guarantees balance ≥ 0 atomically (verified by 50-concurrent test)
- [ ] **DB-05** [P]: Recurring schedules stored as `schedule_rule (weekday, local_time, timezone IANA)` + materialised `class_occurrence` rows (NOT `timestamptz` snapshots) — DST-safe by construction (demo can hardcode a week of occurrences directly)
- [ ] **DB-06** [P]: `webhook_events` table with `external_id` PK + `provider`, `event_type`, `received_at`, `processed_at`, `payload_raw` — idempotency foundation
- [ ] **DB-07** [P]: Migrations managed by `drizzle-kit generate + migrate` only; `drizzle-kit push` blocked by `guard:no-drizzle-push` script

### Webhook & Worker Spine

- [ ] **WEB-01** [P]: `apps/edge-webhooks` deployed to Fly.io as Hono app with `min_machines = 1` (always-on)
- [ ] **WEB-02** [P]: Webhook receiver verifies HMAC against raw body BEFORE any JSON parsing (Stripe + WhatsApp)
- [ ] **WEB-03** [P]: Webhook receiver inserts into `webhook_events` with `ON CONFLICT DO NOTHING`, enqueues via pg-boss, returns 200 in <100ms — does NO business logic
- [ ] **WEB-04** [P]: `apps/worker` deployed to Fly.io (sibling process to edge-webhooks) running pg-boss subscribers against the same Neon Postgres instance (NO Redis)
- [ ] **WEB-05** [P]: Worker job processing is idempotent — re-running with the same `external_id` produces the same DB state, never duplicates writes
- [ ] **WEB-06** [P]: Stripe webhook handler wraps `webhook_events` insert + business work in a single DB transaction; refetches event from Stripe API rather than trusting payload; `apiVersion` explicitly pinned in Stripe SDK init

### Stripe Integration (direct restricted-API-key, NOT Connect)

- [ ] **STR-01** [D+P]: Per-studio Stripe restricted key stored encrypted (pgcrypto). Demo: one studio, hardcoded; Production: rotated + audited. Studio creates their own Stripe account and generates the key with permissions: Products/Prices, Customers, Subscriptions, PaymentIntents, SetupIntents, Charges (read), Refunds, Webhooks (read)
- [ ] **STR-02** [D]: Demo can generate at least one Stripe Checkout link for a pass purchase, complete it in test mode, and reflect the resulting pass grant in the member profile
- [ ] **STR-03** [P]: `checkout.session.completed` handler creates/updates `payments` row + grants pass if line item is a pack (atomic transaction with `webhook_events` insert)
- [ ] **STR-04** [P]: `invoice.paid` and `invoice.payment_failed` handlers reconcile `stripe_subscriptions` state + write to `payments`
- [ ] **STR-05** [P]: `customer.subscription.updated` and `customer.subscription.deleted` handlers reconcile membership status
- [ ] **STR-06** [P]: `charge.refunded` handler reverses pass grant on refund
- [ ] **STR-07** [P]: All Stripe handlers idempotent (verified by replaying the same event twice in tests — no duplicate `payments` or pass-balance changes)
- [ ] **STR-08** [D+P]: No card data ever stored — only Stripe tokenised IDs in DB

### WhatsApp Integration (Meta direct)

- [ ] **WA-01** [D]: Demo can receive at least one inbound WhatsApp message from a real phone and surface it in the inbox UI (HMAC verified, message + conversation persisted)
- [ ] **WA-02** [D]: Demo can send at least one outbound WhatsApp message from the inbox UI (in-window free-text to a member who recently messaged in)
- [ ] **WA-03** [P]: Inbound webhook materialises `conversations` + `messages` from Meta payloads; dedup on `(provider_event_type, external_id)`
- [ ] **WA-04** [P]: Message status webhooks (`sent`/`delivered`/`read`/`failed`) update `messages.status` via ordinal-guarded UPDATE (never downgrades)
- [ ] **WA-05** [P]: Single `sendMessage()` chokepoint in the worker is the only path to Meta's send API — `staff-web` enqueues, never calls Meta directly
- [ ] **WA-06** [P]: `sendMessage()` enforces the 24-hour window at call time by reading `conversations.last_inbound_at` from the DB (authoritative — UI hints are not trusted); sends outside the window MUST be approved templates or are rejected with a typed error
- [ ] **WA-07** [P]: `whatsapp_opt_in` table tracks per-member opt-in evidence; `sendMessage()` refuses to send if no opt-in is recorded
- [ ] **WA-08** [P]: WhatsApp template send path uses the approved template list from `whatsapp_templates` (synced daily by a worker housekeeping job)
- [ ] **WA-09** [P]: WhatsApp client wrapped in a thin adapter (`packages/whatsapp/`) so swapping `@great-detail/whatsapp` for hand-rolled Graph API calls is a one-file change

### Staff Authentication

- [ ] **AUTH-01** [D]: Coach can sign in to staff-web with email + password via Better-auth (demo can use seeded test accounts)
- [ ] **AUTH-02** [D+P]: Coach session persists across browser refresh and SSR loaders
- [ ] **AUTH-03** [P]: Coach can sign out from any page
- [ ] **AUTH-04** [P]: Two roles supported (`admin`, `coach`); `admin` can manage class definitions + Stripe settings, `coach` cannot
- [ ] **AUTH-05** [P]: Better-auth wired via `runAuthGuard` from `@agent-native/core/server` (matches upstream pattern)

### Member Authentication (PWA)

- [ ] **MEMAUTH-01** [D]: Member can log in to the PWA with email magic-link (demo can stub the email send and show the link in a dev tray)
- [ ] **MEMAUTH-02** [P]: Magic-link emails sent via WhatsApp template (member-channel-only constraint — no email transactional in v1)
- [ ] **MEMAUTH-03** [P]: Member session via Better-auth (same auth system as staff, different role)
- [ ] **MEMAUTH-04** [P]: PWA Web App Manifest + service worker — installable to home screen on iOS/Android; offline shell for already-cached routes

### Per-Customer Deploy

- [ ] **DEP-01** [P]: `scripts/deploy.sh <studio>` deploys all 3 apps (staff-web → Vercel, edge-webhooks + worker → Fly) for the named studio — no manual deploys
- [ ] **DEP-02** [P]: Per-studio config lives in `studios/<studio>/env.yml` (sops-encrypted); no per-studio config rows in the DB
- [ ] **DEP-03** [P]: Boot-time Zod validation of env vars — missing or malformed config fails the deploy fast
- [ ] **DEP-04** [P]: `scripts/deploy-all.sh` deploys every studio in `studios/` (for when N > 1)

### Observability & Hygiene

- [ ] **OBS-01** [P]: Pino logger configured across all 3 apps with PII redaction (phone numbers, emails, card last4 masked in logs)
- [ ] **OBS-02** [P]: `/healthz` endpoint on edge-webhooks reports webhook receive latency, queue depth, last-processed timestamps

### Staff Web App — Inbox Surface (Mail template adaptation)

- [x] **INBX-01** [D]: Coach can view list of conversations (sorted by last-activity) — demo can hardcode-seed 3-5 conversations
- [x] **INBX-02** [D]: Coach can open a conversation and see message history with basic delivery indicators
- [x] **INBX-03** [D]: Coach can send a free-text WhatsApp message when the conversation is inside the 24-hour window (demo can use a single test member; window check can be relaxed)
- [ ] **INBX-04** [P]: Coach can send an approved WhatsApp template when out-of-window; UI surfaces template picker
- [ ] **INBX-05** [P]: UI surfaces window state indicator (in-window / out-of-window with hours-left) on every conversation
- [x] **INBX-06** [D+P]: **DIFFERENTIATOR** — Member context panel renders inside the conversation showing: next upcoming class, pass balance + expiry, active subscription, recent food adherence summary, total bookings (demo: thin version with at least 2 of these fields populated from real data)
- [x] **INBX-07** [D+P]: Inbox forked from agent-native `templates/mail/` via copy-out into `apps/staff-web/features/inbox/` (NOT edited in `templates/`)
- [ ] **INBX-08** [P]: Filter by unread, search by member name/phone

### Staff Web App — Members (CRM)

- [x] **MEM-01** [D]: Coach can view member directory (demo: 5-10 seeded members visible)
- [x] **MEM-02** [D]: Coach can view member profile with: bookings timeline, pass balance, recent food entries (when calorie counter is in)
- [ ] **MEM-03** [P]: Paginated, searchable by name + phone + email
- [ ] **MEM-04** [P]: Full timeline view: bookings, passes, payments, conversations, food log summary
- [ ] **MEM-05** [P]: Coach can edit member's name, email, tags, and notes
- [ ] **MEM-06** [P]: Member profile shows derived pass balance from `pass_debits` ledger (real-time)
- [ ] **MEM-07** [P]: Member tags + segments (basic segment list; full segment builder is post-v1)

### Staff Web App — Schedule & Bookings (Calendar template adaptation)

- [ ] **SCH-01** [D]: Demo shows a week's worth of pre-seeded class occurrences in a calendar view (forked from agent-native `templates/calendar/`)
- [ ] **SCH-02** [P]: Admin can define a `class_definition` (name, duration, default capacity, default instructor)
- [ ] **SCH-03** [P]: Admin can create a `schedule_rule` (weekly recurrence: day-of-week + local-time + IANA timezone + start/end dates)
- [ ] **SCH-04** [P]: Worker materialises future `class_occurrence` rows from active rules (configurable horizon, e.g. 8 weeks ahead)
- [ ] **SCH-05** [P]: Admin can cancel, reschedule, or override a single `class_occurrence` without affecting the rule
- [ ] **SCH-06** [P]: Admin can swap the instructor on a single occurrence or update its capacity
- [ ] **SCH-07** [P]: Schedule UI renders weekly calendar view in studio's local timezone (DST-correct across boundaries)
- [ ] **BKG-01** [D]: Coach (and member from PWA) can book into a class occurrence — demo can use simple SELECT/INSERT without full atomicity
- [ ] **BKG-02** [P]: **DIFFERENTIATOR** — Coach can book a member from inside the conversation (inline action in inbox)
- [ ] **BKG-03** [P]: Booking transaction is atomic: capacity check + entitlement resolution + pass debit happen in a single SQL transaction; refuses overbooking under concurrent load (verified by 50-concurrent integration test)
- [ ] **BKG-04** [P]: Entitlement resolution priority: active subscription > pass with earliest expiry > prompt-for-drop-in-purchase
- [ ] **BKG-05** [P]: Coach can cancel a booking; if cancelled before the cancellation window, the pass debit is reversed (negative entry in `pass_debits`)
- [ ] **BKG-06** [P]: Late-cancel (after window) forfeits the credit — no charge, no refund (v1 mode; fee-charging deferred to v1.x)

### Staff Web App — Waitlist

- [ ] **WAIT-01** [P]: When a class is at capacity, coach can add member to a FIFO waitlist
- [ ] **WAIT-02** [P]: When a booking is cancelled, worker transactionally promotes the head of the waitlist + sends a `waitlist_offer` WhatsApp template
- [ ] **WAIT-03** [P]: Promotion is idempotent (pg-boss `singletonKey` per cancellation event) — duplicate cancellation events do not double-promote
- [ ] **WAIT-04** [P]: Member can reply to a waitlist offer with a keyword (e.g. "YES") to confirm the booking; classifier resolves against a per-conversation `pending_action` row with TTL
- [ ] **WAIT-05** [P]: If the head doesn't confirm within the TTL, offer expires and worker promotes the next member
- [ ] **WAIT-06** [P]: A reconciliation cron heals waitlist drift hourly

### Staff Web App — Payments

- [ ] **PAY-01** [D]: Demo can generate a Stripe Checkout link for a pass purchase (one-off pack, e.g. 10 credits) and verify success in member profile
- [ ] **PAY-02** [P]: Coach can generate a Stripe Checkout link for a class drop-in (creates 1-credit pass on success — drop-ins flow through Checkout → pass, not a separate code path)
- [ ] **PAY-03** [P]: Coach can generate a Stripe Subscription Checkout link for recurring memberships
- [ ] **PAY-04** [P]: Coach can generate a Stripe Customer Portal link to send to a member for self-service billing
- [ ] **PAY-05** [P]: Refunds happen via Stripe Dashboard (NO refunds UI in staff-web v1)

### Member PWA — Booking + Profile

- [ ] **MEMBR-01** [D]: Member can browse the upcoming week's class schedule in a mobile-optimised view
- [ ] **MEMBR-02** [D]: Member can book a class from the PWA
- [ ] **MEMBR-03** [D]: Member can see their current pass balance and upcoming bookings
- [ ] **MEMBR-04** [P]: Member can cancel a booking from the PWA (respecting the cancellation window)
- [ ] **MEMBR-05** [P]: Member can view their profile (name, email, phone) and edit name/email
- [ ] **MEMBR-06** [P]: PWA shell is installable to home screen on iOS Safari + Android Chrome (Web App Manifest with brand colours + icon)
- [ ] **MEMBR-07** [P]: PWA renders correctly at common mobile widths (375–430px) and tablet (768px+)

### Member PWA — Calorie Counter (built fresh)

- [ ] **CAL-01** [D]: Member can search for a food by name (Open Food Facts as data source) and log it
- [ ] **CAL-02** [D]: Member can scan a barcode (browser MediaDevices API + ZXing or @zxing/browser) and look up the food in Open Food Facts; log it if found
- [ ] **CAL-03** [D]: Member can see daily totals (kcal + protein/carbs/fat) for today
- [ ] **CAL-04** [P]: Custom food entry (manual name + macros) for items not in OFF or USDA
- [ ] **CAL-05** [P]: USDA Food Data Central as fallback when Open Food Facts returns no match
- [ ] **CAL-06** [P]: Daily macro targets calculated from member profile (Mifflin-St Jeor BMR × activity factor, adjusted for goal)
- [ ] **CAL-07** [P]: Recents + favourites for fast re-logging
- [ ] **CAL-08** [P]: Food entries by meal type (breakfast / lunch / dinner / snack)
- [ ] **CAL-09** [P]: `food_items` cache table populated on first external API hit — subsequent lookups don't re-hit OFF/USDA
- [ ] **CAL-10** [P]: Weekly view (kcal + macro trends)
- [ ] **CAL-11** [P]: Open Food Facts attribution shown per ODbL licence requirement

### Member PWA — In-App Agent

- [ ] **AGENT-01** [D]: Member can open a chat sheet from a persistent button in the PWA and exchange messages with the agent
- [ ] **AGENT-02** [D]: Agent has 3 working tools end-to-end: `greet` (intro / capabilities listing), `book_class` (with member confirmation step), `log_food_nl` (parse "I had a chicken caesar at Pret" → food entry)
- [ ] **AGENT-03** [D]: Agent response streams (SSE) to the chat sheet
- [ ] **AGENT-04** [P]: Conversation history persists across sessions (`agent_sessions` table)
- [ ] **AGENT-05** [P]: Per-member memory (`agent_memory` table) — preferences, coaching context
- [ ] **AGENT-06** [P]: Additional tools: `view_schedule`, `cancel_booking`, `view_passes`, `escalate_to_coach` (creates a staff-visible note)
- [ ] **AGENT-07** [P]: Tools are typed wrappers around the same API endpoints the UI uses (single source of truth)
- [ ] **AGENT-08** [P]: Every agent tool call is audited (`audit_log`) with inputs + outputs + actor=agent
- [ ] **AGENT-09** [P]: Anthropic SDK (Claude) used as the LLM; system prompt is per-studio (loaded from env or `agent_skills` table)

### Notifications & Jobs

- [ ] **NOTIF-01** [P]: Worker sends a `class_reminder` template 24h and 2h before each class occurrence (pg-boss `sendAfter`; idempotent by `singletonKey = occurrence_id + offset`)
- [ ] **NOTIF-02** [P]: Worker sends `payment_failed` template when a Stripe `invoice.payment_failed` webhook fires
- [ ] **NOTIF-03** [P]: Worker sends `pass_expiring` template when a pass has ≤7 days until expiry (daily cron)
- [ ] **NOTIF-04** [P]: Worker runs no-show detection after each class occurrence ends; flags bookings where the member was not checked in
- [ ] **NOTIF-05** [P]: Worker expires passes at end-of-day in the studio's local timezone (DST-correct)

### Reply-to-Confirm

- [ ] **RTC-01** [P]: Inbound WhatsApp messages are checked against a `pending_action` row on the conversation; if matched, the action resolves (book / cancel / decline)
- [ ] **RTC-02** [P]: Keyword classifier supports: YES / CONFIRM / OK / 👍 (book/confirm); NO / CANCEL / 👎 (decline)
- [ ] **RTC-03** [P]: Out-of-spec replies during a `pending_action` are treated as freeform (action stays pending until TTL)

### Settings

- [ ] **SET-01** [P]: Admin can view a list of WhatsApp templates (synced from Meta) with approval status
- [ ] **SET-02** [P]: Admin can view Stripe connection status (restricted-key validity check) + key rotation UI
- [ ] **SET-03** [P]: Admin can view system health (queue depth, recent webhook errors, recent send failures)

## Post-v1 Backlog

Captured but not in v1 scope. No "v2" or "v3" labels — these become the next milestone whenever v1 ships.

### Native Mobile (v1.x or v2)
- Native React Native / Expo build of the member surface, replacing PWA. Adds HealthKit, native push, native barcode/camera fidelity. Likely required for the Coach View premium feature.

### Coach View (depends on HealthKit landing)
- Per-class instructor view with member health context (sleep, HRV, training load 7d), food adherence flag, notes from previous classes, goals, PRs.
- The premium-pricing differentiator from PLATFORM-VISION.md.

### CRM Campaigns + Segment Builder
- Filter-tree segment builder (JSON-compiled-to-SQL)
- Campaign composer (WhatsApp templates + scheduled sends)
- Automation flows (trigger → conditions → actions)
- Templates library + send-time analytics

### Knowledge Base (Content template fork)
- Staff-authored articles + member-facing FAQ surface

### Operational Reporting (Analytics template fork)
- Class attendance + occupancy + no-show rate
- Revenue (MRR, drop-in, packs, refunds)
- Member retention cohorts

### Additional WhatsApp surface
- Voice + photo message rendering in inbox
- Late-cancel fee charging (replaces forfeit-only mode)
- Pause subscription action
- Class series / multi-week blocks
- Intro-offer flow with conversion tracking

### Other agent-native template adaptations
- Forms → onboarding intake / waiver capture
- Brain → coach knowledge base / member context retrieval
- Dispatch → studio admin / cross-app orchestration

### bsport Migration Productisation
- Per-tenant migration playbook execution (CSV reconciliation, Stripe processor-to-processor transfer, subscription recreation in destination Stripe, member communication template).
- Lives in PLATFORM-VISION.md §12 as reference.

### A2A (Agent-to-Agent)
- Cross-app signed agent calls (member-app agent tags back-office CRM agent for coach follow-up draft, etc.) — relevant once multiple deployments coexist.

## Out of Scope (v1 hard exclusions)

Explicitly excluded from v1. Reasoning preserved to prevent re-adding under deadline pressure.

| Feature | Reason |
|---------|--------|
| Multi-tenant schema (`studio_id` columns) | Architectural — single-tenant code, multi-tenant deploy. Eliminates tenant-leak bug class. |
| Native mobile apps (Expo/RN/Flutter) | Member surface is web PWA in v1; native deferred to v1.x. No App Store dance, no Fastlane, no Apple Dev Account per studio. |
| HealthKit | Depends on native mobile (Web doesn't expose HealthKit). Deferred. |
| Stripe Connect (OAuth platform model) | Using direct restricted-API-key model. Cleaner; studio owns merchant relationship. |
| Forking OpenNutriTracker (Flutter, GPL v3) | Wrong stack + wrong license for proprietary distribution. Used as inspiration only. |
| Managed WhatsApp providers (Twilio, MessageBird, Vonage) | Direct Meta integration for cost + control. |
| Cross-channel CRM (email/SMS as parallel channels) | WhatsApp-only in v1. Postmark / Twilio / APNs deferred. |
| Card data storage | PCI scope reduction; Stripe owns it. Tokenised IDs only. |
| Sending WhatsApp outside 24h window without template | Meta will suspend the number. Enforced at sender layer (WA-06). |
| Multi-channel campaign engine + segment builder | Post-v1. |
| A2A cross-app signed calls | Post-v1; one workspace / one auth context in v1. |
| Premature extraction into generic "vertical framework" | Build GymOS clean first; observe what's reusable when vertical #2 begins. |
| Member self-service browser portal beyond the PWA | PWA IS the member portal. No separate desktop web member experience. |
| 1:1 personal training appointments | Group classes only — confirmed by customer (FND-07). |
| Spot picking / floor plan / reformer-bike selection | Not in signed customer's class mix. |
| Door access / Kisi integration | Staffed check-in confirmed. |
| In-app retail / POS / merchandise | Studio keeps existing POS. |
| Refunds UI for staff in staff-web | Use Stripe Dashboard. |
| Family / household sub-accounts | Defer until requested. |
| Gift cards | Defer until requested. |
| Referral programs | Defer until requested. |
| Multi-location / franchise support | One studio per deploy. |

## Traceability

Populated by the roadmapper when ROADMAP.md is created. Demo-Sprint vs Production-v1 mapping is intrinsic to each requirement via [D] / [P] / [D+P] markers.

**Counts:**

| Category | Demo | Production | Both | Total |
|---|---|---|---|---|
| Foundation | 2 | 6 | 0 | 8 |
| Schema & Database | 1 | 5 | 1 | 7 |
| Webhook & Worker Spine | 0 | 6 | 0 | 6 |
| Stripe Integration | 1 | 5 | 2 | 8 |
| WhatsApp Integration | 2 | 7 | 0 | 9 |
| Staff Authentication | 1 | 3 | 1 | 5 |
| Member Authentication (PWA) | 1 | 3 | 0 | 4 |
| Per-Customer Deploy | 0 | 4 | 0 | 4 |
| Observability & Hygiene | 0 | 2 | 0 | 2 |
| Inbox Surface | 3 | 3 | 2 | 8 |
| Members (CRM) | 2 | 5 | 0 | 7 |
| Schedule & Bookings | 2 | 11 | 0 | 13 |
| Waitlist | 0 | 6 | 0 | 6 |
| Payments | 1 | 4 | 0 | 5 |
| Member PWA — Booking + Profile | 3 | 4 | 0 | 7 |
| Member PWA — Calorie Counter | 3 | 8 | 0 | 11 |
| Member PWA — In-App Agent | 3 | 6 | 0 | 9 |
| Notifications & Jobs | 0 | 5 | 0 | 5 |
| Reply-to-Confirm | 0 | 3 | 0 | 3 |
| Settings | 0 | 3 | 0 | 3 |
| **Total v1** | **25** | **99** | **6** | **130** |

**Demo Sprint scope:** 25 [D] requirements + the 6 [D+P] (start as stub) = ~31 things to deliver in week 1.
**Production v1 scope:** 99 [P] requirements + harden the 6 [D+P] = 105 things to deliver in weeks 2–9.
**Total v1:** 130 requirements across 20 categories.

(Detailed phase mapping table is in ROADMAP.md.)

---
*Requirements defined: 2026-05-17*
*Last updated: 2026-05-17 — major scope revision (Demo Sprint + Production v1; mobile = PWA; Stripe direct; calorie counter in v1; pg-boss replaces BullMQ)*
