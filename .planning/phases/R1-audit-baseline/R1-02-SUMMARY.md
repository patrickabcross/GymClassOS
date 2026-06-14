---
phase: R1-audit-baseline
plan: "02"
subsystem: tooling
tags: [playwright, screenshot-capture, embed-widgets, gitignore]
dependency_graph:
  requires: []
  provides:
    - scripts/ui-baseline/capture.mjs
    - scripts/ui-baseline/embed-light.html
    - scripts/ui-baseline/embed-dark.html
    - scripts/ui-baseline/README.md
  affects:
    - .gitignore
tech_stack:
  added: []
  patterns:
    - Playwright storageState headless capture via node scripts (not test runner)
    - Parameterized --output-dir for multi-phase reuse
    - Static HTML file:// embed test pages against live Vercel URL
key_files:
  created:
    - scripts/ui-baseline/capture.mjs
    - scripts/ui-baseline/embed-light.html
    - scripts/ui-baseline/embed-dark.html
    - scripts/ui-baseline/README.md
  modified:
    - .gitignore
decisions:
  - "Embed test pages use placeholder slug 'trial-signup'; R1-03 verifies/replaces at capture time"
  - "Interaction states captured via separate captureInteractionStates() function after standard loop"
  - "Agent sidebar closed via Escape key before every gymos capture to prevent right-rail obstruction"
  - "storageState.json gitignored via full path (scripts/ui-baseline/storageState.json) rather than glob"
metrics:
  duration: "3 min"
  completed: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 1
requirements_satisfied:
  - AUDT-01 (tooling half)
---

# Phase R1 Plan 02: Capture Tooling SUMMARY

**One-liner:** Parameterized Playwright ESM script capturing all gymos + legacy routes at 1440/390px plus D-06 interaction states and embed host pages, with OAuth storageState auth and gitignored session file.

## What Was Built

### scripts/ui-baseline/capture.mjs (453 lines)

A single ESM Node.js script (no test framework, no install required — Playwright 1.58.2 already global) with two modes:

- `--save-auth` — launches headed Chromium for manual Google OAuth, saves to `storageState.json`
- default — headless capture loop using saved storageState

**Route coverage:**
- 4 routes at desktop + mobile (both viewports): gymos-home, gymos-inbox, gymos-schedule, gymos-members
- 11 desktop-only routes: gymos-inbox-leads, gymos-members-id (runtime-resolved), gymos-payments, gymos-analytics, gymos-campaigns, gymos-forms, gymos-settings-integrations, draft-queue, settings, team
- 4 D-06 interaction states: context-panel, templates-dialog, booking-dialog, selected-row
- 3 embed host captures (via file:// URL): embed-host.light.desktop, embed-host.dark.desktop, embed-host.light.mobile

**Key safeguards:**
- Session-validity guard at startup: exits with clear re-auth message if storageState expired
- Agent sidebar closed (Escape) before every gymos capture (Pitfall 2)
- Per-route try/catch: one bad route does not abort the whole run
- Runtime member ID resolution: navigates /gymos/members, extracts first `a[href*="/gymos/members/"]` href
- Runtime conversation ID resolution: extracts first `[href*="conversation="]` href from inbox

### scripts/ui-baseline/embed-light.html + embed-dark.html

Static HTML test pages loading `<script src="https://gym-class-os.vercel.app/embed.js" async>` with:
- `<div data-gymos-schedule data-accent="#ff5733" data-radius="8">` — schedule widget mount
- `<div data-gymos-form="trial-signup" data-accent="#ff5733" data-radius="8">` — form widget mount

Light page: `body { background: #ffffff }`. Dark page: `body { background: #0b0f1a; color: #eee }`.
Both include an HTML comment noting the FORM_SLUG placeholder and that R1-03 verifies/replaces it.

### scripts/ui-baseline/README.md

Documents the standing harness with:
- One-time auth setup (`--save-auth` command)
- Per-phase capture commands with output-dir examples
- Embed test page FORM_SLUG verification steps
- Filename convention `<route-slug>.<viewport>[.<state>].png` (D-13)
- Full surface list (all 18 standard routes + 4 interaction states + 3 embed captures)

### .gitignore

Appended section at end of file:
```
# UI baseline capture auth (never commit OAuth session)
scripts/ui-baseline/storageState.json
```
Existing .gitignore content preserved intact.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- **FORM_SLUG placeholder (`trial-signup`)** in `embed-light.html` and `embed-dark.html` — intentional stub per plan spec. R1-03 verifies a live published form slug exists in gymos-demo Neon and updates this attribute before the capture run. HTML comment in both files documents this clearly.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| scripts/ui-baseline/capture.mjs | FOUND |
| scripts/ui-baseline/embed-light.html | FOUND |
| scripts/ui-baseline/embed-dark.html | FOUND |
| scripts/ui-baseline/README.md | FOUND |
| Commit 23c244f3 (Task 1) | FOUND |
| Commit 71f09277 (Task 2) | FOUND |
