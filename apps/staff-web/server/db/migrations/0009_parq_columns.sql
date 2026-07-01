-- 0009_parq_columns.sql
-- PARQ v2: record PAR-Q health-form completion on gym_members.
-- ALREADY APPLIED by hand to HUSTLE prod (Neon billowing-sun-51091059).
-- This file + db.ts version 38 make it durable/reproducible for fresh deploys.
-- Additive only — no DROP/RENAME/data loss. parq_flagged is BOOLEAN (never int).
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS parq_completed_at text;
ALTER TABLE gym_members ADD COLUMN IF NOT EXISTS parq_flagged boolean NOT NULL DEFAULT false;
