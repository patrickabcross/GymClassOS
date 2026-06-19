/**
 * packages/hq-schema/src/migrations.ts
 *
 * Ordered list of additive HQ migration entries consumed by apps/hq's
 * runMigrations db plugin. The migration bookkeeping table is "hq_migrations"
 * (distinct from staff-web's "mail_migrations") to avoid version-space
 * collisions on any shared Neon instance.
 *
 * RULES (enforced by CLAUDE.md + guard-no-drizzle-push.mjs):
 *   - All SQL MUST be additive: CREATE TABLE IF NOT EXISTS,
 *     ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
 *   - NEVER use DROP, RENAME, TRUNCATE, or destructive ALTER.
 *   - Never add a column whose name matches *connection*, *database_url*,
 *     or *dsn* (PII-up boundary — guard-hq-no-pii.mjs enforces this).
 *
 * EXTENDING:
 *   - BD1-03 appends the HQ org + super-admin seed migration here (v2).
 *   - BD2 appends studio_registry, provisioning_runs, telemetry_snapshots (v3+).
 *   - Each new migration gets the next version number.
 */

/** Shape expected by runMigrations from @agent-native/core/db. */
export type HqMigrationEntry = {
  version: number;
  sql: string | { postgres?: string; sqlite?: string };
};

export const hqMigrations: HqMigrationEntry[] = [
  {
    version: 1,
    // Foundation table: single-row sentinel recording HQ org ID + schema version.
    // Populated by the BD1-03 seed migration (v2 below).
    sql: `CREATE TABLE IF NOT EXISTS hq_app_meta (
      id TEXT PRIMARY KEY,
      hq_org_id TEXT,
      super_admin_user_id TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      seeded_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },

  // BD1-03 appends the HQ org + super-admin seed migration here (version 2).
  // Example shape (BD1-03 fills in the actual values):
  //   {
  //     version: 2,
  //     sql: `INSERT INTO hq_app_meta (id, hq_org_id, super_admin_user_id, seeded_at, updated_at)
  //           VALUES ('hq', '<org-id>', '<user-id>', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  //           ON CONFLICT (id) DO NOTHING`,
  //   },

  // BD2 appends domain table migrations here (version 3+):
  //   { version: 3, sql: `CREATE TABLE IF NOT EXISTS studio_registry ( ... )` },
  //   { version: 4, sql: `CREATE TABLE IF NOT EXISTS provisioning_runs ( ... )` },
  //   { version: 5, sql: `CREATE TABLE IF NOT EXISTS telemetry_snapshots ( ... )` },
];
