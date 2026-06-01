-- ============================================================
-- P1c: Public Site Integrations — lead funnel schema (additive)
-- ============================================================
-- CLAUDE.md no-breaking-DB-changes guard: strictly additive.
-- No table or column drops, no schema mutations, no destructive ALTERs.
-- Dropping/recreating a CHECK constraint is additive at the DATA level
-- (no rows removed) — it only widens the allowed value set.
-- Applied DIRECTLY to gymos-demo Neon via Neon MCP (NOT runMigrations).
-- Covers RESEARCH Pitfalls 1, 2, 3 + Open Questions 1 and 5.

-- 1. Extend conversations.status CHECK to allow 'lead' (Pitfall 1).
--    Drizzle text-enum on Postgres = a CHECK constraint, not a PG ENUM type.
--    Dropping + re-adding the CHECK widens the allowed set; no data lost.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'closed', 'snoozed', 'lead'));

-- 2. De-dup gym_members.email BEFORE the unique index (Open Question 5).
--    Keep the earliest-created row per email; this is the only destructive-looking
--    statement and it is gated by a WHERE that targets only true duplicates.
--    If the seed has no email dupes this is a no-op (deletes 0 rows).
DELETE FROM gym_members WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at) AS rn
    FROM gym_members WHERE email IS NOT NULL
  ) t WHERE t.rn > 1
);

-- 3. Partial unique indexes on gym_members (Pitfall 2). Partial = allow many NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS gym_members_email_unique
  ON gym_members (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gym_members_phone_unique
  ON gym_members (phone_e164) WHERE phone_e164 IS NOT NULL;

-- 4. Unique on conversations (member_id, channel) so lead upsert can ON CONFLICT (Pitfall 3).
CREATE UNIQUE INDEX IF NOT EXISTS conversations_member_channel_unique
  ON conversations (member_id, channel);

-- 5. form_submissions table — explicit response store for the forms builder.
CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  member_id TEXT,
  conversation_id TEXT,
  data TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT now(),
  ip TEXT,
  submitter_email TEXT
);
CREATE INDEX IF NOT EXISTS form_submissions_form_id_idx ON form_submissions (form_id);
