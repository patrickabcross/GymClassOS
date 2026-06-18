# Requirements: GymClassOS — Milestone v1.1 UI Redesign

**Defined:** 2026-06-12
**Core Value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android Expo app with an in-app coaching agent.

> **Milestone scope note:** This file holds the **v1.1 UI Redesign** requirements only (branch `redesign/ui-refresh`). The v1.0 Demo Sprint / Production v1 requirements (130 reqs, 20 categories) live in this file's git history on `master` and remain authoritative for v1.0 work. This milestone is a visual + naming + IA redesign — it changes how existing features look and what they're called, not what they do.

> **Milestone goal:** Replace the agent-native template-fork look with a studio-skinnable GymClassOS design system and gym-domain naming across all three surfaces (staff web, public embed widgets, member mobile app), so the product reads as a real vertical product sellable beyond Hustle.

## v1.1 Requirements

### Baseline Audit

- [x] **AUDT-01**: Before-state screenshots of every staff-web surface, embed widget, and mobile screen are captured from the deployed apps into `.planning/ui-reviews/baseline/` (no local dev server exists — regressions are otherwise invisible)
- [x] **AUDT-02**: A complete rename inventory (every email-vocabulary UI label, code identifier, CSS class, and route) exists as a naming decision record, with each item classified by rename layer (label / CSS / identifier / route)

### Design System

- [x] **DSGN-01**: All staff-web colors, typography, and radius resolve from CSS custom-property tokens via bare `@theme` — no `@theme inline`, no hardcoded hex in GymClassOS app code (CI grep guard included)
- [x] **DSGN-02**: Studio skin is selected at deploy time via `studios/<studio>/env.yml` (`GYMOS_STUDIO_SKIN`) and injected into every SSR `<head>` by a skin-injector server plugin — zero DB round-trip per request
- [x] **DSGN-03**: Hustle skin (`apps/staff-web/app/skins/hustle.css`) renders the staff web in Hustle brand colors/logo; a `default.css` GymClassOS skin exists as fallback
- [x] **DSGN-04**: Inter is self-hosted on web surfaces — no `fonts.googleapis.com` request on any page load
- [x] **DSGN-05**: Studio name + logo appear at the top of the staff sidebar, sourced from skin config

### Naming & Information Architecture

- [x] **NAME-01**: Staff nav reads Schedule → Messages → Members → Payments → Settings, with studio identity at top
- [x] **NAME-02**: Messaging surface is labeled "Messages" with threads as "Conversations"; "New Message" replaces Compose and "Scheduled Messages" replaces Draft Queue — no email vocabulary anywhere user-visible
- [x] **NAME-03**: Every renamed route ships a redirect shim (React Router `redirect()`) so the live customer's deep links and bookmarks keep working
- [x] **NAME-04**: Code identifiers are renamed (`InboxPage` → `MessagesPage`, `DraftQueuePage` → `ScheduledMessagesPage`, etc.) only after the label layer is stable; email-legacy CSS classes get additive aliases first, then migrate atomically with their components
- [x] **NAME-05**: DB enum string values and schema identifiers are untouched — display labels only (Drizzle enum-rename bug drizzle-kit#1409 + live-DB table-lock risk)
- [x] **NAME-06**: "Book" is the primary CTA on every class surface (staff schedule, member app, booking widget) — never Reserve/Enrol/Register
- [x] **NAME-07**: Member detail view is headed "Member Profile"; pass balance displays as "X credits"

### Staff Web Visual Refresh

- [x] **SWEB-01**: Class cards show class name, time, instructor, and "X / Y booked" on the staff schedule
- [x] **SWEB-02**: Capacity display turns amber/red when ≤3 spots remain
- [x] **SWEB-03**: Member Context panel in conversations shows pass-balance pill, next-class card, and last visit as prominent scannable widgets — card hierarchy, not a data table
- [x] **SWEB-04**: Member Profile shows pass-balance pill, next-class card, and bookings timeline
- [x] **SWEB-05**: Members directory defaults to card view (avatar, membership pill, next class); table remains as a secondary/filter view
- [x] **SWEB-06**: Messages is responsive — single column at mobile widths with member context as a bottom sheet (coaches check from phones on the gym floor)
- [x] **SWEB-07**: Role-based nav — coaches see Schedule/Messages/Members; admins additionally see Payments/Settings
- [x] **SWEB-08**: Staff web defaults to light theme (studio back-office is a lit environment)

### Stripe Integration (direct restricted-API-key, NOT Connect)

- [x] **STR-01** [D+P]: Per-studio Stripe restricted key stored encrypted (pgcrypto). Demo: one studio, hardcoded; Production: rotated + audited. Studio creates their own Stripe account and generates the key with permissions: Products/Prices, Customers, Subscriptions, PaymentIntents, SetupIntents, Charges (read), Refunds, Webhooks (read)
- [x] **STR-02** [D]: Demo can generate at least one Stripe Checkout link for a pass purchase, complete it in test mode, and reflect the resulting pass grant in the member profile
- [x] **STR-03** [P]: `checkout.session.completed` handler creates/updates `payments` row + grants pass if line item is a pack (atomic transaction with `webhook_events` insert)
- [x] **STR-04** [P]: `invoice.paid` and `invoice.payment_failed` handlers reconcile `stripe_subscriptions` state + write to `payments`
- [x] **STR-05** [P]: `customer.subscription.updated` and `customer.subscription.deleted` handlers reconcile membership status
- [x] **STR-06** [P]: `charge.refunded` handler reverses pass grant on refund
- [x] **STR-07** [P]: All Stripe handlers idempotent (verified by replaying the same event twice in tests — no duplicate `payments` or pass-balance changes)
- [ ] **STR-08** [D+P]: No card data ever stored — only Stripe tokenised IDs in DB

### Public Widgets

- [x] **WDGT-01**: `/embed/schedule` renders a clean card-based layout with no admin chrome, themed by studio tokens (existing iframe isolation retained — no Shadow DOM work)
- [x] **WDGT-02**: Lead-capture form is styled with studio tokens and uses "Enquiry" vocabulary (UK boutique convention — Hustle is Norwich, UK)
- [ ] **WDGT-03**: Both embeds verified rendering correctly inside an iframe on a test host page (light and dark host backgrounds)

### Member Mobile App

- [x] **MOBL-01**: `packages/mobile-app/lib/theme.ts` token file exists; all hardcoded hex values across mobile screens are replaced with theme references
- [x] **MOBL-02**: Bottom tabs are renamed Home / Classes / Passes / Log / Profile
- [x] **MOBL-03**: High-contrast dark theme is the member app default (gym/workout usage context)
- [x] **MOBL-04**: Home tab shows next class, pass balance, and latest coach message as hero content
- [x] **MOBL-05**: Booking flow is ≤3 steps (select → confirm with pass/drop-in choice → done) with a persistent pass-balance pill
- [x] **MOBL-06**: Noticeboard is reframed in coach voice ("From your coach" / "Studio updates") — not a notification feed
- [x] **MOBL-07**: Inter loads via `useFonts` with OTF assets (Expo Go compatible); skin is selected via `EXPO_PUBLIC_STUDIO_SKIN` at EAS build time

## Future Requirements

Deferred — tracked but not in the v1.1 roadmap.

### Design System

- **DSGN-F1**: Dark-mode toggle for staff web (light stays default)
- **DSGN-F2**: style-dictionary token pipeline (only if a second studio brings Figma-managed brand tokens)
- **DSGN-F3**: react-native-unistyles theming (blocked until EAS Dev Client replaces Expo Go)

### Public Widgets

- **WDGT-F1**: Script-injected (non-iframe) embed mode — requires Shadow DOM from day one (PITFALLS R-05 standing constraint)
- **WDGT-F2**: `?theme=light|dark` URL param for embed host pages

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

- [x] **PAY-01** [D]: Demo can generate a Stripe Checkout link for a pass purchase (one-off pack, e.g. 10 credits) and verify success in member profile
- [x] **PAY-02** [P]: Coach can generate a Stripe Checkout link for a class drop-in (creates 1-credit pass on success — drop-ins flow through Checkout → pass, not a separate code path)
- [x] **PAY-03** [P]: Coach can generate a Stripe Subscription Checkout link for recurring memberships
- [x] **PAY-04** [P]: Coach can generate a Stripe Customer Portal link to send to a member for self-service billing
- [ ] **PAY-05** [P]: Refunds happen via Stripe Dashboard (NO refunds UI in staff-web v1)

### Member PWA — Booking + Profile

- [x] **MEMBR-01** [D]: Member can browse the upcoming week's class schedule in a mobile-optimised view
- [x] **MEMBR-02** [D]: Member can book a class from the PWA
- [x] **MEMBR-03** [D]: Member can see their current pass balance and upcoming bookings
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
- [x] **AGENT-04** [P]: Conversation history persists across sessions (`agent_sessions` table)
- [x] **AGENT-05** [P]: Per-member memory (`agent_memory` table) — preferences, coaching context
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

### Public Site Integrations (P1c — forms fork + embed widgets, lead funnel)

- [x] **FORMS-01** [P]: Fork `templates/forms/` into `apps/staff-web/features/forms/` (co-located, no new deployable) — copy schema, builder pages, field renderer, public-form SSR, submission handler; adapt to staff-web `getDb()`/auth
- [x] **FORMS-02** [P]: Forms builder UI at `/gymos/forms` (staff-only) — create, edit, publish, archive forms; view responses
- [x] **FORMS-03** [P]: Public form submission → lead upsert — POST `/api/submit/:id` (public, CORS-open) upserts `gym_members` by email/phone, opens a `status=lead` conversation, writes a form_submissions + messages note
- [x] **FORMS-04** [P]: `<script>` embed snippet at `/embed.js` injects a styled iframe for any `/f/:slug` form; `lead:submitted` postMessage callback to the parent page
- [x] **EMBED-01** [P]: Server-rendered public `/embed/schedule` route — reads `class_occurrences` anonymously (no auth), returns HTML with inline CSS + URL-param theming
- [x] **EMBED-02** [P]: URL-param theming (`?accent` hex + `?radius` px) injected as sanitised CSS custom properties on `/embed/schedule` and `/f/:slug` (injection-safe)
- [x] **EMBED-03** [P]: "Enquire / request to book" CTA on the schedule widget — opens an inline lead form whose submission creates a `status=lead` conversation (NO anonymous booking/payment — lead funnel per CONTEXT Decision 2)
- [x] **EMBED-04** [P]: `/embed.js` supports both form + schedule embeds via `data-type`/`data-gymos-*` attributes; `lead:submitted` + `enquiry:created` postMessage callbacks with parent-side origin check; iframe auto-resize
- [x] **EMBED-05** [P]: Stripe Hosted Checkout link action (`create-checkout-link`) — staff generate a link for a contacted lead; session metadata includes `memberId` so the P1b-07 reducer binds the pass
- [x] **EMBED-06** [P]: End-to-end smoke test — embed form + schedule on a throwaway page, submit from a clean browser, verify leads in `/gymos`; create + pay a test Checkout link, verify pass bound to member

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
| Premature extraction into generic "vertical framework" | Build GymClassOS clean first; observe what's reusable when vertical #2 begins. |
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

**v1.1 UI redesign-specific exclusions:**

| Feature | Reason |
|---------|--------|
| DB schema / enum value renames | drizzle-kit#1409 generates DROP TYPE + recreate (table-locks the live Hustle DB); display labels achieve the product goal |
| Removing the Analytics nav item | Research recommended hiding "empty" analytics — but `/gymos/analytics` shipped in P1b.1 with live metrics (fill rate, MRR, ARPM). Keep it. |
| New workspace token package (`packages/gymos-tokens`) | The `@theme` seam already exists in `packages/core/src/styles/agent-native.css`; skins-as-CSS-files + mobile `theme.ts` need no shared package at this scale |
| NativeWind for mobile | v5 pre-release / v4 complexity; hand-rolled theme.ts (~60 lines) suffices |
| Shadow DOM for current embeds | Existing iframe architecture already provides hard CSS isolation (verified in embed-snippet.ts) |
| "Inbox" / "Compose" / "Draft Queue" vocabulary | Email mental-model cluster — the redesign's core anti-feature |
| "Clients" / "Enrol" vocabulary | PT/education framing; Hustle is a community studio — "Members" / "Book" |
| Dark default for staff web | Back-office work happens in lit environments; dark is a future toggle |
| Dense data tables as primary member view | Cold/enterprise feel at boutique scale (100-400 members); cards default, table secondary |
| Editing `templates/*` or `packages-vendored/*` | Hard fork-boundary rule — preserves upstream merge tractability |

## Traceability

Which phases cover which requirements. Updated 2026-06-12 during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDT-01 | R1. Audit Baseline | Complete |
| AUDT-02 | R1. Audit Baseline | Complete |
| DSGN-01 | R2. Design System Token Layer | Complete |
| DSGN-02 | R2. Design System Token Layer | Complete |
| DSGN-03 | R2. Design System Token Layer | Complete |
| DSGN-04 | R2. Design System Token Layer | Complete |
| DSGN-05 | R2. Design System Token Layer | Complete |
| NAME-01 | R3. Naming & IA Pass | Complete |
| NAME-02 | R3. Naming & IA Pass | Complete |
| NAME-03 | R3. Naming & IA Pass | Complete |
| NAME-04 | R3. Naming & IA Pass | Complete |
| NAME-05 | R3. Naming & IA Pass | Complete |
| NAME-06 | R3. Naming & IA Pass | Complete |
| NAME-07 | R3. Naming & IA Pass | Complete |
| SWEB-01 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-02 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-03 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-04 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-05 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-06 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-07 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-08 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| WDGT-01 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| WDGT-02 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| WDGT-03 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| MOBL-01 | R5. Member Mobile App Redesign | Complete |
| MOBL-02 | R5. Member Mobile App Redesign | Complete |
| MOBL-03 | R5. Member Mobile App Redesign | Complete |
| MOBL-04 | R5. Member Mobile App Redesign | Complete |
| MOBL-05 | R5. Member Mobile App Redesign | Complete |
| MOBL-06 | R5. Member Mobile App Redesign | Complete |
| MOBL-07 | R5. Member Mobile App Redesign | Complete |

**Coverage:**
- v1.1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-12*
*Last updated: 2026-06-12 — traceability section populated (roadmap R1–R5 created)*
