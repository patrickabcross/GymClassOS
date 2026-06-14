---
phase: R1-audit-baseline
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/R1-audit-baseline/NAMING-RECORD.md
autonomous: true
requirements: [AUDT-02]
must_haves:
  truths:
    - "A reader can derive the full scope of R3 (and mobile naming for R5) from NAMING-RECORD.md without re-auditing the codebase"
    - "Every email-vocabulary UI label, CSS class, code identifier, and route is listed and classified by rename layer"
    - "Each item carries current name, file path + line refs, proposed gym-domain target, and a risk note"
    - "Mobile tab names (MOBL-02) and widget vocabulary (NAME-06 Book, WDGT-02 Enquiry) are included in the record"
    - "DB-adjacent identifiers are marked do-not-touch per NAME-05"
  artifacts:
    - path: ".planning/phases/R1-audit-baseline/NAMING-RECORD.md"
      provides: "Single-document naming decision record, one table per rename layer, all three surfaces"
      min_lines: 120
      contains: "## Route Layer"
  key_links:
    - from: "NAMING-RECORD.md route table"
      to: "R3 route-rename + redirect-shim work (NAME-03)"
      via: "proposed-target + risk-note columns"
      pattern: "redirect shim|redirect\\(\\)"
---

<objective>
Produce the naming decision record: a single markdown document inventorying every email-vocabulary UI label, CSS class, code identifier, and route across staff-web, embeds, and mobile — each classified by rename layer with a proposed gym-domain target and a risk note. This is the intellectually load-bearing artifact of R1: it gates the scope of R3 (Naming & IA) and the naming portions of R4/R5.

Purpose: R3 must be mechanically executable from this record without re-auditing the codebase (success criterion 3 of the phase). Satisfies AUDT-02.
Output: `.planning/phases/R1-audit-baseline/NAMING-RECORD.md`
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/R1-audit-baseline/R1-CONTEXT.md
@.planning/phases/R1-audit-baseline/R1-RESEARCH.md
@.planning/research/FEATURES.md
@.planning/research/PITFALLS.md

<naming_inputs>
<!-- These were confirmed by direct codebase inspection in R1-RESEARCH.md. Use as the seed; the executor MUST re-grep to confirm line numbers are current and to catch any items research missed. -->

CURRENT STAFF NAV (apps/staff-web/app/components/gymos/GymosTopNav.tsx):
  Home | Inbox | Schedule | Members | Payments | Analytics | Campaigns | Forms | Settings | Sign out
PROPOSED (NAME-01): Home | Messages | Schedule | Members | Payments | Settings (Payments/Settings admin-gated per SWEB-07)

CURRENT MOBILE TABS (packages/mobile-app/app/(tabs)/_layout.tsx):
  Home | Schedule | Food | Profile
PROPOSED (MOBL-02): Home | Classes | Passes | Log | Profile
  (mobile "Schedule" → "Classes" to avoid collision with staff nav; "Food" → "Log")

EMAIL-VOCABULARY CSS CLASSES (apps/staff-web/app/global.css, 749 lines):
  .email-list-row (lines ~77-237, 15+ rules, .row-action-rail/.hover-actions/.row-time) — rendered by EmailListItem.tsx:424 → propose .conversation-row
  .email-body-content (lines ~99-123, prose reset) — rendered by EmailThread.tsx:2151 → propose .message-body-content
  .compose-window (line ~162) — ComposeModal.tsx → propose .message-composer-window
  .compose-editor-wrapper / .compose-editor / .compose-editor * (lines ~286-577) — ComposeEditor.tsx → propose .message-editor-wrapper / .message-editor

EMAIL-VOCABULARY COMPONENT FILES (apps/staff-web/app/components/email/, 27 files):
  EmailList.tsx → ConversationList.tsx
  EmailListItem.tsx → ConversationListItem.tsx
  EmailThread.tsx → ConversationThread.tsx
  ComposeModal.tsx → MessageComposerModal.tsx
  ComposeEditor.tsx → MessageEditor.tsx
  CodeBlockLangPicker/ComposeBubbleToolbar/ComposeSlashMenu/ComposeImageBlock/SnoozePopover/SnoozeModal — Compose* prefix → Message* prefix
  InlineReplyComposer.tsx / RecipientInput.tsx / AttachmentStrip.tsx / IntegrationsSidebar.tsx — neutral, keep (note RecipientInput optional → ContactInput)

USER-VISIBLE LABELS (apps/staff-web/app/routes/gymos.inbox.tsx):
  "WhatsApp Inbox" heading (~line 653) → "Messages"
  "Inbox" tab chip (~line 677) → "Messages" or "All"
  "Leads" tab chip (~line 680) → keep (gym-domain)
  page <title> "GymClassOS — WhatsApp Inbox" (~line 64) → "GymClassOS — Messages"

HARDCODED ROUTE REFS (route + identifier layers — from PITFALLS R-06, re-grep to confirm lines):
  GymosTopNav.tsx:60 to="/gymos/inbox" → /gymos/messages
  gymos.inbox.tsx:551,593,667,680,705,785 /gymos/inbox refs → update atomically
  AppLayout.tsx:820 navigate("/inbox") — legacy $view, redirects, low risk
  AppLayout.tsx:825-830 /starred,/sent,/drafts,/archive,/trash — legacy, redirect to /gymos
  CommandPalette.tsx:122 navigate('/inbox?q=') — legacy
  SearchBar.tsx:77,88 /inbox?q=... — legacy
  NotFound.tsx:13 <Link to="/inbox"> — legacy
  RecipientInput.tsx:102 navigate('/settings?alias=...') — mail-template settings path
  gymos.members.tsx:175 "← Back to inbox" — user-visible label
  gymos.payments.tsx:52 "← Back to inbox" — user-visible label
  DraftQueuePage.tsx:713 navigate("/settings"); :727 /draft-queue/:id — legacy

WIDGET VOCABULARY (NAME-06 / WDGT-02):
  Booking CTA on every class surface must read "Book" (never Reserve/Enrol/Register) — inventory current CTA copy in /embed/schedule + mobile booking + staff schedule
  Lead-capture form must use "Enquiry" vocabulary (UK convention) — inventory current form copy (features/forms + /f/<slug> + embed form)

DB-ADJACENT — NAME-05 (do-not-touch, inventory only):
  conversations.status enum values, gym_members columns, schedule enum strings — list any that surface as labels but mark "display label only; DB identifier untouched"
</naming_inputs>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Grep-audit all four rename layers across staff-web, embeds, and mobile</name>
  <read_first>
    - .planning/phases/R1-audit-baseline/R1-RESEARCH.md (the confirmed inventory + line refs — seed for the audit)
    - .planning/research/FEATURES.md (Naming Recommendations Table + Competitor Vocabulary Map — the source of proposed target names)
    - .planning/research/PITFALLS.md (R-06 hardcoded routes, R-12 CSS orphaning — risk-note sources)
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (current nav labels — confirm)
    - apps/staff-web/app/routes/gymos.inbox.tsx (user-visible "WhatsApp Inbox"/"Inbox"/"Leads" labels — confirm line numbers)
    - apps/staff-web/app/global.css (email-* and compose-* CSS classes — confirm line ranges)
    - packages/mobile-app/app/(tabs)/_layout.tsx (current mobile tab labels — confirm)
  </read_first>
  <action>
    Run a grep-driven audit to produce the raw inventory for all four rename layers. Use the `<naming_inputs>` block in context as the seed list, then re-grep to confirm current line numbers and surface anything research missed.

    Run these greps (case-insensitive where noted) and record every hit with file path + line number:
    1. Email vocabulary in user-visible strings — grep -rni for: "inbox", "compose", "draft", "draft queue", "email", "snooze", "archive", "sent", "starred" across `apps/staff-web/app/routes/` and `apps/staff-web/app/components/`. Classify each hit as a LABEL (user-visible copy) vs IDENTIFIER (component/var name) vs ROUTE (path string).
    2. CSS classes — grep -rn for `\.email-` and `\.compose-` in `apps/staff-web/app/global.css`. Record each class block with its line range and the component file that renders it (grep for `email-list-row`, `email-body-content`, `compose-window`, `compose-editor` usages in `apps/staff-web/app/components/email/`).
    3. Component files — list `apps/staff-web/app/components/email/` (all files) and any file whose name starts with `Email`/`Compose`/`Draft`/`Snooze`. Each is an IDENTIFIER-layer item.
    4. Routes — list `apps/staff-web/app/routes/` and grep for hardcoded route strings: `/inbox`, `/gymos/inbox`, `/draft-queue`, `/settings`, `/starred`, `/sent`, `/drafts`, `/archive`, `/trash`, `/snoozed`, `/team`, `/email`. Record every hardcoded `navigate(...)`, `to="..."`, `redirect(...)`, `<Link to=...>` occurrence with file + line.
    5. Mobile — grep `packages/mobile-app/app/` for tab `title`/`name` props in `(tabs)/_layout.tsx` and any "Food"/"Schedule" user-visible strings.
    6. Widget vocabulary — grep `apps/staff-web/server/routes/embed/`, `apps/staff-web/features/forms/`, and `apps/staff-web/features/marketing/` for booking CTA copy ("Book"/"Reserve"/"Enrol"/"Register"/"Sign up") and lead-form copy ("Enquiry"/"Sign up"/"Contact").

    Capture the raw results (file:line + matched string) into a working scratch list. Do NOT write the final document yet — Task 2 formats it. If a grep surfaces an item not in `<naming_inputs>`, ADD it (the seed is a floor, not a ceiling).

    For each item, determine its rename layer: LABEL (user-visible copy), CSS (class name), IDENTIFIER (component/file/variable name), or ROUTE (path). An item can appear in multiple layers (e.g. EmailListItem.tsx is an IDENTIFIER, but its `.email-list-row` class is CSS, and the "Inbox" text it shows is a LABEL) — list it once per layer it belongs to.
  </action>
  <verify>
    <automated>cd "C:/Users/dimet/gymclassos-br1" && grep -rniE "inbox|compose|draft" apps/staff-web/app/routes/gymos.inbox.tsx | head -5 && grep -nE "\.(email|compose)-" apps/staff-web/app/global.css | head -5</automated>
  </verify>
  <acceptance_criteria>
    - grep of `apps/staff-web/app/global.css` for `\.email-` returns at least the `.email-list-row` and `.email-body-content` classes (confirms CSS layer inventory is grounded in real lines)
    - grep of `apps/staff-web/app/routes/gymos.inbox.tsx` for "Inbox" returns the user-visible heading/tab strings (confirms label layer)
    - `ls apps/staff-web/app/components/email/` lists the Email*/Compose* component files (confirms identifier layer)
    - Working scratch list exists covering all four layers across staff-web, embeds, and mobile (verified by Task 2 consuming it)
  </acceptance_criteria>
  <done>Raw grep inventory captured for LABEL, CSS, IDENTIFIER, and ROUTE layers across staff-web, embeds, and mobile, with file:line provenance for every item.</done>
</task>

<task type="auto">
  <name>Task 2: Write NAMING-RECORD.md — one table per rename layer, all three surfaces, full provenance</name>
  <read_first>
    - .planning/phases/R1-audit-baseline/R1-CONTEXT.md (D-09..D-16 — format and field decisions)
    - .planning/research/FEATURES.md (Naming Recommendations Table — proposed target names)
    - The scratch inventory from Task 1
  </read_first>
  <action>
    Write `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` per D-10/D-11: a single markdown document with ONE TABLE PER RENAME LAYER. Required structure:

    Top matter:
    - Title + purpose line: "Naming decision record for v1.1 UI Redesign. Inventories every email-vocabulary item across staff-web, embeds, and mobile. R3/R4/R5 naming work executes from this record without re-auditing."
    - A "How to read this" note: four layers (Label / CSS / Identifier / Route), proposed targets drawn from FEATURES.md Naming Recommendations Table + NAME-01..07, risk notes flag redirect-shim needs (R-06), CSS-orphaning (R-12), and DB-do-not-touch (NAME-05).
    - A "Surface coverage" note listing the three surfaces covered.

    Then FOUR tables (in this order), each with columns: `Current name | File path(s) + line refs | Proposed target | Rename layer | Risk note`:

    1. `## Label Layer` — user-visible copy. Must include at minimum: "WhatsApp Inbox" heading → "Messages"; "Inbox" tab chip → "Messages"/"All"; page <title> "GymClassOS — WhatsApp Inbox" → "GymClassOS — Messages"; "← Back to inbox" labels in gymos.members.tsx + gymos.payments.tsx → "← Back to Messages"; nav labels Home|Inbox|Schedule|Members|Payments|Analytics|Campaigns|Forms|Settings → Home|Messages|Schedule|Members|Payments|Settings (note Payments/Settings admin-gated per SWEB-07); mobile tabs Home|Schedule|Food|Profile → Home|Classes|Passes|Log|Profile; booking CTA copy → "Book" per NAME-06; lead-form copy → "Enquiry" per WDGT-02; member detail heading → "Member Profile" + pass balance → "X credits" per NAME-07. Risk note for nav: "deferred to R3 NAME-01; label-layer first per ordering constraint".

    2. `## CSS Layer` — every `.email-*` and `.compose-*` class. Must include: `.email-list-row` → `.conversation-row` (risk: "R-12 orphaning — additive alias first, migrate atomically with EmailListItem"); `.email-body-content` → `.message-body-content`; `.compose-window` → `.message-composer-window`; `.compose-editor-wrapper` → `.message-editor-wrapper`; `.compose-editor` (and `.compose-editor *`) → `.message-editor`. Each row cites global.css line range + the rendering component file.

    3. `## Identifier Layer` — component/file/variable names. Must include: EmailList→ConversationList, EmailListItem→ConversationListItem, EmailThread→ConversationThread, ComposeModal→MessageComposerModal, ComposeEditor→MessageEditor, Compose*→Message* (CodeBlockLangPicker/ComposeBubbleToolbar/ComposeSlashMenu/ComposeImageBlock/SnoozePopover/SnoozeModal), InboxPage→MessagesPage, DraftQueuePage→ScheduledMessagesPage (per NAME-02/NAME-04). Mark neutral files (InlineReplyComposer, AttachmentStrip, IntegrationsSidebar) "keep". Risk note: "NAME-04 — rename only after label layer stable".

    4. `## Route Layer` — every hardcoded route string. Must include: `/gymos/inbox` → `/gymos/messages` (risk: "NAME-03 — needs redirect shim per R-06; refs in GymosTopNav.tsx:60 + gymos.inbox.tsx multiple lines update atomically"); legacy `/inbox`,`/starred`,`/sent`,`/drafts`,`/archive`,`/trash`,`/snoozed` (risk: "already redirects to /gymos via $view.tsx; hardcoded refs in AppLayout.tsx:825-830, CommandPalette.tsx:122, SearchBar.tsx, NotFound.tsx — low risk, redirect covers them"); `/draft-queue` + `/draft-queue/:id` (risk: "legacy mail-template, not retired; redirect shim if surfaced"); `/settings?alias=...` in RecipientInput.tsx (mail-template path). Each row cites every file:line where the route is hardcoded.

    Then a final section:
    5. `## NAME-05 — Do Not Touch (DB-adjacent)` — list any conversations.status enum values, gym_members columns, or schedule enum strings that surface as labels. Each marked "display label only; DB identifier/enum value UNTOUCHED per NAME-05 (drizzle-kit#1409 + live-DB table-lock risk)".

    6. `## R3/R4/R5 Scope Derivation` — a short prose paragraph per phase stating which tables feed which phase: R3 (NAME-*) consumes Label + Identifier + Route layers; R4 widget vocabulary consumes the Book/Enquiry label rows; R5 consumes the mobile tab label rows. This makes success criterion 3 (derive R3 scope without re-auditing) explicit.

    Every table row MUST have a non-empty proposed-target and risk-note cell. If a target is "keep" (neutral term), say "keep — already gym-domain". Cite line numbers from Task 1's confirmed grep, not from the seed (the seed lines may have drifted).
  </action>
  <verify>
    <automated>cd "C:/Users/dimet/gymclassos-br1" && test -f .planning/phases/R1-audit-baseline/NAMING-RECORD.md && grep -cE "^## (Label|CSS|Identifier|Route) Layer" .planning/phases/R1-audit-baseline/NAMING-RECORD.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` exists
    - `grep -cE "^## (Label|CSS|Identifier|Route) Layer"` returns 4 (all four layer tables present)
    - `grep -q "redirect shim" NAMING-RECORD.md` succeeds (route risk notes flag shim need per R-06/NAME-03)
    - `grep -q "NAME-05" NAMING-RECORD.md` succeeds (do-not-touch section present)
    - `grep -qi "conversation-row" NAMING-RECORD.md` succeeds (CSS layer proposes the rename)
    - `grep -qiE "Classes|Passes|Log" NAMING-RECORD.md` succeeds (mobile tab targets per MOBL-02 included)
    - `grep -qiE "Enquiry" NAMING-RECORD.md` succeeds (WDGT-02 widget vocabulary included)
    - `grep -q "R3/R4/R5 Scope Derivation" NAMING-RECORD.md` succeeds (scope-derivation section present — satisfies phase success criterion 3)
    - Every row in all four tables has a non-empty proposed-target and risk-note column (no empty `| |` cells in table bodies — verify by reading the file)
  </acceptance_criteria>
  <done>NAMING-RECORD.md exists as a single document with four per-layer tables plus NAME-05 do-not-touch and R3/R4/R5 scope-derivation sections; every item has full provenance (current name, file:line, proposed target, layer, risk note); covers all three surfaces.</done>
</task>

</tasks>

<verification>
- `NAMING-RECORD.md` exists with four layer tables (Label / CSS / Identifier / Route)
- Route table flags redirect-shim needs (NAME-03 / R-06)
- CSS table flags orphaning risk (R-12) with additive-alias-first guidance
- DB-adjacent items present and marked do-not-touch (NAME-05)
- Mobile tab renames (MOBL-02) and widget vocabulary (NAME-06 Book / WDGT-02 Enquiry) included
- Scope-derivation section lets a reader derive R3 scope without re-auditing
</verification>

<success_criteria>
A reader can plan R3 (and the naming portions of R4/R5) entirely from NAMING-RECORD.md. Satisfies AUDT-02 and phase success criteria 2 and 3.
</success_criteria>

<output>
After completion, create `.planning/phases/R1-audit-baseline/R1-01-SUMMARY.md`
</output>
