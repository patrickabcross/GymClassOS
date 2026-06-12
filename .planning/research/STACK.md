# Stack Research — GymClassOS v1.1 UI Redesign (Theming Layer)

**Domain:** Studio-skinnable design system spanning Tailwind v4 web + Expo React Native
**Researched:** 2026-06-12
**Confidence:** HIGH for Tailwind v4 token strategy and embed isolation (official docs verified); MEDIUM for RN theming approach (evidence-based, multiple credible sources); LOW for react-native-unistyles (architectural fit needs prototype validation)

> **Scope note.** This file covers ONLY the stack additions and changes needed for milestone v1.1 (studio-skinnable design system). The base platform stack (React Router v7, Drizzle, Better-auth, pg-boss, Hono, WhatsApp, Stripe) is documented in the 2026-05-17 version of this file — that research stands unchanged. Nothing below touches those choices.

---

## The Single Most Important Finding

**The embed widget already uses iframes.** `apps/staff-web/features/forms/lib/embed-snippet.ts` and `schedule-widget-ssr.ts` inject `<iframe>` elements and communicate via `postMessage`. This decision was made in P1c. **CSS isolation for embeds is solved.** The SSR pages rendered inside the iframes are self-contained HTML documents with `<style>` blocks — the host page's CSS cannot reach in. The redesign work is confined to improving those inline styles to consume the token system, not changing the isolation model.

This means Shadow DOM and CSS prefixing are both off the table as over-engineering. The existing iframe approach is correct and identical to how Calendly, Typeform, and Elfsight handle third-party embeds in 2026.

---

## Recommended Stack Additions

### Core Technologies (New for v1.1)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **`packages/gymos-tokens`** (new workspace package) | n/a — hand-rolled, no semver | Single source of truth for design tokens: color palette, semantic color mappings, typography scale, border-radius scale, spacing overrides | A 100-line TypeScript file avoids Style Dictionary's build pipeline complexity entirely. Token values are plain JS objects; CSS var names are derived by convention. Feeds both the Tailwind v4 `@theme` block (as a generated CSS snippet) and the Expo `ThemeContext` (as direct JS values). The workspace already has the precedent for tiny shared packages (`packages/shared-app-config`, `packages/queue`). |
| **Tailwind v4 `@theme inline` + CSS variable override pattern** | Tailwind `^4.2.4` (already in catalog) | Runtime per-studio theming on staff web and embed pages | `@theme inline` makes Tailwind emit `var(--color-primary)` in utility classes instead of literal values. Overriding `:root` CSS variables at request-render time (server-injected `<style>` block with per-studio values) then flows through the entire Tailwind utility class tree. No recompile needed. Verified against official Tailwind v4 docs and shadcn/ui v4 migration guide. |
| **`ThemeContext` (hand-rolled, ~60 lines)** | n/a | Runtime theme for Expo/React Native | Context provides a `theme` object typed against `packages/gymos-tokens`. `StyleSheet.create()` calls are replaced with inline objects derived from `useTheme()`. No third-party RN styling library needed for a 5-token system. |
| **`expo-font` (already a transitive dep via Expo)** | `~56.0.x` (bundled with Expo 55) | Load self-hosted Inter OTF files in the Expo app | `useFonts()` hook works with Expo Go (required — demo uses Expo Go per PROJECT.md). The config plugin alternative requires a dev build and cannot be tested via Expo Go. |

### Supporting Libraries (New or Changed for v1.1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`next-themes`** | `^0.4.6` (already in staff-web devDependencies) | Light/dark mode toggle on staff web | Already installed. For studio theming, dark/light is a separate toggle from studio brand tokens. Use `next-themes` for dark mode class on `<html>` as today; use CSS variable injection for studio brand tokens. Do not conflate them. |
| **`vite-plugin-webfont-dl`** | `^3.9.x` | Download and self-host Inter from Google Fonts at build time | Optional but recommended: eliminates the Google Fonts `@import` CDN call in `global.css` (privacy + performance). The current `global.css` line 1 is `@import url("https://fonts.googleapis.com/css2?family=Inter:...")` — this sends a third-party DNS lookup on every page load. Replacing it with a local `/fonts/inter-variable.woff2` served from the Vite public dir eliminates the lookup. Install in `apps/staff-web` only. |

### Development Tools (No Changes)

All existing tooling (pnpm, Vite, TypeScript, Vitest, Prettier) applies unchanged. The tokens package requires no special build tooling — it exports plain TypeScript and is consumed directly via `workspace:*` in other packages.

---

## Token Architecture

### Workspace Location

```
packages/
  gymos-tokens/           ← NEW
    package.json          (name: "@gymos/tokens", private: true, main: "index.ts")
    index.ts              (exports primitives + semantics + helpers)
    tokens/
      primitives.ts       (color palette: slate, blue, etc. — raw values)
      semantics.ts        (maps primitives to roles: primary, background, border, etc.)
      typography.ts       (font family names, scale)
      radius.ts           (border radius scale)
    css/
      base-theme.css      (generated or hand-authored @theme block — consumed by staff-web)
```

### Why NOT style-dictionary

Style Dictionary v4 is a mature build pipeline for teams with a Figma-to-code token export workflow and multiple platform targets. For a solo developer with a 5-token surface (color, typography, radius, logo, dark/light) and no Figma token export, it adds:
- A `build.ts` config file
- A separate build step before any consuming package can compile
- The CTI naming convention to learn and map to Tailwind's naming
- An additional ~700 KB in devDependencies

The hand-rolled alternative is 100 lines of TypeScript and a conventions document. The tokens package only needs to grow to style-dictionary if: (a) there are more than 3 studios with divergent token sets, or (b) a Figma plugin export workflow is introduced. Neither applies to v1.1.

### Token Structure (Recommended)

```typescript
// packages/gymos-tokens/tokens/primitives.ts
// Raw palette — never referenced directly by components
export const palette = {
  blue: { 50: "#eff6ff", 500: "#3b82f6", 900: "#1e3a5f" },
  slate: { 50: "#f8fafc", 900: "#0f172a" },
  // ... studio-skinnable accent colours added per studio config
} as const;

// packages/gymos-tokens/tokens/semantics.ts
// Role-based tokens — what components reference
export type StudioTokens = {
  colorPrimary: string;       // accent / CTA
  colorBackground: string;    // page background
  colorForeground: string;    // body text
  colorCard: string;          // card surface
  colorBorder: string;        // borders / dividers
  colorMuted: string;         // muted text
  radiusBase: string;         // e.g. "0.5rem"
  fontSans: string;           // font-family stack
};

export const defaultTokens: StudioTokens = {
  colorPrimary: "#3b82f6",
  colorBackground: "hsl(0 0% 100%)",
  // ...
};
```

### How Tokens Flow to Each Surface

#### Surface 1: Staff Web (Tailwind v4)

The existing `global.css` already uses CSS variables (`--primary`, `--background`, etc.) in the shadcn/Radix pattern. The addition is:

1. Add `@theme inline` block mapping Tailwind tokens to CSS vars (shadcn/ui v4 pattern — verified):

```css
/* global.css */
@theme inline {
  --color-primary: var(--primary);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... studio brand tokens */
  --color-studio-accent: var(--studio-accent);
  --radius-base: var(--radius);
}
```

2. Per-studio override injected by the loader (single-tenant deploy — values come from DB or env):

```typescript
// Server-rendered <style> block in the root layout
const studioTheme = await getStudioTokens(); // reads studio config from DB
const cssVarBlock = `
  :root {
    --studio-accent: ${studioTheme.colorPrimary};
    --radius: ${studioTheme.radiusBase};
    /* font is handled separately via @font-face */
  }
`;
```

This is pure CSS variable override — no Tailwind recompile, no build step, works at runtime. The pattern is verified against the official Tailwind v4 discussion thread and shadcn/ui v4 docs (both confirm this is the intended approach).

#### Surface 2: Embed Widgets (Iframe SSR pages)

The embed pages (`schedule-widget-ssr.ts`, `public-form-ssr.ts`) already inline all CSS into the `<head>`. The theming parameters arrive as URL query params (`?accent=&radius=`). The redesign work is:

1. Expand the inline CSS `<style>` block to reference `--studio-*` vars at `:root` level.
2. Populate those vars from the sanitized URL params (already done for `--gym-accent` and `--gym-radius` — extend the same pattern).
3. Import the font from the same self-hosted `/fonts/` path served by staff-web.

**No new library needed.** The embed isolation approach (iframe + postMessage) is already correct and identical to Calendly/Typeform's model. Shadow DOM is not needed and would break the current resize postMessage mechanism.

#### Surface 3: Expo Mobile App (React Native)

React Native has no CSS. Tailwind does not apply. The approach:

1. Add `packages/gymos-tokens` as a workspace dep in `packages/mobile-app`.
2. Create `packages/mobile-app/lib/theme.ts` exporting `ThemeContext` + `useTheme()`.
3. Wrap the root layout in `<ThemeProvider>` with the studio's token values (loaded from the API on app start, or bundled as the single-studio default since this is a per-studio deploy).
4. Replace hardcoded hex strings in `StyleSheet.create()` calls with `useTheme()` values.

Currently all mobile screens use hardcoded values (`backgroundColor: "#111"`, `color: "#fff"`, `backgroundColor: "#3b82f6"` etc — confirmed by inspecting `packages/mobile-app/app/(tabs)/index.tsx` and `_layout.tsx`). The redesign replaces these with theme-derived values.

**No react-native-unistyles needed.** Unistyles v3 requires native module compilation (C++ / Nitro modules) and a development build. The project constraint is that demo uses Expo Go. Unistyles v3 is incompatible with Expo Go. A hand-rolled ThemeContext costs ~60 lines and has zero native footprint.

---

## Font Strategy

### Staff Web

Replace the Google Fonts CDN import with a self-hosted Inter variable font:

1. Download `inter-variable.woff2` from the Inter GitHub release or Google Webfonts Helper (`gwfh.mranftl.com`).
2. Place in `apps/staff-web/public/fonts/inter-variable.woff2`.
3. Replace `global.css` line 1 (`@import url("https://fonts.googleapis.com/...")`) with a local `@font-face` block.
4. Add a `<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/inter-variable.woff2">` in the root layout.

The `vite-plugin-webfont-dl` plugin can automate steps 1-3 at build time if preferred, but manual download is simpler for a solo dev.

### Embed Widgets

The embed SSR pages currently `@import` Inter from Google Fonts (see `schedule-widget-ssr.ts` line 233). Replace with a reference to the same `/fonts/inter-variable.woff2` path served by staff-web — the iframe src is the same origin as the font file, so no CORS issue.

### Expo Mobile App

Use `useFonts` from `expo-font` (already a transitive dep from Expo 55, version `~56.0.x`):

```typescript
const [loaded] = useFonts({
  "Inter-Regular": require("../../assets/fonts/Inter-Regular.otf"),
  "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.otf"),
  "Inter-Bold": require("../../assets/fonts/Inter-Bold.otf"),
});
```

**Use OTF, not TTF.** Official Expo docs (2026) state OTF files are smaller than TTF and render slightly better in certain contexts. Download from `github.com/rsms/inter`.

**Use `useFonts`, not the config plugin.** The config plugin embeds fonts at native build time but is incompatible with Expo Go. Since the demo runs on Expo Go (PROJECT.md constraint), `useFonts` is the only viable approach. The config plugin can be added when EAS Build replaces Expo Go in production.

Place font assets in `packages/mobile-app/assets/fonts/` — this keeps the fork boundary clean (not in `templates/` or `packages-vendored/`).

---

## Embed CSS Isolation — Decision Record

The question was: Shadow DOM vs CSS prefixing vs iframe for embed widget isolation.

**Decision: iframe (already implemented — no change needed).**

Evidence:
- The current codebase already implements iframe embeds with postMessage theming params (embed-snippet.ts, schedule-widget-ssr.ts — inspected directly).
- Calendly, Typeform, and Elfsight all use the iframe model for third-party embed isolation as of 2026.
- Shadow DOM requires the host page to use the Web Components API and does not naturally work as a drop-in script tag embed.
- CSS prefixing (e.g. `.gymos-widget .card { ... }`) leaks styles if the host page has a `.card` rule with `!important` — fragile.
- The iframe model means: host page CSS cannot reach in; GymClassOS CSS cannot bleed out; the only interface is the iframe `src` URL and `postMessage`.

The theming redesign for embeds is therefore: improve the inline CSS within the existing SSR pages to use CSS variables from `packages/gymos-tokens`, consuming `--studio-*` vars set from the URL params. No structural change to the embed mechanism.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Hand-rolled `packages/gymos-tokens` (plain TS) | style-dictionary v4 | 700 KB devDep + separate build step + CTI naming conventions + Figma token export workflow assumed. 0 of those are present in this project for v1.1. Re-evaluate if a second studio joins with a Figma design token export. |
| `@theme inline` + CSS var override at render time | Compile-time per-studio Tailwind build | Would require running a full Tailwind compile per studio per deploy. With a single-tenant deploy model this is technically possible but unnecessary — CSS var override achieves the same result with zero build cost. |
| Hand-rolled `ThemeContext` (~60 lines) in RN | react-native-unistyles v3 | Unistyles v3 requires C++ native modules (Nitro), incompatible with Expo Go. The demo constraint makes this a hard blocker. Unistyles is the right choice if EAS Dev Client replaces Expo Go, but not before. |
| Hand-rolled `ThemeContext` (~60 lines) in RN | react-native-unistyles v2 | Unistyles v2 does not support New Architecture — Expo SDK 55 (React Native 0.83) removed the old architecture. Unistyles v2 is incompatible. |
| Hand-rolled `ThemeContext` (~60 lines) in RN | NativeWind (Tailwind for RN) | NativeWind v4 compiles Tailwind utility classes to RN StyleSheets at build time, requires a Babel/Metro plugin, and does not consume the same CSS custom property token system as the web surfaces. Adds Babel complexity for minimal gain in a 5-token system. |
| `useFonts` hook for Expo fonts | expo-font config plugin | Config plugin requires a dev build, incompatible with Expo Go. Must use `useFonts` until Expo Go is replaced by EAS Dev Client in production. |
| iframe isolation (existing) | Shadow DOM for embed widgets | Shadow DOM requires Web Components API on the host; adds JS bundle complexity; breaks the existing resize postMessage mechanism; no clear benefit over the iframe already in place. |
| iframe isolation (existing) | CSS class prefixing | Fragile against host page `!important` rules. Does not provide true isolation. Not how production embed vendors solve this in 2026. |
| Self-hosted Inter variable font | Google Fonts CDN | Third-party DNS lookup on every page load. Privacy concern (GDPR — font CDNs can fingerprint users). No performance benefit once self-hosted with proper caching headers. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **style-dictionary** | Build pipeline complexity disproportionate to a 5-token system for a solo developer | Hand-rolled `packages/gymos-tokens` (plain TS objects + convention for CSS var names) |
| **react-native-unistyles v3** | Requires native module compilation (Nitro/C++); incompatible with Expo Go; demo constraint makes this a hard blocker | Hand-rolled `ThemeContext` + `useTheme()` hook |
| **react-native-unistyles v2** | New Architecture required by Expo SDK 55 / RN 0.83 — unistyles v2 does not support New Architecture | Same as above |
| **NativeWind** | Adds Babel/Metro config complexity; diverges the token pipeline (CSS utility classes vs JS objects); overkill for 5 tokens | `ThemeContext` consuming `packages/gymos-tokens` directly |
| **Storybook** | Significant setup cost for a solo dev; not in existing toolchain | Manual component review via deployed Vercel preview + `gsd:ui-review` |
| **CSS Modules** | Not used anywhere in agent-native or staff-web; would introduce a third styling system alongside Tailwind + shadcn | Stay with Tailwind v4 utility classes + CSS vars |
| **Emotion / styled-components on web** | Runtime CSS-in-JS adds style injection latency; incompatible with Tailwind v4's static generation model; not in agent-native | Tailwind v4 + CSS custom properties (zero runtime) |
| **A Figma plugin or token export tool** | No Figma source of truth exists today; designing in-code is faster for a solo dev at this stage | Code-first tokens in `packages/gymos-tokens` |
| **Per-studio Tailwind config files** | Would require a separate build per studio — incompatible with the single-binary single-tenant deploy model | CSS variable override at render time (zero build cost) |

---

## Version Compatibility (Theming Layer)

| Package | Version | Compatibility Notes |
|---------|---------|---------------------|
| `tailwindcss` | `^4.2.4` (catalog) | `@theme inline` is a v4 feature — verified in official docs. Not available in v3. |
| `next-themes` | `^0.4.6` (already in staff-web) | Works with React 19 + React Router v7. Used for dark/light mode toggle only — not for studio brand tokens. |
| `expo-font` | `~56.0.x` (bundled with Expo 55) | `useFonts` hook works with Expo Go. Config plugin requires dev build (incompatible with demo constraint). |
| `react-native` | `0.83.9` (locked in workspace) | New Architecture enabled by default (cannot disable from SDK 55 onward). Unistyles v2 incompatible. Unistyles v3 compatible but requires native build. |
| `vite-plugin-webfont-dl` | `^3.9.x` | Vite 8.x compatible (catalog version is `8.0.3`). Optional — can replace with manual font download. |

---

## Installation (Theming Layer Only)

```bash
# 1. Create the tokens package (hand-rolled — no npm install needed)
#    mkdir packages/gymos-tokens && touch packages/gymos-tokens/package.json packages/gymos-tokens/index.ts

# 2. Add tokens package as dep in staff-web and mobile-app
#    In apps/staff-web/package.json and packages/mobile-app/package.json:
#    "@gymos/tokens": "workspace:*"

# 3. Optional: self-hosting font automation (staff-web only)
pnpm add -D vite-plugin-webfont-dl --filter @gymos/staff-web
# OR manually download inter-variable.woff2 and place in apps/staff-web/public/fonts/

# 4. Font files for Expo (manual step — no npm install)
#    Download Inter-Regular.otf, Inter-SemiBold.otf, Inter-Bold.otf from github.com/rsms/inter
#    Place in packages/mobile-app/assets/fonts/
```

Already present, no reinstall needed: `tailwindcss ^4.2.4`, `next-themes ^0.4.6`, `expo-font` (transitive from Expo 55).

---

## Sources

- Tailwind CSS v4 official docs (`tailwindcss.com/docs/theme`) — `@theme` vs `@theme inline` distinction, CSS custom property emission, runtime override pattern. **HIGH confidence.**
- shadcn/ui Tailwind v4 migration docs (`ui.shadcn.com/docs/tailwind-v4`) — two-layer pattern (`@theme inline` + `:root` vars). **HIGH confidence.**
- Tailwind v4 community discussion thread `tailwindlabs/tailwindcss #15600` — confirmed runtime CSS var override is the intended multi-theme pattern. **HIGH confidence.**
- Expo fonts docs (`docs.expo.dev/develop/user-interface/fonts/`) — `useFonts` vs config plugin compatibility matrix. **HIGH confidence** (official docs, current).
- `packages/mobile-app/app/(tabs)/index.tsx` and `app/_layout.tsx` (direct code inspection) — confirmed all current styling uses hardcoded hex values. **HIGH confidence.**
- `apps/staff-web/features/forms/lib/embed-snippet.ts` and `schedule-widget-ssr.ts` (direct code inspection) — confirmed iframe model is already implemented. **HIGH confidence.**
- `apps/staff-web/app/global.css` (direct code inspection) — confirmed CSS variable token pattern already in use (shadcn style), `@import` Google Fonts CDN is the current font loading. **HIGH confidence.**
- react-native-unistyles docs (`unistyl.es/v3/start/getting-started/`) + GitHub discussion #191 — confirmed v3 requires New Architecture + native build, incompatible with Expo Go. **MEDIUM confidence** (official docs + GitHub discussions).
- Expo SDK 55 migration notes (`byteiota.com` verified against `docs.expo.dev/guides/new-architecture/`) — confirmed Legacy Architecture removed in SDK 55 / RN 0.83. **HIGH confidence.**
- Inter font repository (`github.com/rsms/inter`) — OTF files available, recommended format per Expo docs. **HIGH confidence.**
- Google Webfonts Helper (`gwfh.mranftl.com`) — WOFF2 variable font download for self-hosting. **MEDIUM confidence** (third-party tool, widely used).
- style-dictionary npm (`npmjs.com/package/style-dictionary`) — confirmed v4 is current stable (5.4.4 latest), ES Modules, browser-compatible. Complexity assessment is the author's judgment. **MEDIUM confidence.**

---

*Stack research for: v1.1 UI Redesign — studio-skinnable GymClassOS design system*
*Researched: 2026-06-12*
*Confidence: HIGH for token strategy and embed isolation (code-verified); MEDIUM for RN theming (unistyles Expo Go incompatibility verified; ThemeContext recommendation is conventional pattern); LOW for unistyles as future option (needs prototype when EAS Dev Client replaces Expo Go)*
