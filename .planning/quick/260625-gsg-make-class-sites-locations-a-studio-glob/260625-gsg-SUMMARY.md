---
phase: quick-260625-gsg
plan: 01
subsystem: schedule + settings
tags: [sites, locations, config, repeatable-per-client, schema, resolver]
dependency_graph:
  requires: []
  provides: [studio-global site/location names via studio_owner_config.sites]
  affects: [gymos.schedule, NewClassDialog, gymos.settings.integrations]
tech_stack:
  added: []
  patterns:
    - Pure resolver in server/lib/ mirroring stage-event-map.ts precedent
    - Raw-SQL UPSERT into studio_owner_config (singleton row, guard:allow-unscoped)
    - Progressive disclosure via useState show/hide toggle (Locations card collapsed when sites exist)
key_files:
  created:
    - apps/staff-web/server/lib/sites.ts
    - apps/staff-web/server/lib/sites.test.ts
    - apps/staff-web/server/db/migrations/0007_studio_sites.sql
  modified:
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/app/routes/gymos.schedule.tsx
    - apps/staff-web/app/components/gymos/NewClassDialog.tsx
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx
decisions:
  - "resolveSites default is [] (empty array) — NO gym-specific site names in code; HUSTLE's Norwich/Wymondham are seeded as DATA per repeatable-per-client requirement"
  - "Progressive disclosure: Locations card shows pills + Edit button when sites exist; shows textarea directly when empty"
  - "Textarea normalizer: raw.split(/[\\n,]/) then resolveSites() so both newline and comma entry work identically"
  - "sites column is TEXT in Drizzle schema (JSONB in Postgres via migration) — mirrors metaStageEventMap precedent"
  - "placeholder text in textarea uses generic 'Main Studio / City Branch' — not HUSTLE-specific names"
metrics:
  duration: 600s
  completed: "2026-06-25"
  tasks: 4
  files: 8
---

# Phase quick-260625-gsg Plan 01: Make Class Sites/Locations a Studio-Global Config — Summary

**One-liner:** Pure `resolveSites` resolver + additive `sites JSONB` column + schedule loader threading + configurable NewClassDialog picker + Settings Locations card with UPSERT action — gym-agnostic, no HUSTLE names in code.

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Add sites column + resolveSites resolver + test + migration | d0bc630e | server/lib/sites.ts, sites.test.ts, server/db/schema.ts, server/plugins/db.ts, 0007_studio_sites.sql |
| 2 | Thread sites into schedule loader + NewClassDialog picker | dee62ea1 | gymos.schedule.tsx, NewClassDialog.tsx |
| 3 | Add Locations management card + save-sites-config action | 0dcba499 | gymos.settings.integrations.tsx |
| 3a | Fix: replace gym-specific placeholder text with generic example | 107f1e0b | gymos.settings.integrations.tsx |

## What Was Built

### Task 1 — Resolver + Schema + Migration

- `server/lib/sites.ts`: `resolveSites(configJson)` — pure, never-throws, accepts string|array|null|undefined. Default is `[]` (empty array). Handles JSON string, pre-parsed JSONB array, malformed JSON, non-array JSON, non-string/empty element filtering, trim, de-dupe (stable insertion order). Mirrors `stage-event-map.ts` structure exactly.
- `server/lib/sites.test.ts`: 10 unit tests covering all cases from the plan behavior spec. All 10 pass.
- `server/db/schema.ts`: `sites: text("sites")` column added to `studioOwnerConfig` (after `metaStageEventMap`). Comment links to `sites.ts` and states NO hardcoded site names.
- `server/plugins/db.ts`: Migration v35 — `ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS sites JSONB`. Idempotent, additive.
- `server/db/migrations/0007_studio_sites.sql`: Standalone SQL for manual Neon apply.

### Task 2 — Schedule Loader + NewClassDialog

- `gymos.schedule.tsx` loader: Query F reads `studio_owner_config.sites` via raw SQL, calls `resolveSites()`, adds `sites: string[]` to loader return. `guard:allow-unscoped` comment on the query.
- `gymos.schedule.tsx` render: `<NewClassDialog sites={data.sites} ...>` added.
- `NewClassDialog.tsx`: `sites: string[]` prop added. Hardcoded Norwich/Wymondham SelectItems replaced with `{sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}`. Empty-sites UX: hint paragraph shown when `sites.length === 0`. The `NONE` sentinel + `locationVal` mapping is untouched — both the one-off and recurring submit paths remain correct.

### Task 3 — Settings Locations Card

- `gymos.settings.integrations.tsx` loader: `resolveSites()` reads `studio_owner_config.sites`, adds `sites: string[]` to return (incl. `sites: [] as string[]` on the error-path early return).
- `gymos.settings.integrations.tsx` action: `save-sites-config` intent splits textarea on `\n` or `,`, passes through `resolveSites(JSON.stringify(...))` for trim/de-dupe/empty-filter, UPSERTs to `studio_owner_config.sites`. `guard:allow-unscoped` comment present.
- `gymos.settings.integrations.tsx` component: `sitesFetcher`, `sitesSubmitting`, `showEditSites` state added. `IconMapPin` from `@tabler/icons-react`. Locations card: when sites exist and uncollapsed=false shows pills + "Edit locations" link (progressive disclosure); when empty or editing shows empty-state copy + textarea + save button + optional cancel. Success/error banners from `sitesFetcher.data`.

## Verification Results

- `npx vitest run --config vitest.unit.config.ts server/lib/sites.test.ts` — 10/10 tests pass.
- `npx tsc --noEmit` — no errors in the four touched source files.
- `grep "Norwich|Wymondham"` on all four changed source files — CLEAN.
- `npx prettier --write` — run on all modified files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Generic placeholder text**
- **Found during:** Task 3 final verification
- **Issue:** Textarea placeholder showed `"e.g.\nNorwich\nWymondham"` — gym-specific names in code (violates REPEATABLE-PER-CLIENT constraint)
- **Fix:** Replaced with `"e.g.\nMain Studio\nCity Branch"` (generic)
- **Files modified:** `apps/staff-web/app/routes/gymos.settings.integrations.tsx`
- **Commit:** 107f1e0b

**2. [Rule 2 - Missing critical functionality] Error-path sites fallback**
- **Found during:** Task 3 implementation
- **Issue:** The `?stripe=refresh` error early-return in the loader didn't include `sites`, making `data.sites` potentially `undefined` on that rendering path
- **Fix:** Added `sites: [] as string[]` to the error-path return object
- **Files modified:** `apps/staff-web/app/routes/gymos.settings.integrations.tsx`
- **Commit:** 0dcba499 (same task commit)

## Operator Actions

TWO MANUAL STEPS are required after this code is deployed (migration-drift gotcha — `runMigrations` in `db.ts` does NOT auto-apply to the Neon DB):

### 1. Apply the additive migration to Neon (billowing-sun-51091059)

Via Neon MCP or SQL console:

```sql
ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS sites JSONB;
```

Same SQL as `apps/staff-web/server/db/migrations/0007_studio_sites.sql`.

**Without this step:** the schedule loader's `SELECT sites FROM studio_owner_config` will 500 because the column does not exist.

### 2. Seed HUSTLE's two sites as DATA

Once the migration is applied, seed the two site names either:

**Option A — via SQL:**

```sql
INSERT INTO studio_owner_config (id, sites, updated_at)
VALUES ('singleton', '["Norwich","Wymondham"]'::jsonb, NOW())
ON CONFLICT (id) DO UPDATE SET
  sites = '["Norwich","Wymondham"]'::jsonb,
  updated_at = NOW();
```

**Option B — via the new Settings UI:**

Navigate to `/gymos/settings/integrations` → Locations card → type "Norwich" and "Wymondham" (one per line) → Save locations.

## Known Stubs

None. Data flows from `studio_owner_config.sites` (DB) -> `resolveSites()` -> loader -> `NewClassDialog` prop -> `SelectItem` elements. No stubs or hardcoded values remain.

## Self-Check: PASSED

- `apps/staff-web/server/lib/sites.ts` — FOUND
- `apps/staff-web/server/lib/sites.test.ts` — FOUND
- `apps/staff-web/server/db/migrations/0007_studio_sites.sql` — FOUND
- Commits d0bc630e, dee62ea1, 0dcba499, 107f1e0b — all FOUND in git log
- `sites: text("sites")` in schema.ts — 1 match (FOUND)
- `version: 35` in db.ts — 1 match (FOUND)
- `sites.map` in NewClassDialog.tsx — 1 match (FOUND)
- `save-sites-config` in gymos.settings.integrations.tsx — 4 matches (FOUND)
