---
phase: P3-ai-noticeboard-home
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql
  - apps/staff-web/server/db/schema.ts
autonomous: true
requirements: [SC-3, SC-4, SC-5]
must_haves:
  truths:
    - "dashboard_notes, dashboard_tasks, dashboard_proposals tables exist in gymos-demo Neon"
    - "dashboard_notes has a UNIQUE constraint on section enabling upsert-by-section"
    - "Drizzle schema.ts exports dashboardNotes, dashboardTasks, dashboardProposals with matching columns"
  artifacts:
    - path: "apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql"
      provides: "Additive migration for the three dashboard state tables"
      contains: "CREATE TABLE IF NOT EXISTS dashboard_notes"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "Drizzle table definitions consumed by P3 actions + noticeboard loader"
      contains: "export const dashboardNotes"
  key_links:
    - from: "apps/staff-web/server/db/schema.ts"
      to: "gymos-demo Neon (dashboard_* tables)"
      via: "table() definitions matching the applied SQL DDL column names"
      pattern: "dashboard_(notes|tasks|proposals)"
---

<objective>
Create the SQL storage foundation for the AI noticeboard: three additive tables (`dashboard_notes`, `dashboard_tasks`, `dashboard_proposals`) applied directly to `gymos-demo` Neon via Neon MCP (per the P1c 0001–0004 pattern — `db.ts` does NOT auto-run gymos migrations), plus matching Drizzle schema exports so every downstream P3 action and the noticeboard loader resolve types.

Purpose: Every other P3 plan (authoring actions, propose/approve handshake, noticeboard UI) reads/writes these tables. This is the blocking foundation (Wave 1).
Output: `0005_p3_dashboard_state.sql` (committed + applied to Neon), three new `table()` exports in `schema.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md
@apps/staff-web/server/db/schema.ts
@apps/staff-web/server/db/migrations/0004_p1c_forms_responses.sql

<interfaces>
<!-- The migration apply pattern (from STATE.md Accumulated Context):
     - db.ts does NOT run gymos migrations. Apply DDL directly to gymos-demo Neon
       (project id billowing-sun-51091059) via mcp__Neon__run_sql_transaction.
     - After applying, verify with a SELECT against information_schema, then commit the .sql to git.
     - Drizzle table() helper + column helpers come from "@agent-native/core/db/schema":
         import { table, text, integer, now } from "@agent-native/core/db/schema";
     - GymClassOS tables use TEXT ISO-string timestamps (text().default(now())), NOT integer epoch.
     - PKs are id TEXT PRIMARY KEY. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write + apply migration 0005 (dashboard state tables) to gymos-demo Neon</name>
  <read_first>
    - apps/staff-web/server/db/migrations/0004_p1c_forms_responses.sql (the most recent additive migration — copy its header comment style + to_char timestamp default idiom)
    - apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql (CHECK-constraint idiom reference)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"Migration 0005 — Dashboard State Tables" (the exact DDL to use)
  </read_first>
  <action>
Create `apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql` with EXACTLY these three additive CREATE TABLE statements (strictly additive — no DROP/RENAME/ALTER of existing objects):

```sql
-- apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql
-- P3: AI Noticeboard Home — dashboard state (additive).
-- Applied directly to gymos-demo Neon via Neon MCP (NOT runMigrations — db.ts
-- does not auto-run gymos migrations). Pattern continues 0001–0004.

CREATE TABLE IF NOT EXISTS dashboard_notes (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  CONSTRAINT dashboard_notes_section_unique UNIQUE (section)
);

CREATE TABLE IF NOT EXISTS dashboard_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  proposal_id TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_proposals (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  action_name TEXT NOT NULL CHECK (action_name IN ('send-template-to-members', 'create-checkout-link')),
  params_json TEXT NOT NULL DEFAULT '{}',
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
  proposed_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  executed_at TEXT,
  rejected_at TEXT,
  result_json TEXT
);
```

Then APPLY it to the `gymos-demo` Neon project (id `billowing-sun-51091059`) via `mcp__Neon__run_sql_transaction` — run the three CREATE statements as one transaction. Do NOT run `runMigrations` or `drizzle-kit push`.

After applying, do a verification round-trip against Neon via `mcp__Neon__run_sql`:
  1. INSERT a test note: `INSERT INTO dashboard_notes (id, section, body) VALUES ('dnote_test', 'inbox', 'verify');`
  2. Upsert-collision test: re-run the same INSERT with `ON CONFLICT (section) DO UPDATE SET body = 'verify2'` and confirm exactly ONE row for section='inbox' with body='verify2' (proves the UNIQUE constraint).
  3. INSERT a test task + test proposal, then CLEAN UP: `DELETE FROM dashboard_proposals WHERE id LIKE 'dprop_test%'; DELETE FROM dashboard_tasks WHERE id LIKE 'dtask_test%'; DELETE FROM dashboard_notes WHERE id = 'dnote_test';`
  </action>
  <verify>
    <automated>MISSING — verify via Neon MCP SQL replay (no local HTTP). Run against gymos-demo (billowing-sun-51091059): SELECT table_name FROM information_schema.tables WHERE table_name IN ('dashboard_notes','dashboard_tasks','dashboard_proposals') — expect 3 rows; SELECT conname FROM pg_constraint WHERE conname = 'dashboard_notes_section_unique' — expect 1 row.</automated>
  </verify>
  <acceptance_criteria>
    - File apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql exists and contains "CREATE TABLE IF NOT EXISTS dashboard_notes", "CREATE TABLE IF NOT EXISTS dashboard_tasks", "CREATE TABLE IF NOT EXISTS dashboard_proposals"
    - File contains "CONSTRAINT dashboard_notes_section_unique UNIQUE (section)"
    - File contains "CHECK (action_name IN ('send-template-to-members', 'create-checkout-link'))"
    - Neon information_schema query returns all 3 table names
    - Neon pg_constraint query returns dashboard_notes_section_unique
    - The ON CONFLICT (section) re-insert test leaves exactly 1 dashboard_notes row for section='inbox' (UNIQUE proven), then test rows are deleted (no dnote_test/dtask_test/dprop_test rows remain)
  </acceptance_criteria>
  <done>Migration 0005 applied to gymos-demo Neon; all 3 tables + the section UNIQUE constraint verified; test rows cleaned up; .sql file committed.</done>
</task>

<task type="auto">
  <name>Task 2: Add Drizzle table exports for the three dashboard tables in schema.ts</name>
  <read_first>
    - apps/staff-web/server/db/schema.ts (read the END of the file — find the last existing export, e.g. formSubmissions; confirm the table()/text()/integer()/now() import already present at the top)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"Drizzle Schema Additions (schema.ts)" (exact code to paste)
  </read_first>
  <action>
Append the three table exports to the END of `apps/staff-web/server/db/schema.ts` (after the final existing export). Use the `table`, `text`, `integer`, `now` helpers from `@agent-native/core/db/schema` (already imported at the top of the file — verify; if `integer` is not yet imported, add it to the existing import statement, do NOT add a second import line). Column names MUST map to the snake_case SQL columns from Task 1:

```typescript
// P3: AI Noticeboard Home — dashboard state tables (migration 0005).
export const dashboardNotes = table("dashboard_notes", {
  id: text("id").primaryKey(),
  section: text("section", {
    enum: ["inbox", "schedule", "members", "revenue", "ai_today"],
  }).notNull(),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const dashboardTasks = table("dashboard_tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  priority: integer("priority").notNull().default(2), // 1=high, 2=medium, 3=low
  status: text("status", { enum: ["open", "completed"] }).notNull().default("open"),
  proposalId: text("proposal_id"),
  createdAt: text("created_at").notNull().default(now()),
  completedAt: text("completed_at"),
});

export const dashboardProposals = table("dashboard_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  actionName: text("action_name", {
    enum: ["send-template-to-members", "create-checkout-link"],
  }).notNull(),
  paramsJson: text("params_json").notNull().default("{}"),
  rationale: text("rationale"),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "executed"],
  }).notNull().default("pending"),
  proposedAt: text("proposed_at").notNull().default(now()),
  executedAt: text("executed_at"),
  rejectedAt: text("rejected_at"),
  resultJson: text("result_json"),
});
```

Run `pnpm --filter @gymos/staff-web exec tsc --noEmit` (or the repo's staff-web typecheck command) to confirm the schema file compiles.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/server/db/schema.ts contains "export const dashboardNotes = table(\"dashboard_notes\""
    - apps/staff-web/server/db/schema.ts contains "export const dashboardTasks = table(\"dashboard_tasks\""
    - apps/staff-web/server/db/schema.ts contains "export const dashboardProposals = table(\"dashboard_proposals\""
    - schema.ts contains 'proposalId: text("proposal_id")' and 'actionName: text("action_name"' and 'paramsJson: text("params_json")'
    - `tsc --noEmit` for apps/staff-web exits 0 (no type errors introduced)
  </acceptance_criteria>
  <done>Three dashboard table exports added to schema.ts with column names matching the SQL DDL; staff-web typechecks clean.</done>
</task>

</tasks>

<verification>
- Neon (gymos-demo, billowing-sun-51091059): all three dashboard_* tables present; dashboard_notes_section_unique constraint present; CHECK constraints on status + action_name present.
- schema.ts exports resolve and staff-web `tsc --noEmit` is clean.
- No existing table/column was renamed or dropped (additive-only verified by diffing schema.ts — only appended lines).
- VERIFICATION CONSTRAINT honored: no local HTTP; substance verified via Neon MCP SQL replay + tsc.
</verification>

<success_criteria>
Backs ROADMAP SC-3, SC-4, SC-5 (the persistence layer the agent authors into). The tables exist in Neon and are typed in Drizzle so Plans 02/03/04 can query them with no schema work.
</success_criteria>

<output>
After completion, create `.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-01-SUMMARY.md` noting: the applied DDL, the Neon verification query results, and the fact that 0005 must be applied to any FRESH Neon project manually (db.ts does not auto-run it).
</output>
