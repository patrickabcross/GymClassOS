---
phase: R5-member-mobile-app-redesign
verified: 2026-06-13T20:16:13Z
status: human_needed
score: 7/7 must-haves verified (code level)
human_verification:
  - test: "App opens in high-contrast dark theme (near-black #0A0A0B background, orange #F97316 accent CTA)"
    expected: "Dark surfaces, orange accent buttons/tabs, no light background flash"
    why_human: "Visual rendering cannot be verified without an EAS dev/preview build; App Store Expo Go is SDK 56, app is SDK 55 — real-device UAT blocked (D-12)"
  - test: "Inter font renders on all screens (Home, Classes, Passes, Log, Profile)"
    expected: "All text uses Inter-Regular, Inter-SemiBold, or Inter-Bold; no system fallback font visible"
    why_human: "Font rendering requires running the app on a device or emulator; useFonts loads at runtime"
  - test: "Tab bar shows Home / Classes / Passes / Log / Profile in that order with orange active tint"
    expected: "Five tabs with exact labels; active tab icon/label is orange (#F97316); inactive is muted gray"
    why_human: "Tab bar rendering and active-state color require a running Expo app"
  - test: "Passes tab displays pass balance from /api/m/profile"
    expected: "'X credits' rendered prominently; low-balance danger color when X <= 0; graceful empty state on 401"
    why_human: "/api/m/* is 401-gated on the current deploy (D-12); requires an EAS build with a working API"
  - test: "Home hero shows three prominent cards: Pass Balance, Next class, From your coach"
    expected: "All three cards are visually prominent; coach message card shows friendly empty state when no data; nutrition card below"
    why_human: "Card layout and prominence hierarchy require visual inspection on a device"
  - test: "Booking flow completes in three steps: select (expand) -> confirm (pass/drop-in choice) -> done (booked badge)"
    expected: "Expanding a class card is step 1; confirm area shows 'Use 1 pass' + 'Pay drop-in' when credits > 0; booked badge appears after selection"
    why_human: "Booking flow interactivity and /api/m/bookings POST require a running app + live API"
  - test: "Persistent pass-balance pill stays visible on the Classes screen while scrolling and during booking"
    expected: "Pill with credit count appears above the class list and does not scroll away; updates after a booking"
    why_human: "Scroll behavior and live mutation updates require a running app"
  - test: "EXPO_PUBLIC_STUDIO_SKIN=hustle switches to the magenta placeholder skin"
    expected: "Accent buttons and active tabs change from orange to magenta (#E11D48); all other tokens unchanged"
    why_human: "Skin switching requires an EAS build with the env var set at build time"
  - test: "KcalRing progress arcs render in orange (theme.colors.accent) not blue"
    expected: "The calorie ring on the Home screen shows orange arcs instead of the old #3b82f6 blue"
    why_human: "SVG arc color requires visual inspection on a device"
---

# Phase R5: Member Mobile App Redesign — Verification Report

**Phase Goal:** The Expo member app is aligned to the GymClassOS design language with a dark-first theme, renamed tabs, and a token file replacing all hardcoded hex values.
**Verified:** 2026-06-13T20:16:13Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `packages/mobile-app/lib/theme.ts` exists and all hardcoded hex in mobile screens reference it; no bare hex in component files | VERIFIED | `grep -rE "#[0-9a-fA-F]{3,8}" app/ components/` returns 0 matches; theme.ts has 23 hex-containing lines |
| 2 | Bottom tabs are labeled Home / Classes / Passes / Log / Profile in that exact order | VERIFIED | `(tabs)/_layout.tsx` title strings appear at lines 32, 41, 50, 59, 68 in that sequential order |
| 3 | The app opens in a high-contrast dark theme by default | VERIFIED (code) | `defaultSkin.colors.background = "#0A0A0B"` is the active skin; EXPO_PUBLIC_STUDIO_SKIN defaults to `default`; visual confirmation deferred to EAS |
| 4 | Home tab hero shows next class, pass balance, and latest coach message as prominent cards | VERIFIED (code) | `index.tsx` contains "Pass Balance", "Next class", "From your coach" as section heads; hero card structure present; visual confirmation deferred |
| 5 | Booking flow completes in ≤3 steps with persistent pass-balance pill | VERIFIED (code) | `schedule.tsx` has pass pill above FlatList, expand=step1, pass/drop-in confirm=step2, optimistic badge=step3; "drop-in" appears 10 times; `passBalance` 4 times |
| 6 | Noticeboard is framed in coach voice ("From your coach" / "Studio updates") | VERIFIED | `index.tsx` contains "From your coach" (1 occurrence) and "Studio updates" (2 occurrences) as section labels |
| 7 | Inter loads via `useFonts` with OTF assets (Expo Go compatible); skin via `EXPO_PUBLIC_STUDIO_SKIN` | VERIFIED (code) | `_layout.tsx` imports `useFonts` and requires all 3 Inter OTF files; `theme.ts` resolves `EXPO_PUBLIC_STUDIO_SKIN`; font files are 609–632 KB (non-empty OTTO/CFF OTF) |

**Score:** 7/7 truths verified at code level

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mobile-app/lib/theme.ts` | ThemeContext + useTheme + default + Hustle skins + EXPO_PUBLIC_STUDIO_SKIN | VERIFIED | 183 lines; exports `useTheme`, `ThemeProvider`; defines `defaultSkin` (dark, `#0A0A0B`, orange `#F97316`) and `hustleSkin` (magenta placeholder); resolves skin from env var |
| `packages/mobile-app/assets/fonts/Inter-Regular.otf` | Inter v4.1 OTF, non-empty | VERIFIED | 609,600 bytes; OTTO/CFF signature confirmed per SUMMARY |
| `packages/mobile-app/assets/fonts/Inter-SemiBold.otf` | Inter v4.1 OTF, non-empty | VERIFIED | 629,912 bytes |
| `packages/mobile-app/assets/fonts/Inter-Bold.otf` | Inter v4.1 OTF, non-empty | VERIFIED | 631,880 bytes |
| `packages/mobile-app/app/_layout.tsx` | ThemeProvider wrap + useFonts gate; zero bare hex | VERIFIED | ThemeProvider at line 197; useFonts at line 131; 0 bare hex |
| `packages/mobile-app/app/(tabs)/_layout.tsx` | 5 tabs in order; useTheme; zero bare hex | VERIFIED | Titles at lines 32/41/50/59/68 in order; useTheme called; 0 bare hex |
| `packages/mobile-app/app/(tabs)/passes.tsx` | Passes tab ≥40 lines; reads passBalance via apiFetch | VERIFIED | 316 lines; `apiFetch`, `passBalance`, `credit` all present; useTheme called; 0 bare hex |
| `packages/mobile-app/app/(tabs)/index.tsx` | Home hero cards + coach-voice section; useTheme; zero bare hex | VERIFIED | "Pass Balance", "Next class", "From your coach", "Studio updates" present; useTheme called; 0 bare hex |
| `packages/mobile-app/app/(tabs)/schedule.tsx` | ≤3-step booking + pass pill; useTheme; zero bare hex | VERIFIED | pass pill above FlatList; pass/drop-in confirm step; useTheme called; 0 bare hex |
| `packages/mobile-app/app/(tabs)/food.tsx` | useTheme; zero bare hex | VERIFIED | 0 bare hex |
| `packages/mobile-app/app/(tabs)/profile.tsx` | useTheme; zero bare hex | VERIFIED | 0 bare hex |
| `packages/mobile-app/app/food-add.tsx` | useTheme; zero bare hex | VERIFIED | 0 bare hex |
| `packages/mobile-app/app/food-barcode.tsx` | useTheme; zero bare hex | VERIFIED | 0 bare hex |
| `packages/mobile-app/app/pick-member.tsx` | useTheme; zero bare hex | VERIFIED | 0 bare hex |
| `packages/mobile-app/components/KcalRing.tsx` | useTheme; zero bare hex; orange arcs | VERIFIED | 0 bare hex; useTheme at line 3 and 29; visual confirmation (orange arcs) deferred |
| `packages/mobile-app/components/AgentSheet.tsx` | useTheme; zero bare hex | VERIFIED | 0 bare hex; useTheme called; useMemo StyleSheet pattern |
| `packages/mobile-app/components/BarcodeScanner.tsx` | useTheme; zero bare hex | VERIFIED | 0 bare hex; useTheme called |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/_layout.tsx` | `lib/theme.ts` | `ThemeProvider` import + wrap at line 197 | WIRED | ThemeProvider is outermost; ThemedRoot inside calls useTheme |
| `app/_layout.tsx` | `assets/fonts/Inter-Regular.otf` | `useFonts` require at line 132 | WIRED | All 3 OTF weights required; render gates on `fontsLoaded` |
| `app/(tabs)/_layout.tsx` | `lib/theme.ts` | `useTheme` for tab bar colors | WIRED | tabBarStyle, tintColors, fontFamily all reference theme tokens |
| `app/(tabs)/passes.tsx` | `/api/m/profile` | `apiFetch` + `useQuery` | WIRED | `apiFetch("/api/m/profile")` in useQuery; `useFocusEffect` refetch |
| `app/(tabs)/index.tsx` | `/api/m/profile` | `apiFetch` + `useQuery` (existing) | WIRED | profile query present; optional `latestCoachMessage`/`studioUpdates` typed for additive wiring |
| `app/(tabs)/index.tsx` | `lib/theme.ts` | `useTheme` | WIRED | useTheme called in component body |
| `app/(tabs)/schedule.tsx` | `/api/m/profile` | `apiFetch` + `useQuery` for pass pill | WIRED | `apiFetch("/api/m/profile")` at line 229; passBalance drives pill + confirm flow |
| `app/(tabs)/schedule.tsx` | `/api/m/bookings` | `apiFetch` POST (mutation) | WIRED | booking mutation present; `api/m/bookings` confirmed in schedule.tsx |
| `components/KcalRing.tsx` | `lib/theme.ts` | `useTheme` | WIRED | useTheme at lines 3 and 29 |

### Data-Flow Trace (Level 4)

Data-flow for `/api/m/profile` → `passBalance` → pass pill and Home hero: the query is wired and the component reads `profileData?.passBalance ?? 0`. The API endpoint is 401-gated on the current deploy (D-12), so the components render graceful empty/error states; real data flows at EAS build time. This is an acknowledged constraint, not a wiring defect.

Data-flow for `latestCoachMessage` and `studioUpdates` on the Home screen: these are optional fields typed on `ProfileResponse`; the current API returns neither. The components render friendly empty states. Wiring is additive — when the API adds these fields, the components render real data with zero code changes. This is an intentional stub per plan spec (D-07, D-09).

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `index.tsx` | `passBalance` | `/api/m/profile` via `apiFetch` | Yes (when API un-gated) | FLOWING (blocked by 401 on current deploy — expected) |
| `index.tsx` | `latestCoachMessage` | Optional field on profile response | No (field absent in current API) | STATIC — intentional stub per plan spec |
| `index.tsx` | `studioUpdates` | Optional field on profile response | No (field absent in current API) | STATIC — intentional stub per plan spec |
| `schedule.tsx` | `passBalance` (pass pill) | `/api/m/profile` via `apiFetch` | Yes (when API un-gated) | FLOWING (blocked by 401 on current deploy — expected) |
| `passes.tsx` | `passBalance` | `/api/m/profile` via `apiFetch` | Yes (when API un-gated) | FLOWING (blocked by 401 on current deploy — expected) |
| `passes.tsx` | `passHistory` | Optional field on profile response | No (field absent in current API) | STATIC — intentional stub per plan spec |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points (no local dev server; Expo Go SDK mismatch; /api/m/* 401-gated per D-12). All behavioral checks deferred to EAS dev/preview build UAT.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MOBL-01 | R5-01, R5-02, R5-03, R5-04 | `lib/theme.ts` token file exists; all hardcoded hex in mobile screens replaced | SATISFIED | 0 bare hex in all `app/**` and `components/` files; theme.ts is the only hex holder |
| MOBL-02 | R5-02 | Bottom tabs renamed Home / Classes / Passes / Log / Profile | SATISFIED | `(tabs)/_layout.tsx` contains 5 tabs in exact order with exact titles |
| MOBL-03 | R5-01 | High-contrast dark theme is the member app default | SATISFIED (code) | `defaultSkin.colors.background = "#0A0A0B"`, active skin defaults to `default`; visual confirmation deferred |
| MOBL-04 | R5-03 | Home tab shows next class, pass balance, latest coach message as hero content | SATISFIED (code) | `index.tsx` has "Pass Balance", "Next class", "From your coach" hero cards; visual confirmation deferred |
| MOBL-05 | R5-04 | Booking flow ≤3 steps with persistent pass-balance pill | SATISFIED (code) | `schedule.tsx` has 3-step flow (expand/confirm/booked) + pill above FlatList; visual confirmation deferred |
| MOBL-06 | R5-03 | Noticeboard reframed in coach voice ("From your coach" / "Studio updates") | SATISFIED | `index.tsx` uses both strings as section labels; not "Notifications" |
| MOBL-07 | R5-01 | Inter via `useFonts` + OTF assets + `EXPO_PUBLIC_STUDIO_SKIN` | SATISFIED (code) | `_layout.tsx` loads 3 Inter OTF weights via `useFonts`; `theme.ts` resolves `EXPO_PUBLIC_STUDIO_SKIN`; real OTF files present |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/bottom-sheet-impl.ts` | 56–57 | `backgroundColor: "#1a1a1a"` and `backgroundColor: "#333"` (bare hex for @gorhom/bottom-sheet indicator styling) | Warning | Bottom sheet handle and background use hardcoded colors instead of theme tokens. This file is in `lib/` (not `app/` or `components/`), pre-dates R5 (created 2026-05-19 in D2-01), and was not in the R5 hex inventory (D-03 listed 9 `app/` files). The R5 goal states "no bare hex in component files / mobile screens"; `lib/bottom-sheet-impl.ts` is a library adapter. Impact: the gorhom bottom-sheet handle will render dark gray (`#333`) rather than `theme.colors.border`. Not a phase blocker but should be addressed in a follow-on cleanup. |
| `index.tsx` — `latestCoachMessage` | — | Optional field always `undefined` — coach message card shows empty state | Info (intentional) | Per plan spec D-07: no new endpoint; empty state is the intended behavior until `/api/m/profile` gains the field. Not a stub defect. |
| `passes.tsx` — `passHistory` | — | `PassEvent[]` optional field always absent — history section shows empty state | Info (intentional) | Per plan spec: no new endpoint; empty state is intended until `/api/m/profile` gains `passHistory`. Not a stub defect. |

### Human Verification Required

Behavioral and visual verification is deferred because:
- App Store Expo Go runs SDK 56; the app is SDK 55 (no local run possible without an EAS dev/preview build)
- `/api/m/*` endpoints are 401-gated on the current deploy (D-12)
- No local dev server is running

**When an EAS dev/preview build is available, verify each item below:**

#### 1. Dark Theme Default

**Test:** Launch the app without setting `EXPO_PUBLIC_STUDIO_SKIN`.
**Expected:** All screens display near-black background (`#0A0A0B` equivalent), orange accent buttons/active-tab indicator; no light flash on startup.
**Why human:** Visual rendering cannot be programmatically verified.

#### 2. Inter Font Rendering

**Test:** Navigate to Home, Classes, Passes, Log, Profile.
**Expected:** All text renders in Inter (regular weight for body, semibold for labels/buttons, bold for headings); no system font visible.
**Why human:** Font rendering requires a running device/emulator.

#### 3. Tab Bar (MOBL-02)

**Test:** Observe the bottom tab bar on any screen.
**Expected:** Exactly five tabs labeled "Home", "Classes", "Passes", "Log", "Profile" left-to-right; active tab icon and label are orange; inactive are gray.
**Why human:** Visual tab order and color require a running app.

#### 4. Passes Tab Live Data (MOBL-02, MOBL-05)

**Test:** With a working API, navigate to the Passes tab.
**Expected:** Member's pass balance shows as "X credit(s)" in large text; low balance (<=0) triggers danger-color styling.
**Why human:** `/api/m/*` is 401-gated on the current deploy.

#### 5. Home Hero Cards (MOBL-04)

**Test:** With a working API, open the Home tab.
**Expected:** Three prominent hero cards — "Pass Balance", "Next class", "From your coach" — appear above the nutrition card. Pass Balance shows current credits; Next class shows the upcoming booking or empty-state CTA; coach card shows friendly empty state.
**Why human:** Card visual prominence and live API data require a running app + working API.

#### 6. Booking Flow ≤3 Steps (MOBL-05)

**Test:** On the Classes tab, tap a class card to expand (step 1), observe the confirm area (step 2), select "Use 1 pass" or "Pay drop-in" (step 3 triggers optimistic booked badge).
**Expected:** Exactly three interactions to complete; pass-balance pill stays visible above the list throughout; pill credit count decrements after "Use 1 pass".
**Why human:** Booking flow interaction and optimistic update require a running app + API.

#### 7. Coach Voice Framing (MOBL-06)

**Test:** Observe the Home tab noticeboard section label and coach message card header.
**Expected:** "From your coach" labels the coach message card; "Studio updates" labels the noticeboard section; no "Notifications" text present.
**Why human:** Reading rendered UI text in context. (String presence is verified in code; framing/visual hierarchy needs human review.)

#### 8. Skin Switch (MOBL-07)

**Test:** Trigger an EAS build with `EXPO_PUBLIC_STUDIO_SKIN=hustle`.
**Expected:** Accent-colored UI elements (active tab, CTA buttons, pass pill) switch from orange (`#F97316`) to magenta (`#E11D48`); all other surfaces unchanged.
**Why human:** Requires a separate EAS build with the env var set at build time.

#### 9. KcalRing Orange Arcs (MOBL-01)

**Test:** Observe the calorie ring on the Home tab.
**Expected:** Progress arcs are orange (matching accent color), not the old blue (`#3b82f6`); background ring is dark gray.
**Why human:** Color rendering of the SVG arc requires visual inspection.

### Gaps Summary

No code-level gaps were found. All 7 MOBL requirements are satisfied at the code level:

- MOBL-01: `app/**` and `components/` directories contain zero bare hex; `lib/theme.ts` is the sole token holder.
- MOBL-02: Tab layout confirms exact 5-tab order Home / Classes / Passes / Log / Profile; `passes.tsx` exists (316 lines) and reads from `/api/m/profile`.
- MOBL-03: `defaultSkin.colors.background = "#0A0A0B"` with orange accent; active skin defaults to `default`.
- MOBL-04: `index.tsx` has all three hero cards with proper section strings and graceful empty states.
- MOBL-05: `schedule.tsx` implements a 3-step flow with persistent pass pill and explicit pass/drop-in choice.
- MOBL-06: Coach voice strings "From your coach" and "Studio updates" are the section labels.
- MOBL-07: `useFonts` + 3 real Inter OTF files + `EXPO_PUBLIC_STUDIO_SKIN` all wired.

One pre-existing warning exists outside R5 scope: `lib/bottom-sheet-impl.ts` (D2-01, 2026-05-19) retains 2 bare hex values (`#1a1a1a`, `#333`) for the @gorhom/bottom-sheet handle. This was not in the R5 hex inventory and is not a blocker for R5 goal achievement.

All behavioral/visual verification items are deferred to the EAS dev/preview build (master-branch workstream), which is an acknowledged and documented constraint in R5-CONTEXT D-12.

---

_Verified: 2026-06-13T20:16:13Z_
_Verifier: Claude (gsd-verifier)_
