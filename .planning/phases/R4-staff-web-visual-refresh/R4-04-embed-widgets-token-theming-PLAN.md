---
phase: R4-staff-web-visual-refresh
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
autonomous: false
requirements: [WDGT-01, WDGT-02, WDGT-03]
must_haves:
  truths:
    - "/embed/schedule renders a clean card-based class list with no admin chrome, themed by studio tokens"
    - "Both embeds render on a white card surface so they are readable on light AND dark host backgrounds"
    - "The lead-capture form uses 'Enquiry' vocabulary (Send Enquiry / enquiry confirmation), not Submit/Sign up/Contact"
    - "Studio accent + radius drive the embed accent button and inputs via the existing sanitized URL params"
  artifacts:
    - path: "apps/staff-web/features/forms/lib/schedule-widget-ssr.ts"
      provides: "Light-default themed schedule embed card list with Enquire CTA"
      contains: "--studio-accent"
    - path: "apps/staff-web/features/forms/lib/public-form-ssr.ts"
      provides: "Token-themed lead form with Send Enquiry CTA + enquiry confirmation copy"
      contains: "Send Enquiry"
  key_links:
    - from: "apps/staff-web/features/forms/lib/schedule-widget-ssr.ts"
      to: "studio accent token"
      via: ":root inline CSS var injected from sanitized ?accent param"
      pattern: "--studio-accent"
---

<objective>
Theme both public embeds (`/embed/schedule` schedule widget + lead-capture form) with the studio token set, default them to a light/white surface for light+dark host readability (WDGT-03), and lock in the "Enquiry" vocabulary on the lead form.

Purpose: WDGT-01 (clean card embed, no admin chrome, studio-token themed), WDGT-02 (lead form token-themed + Enquiry vocab), WDGT-03 (renders on light AND dark host backgrounds — deploy/UAT via the R1 iframe test pages).
Output: Updated `schedule-widget-ssr.ts` and `public-form-ssr.ts`. Iframe isolation retained — NO Shadow DOM work. No new runtime deps.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md
@.planning/research/PITFALLS.md

<interfaces>
Both SSR files are self-contained HTML string builders with an inline `<style>` block and a `CSS()` function. They already:
- Inject `--gym-accent` / `--gym-radius` into `:root` from `sanitizeHexColor()` / `sanitizeIntPx()` (these sanitizers live in public-form-ssr.ts and are imported by schedule-widget-ssr.ts).
- Render `<html lang="en" class="dark">` — i.e. they currently DEFAULT TO DARK. This is the WDGT-03 problem: a dark card on a light host reads poorly.
- The schedule widget ALREADY uses "Enquire" / "Send Enquiry" copy and an inline enquiry form per class card (lines 149-172). Keep that flow.
- The public form's submit button uses `settings.submitText || "Submit"` and success uses `settings.successMessage || "Thank you..."` — these are the WDGT-02 vocabulary targets.
The R1 iframe test pages exist at scripts/ui-baseline/embed-light.html and embed-dark.html for WDGT-03 UAT.
Color guard scans features/ — keep all `// guard:allow-color` markers on the existing functional-color lines (toast, required-asterisk, success-green, star-amber). The new accent var usage must reference `--studio-accent` (not a new hex).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schedule embed — light/white default + --studio-* token theming (WDGT-01, WDGT-03)</name>
  <files>apps/staff-web/features/forms/lib/schedule-widget-ssr.ts, apps/staff-web/features/forms/lib/public-form-ssr.ts</files>
  <read_first>
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts (renderPage lines 217-252, CSS lines 391-508)
    - R4-UI-SPEC.md §7 Embed Widgets "Token theming in embeds" + "/embed/schedule (WDGT-01)" + "Light and dark host backgrounds (WDGT-03)"
  </read_first>
  <action>
    Per R4-UI-SPEC §7, make the schedule embed a light/white card surface and theme it on the full `--studio-*` token set:

    1. In `renderPage()` change `<html lang="en" class="dark">` to `<html lang="en">` (remove the dark default — white root reads on both light and dark host backgrounds per WDGT-03).
    2. In the injected `:root` block, add `--studio-accent: ${accent};` alongside the existing `--gym-accent`/`--gym-radius` (keep `--gym-accent` for backward compat; the sanitized `accent` value already exists). Optionally accept a `?soft=` param via a new `sanitizeHexColor(reqUrl.searchParams.get("soft"))` mapped to `--studio-accent-soft` — only if low-cost; otherwise omit.
    3. In `CSS()`: the `:root` already defines a light palette (`--bg:0 0% 100%` etc.) and `.dark` overrides it. Since the `.dark` class is no longer on `<html>`, the light palette is now the default — verify the `.dark` block can stay dormant (harmless). Ensure `.enquire-btn` / `.submit-btn` background uses `var(--studio-accent, var(--gym-accent, #000))` (keep the existing `// guard:allow-color` marker on the `#000` fallback line). Wrap the embed body content so each class still renders as a `.class-card` (already the case) — no admin chrome (no nav/sign-out/agent — already absent; do not add any).
    4. Empty state copy: ensure it reads "No upcoming classes at this time." (Copywriting Contract — current text is "No upcoming classes scheduled. Check back soon!"; replace it).

    Do NOT add capacity display (out of embed scope per §7). Keep the postMessage resize + enquiry submit JS untouched.
  </action>
  <acceptance_criteria>
    - `grep -n "class=\"dark\"" apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` returns NO match (dark default removed)
    - `grep -n "\-\-studio-accent" apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` returns a match
    - `grep -n "No upcoming classes at this time" apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` returns a match
    - `grep -n "Enquire\|Send Enquiry" apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` still returns matches (vocab retained)
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0 (existing markers retained on functional-color lines)
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Schedule embed defaults to a white/light card surface themed by --studio-accent + --radius from sanitized URL params, no admin chrome, Enquire flow intact, empty state copy correct; guard exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: Lead-capture form — token theming + Enquiry vocabulary + light default (WDGT-02, WDGT-03)</name>
  <files>apps/staff-web/features/forms/lib/schedule-widget-ssr.ts, apps/staff-web/features/forms/lib/public-form-ssr.ts</files>
  <read_first>
    - apps/staff-web/features/forms/lib/public-form-ssr.ts (renderFormPage lines 292-587, CSS lines 626-745)
    - R4-UI-SPEC.md §7 "Lead-capture / Enquiry Form (WDGT-02)" + Copywriting Contract (Send Enquiry / enquiry success / enquiry error)
  </read_first>
  <action>
    Per R4-UI-SPEC §7 "Lead-capture / Enquiry Form":

    1. Light default for embed readability (WDGT-03): change `<html lang="en" class="dark">` to `<html lang="en">` in `renderFormPage()` AND in `notFoundPage()`. The existing theme-toggle script reads `localStorage.theme` and the embedded path hides the toggle (`.embedded .theme-toggle{display:none}`) — when embedded, the form should present light by default. Adjust the inline `<script>` so that when `.embedded` (in an iframe) it does NOT auto-apply dark: remove the `class="dark"` reliance; default is now light, and the toggle (non-embedded only) can still add `.dark` on user click. Keep `.dark` CSS dormant.
    2. Studio token theming: in the injected `:root`, add `--studio-accent: ${accent};` next to `--gym-accent`. Change the `.submit-btn` background from `hsl(var(--fg))` to `var(--studio-accent, var(--gym-accent, #000))` with a `/* guard:allow-color — CSS var fallback for embed accent */` marker on that line, and its color to `#fff` (keep/add a guard marker — matches the schedule widget pattern). Inputs (`.fi`) and radius already consume `--radius`/`var(--gym-radius)` — leave.
    3. Enquiry vocabulary (WDGT-02): the submit button currently uses `settings.submitText || "Submit"`. Change the FALLBACK to "Send Enquiry" (form authors can still override via submitText, but the default is Enquiry vocab): `escapeHtml(settings.submitText || "Send Enquiry")` — apply in BOTH the button render (line ~358) and the catch-block reset (line ~579). The success view default: change `settings.successMessage || "Thank you! Your response has been recorded."` to fallback "Thanks for your enquiry! We'll be in touch soon." The submit error toast: the JS `showToast(err.message || "Failed to submit form")` should fall back to "Something went wrong. Please try again or call us directly." (replace the generic fallback string).
    4. Required-field indicator stays the `<span class="req">*</span>` — keep its existing `// guard:allow-color` red marker.

    Do NOT change the field renderer, validation, turnstile, or postMessage plumbing.
  </action>
  <acceptance_criteria>
    - `grep -n "class=\"dark\"" apps/staff-web/features/forms/lib/public-form-ssr.ts` returns NO match (dark default removed from both renderFormPage and notFoundPage)
    - `grep -n "Send Enquiry" apps/staff-web/features/forms/lib/public-form-ssr.ts` returns a match (button fallback)
    - `grep -n "Thanks for your enquiry" apps/staff-web/features/forms/lib/public-form-ssr.ts` returns a match (success fallback)
    - `grep -n "call us directly" apps/staff-web/features/forms/lib/public-form-ssr.ts` returns a match (error fallback)
    - `grep -n "\-\-studio-accent" apps/staff-web/features/forms/lib/public-form-ssr.ts` returns a match
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Lead form defaults to light, the submit button uses the studio accent and "Send Enquiry" fallback, confirmation/error copy uses enquiry vocabulary, required marker retained; guard exits 0.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: WDGT-03 deploy/UAT — embeds on light AND dark host backgrounds</name>
  <action>
    No code changes in this task — Tasks 1 and 2 made the embed changes. This is the WDGT-03 deferred deploy/UAT verification step. After the phase deploys to Vercel, run the light/dark host-page checks below using the R1 iframe test pages (scripts/ui-baseline/embed-light.html, embed-dark.html) and capture after-state screenshots into scripts/ui-baseline/ for the regression record. HUMAN-UAT: requires a live deploy; cannot be verified statically or locally (no dev server).
  </action>
  <what-built>
    Both embeds (`/embed/schedule` and the lead-capture form) now default to a light/white surface and are themed by the studio `--studio-accent`/`--radius` tokens from sanitized URL params. The schedule widget keeps its Enquire flow; the lead form uses Send Enquiry / enquiry confirmation copy.
  </what-built>
  <how-to-verify>
    This is a deploy/UAT item (no local dev server). After this phase deploys to Vercel:
    1. Open scripts/ui-baseline/embed-light.html and embed-dark.html (the R1 iframe test pages) pointed at the deployed `/embed/schedule` and a published form URL.
    2. Confirm on the DARK host page the widget renders as a readable white card with dark text and an accent button (high-contrast float) — not a dark-on-dark block.
    3. Confirm on the LIGHT host page the widget is equally readable.
    4. Load `/embed/schedule?accent=%23e63946` and confirm the Enquire buttons render in that red accent (token injection works).
    5. Confirm the lead form submit button reads "Send Enquiry".
    6. Capture after-state screenshots into scripts/ui-baseline/ per the R1 harness for the regression record.
  </how-to-verify>
  <resume-signal>Type "approved" once both embeds render correctly on light and dark host pages, or describe the contrast/theming issues found.</resume-signal>
  <verify>
    <automated>MISSING — deploy/UAT only (WDGT-03 is a deferred deploy verification; no local dev server). Verify via the R1 iframe test pages on the live Vercel deploy.</automated>
  </verify>
  <done>Both embeds render as readable white cards on light AND dark host pages; ?accent injection tints the Enquire buttons; lead form shows "Send Enquiry"; after-state captures saved to scripts/ui-baseline/.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0.
- `npx prettier --write apps/staff-web/features/forms/lib/schedule-widget-ssr.ts apps/staff-web/features/forms/lib/public-form-ssr.ts` runs clean.
- Static grep confirms dark-default removed, --studio-accent injected, Enquiry vocabulary present.
- WDGT-03 light/dark host rendering is the deploy/UAT checkpoint (Task 3).
</verification>

<success_criteria>
WDGT-01 + WDGT-02 + WDGT-03: both embeds are studio-token themed, render light/white by default for readability on any host background, carry no admin chrome, and the lead form speaks Enquiry vocabulary. Light/dark host verification is deploy/UAT-confirmed.
</success_criteria>

<output>
After completion, create `.planning/phases/R4-staff-web-visual-refresh/R4-04-embed-widgets-token-theming-SUMMARY.md`
Run `npx prettier --write` on the two modified files.
</output>
