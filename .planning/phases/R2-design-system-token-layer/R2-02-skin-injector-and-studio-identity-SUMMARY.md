---
phase: R2-design-system-token-layer
plan: "02"
subsystem: skin-injector
tags: [root-loader, ssr, studio-identity, skin-system, rr-v7]
dependency_graph:
  requires: [R2-01]
  provides: [root-loader-skin-data, data-studio-html-attribute, skin-aware-theme-color, gym-top-nav-identity]
  affects: [apps/staff-web/app/root.tsx, apps/staff-web/app/components/gymos/GymosTopNav.tsx]
tech_stack:
  added: []
  patterns: [rr-v7-root-loader, useRouteLoaderData-root, data-studio-ssr-attribute, guard-allow-color-marker]
key_files:
  created: []
  modified:
    - apps/staff-web/app/root.tsx
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
decisions:
  - Root loader reads GYMOS_STUDIO_SKIN env var and returns plain object (no json()) — zero DB round-trip (DSGN-02)
  - data-studio set as JSX attribute on <html> in Layout() via useRouteLoaderData("root") — SSR-inline, no useEffect, no FOUC (R-14, R-15)
  - accentHex literal hex values carry guard:allow-color markers — cross-plan contract so R2-03 color guard passes without touching root.tsx
  - themeColor fallback hex also carries guard:allow-color marker for same reason
  - GymosTopNav reads useRouteLoaderData("root") with GymClassOS fallback for non-gymos routes
metrics:
  duration: "~20 minutes"
  completed: "2026-06-13"
  tasks_completed: 2
  files_modified: 2
  files_created: 0
---

# Phase R2 Plan 02: Skin Injector and Studio Identity Summary

**One-liner:** Root loader resolves `GYMOS_STUDIO_SKIN` at SSR time and wires skin name into `data-studio` on `<html>` and studio displayName/logo into `GymosTopNav`, with all new hex literals guarded for R2-03.

## What Was Built

### Task 1: Root loader + data-studio on <html> + skin-aware theme-color (root.tsx)

Three additive changes to `apps/staff-web/app/root.tsx`:

1. **Imports:** Added `useRouteLoaderData` to the existing `react-router` destructure; added `import type { Route } from "./+types/root"` and `import { getSkinConfig, type SkinName } from "./skins/config"`.

2. **Root loader:** New `export async function loader(_args: Route.LoaderArgs)` — the first-ever root loader in this file. Reads `process.env.GYMOS_STUDIO_SKIN ?? "default"`, calls `getSkinConfig()` (pure TS, zero DB round-trip), computes `accentHex` with a ternary where both hex literals (`#7C3AED` for hustle, `#F97316` for default) carry inline `// guard:allow-color` markers. Returns a plain object `{ skin: { name, displayName, logo }, accentHex }` — no `json()` call (RR v7 convention).

3. **Layout function:** Now reads `useRouteLoaderData<typeof loader>("root")` with `?? "default"` fallback for `studioName` and `?? "#F97316"` fallback for `themeColor` (the fallback hex also carries a `// guard:allow-color` marker). The `<html>` element gains `data-studio={studioName}` as a static JSX attribute. The old hardcoded `content="#3B82F6"` on `<meta name="theme-color">` is replaced with `content={themeColor}`.

**Cross-plan contract satisfied:** All three hex literals in root.tsx carry `// guard:allow-color` markers on the same physical line. Plan R2-03's color guard scans `apps/staff-web/app/**` and will see these markers — it does NOT need to touch root.tsx.

### Task 2: Skin identity in GymosTopNav (DSGN-05)

Two changes to `apps/staff-web/app/components/gymos/GymosTopNav.tsx`:

1. **Import:** Added `useRouteLoaderData` to the existing `react-router` import destructure.

2. **Studio identity:** Inside `GymosTopNav()`, reads `useRouteLoaderData("root")` with a typed cast and derives `displayName` (fallback `"GymClassOS"`) and `logo` (fallback `null`). The line-56 hardcoded `<span>GymClassOS</span>` is replaced with a conditional: renders `<img src={logo} alt={displayName} className="h-5 w-auto" />` when `logo` is non-null, otherwise renders `{displayName}`. All other nav tabs and the sign-out handler are unchanged.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | e3ea446e | feat(R2-02): add root loader + data-studio on <html> + skin-aware theme-color |
| 2 | 7b1f25d8 | feat(R2-02): render skin identity in GymosTopNav (DSGN-05) |

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **RR v7 plain-object return** — loader returns `{ skin, accentHex }` with no `json()` wrapper, matching the established convention in this codebase (verified against `gymos._index.tsx`).
2. **`useRouteLoaderData<typeof loader>("root")`** — typed call in `Layout()` (not `useLoaderData()` which is only for route components). Preserves type safety on `data.skin.name` and `data.accentHex`.
3. **`?? "default"` fallback on studioName** — guards against `useRouteLoaderData` returning `undefined` on non-gymos routes where the loader may not have resolved.
4. **Merged `useRouteLoaderData` into existing import** — added to the destructured `react-router` import rather than duplicating the import line, for cleaner code.
5. **guard:allow-color on themeColor fallback** — the `themeColor` fallback `"#F97316"` in `Layout()` also carries the marker because it is a bare hex in an HTML attribute context (same reason as the accentHex constants).

## Known Stubs

None — all skin data paths are wired. The Hustle skin's `displayName: "Hustle"` and `logo: null` are intentional placeholders from R2-01 (awaiting Hustle brand assets). These are documented stubs from the R2-01 plan, not introduced here.

## Success Criteria Verification

- [x] `root.tsx` contains `export async function loader` AND `process.env.GYMOS_STUDIO_SKIN`
- [x] `root.tsx` imports `getSkinConfig` from `./skins/config`
- [x] `<html` element carries `data-studio={studioName}` (on html element, not inner div — R-14)
- [x] `studioName` derived with `?? "default"` fallback
- [x] `data-studio` is NOT set inside any `useEffect` (it's a JSX attribute only — R-15)
- [x] Old `content="#3B82F6"` is GONE; theme-color reads `content={themeColor}`
- [x] `#7C3AED` and `#F97316` accentHex lines each carry `// guard:allow-color` marker on same line
- [x] `themeColor` fallback hex carries `// guard:allow-color` marker on same line
- [x] Root loader returns plain object — `grep -c "json(" apps/staff-web/app/root.tsx` returns 0
- [x] `GymosTopNav.tsx` imports `useRouteLoaderData` from `react-router`
- [x] Reads `useRouteLoaderData("root")` with `?? "GymClassOS"` and `?? null` fallbacks
- [x] Literal `>GymClassOS<` text node is GONE
- [x] Logo branch renders `<img src={logo} alt={displayName} ...>`; null branch renders `{displayName}`
- [x] No new hardcoded hex added to GymosTopNav.tsx

## Self-Check: PASSED
