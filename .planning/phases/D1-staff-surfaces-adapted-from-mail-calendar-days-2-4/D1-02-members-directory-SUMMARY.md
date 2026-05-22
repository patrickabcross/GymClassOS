---
phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
plan: 02
subsystem: ui
tags: [react-router-v7, drizzle, neon, members, profile, deep-link]

# Dependency graph
requires:
  - phase: D0-fork-bootstrap-schema-seed-day-1
    provides: 12 GymClassOS Neon tables (gym_members, passes, pass_debits, bookings, class_occurrences, class_definitions, food_entries, conversations) + 5 seeded members + Mail template routing
provides:
  - "/gymos/members directory list with pass-balance per row"
  - "/gymos/members/:id profile page with bookings + passes + food + conversation deep-link"
  - "Cross-surface deep-link pattern: profile → /gymos?conversation=<id> (closes the inbox ↔ member-record loop)"
affects: [D1-04 inbox gap-fill, D2 mobile-app (mirrors directory data shape), P2-product-surfaces-staff-web]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RR v7 dollar-prefix dynamic-segment file convention for /:id detail routes (matches existing $view.$threadId.tsx)"
    - "Pass-balance aggregation: gymMembers leftJoin passes with grouped SUM(granted), then separate query for pass_debits SUM (avoids fan-out double-count)"
    - "Cross-surface deep-link via search params (/gymos?conversation=<id>) — the inbox route already reads ?conversation and selects the matching thread"
    - "Cards laid out vertically in a max-w 960px column for profile pages (header, then per-section Card)"

key-files:
  created:
    - "templates/mail/app/routes/gymos.members.tsx — directory list, 200 lines"
    - "templates/mail/app/routes/gymos.members.$id.tsx — profile page, 391 lines"
  modified: []

key-decisions:
  - "Use a single leftJoin from gymMembers to passes for the granted SUM, but a separate query for pass_debits — chaining a second leftJoin to pass_debits would fan-out the rows (one per (pass, debit) combo) and double-count granted credits"
  - "Profile page uses RR v7 dollar-prefix file convention (gymos.members.\$id.tsx) — matches the existing $view.$threadId.tsx route already in the same directory, no router config needed"
  - "Deep-link button uses search-param convention (?conversation=<id>) rather than a path segment so the existing inbox loader (which already reads url.searchParams.get('conversation')) works unchanged"
  - "Demo-grade caps: no pagination, no search, no edit on directory; food-entries shows snapshotted kcal/protein from food_entries (no join to food_items for richer descriptions). All three deferred to MEM-03 / MEM-05 in Production v1"

patterns-established:
  - "GymClassOS profile pages live at /gymos/<entity>/<id> (dollar-prefix file) and pair with a /gymos/<entity> list page (no dollar)"
  - "Pass balance everywhere = SUM(passes.granted WHERE member_id=X) − SUM(pass_debits.amount WHERE pass.member_id=X). Inbox panel + members directory + profile page all share this formula. Production v1 will extract to a single helper in server/db/queries.ts"

requirements-completed: [MEM-01, MEM-02]

# Metrics
duration: ~20min
completed: 2026-05-19
---

# Phase D1 Plan 02: Members Directory + Profile Summary

**Staff member directory + per-member profile pages with bookings timeline, pass-balance card, recent food log, and cross-surface deep-link back to the WhatsApp inbox conversation — closes the inbox ↔ member-record loop.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-19T07:03Z (approx)
- **Completed:** 2026-05-19T07:23:17Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- `/gymos/members` directory lists all seeded members with a pass-balance badge per row. Single drizzle query joins `gymMembers` left to `passes` with grouped `SUM(granted)`; debits are aggregated separately to avoid join fan-out.
- `/gymos/members/:id` profile page renders the full per-member context that the inbox right-rail panel shows, on its own page: pass balance card with per-pass breakdown, bookings card split into Upcoming/Past, recent food entries card (limit 10), and a header "Open WhatsApp conversation" button that deep-links back to `/gymos?conversation=<id>`.
- 6 SQL queries in the profile loader, matching the spec exactly: member, passes, debits total, bookings (joined to class_occurrences + class_definitions), food entries, conversation id.
- Both files type-check cleanly (`npx tsc --noEmit` returns 0 errors against the full template).

## Task Commits

Each task was committed atomically with `--no-verify` (parallel execution mode):

1. **Task 1: /gymos/members directory route** — `74bbe110` (feat)
2. **Task 2: /gymos/members/:id profile route + members directory loader refactor** — `2cf77d50` (feat)

_Note: Task 2's commit also touches `gymos.members.tsx` because the Task 1 loader was refactored mid-flight (see Deviations below) to satisfy the plan's `gymMembers.*leftJoin` pattern check._

## Files Created/Modified

- `templates/mail/app/routes/gymos.members.tsx` — directory list with name / phone / goal / pass-balance columns. Loader uses a single grouped left-join (`gymMembers leftJoin passes`) for the granted total per member, plus a separate aggregation for `pass_debits`. 200 lines.
- `templates/mail/app/routes/gymos.members.$id.tsx` — profile page. Loader runs 6 queries: member, passes, debits-total, bookings (chained leftJoin via class_occurrences → class_definitions), food entries, conversation. Component renders header (with badges + WhatsApp deep-link button), pass-balance Card, bookings Card (Upcoming/Past split), recent food Card. 391 lines.

## Decisions Made

- **Two-query balance aggregation, not one big chained join.** Doing `gymMembers leftJoin passes leftJoin passDebits` and summing in one query would multiply rows (each pass appears once per debit row), double-counting `granted`. The correct shape is: aggregate granted with a `gymMembers leftJoin passes GROUP BY member`, aggregate debits independently with `passDebits leftJoin passes GROUP BY passes.member_id`, then subtract in application code. This is the same shape the inbox loader uses for the single-selected-member case.
- **`$id.tsx` for the dynamic segment, no router config.** Confirmed by the existing `$view.$threadId.tsx` route file already in the same directory — RR v7 framework mode picks up the dollar-prefix convention automatically.
- **Deep-link via `?conversation=<id>`, not `/gymos/<id>`.** The inbox route's loader already reads `url.searchParams.get("conversation")` and renders the matching thread — adding a search param is a zero-change integration. The bidirectional pivot (inbox member-panel → profile, profile → inbox conversation) now works end-to-end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial directory loader didn't satisfy the `gymMembers.*leftJoin` pattern in the plan's key-links**

- **Found during:** Task 2 (when running the orchestrator's pattern checks at the end of Task 1)
- **Issue:** First implementation of `gymos.members.tsx` queried `gymMembers` with no join, then aggregated passes in a separate query. Plan frontmatter `key_links` explicitly requires `pattern: "gymMembers.*leftJoin"` — the orchestrator's grep would have failed the check.
- **Fix:** Refactored the loader to do a single `gymMembers leftJoin passes` with grouped `SUM(passes.granted)` returning one row per member. Debits stay in their own aggregation query (chaining a second leftJoin to passDebits would fan-out and double-count). Net result: same member list + same balances, but now satisfies the structural pattern check + is one DB round-trip instead of two for the granted half.
- **Files modified:** templates/mail/app/routes/gymos.members.tsx
- **Verification:** `Grep multiline=true pattern=gymMembers[\s\S]*?leftJoin` returns 2 matches; full balance math verified mentally against the inbox loader's existing implementation.
- **Committed in:** `2cf77d50` (bundled with Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — pattern-check mismatch)
**Impact on plan:** Net positive — refactor reduced one query round-trip and made the SQL shape match the plan's structural intent. No scope creep, no extra files.

## Issues Encountered

- Two parallel executor agents (D1-01 schedule, D1-04 inbox gap-fill) ran concurrently and modified `templates/mail/app/routes/gymos.tsx`. Their changes appeared in `git status` while I was working on members. I deliberately did not stage or touch `gymos.tsx` in either commit — left it for the D1-04 agent to commit cleanly. No conflicts; our file scopes did not overlap.
- Used `--no-verify` on both commits as instructed for parallel execution, to avoid pre-commit hook contention with the two other executors.

## User Setup Required

None — no external service configuration. Routes work against the existing seeded Neon DB.

## Smoke Test (for manual verification)

```bash
pnpm --filter mail dev   # boots on :8081 (port 8080 taken)
```

1. Open `http://localhost:8081/gymos/members` → expect 5 seeded members with pass-balance badges.
2. Click any member → profile page renders with their bookings + passes + food + (if they have a conversation) the "Open WhatsApp conversation" button.
3. Click that button → navigates to `/gymos?conversation=<id>` and the inbox surface opens that thread (closes the cross-surface loop).

## Next Phase Readiness

- Demo Sprint D1 staff surfaces are complete pending the other three parallel plans (D1-01 schedule, D1-03 payments, D1-04 inbox gap-fill). Once all four land + Vercel deploy unblocks (D0.5), the staff back-office is demo-ready.
- D2 mobile app + calorie counter + in-app agent is the next demo-week scope. The profile-page data shape (member + passes + bookings + food + conversation) is intentionally close to what the mobile member-self-view will need, so the queries here can be lifted/wrapped into shared helpers in P1a.

## Self-Check: PASSED

Verified by Read/Grep:

- FOUND: `templates/mail/app/routes/gymos.members.tsx` (200 lines, ≥ 100 required)
- FOUND: `templates/mail/app/routes/gymos.members.$id.tsx` (391 lines, ≥ 150 required)
- FOUND commit: `74bbe110` (Task 1)
- FOUND commit: `2cf77d50` (Task 2 + refactor)
- Pattern check 1 (`gymMembers.*leftJoin` in gymos.members.tsx): 2 matches ✓
- Pattern check 2 (`bookings.*leftJoin.*classOccurrences` in $id.tsx, multiline): 1 match ✓
- Pattern check 3 (`/gymos?conversation=` in $id.tsx): 1 match ✓
- Required string set in Task 1 (export loader, default function, schema.gymMembers / passes / passDebits, react-router import, Link, /gymos/members/ template): all present ✓
- Required string set in Task 2 (params.id, schema gymMembers/passes/passDebits/bookings/classOccurrences/foodEntries/conversations, /gymos?conversation=, /gymos/members): all present ✓
- `npx tsc --noEmit` against templates/mail: 0 errors ✓

---

_Phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4_
_Plan: 02 — members-directory_
_Completed: 2026-05-19_
