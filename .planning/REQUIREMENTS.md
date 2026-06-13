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
- [ ] **SWEB-03**: Member Context panel in conversations shows pass-balance pill, next-class card, and last visit as prominent scannable widgets — card hierarchy, not a data table
- [x] **SWEB-04**: Member Profile shows pass-balance pill, next-class card, and bookings timeline
- [ ] **SWEB-05**: Members directory defaults to card view (avatar, membership pill, next class); table remains as a secondary/filter view
- [ ] **SWEB-06**: Messages is responsive — single column at mobile widths with member context as a bottom sheet (coaches check from phones on the gym floor)
- [ ] **SWEB-07**: Role-based nav — coaches see Schedule/Messages/Members; admins additionally see Payments/Settings
- [ ] **SWEB-08**: Staff web defaults to light theme (studio back-office is a lit environment)

### Public Widgets

- [ ] **WDGT-01**: `/embed/schedule` renders a clean card-based layout with no admin chrome, themed by studio tokens (existing iframe isolation retained — no Shadow DOM work)
- [ ] **WDGT-02**: Lead-capture form is styled with studio tokens and uses "Enquiry" vocabulary (UK boutique convention — Hustle is Norwich, UK)
- [ ] **WDGT-03**: Both embeds verified rendering correctly inside an iframe on a test host page (light and dark host backgrounds)

### Member Mobile App

- [ ] **MOBL-01**: `packages/mobile-app/lib/theme.ts` token file exists; all hardcoded hex values across mobile screens are replaced with theme references
- [ ] **MOBL-02**: Bottom tabs are renamed Home / Classes / Passes / Log / Profile
- [ ] **MOBL-03**: High-contrast dark theme is the member app default (gym/workout usage context)
- [ ] **MOBL-04**: Home tab shows next class, pass balance, and latest coach message as hero content
- [ ] **MOBL-05**: Booking flow is ≤3 steps (select → confirm with pass/drop-in choice → done) with a persistent pass-balance pill
- [ ] **MOBL-06**: Noticeboard is reframed in coach voice ("From your coach" / "Studio updates") — not a notification feed
- [ ] **MOBL-07**: Inter loads via `useFonts` with OTF assets (Expo Go compatible); skin is selected via `EXPO_PUBLIC_STUDIO_SKIN` at EAS build time

## Future Requirements

Deferred — tracked but not in the v1.1 roadmap.

### Design System

- **DSGN-F1**: Dark-mode toggle for staff web (light stays default)
- **DSGN-F2**: style-dictionary token pipeline (only if a second studio brings Figma-managed brand tokens)
- **DSGN-F3**: react-native-unistyles theming (blocked until EAS Dev Client replaces Expo Go)

### Public Widgets

- **WDGT-F1**: Script-injected (non-iframe) embed mode — requires Shadow DOM from day one (PITFALLS R-05 standing constraint)
- **WDGT-F2**: `?theme=light|dark` URL param for embed host pages

## Out of Scope

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
| SWEB-03 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| SWEB-04 | R4. Staff Web Visual Refresh + Embed Widgets | Complete |
| SWEB-05 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| SWEB-06 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| SWEB-07 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| SWEB-08 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| WDGT-01 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| WDGT-02 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| WDGT-03 | R4. Staff Web Visual Refresh + Embed Widgets | Pending |
| MOBL-01 | R5. Member Mobile App Redesign | Pending |
| MOBL-02 | R5. Member Mobile App Redesign | Pending |
| MOBL-03 | R5. Member Mobile App Redesign | Pending |
| MOBL-04 | R5. Member Mobile App Redesign | Pending |
| MOBL-05 | R5. Member Mobile App Redesign | Pending |
| MOBL-06 | R5. Member Mobile App Redesign | Pending |
| MOBL-07 | R5. Member Mobile App Redesign | Pending |

**Coverage:**
- v1.1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-12*
*Last updated: 2026-06-12 — traceability section populated (roadmap R1–R5 created)*
