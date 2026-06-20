import { runMigrations, intType } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      sql: `CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('snooze', 'send_later')),
    email_id TEXT,
    payload TEXT NOT NULL,
    run_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'cancelled')),
    created_at INTEGER NOT NULL
  )`,
    },
    {
      version: 2,
      sql: `ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS account_email TEXT`,
    },
    {
      version: 3,
      sql: `ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS owner_email TEXT`,
    },
    {
      version: 4,
      sql: `ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS thread_id TEXT`,
    },
    {
      version: 5,
      sql: `CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    condition TEXT NOT NULL,
    actions TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
    },
    {
      version: 6,
      sql: `CREATE TABLE IF NOT EXISTS contact_frequency (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    send_count ${intType()} NOT NULL DEFAULT 0,
    receive_count ${intType()} NOT NULL DEFAULT 0,
    last_contacted_at ${intType()} NOT NULL
  )`,
    },
    {
      version: 7,
      sql: `CREATE TABLE IF NOT EXISTS email_tracking (
    pixel_token TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    sent_at ${intType()} NOT NULL,
    opens_count ${intType()} NOT NULL DEFAULT 0,
    first_opened_at ${intType()},
    last_opened_at ${intType()},
    last_user_agent TEXT
  )`,
    },
    {
      version: 8,
      sql: `CREATE INDEX IF NOT EXISTS idx_email_tracking_message_id ON email_tracking(message_id)`,
    },
    {
      version: 9,
      sql: `CREATE TABLE IF NOT EXISTS email_link_tracking (
    click_token TEXT PRIMARY KEY,
    pixel_token TEXT NOT NULL,
    url TEXT NOT NULL,
    clicks_count ${intType()} NOT NULL DEFAULT 0,
    first_clicked_at ${intType()},
    last_clicked_at ${intType()}
  )`,
    },
    {
      version: 10,
      sql: `CREATE INDEX IF NOT EXISTS idx_email_link_tracking_pixel_token ON email_link_tracking(pixel_token)`,
    },
    {
      version: 11,
      sql: `CREATE TABLE IF NOT EXISTS queued_email_drafts (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    requester_name TEXT,
    to_recipients TEXT NOT NULL,
    cc_recipients TEXT,
    bcc_recipients TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    context TEXT,
    source TEXT NOT NULL DEFAULT 'agent',
    source_thread_id TEXT,
    account_email TEXT,
    compose_id TEXT,
    sent_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'in_review', 'sent', 'dismissed')),
    created_at ${intType()} NOT NULL,
    updated_at ${intType()} NOT NULL,
    sent_at ${intType()}
  )`,
    },
    {
      version: 12,
      sql: `CREATE INDEX IF NOT EXISTS idx_queued_email_drafts_owner_status ON queued_email_drafts(org_id, owner_email, status, created_at)`,
    },
    {
      version: 13,
      sql: `CREATE INDEX IF NOT EXISTS idx_queued_email_drafts_requester ON queued_email_drafts(org_id, requester_email, created_at)`,
    },
    // -------------------------------------------------------------------------
    // BD2-03: Studio-side telemetry capture (TEL-01).
    //
    // Version 14: singleton accumulator row for the current reporting window.
    // The AFTER INSERT trigger on token_usage (version 15 below) increments
    // token_usage_today_* on every recordUsage INSERT — fork-safe, requires
    // zero @agent-native/core changes (BD1-ANTHROPIC-AUDIT Option A).
    //
    // The BD2-04 push job reads this row, builds a TelemetrySnapshot, POSTs
    // to HQ, then resets the accumulators on success.
    //
    // Dual-dialect: all columns use plain Postgres types (TEXT / INTEGER).
    // SQLite in local dev handles INTEGER / TEXT identically for this table.
    // The trigger (version 15) is Postgres-only; a no-op comment is used for
    // SQLite so the migration runner does not error on the dev path.
    // -------------------------------------------------------------------------
    {
      version: 14,
      sql: `CREATE TABLE IF NOT EXISTS studio_telemetry_state (
        id                       TEXT PRIMARY KEY,   -- always 'singleton'
        token_usage_today_input  INTEGER NOT NULL DEFAULT 0,
        token_usage_today_output INTEGER NOT NULL DEFAULT 0,
        request_count_today      INTEGER NOT NULL DEFAULT 0,
        outbound_sent_today      INTEGER NOT NULL DEFAULT 0,
        outbound_failed_today    INTEGER NOT NULL DEFAULT 0,
        last_push_at             TEXT,
        last_push_status         TEXT,
        updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    // -------------------------------------------------------------------------
    // BD4-01: Studio Brain + Dispatcher — three additive tables.
    //
    // Version 16: studio_brain_docs — lightweight Brain knowledge for GOB.
    //   Three singleton rows per deploy: brand-voice, ethos, class-catalog.
    //   id is the doc_type slug (singleton-per-type pattern).
    //
    // Version 17: studio_owner_config — singleton config consumed by GOD digest
    //   and heartbeat scheduled jobs. Seeded by provisioner at deploy time.
    //
    // Version 18: reactivation_attempts — GOD-04 suppression ceiling tracker.
    //   max 3 attempts per member per rolling 90-day window.
    //
    // Version 19: index on reactivation_attempts(member_id, sent_at) for
    //   efficient 90-day rolling window suppression queries.
    //
    // Additive only — NO DROP / RENAME / TRUNCATE (CLAUDE.md constraint).
    // All four versions register in this runMigrations array so they are
    // auto-applied on server boot (unlike standalone .sql files in migrations/).
    // -------------------------------------------------------------------------
    {
      version: 16,
      sql: `CREATE TABLE IF NOT EXISTS studio_brain_docs (
        id         TEXT PRIMARY KEY,
        doc_type   TEXT NOT NULL,
        title      TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL DEFAULT '',
        seeded_at  TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      version: 17,
      sql: `CREATE TABLE IF NOT EXISTS studio_owner_config (
        id                   TEXT PRIMARY KEY,
        owner_phone_e164     TEXT NOT NULL DEFAULT '',
        studio_timezone      TEXT NOT NULL DEFAULT 'Europe/London',
        digest_enabled       INTEGER NOT NULL DEFAULT 1,
        heartbeat_enabled    INTEGER NOT NULL DEFAULT 1,
        heartbeat_batch_size INTEGER NOT NULL DEFAULT 50,
        created_at           TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      version: 18,
      sql: `CREATE TABLE IF NOT EXISTS reactivation_attempts (
        id         TEXT PRIMARY KEY,
        member_id  TEXT NOT NULL,
        sent_at    TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      version: 19,
      sql: `CREATE INDEX IF NOT EXISTS idx_reactivation_attempts_member_sent ON reactivation_attempts(member_id, sent_at)`,
    },
    // -------------------------------------------------------------------------
    // CV1 MIG-01: additive content + video tables. Single-tenant — NO studio_id,
    // NO ownableColumns. Reads use // guard:allow-unscoped. NEVER DROP/RENAME.
    // -------------------------------------------------------------------------
    {
      version: 20,
      sql: `CREATE TABLE IF NOT EXISTS content_documents (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL DEFAULT '',
        status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
        slug       TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      version: 21,
      sql: `CREATE TABLE IF NOT EXISTS video_compositions (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT '',
        spec       TEXT NOT NULL DEFAULT '{}',
        status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
        slug       TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    // Version 15: AFTER INSERT trigger on token_usage (Postgres only).
    // Step A: CREATE OR REPLACE FUNCTION — idempotent, never drops.
    // Step B: CREATE TRIGGER — guarded by pg_trigger check so re-running this
    //         migration on an already-provisioned Neon is safe (additive).
    //
    // The token_usage table is created by @agent-native/core's recordUsage
    // path (packages/core/src/usage/store.ts). It always exists in a studio
    // Neon before this trigger fires because runMigrations for agent-native
    // core tables runs first via the framework bootstrap.
    //
    // NEVER add DROP TRIGGER / DROP FUNCTION here — CLAUDE.md forbids it.
    {
      version: 15,
      // postgres path: plpgsql function + conditional trigger creation
      // sqlite path: no-op comment (SQLite does not support plpgsql / pg_trigger)
      sql: `DO $dialect$
BEGIN
  -- Is this a Postgres-dialect Neon DB? Check for a Postgres-only system table.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'information_schema') THEN

    -- Step A: idempotent function (CREATE OR REPLACE never drops).
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION accumulate_token_usage() RETURNS trigger AS $body$
      BEGIN
        INSERT INTO studio_telemetry_state
          (id, token_usage_today_input, token_usage_today_output, request_count_today, updated_at)
        VALUES
          ('singleton', NEW.input_tokens, NEW.output_tokens, 1, NOW())
        ON CONFLICT (id) DO UPDATE SET
          token_usage_today_input  = studio_telemetry_state.token_usage_today_input  + EXCLUDED.token_usage_today_input,
          token_usage_today_output = studio_telemetry_state.token_usage_today_output + EXCLUDED.token_usage_today_output,
          request_count_today      = studio_telemetry_state.request_count_today + 1,
          updated_at               = NOW();
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql
    $fn$;

    -- Step B: idempotent trigger guard — never drops, never replaces (additive).
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_token_usage_accumulate'
    ) THEN
      EXECUTE $trig$
        CREATE TRIGGER trg_token_usage_accumulate
        AFTER INSERT ON token_usage
        FOR EACH ROW EXECUTE FUNCTION accumulate_token_usage()
      $trig$;
    END IF;

  END IF;
END
$dialect$`,
    },
  ],
  { table: "mail_migrations" },
);
