/**
 * packages/hq-schema/src/schema.ts
 *
 * HQ Drizzle table definitions.
 *
 * BD1 FOUNDATION — only the tables needed for the HQ control-plane shell.
 * BD2 will ADD domain tables here (studio registry, provisioning_runs,
 * telemetry snapshots). All future tables MUST be additive (CREATE TABLE IF
 * NOT EXISTS; ALTER TABLE ... ADD COLUMN IF NOT EXISTS). NEVER DROP or RENAME.
 *
 * PII-UP BOUNDARY — CRITICAL:
 * No column name may match *connection*, *database_url*, or *dsn*.
 * HQ stores Neon project IDs and Vercel project IDs (provider resource IDs),
 * never connection strings. Connection strings live in Neon/Vercel and are
 * fetched at provisioning time, never persisted here.
 * A CI guard (scripts/guard-hq-no-pii.mjs, BD1-06) enforces this at build time.
 */

import { table, text, integer, now } from "@agent-native/core/db/schema";

// ---------------------------------------------------------------------------
// hq_app_meta — single-row foundation table.
//
// Records the seeded HQ org ID + schema version so Brain/Dispatch
// accessFilter/orgId queries return non-empty results immediately (Pitfall
// F-02). BD1-03 writes the first row via a runMigrations seed statement.
// Readiness checks (Brain, Dispatch startup) can query this table to confirm
// HQ is seeded before serving traffic.
// ---------------------------------------------------------------------------

export const hqAppMeta = table("hq_app_meta", {
  // Single-row sentinel — always "hq" so ON CONFLICT(id) enables upsert.
  id: text("id").primaryKey(),

  // The Better-auth org ID seeded for HQ (used by accessFilter + orgId queries).
  // BD1-03 writes this during the seed migration.
  hqOrgId: text("hq_org_id"),

  // The Better-auth user ID of the super-admin seeded for HQ.
  // BD1-03 writes this during the seed migration.
  superAdminUserId: text("super_admin_user_id"),

  // Schema version — incremented in BD2+ when domain tables are added.
  schemaVersion: integer("schema_version").notNull().default(1),

  // ISO timestamp: when the HQ org + super-admin seed was applied.
  seededAt: text("seeded_at"),

  // ISO timestamp: last time this row was touched (e.g. by a re-seed or upgrade).
  updatedAt: text("updated_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// BD2 extension point — domain tables added here in BD2:
//
//   export const studioRegistry = table("studio_registry", { ... });
//   export const provisioningRuns = table("provisioning_runs", { ... });
//   export const telemetrySnapshots = table("telemetry_snapshots", { ... });
//
// BD1-03 appends the HQ org + super-admin seed migration in migrations.ts.
// ---------------------------------------------------------------------------
