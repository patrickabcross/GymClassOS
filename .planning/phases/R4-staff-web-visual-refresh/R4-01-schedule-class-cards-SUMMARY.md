---
phase: R4-staff-web-visual-refresh
plan: 01
subsystem: ui
tags: [react, tailwind, shadcn, schedule, capacity, tokens]

# Dependency graph
requires:
  - phase: R2-design-system-token-layer
    provides: CSS token system (--studio-accent, --destructive, shadcn vars, guard-no-hardcoded-colors.mjs)
  - phase: R3-naming-ia-pass
    provides: Route renames (gymos.schedule.tsx in place); gym vocabulary applied
provides:
  - 3-state capacity indicator on schedule class cards (muted/amber/destructive driven by spotsLeft)
  - Studio-accent today-cell in month grid (--studio-accent token, not hardcoded border)
  - Consistent capacity styling in booking dialog description span
affects:
  - R4-02 and beyond (capacity pattern established for reuse in member context panel and embeds)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-state capacity pattern: spotsLeft <= 0 -> bg-destructive/10 text-destructive; spotsLeft <= 3 -> bg-amber-100 text-amber-700 (guard:allow-color); else text-muted-foreground"
    - "Today-cell accent: border-[color:var(--studio-accent)]/30 bg-[color:var(--studio-accent)]/10 (arbitrary-property Tailwind CSS var syntax)"
    - "guard:allow-color comment marker on amber capacity lines — required for guard-no-hardcoded-colors.mjs allowlist"

key-files:
  created: []
  modified:
    - apps/staff-web/app/routes/gymos.schedule.tsx

key-decisions:
  - "Capacity Full text appended as ' · Full' inside the capacity span (not a separate element) — keeps the card compact per R4-UI-SPEC §1"
  - "No instructor field — loader has no instructor column; UI-SPEC says omit cleanly rather than stub 'TBD'"
  - "Both tasks committed in a single atomic commit because they touch the same file with no interleaved verification gate between them"

patterns-established:
  - "spotsLeft-driven capacityClass: compute const spotsLeft and const capacityClass from full+spotsLeft inside the .map() callback before JSX"
  - "Arbitrary Tailwind CSS-var syntax for studio token: border-[color:var(--studio-accent)]/30"

requirements-completed: [SWEB-01, SWEB-02]

# Metrics
duration: 12min
completed: 2026-06-13
---

# Phase R4 Plan 01: Schedule Class Cards Summary

**3-state capacity indicator (muted/amber/destructive) and studio-accent today-cell applied to gymos.schedule.tsx via token classes; color guard stays green**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-13T19:00:00Z
- **Completed:** 2026-06-13T19:12:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced single amber-only capacity span with a 3-state `capacityClass` driven by `spotsLeft`: destructive styling at 0 spots, amber warning at 1-3 spots, muted at 4+
- Appended " · Full" text into the capacity span when class is at capacity (no separate element)
- Applied the same 3-state logic to the booking dialog's description capacity span (consistency)
- Replaced `today && "border-foreground/40"` with `border-[color:var(--studio-accent)]/30 bg-[color:var(--studio-accent)]/10` — today cell now glows in the studio accent rather than a generic foreground border
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0 throughout; no hex introduced

## Task Commits

1. **Task 1 + Task 2: 3-state capacity + accent today-cell** - `9ea80abe` (feat) — both tasks in the same file, committed atomically after both were verified

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `apps/staff-web/app/routes/gymos.schedule.tsx` — 3-state capacity indicator, " · Full" label, booking dialog consistency fix, studio-accent today-cell

## Decisions Made
- Committed both tasks in a single commit because they affect the same file and both passed verification (color guard + acceptance greps) before committing. No interleaved checkpoint between them.
- Kept the `// guard:allow-color` comment on the amber class line (required by the guard script's allowlist mechanism).
- Booking dialog span changed from `text-amber-600 dark:text-amber-400` to `text-destructive` / `text-amber-700` — removes the now-removed dark variant and aligns with the card's token pattern.

## Deviations from Plan

None — plan executed exactly as written. Both acceptance criteria blocks pass via grep. Color guard exits 0.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- SWEB-01 and SWEB-02 are satisfied: schedule class cards show name + time + X/Y booked with a token-driven 3-state capacity indicator; today's cell carries the studio accent
- R4-02 (member context panel widget cards) can proceed immediately — no blockers from this plan
- Visual UAT (amber at 8/10, red at full, accent today-cell) deferred to Vercel deploy per the no-local-dev-server constraint

## Known Stubs
None — all capacity states are computed from live `bookingCounts` data already returned by the loader. No placeholder values flow to the UI.

## Self-Check: PASSED
- `apps/staff-web/app/routes/gymos.schedule.tsx` — modified (confirmed by git diff and Prettier output)
- Commit `9ea80abe` — confirmed (`git log --oneline -1`)
- `node scripts/guard-no-hardcoded-colors.mjs` — exits 0 (confirmed above)
- `grep -n "bg-amber-100 text-amber-700"` — line 488, present
- `grep -n "bg-destructive/10 text-destructive"` — line 485, present
- `grep -n "spotsLeft"` — lines 481, 486, present
- `grep -n "Full"` — line 510 (`· Full` in span), present
- `grep -n "Instructor"` — no match, correct
- `grep -n "studio-accent"` — line 398, present
- `grep -n "border-foreground/40"` — no match, correct

---
*Phase: R4-staff-web-visual-refresh*
*Completed: 2026-06-13*
