---
phase: P1b.1-customer-pilot-enablement
plan: 06
subsystem: ui

tags: [react-router-v7, drizzle, neon, postgres, analytics, shadcn]

# Dependency graph
requires:
  - phase: P1b.1-01-bare-gymos-layout
    provides: AppLayout bare-gymos branch (no email chrome) so /gymos/analytics renders inside the gym shell
  - phase: P1b.1-03-gym-actions-part-a
    provides: list-fill-rate action SQL pattern (capacity vs booked aggregation, ne(status, 'cancelled') predicate)
provides:
  - /gymos/analytics route (read-only metrics dashboard)
  - Fill Rate / Cancellation Rate / Pass Utilisation cards with 7d + 30d windows
  - Parallel-fanout loader pattern (5 SQL queries via Promise.all)
  - Graceful empty-state convention ("No data yet" + en-dash U+2013)
affects: [P1b.1-08-end-to-end-verification, P2-analytics-extensions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Loader fanout via Promise.all over multiple aggregation closures
    - Capacity-vs-booked split into two queries to avoid leftJoin row-multiplication
    - "Active pass" computed via expires_at IS NULL OR expires_at >= now (passes has no status column)

key-files:
  created:
    - apps/staff-web/app/routes/gymos.analytics.tsx
  modified: []

key-decisions:
  - "Loader returns plain object (not json()) — react-router v7 framework mode no longer exports json(); matches every sibling staff-web route"
  - "Fill Rate computed via two parallel queries (capacity from un-joined occurrences + booked count from inner-join) instead of a single leftJoin with SUM(capacity) — the latter fan-outs occurrence rows by booking count and multi-counts capacity"
  - "Pass Utilisation defines 'active' as expires_at IS NULL OR expires_at >= now() (passes has no status column in schema.ts — same definition used by list-at-risk-members and members.\$id balance calcs)"
  - "Metric label rendered as plain <div> inside CardHeader instead of via CardTitle so the default text-2xl class (disallowed by UI-SPEC checker) never lands in the DOM"

patterns-established:
  - "Parallel loader fanout: const [a,b,c,d,e] = await Promise.all([fnA(), fnB(), ...]) over inner-helper closures that share db + dates"
  - "Empty-state degradation: pct=null → formatPct renders en-dash; companion context renders 'No data yet' when the source count is zero"
  - "Avoid SUM-over-join multi-counting: when aggregating capacity over a parent table that has a one-to-many to bookings, query capacity separately from booked"

requirements-completed: [INBX-01]

# Metrics
duration: 5min
completed: 2026-05-25
---

# Phase P1b.1 Plan 06: Analytics Route Summary

**Read-only `/gymos/analytics` route with three live SQL metrics (fill rate, cancellation rate, pass utilisation) rendered as shadcn metric cards over 7d/30d windows, with graceful empty-state ("No data yet" + en-dash).**

## Performance

- **Duration:** ~5 min (parallel-wave executor)
- **Started:** 2026-05-25T22:11:36Z
- **Completed:** 2026-05-25T22:15:44Z
- **Tasks:** 1
- **Files modified:** 1 created (0 modified)

## Accomplishments

- New file `apps/staff-web/app/routes/gymos.analytics.tsx` (291 lines) — fills the destination for the Analytics tab in `GymosTopNav` (no longer a 404).
- Loader fans **five** SQL aggregation queries out in parallel via `Promise.all` (fillRate 7d, fillRate 30d, cancellationRate 7d, cancellationRate 30d, passUtilisation snapshot).
- Three metric cards with UI-SPEC verbatim copy: "Fill Rate", "Cancellation Rate", "Pass Utilisation", subtitle "Last 7 days · Last 30 days".
- Empty-state path verified by construction: `pct === null` → en-dash U+2013 ("–") + "No data yet" context — no crash, no hidden card.
- Cards expose `role="region"` + `aria-label={label}` for screen-reader nav.
- All colors via semantic Tailwind tokens (`text-muted-foreground`, `bg-card/40`, `border-border/50`) — zero hardcoded hex.
- `text-2xl` (the UI-SPEC-disallowed font size) does not appear in the file.
- ROADMAP success criterion #4 satisfied — pilot can demo `/gymos/analytics` on day one.

## Task Commits

1. **Task 1: Compute analytics metrics in a loader (fill rate, cancellation, pass utilisation × 7d & 30d)** — `ca26019e` (feat)

## Files Created/Modified

- `apps/staff-web/app/routes/gymos.analytics.tsx` — NEW. Loader + page component. 291 lines. Contains all five aggregations, `formatPct()` helper, and the `MetricCard` view component. guard:allow-unscoped marker on every query (gym tables single-tenant exemption per P1b.1-RESEARCH.md §6).

## Decisions Made

- **Loader returns plain object, not `json()`** — react-router v7 framework mode does not export `json` from the `react-router` package; every sibling route in `apps/staff-web/app/routes/` returns plain objects. The plan's example used the deprecated import; deviated to match the working convention.
- **`@/components/ui/*` (not `~/components/ui/*`)** — `apps/staff-web/tsconfig.json` defines only the `@/*` alias; `~/*` was never configured in this repo. Every other staff-web file uses `@/`.
- **Fill Rate split into two queries** — the original plan SQL used a single `leftJoin(bookings)` with `SUM(capacity)`, but a leftJoin fans out occurrence rows by booking count, multi-counting capacity. Switched to capacity-from-occurrences + booked-from-inner-join, then divided in JS.
- **Pass Utilisation "active" via `expiresAt`** — `passes` table has no `status` column (schema.ts:235), so the plan's `eq(schema.passes.status, "active")` would fail to compile. Used `expires_at IS NULL OR expires_at >= now()` — same definition `list-at-risk-members.ts` and `gymos.members.$id.tsx` use for balance calcs.
- **Plain `<div>` label inside `CardHeader`** — shadcn `CardTitle` defaults to `text-2xl` which the UI-SPEC checker disallowed. Rendering the label as a plain div with `text-[12px] uppercase` keeps `text-2xl` out of the output entirely without forking the `Card` primitive.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `passes` table has no `status` column**
- **Found during:** Task 1
- **Issue:** Plan template wrote `eq(schema.passes.status, "active")`. Actual schema (`apps/staff-web/server/db/schema.ts:235`) defines `passes` with `id, memberId, granted, source, stripeChargeId, stripeSubscriptionId, productName, expiresAt, createdAt` — no `status` column. The expression would have failed TypeScript compilation.
- **Fix:** Switched to `passes.expiresAt IS NULL OR passes.expiresAt >= now()` via raw SQL. This is the same "active pass" definition already used in `list-at-risk-members.ts` (`earliestPassExpiry` subquery) and the members profile balance calc.
- **Files modified:** `apps/staff-web/app/routes/gymos.analytics.tsx`
- **Verification:** Typecheck passes for the analytics file (`pnpm typecheck` only flags an unrelated sibling-owned import error in `gymos._index.tsx`).
- **Committed in:** `ca26019e`

**2. [Rule 1 - Bug] `react-router` v7 framework mode does not export `json()`**
- **Found during:** Task 1
- **Issue:** Plan template imported `json` from `react-router`. RR v7 framework mode removed `json` (loaders return plain values; `data()` wraps when you need status/headers). Grepping `apps/staff-web/app/` confirms no sibling route uses `json`.
- **Fix:** Dropped the `json` import; loader returns a plain object. Matches `gymos._index.tsx`, `gymos.members.tsx`, etc.
- **Files modified:** `apps/staff-web/app/routes/gymos.analytics.tsx`
- **Verification:** Typecheck passes for the file.
- **Committed in:** `ca26019e`

**3. [Rule 1 - Bug] `~/*` TS alias does not exist**
- **Found during:** Task 1
- **Issue:** Plan template imported from `~/components/ui/card`. `apps/staff-web/tsconfig.json` defines only `@/*` and `@shared/*`. The `~/*` alias is from upstream agent-native templates that were never adopted into the staff-web fork.
- **Fix:** Switched all `~/components/ui/...` imports to `@/components/ui/...`.
- **Files modified:** `apps/staff-web/app/routes/gymos.analytics.tsx`
- **Verification:** Typecheck passes.
- **Committed in:** `ca26019e`

**4. [Rule 1 - Bug] leftJoin fan-out multi-counts capacity in fill-rate SQL**
- **Found during:** Task 1 (writing the SQL)
- **Issue:** Plan template: `select { booked, capacity: SUM(capacity), occurrenceCount }.from(classOccurrences).leftJoin(bookings, ...)`. The leftJoin fans out each occurrence row by its booking count, so `SUM(capacity)` adds the capacity value once per booking instead of once per occurrence. For an occurrence with capacity=10 and 5 bookings, capacity contributes 50.
- **Fix:** Split into two queries that run in parallel inside the helper: `(a) capacity + occurrence count from class_occurrences alone` and `(b) booked count from bookings inner-joined to class_occurrences`. Both share the same `occurrenceWhere` predicate; divide booked/capacity in JS.
- **Files modified:** `apps/staff-web/app/routes/gymos.analytics.tsx`
- **Verification:** Two-query approach mirrors the established pattern in `gymos.members.tsx` (separate granted-sum and debit-sum queries with `// We deliberately do NOT chain a second leftJoin ... fan-outs the rows ... would double-count granted.`).
- **Committed in:** `ca26019e`

**5. [Rule 1 - Bug] shadcn `CardTitle` default has the UI-SPEC-disallowed font size**
- **Found during:** Task 1
- **Issue:** `apps/staff-web/app/components/ui/card.tsx:39` defines `CardTitle` with `text-2xl font-semibold ...`. UI-SPEC checker disallowed that size as a 5th undeclared font size.
- **Fix:** Render the metric label as a plain `<div>` with `text-[12px] uppercase tracking-wide text-muted-foreground` inside `CardHeader`, bypassing `CardTitle` entirely. (Alternative: pass `className="text-[12px]"` to `CardTitle`, but Tailwind class precedence + `cn()` make the override fragile; the plain div is cleaner.)
- **Files modified:** `apps/staff-web/app/routes/gymos.analytics.tsx`
- **Verification:** `grep -c text-2xl gymos.analytics.tsx` → 0.
- **Committed in:** `ca26019e`

---

**Total deviations:** 5 auto-fixed (all Rule 1 — bug fixes; all directly tied to plan-template errors discovered at implementation time)
**Impact on plan:** All five fixes were necessary for the file to compile and meet UI-SPEC. No scope creep; final file does exactly what the plan's `must_haves.truths` say it does.

## Issues Encountered

- **Sibling typecheck error in `gymos._index.tsx`** — Plan 05's territory; `~/components/gymos/TemplatesDialog` import. Documented in `.planning/phases/P1b.1-customer-pilot-enablement/deferred-items.md` for the Plan 05 agent to fix.

## Pilot Baseline Metrics (Pitfall 6 note)

Live percentage values not measured in this plan — the Plan 06 executor is non-interactive and does not run the dev server. Verification of real seeded values is owed to **Plan 08** (end-to-end verification) which boots `pnpm --filter staff-web dev` and opens `/gymos/analytics`.

**Pitfall 6 (from RESEARCH.md):** seeded occurrences are dated **May 18-22 2026**. With today as **2026-05-25**, the 7-day window (covering 2026-05-18 → 2026-05-25) catches the seeded data. **On 2026-05-26 the seeded occurrences will drop out of the 7d window** and the Fill Rate card will show `–` / "No data yet" for the 7d slot. The 30d card will hold until ~mid-June. After ~7 days into pilot, real bookings need to flow in for sustained metrics. The Cancellation Rate card depends on `bookings.bookedAt`, not `class_occurrences.startsAt` — bookings created during the pilot stay in window relative to their creation time, so that card will track real coach activity.

## Parallel-Execution Confirmation

- Loader uses `Promise.all` over five aggregation closures — confirmed by `grep -c Promise.all` → 2 occurrences (one for the data, one in the comment header).
- Each closure runs its own awaited `db.select()` queries; the closures themselves run concurrently inside `Promise.all` (`fillRate(7d)` + `fillRate(30d)` + `cancellationRate(7d)` + `cancellationRate(30d)` + `passUtilisation()`).
- Inside `fillRate`, the two sub-queries run sequentially (capRow then bookRow) — acceptable because the outer `Promise.all` already parallelises across the 5 metric groups. Could be tightened to a nested Promise.all in P2 if latency budgets bite, but for ~30 ms aggregations against Neon Postgres it isn't justified.

## Self-Check: PASSED

- FOUND: `apps/staff-web/app/routes/gymos.analytics.tsx` (291 lines)
- FOUND: `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-06-analytics-route-SUMMARY.md`
- FOUND: commit `ca26019e` in `git log --oneline --all`

## Next Phase Readiness

- `/gymos/analytics` route is reachable from the existing Analytics tab in `GymosTopNav` — no nav wiring left.
- The route renders inside the bare gymos layout (depends on plan 01's `AppLayout` branch).
- Plan 08 (end-to-end verification) is unblocked for this route — it can boot the dev server, navigate to `/gymos/analytics`, and screenshot the three populated metric cards.
- Plan 05's typecheck error in `gymos._index.tsx` is documented in `deferred-items.md` so its agent picks it up.

## Known Stubs

None. All three metric cards are fully wired to live Drizzle aggregations against the Neon database. The "Pass Utilisation" 30d card duplicates the snapshot value (with "Snapshot — all active passes" context) because pass utilisation is intentionally a point-in-time view; this is documented in the card label, not a stub.

---
*Phase: P1b.1-customer-pilot-enablement*
*Plan: 06*
*Completed: 2026-05-25*
