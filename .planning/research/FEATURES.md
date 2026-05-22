# Feature Research — GymClassOS

**Domain:** Boutique fitness studio management platform (staff web + WhatsApp + Stripe + member-mobile-integration)
**Researched:** 2026-05-17
**Confidence:** HIGH on the table-stakes set (verified across Mindbody, Glofox, TeamUp, Mariana Tek, PushPress, Pike13, Arketa, Zen Planner, Vibefam, Virtuagym, Wellyx, StudioGrowth, ClassPass); HIGH on the WhatsApp-direct anti-features and rule constraints (verified against Meta's pricing change of 2025-07-01 and the 24h-window mechanics); MEDIUM on exact debit semantics for hybrid pass+membership cases (varies by competitor).

---

## TL;DR for the Roadmap

GymClassOS's competitive moat is **two things**:
1. **WhatsApp as the canonical comms channel for staff↔member**, with a real shared inbox UX (not a Twilio bot, not a notification firehose) — Mindbody/Glofox/TeamUp/Mariana Tek all default to SMS+email and their WhatsApp stories are weak-to-nonexistent.
2. **Member context surfaced inside the conversation** (next class, pass balance, last attendance, payment status) so the coach replies with full context in one screen instead of swivel-chairing between inbox + CRM + scheduler.

Everything else in v1 has to clear the bar: *table stakes that the signed customer will not switch without*. Below is the explicit MoSCoW cut so the roadmap has a knife-edge on what's in v1 vs deferred.

The hardest scope discipline: **resist building Marketing Automation, Branded Member App From Scratch, Multi-Location, Reporting Dashboard, and a Web Member Portal in v1.** Every one is "table stakes" at incumbents and every one will eat the whole 2-month window. The project doc already cuts most of these — this file re-derives why and adds the next layer of cuts.

---

## Feature Landscape

### Table Stakes (Studios Will Not Switch Without These)

These are the "if you don't have it, the customer leaves you on Mindbody" features. Anything missing here is a no-deal at the signed customer.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Class schedule (recurring + one-off + cancel-this-instance)** | Universal at every competitor (Mindbody, Glofox, TeamUp, Mariana Tek, PushPress, Pike13). Recurring weekly schedule with per-instance overrides is the *minimum* a coach needs. | M | Calendar template fork. Must support: weekly recurrence with start/end dates, per-instance cancellation, per-instance instructor swap. Stored as `class_template` (recurrence rule) + materialized `class_instance` rows for the upcoming window — do NOT compute occurrences on the fly per request. |
| **Member-facing class booking with capacity limit** | Universal. "Book a spot" + "9 of 12 spots left" is what members see at every competitor. | M | One-row insert into `booking` with a `UNIQUE (class_instance_id, member_id)` constraint and an atomic capacity check via row-level lock on `class_instance`. Race-condition pitfall — see PITFALLS. |
| **Waitlist (auto-promote on cancel)** | Standard since 2010 at boutique studios. Vibefam, StudioGrowth, Mariana Tek all auto-promote within 15 minutes of a cancel. A waitlist that doesn't auto-promote is functionally useless. | M | FIFO waitlist table; on cancellation, transactionally promote head-of-waitlist and trigger WhatsApp notification. Member must confirm acceptance (some studios) or auto-confirms with opt-out (others) — pick auto-confirm with a "decline" button in WhatsApp for v1, it's simpler. |
| **Pass / package balance with debit-on-book** | Universal. The dominant non-membership pricing is "buy a 10-pack, decrement on each booking". Sources: ClassPass-style credits, Mariana Tek packs, Glofox class packs, TeamUp punch cards. | M | `pass` table with `credits_remaining`, `expires_at`. Decrement happens at booking time inside the same transaction as the booking insert. Refund credit on cancel-before-window. **The hard parts are expiry, refund-on-late-cancel, and "which pass to debit when member has multiple" — see ARCHITECTURE for the priority rule.** |
| **Recurring membership subscription (monthly auto-charge)** | Universal. The membership business model is what these studios run on. Stripe Subscriptions is the canonical implementation. | M | `stripe.subscriptions.create()` with monthly price; webhook `invoice.paid` / `invoice.payment_failed` drives state changes. Idempotent handlers are non-negotiable per project constraints. |
| **Drop-in single-class purchase (one-off)** | Universal. Members without a pass or membership pay per class. Stripe Checkout or Payment Intents. | S | Stripe Checkout link, success webhook creates a 1-credit pass that's immediately debited by the booking. Simpler than treating drop-in as a separate code path. |
| **Cancel booking with cancellation window** | Universal. "Cancel up to 12h before class, no penalty" is the standard at every studio. Inside the window = no refund. | S | Stored on `class_template.cancellation_window_hours`; booking-time `cancel()` checks `class_instance.start_at - now > window`. |
| **Late-cancel / no-show fee or pass-forfeit** | Universal. StudioGrowth, Mariana Tek, Glofox all enforce. Reduces no-shows by ~75% per documented case studies. Without it, the studio bleeds capacity. | M | Two enforcement modes, pick ONE for v1: (a) forfeit the pass credit (no Stripe charge — simpler), or (b) charge a $X late-cancel fee via Stripe. Pick (a) for v1 because it doesn't require storing a payment method on file beyond what the subscription/checkout already captured. |
| **WhatsApp inbound conversation with member** | The customer signed *because* of WhatsApp-first. Meta direct = locked-in by project. | L | Webhook receiver (Hono on Fly) → signature-verify → upsert `member` by phone number → insert `message` → notify staff via SSE or polling. The inbound side is straightforward; the outbound side (next row) is where the complexity lives. |
| **WhatsApp outbound message from staff inbox (free-text, in-window)** | Universal expectation once WhatsApp is the channel. Coach types in the inbox, member gets a WhatsApp message. | M | Send via Cloud API. **Hard constraint:** must reject sends outside the 24h window unless they go via an approved template. Enforce at the sender layer (database trigger or service-layer guard), not just UI greying. |
| **WhatsApp outbound template message (out-of-window)** | Required for: class reminders, payment failed, pass expiring, waitlist spot offered. These all fire outside the 24h window in practice. | M | Maintain a small library of approved templates: `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`, `intro_followup`. Template approval takes up to 48h per Meta — submit the v1 set in Phase 0 so they're approved by ship. |
| **Member directory / search by name or phone** | Universal. Every staff app has one. | S | Index on `members(name, phone)`; full-text search in Postgres with `pg_trgm` for typo tolerance. |
| **Member profile with attendance + payment + comms history** | Universal in CRM features across StudioGrowth, FLiiP, Pipedrive Gym CRM, Mindbody. The single-pane-of-glass timeline. | M | Single member profile route showing: bookings (past + upcoming), passes (active + used), Stripe payments, WhatsApp message timeline. **This is also the differentiator surface** — when accessed *from* a conversation, it's the "context panel" that makes coaches faster. |
| **Coach / instructor assignment to class** | Universal. A class without an instructor isn't a class. | S | FK from `class_instance.instructor_id → coach.id`. Per-instance override on top of `class_template.default_instructor_id`. |
| **Staff login with role (admin vs coach)** | Universal. Coaches see schedule + inbox; admins additionally see billing + member-level edits. | S | Better-auth (already in agent-native). Two roles is enough for v1 — full RBAC is overkill. |
| **Stripe payment-failed handling** | Required by every subscription business. Card declines, expired cards, insufficient funds — all happen weekly at studios with hundreds of members. | M | `invoice.payment_failed` webhook → mark subscription `past_due` → fire WhatsApp template asking member to update payment → on `customer.subscription.updated` to `unpaid` after dunning fails → suspend bookings. |
| **Time-zone correct class display** | Boutique studios are single-location; classes are always in the studio's local TZ. Members in other TZs (e.g., traveling) get confused if not handled. | S | Store class times as `timestamp with time zone` (Postgres) anchored to studio TZ stored in env. Use `date-fns-tz` (already in STACK) for render. |

### Differentiators (Why a Studio Picks GymClassOS Over Mindbody)

These are the features that make GymClassOS *better* than the incumbents for the signed customer, not just *equal*. Pick the smallest set that the signed customer will actually value — each one costs days.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Member context panel inside the WhatsApp conversation** | The signature feature. When the coach opens a thread, the right rail shows: next booked class, pass balance, last 5 attendances, subscription status, any flags (late-cancel streak, payment past_due). **No competitor does this** — they all force a swivel-chair to a separate member profile. | M | Same data as the member-profile route, rendered as a side panel in the inbox. Reuses the same queries — just a UI assembly. Re-fetches on conversation open. |
| **WhatsApp as the *canonical* notification channel (not SMS/email)** | Every competitor sends class reminders, waitlist offers, payment-failed, pass-expiring via SMS+email. GymClassOS sends them via WhatsApp — 98%+ open rates, conversational reply path back into the inbox. The signed customer's members already live in WhatsApp. | M | Just a routing decision once the template library + sender exist. The infra cost is the template approvals and the rate-limit-aware sender queue (BullMQ on Fly per STACK). |
| **Reply-to-confirm / reply-to-cancel for waitlist offers and reminders** | When a member gets a WhatsApp "Spot opened in 6pm cycle, reply YES to confirm" message, they can just reply YES. The inbound webhook parses it and confirms the booking. No app open, no link tap. This is the *real* unlock of WhatsApp-as-channel. | M | Lightweight inbound message classifier on a per-conversation `pending_action` row. Don't try to build a generic NLP layer for v1 — just match exact keywords (`YES`, `CONFIRM`, `1`, `Y`, language-localised). When `pending_action.expires_at < now`, ignore and fall through to inbox. |
| **Coach can book a member into a class from the WhatsApp conversation** | Member asks "can you put me in tomorrow's 6pm" — coach hits a "Book into class" action in the conversation, picks the class, books it, confirms back via the same thread. No swivel-chair to scheduler. | M | An inline action in the inbox UI. Reuses the same booking transaction. Sends a WhatsApp template confirmation if message is out of window, or free-text confirmation if in. |
| **Studio-branded inside the customer's existing mobile app (Phase 3+)** | Member-facing surface lives inside the studio's existing branded RN app — no separate "GymClassOS app" to install. Mariana Tek and Glofox do this with their *own* branded apps; GymClassOS goes one better by embedding into what the studio already ships. | L | Post-v1. Phase 3. Defer all design work until v1 ships and the audit of the customer's RN repo is done. |
| **Single-tenant deploy = per-studio data isolation by infrastructure, not by query filter** | A common boutique-studio concern: "my member data is mixed with 10,000 other studios in Mindbody's DB". GymClassOS = one Neon project, one Vercel deploy, one Fly app per studio. Whole tenants can be backed up, exported, restored, deleted by infra commands. | — (architectural, not a feature) | This is in the STACK already. It surfaces as a *sales talking point*, not a feature with code. |
| **Coach voice/photo replies** | Coaches frequently respond in voice messages or photos at boutique studios (more personal). WhatsApp's media support is native — competitors using SMS lose this entirely. | S | Inbound: store media URL from webhook payload, fetch via Graph API media endpoint, store in object storage (S3-compatible, can be on Fly Volumes for v1). Outbound: upload to Graph API then send the media ID. **Optional for v1** — text-only inbox ships day 1, media added once text path is stable. |

### Anti-Features (Commonly Requested, Specifically NOT for v1)

This is the ruthless cut list. Every item here is "yes that's in Mindbody, no we're not building it in v1". Each has a reason and an alternative.

| Anti-Feature | Why Requested | Why Problematic (v1) | Alternative |
|---|---|---|---|
| **Branded mobile app built from scratch** | "Mindbody has it, Glofox has it, Mariana Tek's whole pitch is the branded app." | Already cut by project constraint — mobile = update to customer's existing RN app, no new App Store / Play Store submission. Building a fresh branded app is 4+ weeks of submission + review friction *per studio*. | Phase 3: integrate into the signed customer's existing RN app. No Apple Developer Account flow. |
| **Multi-location / franchise management** | "Studios grow, they want one dashboard for 3 locations." | The signed customer is one location. Multi-location forces every entity to gain a `location_id` and every query to scope by it. With single-tenant-per-deploy, multi-location = multi-deploy = a different product. | Defer until a second location at the same customer signs the requirement. Then revisit *whether it's separate deploys or a real location entity*. |
| **Web member portal / self-service site** | "Members want to manage on the web too." | Cut by project constraint — member surface is mobile only in v1. A web portal doubles the auth + UI surface. | Members use the studio's existing branded mobile app (Phase 3+). For v1, members interact via WhatsApp + Stripe Customer Portal (which is hosted by Stripe — free). |
| **Marketing automation / drip campaigns / lead nurture** | "Mariana Tek, Mindbody, Glofox all have it. It drives revenue." | Building campaign sequencing, trigger conditions, A/B tests, audience segments is 3-4 weeks of solo work. The signed customer didn't sign for this. | v1 ships hand-crafted templates (class reminder, waitlist offer, payment failed, pass expiring). Post-v1 layer adds the orchestration. |
| **Operational reporting dashboard with charts** | "I need to see revenue, attendance, retention metrics." | Already in project — Analytics template is Phases 3-5. A read-replica + a Metabase / Grafana panel can serve interim needs in Phase 2 if pressed. | Phase 4 (Analytics template fork). Until then, raw SQL access via Neon for the studio owner. |
| **Knowledge base / content CMS** | "Class descriptions, policies, FAQs need a home." | Already Phases 3-5 — Content template fork. v1 stores class descriptions as a `description` column on `class_template`; that's enough for booking-flow display. | Phase 4 (Content template fork). |
| **Calorie counter / nutrition tracking** | Already in project — explicitly Phase 5. | OpenFoodFacts integration + LLM-fill + meal logging is its own subproduct. Zero connection to the v1 booking/comms loop. | Phase 5 (Calorie tracker template fork). |
| **Spot picking / floor-plan / reformer selection** | Mariana Tek's signature feature; very loud in the cycling/Pilates segment. | Floor-plan editor + per-spot booking + spot-swap logic is L-complexity on its own. The signed customer's class types likely don't need it (verify in Phase 0 / requirements). | If the signed customer needs it: defer to Phase 3+ as a feature flag. v1 capacity-only. **Flag for Phase 0 audit**: confirm with customer whether reformer/bike studios are in their class mix. |
| **Door access control / Kisi integration / QR check-in hardware** | Standard at 24/7 gyms. Kisi integrates with Mindbody, Glofox, TeamUp. | The signed customer is a boutique studio (likely staffed check-in, not 24/7 access). Even if eventually wanted, this is a hardware integration with per-customer setup — not v1. | Confirm staffed-only with signed customer (Phase 0). If yes, defer indefinitely. Manual check-in by staff via the inbox or schedule view is enough for v1. |
| **In-app retail / merch / smoothie POS** | Standard at Glofox, PushPress, Mariana Tek. | Whole orthogonal subsystem: SKU catalog, inventory, POS UI, tax handling, receipt printer integration. Multi-week build. | If the studio sells retail today, they keep using their existing POS (Square is the typical answer). GymClassOS does *services* in v1, not goods. |
| **Personal training / 1:1 appointment booking with per-coach calendars** | Standard. Mindbody, TeamUp, Pike13 all do appointment booking alongside class booking. | A whole second booking primitive (`appointment` vs `class`), with per-coach availability rules, buffer times, double-booking prevention. | If the signed customer offers 1:1, defer to Phase 3+. v1 = group classes only. **Flag for Phase 0**: confirm class-only with customer. |
| **Multi-currency / international tax / VAT compliance** | Required for international studios. | Stripe handles currency natively but tax compliance is real work (Stripe Tax adds a config layer). | Whatever currency + tax setup the signed customer's Stripe account already has — inherit it via Stripe Connect OAuth. Don't add new tax logic. |
| **Push notifications outside WhatsApp** | "What if WhatsApp is down? What if the member doesn't have WhatsApp?" | WhatsApp-first is the strategic bet. Adding fallback SMS / push doubles the comms infra. | Document the bet. If the signed customer's segment doesn't have WhatsApp coverage, this is the wrong customer / wrong project. |
| **Member self-cancel of recurring membership from the app** | Standard at all consumer-facing tools. | Members cancel via Stripe Customer Portal (hosted by Stripe — free, no build cost). | Send a Stripe Customer Portal link via WhatsApp template when member asks. Zero code. |
| **Refunds UI for staff** | Standard. | Stripe Dashboard already provides this. Building a refunds UI inside GymClassOS = duplicating Stripe's UX. | Staff use Stripe Dashboard for refunds in v1. GymClassOS shows refund events on the member profile (read-only) via the `charge.refunded` webhook. |
| **Email marketing / newsletter sending** | Standard. | A whole second channel + IP warming + deliverability work + unsubscribe-management compliance (CAN-SPAM, CASL). | WhatsApp is the channel. Studio can use Mailchimp/Beehiiv externally if they need email broadcast. |
| **Real-time presence / "who's in the studio right now"** | Asked by tech-forward studio owners. | Requires check-in hardware or manual staff toggling per-member-per-class. Limited operational value vs cost. | Booked-but-not-yet-cancelled count on a class instance is the proxy. |
| **AI-suggested replies in the inbox** | Trendy 2026 feature. | Tempting because the parent project is `agent-native`. But hooking up an LLM, prompt engineering for studio voice, handling hallucinations, getting the customer comfortable — multi-week. | Defer to Phase 3+. v1 inbox is plain. The architectural choice of `agent-native` keeps the door open without paying the cost now. |
| **Inbound voice calls** | A Glofox competitive miss (called out in reviews — no 24/7 AI receptionist). | Voice is a different infra stack (Twilio Voice, IVR). Not in scope. | Out of scope permanently. WhatsApp voice messages cover the conversational use case. |
| **Booking via SMS or web form** | Standard at TeamUp, Pike13. | Two more code paths (`Booking via SMS` and `Booking via web form`) for the same primitive. | v1 booking paths: (a) staff books via web app, (b) member books via WhatsApp reply ("YES to confirm" pattern), (c) member books via the customer's existing RN app starting Phase 3. |
| **Family / household / sub-account memberships** | Common at family-oriented studios. | A second entity (`household`) with billing on the parent, bookings on the children. Real complexity. | Out of v1. If the signed customer needs it, defer to a real requirement in Phase 3+. |
| **Gift cards** | Common. | A whole second pricing primitive. | Out of v1. Stripe issues gift cards via Customer Balance if desperately needed; defer. |
| **Referral programs / member-get-member tracking** | Common. | Tracking codes + attribution + reward fulfillment = real work. | Out of v1. |
| **In-product analytics for member-facing app (heatmaps, funnel)** | Common at growth-stage SaaS. | Not relevant — member-facing surface in v1 is WhatsApp, which Meta owns the analytics for. | Use Meta Business Manager's WhatsApp insights for v1. |

---

## Feature Dependencies

```
WhatsApp Inbound Webhook (table-stakes)
  ├──requires──> Meta WhatsApp Business Account + verified business + phone number
  ├──requires──> Public HTTPS endpoint with stable IP (Fly app per STACK)
  └──requires──> Signature verification (built into @great-detail/whatsapp)

WhatsApp Outbound Free-text (table-stakes)
  └──requires──> 24h-window check against last_inbound_message_at on conversation
        └──requires──> Conversation entity tracking last_inbound_message_at

WhatsApp Outbound Template (table-stakes)
  └──requires──> Approved templates in Meta Business Manager (up-to-48h approval)
        └──requires──> Template content + variables defined ahead of submission

Class Booking (table-stakes)
  ├──requires──> Class Schedule (table-stakes) — class_instance must exist
  ├──requires──> Member entity (created via WhatsApp inbound or staff add)
  └──requires──> Capacity check (atomic with insert)

Pass Debit-on-Book (table-stakes)
  ├──requires──> Class Booking
  ├──requires──> Pass entity with credits_remaining > 0 and not expired
  └──requires──> Priority rule: which pass to debit when member has multiple
                  (recommended: earliest expiry first, then smallest balance)

Membership Subscription (table-stakes)
  ├──requires──> Stripe Connect OAuth onboarded for the studio's account
  ├──requires──> Stripe customer entity for the member
  └──requires──> Idempotent webhook handlers for invoice.* and customer.subscription.*

Drop-in Single-Class Purchase (table-stakes)
  ├──requires──> Stripe Connect OAuth onboarded
  └──requires──> checkout.session.completed webhook → creates 1-credit pass

Late-Cancel / No-Show Enforcement (table-stakes)
  ├──requires──> Cancellation window stored on class_template
  ├──requires──> Cancel-booking action that checks window
  └──requires──> No-show detection (post-class scheduled job — pg-boss worker)
        └──requires──> A "class ended, mark no-shows" job per class_instance.start_at

Waitlist Auto-Promote (table-stakes)
  ├──requires──> Cancel-booking transaction
  ├──requires──> WhatsApp Outbound Template ("spot opened, reply YES")
  └──requires──> Inbound message classifier for reply-to-confirm

Member Context Panel in Inbox (DIFFERENTIATOR)
  ├──requires──> Conversation entity linked to member
  ├──requires──> Member profile data (bookings, passes, payments)
  └──enhances──> WhatsApp Inbound Conversation

Coach-Books-Member-From-Conversation (DIFFERENTIATOR)
  ├──requires──> Member Context Panel (already shows next class etc.)
  ├──requires──> Class Booking transaction reusable from inbox UI
  └──requires──> WhatsApp Outbound confirmation (in-window free-text or template)

Reply-To-Confirm (DIFFERENTIATOR)
  ├──requires──> Inbound message classifier (keyword match)
  ├──requires──> pending_action entity attached to conversation
  └──requires──> Action handlers: confirm_booking, decline_booking, confirm_waitlist

Class Reminders via WhatsApp (table-stakes per industry; ours via WhatsApp)
  ├──requires──> WhatsApp Outbound Template
  ├──requires──> Scheduled job per booking (e.g., 24h-before and 2h-before)
  └──requires──> pg-boss `sendAfter` delayed-job for scheduling
```

### Dependency Notes

- **Pass debit and Subscription billing share the same "what entitles this booking" question.** Recommend a single `entitlement` resolver at booking time: subscription (if active + class type is included) > pass with earliest expiry > prompt for drop-in purchase. This avoids a tangle of `if/else` between class types.
- **Idempotent Stripe webhook handlers gate every paid feature.** The Stripe Connect OAuth flow, subscription creation, drop-in checkout, and dunning all depend on this being right. Get it right *first*, then build features on top.
- **WhatsApp template approvals are calendar dependencies, not engineering dependencies.** Submit `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`, `intro_followup` templates to Meta in Phase 0 (before they're needed) so they're approved by Phase 2 ship.
- **Reply-to-confirm conflicts with free-text inbox replies.** If a member types "yes" in the middle of a normal conversation, the classifier might fire a confirmation. Solution: `pending_action` has a TTL (e.g., 1 hour) and is scoped to a specific offered action. Outside that window, "yes" is just a message.
- **Coach-books-from-conversation depends on the member context panel existing first.** Both differentiators ship together or neither does.

---

## MVP Definition

### Launch With (v1 — Phases 0-2, ship by ~2026-07-15)

The *narrowest* set that makes the signed customer's day-to-day work. Re-derived from the project's "Active" requirements with explicit feature-level granularity.

**Onboarding / setup (one-time per studio deploy):**
- [ ] Studio config: name, timezone, default cancellation window, default class capacity
- [ ] Stripe Connect OAuth flow for the studio's existing account
- [ ] Meta WhatsApp Business Account connection: phone number ID, business account ID, webhook URL registered
- [ ] Approved template library: `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`
- [ ] First admin user invite (Better-auth)

**Member lifecycle:**
- [ ] Member auto-created from inbound WhatsApp message (phone number is the natural key)
- [ ] Member manually addable by staff (name + phone + email)
- [ ] Member profile route with: bookings (past + upcoming), passes, payments, message timeline
- [ ] Member directory with search (name, phone)

**Class scheduling:**
- [ ] Class template: name, description, default capacity, default instructor, recurrence (weekly), cancellation window hours
- [ ] Class instance materialisation (pg-boss scheduled job to roll the window forward weekly)
- [ ] Per-instance: cancel, swap instructor, change capacity
- [ ] Calendar view (week + day, from agent-native Calendar template)

**Booking + waitlist:**
- [ ] Book member into class (staff action from member profile or class detail)
- [ ] Atomic capacity check + entitlement check + pass debit (or drop-in upsell) in one transaction
- [ ] Cancel booking (refund credit if before window, forfeit if inside window)
- [ ] Waitlist join (when class full); auto-promote on cancel; WhatsApp offer with reply-to-confirm

**Payment / passes / subscriptions:**
- [ ] Pass purchase via Stripe Checkout (admin generates link or sends via WhatsApp)
- [ ] Drop-in single-class purchase via Stripe Checkout (creates 1-credit pass)
- [ ] Recurring membership via Stripe Subscription (admin sets up the price, sends Checkout link)
- [ ] Stripe webhook handlers for: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`
- [ ] Subscription status visible on member profile; payment-failed triggers WhatsApp template

**WhatsApp inbox (staff web app):**
- [ ] Conversation list (left rail), sorted by last activity
- [ ] Conversation view (center), threaded
- [ ] Member context panel (right rail) — next class, pass balance, subscription status, recent attendance
- [ ] Send free-text (in-window only — UI disables and explains when out)
- [ ] Send approved template (out-of-window)
- [ ] Inbound webhook → message stored → conversation surfaces in inbox

**Differentiator surface:**
- [ ] Coach can "Book into class" from a conversation (inline action)
- [ ] Reply-to-confirm for waitlist offers
- [ ] WhatsApp template for class reminders (24h-before, 2h-before)

**No-show / late-cancel:**
- [ ] No-show detection job (runs N minutes after class start)
- [ ] Late-cancel = forfeit pass credit (v1 mode; defer fee charging)
- [ ] No-show count visible on member profile

### Add After Validation (v1.x — first weeks post-launch, before Phase 3)

Things to hold until the customer reports actual pain.

- [ ] **Voice + photo message support** in the inbox — trigger: customer says "members keep sending voice notes". Add inbound media fetch + storage + outbound media send. ~3 days.
- [ ] **Late-cancel fee charging** (replace forfeit-only mode) — trigger: customer wants $X fee. Add Stripe Charges on stored payment method. ~2 days.
- [ ] **Stripe Customer Portal link generator** — trigger: members ask to update card. Wire a "send portal link" action in the inbox. ~1 day.
- [ ] **Class series / blocks (multi-week)** — trigger: customer runs a 6-week beginner series. Add a `class_series` parent linking N `class_instance`s sold as one product. ~3 days.
- [ ] **Pause subscription** — trigger: member goes on vacation. Wire `subscription.pause` from inbox. ~1 day.
- [ ] **Intro offer flow** — trigger: customer wants paid intro tracked separately. Add an `intro_pass` variant of pass with conversion-tracking on next purchase. ~3 days.

### Future Consideration (Post-v1, Phases 3-5)

Already documented in PROJECT.md but listed here for completeness as feature scope.

- [ ] **Mobile features in customer's RN app** — class browser, booking, pass balance, profile, push notifications (Phase 3).
- [ ] **Operational reporting** — revenue, attendance, retention, instructor performance (Phase 4, Analytics template fork).
- [ ] **Knowledge base** — staff playbook + member-facing FAQ (Phase 4, Content template fork).
- [ ] **Calorie counter** — meal logging, OpenFoodFacts lookup, LLM-fill for natural language (Phase 5, Calorie tracker template fork).
- [ ] **Spot picking / floor plan** — only if signed customer or future studio actually needs it (reformer / bike studios).
- [ ] **Marketing automation / drip sequences** — once the manual template flow is stable and the studio asks for orchestration.
- [ ] **AI-suggested replies / draft assist** — leverage the `agent-native` foundation once the inbox is in production use.
- [ ] **Multi-location** — only if the signed customer opens a second location AND wants unified ops. Otherwise: a second deploy.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| WhatsApp inbound webhook | HIGH | M | **P1** |
| WhatsApp outbound free-text (in-window) | HIGH | M | **P1** |
| WhatsApp outbound template (out-of-window) | HIGH | M | **P1** |
| Class schedule (template + instance materialisation) | HIGH | M | **P1** |
| Class booking with capacity + atomic entitlement | HIGH | M | **P1** |
| Waitlist auto-promote with reply-to-confirm | HIGH | M | **P1** |
| Pass purchase + debit-on-book | HIGH | M | **P1** |
| Drop-in single-class purchase | HIGH | S | **P1** |
| Recurring membership (Stripe Subscription) | HIGH | M | **P1** |
| Cancel-with-window + late-cancel forfeit | HIGH | S | **P1** |
| No-show detection (post-class job) | HIGH | S | **P1** |
| Member profile (bookings/passes/payments/comms) | HIGH | M | **P1** |
| Member directory + search | MEDIUM | S | **P1** |
| Member context panel inside conversation (DIFFERENTIATOR) | HIGH | M | **P1** |
| Coach-books-member-from-conversation (DIFFERENTIATOR) | HIGH | M | **P1** |
| Class reminders via WhatsApp template | HIGH | S | **P1** |
| Staff login + role (admin vs coach) | HIGH | S | **P1** |
| Stripe webhook handlers (the named set) | HIGH | M | **P1** |
| Stripe Connect OAuth onboarding | HIGH | S | **P1** |
| Voice + photo messages in inbox | MEDIUM | S | P2 |
| Late-cancel **fee charging** (vs forfeit-only) | MEDIUM | S | P2 |
| Stripe Customer Portal link sending | MEDIUM | XS | P2 |
| Pause subscription | MEDIUM | XS | P2 |
| Class series / multi-week blocks | MEDIUM | S | P2 |
| Intro-offer tracking + conversion | MEDIUM | S | P2 |
| Mobile features in customer's RN app | HIGH | L | P2 (Phase 3) |
| Operational reporting dashboard | MEDIUM | L | P3 (Phase 4) |
| Knowledge base | LOW | M | P3 (Phase 4) |
| Calorie counter | MEDIUM | L | P3 (Phase 5) |
| Spot picking / floor plan | LOW (for this customer) | L | P3 (defer) |
| Marketing automation orchestration | MEDIUM | L | P3 |
| AI-suggested replies | MEDIUM | M | P3 |
| Multi-location / franchise | LOW (for this customer) | XL | P3 (probably never) |
| Branded mobile app built-from-scratch | LOW | XL | **OUT OF SCOPE permanently** |
| Web member portal | LOW | L | **OUT OF SCOPE for v1** |
| Door access / Kisi integration | LOW | M | **OUT OF SCOPE** unless customer asks |
| Retail / POS / merch | LOW | L | **OUT OF SCOPE** — use Square externally |
| 1:1 personal training appointments | LOW (for this customer) | M | **OUT OF SCOPE for v1** |
| Inbound voice calls / IVR | LOW | XL | **OUT OF SCOPE permanently** |
| Email marketing channel | LOW | M | **OUT OF SCOPE** — WhatsApp is the channel |

**Priority key:**
- **P1**: Must ship in v1 (Phases 0-2, ~2026-07-15)
- **P2**: Add in v1.x post-launch as the customer reports concrete pain
- **P3**: Phase 3+ deferred — covered by the agent-native templates not yet adapted

---

## Competitor Feature Analysis

| Feature | Mindbody | Glofox | TeamUp | Mariana Tek | PushPress | Pike13 | **GymClassOS (v1)** |
|---|---|---|---|---|---|---|---|
| Class schedule + booking | Yes (clunky UI) | Yes | Yes | Yes (high-end UX) | Yes | Yes | **Yes (Calendar template fork)** |
| Waitlist auto-promote | Yes | Yes | Yes | Yes (≤15min fill) | Yes | Yes | **Yes** |
| Pass / class pack | Yes | Yes | Yes (punch card) | Yes (pack) | Yes | Yes | **Yes** |
| Recurring membership | Yes | Yes | Yes | Yes | Yes | Yes | **Yes (Stripe Subscription)** |
| Drop-in purchase | Yes | Yes | Yes | Yes | Yes | Yes | **Yes (Stripe Checkout → 1-credit pass)** |
| Late-cancel / no-show fees | Yes | Yes | Yes | Yes | Yes | Yes | **Yes (forfeit credit in v1; fee in v1.x)** |
| WhatsApp as primary comms | NO (SMS+email) | NO (SMS+email; some WA via Twilio) | NO | NO | NO | NO | **YES — direct Meta Cloud API** |
| Shared inbox UX for WhatsApp | NO | Limited | NO | NO | NO | NO | **YES — full inbox with member context panel** |
| Reply-to-confirm via messaging | Limited (SMS) | Limited | NO | NO | NO | NO | **YES — WhatsApp keyword classifier** |
| Member context inside conversation | NO (separate CRM view) | NO | NO | NO | NO | NO | **YES — DIFFERENTIATOR** |
| Branded member mobile app | Yes (paid add-on) | Yes (core) | Yes ($89/mo add-on) | Yes (signature feature) | Yes | Limited | **No (Phase 3: integrate into customer's existing RN app)** |
| Spot picking / floor plan | Limited | NO | NO | Yes (signature feature) | NO | NO | **NO (defer; not in scope unless customer needs)** |
| Multi-location | Yes | Yes (enterprise tier) | Yes | Yes | Yes (higher tier) | Yes | **NO (single-tenant deploy model)** |
| Door access / hardware | Yes (via integrations) | Yes (Kisi) | Yes (Kisi) | Yes | Limited | Limited | **NO** |
| Retail POS | Yes | Yes | Limited | Yes | Yes | Yes | **NO (use external POS)** |
| Marketing automation | Yes (paid tier) | Yes (paid tier) | Limited | Yes (Growth tier) | Yes | NO | **NO in v1 (template library + hand-fire only)** |
| Operational reporting | Yes (paid tier) | Yes | Yes | Yes (Premium tier) | Yes | Yes | **NO in v1 (Phase 4)** |
| Per-month pricing | $159-$595+ | $100-$600+ | Scales with members | $$$$ | $159-$559 + free tier | $139-$249 | **Internal cost only** |

**Pattern:** Every incumbent does the same broad feature set, differentiated by polish (Mariana Tek), price-per-member (TeamUp), all-in-one breadth (Mindbody), or vertical-fit (Glofox for boutique). The whitespace where GymClassOS competes is **conversational channel + context**, not feature breadth. Trying to beat Mindbody on feature breadth in 2 months is suicide; not trying to is the strategy.

---

## Sources

**Competitor analysis (web-researched 2026-05-17):**
- [Top 5 Mindbody Alternatives for Studio Management in 2026 — Vibefam](https://vibefam.com/top-5-mindbody-alternatives-for-studio-management-in-2026/)
- [Top 10 Mariana Tek Alternatives & Competitors — G2](https://www.g2.com/products/mariana-tek/competitors/alternatives)
- [Mariana Tek vs Mindbody — Xplor Mariana Tek](https://www.marianatek.com/mariana-tek-vs-mindbody/)
- [Best Fitness Studio Software for 2026: Top 15 Platforms — StudioGrowth](https://studiogrowth.com/best-fitness-studio-software/)
- [Best Gym & Fitness Studio Software 2026 — Zenoti](https://www.zenoti.com/thecheckin/best-fitness-gym-software-2026)
- [Mindbody vs Glofox: I Used Both — StudioGrowth](https://studiogrowth.com/mindbody-glofox/)
- [Glofox vs Mindbody — Wellyx](https://wellyx.com/comparison/glofox-vs-mindbody/)
- [Compare ABC Glofox vs PushPress — Capterra](https://www.capterra.com/compare/136861-172781/Glofox-vs-PushPress)
- [Switching from Glofox to PushPress — PushPress](https://www.pushpress.com/blog/switching-from-glofox-to-pushpress)
- [Mariana Tek for Pilates / Cycling Studios (spot picking)](https://www.marianatek.com/pilates-studio-software/) and [indoor cycling](https://www.marianatek.com/indoor-cycling-studio-software/)
- [Mariana Tek vs Glofox](https://www.marianatek.com/mariana-tek-vs-glofox/)
- [Fitness Studio Software with Automated Late Cancellation Fees — StudioGrowth](https://studiogrowth.com/fitness-studio-software-late-cancellation-fees/)
- [How to Reduce No-Shows in Pilates & Yoga Studios 2026 — Vibefam](https://vibefam.com/how-to-reduce-no-shows-in-pilates-yoga-studios-2026-guide/)
- [Studio Booking Software — Glofox](https://www.glofox.com/blog/studio-booking-software/)
- [Best Fitness Class Scheduling Software — Glofox](https://www.glofox.com/blog/fitness-class-scheduling-software/)
- [How ClassPass Credits Work — ClassPass](https://classpass.com/blog/how-classpass-credits-work/)
- [Fitness CRM for boutique studios — StudioGrowth](https://studiogrowth.com/features/fitness-crm/)
- [How to Use Gym CRM Software to Keep Members Longer — FLiiP](https://myfliip.com/blog/how-to-use-gym-crm-software-to-keep-members-longer-a-simple-5-step-guide/)
- [Top Gym CRM — Pipedrive](https://www.pipedrive.com/en/industries/gym-crm)
- [Stop No-Shows: Proven Tactics — WellnessLiving](https://www.wellnessliving.com/blog/stop-no-shows-proven-tactics-for-fitness-studios/)
- [Best Gym Check In System — Glofox](https://www.glofox.com/blog/gym-check-in-system/)

**WhatsApp Business API constraints (verified 2026-05-17):**
- [WhatsApp Business API 24-hour Messaging Window — smsmode](https://www.smsmode.com/en/whatsapp-business-api-customer-care-window-ou-templates-comment-les-utiliser/)
- [WhatsApp Business Platform 24 Hour Rule — Enchant](https://www.enchant.com/whatsapp-business-platform-24-hour-rule)
- [WhatsApp Business API Pricing 2026 — Uptail](https://www.uptail.ai/blog/whatsapp-business-api-pricing-2026-what-it-costs-and-how-billing-works)
- [Pricing on the WhatsApp Business Platform — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [WhatsApp API Message Templates: Complete Guide — Gurusup](https://gurusup.com/blog/whatsapp-api-message-templates)
- [WhatsApp Multi-Agent: Support with Multiple Agents — Gurusup](https://gurusup.com/blog/whatsapp-multi-agent)
- [WhatsApp Team Inbox Guide — AiSensy](https://m.aisensy.com/blog/whatsapp-team-inbox/)

**Stripe Connect + Subscriptions (verified 2026-05-17):**
- [Create subscriptions with Stripe Billing — Stripe Docs](https://docs.stripe.com/connect/subscriptions)
- [Pause subscriptions — Stripe Docs](https://docs.stripe.com/billing/subscriptions/pause)
- [Automated billing system for gyms — Stripe](https://stripe.com/resources/more/automated-billing-for-gyms-101-a-guide-for-businesses)

**Retention + intro-offer benchmarks:**
- [Fitness Studio Member Retention Plan — fitDEGREE](https://www.fitdegree.com/post/how-to-build-a-90-day-member-retention-system-for-your-boutique-studio)
- [Fitness Studio Member Retention Key Stats 2026 — Regulr](https://regulr.ai/blog/fitness-member-retention-stats)
- [Winning Intro Offers for Fitness Studios — Mariana Tek](https://www.marianatek.com/blog/winning-intro-offers-for-fitness-studios-a-complete-guide/)
- [Intro Offers That Work — Hapana](https://www.hapana.com/blog/when-designing-your-fitness-businesss-intro-offer-is-a-free-trial-really-better)

**MVP scope discipline:**
- [MVP Scope Creep — EVNE Developers](https://evnedev.com/blog/development/mvp-score-creep/)
- [How to Build an MVP for a Fitness App — Onix Systems](https://onix-systems.com/blog/how-to-build-an-mvp-for-a-fitness-application)

---

*Feature research for: boutique fitness studio management platform (GymClassOS)*
*Researched: 2026-05-17*
*Confidence: HIGH on table-stakes (verified across 7+ competitors); HIGH on WhatsApp/Stripe constraint rules; MEDIUM on exact debit-priority semantics for hybrid pass+membership cases (varies by competitor — recommended rule is opinionated, not industry-standard).*
