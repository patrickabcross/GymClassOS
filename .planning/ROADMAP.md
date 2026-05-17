# Roadmap: GymOS

## Overview

GymOS v1 is delivered in four phases over ~8 weeks (target ship ≤ 2026-07-15): Phase 0 audits the agent-native templates and de-risks the long-lead integrations (Meta template approvals, mirror of single-maintainer SDK, Vercel × React Router v7 validation); Phase 1a stands up the data foundation (Drizzle schema on Neon, staff auth, per-studio deploy machinery, observability); Phase 1b builds the webhook + worker spine on Fly with Stripe Connect and WhatsApp Cloud API integration (idempotent, atomic, 24h-window-gated); Phase 2 builds the staff product surfaces on top of that spine (inbox + member context, schedule + bookings + passes, waitlist, payments, notifications, reply-to-confirm, settings) and lands the two differentiators that justify the customer signing. Phases 3–5 (mobile, reporting + KB, calorie counter) are out of v1 scope and follow after the first customer is live.

## Phases

**Phase Numbering:**
- Integer phases (0, 1a, 1b, 2): Planned v1 milestone work
- Decimal phases (e.g. 1.1): Reserved for urgent insertions (none yet)

- [ ] **Phase 0: Audit & De-Risk** - Template-by-template audit, customer onboarding readiness, long-lead Meta + SDK + Vercel risks neutralised
- [ ] **Phase 1a: Data Foundation, Auth & Deploy** - Neon schema, staff Better-auth, per-studio deploy script, Pino logger + /healthz
- [ ] **Phase 1b: Webhook + Worker Spine (Stripe + WhatsApp)** - Fly edge-webhooks + worker, idempotent Stripe reducers, WhatsApp inbound + outbound with 24h-window gate
- [ ] **Phase 2: Staff Product Surfaces** - Inbox (+ member context differentiator), schedule + bookings + passes, waitlist, Stripe Checkout links, notifications, reply-to-confirm, settings

## Phase Details

### Phase 0: Audit & De-Risk
**Goal**: Every long-lead-time and architectural-commitment risk is neutralised before product code is written, so Phase 1 can build on solid ground.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08
**Success Criteria** (what must be TRUE):
  1. A reader can open `audit/decision.md` and learn, for each of the 5 agent-native templates, whether GymOS forks-clean, adapts, or builds fresh — with a paragraph of justification per template
  2. A hello-world React Router v7 + Better-auth + Neon page is reachable at the launch customer's staging Vercel URL (proves the MEDIUM-risk framework × host pairing works end-to-end before any product code depends on it)
  3. All five WhatsApp templates (`class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`, `intro_followup`) are submitted to Meta with categorisation locked in, and approval status is visible in Meta Business Manager
  4. `@great-detail/whatsapp` is mirrored to the studio org's GitHub and the project's `package.json` resolves the package from the mirror's git SHA (not npm) — verifiable by `pnpm install` succeeding with npm registry blocked for that one dependency
  5. The launch customer's onboarding checklist is signed off: Meta Business Manager set up, WhatsApp phone number free of 2FA + personal history, class mix confirmed as group-only with staffed check-in (no spot-picking, no 1:1 PT, no 24/7 door)
**Plans**: TBD
**Risks (from PITFALLS.md)**:
- #6 (agent-native fork drift) — addressed by two-remote setup + `MODIFICATIONS.md` from day zero
- #16 (RR v7 × Vercel) — addressed by hello-world validation deploy
- #19 (`@great-detail/whatsapp` single-maintainer) — addressed by mirror + git-SHA pin
- #12 (template categorisation) — addressed by submitting with category locked
- #23 (phone number registration friction) — addressed by onboarding checklist
- #26 (Vitest browser-mode bug) — addressed by Playwright-for-UI test strategy decision
**UI hint**: yes

### Phase 1a: Data Foundation, Auth & Deploy
**Goal**: A staff coach can log in to a deployed staff-web instance, the database has every table required by Phases 1b and 2, and adding a new studio is a single scripted command — all observable in production-like infrastructure, without any external integration code yet.
**Depends on**: Phase 0
**Requirements**: DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, DEP-01, DEP-02, DEP-03, DEP-04, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. A coach can sign in to `apps/staff-web` with email + password via Better-auth, the session survives a browser refresh, and signing out from any page returns the coach to the login screen
  2. An admin user has access to admin-only routes (class definitions, Stripe settings); a coach user attempting the same routes is denied — verifiable in both UI and integration test
  3. Running `scripts/deploy.sh <studio-slug>` against an empty `studios/<studio>/env.yml` deploys all three apps (staff-web → Vercel, edge-webhooks + worker → Fly), fails-fast if any required env var is missing, and produces three reachable URLs at the end
  4. `drizzle-kit generate && drizzle-kit migrate` runs to completion against a fresh Neon project and produces every table listed in DB-01; `drizzle-kit push` is blocked at the script level; a `grep -r "studio_id" packages/db/schema/` returns zero matches
  5. The `pass_debits` ledger refuses to go negative under a 50-concurrent-debit test (Postgres CHECK constraint fires); a `schedule_rule` row stored as `(weekday, local_time, IANA)` materialises a `class_occurrence` correctly across a DST boundary in test
  6. `/healthz` on edge-webhooks returns a JSON document with `webhook_receive_latency_ms`, `queue_depth`, and `last_processed_at` fields populated (zeros / nulls are acceptable, the shape is the contract)
**Plans**: TBD
**Risks (from PITFALLS.md)**:
- #4 (pass-balance race) — addressed by ledger schema + CHECK constraint locked here, before any consumer
- #5 (DST timezone bug) — addressed by two-column rule/occurrence design locked here
- #14 (per-studio config drift) — addressed by deploy script + sops-encrypted `studios/<studio>/env.yml` from N=1
- #15 (`drizzle-kit push`) — addressed by `guard:no-drizzle-push` script
- #10 (Neon driver / pool misuse) — addressed by `db.ts` convention exporting the right driver per runtime
- #22 (PII in logs) — addressed by Pino redaction config (phone, email, card last4)
**UI hint**: yes

### Phase 1b: Webhook + Worker Spine (Stripe + WhatsApp)
**Goal**: Every external event from Stripe or Meta is received, signature-verified, persisted idempotently, and processed by a worker — and every outbound WhatsApp send is gated at the worker layer (never the UI) by the 24-hour window and opt-in checks. Once this phase is done, Phase 2 is "consume the spine."
**Depends on**: Phase 1a
**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, STR-01, STR-02, STR-03, STR-04, STR-05, STR-06, STR-07, STR-08, WA-01, WA-02, WA-03, WA-04, WA-05, WA-06, WA-07
**Success Criteria** (what must be TRUE):
  1. Replaying the same Stripe `checkout.session.completed` event twice via Stripe CLI produces exactly one `payments` row and exactly one pass grant — verifiable by an integration test that asserts row counts before and after the replay
  2. A WhatsApp inbound message sent from a real phone appears in the `messages` table within seconds, with `conversations.last_inbound_at` updated; duplicate webhook deliveries from Meta produce no duplicate `messages` rows (dedup on `(provider_event_type, external_id)`)
  3. Calling `sendMessage()` from the worker with a free-text body for a conversation whose `last_inbound_at` is > 24h old returns a typed `WindowExpiredError` and writes no outbound row to Meta — verifiable by an integration test that time-travels the conversation row
  4. Calling `sendMessage()` for a member with no row in `whatsapp_opt_in` returns a typed `NoOptInError` regardless of window state
  5. Sending a tampered webhook body to `/webhooks/stripe` or `/webhooks/whatsapp` returns 400 before any JSON parsing happens (HMAC verified against raw body) — verifiable by integration test that mutates one byte of the payload after signing
  6. Disconnecting Stripe Connect for the studio fires `account.application.deauthorized` and the worker marks the studio as disconnected; the studio settings page surfaces a re-onboard CTA on next load
**Plans**: TBD
**Risks (from PITFALLS.md)**:
- #1 (24h-window violation → Meta suspension) — single `sendMessage()` chokepoint enforces at call time
- #2 (Stripe webhook non-atomic idempotency) — `webhook_events` insert + business work in one DB transaction; refetch from Stripe API
- #8 (webhooks on Vercel) — receiver lives only on Fly with `min_machines = 1`
- #9 (body parser before HMAC verify) — Hono `c.req.text()` before any JSON parsing
- #11 (WhatsApp status webhook dedup) — ordinal-guarded UPDATE on `messages.status`
- #13 (Stripe app-fee refund + deauth) — `refund_application_fee: true` default + deauth handler
- #17 (WhatsApp opt-in policy) — `whatsapp_opt_in` table + sender-gate refusal
- #19 (single-maintainer SDK) — thin `packages/whatsapp/` adapter so a swap is one-file
- #20 (BullMQ duplicate sends) — idempotent jobs keyed by natural ID
- #25 (H3 body parsing) — webhooks live on Hono, not staff-web; lint rule keeps it that way

### Phase 2: Staff Product Surfaces
**Goal**: A coach can run a full day from staff-web — triage WhatsApp conversations with full member context inline, manage the class schedule, book and waitlist members, send Stripe payment links, and trust that reminders and reply-to-confirm flows fire correctly — and a member can interact with the studio via WhatsApp templates and keyword replies that the system honours end-to-end.
**Depends on**: Phase 1b
**Requirements**: INBX-01, INBX-02, INBX-03, INBX-04, INBX-05, INBX-06, INBX-07, MEM-01, MEM-02, MEM-03, MEM-04, SCH-01, SCH-02, SCH-03, SCH-04, SCH-05, SCH-06, BKG-01, BKG-02, BKG-03, BKG-04, BKG-05, BKG-06, WAIT-01, WAIT-02, WAIT-03, WAIT-04, WAIT-05, WAIT-06, PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, RTC-01, RTC-02, RTC-03, SET-01, SET-02, SET-03
**Success Criteria** (what must be TRUE):
  1. A coach can open a conversation in the inbox and, alongside the message thread, see the member's next upcoming class, current pass balance + expiry, active subscription status, last payment, and lifetime booking count — without leaving the inbox (the differentiator; no competitor surfaces this inline)
  2. From inside a conversation, a coach can book the member into a class occurrence via an inline action and the booking flows through the same atomic capacity-check + pass-debit transaction used by the schedule UI (the second differentiator)
  3. An admin can define a weekly class schedule (definition + rule with day-of-week + local-time + IANA timezone), the worker materialises occurrences 8 weeks ahead, and the schedule UI renders them correctly across a DST boundary without manual intervention
  4. Running 50 concurrent bookings against a 12-seat class results in exactly 12 successful bookings, the rest waitlisted or rejected with "no_credits"; pass balances never go negative; no race produces a duplicate `pass_debits` row
  5. When a booking is cancelled, the head of the waitlist receives a `waitlist_offer` WhatsApp template within the worker's processing window; replying "YES" (or any keyword in RTC-02) within the TTL transactionally confirms their booking; missing the TTL promotes the next member
  6. A coach can generate a Stripe Checkout link for a drop-in, a pack, or a recurring subscription, and on payment success the corresponding pass / subscription state is reflected in the member profile without manual reconciliation
  7. 24h and 2h before each class, members on the booking list receive a `class_reminder` template; re-running the reminder generation job (idempotent by `jobId = occurrence_id + offset`) sends no duplicates
**Plans**: TBD
**Risks (from PITFALLS.md)**:
- #3 (class capacity double-booking) — atomic SQL + 50-concurrent test
- #4 (pass-balance race, flow side) — `SELECT … FOR UPDATE` + ledger insert in same transaction
- #5 (DST in UI / engine) — schedule UI renders in studio-local TZ
- #18 (waitlist auto-promotion race) — synchronous cancel + promote, idempotent `jobId`, reconciliation cron
- #20 (BullMQ duplicate reminders) — idempotent `jobId` per occurrence + offset
- #21 (pass expiry timezone) — end-of-day in studio's IANA TZ
- #24 (polling keeps Neon warm) — push-based invalidation strategy decided in inbox planning
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1a → 1b → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Audit & De-Risk | 0/TBD | Not started | - |
| 1a. Data Foundation, Auth & Deploy | 0/TBD | Not started | - |
| 1b. Webhook + Worker Spine (Stripe + WhatsApp) | 0/TBD | Not started | - |
| 2. Staff Product Surfaces | 0/TBD | Not started | - |

---

*Roadmap created: 2026-05-17*
*Granularity: coarse (4 phases, target plan count 1-3 per phase to be refined at plan-phase time)*
*Coverage: 91 / 91 v1 requirements mapped (100%)*
*Out of v1 scope per PROJECT.md: Phase 3 (mobile), Phase 4 (reporting + KB), Phase 5 (calorie counter), and v1.x quick-wins — these do NOT appear above.*
