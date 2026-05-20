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
    - "messages.external_id has a partial UNIQUE index (WHERE external_id IS NOT NULL) — outbound queued rows with NULL externalId are still allowed, but two concurrent inbound inserts on the same wamid cannot both succeed (race-safety for Plan 05 concurrency=5 worker)"
    - "whatsapp_opt_in table exists and gym_members FK is enforced"
    - "whatsapp_templates table exists with status enum (pending|approved|rejected|paused|disabled)"
    - "whatsapp_window_state VIEW exists and returns in_window + hours_left per conversation"
    - "stripe_customers, stripe_subscriptions, payments tables exist with proper unique constraints"
    - "secrets table exists with pgcrypto pgp_sym_encrypt/decrypt functions available"
    - "pgcrypto extension is enabled in gymos-demo Neon project"
    - "Migration is strictly additive — no DROP, no RENAME, no destructive ALTER"
    - "messages.error_code AND messages.updated_at columns added (nullable) — used by Plan 05's applyOrdinalStatusUpdate. (NOTE: messages.delivered_at and messages.read_at already exist in the live schema and MUST NOT be re-added.)"
  artifacts:
    - path: "apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql"
      provides: "Single additive Drizzle migration adding all P1b tables + webhook_events extension + messages.error_code + messages.updated_at + messages.external_id partial unique index + VIEW + pgcrypto enable"
      contains: "CREATE TABLE whatsapp_opt_in"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "All P1b Drizzle table definitions appended (whatsappOptIn, whatsappTemplates, stripeCustomers, stripeSubscriptions, payments, secrets); webhookEvents extended with externalId column; messages extended with errorCode + updatedAt columns (delivered_at/read_at already present)"
      contains: "export const whatsappOptIn"
  key_links:
    - from: "webhook_events.provider + webhook_events.external_id"
      to: "UNIQUE INDEX webhook_events_provider_external_id_unique"
      via: "additive CREATE UNIQUE INDEX after backfill"
      pattern: "CREATE UNIQUE INDEX.*webhook_events.*provider.*external_id"
    - from: "messages.external_id"
      to: "UNIQUE INDEX messages_external_id_unique (WHERE external_id IS NOT NULL)"
      via: "partial unique index — race-safe for inbound concurrency=5"
      pattern: "CREATE UNIQUE INDEX.*messages_external_id_unique"
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
Ship the single additive Drizzle migration that adds every P1b table + extends `webhook_events` for composite-key idempotency + extends `messages` with the columns Plan 05 needs (`error_code`, `updated_at`) + adds a partial UNIQUE index on `messages.external_id` (race-safety for Plan 05's concurrency=5 inbound worker). Strictly additive per CLAUDE.md no-breaking-DB-changes guard: no DROP, no RENAME, no destructive ALTER. Critical sequencing: BACKFILL existing webhook_events.external_id from the `id` column BEFORE creating the UNIQUE constraint (PITFALL #7 in research). Enable pgcrypto extension for Stripe restricted-key encryption (STR-01 storage). Create whatsapp_window_state as a VIEW (D-15 default) so the staff-web loader can read computed window state per conversation.

CRITICAL — DO NOT RE-ADD `delivered_at` OR `read_at` to `messages`. These columns already exist in the live schema (templates/mail/server/db/schema.ts lines 183-184). Plan 05's ordinal-status updater writes to those EXISTING columns plus the NEW `error_code` and `updated_at` columns this migration adds.

Purpose: Establishes the data foundation P1b needs. Without this migration, Plan 04 (edge-webhooks) can't enforce ON CONFLICT (provider, external_id), Plan 05 (inbound worker) can't ordinal-guard message status or race-safely insert wamid-keyed messages, Plan 06 (sendMessage chokepoint) can't gate on opt-in/window/templates, and Plan 07 (Stripe reducers) can't mirror customers/subscriptions/payments.
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
- BACKFILL: UPDATE webhook_events SET external_id = SUBSTRING(id FROM POSITION(':' IN id) + 1) WHERE external_id IS NULL AND POSITION(':' IN id) > 0
- CREATE UNIQUE INDEX webhook_events_provider_external_id_unique ON webhook_events (provider, external_id)
- NOTE: `provider` is already NOT NULL in the live schema (templates/mail/server/db/schema.ts line 320: `text("provider", { enum: [...] }).notNull()`). NO `provider IS NULL` backfill is needed — that UPDATE would be a no-op.

Extensions to existing messages table (WA-04 ordinal status + race-safety):
- ADD COLUMN error_code TEXT NULL          (NEW — typed-error column for sendMessage failures; the existing `error` column stays for freeform messages)
- ADD COLUMN updated_at TEXT NULL           (NEW — Plan 05's applyOrdinalStatusUpdate SQL sets `updated_at = NOW()` on each rank-superseding status change)
- CREATE UNIQUE INDEX messages_external_id_unique ON messages (external_id) WHERE external_id IS NOT NULL  (partial — outbound queued rows have NULL externalId until send completes; partial index allows multiple NULLs but blocks duplicate wamid inserts)
- DO NOT add `delivered_at` or `read_at` — they already exist in the live schema (lines 183-184 of templates/mail/server/db/schema.ts).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend schema.ts with P1b table definitions + new webhook_events.external_id + new messages.error_code/updated_at</name>
  <files>apps/staff-web/server/db/schema.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts (current full content — VERIFY EXACT shape of existing `messages` and `webhookEvents` defs before editing)
    - templates/mail/server/db/schema.ts (source-of-truth for the live `messages` columns — confirm lines 159-185 already include `deliveredAt: text("delivered_at")`, `readAt: text("read_at")`, `error: text("error")` BEFORE writing any edits)
    - templates/mail/server/db/schema.ts line 320 (confirm `provider` is `.notNull()` — drives whether the backfill UPDATE for provider is needed)
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
    - messages (existing) gets ONLY two new columns: errorCode text nullable + updatedAt text nullable. Do NOT add deliveredAt or readAt — they already exist (verify in step 1 of action).
    - Compiles: `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0
  </behavior>
  <action>
    Concrete steps:

    1. **Verify the source-of-truth schema before editing.** Read `templates/mail/server/db/schema.ts` lines 159-185. Confirm the `messages` table definition ALREADY contains:
       - `error: text("error"),` (line 176 — freeform error string; keep it untouched)
       - `deliveredAt: text("delivered_at"),` (line 183 — DO NOT re-add)
       - `readAt: text("read_at"),` (line 184 — DO NOT re-add)

       Also confirm line 320: `webhook_events.provider` is `.notNull()`.

       If any of these are NOT present, STOP and report — the rest of this plan assumes the live schema matches the source-of-truth file. Proceeding without verifying these columns risks emitting `ADD COLUMN delivered_at` which would fail at runtime against the live Neon DB.

    2. Read `apps/staff-web/server/db/schema.ts` fully. Locate:
       - The `messages` table definition (search for `export const messages = table("messages"`)
       - The `webhookEvents` table definition (search for `export const webhookEvents = table("webhook_events"`)

    3. Modify the `messages` table definition (ADD only the two NEW columns; do NOT remove, rename, or re-add anything):
       - Add `errorCode: text("error_code"),` (no `.notNull()` — nullable)
       - Add `updatedAt: text("updated_at"),` (nullable; no `.default(now())` — strictly additive, existing rows must remain valid with NULL until Plan 05 writes to them)
       Insert these immediately before the closing `})`. DO NOT add `deliveredAt` or `readAt` — those already exist.

    4. Modify the `webhookEvents` table definition (ADD one column):
       - Add `externalId: text("external_id"),` (nullable — backfill happens in SQL migration; existing rows must accept NULL until backfill completes)
       Insert between `eventType` and `payloadRaw` columns.

    5. Append the 6 new table definitions to the end of schema.ts (after `webhookEvents`). Copy exactly from RESEARCH.md §"Schema additions" lines 1190-1252. Verify the import line at the top of schema.ts already has all referenced helpers (`table`, `text`, `integer`, `real`, `now`) — they are from `@agent-native/core/db/schema`. Do NOT add new imports unless a new helper is needed (none are — all 6 tables use the existing ones).

    6. Verify TypeScript compiles by running `pnpm --filter @gymos/staff-web exec tsc --noEmit`. Fix any type errors (likely none if step 5 was copy-paste from RESEARCH).

    7. Run `npx prettier --write apps/staff-web/server/db/schema.ts`.
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
    - File contains string `errorCode: text("error_code")` (added to messages)
    - File contains string `updatedAt: text("updated_at")` (added to messages — Plan 05's UPDATE needs this column)
    - File does NOT contain a DUPLICATE `deliveredAt: text("delivered_at")` or `readAt: text("read_at")` line (those existed before; the diff must add zero new occurrences of those exact strings)
    - `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>schema.ts has all P1b table definitions; messages gains only errorCode + updatedAt (not deliveredAt/readAt); type-checks clean.</done>
</task>

<task type="auto">
  <name>Task 2: Author Postgres migration 0001_p1b_webhook_worker_spine.sql with backfill + VIEW + pgcrypto + messages partial unique index</name>
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

    1. Run `DATABASE_URL=<neon-pooled-url> pnpm --filter @gymos/staff-web exec drizzle-kit generate --name p1b_webhook_worker_spine --custom` to generate a custom migration scaffold. (Use `--custom` not the default because we need to interleave raw SQL: `CREATE EXTENSION`, the VIEW, the backfill UPDATE, and the partial UNIQUE index.) This emits `apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql` as a starter and updates `meta/_journal.json`.

       Note: `--custom` produces an empty SQL file in some drizzle-kit versions. Confirm by reading the file. If empty, generate WITHOUT `--custom` first to get the schema diff, then post-process to add the raw SQL parts. PowerShell: `$env:DATABASE_URL="<url>"; pnpm --filter @gymos/staff-web exec drizzle-kit generate --name p1b_webhook_worker_spine`.

    2. Open the generated `0001_p1b_webhook_worker_spine.sql` and verify it contains:
       - CREATE TABLE statements for the 6 new tables (whatsapp_opt_in, whatsapp_templates, stripe_customers, stripe_subscriptions, payments, secrets)
       - ADD COLUMN external_id on webhook_events
       - ADD COLUMN error_code on messages
       - ADD COLUMN updated_at on messages
       - NOTHING about delivered_at or read_at on messages (drizzle-kit should not emit those because Task 1 left those columns unchanged in schema.ts — they already exist in the live schema)

       If you see any unexpected `ADD COLUMN delivered_at` or `ADD COLUMN read_at`, STOP and recheck Task 1 step 3 — those would fail at runtime.

       Expected ADD COLUMN count on messages: exactly 2 (error_code, updated_at). Expected ADD COLUMN count on webhook_events: exactly 1 (external_id).

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

    4. APPEND these statements to the END of the SQL file (after all CREATE TABLE / ADD COLUMN statements). Note: NO `provider IS NULL` UPDATE — the live schema has `provider` declared `.notNull()` so any such update would be a no-op:
       ```sql
       -- 2. Backfill webhook_events.external_id from existing demo rows (PITFALL #7)
       --    Demo rows use id format 'whatsapp:<wamid>' or 'stripe:<evt_...>'.
       --    Splits on first ':' and populates external_id. provider is already
       --    NOT NULL in the live schema, so no provider backfill is needed.
       --    BACKFILL MUST RUN BEFORE the UNIQUE INDEX is created in step 3.
       UPDATE webhook_events
       SET external_id = SUBSTRING(id FROM POSITION(':' IN id) + 1)
       WHERE external_id IS NULL AND POSITION(':' IN id) > 0;

       -- 3. Composite UNIQUE constraint for ON CONFLICT (provider, external_id) DO NOTHING
       CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_external_id_unique
       ON webhook_events (provider, external_id);

       -- 4. messages.external_id partial UNIQUE index (HIGH #4 — race-safety for
       --    Plan 05's concurrency=5 inbound worker). PARTIAL: allows multiple NULLs
       --    (outbound queued rows have NULL externalId until send completes) but
       --    blocks two concurrent INSERTs with the same non-NULL wamid.
       CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_unique
       ON messages (external_id)
       WHERE external_id IS NOT NULL;

       -- 5. WhatsApp window-state VIEW (D-15, D-20 — read by staff-web loader)
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

    5. Verify the SQL file is valid Postgres syntax by reading top-to-bottom. No `datetime('now')`, no `INTEGER DEFAULT 1` (used as boolean), no `PRAGMA`. Confirm:
       - Exactly ONE `ADD COLUMN ... error_code` on messages
       - Exactly ONE `ADD COLUMN ... updated_at` on messages
       - Exactly ONE `ADD COLUMN ... external_id` on webhook_events
       - Zero occurrences of `ADD COLUMN ... delivered_at` or `ADD COLUMN ... read_at`
       - The two CREATE UNIQUE INDEX statements (one for webhook_events composite, one for messages.external_id partial) appear AFTER the backfill UPDATE

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
    - File contains string `ADD COLUMN "external_id"` OR `ADD COLUMN external_id` (Drizzle may quote identifiers) on the webhook_events table — exactly ONE occurrence
    - File contains string `ADD COLUMN "error_code"` OR `ADD COLUMN error_code` on the messages table — exactly ONE occurrence
    - File contains string `ADD COLUMN "updated_at"` OR `ADD COLUMN updated_at` on the messages table — exactly ONE occurrence
    - File does NOT contain string `ADD COLUMN "delivered_at"` or `ADD COLUMN delivered_at` (BLOCKER #1 — would fail at runtime; column already exists)
    - File does NOT contain string `ADD COLUMN "read_at"` or `ADD COLUMN read_at` (BLOCKER #1)
    - File contains string `UPDATE webhook_events` AND `SUBSTRING(id FROM POSITION(':' IN id) + 1)` (backfill)
    - File does NOT contain string `UPDATE webhook_events SET provider` (MEDIUM #7 — provider is NOT NULL in live schema; UPDATE is a no-op)
    - File contains string `CREATE UNIQUE INDEX` AND `webhook_events_provider_external_id_unique`
    - File contains string `CREATE UNIQUE INDEX` AND `messages_external_id_unique` AND `WHERE external_id IS NOT NULL` (HIGH #4 — partial unique index)
    - File contains string `CREATE OR REPLACE VIEW whatsapp_window_state`
    - File contains string `INTERVAL '24 hours'`
    - The UPDATE statement (backfill) appears BEFORE the CREATE UNIQUE INDEX webhook_events_provider_external_id_unique statement (sequence check — use `grep -n` and verify line numbers)
    - File does NOT contain string `DROP TABLE`
    - File does NOT contain string `DROP COLUMN`
    - File does NOT contain string `ALTER TABLE.*RENAME`
    - File does NOT contain string `TRUNCATE`
    - File does NOT contain string `datetime('now')` (SQLite syntax check)
    - `apps/staff-web/server/db/migrations/meta/_journal.json` contains string `"p1b_webhook_worker_spine"`
  </acceptance_criteria>
  <done>Migration file authored with all P1b additions + correct sequencing (backfill before UNIQUE) + partial unique index on messages.external_id. NOT yet applied to Neon.</done>
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
       - Does the UPDATE backfill come BEFORE the CREATE UNIQUE INDEX on webhook_events (PITFALL #7)?
       - Are there any DROP or RENAME or destructive ALTER statements? If yes, STOP and report.
       - Are there ANY `ADD COLUMN delivered_at` or `ADD COLUMN read_at` statements? If yes, STOP and report — those columns already exist and the migration will fail at runtime.
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

       -- Confirm UNIQUE constraint on webhook_events
       SELECT indexname FROM pg_indexes
       WHERE tablename = 'webhook_events' AND indexname = 'webhook_events_provider_external_id_unique';
       -- Expected: 1 row

       -- Confirm partial UNIQUE constraint on messages.external_id
       SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'messages' AND indexname = 'messages_external_id_unique';
       -- Expected: 1 row; indexdef contains 'WHERE (external_id IS NOT NULL)'

       -- Confirm VIEW
       SELECT viewname FROM pg_views WHERE viewname = 'whatsapp_window_state';
       -- Expected: 1 row

       -- Test the VIEW returns data
       SELECT * FROM whatsapp_window_state LIMIT 5;
       -- Expected: 5 rows (matching seeded conversations from D0.4)

       -- Confirm messages.error_code AND messages.updated_at columns added
       -- AND that delivered_at + read_at still exist (were not touched)
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'messages'
         AND column_name IN ('error_code', 'updated_at', 'delivered_at', 'read_at');
       -- Expected: 4 rows (error_code + updated_at NEW; delivered_at + read_at PRE-EXISTING)
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

    Report any errors. Type "approved" only if all 7 verification SQL queries return expected results.
  </how-to-verify>
  <resume-signal>Type "approved" if migration applied cleanly and all 7 verification queries pass. Type the error otherwise.</resume-signal>
  <acceptance_criteria>
    - User confirms migration applied without errors
    - User confirms all 7 verification SQL queries return expected results
    - User confirms /gymos demo still loads in apps/staff-web/
    - User confirms backfill: webhook_events rows with external_id IS NULL count = 0
    - User confirms messages.delivered_at and messages.read_at STILL EXIST post-migration (were not dropped)
    - User confirms messages_external_id_unique is a PARTIAL index (indexdef contains `WHERE`)
  </acceptance_criteria>
  <done>P1b schema is live in gymos-demo Neon. All downstream plans (04 edge-webhooks, 05/06 worker, 07 stripe) can rely on these tables + the VIEW + the UNIQUE constraints + pgcrypto.</done>
</task>

</tasks>

<verification>
- `apps/staff-web/server/db/schema.ts` exports whatsappOptIn, whatsappTemplates, stripeCustomers, stripeSubscriptions, payments, secrets
- webhookEvents schema has externalId column
- messages schema has errorCode + updatedAt columns ADDED (delivered_at + read_at PRE-EXISTING, untouched)
- `apps/staff-web/server/db/migrations/0001_p1b_webhook_worker_spine.sql` exists and is additive-only
- Migration does NOT emit `ADD COLUMN delivered_at` or `ADD COLUMN read_at` (BLOCKER #1 mitigation)
- Migration does NOT emit `UPDATE webhook_events SET provider` (MEDIUM #7 mitigation)
- pgcrypto extension is enabled in gymos-demo
- whatsapp_window_state VIEW returns data
- All 6 new tables exist in Neon
- Backfill populated external_id for existing webhook_events demo rows
- Partial unique index `messages_external_id_unique` is in place (HIGH #4 mitigation)
</verification>

<success_criteria>
1. Migration applied to gymos-demo Neon without errors
2. Strictly additive — git diff of schema.ts shows only new exports, no removals; migration SQL contains no DROP/RENAME/destructive ALTER
3. PITFALL #7 mitigation: backfill UPDATE runs BEFORE CREATE UNIQUE INDEX
4. pgcrypto round-trip works (used in Plan 08 Stripe rotation flow)
5. whatsapp_window_state VIEW reads from conversations.last_inbound_at and computes in_window + hours_left
6. messages.external_id has a partial unique index — Plan 05's concurrent inbound worker is race-safe
7. messages gains error_code + updated_at; delivered_at + read_at are UNTOUCHED (already existed)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-02-SUMMARY.md` recording:
- Final list of tables added + their PKs and key columns
- Confirmation that messages gained ONLY error_code + updated_at (not delivered_at/read_at)
- Confirmation that the messages.external_id partial unique index is in place
- Backfill row count (how many demo webhook_events rows were updated)
- Confirmation that /gymos still loads post-migration
- Any deviations from the planned schema (e.g. if VIEW needed adjustment for actual conversations.channel values)
</output>
</task>
</output>
