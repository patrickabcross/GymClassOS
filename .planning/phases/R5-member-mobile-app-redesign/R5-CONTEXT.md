# Phase R5: Member Mobile App Redesign - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning
**Mode:** Autonomous (decisions by Claude under standing user authorization; UAT deferred — mobile real-device UAT is blocked until an EAS dev/preview build exists, see constraints)

<domain>
## Phase Boundary

Align the Expo member app (`packages/mobile-app`) to the GymClassOS design language: introduce a `theme.ts` token file (parallel to the web token layer), replace all hardcoded hex with theme references, default to a high-contrast dark theme, rename the bottom tabs, give the Home tab a hero, tighten the booking flow, reframe the noticeboard in coach voice, and self-host Inter via `useFonts`.

**In scope:** `packages/mobile-app/` only (lib/theme.ts, app/(tabs)/*, app/*.tsx, assets/fonts).

**Out of scope:**
- Web (R2–R4 done). The mobile token file is a PARALLEL implementation of the same token *semantics*, NOT a shared CSS import (RN has no CSS).
- New backend/API endpoints — reuse the existing `/api/m/*` routes and `agent-stream`.
- EAS build configuration / App Store submission (project constraint: no new store submissions; EAS build is a separate master-branch workstream).
- DB changes.

</domain>

<decisions>
## Implementation Decisions

### Theme system (MOBL-01, MOBL-03, MOBL-07)
- **D-01:** Create `packages/mobile-app/lib/theme.ts` exporting a `ThemeContext` + `useTheme()` hook (~60 lines, hand-rolled per STACK.md). **NOT** react-native-unistyles (requires native build, incompatible with Expo Go) and **NOT** NativeWind. Theme is a typed JS object (colors, radius, spacing, font families) consumed via `useTheme()` in `StyleSheet`/inline styles.
- **D-02:** **Dark-first, high-contrast** default palette (MOBL-03 — gym/workout usage context). Mirror the R2 brand semantics: studio accent = orange (`#F97316` family, matching web `--studio-accent`) on near-black surfaces with high-contrast light text. Keep brand consistency with web while being dark.
- **D-03:** Replace **every** hardcoded hex (~134 across 9 files) in `app/**` with `theme` references — no bare hex strings remain in component files (MOBL-01). Token values live only in `theme.ts`.
- **D-04:** Skin selection via **`EXPO_PUBLIC_STUDIO_SKIN`** read at app start (EAS build time), defaulting to the GymClassOS default skin — parallels the web `GYMOS_STUDIO_SKIN`. `theme.ts` holds a default skin + a Hustle placeholder skin (mirroring R2's two skins); `EXPO_PUBLIC_STUDIO_SKIN=hustle` selects the Hustle token set.
- **D-05:** Inter via **`useFonts`** from `expo-font` (Expo Go compatible — NOT the config plugin). OTF assets in `packages/mobile-app/assets/fonts/` (Inter-Regular/SemiBold/Bold per STACK.md). App gates render on font load.

### Navigation (MOBL-02)
- **D-06:** Bottom tabs renamed/reordered to **Home / Classes / Passes / Log / Profile**:
  - `index` → "Home" (keep)
  - `schedule` → "Classes" (relabel; "Schedule" collides with the web nav term)
  - **new "Passes" tab** (5th) — pass balance + history screen (new screen `app/(tabs)/passes.tsx`)
  - `food` → "Log" (relabel; fitness-app convention for the food/calorie log)
  - `profile` → "Profile" (keep)
  - Tab icons: Tabler-equivalent RN icons already in use (keep the icon library the app uses; no emojis).

### Surfaces (MOBL-04, MOBL-05, MOBL-06)
- **D-07:** **Home hero** shows next class, pass balance, and latest coach message as prominent cards (MOBL-04). "Latest coach message" sources from the existing conversations/agent data via `/api/m/*`; if unavailable, show a graceful empty/last-known state (do not crash — `/api/m/*` is 401-gated on the current deploy, see constraints).
- **D-08:** **Booking flow ≤3 steps** (select → confirm with pass/drop-in choice → done) with a **persistent pass-balance pill** visible throughout (MOBL-05). Refine the existing mobile Schedule/booking flow (built in D2-03) rather than rebuild.
- **D-09:** **Noticeboard in coach voice** (MOBL-06) — frame studio updates as "From your coach" / "Studio updates", not a generic notification feed. Reframe whatever updates/notices surface exists (or add a lightweight coach-voice section to Home if no dedicated surface exists — planning discovers this).

### Constraints
- **D-10:** ThemeContext wraps the root layout (`app/_layout.tsx`); `useFonts` gate lives there too. `data-studio`-equivalent is the `EXPO_PUBLIC_STUDIO_SKIN`-selected token set.
- **D-11:** Fork boundary: `packages/mobile-app/` only; never edit `templates/*` or `packages-vendored/*`; no web (`apps/staff-web`) or DB changes.
- **D-12:** **Real-device UAT is BLOCKED until an EAS dev/preview build exists** — App Store Expo Go runs SDK 56, this app is SDK 55, and `/api/m/*` is 401-gated on the deploy (R1-03 findings). R5 is **code-complete-only**; visual/behavioral verification defers to when the master-branch EAS workstream produces a build. Verification now is code-level (theme.ts exists, zero bare hex, tabs renamed, useFonts present).

### Claude's Discretion
- Exact dark palette values (within the orange-accent brand) + the high-contrast ratios.
- Passes-tab screen layout + data source (reuse member pass data).
- Whether the noticeboard is a new surface or a Home section (pick the lighter-touch option that fits existing data).
- The RN icon set already in use (keep it; no new icon lib).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary
- `.planning/research/STACK.md` — **the mobile theming strategy.** ThemeContext (~60 lines) + `useTheme()`; NOT unistyles (Expo Go incompatible) / NOT NativeWind; `useFonts` (not config plugin) with OTF Inter from github.com/rsms/inter; assets in `packages/mobile-app/assets/fonts/`. Pitfall PITFALLS.md item on RN token propagation.
- `.planning/research/PITFALLS.md` — the RN/mobile theming pitfall (hardcoded hex won't propagate; ThemeContext is the fix) + Expo Go SDK constraints.

### Token foundation (mirror semantics, parallel implementation)
- `.planning/phases/R2-design-system-token-layer/R2-CONTEXT.md` — the brand token semantics to mirror in `theme.ts` (orange `#F97316` accent, radius, the default+Hustle skin split, env-var skin selection pattern → `EXPO_PUBLIC_STUDIO_SKIN`).
- `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` — §Label Layer mobile rows (Schedule→Classes, Food→Log, add Passes; Home/Profile keep) — MOBL-02 targets.

### Planning
- `.planning/REQUIREMENTS.md` — MOBL-01..07 definitions.
- `.planning/ROADMAP.md` — Phase R5 success criteria (7 TRUE-conditions).
- `.planning/STATE.md` — R1-03 mobile constraints (Expo Go SDK 56 vs app SDK 55, no EAS dev client, /api/m/* 401-gated → real-device UAT blocked; re-shootable at R5 once EAS dev client built).

</canonical_refs>

<code_context>
## Existing Code Insights

### Current mobile structure (packages/mobile-app/app/)
- `_layout.tsx` — root layout (wrap with ThemeProvider + useFonts gate).
- `(tabs)/_layout.tsx` — bottom tab bar (Home/Schedule/Food/Profile) → rename + add Passes (MOBL-02).
- `(tabs)/index.tsx` — Home (add hero: next class + pass balance + latest coach message, MOBL-04).
- `(tabs)/schedule.tsx` — Classes tab + booking flow (relabel "Classes"; tighten to ≤3 steps + pass pill, MOBL-05).
- `(tabs)/food.tsx` — Log tab (relabel "Log").
- `(tabs)/profile.tsx` — Profile (keep).
- `food-add.tsx`, `food-barcode.tsx`, `pick-member.tsx` — supporting screens (hex replacement).
- **New:** `(tabs)/passes.tsx` — Passes tab (MOBL-02).

### Hardcoded hex inventory (MOBL-01 target — ~134 across 9 files)
food.tsx (22), index.tsx (19), schedule.tsx (18), food-add.tsx (25), food-barcode.tsx (17), profile.tsx (12), _layout.tsx (8/app + 6/tabs), pick-member.tsx (7). All replaced with `theme` refs.

### lib/ (reuse, don't duplicate)
- `lib/api.ts` (apiFetch wrapper), `lib/current-member.ts`, `lib/query-client.ts`, `lib/agent-stream.ts`. NEW: `lib/theme.ts`.
- No `assets/fonts/` yet — create it for Inter OTF.

### Constraints in force
- Expo Go SDK 55; `useFonts` (not config plugin); ThemeContext (not unistyles/NativeWind).
- Real-device UAT blocked until EAS build (R5 code-complete only).
- Fork boundary: packages/mobile-app only.

</code_context>

<specifics>
## Specific Ideas
- `theme.ts` is the mobile analog of the web token layer — same brand semantics (orange accent), dark-first surfaces. A `EXPO_PUBLIC_STUDIO_SKIN=hustle` build selects the Hustle token set (placeholder until Hustle's hex lands, same as web R2).
- Tabs: Home / Classes / Passes / Log / Profile — exact order.
- Booking must feel fast: ≤3 steps, pass-balance pill always visible.
- Coach voice on the noticeboard ("From your coach" / "Studio updates") — not "notifications".
- Zero bare hex in any component file after this phase — the verifiable MOBL-01 gate.
</specifics>

<deferred>
## Deferred Ideas
- EAS dev/preview build (master-branch workstream) — unblocks real-device UAT of this phase.
- Fixing `/api/m/*` 401-gating on the deploy (master-branch mobile workstream) — needed before live data shows on a real device.
- Web work (done in R2–R4).
- react-native-unistyles migration — only when EAS Dev Client replaces Expo Go (post-milestone).
</deferred>

---

*Phase: R5-member-mobile-app-redesign*
*Context gathered: 2026-06-13 (autonomous)*
