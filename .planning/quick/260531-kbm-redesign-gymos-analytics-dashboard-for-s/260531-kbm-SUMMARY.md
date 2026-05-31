---
phase: quick
plan: 260531-kbm
subsystem: staff-web / analytics
tags: [ui, analytics, typography, hierarchy, trend-indicators, tabler-icons]
dependency_graph:
  requires: [P1b.1-06 (analytics route + loader)]
  provides: [display-size KPI heroes, direction-aware trend deltas, authorized Display/metric typography role]
  affects: [gymos.analytics.tsx presentation layer, P1b.1-UI-SPEC.md Typography section]
tech_stack:
  added: []
  patterns:
    - "Display / metric typography role (text-3xl/text-4xl) scoped to /gymos/analytics"
    - "Direction-aware trend indicator component (TrendIndicator) with emerald/muted colour logic"
    - "trendGoodWhen prop pattern for per-metric directionality without duplicating the indicator component"
key_files:
  created: []
  modified:
    - apps/staff-web/app/routes/gymos.analytics.tsx
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
decisions:
  - "text-3xl for all KPI cards, text-4xl (heroSize prop) for MRR only — the single most-important Business KPI"
  - "Trend indicators on Fill Rate and Cancellation Rate only — the only two metrics with both 7d and 30d values"
  - "flat direction → muted (not emerald) — flat is not a success state"
  - "No text-destructive for bad trends — UI-SPEC reserves destructive for failed actions"
  - "30d baseline row uses border-t separator to visually subordinate it to the 7d hero without removing it"
metrics:
  duration_minutes: 18
  completed_date: "2026-05-31"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Quick Task 260531-kbm: Redesign GymOS Analytics Dashboard for Strong Hierarchy

**One-liner:** Promoted analytics KPI values from 14px to Display/metric size (text-3xl/text-4xl) and added direction-aware Tabler trend indicators on Fill Rate and Cancellation Rate, with the UI-SPEC Typography section updated to authorize the new sizes and prevent future checker regressions.

---

## What Changed

### Task 1: gymos.analytics.tsx — Presentation layer redesign

**Root cause addressed:** The 2026-05-25 UI-SPEC checker pass downgraded analytics KPI primary values from `text-2xl` to `text-sm` (14px) in the name of type-scale compliance. This made MRR, Fill Rate, and every other headline number the same visual size as a label — eliminating the operational hierarchy that makes a dashboard scannable.

**Changes made (presentation layer only — loader/SQL/PRICES/data shape frozen):**

1. **Tabler icon import added:**
   ```ts
   import { IconTrendingUp, IconTrendingDown, IconMinus } from "@tabler/icons-react";
   ```

2. **KPI hero sizes introduced:**
   - All cards: `text-3xl font-semibold` (~30px, weight 600) — the Display / metric role
   - MRR card only: `text-4xl font-semibold` (~36px, weight 600) via `heroSize` prop — the Display / hero role
   - Colour: `text-foreground` (default) or `text-muted-foreground` when `primaryTone="muted"` (Net Growth when negative)
   - Label stays `text-[12px] uppercase tracking-wide text-muted-foreground`
   - Context stays `text-[12px] text-muted-foreground`

3. **Trend indicator added (Fill Rate and Cancellation Rate only):**
   - New `TrendIndicator` component: computes `delta = primaryPct - secondaryPct` in the render layer from loader-provided values — no new queries
   - New props on the `default` variant: `primaryPct`, `secondaryPct`, `trendGoodWhen: "up" | "down"`
   - Fill Rate: `trendGoodWhen="up"` — higher 7d vs 30d is good (emerald), lower is muted, flat is muted
   - Cancellation Rate: `trendGoodWhen="down"` — lower 7d vs 30d is good (emerald), higher is muted, flat is muted
   - Colour: `text-emerald-600 dark:text-emerald-400` for genuinely-good direction; `text-muted-foreground` for neutral/bad — never `text-destructive`
   - Renders no trend when either pct is `null` (empty window) — empty states preserved
   - Label text: e.g. `+5pts vs 30d` / `-3pts vs 30d` / `flat vs 30d` at `text-[11px]`
   - Icons: `size={14}`, `aria-hidden` — human-readable label carries screen-reader meaning

4. **30d baseline row de-emphasised (not removed):**
   - Secondary value: `text-sm font-semibold text-muted-foreground` (visually subordinate to 7d hero)
   - `border-t border-border/30` separator creates clear visual break between 7d hero and 30d baseline

5. **Spacing / breathing room:**
   - Card padding bumped `p-4` → `p-5`
   - Page outer padding bumped `p-4` → `p-5`
   - Section gap bumped `gap-6` → `gap-8`

6. **Accessibility preserved:** `role="region"` + `aria-label={label}` on every card; all empty states ("No data yet" / "–") unchanged.

7. **Header comment updated:** Removed stale "primary value is 14px semibold" claim; documents the new Display / metric role, the 260531-kbm redesign, and the rationale for the size increase.

**Loader verification:** Lines 90–336 of the original file (the loader, all helper functions, PRICES, and `return {...}`) are byte-for-byte identical to the original. Only imports, the `MetricCard` component, `TrendIndicator`, and the `GymosAnalytics` default export changed.

### Task 2: P1b.1-UI-SPEC.md — Typography section updated

1. **Intro line amended:** Changed "Do not introduce new sizes — use only these four" to explain that the four core sizes govern all gymos chrome, and the Analytics dashboard additionally introduces a Display / metric size scoped to `/gymos/analytics` only.

2. **New rows added to Typography table:**
   - `Display / metric` | 30px (`text-3xl`) | 600 (semibold) | 1.1 | Analytics KPI heroes (Fill Rate, MRR, etc.) on `/gymos/analytics` only
   - `Display / hero` | 36px (`text-4xl`) | 600 (semibold) | 1.05 | Single most-important KPI (MRR) — `/gymos/analytics` only

3. **Stale "analytics metric primary values" removed from Heading/section row:** Those now use the Display / metric role.

4. **Checker revision note added:** Records that the 2026-05-25 `text-2xl→text-sm` downgrade was deliberately reversed on 2026-05-31 for hierarchy reasons, and that future checker passes must not re-flag `text-3xl`/`text-4xl` in `gymos.analytics.tsx` as undeclared sizes — they are now authorized.

---

## Deviations from Plan

None — plan executed exactly as written. All typography decisions, trend direction rules, colour tokens, and scope constraints followed verbatim.

---

## Known Stubs

None. This is a pure presentation-layer redesign; no data stubs introduced. The loader already returns real data from Neon.

---

## Verification

- `text-3xl` appears 3 times in `gymos.analytics.tsx` (confirmed via grep)
- `IconTrendingUp` appears 3 times (import + 2 conditional uses in Fill Rate / Cancellation Rate)
- `aria-label` present on MetricCard (confirmed via grep)
- `text-destructive` appears only in a comment (never in a className)
- No errors in `gymos.analytics.tsx` from tsc (pre-existing tsconfig/options errors are baseline — none reference this file)
- `Display / metric` and `text-3xl` both confirmed in `P1b.1-UI-SPEC.md` (grep count = 3, i.e. ≥ 2)
- No files other than `gymos.analytics.tsx` and `P1b.1-UI-SPEC.md` modified

---

## Self-Check

- `apps/staff-web/app/routes/gymos.analytics.tsx` — confirmed modified and committed (`d32e3064`)
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md` — confirmed modified and committed (`e0aad647`)
- SUMMARY.md — this file

## Self-Check: PASSED
