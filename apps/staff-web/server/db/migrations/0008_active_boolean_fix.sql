-- 0008_active_boolean_fix.sql
--
-- Durable corrective for the schedule-page 500: trainers.active and
-- class_schedule_rules.active were created as an INTEGER family type
-- (HUSTLE prod was bigint) by the LP3 (v22-v26) / MPV (v27-v30) migrations,
-- but Drizzle binds boolean `true` for `eq(active, true)` (the
-- integer(mode:"boolean") wrapper emits a Postgres BOOLEAN, but the
-- hand-written migration SQL created an integer column). Postgres rejects
-- `bigint = true` → every trainers.active query 500s → schedule loader down.
--
-- This converts both columns to BOOLEAN to match class_definitions.active
-- (already boolean and working). Value-preserving (USING active <> 0),
-- guarded + idempotent: a no-op when the column is already BOOLEAN.
--
-- Applied to HUSTLE prod (Neon billowing-sun-51091059) by hand on 2026-06-25;
-- this file + db.ts migration v36 make it durable for fresh gym deploys.
-- The migration-drift gotcha applies: db.ts runMigrations is not reliably
-- auto-run against existing Neon DBs, so apply this by hand on each deploy.
--
-- NOT destructive: no DROP / RENAME / data loss.

DO $active_bool_fix$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'information_schema') THEN

    -- trainers.active: convert any integer-family type (int2/int4/int8) to boolean
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'trainers'
        AND a.attname = 'active'
        AND a.atttypid IN (20, 21, 23)   -- bigint/int2/int4, excludes boolean (16)
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) THEN
      ALTER TABLE trainers ALTER COLUMN active DROP DEFAULT;
      ALTER TABLE trainers ALTER COLUMN active TYPE BOOLEAN USING (active <> 0);
      ALTER TABLE trainers ALTER COLUMN active SET DEFAULT true;
    END IF;

    -- class_schedule_rules.active: same conversion
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'class_schedule_rules'
        AND a.attname = 'active'
        AND a.atttypid IN (20, 21, 23)
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) THEN
      ALTER TABLE class_schedule_rules ALTER COLUMN active DROP DEFAULT;
      ALTER TABLE class_schedule_rules ALTER COLUMN active TYPE BOOLEAN USING (active <> 0);
      ALTER TABLE class_schedule_rules ALTER COLUMN active SET DEFAULT true;
    END IF;

  END IF;
END
$active_bool_fix$;
