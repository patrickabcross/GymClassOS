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

export const schema = {
  webhookEvents,
  gymMembers,
  conversations,
  messages,
  whatsappOptIn,
  whatsappTemplates,
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
