import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { pgTable, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import ws from "ws";
import { getEnv } from "./env.js";

neonConfig.webSocketConstructor = ws;

// ---------------------------------------------------------------------------
// Local Drizzle schema mirror — Postgres-dialect typed.
//
// DEVIATION rationale (carried forward from P1b-04 edge-webhooks): the
// authoritative schema lives in apps/staff-web/server/db/schema.ts but uses
// the @agent-native/core/db/schema helpers, which resolve to SQLite types at
// typecheck time. Importing them from a neon-serverless pg driver context
// fails dialect-typing checks. We mirror only the tables we read/write
// (webhook_events, gym_members, conversations, messages) using
// drizzle-orm/pg-core directly. Plan 09 extracts packages/db/ to eliminate
// this duplication. KEEP THIS FILE IN SYNC with apps/staff-web schema.
// ---------------------------------------------------------------------------

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider", { enum: ["stripe", "whatsapp"] }).notNull(),
  eventType: text("event_type").notNull(),
  externalId: text("external_id"),
  payloadRaw: text("payload_raw").notNull(),
  receivedAt: text("received_at")
    .notNull()
    .default(sql`now()`),
  processedAt: text("processed_at"),
  error: text("error"),
});

export const gymMembers = pgTable("gym_members", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phoneE164: text("phone_e164"),
});

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  channel: text("channel", { enum: ["whatsapp"] })
    .notNull()
    .default("whatsapp"),
  status: text("status", { enum: ["open", "closed", "snoozed"] })
    .notNull()
    .default("open"),
  unreadCount: integer("unread_count").notNull().default(0),
  lastInboundAt: text("last_inbound_at"),
  lastOutboundAt: text("last_outbound_at"),
  lastMessagePreview: text("last_message_preview"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

// WA-07: WhatsApp opt-in evidence (added Plan 06 — sendMessage gate read).
// WA-09/WA-10: opted_out_at added (additive, nullable) — optInGate checks
// this column: row must exist AND opted_out_at IS NULL for hasOptIn = true.
// KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts whatsappOptIn.
export const whatsappOptIn = pgTable("whatsapp_opt_in", {
  memberId: text("member_id").primaryKey(),
  optedInAt: text("opted_in_at")
    .notNull()
    .default(sql`now()`),
  evidenceMessageId: text("evidence_message_id"),
  evidencePayload: text("evidence_payload"),
  source: text("source", {
    enum: ["inbound_reply", "manual_admin", "import"],
  }).notNull(),
  optedOutAt: text("opted_out_at"), // WA-09/WA-10: nullable — set when member opts out
});

// WA-08: WhatsApp templates synced from Meta (added Plan 06 — sendMessage gate read).
export const whatsappTemplates = pgTable("whatsapp_templates", {
  name: text("name").primaryKey(),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "paused", "disabled"],
  }).notNull(),
  category: text("category", {
    enum: ["utility", "marketing", "authentication"],
  }),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json").notNull(),
  lastSyncedAt: text("last_synced_at")
    .notNull()
    .default(sql`now()`),
});

// P1b-07: Stripe mirror tables — extended in this plan so the worker
// can write stripe_customers / stripe_subscriptions / payments and read
// secrets without depending on apps/staff-web schema (carries the same
// dialect-typing-as-sqlite friction documented in P1b-04). Plan 09 will
// extract packages/db/ to eliminate this duplication.
export const stripeCustomers = pgTable("stripe_customers", {
  stripeCustomerId: text("stripe_customer_id").primaryKey(),
  memberId: text("member_id"),
  rawJson: text("raw_json").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const stripeSubscriptions = pgTable("stripe_subscriptions", {
  stripeSubscriptionId: text("stripe_subscription_id").primaryKey(),
  memberId: text("member_id").notNull(),
  status: text("status", {
    enum: [
      "active",
      "past_due",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "trialing",
      "unpaid",
      "paused",
    ],
  }).notNull(),
  planId: text("plan_id"),
  currentPeriodEnd: text("current_period_end"),
  rawJson: text("raw_json").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  memberId: text("member_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
  amountMinorUnits: integer("amount_minor_units").notNull(),
  currency: text("currency").notNull(),
  status: text("status", {
    enum: ["succeeded", "failed", "refunded", "pending"],
  }).notNull(),
  rawJson: text("raw_json").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

// STR-06 / D1-02 ledger pattern: pass_debits is append-only; refund inserts
// a NEGATIVE row keyed on a deterministic ID so replays are no-ops.
export const passes = pgTable("passes", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  granted: integer("granted").notNull(),
  source: text("source", {
    enum: ["purchase", "subscription", "manual", "promo", "refund"],
  }).notNull(),
  stripeChargeId: text("stripe_charge_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  productName: text("product_name"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const passDebits = pgTable("pass_debits", {
  id: text("id").primaryKey(),
  passId: text("pass_id").notNull(),
  bookingId: text("booking_id"),
  amount: integer("amount").notNull(),
  reason: text("reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

// STR-01: encrypted secret storage. Worker reads via pgp_sym_decrypt at SQL
// time (see apps/worker/src/lib/secrets.ts). pgcrypto extension enabled in
// the P1b-02 migration.
export const secrets = pgTable("secrets", {
  name: text("name").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
  lastUsedAt: text("last_used_at"),
});

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    // P1b-02: partial UNIQUE index on external_id WHERE NOT NULL backs the
    // race-safe INSERT (HIGH #4) — onConflictDoNothing targets this column.
    externalId: text("external_id"),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    messageType: text("message_type", {
      enum: ["text", "template", "image", "audio", "video", "document"],
    })
      .notNull()
      .default("text"),
    body: text("body"),
    payload: text("payload"),
    status: text("status", {
      enum: ["queued", "sent", "delivered", "read", "failed", "rejected"],
    })
      .notNull()
      .default("queued"),
    error: text("error"),
    errorCode: text("error_code"),
    requestedByUserId: text("requested_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
    sentAt: text("sent_at"),
    deliveredAt: text("delivered_at"),
    readAt: text("read_at"),
    // P1b-02 Blocker #2: applyOrdinalStatusUpdate writes updated_at = NOW()
    // on each rank-superseding transition. Nullable until first update lands.
    updatedAt: text("updated_at"),
  },
  (t) => ({
    // Index reference only — actual partial UNIQUE INDEX was created by the
    // P1b-02 migration (WHERE external_id IS NOT NULL). Drizzle's typed
    // .onConflictDoNothing({ target: messages.externalId }) targets this column.
    externalIdIdx: uniqueIndex("messages_external_id_unique").on(t.externalId),
  }),
);

// BD2-03: studio_telemetry_state singleton — mirrors the table installed by
// db.ts migration v14. The BD2-04 push job reads this row, builds a
// TelemetrySnapshot, POSTs to HQ, then resets the accumulators.
// KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts studioTelemetryState.
export const studioTelemetryState = pgTable("studio_telemetry_state", {
  /** Always 'singleton' — one row per studio deploy. */
  id: text("id").primaryKey(),
  /** Input tokens accumulated since last telemetry push. */
  tokenUsageTodayInput: integer("token_usage_today_input").notNull().default(0),
  /** Output tokens accumulated since last telemetry push. */
  tokenUsageTodayOutput: integer("token_usage_today_output")
    .notNull()
    .default(0),
  /** API request count accumulated since last telemetry push. */
  requestCountToday: integer("request_count_today").notNull().default(0),
  /** Outbound WhatsApp messages sent today (written by the push job on reset). */
  outboundSentToday: integer("outbound_sent_today").notNull().default(0),
  /** Outbound WhatsApp messages failed today (written by the push job on reset). */
  outboundFailedToday: integer("outbound_failed_today").notNull().default(0),
  /** ISO 8601 timestamp of the last successful telemetry push to HQ. */
  lastPushAt: text("last_push_at"),
  /** Status of the last telemetry push: 'ok' | 'error' | null. */
  lastPushStatus: text("last_push_status"),
  /** ISO 8601 timestamp when this row was last modified. */
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

// BD4-02: studio_owner_config singleton — mirrors the table installed by
// db.ts migration v17 (added by BD4-01). The GOD digest + heartbeat jobs
// read this row to get the owner phone, timezone, and feature flags.
// KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts studioOwnerConfig.
export const studioOwnerConfig = pgTable("studio_owner_config", {
  /** Always 'singleton' — one row per studio deploy. */
  id: text("id").primaryKey(),
  /** Owner's WhatsApp phone in E.164 format; empty string until provisioned. */
  ownerPhoneE164: text("owner_phone_e164").notNull().default(""),
  /** IANA timezone for the studio; drives heartbeat + digest schedule. */
  studioTimezone: text("studio_timezone").notNull().default("Europe/London"),
  /** 1 = daily owner digest enabled (default); 0 = disabled. */
  digestEnabled: integer("digest_enabled").notNull().default(1),
  /** 1 = heartbeat reactivation enabled (default); 0 = disabled. */
  heartbeatEnabled: integer("heartbeat_enabled").notNull().default(1),
  /** Max dormant members processed per heartbeat run (default 50). */
  heartbeatBatchSize: integer("heartbeat_batch_size").notNull().default(50),
  createdAt: text("created_at").notNull().default(sql`now()`),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

// BD4-02: reactivation_attempts — mirrors the table installed by db.ts
// migration v18/v19 (added by BD4-01). Tracks per-member heartbeat send
// history for the 3/90-day suppression ceiling (GOD-04, day one).
// KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts reactivationAttempts.
export const reactivationAttempts = pgTable("reactivation_attempts", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  /** ISO timestamp of the send — used in the rolling 90-day window query. */
  sentAt: text("sent_at").notNull().default(sql`now()`),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

// BD4-02: studio_brain_docs — mirrors the table installed by db.ts migration
// v16 (added by BD4-01). The heartbeat reads id='brand-voice' for
// personalization; GOD-05 generic fallback when no row.
// KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts studioBrainDocs.
export const studioBrainDocs = pgTable("studio_brain_docs", {
  /** 'brand-voice' | 'ethos' | 'class-catalog' */
  id: text("id").primaryKey(),
  docType: text("doc_type").notNull(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  seededAt: text("seeded_at"),
  createdAt: text("created_at").notNull().default(sql`now()`),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

// BD4-02: class_definitions — partial mirror; only the fields the heartbeat
// dormancy SQL needs. The heartbeat uses raw db.execute() for the dormancy
// LEFT JOIN, but having the Drizzle type available enables typed references
// if/when needed.
// KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts classDefinitions.
export const classDefinitions = pgTable("class_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active").notNull().default(1),
});

// BD4-02: bookings — partial mirror for dormancy detection.
// The heartbeat dormancy SQL JOINs bookings via db.execute(); this Drizzle
// mirror provides typed column refs for future Drizzle-query usage.
// KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts bookings.
export const bookings = pgTable("bookings", {
  id: text("id").primaryKey(),
  occurrenceId: text("occurrence_id").notNull(),
  memberId: text("member_id").notNull(),
  status: text("status").notNull().default("booked"),
  bookedAt: text("booked_at").notNull().default(sql`now()`),
  attendedAt: text("attended_at"),
});

export const schema = {
  webhookEvents,
  gymMembers,
  conversations,
  messages,
  whatsappOptIn,
  whatsappTemplates,
  stripeCustomers,
  stripeSubscriptions,
  payments,
  passes,
  passDebits,
  secrets,
  studioTelemetryState,
  studioOwnerConfig,
  reactivationAttempts,
  studioBrainDocs,
  classDefinitions,
  bookings,
};

let _db: ReturnType<typeof drizzle> | undefined;
export function getDb() {
  if (_db) return _db;
  const env = getEnv();
  // Worker uses UNPOOLED endpoint — shared with pg-boss (PITFALL #1).
  const pool = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED });
  _db = drizzle(pool, { schema });
  return _db;
}

/** Test-only: reset cached db so tests can re-mock cleanly. */
export function _resetDbForTests(): void {
  _db = undefined;
}
