---
phase: BD4-studio-brain-dispatcher
plan: 01
subsystem: database, ui, api
tags: [brain, drizzle, schema, defineAction, react-router, shadcn, tabler-icons, vitest]

# Dependency graph
requires:
  - phase: BD3-hq-brain-dispatcher
    provides: confirmed non-collab Brain fork pattern; db.ts runMigrations array at version 15
  - phase: BD2-telemetry-provisioning
    provides: runMigrations v14/15 dual-dialect pattern; studio schema conventions
  - phase: AE3-members-campaigns
    provides: useChangeVersions(["action"]) live-refresh pattern; vitest.unit.config.ts actions/** extension
provides:
  - studio_brain_docs Drizzle table + version-16 migration (GOB Brain knowledge: brand-voice, ethos, class-catalog)
  - studio_owner_config Drizzle table + version-17 migration (GOD owner config singleton)
  - reactivation_attempts Drizzle table + version-18 migration + version-19 index (GOD suppression ceiling)
  - brain-init action (idempotent class-catalog seed from class_definitions; buildCatalogBody pure helper)
  - get-brain-docs action (GET — reads all studio_brain_docs rows)
  - update-brain-doc action (.strict() mutation — brand-voice/ethos only)
  - /gymos/brain route (view + edit; Collapsible class methods; live-refresh)
  - GymosTopNav admin Brain tab
affects: [BD4-02, GOD-heartbeat-reactivate, GOD-daily-digest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "brain-init-helpers.ts: extract pure helpers from actions importing framework deps for unit testability"
    - "vitest.unit.config.ts extended to include actions/**/*.test.ts (BD3-04 decision applied)"
    - "Collapsible shadcn primitive for Class Methods progressive disclosure"
    - "Client-side data fetch in route (no loader) for owner-only content — avoids readAppState SSR limitation"

key-files:
  created:
    - apps/staff-web/actions/brain-init.ts
    - apps/staff-web/actions/brain-init-helpers.ts
    - apps/staff-web/actions/brain-init.test.ts
    - apps/staff-web/actions/get-brain-docs.ts
    - apps/staff-web/actions/update-brain-doc.ts
    - apps/staff-web/app/routes/gymos.brain.tsx
  modified:
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
    - apps/staff-web/vitest.unit.config.ts

key-decisions:
  - "All three BD4 tables (studio_brain_docs, studio_owner_config, reactivation_attempts) owned by BD4-01 to avoid db.ts collision with BD4-02"
  - "Pure buildCatalogBody helper extracted to brain-init-helpers.ts so unit tests avoid @agent-native/core CJS/ESM clash"
  - "Class Methods section collapsed by default (progressive disclosure per AGENTS.md)"
  - "Client-side data fetch (not loader) in gymos.brain.tsx — readAppState throws in loader context"
  - "vitest.unit.config.ts extended to include actions/**/*.test.ts per BD3-04 decision"

patterns-established:
  - "Brain actions: all carry guard:allow-unscoped — single-tenant studio Brain"
  - "Pure helper extraction pattern: brain-init-helpers.ts mirrors create-checkout-link-helpers.ts"

requirements-completed: [GOB-01, GOB-02, GOB-03]

# Metrics
duration: 14min
completed: 2026-06-19
---

# Phase BD4 Plan 01: Studio Brain (GOB) Summary

**Lightweight studio Brain (`studio_brain_docs` table) with brand-voice/ethos editable via `/gymos/brain` and class catalog auto-seeded from `class_definitions` on Brain init**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-19T18:13:40Z
- **Completed:** 2026-06-19T18:27:55Z
- **Tasks:** 3
- **Files modified/created:** 9

## Accomplishments

- Three additive tables (versions 16-19) registered in `runMigrations` in `db.ts` — auto-applied on server boot; BD4-02 has all tables it needs without touching `db.ts`
- Three Brain actions: `get-brain-docs` (GET), `brain-init` (idempotent seed), `update-brain-doc` (.strict() mutation) — all with `guard:allow-unscoped`
- `/gymos/brain` owner UI: Brand Voice + Studio Ethos editable with optimistic save + live-refresh; Class Methods read-only with Collapsible (collapsed by default per progressive disclosure rule)
- 3 unit tests for `buildCatalogBody` green; `tsc --noEmit` clean

## Task Commits

1. **Task 1: Add all three BD4 additive tables (versions 16-19) + Drizzle defs** — `13c4a3a3` (feat)
2. **Task 2: Brain actions + test (TDD green)** — `79af285c` (feat)
3. **Task 3: /gymos/brain route + GymosTopNav tab** — `0289689f` (feat)

## Files Created/Modified

- `apps/staff-web/server/plugins/db.ts` — versions 16-19 appended (studio_brain_docs, studio_owner_config, reactivation_attempts, index)
- `apps/staff-web/server/db/schema.ts` — Drizzle table defs for all three new tables
- `apps/staff-web/actions/brain-init.ts` — idempotent class-catalog seed + brand-voice/ethos row init
- `apps/staff-web/actions/brain-init-helpers.ts` — pure `buildCatalogBody` helper (unit-testable)
- `apps/staff-web/actions/brain-init.test.ts` — 3 Vitest tests for buildCatalogBody
- `apps/staff-web/actions/get-brain-docs.ts` — GET action returning all studio_brain_docs rows
- `apps/staff-web/actions/update-brain-doc.ts` — .strict() mutation for brand-voice/ethos only
- `apps/staff-web/app/routes/gymos.brain.tsx` — 383-line Brain view+edit route
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — admin Brain tab added
- `apps/staff-web/vitest.unit.config.ts` — extended to include actions/**/*.test.ts

## Decisions Made

- **All three BD4 tables in BD4-01:** Prevents a `db.ts` write collision if BD4-02 runs in parallel. BD4-02 reads `studioOwnerConfig` and `reactivationAttempts` without touching `db.ts`.
- **Pure helper extraction:** `brain-init-helpers.ts` avoids the CJS React `module is not defined` crash in ESM vitest when importing `@agent-native/core` — mirrors `create-checkout-link-helpers.ts` pattern exactly.
- **Collapsible for Class Methods:** Collapsed by default per AGENTS.md progressive disclosure rule — owner doesn't need to see 20+ class entries on every Brain visit.
- **Client-side fetch in route (no loader):** `readAppState` and `getDb()` in a loader require a request context that isn't reliably available in the new React Router v7 framework mode; matches `gymos.campaigns.tsx` client-side segment-fetch pattern.

## Deviations from Plan

None — plan executed exactly as written with one process clarification:

**[Rule 2 - Missing Critical] Extended vitest.unit.config.ts to include actions/**/*.test.ts**
- **Found during:** Task 2 (brain-init test setup)
- **Issue:** `vitest.unit.config.ts` only covered `app/lib/**` and `shared/**`; running `npx vitest run` with the default `vite.config.ts` fails on action files importing `@agent-native/core` (CJS React in ESM context)
- **Fix:** Added `actions/**/*.test.ts` to the `include` array in `vitest.unit.config.ts`, matching the BD3-04 accumulated-context decision already recorded in STATE.md
- **Files modified:** `apps/staff-web/vitest.unit.config.ts`
- **Verification:** `npx vitest run --config vitest.unit.config.ts actions/brain-init.test.ts` — 3/3 pass
- **Committed in:** `79af285c` (Task 2 commit)

## Issues Encountered

None — all acceptance criteria met on first attempt.

## User Setup Required

The `studio_brain_docs`, `studio_owner_config`, and `reactivation_attempts` tables are created automatically by `runMigrations` on server boot (versions 16-19). No manual SQL required.

Note: for the live `gymos-demo` Neon, the migration runs on next Vercel deploy. The Brain tab will show empty brand-voice/ethos docs until the owner edits them, and class-catalog is auto-seeded on first `/gymos/brain` page load.

## Next Phase Readiness

BD4-02 (GOD — daily digest + heartbeat reactivation) can now:
- Read `studio_brain_docs` id='brand-voice' for personalization (with generic fallback per D-13)
- Read `studio_owner_config` singleton for owner phone + timezone + flags
- Write `reactivation_attempts` for suppression ceiling tracking

All three tables are schema-available in `schema.studioBrainDocs`, `schema.studioOwnerConfig`, `schema.reactivationAttempts`.

## Known Stubs

None — all data wiring is live (actions fetch from DB, route calls actions). The class-catalog body will be empty until `brain-init` fires on first `/gymos/brain` visit (intentional: auto-seeds on mount).

## Self-Check: PASSED

---
*Phase: BD4-studio-brain-dispatcher*
*Completed: 2026-06-19*
