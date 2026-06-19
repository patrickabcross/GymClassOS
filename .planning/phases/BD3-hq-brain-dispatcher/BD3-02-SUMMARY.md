---
phase: BD3
plan: "02"
subsystem: hq-brain-ui
tags: [studio-console, health-badges, cohort-filter, recharts, ssr-guard, ClientOnly, drill-in]
dependency_graph:
  requires: [BD3-01]
  provides: [HQB-01-console-ui, HQB-04-cohort-filter, HQB-05-drill-in-charts, GET-api-studios-id-snapshots]
  affects: []
tech_stack:
  added:
    - "recharts@2.15.4 (pinned 2.x; 3.x was latest but plan required 2.x stable)"
  patterns:
    - "ClientOnly from @agent-native/core/client wraps all recharts components (Pitfall 6 SSR guard)"
    - "Health badge driven exclusively by health.status — stale never renders green (HQB-03)"
    - "Cohort filter as Button group (computed client-side, no stored rows — D-04)"
    - "Progressive disclosure for signals: expandable list, not always-visible"
    - "Resource route pattern mirrors api.provisioning-runs.ts / api.studios.ts"
key_files:
  created:
    - apps/hq/app/routes/api.studios.$id.snapshots.ts
    - apps/hq/app/routes/studios._index.tsx
    - apps/hq/app/routes/studios.$id.tsx
  modified:
    - apps/hq/package.json (recharts 2.15.4 added)
    - apps/hq/app/lib/brain.ts (Studios nav entry added)
    - pnpm-lock.yaml
decisions:
  - "recharts pinned to 2.15.4 (2.x latest stable) — plan explicitly forbids 3.x beta; 3.x is current latest but 2.x has no API churn risk"
  - "ClientOnly children must be ReactNode (not render prop) — this ClientOnly implementation takes children: ReactNode, not () => JSX; plan showed a render-prop pattern that is wrong for this codebase; fixed inline"
  - "ChartCard.dataKey widened to string — TokenPoint adds totalTokens field not in keyof StudioSnapshotPoint; string key avoids the TS2322 type error while keeping recharts happy"
  - "Studios nav item added to navItems in brain.ts — sidebar uses that array; provisioning.tsx pattern already did this for Provisioning"
metrics:
  duration_seconds: 711
  completed_date: "2026-06-19"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 3
---

# Phase BD3 Plan 02: HQB Console UI + Drill-In Charts Summary

**One-liner:** Operator console (`/studios`) + per-studio drill-in (`/studios/:id`) with health badges, cohort filter, and SSR-guarded recharts telemetry history charts consuming the BD3-01 read model.

## What Was Built

### Task 1: recharts install + `/api/studios/:id/snapshots` history route

recharts 2.15.4 added to `apps/hq/package.json` (pinned, not caret).

`apps/hq/app/routes/api.studios.$id.snapshots.ts` — new resource route `GET /api/studios/:id/snapshots`. Drizzle query selects all `hq_telemetry_snapshots` rows for the given `studioId` ordered by `period_start ASC`. Each row's `payload_json` is parsed and projected to a flat `StudioSnapshotPoint` time-series point (`periodStart`, `periodEnd`, `receivedAt`, `activeMembers`, `bookings`, `messagesSent`, `retentionRate`, `llmInputTokens`, `llmOutputTokens`). Malformed JSON rows are skipped (flatMap). Returns `StudioSnapshotsResponse { studioId, displayName, points[] }`. Carries `guard:allow-unscoped` comment.

### Task 2: `/studios` console list route (HQB-01, HQB-04)

`apps/hq/app/routes/studios._index.tsx` — operator console listing all studios from `GET /api/studios`. Uses shadcn `Table` with columns: Display name (link to drill-in), Health badge, Cohort, Last telemetry (relative), Active members, Messages sent, Retention (%), Tokens (30d), Signals (expandable).

**Health badge mapping (keyed on `health.status` — NEVER on raw numbers):**
- `stale` → grey Badge + IconClock (HQB-03 guarantee: never green)
- `at-risk` → red Badge + IconAlertTriangle
- `dormant` / `under-messaging` / `low-retention` → amber Badge + IconAlertTriangle
- `healthy` → green Badge + IconActivity (only reached when `isStale === false` and no at-risk signals)

**Cohort filter (HQB-04):** Button group with All / At-risk / Power-user tabs. Filters `data.studios` client-side by `health.cohort`. At-risk tab includes both `cohort === "at-risk"` and `cohort === "unknown"` (stale studios need attention too).

**Progressive disclosure:** `SignalsDetail` component shows a collapsible button with count; signals list expands on click. Not always-visible.

Studios nav entry added to `navItems` in `apps/hq/app/lib/brain.ts` with `IconBuilding` icon.

### Task 3: `/studios/:id` drill-in with recharts (SSR-guarded) (HQB-05)

`apps/hq/app/routes/studios.$id.tsx` — per-studio detail route. Reads `id` via `useParams()`, fetches `/api/studios/${id}/snapshots` on mount, renders four `ChartCard` panels in a 2-column responsive grid:

1. Active members over time (`dataKey="activeMembers"`)
2. Messages sent over time (`dataKey="messagesSent"`)
3. Retention rate (%) over time (`dataKey="retentionRate"`, formatter `v => ${(v*100).toFixed(0)}%`)
4. Token usage (input + output) over time (`dataKey="totalTokens"` via `addTokenSum()` helper)

Each chart: `ResponsiveContainer > LineChart > CartesianGrid + XAxis (MM-DD dates) + YAxis + Tooltip + Line (monotone, no dots)`.

**SSR guard (Pitfall 6):** Every `ResponsiveContainer` + `LineChart` tree is wrapped in `<ClientOnly fallback={<Skeleton/>}>` from `@agent-native/core/client`. The Skeleton renders on the server; the actual chart mounts after hydration. Without this, Vercel SSR throws `ReferenceError: window is not defined`.

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 (recharts + snapshots route) | `434d87aa` | feat(BD3-02): recharts 2.15.4 + GET /api/studios/:id/snapshots history route |
| Task 2 (console list route) | `421b4b88` | feat(BD3-02): HQB operator console /studios with health badges + cohort filter |
| Task 3 (drill-in + charts) | `a3d30c2c` | feat(BD3-02): per-studio drill-in /studios/:id with recharts + ClientOnly SSR guard |

## Verification Results

- `pnpm -F @gymos/hq exec tsc --noEmit` — clean (exit 0) after each task
- `node scripts/guard-hq-fork-boundary.mjs` — clean (no apps/hq imports into templates/)
- No local HTTP walkthrough (P1c) — SSR safety asserted structurally via ClientOnly grep
- recharts pinned to 2.15.4 in apps/hq/package.json

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ClientOnly render-prop pattern incompatible with this implementation**
- **Found during:** Task 3 typecheck — `TS2322: Type '() => JSX.Element' is not assignable to type 'ReactNode'`
- **Issue:** The plan's recommended pattern `<ClientOnly>{() => (<ResponsiveContainer>...)}</ClientOnly>` uses a render prop, but `@agent-native/core/client`'s `ClientOnly` component signature is `children: ReactNode` (not a render function). The pattern in `root.tsx` also uses direct children.
- **Fix:** Changed to direct JSX children inside `ClientOnly` — `<ClientOnly fallback={...}><ResponsiveContainer>...</ResponsiveContainer></ClientOnly>`. Same SSR-safety guarantee; correct types.
- **Files modified:** `apps/hq/app/routes/studios.$id.tsx`
- **Commit:** `a3d30c2c`

**2. [Rule 1 - Bug] ChartCard.dataKey type too narrow for TokenPoint derived field**
- **Found during:** Task 3 typecheck — `TS2322: Type '"totalTokens"' is not assignable to type 'keyof StudioSnapshotPoint'`
- **Issue:** `TokenPoint` extends `StudioSnapshotPoint` with `totalTokens: number`. Passing `dataKey="totalTokens"` failed because `ChartCardProps.dataKey` was typed as `keyof StudioSnapshotPoint` which doesn't include `totalTokens`.
- **Fix:** Widened `dataKey` to `string` and `data` to `any[]` in `ChartCardProps`. The trade-off (less type safety on props) is acceptable — recharts consumes the key as a string internally; the type narrowness had no runtime benefit.
- **Files modified:** `apps/hq/app/routes/studios.$id.tsx`
- **Commit:** `a3d30c2c`

## Known Stubs

None. All three routes are fully wired:
- `/api/studios` — reads real `hq_telemetry_snapshots` + `hq_token_usage` (BD3-01)
- `/api/studios/:id/snapshots` — reads real `hq_telemetry_snapshots` rows
- `/studios` — fetches and renders real `StudiosResponse` from the API
- `/studios/:id` — fetches and renders real `StudioSnapshotsResponse` history

The data will show "No telemetry history yet" empty states until the studio worker pushes snapshots, which is the correct empty state — not a stub.

## Self-Check

Files created/modified:

- [x] `apps/hq/app/routes/api.studios.$id.snapshots.ts` — exists
- [x] `apps/hq/app/routes/studios._index.tsx` — exists
- [x] `apps/hq/app/routes/studios.$id.tsx` — exists
- [x] `apps/hq/package.json` — contains `"recharts": "2.15.4"`
- [x] `apps/hq/app/lib/brain.ts` — contains Studios nav entry with IconBuilding

Commits:

- [x] `434d87aa` — Task 1 (recharts + snapshots route)
- [x] `421b4b88` — Task 2 (console list)
- [x] `a3d30c2c` — Task 3 (drill-in + charts)

## Self-Check: PASSED
