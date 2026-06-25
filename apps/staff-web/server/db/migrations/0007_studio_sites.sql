-- GSG-01: studio-global site/location names. Additive, idempotent.
-- Apply by hand to the Neon DB (billowing-sun-51091059) — db.ts runMigrations
-- v35 is the in-app mirror but is NOT auto-run against Neon by the build.
ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS sites JSONB;
