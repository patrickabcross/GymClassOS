# Naming Decision Record — v1.1 UI Redesign

**Purpose:** Naming decision record for v1.1 UI Redesign. Inventories every email-vocabulary item across staff-web, embeds, and mobile. R3/R4/R5 naming work executes from this record without re-auditing.

**Produced:** 2026-06-12 (Phase R1, Plan 01)
**Requirement:** AUDT-02

---

## How to Read This

**Four rename layers:**

| Layer | What it covers | Rename impact |
|-------|---------------|---------------|
| **Label** | User-visible copy (headings, button text, tab labels, page titles) | R3 label pass + R4/R5 surface work |
| **CSS** | Hand-authored class names in `global.css` | R3 CSS pass — rename atomically with component usage (R-12) |
| **Identifier** | Component file names, function/variable names, page component names | R3 identifier pass — zero user impact, pure refactor |
| **Route** | URL path strings (navigate/Link/href hardcoded refs) | R3 route pass — requires redirect shim before old route is removed (R-06) |

**Risk note conventions:**
- `redirect shim` — old URL must stay alive with a `loader = () => redirect(...)` until shim is verified on Vercel deploy (R-06)
- `R-12 orphaning` — CSS class rename must be atomic with component usage; grep must return zero after rename
- `NAME-05 do-not-touch` — DB-stored string value; ONLY display label may change; no Drizzle migration
- `keep` — already gym-domain; no rename needed

**Proposed targets** drawn from `FEATURES.md` Naming Recommendations Table + requirements NAME-01..07, MOBL-02, WDGT-02.

**Surface coverage:** Three surfaces — (1) staff-web (`apps/staff-web/`), (2) public embeds (`apps/staff-web/server/routes/embed/`, `features/forms/lib/`), (3) member mobile app (`packages/mobile-app/`).

---

## Label Layer

User-visible copy — strings the coach or member reads in the UI.

| Current name | File path(s) + line refs | Proposed target | Rename layer | Risk note |
|---|---|---|---|---|
| `"WhatsApp Inbox"` heading | `apps/staff-web/app/routes/gymos.inbox.tsx:653` | `"Messages"` | Label | R3 NAME-01 — change heading text; route stays `/gymos/inbox` until Route layer rename in same R3 pass |
| `"Inbox"` tab chip label | `apps/staff-web/app/routes/gymos.inbox.tsx:677` (chip text inside `<Link to="/gymos/inbox">`) | `"Messages"` or `"All"` | Label | R3 NAME-01 — update chip text atomically with heading |
| `"Leads"` tab chip label | `apps/staff-web/app/routes/gymos.inbox.tsx:680` (chip text inside `<Link to="/gymos/inbox?filter=leads">`) | `"Leads"` — keep | Label | keep — already gym-domain; no change needed |
| Page `<title>` `"GymClassOS — WhatsApp Inbox"` | `apps/staff-web/app/routes/gymos.inbox.tsx:64` (`meta()` function) | `"GymClassOS — Messages"` | Label | R3 NAME-01 — update `meta()` return value |
| `"← Back to inbox"` link text | `apps/staff-web/app/routes/gymos.members.tsx:175` | `"← Back to Messages"` | Label | R3 NAME-01 — update link text; the `to` prop also needs route update if `/gymos/inbox` → `/gymos/messages` |
| `"← Back to inbox"` link text | `apps/staff-web/app/routes/gymos.payments.tsx:52` | `"← Back to Messages"` | Label | R3 NAME-01 — update link text; same route-prop dependency as above |
| Nav label `"Inbox"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:61` | `"Messages"` | Label | R3 NAME-01 — deferred to R3 label-layer first per ordering constraint; change nav label text atomically with route rename |
| Nav label `"Home"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:58` | `"Home"` — keep | Label | keep — already gym-domain |
| Nav label `"Schedule"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:63` | `"Schedule"` — keep | Label | keep — correct gym-domain term |
| Nav label `"Members"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:66` | `"Members"` — keep | Label | keep — already gym-domain |
| Nav label `"Payments"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:69` | `"Payments"` — keep | Label | keep — correct term; admin-gated per SWEB-07 in R4 |
| Nav label `"Analytics"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:72` | Remove from nav or replace with inline widget — defer to R4 | Label | R4 SWEB — Analytics nav item exposes empty section; defer to Phase 4 per FEATURES.md anti-feature guidance |
| Nav label `"Campaigns"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:75` | `"Campaigns"` — keep | Label | keep — gym-domain term; part of R3 NAME-01 clean-up scope |
| Nav label `"Forms"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:78` | `"Forms"` — keep | Label | keep — already neutral |
| Nav label `"Settings"` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:84` | `"Settings"` — keep | Label | keep — already correct; admin-gated per SWEB-07 |
| Mobile tab `"Schedule"` | `packages/mobile-app/app/(tabs)/_layout.tsx:34` (`title: "Schedule"`) | `"Classes"` | Label | R5 MOBL-02 — "Schedule" collides with staff-web nav; mobile-specific class browser should be "Classes" |
| Mobile tab `"Food"` | `packages/mobile-app/app/(tabs)/_layout.tsx:42` (`title: "Food"`) | `"Log"` | Label | R5 MOBL-02 — 4-char tab constraint; "Log" matches fitness-app convention (food/calorie log) |
| Mobile tab `"Home"` | `packages/mobile-app/app/(tabs)/_layout.tsx:25` (`title: "Home"`) | `"Home"` — keep | Label | keep — universal tab label |
| Mobile tab `"Profile"` | `packages/mobile-app/app/(tabs)/_layout.tsx:51` (`title: "Profile"`) | `"Profile"` — keep | Label | keep — universal tab label |
| Mobile tab `"Passes"` (not yet added) | Not yet in codebase | `"Passes"` | Label | R5 MOBL-02 — new 5th tab for pass balance/history per FEATURES.md; requires new tab screen |
| Embed widget CTA `"Enquire"` button | `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts:155` (`.enquire-btn` button text) | `"Enquire"` — evaluate per NAME-06 | Label | NAME-06 specifies `"Book"` as the primary booking CTA; current `"Enquire"` is appropriate for a lead-capture flow (not a confirmed booking). Document: if widget gains direct booking (Stripe Checkout), CTA becomes `"Book"`; enquiry-only flow stays `"Enquire"` |
| Embed widget submit `"Send Enquiry"` | `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts:163` (form submit button) | `"Send Enquiry"` — keep | Label | keep — accurate label; WDGT-02 validates "Enquiry" vocabulary (UK convention); matches gym-domain expectation for Hustle (Norwich) |
| Embed widget meta description `"enquire to book your spot"` | `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts:230` | `"enquire to book your spot"` — keep | Label | keep — copy is gym-domain and UK-appropriate |
| Member profile page heading | Not found as a distinct label — inherits from member record display | `"Member Profile"` | Label | R3 NAME-07 — add explicit heading "Member Profile" to member detail view; verify current heading in `gymos.members_.$id.tsx` |
| Pass balance label | Not found as a distinct label in current codebase | `"Pass Balance"` + `"X credits"` | Label | R4 SWEB — surface pass balance as `"Pass Balance: X credits"` on member profile and conversation context panel per NAME-07 and FEATURES.md |

---

## CSS Layer

Hand-authored class names in `apps/staff-web/app/global.css` — all are email-vocabulary classes that must be renamed atomically with their component usage.

| Current name | File path(s) + line refs | Proposed target | Rename layer | Risk note |
|---|---|---|---|---|
| `.email-list-row` | `apps/staff-web/app/global.css:77` (inside `@layer base`), `:144` (`.focused`), `:149` (`.selected`), `:154` (`.multi-selected`), `:157` (`.multi-selected.focused`), `:184` (`.row-action-rail`), `:196` (`.row-action-rail` responsive), `:201` (`.hover-actions`), `:213` (`.focused .hover-actions`), `:218` (`.selected .hover-actions`), `:224` (`.focused .row-time`), `:229–240` (mobile breakpoint rules) | `.conversation-row` | CSS | R-12 orphaning — additive alias first (add `.conversation-row` alongside `.email-list-row`), then migrate `EmailListItem.tsx` usage, then drop `.email-list-row`; grep must return zero after migration; rendered by `apps/staff-web/app/components/email/EmailListItem.tsx` |
| `.email-body-content` | `apps/staff-web/app/global.css:99` (block start), `:107` (`a`), `:112` (`p`), `:115` (`img`), `:119` (`pre, table`) | `.message-body-content` | CSS | R-12 orphaning — rename atomically with `EmailThread.tsx` usage; rendered by `apps/staff-web/app/components/email/EmailThread.tsx` |
| `.compose-window` | `apps/staff-web/app/global.css:162` | `.message-composer-window` | CSS | R-12 orphaning — rename atomically with `ComposeModal.tsx` usage; rendered by `apps/staff-web/app/components/email/ComposeModal.tsx` |
| `.compose-editor-wrapper` | `apps/staff-web/app/global.css:286` | `.message-editor-wrapper` | CSS | R-12 orphaning — rename atomically with `ComposeEditor.tsx` usage; rendered by `apps/staff-web/app/components/email/ComposeEditor.tsx` |
| `.compose-editor` | `apps/staff-web/app/global.css:290` (block), `:298` (`> *:first-child`), `:302–577` (full editor sub-tree including `h1`, `h2`, `h3`, `p`, `ul`, `ol`, `li`, `blockquote`, `.compose-code-block`, `pre`, `.compose-image`, `code`, `strong`, `em`, `s`, `::selection`, `hr`) | `.message-editor` | CSS | R-12 orphaning — rename atomically with all `.compose-editor` references in `ComposeEditor.tsx`; large block with many sub-selectors — use sed/replace-all in single commit |
| `.compose-code-block` | `apps/staff-web/app/global.css:368` (inside `.compose-editor`) | `.message-editor-code-block` | CSS | R-12 orphaning — sub-class of `.compose-editor`; rename alongside `.compose-editor` |
| `.compose-image` | `apps/staff-web/app/global.css:391` (inside `.compose-editor`) | `.message-editor-image` | CSS | R-12 orphaning — sub-class of `.compose-editor`; rename alongside `.compose-editor` |
| `.compose-image-placeholder` | `apps/staff-web/app/global.css:397` | `.message-editor-image-placeholder` | CSS | R-12 orphaning — rename atomically with ComposeEditor usage |
| `.compose-image-wrapper` | `apps/staff-web/app/global.css:421` | `.message-editor-image-wrapper` | CSS | R-12 orphaning — rename atomically with ComposeEditor usage |
| `.compose-image-overlay` | `apps/staff-web/app/global.css:434` | `.message-editor-image-overlay` | CSS | R-12 orphaning — rename atomically with ComposeEditor usage |
| `.compose-image-btn` | `apps/staff-web/app/global.css:444` (also `:461` `.hover` and `:464` `.--danger:hover`) | `.message-editor-image-btn` | CSS | R-12 orphaning — rename atomically with ComposeEditor usage |
| `.compose-link` | `apps/staff-web/app/global.css:482` | `.message-editor-link` | CSS | R-12 orphaning — rename atomically with ComposeEditor usage |

---

## Identifier Layer

Component file names, function/variable names, page component names. Zero user impact — pure internal rename. All files are in `apps/staff-web/app/`.

| Current name | File path(s) + line refs | Proposed target | Rename layer | Risk note |
|---|---|---|---|---|
| `EmailList.tsx` | `apps/staff-web/app/components/email/EmailList.tsx` | `ConversationList.tsx` | Identifier | NAME-04 — rename file + exported component name `EmailList` → `ConversationList`; update all import sites |
| `EmailListItem.tsx` | `apps/staff-web/app/components/email/EmailListItem.tsx` | `ConversationListItem.tsx` | Identifier | NAME-04 — rename file + exported component; also carries `.email-list-row` CSS usage (CSS layer dependency) |
| `EmailThread.tsx` | `apps/staff-web/app/components/email/EmailThread.tsx` | `ConversationThread.tsx` | Identifier | NAME-04 — rename file + exported component; also carries `.email-body-content` CSS usage (CSS layer dependency) |
| `ComposeModal.tsx` | `apps/staff-web/app/components/email/ComposeModal.tsx` | `MessageComposerModal.tsx` | Identifier | NAME-04 — rename file + exported component; also carries `.compose-window` CSS usage |
| `ComposeEditor.tsx` | `apps/staff-web/app/components/email/ComposeEditor.tsx` | `MessageEditor.tsx` | Identifier | NAME-04 — rename file + exported component; carries all `.compose-editor*` CSS usages (largest CSS dependency) |
| `ComposeBubbleToolbar.tsx` | `apps/staff-web/app/components/email/ComposeBubbleToolbar.tsx` | `MessageBubbleToolbar.tsx` | Identifier | NAME-04 — rename `Compose` prefix to `Message` prefix |
| `ComposeSlashMenu.tsx` | `apps/staff-web/app/components/email/ComposeSlashMenu.tsx` | `MessageSlashMenu.tsx` | Identifier | NAME-04 — rename `Compose` prefix to `Message` prefix |
| `CodeBlockLangPicker.tsx` | `apps/staff-web/app/components/email/CodeBlockLangPicker.tsx` | `CodeBlockLangPicker.tsx` — keep | Identifier | keep — neutral term, not email-vocabulary |
| `SnoozePopover.tsx` | `apps/staff-web/app/components/email/SnoozePopover.tsx` | `ScheduledMessagePopover.tsx` | Identifier | NAME-02/NAME-04 — "Snooze" is pure email metaphor; gym equivalent is "Scheduled Message"; review whether snooze functionality survives the v1.1 naming pass |
| `SnoozeModal.tsx` | `apps/staff-web/app/components/email/SnoozeModal.tsx` | `ScheduledMessageModal.tsx` | Identifier | NAME-02/NAME-04 — same reasoning as SnoozePopover |
| `InlineReplyComposer.tsx` | `apps/staff-web/app/components/email/InlineReplyComposer.tsx` | `InlineReplyComposer.tsx` — keep | Identifier | keep — "Reply" and "Inline" are neutral; "Composer" is acceptable for a reply input |
| `RecipientInput.tsx` | `apps/staff-web/app/components/email/RecipientInput.tsx` | `ContactInput.tsx` (optional) | Identifier | keep or rename — "Recipient" is email-shaped; `ContactInput` is gym-domain optional improvement; low priority |
| `AttachmentStrip.tsx` | `apps/staff-web/app/components/email/AttachmentStrip.tsx` | `AttachmentStrip.tsx` — keep | Identifier | keep — neutral term |
| `IntegrationsSidebar.tsx` | `apps/staff-web/app/components/email/IntegrationsSidebar.tsx` | `IntegrationsSidebar.tsx` — keep | Identifier | keep — neutral term |
| `MobileActionBar.tsx` | `apps/staff-web/app/components/email/MobileActionBar.tsx` | `MobileActionBar.tsx` — keep | Identifier | keep — neutral term |
| `SendLaterButton.tsx` | `apps/staff-web/app/components/email/SendLaterButton.tsx` | `SendLaterButton.tsx` — keep | Identifier | keep — "Send Later" is appropriate for scheduled WhatsApp messages; neutral to channel |
| `InboxPage.tsx` | `apps/staff-web/app/pages/InboxPage.tsx` | `MessagesPage.tsx` | Identifier | NAME-01 — primary page component for the messages/inbox surface; rename file + exported component; update all import sites |
| `DraftQueuePage.tsx` | `apps/staff-web/app/pages/DraftQueuePage.tsx` | `ScheduledMessagesPage.tsx` | Identifier | NAME-02 — "Draft Queue" is pure email; "Scheduled Messages" is the gym-domain equivalent (Wodify uses "Scheduled" badge); rename file + exported component |
| `gymos.inbox.tsx` (route file) | `apps/staff-web/app/routes/gymos.inbox.tsx` | `gymos.messages.tsx` | Identifier | NAME-03 — React Router route file rename corresponds to URL change; MUST be done in same atomic commit as Route layer rename + redirect shim |
| `GymosInbox` (component name inside gymos.inbox.tsx) | `apps/staff-web/app/routes/gymos.inbox.tsx:629` (`export default function GymosInbox()`) | `GymosMessages` | Identifier | NAME-03 — rename default export to match new route file name |

---

## Route Layer

Every hardcoded URL path string (`navigate(...)`, `to="..."`, `<Link to=...>`, `redirect(...)`, `href=...`). Route renames affect live users — every renamed route MUST have a redirect shim.

| Current name | File path(s) + line refs | Proposed target | Rename layer | Risk note |
|---|---|---|---|---|
| `/gymos/inbox` | `apps/staff-web/app/components/gymos/GymosTopNav.tsx:60` (`<Link to="/gymos/inbox">`); `apps/staff-web/app/routes/gymos.inbox.tsx:551,593` (two `redirect(...)` return values); `:667` (`<Link to="/gymos/inbox">`); `:680` (`<Link to="/gymos/inbox?filter=leads">`); `:705` (inside conversation list `to=` prop); `:785` (`<Link to=\`/gymos/inbox?conversation=...\`>`) | `/gymos/messages` | Route | NAME-03 — needs redirect shim per R-06; ALL refs must update atomically in one commit; add `loader = () => redirect('/gymos/messages', 301)` to `gymos.inbox.tsx` BEFORE renaming the file to `gymos.messages.tsx`; live customer Hustle uses this URL daily |
| `/gymos/inbox?filter=leads` | `apps/staff-web/app/routes/gymos.inbox.tsx:680` | `/gymos/messages?filter=leads` | Route | NAME-03 — redirect shim on the base route covers this if React Router redirect preserves query params; verify on Vercel preview |
| `/inbox` | `apps/staff-web/app/components/layout/AppLayout.tsx:820` (`navigate("/inbox")`); `apps/staff-web/app/components/layout/CommandPalette.tsx:122` (`navigate('/inbox?q=')`); `apps/staff-web/app/components/layout/SearchBar.tsx:77,88` (`navigate('/inbox?q=...')`); `apps/staff-web/app/pages/NotFound.tsx:13` (`<Link to="/inbox">`) | `/gymos/messages` | Route | Already redirected — `apps/staff-web/app/routes/$view.tsx` redirects all legacy mail routes to `/gymos`; the hardcoded refs above still need updating to point to `/gymos/messages` for clarity, but are LOW risk since redirect covers them |
| `/starred` | `apps/staff-web/app/components/layout/AppLayout.tsx:825` (`navigate("/starred")`), `:1391,1749` (`href: "/starred"`) | Remove or redirect to `/gymos/messages` | Route | Legacy email nav — `$view.tsx` redirects to `/gymos`; these hardcoded refs in AppLayout.tsx are mail-template legacy; update to `/gymos/messages` or remove if AppLayout is retired in R3 |
| `/sent` | `apps/staff-web/app/components/layout/AppLayout.tsx:826` (`navigate("/sent")`), `:1393,1751` | Remove or redirect to `/gymos/messages` | Route | Legacy email nav — same as `/starred`; update or remove |
| `/drafts` | `apps/staff-web/app/components/layout/AppLayout.tsx:827` (`navigate("/drafts")`), `:1404,1762` | Remove or redirect to `/gymos/messages` | Route | Legacy email nav — same as `/starred`; update or remove |
| `/archive` | `apps/staff-web/app/components/layout/AppLayout.tsx:828,829` (`navigate("/archive")` twice), `:1405,1763` | Remove or redirect to `/gymos/messages` | Route | Legacy email nav — same pattern; `g,a` and `g,e` keyboard shortcuts both navigate to `/archive` |
| `/trash` | `apps/staff-web/app/components/layout/AppLayout.tsx:830` (`navigate("/trash")`), `:1406,1764` | Remove or redirect to `/gymos/messages` | Route | Legacy email nav — same pattern |
| `/draft-queue` | `apps/staff-web/app/pages/InboxPage.tsx:445,446`; `apps/staff-web/app/pages/DraftQueuePage.tsx:646,647`; `apps/staff-web/app/components/layout/AppLayout.tsx:92,93,1397,1701,1755` | `/gymos/scheduled` (proposed) or retire if surface is retired in R3 | Route | NAME-02 — mail-template legacy route; if `DraftQueuePage` is renamed to `ScheduledMessagesPage` and retired from the main nav, add redirect shim; AppLayout refs suggest it is still rendered as a nav item in the mail-template layout |
| `/draft-queue/:id` | `apps/staff-web/app/pages/DraftQueuePage.tsx:727` (`navigate('/draft-queue/${id}')`) | `/gymos/scheduled/:id` (proposed) | Route | NAME-02 — redirect shim needed if route is renamed; low user exposure (mail-template UI not in coach daily path) |
| `/settings?alias=...` | `apps/staff-web/app/components/email/RecipientInput.tsx:102` (`navigate('/settings?alias=${alias.id}')`) | `/gymos/settings/integrations` or retire | Route | Mail-template settings path; `RecipientInput` is in the email component tree; if `ComposeModal` is retired or re-purposed, this path may not be reachable; mark for R3 review |

---

## NAME-05 — Do Not Touch (DB-adjacent)

These identifiers are stored as string values in Postgres columns. Changing them requires a multi-step additive migration (add new value, backfill, drop old value) — NEVER in a single migration, NEVER during the redesign milestone. They may surface as display labels; ONLY the display label may change.

| DB identifier | Table.column | Current display use | Proposed display label | Risk note |
|---|---|---|---|---|
| `"open"` | `conversations.status` enum: `["open", "closed", "snoozed", "lead"]` | Shown nowhere directly as a label — used programmatically to determine if conversation is active | Display label only; DB identifier/enum value `"open"` UNTOUCHED per NAME-05 (drizzle-kit#1409 + live-DB table-lock risk) | NAME-05 do-not-touch — display label only; DB identifier UNTOUCHED |
| `"closed"` | `conversations.status` | Not shown as label | Display label only | NAME-05 do-not-touch |
| `"snoozed"` | `conversations.status` | Not shown as label in current gymos.inbox.tsx; badge may surface this | Display label only; if shown as `"Snoozed"` badge, display copy is `"Snoozed"` (acceptable gym-domain: "scheduled for later") | NAME-05 do-not-touch |
| `"lead"` | `conversations.status` | Filter chip label `"Leads"` (already gym-domain) | keep `"Leads"` as display label — already correct | NAME-05 do-not-touch — `"lead"` DB value stays; tab chip label `"Leads"` is correct |
| `"scheduled"` | `class_occurrences.status` enum: `["scheduled", "cancelled", "completed"]` | Not surfaced as label; used to filter upcoming classes | Display label only | NAME-05 do-not-touch |
| `"booked"` | `bookings.status` enum: `["booked", "waitlist", "cancelled", "attended", "no_show"]` | Booking confirmation states; "booked" may surface as a badge | Display label only; if shown: `"Booked"` ✓ gym-domain | NAME-05 do-not-touch |
| `"no_show"` | `bookings.status` | May surface as badge/label | Display label: `"No Show"` (split words for readability) | NAME-05 do-not-touch — display label only; `"no_show"` DB value untouched |
| `"attended"` | `bookings.status` | May surface as badge/label | Display label: `"Attended"` ✓ gym-domain | NAME-05 do-not-touch |
| `"draft"` | `forms.status` enum: `["draft", "published", "closed"]` | Used internally for form builder state | Display label: `"Draft"` — acceptable; forms are not part of gym-domain naming concern | NAME-05 do-not-touch |
| `"pending"` | `webhook_events.status` enum: `["pending", "processing", "done", "cancelled"]` | Worker-internal; not user-visible | No display change needed | NAME-05 do-not-touch — worker-internal state only |

---

## R3/R4/R5 Scope Derivation

This section makes explicit which tables feed which phase, satisfying phase success criterion 3: "a reader can derive the R3 (and R5 mobile naming) scope from NAMING-RECORD.md without re-auditing the codebase."

**R3 — Naming and IA Pass** consumes the Label, CSS, Identifier, and Route layers. The ordering within R3 is: Label layer first (user-visible copy changes only, zero code risk), then CSS layer (atomic with the component render sites, per R-12), then Identifier layer (file/component renames, zero user impact), then Route layer last (requires redirect shims confirmed on Vercel deploy before old routes are removed, per R-06). Within R3: NAME-01 (Messages surface label), NAME-02 (Scheduled Messages label), NAME-03 (route rename + shim), NAME-04 (component identifier renames), NAME-05 (do-not-touch guard). Every row in the Label, CSS, Identifier, and Route tables above maps directly to an R3 task.

**R4 — Staff Web and Embed Widgets** consumes the widget vocabulary rows from the Label layer: the `"Enquire"` CTA review (NAME-06 — confirm whether booking flow warrants `"Book"` vs lead-enquiry stays `"Enquire"`), the `"Send Enquiry"` form submit (WDGT-02 validates this), and any member-profile label improvements (`"Member Profile"` heading, `"Pass Balance: X credits"` display) from NAME-07. R4 also validates that no `.email-*` CSS class names remain after R3's CSS pass (R-12 verification criterion).

**R5 — Member Mobile App** consumes the mobile tab label rows from the Label layer: `"Schedule"` → `"Classes"` (MOBL-02), `"Food"` → `"Log"` (MOBL-02), and the new `"Passes"` tab addition. The mobile tab renames are label-layer only (zero DB impact, zero route impact — Expo Router uses file-based routing and tab `title` props). R5 also confirms no hardcoded hex values remain in `StyleSheet.create` calls (R-04 verification criterion, separate from naming).

---

*Phase: R1-audit-baseline*
*Produced: 2026-06-12*
*Satisfies: AUDT-02*
