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
// BD2 domain tables — studio registry, provisioning, telemetry, token hash.
//
// Column names match the v4-v7 SQL in migrations.ts EXACTLY.
// PII-up boundary: no column name matches *connection*, *database_url*, or
// *dsn*. Only opaque provider resource IDs are stored here. guard:hq-no-pii.
// ---------------------------------------------------------------------------

// hq_studios — one row per provisioned (or pending) studio.
export const hqStudios = table("hq_studios", {
  id: text("id").primaryKey(),
  // slug UNIQUE is the DB-level idempotency guard for duplicate signup runs.
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  status: text("status").notNull().default("pending"),
  planId: text("plan_id"),
  provisionedAt: text("provisioned_at"),
  createdAt: text("created_at").notNull().default(now()),
});

// hq_provisioning_runs — per-saga state machine row.
// Stores only opaque provider resource IDs (neon_project_id, etc.) — NEVER
// a Neon connection string (D-13 / Pitfall P-05).
export const hqProvisioningRuns = table("hq_provisioning_runs", {
  id: text("id").primaryKey(),
  studioId: text("studio_id").notNull(),
  status: text("status").notNull().default("started"),
  // Opaque provider resource IDs — not connection strings.
  neonProjectId: text("neon_project_id"),
  vercelProjectId: text("vercel_project_id"),
  flyAppName: text("fly_app_name"),
  subdomain: text("subdomain"),
  // Per-step completion timestamps (NULL = step not yet run).
  step1At: text("step_1_at"),
  step2At: text("step_2_at"),
  step3At: text("step_3_at"),
  step4At: text("step_4_at"),
  step5At: text("step_5_at"),
  step6At: text("step_6_at"),
  step7At: text("step_7_at"),
  step8At: text("step_8_at"),
  // LIFO compensation error log (JSON map of step→error string).
  compensationErrors: text("compensation_errors").notNull().default("{}"),
  startedAt: text("started_at").notNull().default(now()),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull().default(now()),
});

// hq_telemetry_snapshots — full TelemetrySnapshot JSON per studio per period.
// UNIQUE(studio_id, period_start) enables idempotent upsert on re-push.
export const hqTelemetrySnapshots = table("hq_telemetry_snapshots", {
  id: text("id").primaryKey(),
  studioId: text("studio_id").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  // Full TelemetrySnapshot JSON (aggregate counts/rates only — no PII).
  payloadJson: text("payload_json").notNull(),
  receivedAt: text("received_at").notNull().default(now()),
  // Denormalised for fast watchdog query: which studios haven't pushed recently?
  lastTelemetryReceivedAt: text("last_telemetry_received_at"),
});

// hq_token_usage — daily aggregated LLM token counts per studio.
// PRIMARY KEY(studio_id, date) enables idempotent accumulation (ON CONFLICT UPDATE).
export const hqTokenUsage = table("hq_token_usage", {
  studioId: text("studio_id").notNull(),
  date: text("date").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(now()),
});

// hq_studio_tokens — per-studio telemetry bearer token (sha256 hash only).
// HQ stores ONLY the hash; the studio holds the plaintext (D-05).
// token_hash UNIQUE prevents hash collisions (astronomically unlikely but safe).
export const hqStudioTokens = table("hq_studio_tokens", {
  studioId: text("studio_id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull().default(now()),
  revokedAt: text("revoked_at"),
});
