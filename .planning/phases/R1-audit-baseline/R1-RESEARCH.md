# Phase R1: Audit Baseline — Research

**Researched:** 2026-06-12
**Domain:** Playwright screenshot capture against a live Vercel deploy; email-vocabulary codebase audit for a React Router v7 / Tailwind v4 staff-web app; mobile Expo Go screen inventory
**Confidence:** HIGH — all findings are from direct codebase inspection (grep + file reads); no external sources needed for a documentation-only phase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Capture via a committed Playwright script run locally against the live Vercel deploy (`gym-class-os.vercel.app`). Same script re-runs for after-state captures in R2–R4.
- **D-02:** Two web viewports: 1440px (desktop) and 390px (mobile width).
- **D-03:** Auth via saved Playwright `storageState` — log in once manually through Google OAuth in a Playwright-launched browser, persist session cookies to a gitignored `storageState.json`, script reuses it. No code/config changes to the live app.
- **D-04:** Embed widgets captured on both light and dark host test pages — matching WDGT-03's exact verification setup so R4 reuses the same harness.
- **D-05:** Staff-web coverage = all user-facing routes including still-routable legacy email routes (`/draft-queue`, `/draft-queue/:id`, `/settings`, `$view` inbox surfaces, `/team`), explicitly excluding `/email`. API routes and webhook routes are excluded.
- **D-06:** Capture pages plus a named list of key interaction states: member context panel open in a conversation, Templates dialog, schedule booking dialog, member detail view.
- **D-07:** Mobile screenshots are captured by the user on a real phone via Expo Go. Claude delivers a checklist of screens with exact target filenames; user captures and drops files in.
- **D-08:** Mobile scope = all screens + agent sheet: 4 tabs (Home, Schedule, Food, Profile) + member picker + food-add search + food-barcode scanner + agent chat sheet open.
- **D-09:** Naming record depth = inventory + propose target names now, applying NAME-01..07 + FEATURES.md Naming Recommendations Table item-by-item so R3 is mechanically executable.
- **D-10:** Format = single markdown document with one table per rename layer (label / CSS class / code identifier / route).
- **D-11:** Per-item fields = current name | file path(s) + line refs | proposed target | rename layer | risk note.
- **D-12:** Record scope = all three surfaces: staff-web email vocabulary + mobile tab names (MOBL-02) + widget vocabulary (Book CTA per NAME-06, Enquiry per WDGT-02).
- **D-13:** Organization = per-surface folders: `baseline/staff-web/`, `baseline/embeds/`, `baseline/mobile/`, filename convention `<route-slug>.<viewport>[.<state>].png`.
- **D-14:** An INDEX.md manifest accompanies the screenshots: every capture listed with route/screen, viewport, state, capture date, and the deployed commit SHA. After-state runs check coverage parity.
- **D-15:** Capture script lives in `scripts/ui-baseline/` in the repo, parameterized by output directory.
- **D-16:** Baseline is built for side-by-side human review, not pixel-diff tooling. Consistent viewports + mirrored filenames make manual comparison meaningful.

### Claude's Discretion

- Exact Playwright config details (wait strategies, animation settling, full-page vs viewport capture)
- Exact set of legacy `$view` route variants worth capturing (capture what's reachable; skip duplicates)
- Structure/section ordering of the naming decision record beyond the per-layer tables
- The embed test page implementation (static HTML file per STATE.md verification method)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDT-01 | Before-state screenshots of every staff-web surface, embed widget, and mobile screen captured into `.planning/ui-reviews/baseline/` | Route inventory (Standard Stack section), Playwright storageState workflow (Architecture Patterns), embed test page pattern (Code Examples) |
| AUDT-02 | Complete rename inventory (every email-vocabulary UI label, code identifier, CSS class, and route) as a naming decision record, classified by rename layer | CSS class inventory (Standard Stack section), hardcoded route refs (Common Pitfalls R-06), component file inventory (Architecture Patterns), naming targets from FEATURES.md Naming Recommendations Table |

</phase_requirements>

---

## Summary

Phase R1 is documentation-only. No app code changes. Two deliverables: (1) committed screenshots of every deployed surface before the redesign begins, and (2) a naming decision record that inventories every email-vocabulary item across staff-web, embeds, and mobile so R3 can execute mechanically.

The technical domain is shallow: write a Playwright Node.js script that authenticates via saved storageState and captures full-page screenshots of a list of URLs, then produce two static HTML embed test pages (light and dark host background). The heavier intellectual work is the naming record — a complete grep-driven audit of email vocabulary in `apps/staff-web/app/` with proposed gym-domain replacements drawn from the FEATURES.md Naming Recommendations Table.

All captures run against `https://gym-class-os.vercel.app` (the live `master` deploy — SHA `cdec3a18` at research time). The `redesign/ui-refresh` branch has not been pushed to Vercel yet; the before-state IS the live master deploy.

**Primary recommendation:** Write the Playwright script first, capture all web screens, then write the naming record. The script is mechanical; the naming record is the intellectually load-bearing artifact that gates R3–R5 scope.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.58.2 (confirmed installed globally) | Screenshot capture script | Already installed on this machine; no installation step needed |
| Node.js | 24.16.0 (confirmed) | Runtime for the Playwright script | Already available |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Static HTML file | N/A | Embed test page (light + dark host pages) | One HTML file per host-background color; no server required — opened via `file://` or `http://` against a static file server |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@playwright/test` (scripted) | Playwright Test framework with `test()` blocks | Test framework adds assertion setup; for screenshot-only capture, a plain script (`node capture.mjs`) is simpler and has no jest/vitest dependency |
| Static HTML for embed test pages | A local dev server | No local dev server exists (NitroViteError constraint); static HTML opened in Playwright is sufficient since the embed iframes point to the live Vercel URL |

**Installation:** No installation needed. Playwright 1.58.2 is already installed globally. The capture script runs as `node scripts/ui-baseline/capture.mjs`.

**Version verification:** Playwright version confirmed: `Version 1.58.2` (via `npx playwright --version`).

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/ui-baseline/
├── capture.mjs              # Main script — authenticates + captures all URLs
├── storageState.json        # GITIGNORED — saved Google OAuth session
├── embed-light.html         # Static host page (white background)
├── embed-dark.html          # Static host page (dark background)
└── README.md                # How to re-run captures + re-auth instructions

.planning/ui-reviews/
└── baseline/
    ├── INDEX.md             # Manifest: every capture + route/screen/viewport/state/SHA
    ├── staff-web/
    │   ├── gymos-home.desktop.png
    │   ├── gymos-home.mobile.png
    │   ├── gymos-inbox.desktop.png
    │   ├── gymos-inbox.mobile.png
    │   ├── gymos-inbox.desktop.context-panel.png
    │   ├── gymos-inbox.desktop.templates-dialog.png
    │   ├── gymos-inbox.desktop.leads.png
    │   ├── gymos-schedule.desktop.png
    │   ├── gymos-schedule.mobile.png
    │   ├── gymos-schedule.desktop.booking-dialog.png
    │   ├── gymos-members.desktop.png
    │   ├── gymos-members.mobile.png
    │   ├── gymos-members-id.desktop.png
    │   ├── gymos-payments.desktop.png
    │   ├── gymos-analytics.desktop.png
    │   ├── gymos-campaigns.desktop.png
    │   ├── gymos-forms.desktop.png
    │   ├── gymos-settings-integrations.desktop.png
    │   ├── draft-queue.desktop.png
    │   ├── settings.desktop.png
    │   └── team.desktop.png
    ├── embeds/
    │   ├── embed-schedule.light.desktop.png
    │   ├── embed-schedule.dark.desktop.png
    │   ├── embed-schedule.light.mobile.png
    │   ├── embed-form.light.desktop.png
    │   └── embed-form.dark.desktop.png
    └── mobile/
        ├── tab-home.png
        ├── tab-schedule.png
        ├── tab-food.png
        ├── tab-profile.png
        ├── pick-member.png
        ├── food-add.png
        ├── food-barcode.png
        └── agent-sheet.png
```

### Pattern 1: Playwright storageState Authentication

**What:** Save Google OAuth session once by launching a browser in headed mode (`--no-headless`), logging in manually, then persisting cookies to `storageState.json`. All subsequent runs load the saved state.

**When to use:** Any Playwright capture run against a protected route (all `/gymos/*` routes require auth).

**Example:**
```javascript
// One-time setup command (run manually, then commit storageState.json is gitignored)
// node scripts/ui-baseline/capture.mjs --save-auth

import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function saveAuth() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://gym-class-os.vercel.app");
  // User logs in manually — script waits
  await page.waitForURL("**/gymos/**", { timeout: 120_000 });
  await context.storageState({ path: "scripts/ui-baseline/storageState.json" });
  await browser.close();
  console.log("Auth saved to storageState.json");
}
```

### Pattern 2: Parameterized Capture Script

**What:** Single script accepts `--output-dir` argument so the same script produces `baseline/` now and `after-R2/`, `after-R3/`, etc. later.

**When to use:** Every phase that needs visual verification (R2, R3, R4, R5 all reuse this).

**Example:**
```javascript
// scripts/ui-baseline/capture.mjs
import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";

const OUTPUT_DIR = process.argv.includes("--output-dir")
  ? process.argv[process.argv.indexOf("--output-dir") + 1]
  : ".planning/ui-reviews/baseline";

const BASE = "https://gym-class-os.vercel.app";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE  = { width: 390,  height: 844 };

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: "scripts/ui-baseline/storageState.json",
  });

  for (const [slug, url, viewport, state] of CAPTURES) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    // Wait for React hydration + data load
    await page.waitForTimeout(1500);
    const filename = `${slug}.${viewport.width === 1440 ? "desktop" : "mobile"}${state ? "." + state : ""}.png`;
    await page.screenshot({
      path: path.join(OUTPUT_DIR, subdir, filename),
      fullPage: true,
    });
    await page.close();
  }

  await browser.close();
}
```

### Pattern 3: Static Embed Test Pages

**What:** Two minimal HTML files that load the embed script from the live Vercel URL and render both embeds (schedule widget + form widget) against a white or dark host background.

**When to use:** Embed widget screenshots (D-04). No server required; open file directly in Playwright.

**Example:**
```html
<!-- embed-light.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GymClassOS Embed Test — Light Host</title>
  <style>
    body { background: #ffffff; font-family: sans-serif; padding: 40px; }
    h2 { color: #111; margin-bottom: 16px; }
    .widget-container { max-width: 900px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="widget-container">
    <h2>Schedule Widget</h2>
    <div data-gymos-schedule data-accent="#ff5733" data-radius="8"></div>
    <h2>Lead Enquiry Form</h2>
    <div data-gymos-form="trial-signup" data-accent="#ff5733" data-radius="8"></div>
  </div>
  <script src="https://gym-class-os.vercel.app/embed.js" async></script>
</body>
</html>
```

Note: The form embed requires a valid published form slug. Verify a live slug exists in `gymos-demo` Neon via the `/gymos/forms` route before committing the test page.

### Pattern 4: Interaction State Capture

**What:** After navigating to a route, trigger the specific interaction state (open a dialog, click a conversation) before taking the screenshot.

**When to use:** D-06 key states — member context panel, Templates dialog, booking dialog.

**Example:**
```javascript
// Member context panel — open a conversation with a member who has context data
await page.goto(`${BASE}/gymos/inbox?conversation=<first-conversation-id>`);
await page.waitForTimeout(2000); // Wait for member context to load in right rail
await page.screenshot({ path: "gymos-inbox.desktop.context-panel.png", fullPage: true });

// Templates dialog — click the Templates button in the inbox compose area
await page.getByRole("button", { name: /template/i }).click();
await page.waitForSelector('[role="dialog"]');
await page.screenshot({ path: "gymos-inbox.desktop.templates-dialog.png", fullPage: true });
```

### Anti-Patterns to Avoid

- **`waitUntil: "load"` for React Router SSR apps:** Use `"networkidle"` + a fixed `waitForTimeout(1500)` to allow React hydration and data loader resolution. `"load"` fires before loaders complete.
- **Hardcoding conversation IDs:** Load the first conversation from the URL after navigating to `/gymos/inbox` rather than hardcoding a demo data ID. Demo data is stable but IDs are opaque strings that may change.
- **Full-page screenshots on three-column inbox:** The member context right-rail is only visible when a conversation is selected. Capture the page at 1440px viewport with a conversation selected to show all three columns.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Google OAuth re-authentication | Custom cookie storage | Playwright `storageState` | storageState captures all cookies + localStorage atomically; cookie-by-cookie is fragile |
| Waiting for React hydration | Manual timing loops | `waitUntil: "networkidle"` + `waitForTimeout(1500)` | networkidle handles loader data; 1.5s covers React hydration without polling |
| Screenshot diffing | Custom pixel comparison | None — D-16 explicitly chose side-by-side human review | The redesign changes ~100% of pixels intentionally; pixel diff has zero value here |

---

## Runtime State Inventory

> This phase is documentation-only (no renames or refactors). Runtime State Inventory does not apply.

None — verified by phase scope. R1 produces new files only (`scripts/ui-baseline/`, `.planning/ui-reviews/baseline/`, `.planning/phases/R1-audit-baseline/NAMING-RECORD.md`). No existing runtime state is mutated.

---

## Common Pitfalls

### Pitfall 1: storageState expiry mid-run

**What goes wrong:** Google OAuth sessions expire (typically 24–48h for short-lived tokens). A capture script started with a valid storageState may succeed on the first 10 routes and fail silently on the remaining routes if the session expires mid-run.

**Why it happens:** The storageState captures access tokens with expiry, not refresh tokens. Google's OAuth for non-Google Workspace apps has short-lived browser sessions.

**How to avoid:** Run the capture script in a single session immediately after saving auth. If a run is being done more than 24h after the last login, re-run `--save-auth` first. Add a check at the start of the script that navigates to a protected route and verifies it loads before proceeding to the capture loop.

**Warning signs:** Screenshots of late-in-the-list routes show the login page rather than the app.

---

### Pitfall 2: Agent right-rail obscures screenshots

**What goes wrong:** The agent sidebar (`<AgentSidebar>`) is rendered on the right side of every `/gymos/*` page. At 1440px desktop, the sidebar may be open by default and overlap the member context panel, hiding the before-state of the right rail.

**Why it happens:** `AgentSidebar` persists its open/closed state in `localStorage`. If the session used for auth had the sidebar open, storageState carries that localStorage value.

**How to avoid:** After loading each gymos page, check if the agent sidebar is open and close it before capturing: `await page.keyboard.press("Escape")` or target the close button. For the member context panel capture specifically, the sidebar should be closed so the full three-column layout is visible.

**Warning signs:** Desktop screenshots show only two columns (list + thread) with the agent panel visible on the right instead of the member context panel.

---

### Pitfall 3: Embed form requires a live published form slug

**What goes wrong:** The embed test page uses `data-gymos-form="trial-signup"` but if no form with slug `trial-signup` is published in `gymos-demo` Neon, the form iframe renders a 404 or empty state.

**Why it happens:** Form slugs are stored in the `forms` table in Neon. The slug must exist and be `published` for the public embed to render. The demo data may or may not include a published form.

**How to avoid:** Before writing the embed test page, navigate to `https://gym-class-os.vercel.app/gymos/forms` and identify the slug of any published form. Use that slug in the embed test page. If no published form exists, publish one first via the staff web UI.

**Warning signs:** The form iframe shows blank or a form-not-found message.

---

### Pitfall 4: `$view.tsx` already redirects — no unique screenshot

**What goes wrong:** The `$view.tsx` route (which handles `/inbox`, `/sent`, `/starred`, `/drafts`, `/archive`, `/trash`, `/snoozed`) immediately redirects to `/gymos` via both server and client loaders. Attempting to capture `/inbox` in Playwright will result in a screenshot of `/gymos` (home), not the old email view.

**Why it happens:** The legacy `$view.tsx` was intentionally redirected post-demo: `loader() { throw redirect("/gymos"); }`. The route exists in the file system but produces no screenable content.

**How to avoid:** Do NOT attempt to capture `/inbox`, `/sent`, `/starred`, `/drafts`, `/archive`, `/trash`, or `/snoozed` as separate URLs. They redirect to `/gymos`. For the naming record, these routes ARE in scope as identifier/route layer items (they represent hardcoded navigate/Link references in `AppLayout.tsx` and `CommandPalette.tsx` that still reference them). Document them in the naming record as "route — redirects to /gymos; hardcoded references still exist in AppLayout.tsx:825-830 and CommandPalette.tsx:122".

**Warning signs:** Screenshot of `/inbox` is identical to screenshot of `/gymos`.

---

### Pitfall 5: R-12 CSS class orphan risk visible in before-state

**What goes wrong:** The naming record must inventory `.email-list-row` and `.email-body-content` CSS classes (R-12), but these are the CURRENTLY WORKING classes used by `EmailListItem.tsx` and `EmailThread.tsx`. Capturing the before-state is the only moment to verify they are rendering correctly before R3 renames them.

**Why it happens:** R-12 pitfall: rename the component but not the CSS = broken styling. The before-state screenshot proves the current `.email-list-row` hover/selection styles ARE applied, so R3 can verify after-state by diffing against the before.

**How to avoid:** The inbox conversation list screenshot (capturing `.email-list-row` hover state) is one of the interaction states to capture (D-06). Specifically, capture the inbox with a conversation hovered/selected to show the `email-list-row.selected` state.

---

### Pitfall 6: Mobile capture on real device vs simulator

**What goes wrong:** The user might capture screenshots using an iOS/Android simulator instead of a real Expo Go session on a physical phone. Simulator screenshots have different pixel density and may miss native rendering differences (font anti-aliasing, scroll behavior).

**Why it happens:** D-07 specifies real-device capture, but the checklist must make this explicit so the user doesn't default to simulator screenshots.

**How to avoid:** The mobile capture checklist (Claude's deliverable) must explicitly state: "capture on a physical device running Expo Go connected to `https://gym-class-os.vercel.app` API". Include the Expo Go QR scan step.

---

## Code Examples

Verified from direct codebase inspection:

### Complete Staff-Web Route List for Capture

All routes confirmed by reading `apps/staff-web/app/routes/`:

```
# Gymos surfaces (require auth, use storageState)
/gymos                          → gymos-home
/gymos/inbox                    → gymos-inbox
/gymos/inbox?filter=leads       → gymos-inbox-leads (same route, different query)
/gymos/schedule                 → gymos-schedule
/gymos/members                  → gymos-members
/gymos/members/<first-member-id> → gymos-members-id
/gymos/payments                 → gymos-payments
/gymos/analytics                → gymos-analytics
/gymos/campaigns                → gymos-campaigns
/gymos/forms                    → gymos-forms
/gymos/settings/integrations    → gymos-settings-integrations

# Legacy email routes (still routable, per D-05)
/draft-queue                    → draft-queue
/settings                       → settings (mail-template SettingsPage)
/team                           → team

# Explicitly EXCLUDED per D-05
/email                          → SKIP

# $view routes: redirect to /gymos — do NOT capture as separate screens
# (but DO include in naming record as hardcoded references)
# /inbox, /sent, /starred, /drafts, /archive, /trash, /snoozed → all redirect to /gymos

# API and webhook routes: not screenable
# api.m.*, webhooks.whatsapp → SKIP
# extensions.* → SKIP (agent-native framework UI, not GymClassOS surface)
```

### GymosTopNav Current Labels (naming record source)

From `apps/staff-web/app/components/gymos/GymosTopNav.tsx`:

```
Current nav tabs: Home | Inbox | Schedule | Members | Payments | Analytics | Campaigns | Forms | Settings | Sign out
Proposed per NAME-01: Home | Messages | Schedule | Members | Payments | Settings (role-gated: admin-only for Payments/Settings)
```

The "GymClassOS" wordmark at top of nav has no studio name or logo (adding studio identity is part of R4 DSGN-05).

### Mobile Tab Labels (naming record source)

From `packages/mobile-app/app/(tabs)/_layout.tsx`:

```
Current tabs: Home | Schedule | Food | Profile
Proposed per MOBL-02: Home | Classes | Passes | Log | Profile
```

Note: The tab currently labeled "Schedule" is a 1:1 name collision with the staff-web nav — the mobile "Schedule" (member class browser) should become "Classes" per FEATURES.md. The tab currently labeled "Food" should become "Log" (4-char constraint, shorter for mobile).

### Email-Vocabulary CSS Classes (naming record: CSS layer)

Complete list from `apps/staff-web/app/global.css` (749 lines total):

**`.email-list-row` block** (lines 77–237): 15+ rules covering user-select, focused/selected/multi-selected states, `.row-action-rail`, `.hover-actions`, `.row-time` visibility. Rendered by `EmailListItem.tsx:424`.

**`.email-body-content` block** (lines 99–123): prose reset for font-size, line-height, color, a/p/img/pre/table styles. Rendered by `EmailThread.tsx:2151`.

**`.compose-window`** (line 162): box-shadow for the compose modal. Used by `ComposeModal.tsx`.

**`.compose-editor-wrapper`, `.compose-editor`, `.compose-editor *`** (lines 286–577): full rich-text editor styling for the Tiptap editor. Used by `ComposeEditor.tsx`.

**Proposed gym-domain replacements:**
- `.email-list-row` → `.conversation-row`
- `.email-body-content` → `.message-body-content`
- `.compose-window` → `.message-composer-window`
- `.compose-editor-wrapper` → `.message-editor-wrapper`
- `.compose-editor` → `.message-editor`

### Hardcoded Route References (naming record: route + identifier layers)

From R-06 and confirmed by direct grep:

| File | Line(s) | Hardcoded value | Risk note |
|------|---------|-----------------|-----------|
| `GymosTopNav.tsx` | 60 | `to="/gymos/inbox"` | Route rename target: `/gymos/messages` |
| `gymos.inbox.tsx` | 551, 593, 667, 680, 705, 785 | `/gymos/inbox` references | Primary inbox route — all refs must update atomically |
| `AppLayout.tsx` | 820 | `navigate("/inbox")` | Legacy `$view` path — already redirects; low risk |
| `AppLayout.tsx` | 825–830 | `/starred`, `/sent`, `/drafts`, `/archive`, `/trash` | Legacy email views — all redirect to /gymos |
| `CommandPalette.tsx` | 122 | `navigate('/inbox?q=')` | Legacy path — redirect handles it |
| `SearchBar.tsx` | 77, 88 | `/inbox?q=...` | Legacy path — redirect handles it |
| `NotFound.tsx` | 13 | `<Link to="/inbox">` | Legacy path — redirect handles it |
| `RecipientInput.tsx` | 102 | `navigate('/settings?alias=...')` | Mail-template settings path |
| `gymos.members.tsx` | 175 | `"← Back to inbox"` | User-visible label referencing "inbox" |
| `gymos.payments.tsx` | 52 | `"← Back to inbox"` | User-visible label referencing "inbox" |
| `DraftQueuePage.tsx` | 713 | `navigate("/settings")` | Legacy settings path |
| `DraftQueuePage.tsx` | 727 | `/draft-queue/:id` | Legacy draft queue path |

### Email-Vocabulary Component Files (naming record: identifier layer)

From `apps/staff-web/app/components/email/` directory (27 files matched):

Core components requiring rename:
- `EmailList.tsx` → `ConversationList.tsx`
- `EmailListItem.tsx` → `ConversationListItem.tsx`
- `EmailThread.tsx` → `ConversationThread.tsx`
- `ComposeModal.tsx` → `MessageComposerModal.tsx`
- `ComposeEditor.tsx` → `MessageEditor.tsx`
- `InlineReplyComposer.tsx` → `InlineReplyComposer.tsx` (already neutral — keep)
- `RecipientInput.tsx` → `RecipientInput.tsx` (already neutral — keep or rename to `ContactInput.tsx`)
- `AttachmentStrip.tsx` → keep (neutral term)
- `IntegrationsSidebar.tsx` → keep (neutral term)

Supporting files (less critical — email framework internals unlikely to be user-visible):
- `CodeBlockLangPicker.tsx`, `ComposeBubbleToolbar.tsx`, `ComposeSlashMenu.tsx`, `ComposeImageBlock.tsx`, `SnoozePopover.tsx`, `SnoozeModal.tsx` — rename `Compose` prefix to `Message` prefix

User-visible email vocabulary on the inbox page (label layer, from `gymos.inbox.tsx:653`):
- `"WhatsApp Inbox"` → `"Messages"` (heading when not in leads view)
- `"Inbox"` tab chip (line 677) → `"Messages"` or `"All"`
- `"Leads"` tab chip (line 680) → `"Leads"` (already gym-domain — keep)
- Page `<title>` (line 64): `"GymClassOS — WhatsApp Inbox"` → `"GymClassOS — Messages"`

### Mobile Screen File → Target Filename Mapping

From `packages/mobile-app/app/` directory:

| File | Route | Capture filename | Notes |
|------|-------|-----------------|-------|
| `(tabs)/index.tsx` | Home tab | `tab-home.png` | Shows upcoming class, pass balance, coach messages |
| `(tabs)/schedule.tsx` | Schedule tab | `tab-schedule.png` | Class list view |
| `(tabs)/food.tsx` | Food tab | `tab-food.png` | Calorie log |
| `(tabs)/profile.tsx` | Profile tab | `tab-profile.png` | Account/member settings |
| `pick-member.tsx` | Member picker | `pick-member.png` | Staff selects member for context |
| `food-add.tsx` | Food search | `food-add.png` | Search food items screen |
| `food-barcode.tsx` | Barcode scanner | `food-barcode.png` | Camera barcode scanner screen |
| `_layout.tsx` (agent sheet) | Agent chat | `agent-sheet.png` | FAB tapped, agent sheet open over any tab |

Current tab labels (from `(tabs)/_layout.tsx`): Home | Schedule | Food | Profile

### Embed Routes for Capture

From `apps/staff-web/server/routes/`:
- `/embed/schedule` — schedule widget (self-contained SSR HTML, no auth required)
- `/f/<slug>` — public form embed (requires published form slug)
- `/embed.js` — the embed snippet JS (not a visual capture target — it's JavaScript)

The embed test pages load both via `<script src="https://gym-class-os.vercel.app/embed.js">` with `data-gymos-schedule` and `data-gymos-form="<slug>"` container divs. The embed script injects iframes pointing to the live `/embed/schedule` and `/f/<slug>` routes.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `$view.tsx` rendered full email app at `/inbox`, `/sent`, etc. | `$view.tsx` redirects everything to `/gymos` | Demo sprint (2026-05) | Legacy email routes are dead for UI; still present as code references |
| Inbox was at `/gymos` (root) | Inbox moved to `/gymos/inbox`; noticeboard dashboard at `/gymos` | P3-04 | `/gymos` is now the AI noticeboard home, not the inbox |
| Mobile had no agent surface | Agent chat is a FAB/sheet in `_layout.tsx` | D2-06 | Agent sheet must be captured in Expo Go (D-08) |

---

## Open Questions

1. **Published form slug for embed test page**
   - What we know: The embed test page needs a valid published form slug (e.g. `trial-signup`) from the `gymos-demo` Neon `forms` table
   - What's unclear: Whether a published form exists in the live demo data
   - Recommendation: The planner should include a task step to check `https://gym-class-os.vercel.app/gymos/forms` for any published form slug before writing `embed-light.html` and `embed-dark.html`

2. **First conversation ID for context-panel capture**
   - What we know: The member context panel requires a conversation to be selected (`/gymos/inbox?conversation=<id>`)
   - What's unclear: The actual conversation IDs in the live demo Neon — they are opaque UUIDs, not predictable slugs
   - Recommendation: The capture script should navigate to `/gymos/inbox`, extract the first conversation ID from the DOM (e.g. `page.locator('[href*="conversation="]').first().getAttribute('href')`), then navigate to that URL for the context-panel screenshot

3. **Agent sidebar state at capture time**
   - What we know: The agent right-rail persists open/closed state in localStorage via storageState
   - What's unclear: Whether the storageState captured during auth will have the sidebar open or closed
   - Recommendation: The script should explicitly close the agent sidebar before each screenshot. The close mechanism is a button in the AgentSidebar component — check the live DOM to identify its aria-label or data attribute.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Playwright | Capture script | Yes | 1.58.2 | — |
| Node.js | Capture script | Yes | 24.16.0 | — |
| Live Vercel deploy | All captures | Yes | `https://gym-class-os.vercel.app` (SHA `cdec3a18`) | — |
| Google OAuth session | Auth via storageState | Requires manual login once | — | Re-run `--save-auth` if expired |
| Published form in Neon | Embed form capture | Unknown | — | Publish a form via staff-web UI before capture |
| Expo Go on real device | Mobile captures (user task) | User's responsibility | — | User confirms availability |

**Missing dependencies with no fallback:**
- None blocking for the script itself

**Missing dependencies with fallback:**
- Published form slug: check `/gymos/forms` first, publish if needed

---

## Validation Architecture

> `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is skipped.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `apps/staff-web/app/routes/` — all 33 route files read; complete route inventory confirmed
- `apps/staff-web/app/global.css` (749 lines) — complete CSS class inventory; email-vocabulary classes confirmed at lines 77–237 (`.email-list-row`), 99–123 (`.email-body-content`), 162 (`.compose-window`), 286–577 (`.compose-editor-*`)
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — current nav labels confirmed: Home | Inbox | Schedule | Members | Payments | Analytics | Campaigns | Forms | Settings
- `apps/staff-web/app/routes/gymos.inbox.tsx` — user-visible "WhatsApp Inbox" / "Inbox" / "Leads" labels confirmed
- `packages/mobile-app/app/(tabs)/_layout.tsx` — current mobile tab labels confirmed: Home | Schedule | Food | Profile
- `packages/mobile-app/app/` — 8 screen files enumerated
- `apps/staff-web/server/routes/embed/schedule.get.ts` — embed route confirmed; public, no auth required
- `apps/staff-web/server/routes/embed.js.get.ts` — embed snippet confirmed; `BASE` from env
- `apps/staff-web/features/forms/lib/embed-snippet.ts` — embed injection mechanism; `data-gymos-schedule` and `data-gymos-form="<slug>"` confirmed
- `apps/staff-web/app/routes/$view.tsx` — confirmed redirect to `/gymos`; no screenable content
- `.planning/research/PITFALLS.md` — R-06 (hardcoded routes), R-11 (Playwright workflow), R-12 (CSS orphaning) confirmed
- `.planning/research/FEATURES.md` — Naming Recommendations Table applied to produce proposed targets
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-REVIEW.md` — partial before-state audit exists; R1 formalises it
- `node scripts/ui-baseline/` — confirmed `scripts/ui-baseline/` directory does NOT yet exist (must be created in Wave 0)
- `.planning/ui-reviews/` — directory exists; `baseline/` subdirectory does NOT yet exist
- Playwright 1.58.2 — confirmed globally installed via `npx playwright --version`
- Node.js 24.16.0 — confirmed via `node --version`
- Live deploy SHA: `cdec3a18` (master branch HEAD at research time — `redesign/ui-refresh` not yet pushed to Vercel)

### Secondary (MEDIUM confidence)

- None — all claims are grounded in direct file inspection

---

## Metadata

**Confidence breakdown:**
- Route inventory: HIGH — all route files directly read
- CSS class inventory: HIGH — global.css read in full; all `.email-*` and `.compose-*` classes confirmed with line numbers
- Mobile screen list: HIGH — all (tabs) files and root app files enumerated
- Playwright workflow: HIGH — tool confirmed installed; storageState pattern is documented Playwright API
- Embed architecture: HIGH — embed-snippet.ts, schedule.get.ts, f/[...slug].get.ts all directly read
- Naming record content: HIGH — ground truth from FEATURES.md Naming Recommendations Table + direct file inspection

**Research date:** 2026-06-12
**Valid until:** Stable until next codebase change to `apps/staff-web/app/routes/` or `global.css`; re-audit if new gymos routes or CSS classes are added before R1 executes

---

*Research for: Phase R1 — Audit Baseline (v1.1 UI Redesign)*
*Researched: 2026-06-12*
