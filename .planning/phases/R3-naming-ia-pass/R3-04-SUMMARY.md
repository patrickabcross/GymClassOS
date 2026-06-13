---
phase: R3-naming-ia-pass
plan: 04
subsystem: ui
tags: [route-rename, redirect-shim, naming, gym-domain, staff-web, name-03, name-05, r-06]

# Dependency graph
requires:
  - phase: R3-naming-ia-pass
    plan: 03
    provides: Gym-domain component/page identifiers; MessagesPage/ConversationList complete
provides:
  - "Route /gymos/messages serves the messaging surface (was /gymos/inbox)"
  - "Route /gymos/inbox is a 301 query-preserving redirect shim to /gymos/messages"
  - "GymosTopNav nav link and active-path check point to /gymos/messages"
  - "gymos.compose.tsx action re-export sourced from gymos.messages"
  - "NAME-05 verified: zero DB schema/enum/migration file changes across R3"
affects: [live-deploy-UAT, Hustle-deep-links]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RR v7 redirect shim: loader({ request }) => redirect('/new${url.search}', 301) — query-preserving permanent redirect from a route module with no default export"
    - "File rename mechanic (route layer): Write new file with full content + renamed export, then overwrite old file with shim — both exist at end; old route is never deleted in R3"

key-files:
  created:
    - apps/staff-web/app/routes/gymos.messages.tsx
  modified:
    - apps/staff-web/app/routes/gymos.inbox.tsx
    - apps/staff-web/app/routes/gymos.compose.tsx
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx

key-decisions:
  - "Shim stays through R3 (D-08): gymos.inbox.tsx NOT deleted — removal is a post-deploy-verification step after curl -I confirms 301 on the live Vercel deploy"
  - "Form action='/gymos/compose' kept unchanged in gymos.messages.tsx — the compose resource route URL is stable; only its re-export source changed (gymos.inbox -> gymos.messages)"
  - "NAME-05 verified by grep: git diff shows zero server/db/schema or migrations/ files changed across all 4 R3 plans"

requirements-completed: [NAME-03, NAME-05]

# Metrics
duration: 5min
completed: 2026-06-13
---

# Phase R3 Plan 04: Route Renames and Shims Summary

**Messaging surface relocated to /gymos/messages; /gymos/inbox converted to a 301 query-preserving redirect shim; GymosTopNav link and active-path check updated; NAME-05 verified — zero DB identifiers changed across the R3 phase**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-13T18:13:21Z
- **Completed:** 2026-06-13T18:18:24Z
- **Tasks:** 3 planned, 3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Task 1: Created `gymos.messages.tsx` with the full relocated surface (loader + action + default export `GymosMessages`). All self-referential `/gymos/inbox` path strings updated to `/gymos/messages` (2x redirect targets in action branches, 2x filter chip `to=` props, 1x conversation list row link, 1x empty-state CTA). Updated `gymos.compose.tsx` re-export source from `./gymos.inbox` to `./gymos.messages`.
- Task 2: Replaced `gymos.inbox.tsx` contents with a 13-line 301 redirect shim. The shim reads `new URL(request.url).search` and forwards it intact to `/gymos/messages${url.search}`, so `?conversation=`, `?filter=leads`, `?sent=1` all survive. No default export — loader-only. Both old and new routes remain live (D-08).
- Task 3: Updated `GymosTopNav.tsx` nav link `to="/gymos/inbox"` → `to="/gymos/messages"` and renamed `isInbox` → `isMessages` (with matching `startsWith("/gymos/messages")`). NAME-05 assertion run: `git diff --name-only` across all R3 commits shows zero changes to `server/db/schema*` or `migrations/` — DB enum values untouched.

## Task Commits

1. **Task 1: Relocate surface to gymos.messages.tsx** — `78bbc71c` (feat)
2. **Task 2: Convert gymos.inbox.tsx to redirect shim** — `8525782a` (feat)
3. **Task 3: GymosTopNav update + NAME-05 verify** — `8a0098e0` (feat)

## Files Created/Modified

### Created
- `app/routes/gymos.messages.tsx` — full messaging surface; export `GymosMessages`; all path strings point to `/gymos/messages`

### Modified
- `app/routes/gymos.inbox.tsx` — 1043 lines → 13 lines; now a loader-only 301 shim with query preservation
- `app/routes/gymos.compose.tsx` — re-export source updated: `./gymos.inbox` → `./gymos.messages`
- `app/components/gymos/GymosTopNav.tsx` — nav link + active-path check: `isInbox`/`/gymos/inbox` → `isMessages`/`/gymos/messages`

## Verification Results

All static/grep verifications passed:

| Check | Result |
|-------|--------|
| `gymos.messages.tsx` exists | PASS |
| `export default function GymosMessages` | PASS (line 634) |
| No `/gymos/inbox` refs in gymos.messages.tsx (non-comment) | PASS |
| `/gymos/messages` count in gymos.messages.tsx >= 6 | PASS (9 occurrences) |
| `gymos.compose.tsx` re-exports from `./gymos.messages` | PASS (line 14) |
| `gymos.compose.tsx` does NOT re-export from `./gymos.inbox` | PASS |
| Shim has `redirect(...url.search..., 301)` | PASS (line 12) |
| Shim has `export function loader` | PASS (line 9) |
| Shim has NO `export default` | PASS (count: 0) |
| Shim is < 25 lines | PASS (13 lines) |
| Both routes exist | PASS |
| `GymosTopNav`: `to="/gymos/messages"` present | PASS (line 71) |
| `GymosTopNav`: `to="/gymos/inbox"` absent | PASS |
| `GymosTopNav`: `isMessages` present | PASS (lines 32, 71) |
| `GymosTopNav`: `isInbox` absent | PASS |
| Phase-wide: no live `to="/gymos/inbox"` refs | PASS |
| Phase-wide: no `navigate("/gymos/inbox")` refs | PASS |
| Fork boundary: only `apps/staff-web/` changed | PASS |
| NAME-05: no `server/db/schema*` or `migrations/` files in diff | PASS |

## HUMAN-UAT Deferred

The following cannot be verified without a running server:

- `curl -I https://<preview>/gymos/inbox` must return `HTTP/301` with `Location: /gymos/messages`
- `curl -I "https://<preview>/gymos/inbox?conversation=<id>"` must redirect preserving `?conversation=<id>`
- `/gymos/messages` renders the messaging surface correctly
- Old `/gymos/inbox` does NOT 404

These are the UAT items for the next Vercel deploy of `redesign/ui-refresh`.

## Decisions Made

- Shim file kept (D-08): `gymos.inbox.tsx` will remain as a shim after R3. Old-route deletion is deferred to after live-deploy UAT confirms the 301 is working.
- `action="/gymos/compose"` left unchanged in `gymos.messages.tsx`: the compose resource route URL stays at `/gymos/compose`; only its internal re-export source changed.
- NAME-05 enforcement confirmed: no DB enum string value, schema column, or migration file was changed in any of the 4 R3 plans (R3-01 through R3-04).

## Deviations from Plan

None — plan executed exactly as written. All ref_inventory items updated atomically per D-06. Shim code matches the verbatim example in the plan's `<rr_v7_redirect_note>`.

## Known Stubs

None — this plan performs route relocation and shim creation. No data, API, rendering logic, or placeholder content was introduced. The messaging surface's existing data connections are unchanged.

## R3 Phase Completion

This is the FINAL plan of Phase R3 (Naming & IA Pass). With R3-04 complete:

- **SC1 (route):** Messaging surface is at `/gymos/messages`; nav links there.
- **SC3 (old route):** `/gymos/inbox` 301-redirects with query preservation; both routes live (D-08).
- **SC6 / NAME-05:** DB enum values + schema columns untouched across the whole phase.
- **NAME-03:** Every renamed route ships a redirect shim; all hardcoded refs updated atomically.

---
*Phase: R3-naming-ia-pass*
*Completed: 2026-06-13*
