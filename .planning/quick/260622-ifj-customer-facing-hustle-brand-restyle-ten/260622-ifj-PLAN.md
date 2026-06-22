---
phase: quick-260622-ifj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/lib/tenant-brand.ts
  - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
  - apps/staff-web/features/forms/lib/embed-snippet.ts
  - apps/staff-web/features/forms/lib/embed-buy-handler.ts
  - apps/staff-web/server/lib/public-video-ssr.ts
  - apps/staff-web/server/lib/public-content-ssr.ts
  - apps/staff-web/features/video/GymPromo.tsx
  - apps/staff-web/package.json
autonomous: true
requirements: [HUSTLE-BRAND-01]

must_haves:
  truths:
    - "A single per-deploy tenant-brand config module exports the HUSTLE tokens (font, colours, radius, logo, displayName) and is the default brand for every customer-facing SSR surface."
    - "Public form, schedule widget, buy form, content page, and video page all render in Poppins (Google Fonts), not Inter."
    - "Buttons/CTAs on customer-facing surfaces use the tenant primary #FAD02C as the default accent with dark #121212 text (not the old black/white fallback), while existing ?accent= / ?radius= URL-param overrides still win when present."
    - "The /v/:slug public video page caption + meta description say 'Hustle' (tenant displayName), not 'RunStudio'."
    - "The Remotion GymPromo composition renders all text in Poppins via @remotion/google-fonts."
  artifacts:
    - path: "apps/staff-web/server/lib/tenant-brand.ts"
      provides: "TenantBrand typed object with HUSTLE values; commented per-deploy/swappable"
      contains: "export const tenantBrand"
    - path: "apps/staff-web/features/forms/lib/schedule-widget-ssr.ts"
      provides: "Poppins @font-face/link + tenant primary accent default"
    - path: "apps/staff-web/features/forms/lib/public-form-ssr.ts"
      provides: "Poppins + tenant primary accent default in renderFormPage + notFoundPage"
    - path: "apps/staff-web/features/forms/lib/embed-buy-handler.ts"
      provides: "Poppins Google Fonts link + tenant primary accent default"
    - path: "apps/staff-web/server/lib/public-video-ssr.ts"
      provides: "Poppins + tenant displayName caption (Hustle) replacing RunStudio"
    - path: "apps/staff-web/server/lib/public-content-ssr.ts"
      provides: "Poppins font in content + 404 pages"
    - path: "apps/staff-web/features/video/GymPromo.tsx"
      provides: "Poppins fontFamily on all text divs via @remotion/google-fonts/Poppins loadFont()"
    - path: "apps/staff-web/package.json"
      provides: "@remotion/google-fonts dep pinned to 4.0.481"
      contains: "@remotion/google-fonts"
  key_links:
    - from: "all customer-facing SSR renderers"
      to: "apps/staff-web/server/lib/tenant-brand.ts"
      via: "import { tenantBrand }"
      pattern: "tenantBrand"
    - from: "apps/staff-web/features/video/GymPromo.tsx"
      to: "@remotion/google-fonts/Poppins"
      via: "loadFont()"
      pattern: "google-fonts/Poppins"
---

<objective>
Wire a single per-deploy tenant-brand config (HUSTLE's customer-facing brand, sourced from doyouhustle.co.uk) into every customer-facing SSR surface and the Remotion promo video, so embeds and public pages match the gym's own site.

LEAN scope (user explicitly flagged over-engineering): hardcode HUSTLE's values in ONE config module, clearly commented as per-deploy/swappable. NO auto-fetch-from-site mechanism — that is deferred to gym #2.

Purpose: HUSTLE's forms/schedule embeds drop into doyouhustle.co.uk and look native; public buy/content/video pages and generated promo videos carry the HUSTLE brand.
Output: tenant-brand.ts config module + 7 edited SSR/Remotion files + @remotion/google-fonts dep.

Brand tokens (LOCKED with user — HUSTLE):
- Font: Poppins (Google Fonts; weights 300/400/500/700) — free, loadable via Google Fonts <link> in SSR + @remotion/google-fonts in video.
- Primary/CTA: #FAD02C (yellow). Text ON yellow MUST be dark #121212 (WCAG — yellow+white fails).
- Secondary accent: #CE6334 (burnt orange) — hovers/highlights.
- Ink/text: #121212; backgrounds white / #F0F4F8.
- Radius: 8px.
- Logo: https://static1.squarespace.com/static/5df9f5e185a8b572c107b1bd/t/5e088d17e3302c0f49c11808/1577618712599/Hustle+Logo+black.png
- displayName: "Hustle".

Hard constraints:
- TypeScript only. Additive. No DB changes. No git branch creation/switch.
- These SSR renderers build their own inline <style> strings — shadcn/Tailwind rules do NOT apply; edit the inline CSS directly.
- packages/core MUST NOT be touched (so NO changeset needed; staff-web is private).
- KEEP every existing ?accent= / ?radius= URL-param override and every `guard:allow-color` comment intact. Only the fallback default changes (black → tenant primary; and white-on-accent text → dark #121212 where the button background is the primary).
- Verify command (all tasks): `cd apps/staff-web && pnpm typecheck` must exit 0.
- Out of scope, do NOT touch: owner-facing staff app chrome (/gymos/* shadcn theme, app/skins/*), /gymos admin routes, packages/core, any DB/schema/migration.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/SESSION-2026-06-22-brand-restyle-handoff.md

<interfaces>
<!-- Verified directly from the codebase. Use these — no exploration needed. -->

Confirmed deps (apps/staff-web/package.json):
- "remotion": "4.0.481", "@remotion/player": "4.0.481" — BOTH installed.
- "@remotion/google-fonts" is NOT present — Task 3 must add it, pinned EXACTLY to "4.0.481" (Remotion sub-packages must version-match the core remotion package).

Current font pattern (IDENTICAL across all 5 SSR renderers): every <style> block opens with
  @font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("/fonts/inter-variable.woff2") format("woff2-variations"); }
and the CSS has  html{font-family:"Inter",system-ui,-apple-system,sans-serif;font-feature-settings:"cv02","cv03","cv04","cv11"}
EXCEPTION: embed-buy-handler.ts ALSO already loads Inter via a Google Fonts <link> in <head> (lines 92-94) — useful precedent for the Poppins <link> approach.

Current accent-default pattern (varies per file — note each one):
- schedule-widget-ssr.ts CSS(): --accent-color:var(--studio-accent,var(--gym-accent,#000)); and buttons use background:var(--accent-color);color:#fff
- public-form-ssr.ts CSS(): .submit-btn uses background:var(--studio-accent,var(--gym-accent,#000));color:#fff
- embed-buy-handler.ts CSS(): --accent-color:var(--gym-accent,#000); buttons background:var(--accent-color);color:#fff
- public-video-ssr.ts / public-content-ssr.ts: NO accent (no buttons) — font-only change.

Sanitizers (KEEP — do not change their #000000 fallback, it is the CSS-injection guard for invalid URL input):
- sanitizeHexColor(value): returns valid #RRGGBB or "#000000" — in public-form-ssr.ts (exported).
- sanitizeIntPx(value): returns clamped int or 6 — in public-form-ssr.ts (exported).

IMPORTANT on the accent override semantics: the handlers call sanitizeHexColor on the URL param, which returns "#000000" when the param is absent/invalid. Today that "#000000" is injected as --gym-accent/--studio-accent. So "fall back to tenant brand when absent" means: when sanitizeHexColor returns the sentinel "#000000" (i.e. no valid override was supplied), inject tenantBrand.primary instead. Add a small helper in each handler:  const accentParam = reqUrl.searchParams.get("accent"); const accent = accentParam ? sanitizeHexColor(accentParam) : tenantBrand.primary;  — i.e. only sanitize when a param is actually present; otherwise use the tenant default. (Do NOT change sanitizeHexColor itself — other callers and the injection guard rely on its current contract.) Same idea for radius: const radiusParam = reqUrl.searchParams.get("radius"); const radius = radiusParam !== null ? sanitizeIntPx(radiusParam) : tenantBrand.radius;

GymPromo.tsx hardcoded fontFamily (system-sans) appears on 5 text divs at lines ~55, ~71, ~117, ~133, ~171. The string is:
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
Replace each with the Poppins family from @remotion/google-fonts/Poppins loadFont().

public-video-ssr.ts hardcodes "RunStudio" twice:
- line ~175: const description = `${comp.title} — Watch preview in the RunStudio app`;
- line ~210: <p class="watch">Watch — preview available in the RunStudio app</p>
Replace both "RunStudio" with tenantBrand.displayName ("Hustle").
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create tenant-brand config + wire Poppins/primary into schedule-widget + public-form (+ embed-snippet default)</name>
  <files>apps/staff-web/server/lib/tenant-brand.ts, apps/staff-web/features/forms/lib/schedule-widget-ssr.ts, apps/staff-web/features/forms/lib/public-form-ssr.ts, apps/staff-web/features/forms/lib/embed-snippet.ts</files>
  <action>
1. CREATE `apps/staff-web/server/lib/tenant-brand.ts` (server/lib NEVER server/plugins — Nitro bundling rule). Export a typed object `tenantBrand` with the LOCKED HUSTLE tokens. Suggested shape:
   ```ts
   export interface TenantBrand {
     displayName: string;        // "Hustle"
     fontFamily: string;         // CSS stack: '"Poppins", system-ui, -apple-system, sans-serif'
     googleFontsHref: string;    // https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;700&display=swap
     primary: string;            // "#FAD02C" (CTA/accent default)
     primaryText: string;        // "#121212" (text ON primary — WCAG: yellow+white fails)
     secondaryAccent: string;    // "#CE6334" (hovers/highlights)
     ink: string;                // "#121212"
     bg: string;                 // "#FFFFFF"
     bgAlt: string;              // "#F0F4F8"
     radius: number;             // 8 (px)
     logoUrl: string;            // the Squarespace black wordmark URL from objective
   }
   export const tenantBrand: TenantBrand = { ...HUSTLE values... };
   ```
   Add a clear top-of-file comment: "PER-DEPLOY tenant brand (customer-facing surfaces). Sourced from doyouhustle.co.uk. The next gym swaps these VALUES — one file. Automated brand fetch is deferred to gym #2 (see SESSION-2026-06-22-brand-restyle-handoff.md). Owner-facing /gymos chrome is a separate RunStudio-brand track — do NOT use this here." Pure module, no DB, no side effects.

2. EDIT `schedule-widget-ssr.ts`:
   - `import { tenantBrand } from "../../../server/lib/tenant-brand.js";` (note `.js` extension — matches existing import style in this file).
   - In `renderPage()`'s <head> <style>: replace the Inter `@font-face` block with a Poppins Google Fonts `<link>` in the <head> BEFORE the <style> (add `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${tenantBrand.googleFontsHref}" rel="stylesheet">`). Remove the Inter `@font-face` rule.
   - In `CSS()`: change `html{font-family:"Inter",...}` → `html{font-family:${tenantBrand.fontFamily};...}` (keep font-feature-settings line as-is or drop the Inter-specific cv* settings — they are harmless; keep for minimal diff).
   - Accent default: in `renderScheduleWidget()` change accent resolution to fall back to `tenantBrand.primary` when no `?accent=` param is present (see <interfaces> accent override semantics — only sanitize when param present, else tenantBrand.primary; same for radius → tenantBrand.radius). Keep `--studio-accent`/`--gym-accent` injection.
   - Button text colour: the `.enquire-btn` and `.submit-btn` use `color:#fff` on `var(--accent-color)`. Since the primary is yellow, change those to `color:${tenantBrand.primaryText}` (i.e. #121212) — KEEP the existing `guard:allow-color` comments on those lines (update the comment text to note dark-on-primary if you like, but the marker must remain).
   - Optional hover: where `.enquire-btn:hover{opacity:0.85}` exists, you may add `background:${tenantBrand.secondaryAccent}` for the hover, but opacity-only is acceptable — keep minimal.

3. EDIT `public-form-ssr.ts`:
   - `import { tenantBrand } from "../../../server/lib/tenant-brand.js";`
   - In `renderFormPage()` <head>: add the Poppins `<link>` (same preconnect+stylesheet trio) and remove the Inter `@font-face`.
   - In `notFoundPage()`: also swap the Inter `@font-face` → Poppins `<link>` so the 404 matches.
   - In `CSS()`: `html{font-family:${tenantBrand.fontFamily};...}`.
   - Accent default: in `renderPublicFormHtml()` apply the same param-present-or-tenant-default logic for `accent` (→ tenantBrand.primary) and `radius` (→ tenantBrand.radius).
   - `.submit-btn` background is `var(--studio-accent,var(--gym-accent,#000))` with `color:#fff` — change `color:#fff` → `color:${tenantBrand.primaryText}`; KEEP the `guard:allow-color` comment. The CSS-var fallback `#000` inside the `var()` can stay (it is only hit if both vars are unset, which never happens now) OR set it to `${tenantBrand.primary}` for clarity — your choice; keep the guard comment either way.
   - Do NOT change `sanitizeHexColor`/`sanitizeIntPx` themselves (their #000000/6 fallbacks are the CSS-injection guards relied on elsewhere).

4. EDIT `embed-snippet.ts` (trivial, fold in per locked decision): `buildEmbedScript` injects `data-accent`/`data-radius` from the host page into the iframe URL. When the host omits `data-accent`, the iframe currently gets no `accent` param and the SSR renderer now defaults to tenantBrand.primary — so no change is strictly required there. The ONLY optional touch: update the JSDoc examples' comment to mention the tenant default, and (if trivial) set the default `data-radius` to 8 in the doc example. Keep `guard:allow-color` comments. If no clean change is warranted, leave embed-snippet.ts untouched and note that in the SUMMARY — the tenant default already flows because absent params trigger the SSR fallback.

Reference: implements HUSTLE-BRAND-01 (customer-facing brand) per locked user decisions.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <done>tenant-brand.ts exists and exports `tenantBrand` with all HUSTLE tokens. schedule-widget-ssr.ts and public-form-ssr.ts both import it, load Poppins via Google Fonts <link>, default the accent to #FAD02C with #121212 button text, default radius to 8, and STILL honour ?accent=/?radius= overrides. All `guard:allow-color` markers preserved. `pnpm typecheck` exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: Wire tenant brand into embed-buy + public-video (RunStudio→Hustle) + public-content</name>
  <files>apps/staff-web/features/forms/lib/embed-buy-handler.ts, apps/staff-web/server/lib/public-video-ssr.ts, apps/staff-web/server/lib/public-content-ssr.ts</files>
  <action>
1. EDIT `embed-buy-handler.ts`:
   - `import { tenantBrand } from "../../../server/lib/tenant-brand.js";`
   - In `renderBuyPage()` <head>: the file ALREADY has a Google Fonts <link> for Inter (lines ~92-94). Change the `<link href="...family=Inter...">` to `<link href="${tenantBrand.googleFontsHref}">` (Poppins). Keep the two preconnect links.
   - In `CSS()`: `html{font-family:"Inter",...}` → `html{font-family:${tenantBrand.fontFamily};...}`.
   - Accent default: in `renderEmbedBuy()` (GET) apply param-present-or-tenant-default for accent (→ tenantBrand.primary) and radius (→ tenantBrand.radius). The POST path (`handleEmbedBuyPost`) currently calls `sanitizeHexColor(null)`/`sanitizeIntPx(null)` to render error re-rends — change those two to `tenantBrand.primary` / `tenantBrand.radius` so error states keep the brand.
   - `.submit-btn` is `background:var(--accent-color);color:#fff` — change `color:#fff` → `color:${tenantBrand.primaryText}`. Add a `guard:allow-color` comment on that line (this file's `.submit-btn` does not currently carry one — add one matching the style used in the sibling files: `/* guard:allow-color — embed widget dark text on tenant primary CTA; no CSS var available in injected iframe context */`).
   - The `--accent-color:var(--gym-accent,#000)` line in `CSS()` carries the accent var; the `#000` fallback can stay or become `${tenantBrand.primary}` — keep minimal, but if you touch the line keep/add a guard comment.

2. EDIT `public-video-ssr.ts` (font + RunStudio→Hustle):
   - `import { tenantBrand } from "./tenant-brand.js";` (same dir — server/lib).
   - In `renderVideoPage()` <head> <style>: replace the Inter `@font-face` with a Poppins Google Fonts `<link>` placed in <head> before <style> (preconnect trio + stylesheet); change `html{font-family:"Inter",...}` → `html{font-family:${tenantBrand.fontFamily};...}`.
   - In `notFoundPage()`: same Inter→Poppins swap so the 404 matches.
   - Line ~175: `const description = \`${comp.title} — Watch preview in the RunStudio app\`;` → replace `RunStudio` with `${tenantBrand.displayName}`.
   - Line ~210: `<p class="watch">Watch — preview available in the RunStudio app</p>` → replace `RunStudio` with `${escapeHtml(tenantBrand.displayName)}` (it is interpolated into HTML — escape it; displayName is a constant but escape for consistency/safety).

3. EDIT `public-content-ssr.ts` (font only):
   - `import { tenantBrand } from "./tenant-brand.js";`
   - In `renderContentPage()` <head>: Inter `@font-face` → Poppins `<link>`; `html{font-family:${tenantBrand.fontFamily};...}`.
   - In `notFoundPage()`: same Inter→Poppins swap.
   - No accent change needed (content page has no CTA buttons; links use functional blue with `guard:allow-color`-style intent — leave link colours as-is, they are content typography not brand CTAs).

Reference: implements HUSTLE-BRAND-01; RunStudio→Hustle caption fix per locked decision.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <done>embed-buy-handler.ts, public-video-ssr.ts, public-content-ssr.ts all import tenantBrand and render Poppins. embed-buy CTA uses #FAD02C bg + #121212 text and defaults accent/radius to tenant brand. public-video /v page caption + meta description say "Hustle" not "RunStudio". All `guard:allow-color` markers preserved (and the new embed-buy CTA line carries one). `pnpm typecheck` exits 0.</done>
</task>

<task type="auto">
  <name>Task 3: Remotion video uses Poppins (add @remotion/google-fonts dep + GymPromo loadFont)</name>
  <files>apps/staff-web/package.json, apps/staff-web/features/video/GymPromo.tsx</files>
  <action>
1. ADD dependency: in `apps/staff-web/package.json` `dependencies`, add `"@remotion/google-fonts": "4.0.481"` (EXACT version match to the installed `remotion`/`@remotion/player` 4.0.481 — Remotion sub-packages must version-lock to core). Keep alphabetical-ish ordering near the other `@remotion/*` entry. Then run the install so the dep resolves before typecheck (from repo root: `pnpm install --filter @gymos/staff-web` — or `pnpm -w install`; this is a pnpm workspace, package manager pnpm@10.14.0).

2. EDIT `GymPromo.tsx` to use Poppins:
   - At the top, after the existing imports, add:
     ```ts
     import { loadFont } from "@remotion/google-fonts/Poppins";
     const { fontFamily: poppinsFamily } = loadFont("normal", { weights: ["400", "700"] });
     ```
     (loadFont is synchronous-returning the family name; weights 400+700 cover the 700/400 fontWeights used on the title/subtitle divs. It pairs with Remotion 4.0.x and is the documented Remotion Google Fonts pattern. Module-level call is fine — GymPromo is a Remotion composition.)
   - Replace the hardcoded system-sans `fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"` on ALL 5 text divs (lines ~55, ~71, ~117, ~133, ~171) with `fontFamily: poppinsFamily`.
   - Keep everything else (colours, sizes, weights, opacity/fade logic) unchanged — this is a font-only swap. Do NOT add a VideoSpec field (the locked decision allows "GymPromo imports the brand font directly" — the simplest path; no video-spec.ts change needed).
   - GymPromo is rendered both in the editor preview (VideoPreviewPlayer via @remotion/player) and is the source for any future render — both pick up the font from the loadFont() call. No VideoPreviewPlayer.tsx change required.

3. Sanity-check the dep resolves: confirm `pnpm typecheck` (which runs `agent-native typecheck`) resolves the `@remotion/google-fonts/Poppins` import with no "cannot find module" error. If typecheck cannot see the new package, re-run the workspace install before re-running typecheck.

Reference: user REQUIRES videos use Poppins. implements HUSTLE-BRAND-01 (video font).
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <done>@remotion/google-fonts@4.0.481 is in apps/staff-web/package.json dependencies and installed (node_modules resolves it). GymPromo.tsx imports loadFont from @remotion/google-fonts/Poppins and applies the returned family to all 5 text divs; no system-sans fontFamily strings remain. `pnpm typecheck` exits 0 with the new import resolving.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && pnpm typecheck` exits 0 after every task.
- Grep confirms no remaining `RunStudio` string in public-video-ssr.ts.
- Grep confirms no remaining `inter-variable.woff2` / `font-family:"Inter"` in the five edited SSR renderers (Poppins everywhere on customer-facing surfaces).
- Grep confirms `tenantBrand` is imported in all five SSR renderers.
- Grep confirms `@remotion/google-fonts/Poppins` import in GymPromo.tsx and no `-apple-system, BlinkMacSystemFont` strings remain there.
- All pre-existing `guard:allow-color` markers still present (none deleted).
- `git diff --stat` shows NO changes under packages/core (so no changeset needed) and NO changes to DB/migration/schema files or /gymos admin routes or app/skins.
</verification>

<success_criteria>
- ONE per-deploy tenant-brand config module (server/lib/tenant-brand.ts) exists, typed, with HUSTLE tokens, commented as swappable per-deploy.
- All customer-facing SSR surfaces (form, schedule, buy, content, video) render Poppins and use #FAD02C primary (dark #121212 text on CTAs) as the accent DEFAULT, with ?accent=/?radius= overrides still honoured.
- /v public video page says "Hustle", not "RunStudio".
- Remotion GymPromo renders Poppins via @remotion/google-fonts.
- TS-only, additive, no DB, packages/core untouched, no git branch change, `pnpm typecheck` exits 0.
</success_criteria>

<output>
After completion, create `.planning/quick/260622-ifj-customer-facing-hustle-brand-restyle-ten/260622-ifj-SUMMARY.md`
</output>
