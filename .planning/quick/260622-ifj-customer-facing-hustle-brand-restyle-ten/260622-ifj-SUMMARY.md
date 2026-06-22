---
phase: quick-260622-ifj
plan: 01
subsystem: staff-web/customer-facing-ssr
tags: [brand, fonts, tenant, remotion, ssr, embed]
dependency_graph:
  requires: []
  provides: [tenant-brand-config, poppins-ssr, hustle-video-captions, gym-promo-poppins]
  affects: [public-form, schedule-widget, embed-buy, public-video, public-content, remotion-video]
tech_stack:
  added: ["@remotion/google-fonts@4.0.481"]
  patterns: ["per-deploy tenant-brand config module", "Google Fonts preconnect link in SSR heads", "param-present-or-tenant-default accent resolution"]
key_files:
  created:
    - apps/staff-web/server/lib/tenant-brand.ts
  modified:
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/lib/embed-buy-handler.ts
    - apps/staff-web/server/lib/public-video-ssr.ts
    - apps/staff-web/server/lib/public-content-ssr.ts
    - apps/staff-web/features/video/GymPromo.tsx
    - apps/staff-web/package.json
decisions:
  - "Hardcode HUSTLE tokens in ONE config module (tenant-brand.ts) — no auto-fetch; deferred to gym #2."
  - "Poppins loaded via Google Fonts <link> in SSR heads (not @font-face woff2) — no new static asset required."
  - "Accent/radius fallback: only call sanitizeHexColor when param is present; else use tenantBrand.primary — sanitizeHexColor contract preserved."
  - "GymPromo loadFont() called at module level (not in component body) — documented Remotion pattern."
  - "embed-snippet.ts left untouched — tenant default flows automatically because absent params now trigger SSR fallback."
metrics:
  duration: ~20min
  completed: "2026-06-22"
  tasks: 3
  files: 8
---

# Quick Task 260622-ifj: Customer-Facing HUSTLE Brand Restyle — Summary

One-liner: Per-deploy tenant-brand config (HUSTLE: Poppins, #FAD02C yellow, #121212 dark text) wired into all 5 customer-facing SSR surfaces and the Remotion GymPromo video.

## What Was Built

### Task 1 — Tenant-brand config + schedule-widget + public-form

Created `apps/staff-web/server/lib/tenant-brand.ts`: typed `TenantBrand` interface + exported `tenantBrand` constant with HUSTLE tokens (Poppins Google Fonts href, `#FAD02C` primary, `#121212` primaryText, `#CE6334` secondaryAccent, radius 8, logo URL, displayName "Hustle"). File is clearly commented as per-deploy/swappable.

`schedule-widget-ssr.ts`:
- Poppins Google Fonts `<link>` (preconnect + stylesheet) replaces Inter `@font-face`.
- `html { font-family: tenantBrand.fontFamily }` in CSS().
- Accent/radius resolution: only sanitize when URL param is present; else use `tenantBrand.primary` / `tenantBrand.radius`.
- `.enquire-btn` and `.submit-btn` text colour changed from `#fff` to `tenantBrand.primaryText` (#121212) — WCAG: yellow + white fails.
- All `guard:allow-color` markers preserved and updated with dark-text rationale.

`public-form-ssr.ts`:
- Same Poppins link + font-family swap in `renderFormPage()` and `notFoundPage()`.
- Same accent/radius fallback logic in `renderPublicFormHtml()`.
- `.submit-btn` `color:#fff` → `color:${tenantBrand.primaryText}`. Guard comment updated.
- `sanitizeHexColor`/`sanitizeIntPx` functions left unchanged (CSS injection guards).

`embed-snippet.ts`: No changes needed — absent `data-accent` on the host div sends no `?accent=` param to the iframe, which now falls back to `tenantBrand.primary` automatically.

### Task 2 — embed-buy + public-video (Hustle) + public-content

`embed-buy-handler.ts`:
- Inter Google Fonts link replaced with `tenantBrand.googleFontsHref`.
- `html { font-family: tenantBrand.fontFamily }` in CSS().
- GET handler: `accentParam ? sanitizeHexColor(accentParam) : tenantBrand.primary`.
- POST handler: `sanitizeHexColor(null)` / `sanitizeIntPx(null)` replaced with `tenantBrand.primary` / `tenantBrand.radius` so error re-renders also use brand.
- `.submit-btn` `color:#fff` → `color:${tenantBrand.primaryText}`; new `guard:allow-color` comment added.

`public-video-ssr.ts`:
- Poppins link + font-family in `renderVideoPage()` and `notFoundPage()`.
- `description`: `"RunStudio"` -> `tenantBrand.displayName` ("Hustle").
- Watch caption: `"RunStudio"` -> `escapeHtml(tenantBrand.displayName)`.

`public-content-ssr.ts`:
- Poppins link + font-family in `renderContentPage()` and `notFoundPage()`.
- No accent/CTA changes (content page has no brand buttons).

### Task 3 — Remotion GymPromo Poppins

`package.json`: `"@remotion/google-fonts": "4.0.481"` added (exact version match to installed `remotion`/`@remotion/player` 4.0.481).

`GymPromo.tsx`:
- `import { loadFont } from "@remotion/google-fonts/Poppins"` added.
- `const { fontFamily: poppinsFamily } = loadFont("normal", { weights: ["400", "700"] })` — module-level call (Remotion documented pattern).
- All 5 `fontFamily: "-apple-system, ..."` strings replaced with `fontFamily: poppinsFamily`.
- No VideoSpec schema change (font is an in-composition concern).

## Deviations from Plan

None — plan executed exactly as written. `embed-snippet.ts` not modified (confirmed tenant default flows via SSR fallback, as the plan allowed).

## Known Stubs

None — no placeholder text or hardcoded empty values introduced. All brand tokens are real HUSTLE values.

## Self-Check: PASSED

All created/modified files exist. All 3 task commits confirmed:

| Commit | Task | Description |
|--------|------|-------------|
| `a6ec4034` | T1 | tenant-brand.ts + schedule-widget + public-form |
| `70a09f2f` | T2 | embed-buy + public-video (Hustle) + public-content |
| `08c7beba` | T3 | GymPromo Poppins via @remotion/google-fonts |

`pnpm typecheck` (tsc --noEmit): exit 0 after each task and after all 3 tasks. Only pre-existing `TS2688` (vite/client type def) warning — not introduced by these changes.
