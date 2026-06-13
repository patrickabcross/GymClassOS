---
phase: R2-design-system-token-layer
plan: "04"
subsystem: fonts
tags: [inter, self-hosted, font-face, ssr, dsgn-04]
dependency_graph:
  requires: [R2-01, R2-02]
  provides: [self-hosted-inter-woff2, no-google-fonts-anywhere]
  affects:
    - apps/staff-web/public/fonts/inter-variable.woff2
    - apps/staff-web/app/global.css
    - apps/staff-web/app/root.tsx
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/features/marketing/lib/marketing-ssr.ts
tech_stack:
  added: []
  patterns: [self-hosted-variable-font, font-face-woff2-variations, font-preload-hint]
key_files:
  created:
    - apps/staff-web/public/fonts/inter-variable.woff2
  modified:
    - apps/staff-web/app/global.css
    - apps/staff-web/app/root.tsx
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/features/marketing/lib/marketing-ssr.ts
decisions:
  - InterVariable.woff2 downloaded from rsms/inter v4.1 (352KB, single file covers weight range 100-900)
  - Manual woff2 commit preferred over vite-plugin-webfont-dl — deterministic, no build-time network call
  - @font-face injected at TOP of existing <style> blocks in SSR pages — avoids creating new <style> elements
  - notFoundPage() in public-form-ssr.ts wrapped standalone link in a <style>+@font-face block (had no prior <style>)
  - root.tsx preload <link> added before <Meta /> and <Links /> — R2-02 loader/data-studio/theme-color NOT touched
  - schedule-widget-ssr.ts color/inline-CSS lines left intact — plan 03 owns those edits
metrics:
  duration: "~5 minutes"
  completed: "2026-06-13"
  tasks_completed: 2
  files_modified: 5
  files_created: 1
---

# Phase R2 Plan 04: Self-Hosted Inter Summary

**One-liner:** InterVariable.woff2 (rsms/inter v4.1, 352KB) committed to public/fonts; Google Fonts @import in global.css replaced with @font-face; preload hint added to root.tsx; all three SSR embed/marketing pages updated — zero fonts.googleapis.com requests on any staff-web page load (DSGN-04).

## What Was Built

### Task 1: Download Inter woff2 + update global.css + add preload to root.tsx

Three changes landed atomically:

1. **Binary asset committed** — `apps/staff-web/public/fonts/inter-variable.woff2` (rsms/inter v4.1, 352,240 bytes, verified wOF2 magic bytes). The React Router v7 / Vite `public/` directory serves it at `/fonts/inter-variable.woff2` on Vercel.

2. **global.css line 1 replaced** — The `@import url("https://fonts.googleapis.com/...")` is gone. In its place is an `@font-face` block at the very top of the file (before `@import "tailwindcss"`):
   ```css
   @font-face {
     font-family: "Inter";
     font-style: normal;
     font-weight: 100 900;
     font-display: swap;
     src: url("/fonts/inter-variable.woff2") format("woff2-variations");
   }
   ```
   The existing `body { font-family: "Inter", sans-serif; }` rule is unchanged — it now resolves to the self-hosted font.

3. **root.tsx preload link added** — Inside `Layout()`, before `<Meta />` and `<Links />`, a font preload hint:
   ```tsx
   <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/inter-variable.woff2" />
   ```
   The R2-02 root loader, `data-studio` attribute on `<html>`, and skin-aware `theme-color` meta are **untouched** — only this one `<link>` was added.

### Task 2: Replace Google Fonts tags in all three SSR pages

Each SSR page had its `preconnect` + `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` tags removed and replaced with an inline `@font-face` rule inside the page's existing `<style>` block:

- **`public-form-ssr.ts` (main template)**: Removed 3 lines (preconnect + preconnect crossorigin + link); injected `@font-face` at the top of the existing `<style>` block that already opened at the same location.
- **`public-form-ssr.ts` (`notFoundPage()`)**: The 404 function had only a bare `<link>` (no existing `<style>`). Replaced with a `<style>@font-face{...}${CSS()}</style>` block.
- **`schedule-widget-ssr.ts`**: Removed the 3 font lines; injected `@font-face` at the top of the existing `<style>` block. The `--gym-accent`/`--gym-radius` CSS var lines and all color inline styles were left completely untouched (plan R2-03 owns those edits).
- **`marketing-ssr.ts`**: Removed the 3 font lines; injected `@font-face` at the top of the existing `<style>` block.

All pages now serve Inter from `/fonts/inter-variable.woff2` — same origin as the Vercel deploy, so no CORS needed even inside embed iframes.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 4bdfa84b | feat(R2-04): self-host Inter woff2 + replace Google Fonts import in global.css + preload in root.tsx |
| 2 | 96672cab | feat(R2-04): replace Google Fonts tags in all three SSR pages with self-hosted @font-face |

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **rsms/inter v4.1 release asset** — used the direct raw URL `https://github.com/rsms/inter/raw/v4.1/docs/font-files/InterVariable.woff2`. Downloaded cleanly, verified `wOF2` magic bytes and 352KB size.
2. **@font-face injected into existing `<style>` blocks** — rather than creating new `<style>` elements before the existing one, the `@font-face` rule was placed at the top of the already-present `<style>` in each SSR page. Cleaner HTML structure.
3. **notFoundPage() special case** — this function had no existing `<style>` block; the bare `<link>` was replaced with `<style>@font-face{...}${CSS()}</style>`. This correctly wraps both the new font declaration and the existing CSS helper output.
4. **schedule-widget-ssr.ts color lines untouched** — confirmed no edits to the `--gym-accent`, `--gym-radius`, or any color-related CSS lines in that file. Plan R2-03 (wave 4) will edit those in a subsequent plan.
5. **root.tsx minimal-touch** — only added the preload `<link>` before `<Meta />/<Links />`. The R2-02 loader, `data-studio`, `themeColor`, accentHex constants, and guard:allow-color markers were not modified.

## Known Stubs

None — DSGN-04 is fully satisfied. All fonts.googleapis.com references have been eliminated from every staff-web surface.

## Success Criteria Verification

- [x] `apps/staff-web/public/fonts/inter-variable.woff2` exists (`test -f` passes), `wOF2` magic bytes confirmed, size = 352,240 bytes (> 50,000)
- [x] `grep -c "fonts.googleapis.com" apps/staff-web/app/global.css` returns 0
- [x] `global.css` contains `@font-face` with `src: url("/fonts/inter-variable.woff2") format("woff2-variations")`
- [x] `global.css` still has `font-family: "Inter", sans-serif;` in body (unchanged)
- [x] `root.tsx` `<head>` contains `<link rel="preload" as="font" ... href="/fonts/inter-variable.woff2" />` before `<Links />`
- [x] `root.tsx` loader / `data-studio` / `theme-color` were NOT modified — remain exactly as R2-02 left them
- [x] `grep -r "fonts.googleapis.com" apps/staff-web` returns ZERO results (all 5 modified files clean)
- [x] `public-form-ssr.ts` contains `woff2-variations` in both the main template and `notFoundPage()`
- [x] `schedule-widget-ssr.ts` contains `woff2-variations`; color/inline-CSS lines untouched
- [x] `marketing-ssr.ts` contains `woff2-variations`

## Self-Check: PASSED
