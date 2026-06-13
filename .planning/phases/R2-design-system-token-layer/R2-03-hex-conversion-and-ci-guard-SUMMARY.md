---
phase: R2-design-system-token-layer
plan: "03"
subsystem: ci-guard
tags: [guard, hex-conversion, dsgn-01, ci, tailwind, colors]
dependency_graph:
  requires: [R2-01, R2-02, R2-04]
  provides: [guard-no-hardcoded-colors, dsgn-01-enforcement]
  affects:
    - scripts/guard-no-hardcoded-colors.mjs
    - package.json
    - .github/workflows/ci.yml
    - apps/staff-web/app/components/GoogleConnectBanner.tsx
    - apps/staff-web/app/components/email/EmailThread.tsx
    - apps/staff-web/app/components/email/IntegrationsSidebar.tsx
    - apps/staff-web/app/components/ui/chart.tsx
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/lib/embed-snippet.ts
    - apps/staff-web/app/global.css
tech_stack:
  added: []
  patterns: [guard-mjs-pattern, per-line-allow-color-marker, whole-file-allow-color-file-sentinel]
key_files:
  created:
    - scripts/guard-no-hardcoded-colors.mjs
  modified:
    - package.json
    - .github/workflows/ci.yml
    - apps/staff-web/app/components/GoogleConnectBanner.tsx
    - apps/staff-web/app/components/email/EmailThread.tsx
    - apps/staff-web/app/components/email/IntegrationsSidebar.tsx
    - apps/staff-web/app/components/ui/chart.tsx
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/lib/embed-snippet.ts
    - apps/staff-web/app/global.css
decisions:
  - Whole-file // guard:allow-color-file sentinel on EmailThread.tsx — dense wall of technical iframe injection CSS, per-line marking ~170 lines is error-prone
  - Per-line // guard:allow-color on Google brand SVG fills (non-negotiable third-party colors)
  - Per-line // guard:allow-color on MYÜTIK/HubSpot/Gong/Pylon brand SVG fills
  - Per-line // guard:allow-color on recharts attribute selectors — CSS attribute matchers not brand colors
  - Per-line // guard:allow-color on embed widget functional colors (success green, error red, toast dark/light) — no studio token equivalent in iframe context
  - root.tsx NOT touched — R2-02 guard:allow-color markers on accentHex literals already satisfy the guard
  - CI guards job added to .github/workflows/ci.yml running pnpm guards (full chain)
metrics:
  duration: "~25 minutes"
  completed: "2026-06-13"
  tasks_completed: 2
  files_modified: 8
  files_created: 1
---

# Phase R2 Plan 03: Hex Conversion and CI Guard Summary

**One-liner:** `guard-no-hardcoded-colors.mjs` enforces DSGN-01 across `apps/staff-web/{app,server,features}` with per-line and whole-file exemption mechanisms; wired into `pnpm guards` chain, `prep`, and CI; all 8 hex-bearing files marked or exempted so the guard exits 0.

## What Was Built

### Task 1: guard-no-hardcoded-colors.mjs + wiring

**`scripts/guard-no-hardcoded-colors.mjs`** — new guard script emulating the existing `guard-no-whatsapp-in-staff-web.mjs` pattern:

- Scans `apps/staff-web/{app,server,features}/**/*.{ts,tsx,css}` recursively
- SKIP_DIRS: standard set (node_modules, .react-router, dist, build, .vercel, .netlify, .cache, .turbo)
- Exempt path: any file under `apps/staff-web/app/skins/` (intentional brand overrides)
- **Whole-file sentinel**: if file text contains `// guard:allow-color-file` or `/* guard:allow-color-file`, skip the entire file
- **Per-line marker**: if a line contains `// guard:allow-color` or `/* guard:allow-color`, skip that line
- Hex literal regex: `/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/`
- Tailwind arbitrary-color regex: `/(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|caret|accent)-\[#[0-9a-fA-F]{3,8}\]/`
- NOT flagged: rgb(), rgba(), hsl(), named colors

**`package.json`**:
- Added `"guard:no-hardcoded-colors": "node scripts/guard-no-hardcoded-colors.mjs"` alongside other guard entries
- Appended `&& pnpm guard:no-hardcoded-colors` to the `"guards"` chain (auto-wires `prep` via concurrently)

**`.github/workflows/ci.yml`**:
- Added a new `guards:` job (checkout → pnpm/action-setup → setup-node → pnpm install → `pnpm guards`)
- Runs the full guards chain including the new color guard, wired on every PR to `main`

### Task 2: Neutralize hex footprint across 8 files

**EmailThread.tsx** — WHOLE-FILE SENTINEL. Three comment lines added at the very top of the file (before all imports):
```ts
// guard:allow-color-file — this module injects dark-mode-adaptation CSS into untrusted
// email HTML inside iframes; the hex values here are technical readability colors, not
// brand tokens, and cannot use CSS vars in the injected-string context. Exempt whole file.
```
This exempts the entire file with a single marker rather than ~170 per-line markers.

**IntegrationsSidebar.tsx** — PER-LINE markers on all 7 hex-bearing `fill="..."` lines (MYÜTIK yellow #F8FF2C x4, HubSpot orange #FF7A59, Gong purple #7121DB, Pylon indigo #5B0EFF). Reason: third-party integration brand colors (non-negotiable).

**GoogleConnectBanner.tsx** — PER-LINE markers on all 4 hex-bearing `fill="..."` lines (#4285F4, #34A853, #FBBC05, #EA4335). Reason: Google brand colors (non-negotiable, third-party SVG).

**chart.tsx:53** — PER-LINE marker on the single className line containing `[stroke='#ccc']` and `[stroke='#fff']` Tailwind attribute selectors. Reason: recharts internal SVG attribute matchers, not brand colors. Vendored shadcn primitive — not restructured.

**schedule-widget-ssr.ts** — PER-LINE `/* guard:allow-color — <reason> */` CSS comments on:
- `--accent-color:var(--gym-accent,#000)` (CSS var fallback — actual value injected via URL param)
- `color:#fff` on `.enquire-btn` and `.submit-btn` (white text on accent buttons)
- `color:#10b981` (success green — no studio token equivalent in iframe context)
- `background:#1f2937;color:#f9fafb` toast (dark/light — no studio token equivalent)
- `.toast-error{background:#991b1b}` (error red — no studio token equivalent)
- JSDoc comment line `?accent=#rrggbb` (example hex in comment, never rendered)

**root.tsx** — NOT MODIFIED. Plan R2-02's `// guard:allow-color` markers on `#7C3AED`, `#F97316`, and the `themeColor` fallback hex in `Layout()` are intact and the guard exempts those lines without any action here. Cross-plan contract satisfied.

### Deviation Rule 1 fixes (auto-applied to achieve guard exit 0)

The guard's actual scan revealed 3 additional files not in the plan's original `files_modified` that also carried hex:

1. **`public-form-ssr.ts`** — inline CSS embed functional colors (`#ef4444`, `#fbbf24`, `#10b981`, `#1f2937`, `#f9fafb`, `#991b1b`) and a JSDoc fallback hex + validation regex. All marked with per-line `// guard:allow-color` (same pattern as schedule-widget-ssr.ts — embed functional status colors).

2. **`embed-snippet.ts`** — example hex `#ff5733` in JSDoc comment lines 7 and 10 (never rendered). Marked per-line.

3. **`global.css`** — hex values `#F97316` / `#FFF7ED` inside a CSS comment at line 43. Reworded comment to remove the hex literals (comment now says "orange-500 / orange-50" without hex notation).

These were auto-fixed per deviation Rule 1 (bugs/incorrect output preventing plan completion). No architectural changes.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 466314c8 | feat(R2-03): add guard-no-hardcoded-colors.mjs + wire into guards chain and CI |
| 2 | 0b41c7a2 | feat(R2-03): neutralize hardcoded hex footprint so guard-no-hardcoded-colors exits 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] public-form-ssr.ts had unguarded hex**
- **Found during:** Task 2 (guard run revealed additional files)
- **Issue:** Plan's `files_modified` list did not include `public-form-ssr.ts`, but the guard correctly flagged its embed functional CSS colors (same pattern as schedule-widget-ssr.ts)
- **Fix:** Added per-line `// guard:allow-color` markers on 6 lines of embed CSS (error red, star amber, success green, toast dark/light, fallback hex)
- **Files modified:** `apps/staff-web/features/forms/lib/public-form-ssr.ts`
- **Commit:** 0b41c7a2

**2. [Rule 1 - Bug] embed-snippet.ts JSDoc had hex in comments**
- **Found during:** Task 2 (guard run)
- **Issue:** Lines 7 and 10 of embed-snippet.ts had `data-accent="#ff5733"` in JSDoc example HTML — hex in comment text, never rendered
- **Fix:** Added per-line `// guard:allow-color — example hex in JSDoc comment only, never rendered` markers
- **Files modified:** `apps/staff-web/features/forms/lib/embed-snippet.ts`
- **Commit:** 0b41c7a2

**3. [Rule 1 - Bug] global.css comment contained hex literals**
- **Found during:** Task 2 (guard run)
- **Issue:** Line 43 of global.css had a CSS comment `/* GymClassOS default accent fallback (orange-500 #F97316 / orange-50 #FFF7ED) */` with hex in comment text
- **Fix:** Removed hex from the comment (reworded to "orange-500 / orange-50"); also added `/* guard:allow-color */` to cover any remaining comment markers
- **Files modified:** `apps/staff-web/app/global.css`
- **Commit:** 0b41c7a2

## Success Criteria Verification

- [x] `node scripts/guard-no-hardcoded-colors.mjs` exits 0 (confirmed)
- [x] guard wired into package.json "guards" chain with `pnpm guard:no-hardcoded-colors`
- [x] guard wired into .github/workflows/ci.yml as a `guards:` job
- [x] root.tsx NOT modified — R2-02's guard:allow-color markers on accentHex suffice
- [x] EmailThread.tsx carries exactly ONE `// guard:allow-color-file` sentinel (3-line comment block at top of file); no per-line markers on ~170 injection lines
- [x] GoogleConnectBanner.tsx: 4 per-line `// guard:allow-color` markers on Google brand SVG fills
- [x] IntegrationsSidebar.tsx: 7 per-line markers on third-party brand fills
- [x] chart.tsx:53: 1 per-line marker on recharts attribute selectors
- [x] schedule-widget-ssr.ts: per-line markers on embed functional colors; Google Fonts lines NOT touched (plan 04 owns those)
- [x] No `fonts.googleapis.com` line in schedule-widget-ssr.ts was modified

## Known Stubs

None — DSGN-01 enforcement is fully live. The guard passes on the full `apps/staff-web` footprint.

## Self-Check: PASSED
