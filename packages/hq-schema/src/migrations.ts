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

  // ─── BD2 domain table migrations ───────────────────────────────────────────
  // All migrations below are additive: CREATE TABLE IF NOT EXISTS only.
  // NEVER store connection strings here — only opaque provider resource IDs.
  // PII-up boundary enforced by guard-hq-no-pii.mjs (guard:hq-no-pii).

  {
    version: 4,
    // BD2 studio registry — one row per provisioned studio.
    // slug UNIQUE is the DB-level idempotency guard (Pitfall P-03):
    // prevents two saga runs from creating duplicate studio registry entries.
    sql: {
      postgres: `CREATE TABLE IF NOT EXISTS hq_studios (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  owner_email   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  plan_id       TEXT,
  provisioned_at TEXT,
  created_at    TEXT NOT NULL DEFAULT NOW()
)`,
      sqlite: `CREATE TABLE IF NOT EXISTS hq_studios (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  owner_email   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  plan_id       TEXT,
  provisioned_at TEXT,
  created_at    TEXT NOT NULL DEFAULT datetime('now')
)`,
    },
  },

  {
    version: 5,
    // BD2 provisioning runs — per-step saga state for the 8-step provisioner.
    // Stores only opaque provider resource IDs (neon_project_id,
    // vercel_project_id, fly_app_name) — NEVER a connection string (D-13).
    // step_N_at columns track which steps have completed (NULL = not yet run),
    // enabling idempotent saga replay after failures (D-09).
    sql: {
      postgres: `CREATE TABLE IF NOT EXISTS hq_provisioning_runs (
  id                   TEXT PRIMARY KEY,
  studio_id            TEXT NOT NULL REFERENCES hq_studios(id),
  status               TEXT NOT NULL DEFAULT 'started',
  neon_project_id      TEXT,
  vercel_project_id    TEXT,
  fly_app_name         TEXT,
  subdomain            TEXT,
  step_1_at            TEXT,
  step_2_at            TEXT,
  step_3_at            TEXT,
  step_4_at            TEXT,
  step_5_at            TEXT,
  step_6_at            TEXT,
  step_7_at            TEXT,
  step_8_at            TEXT,
  compensation_errors  TEXT NOT NULL DEFAULT '{}',
  started_at           TEXT NOT NULL DEFAULT NOW(),
  completed_at         TEXT,
  updated_at           TEXT NOT NULL DEFAULT NOW()
)`,
      sqlite: `CREATE TABLE IF NOT EXISTS hq_provisioning_runs (
  id                   TEXT PRIMARY KEY,
  studio_id            TEXT NOT NULL REFERENCES hq_studios(id),
  status               TEXT NOT NULL DEFAULT 'started',
  neon_project_id      TEXT,
  vercel_project_id    TEXT,
  fly_app_name         TEXT,
  subdomain            TEXT,
  step_1_at            TEXT,
  step_2_at            TEXT,
  step_3_at            TEXT,
  step_4_at            TEXT,
  step_5_at            TEXT,
  step_6_at            TEXT,
  step_7_at            TEXT,
  step_8_at            TEXT,
  compensation_errors  TEXT NOT NULL DEFAULT '{}',
  started_at           TEXT NOT NULL DEFAULT datetime('now'),
  completed_at         TEXT,
  updated_at           TEXT NOT NULL DEFAULT datetime('now')
)`,
    },
  },

  {
    version: 6,
    // BD2 telemetry storage — two tables in one migration (dual-dialect).
    // hq_telemetry_snapshots: full TelemetrySnapshot JSON per studio per period.
    //   UNIQUE(studio_id, period_start) enables idempotent upsert on re-push.
    //   last_telemetry_received_at is denormalised for fast watchdog queries.
    // hq_token_usage: daily aggregated token counts per studio (BD3 HQB input).
    //   PRIMARY KEY(studio_id, date) enables idempotent accumulation.
    sql: {
      postgres: `CREATE TABLE IF NOT EXISTS hq_telemetry_snapshots (
  id                          TEXT PRIMARY KEY,
  studio_id                   TEXT NOT NULL REFERENCES hq_studios(id),
  period_start                TEXT NOT NULL,
  period_end                  TEXT NOT NULL,
  payload_json                TEXT NOT NULL,
  received_at                 TEXT NOT NULL DEFAULT NOW(),
  last_telemetry_received_at  TEXT,
  UNIQUE(studio_id, period_start)
);

CREATE TABLE IF NOT EXISTS hq_token_usage (
  studio_id     TEXT NOT NULL REFERENCES hq_studios(id),
  date          TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT NOW(),
  PRIMARY KEY(studio_id, date)
)`,
      sqlite: `CREATE TABLE IF NOT EXISTS hq_telemetry_snapshots (
  id                          TEXT PRIMARY KEY,
  studio_id                   TEXT NOT NULL REFERENCES hq_studios(id),
  period_start                TEXT NOT NULL,
  period_end                  TEXT NOT NULL,
  payload_json                TEXT NOT NULL,
  received_at                 TEXT NOT NULL DEFAULT datetime('now'),
  last_telemetry_received_at  TEXT,
  UNIQUE(studio_id, period_start)
);

CREATE TABLE IF NOT EXISTS hq_token_usage (
  studio_id     TEXT NOT NULL REFERENCES hq_studios(id),
  date          TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT datetime('now'),
  PRIMARY KEY(studio_id, date)
)`,
    },
  },

  {
    version: 7,
    // BD2 studio tokens — per-studio telemetry bearer token hash (D-05).
    // token_hash stores sha256(plaintext_token) only; HQ never holds plaintext.
    // revoked_at enables token revocation without deletion (audit trail).
    sql: {
      postgres: `CREATE TABLE IF NOT EXISTS hq_studio_tokens (
  studio_id   TEXT PRIMARY KEY REFERENCES hq_studios(id),
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT NOW(),
  revoked_at  TEXT
)`,
      sqlite: `CREATE TABLE IF NOT EXISTS hq_studio_tokens (
  studio_id   TEXT PRIMARY KEY REFERENCES hq_studios(id),
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT datetime('now'),
  revoked_at  TEXT
)`,
    },
  },

  // ─── BD3 HQD tables ────────────────────────────────────────────────────────
  // HQ WhatsApp Dispatcher tables for gym-owner B2B communications.
  // STRUCTURAL EXCLUSION: These tables store gym-OWNER contact info only —
  // not gym members. HQ Neon physically contains no member records (D-07/D-08).
  // All columns pass guard:hq-no-pii (no *connection*/*database_url*/*dsn*).

  {
    version: 8,
    // BD3 HQD — gym-owner opt-in for HQ WABA B2B comms (HQD-01).
    // One row per studio (UNIQUE studio_id). phone_e164 + owner_email are
    // the GYM-OWNER's own contact info captured at signup — NOT gym members.
    // last_inbound_at: when the owner last messaged HQ (drives the 24h window gate).
    // opted_out_at NULL = active opt-in; SET = opted out.
    // opt_in_source: 'signup' | 'manual' — how opt-in was captured.
    sql: {
      postgres: `CREATE TABLE IF NOT EXISTS hq_whatsapp_opt_in (
  id            TEXT PRIMARY KEY,
  studio_id     TEXT NOT NULL REFERENCES hq_studios(id),
  -- Owner contact (the gym-owner, not a gym member)
  owner_email   TEXT NOT NULL,
  phone_e164    TEXT NOT NULL,
  last_inbound_at TEXT,
  opted_in_at   TEXT NOT NULL DEFAULT NOW(),
  opted_out_at  TEXT,
  opt_in_source TEXT NOT NULL DEFAULT 'signup',
  created_at    TEXT NOT NULL DEFAULT NOW(),
  UNIQUE(studio_id)
)`,
      sqlite: `CREATE TABLE IF NOT EXISTS hq_whatsapp_opt_in (
  id            TEXT PRIMARY KEY,
  studio_id     TEXT NOT NULL REFERENCES hq_studios(id),
  -- Owner contact (the gym-owner, not a gym member)
  owner_email   TEXT NOT NULL,
  phone_e164    TEXT NOT NULL,
  last_inbound_at TEXT,
  opted_in_at   TEXT NOT NULL DEFAULT datetime('now'),
  opted_out_at  TEXT,
  opt_in_source TEXT NOT NULL DEFAULT 'signup',
  created_at    TEXT NOT NULL DEFAULT datetime('now'),
  UNIQUE(studio_id)
)`,
    },
  },

  {
    version: 9,
    // BD3 HQD — approved HQ owner-comms templates registry (HQD-03).
    // Mirrors the studio whatsapp_templates pattern. Populated manually or
    // via a Meta template-API sync action. Template name is unique.
    // status: 'pending' | 'approved' | 'rejected' — gate checks status='approved'.
    sql: {
      postgres: `CREATE TABLE IF NOT EXISTS hq_whatsapp_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',
  language        TEXT NOT NULL DEFAULT 'en_US',
  components_json TEXT,
  synced_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT NOW()
)`,
      sqlite: `CREATE TABLE IF NOT EXISTS hq_whatsapp_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',
  language        TEXT NOT NULL DEFAULT 'en_US',
  components_json TEXT,
  synced_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT datetime('now')
)`,
    },
  },

  // ─── BD3-05 HQD-04 Content documents ──────────────────────────────────────
  // Non-collab document tables (D-03 / D-10): single super-admin, no Yjs/CRDT.
  // NO Notion sync tables, NO comments tables — those are collab-only.
  // ownableColumns() on `documents` provides org-scoping (HQ_ORG_ID).
  // document_versions: version snapshot ring buffer (no collab dependency).
  // document_shares: standard share table consumed by accessFilter.
  // PII-up pass: no *connection*/*database_url*/*dsn* columns.

  {
    version: 10,
    sql: {
      postgres: `CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  content     TEXT NOT NULL DEFAULT '',
  icon        TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT NOW(),
  updated_at  TEXT NOT NULL DEFAULT NOW(),
  -- ownableColumns()
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id      TEXT,
  visibility  TEXT NOT NULL DEFAULT 'private'
);

CREATE TABLE IF NOT EXISTS document_versions (
  id          TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  document_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_shares (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id   TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'viewer',
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT NOW()
)`,
      sqlite: `CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  content     TEXT NOT NULL DEFAULT '',
  icon        TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT datetime('now'),
  updated_at  TEXT NOT NULL DEFAULT datetime('now'),
  -- ownableColumns()
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id      TEXT,
  visibility  TEXT NOT NULL DEFAULT 'private'
);

CREATE TABLE IF NOT EXISTS document_versions (
  id          TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  document_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT datetime('now')
);

CREATE TABLE IF NOT EXISTS document_shares (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id   TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'viewer',
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT datetime('now')
)`,
    },
  },
];
