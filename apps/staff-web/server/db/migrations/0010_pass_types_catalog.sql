-- 0010_pass_types_catalog.sql
-- C47: Pass types catalog + passes.pass_type_id link.
--
-- Additive only — no DROP / RENAME / TRUNCATE / TRUNCATE. Idempotent.
-- Booleans declared BOOLEAN from the start (avoids active-column gotcha;
-- no retrofit migration needed like 0008_active_boolean_fix.sql).
--
-- created_at uses Postgres now() — NOT SQLite datetime('now').
-- (This DB is Neon Postgres; datetime('now') 500s on Neon.)
--
-- NOT auto-applied to gymos-demo Neon (billowing-sun-51091059) by build.
-- HAND-APPLY to that project via Neon MCP run_sql or the SQL editor after
-- deploy (migration-drift gotcha). Without this, /gymos/catalog and the
-- booking category compatibility check will 500.

CREATE TABLE IF NOT EXISTS pass_types (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  credits            INTEGER,
  price_pennies      INTEGER,
  stripe_price_id    TEXT,
  validity_days      INTEGER,
  all_categories     BOOLEAN NOT NULL DEFAULT false,
  allowed_categories TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TEXT DEFAULT now() NOT NULL
);

ALTER TABLE passes ADD COLUMN IF NOT EXISTS pass_type_id TEXT;
