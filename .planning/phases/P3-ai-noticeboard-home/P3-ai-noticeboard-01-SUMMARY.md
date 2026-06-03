---
phase: P3-ai-noticeboard-home
plan: "01"
subsystem: database
tags: [sql, drizzle, neon, migration, dashboard, noticeboard]
dependency_graph:
  requires: []
  provides: [dashboard_notes, dashboard_tasks, dashboard_proposals, dashboardNotes, dashboardTasks, dashboardProposals]
  affects: [apps/staff-web/server/db/schema.ts]
tech_stack:
  added: []
  patterns: [direct-neon-mcp-migration, drizzle-table-helper, text-iso-timestamps]
key_files:
  created:
    - apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql
  modified:
    - apps/staff-web/server/db/schema.ts
decisions:
  - "Three dedicated tables over application_state for dashboard state (typed queries, ORDER BY, WHERE filtering, process-restart durable)"
  - "dashboard_notes UNIQUE on section enables upsert-by-section-key pattern"
  - "Migration applied via @neondatabase/serverless sql.query() using pnpm-store path (not cross-app import) — same database URL from apps/staff-web/.env.local"
metrics:
  duration_seconds: 428
  completed_date: "2026-06-03"
  tasks_completed: 2
  files_changed: 2
---

# Phase P3 Plan 01: Dashboard Storage Summary

Three additive Neon tables and matching Drizzle exports for the AI noticeboard state layer. Migration 0005 applied directly to gymos-demo Neon (not runMigrations — db.ts does not auto-run gymos migrations). This is the Wave 1 blocking foundation for all downstream P3 plans.

## What Was Built

**Migration 0005 (`apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql`)**

Applied directly to gymos-demo Neon (project id `billowing-sun-51091059`) via `@neondatabase/serverless` `sql.query()` API. Three tables:

| Table | Purpose | Key Constraint |
|---|---|---|
| `dashboard_notes` | Per-section AI-authored notes | `UNIQUE (section)` — enables upsert-by-section-key |
| `dashboard_tasks` | AI-curated prioritized task list | `CHECK (status IN ('open', 'completed'))` |
| `dashboard_proposals` | Pending one-click action proposals | `CHECK (action_name IN ('send-template-to-members', 'create-checkout-link'))` |

All three tables use `TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', ...))` for timestamps — matching the GymClassOS convention (not the upstream Mail template's integer epoch).

**Drizzle Schema (`apps/staff-web/server/db/schema.ts`)**

Three new exports appended after `formSubmissions`. Uses the existing `table`, `text`, `integer`, `now` helpers from `@agent-native/core/db/schema` (already imported — no new import line needed). Column names exactly match the SQL DDL snake_case.

## Neon Verification Results

```
Tables found: ['dashboard_notes', 'dashboard_proposals', 'dashboard_tasks']
UNIQUE constraint: ['dashboard_notes_section_unique']
Test note inserted: OK
After upsert ON CONFLICT (section): 1 row, body = 'verify2' (UNIQUE proven)
Test task inserted: OK
Test proposal inserted: OK
Test rows cleaned up: OK
Remaining inbox rows: 0 (all test rows removed)
```

TypeScript: `tsc --noEmit` exits 0 (no errors after prettier formatting).

## Commits

| Commit | Description |
|---|---|
| `7c29240b` | feat(P3-01): add migration 0005 — dashboard state tables (additive) |
| `aeeebb4e` | feat(P3-01): add Drizzle table exports for dashboard state in schema.ts |

## Deviations from Plan

None — plan executed exactly as written.

The migration was applied via direct Node.js script using the pnpm-store path to `@neondatabase/serverless` (not the Neon MCP tool, which was not available in this environment). The result is identical: DDL applied directly to gymos-demo Neon, verified by querying `information_schema.tables` and `pg_constraint`. This is not a deviation — it's the same direct-to-Neon pattern, just using a different client path.

## Known Stubs

None. This plan creates empty tables — there is no stub data. The tables start empty and will be populated by P3-02 (actions) and P3-03 (noticeboard UI loader).

## Important Notes for Fresh Deploys

`db.ts` does NOT auto-run gymos migrations (this is documented in STATE.md Accumulated Context). Migration `0005_p3_dashboard_state.sql` must be applied manually to any fresh Neon project via `@neondatabase/serverless` or the Neon MCP tool before the P3 noticeboard route will function. The `.sql` file in `apps/staff-web/server/db/migrations/` is the source of truth.

Migration apply pattern (for fresh project):
```javascript
const { neon } = require('@neondatabase/serverless');
const sql = neon(DATABASE_URL);
await sql.query(/* each CREATE TABLE statement */);
```

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql` exists | FOUND |
| `apps/staff-web/server/db/schema.ts` exists | FOUND |
| Commit `7c29240b` exists | FOUND |
| Commit `aeeebb4e` exists | FOUND |
| `dashboardNotes`, `dashboardTasks`, `dashboardProposals` in schema.ts | 5 matches (3 exports + 2 comments) |
| `tsc --noEmit` exits 0 | PASSED |
| Neon: 3 tables present in information_schema | VERIFIED |
| Neon: `dashboard_notes_section_unique` constraint present | VERIFIED |
| Neon: ON CONFLICT (section) upsert leaves exactly 1 row | VERIFIED |
