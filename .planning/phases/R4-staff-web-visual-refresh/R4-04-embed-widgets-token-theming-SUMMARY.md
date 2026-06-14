---
phase: R4-staff-web-visual-refresh
plan: "04"
subsystem: ui
tags: [embed, iframe, css-tokens, theming, enquiry, schedule-widget, lead-form]

# Dependency graph
requires:
  - phase: R2-design-system-token-layer
    provides: "--studio-accent / --studio-accent-soft token vocabulary; sanitizeHexColor / sanitizeIntPx sanitizers already in public-form-ssr.ts"
provides:
  - "schedule-widget-ssr.ts: light/white default embed, --studio-accent token injection, corrected empty-state copy"
  - "public-form-ssr.ts: light/white default embed, --studio-accent token injection, Enquiry vocabulary (Send Enquiry / enquiry success / enquiry error copy), embedded-path no longer forces dark"
affects: [R4-deploy-uat, WDGT-03-iframe-test-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Embed SSR pages inject --studio-accent alongside --gym-accent in :root for forward-compat with full token vocabulary"
    - "CSS fallback chain: var(--studio-accent,var(--gym-accent,#000)) on all accent-colored buttons"
    - "Embedded path stays light by default; non-embedded honours localStorage dark preference"

key-files:
  created: []
  modified:
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/features/forms/lib/public-form-ssr.ts

key-decisions:
  - "Light (no class=dark) is the embed default — white card on dark host = high-contrast float (WDGT-03)"
  - "--studio-accent injected inline from sanitized ?accent URL param alongside --gym-accent for backward compat"
  - "Enquiry vocabulary locked: Send Enquiry / Thanks for your enquiry / call us directly error copy"
  - "Task 3 (WDGT-03 deploy/UAT iframe light+dark host check) is deferred to Vercel deploy — no local dev server"

patterns-established:
  - "embed-light-default: Both embed SSR pages render <html lang=en> (no class=dark); .dark block stays dormant"
  - "embed-studio-token: --studio-accent injected in :root alongside --gym-accent in schedule-widget-ssr.ts and public-form-ssr.ts"

requirements-completed: [WDGT-01, WDGT-02]

# Metrics
duration: 18min
completed: 2026-06-13
---

# Phase R4 Plan 04: Embed Widgets Token Theming Summary

**Both embed SSR pages (schedule widget + lead-capture form) default to a white/light card surface themed by --studio-accent injected from sanitized URL params, with Enquiry vocabulary on the lead form (Send Enquiry / Thanks for your enquiry / call us directly)**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-13T19:20:00Z
- **Completed:** 2026-06-13T19:38:00Z
- **Tasks:** 2 of 3 (Task 3 deferred — deploy/UAT)
- **Files modified:** 2

## Accomplishments

- Removed `class="dark"` from both embed SSR pages so both render light/white by default on any host background (WDGT-03 root cause fixed)
- Injected `--studio-accent` into `:root` alongside `--gym-accent`; accent-button fallback chain is now `var(--studio-accent,var(--gym-accent,#000))`
- Lead-capture form: submit button, success message, and error toast all use Enquiry vocabulary; embedded path no longer applies dark theme
- Schedule widget: empty-state copy corrected to "No upcoming classes at this time."
- Color guard (`node scripts/guard-no-hardcoded-colors.mjs`) exits 0; all existing `// guard:allow-color` markers retained

## Task Commits

1. **Task 1: Schedule embed light default + --studio-accent token theming** - `f0b6bdfd` (feat)
2. **Task 2: Lead form light default + studio token theming + Enquiry vocabulary** - `44d31057` (feat)
3. **Task 3: WDGT-03 deploy/UAT** - DEFERRED (see below)

**Plan metadata:** (recorded after final commit)

## Files Created/Modified

- `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` — Removed dark default; injected `--studio-accent`; updated `--accent-color` fallback chain; fixed empty-state copy
- `apps/staff-web/features/forms/lib/public-form-ssr.ts` — Removed dark default from `renderFormPage()` and `notFoundPage()`; injected `--studio-accent`; `.submit-btn` uses studio accent; Enquiry vocabulary throughout; embedded path stays light

## Decisions Made

- **Light default via removal of class="dark"** — both embed `<html>` tags now have no class; the `.dark` CSS block stays dormant. This is the simplest change that fixes WDGT-03 (dark card on light host) without introducing `prefers-color-scheme` complexity deferred to WDGT-F2.
- **--studio-accent alongside --gym-accent** — backward-compat: existing `--gym-accent` consumers keep working; new `--studio-accent` consumers get the full R2 token vocabulary name. Fallback chain `var(--studio-accent,var(--gym-accent,#000))` handles both.
- **Embedded path stays light** — the inline theme-toggle JS now checks `html.classList.contains("embedded")` and skips the `localStorage` dark-preference read for embedded iframes, so the white card surface is guaranteed regardless of user's saved preference.

## Deviations from Plan

None — plan executed exactly as written. Task 3 is a planned deferred deploy checkpoint, not a deviation.

## Deferred Items

### Task 3 (WDGT-03) — Deploy/UAT: Embeds on light AND dark host backgrounds

**Type:** HUMAN-UAT (deploy/UAT checkpoint)
**Deferred reason:** No local dev server; requires live Vercel deploy + R1 iframe test pages.
**Verification steps (to run after deploy):**
1. Open `scripts/ui-baseline/embed-light.html` and `embed-dark.html` pointed at deployed `/embed/schedule` and a published form URL
2. On dark host: confirm widget renders as readable white card with dark text + accent button
3. On light host: confirm equal readability
4. Load `/embed/schedule?accent=%23e63946` — confirm red accent on Enquire buttons
5. Confirm lead form submit button reads "Send Enquiry"
6. Capture after-state screenshots into `scripts/ui-baseline/` for the regression record

## Issues Encountered

None.

## Next Phase Readiness

- WDGT-01 and WDGT-02 requirements are satisfied in code; color guard clean
- WDGT-03 (light+dark host rendering UAT) is pending live deploy — the R1 iframe test pages (`scripts/ui-baseline/embed-light.html`, `embed-dark.html`) are the verification harness
- No blockers for remaining R4 plans

---
*Phase: R4-staff-web-visual-refresh*
*Completed: 2026-06-13*
