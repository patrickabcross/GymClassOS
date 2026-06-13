---
phase: R2-design-system-token-layer
plan: 03
type: execute
wave: 4
depends_on: ["R2-01", "R2-02", "R2-04"]
files_modified:
  - scripts/guard-no-hardcoded-colors.mjs
  - package.json
  - .github/workflows/ci.yml
  - apps/staff-web/app/components/GoogleConnectBanner.tsx
  - apps/staff-web/app/components/email/EmailThread.tsx
  - apps/staff-web/app/components/email/IntegrationsSidebar.tsx
  - apps/staff-web/app/components/ui/chart.tsx
  - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
autonomous: true
requirements: [DSGN-01]
must_haves:
  truths:
    - "A CI grep guard fails the build if any hardcoded hex color or Tailwind arbitrary-color value appears in apps/staff-web app code outside skin files"
    - "Every remaining hex in apps/staff-web is either converted to a studio token or carries a // guard:allow-color marker with a reason"
    - "The guard is wired into pnpm guards (and thus pnpm prep) and into CI as an enforced job"
  artifacts:
    - path: "scripts/guard-no-hardcoded-colors.mjs"
      provides: "Recursive scan of apps/staff-web/{app,server,features} for hex + tw arbitrary colors, with skin + marker exemptions"
      contains: "guard:allow-color"
    - path: "package.json"
      provides: "guard:no-hardcoded-colors script wired into the guards chain"
      contains: "guard:no-hardcoded-colors"
    - path: ".github/workflows/ci.yml"
      provides: "CI job invoking the color guard"
      contains: "guards"
  key_links:
    - from: "package.json guards script"
      to: "scripts/guard-no-hardcoded-colors.mjs"
      via: "pnpm guard:no-hardcoded-colors appended to the && chain"
      pattern: "guard:no-hardcoded-colors"
    - from: ".github/workflows/ci.yml"
      to: "the guards chain"
      via: "a step running pnpm guards (or pnpm guard:no-hardcoded-colors)"
      pattern: "pnpm guards|guard:no-hardcoded-colors"
---

<objective>
Close DSGN-01's enforcement loop: write the `guard-no-hardcoded-colors.mjs` CI guard, neutralize the remaining hex footprint across `apps/staff-web` (convert to tokens where it makes sense; allowlist genuine third-party/technical colors with `// guard:allow-color` markers), wire the guard into `pnpm guards` + `prep` + CI.

This runs LAST (wave 4) because the guard cannot pass until every hex is either converted or marked — plan 02 removed the `root.tsx` theme-color hex and plan 04 (wave 3) finished the schedule-widget-ssr.ts font edits before this plan touches that file's color lines.

Purpose: Satisfies DSGN-01's "CI grep guard fails if any hardcoded hex appears in GymClassOS app code outside skin files."

Output: New guard script; modified `package.json` + `ci.yml`; `// guard:allow-color` markers / token conversions in the 5 hex-bearing files.
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
<!-- Existing guard pattern to emulate exactly. Read it before writing the new guard. -->
scripts/guard-no-whatsapp-in-staff-web.mjs is the template:
- `const ROOT = process.cwd();`
- `SKIP_DIRS = new Set(["node_modules",".react-router","dist","build",".vercel",".netlify",".cache",".turbo"])`
- recursive `walk(dir)` with readdirSync + statSync, readFileSync per source file
- push offenders, `process.exit(1)` if any, else `console.log("[guard] OK: ...")`

package.json wiring (verified, line numbers approximate):
- Each guard is its own script: `"guard:no-whatsapp-in-staff-web": "node scripts/guard-no-whatsapp-in-staff-web.mjs"`
- `"guards"` chains them with ` && `, ending in `... && pnpm guard:no-whatsapp-in-staff-web`
- `"prep"` runs `pnpm guards` via concurrently — adding to "guards" auto-wires prep.

CI: `.github/workflows/ci.yml` does NOT currently invoke `pnpm guards`. A new step/job must be added.

HEX INVENTORY (verified by grep — these are the ONLY hex-bearing files in apps/staff-web after plan 02 removes root.tsx's):
1. app/components/GoogleConnectBanner.tsx — Google brand SVG fills #4285F4 #34A853 #FBBC05 #EA4335 → allowlist (third-party brand)
2. app/components/email/EmailThread.tsx — iframe dark-mode injection hex (#17181a, #ffffff, #e4e4e7, #818cf8, #1a1a1a, #374151, #22c55e, #fff, #000) → allowlist (technical, email-content readability)
3. app/components/email/IntegrationsSidebar.tsx — #F8FF2C #FF7A59 #7121DB #5B0EFF integration brand fills → allowlist (third-party brand)
4. app/components/ui/chart.tsx — line 53 has hex INSIDE Tailwind attribute selectors like [stroke='#ccc'] and [stroke='#fff']. These are CSS attribute MATCHERS, not color values. The guard's tw-arbitrary-color regex (bg|text|border|... -[#...]) will NOT match them, but the bare-hex-literal regex WOULD. Handle via guard:allow-color on line 53.
5. features/forms/lib/schedule-widget-ssr.ts — inline embed CSS colors (#fff, #10b981 success green, #1f2937/#f9fafb dark, #991b1b error red) PLUS existing --gym-accent/--gym-radius var pattern. Convert where the existing var pattern applies; allowlist functional embed colors. (Google Fonts refs here are plan 04's job — do not touch the font lines.)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write guard-no-hardcoded-colors.mjs and wire it into guards + prep + CI</name>
  <files>scripts/guard-no-hardcoded-colors.mjs, package.json, .github/workflows/ci.yml</files>
  <read_first>
    - scripts/guard-no-whatsapp-in-staff-web.mjs (the exact pattern to emulate — sync walk, SKIP_DIRS, offenders, exit 1)
    - scripts/guard-no-drizzle-push.mjs (reference for the richer async variant if preferred)
    - package.json (the "guards" chain and "prep" script — add the new guard to the chain)
    - .github/workflows/ci.yml (find where to add a guards step/job)
    - .planning/phases/R2-design-system-token-layer/R2-RESEARCH.md (Section 5 — exact regexes + allowlist + wiring)
  </read_first>
  <action>
    Create `scripts/guard-no-hardcoded-colors.mjs` emulating guard-no-whatsapp-in-staff-web.mjs. Specification:

    - `const ROOT = process.cwd();`
    - Scan target roots: `apps/staff-web/app`, `apps/staff-web/server`, `apps/staff-web/features`.
    - `SOURCE_EXTS = new Set([".ts", ".tsx", ".css"])` (note: include .css so future inline CSS is caught, but the skins dir is exempt — see below).
    - `SKIP_DIRS` = the standard set (node_modules, .react-router, dist, build, .vercel, .netlify, .cache, .turbo).
    - EXEMPT path prefix: any file under `apps/staff-web/app/skins/` is skipped entirely (skin CSS contains intentional overrides).
    - Per-line scanning (read file, split on "\n", test each line):
      - Hex literal regex: `/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/`
      - Tailwind arbitrary-color regex: `/(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|caret|accent)-\[#[0-9a-fA-F]{3,8}\]/`
      - A line matches if EITHER regex hits.
    - EXEMPTION: if the line contains the marker `// guard:allow-color` OR `/* guard:allow-color`, skip it (do not flag).
    - Collect offenders as `{ file: relative(ROOT, full), line: <1-based>, snippet: <trimmed line> }`. If any, print them and `process.exit(1)`. Else `console.log("[guard] OK: no hardcoded colors in apps/staff-web (outside skins/)")`.
    - Do NOT flag `rgb(` / `rgba(` / `hsl(` / named colors — only hex literals + tw arbitrary hex. (The token system itself uses `hsl(var(...))`; a broader regex is false-positive-prone.)

    Then wire it:
    1. In package.json scripts, add `"guard:no-hardcoded-colors": "node scripts/guard-no-hardcoded-colors.mjs",` alongside the other guard entries.
    2. Append ` && pnpm guard:no-hardcoded-colors` to the end of the `"guards"` chain. (This auto-wires `prep` — no prep change needed.)
    3. In `.github/workflows/ci.yml`, add a guards step. Match the existing job/step style (same Node/pnpm setup as the other jobs). Add a step `- run: pnpm guards` to an existing lint/typecheck job, OR add a dedicated `guards:` job mirroring the structure of an existing job (checkout → setup pnpm/node → install → `pnpm guards`). Read ci.yml first and follow its exact conventions.

    Run `npx prettier --write scripts/guard-no-hardcoded-colors.mjs package.json`. NOTE: at this point the guard will FAIL because the 5 hex-bearing files are not yet marked — that is expected; Task 2 fixes them. Do not run the guard as a gate until Task 2 is done.
  </action>
  <verify>
    <automated>node -c scripts/guard-no-hardcoded-colors.mjs && grep -q "guard:no-hardcoded-colors" package.json && grep -q "guard:allow-color" scripts/guard-no-hardcoded-colors.mjs && grep -Eq "pnpm guards|guard:no-hardcoded-colors" .github/workflows/ci.yml && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - `node -c scripts/guard-no-hardcoded-colors.mjs` exits 0 (valid JS, no syntax error)
    - The script references `apps/staff-web/app`, `apps/staff-web/server`, `apps/staff-web/features` as scan roots and exempts `apps/staff-web/app/skins`
    - The script recognizes the `// guard:allow-color` marker as an exemption (grep `guard:allow-color` in the script)
    - package.json contains `"guard:no-hardcoded-colors": "node scripts/guard-no-hardcoded-colors.mjs"` AND the `"guards"` chain ends with (or includes) `pnpm guard:no-hardcoded-colors`
    - `.github/workflows/ci.yml` contains a step invoking `pnpm guards` (or `pnpm guard:no-hardcoded-colors`)
  </acceptance_criteria>
  <done>The color guard exists with the specified hex + tw-arbitrary regexes, skins exemption, and marker support; it is wired into the guards chain, prep, and CI.</done>
</task>

<task type="auto">
  <name>Task 2: Neutralize the remaining hex footprint (convert or allowlist) so the guard passes</name>
  <files>apps/staff-web/app/components/GoogleConnectBanner.tsx, apps/staff-web/app/components/email/EmailThread.tsx, apps/staff-web/app/components/email/IntegrationsSidebar.tsx, apps/staff-web/app/components/ui/chart.tsx, apps/staff-web/features/forms/lib/schedule-widget-ssr.ts</files>
  <read_first>
    - scripts/guard-no-hardcoded-colors.mjs (created in Task 1 — to know what the marker is and what it flags)
    - apps/staff-web/app/components/GoogleConnectBanner.tsx (around lines 937-949 — Google brand fills)
    - apps/staff-web/app/components/email/EmailThread.tsx (the iframe injection block ~lines 2187-2360)
    - apps/staff-web/app/components/email/IntegrationsSidebar.tsx (lines 87-174 — integration brand fills)
    - apps/staff-web/app/components/ui/chart.tsx (line 53 — hex inside [stroke='#ccc']/[stroke='#fff'] attribute selectors)
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts (inline CSS colors + existing --gym-accent var pattern; do NOT touch the Google Fonts lines — that's plan 04)
    - .planning/research/PITFALLS.md (R-02 bare HSL if converting to tokens)
  </read_first>
  <action>
    For each hex-bearing file, either CONVERT to a token or ADD a `// guard:allow-color — <reason>` marker on the offending line(s). Decisions (per R2-RESEARCH open questions, resolved here):

    1. `app/components/GoogleConnectBanner.tsx` (Google brand SVG fills #4285F4 #34A853 #FBBC05 #EA4335): ALLOWLIST. Add `// guard:allow-color — Google brand colors (non-negotiable, third-party SVG)` on each offending line (or one block comment line immediately above if the fills are on contiguous lines — the marker must be ON the same line as each hex per the guard's per-line check, so add it per-line).

    2. `app/components/email/IntegrationsSidebar.tsx` (#F8FF2C #FF7A59 #7121DB #5B0EFF integration brand fills): ALLOWLIST. Add `// guard:allow-color — third-party integration brand colors (MYÜTIK/HubSpot/etc)` per offending line.

    3. `app/components/email/EmailThread.tsx` (iframe dark-mode injection hex — #17181a #ffffff #e4e4e7 #818cf8 #1a1a1a #374151 #22c55e #fff #000): ALLOWLIST. These inject CSS into untrusted email HTML for readability; they are technical, not brand, and cannot use CSS vars. Add `// guard:allow-color — email iframe dark-mode injection (technical, not brand)` per offending line.

    4. `app/components/ui/chart.tsx` line 53 (hex inside Tailwind attribute selectors `[stroke='#ccc']`, `[stroke='#fff']`): ALLOWLIST. These are CSS attribute MATCHERS targeting recharts internals, not color values. Add `// guard:allow-color — recharts attribute selectors, not color values` on line 53 (this is a vendored shadcn chart primitive; do not restructure it).

    5. `features/forms/lib/schedule-widget-ssr.ts` (inline embed CSS colors): CONVERT the brand-ish ones to the existing CSS-var pattern already in this file where it cleanly applies (this file already injects `--gym-accent` / `--gym-radius` from sanitized URL params — extend that pattern: e.g. a success/accent color that should track the studio accent → `hsl(var(--studio-accent))` is NOT available in the iframe DOM, so use the file's existing `var(--gym-accent)` convention). For purely functional embed colors that have no token equivalent (error red #991b1b, success green #10b981, neutral dark #1f2937/#f9fafb, white #fff), ALLOWLIST with `// guard:allow-color — embed widget functional status colors`. Use judgment: prefer the existing `var(--gym-*)` pattern for anything accent-related; allowlist the rest. DO NOT touch the `fonts.googleapis.com` lines (231/233) — plan 04 owns those.

    After edits, RUN THE GUARD and confirm it exits 0:
    `node scripts/guard-no-hardcoded-colors.mjs`

    Run `npx prettier --write` on every .ts/.tsx file you edited (prettier may not format the .mjs — already done in Task 1).
  </action>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs; echo "exit=$?"</automated>
  </verify>
  <acceptance_criteria>
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0 (the only success condition that matters)
    - Every offending line in GoogleConnectBanner.tsx, IntegrationsSidebar.tsx, EmailThread.tsx, and chart.tsx:53 carries a `// guard:allow-color` marker with a reason
    - schedule-widget-ssr.ts: accent-related inline colors use the existing `var(--gym-*)` pattern; remaining functional colors carry `// guard:allow-color` markers
    - No `fonts.googleapis.com` line in schedule-widget-ssr.ts was modified (plan 04 owns fonts)
    - No hex was introduced into any new file; the skins/*.css overrides remain the only place brand hex (in HSL form) legitimately lives
  </acceptance_criteria>
  <done>The color guard passes (exit 0). Every remaining hex in apps/staff-web is converted to a token or carries a justified guard:allow-color marker. DSGN-01 enforcement is live.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0
- `pnpm guards` runs the new guard as part of the chain and passes (run if the workspace allows; otherwise run the guard directly)
- CI workflow invokes the guards chain
- The guard correctly EXEMPTS apps/staff-web/app/skins/*.css (confirm by temporarily noting a skin file has hex-in-HSL — it should not be flagged because skins are skipped entirely)
- DEPLOY-BASED proof is not required for this plan (static/CI verification only)
</verification>

<success_criteria>
DSGN-01 fully satisfied: a CI grep guard fails the build on any hardcoded hex / Tailwind arbitrary-color in `apps/staff-web/{app,server,features}` outside skin files, the guard is wired into `pnpm guards` + `prep` + CI, and the existing hex footprint is fully neutralized so the guard passes green.
</success_criteria>

<output>
After completion, create `.planning/phases/R2-design-system-token-layer/R2-03-hex-conversion-and-ci-guard-SUMMARY.md`
</output>
