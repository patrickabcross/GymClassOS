---
phase: R2-design-system-token-layer
plan: "01"
subsystem: design-tokens
tags: [css-tokens, tailwind-v4, skin-system, studio-branding]
dependency_graph:
  requires: []
  provides: [studio-skin-tokens, skin-config-registry, studios-env-contract]
  affects: [apps/staff-web/app/global.css, apps/staff-web/app/skins/]
tech_stack:
  added: []
  patterns: [bare-@theme-tokens, css-attribute-selector-skins, deploy-time-skin-selection]
key_files:
  created:
    - apps/staff-web/app/skins/config.ts
    - apps/staff-web/app/skins/default.css
    - apps/staff-web/app/skins/hustle.css
    - studios/default/env.yml
    - studios/hustle/env.yml
  modified:
    - apps/staff-web/app/global.css
decisions:
  - Bare @theme block (not @theme inline) so Tailwind utilities compile to var() references — skin overrides work at runtime with no recompile (R-01)
  - Skin @imports placed at end of global.css after .dark block — [data-studio] wins in cascade when both selectors active (R-09)
  - GymClassOS @theme block placed after upstream @import — GymClassOS wins on overlapping tokens (R-13)
  - Hustle ships with indigo-500 placeholder values clearly TODO-marked — skin switch is provable before real brand values arrive
  - studios/ env.yml files are documentation-only contract — no loader code (D-08)
metrics:
  duration: "~15 minutes"
  completed: "2026-06-13"
  tasks_completed: 3
  files_modified: 1
  files_created: 5
---

# Phase R2 Plan 01: Token Layer and Skins Summary

**One-liner:** Bare `@theme` studio-accent tokens in global.css, orange-500 default skin + indigo placeholder Hustle skin keyed by `data-studio` attribute, typed `getSkinConfig` registry for root loader consumption.

## What Was Built

### Task 1: GymClassOS @theme tokens in global.css

Added three additive changes to `apps/staff-web/app/global.css`:

1. **Bare `@theme` block** inserted after the `@import "@agent-native/core/styles/agent-native.css"` line (R-13 satisfied). Maps `--color-studio-accent` and `--color-studio-accent-soft` to `hsl(var(...))` references so Tailwind utilities compile to var() references, not literal hex (R-01 satisfied).

2. **Default fallback values** added to the existing `:root` block after `--radius: 0.5rem;` as bare space-separated HSL (no `hsl()` wrapper — R-02 satisfied):
   - `--studio-accent: 25 95% 53%` (orange-500 #F97316)
   - `--studio-accent-soft: 33 100% 96%` (orange-50 #FFF7ED)

3. **Skin `@import`s** added at the very end of global.css, after all `.dark` block rules (R-09 satisfied). Both skins' CSS ships in every bundle; the active skin is selected purely by `data-studio` attribute on `<html>`.

### Task 2: skins/ directory with config.ts, default.css, hustle.css

- **`skins/config.ts`**: Typed registry exporting `SkinName`, `SkinConfig` interface, and `getSkinConfig(name)` function with fallback to default for unknown names. Zero async I/O — pure module for root loader (DSGN-02).
- **`skins/default.css`**: `:root[data-studio="default"]` block with orange-500 primary (`24 95% 53%`), orange-50 accent tint, 0.5rem radius. All values bare HSL (R-02).
- **`skins/hustle.css`**: `:root[data-studio="hustle"]` placeholder indigo-500 block (clearly `TODO: replace with Hustle brand values` — awaiting customer confirmation). Includes `html.dark[data-studio="hustle"]` combined selector (R-09). Visibly distinct from default orange so skin-switch is provable.

### Task 3: studios/ env contract scaffold

- **`studios/default/env.yml`**: Documents `GYMOS_STUDIO_SKIN: default` for Vercel dashboard. Comments state NOT loaded at runtime.
- **`studios/hustle/env.yml`**: Documents `GYMOS_STUDIO_SKIN: hustle` with commented `CUSTOMER_ALLOWED_EMAILS` placeholder. Comments state NOT loaded at runtime.
- No TypeScript loader reads these files — they are pure contract documentation (D-08).

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | e0957dd8 | feat(R2-01): add GymClassOS @theme tokens and default --studio-* values to global.css |
| 2 | 0c73b07c | feat(R2-01): create skins/config.ts registry and default + hustle skin CSS files |
| 3 | 2680d11c | chore(R2-01): scaffold studios/ env contract files for default and hustle deploys |

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **Bare `@theme` (not `@theme inline`)** — the existing upstream agent-native.css already uses this pattern; GymClassOS tokens follow the same convention.
2. **Cascade order enforced statically** — `@theme` after upstream import, skin `@import`s after `.dark` block. No runtime injection needed.
3. **All skin values bare HSL** — no `hsl()` wrapper in any `:root`/skin CSS block. The `@theme` block does the wrapping.
4. **Hustle placeholder = indigo-500** — visually distinct from orange-500 so the `GYMOS_STUDIO_SKIN=hustle` switch is demonstrably different before customer confirms real brand values.
5. **studios/ at repo root** — not under apps/ — matching R2-RESEARCH.md Section 7 spec and the plan-02 deploy script contract pattern.

## Known Stubs

- **`skins/hustle.css`**: All values are intentional placeholders marked `/* TODO: replace with Hustle brand values — awaiting customer confirmation */`. The stub is by design (open dependency — Hustle brand hex not yet received). Plan R2-04 or a quick-task will apply real values when customer provides them.
- **`skins/config.ts` hustle entry `logo: null`**: Intentional placeholder — `/* TODO: add /logos/hustle.svg when brand assets arrive */`. Resolves when Hustle brand assets received.

## Success Criteria Verification

- [x] `grep -c "@theme inline" apps/staff-web/app/global.css` returns `0` (R-01)
- [x] `--color-studio-accent: hsl(var(--studio-accent));` inside bare `@theme {` block after upstream @import (R-13)
- [x] `:root` contains `--studio-accent: 25 95% 53%;` as bare HSL (R-02)
- [x] `@import "./skins/default.css"` and `@import "./skins/hustle.css"` both appear after `.dark {` block closing brace (R-09)
- [x] Line 1 still contains `fonts.googleapis.com` (untouched — plan 04 owns it)
- [x] `skins/config.ts` exports `SkinName`, `SkinConfig`, `getSkinConfig`
- [x] `default.css` contains `:root[data-studio="default"]` with `--primary: 24 95% 53%;` (orange-500)
- [x] `hustle.css` contains `:root[data-studio="hustle"]`, TODO comment, indigo placeholder values, `html.dark[data-studio="hustle"]` block
- [x] `studios/default/env.yml` contains `GYMOS_STUDIO_SKIN: default`
- [x] `studios/hustle/env.yml` contains `GYMOS_STUDIO_SKIN: hustle`
- [x] No `.ts`/`.js` loader references `env.yml` in apps/staff-web

## Self-Check: PASSED
