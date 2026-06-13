---
phase: R5-member-mobile-app-redesign
plan: "01"
subsystem: ui
tags: [react-native, expo, theme, tokens, fonts, inter, dark-mode, context]

# Dependency graph
requires:
  - phase: R2-design-system-token-layer
    provides: "Brand token semantics: orange #F97316 accent, radius scale, default+Hustle skin pattern"
provides:
  - "packages/mobile-app/lib/theme.ts — ThemeContext + useTheme() + StudioTokens type + default + Hustle skins + EXPO_PUBLIC_STUDIO_SKIN resolution"
  - "Inter-Regular/SemiBold/Bold OTF assets in packages/mobile-app/assets/fonts/"
  - "useFonts Inter render-gate in app/_layout.tsx (fonts block render until loaded)"
  - "ThemeProvider wrapping root layout (all screens inherit theme context)"
  - "zero bare hex in app/_layout.tsx"
affects:
  - R5-02-tab-navigation
  - R5-03-home-screen
  - R5-04-booking-flow
  - "all packages/mobile-app/app/** files (they all call useTheme())"

# Tech tracking
tech-stack:
  added:
    - "expo-font ~55.0.0 (useFonts hook — Expo Go compatible)"
    - "Inter OTF v4.1 from github.com/rsms/inter (Regular/SemiBold/Bold, OTTO/CFF signature verified)"
  patterns:
    - "ThemeContext: hand-rolled (~60 lines) — NOT unistyles (Expo Go incompatible) / NOT NativeWind"
    - "Inline style objects in component body for theme-derived styles (StyleSheet.create runs at module load, cannot read context)"
    - "useMemo-derived StyleSheet pattern documented in theme.ts header comment"
    - "EXPO_PUBLIC_STUDIO_SKIN env var resolved at module load for EAS build-time skin selection"
    - "ThemeProvider (outermost) wraps everything; ThemedRoot inside applies useFonts gate"

key-files:
  created:
    - packages/mobile-app/lib/theme.ts
    - packages/mobile-app/assets/fonts/Inter-Regular.otf
    - packages/mobile-app/assets/fonts/Inter-SemiBold.otf
    - packages/mobile-app/assets/fonts/Inter-Bold.otf
  modified:
    - packages/mobile-app/app/_layout.tsx
    - packages/mobile-app/package.json

key-decisions:
  - "Used inline style objects (not StyleSheet.create) for FAB in _layout.tsx because StyleSheet.create runs at module load time and cannot read context values — documented pattern for all downstream R5 plans"
  - "Shadow token (theme.colors.shadow = #000000) added to StudioTokens so _layout.tsx has zero bare hex; shadow black is universal across skins"
  - "ThemeProvider is outermost; ThemedRoot is inner component that can call useTheme() for the font-load gate and Stack screenOptions"
  - "Hustle skin uses placeholder magenta #E11D48 accent (visibly distinct from orange default) with explicit TODO comments pending Hustle brand confirmation"
  - "Inter OTF v4.1 downloaded from github.com/rsms/inter — extras/otf directory; OTTO/CFF magic bytes verified"

patterns-established:
  - "useTheme() returns StudioTokens directly; consumers build styles in component body"
  - "Inline style object OR useMemo(() => StyleSheet.create({ ... }), [theme]) — both valid; inline preferred for simplicity"
  - "theme.ts is the ONLY file permitted to contain hex literals in packages/mobile-app"
  - "EXPO_PUBLIC_STUDIO_SKIN=hustle selects the Hustle placeholder skin at EAS build time"

requirements-completed: [MOBL-01, MOBL-03, MOBL-07]

# Metrics
duration: 12min
completed: "2026-06-13"
---

# Phase R5 Plan 01: Theme Foundation Summary

**Dark-first ThemeContext with orange #F97316 accent + useFonts Inter OTF render-gate, replacing all 8 hardcoded hex in _layout.tsx with typed StudioTokens via hand-rolled ThemeProvider**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-13T19:49:09Z
- **Completed:** 2026-06-13T19:52:07Z
- **Tasks:** 3 of 3
- **Files modified:** 5 (3 OTF assets + theme.ts + _layout.tsx + package.json)

## Accomplishments

- Created `lib/theme.ts` (~183 lines): StudioTokens type, dark-first default skin (near-black `#0A0A0B` bg, orange `#F97316` accent), Hustle placeholder skin (magenta `#E11D48`), EXPO_PUBLIC_STUDIO_SKIN resolution, ThemeContext, ThemeProvider, useTheme
- Downloaded and placed real Inter OTF v4.1 files (OTTO/CFF signature verified) in `assets/fonts/`; added `expo-font ~55.0.0` dependency
- Rewrote `_layout.tsx`: outer RootLayout wraps `<ThemeProvider>`, inner ThemedRoot gates on useFonts, all 8 bare hex replaced with theme token references — zero hex remains

## Task Commits

1. **Task 1: Add Inter OTF assets + expo-font dependency** - `9c1bbd84` (chore)
2. **Task 2: Create lib/theme.ts** - `fd7d6f73` (feat)
3. **Task 3: Wire ThemeProvider + useFonts into _layout.tsx** - `89bfb2e0` (feat)

## Files Created/Modified

- `packages/mobile-app/lib/theme.ts` — StudioTokens type, default + Hustle skins, ThemeContext/Provider/useTheme, EXPO_PUBLIC_STUDIO_SKIN skin registry
- `packages/mobile-app/app/_layout.tsx` — ThemeProvider root wrap, useFonts Inter gate, all hex → theme token refs, inline FAB styles
- `packages/mobile-app/assets/fonts/Inter-Regular.otf` — Inter v4.1 Regular OTF (609 KB, OTTO signature)
- `packages/mobile-app/assets/fonts/Inter-SemiBold.otf` — Inter v4.1 SemiBold OTF (629 KB, OTTO signature)
- `packages/mobile-app/assets/fonts/Inter-Bold.otf` — Inter v4.1 Bold OTF (631 KB, OTTO signature)
- `packages/mobile-app/package.json` — added `expo-font: ~55.0.0`

## Decisions Made

- **Shadow token added**: `theme.colors.shadow = "#000000"` added to StudioTokens so the FAB `shadowColor` has a token reference and `_layout.tsx` stays hex-free. Shadow black is a universal constant across all skins (no overrides in hustleSkin needed).
- **Inline FAB styles**: FAB styles moved from `StyleSheet.create` (module-level, context-unreadable) to an inline object built inside AgentFabAndSheet (component body, theme accessible). This is the canonical pattern documented in `theme.ts` for all downstream R5 plans.
- **Two-component structure**: `RootLayout` (ThemeProvider shell) → `ThemedRoot` (useFonts gate + rest of tree). This is required because `useFonts` and `useTheme` both need to run inside their respective providers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `shadow` token to StudioTokens**
- **Found during:** Task 3 (wiring _layout.tsx)
- **Issue:** `shadowColor: "#000"` in the FAB would be a bare hex in _layout.tsx; no shadow token existed in the plan's StudioTokens interface
- **Fix:** Added `shadow: string` to StudioTokens type and `shadow: "#000000"` to defaultSkin (inherited by hustleSkin via spread). Referenced as `theme.colors.shadow` in FAB styles.
- **Files modified:** packages/mobile-app/lib/theme.ts, packages/mobile-app/app/_layout.tsx
- **Committed in:** fd7d6f73 (Task 2) and 89bfb2e0 (Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing token for correctness of hex-elimination constraint)
**Impact on plan:** Necessary addition; extends the StudioTokens shape minimally. All downstream consumers inherit `theme.colors.shadow` without any breaking change.

## Known Stubs

- **`packages/mobile-app/lib/theme.ts` lines 148–151** — Hustle skin accent/hover/soft/foreground values are placeholder hex (`#E11D48` family, marked `/* TODO: replace with Hustle brand values */`). These are **intentional per plan spec** (R2 open dependency: Hustle brand hex not yet received). The Hustle skin is visually distinct from default so skin-switching is provable. These values will be replaced when Hustle confirms brand hex.

## Issues Encountered

None — all tasks executed cleanly. Inter OTF downloaded successfully from github.com/rsms/inter v4.1 release.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- R5-02 (tab navigation), R5-03 (Home screen), R5-04 (booking flow) can all proceed — they import `{ useTheme }` from `../lib/theme` and build styles in component bodies
- Pattern for hex elimination established: all component files must use `const theme = useTheme()` and reference `theme.colors.*` / `theme.font.*` / `theme.radius.*` / `theme.spacing.*` — no bare hex strings
- Behavioral/visual verification deferred to EAS build UAT (D-12: real-device testing blocked until EAS dev client exists; `/api/m/*` is 401-gated on current deploy)

---
*Phase: R5-member-mobile-app-redesign*
*Completed: 2026-06-13*
