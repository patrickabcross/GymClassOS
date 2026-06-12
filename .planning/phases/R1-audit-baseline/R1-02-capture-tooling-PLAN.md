---
phase: R1-audit-baseline
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/ui-baseline/capture.mjs
  - scripts/ui-baseline/embed-light.html
  - scripts/ui-baseline/embed-dark.html
  - scripts/ui-baseline/README.md
  - .gitignore
autonomous: true
requirements: [AUDT-01]
must_haves:
  truths:
    - "A committed Playwright script captures every in-scope staff-web route and embed at 1440px desktop and 390px mobile against the live Vercel deploy"
    - "The script is parameterized by output directory so R2-R5 reuse it for after-state captures"
    - "The script authenticates via a gitignored storageState.json and never writes app/config changes to the live app"
    - "Two static embed host pages (light + dark) load the live embed.js and render the schedule + form widgets"
    - "storageState.json is gitignored so OAuth session cookies are never committed"
  artifacts:
    - path: "scripts/ui-baseline/capture.mjs"
      provides: "Parameterized Playwright capture script (--save-auth + --output-dir modes)"
      min_lines: 80
      contains: "--output-dir"
    - path: "scripts/ui-baseline/embed-light.html"
      provides: "Light-background embed host test page"
      contains: "embed.js"
    - path: "scripts/ui-baseline/embed-dark.html"
      provides: "Dark-background embed host test page"
      contains: "embed.js"
    - path: "scripts/ui-baseline/README.md"
      provides: "Re-run + re-auth instructions for the standing capture harness"
  key_links:
    - from: "scripts/ui-baseline/capture.mjs"
      to: "https://gym-class-os.vercel.app (live master deploy)"
      via: "BASE constant + page.goto"
      pattern: "gym-class-os\\.vercel\\.app"
    - from: ".gitignore"
      to: "scripts/ui-baseline/storageState.json"
      via: "gitignore entry"
      pattern: "storageState"
---

<objective>
Build the reusable UI-baseline capture harness: a parameterized Playwright script (`scripts/ui-baseline/capture.mjs`) plus two static embed host test pages (light + dark) and a README. This is the standing verification tool pitfall R-11 mandates — R2, R3, R4, and R5 all re-run this same script with a different `--output-dir` for after-state captures.

This plan BUILDS the tooling but does NOT run the captures (running requires the one-time manual Google OAuth login, which is a checkpoint handled in R1-03).

Purpose: Satisfies the tooling half of AUDT-01 and locks the harness so all later phases capture against an identical surface list with identical filenames (D-15, D-16).
Output: `scripts/ui-baseline/` (capture.mjs, embed-light.html, embed-dark.html, README.md) + a `.gitignore` entry for `storageState.json`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/R1-audit-baseline/R1-CONTEXT.md
@.planning/phases/R1-audit-baseline/R1-RESEARCH.md
@apps/staff-web/features/forms/lib/embed-snippet.ts

<capture_facts>
<!-- Confirmed in R1-RESEARCH.md by direct inspection. -->
- Playwright 1.58.2 + Node 24.16.0 already installed globally — NO install step needed. Run with `node scripts/ui-baseline/capture.mjs`.
- BASE = https://gym-class-os.vercel.app (live master deploy, SHA cdec3a18 at research time; this branch redesign/ui-refresh is NOT pushed — before-state IS the live master deploy).
- Desktop viewport = 1440x900; Mobile viewport = 390x844 (D-02).
- Auth: storageState.json (gitignored), saved once via headed browser manual Google login (D-03). Script has a `--save-auth` mode and a default capture mode.
- Output dir default = .planning/ui-reviews/baseline ; overridable via `--output-dir` (D-15, parameterized for R2-R5 reuse).
- Embed snippet: <script src="https://gym-class-os.vercel.app/embed.js"> injects iframes for containers with data-gymos-schedule and data-gymos-form="<slug>" (confirmed in features/forms/lib/embed-snippet.ts).
- Anti-pattern: waitUntil:"load" fires before React Router loaders resolve. Use waitUntil:"networkidle" + waitForTimeout(1500).
- Pitfall: AgentSidebar right-rail persists open/closed in localStorage (carried by storageState) and can obscure the member-context panel. Script must close it (Escape or close button) before each gymos capture.
- Pitfall: $view routes (/inbox,/sent,/starred,/drafts,/archive,/trash,/snoozed) redirect to /gymos — do NOT list them as capture targets.
</capture_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write capture.mjs — parameterized Playwright script with the full surface list</name>
  <read_first>
    - .planning/phases/R1-audit-baseline/R1-RESEARCH.md (Patterns 1-4, anti-patterns, full route list, interaction-state captures)
    - apps/staff-web/features/forms/lib/embed-snippet.ts (confirm the data-* attribute contract the embed pages use)
  </read_first>
  <action>
    Create `scripts/ui-baseline/capture.mjs` (ESM, run as `node scripts/ui-baseline/capture.mjs`). It must support two modes via CLI args:

    MODE A — `--save-auth`: launch chromium headed (`{ headless: false }`), `page.goto("https://gym-class-os.vercel.app")`, then `page.waitForURL("**/gymos**", { timeout: 120000 })` to let the user log in via Google manually, then `context.storageState({ path: "scripts/ui-baseline/storageState.json" })`, close, and `console.log("Auth saved")`.

    MODE B — default (capture): launch chromium headless, create context with `storageState: "scripts/ui-baseline/storageState.json"`. Read OUTPUT_DIR from `--output-dir <dir>` arg, defaulting to `.planning/ui-reviews/baseline`. Before the capture loop, do a session-validity guard: navigate to `/gymos`, and if the URL lands on a Google login page (URL contains `accounts.google.com` or the page shows a sign-in form), throw with a clear message "storageState expired — re-run with --save-auth" (Pitfall 1 in research).

    Define these constants:
    ```
    const BASE = "https://gym-class-os.vercel.app";
    const DESKTOP = { width: 1440, height: 900 };
    const MOBILE  = { width: 390,  height: 844 };
    ```

    Define a CAPTURES array. Each entry: `{ slug, url, viewport, subdir, state? }`. The full list (subdir "staff-web" unless noted):

    DESKTOP + MOBILE pairs (both viewports):
    - gymos-home  /gymos
    - gymos-inbox /gymos/inbox
    - gymos-schedule /gymos/schedule
    - gymos-members /gymos/members

    DESKTOP only:
    - gymos-inbox-leads /gymos/inbox?filter=leads
    - gymos-members-id  /gymos/members/<FIRST_MEMBER_ID>  (resolve at runtime — see below)
    - gymos-payments /gymos/payments
    - gymos-analytics /gymos/analytics
    - gymos-campaigns /gymos/campaigns
    - gymos-forms /gymos/forms
    - gymos-settings-integrations /gymos/settings/integrations
    - draft-queue /draft-queue
    - settings /settings
    - team /team

    INTERACTION STATES (desktop, subdir "staff-web", D-06):
    - gymos-inbox state=context-panel : navigate /gymos/inbox, resolve the first conversation id from the DOM (`page.locator('[href*="conversation="]').first()` → read href → extract id), navigate `/gymos/inbox?conversation=<id>`, waitForTimeout(2000), CLOSE the agent sidebar (press Escape) so the three-column layout shows the member context right-rail, then screenshot.
    - gymos-inbox state=templates-dialog : on /gymos/inbox, click `page.getByRole("button", { name: /template/i })`, `waitForSelector('[role="dialog"]')`, screenshot.
    - gymos-schedule state=booking-dialog : on /gymos/schedule, open a class occurrence's booking dialog (click the first class card / book control, waitForSelector dialog), screenshot.
    - gymos-inbox state=selected-row : on /gymos/inbox, hover/select the first conversation row to capture the `.email-list-row.selected` state (R-12 before-state — proves current styling renders), screenshot.

    For gymos-members-id, resolve FIRST_MEMBER_ID at runtime: navigate `/gymos/members`, read the first member link href (`page.locator('a[href*="/gymos/members/"]').first()`), extract the id.

    Capture loop behavior per entry:
    1. new page, `setViewportSize(viewport)`.
    2. `page.goto(BASE+url, { waitUntil: "networkidle" })` then `waitForTimeout(1500)`.
    3. For gymos routes, close the agent sidebar before capture (press Escape; tolerate if absent).
    4. filename = `${slug}.${viewport.width === 1440 ? "desktop" : "mobile"}${state ? "."+state : ""}.png`.
    5. `mkdir` the `OUTPUT_DIR/subdir` if missing.
    6. `page.screenshot({ path: join(OUTPUT_DIR, subdir, filename), fullPage: true })`.
    7. close page.
    Wrap each entry in try/catch; on error, `console.error(slug, err)` and continue (do not abort the whole run on one bad route).

    EMBED captures (subdir "embeds"): after the gymos loop, capture the two static embed host pages via `file://` URLs:
    - embed-light.html at DESKTOP → embed-host.light.desktop.png
    - embed-dark.html at DESKTOP → embed-host.dark.desktop.png
    - embed-light.html at MOBILE → embed-host.light.mobile.png
    Load via `page.goto("file://" + absolute path to the html)`, waitForTimeout(2500) to let the injected iframes load the live widgets, fullPage screenshot.

    At the end, `console.log` a summary count of screenshots written and `browser.close()`. Do NOT generate INDEX.md here (that is R1-03's job after a real run).

    Use only the `playwright` package (`import { chromium } from "playwright"`) and node builtins (`fs/promises`, `path`, `url`). No test framework.
  </action>
  <verify>
    <automated>cd "C:/Users/dimet/gymclassos-br1" && node --check scripts/ui-baseline/capture.mjs && grep -c "gym-class-os.vercel.app" scripts/ui-baseline/capture.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `node --check scripts/ui-baseline/capture.mjs` exits 0 (valid ESM syntax)
    - `grep -q "save-auth" scripts/ui-baseline/capture.mjs` succeeds (auth-save mode present)
    - `grep -q "output-dir" scripts/ui-baseline/capture.mjs` succeeds (parameterized output, D-15)
    - `grep -q "storageState" scripts/ui-baseline/capture.mjs` succeeds (storageState auth, D-03)
    - `grep -q "networkidle" scripts/ui-baseline/capture.mjs` succeeds (correct wait strategy, not "load")
    - `grep -qE "1440" scripts/ui-baseline/capture.mjs` and `grep -q "390" scripts/ui-baseline/capture.mjs` both succeed (both viewports, D-02)
    - `grep -q "context-panel" scripts/ui-baseline/capture.mjs` and `grep -q "templates-dialog" scripts/ui-baseline/capture.mjs` and `grep -q "booking-dialog" scripts/ui-baseline/capture.mjs` all succeed (D-06 interaction states)
    - `grep -q "draft-queue" scripts/ui-baseline/capture.mjs` and `grep -q "team" scripts/ui-baseline/capture.mjs` succeed (legacy routes per D-05); reading the CAPTURES array confirms NO entry for `/email` (excluded per D-05)
  </acceptance_criteria>
  <done>capture.mjs exists, passes `node --check`, supports --save-auth and --output-dir, captures all in-scope gymos + legacy routes at both viewports plus the four D-06 interaction states and the three embed host captures, closes the agent sidebar before gymos captures, and continues past per-route errors.</done>
</task>

<task type="auto">
  <name>Task 2: Write embed test pages, README, and gitignore the storageState</name>
  <read_first>
    - apps/staff-web/features/forms/lib/embed-snippet.ts (the data-gymos-schedule / data-gymos-form contract)
    - .planning/phases/R1-audit-baseline/R1-RESEARCH.md (Pattern 3 embed test page, Pitfall 3 published form slug)
    - .gitignore (current root gitignore — append, do not overwrite)
  </read_first>
  <action>
    Create three files plus one gitignore edit.

    1. `scripts/ui-baseline/embed-light.html` — a static HTML page with `body { background:#ffffff; ... }`, a `.widget-container` (max-width 900px), and two widget mount points loaded from the LIVE embed script:
       ```html
       <h2>Schedule Widget</h2>
       <div data-gymos-schedule data-accent="#ff5733" data-radius="8"></div>
       <h2>Lead Enquiry Form</h2>
       <div data-gymos-form="FORM_SLUG" data-accent="#ff5733" data-radius="8"></div>
       <script src="https://gym-class-os.vercel.app/embed.js" async></script>
       ```
       For FORM_SLUG: do NOT hardcode a confident guess. Add an HTML comment at the top: `<!-- FORM_SLUG must be a published form slug from gymos-demo Neon. R1-03 verifies/publishes a slug at capture time and updates this attribute. Placeholder "trial-signup" used; replace if no such published form exists. -->` and use `trial-signup` as the placeholder value. (Actual verification/publish lives in R1-03 because it requires the live deploy.)

    2. `scripts/ui-baseline/embed-dark.html` — identical to embed-light.html but `body { background:#0b0f1a; color:#eee; }` and an `h2 { color:#eee; }`. Same two widget mounts + same `<script src=".../embed.js">`. This proves WDGT-03 (renders on both light and dark host backgrounds) before R4.

    3. `scripts/ui-baseline/README.md` — document the standing harness:
       - "## What this is" — the UI-baseline capture harness; reused by R2-R5 for after-state captures.
       - "## One-time auth setup" — `node scripts/ui-baseline/capture.mjs --save-auth`, log in via Google manually in the headed browser, session persists to gitignored storageState.json. Re-run if >24h old (Pitfall 1: Google sessions expire).
       - "## Running a capture" — `node scripts/ui-baseline/capture.mjs` (default → .planning/ui-reviews/baseline) or `node scripts/ui-baseline/capture.mjs --output-dir .planning/ui-reviews/after-R2` for later phases.
       - "## Embed test pages" — embed-light.html / embed-dark.html load the live embed.js; FORM_SLUG must be a published form slug (check /gymos/forms).
       - "## Filename convention" — `<route-slug>.<viewport>[.<state>].png` per D-13; viewport in {desktop, mobile}.
       - "## Surfaces covered" — bullet list of the routes + states + embeds from capture.mjs.

    4. Append to root `.gitignore`: a section `# UI baseline capture auth (never commit OAuth session)` followed by `scripts/ui-baseline/storageState.json`. Read the current .gitignore first and APPEND — do not overwrite existing entries.
  </action>
  <verify>
    <automated>cd "C:/Users/dimet/gymclassos-br1" && test -f scripts/ui-baseline/embed-light.html && test -f scripts/ui-baseline/embed-dark.html && test -f scripts/ui-baseline/README.md && grep -q "storageState.json" .gitignore && grep -l "embed.js" scripts/ui-baseline/embed-light.html scripts/ui-baseline/embed-dark.html</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/ui-baseline/embed-light.html` exists and contains `data-gymos-schedule`, `data-gymos-form`, and `<script src="https://gym-class-os.vercel.app/embed.js"`
    - `scripts/ui-baseline/embed-dark.html` exists with a dark `body { background:` value (not #ffffff) and the same embed.js script tag
    - `scripts/ui-baseline/README.md` exists and contains "--save-auth", "--output-dir", and the filename convention `<route-slug>.<viewport>`
    - `grep -q "scripts/ui-baseline/storageState.json" .gitignore` succeeds AND the pre-existing .gitignore content is preserved (verify by reading — no entries removed)
  </acceptance_criteria>
  <done>embed-light.html + embed-dark.html load the live embed.js with schedule + form mounts, README documents the standing harness with re-auth + re-run instructions, and storageState.json is gitignored without clobbering existing .gitignore entries.</done>
</task>

</tasks>

<verification>
- `node --check scripts/ui-baseline/capture.mjs` passes
- Script supports `--save-auth` and `--output-dir`, uses storageState auth, networkidle waits, both viewports, all D-06 states
- Embed light + dark host pages load the live embed.js with schedule + form mounts
- README documents re-auth + re-run for R2-R5 reuse
- storageState.json gitignored
</verification>

<success_criteria>
The capture harness is committed and re-runnable. A subsequent run (after the auth checkpoint in R1-03) produces the full baseline screenshot set. Satisfies the tooling half of AUDT-01.
</success_criteria>

<output>
After completion, create `.planning/phases/R1-audit-baseline/R1-02-SUMMARY.md`
</output>
