# Phase R2: Design System Token Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** R2-design-system-token-layer
**Areas discussed:** GymClassOS default brand identity, Skin anatomy & config shape, Hex-conversion scope & CI guard, Studio identity placement

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| GymClassOS default brand identity | Accent, palette personality, radius, logo for the default skin | ✓ |
| Skin anatomy & config shape | What a skin contains beyond CSS; tokens package now vs R5 | ✓ |
| Hex-conversion scope & CI guard boundary | How aggressive the conversion pass; what the guard scans | ✓ |
| Studio identity placement (DSGN-05) | Sidebar vs top-nav for studio name + logo | ✓ |

**User's choice:** All four.

---

## GymClassOS default brand identity

### Palette personality

| Option | Description | Selected |
|--------|-------------|----------|
| Energetic accent on light neutral | Light base + athletic accent for CTAs/active/pills | ✓ |
| Bold dark-anchored brand | Dark charcoal surfaces + bright accent | |
| Calm wellness palette | Sage/teal/sand wellness tones | |
| Stay neutral grayscale | Keep monochrome shadcn; skins provide all color | |

**User's choice:** Energetic accent on light neutral.

### Accent color family

| Option | Description | Selected |
|--------|-------------|----------|
| Punchy orange | #F97316 / #EA580C, white-on-accent buttons | ✓ |
| Electric lime/green | #84CC16; white-on-accent fails WCAG | |
| Hot coral/red | #F43F5E; collides with destructive red | |
| Deep teal/petrol | #0D9488; premium, less athletic | |

**User's choice:** Punchy orange (#F97316 base, #EA580C hover, #FFF7ED tint).

### Radius personality

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 0.5rem, soft-modern | Matches shadcn defaults, no rework | ✓ |
| Rounder, friendlier (0.75–1rem) | More consumer-app feel | |
| Sharper, performance-coded (0.25rem) | Pro-tool dashboard aesthetic | |

**User's choice:** Keep 0.5rem.

### Logo

| Option | Description | Selected |
|--------|-------------|----------|
| Wordmark only for now | Styled "GymClassOS" text; logo slot accepts image for studios | ✓ |
| Create a simple SVG mark in R2 | Design a geometric logo this phase | |
| I have a logo asset | Wire in an existing asset | |

**User's choice:** Wordmark only.

---

## Skin anatomy & config shape

### Skin structure

| Option | Description | Selected |
|--------|-------------|----------|
| CSS file + TS config module per skin | skins/<name>.css + skins/config.ts registry; injector reads env, inlines CSS, sets data-studio | ✓ |
| Single TS module generates everything | One TS object → CSS generated at build; same object feeds mobile | |
| CSS only + env vars for name/logo | Pure CSS skins; name/logo from separate env vars | |

**User's choice:** CSS file + TS config module per skin.

### Shared tokens package timing

| Option | Description | Selected |
|--------|-------------|----------|
| Staff-web-local now; extract in R5 | Keep in apps/staff-web/app/skins/; R5 extracts when mobile needs it | ✓ |
| Create packages/gymos-tokens in R2 | Build the shared package now per STACK.md | |
| You decide at plan time | Defer to planner | |

**User's choice:** Staff-web-local now; extract in R5.

### Token vocabulary

| Option | Description | Selected |
|--------|-------------|----------|
| Existing shadcn set + studio accent | Override shadcn vars + new --studio-accent / --studio-accent-soft | ✓ |
| Full semantic token system | Complete surface/brand/success/warning/capacity layer | |
| Minimal: accent + radius + logo only | Studios change only accent, radius, logo | |

**User's choice:** Existing shadcn set + studio accent.

### Env wiring (studios/<studio>/env.yml)

| Option | Description | Selected |
|--------|-------------|----------|
| Env var only; scaffold studios/ dir | Read GYMOS_STUDIO_SKIN; commit minimal env.yml scaffolds as contract | ✓ |
| Env var only, no studios/ scaffold | Just read the var; leave env.yml to master deploy workstream | |
| Build the full env.yml loader | Implement env.yml reading in R2 | |

**User's choice:** Env var only; scaffold studios/ dir.

### Dark mode handling

| Option | Description | Selected |
|--------|-------------|----------|
| Leave dark CSS; order skins after it | Don't touch toggle; declare skin overrides after .dark (R-09) | ✓ |
| Remove dark mode in R2 | Strip .dark, next-themes, ThemeToggle now | |
| You decide at plan time | Defer to planner | |

**User's choice:** Leave dark CSS; order skins after it.

---

## Hex-conversion scope & CI guard

### Conversion reach

| Option | Description | Selected |
|--------|-------------|----------|
| All of apps/staff-web incl. embeds | gymos + legacy email + embed/marketing SSR | ✓ |
| Gymos + embeds; skip legacy email | Exempt legacy paths slated for R3 retirement | |
| Gymos surfaces only; embeds wait for R4 | Smallest R2; embeds convert in R4 | |

**User's choice:** All of apps/staff-web incl. embeds.

### Guard rules

| Option | Description | Selected |
|--------|-------------|----------|
| Hex + Tailwind arbitrary colors | #hex in CSS/TS/TSX + bg-[#…]/text-[#…]; skin files + marker comment exempt | ✓ |
| Hex literals only | Matches DSGN-01 text exactly; arbitrary values slip through | |
| All color forms (hex, rgb, hsl, named) | Strictest; conflicts with hsl(var()) token base | |

**User's choice:** Hex + Tailwind arbitrary colors.

### Embed font self-hosting

| Option | Description | Selected |
|--------|-------------|----------|
| Self-host font for staff-web + embeds | Replace Google Fonts in global.css AND all SSR pages | ✓ |
| Staff-web only; embeds in R4 | Self-host global.css only; embeds keep @import | |

**User's choice:** Self-host font for staff-web + embeds.

---

## Studio identity placement (DSGN-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Put name+logo in existing GymosTopNav | Replace hardcoded "GymClassOS" span with skin-sourced identity | ✓ |
| Introduce a sidebar in R2 | Build the literal sidebar DSGN-05 describes | |
| Both top-nav now + note sidebar for R4 | Top-nav now, explicit deferral note | (folded into chosen option) |

**User's choice:** Put name+logo in existing GymosTopNav (with the wording-vs-implementation deferral note captured in CONTEXT D-14).

### Skin config data flow

| Option | Description | Selected |
|--------|-------------|----------|
| Root loader → useRouteLoaderData | Root loader resolves skin from env; components read via loader data | ✓ |
| application_state table | Store active skin in framework state | |
| You decide at plan time | Defer to planner | |

**User's choice:** Root loader → useRouteLoaderData.

---

## Claude's Discretion

- Exact HSL token values within the orange accent family and the full default-skin value set.
- Inter self-hosting mechanism (manual woff2 vs vite-plugin-webfont-dl).
- Hustle placeholder palette values (marked TODO).
- Guard regex implementation + allowlist contents.
- Wordmark markup approach.

## Deferred Ideas

- GymClassOS SVG logo mark (post-milestone / R4 polish).
- packages/gymos-tokens shared package (R5).
- Removing dark mode / ThemeToggle (R4, SWEB-06).
- Real left sidebar (R4).
- studios/<studio>/env.yml deploy loader (master P1a).
- Full semantic token system (R4 if needed).
