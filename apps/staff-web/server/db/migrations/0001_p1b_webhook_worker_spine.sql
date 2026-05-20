-- ============================================================
-- P1b: Webhook + Worker Spine — additive migration
-- ============================================================
-- CLAUDE.md no-breaking-DB-changes guard: every statement below
-- is strictly additive. NO DROP, NO RENAME, NO destructive ALTER.
-- Sequencing matters: pgcrypto extension first, then table/column
-- adds, then the webhook_events backfill UPDATE, then the UNIQUE
-- indexes (composite + partial), then the window-state VIEW.

-- 1. Enable pgcrypto for Stripe restricted-key encryption (STR-01)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text,
	"stripe_payment_intent_id" text NOT NULL,
	"amount_minor_units" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"raw_json" text NOT NULL,
	"occurred_at" text NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"name" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	"last_used_at" text
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"stripe_customer_id" text PRIMARY KEY NOT NULL,
	"member_id" text,
	"raw_json" text NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"stripe_subscription_id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"status" text NOT NULL,
	"plan_id" text,
	"current_period_end" text,
	"raw_json" text NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_opt_in" (
	"member_id" text PRIMARY KEY NOT NULL,
	"opted_in_at" text DEFAULT now() NOT NULL,
	"evidence_message_id" text,
	"evidence_payload" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"name" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"category" text,
	"language" text DEFAULT 'en_US' NOT NULL,
	"components_json" text NOT NULL,
	"last_synced_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "updated_at" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "external_id" text;--> statement-breakpoint
-- 2. Backfill webhook_events.external_id from existing demo rows (PITFALL #7)
--    Demo rows use id format 'whatsapp:<wamid>' or 'stripe:<evt_...>'.
--    Splits on first ':' and populates external_id. provider is already
--    NOT NULL in the live schema, so no provider backfill is needed.
--    BACKFILL MUST RUN BEFORE the UNIQUE INDEX is created in step 3.
UPDATE webhook_events
SET external_id = SUBSTRING(id FROM POSITION(':' IN id) + 1)
WHERE external_id IS NULL AND POSITION(':' IN id) > 0;
--> statement-breakpoint
-- 3. Composite UNIQUE constraint for ON CONFLICT (provider, external_id) DO NOTHING
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_external_id_unique
ON webhook_events (provider, external_id);
--> statement-breakpoint
-- 4. messages.external_id partial UNIQUE index (HIGH #4 — race-safety for
--    Plan 05's concurrency=5 inbound worker). PARTIAL: allows multiple NULLs
--    (outbound queued rows have NULL externalId until send completes) but
--    blocks two concurrent INSERTs with the same non-NULL wamid.
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_unique
ON messages (external_id)
WHERE external_id IS NOT NULL;
--> statement-breakpoint
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
