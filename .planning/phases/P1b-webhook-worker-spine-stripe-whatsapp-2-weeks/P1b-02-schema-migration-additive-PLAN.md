---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql
  - apps/staff-web/server/db/migrations/meta/_journal.json
  - apps/staff-web/server/db/migrations/meta/0001_snapshot.json
autonomous: false
requirements: [WEB-03, WEB-05, WA-04, WA-06, WA-07, WA-08, STR-03, STR-04, STR-05, STR-06, STR-07]
must_haves:
  truths:
    - "webhook_events has (provider, external_id) UNIQUE constraint enforced — duplicate inserts return ON CONFLICT DO NOTHING"
    - "Existing webhook_events demo rows have external_id populated by backfill (parsed from id column)"
    - "whatsapp_opt_in table exists and gym_members FK is enforced"
    - "whatsapp_templates table exists with status enum (pending|approved|rejected|paused|disabled)"
    - "whatsapp_window_state VIEW exists and returns in_window + hours_left per conversation"
    - "stripe_customers, stripe_subscriptions, payments tables exist with proper unique constraints"
    - "secrets table exists with pgcrypto pgp_sym_encrypt/decrypt functions available"
    - "pgcrypto extension is enabled in gymos-demo Neon project"
    - "Migration is strictly additive — no DROP, no RENAME, no destructive ALTER"
    - "messages.delivered_at, messages.read_at, messages.error_code columns added (nullable) for ordinal-guarded status updates"
  artifacts:
    - path: "apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql"
      provides: "Single additive Drizzle migration adding all P1b tables + webhook_events extension + VIEW + pgcrypto enable"
      contains: "CREATE TABLE whatsapp_opt_in"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "All P1b Drizzle table definitions appended (whatsappOptIn, whatsappTemplates, stripeCustomers, stripeSubscriptions, payments, secrets); webhookEvents extended with externalId column"
      contains: "export const whatsappOptIn"
  key_links:
    - from: "webhook_events.provider + webhook_events.external_id"
      to: "UNIQUE INDEX webhook_events_provider_external_id_unique"
      via: "additive CREATE UNIQUE INDEX after backfill"
      pattern: "CREATE UNIQUE INDEX.*webhook_events.*provider.*external_id"
    - from: "whatsapp_window_state VIEW"
      to: "conversations.last_inbound_at"
      via: "CASE WHEN (NOW() - last_inbound_at) < INTERVAL '24 hours'"
      pattern: "INTERVAL '24 hours'"
    - from: "secrets.ciphertext"
      to: "pgcrypto pgp_sym_encrypt"
      via: "CREATE EXTENSION pgcrypto + bytea storage"
      pattern: "pgp_sym_encrypt"
---

<objective>
Ship the single additive Drizzle migration that adds every P1b table + extends `webhook_events` for composite-key idempotency. Strictly additive per CLAUDE.md no-breaking-DB-changes guard: no DROP, no RENAME, no destructive ALTER. Critical sequencing: BACKFILL existing webhook_events.external_id from the `id` column BEFORE creating the UNIQUE constraint (PITFALL #7 in research). Enable pgcrypto extension for Stripe restricted-key encryption (STR-01 storage). Create whatsapp_window_state as a VIEW (D-15 default) so the staff-web loader can read computed window state per conversation.

Purpose: Establishes the data foundation P1b needs. Without this migration, Plan 04 (edge-webhooks) can't enforce ON CONFLICT (provider, external_id), Plan 05 (inbound worker) can't ordinal-guard message status, Plan 06 (sendMessage chokepoint) can't gate on opt-in/window/templates, and Plan 07 (Stripe reducers) can't mirror customers/subscriptions/payments.
Output: One migration file (`0001_p1b_webhook_worker_spine.sql`) + updated `schema.ts` + migration applied to gymos-demo Neon.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@apps/staff-web/server/db/schema.ts
@apps/staff-web/drizzle.config.ts
@CLAUDE.md
@AGENTS.md

<interfaces>
<!-- Tables ADDED by this migration (per D-15 in CONTEXT, §"Schema additions") -->

New tables:
- whatsapp_opt_in (member_id PK FK gym_members.id, opted_in_at, evidence_message_id FK messages.id, evidence_payload, source enum[inbound_reply|manual_admin|import])
- whatsapp_templates (name PK, status enum[pending|approved|rejected|paused|disabled], category enum[utility|marketing|authentication], language default 'en_US', components_json, last_synced_at)
- stripe_customers (stripe_customer_id PK, member_id nullable FK gym_members.id, raw_json, updated_at)
- stripe_subscriptions (stripe_subscription_id PK, member_id FK gym_members.id, status enum, plan_id, current_period_end, raw_json, updated_at)
- payments (id PK 'pay_<paymentIntentId>', member_id nullable FK gym_members.id, stripe_payment_intent_id UNIQUE, amount_minor_units int, currency, status enum[succeeded|failed|refunded|pending], raw_json, occurred_at)
- secrets (name PK, ciphertext bytea, updated_at, last_used_at)

New VIEW:
- whatsapp_window_state (member_id, conversation_id, last_inbound_at, in_window bool, hours_left real)

New extension:
- pgcrypto (CREATE EXTENSION IF NOT EXISTS)

Extensions to existing webhook_events table:
- ADD COLUMN external_id TEXT (nullable to accommodate existing rows)
- BACKFILL: UPDATE webhook_events SET external_id = SUBSTRING(id FROM POSITION(':' IN id) + 1), provider = SPLIT_PART(id, ':', 1) WHERE external_id IS NULL
- CREATE UNIQUE INDEX webhook_events_provider_external_id_unique ON webhook_events (provider, external_id)

Extensions to existing messages table (WA-04 ordinal status):
- ADD COLUMN delivered_at TEXT NULL
- ADD COLUMN read_at TEXT NULL
- ADD COLUMN error_code TEXT NULL
(messages already has: id, conversationId, externalId, direction, messageType, body, payload, status, sentAt — verify in schema.ts)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend schema.ts with P1b table definitions + new webhook_events / messages columns</name>
  <files>apps/staff-web/server/db/schema.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts (current full content — to know exactly where existing webhookEvents and messages defs end)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-15 — the 6 new tables + VIEW)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Schema additions" (lines 1184-1269 — exact Drizzle table definitions)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #7 (external_id backfill)
    - CLAUDE.md (no-breaking-DB-changes — additive only)
    - AGENTS.md (no-unscoped-queries — note these new tables will need access patterns in later plans)
  </read_first>
  <behavior>
    - whatsappOptIn export: table with memberId PK + optedInAt default now + evidenceMessageId nullable + evidencePayload nullable + source enum
    - whatsappTemplates export: table with name PK + status enum + category enum + language default 'en_US' + componentsJson + lastSyncedAt default now
    - stripeCustomers export: table with stripeCustomerId PK + memberId nullable + rawJson + updatedAt default now
    - stripeSubscriptions export: table with stripeSubscriptionId PK + memberId notNull + status enum (8 values) + planId nullable + currentPeriodEnd nullable + rawJson + updatedAt default now
    - payments export: table with id PK + memberId nullable + stripePaymentIntentId notNull unique + amountMinorUnits int notNull + currency notNull + status enum + rawJson + occurredAt notNull
    - secrets export: table with name PK + ciphertext text notNull + updatedAt default now + lastUsedAt nullable
    - webhookEvents (existing) gets new column: externalId text nullable
    - messages (existing) gets new columns: deliveredAt text nullable + readAt text nullable + errorCode text nullable
    - Compiles: `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0
  </behavior>
  <action>
    Concrete steps:

    1. Read `apps/staff-web/server/db/schema.ts` fully. Locate:
       - The `messages` table definition (search for `export const messages = table("messages"`)
       - The `webhookEvents` table definition (search for `export const webhookEvents = table("webhook_events"`)

    2. Modify the `messages` table definition (ADD columns, do NOT remove or rename anything):
       - Add `deliveredAt: text("delivered_at"),` (no `.notNull()` — nullable)
       - Add `readAt: text("read_at"),` (nullable)
       - Add `errorCode: text("error_code"),` (nullable)
       Insert these immediately after the existing `status` column or before the closing `})`.

    3. Modify the `webhookEvents` table definition (ADD one column):
       - Add `externalId: text("external_id"),` (nullable — backfill happens in SQL migration; existing rows must accept NULL until backfill completes)
       Insert between `eventType` and `payloadRaw` columns.

    4. Append the 6 new table definitions to the end of schema.ts (after `webhookEvents`). Copy exactly from RESEARCH.md §"Schema additions" lines 1190-1252. Verify the import line at the top of schema.ts already has all referenced helpers (`table`, `text`, `integer`, `real`, `now`) — they are from `@agent-native/core/db/schema`. Do NOT add new imports unless a new helper is needed (none are — all 6 tables use the existing ones).

    5. Verify TypeScript compiles by running `pnpm --filter @gymos/staff-web exec tsc --noEmit`. Fix any type errors (likely none if step 4 was copy-paste from RESEARCH).

    6. Run `npx prettier --write apps/staff-web/server/db/schema.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/db/schema.ts` contains string `export const whatsappOptIn = table("whatsapp_opt_in"`
    - File contains string `export const whatsappTemplates = table("whatsapp_templates"`
    - File contains string `export const stripeCustomers = table("stripe_customers"`
    - File contains string `export const stripeSubscriptions = table("stripe_subscriptions"`
    - File contains string `export const payments = table("payments"`
    - File contains string `export const secrets = table("secrets"`
    - File contains string `externalId: text("external_id")` (added to webhookEvents)
    - File contains string `deliveredAt: text("delivered_at")` (added to messages)
    - File contains string `errorCode: text("error_code")` (added to messages)
    - `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>schema.ts has all P1b table definitions; type-checks clean.</done>
</task>

<task type="auto">
  <name>Task 2: Author Postgres migration 0001_p1b_webhook_worker_spine.sql with backfill + VIEW + pgcrypto</name>
  <files>apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql, apps/staff-web/server/db/migrations/meta/_journal.json, apps/staff-web/server/db/migrations/meta/0001_snapshot.json</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts (post-Task-1 state — for snapshot accuracy)
    - apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql (baseline format reference)
    - apps/staff-web/server/db/migrations/meta/_journal.json (current journal — must increment for 0001)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Schema additions" + §"Window-state VIEW" (lines 1271-1294)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #7 (backfill order — UPDATE existing rows BEFORE creating UNIQUE constraint)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #6 (custom SQL for VIEW + extension)
    - CLAUDE.md (no-drizzle-push — this is a `generate --custom` workflow)
  </read_first>
  <action>
    Concrete steps:

    1. Run `DATABASE_URL=<neon-pooled-url> pnpm --filter @gymos/staff-web exec drizzle-kit generate --name p1b_webhook_worker_spine --custom` to generate a custom migration scaffold. (Use `--custom` not the default because we need to interleave raw SQL: `CREATE EXTENSION`, the VIEW, and the backfill UPDATE.) This emits `apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql` as a starter and updates `meta/_journal.json`.

       Note: `--custom` produces an empty SQL file in some drizzle-kit versions. Confirm by reading the file. If empty, generate WITHOUT `--custom` first to get the schema diff, then post-process to add the raw SQL parts. PowerShell: `$env:DATABASE_URL="<url>"; pnpm --filter @gymos/staff-web exec drizzle-kit generate --name p1b_webhook_worker_spine`.

    2. Open the generated `0001_p1b_webhook_worker_spine.sql` and verify it contains the CREATE TABLE statements for the 6 new tables (whatsapp_opt_in, whatsapp_templates, stripe_customers, stripe_subscriptions, payments, secrets) and ADD COLUMN statements for webhook_events + messages.

    3. PREPEND these statements to the SQL file (in this exact order — sequencing matters):
       ```sql
       -- ============================================================
       -- P1b: Webhook + Worker Spine — additive migration
       -- ============================================================
       -- CLAUDE.md no-breaking-DB-changes guard: every statement below
       -- is strictly additive. NO DROP, NO RENAME, NO destructive ALTER.

       -- 1. Enable pgcrypto for Stripe restricted-key encryption (STR-01)
       CREATE EXTENSION IF NOT EXISTS pgcrypto;
       ```

    4. APPEND these statements to the END of the SQL file (after all CREATE TABLE / ADD COLUMN statements):
       ```sql
       -- 2. Backfill webhook_events.external_id from existing demo rows (PITFALL #7)
       --    Demo rows use id format 'whatsapp:<wamid>' — split on ':' to populate
       --    external_id AND ensure provider column is consistent. BACKFILL MUST RUN
       --    BEFORE the UNIQUE INDEX is created in step 3.
       UPDATE webhook_events
       SET external_id = SUBSTRING(id FROM POSITION(':' IN id) + 1)
       WHERE external_id IS NULL AND POSITION(':' IN id) > 0;

       -- For older demo rows that may have NULL provider, derive it from id prefix
       UPDATE webhook_events
       SET provider = SPLIT_PART(id, ':', 1)
       WHERE provider IS NULL AND POSITION(':' IN id) > 0;

       -- 3. Composite UNIQUE constraint for ON CONFLICT (provider, external_id) DO NOTHING
       CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_external_id_unique
       ON webhook_events (provider, external_id);

       -- 4. WhatsApp window-state VIEW (D-15, D-20 — read by staff-web loader)
       --    Reads conversations.last_inbound_at; computes in_window + hours_left.
       CREATE OR REPLACE VIEW whatsapp_window_state AS
       SELECT
         c.member_id,
         c.id AS conversation_id,
         c.last_inbound_at,
         CASE
           WHEN c.last_inbound_at IS NULL THEN false
           WHEN (NOW() - c.last_inbound_at::TIMESTAMPTZ) < INTERVAL '24 hours' THEN true
           ELSE false
         END AS in_window,
         CASE
           WHEN c.last_inbound_at IS NULL THEN NULL
           WHEN (NOW() - c.last_inbound_at::TIMESTAMPTZ) >= INTERVAL '24 hours' THEN 0
           ELSE EXTRACT(EPOCH FROM (
             (c.last_inbound_at::TIMESTAMPTZ + INTERVAL '24 hours') - NOW()
           )) / 3600.0
         END AS hours_left
       FROM conversations c
       WHERE c.channel = 'whatsapp';
       ```

    5. Verify the SQL file is valid Postgres syntax by reading top-to-bottom. No `datetime('now')`, no `INTEGER DEFAULT 1` (used as boolean), no `PRAGMA`.

    6. Update `meta/_journal.json` if drizzle-kit didn't add the new entry automatically. Verify the file lists both `0000_gymos_postgres_initial` and `0001_p1b_webhook_worker_spine` with proper version + when fields.

    7. Do NOT apply the migration yet — that's Task 3.
  </action>
  <verify>
    <automated>grep -c "CREATE TABLE\|CREATE EXTENSION\|CREATE UNIQUE INDEX\|CREATE OR REPLACE VIEW\|ADD COLUMN" apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql` EXISTS
    - File contains string `CREATE EXTENSION IF NOT EXISTS pgcrypto`
    - File contains string `CREATE TABLE` AT LEAST 6 times (for whatsapp_opt_in, whatsapp_templates, stripe_customers, stripe_subscriptions, payments, secrets)
    - File contains string `ADD COLUMN "external_id"` OR `ADD COLUMN external_id` (Drizzle may quote identifiers)
    - File contains string `UPDATE webhook_events` AND `SUBSTRING(id FROM POSITION(':' IN id) + 1)` (backfill)
    - File contains string `CREATE UNIQUE INDEX` AND `webhook_events_provider_external_id_unique`
    - File contains string `CREATE OR REPLACE VIEW whatsapp_window_state`
    - File contains string `INTERVAL '24 hours'`
    - The UPDATE statement appears BEFORE the CREATE UNIQUE INDEX statement (sequence check — use `grep -n` and verify line numbers)
    - File does NOT contain string `DROP TABLE`
    - File does NOT contain string `DROP COLUMN`
    - File does NOT contain string `ALTER TABLE.*RENAME`
    - File does NOT contain string `TRUNCATE`
    - File does NOT contain string `datetime('now')` (SQLite syntax check)
    - `apps/staff-web/server/db/migrations/meta/_journal.json` contains string `"p1b_webhook_worker_spine"`
  </acceptance_criteria>
  <done>Migration file authored with all P1b additions + correct sequencing (backfill before UNIQUE). NOT yet applied to Neon.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Apply migration to gymos-demo Neon and verify (human-gated for DB safety)</name>
  <what-built>
    Migration file `0001_p1b_webhook_worker_spine.sql` is ready to apply against the live `gymos-demo` Neon project. Per CLAUDE.md no-breaking-DB-changes guard, the migration is strictly additive. This checkpoint exists because applying any migration to a shared Neon DB has blast radius — a human confirms the diff looks correct before push.
  </what-built>
  <files>(human verification — no specific file write; see &lt;how-to-verify&gt; below)</files>
  <action>
    This is a checkpoint task — the work is human verification of the steps described in &lt;how-to-verify&gt; below. The agent's job for this task is to:
      1. Print the &lt;how-to-verify&gt; steps to the user
      2. Wait for the &lt;resume-signal&gt; from the user
      3. Halt execution until the signal arrives
    Do NOT execute the verification steps autonomously — they are deliberately interactive.
  </action>
  <verify>
    <automated>echo "checkpoint:human-verify — awaiting user signal"</automated>
  </verify>
  <how-to-verify>
    1. Open `apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql` and visually inspect:
       - Is every statement additive (CREATE, ADD COLUMN, UPDATE for backfill, CREATE INDEX, CREATE OR REPLACE VIEW)?
       - Does the UPDATE backfill come BEFORE the CREATE UNIQUE INDEX (PITFALL #7)?
       - Are there any DROP or RENAME or destructive ALTER statements? If yes, STOP and report.
       - Does the SQL look like Postgres (TIMESTAMP, BOOLEAN, NOW(), INTERVAL, EXTRACT) vs SQLite (datetime('now'), INTEGER booleans)?

    2. Optional: dry-run against the Neon `test` branch first per D-24:
       ```pwsh
       # Create test branch if it doesn't exist (one-time):
       # via Neon dashboard or `neonctl branches create --name test --project-id billowing-sun-51091059`
       $env:DATABASE_URL="<neon-test-branch-url>"
       pnpm --filter @gymos/staff-web exec drizzle-kit migrate
       # Inspect via mcp__Neon__describe_branch + run sample queries
       ```

    3. Apply to gymos-demo (production demo branch):
       ```pwsh
       $env:DATABASE_URL="<neon-pooled-url-from-.env.local>"
       pnpm --filter @gymos/staff-web exec drizzle-kit migrate
       ```
       Expected output: `migrated to 0001_p1b_webhook_worker_spine` or equivalent success message.

    4. Verify via Neon SQL (use mcp__Neon__run_sql or the Neon dashboard):
       ```sql
       -- Confirm pgcrypto extension
       SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
       -- Expected: 1 row

       -- Confirm new tables exist
       SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('whatsapp_opt_in', 'whatsapp_templates', 'stripe_customers',
                            'stripe_subscriptions', 'payments', 'secrets');
       -- Expected: 6 rows

       -- Confirm webhook_events.external_id column
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'webhook_events' AND column_name = 'external_id';
       -- Expected: 1 row

       -- Confirm backfill worked (existing demo rows now have external_id)
       SELECT COUNT(*) FROM webhook_events WHERE external_id IS NULL;
       -- Expected: 0 (or only rows that had no ':' in id, which shouldn't exist)

       -- Confirm UNIQUE constraint
       SELECT indexname FROM pg_indexes
       WHERE tablename = 'webhook_events' AND indexname = 'webhook_events_provider_external_id_unique';
       -- Expected: 1 row

       -- Confirm VIEW
       SELECT viewname FROM pg_views WHERE viewname = 'whatsapp_window_state';
       -- Expected: 1 row

       -- Test the VIEW returns data
       SELECT * FROM whatsapp_window_state LIMIT 5;
       -- Expected: 5 rows (matching seeded conversations from D0.4)

       -- Confirm messages.delivered_at, read_at, error_code columns
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'messages' AND column_name IN ('delivered_at', 'read_at', 'error_code');
       -- Expected: 3 rows
       ```

    5. Test pgcrypto round-trip:
       ```sql
       SELECT pgp_sym_decrypt(
         pgp_sym_encrypt('test_value', 'test_master_key'),
         'test_master_key'
       );
       -- Expected: 'test_value'
       ```

    6. Confirm /gymos still loads in apps/staff-web/ (Plan 01 Task 4 verification still holds — additive migration shouldn't break reads).

    Report any errors. Type "approved" only if all 6 verification SQL queries return expected results.
  </how-to-verify>
  <resume-signal>Type "approved" if migration applied cleanly and all 6 verification queries pass. Type the error otherwise.</resume-signal>
  <acceptance_criteria>
    - User confirms migration applied without errors
    - User confirms all 6 verification SQL queries return expected results
    - User confirms /gymos demo still loads in apps/staff-web/
    - User confirms backfill: webhook_events rows with external_id IS NULL count = 0
  </acceptance_criteria>
  <done>P1b schema is live in gymos-demo Neon. All downstream plans (04 edge-webhooks, 05/06 worker, 07 stripe) can rely on these tables + the VIEW + the UNIQUE constraint + pgcrypto.</done>
</task>

</tasks>

<verification>
- `apps/staff-web/server/db/schema.ts` exports whatsappOptIn, whatsappTemplates, stripeCustomers, stripeSubscriptions, payments, secrets
- webhookEvents schema has externalId column
- messages schema has deliveredAt, readAt, errorCode columns
- `apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql` exists and is additive-only
- pgcrypto extension is enabled in gymos-demo
- whatsapp_window_state VIEW returns data
- All 6 new tables exist in Neon
- Backfill populated external_id for existing webhook_events demo rows
</verification>

<success_criteria>
1. Migration applied to gymos-demo Neon without errors
2. Strictly additive — git diff of schema.ts shows only new exports, no removals; migration SQL contains no DROP/RENAME/destructive ALTER
3. PITFALL #7 mitigation: backfill UPDATE runs BEFORE CREATE UNIQUE INDEX
4. pgcrypto round-trip works (used in Plan 08 Stripe rotation flow)
5. whatsapp_window_state VIEW reads from conversations.last_inbound_at and computes in_window + hours_left
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-02-SUMMARY.md` recording:
- Final list of tables added + their PKs and key columns
- Backfill row count (how many demo webhook_events rows were updated)
- Confirmation that /gymos still loads post-migration
- Any deviations from the planned schema (e.g. if VIEW needed adjustment for actual conversations.channel values)
</output>
