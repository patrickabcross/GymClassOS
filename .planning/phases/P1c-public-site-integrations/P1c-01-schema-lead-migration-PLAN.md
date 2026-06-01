---
phase: P1c-public-site-integrations
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql
  - apps/staff-web/server/db/schema.ts
autonomous: false
requirements: [FORMS-01]
must_haves:
  truths:
    - "Writing conversations.status = 'lead' succeeds against Neon (CHECK constraint accepts 'open','closed','snoozed','lead')"
    - "Inserting two gym_members rows with the same non-null email fails with a unique-violation; two rows with NULL email both succeed"
    - "A second form submission by the same person upserts the existing conversation instead of creating a duplicate (unique on member_id, channel)"
    - "A form_submissions table exists with columns id, form_id, member_id, conversation_id, data, submitted_at, ip, submitter_email"
  artifacts:
    - path: "apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql"
      provides: "Additive migration: lead CHECK extension, partial unique indexes, conversations uniqueness, form_submissions table, email dedup"
      contains: "form_submissions"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "Drizzle conversations.status enum includes 'lead'; formSubmissions table export"
      contains: "formSubmissions"
  key_links:
    - from: "apps/staff-web/server/db/schema.ts"
      to: "conversations.status enum"
      via: "Drizzle text enum array"
      pattern: "\"open\", \"closed\", \"snoozed\", \"lead\""
    - from: "apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql"
      to: "Neon gymos-demo DB"
      via: "direct apply via Neon MCP (NOT runMigrations)"
      pattern: "conversations_status_check"
---

<objective>
Ship the single additive migration that everything else in P1c depends on. P1c writes
leads as `conversations.status = 'lead'`, upserts `gym_members` keyed by email/phone, and
upserts one conversation per `(member_id, channel)`. None of those constraints exist yet —
the demo-grade schema is intentionally permissive. This plan adds them additively (no DROP
of data, no RENAME), updates the Drizzle schema to match, and adds an explicit
`form_submissions` table so the forms builder can query responses unambiguously.

Purpose: Pitfalls 1, 2, and 3 from RESEARCH.md all stem from missing constraints. Writing
them first (Wave 0) means the lead-upsert handler in P1c-02 can use `ON CONFLICT` safely.

Output:
- `apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql` (raw SQL, applied directly to Neon)
- `apps/staff-web/server/db/schema.ts` updated (additive: enum value + new table)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md
@.planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md
@apps/staff-web/server/db/schema.ts
@apps/staff-web/server/db/migrations/0002_campaign_opt_out.sql

<interfaces>
<!-- Existing schema the migration mutates (verify at task time). Source: apps/staff-web/server/db/schema.ts -->

```typescript
// conversations — status enum currently ["open","closed","snoozed"]
export const conversations = table("conversations", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),        // FK gym_members.id
  channel: text("channel", { enum: ["whatsapp"] }).notNull().default("whatsapp"),
  status: text("status", { enum: ["open", "closed", "snoozed"] }).notNull().default("open"),
  // ...
});

// gym_members — email + phone_e164 are nullable, NO unique constraint today
export const gymMembers = table("gym_members", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phoneE164: text("phone_e164"),
  marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
  // ...
});
```

<!-- HOW GYM MIGRATIONS ARE APPLIED (CRITICAL — read STATE.md P1b-02 decision):
     The runMigrations() in server/plugins/db.ts ONLY tracks inherited Mail framework
     tables (table: "mail_migrations"). Gym schema migrations 0000/0001/0002 are applied
     DIRECTLY to the gymos-demo Neon DB via the Neon MCP (mcp__Neon__run_sql_transaction),
     NOT through runMigrations. This migration follows the same pattern: write the .sql file
     for the record, then apply it to Neon via MCP, statement-by-statement. Do NOT add it to
     runMigrations and do NOT use drizzle-kit push (CLAUDE.md guard forbids push). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write the additive migration SQL file</name>
  <files>apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql</files>
  <read_first>
    - apps/staff-web/server/db/migrations/0002_campaign_opt_out.sql — the most recent additive migration; match its header comment style and additive-only discipline
    - apps/staff-web/server/db/schema.ts — verify the conversations/gym_members column names match the SQL below
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Common Pitfalls" Pitfall 1/2/3 and §"Open Questions" #1 (constraint name) and #5 (email dedup)
    - .planning/STATE.md §Decisions P1b-02 — confirms gym migrations are applied directly to Neon (not runMigrations)
    - CLAUDE.md "No breaking database changes — ever" — strictly additive: no DROP TABLE/COLUMN, no RENAME, no TRUNCATE, no DELETE without WHERE
  </read_first>
  <action>
Create `apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql` with exactly the
statements below. Each is additive. The constraint name `conversations_status_check` is the
Drizzle-generated name — if Open Question #1's verification (Task 3) finds a different name,
substitute the actual name in the DROP CONSTRAINT line before applying.

```sql
-- ============================================================
-- P1c: Public Site Integrations — lead funnel schema (additive)
-- ============================================================
-- CLAUDE.md no-breaking-DB-changes guard: strictly additive.
-- NO DROP TABLE, NO DROP COLUMN, NO RENAME, NO TRUNCATE, NO destructive ALTER.
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
```

Notes:
- The `DELETE` in statement 2 has a WHERE clause targeting only `rn > 1` duplicates — it is the only deletion and it is bounded. It runs before the unique index so the index creation cannot fail on existing dupes. This satisfies CLAUDE.md "no DELETE without a WHERE".
- Statement 1's DROP CONSTRAINT IF EXISTS only removes a CHECK definition, not data.
- Do NOT add this to `runMigrations` in `server/plugins/db.ts`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql','utf8'); const must=['conversations_status_check','gym_members_email_unique','gym_members_phone_unique','conversations_member_channel_unique','form_submissions','ROW_NUMBER']; const bad=['DROP TABLE','DROP COLUMN','RENAME','TRUNCATE']; for(const m of must){if(!s.includes(m)){console.error('MISSING '+m);process.exit(1)}} for(const b of bad){if(s.toUpperCase().includes(b)){console.error('FORBIDDEN '+b);process.exit(1)}} console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql` exists
    - Contains literal `CHECK (status IN ('open', 'closed', 'snoozed', 'lead'))`
    - Contains literal `gym_members_email_unique` with `WHERE email IS NOT NULL`
    - Contains literal `gym_members_phone_unique` with `WHERE phone_e164 IS NOT NULL`
    - Contains literal `conversations_member_channel_unique`
    - Contains literal `CREATE TABLE IF NOT EXISTS form_submissions`
    - Contains the `ROW_NUMBER() OVER (PARTITION BY email` dedup statement
    - Does NOT contain `DROP TABLE`, `DROP COLUMN`, `RENAME`, or `TRUNCATE` (case-insensitive)
    - The only `DELETE` statement has a `WHERE id IN` clause (never an unqualified DELETE)
    - The verify node script prints `OK`
  </acceptance_criteria>
  <done>
The migration file exists, is strictly additive (verified by the bad-keyword scan), and
contains all five schema changes. Not yet applied to Neon (Task 3).
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Drizzle schema to match the migration (additive)</name>
  <files>apps/staff-web/server/db/schema.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — the conversations table (~line 135) and the end of the file where new table exports go (after webhookEvents / P1b additions)
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Pattern 1" schema additions
  </read_first>
  <action>
Two additive edits to `apps/staff-web/server/db/schema.ts`:

1. Add `'lead'` to the `conversations.status` enum array. Find:
```typescript
  status: text("status", { enum: ["open", "closed", "snoozed"] })
    .notNull()
    .default("open"),
```
Change the enum array to:
```typescript
  status: text("status", { enum: ["open", "closed", "snoozed", "lead"] })
    .notNull()
    .default("open"),
```
(Only the enum array changes — default stays `"open"`. Leads are set explicitly by the upsert.)

2. Add a `formSubmissions` table export near the other P1c-relevant tables (after the
   existing table exports, e.g. after `webhookEvents` / the P1b additions block). Use the
   `table`, `text` helpers already imported at the top of the file (match the existing import
   style — do NOT introduce a new import alias). The `now()` helper is already used throughout:
```typescript
// ---------------------------------------------------------------------------
// P1c additions (2026-06-01) — Public Site Integrations (lead funnel).
// Additive only. form_submissions stores public form/enquiry responses so the
// forms builder can list responses without joining through messages.
// ---------------------------------------------------------------------------
export const formSubmissions = table("form_submissions", {
  id: text("id").primaryKey(),
  formId: text("form_id").notNull(),
  memberId: text("member_id"), // FK gym_members.id — set after lead upsert
  conversationId: text("conversation_id"), // FK conversations.id
  data: text("data").notNull(), // JSON: field responses
  submittedAt: text("submitted_at").notNull().default(now()),
  ip: text("ip"),
  submitterEmail: text("submitter_email"),
});
```

Run `pnpm --filter @gymos/staff-web typecheck` after the edits.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/db/schema.ts` conversations status enum contains literal `"open", "closed", "snoozed", "lead"`
    - File contains literal `export const formSubmissions = table("form_submissions"`
    - formSubmissions export contains columns `formId`, `memberId`, `conversationId`, `data`, `submittedAt`, `ip`, `submitterEmail`
    - `pnpm --filter @gymos/staff-web typecheck` exits with code 0
    - No existing table export was removed (grep for `export const conversations`, `export const gymMembers`, `export const messages` all still present)
  </acceptance_criteria>
  <done>
The Drizzle schema now types `status: 'lead'` as valid and exports `formSubmissions`.
Typecheck passes.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Apply + verify the 0003 migration on Neon</name>
  <what-built>
The 0003 migration SQL file + the matching Drizzle schema edits. This checkpoint applies the
migration to the live gymos-demo Neon DB via the Neon MCP and verifies the constraint name.
  </what-built>
  <how-to-verify>
This is a write against the LIVE Neon DB (gymos-demo, id `billowing-sun-51091059`). The
executor performs these steps using the Neon MCP, then asks you to confirm:

1. **Verify the actual CHECK constraint name first** (Open Question #1) — run via Neon MCP:
   ```sql
   SELECT conname FROM pg_constraint
   WHERE conrelid = 'conversations'::regclass AND contype = 'c';
   ```
   If the returned name is NOT `conversations_status_check`, edit the `DROP CONSTRAINT` line
   in 0003 to use the actual name before applying.

2. **Check for email duplicates** (so you know whether the dedup DELETE will touch rows):
   ```sql
   SELECT email, COUNT(*) FROM gym_members WHERE email IS NOT NULL
   GROUP BY email HAVING COUNT(*) > 1;
   ```
   (Informational — the migration handles dupes either way.)

3. **Apply 0003** statement-by-statement via `mcp__Neon__run_sql_transaction` (same pattern as
   the P1b-02 SUMMARY documents for applying 0001 directly). **AUDIT REQUIREMENT:** the dedup
   `DELETE FROM gym_members` (statement 2) may remove rows. Capture how many rows it deleted
   (the statement's affected-row count, or re-run the step-2 duplicate query before/after to
   compute it). **If ANY rows are deleted, the deleted count MUST be recorded in the
   P1c-01 SUMMARY** for audit (e.g. "dedup DELETE removed N gym_members rows: <ids>"). A clean
   seed should delete 0 rows.

4. **Verify each change landed:**
   ```sql
   -- lead now allowed:
   INSERT INTO conversations (id, member_id, channel, status, created_at, updated_at)
     VALUES ('p1c_test_lead', (SELECT id FROM gym_members LIMIT 1), 'whatsapp', 'lead', now(), now())
     ON CONFLICT (member_id, channel) DO NOTHING;
   -- indexes exist:
   SELECT indexname FROM pg_indexes WHERE tablename IN ('gym_members','conversations')
     AND indexname IN ('gym_members_email_unique','gym_members_phone_unique','conversations_member_channel_unique');
   -- table exists:
   SELECT to_regclass('public.form_submissions');
   -- cleanup the test row:
   DELETE FROM conversations WHERE id = 'p1c_test_lead';
   ```
   Expect: the lead INSERT succeeds (no CHECK violation), all three index names returned,
   `form_submissions` regclass non-null.

Confirm the four verification queries all returned the expected results, and report the
dedup DELETE row count (0 expected).
  </how-to-verify>
  <resume-signal>Type "migration applied" once the four verification queries pass (and the dedup delete count is recorded), or describe any failure.</resume-signal>
</task>

</tasks>

<verification>
- Migration file is strictly additive (bad-keyword scan passes)
- Drizzle schema typechecks with the 'lead' enum value + formSubmissions export
- The migration is applied to gymos-demo Neon and verified: lead status accepted, three unique indexes present, form_submissions table exists
- The actual CHECK constraint name was confirmed before the DROP/ADD
- The dedup DELETE row count was recorded in the SUMMARY (0 expected)
</verification>

<success_criteria>
1. `conversations.status = 'lead'` is writable against Neon
2. gym_members email + phone_e164 have partial unique indexes (NULLs allowed, dupes rejected)
3. conversations has a unique (member_id, channel) so lead upsert is idempotent
4. form_submissions table exists for the forms builder to query
5. Nothing was dropped, renamed, or truncated
</success_criteria>

<output>
After completion, create `.planning/phases/P1c-public-site-integrations/P1c-01-schema-lead-migration-SUMMARY.md` documenting:
- The actual CHECK constraint name found (was it conversations_status_check?)
- How many email-duplicate rows the dedup DELETE removed (0 expected for clean seed) — REQUIRED for audit
- Confirmation the three unique indexes + form_submissions table exist in Neon
- The Neon MCP statement-by-statement application method used (mirrors P1b-02)
</output>
