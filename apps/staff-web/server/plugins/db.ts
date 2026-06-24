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
    // -------------------------------------------------------------------------
    // LP3-SCHEMA: Trainers roster + location dimension for class occurrences.
    //
    // Version 22: trainers table — lightweight NOT-auth roster (name, home_location,
    //   active). Single-tenant: no studio_id. Additive only.
    //
    // Version 23: unique expression index on lower(name) — dedupe target for the
    //   seed's ON CONFLICT DO NOTHING + create-trainer's reactivate-or-create path.
    //
    // Version 24: nullable location column on class_occurrences.
    //
    // Version 25: nullable trainer_id column on class_occurrences (soft-ref,
    //   no FK — mirrors instructor_user_id TEXT style).
    //
    // Version 26: idempotent HUSTLE trainer seed — 23 rows. The unique
    //   lower(name) index + ON CONFLICT DO NOTHING prevents re-deploy duplication.
    // -------------------------------------------------------------------------
    {
      version: 22,
      sql: `CREATE TABLE IF NOT EXISTS trainers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        home_location TEXT,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      version: 23,
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_trainers_name_lower ON trainers (lower(name))`,
    },
    {
      version: 24,
      sql: `ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS location TEXT`,
    },
    {
      version: 25,
      sql: `ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS trainer_id TEXT`,
    },
    {
      version: 26,
      sql: `INSERT INTO trainers (id, name, home_location, active, created_at) VALUES
        ('trn_seed_01', 'Matty Wiseman',    NULL, 1, datetime('now')),
        ('trn_seed_02', 'Eleanor Perlman',  NULL, 1, datetime('now')),
        ('trn_seed_03', 'Primrose Rushen',  NULL, 1, datetime('now')),
        ('trn_seed_04', 'Charly Willis',    NULL, 1, datetime('now')),
        ('trn_seed_05', 'Jacob Golden',     NULL, 1, datetime('now')),
        ('trn_seed_06', 'Ki Rodrigues',     NULL, 1, datetime('now')),
        ('trn_seed_07', 'Lauren McDonald',  NULL, 1, datetime('now')),
        ('trn_seed_08', 'Debbie Bagley',    NULL, 1, datetime('now')),
        ('trn_seed_09', 'Fiona Brooks',     NULL, 1, datetime('now')),
        ('trn_seed_10', 'Liey Bedingham',   NULL, 1, datetime('now')),
        ('trn_seed_11', 'Shahan Toheed',    NULL, 1, datetime('now')),
        ('trn_seed_12', 'Ben O''Connor',    NULL, 1, datetime('now')),
        ('trn_seed_13', 'Owen Blunden',     NULL, 1, datetime('now')),
        ('trn_seed_14', 'City Bedingham',   NULL, 1, datetime('now')),
        ('trn_seed_15', 'Louise Bates',     NULL, 1, datetime('now')),
        ('trn_seed_16', 'Anthony Trebble',  NULL, 1, datetime('now')),
        ('trn_seed_17', 'Mike Stolworthy',  NULL, 1, datetime('now')),
        ('trn_seed_18', 'Leanne Whitman',   NULL, 1, datetime('now')),
        ('trn_seed_19', 'Bobby Harrison',   NULL, 1, datetime('now')),
        ('trn_seed_20', 'Jess Bacon',       NULL, 1, datetime('now')),
        ('trn_seed_21', 'Ricky Faiers',     NULL, 1, datetime('now')),
        ('trn_seed_22', 'Jordan Eke',       NULL, 1, datetime('now')),
        ('trn_seed_23', 'Vicky Faiers',     NULL, 1, datetime('now'))
      ON CONFLICT DO NOTHING`,
    },
    // -------------------------------------------------------------------------
    // MPV-SCHEMA: Recurrence engine — class_schedule_rules + rule linkage.
    //
    // Version 27: class_schedule_rules — stores the intent of a recurring series.
    //   days_of_week: JSON array of weekday numbers (0=Sun … 6=Sat).
    //   time_of_day: "HH:MM" in studio-local Europe/London time.
    //   generated_through: ISO date cursor — generator advances this after each run.
    //   ends_on: null = open-ended rolling window.
    //   active: 1 = materialise on cron; 0 = deactivated (no future materialisation).
    //
    // Version 28: rule_id column on class_occurrences (soft-ref to class_schedule_rules.id).
    //   Nullable — manual single occurrences have NULL rule_id and are unaffected.
    //
    // Version 29: PARTIAL UNIQUE INDEX on class_occurrences (rule_id, starts_at)
    //   WHERE rule_id IS NOT NULL. Enables idempotent ON CONFLICT DO NOTHING
    //   insert by the nightly materialiser. Works in both Postgres and SQLite.
    //
    // Version 30: covering index on class_schedule_rules (active, starts_on) for
    //   efficient active-rule scans by the nightly materialiser worker job.
    //
    // Additive only — NO DROP / RENAME / TRUNCATE (CLAUDE.md constraint).
    // All four versions register here so they auto-apply on server boot.
    // -------------------------------------------------------------------------
    {
      version: 27,
      sql: `CREATE TABLE IF NOT EXISTS class_schedule_rules (
        id                TEXT PRIMARY KEY,
        definition_id     TEXT NOT NULL,
        days_of_week      TEXT NOT NULL,   -- JSON array of weekday numbers (0=Sun..6=Sat)
        time_of_day       TEXT NOT NULL,   -- "HH:MM" in Europe/London studio-local time
        location          TEXT,            -- "Norwich" | "Wymondham" | null
        capacity          INTEGER NOT NULL DEFAULT 12,
        trainer_id        TEXT,            -- soft-ref to trainers.id
        starts_on         TEXT NOT NULL,   -- ISO date "YYYY-MM-DD"
        ends_on           TEXT,            -- ISO date; null = open-ended
        active            INTEGER NOT NULL DEFAULT 1,
        generated_through TEXT,            -- ISO date cursor; null = not yet generated
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      version: 28,
      sql: `ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS rule_id TEXT`,
    },
    {
      version: 29,
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_occurrences_rule_starts
        ON class_occurrences (rule_id, starts_at)
        WHERE rule_id IS NOT NULL`,
    },
    {
      version: 30,
      sql: `CREATE INDEX IF NOT EXISTS idx_schedule_rules_active ON class_schedule_rules (active, starts_on)`,
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
    // -------------------------------------------------------------------------
    // MC1-01: Meta Conversion Tracking — additive config + attribution.
    //
    // Version 31: additive columns on studio_owner_config singleton for Meta
    //   Pixel ID, Test Event Code, and the per-stage event-name map (JSONB).
    //   All three default to NULL — resolver applies defaults when null/missing.
    //   meta_stage_event_map stores JSON: {"lead":"Lead","contact":"Contact",...}
    //
    // Version 32: meta_lead_attribution table — one row per member, keyed
    //   uniquely on member_id. Persists fbc/fbp/fbclid at submit time and
    //   per-stage sent markers for MC2 dedup. ON CONFLICT(member_id) DO UPDATE
    //   used by MC1-04 worker after send (lead_sent_at / lead_status).
    //
    // Additive only — NO DROP / RENAME / TRUNCATE (CLAUDE.md constraint).
    // Idempotent: IF NOT EXISTS / IF NOT EXISTS guards on both versions.
    // Postgres types: JSONB, TIMESTAMPTZ, NOW() — NOT SQLite datetime('now').
    // NOTE: migrations are NOT auto-applied to gymos-demo Neon by build —
    //   apply v31+v32 to billowing-sun-51091059 after deploy (migration-drift
    //   gotcha from project memory).
    // -------------------------------------------------------------------------
    {
      version: 31,
      sql: `ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;
ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT;
ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_stage_event_map JSONB`,
    },
    {
      version: 32,
      sql: `CREATE TABLE IF NOT EXISTS meta_lead_attribution (
  id                TEXT PRIMARY KEY,
  member_id         TEXT NOT NULL UNIQUE,
  fbc               TEXT,
  fbp               TEXT,
  fbclid            TEXT,
  initial_event_id  TEXT,
  page_url          TEXT,
  client_ip         TEXT,
  client_user_agent TEXT,
  lead_sent_at      TIMESTAMPTZ,
  lead_status       TEXT,
  contact_sent_at   TIMESTAMPTZ,
  purchase_sent_at  TIMESTAMPTZ,
  schedule_sent_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meta_lead_attribution_member ON meta_lead_attribution(member_id)`,
    },
    // -------------------------------------------------------------------------
    // MC1 gap-fix: add last_error column to meta_lead_attribution.
    //
    // Version 33: the worker (services/worker/src/queues/meta-capi-event.ts)
    //   writes `last_error` in its UPDATE statements on every send outcome but
    //   the column was absent from the v32 CREATE TABLE. Strictly additive,
    //   idempotent via IF NOT EXISTS. Postgres TEXT — matches worker usage.
    //   Apply to gymos-demo Neon after deploy (migration-drift gotcha).
    // -------------------------------------------------------------------------
    {
      version: 33,
      sql: `ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS last_error TEXT`,
    },
    // -------------------------------------------------------------------------
    // MC3 (D-13): store the Meta lead_id on the attribution row so lifecycle
    // events (Contact/Purchase/Schedule) report back to Meta's Leads Center
    // keyed on lead_id (LEAD-02). Strictly additive. whatsapp_opt_in.source
    // and webhook_events.provider are plain TEXT (no CHECK constraint), so the
    // two new enum values need only the Drizzle schema edit — no SQL here.
    // Apply to gymos-demo Neon by hand after deploy (migration-drift gotcha).
    // -------------------------------------------------------------------------
    {
      version: 34,
      sql: `ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT`,
    },
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
