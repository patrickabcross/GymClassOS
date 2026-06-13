# Phase R2: Design System Token Layer - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Install the CSS custom-property token layer + studio-skin mechanism for staff-web (and its embed/marketing SSR surfaces), author the GymClassOS default skin and a Hustle placeholder skin, self-host Inter, and surface studio identity in the existing top-nav.

**In scope:**
- Token convention: bare `@theme` driving `:root` CSS variables (no `@theme inline`), declared after the upstream `agent-native.css` import and after the `.dark` block.
- Per-skin files (`skins/<name>.css`) + a typed `skins/config.ts` registry holding non-CSS identity (displayName, logo).
- A skin-injector server plugin that reads `GYMOS_STUDIO_SKIN`, sets `data-studio` on `<html>`, and makes skin config available via the root loader.
- A hex-elimination conversion pass across **all of `apps/staff-web`** (gymos surfaces, legacy email components, embed SSR pages, marketing SSR) so colors resolve from tokens.
- A CI grep guard failing on hardcoded hex + Tailwind arbitrary-color values outside skin files.
- Self-hosted Inter (variable woff2) replacing every `fonts.googleapis.com` reference (global.css + all SSR pages).
- Studio name + logo in `GymosTopNav` sourced from the active skin config.

**Out of scope (later phases):**
- Visual redesign / restyling of any surface (R4 — token layer must land *before* visual work, not with it).
- Removing dark mode / the ThemeToggle (R4, SWEB-06).
- A real left sidebar layout (R4 — identity goes in the existing top-nav for R2).
- The `studios/<studio>/env.yml` deploy-script loader (master-branch P1a deploy machinery — R2 only scaffolds the contract).
- Mobile `theme.ts` and any shared `packages/gymos-tokens` extraction (R5).
- Finalising Hustle's real brand hex (open dependency — placeholder ships in R2).

</domain>

<decisions>
## Implementation Decisions

### GymClassOS default brand identity
- **D-01:** Palette personality = **energetic accent on a light neutral base**. Keep the current near-white background / white cards / near-black slate text; add a confident athletic accent for CTAs, active states, pills, and focus rings. Lowest-risk path into R4's refresh; aligns with R4's "staff web defaults to light theme" criterion.
- **D-02:** Accent family = **punchy orange** (`#F97316` orange-500 base, `#EA580C` orange-600 hover, `#FFF7ED` orange-50 tint for pills/active-tab backgrounds). White text on the accent for buttons. Distinct from the blue-SaaS default and from generic wellness palettes. Exact HSL token values are Claude's discretion within this family.
- **D-03:** Radius personality = **keep `--radius: 0.5rem`** (soft-modern, matches shadcn defaults so existing components look intentional with no rework). Radius stays a skin-overridable token so Hustle can change it.
- **D-04:** Logo = **wordmark only** for the default skin. The skin config's `logo` slot is `null` for `default` (render a styled "GymClassOS" Inter wordmark); the slot accepts an image path for studios that supply one (Hustle). No SVG logo design work in R2.

### Skin anatomy & config shape
- **D-05:** A skin = **a CSS file + a TS config entry**. `apps/staff-web/app/skins/<name>.css` holds token overrides scoped under `:root[data-studio="<name>"]`; `apps/staff-web/app/skins/config.ts` is a typed registry mapping each skin to its non-CSS identity (`{ displayName, logo, ... }`). This is what satisfies DSGN-05 (name/logo aren't CSS) and DSGN-02 (zero DB round-trip).
- **D-06:** Tokens stay **staff-web-local in R2** (everything under `apps/staff-web/app/skins/`). The shared `packages/gymos-tokens` package is **not** created now — R5 extracts it mechanically when mobile becomes the second consumer (the skin config is already a typed TS module). Avoids speculative package plumbing during the riskiest CSS phase.
- **D-07:** Token vocabulary = **existing shadcn `:root` variables + a small `--studio-*` addition**. Skins override `--primary`/`--primary-foreground`, `--accent`/`--accent-foreground`, `--background`/`--card`/`--border`, `--radius`, plus new `--studio-accent` (brand accent) and `--studio-accent-soft` (tint background). Maximum reuse — existing components already consume the shadcn vars. Font stays Inter for all skins (DSGN-04). No full semantic token system in R2 (that's R4 surface work if needed).
- **D-08:** Skin selection = **read `process.env.GYMOS_STUDIO_SKIN` directly** in the skin-injector plugin / root loader (set in the Vercel dashboard for verification). R2 also commits **minimal `studios/default/env.yml` + `studios/hustle/env.yml` scaffolds** documenting the var as a contract for the future P1a deploy script — but builds no deploy-script / env.yml *loader* in R2.
- **D-09:** Dark mode = **left in place**. R2 does not touch the `.dark` block, `next-themes`, or `ThemeToggle`. Skin override blocks are declared **after** the `.dark` block in cascade order (pitfall R-09) so a studio skin wins when both are active. Removing dark mode is R4 scope.
- **D-10:** Skin config reaches components via a **root loader → `useRouteLoaderData("root")`**. The root loader resolves the active skin from the env var and returns it; `GymosTopNav` reads `skin.displayName` / `skin.logo` from root loader data. SSR-correct (no flash); the same resolution sets `data-studio` on `<html>`. NOT `application_state` (would add the DB round-trip DSGN-02 forbids). *(Note: `root.tsx` currently has no loader and a static `Layout` function — R2 must add the loader and thread skin into the `<html>` element.)*

### Hex-conversion scope & CI guard
- **D-11:** Conversion reach = **all of `apps/staff-web`**, including legacy email components (still routable until R3) and the embed/marketing SSR inline styles. R2 delivers a *complete* token layer so R4 restyles on top without mixing conversion diffs with redesign diffs (the token-before-visual sequencing the milestone enforces).
- **D-12:** CI guard catches **hex literals (`#fff`, `#3b82f6`) AND Tailwind arbitrary-color values (`bg-[#…]`, `text-[#…]`)** in `apps/staff-web/{app,server,features}` `.ts`/`.tsx`/`.css` files. Skin files (`app/skins/*.css`) are exempt; a documented allowlist + a `// guard:allow-color — <reason>` marker comment cover legit exceptions (e.g. third-party brand colors like WhatsApp green). Wired into `pnpm prep` + CI, same pattern as the existing `scripts/guard-*.mjs` family. Does NOT attempt to flag `rgb()`/`hsl()`/named colors (the token system itself is built on `hsl(var(--…))`, so a broader regex would be false-positive-prone).
- **D-13:** Font self-hosting covers **staff-web AND embeds**. R2 replaces the Google Fonts `@import`/`<link>` in `global.css` **and** in every SSR page (`features/forms/lib/public-form-ssr.ts`, `features/forms/lib/schedule-widget-ssr.ts`, `features/marketing/lib/marketing-ssr.ts`) with the self-hosted `/fonts/inter-variable.woff2` (same-origin from staff-web's public dir). DSGN-04 ("no `fonts.googleapis.com` on any page load") is satisfied across every page the deploy serves, embeds included.

### Studio identity placement (DSGN-05)
- **D-14:** Studio identity goes in the **existing `GymosTopNav`** for R2. Replace the hardcoded `"GymClassOS"` text span (`GymosTopNav.tsx:56`) with skin-sourced `displayName` + `logo` (wordmark when `logo: null`). DSGN-05's "top of the staff sidebar" wording is satisfied by the top-nav for this phase; the final sidebar placement (if R4 introduces a sidebar) moves identity there mechanically since it already reads from skin config. Capture this wording-vs-implementation note explicitly so the verifier doesn't fail DSGN-05 on the literal "sidebar" word.

### Claude's Discretion
- Exact HSL token values within the chosen orange accent family (D-02) and the full default-skin `:root` value set.
- The exact self-hosting mechanism for Inter (manual woff2 download vs `vite-plugin-webfont-dl`) — STACK.md allows either; manual is simpler for solo dev.
- Hustle placeholder palette values (clearly marked `/* TODO: replace with Hustle brand values */` per the open dependency) — pick sensible placeholders distinct from default so skin-switching is visibly proven.
- Guard regex implementation details and the precise allowlist contents.
- Whether the wordmark treatment uses a logo component or inline markup.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.1 research (current — written for this milestone)
- `.planning/research/STACK.md` — **the primary R2 reference.** Token architecture (`@theme inline` vs bare `@theme`), per-surface token flow (Tailwind v4 / embed iframe / Expo), self-hosted Inter strategy, "what NOT to add" (no style-dictionary, no unistyles, no NativeWind), version compatibility. The decisions above implement this file's recommendations.
- `.planning/research/PITFALLS.md` — R2-critical pitfalls, all tagged "Tokens" phase:
  - **R-01** — `@theme inline` bakes hex at build time → skin overrides silently ignored. MUST use bare `@theme`. CI check: `grep -r "@theme inline" apps/staff-web` returns zero.
  - **R-09** — dark-mode + studio-skin specificity conflict → declare studio overrides AFTER `.dark` in `global.css` (drives D-09).
  - **R-13** — upstream `agent-native.css` `@theme` import order → GymClassOS `@theme` block must come AFTER the `@import "@agent-native/core/styles/agent-native.css"` line in `global.css`.
  - **R-14** — Radix portals (`Dialog`/`Tooltip`/`Popover`/`Select`) render at `document.body` → `data-studio` MUST be on `<html>`, not an inner `<div>`, or modals miss the skin (drives D-10's `<html data-studio>`).
  - **R-15** — `next-themes` + `data-studio` hydration race → verify no FOUC on hard reload with a skin active.
  - **R-12** — `email-*` CSS class orphaning (relevant to the legacy-component conversion in D-11).
- `.planning/research/FEATURES.md` — Naming Recommendations Table / Competitor Vocabulary Map (background; primarily an R3 input but useful for any copy touched).

### Project planning
- `.planning/REQUIREMENTS.md` — **DSGN-01** (bare `@theme`, no hardcoded hex, CI guard), **DSGN-02** (deploy-time skin via `GYMOS_STUDIO_SKIN`, SSR-injected, zero DB round-trip), **DSGN-03** (Hustle + default `.css` skins, env-var switch), **DSGN-04** (self-hosted Inter, no `fonts.googleapis.com`), **DSGN-05** (studio name + logo at top of sidebar).
- `.planning/ROADMAP.md` — Phase R2 success criteria (the 5 TRUE-conditions), "Key constraints baked into every phase", and the Open dependency note (Hustle hex placeholder).
- `.planning/STATE.md` — no-local-dev-server constraint (verify via Vercel deploy with `GYMOS_STUDIO_SKIN` set), live deployment state, R1-era branch notes.
- `.planning/phases/R1-audit-baseline/R1-CONTEXT.md` + `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` — R1's audit output; the capture harness in `scripts/ui-baseline/` is the standing verification tool R2 reuses (run against a `GYMOS_STUDIO_SKIN=hustle` deploy for after-state proof).

### Existing UI artifacts
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md` and `P1b.1-UI-REVIEW.md` — partial UI spec/review (background context).

### Stale — do not treat as current
- `.planning/research/SUMMARY.md` and `.planning/research/ARCHITECTURE.md` are v1.0-era; read only for project background.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets / integration points
- **`apps/staff-web/app/global.css`** — already uses the shadcn CSS-variable pattern (`:root` space-separated HSL values, `.dark` block, `@import "@agent-native/core/styles/agent-native.css"`). This is the token layer's home. Line 1 is the Google Fonts `@import` to replace (D-13). Upstream uses bare `@theme` already (pitfall R-01 confirms the correct pattern exists to follow).
- **`apps/staff-web/app/root.tsx`** — `Layout` is currently a **static function with no root loader**; `<html lang="en" suppressHydrationWarning>` at line 57. R2 must add a root loader (resolve skin from env) and add `data-studio={skin.name}` to the `<html>` element. Note line 71 hardcodes `<meta name="theme-color" content="#3B82F6" />` — a hex the guard will flag; make it skin-aware or allowlist it.
- **`apps/staff-web/app/components/gymos/GymosTopNav.tsx`** — line 56 hardcodes `<span ...>GymClassOS</span>`; this is DSGN-05's insertion point (D-14). Reads via `useRouteLoaderData("root")`.
- **No `apps/staff-web/app/skins/` directory yet** — R2 creates it (`default.css`, `hustle.css`, `config.ts`).
- **No `apps/staff-web/public/fonts/` directory yet** — R2 creates it for the self-hosted Inter woff2.
- **No `studios/` directory yet** — R2 scaffolds `studios/default/env.yml` + `studios/hustle/env.yml` (contract only).

### SSR surfaces needing font + hex conversion (D-11, D-13)
- `apps/staff-web/features/forms/lib/public-form-ssr.ts` — Google Fonts refs at lines 298, 300, 577 (two stylesheet links + a preconnect).
- `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` — Google Fonts refs at lines 231, 233. Already injects `--gym-accent`/`--gym-radius` from sanitized URL params (extend this pattern to `--studio-*` per STACK.md).
- `apps/staff-web/features/marketing/lib/marketing-ssr.ts` — Google Fonts refs at lines 103, 105.

### Guard tooling pattern to follow
- `scripts/` already holds 11 `guard-*.mjs` scripts wired into `pnpm prep` + CI (e.g. `guard-no-drizzle-push.mjs`, `guard-no-whatsapp-in-staff-web.mjs`). The new `guard-no-hardcoded-colors.mjs` (D-12) follows the same shape and wiring.

### Constraints in force
- **No local dev server** (NitroViteError) — all verification via Vercel deploy. Skin-switch proof = set `GYMOS_STUDIO_SKIN=hustle` in Vercel, redeploy, confirm Hustle colors render. Re-run `scripts/ui-baseline/` for after-state captures.
- **Fork boundary** — `templates/*` and `packages-vendored/*` never edited. Upstream `@agent-native/core/styles/agent-native.css` is consumed (imported), never modified.
- **Live customer on master** — this branch (`redesign/ui-refresh`) not yet pushed; R2 work is branch-isolated.

</code_context>

<specifics>
## Specific Ideas

- Default skin = light neutral + **orange-500 (`#F97316`)** accent, 0.5rem radius, "GymClassOS" wordmark (no image).
- `data-studio` attribute MUST live on `<html>` (not an inner div) so Radix portals inherit the skin (pitfall R-14).
- Studio override CSS blocks come AFTER both the upstream `@import` (R-13) and the `.dark` block (R-09) in `global.css`.
- The skin-switch verification is the literal proof of DSGN-02/DSGN-03: `GYMOS_STUDIO_SKIN=hustle` env change + redeploy → Hustle colors, no code change.
- Hustle skin ships with placeholder hex marked `/* TODO: replace with Hustle brand values */` — visibly distinct from default so the switch is provable before real values arrive.
- Reuse `scripts/ui-baseline/` (R1) for after-state captures rather than building new capture tooling.

</specifics>

<deferred>
## Deferred Ideas

- **GymClassOS SVG logo mark** — considered designing a real logo in R2; deferred. Default ships a wordmark; revisit when a brand identity exercise happens (post-milestone or R4 polish).
- **`packages/gymos-tokens` shared package** — STACK.md's architecture; deferred to **R5** when mobile is the second consumer. Extraction is mechanical from the R2 TS skin config.
- **Removing dark mode / ThemeToggle** — R4 scope (SWEB-06: "dark theme is absent").
- **Real left sidebar with studio identity at top** — R4 visual-refresh scope; R2 uses the existing top-nav.
- **`studios/<studio>/env.yml` deploy-script loader** — master-branch P1a deploy machinery; R2 only scaffolds the env.yml contract.
- **Full semantic token system** (surface/on-surface/success/warning/capacity roles) — defer to R4 if the visual refresh needs it; R2 stays on shadcn vars + `--studio-*`.

</deferred>

---

*Phase: R2-design-system-token-layer*
*Context gathered: 2026-06-13*
