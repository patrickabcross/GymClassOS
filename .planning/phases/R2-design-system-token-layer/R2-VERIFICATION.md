---
phase: R2-design-system-token-layer
verified: 2026-06-13T00:00:00Z
status: human_needed
score: 5/5 must-haves verified (code-level)
re_verification: null
gaps: []
human_verification:
  - test: "Set GYMOS_STUDIO_SKIN=hustle in Vercel dashboard and redeploy. Open the staff web (/gymos)."
    expected: "Nav renders 'Hustle' (not 'GymClassOS'), primary color is indigo (not orange), <html data-studio='hustle'> in DevTools Elements"
    why_human: "No local dev server (NitroViteError) — deploy-time env-var switch proof requires a live Vercel deploy"
  - test: "Open any Radix portal (Dialog, Tooltip, Popover, Select) on /gymos with GYMOS_STUDIO_SKIN=hustle active"
    expected: "Modal/portal renders in indigo (not orange) — confirms data-studio is on <html> so Radix portals that mount at document.body still inherit the skin (R-14)"
    why_human: "Requires running deploy; portal skin inheritance is not checkable from source alone"
  - test: "Hard-reload /gymos with GYMOS_STUDIO_SKIN=hustle set (no stale cache)"
    expected: "No flash of orange (default skin) before indigo renders — confirms no FOUC from data-studio being set SSR-inline rather than via useEffect (R-15)"
    why_human: "FOUC behavior is a browser render-pipeline phenomenon, not detectable from source"
  - test: "Open DevTools Network tab on any staff-web page (/gymos, /gymos/schedule, /gymos/inbox) and filter for 'fonts.googleapis.com'"
    expected: "Zero requests to fonts.googleapis.com — Inter loads as /fonts/inter-variable.woff2 (200, same-origin)"
    why_human: "Network-tab absence is only confirmable in a running browser against the deployed app"
  - test: "Open an embed page (/embed/schedule or a public form /f/<slug>) and check the Network tab for 'fonts.googleapis.com'"
    expected: "Zero Google Fonts requests on embed/SSR pages — the @font-face in each SSR page covers it"
    why_human: "Same as above — SSR page network behavior requires a live deploy"
---

# Phase R2: Design System Token Layer — Verification Report

**Phase Goal:** All staff-web colors, typography, and radius resolve from CSS custom-property tokens; the skin injector selects the right skin at deploy time; Hustle and GymClassOS default skins exist; Inter is self-hosted.
**Verified:** 2026-06-13
**Status:** human_needed
**Re-verification:** No — initial verification

All five code-level must-haves are VERIFIED. The five remaining items are deploy/browser verifications that cannot be checked without a running Vercel deployment (no local dev server — `NitroViteError` constraint documented in ROADMAP.md and R2-CONTEXT.md).

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CI grep guard fails if hardcoded hex appears in app code outside skin files | VERIFIED | `node scripts/guard-no-hardcoded-colors.mjs` exits 0; script exists with correct scan roots, skins exemption, per-line and whole-file markers; wired into `package.json` guards chain and `.github/workflows/ci.yml` `guards:` job |
| 2 | Setting GYMOS_STUDIO_SKIN=hustle causes staff web to render Hustle colors (no code change) | CODE VERIFIED / DEPLOY NEEDED | Mechanism: `root.tsx` loader reads `process.env.GYMOS_STUDIO_SKIN`, returns `skin.name`; `Layout()` sets `data-studio={studioName}` on `<html>` SSR-inline; `hustle.css` has `:root[data-studio="hustle"]` with indigo-500 tokens; `getSkinConfig("hustle")` returns `displayName: "Hustle"`. No code change needed — only env var + redeploy. Visual proof is deploy-only. |
| 3 | default.css and hustle.css both exist; switching requires only an env-var change | VERIFIED | Both files exist at `apps/staff-web/app/skins/`; default.css has `:root[data-studio="default"]` with orange-500 tokens; hustle.css has `:root[data-studio="hustle"]` with indigo-500 placeholder tokens marked TODO; switching is purely `GYMOS_STUDIO_SKIN` env var |
| 4 | No fonts.googleapis.com request on any staff-web page load; Inter served same-origin | CODE VERIFIED / DEPLOY NEEDED | `grep -r "fonts.googleapis.com" apps/staff-web` returns zero; `inter-variable.woff2` exists (352,240 bytes, wOF2 magic bytes); `global.css` has `@font-face` pointing to `/fonts/inter-variable.woff2`; all three SSR pages contain `woff2-variations`. Network-tab absence requires live deploy. |
| 5 | Studio name and logo appear at top of staff nav, sourced from active skin config | VERIFIED | `GymosTopNav.tsx` reads `useRouteLoaderData("root")`, derives `displayName ?? "GymClassOS"` and `logo ?? null`; renders `{logo ? <img...> : displayName}`; literal hardcoded `>GymClassOS<` text node is gone; `GymosTopNav` is rendered in `gymos.tsx` layout |

**Score:** 5/5 truths verified at code level; 2 require deploy confirmation.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/staff-web/app/global.css` | GymClassOS `@theme` tokens + skin `@import`s | VERIFIED | `@theme` block at line 17 with `--color-studio-accent: hsl(var(--studio-accent))` and `--color-studio-accent-soft`; `:root` has bare HSL `--studio-accent: 25 95% 53%`; skin `@import`s at lines 771-772 (last lines, after `.dark` block at line 56); zero `@theme inline` |
| `apps/staff-web/app/skins/config.ts` | Typed skin registry (SkinName, SkinConfig, getSkinConfig) | VERIFIED | Exports all three; `default` entry has `displayName: "GymClassOS"`, `logo: null`; `hustle` entry has `displayName: "Hustle"`, `logo: null`; `getSkinConfig()` falls back to `skins.default` |
| `apps/staff-web/app/skins/default.css` | Default GymClassOS orange skin | VERIFIED | `:root[data-studio="default"]` block with `--primary: 24 95% 53%` (orange-500); all values bare HSL (no `hsl()` wrapper); R-02 satisfied |
| `apps/staff-web/app/skins/hustle.css` | Hustle placeholder skin, visibly distinct | VERIFIED | `:root[data-studio="hustle"]` with indigo-500 `--primary: 258 84% 56%`; `/* TODO: replace with Hustle brand values */` comment; `html.dark[data-studio="hustle"]` combined selector (R-09); all values bare HSL |
| `scripts/guard-no-hardcoded-colors.mjs` | CI guard scanning hex + tw arbitrary colors | VERIFIED | Scans `apps/staff-web/{app,server,features}`; exempts `skins/` path prefix; whole-file sentinel; per-line marker; correct hex regex and Tailwind arbitrary-color regex; exits 0 on current codebase |
| `apps/staff-web/public/fonts/inter-variable.woff2` | Self-hosted Inter variable font binary | VERIFIED | Exists, 352,240 bytes (> 50,000), `wOF2` magic bytes confirmed |
| `apps/staff-web/app/root.tsx` | Root loader + data-studio on `<html>` + guard:allow-color markers | VERIFIED | `export async function loader` reads `GYMOS_STUDIO_SKIN`; returns plain object (no `json()`); `data-studio={studioName}` on `<html>` in `Layout()`; `?? "default"` fallback; three hex literals (`#7C3AED`, `#F97316` x2) each have `// guard:allow-color` on same line; old `#3B82F6` is gone; `data-studio` is NOT set in any `useEffect` |
| `apps/staff-web/app/components/gymos/GymosTopNav.tsx` | Skin-sourced studio identity | VERIFIED | `useRouteLoaderData("root")` present; `displayName ?? "GymClassOS"` fallback; `logo ?? null` fallback; logo branch renders `<img src={logo}>`; wordmark branch renders `{displayName}`; hardcoded `>GymClassOS<` text node is gone |
| `studios/default/env.yml` | Deploy contract documenting GYMOS_STUDIO_SKIN=default | VERIFIED | Exists at `studios/default/env.yml`; contains `GYMOS_STUDIO_SKIN: default`; comments state NOT loaded at runtime; no `.ts`/`.js` file in apps/staff-web reads it |
| `studios/hustle/env.yml` | Deploy contract documenting GYMOS_STUDIO_SKIN=hustle | VERIFIED | Exists at `studios/hustle/env.yml`; contains `GYMOS_STUDIO_SKIN: hustle`; comments state NOT loaded at runtime |
| `package.json` | guard:no-hardcoded-colors wired into guards chain | VERIFIED | `"guard:no-hardcoded-colors": "node scripts/guard-no-hardcoded-colors.mjs"` present; guards chain ends with `&& pnpm guard:no-hardcoded-colors` |
| `.github/workflows/ci.yml` | `guards:` job invoking `pnpm guards` | VERIFIED | `guards:` job at line 231; full checkout → pnpm/node setup → `pnpm install --frozen-lockfile` → `pnpm guards` step |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `global.css` | `skins/default.css` | `@import "./skins/default.css"` at line 771 | VERIFIED | Pattern present after `.dark` block (line 56) — R-09 satisfied |
| `global.css` | `skins/hustle.css` | `@import "./skins/hustle.css"` at line 772 | VERIFIED | Same cascade position |
| `root.tsx` loader | `skins/config.ts` | `import { getSkinConfig, type SkinName } from "./skins/config"` | VERIFIED | Import present; loader calls `getSkinConfig(skinName)` |
| `root.tsx Layout()` | `<html data-studio>` | `useRouteLoaderData<typeof loader>("root")` → `data-studio={studioName}` | VERIFIED | On `<html>` element (not inner div) — R-14 satisfied; no useEffect — R-15 satisfied |
| `GymosTopNav.tsx` | root loader data | `useRouteLoaderData("root")` → `skin.displayName` / `skin.logo` | VERIFIED | Read with typed cast and `?? "GymClassOS"` / `?? null` fallbacks |
| `root.tsx accentHex literals` | R2-03 color guard | `// guard:allow-color` on same line as each hex | VERIFIED | Three hex literals (`#7C3AED`, `#F97316`, `#F97316` fallback) each have marker on same physical line; guard runs on root.tsx and does not flag it |
| `package.json guards chain` | `guard-no-hardcoded-colors.mjs` | `pnpm guard:no-hardcoded-colors` in guards chain | VERIFIED | Chain ends with `&& pnpm guard:no-hardcoded-colors` |
| `.github/workflows/ci.yml` | guards chain | `run: pnpm guards` step in `guards:` job | VERIFIED | Job exists with full pnpm install + `pnpm guards` |
| `global.css @font-face` | `inter-variable.woff2` | `src: url("/fonts/inter-variable.woff2") format("woff2-variations")` | VERIFIED | Pattern present in global.css; woff2 binary exists and is valid |
| `root.tsx <head>` | `inter-variable.woff2` | `<link rel="preload" as="font" ... href="/fonts/inter-variable.woff2">` | VERIFIED | Preload link at line 99, before `<Meta />` and `<Links />` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `root.tsx loader` | `skinName`, `skin`, `accentHex` | `process.env.GYMOS_STUDIO_SKIN` → `getSkinConfig()` (pure TS module, no async) | Yes — synchronous env-var read, zero DB round-trip | FLOWING |
| `Layout()` | `studioName`, `themeColor` | `useRouteLoaderData<typeof loader>("root")` with `?? "default"` / `?? "#F97316"` fallbacks | Yes — reads from root loader data | FLOWING |
| `GymosTopNav` | `displayName`, `logo` | `useRouteLoaderData("root")` → `skin.displayName` / `skin.logo` | Yes — skin config has real displayName; logo is null (intentional) for both skins in R2 | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Color guard exits 0 on full codebase | `node scripts/guard-no-hardcoded-colors.mjs` | `[guard] OK: no hardcoded colors in apps/staff-web (outside skins/)` | PASS |
| Inter woff2 binary is valid | `head -c 4 apps/staff-web/public/fonts/inter-variable.woff2` | `wOF2` | PASS |
| Inter woff2 is non-trivial size | `wc -c < apps/staff-web/public/fonts/inter-variable.woff2` | `352240` (> 50000) | PASS |
| No fonts.googleapis.com in any staff-web source | `grep -r "fonts.googleapis.com" apps/staff-web` | (empty — exit 1) | PASS |
| skins/config.ts exports correct shape | Node parse of TS source | All three exports present; fallback present | PASS |
| Skin switch requires only env var (no code change) | Mechanism trace in root.tsx | `process.env.GYMOS_STUDIO_SKIN ?? "default"` → `getSkinConfig()` → CSS attribute selector | PASS |
| Actual skin color render after deploy with hustle | Vercel deploy + browser | NOT TESTABLE (no local dev server) | SKIP — deploy verification |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DSGN-01 | R2-01, R2-03 | Bare `@theme`, no hardcoded hex, CI guard | SATISFIED | `guard-no-hardcoded-colors.mjs` exits 0; zero `@theme inline`; guard wired into CI |
| DSGN-02 | R2-02 | Skin selected at deploy time via GYMOS_STUDIO_SKIN, SSR-injected, zero DB round-trip | SATISFIED | Root loader reads `process.env.GYMOS_STUDIO_SKIN`; `data-studio` set inline on `<html>` in SSR `Layout()`; `getSkinConfig()` is a pure TS module (no DB) |
| DSGN-03 | R2-01 | Hustle + default skins exist; switchable by env var only | SATISFIED | Both CSS files exist with correct `data-studio` attribute selectors; env var + redeploy is the only required change |
| DSGN-04 | R2-04 | Inter self-hosted; no fonts.googleapis.com on any page load | SATISFIED (code) / DEPLOY-VERIFY (network tab) | Zero Google Fonts references in source; woff2 binary committed and valid; `@font-face` in global.css and all three SSR pages |
| DSGN-05 | R2-02 | Studio name + logo at top of staff sidebar from skin config | SATISFIED | `GymosTopNav` renders `displayName`/`logo` from `useRouteLoaderData("root")`; note ROADMAP says "sidebar" but R2-CONTEXT D-14 explicitly documents that top-nav placement satisfies DSGN-05 for R2 (sidebar layout is R4 scope) |

No orphaned requirements — all five DSGN-01..05 are claimed by plans and verified in code.

---

### Pitfall Compliance

| Pitfall | Rule | Status | Evidence |
|---------|------|--------|---------|
| R-01 | No `@theme inline` — bakes hex at build time | PASS | `grep -c "@theme inline" apps/staff-web/app/global.css` = 0 |
| R-02 | Bare space-separated HSL in `:root` (no `hsl()` wrapper) | PASS | `:root` values are bare HSL; `@theme` block wraps with `hsl(var(...))`; skin CSS files have no `hsl()` wrappers on custom properties |
| R-09 | Skin `@import`s after `.dark` block | PASS | `.dark` block ends at line 85; skin `@import`s are at lines 771-772 |
| R-13 | GymClassOS `@theme` after `@import "@agent-native/core/styles/agent-native.css"` | PASS | agent-native.css import at line 11; `@theme` block at line 17 |
| R-14 | `data-studio` on `<html>`, not inner div | PASS | `<html lang="en" suppressHydrationWarning data-studio={studioName}>` at root.tsx line 76 |
| R-15 | `data-studio` set SSR-inline (not via useEffect) | PASS | `data-studio` is a JSX attribute in `Layout()`; grep for `useEffect` near `data-studio` returns nothing |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | Guard exits 0; all hex converted/marked/sentineled |

---

### Human Verification Required

#### 1. Hustle Skin Visual Render

**Test:** Set `GYMOS_STUDIO_SKIN=hustle` in the Vercel dashboard, redeploy, and navigate to `/gymos`.
**Expected:** Staff nav displays "Hustle" (not "GymClassOS"); primary interactive elements (active tab, buttons, focus rings) render in indigo (not orange); `<html data-studio="hustle">` is visible in DevTools Elements panel.
**Why human:** No local dev server — deploy-time env-var proof requires a live Vercel deployment.

#### 2. Radix Portal Skin Inheritance

**Test:** With `GYMOS_STUDIO_SKIN=hustle` active, open any Dialog, Popover, Tooltip, or Select dropdown on `/gymos`.
**Expected:** The portal (rendered at `document.body`) renders in indigo, not orange — confirming that `data-studio` is on `<html>` (R-14) so portals that escape the component tree still inherit the skin.
**Why human:** Portal rendering behavior requires a running browser against the deployed app.

#### 3. No Flash of Unstyled Content (FOUC) on Hard Reload

**Test:** With `GYMOS_STUDIO_SKIN=hustle` active, hard-reload `/gymos` (Ctrl+Shift+R) and observe the initial paint.
**Expected:** Page renders in Hustle indigo from the first paint — no brief flash of orange (default skin) before switching. Confirms `data-studio` is set server-side, not via a client `useEffect` (R-15).
**Why human:** FOUC is a browser render-pipeline phenomenon not detectable from source.

#### 4. No Google Fonts Network Request (Staff Web)

**Test:** Open DevTools Network tab, navigate to `/gymos`, `/gymos/schedule`, and `/gymos/inbox`. Filter requests for `fonts.googleapis.com`.
**Expected:** Zero requests to `fonts.googleapis.com`. Inter loads as `GET /fonts/inter-variable.woff2` (200, same-origin). No external CDN font request appears.
**Why human:** Network-tab absence requires a live browser session against the deployed app.

#### 5. No Google Fonts Network Request (Embed / SSR Pages)

**Test:** Open an embed page (`/embed/schedule`) and a public form (`/f/<slug>`) and check Network tab for `fonts.googleapis.com`.
**Expected:** Zero Google Fonts requests on any SSR/embed page — `@font-face` in each page's inline `<style>` covers it.
**Why human:** Same as #4.

---

### Gaps Summary

No code-level gaps. All five ROADMAP success criteria are satisfied in source:

1. The CI guard (`guard-no-hardcoded-colors.mjs`) exists, is correctly written, exits 0, and is wired into `pnpm guards` + `ci.yml`. DSGN-01 is fully enforced.
2. The skin-switch mechanism is complete in code — root loader reads `GYMOS_STUDIO_SKIN`, `Layout()` sets `data-studio` on `<html>` SSR-inline, and both skin CSS files are imported into every page load. The deploy-level visual proof (success criterion 2) is the only remaining confirmation, and it is properly classified as a deploy verification.
3. Both skin files exist with correct `data-studio` attribute selectors. DSGN-03 satisfied.
4. Zero `fonts.googleapis.com` references in source; valid woff2 binary committed; `@font-face` in all surfaces. DSGN-04 is code-level satisfied; network-tab confirmation is deploy-only.
5. `GymosTopNav` renders `displayName`/`logo` from root loader. DSGN-05 satisfied. The ROADMAP says "sidebar" but R2-CONTEXT D-14 explicitly documents that top-nav placement satisfies this for R2 (sidebar is R4 scope).

The five human verification items are all deploy/browser checks that follow directly from the no-local-dev-server constraint. They are not code gaps.

---

_Verified: 2026-06-13_
_Verifier: Claude (gsd-verifier)_
