---
phase: BD1-hq-foundation
plan: "01"
subsystem: apps/hq
tags: [hq, scaffold, fork, dispatch, brain, react-router-v7]
dependency_graph:
  requires: []
  provides: [HQ-FND-02-scaffold, apps/hq-shell]
  affects: [BD1-02, BD1-03, BD1-04, BD1-05, BD1-06]
tech_stack:
  added: []
  patterns:
    - "Copy-out fork: templates/dispatch + templates/brain → apps/hq; templates/ never edited"
    - "Brain UI components placed at @/components/ui/ and @/components/brain/ to match @/ alias"
    - "Brain server lib at server/lib/ (flat, not nested) to preserve relative import paths"
    - "Brain schema merged into dispatch schema via mergedSchema in server/db/index.ts"
    - "Action filename collision avoidance: brain-run.ts, brain-navigate.ts, brain-view-screen.ts"
key_files:
  created:
    - apps/hq/package.json
    - apps/hq/react-router.config.ts
    - apps/hq/vite.config.ts
    - apps/hq/tsconfig.json
    - apps/hq/ssr-entry.ts
    - apps/hq/components.json
    - apps/hq/MODIFICATIONS.md
    - apps/hq/app/ (dispatch routes + brain routes under app/routes/brain/)
    - apps/hq/actions/ (dispatch actions + brain actions)
    - apps/hq/server/db/brain-schema.ts
    - apps/hq/server/lib/ (dispatch + brain server libs merged)
    - apps/hq/server/jobs/ (brain distillation + sync jobs)
    - apps/hq/server/plugins/brain-jobs.ts
    - apps/hq/server/routes/api/_agent-native/brain/ingest.post.ts
    - apps/hq/shared/types.ts
    - apps/hq/jobs/process-ingest-queue.ts
    - apps/hq/app/components/ui/ (brain shadcn components)
    - apps/hq/app/components/brain/ (CanonicalPreviewSheet, Surface)
    - apps/hq/app/components/layout/ (Layout, Sidebar)
    - apps/hq/app/lib/ (utils, brain, tab-id from brain template)
  modified:
    - apps/hq/server/db/index.ts (merged brain schema + registerShareableResource calls)
    - apps/hq/actions/list-workspace-connections.ts (flatMap return type fix)
    - pnpm-lock.yaml
decisions:
  - "D-01: Dispatch as shell + Brain as context layer — copy-out only, templates/ untouched"
  - "D-02: Videos template excluded (Remotion 4.x + react-three — no BD1/BD3 feature needs it)"
  - "D-03: Yjs/Content real-time collab deferred — single super-admin makes CRDT unnecessary in v2.0"
  - "D-04: Every copied file origin recorded in apps/hq/MODIFICATIONS.md"
  - "Brain UI/lib placed flat at @/components/* and @/lib/* (not nested) to match @/ alias expected by brain routes"
  - "Brain server lib placed flat at server/lib/ (not nested) to match relative import paths (../db/index.js etc)"
metrics:
  duration: "775 seconds (~13 min)"
  completed_date: "2026-06-19"
  tasks: 3
  files_changed: 183
---

# Phase BD1 Plan 01: HQ App Scaffold Summary

**One-liner:** Copy-out fork of agent-native Dispatch (shell) + Brain (context layer) into `apps/hq` as `@gymos/hq`, with fork-boundary discipline, Brain schema merged into dispatch DB, and full typecheck passing.

## What Was Built

`apps/hq/` is the new GymClassOS operator control-plane app. It is created by copying the agent-native **Dispatch** template (workspace connections, vault, identity, approvals, extensions, metrics, audit) and **Brain** template (sources, knowledge, review, search, ops, settings) into `apps/hq/`, then modifying the copies — never the originals.

The app:
- Is a React Router v7 SSR app with `@gymos/hq` identity
- Merges both Dispatch and Brain Drizzle schemas in `server/db/index.ts`
- Has Brain routes under `app/routes/brain/` (sources, knowledge, review, search, ops, settings)
- Has Brain UI components at `app/components/ui/`, `app/components/brain/`, `app/components/layout/` (matching the Brain template's `@/` alias expectations)
- Has all Brain server lib, jobs, and plugins alongside dispatch server code
- Passes `pnpm --filter @gymos/hq typecheck`

## Commits

| Commit | What |
|--------|------|
| `f89f4fa5` | feat(BD1-01): copy-out Dispatch shell into apps/hq, rename to @gymos/hq |
| `0f3ebc0f` | feat(BD1-01): copy-out Brain context surfaces into apps/hq (no Yjs, no Videos) |
| `b8be73b5` | feat(BD1-01): write MODIFICATIONS.md ledger, fix import paths, typecheck passes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing dispatch template TS type-inference bug in `list-workspace-connections.ts`**
- **Found during:** Task 3 (typecheck run)
- **Issue:** The `flatMap` callback in `legacyGrants` returns either `Array<{access:"selected-app"}>` or `Array<{access:"all-apps"}>` but TypeScript could not unify the union without an explicit return-type annotation. This is a pre-existing bug in `templates/dispatch/actions/list-workspace-connections.ts` (the upstream dispatch template has this error; it's not something our changes introduced).
- **Fix:** Added explicit `flatMap<Array<{access:"all-apps"|"selected-app"}>>` return type annotation to the callback.
- **Files modified:** `apps/hq/actions/list-workspace-connections.ts`
- **Commit:** `b8be73b5`

**2. [Rule 1 - Bug] Brain component/lib import paths broken when placed in subdirectories**
- **Found during:** Task 3 (typecheck run)
- **Issue:** Brain routes and components use `@/components/ui/*`, `@/lib/utils`, `@/lib/brain`, etc. (Brain template's `@/` alias). When brain files were initially nested under `app/components/brain/ui/`, `app/lib/brain/`, and `server/lib/brain/`, these import paths broke because the prefix changed the `@/`-relative location.
- **Fix:** Restructured to place brain UI components at `app/components/ui/` (same level as Brain template expects), brain lib at `app/lib/`, and brain server lib at `server/lib/` (flat, not nested). `server/lib/brain/` directory deleted.
- **Files modified:** Multiple component/lib file moves; `server/lib/brain/` removed.
- **Commit:** `b8be73b5`

**3. [Rule 3 - Missing dependency] Missing `shared/types.ts` and `jobs/process-ingest-queue.ts`**
- **Found during:** Task 3 (typecheck run)
- **Issue:** Brain server jobs and lib import `../../shared/types.js` and `../../jobs/process-ingest-queue.js`. These files exist in the brain template's `shared/types.ts` and `jobs/` directory but were not initially copied.
- **Fix:** Copied `templates/brain/shared/types.ts` → `apps/hq/shared/types.ts` and `templates/brain/jobs/process-ingest-queue.ts` → `apps/hq/jobs/process-ingest-queue.ts`.
- **Commit:** `b8be73b5`

## Verification Results

- `git status --porcelain templates/` → empty (fork-boundary preserved)
- `pnpm --filter @gymos/hq typecheck` → exit 0
- `apps/hq/MODIFICATIONS.md` → 134 lines, references both `templates/dispatch` and `templates/brain`, Exclusions section names Videos (D-02) and Yjs/collab (D-03)
- Brain routes present: `apps/hq/app/routes/brain/{_index,knowledge,ops,review,search,settings,sources}.tsx`
- No Yjs/y-websocket/y-protocols in `apps/hq/package.json`
- No Remotion/react-three in `apps/hq/package.json`

## Known Stubs

None. This plan creates the structural scaffold; no data-dependent UI is wired. Brain routes will render against empty data until BD1-02 (HQ schema) and BD1-03 (org seed + auth) land — this is intentional per the plan ("Brain surfaces may render against empty/placeholder data; full data wiring lands when the HQ org seed exists").

## User Setup Items

None for this plan. The `apps/hq` package is scaffolded and typechecks. It will be deployable to Vercel after BD1-02 (Neon project + schema) and BD1-03 (Better-auth + env vars) are complete.
