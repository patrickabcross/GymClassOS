-- apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql
-- P3: AI Noticeboard Home — dashboard state (additive).
-- Applied directly to gymos-demo Neon via Neon MCP (NOT runMigrations — db.ts
-- does not auto-run gymos migrations). Pattern continues 0001–0004.
-- CLAUDE.md no-breaking-DB-changes guard: strictly additive. No DROP/RENAME/ALTER
-- of existing objects. Three new tables only.

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
