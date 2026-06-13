---
phase: R5-member-mobile-app-redesign
plan: "03"
subsystem: ui
tags: [react-native, expo, theme, tokens, home-screen, hero, coach-voice, noticeboard]

# Dependency graph
requires:
  - phase: R5-member-mobile-app-redesign
    plan: "01"
    provides: "lib/theme.ts — useTheme() + StudioTokens + Inter font families + ThemeProvider"
provides:
  - "packages/mobile-app/app/(tabs)/index.tsx — Home hero: pass-balance card + next-class card + From your coach card + Studio updates noticeboard; theme-token styled; zero bare hex"
  - "packages/mobile-app/components/KcalRing.tsx — accent-colored (orange) progress ring via theme tokens; zero bare hex"
affects:
  - R5-04-booking-flow
  - "any plan consuming KcalRing.tsx"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional fields on ProfileResponse (latestCoachMessage, studioUpdates) typed as optional for additive wiring — no rewrite needed when API adds these fields"
    - "Coach-voice framing: 'From your coach' / 'Studio updates' as section labels — not 'Notifications'"
    - "Graceful empty states for all optional data (coach message, studio updates, pass balance low, no upcoming class)"
    - "useMemo(() => styles, [theme]) pattern for theme-derived styles — consistent with R5-01 pattern"

key-files:
  created: []
  modified:
    - packages/mobile-app/app/(tabs)/index.tsx
    - packages/mobile-app/components/KcalRing.tsx

key-decisions:
  - "Coach message sourced as optional field on ProfileResponse rather than a new API endpoint — additive wiring pattern means real data wires with zero rewrite when /api/m/profile adds the field"
  - "Studio updates typed as optional StudioUpdate[] array on ProfileResponse — same additive pattern"
  - "KcalRing progress arcs migrated from blue (#3b82f6) to theme.colors.accent (orange #F97316) — matches dark-first orange-accent brand; background ring migrated from #2a2a2a to theme.colors.border"
  - "Pass Balance elevated from a small pill to a hero card with a large credit count — satisfies MOBL-04 prominence requirement"
  - "Feather icons used for all new UI (award, message-circle, bell, alert-circle, plus, chevron-right) — no new icon lib, no emojis per CLAUDE.md/AGENTS.md"

patterns-established:
  - "Coach voice framing: 'From your coach' header on coach-message card, 'Studio updates' on noticeboard section — propagate this naming to any future notification surface"
  - "Optional API fields pattern: add typed optional field to response type, render real value when present, render friendly empty state otherwise — crash-safe for 401-gated /api/m/* (D-12)"

requirements-completed: [MOBL-04, MOBL-06, MOBL-01]

# Metrics
duration: 3min
completed: "2026-06-13"
---

# Phase R5 Plan 03: Home Hero and Noticeboard Summary

**Pass-balance + next-class + "From your coach" hero cards and a "Studio updates" coach-voice noticeboard section on the Home tab, with KcalRing migrated from blue #3b82f6 to orange accent, and zero bare hex in both owned files**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-13T20:01:01Z
- **Completed:** 2026-06-13T20:03:30Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

- Migrated all 19 bare hex in index.tsx and all 5 in KcalRing.tsx to `theme.colors.*` / `theme.font.*` tokens; both files call `useTheme()`
- KcalRing progress arcs are now orange (theme.colors.accent = #F97316) instead of the old hardcoded blue (#3b82f6), aligning the ring with the GymClassOS dark-first brand palette
- Restructured Home screen into three prominent hero cards (Pass Balance, Next class, From your coach) plus a "Studio updates" coach-voice noticeboard section, with the existing nutrition card below
- All states (loading, error/401, empty coach data, empty studio updates, low pass balance, no upcoming class) render gracefully — crash-safe under the D-12 /api/m/* 401-gate constraint
- coach message and studio updates typed as optional fields on ProfileResponse so real API data wires additively with zero component rewrite

## Task Commits

1. **Task 1: Migrate index.tsx + KcalRing to theme tokens** - `0c0778c8` (feat)
2. **Task 2: Build Home hero + coach-voice noticeboard** - `93e377f5` (feat)

## Files Created/Modified

- `packages/mobile-app/app/(tabs)/index.tsx` — Home screen: useTheme migration + three hero cards (pass balance, next class, "From your coach") + "Studio updates" coach-voice noticeboard + nutrition card; zero bare hex
- `packages/mobile-app/components/KcalRing.tsx` — useTheme migration: accent-colored arcs, theme border ring, theme foreground/muted text; inline style objects; zero bare hex

## Decisions Made

- **Pass Balance as hero card, not pill:** The plan called for "prominent card" for pass balance (MOBL-04). Elevated from the old small pill-badge to a full hero card with a large 40px credit number, accent icon (`award`), and a "View passes" CTA or a danger badge when balance is zero.
- **Coach message as optional field on ProfileResponse:** `/api/m/profile` does not currently return `latestCoachMessage`. Rather than calling a new endpoint (out of scope), typed the field as `latestCoachMessage?: { body: string; sentAt: string } | null` on the local type. When present, the real message renders; when absent, a friendly empty-state line appears. Wiring real data later is a one-line API change.
- **Studio updates same additive pattern:** `studioUpdates?: StudioUpdate[]` typed but optional; renders mapped update cards when the array is non-empty, graceful "No studio updates this week." otherwise.
- **KcalRing inline styles:** Eliminated the `StyleSheet.create` call entirely (it ran at module level and cannot read theme context). All styles are now inline objects in the component body, following the R5-01 documented pattern.

## Deviations from Plan

None — plan executed exactly as written. Both tasks completed cleanly; all acceptance criteria satisfied.

## Known Stubs

- **`latestCoachMessage` field on ProfileResponse** — always `undefined` in current API responses. The card renders a friendly empty-state message. Real data will flow when `/api/m/profile` adds this field (master-branch mobile workstream). Stub is intentional per plan spec (D-07 / interfaces note in the plan).
- **`studioUpdates` field on ProfileResponse** — always `undefined`; "Studio updates" section shows empty state. Same additive-wiring pattern; real data flows when the API adds the field. Intentional per plan spec (D-09).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- R5-04 (booking flow) can proceed — `index.tsx` is theme-token clean; the booking card on Home correctly routes to `/(tabs)/schedule`
- When `/api/m/profile` gains `latestCoachMessage` and/or `studioUpdates` fields, the Home screen will render real data automatically with no component changes needed
- Behavioral/visual verification deferred to EAS build UAT (D-12)

---
*Phase: R5-member-mobile-app-redesign*
*Completed: 2026-06-13*
