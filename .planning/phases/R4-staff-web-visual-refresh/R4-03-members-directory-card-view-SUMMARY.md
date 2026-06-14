---
phase: R4-staff-web-visual-refresh
plan: "03"
subsystem: staff-web
tags: [members, directory, card-view, tabs, avatar, badges, search, ui]
dependency_graph:
  requires: [R2-design-system-token-layer, R3-naming-ia-pass]
  provides: [card-default-members-directory]
  affects: [gymos.members.tsx]
tech_stack:
  added: []
  patterns:
    - shadcn Tabs with URL search param (?view) for persistent view toggle
    - MembershipBadge component with Expiring/Active/No Pass/Lead states
    - guard:allow-unscoped pattern for single-tenant gym table queries
    - Additive loader query for next-upcoming-class per member (bookings→occurrences→definitions join)
key_files:
  created: []
  modified:
    - apps/staff-web/app/routes/gymos.members.tsx
decisions:
  - Card view is primary (no ?view param = cards), table is secondary (?view=table)
  - Membership badge order: Expiring (balance 1-2) → Active (balance > 0) → No Pass → Lead
  - guard:allow-color for text-amber-700 (expiring semantic amber, not a brand color)
  - Used sql template literal for the startsAt > now filter (not gt()) to avoid Drizzle type complexity with text-stored ISO dates
metrics:
  duration_seconds: 172
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_modified: 1
---

# Phase R4 Plan 03: Members Directory Card View Summary

**One-liner:** shadcn Tabs card/table toggle on members directory — card-default grid with Avatar initials, membership status badge (Expiring/Active/No Pass/Lead), next class, pass balance; table secondary via ?view=table URL param.

## What Was Built

Rebuilt `apps/staff-web/app/routes/gymos.members.tsx` (SWEB-05) in two tasks:

**Task 1 — Loader: nextClassByMember query**

Added an additive Drizzle query to the loader that fetches each member's earliest upcoming booked class. The query joins `bookings → classOccurrences → classDefinitions` filtering on `status = 'booked'` and `startsAt > now`, ordered ascending, then reduces to a `Record<string, { className, startsAt }>` keeping only the earliest per member. Returns `nextClassByMember` alongside the existing `members` and `balances` without modifying either.

**Task 2 — Card-default directory with Tabs card/table toggle**

Replaced the previous single grid-table layout with:

- **Search** (`<Input>` with `IconSearch`) positioned above the Tabs, filtering both views identically via the existing `filtered` array.
- **shadcn `<Tabs>`** driven by `useSearchParams()` — `const view = searchParams.get("view") === "table" ? "table" : "cards"`. No `?view` param = cards (default). Setting `?view=table` selects the table tab. Tab change updates the URL param immediately (optimistic URL state — no blocking round-trip).
- **Cards view** (`lg:grid-cols-3` grid): each member is a clickable shadcn `<Card>` wrapped in a `<Link>` to the member profile. Card shows Avatar with initials fallback, name, `<MembershipBadge>` (see below), next class line (omitted if none), pass balance.
- **MembershipBadge** sub-component: Expiring soon (balance 1-2 credits, `variant="secondary"` + `text-amber-700` with `guard:allow-color` comment), Active (balance > 0, `variant="default"`), No Pass (`variant="outline"`), Lead (`variant="secondary"`).
- **Table view** (`?view=table`): compact `<table className="text-[12px]">` with headers `text-[11px] uppercase tracking-wide text-muted-foreground`. Columns: Name | Pass Balance | Next Class | Member Since. Rows navigate to profile on click. No avatar in table (spec §4: space efficiency).
- **Empty states**: `EmptyState` component renders `IconUsers` + "No members yet / Members appear here when they join or enquire." when no members exist, or `IconSearch` + "No members found / Try a different name or phone number." when search returns no results. Both exact per Copywriting Contract.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `a3e047ed` | feat(R4-03): add nextClassByMember loader query to members directory |
| Task 2 | `510f6e87` | feat(R4-03): card-default members directory with Tabs card/table toggle |

## Deviations from Plan

**1. [Rule 1 - Bug] Removed unused `gt` import from drizzle-orm**

- **Found during:** Task 2 cleanup
- **Issue:** `gt` was imported but not used — the `startsAt > now` filter was implemented as a raw `sql` template literal (safer for text-stored ISO date strings in Neon Postgres) rather than `gt()` which expects typed column comparisons.
- **Fix:** Removed `gt` from the drizzle-orm import line.
- **Files modified:** `apps/staff-web/app/routes/gymos.members.tsx`
- **Commit:** included in `510f6e87`

## Known Stubs

None. All data is wired from the loader. `nextClassByMember` gracefully returns nothing for members with no upcoming bookings; the card simply omits the "Next class" line in that case.

## Self-Check: PASSED

- `apps/staff-web/app/routes/gymos.members.tsx` — exists and modified (confirmed via edits)
- Commit `a3e047ed` — Task 1 (loader query)
- Commit `510f6e87` — Task 2 (card-default + Tabs)
- `node scripts/guard-no-hardcoded-colors.mjs` — exits 0
- All 8 grep acceptance criteria — all return matches
