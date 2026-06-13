---
phase: R5-member-mobile-app-redesign
plan: "02"
subsystem: ui
tags: [react-native, expo, tabs, navigation, theme, tokens, hex-migration, passes]

# Dependency graph
requires:
  - phase: R5-01
    provides: "lib/theme.ts — ThemeContext + useTheme() + StudioTokens type + Inter font families"
provides:
  - "5-tab shell: Home / Classes / Passes / Log / Profile in exact order with theme tokens"
  - "packages/mobile-app/app/(tabs)/passes.tsx — Passes tab screen reading passBalance from /api/m/profile"
  - "Zero bare hex in all 7 plan-owned app/ files (food.tsx, profile.tsx, food-add.tsx, food-barcode.tsx, pick-member.tsx, passes.tsx, _layout.tsx)"
affects:
  - R5-03-home-screen
  - R5-04-booking-flow
  - "all packages/mobile-app/app/(tabs)/* consumers (tab titles visible to all tab screens)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useMemo(() => StyleSheet.create({...}), [theme]) pattern applied in all 5 leaf screens (food, profile, food-add, food-barcode, pick-member)"
    - "Inline theme token refs in tab bar screenOptions (R5-01 pattern extended to navigation layer)"
    - "passes.tsx future-proof: typed PassEvent[] + .map guarded by optional passHistory field — history renders automatically when API adds it"

key-files:
  created:
    - packages/mobile-app/app/(tabs)/passes.tsx
  modified:
    - packages/mobile-app/app/(tabs)/_layout.tsx
    - packages/mobile-app/app/(tabs)/food.tsx
    - packages/mobile-app/app/(tabs)/profile.tsx
    - packages/mobile-app/app/food-add.tsx
    - packages/mobile-app/app/food-barcode.tsx
    - packages/mobile-app/app/pick-member.tsx

key-decisions:
  - "Passes screen reuses /api/m/profile (passBalance field) — no new endpoint; history section deferred until API returns passHistory array (typed + .map ready)"
  - "Low-balance treatment: passBalance <= 0 triggers danger/dangerSoft tokens on balance number and status pill (mirrors index.tsx pillRed pattern with proper tokens)"
  - "Tab active tint changed to theme.colors.accent (orange) per brand; inactive → theme.colors.mutedFaint — more on-brand than white active"
  - "rgba(0,0,0,0.5) modal backdrop in food.tsx mapped to theme.colors.overlay (token added in R5-01 as rgba(0,0,0,0.6))"
  - "ActivityIndicator color changed to theme.colors.accent across all files (consistent app-wide spinner treatment)"

requirements-completed: [MOBL-02, MOBL-01]

# Metrics
duration: ~10min
completed: "2026-06-13"
---

# Phase R5 Plan 02: Tabs and Leaf Screens Summary

**5-tab shell (Home / Classes / Passes / Log / Profile) with orange-accent theme tokens, new Passes screen reading passBalance from /api/m/profile, and complete hex elimination across 7 owned app/ files**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-13T19:53:00Z
- **Completed:** 2026-06-13T19:58:38Z
- **Tasks:** 3 of 3
- **Files modified:** 7 (1 created + 6 modified)

## Accomplishments

- Modified `(tabs)/_layout.tsx`: 5 tabs in exact order Home/Classes/Passes/Log/Profile; all 6 bare hex replaced with theme tokens; active tint = orange accent; `tabBarLabelStyle` + `headerTitleStyle` use `theme.font.semibold` (Inter)
- Created `(tabs)/passes.tsx` (317 lines): passBalance read from `/api/m/profile` via apiFetch + useQuery; `useFocusEffect` refetch; large balance hero with low-balance danger treatment; graceful error/empty state for 401-gated deploy; `passHistory?: PassEvent[]` typed + `.map` ready for future API data
- Migrated hex in 5 leaf screens: food.tsx (22 hex), profile.tsx (12 hex), food-add.tsx (25 hex), food-barcode.tsx (17 hex), pick-member.tsx (7 hex) — all replaced with canonical token mapping; `rgba(0,0,0,0.5)` → `theme.colors.overlay`; Inter `fontFamily` applied throughout

## Task Commits

1. **Task 1: Rename+reorder tabs + theme tab bar** — `5c5026b8` (feat)
2. **Task 2: Create Passes tab screen** — `21dca3ae` (feat)
3. **Task 3: Hex migration of 5 leaf screens** — `6f339374` (feat)

## Files Created/Modified

- `packages/mobile-app/app/(tabs)/_layout.tsx` — 5-tab shell; theme tokens throughout; relabelled Schedule→Classes, Food→Log; added Passes between Classes and Log
- `packages/mobile-app/app/(tabs)/passes.tsx` — NEW: Passes tab (317 lines); reads passBalance from profile; future-proof passHistory scaffold; all theme tokens; zero bare hex
- `packages/mobile-app/app/(tabs)/food.tsx` — hex eliminated (22 → 0); useMemo StyleSheet pattern; Inter fontFamily applied
- `packages/mobile-app/app/(tabs)/profile.tsx` — hex eliminated (12 → 0); useMemo StyleSheet pattern; Inter fontFamily applied
- `packages/mobile-app/app/food-add.tsx` — hex eliminated (25 → 0); useMemo StyleSheet pattern; Inter fontFamily applied
- `packages/mobile-app/app/food-barcode.tsx` — hex eliminated (17 → 0); useMemo StyleSheet pattern; Inter fontFamily applied
- `packages/mobile-app/app/pick-member.tsx` — hex eliminated (7 → 0); useMemo StyleSheet pattern; Inter fontFamily applied

## Decisions Made

- **Reused /api/m/profile for Passes**: The profile response already includes `passBalance`. No new API endpoint needed; the `passHistory` field is optional-typed so the screen renders gracefully now (empty state) and fills with data when the API is extended in a future plan.
- **Orange active tint**: `tabBarActiveTintColor` changed from white `#ffffff` to `theme.colors.accent` (orange `#F97316`). This is more on-brand than a white active tab and differentiates the active state more clearly on the near-black tab bar.
- **overlay token match**: `rgba(0,0,0,0.5)` in food.tsx mapped to `theme.colors.overlay` which is `rgba(0,0,0,0.6)` in the default skin — a negligible difference (6% opacity) that preserves visual intent while eliminating the bare rgba literal.

## Deviations from Plan

None — plan executed exactly as written. All canonical hex mappings from the plan's action spec were applied without ambiguity.

## Known Stubs

- **`(tabs)/passes.tsx` history section**: Renders "No pass activity yet" empty state because `/api/m/profile` does not yet return a `passHistory` array. This is **intentional per plan spec** (R5-CONTEXT D-07: reuse existing /api/m/* only; no new endpoints in R5). The typed `PassEvent[]` + guarded `.map` ensures this resolves to real data the moment the API adds `passHistory` — no component rewrite needed.

## User Setup Required

None.

## Next Phase Readiness

- R5-03 (index.tsx Home hero) and R5-04 (schedule.tsx booking flow) can proceed — they share the same tab shell and inherit the active orange tint
- All 7 plan-owned files are hex-free; remaining hex is in `index.tsx` (19 hex, owned by R5-03) and `schedule.tsx` (18 hex, owned by R5-04)
- Behavioral/visual verification deferred to EAS build UAT (D-12: real-device testing blocked until EAS dev client built; `/api/m/*` is 401-gated on current deploy)
