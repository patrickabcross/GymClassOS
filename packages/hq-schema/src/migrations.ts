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
 * ORDERING GUARANTEE:
 *   Nitro plugins run alphabetically: auth.ts (Better-auth) runs before
 *   db.ts (runMigrations). Better-auth creates the "organization" and "member"
 *   framework tables during autoMountAuth. By the time the v2 seed migration
 *   runs, those tables already exist. The ON CONFLICT guards ensure the seed
 *   is idempotent even if runMigrations is called multiple times (e.g. on
 *   every cold start against the shared prod HQ Neon).
 *
 * EXTENDING:
 *   - BD2 appends studio_registry, provisioning_runs, telemetry_snapshots (v4+).
 *   - Each new migration gets the next version number.
 */

import { HQ_ORG_ID, HQ_ORG_MEMBER_ID, HQ_ORG_SLUG } from "./constants.js";

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

  {
    version: 2,
    // BD1-03: Seed the HQ "organization" row in Better-auth's framework-managed
    // table. This gives Brain/Dispatch accessFilter a known orgId from first boot
    // (Pitfall F-02) so queries return non-empty results.
    //
    // FIXED org id (HQ_ORG_ID): deterministic across all deploys — must never
    // change after first deployment. Exported from @gymos/hq-schema/index so
    // BD3 Brain/Dispatch reference the same constant.
    //
    // IDEMPOTENT: ON CONFLICT (id) DO NOTHING — safe to run on every cold start
    // against the shared prod HQ Neon (no-breaking-DB-changes rule).
    //
    // NO real super-admin email: this migration seeds ONLY the org row. The
    // super-admin USER row is created by Better-auth on the operator's first
    // sign-in (auth plugin enforces isSuperAdmin gate). The org member link is
    // created by the BD3 first-sign-in hook (see apps/hq server/plugins/auth.ts
    // comment block on HQ_ORG_ID usage). The operator email stays out of the DB.
    //
    // ALSO: seed an hq_app_meta sentinel row so readiness checks work.
    sql: {
      postgres: `
INSERT INTO "organization" (id, name, slug, created_at, updated_at)
VALUES ('${HQ_ORG_ID}', 'GymClassOS HQ', '${HQ_ORG_SLUG}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO hq_app_meta (id, hq_org_id, schema_version, seeded_at, updated_at)
VALUES ('hq', '${HQ_ORG_ID}', 1, NOW()::TEXT, NOW()::TEXT)
ON CONFLICT (id) DO NOTHING`,
      sqlite: `
INSERT OR IGNORE INTO organization (id, name, slug, created_at, updated_at)
VALUES ('${HQ_ORG_ID}', 'GymClassOS HQ', '${HQ_ORG_SLUG}', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO hq_app_meta (id, hq_org_id, schema_version, seeded_at, updated_at)
VALUES ('hq', '${HQ_ORG_ID}', 1, datetime('now'), datetime('now'))`,
    },
  },

  {
    version: 3,
    // BD1-03: Create the hq_org_member_template row in Better-auth's "member"
    // table so that if an org-membership-scoped query runs before the
    // super-admin has signed in for the first time, the org still has at least
    // one seeded placeholder member row. The user_id is a placeholder constant —
    // it will be overwritten / supplemented by Better-auth when the real
    // super-admin user signs in and is linked to HQ_ORG_ID.
    //
    // This migration is intentionally separate from v2 so the organization row
    // is guaranteed to exist before we INSERT into member (FK ordering on Neon).
    //
    // IDEMPOTENT: ON CONFLICT (id) DO NOTHING — safe on every redeploy.
    sql: {
      postgres: `
INSERT INTO "member" (id, organization_id, user_id, role, created_at, updated_at)
VALUES ('${HQ_ORG_MEMBER_ID}', '${HQ_ORG_ID}', 'hq-super-admin-placeholder', 'owner', NOW(), NOW())
ON CONFLICT (id) DO NOTHING`,
      sqlite: `
INSERT OR IGNORE INTO member (id, organization_id, user_id, role, created_at, updated_at)
VALUES ('${HQ_ORG_MEMBER_ID}', '${HQ_ORG_ID}', 'hq-super-admin-placeholder', 'owner', datetime('now'), datetime('now'))`,
    },
  },

  // BD2 appends domain table migrations here (version 4+):
  //   { version: 4, sql: `CREATE TABLE IF NOT EXISTS studio_registry ( ... )` },
  //   { version: 5, sql: `CREATE TABLE IF NOT EXISTS provisioning_runs ( ... )` },
  //   { version: 6, sql: `CREATE TABLE IF NOT EXISTS telemetry_snapshots ( ... )` },
];
