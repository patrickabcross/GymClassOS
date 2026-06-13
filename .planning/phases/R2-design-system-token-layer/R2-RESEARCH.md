# Phase R2: Design System Token Layer — Research

**Researched:** 2026-06-13
**Domain:** Tailwind v4 CSS custom-property token system, React Router v7 root loader, RR v7 + H3/Nitro SSR head injection, self-hosted Inter, CI guard scripting
**Confidence:** HIGH — all findings sourced from direct codebase inspection of the actual files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01–D-04:** Default skin = energetic accent on light neutral base. Orange-500 (`#F97316`) accent, orange-600 hover, orange-50 tint. White text on accent. Radius `0.5rem`.
- **D-04:** Logo slot = `null` for default skin (styled wordmark, no image). Logo slot accepts image path for studios that supply one.
- **D-05:** Skin = `apps/staff-web/app/skins/<name>.css` (token overrides under `:root[data-studio="<name>"]`) + `apps/staff-web/app/skins/config.ts` typed registry (`{ displayName, logo }`).
- **D-06:** Tokens stay staff-web-local in R2. NO `packages/gymos-tokens`. That is R5.
- **D-07:** Token vocabulary = existing shadcn `:root` vars + new `--studio-accent` / `--studio-accent-soft`. Font stays Inter for all skins.
- **D-08:** Skin selection = read `process.env.GYMOS_STUDIO_SKIN` directly. R2 scaffolds `studios/default/env.yml` + `studios/hustle/env.yml` as contract only — NO env.yml loader.
- **D-09:** Dark mode left in place. Skin overrides declared AFTER the `.dark` block (R-09) and AFTER the upstream `@import` (R-13).
- **D-10:** Skin config reaches components via root loader → `useRouteLoaderData("root")`. `data-studio` MUST be on `<html>` (R-14). Set as inline SSR attribute, not via `useEffect` (R-15).
- **D-11:** Hex elimination covers ALL of `apps/staff-web` (app, features, server).
- **D-12:** CI guard catches hex literals + Tailwind arbitrary-color values; skin files + `// guard:allow-color` marker exempt; wired into `pnpm prep` + CI.
- **D-13:** Font self-hosting covers staff-web global.css AND all SSR pages (public-form-ssr.ts lines 298/300/577, schedule-widget-ssr.ts lines 231/233, marketing-ssr.ts lines 103/105).
- **D-14:** Studio identity goes in existing GymosTopNav (replace hardcoded `"GymClassOS"` span at line 56). Fed via `useRouteLoaderData("root")`.

### Claude's Discretion

- Exact HSL token values within the orange accent family (D-02) and the full default-skin `:root` value set.
- Inter self-hosting mechanism — manual woff2 download recommended (simpler).
- Hustle placeholder palette values (clearly marked `/* TODO: replace with Hustle brand values */`).
- Guard regex implementation details and allowlist contents.
- Whether the wordmark treatment uses a logo component or inline markup.

### Deferred Ideas (OUT OF SCOPE)

- GymClassOS SVG logo mark (post-milestone).
- `packages/gymos-tokens` shared package (R5).
- Removing dark mode / ThemeToggle (R4 scope, SWEB-06).
- Real left sidebar with studio identity at top (R4 visual-refresh scope).
- `studios/<studio>/env.yml` deploy-script loader (master-branch P1a deploy machinery).
- Full semantic token system (defer to R4 if needed).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DSGN-01 | All staff-web colors, typography, and radius resolve from CSS custom-property tokens via bare `@theme` — no `@theme inline`, no hardcoded hex in GymClassOS app code (CI grep guard included) | Sections 1, 5, 6 |
| DSGN-02 | Studio skin selected at deploy time via `GYMOS_STUDIO_SKIN`, injected into every SSR `<head>` — zero DB round-trip | Sections 2, 3 |
| DSGN-03 | Hustle skin + default skin exist; switching requires only env-var change | Sections 2, 7 |
| DSGN-04 | Inter self-hosted — no `fonts.googleapis.com` on any page load | Section 4 |
| DSGN-05 | Studio name + logo at top of staff sidebar, sourced from skin config | Sections 2, 3 |
</phase_requirements>

---

## Summary

R2 installs a CSS custom-property token layer on top of the shadcn `:root` variables already in `global.css`, wires a skin-injector mechanism into `root.tsx` (adding the first root loader in this file), self-hosts Inter, and adds a CI guard that enforces the no-hardcoded-hex rule.

The codebase is in a clean state for this work: `global.css` already uses bare `@theme` (not `@theme inline`) in `packages/core/src/styles/agent-native.css`, all `:root` values are space-separated bare HSL (correct for the pitfall R-02 double-wrap pattern), the `.dark` block is already outside `@layer base`, and the Google Fonts `@import` is a single line at line 1 of `global.css` that is trivially replaced. The hex inventory is smaller than feared (6 source files total across `app/` and `features/`), making the conversion pass manageable.

The one design question to resolve concretely: the skin CSS should be **bundled with the app and selected by the `data-studio` attribute** — not dynamically injected as a per-deploy style block. This is the simpler, safer approach for Vercel and is explained in detail in Section 2.

**Primary recommendation:** Import all skin CSS files in `global.css` so skin CSS ships in the bundle; set `data-studio` on `<html>` from the root loader; root loader reads `process.env.GYMOS_STUDIO_SKIN` at request time. One env-var change + redeploy is all that's needed to switch skins.

---

## 1. Tailwind v4 `@theme` Convention in This Repo

### What agent-native.css does (HIGH confidence — direct code inspection)

`packages/core/src/styles/agent-native.css` lines 40–115 declare a bare `@theme` block (NOT `@theme inline`):

```css
@theme {
  --color-border: hsl(var(--border));
  --color-primary: hsl(var(--primary));
  --color-background: hsl(var(--background));
  /* ... all shadcn tokens follow same pattern */
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}
```

And it declares dark-mode as a class variant:

```css
@custom-variant dark (&:is(.dark *));
```

This is the correct pattern: bare `@theme` means Tailwind utilities compile to `var(--color-primary)` references, not literal hex values. A `[data-studio="hustle"]` attribute override of `--primary` will propagate through all `bg-primary`, `text-primary` etc. utility classes at runtime with no recompile.

### How global.css adds GymClassOS tokens (HIGH confidence)

The import order in `global.css` currently is:

```
Line 1:  @import url("https://fonts.googleapis.com/css2?family=Inter:...");  ← R2 replaces
Line 3:  @import "tailwindcss";
Line 4:  @import "@agent-native/core/styles/agent-native.css";              ← upstream @theme lives here
Line 6:  @source "./**/*.{ts,tsx}";
Line 8:  :root { ... }                                                       ← bare HSL values
Line 39: .dark { ... }                                                       ← dark overrides
```

R2 must add:
1. `@theme` block for GymClassOS-specific tokens (`--studio-accent`, `--studio-accent-soft`) **after line 4** (R-13).
2. `:root[data-studio="default"]` and `:root[data-studio="hustle"]` override blocks **after the `.dark` block** (R-09).
3. Import of skin CSS files — see Section 2 for the recommended mechanism.

The new `--studio-*` tokens in the `@theme` block:

```css
/* Add AFTER @import "@agent-native/core/styles/agent-native.css" */
@theme {
  --color-studio-accent: hsl(var(--studio-accent));
  --color-studio-accent-soft: hsl(var(--studio-accent-soft));
}
```

And in `:root` (default fallback values):

```css
:root {
  /* ... existing shadcn vars ... */
  --studio-accent: 25 95% 53%;   /* orange-500 = #F97316 in HSL */
  --studio-accent-soft: 33 100% 96%; /* orange-50 = #FFF7ED */
}
```

**Critical constraint (R-01):** Never use `@theme inline` anywhere. The `@theme` block in `agent-native.css` is bare; any GymClassOS additions must also be bare. The planner should add a checklist item: `grep -r "@theme inline" apps/staff-web` returns zero.

**Critical constraint (R-02):** `:root` variable values must be bare space-separated HSL (e.g., `25 95% 53%`) — no `hsl()` wrapper. The `@theme` block does the wrapping. The existing `global.css` `:root` block is already correctly formatted; maintain this pattern in all new skin CSS.

---

## 2. Skin Injector Mechanism — Recommended Approach

### The bundled-CSS-plus-attribute approach (STRONGLY RECOMMENDED)

Rather than dynamically injecting a `<style>` block per deploy, import all skin CSS files directly in `global.css`. The attribute selector `[data-studio="hustle"]` activates the right skin. All skin CSS ships in every deploy's bundle; the env var controls which skin is active by setting `data-studio` on `<html>`.

**Why this is simpler and safer:**
- No SSR `<style>` injection into `<head>` — avoids H3/Nitro plugin complexity.
- No FOUC risk — CSS is in the bundle before any JS hydrates.
- Works identically in Vercel serverless functions and on local preview builds.
- The default skin's `[data-studio="default"]` rules are present regardless of what the env var says, so the fallback is always available.
- Skin CSS files are tiny (~20 lines each). Both skins' CSS shipping in every bundle adds negligible payload.

**The mechanism in `global.css`:**

```css
/* At the bottom of global.css, after the .dark block: */
@import "./skins/default.css";
@import "./skins/hustle.css";
```

**The mechanism in `root.tsx` root loader:**

The root loader reads the env var and returns the active skin name. `Layout()` receives it via `useRouteLoaderData("root")` and sets `data-studio` as an inline SSR attribute on `<html>`.

### (a) Where to read `process.env.GYMOS_STUDIO_SKIN`

Read it in the **root loader** in `root.tsx`. This is the correct place:
- Runs server-side on every request.
- Its return value is available as SSR HTML before hydration.
- The `Layout()` function (which renders `<html>`) can access it via `useRouteLoaderData("root")`.
- No H3/Nitro plugin needed — the root loader is the simplest option.

The root loader also reads `skins/config.ts` for the non-CSS identity (displayName, logo) that `GymosTopNav` needs (DSGN-05). This is a pure TS import with no async I/O — zero DB round-trip (DSGN-02).

### (b) Setting `data-studio` on `<html>` server-side without FOUC

Set it as an inline static attribute directly in the `Layout()` JSX return, not in a `useEffect`. `Layout()` is a special React Router v7 export that wraps every route — it runs during SSR and its HTML is in the initial server response. Since `data-studio` is present in the SSR HTML, the browser parses it before any CSS loads, and the CSS `[data-studio="hustle"]` selector activates with no flash.

```tsx
// root.tsx — Layout function (the outer HTML shell)
export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const studioName = data?.skin?.name ?? "default";

  return (
    <html lang="en" suppressHydrationWarning data-studio={studioName}>
      <head>
        {/* ... existing head content ... */}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**Critical (R-14):** `data-studio` MUST be on `<html>`, not an inner `<div>`. Radix portals (`Dialog`, `Tooltip`, `Popover`, `Select`) render at `document.body`. Because `document.body` is a child of `<html>`, the attribute is inherited and `[data-studio="hustle"]` selectors apply to portaled elements.

**Critical (R-15):** Setting it as an inline SSR attribute in the `Layout` JSX (not in `useEffect`) means it's present in the server-rendered HTML and does not race with `next-themes` hydration.

### (c) How skin CSS is selected

The skin CSS uses attribute selectors on `:root` (which is `<html>`):

```css
/* apps/staff-web/app/skins/default.css */
:root[data-studio="default"] {
  --primary: 24 95% 53%;             /* orange-500 */
  --primary-foreground: 0 0% 100%;   /* white */
  --accent: 33 100% 96%;             /* orange-50 tint */
  --accent-foreground: 24 80% 30%;
  --ring: 24 80% 53%;
  --studio-accent: 24 95% 53%;
  --studio-accent-soft: 33 100% 96%;
}
```

```css
/* apps/staff-web/app/skins/hustle.css */
:root[data-studio="hustle"] {
  /* TODO: replace with Hustle brand values */
  --primary: 258 90% 58%;        /* placeholder purple */
  --primary-foreground: 0 0% 100%;
  --accent: 258 100% 96%;
  --accent-foreground: 258 70% 30%;
  --ring: 258 70% 58%;
  --studio-accent: 258 90% 58%;
  --studio-accent-soft: 258 100% 96%;
}
```

These blocks come **after** the `.dark` block in cascade order (because `global.css` imports them at the end). If both `.dark` and `[data-studio="hustle"]` are present on `<html>`, the skin block wins (cascade order, same specificity = last one wins — R-09).

---

## 3. Root Loader + `useRouteLoaderData("root")` Wiring

### Confirmed RR v7 pattern in this codebase (HIGH confidence — direct code inspection)

From `gymos._index.tsx`:
- Loaders are plain `export async function loader() { ... }` at the module level.
- They return plain objects — **NOT `json()`** (RR v7 no longer exports `json()`; this convention is already established per STATE.md: "react-router v7 framework mode no longer exports `json()` — every loader returns plain objects").
- Consumers use `useLoaderData<typeof loader>()`.

For the **root loader** (in `root.tsx`), the hook is `useRouteLoaderData("root")` not `useLoaderData()`. The route ID `"root"` is the convention for the root route in RR v7.

### Exact wiring

In `root.tsx`, add:

```ts
// New root loader (currently root.tsx has no loader at all)
import type { Route } from "./+types/root";
import { getSkinConfig, type SkinName } from "./skins/config";

export async function loader({ request }: Route.LoaderArgs) {
  const skinName = (process.env.GYMOS_STUDIO_SKIN ?? "default") as SkinName;
  const skin = getSkinConfig(skinName);
  return { skin: { name: skinName, ...skin } };
}
```

In the `Layout()` function:

```tsx
// Note: Layout() is a special RR v7 export — it is NOT a route component.
// It cannot use useLoaderData() directly; use useRouteLoaderData("root").
import { useRouteLoaderData } from "react-router";

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const studioName = data?.skin?.name ?? "default";

  return (
    <html lang="en" suppressHydrationWarning data-studio={studioName}>
      {/* ... */}
    </html>
  );
}
```

In `GymosTopNav.tsx` (DSGN-05 — replace hardcoded `<span>GymClassOS</span>` at line 56):

```tsx
import { useRouteLoaderData } from "react-router";
// (root type imported from auto-generated types or inline)

export function GymosTopNav() {
  const rootData = useRouteLoaderData("root") as { skin: { name: string; displayName: string; logo: string | null } } | undefined;
  const displayName = rootData?.skin?.displayName ?? "GymClassOS";
  const logo = rootData?.skin?.logo ?? null;

  return (
    <nav className="flex items-center gap-1 px-4 h-11 border-b border-border/50 bg-card/40 shrink-0">
      <span className="text-[12px] font-semibold mr-3">
        {logo ? <img src={logo} alt={displayName} className="h-5 w-auto" /> : displayName}
      </span>
      {/* ... rest of nav unchanged ... */}
    </nav>
  );
}
```

### `skins/config.ts` shape

```ts
// apps/staff-web/app/skins/config.ts
export type SkinName = "default" | "hustle";

export interface SkinConfig {
  displayName: string;
  logo: string | null; // public path e.g. "/logos/hustle.svg", or null = wordmark
}

const skins: Record<SkinName, SkinConfig> = {
  default: {
    displayName: "GymClassOS",
    logo: null,
  },
  hustle: {
    displayName: "Hustle", // TODO: confirm display name with customer
    logo: null,            // TODO: add /logos/hustle.svg when brand assets arrive
  },
};

export function getSkinConfig(name: string): SkinConfig {
  return skins[name as SkinName] ?? skins.default;
}
```

**Important nuance for `Layout()`:** `Layout()` is a special export in RR v7 — it wraps the entire route tree and is NOT itself a route component. It can call `useRouteLoaderData("root")` because RR v7 makes the root route's loader data available globally, but it cannot call `useLoaderData()` without being the matched route. This pattern is confirmed as working by the RR v7 docs pattern for setting per-request attributes on `<html>`.

---

## 4. Inter Self-Hosting

### Current state (HIGH confidence — direct code inspection)

`global.css` line 1:
```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap");
```

`body` CSS at line 72–73:
```css
font-family: "Inter", sans-serif;
```

All three SSR pages use the identical Google Fonts pattern:
- `public-form-ssr.ts` lines 298–300: `preconnect` + `preconnect crossorigin` + `<link href="https://fonts.googleapis.com/...">`
- `public-form-ssr.ts` line 577: second Google Fonts link in `notFoundPage()`
- `schedule-widget-ssr.ts` lines 231–233: same `preconnect` + `<link>` pattern
- `marketing-ssr.ts` lines 103–105: same `preconnect` + `<link>` pattern

### Steps to self-host Inter

**Step 1 — Download the woff2 file.**
Get `inter-variable.woff2` from Google Webfonts Helper (`gwfh.mranftl.com`) selecting "Inter" with all weights, or download directly from `github.com/rsms/inter/releases`. The variable font covers all weights (300–800) in a single file.

Place at: `apps/staff-web/public/fonts/inter-variable.woff2`

The `public/` directory in a React Router v7 / Vite app is served at the domain root. On Vercel this becomes `https://gym-class-os.vercel.app/fonts/inter-variable.woff2`.

**Step 2 — Replace `global.css` line 1.**
Delete the `@import url("https://fonts.googleapis.com/...")` line and add a `@font-face` block at the very top of `global.css` (before `@import "tailwindcss"`):

```css
/* Self-hosted Inter variable font (replaces Google Fonts CDN — DSGN-04) */
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/inter-variable.woff2") format("woff2-variations");
}
```

The `font-weight: 100 900` range declaration works with a variable font. The existing `font-family: "Inter", sans-serif` in `body` continues to work with no change.

**Step 3 — Add `<link rel="preload">` in `root.tsx` head.**
Inside the `Layout()` function's `<head>`:

```tsx
<link
  rel="preload"
  as="font"
  type="font/woff2"
  crossOrigin="anonymous"
  href="/fonts/inter-variable.woff2"
/>
```

Place this before `<Links />` so the preload hint reaches the browser as early as possible.

**Step 4 — Replace Google Fonts in SSR pages.**
In each SSR page, delete the `preconnect` + `<link>` Google Fonts block and add an inline `@font-face` style:

The replacement `<style>` snippet to inject (one block covers all pages):

```html
<style>
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/inter-variable.woff2") format("woff2-variations");
}
</style>
```

Specific replacements:
- `public-form-ssr.ts` lines 298–300: remove the 3 lines; add `@font-face` in the `<style>` block already present (line 302 opens `<style>`).
- `public-form-ssr.ts` line 577 (`notFoundPage()`): replace `<link href="https://fonts.googleapis.com/...">` with the same inline `@font-face`.
- `schedule-widget-ssr.ts` lines 231–233: remove the 3 lines; add `@font-face` inside the `<style>` block (lines 234+).
- `marketing-ssr.ts` lines 103–105: remove the 3 lines; add `@font-face` inside the `<style>` block.

**Why same-origin works for SSR iframe pages (HIGH confidence):** The embed pages (`public-form-ssr.ts`, `schedule-widget-ssr.ts`) are served from the same Vercel deploy as staff-web. The iframe `src` is the same origin as the font file `/fonts/inter-variable.woff2`. No CORS header needed; the font loads without restriction.

**Manual vs vite-plugin-webfont-dl:** Manual woff2 download and commit is recommended. It's a one-time step. The plugin adds a build-time dependency and network call to the build process. For a single font file on a tight deadline, manual commit is simpler and more predictable.

---

## 5. CI Guard Script

### Existing guard pattern (HIGH confidence — direct code inspection)

The guard that R2 must emulate is `scripts/guard-no-whatsapp-in-staff-web.mjs`. It:
1. Reads `ROOT = process.cwd()` to find the repo root.
2. Defines a `SKIP_DIRS` set (node_modules, .react-router, dist, build, .vercel, .netlify, .cache, .turbo).
3. Defines `SOURCE_EXTS` (.ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts).
4. Walks the target directory recursively with `readdirSync` + `statSync`.
5. Tests each source file against a regex.
6. Reports violations and `process.exit(1)` if any found.

The more complete async variant is `scripts/guard-no-drizzle-push.mjs` — it uses `readdir` with `withFileTypes: true` and scans both `netlify.toml` and `package.json` CI script hooks.

### Wiring (HIGH confidence — direct code inspection of `package.json`)

Root `package.json` scripts section shows two wiring points:

**1. `"guards"` script** (line 42): chains all guards with `&&`:
```
"guards": "pnpm guard:no-drizzle-push && ... && pnpm guard:no-whatsapp-in-staff-web"
```
The new guard must be added as `pnpm guard:no-hardcoded-colors` appended to this chain.

**2. `"prep"` script** (line 48):
```
"prep": "concurrently -n fmt,types,test,guard ... \"pnpm guards\""
```
`prep` runs `guards` via concurrently — no change needed; adding the new guard to `"guards"` automatically wires it into `prep`.

**3. `ci.yml`:** The CI does NOT currently call `pnpm guards` explicitly — it calls `pnpm fmt:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. The guards are a pre-commit / `prep` tool. To add CI enforcement, a new job must be added to `.github/workflows/ci.yml` calling `pnpm guards` (or specifically `pnpm guard:no-hardcoded-colors`). This is the correct pattern for a CI guard in this repo.

### Guard specification for `guard-no-hardcoded-colors.mjs`

```
Scan target: apps/staff-web/{app,server,features}/**/*.{ts,tsx,css}
  (NOT: scripts/, node_modules/, .react-router/, dist/, build/)

Regex for hex literals:
  /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/

Regex for Tailwind arbitrary color values:
  /(?:bg|text|border|ring|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/

Exempt paths (never flag):
  - apps/staff-web/app/skins/**       ← skin CSS files contain intentional overrides
  - Any line containing the marker comment: // guard:allow-color
  - Files in node_modules/ (skip entirely)

Known legitimate allowances (add // guard:allow-color on the line):
  - apps/staff-web/app/components/GoogleConnectBanner.tsx lines 937/941/945/949
    (Google brand colors: #4285F4 / #34A853 / #FBBC05 / #EA4335 — third-party brand)
  - apps/staff-web/app/components/email/IntegrationsSidebar.tsx lines 87/91/95/99/122/149/174
    (MYÜTIK yellow #F8FF2C, HubSpot orange #FF7A59, brand purples — third-party brand)
```

**NOT flagged by the guard (by design):**
- `rgba()` values (shadows, overlays — present throughout `global.css` legitimately)
- `hsl()` values (the token system itself uses `hsl(var(...))`)
- `rgb()` values
- Named colors (white, black, transparent)
- Color values inside `// guard:allow-color` comments
- The `EmailThread.tsx` constants `IFRAME_BG_DARK = "#17181a"` and `IFRAME_BG_LIGHT = "#ffffff"` — these drive dynamic iframe background injection. They require `// guard:allow-color` markers OR conversion to CSS-variable-derived values.

---

## 6. Full Hex Inventory in `apps/staff-web`

### apps/staff-web/app/ (5 files with hex)

| File | Hex occurrences | Category | R2 action |
|------|----------------|----------|-----------|
| `app/root.tsx:71` | `#3B82F6` (theme-color meta) | Root — brand accent | Replace with skin-derived value or use CSS var trick; see note below |
| `app/components/GoogleConnectBanner.tsx:937,941,945,949` | `#4285F4`, `#34A853`, `#FBBC05`, `#EA4335` | Google brand SVG fills | Add `// guard:allow-color` — these are Google's brand colors, non-negotiable |
| `app/components/email/EmailThread.tsx:2188–2359` | `#17181a`, `#ffffff`, `#e4e4e7`, `#818cf8`, `#1a1a1a`, `#374151`, `#22c55e`, `#fff`, `#000` (many lines) | Legacy email iframe injection — dynamic JS color adaptation for email HTML rendering inside iframes | Complex; email iframe injects styles into untrusted email HTML. These are either: (a) guard-exempt with `// guard:allow-color` reason "email iframe dark-mode injection" or (b) converted to CSS variable lookups where feasible |
| `app/components/ui/chart.tsx:53` | Multiple hex colors in recharts CHART_COLORS constant | Recharts chart palette | Either convert to CSS vars `hsl(var(--studio-accent))` etc., or `// guard:allow-color` with note |
| `app/components/email/IntegrationsSidebar.tsx:87–174` | `#F8FF2C`, `#FF7A59`, `#7121DB`, `#5B0EFF` | Third-party integration brand colors (SVG fills) | Add `// guard:allow-color` — third-party brand colors |

**Note on `root.tsx:71` `<meta name="theme-color" content="#3B82F6">`:** The `theme-color` meta sets the browser chrome color on mobile. It cannot be a CSS variable (it's a `<meta>` attribute, not a CSS context). Options: (a) read `skin.accentHex` from the root loader and pass it as a prop to `Layout()`, rendering `<meta name="theme-color" content={accentHex} />` — this requires adding an `accentHex` field to `SkinConfig`; or (b) add `// guard:allow-color` with reason "theme-color meta attribute — CSS vars not applicable" and use the current blue until R4. Option (b) is lower-risk for R2. The planner should pick one explicitly.

### apps/staff-web/features/ (3 files with hex)

| File | Hex occurrences | Category | R2 action |
|------|----------------|----------|-----------|
| `features/forms/lib/public-form-ssr.ts` | Google Fonts refs (lines 298/300/577) only — no other bare hex in inline CSS | SSR embed | Replace Google Fonts refs with self-hosted `@font-face` (Section 4) |
| `features/forms/lib/schedule-widget-ssr.ts` | Google Fonts refs (lines 231/233) + `#000000` fallback in comment + `color:#fff` inline (line 438/467) + `color:#10b981` (green success, line 481) + `background:#1f2937;color:#f9fafb` (line 494) + `background:#991b1b` (error red, line 497) | SSR embed inline CSS | Replace fonts; convert inline CSS colors to `var(--gym-*)` pattern already used in this file; or `// guard:allow-color` for embed-specific colors |
| `features/forms/lib/embed-snippet.ts` | `#ff5733` in comment/example only (not rendered) | Documentation example | No action needed — comment not scanned by guard (guard scans code, not comments) |

**Overall hex inventory verdict:** The hex footprint is smaller than expected. The truly non-negotiable items (Google brand colors in SVG, third-party integration brand colors) are cleanly allowlistable. The `EmailThread.tsx` iframe injection is the only genuinely complex case — it injects CSS into untrusted email HTML and the hex values there serve a specific dark-mode adaptation function. The embed SSR files have a small number of functional inline colors that can be converted to CSS vars following the existing `var(--gym-accent)` pattern already in those files.

---

## 7. Studios/ Scaffold + Hustle Placeholder

### `studios/default/env.yml` (contract file only — no loader)

```yaml
# studios/default/env.yml
# Environment contract for the GymClassOS default studio deploy.
# Set these variables in the Vercel dashboard (or via `vercel env add`).
# This file is NOT loaded at runtime — it is documentation for the
# future P1a deploy script (deploy.sh <studio> will read it).

GYMOS_STUDIO_SKIN: default
# Other studio-specific env vars will be added here as P1a build-out proceeds.
```

### `studios/hustle/env.yml`

```yaml
# studios/hustle/env.yml
# Environment contract for the Hustle studio deploy.
GYMOS_STUDIO_SKIN: hustle
# CUSTOMER_ALLOWED_EMAILS: coach@doyouhustle.co.uk,owner@doyouhustle.co.uk
```

### Hustle placeholder palette

The placeholder must be **visibly distinct from default orange** so the skin-switch is provably working before real brand values arrive. Recommended: a mid-blue-purple that is clearly different from orange and from the current shadcn slate defaults.

```css
/* apps/staff-web/app/skins/hustle.css */
/* TODO: replace with Hustle brand values — awaiting customer confirmation */
:root[data-studio="hustle"] {
  --primary: 258 84% 56%;            /* placeholder indigo-500 */
  --primary-foreground: 0 0% 100%;
  --accent: 255 100% 97%;            /* placeholder indigo-50 */
  --accent-foreground: 258 70% 30%;
  --ring: 258 70% 56%;
  --studio-accent: 258 84% 56%;
  --studio-accent-soft: 255 100% 97%;
  --radius: 0.375rem;                /* slightly tighter radius for Hustle — visually distinct */
}
```

Dark-mode combined selector (for testing both active simultaneously — R-09):

```css
html.dark[data-studio="hustle"] {
  --primary: 258 84% 72%;            /* lighter indigo in dark mode */
  --accent: 258 30% 18%;
  --studio-accent: 258 84% 72%;
  --studio-accent-soft: 258 30% 18%;
}
```

---

## 8. Verification Approach (No Local Dev Server)

### DSGN-02 / DSGN-03 proof

1. Set `GYMOS_STUDIO_SKIN=hustle` in the Vercel project environment variables dashboard.
2. Trigger a redeploy (push a trivial commit or use "Redeploy" in Vercel UI).
3. Open the preview URL. GymosTopNav should show "Hustle" text (or placeholder) in the indigo accent.
4. Check `<html data-studio="hustle">` in browser DevTools Elements.
5. Open a Dialog (e.g. Templates picker) — confirm the modal background uses Hustle indigo, not default orange (proves R-14: data-studio on html reaches Radix portals).
6. Hard-reload the page — no flash of unstyled/default orange before Hustle indigo (proves R-15: no FOUC).
7. Toggle dark mode (ThemeToggle still present in R2) — confirm Hustle skin still wins over the dark palette (proves R-09 cascade order).

### DSGN-04 proof (no fonts.googleapis.com)

1. Open any page on the Vercel deploy in Chrome DevTools → Network tab → filter by "fonts.googleapis.com".
2. Navigate to: `/gymos`, `/gymos/schedule`, `/gymos/inbox`, an embed page (`/embed/schedule`), a public form (`/f/<slug>`), the marketing page (`/`).
3. None of those pages should show a `fonts.googleapis.com` request.
4. Alternatively: run `scripts/ui-baseline/` capture script against the deploy with `--check-no-google-fonts` (if the script supports network interception) — or verify manually via the Network tab.

### Reuse of R1 capture tooling

`scripts/ui-baseline/` was built in R1 as the standing verification harness. After R2 deployment:
- Run the capture script with output dir `.planning/ui-reviews/after-r2/` to produce after-state screenshots.
- Compare `baseline/` vs `after-r2/` side by side for every route.
- The skin-switch verification requires two capture runs: one with `GYMOS_STUDIO_SKIN=default` and one with `GYMOS_STUDIO_SKIN=hustle`.

### R-14 modal/portal skin inheritance test

In the Vercel preview with `GYMOS_STUDIO_SKIN=hustle`:
- Open any modal (Templates dialog, book-class dialog).
- The modal overlay and content should render in Hustle's indigo palette, not the default orange or dark grey.
- If the modal uses default palette, `data-studio` is likely on an inner div, not `<html>`.

---

## Architecture Patterns

### Recommended file tree for R2 deliverables

```
apps/staff-web/
├── app/
│   ├── global.css                   MODIFIED (line 1 replaced, @theme + skin @imports added)
│   ├── root.tsx                     MODIFIED (root loader added, Layout gets data-studio, preload link)
│   ├── skins/                       NEW
│   │   ├── config.ts                NEW (SkinName, SkinConfig, getSkinConfig)
│   │   ├── default.css              NEW (:root[data-studio="default"] overrides)
│   │   └── hustle.css               NEW (:root[data-studio="hustle"] overrides + dark combined)
│   ├── components/gymos/
│   │   └── GymosTopNav.tsx          MODIFIED (useRouteLoaderData, replace hardcoded span)
│   └── public/
│       └── fonts/
│           └── inter-variable.woff2 NEW (binary asset — committed to repo)
├── features/forms/lib/
│   ├── public-form-ssr.ts           MODIFIED (replace Google Fonts refs ×2)
│   └── schedule-widget-ssr.ts       MODIFIED (replace Google Fonts refs + inline colors)
├── features/marketing/lib/
│   └── marketing-ssr.ts             MODIFIED (replace Google Fonts refs)
└── ...rest of hex-bearing files     MODIFIED (guard:allow-color markers OR token conversion)
studios/                             NEW (repo root level)
├── default/
│   └── env.yml                      NEW (contract doc)
└── hustle/
    └── env.yml                      NEW (contract doc)
scripts/
└── guard-no-hardcoded-colors.mjs    NEW
```

### Cascade order summary (critical for correctness)

In `global.css`, the final order must be:

```
1. @font-face Inter (replaces line 1 Google Fonts)
2. @import "tailwindcss"
3. @import "@agent-native/core/styles/agent-native.css"   ← upstream @theme block
4. @source "./**/*.{ts,tsx}"
5. @theme { --color-studio-accent: ...; }                 ← GymClassOS additions AFTER upstream
6. :root { ... existing shadcn vars + --studio-accent fallback ... }
7. .dark { ... existing dark vars ... }
8. @import "./skins/default.css"                          ← AFTER .dark block
9. @import "./skins/hustle.css"                           ← AFTER .dark block
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS var → Tailwind utility bridge | Custom Tailwind plugin | Bare `@theme` block (already in agent-native.css) | The pattern is already established; just add new tokens to it |
| Theme selection at request time | Database query, Redis lookup | `process.env.GYMOS_STUDIO_SKIN` read in root loader | Zero latency, zero DB round-trip (DSGN-02 requirement) |
| Inter font loading | Google Fonts CDN, vite-plugin-webfont-dl | Manual woff2 commit in `public/fonts/` | One-time, deterministic, no build-time network call |
| Skin CSS delivery | Per-deploy style injection via H3 plugin | CSS attribute selectors bundled in main stylesheet | No Nitro plugin complexity; FOUC-safe; simpler |

---

## Common Pitfalls

### Pitfall R-01: `@theme inline` bakes hex at build time
**What goes wrong:** Utilities compile to literal hex, skin overrides have no effect.
**How to avoid:** ONLY use bare `@theme`. Add CI check: `grep -r "@theme inline" apps/staff-web` must return zero.

### Pitfall R-02: Double-wrapping HSL breaks opacity modifiers
**What goes wrong:** `--primary: hsl(25 95% 53%)` in `:root` + `hsl(var(--primary))` in `@theme` = `hsl(hsl(...))` — invalid.
**How to avoid:** `:root` values are ALWAYS bare space-separated HSL: `25 95% 53%`. Never copy from shadcn theme generators that output `hsl(...)` wrappers.

### Pitfall R-09: Dark mode + studio skin specificity conflict
**What goes wrong:** If skin CSS is declared before `.dark` block, `.dark` wins when both are active.
**How to avoid:** Import skin CSS files at end of `global.css`, after the `.dark` block. Both selectors have specificity 0-1-0; last one in cascade wins.

### Pitfall R-13: GymClassOS `@theme` declared before upstream import
**What goes wrong:** Upstream `agent-native.css` `@theme` wins on overlapping tokens.
**How to avoid:** GymClassOS `@theme` block comes after `@import "@agent-native/core/styles/agent-native.css"` in `global.css`.

### Pitfall R-14: `data-studio` on inner div, not `<html>`
**What goes wrong:** Radix portals render at `document.body`. If `data-studio` is on an inner container, portals escape the selector scope and render with default tokens.
**How to avoid:** `data-studio` must be set on the `<html>` element in `root.tsx`'s `Layout()` function.

### Pitfall R-15: `next-themes` + `data-studio` hydration race
**What goes wrong:** Setting `data-studio` in a `useEffect` races with `next-themes`'s own hydration, causing FOUC.
**How to avoid:** Set `data-studio` as a static inline attribute in the SSR `<html>` JSX — present in server-rendered HTML before any JS executes.

### Pitfall: `useRouteLoaderData("root")` returns `undefined` for non-gymos routes
**What goes wrong:** Routes outside the gymos layout (e.g., `/`, `/privacy`, `/embed/*`) also render with `root.tsx`'s `Layout()`. If `useRouteLoaderData("root")` is called in `Layout()` before the loader has run (e.g., on first render), it may return `undefined`.
**How to avoid:** Always use a fallback: `const studioName = data?.skin?.name ?? "default"`. The `data-studio="default"` fallback ensures the CSS attribute is always set.

---

## Environment Availability

Step 2.6: SKIPPED — R2 is a CSS/TypeScript/configuration-only phase. External dependencies are limited to:
- Vercel (staff-web deploy) — already in use, confirmed operational.
- A woff2 font file download (one-time manual step) — no tool dependency, just a file download.
- `process.env.GYMOS_STUDIO_SKIN` env var — set in Vercel dashboard, no local tool needed.

No new services, databases, or CLI tools are required.

---

## Open Questions

1. **`<meta name="theme-color">` conversion strategy**
   - What we know: line 71 in `root.tsx` has `content="#3B82F6"` — a hardcoded hex the guard will flag.
   - What's unclear: the planner must decide: (a) add `accentHex` to `SkinConfig` and derive the meta value from root loader data (correct but adds a field), or (b) apply `// guard:allow-color` with reason "theme-color meta attribute — CSS vars not applicable in HTML attribute context" (deferral).
   - Recommendation: Option (b) for R2 simplicity; option (a) is a 2-line change if the planner prefers correctness.

2. **`EmailThread.tsx` iframe injection hex values**
   - What we know: `IFRAME_BG_DARK = "#17181a"` and `IFRAME_BG_LIGHT = "#ffffff"` are used to set background on email iframe documents; multiple hex values appear inside JS-constructed CSS strings for dark-mode color inversion of email HTML.
   - What's unclear: some values could be converted to `getComputedStyle(document.documentElement).getPropertyValue('--background')` lookups; others are hardcoded for email content readability and cannot use CSS vars.
   - Recommendation: Apply `// guard:allow-color — email iframe dark-mode injection` to the entire block (`lines 2187–2360 approx`). These are technical, not brand colors, and converting them would add complexity without design system benefit. This is a legitimate allowlist use case.

3. **`chart.tsx` CHART_COLORS array**
   - What we know: Contains multiple hex values forming a recharts color palette.
   - What's unclear: Whether R4 will redesign the analytics charts with brand-derived colors (in which case they should be converted now) or leave them as-is.
   - Recommendation: Convert `CHART_COLORS[0]` to `hsl(var(--studio-accent))` and apply `// guard:allow-color` to the remaining entries with reason "recharts categorical palette — not brand colors". Or convert all to a CSS-var-derived palette if time allows.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `apps/staff-web/app/global.css` — full file read; confirmed bare HSL `:root` pattern, `.dark` block outside `@layer base`, Google Fonts at line 1, `email-list-row` CSS classes, no bare hex in CSS file itself
- `packages/core/src/styles/agent-native.css` — full file read; confirmed bare `@theme` (not inline), `@custom-variant dark (&:is(.dark *))`, full token mapping
- `apps/staff-web/app/root.tsx` — full file read; confirmed no root loader exists, `Layout()` is static, `<html lang="en" suppressHydrationWarning>` at line 57, `<meta name="theme-color" content="#3B82F6" />` at line 71
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — full file read; confirmed hardcoded `"GymClassOS"` text at line 56 (inside `<span>`)
- `apps/staff-web/app/routes/gymos._index.tsx` — confirmed RR v7 loader pattern: plain `async function loader()`, returns plain object, `useLoaderData<typeof loader>()`
- `apps/staff-web/server/plugins/auth.ts` — confirmed H3/Nitro plugin pattern; server plugin is an exported default async function receiving `nitroApp`
- `apps/staff-web/server/plugins/db.ts` — confirmed `runMigrations` pattern
- `scripts/guard-no-drizzle-push.mjs` — full file read; confirmed guard pattern (async walk, readFileSync, violations array, exit(1))
- `scripts/guard-no-whatsapp-in-staff-web.mjs` — full file read; confirmed simpler sync guard pattern
- Root `package.json` — confirmed `"guards"` and `"prep"` scripts; all guard scripts are wired via the `guards` chain; CI workflow does NOT currently call `guards`
- `.github/workflows/ci.yml` — confirmed CI jobs: lint, typecheck, test, integration, build, scaffold-e2e; no guards job present
- `apps/staff-web/features/forms/lib/public-form-ssr.ts` lines 290–310, 570–580 — confirmed Google Fonts at lines 298/300/577
- `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` lines 225–240 — confirmed Google Fonts at lines 231/233; existing `--gym-accent`/`--gym-radius` CSS var pattern
- `apps/staff-web/features/marketing/lib/marketing-ssr.ts` lines 97–115 — confirmed Google Fonts at lines 103/105
- Grep results — hex inventory in `apps/staff-web/app/` (5 files) and `apps/staff-web/features/` (3 files); zero matches in `apps/staff-web/server/`

### Secondary (MEDIUM confidence — cited from prior research documents read this session)
- `.planning/research/PITFALLS.md` — R-01 through R-15 pitfall details, all flagged "Tokens" phase; citations to official Tailwind v4 docs and shadcn/ui Tailwind v4 migration guide
- `.planning/research/STACK.md` — `@theme inline` vs bare `@theme` pattern; self-hosted Inter strategy; embed isolation (iframe); `vite-plugin-webfont-dl` optional note
- `.planning/phases/R2-design-system-token-layer/R2-CONTEXT.md` — all locked decisions D-01 through D-14

---

## Metadata

**Confidence breakdown:**
- Token convention + `@theme` pattern: HIGH — verified by direct read of `agent-native.css` and `global.css`
- Root loader + `useRouteLoaderData` wiring: HIGH — verified by reading existing loader pattern in `gymos._index.tsx` + STATE.md note on plain object returns
- Skin injector (bundled CSS + attribute): HIGH — straightforward CSS; no novel mechanism; verified by reading `agent-native.css` appearance presets which already do exactly this pattern (`:root[data-appearance="warm"]` blocks)
- Inter self-hosting: HIGH — standard web font practice; no API or service dependency
- CI guard pattern: HIGH — read two existing guard scripts and the `package.json` wiring
- Hex inventory: HIGH — direct grep results; complete

**Research date:** 2026-06-13
**Valid until:** 2026-08-13 (stable technology; no fast-moving dependencies)
