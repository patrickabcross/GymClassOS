---
phase: P3-ai-noticeboard-home
plan: "04"
subsystem: routing
tags: [routing, react-router, noticeboard, inbox, top-nav, scaffold]
dependency_graph:
  requires: [gymos._index.tsx (P1b inbox), dashboard_notes, dashboard_tasks, dashboard_proposals (P3-01 tables)]
  provides: [/gymos noticeboard route, /gymos/inbox inbox route, GymosTopNav Home+Inbox tabs]
  affects:
    - apps/staff-web/app/routes/gymos.inbox.tsx
    - apps/staff-web/app/routes/gymos._index.tsx
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
    - apps/staff-web/app/routes/gymos.compose.tsx
tech_stack:
  added: []
  patterns: [react-router-v7-flat-routes, plain-object-loader-return, promise-all-drizzle-loader, guard-allow-unscoped-single-tenant]
key_files:
  created:
    - apps/staff-web/app/routes/gymos.inbox.tsx
  modified:
    - apps/staff-web/app/routes/gymos._index.tsx
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
    - apps/staff-web/app/routes/gymos.compose.tsx
decisions:
  - "Redirect targets in inbox action updated from /gymos to /gymos/inbox so send redirects stay in the inbox route"
  - "Filter-chip nav links updated from /gymos to /gymos/inbox base so Inbox/Leads chips work at the new path"
  - "gymos.compose.tsx re-export updated to gymos.inbox (Rule 3 auto-fix — compose was re-exporting action from _index which no longer has one)"
  - "Noticeboard scaffold uses data-noticeboard-* placeholder divs per plan; Plan 05 replaces them with live components"
metrics:
  duration_seconds: 556
  completed_date: "2026-06-03"
  tasks_completed: 3
  files_changed: 4
---

# Phase P3 Plan 04: Route Restructure Summary

Inbox relocated verbatim to `/gymos/inbox`; noticeboard scaffold owns `/gymos`; GymosTopNav gains Home tab and Inbox points at `/gymos/inbox`. tsc clean. SC-1 structural foundation in place for Plan 05.

## What Was Built

### Task 1: gymos.inbox.tsx — inbox at /gymos/inbox

`apps/staff-web/app/routes/gymos.inbox.tsx`

Full verbatim copy of the old `gymos._index.tsx` inbox. React Router v7 flat-file routing auto-registers `gymos.inbox.tsx` as `/gymos/inbox` under the `gymos.tsx` Outlet — no route config change needed.

Changes from the original (path-adjustment only):
- `redirect("/gymos?conversation=...")` → `redirect("/gymos/inbox?conversation=...")` (both action branches: send-text and send-template)
- Filter-chip `to="/gymos"` → `to="/gymos/inbox"` (Inbox chip)
- Filter-chip `to="/gymos?filter=leads"` → `to="/gymos/inbox?filter=leads"` (Leads chip)
- Conversation list `to="/gymos?conversation=..."` → `to="/gymos/inbox?conversation=..."` (deep links)
- Empty-state CTA `to="/gymos?conversation=..."` → `to="/gymos/inbox?conversation=..."` (first-thread link)
- `Form action="/gymos/compose"` unchanged — this targets the compose resource route, not the inbox itself

`enqueueOutboundWhatsApp`, `TemplatesDialog`, loader, action, all exported functions — preserved exactly.

### Task 2: gymos._index.tsx — noticeboard scaffold at /gymos

`apps/staff-web/app/routes/gymos._index.tsx`

Overwritten with the noticeboard route:

- `meta()` returns `GymClassOS — Home`
- `loader()`: `Promise.all` of three Drizzle selects:
  - `dashboardNotes` — all rows (ai_today + 4 section notes)
  - `dashboardTasks` filtered `status='open'` ordered by `priority ASC, createdAt ASC`
  - `dashboardProposals` filtered `status='pending'`
  - `guard:allow-unscoped` marker (single-tenant gym tables)
- Default export `Noticeboard`: board container `flex flex-col gap-4 p-6 h-full overflow-y-auto bg-muted/40` with three placeholder divs: `data-noticeboard-ai-today`, `data-noticeboard-cards`, `data-noticeboard-tasks`

Plan 05 replaces the placeholder divs with `AiTodayStrip`, `BoardCard` grid, and `TasksSection` components.

### Task 3: GymosTopNav — Home + Inbox tabs

`apps/staff-web/app/components/gymos/GymosTopNav.tsx`

- `isHome = path === "/gymos"` (exact-match for noticeboard)
- `isInbox = path.startsWith("/gymos/inbox")` (prefix-match for inbox route + sub-paths)
- Home tab added as first link (`to="/gymos"`, active on `isHome`)
- Inbox tab repointed from `/gymos` to `/gymos/inbox` (active on `isInbox`)
- Final tab order: Home | Inbox | Schedule | Members | Payments | Analytics | Campaigns | Forms | Settings | Sign out

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gymos.compose.tsx re-exported action from gymos._index which no longer exists there**

- **Found during:** Task 2 tsc verification
- **Issue:** `gymos.compose.tsx` line 13: `export { action } from "./gymos._index"` — after Task 2 overwrote `_index.tsx` with the noticeboard (no action export), tsc reported `Module '"./gymos._index"' has no exported member 'action'`
- **Fix:** Updated `gymos.compose.tsx` to `export { action } from "./gymos.inbox"` — the inbox now lives at `gymos.inbox.tsx` which does export `action`
- **Files modified:** `apps/staff-web/app/routes/gymos.compose.tsx`
- **Commit:** `04c233a4` (included in Task 2 commit)

## Key Decisions

- **Self-referential redirect repoint:** The action function in the inbox previously redirected to `/gymos?conversation=<id>` — now redirects to `/gymos/inbox?conversation=<id>` so after sending a message the thread stays in the inbox route, not the noticeboard
- **Filter-chip links repointed:** The Inbox/Leads filter chips inside the conversation list sidebar used `/gymos` and `/gymos?filter=leads` as href targets — updated to `/gymos/inbox` and `/gymos/inbox?filter=leads` respectively
- **Form action to /gymos/compose preserved:** This form targets a separate resource route and must not change
- **gymos.compose.tsx updated in same commit as Task 2:** The blocking tsc error required updating compose.tsx atomically with the _index overwrite; documented as Rule 3 deviation

## Known Stubs

The noticeboard scaffold contains three placeholder `div` elements (`data-noticeboard-ai-today`, `data-noticeboard-cards`, `data-noticeboard-tasks`). These are intentional scaffolding stubs — they render as empty divs on the `/gymos` route until Plan 05 replaces them with `AiTodayStrip`, `BoardCard` grid, and `TasksSection` components. The plan's goal (SC-1 structural foundation) is fully achieved; the stubs are the defined output of Plan 04.

## Commits

| Commit | Description |
|---|---|
| `af8bc7fe` | feat(P3-04): add gymos.inbox.tsx — inbox relocated verbatim to /gymos/inbox |
| `04c233a4` | feat(P3-04): replace gymos._index.tsx with noticeboard route (loader + scaffold) |
| `72e0ae98` | feat(P3-04): update GymosTopNav — add Home tab, repoint Inbox to /gymos/inbox |

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/staff-web/app/routes/gymos.inbox.tsx` exists | FOUND |
| `gymos.inbox.tsx` contains `enqueueOutboundWhatsApp` | FOUND |
| `gymos.inbox.tsx` contains `export async function loader` | FOUND |
| `gymos.inbox.tsx` contains `export async function action` | FOUND |
| `gymos.inbox.tsx` contains `TemplatesDialog` | FOUND |
| `gymos.inbox.tsx` has NO bare `action="/gymos"` form target | VERIFIED |
| `gymos.inbox.tsx` redirects to `/gymos/inbox?conversation=` | VERIFIED |
| `gymos._index.tsx` contains `schema.dashboardNotes` | FOUND |
| `gymos._index.tsx` contains `schema.dashboardTasks` | FOUND |
| `gymos._index.tsx` contains `schema.dashboardProposals` | FOUND |
| `gymos._index.tsx` has NO `enqueueOutboundWhatsApp` | VERIFIED |
| `gymos._index.tsx` has NO `TemplatesDialog` | VERIFIED |
| `gymos._index.tsx` meta title is `GymClassOS — Home` | VERIFIED |
| `gymos._index.tsx` contains `bg-muted/40` and `p-6` | VERIFIED |
| `gymos._index.tsx` contains `guard:allow-unscoped` | VERIFIED |
| `GymosTopNav.tsx` has `isHome = path === "/gymos"` | VERIFIED |
| `GymosTopNav.tsx` has `isInbox = path.startsWith("/gymos/inbox")` | VERIFIED |
| `GymosTopNav.tsx` has `to="/gymos"` Home tab | VERIFIED |
| `GymosTopNav.tsx` has `to="/gymos/inbox"` Inbox tab | VERIFIED |
| `gymos.compose.tsx` re-exports from `./gymos.inbox` | VERIFIED |
| tsc --noEmit exits 0 (all 3 tasks + Rule 3 fix) | PASSED |
| Commit `af8bc7fe` exists | FOUND |
| Commit `04c233a4` exists | FOUND |
| Commit `72e0ae98` exists | FOUND |
