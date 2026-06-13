---
phase: R2-design-system-token-layer
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/global.css
  - apps/staff-web/app/skins/config.ts
  - apps/staff-web/app/skins/default.css
  - apps/staff-web/app/skins/hustle.css
  - studios/default/env.yml
  - studios/hustle/env.yml
autonomous: true
requirements: [DSGN-01, DSGN-03]
must_haves:
  truths:
    - "global.css declares a bare @theme block (no @theme inline) mapping --studio-accent / --studio-accent-soft after the agent-native.css import"
    - "default.css and hustle.css both exist under apps/staff-web/app/skins/ with :root[data-studio=...] override blocks"
    - "skins/config.ts exports a typed SkinName + getSkinConfig registry with displayName + logo for default and hustle"
    - "Hustle skin values are placeholders clearly marked with a TODO comment and visibly distinct from the default orange"
    - "studios/default/env.yml and studios/hustle/env.yml document GYMOS_STUDIO_SKIN as a deploy contract (no loader code)"
  artifacts:
    - path: "apps/staff-web/app/global.css"
      provides: "GymClassOS @theme tokens + default --studio-* :root values + skin @imports"
      contains: "--studio-accent"
    - path: "apps/staff-web/app/skins/config.ts"
      provides: "Typed skin registry (displayName, logo) for root loader + GymosTopNav"
      exports: ["SkinName", "SkinConfig", "getSkinConfig"]
    - path: "apps/staff-web/app/skins/default.css"
      provides: "Default GymClassOS orange skin token overrides"
      contains: ":root[data-studio=\"default\"]"
    - path: "apps/staff-web/app/skins/hustle.css"
      provides: "Hustle placeholder skin token overrides (distinct from default)"
      contains: ":root[data-studio=\"hustle\"]"
    - path: "studios/default/env.yml"
      provides: "Deploy contract documenting GYMOS_STUDIO_SKIN=default"
      contains: "GYMOS_STUDIO_SKIN"
    - path: "studios/hustle/env.yml"
      provides: "Deploy contract documenting GYMOS_STUDIO_SKIN=hustle"
      contains: "GYMOS_STUDIO_SKIN"
  key_links:
    - from: "apps/staff-web/app/global.css"
      to: "apps/staff-web/app/skins/default.css"
      via: "@import at end of file, after .dark block"
      pattern: "@import\\s+[\"']\\./skins/default\\.css[\"']"
    - from: "apps/staff-web/app/global.css"
      to: "apps/staff-web/app/skins/hustle.css"
      via: "@import at end of file, after .dark block"
      pattern: "@import\\s+[\"']\\./skins/hustle\\.css[\"']"
---

<objective>
Install the CSS custom-property token layer and the two studio skins (default + Hustle placeholder), plus the `studios/` env-contract scaffold. This is the foundation every other R2 plan builds on: the `@theme` tokens, the `--studio-*` defaults, the skin CSS files keyed by `data-studio`, and the typed `skins/config.ts` registry that the root loader and `GymosTopNav` consume.

Purpose: Satisfies DSGN-01 (bare `@theme`, token-resolved colors) and DSGN-03 (default + Hustle skins switchable by env var). Provides the `skins/config.ts` module that plan 02 wires into the root loader.

Output: Modified `global.css`; new `skins/{config.ts,default.css,hustle.css}`; new `studios/{default,hustle}/env.yml`.
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
<!-- The skin config contract that plan 02 (root loader) and GymosTopNav consume. Build skins/config.ts to exactly this shape. -->

skins/config.ts must export:
```ts
export type SkinName = "default" | "hustle";
export interface SkinConfig {
  displayName: string;
  logo: string | null; // public path e.g. "/logos/hustle.svg", or null = render wordmark
}
export function getSkinConfig(name: string): SkinConfig; // falls back to default for unknown names
```

Current global.css structure (verified):
- Line 1: `@import url("https://fonts.googleapis.com/...")` — DO NOT touch in this plan (plan 04 owns the font line).
- Line 3: `@import "tailwindcss";`
- Line 4: `@import "@agent-native/core/styles/agent-native.css";`  ← GymClassOS @theme goes AFTER this
- Line 6: `@source "./**/*.{ts,tsx}";`
- Lines 8-37: `:root { ... }` bare space-separated HSL values, ends with `--radius: 0.5rem;` + sidebar vars
- Lines 39-68: `.dark { ... }`  ← skin @imports go AFTER this block
- Line 70+: `@layer base { body { ... } }`

Upstream agent-native.css already uses bare `@theme { --color-primary: hsl(var(--primary)); ... }` and `@custom-variant dark (&:is(.dark *))`. Follow that exact pattern.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add GymClassOS @theme tokens + default --studio-* values to global.css</name>
  <files>apps/staff-web/app/global.css</files>
  <read_first>
    - apps/staff-web/app/global.css (the file being modified — read full)
    - packages/core/src/styles/agent-native.css (source-of-truth for the bare @theme pattern and --color-* → hsl(var(--*)) mapping; DO NOT edit it, fork boundary)
    - .planning/research/PITFALLS.md (R-01 bare @theme, R-02 bare HSL no wrapper, R-13 @theme after upstream import, R-09 skin imports after .dark)
  </read_first>
  <action>
    Edit apps/staff-web/app/global.css. Make THREE additive changes. Do NOT touch line 1 (the Google Fonts @import) — that is plan 04's responsibility.

    1. After the `@source "./**/*.{ts,tsx}";` line (line 6) and BEFORE the `:root {` block, insert a bare `@theme` block (NOT `@theme inline`) that maps the two new GymClassOS studio tokens into Tailwind's color namespace. This MUST come after `@import "@agent-native/core/styles/agent-native.css"` (pitfall R-13):
    ```css
    /* GymClassOS brand tokens — bare @theme so utilities compile to var() references (R-01).
       Declared AFTER the upstream agent-native.css @import so GymClassOS wins on overlap (R-13). */
    @theme {
      --color-studio-accent: hsl(var(--studio-accent));
      --color-studio-accent-soft: hsl(var(--studio-accent-soft));
    }
    ```

    2. Inside the existing `:root { ... }` block (after the `--radius: 0.5rem;` line, before the sidebar vars or at the end of the block), add the default fallback values for the new tokens as BARE space-separated HSL (no hsl() wrapper — pitfall R-02):
    ```css
      /* GymClassOS default accent fallback (orange-500 #F97316 / orange-50 #FFF7ED) */
      --studio-accent: 25 95% 53%;
      --studio-accent-soft: 33 100% 96%;
    ```

    3. At the very END of global.css (after the final closing brace of the `@layer base` block — i.e., the LAST lines of the file), add the two skin imports. They MUST be after the `.dark` block in cascade order (pitfall R-09):
    ```css

    /* Studio skins — imported LAST so [data-studio] overrides win over .dark when both
       are present on <html> (R-09). Skin selection happens via the data-studio attribute
       set in root.tsx (plan 02); default.css provides the always-available fallback. */
    @import "./skins/default.css";
    @import "./skins/hustle.css";
    ```

    Do NOT introduce `@theme inline` anywhere. Do NOT wrap any `:root` value in `hsl()`. Run `npx prettier --write apps/staff-web/app/global.css` after editing.
  </action>
  <verify>
    <automated>grep -c "@theme inline" apps/staff-web/app/global.css | grep -qx 0 && grep -q "@import \"./skins/default.css\"" apps/staff-web/app/global.css && grep -q "@import \"./skins/hustle.css\"" apps/staff-web/app/global.css && grep -q -- "--studio-accent: 25 95% 53%" apps/staff-web/app/global.css && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@theme inline" apps/staff-web/app/global.css` returns `0` (R-01)
    - global.css contains `--color-studio-accent: hsl(var(--studio-accent));` inside a `@theme {` block that appears AFTER the `@import "@agent-native/core/styles/agent-native.css";` line (R-13)
    - global.css `:root` block contains `--studio-accent: 25 95% 53%;` and `--studio-accent-soft: 33 100% 96%;` as bare HSL with no `hsl(` wrapper (R-02)
    - global.css contains `@import "./skins/default.css";` and `@import "./skins/hustle.css";` and both appear AFTER the `.dark {` block's closing brace (R-09)
    - Line 1 still contains `fonts.googleapis.com` (untouched — plan 04 owns it)
  </acceptance_criteria>
  <done>global.css declares the GymClassOS bare @theme tokens, default `--studio-*` fallback values, and imports both skin files after the .dark block. No `@theme inline`, no double-wrapped HSL.</done>
</task>

<task type="auto">
  <name>Task 2: Create skins/config.ts registry + default.css + hustle.css</name>
  <files>apps/staff-web/app/skins/config.ts, apps/staff-web/app/skins/default.css, apps/staff-web/app/skins/hustle.css</files>
  <read_first>
    - apps/staff-web/app/global.css (to confirm the --studio-* token names just added in Task 1 and the existing shadcn :root var names like --primary, --accent, --ring)
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (the consumer of config.ts displayName/logo — line 56 has the hardcoded "GymClassOS" span plan 02 will replace)
    - .planning/phases/R2-design-system-token-layer/R2-RESEARCH.md (Sections 2c and 7 — exact skin CSS and config.ts shapes)
    - .planning/research/PITFALLS.md (R-02 bare HSL, R-09 dark+studio cascade)
  </read_first>
  <action>
    Create the new directory `apps/staff-web/app/skins/` with three files.

    FILE 1 — `apps/staff-web/app/skins/config.ts` (TypeScript, no async I/O — pure module so the root loader stays zero-DB-round-trip per DSGN-02):
    ```ts
    // Studio skin registry — non-CSS identity (name + logo) consumed by the root
    // loader (root.tsx) and GymosTopNav. CSS token overrides live in the sibling
    // <name>.css files, keyed by the data-studio attribute. (R2 D-05)
    export type SkinName = "default" | "hustle";

    export interface SkinConfig {
      displayName: string;
      logo: string | null; // public path e.g. "/logos/hustle.svg", or null = styled wordmark
    }

    const skins: Record<SkinName, SkinConfig> = {
      default: {
        displayName: "GymClassOS",
        logo: null, // wordmark only for default (R2 D-04)
      },
      hustle: {
        // TODO: confirm display name + supply /logos/hustle.svg with Hustle brand assets
        displayName: "Hustle",
        logo: null,
      },
    };

    export function getSkinConfig(name: string): SkinConfig {
      return skins[name as SkinName] ?? skins.default;
    }
    ```

    FILE 2 — `apps/staff-web/app/skins/default.css` (GymClassOS orange skin; all values BARE HSL per R-02):
    ```css
    /* GymClassOS default skin — energetic orange accent on light neutral base (R2 D-01/D-02).
       Activated when <html data-studio="default">. Always-available fallback. */
    :root[data-studio="default"] {
      --primary: 24 95% 53%; /* orange-500 #F97316 */
      --primary-foreground: 0 0% 100%; /* white text on accent */
      --accent: 33 100% 96%; /* orange-50 #FFF7ED tint for pills/active tabs */
      --accent-foreground: 24 80% 30%;
      --ring: 24 80% 53%;
      --radius: 0.5rem; /* soft-modern, matches shadcn defaults (R2 D-03) */
      --studio-accent: 24 95% 53%;
      --studio-accent-soft: 33 100% 96%;
    }
    ```

    FILE 3 — `apps/staff-web/app/skins/hustle.css` (PLACEHOLDER values, visibly distinct from orange so the env-switch is provable; marked TODO per the open dependency):
    ```css
    /* Hustle skin — PLACEHOLDER values, visibly distinct from default orange so the
       GYMOS_STUDIO_SKIN switch is provable before real brand values arrive. */
    /* TODO: replace with Hustle brand values — awaiting customer confirmation */
    :root[data-studio="hustle"] {
      --primary: 258 84% 56%; /* placeholder indigo-500 */
      --primary-foreground: 0 0% 100%;
      --accent: 255 100% 97%; /* placeholder indigo-50 */
      --accent-foreground: 258 70% 30%;
      --ring: 258 70% 56%;
      --radius: 0.375rem; /* slightly tighter than default — extra visual distinction */
      --studio-accent: 258 84% 56%;
      --studio-accent-soft: 255 100% 97%;
    }

    /* Combined dark + Hustle selector so the skin still wins in dark mode (R-09). */
    html.dark[data-studio="hustle"] {
      --primary: 258 84% 72%; /* lighter indigo in dark mode */
      --accent: 258 30% 18%;
      --studio-accent: 258 84% 72%;
      --studio-accent-soft: 258 30% 18%;
    }
    ```

    Run `npx prettier --write apps/staff-web/app/skins/config.ts` (the .css files may not be covered by prettier's config — only format the .ts file).
  </action>
  <verify>
    <automated>grep -q "export function getSkinConfig" apps/staff-web/app/skins/config.ts && grep -q ":root\[data-studio=\"default\"\]" apps/staff-web/app/skins/default.css && grep -q ":root\[data-studio=\"hustle\"\]" apps/staff-web/app/skins/hustle.css && grep -q "TODO: replace with Hustle brand values" apps/staff-web/app/skins/hustle.css && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/skins/config.ts` exists and exports `SkinName`, `SkinConfig`, and `getSkinConfig` (grep for `export type SkinName`, `export interface SkinConfig`, `export function getSkinConfig`)
    - config.ts `default` entry has `displayName: "GymClassOS"` and `logo: null`; `hustle` entry has `logo: null`
    - `apps/staff-web/app/skins/default.css` contains `:root[data-studio="default"]` and `--primary: 24 95% 53%;` (bare HSL, no `hsl(` wrapper)
    - `apps/staff-web/app/skins/hustle.css` contains `:root[data-studio="hustle"]`, a `/* TODO: replace with Hustle brand values` comment, and `--primary: 258 84% 56%;` (visibly distinct indigo, not orange)
    - hustle.css contains the combined `html.dark[data-studio="hustle"]` block (R-09)
    - No value in any of the three files is wrapped in `hsl(...)` (grep for `--primary: hsl(` returns zero) (R-02)
  </acceptance_criteria>
  <done>The skins/ directory exists with a typed config.ts registry, an orange default.css, and a visibly-distinct indigo hustle.css placeholder marked TODO. config.ts matches the contract plan 02 imports.</done>
</task>

<task type="auto">
  <name>Task 3: Scaffold studios/ env contract files (no loader)</name>
  <files>studios/default/env.yml, studios/hustle/env.yml</files>
  <read_first>
    - .planning/phases/R2-design-system-token-layer/R2-CONTEXT.md (D-08 — scaffold contract only, NO env.yml loader code)
    - .planning/phases/R2-design-system-token-layer/R2-RESEARCH.md (Section 7 — exact env.yml contents)
  </read_first>
  <action>
    Create two documentation-only YAML files at the repo root (NOT under apps/). These are a contract for the future P1a deploy script — there is NO loader, NO code reads them at runtime. The runtime mechanism is `process.env.GYMOS_STUDIO_SKIN` set in the Vercel dashboard.

    FILE 1 — `studios/default/env.yml`:
    ```yaml
    # studios/default/env.yml
    # Environment contract for the GymClassOS default studio deploy.
    # Set these variables in the Vercel dashboard (or via `vercel env add`).
    # This file is NOT loaded at runtime — it documents the contract for the
    # future P1a deploy script (deploy.sh <studio> will read it).

    GYMOS_STUDIO_SKIN: default
    ```

    FILE 2 — `studios/hustle/env.yml`:
    ```yaml
    # studios/hustle/env.yml
    # Environment contract for the Hustle studio deploy.
    # NOT loaded at runtime — documents the deploy contract only.

    GYMOS_STUDIO_SKIN: hustle
    # CUSTOMER_ALLOWED_EMAILS: coach@doyouhustle.co.uk,owner@doyouhustle.co.uk
    ```

    Do NOT write any TypeScript loader, parser, or import for these files. They are pure documentation.
  </action>
  <verify>
    <automated>grep -q "GYMOS_STUDIO_SKIN: default" studios/default/env.yml && grep -q "GYMOS_STUDIO_SKIN: hustle" studios/hustle/env.yml && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - `studios/default/env.yml` exists and contains `GYMOS_STUDIO_SKIN: default`
    - `studios/hustle/env.yml` exists and contains `GYMOS_STUDIO_SKIN: hustle`
    - Both files contain a comment stating they are NOT loaded at runtime
    - No `.ts`/`.js` loader file references `env.yml` (grep -r "env.yml" apps/staff-web returns zero code references)
  </acceptance_criteria>
  <done>The studios/ scaffold documents GYMOS_STUDIO_SKIN as a deploy contract for both default and hustle, with no loader code.</done>
</task>

</tasks>

<verification>
- `grep -rc "@theme inline" apps/staff-web` returns 0 (R-01 satisfied)
- The cascade order in global.css is: tailwindcss import → agent-native.css import → @source → GymClassOS @theme → :root → .dark → skin @imports (R-09, R-13)
- skins/config.ts, default.css, hustle.css all exist; hustle is visibly distinct (indigo vs orange) and TODO-marked
- studios/{default,hustle}/env.yml exist as contract docs with no loader
- `pnpm --filter staff-web typecheck` passes (config.ts is valid TypeScript) — run if available; if typecheck cannot run standalone, confirm config.ts has no syntax errors by reading it back
</verification>

<success_criteria>
DSGN-01 (token layer foundation): bare `@theme` with `--studio-*` tokens, no hardcoded hex introduced, no `@theme inline`. DSGN-03 (skins exist): default.css + hustle.css both present with `:root[data-studio=...]` overrides, switchable purely by the data-studio attribute. The skins/config.ts contract is ready for plan 02 to wire into the root loader.
</success_criteria>

<output>
After completion, create `.planning/phases/R2-design-system-token-layer/R2-01-token-layer-and-skins-SUMMARY.md`
</output>
