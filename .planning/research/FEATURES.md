# Feature Research — GymClassOS v1.1 UI Redesign

**Domain:** Boutique fitness studio management platform — UI/naming/IA redesign
**Researched:** 2026-06-12
**Confidence:** HIGH on competitor vocabulary (cross-verified across 7 platforms via live docs/support sites); MEDIUM on visual convention claims (derived from published design articles and product marketing, not direct app access); LOW on Hustle-specific current stack (confirmed ClubRight historically via doyouhustle.clubright.co.uk; may have changed).

> **Scope note.** This file supersedes the 2026-05-17 FEATURES.md for the v1.1 UI Redesign milestone. That file covered functional feature scope for v1.0. This file covers *naming vocabulary, IA conventions, and visual design patterns* needed to execute the redesign. The functional feature set is unchanged — only surfaces, labels, and design language are in scope here.

---

## Competitor Vocabulary Map

The primary research deliverable. Seven platforms analysed: Mindbody, Glofox, Gymdesk, Wodify, TeamUp, ABC Trainerize, Bsport/ClubRight. Hustle (the first customer) was historically on ClubRight (confirmed via doyouhustle.clubright.co.uk redirect).

### Schedule Surface

| Platform | What they call it | Notes |
|----------|-------------------|-------|
| Mindbody | **Booking Pages** (section header); sub-tabs: **Classes**, **Appointments**, **Courses**, **Rooms**, **Check-in** | Left-nav section renamed from "Schedule" to "Booking Pages" in 2024 redesign. "Courses" renamed from "Enrollments". |
| Glofox | **Timetable** (primary label); also **Calendar** (alternate view mode) | Staff can switch between Calendar (day/week/month) and Timetable (list). |
| Gymdesk | **Schedule** (top-level nav); views: **List view** and **Grid view** | Grid = calendar layout with drag-and-drop editing. |
| Wodify | **Class & Appointment Management**; staff app shows **Schedule** tab | "Classes Dashboard" in analytics context. |
| TeamUp | **Calendar** (primary); also references **Timetable** in member-facing contexts | Calendar supports day/week/month. |
| ABC Trainerize | **Appointments and classes** (feature label) | Trainer-centric; leans more on "appointments" than "classes" for 1:1. |
| Bsport | **Class scheduling & booking** (feature label) | No distinct top-level nav label exposed in public docs. |
| ClubRight | **Timetable** | Members "view timetables and book classes". |
| PushPress | **Schedule** → **Calendar** (sub-section) | "Build and manage your class schedule". |

**Dominant industry term:** "Schedule" (staff mental model) + "Timetable" (member mental model in UK market). "Classes" is the tab label when schedule splits by type.

**Recommended GymClassOS name:** `Schedule` for the top-level nav item; sub-tabs `Classes` (group) and `Appointments` (1:1, if/when added). Current code names `InboxPage`, `DraftQueuePage` — these are email shapes and have zero precedent in gym software.

---

### Messaging / Communications Surface

| Platform | What they call it | Notes |
|----------|-------------------|-------|
| Mindbody | **Messenger[ai]** (AI front-desk feature); comms handled via **Marketing** section + SMS/email automation | No shared staff inbox. Template sends under Marketing. |
| Glofox | **Messages** (sidebar nav item); contextual: "Group Messaging" for class groups | "Getting Started With Messages (Emails)" — Glofox's messages are primarily email-based; WhatsApp not native. |
| Gymdesk | **Marketing** section (top-level nav); sub-features: Automated Email Notifications, Email Templates, Text Messaging, Marketing Automations | No real-time inbox concept. |
| Wodify | **Inbox** (explicit section label); described as "One Place for Every Message" — unifies email, SMS, in-app chat. Also **Conversations** (row-level label inside the Inbox) | Wodify launched "Unified Inbox" in mid-2025. Conversation rows show channel, timestamp, unread count, Scheduled/Draft badges. |
| TeamUp | **Messages** (feature area); automated emails + white-label notifications | No real-time shared inbox. |
| ABC Trainerize | **In-app messages** (feature label); 1:1 and group messaging | Coach-centric; no WhatsApp native. |
| Bsport | **Marketing essentials** (section label) | No WhatsApp inbox concept; email/SMS marketing. |
| ClubRight | **Two-way text, email and marketing** (feature description) | No dedicated inbox nav label exposed publicly. |
| PushPress | Not named as a standalone inbox; referenced within member profiles/conversations | Staff communicate via in-app notes + external WhatsApp. |

**Key insight:** No major competitor has a WhatsApp-native shared inbox with member context. The closest is Wodify's "Unified Inbox" / "Conversations" model (email+SMS+in-app, not WhatsApp). GymClassOS's WhatsApp inbox is genuinely differentiated and needs a gym-native name that avoids email vocabulary.

**Current GymClassOS code names to retire:** `InboxPage` (reads as email), `DraftQueuePage` (email-shaped). `Compose` button (email shape).

**Recommended GymClassOS names:**
- Top-level nav item: `Messages` (industry standard label — Glofox, Wodify both use it; neutral to channel)
- Individual threads: `Conversations` (Wodify's row label; also used by Gymdesk in CRM context)
- Send action: `Send` or `Reply` (not "Compose" — that's email)
- Pending outbound (out-of-window): `Scheduled` (Wodify badge label) — not "Draft Queue"
- Template send: `Send Template` or `Use Template` (not "Draft")

---

### Members vs Clients vs Leads

| Platform | Active paying | Prospect / enquiry | Churned/inactive |
|----------|--------------|-------------------|-----------------|
| Mindbody | **Clients** (primary term) | Not separately named in staff nav | Inactive client |
| Glofox | **Members** | Not separately named | — |
| Gymdesk | **Members** (active membership) | **Leads** (separate section); **Visitors** (no membership, can check in) | Expired / Canceled member |
| Wodify | **Clients** (external-facing); **Members** (membership context) | **Leads** (lead board / lead management) | — |
| TeamUp | **Customers** (primary nav label) | Not separately named | Inactive customer |
| ABC Trainerize | **Clients** (primary term throughout) | **Prospects** (prospect booking feature) | — |
| Bsport | **Members** (primary throughout) | Not surfaced in public nav | — |
| ClubRight | **Members** and **Clients** (used interchangeably) | — | — |
| PushPress | **Members** (member app, membership management) | **Leads** (lead board) | — |

**Pattern:** "Members" dominates boutique-studio platforms (Glofox, Bsport, PushPress, Gymdesk). "Clients" appears at more PT/coaching-centric platforms (Mindbody, Trainerize, Wodify). TeamUp is the outlier with "Customers". Boutique fitness studios say "members" — this is the correct term for Hustle's context.

**Recommended GymClassOS names:**
- Nav section: `Members`
- Individual record: `member` (lowercase in code)
- Lead/prospect (when needed in v1.1+): `Lead` (Gymdesk/Wodify/PushPress all use "Lead")
- Detail page: `Member Profile` (not "Client Detail" or "Contact")

---

### Passes / Credits / Memberships

| Platform | Recurring subscription | Pre-paid class pack | Single drop-in | Terminology notes |
|----------|----------------------|--------------------|-----------------|--------------------|
| Mindbody | **Memberships** (autopay) | **Pricing options** / **Service pricing** | Drop-in rate | "Pricing" covers both recurring and pack types |
| Glofox | **Memberships** | **Class packs** / **Passes** | Drop-in | "Flexible plans and passes" — both under Memberships section |
| Gymdesk | **Membership** (recurring, auto-renew) | **Punch card** / **Limited-session membership** | Drop-in | "Session Deduction" = credit debit; "Session Rollover" = carry-over |
| Wodify | **Memberships** (recurring) | **Class packs** | Drop-in | "Customizable memberships" covers recurring plans, class packs, drop-ins, and trials |
| TeamUp | **Memberships** | **Class packs** | Pay-as-you-go | Tiered memberships (standard, gold, platinum) |
| ABC Trainerize | **Coaching subscriptions** / **Digital memberships** | **Class packs** | Drop-in | More coaching-centric framing |
| Bsport | **Recurring and unlimited memberships** | **Pass bundles** / **Class credits** | Drop-in | "Flexible plans and passes" |
| ClubRight | **Membership fees** / **Memberships** | Not separately named publicly | — | "Automated payment features" |
| PushPress | **Memberships** (plans) | **Class packs** | Drop-in | "Recurring plans, class packs, drop ins, and trials" |

**Pattern:** "Membership" = recurring subscription (universal). "Pass" or "class pack" = pre-paid credits (dominant). "Punch card" = older Gymdesk/TeamUp term. "Credits" = ClassPass-specific term for the marketplace; studios themselves say "class pack" or "pass". "Drop-in" = single-session purchase (universal).

**Current GymClassOS schema:** `pass` table, `pass_debits` ledger — correct domain names.

**Recommended GymClassOS UI labels:**
- Recurring subscription: `Membership`
- Pre-paid credits: `Pass` (short, works for both 10-class packs and intro packs)
- Credit balance on a pass: `Credits` (e.g., "8 credits remaining")
- Single-session: `Drop-in`
- Pass purchase action: `Buy Pass` or `Add Pass`
- Pass detail: `Pass Balance`

---

### Booking Widget (Public Embed)

| Platform | What they call it | Notes |
|----------|-------------------|-------|
| Mindbody | **Branded Web** / **Booking Pages** | Embedded via script tag; customisable tabs |
| Glofox | **Web Portal** / **Booking portal** | Member-facing web booking; separate from staff dashboard |
| Gymdesk | **Booking Widget** (explicit term) | "Embeddable widget on website displaying schedule" |
| Wodify | **Online Sales Pages** | Lead conversion and booking interface |
| TeamUp | **Online Booking** / **Booking platform** | "Complete booking platform" embedded on studio site |
| Bsport | **Member app** + web booking | "Browse classes, choose their favourite spot, and book" |
| ClubRight | **Timetable** embed | Members view timetables and book via the embedded widget |
| PushPress | **Members App** (bookings via app, not widget per se) | Kiosk Mode for in-person self-serve |

**Pattern:** "Booking Widget" (Gymdesk) is the clearest generic name. "Widget" is understood by studio owners who want to embed on their Squarespace/Wix site. Current GymClassOS path `/embed/schedule` is already descriptive.

**Recommended GymClassOS names:**
- Feature name: `Booking Widget` (matches Gymdesk; understood by studio owners)
- URL pattern: keep `/embed/schedule` (already works, no rename needed for the path)
- Lead capture: `Enquiry Form` or `Lead Form` (not "onboarding form" — too internal)

---

### Member-Facing App Sections

Based on patterns across Glofox, PushPress, Wodify, Mindbody member apps and published UX reviews:

| Section | Most common label(s) | Notes |
|---------|---------------------|-------|
| Home / dashboard | **Home** (universal) | Upcoming class, pass balance, announcements/noticeboard |
| Class browser | **Classes** or **Schedule** | Glofox: "Timetable"; most others: "Classes" |
| Booking flow | **Book** (CTA) / **Reserve** | "Book a spot" is the dominant phrase |
| Pass/membership | **Passes** or **Memberships** | Glofox/Bsport: "Memberships"; PushPress: "Passes" |
| Food/nutrition | **Nutrition** or **Food Log** | No industry standard; fitness apps use both |
| AI coach | **Coach** (ABC Trainerize uses "Coach" as a top nav section) | Novel to GymClassOS; no direct competitor |
| Profile / account | **Profile** or **Account** | Universal bottom-tab |

**Recommended GymClassOS mobile app tabs (bottom nav, 5 max):**
1. `Home` — upcoming classes, pass balance, coach messages
2. `Classes` — browse and book schedule
3. `Passes` — pass balance and purchase history
4. `Log` — food/calorie tracking (differentiator)
5. `Profile` — account settings, membership management

Current agent-native mobile app structure may use non-gym labels — these should map to the above.

---

## Table Stakes (UI Redesign)

Features the redesign must deliver. Missing these = product looks unfinished to a studio owner evaluating it against Mindbody/Glofox.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Gym-domain nav labels throughout staff web** | Every competitor uses gym vocabulary (Schedule, Members, Passes, Payments). Email vocabulary (InboxPage, DraftQueuePage, Compose) is a trust-killer in a sales demo. | LOW | Pure rename — no logic changes. 10-20 files, mostly route names and page titles. |
| **Schedule surface named "Schedule" not "Calendar fork"** | Staff mental model is "the schedule" (when are classes). Calendar = datepicker. | LOW | Route rename `/gymos/schedule` stays; page heading changes from agent-native default to "Schedule". |
| **Messages surface named "Messages" not "Inbox"** | "Inbox" is acceptable (Wodify uses it) but combined with "Draft Queue" and "Compose" the email cluster is broken. | LOW | Route can stay `/gymos/messages`; retire DraftQueuePage, InboxPage component names in favor of MessagesPage, ConversationsPage. |
| **Member profile named "Member Profile"** | Every competitor calls the detail view "Member Profile" or "Client Profile". | LOW | Rename from whatever agent-native default calls it. |
| **"Members" in nav, not "Contacts" or "Clients"** | Boutique studio vocabulary. Hustle's audience are "members". | LOW | Nav label change only. |
| **Gym color palette / tokens (not email-app greys)** | Staff web currently reads as an email client. Boutique fitness = energy, vibrancy, brand. | MEDIUM | Design token layer: primary brand color (from studio config), dark/light surface tokens, accent. Hustle skin is the first. |
| **Typography that reads as sport, not enterprise SaaS** | Mindbody 2024 redesign went bold sans-serif. Glofox uses bold weight on class cards. Boutique-fitness apps consistently use strong type hierarchy. | MEDIUM | Font token in design system. Consider DM Sans / Inter (neutral) vs a more "fitness" cut. Avoid the light-weight office-suite look of the agent-native mail template. |
| **Logo / studio name visible in staff nav** | Glofox, Mindbody, Wodify all show the studio name/logo in the top of the sidebar. Signals "this is YOUR tool". | LOW | Logo token + studio name from config. |
| **Class cards show spots remaining** | Booking-confidence signal. Glofox, Mariana Tek, Mindbody all show "X of Y spots" on the class card in both staff and member views. | LOW | Data is already in schema (`class_occurrences.capacity`, booking count). Surface it on schedule cards. |
| **Passes section named "Passes" with credit balance visible** | Pass balance is a primary operational widget. Staff need to see at a glance. Gymdesk, Glofox surface it on the member profile. | LOW | Label + prominent credit display on member profile and in conversation context panel. |
| **"Book" as the primary CTA on class cards** | Universal. Not "Reserve", not "Enrol", not "Register" — "Book" is the dominant boutique-studio verb. | LOW | CTA label change. |
| **Mobile app bottom-tab labels matching gym vocabulary** | Member app currently uses agent-native defaults. Should match industry-standard tab names. | LOW | Tab label rename in Expo app. |
| **Public booking widget styled to embed on a studio site** | The widget at `/embed/schedule` must not look like an admin dashboard fragment. Needs a clean card-based layout suitable for a white background or dark studio site. | MEDIUM | Isolated style context for the embed; inherits studio color token but no nav chrome. |

---

## Differentiators (Redesign-Specific)

Features of the redesign that go beyond "looks like a gym product" to "looks like *our* gym product".

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Studio-skinnable design token system** | Every competitor hardcodes their own brand. GymClassOS skins per studio at deploy time. A Hustle-branded deploy looks like Hustle's product, not a white-label. | MEDIUM | Token file per studio (colors, logo, radius, font). Hustle skin is first. Swap at build time or runtime via CSS custom properties. |
| **Coaching agent visible in member app with gym-aware personality** | No competitor (Mindbody, Glofox, TeamUp) has an in-app AI coach. ABC Trainerize's "Coach" section is human coaching delivery. GymClassOS's AI coach knows the member's class history, pass balance, food log. | HIGH | Already built in v1. Redesign task: make the chat surface feel like a coach (not a chatbot), with appropriate iconography and personality language. |
| **Context panel in Messages shows "next class, pass, last visit"** | Differentiator established in v1. Redesign task: make this panel visually prominent and scannable — not tucked away. Use card hierarchy, not a data table. | MEDIUM | Visual redesign of the right rail: pass balance as a pill badge, next class as a card with time/name/spots, attendance streak as a metric. |
| **"Spots remaining" as a motion/animation trigger** | High-energy boutique studios use urgency design. When spots drop to ≤3, color changes (red or amber). Mindbody and Mariana Tek both do this. | LOW | Conditional CSS class on the capacity display. |
| **Announcement/noticeboard surface in member app home** | Already exists (AI noticeboard home per PROJECT.md). Differentiator: framed as the coach's voice, not a notification panel. | LOW | Label and copy reframe: "From your coach" or "Studio updates" — not "Notifications" or "Feed". |

---

## Anti-Features (Redesign-Specific)

Design patterns that seem gym-appropriate but should be explicitly avoided.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **"Inbox" as the primary nav label for the Messages surface** | Familiar; Wodify uses "Inbox". | "Inbox" triggers email mental model, especially combined with "Compose" and "Draft". Even if kept, all subordinate labels must be gym-native to break the cluster. | Use `Messages` as the top-level label; `Conversations` inside; `Replies` not "Drafts". |
| **"Compose" button for starting a WhatsApp message** | Standard in every email client from Gmail to Superhuman. | Pure email vocabulary. A gym coach does not "compose" a WhatsApp message to a member. | Label the action `New Message` or a context-specific verb (`Message [Name]`). |
| **"Draft Queue" for scheduled/pending messages** | Logical extension of email metaphor. | No gym platform uses "Draft Queue". Wojify uses "Scheduled" badge. | Call it `Scheduled Messages` or show as a status badge `Scheduled` on the conversation row. |
| **Side-by-side three-panel layout for Messages at mobile widths** | Natural extension of desktop email client (list + thread + context panel). | At 375px the three-panel collapses unreadably. Gym staff frequently check from mobile phones on the floor. | Responsive: mobile = single column with swipe-to-open context panel or bottom sheet for member context. |
| **Mindbody-style dense data tables everywhere** | Mindbody's heritage is enterprise gym (hundreds of studios). Boutique studios have 100-400 members — density is less valuable. | Data tables for 100 members look like overkill and feel cold. Hustle's brand is personal/community. | Card-based member list with photo avatar, membership pill, and next-class time. Table as a secondary/filter view. |
| **Dark mode as default for staff web** | Fitness apps often use dark theme. | Boutique studio back-office work happens in a bright studio or café. A dark default increases eye strain in lit environments for admin tasks. Dark is a preference option, not a mandate. | Light default with dark mode toggle. Member mobile app: dark is acceptable as default (used in gym/workout context). |
| **"Analytics" as a top-level nav item in staff web (v1.1)** | Mindbody, Glofox, Wodify all have Analytics/Reports as top-nav. | Analytics are Phase 4 features. Surfacing an empty Analytics section in the redesign = placeholder embarrassment. | Keep analytics-adjacent data (fill rate, pass utilisation, MRR) as widgets on the Schedule and Members pages rather than a top-level empty section. Add `Analytics` nav item only when Phase 4 ships. |
| **Generic sans-serif + blue = "SaaS app" aesthetic** | Fastest path to a clean-looking redesign. | Looks like every B2B dashboard from 2015-2023. Boutique fitness studios have strong visual identities. | Brand color comes from the studio token (Hustle's red/black). Typography: bold weight, higher contrast. Imagery/iconography: physical, energetic (dumbbells, calendar, chat bubble — not abstract shapes). |
| **"Enrol" instead of "Book"** | Used by Mindbody for courses/workshops. | "Enrol" = education/course register. Boutique studios say "book a class" — it's transactional and time-bound. | `Book` as the universal verb. "Enrol" only if the studio explicitly offers multi-week courses (not relevant for Hustle). |
| **"Clients" in nav for Hustle's context** | Mindbody, Trainerize use "Clients". | Hustle is a community studio; "clients" is too transactional/PT-service. | `Members` — consistent with Glofox, Bsport, PushPress, and the boutique-fitness community framing. |

---

## IA Conventions Worth Adopting

Observed across Mindbody (2024 redesign), Glofox, Wodify, Gymdesk:

### Staff Web App

1. **Left sidebar navigation (vertical), collapsible.** Industry standard since Mindbody's 2024 nav overhaul explicitly cited Nielsen Norman research: vertical list search is more efficient. Glofox, Gymdesk, Wodify all use left sidebar. The agent-native mail template already has this shape — keep it, rename the items.

2. **Top-of-sidebar: booking/scheduling surfaces first.** Mindbody explicitly puts "Booking Pages" (schedule) at the top of the left nav as the primary access point. This is where coaches go first every day.

3. **Messages second** (or accessible via notification badge from anywhere). Staff check messages constantly — should be one click, not buried.

4. **Members third.** Less frequent than schedule + messages.

5. **Payments, Analytics last** (or hidden for coach role).

6. **Studio name + logo at top of sidebar.** Every major competitor. Signals ownership.

7. **Class cards show: class name, time, instructor, spots (X/Y).** This four-element class card is consistent across Mindbody, Glofox, Gymdesk. Capacity is always visible on the staff schedule, not just member-facing.

8. **Member context in conversation: pass balance + next class as primary info.** The most critical operational question a coach has in a WhatsApp thread is "are they a current member, how many credits do they have, what's their next class?" Surface these three data points prominently.

9. **Role-based nav simplification.** Coaches see: Schedule, Messages, Members. Admins see: all of the above + Payments, Settings. Mindbody and Glofox both implement role-based access restricting billing/settings to admins.

### Member Mobile App

1. **Bottom tab bar, 4-5 items max.** Industry-wide convention (Glofox Pro app, PushPress member app, Mindbody member app). Five tabs is the upper bound — more than five fragments into an overwhelming set of icons.

2. **Home tab shows: upcoming booking, pass balance, last coach message.** The "at a glance" surface. All leading apps prioritise the next class and membership status as the home screen hero content.

3. **Classes tab (or Schedule tab) is a vertical list by day.** Not a month-grid (too dense on mobile). Day-by-day scroll with time, class name, instructor, and a `Book` button is the standard pattern. Glofox, PushPress, Wodify member apps all use this.

4. **Booking flow: 3 steps max.** (1) Select class → (2) Confirm + choose payment method (pass/membership/drop-in) → (3) Confirmation. Mariana Tek's signature UX claim is "book in a few taps". Mindbody's redesign philosophy was explicitly "fewer clicks, clearer actions".

5. **Pass balance as a persistent widget.** PushPress, Glofox, Wodify all surface pass balance prominently. Members are anxious about running out of credits. A "8 classes remaining, expires June 30" pill on the home screen or classes tab prevents support messages.

6. **Dark or high-contrast palette for member app.** Member app is used at the gym, outdoors, during workouts. High contrast (dark bg + bright accent) is standard across fitness consumer apps. Staff web = light default; member app = dark or high-contrast default is acceptable.

---

## Naming Recommendations Table

**Current GymClassOS name → Recommended gym-domain name.**

| Surface / Label | Current Name (agent-native origin) | Recommended Name | Rationale |
|-----------------|-------------------------------------|------------------|-----------|
| Staff web main nav: messaging section | `InboxPage` (route component) | `MessagesPage` | "Messages" is the industry label (Glofox, Wodify). Breaks email vocabulary cluster. |
| Staff web: conversation list route | `/gymos` (root, maps to inbox) | `/gymos/messages` | Explicit gym-domain path. |
| Staff web: individual thread view | Inbox thread / conversation | `Conversation` | Wodify uses "Conversations" as the row label. Natural language. |
| Staff web: send new message action | "Compose" button | `New Message` | "Compose" = email. "New Message" = neutral, familiar for WhatsApp/SMS. |
| Staff web: queued/pending sends | `DraftQueuePage` | `Scheduled Messages` | Wodify uses "Scheduled" badge. Describes the state accurately without email framing. |
| Staff web: scheduling surface | `SchedulePage` (already correct name, check) | `Schedule` | Keep if already gym-domain. Verify no agent-native email bleed in headings. |
| Staff web: class list/calendar | Any agent-native calendar default | `Schedule` (top level) → `Classes` (tab) | Industry pattern: Schedule nav → Classes as the content label. |
| Staff web: member list route | `/gymos/members` (likely correct) | `Members` | Already correct if in place. Verify page heading. |
| Staff web: individual member record | Member detail / contact | `Member Profile` | Universal competitor term. |
| Staff web: pass/credit management | Passes (schema term) | `Passes` (nav) + `Credits` (balance display) | Schema is already correct. UI label "Pass Balance: 8 credits" is clear. |
| Staff web: analytics/reporting | Analytics (if exists as nav item) | Remove from nav or rename `Fill Rate` widget | Analytics is Phase 4. Don't expose an empty section. Surface key stats as widgets. |
| Staff web: left nav studio name | Not present / generic | Studio name + logo (from config token) | Industry standard. Signals "this is Hustle's tool". |
| Member app: home tab | Unknown (agent-native default) | `Home` | Universal. Shows next class, pass balance, coach messages. |
| Member app: class browser tab | Unknown | `Classes` | Dominant industry label for group fitness. |
| Member app: pass/membership tab | Unknown | `Passes` | Boutique studios use "Passes" more than "Memberships" for the credits concept. |
| Member app: food/calorie tab | Unknown | `Log` or `Nutrition` | "Log" is shorter for a tab label. Fitness apps use both; "Log" fits 4-char tab constraint. |
| Member app: AI coach section | Unknown | `Coach` | ABC Trainerize uses "Coach" as a top-level section label. Natural for a coaching product. |
| Member app: profile/account tab | Unknown | `Profile` | Universal. |
| Member app: class booking CTA | Unknown | `Book` | Dominant boutique fitness verb. Not "Reserve", "Enrol", "Register". |
| Public embed booking widget | `/embed/schedule` (route) | `Booking Widget` (feature name) | Gymdesk's explicit term; understood by studio owners. Route path stays. |
| Public embed: lead capture form | Lead form / onboarding form | `Enquiry Form` | UK boutique studio context (Hustle is Norwich, UK). "Enquiry" is the local convention. |
| WhatsApp conversation context panel | Right rail / sidebar | `Member Context` or `Member Details` | Descriptive. Avoids "pane" (engineering jargon) or "panel" (acceptable). |
| Pass balance in context panel | Credits remaining | `Pass Balance` + `X credits` | Clear, matches member app label for consistency. |
| Capacity display on class cards | N/A (may not exist yet) | `X spots left` (member view) / `X / Y booked` (staff view) | Member view: urgency framing. Staff view: operational framing. Both are industry standard. |

---

## Feature Prioritization Matrix (Redesign Scope)

| Redesign Task | User Value | Cost | Priority |
|---------------|------------|------|----------|
| Retire email vocabulary in nav labels (InboxPage → MessagesPage, DraftQueuePage → Scheduled Messages, Compose → New Message) | HIGH | LOW | P1 |
| Rename staff nav: Schedule, Messages, Members, Payments, Settings | HIGH | LOW | P1 |
| Rename member app tabs: Home, Classes, Passes, Log, Profile | HIGH | LOW | P1 |
| Design token system (color, typography, logo, radius) | HIGH | MEDIUM | P1 |
| Hustle skin (first studio config) | HIGH | LOW | P1 |
| Class cards with spots remaining (X/Y) | HIGH | LOW | P1 |
| Member profile: "Member Profile" heading, pass balance pill, next class card | HIGH | LOW | P1 |
| Context panel: pass balance + next class + last visit as primary widgets | HIGH | MEDIUM | P1 |
| Studio name/logo in sidebar | MEDIUM | LOW | P1 |
| Public booking widget styled for embed (no nav chrome, clean card layout) | HIGH | MEDIUM | P1 |
| "Book" as primary CTA on all class surfaces | HIGH | LOW | P1 |
| `New Message` replaces "Compose"; `Scheduled` replaces "Draft Queue" | HIGH | LOW | P1 |
| Mobile-responsive Messages (single column with context as bottom sheet) | MEDIUM | MEDIUM | P2 |
| Card-based member list (not dense table as default) | MEDIUM | MEDIUM | P2 |
| Role-based nav simplification (coach vs admin) | MEDIUM | MEDIUM | P2 |
| Spots-remaining urgency color (amber/red at ≤3) | LOW | LOW | P2 |
| Dark mode toggle for staff web | LOW | MEDIUM | P3 |
| High-contrast default for member app | MEDIUM | LOW | P1 |
| "From your coach" framing for noticeboard in member app | LOW | LOW | P2 |

**Priority key:** P1 = must ship in v1.1 redesign milestone. P2 = add when core rename is stable. P3 = nice to have, post v1.1.

---

## Sources

**Competitor nav labels and terminology:**
- [Mindbody Updated Navigation (April 2024)](https://www.mindbodyonline.com/business/education/blog/updated-enterprise-navigation-April-2024) — LEFT SIDEBAR structure, "Booking Pages", "Insights", "Courses" rename
- [Mindbody Staff Handbook](https://support.mindbodyonline.com/s/article/207272238-Staff-Handbook-quick-reference-guide-for-staff-members) — "Schedule", "Clients", "Staff" nav labels
- [Glofox Dashboard Sneak Peek](https://www.glofox.com/blog/whats-new-with-glofox-the-admin-dashboard/) — "Calendar View", "Group Messaging", "Report Builder"
- [Glofox Getting Started With Messages](https://support.glofox.com/hc/en-us/articles/360004874758-Getting-Started-With-Messages-Emails) — "Messages" as nav label
- [Gymdesk Glossary](https://docs.gymdesk.com/en/help/docs/gymdesk-glossary-0) — comprehensive vocabulary: Members/Visitors/Leads, Schedule, Booking Widget, Membership Pricing, Check-In methods
- [Gymdesk Schedule Management](https://docs.gymdesk.com/help/schedule) — "Schedule" top-level nav, List view / Grid view
- [Wodify Unified Inbox](https://help.wodify.com/hc/en-us/articles/33536760810007-Understand-Wodify-s-Inbox) — "Inbox", "Conversations", "Scheduled/Draft badges"
- [Wodify In-App Chat](https://help.wodify.com/hc/en-us/articles/10575390410007-Learn-About-In-App-Chat) — "Unified Inbox", channel labels
- [Wodify Features](https://www.wodify.com/products/core/features) — "One Place for Every Message", "Class & Appointment Management", "Reporting & Insights"
- [TeamUp Review (MyPersonalTrainerWebsite)](https://mypersonaltrainerwebsite.com/blog/teamup-fitness-business-management-software-review) — "Calendar" (staff), "Customers" section, "Memberships", "Classes", "Courses"
- [ABC Trainerize Features](https://www.trainerize.com/features/) — "Coach", "Engage", "Manage" nav; "In-app messages", "Appointments and classes", "Prospect booking", "Clients"
- [Bsport Studio Management Features](https://pro.bsport.io/en/features/studio-management) — "Class scheduling & booking", "Flexible plans and passes", "Class credits", "Pass bundles", "Team & payroll", "Marketing essentials"
- [PushPress Core](https://www.pushpress.com/products/core) — "Scheduling and Booking", "Membership Management", "Members App", "Staff App", "Committed Club"
- [ClubRight Boutique Fitness](https://clubright.co.uk/businesses/boutique-fitness/) — "Timetables", "Membership Management", "Bookings & Classes", "Sales & Marketing"

**Hustle customer context:**
- [doyouhustle.clubright.co.uk](https://doyouhustle.clubright.co.uk/register) — confirms Hustle (Norwich) was/is on ClubRight; ClubRight uses "Timetable" vocabulary
- [Hustle Terms & Conditions](https://www.doyouhustle.co.uk/terms-conditions) — 6-hour cancellation policy, confirms boutique boxing studio context

**Visual design conventions:**
- [Mindbody Modern Workflows UX](https://www.mindbodyonline.com/business/education/blog/mindbody-ui-ux-todays-modern-workflows) — "fewer clicks, clearer actions", "card-style layout", "larger touch targets"
- [Tubik Studio: Manuva Gym App Case Study](https://blog.tubikstudio.com/case-study-manuva-uiux-design-gym-fitness-app/) — bottom tab bar navigation, brand accent color system, goal-selection onboarding
- [Glofox Fitness Class Booking App](https://www.glofox.com/blog/fitness-class-booking-app/) — "Pick Your Spot floor mapping" (Mariana Tek), "Deskless staff app", "Glofox Pro staff app"
- [Fitness App UX Design Principles — Eastern Peak](https://easternpeak.com/blog/fitness-app-design-best-practices/) — tab bar navigation best practices, 3-5 tab limit

---

*Feature research for: GymClassOS v1.1 UI Redesign — naming, IA, visual conventions*
*Researched: 2026-06-12*
*Confidence: HIGH on competitor vocabulary (Gymdesk glossary, Mindbody nav update, Wodify help docs, TeamUp review all primary sources); MEDIUM on visual conventions (marketing material + design articles, not direct app screenshots); LOW on Hustle current stack (ClubRight historically confirmed, current state unverified).*
