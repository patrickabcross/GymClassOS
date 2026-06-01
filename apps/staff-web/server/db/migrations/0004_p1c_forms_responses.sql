-- ============================================================
-- P1c: Public Site Integrations — forms + responses tables (additive)
-- ============================================================
-- CLAUDE.md no-breaking-DB-changes guard: strictly additive.
-- Creates the two tables the forked forms feature reads/writes:
--   - forms      (read by the public submission handler + forms builder)
--   - responses  (written per submission for the builder responses view)
-- These mirror apps/staff-web/server/db/forms-schema.ts (forked from
-- templates/forms/, with ownableColumns()/shares dropped — single-tenant pilot).
--
-- DEVIATION NOTE: P1c-01 (0003) created only form_submissions; it omitted the
-- forms + responses tables the forked handler depends on. This migration closes
-- that gap. Applied DIRECTLY to gymos-demo Neon via Neon MCP (NOT runMigrations),
-- same pattern as 0001/0002/0003.

-- 1. forms — form definitions (single-tenant; no ownableColumns()).
CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  fields TEXT NOT NULL,      -- JSON array of FormField
  settings TEXT NOT NULL,    -- JSON FormSettings
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | published | closed (enforced app-side)
  created_at TEXT NOT NULL DEFAULT now(),
  updated_at TEXT NOT NULL DEFAULT now(),
  deleted_at TEXT
);

-- 2. responses — one row per public submission (builder responses view).
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms (id),
  data TEXT NOT NULL,        -- JSON object: { fieldId: value }
  submitted_at TEXT NOT NULL DEFAULT now(),
  ip TEXT,
  submitter_email TEXT
);
CREATE INDEX IF NOT EXISTS responses_form_id_idx ON responses (form_id);
