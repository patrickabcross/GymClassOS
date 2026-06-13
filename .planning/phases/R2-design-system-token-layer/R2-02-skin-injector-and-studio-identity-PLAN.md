---
phase: R2-design-system-token-layer
plan: 02
type: execute
wave: 2
depends_on: ["R2-01"]
files_modified:
  - apps/staff-web/app/root.tsx
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
autonomous: true
requirements: [DSGN-02, DSGN-05]
must_haves:
  truths:
    - "The active skin is resolved server-side from process.env.GYMOS_STUDIO_SKIN in a root loader — zero DB round-trip"
    - "data-studio is set as a static inline SSR attribute on the <html> element (not via useEffect), so Radix portals inherit it and there is no FOUC"
    - "GymosTopNav renders the studio displayName (or logo) sourced from the active skin config, replacing the hardcoded 'GymClassOS' span"
  artifacts:
    - path: "apps/staff-web/app/root.tsx"
      provides: "Root loader reading GYMOS_STUDIO_SKIN + Layout setting data-studio on <html>"
      contains: "export async function loader"
    - path: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      provides: "Skin-sourced studio identity in the top nav (DSGN-05)"
      contains: "useRouteLoaderData"
  key_links:
    - from: "apps/staff-web/app/root.tsx"
      to: "apps/staff-web/app/skins/config.ts"
      via: "import getSkinConfig in the root loader"
      pattern: "from\\s+[\"']\\./skins/config[\"']"
    - from: "apps/staff-web/app/root.tsx Layout()"
      to: "<html data-studio>"
      via: "useRouteLoaderData('root') → inline attribute"
      pattern: "data-studio="
    - from: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      to: "root loader data"
      via: "useRouteLoaderData('root') → skin.displayName / skin.logo"
      pattern: "useRouteLoaderData"
---

<objective>
Wire the skin injector. Add the first-ever root loader to `root.tsx` that reads `process.env.GYMOS_STUDIO_SKIN`, resolves the skin via `skins/config.ts`, and returns it. Set `data-studio` as a static inline attribute on `<html>` in `Layout()` (SSR, no `useEffect` → no FOUC, Radix portals inherit). Replace the hardcoded `"GymClassOS"` span in `GymosTopNav` with the skin's `displayName`/`logo`.

Purpose: Satisfies DSGN-02 (deploy-time skin selection via env var, SSR-injected, zero DB round-trip) and DSGN-05 (studio name + logo at top of the nav from skin config).

Output: Modified `root.tsx` (loader + data-studio + skin-aware theme-color meta) and `GymosTopNav.tsx` (skin identity).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/R2-design-system-token-layer/R2-CONTEXT.md
@.planning/phases/R2-design-system-token-layer/R2-RESEARCH.md
@.planning/research/PITFALLS.md

<interfaces>
<!-- Contract from plan 01 (R2-01). Import and use exactly this. -->
From apps/staff-web/app/skins/config.ts:
```ts
export type SkinName = "default" | "hustle";
export interface SkinConfig { displayName: string; logo: string | null; }
export function getSkinConfig(name: string): SkinConfig; // falls back to default
```

RR v7 conventions in this codebase (verified):
- Loaders are `export async function loader({ request }: Route.LoaderArgs) { ... }` returning a PLAIN object — NEVER `json()` (RR v7 removed it).
- Route component data: `useLoaderData<typeof loader>()`.
- Root route data (from Layout(), which is NOT a route component): `useRouteLoaderData("root")` — the route id "root" is the RR v7 convention.
- Auto-generated route types: `import type { Route } from "./+types/root";`

Current root.tsx facts (verified):
- No loader exists yet. `Layout({ children })` is a static function. `<html lang="en" suppressHydrationWarning>` at line 57.
- Line 71: `<meta name="theme-color" content="#3B82F6" />` — a hardcoded hex.
- next-themes ThemeProvider wraps the app in the default Root() export (attribute=["class","data-theme"]). Do NOT change theme handling.

Current GymosTopNav.tsx facts (verified):
- Currently imports only `{ Link, useLocation } from "react-router"` and `cn`.
- Line 56: `<span className="text-[12px] font-semibold mr-3">GymClassOS</span>` — the DSGN-05 insertion point.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add root loader + data-studio on &lt;html&gt; + skin-aware theme-color in root.tsx</name>
  <files>apps/staff-web/app/root.tsx</files>
  <read_first>
    - apps/staff-web/app/root.tsx (full — the file being modified)
    - apps/staff-web/app/skins/config.ts (the contract imported by the loader — created in plan 01)
    - apps/staff-web/app/routes/gymos._index.tsx (reference for the established RR v7 loader pattern — plain object return, no json())
    - .planning/research/PITFALLS.md (R-14 data-studio on <html> not inner div; R-15 inline SSR attribute not useEffect; the "useRouteLoaderData returns undefined for non-gymos routes" note → always fall back to "default")
  </read_first>
  <action>
    Edit apps/staff-web/app/root.tsx. Three changes:

    1. Add imports near the top (alongside the existing `react-router` import):
    ```ts
    import { useRouteLoaderData } from "react-router";
    import type { Route } from "./+types/root";
    import { getSkinConfig, type SkinName } from "./skins/config";
    ```
    (Merge `useRouteLoaderData` into the existing destructured `react-router` import rather than duplicating the import line if cleaner.)

    2. Add the root loader at module level (this file currently has NO loader — it is the first):
    ```ts
    export async function loader(_args: Route.LoaderArgs) {
      const skinName = (process.env.GYMOS_STUDIO_SKIN ?? "default") as SkinName;
      const skin = getSkinConfig(skinName);
      // accentHex drives the <meta name="theme-color"> below — keep in sync with
      // the skin's --primary value. Default = orange-500 #F97316; hustle placeholder
      // indigo #7C3AED. This is the ONE place a brand hex lives outside the skin CSS.
      const accentHex = skinName === "hustle" ? "#7C3AED" : "#F97316";
      return { skin: { name: skinName, ...skin }, accentHex };
    }
    ```

    3. In `Layout({ children })`, read the root loader data and apply it. `Layout()` is NOT a route component, so it MUST use `useRouteLoaderData("root")`, not `useLoaderData()`. Always fall back to "default" (the loader may not have resolved on the very first render for non-gymos routes):
    ```tsx
    export function Layout({ children }: { children: React.ReactNode }) {
      const data = useRouteLoaderData<typeof loader>("root");
      const studioName = data?.skin?.name ?? "default";
      const themeColor = data?.accentHex ?? "#F97316";
      return (
        <html lang="en" suppressHydrationWarning data-studio={studioName}>
          ...
    ```
    Replace the hardcoded `<meta name="theme-color" content="#3B82F6" />` at line 71 with `<meta name="theme-color" content={themeColor} />`. This makes the meta skin-aware and removes the only bare hex in root.tsx, so plan 03's color guard passes without an allowlist marker here.

    Add a `<link rel="preload">` for the font is NOT this plan's job — plan 04 owns font work. Do not add font links here.

    Do NOT modify the ThemeProvider, the theme-init script, or any next-themes wiring. `data-studio` is a static SSR attribute only (R-15); never set it in a useEffect.

    Run `npx prettier --write apps/staff-web/app/root.tsx`.
  </action>
  <verify>
    <automated>grep -q "export async function loader" apps/staff-web/app/root.tsx && grep -q "process.env.GYMOS_STUDIO_SKIN" apps/staff-web/app/root.tsx && grep -q "data-studio={studioName}" apps/staff-web/app/root.tsx && grep -q "content={themeColor}" apps/staff-web/app/root.tsx && ! grep -q "content=\"#3B82F6\"" apps/staff-web/app/root.tsx && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - root.tsx contains `export async function loader` AND `process.env.GYMOS_STUDIO_SKIN`
    - root.tsx imports `getSkinConfig` from `./skins/config` (grep `from "./skins/config"`)
    - The `<html` element carries `data-studio={studioName}` (R-14: on html, not an inner div)
    - `studioName` is derived with a `?? "default"` fallback (the undefined-on-non-gymos-routes guard)
    - `data-studio` is NOT set inside any `useEffect` (grep around useEffect confirms it is a JSX attribute only) (R-15)
    - The old `content="#3B82F6"` is GONE; theme-color now reads `content={themeColor}`
    - root loader returns a plain object (no `json(` call — grep `json(` returns zero in the new loader)
  </acceptance_criteria>
  <done>root.tsx has a root loader reading GYMOS_STUDIO_SKIN, Layout sets data-studio on &lt;html&gt; from loader data (SSR inline, with default fallback), and the theme-color meta is skin-derived. No useEffect, no DB round-trip, no remaining bare hex.</done>
</task>

<task type="auto">
  <name>Task 2: Render skin identity in GymosTopNav (DSGN-05)</name>
  <files>apps/staff-web/app/components/gymos/GymosTopNav.tsx</files>
  <read_first>
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (full — the file being modified; line 56 hardcoded span)
    - apps/staff-web/app/root.tsx (to confirm the exact shape returned by the root loader: `{ skin: { name, displayName, logo }, accentHex }`)
    - .planning/research/PITFALLS.md (the "useRouteLoaderData('root') returns undefined" note — always fall back)
  </read_first>
  <action>
    Edit apps/staff-web/app/components/gymos/GymosTopNav.tsx. Replace the hardcoded studio name span (line 56) with skin-sourced identity.

    1. Add `useRouteLoaderData` to the existing `react-router` import:
    ```ts
    import { Link, useLocation, useRouteLoaderData } from "react-router";
    ```

    2. Inside `GymosTopNav()`, read the root loader data with a typed-ish cast and safe fallbacks:
    ```tsx
    const rootData = useRouteLoaderData("root") as
      | { skin?: { displayName?: string; logo?: string | null } }
      | undefined;
    const displayName = rootData?.skin?.displayName ?? "GymClassOS";
    const logo = rootData?.skin?.logo ?? null;
    ```

    3. Replace the line-56 span:
    ```tsx
    <span className="text-[12px] font-semibold mr-3">GymClassOS</span>
    ```
    with:
    ```tsx
    <span className="text-[12px] font-semibold mr-3">
      {logo ? (
        <img src={logo} alt={displayName} className="h-5 w-auto" />
      ) : (
        displayName
      )}
    </span>
    ```

    Keep all other nav tabs (Home/Inbox/Schedule/Members/Payments/Analytics/Campaigns/Forms/Settings) and the sign-out handler exactly as-is. Do NOT introduce any hardcoded hex. Run `npx prettier --write apps/staff-web/app/components/gymos/GymosTopNav.tsx`.
  </action>
  <verify>
    <automated>grep -q "useRouteLoaderData" apps/staff-web/app/components/gymos/GymosTopNav.tsx && grep -q "rootData?.skin?.displayName ?? \"GymClassOS\"" apps/staff-web/app/components/gymos/GymosTopNav.tsx && ! grep -q ">GymClassOS<" apps/staff-web/app/components/gymos/GymosTopNav.tsx && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - GymosTopNav.tsx imports `useRouteLoaderData` from `react-router`
    - It reads `useRouteLoaderData("root")` and derives `displayName` with a `?? "GymClassOS"` fallback and `logo` with a `?? null` fallback
    - The literal hardcoded `>GymClassOS<` text node is GONE (grep `>GymClassOS<` returns zero); the displayName now comes from `{displayName}` / the logo img
    - When `logo` is non-null it renders an `<img src={logo} alt={displayName} ... />`; when null it renders `{displayName}`
    - No new hardcoded hex added
  </acceptance_criteria>
  <done>GymosTopNav renders the active skin's displayName (or logo image) from root loader data, with a GymClassOS fallback. The hardcoded span is gone — DSGN-05 satisfied.</done>
</task>

</tasks>

<verification>
- root.tsx has a root loader reading `process.env.GYMOS_STUDIO_SKIN`; `data-studio` is an inline attribute on `<html>` (R-14) with a `"default"` fallback; theme-color is skin-derived (no `#3B82F6`)
- GymosTopNav shows skin displayName/logo, not a hardcoded string
- `data-studio` is never set in a useEffect (R-15)
- DEPLOY-BASED PROOF (no local dev server): after merge + Vercel deploy with `GYMOS_STUDIO_SKIN=hustle` set in the Vercel env dashboard + redeploy — `/gymos` nav shows "Hustle" and the page renders in indigo; `<html data-studio="hustle">` visible in DevTools; opening a Dialog (Templates picker) shows indigo (proves R-14 portal inheritance); hard-reload shows no FOUC (proves R-15). Re-run `scripts/ui-baseline/capture.mjs` against the deploy for after-state captures into `.planning/ui-reviews/after-r2/`.
</verification>

<success_criteria>
DSGN-02: skin resolved at request time from `GYMOS_STUDIO_SKIN` in the root loader, SSR-injected via `data-studio` on `<html>`, zero DB round-trip (pure TS config import). DSGN-05: studio name + logo render at the top of the staff nav from skin config. Switching skins requires only the Vercel env var + redeploy — no code change.
</success_criteria>

<output>
After completion, create `.planning/phases/R2-design-system-token-layer/R2-02-skin-injector-and-studio-identity-SUMMARY.md`
</output>
