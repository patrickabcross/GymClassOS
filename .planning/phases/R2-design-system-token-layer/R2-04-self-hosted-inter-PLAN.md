---
phase: R2-design-system-token-layer
plan: 04
type: execute
wave: 3
depends_on: ["R2-01", "R2-02"]
files_modified:
  - apps/staff-web/public/fonts/inter-variable.woff2
  - apps/staff-web/app/global.css
  - apps/staff-web/app/root.tsx
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
  - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
  - apps/staff-web/features/marketing/lib/marketing-ssr.ts
autonomous: true
requirements: [DSGN-04]
must_haves:
  truths:
    - "Inter is served from the same origin via a self-hosted variable woff2 — no fonts.googleapis.com request on any staff-web or embed/marketing page"
    - "global.css declares an @font-face for Inter pointing at /fonts/inter-variable.woff2 instead of the Google Fonts @import"
    - "All three SSR pages (public form, schedule widget, marketing) embed the same self-hosted @font-face and drop their Google Fonts preconnect/link tags"
  artifacts:
    - path: "apps/staff-web/public/fonts/inter-variable.woff2"
      provides: "Self-hosted Inter variable font binary"
    - path: "apps/staff-web/app/global.css"
      provides: "@font-face Inter from /fonts/inter-variable.woff2 (replaces Google Fonts @import)"
      contains: "@font-face"
  key_links:
    - from: "apps/staff-web/app/global.css"
      to: "/fonts/inter-variable.woff2"
      via: "@font-face src url"
      pattern: "/fonts/inter-variable.woff2"
    - from: "apps/staff-web/app/root.tsx <head>"
      to: "/fonts/inter-variable.woff2"
      via: "<link rel=preload as=font>"
      pattern: "rel=\"preload\""
---

<objective>
Self-host Inter. Download the Inter variable woff2 into `public/fonts/`, replace the Google Fonts `@import` in `global.css` with an `@font-face`, add a `<link rel="preload">` in `root.tsx`, and replace the Google Fonts `preconnect`/`<link>` tags in all three SSR pages with the same inline `@font-face`. After this, no page load (staff web, embeds, or marketing) requests `fonts.googleapis.com`.

Purpose: Satisfies DSGN-04 (Inter self-hosted — no `fonts.googleapis.com` on any page load).

This plan is independent of the token work (touches the font line + SSR font tags, not the color tokens) and runs in wave 3 (after plan 01 lands the token global.css edits and plan 02 lands the root.tsx loader) so the shared `global.css` and `root.tsx` edits serialize cleanly on DISJOINT lines (font line 1 + head preload only). schedule-widget-ssr.ts font tags land here; plan 03 (wave 4) edits its color lines afterward.

Output: New font binary; modified `global.css` (font), `root.tsx` (preload link), and 3 SSR files (font tags).
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

<interfaces>
<!-- Verified current state of the font references. Replace EXACTLY these, touch nothing else. -->
- global.css line 1: `@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap");`
  global.css body CSS (~line 73): `font-family: "Inter", sans-serif;` — leave UNCHANGED (the @font-face makes it resolve to the self-hosted font).
- root.tsx <head>: add the preload link BEFORE `<Links />` (line ~80). Do NOT touch the loader or data-studio (plan 02 owns those; this plan only adds a <link> in <head>).
- public-form-ssr.ts: Google Fonts at lines 298 (preconnect), 300 (link), and 577 (a second link in notFoundPage()). There is an existing `<style>` block opening ~line 302.
- schedule-widget-ssr.ts: Google Fonts at lines 231 (preconnect), 233 (link). Existing `<style>` block ~line 234+. (Plan 03 also edits this file for inline COLORS — different lines. Coordinate: this plan touches only the font lines 231/233; plan 03 touches the color lines. wave 3 (plan 04) lands before wave 4 (plan 03), so plan 04 edits the font lines first.)
- marketing-ssr.ts: Google Fonts at lines 103 (preconnect), 105 (link). Existing `<style>` block follows.

The public/ dir is served at domain root by RR v7/Vite → /fonts/inter-variable.woff2 resolves on Vercel. The embed iframes are same-origin, so no CORS needed.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Download Inter variable woff2 into public/fonts/ and self-host in global.css + root.tsx</name>
  <files>apps/staff-web/public/fonts/inter-variable.woff2, apps/staff-web/app/global.css, apps/staff-web/app/root.tsx</files>
  <read_first>
    - apps/staff-web/app/global.css (line 1 Google Fonts @import; body font-family ~line 73)
    - apps/staff-web/app/root.tsx (the <head> in Layout(); add preload before <Links />)
    - .planning/phases/R2-design-system-token-layer/R2-RESEARCH.md (Section 4, Steps 1-3 — exact @font-face + preload markup)
  </read_first>
  <action>
    1. Create the directory `apps/staff-web/public/fonts/` and download the Inter variable woff2 into it as `inter-variable.woff2`. Use a stable source — the rsms/inter release variable font. Download with curl (verify it is a non-trivial binary, >50KB):
    ```
    curl -L -o apps/staff-web/public/fonts/inter-variable.woff2 \
      "https://github.com/rsms/inter/raw/v4.1/docs/font-files/InterVariable.woff2"
    ```
    If that exact URL 404s, fall back to Google Webfonts Helper's Inter variable woff2 (gwfh.mranftl.com) or any rsms/inter release asset. Verify: `stat -c %s apps/staff-web/public/fonts/inter-variable.woff2` (or `wc -c <file>`) returns > 50000. The file MUST be a real woff2 binary, not an HTML error page — check the first bytes are the woff2 signature `wOF2` (`head -c 4` shows `wOF2`).

    2. In `global.css`, DELETE line 1 (the `@import url("https://fonts.googleapis.com/...")`) and replace it with an `@font-face` block at the very top of the file (above `@import "tailwindcss";`):
    ```css
    /* Self-hosted Inter variable font — replaces Google Fonts CDN (DSGN-04) */
    @font-face {
      font-family: "Inter";
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url("/fonts/inter-variable.woff2") format("woff2-variations");
    }
    ```
    Leave the `body { font-family: "Inter", sans-serif; }` rule unchanged.

    3. In `root.tsx`, inside the `Layout()` `<head>`, add a preload link BEFORE the `<Links />` element:
    ```tsx
    <link
      rel="preload"
      as="font"
      type="font/woff2"
      crossOrigin="anonymous"
      href="/fonts/inter-variable.woff2"
    />
    ```
    Do NOT modify the root loader, data-studio attribute, or theme-color meta — those belong to plan 02. Only add this one `<link>` in `<head>`.

    Run `npx prettier --write apps/staff-web/app/global.css apps/staff-web/app/root.tsx`.
  </action>
  <verify>
    <automated>test "$(head -c 4 apps/staff-web/public/fonts/inter-variable.woff2)" = "wOF2" && [ "$(wc -c < apps/staff-web/public/fonts/inter-variable.woff2)" -gt 50000 ] && grep -q "@font-face" apps/staff-web/app/global.css && grep -q "/fonts/inter-variable.woff2" apps/staff-web/app/global.css && ! grep -q "fonts.googleapis.com" apps/staff-web/app/global.css && grep -q 'rel="preload"' apps/staff-web/app/root.tsx && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/public/fonts/inter-variable.woff2` exists, starts with the bytes `wOF2`, and is > 50000 bytes
    - global.css line 1 no longer contains `fonts.googleapis.com` (`grep -c "fonts.googleapis.com" apps/staff-web/app/global.css` returns 0)
    - global.css contains an `@font-face` with `src: url("/fonts/inter-variable.woff2") format("woff2-variations")`
    - global.css still has `font-family: "Inter", sans-serif;` in body (unchanged)
    - root.tsx `<head>` contains `<link rel="preload" as="font" ... href="/fonts/inter-variable.woff2" />` before `<Links />`
    - root.tsx loader / data-studio / theme-color were NOT modified by this plan
  </acceptance_criteria>
  <done>Inter is self-hosted: the woff2 is committed in public/fonts/, global.css declares the @font-face (no Google import), and root.tsx preloads it. The staff-web app no longer requests fonts.googleapis.com.</done>
</task>

<task type="auto">
  <name>Task 2: Replace Google Fonts tags in all three SSR pages with the self-hosted @font-face</name>
  <files>apps/staff-web/features/forms/lib/public-form-ssr.ts, apps/staff-web/features/forms/lib/schedule-widget-ssr.ts, apps/staff-web/features/marketing/lib/marketing-ssr.ts</files>
  <read_first>
    - apps/staff-web/features/forms/lib/public-form-ssr.ts (lines ~290-310 and ~570-580 — two Google Fonts blocks)
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts (lines ~225-240 — font lines 231/233; existing <style> block)
    - apps/staff-web/features/marketing/lib/marketing-ssr.ts (lines ~97-115 — font lines 103/105)
    - .planning/phases/R2-design-system-token-layer/R2-RESEARCH.md (Section 4, Step 4 — exact per-file replacements + why same-origin works for iframes)
  </read_first>
  <action>
    In each of the three SSR files, REMOVE the Google Fonts `preconnect` + stylesheet `<link>` tags and ADD the self-hosted `@font-face` into the page's existing inline `<style>` block. The replacement `@font-face` (identical across all pages):
    ```css
    @font-face {
      font-family: "Inter";
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url("/fonts/inter-variable.woff2") format("woff2-variations");
    }
    ```
    (Same-origin works because the embed iframes and marketing pages are served from the same Vercel deploy as `/fonts/inter-variable.woff2` — no CORS needed.)

    Specific edits:
    1. `public-form-ssr.ts`:
       - Remove the `preconnect` line (~298), the `preconnect crossorigin` line if present, and the Google Fonts `<link href="https://fonts.googleapis.com/...">` (~300). Insert the `@font-face` at the TOP of the existing `<style>` block (~line 302).
       - In `notFoundPage()` (~line 577), replace the Google Fonts `<link>` with the same inline `@font-face` (wrap in a `<style>` if there is no existing style block in that function).
    2. `schedule-widget-ssr.ts`:
       - Remove the font lines 231 + 233 (preconnect + link). Insert the `@font-face` at the top of the existing `<style>` block (~234+). DO NOT modify any color/inline-CSS lines — those belong to plan 03.
    3. `marketing-ssr.ts`:
       - Remove the font lines 103 + 105. Insert the `@font-face` at the top of the existing `<style>` block.

    Run `npx prettier --write` on all three files.
  </action>
  <verify>
    <automated>! grep -rq "fonts.googleapis.com" apps/staff-web/features && grep -lq "woff2-variations" apps/staff-web/features/forms/lib/public-form-ssr.ts && grep -lq "woff2-variations" apps/staff-web/features/forms/lib/schedule-widget-ssr.ts && grep -lq "woff2-variations" apps/staff-web/features/marketing/lib/marketing-ssr.ts && echo PASS</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rc "fonts.googleapis.com" apps/staff-web/features` returns 0 across all files
    - Each of the three SSR files contains `src: url("/fonts/inter-variable.woff2") format("woff2-variations")` inside an inline `<style>`/`@font-face`
    - `public-form-ssr.ts` notFoundPage() no longer references Google Fonts
    - schedule-widget-ssr.ts color/inline-CSS lines were NOT modified (only the font lines 231/233 removed) — plan 03 owns the color edits
  </acceptance_criteria>
  <done>All three SSR pages serve Inter from /fonts/inter-variable.woff2 via inline @font-face; none reference fonts.googleapis.com. DSGN-04 holds across staff-web AND embeds/marketing.</done>
</task>

</tasks>

<verification>
- `grep -r "fonts.googleapis.com" apps/staff-web` returns ZERO results (global.css + all 3 SSR files + root.tsx clean)
- The woff2 binary exists in public/fonts/ with the wOF2 signature
- DEPLOY-BASED PROOF (no local dev server): after Vercel deploy, open Chrome DevTools → Network → filter "fonts.googleapis.com" on /gymos, /gymos/schedule, an /embed/schedule page, a public form /f/<slug>, and the marketing page / — ZERO requests to fonts.googleapis.com on any of them; /fonts/inter-variable.woff2 loads 200 same-origin. Optionally re-run scripts/ui-baseline/capture.mjs for after-state captures.
</verification>

<success_criteria>
DSGN-04 satisfied: Inter is served same-origin from a self-hosted variable woff2; no `fonts.googleapis.com` request appears on any staff-web, embed, or marketing page load.
</success_criteria>

<output>
After completion, create `.planning/phases/R2-design-system-token-layer/R2-04-self-hosted-inter-SUMMARY.md`
</output>
