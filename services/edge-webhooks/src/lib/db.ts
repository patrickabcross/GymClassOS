import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import ws from "ws";
import { getEnv } from "./env.js";

neonConfig.webSocketConstructor = ws;

// ---------------------------------------------------------------------------
// Local Drizzle schema mirror — webhook_events only.
//
// DEVIATION from PLAN Task 1 step 4 (cross-app schema import) — RESEARCH
// Open Question #2 flagged this as fragile, and at typecheck time the
// dialect-agnostic helpers in @agent-native/core/db/schema resolve to
// SQLite types, which conflicts with the neon-serverless pg driver here.
// We mirror only the columns we read/write (webhook_events) using
// drizzle-orm/pg-core directly. The actual Postgres table is owned by
// apps/staff-web (added in P1b-02 migration); this mirror only describes
// it for Drizzle's query builder. Schema drift is a real risk — keep this
// file's column list in sync with apps/staff-web/server/db/schema.ts
// webhookEvents (the source of truth). Plan 09 will extract a shared
// packages/db/ package to eliminate this duplication.
// ---------------------------------------------------------------------------

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider", { enum: ["stripe", "whatsapp", "meta_lead"] }).notNull(),
  eventType: text("event_type").notNull(),
  externalId: text("external_id"),
  payloadRaw: text("payload_raw").notNull(),
  receivedAt: text("received_at")
    .notNull()
    .default(sql`now()`),
  processedAt: text("processed_at"),
  error: text("error"),
});

export const schema = { webhookEvents };

let _db: ReturnType<typeof drizzle> | undefined;
export function getDb() {
  if (_db) return _db;
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  _db = drizzle(pool, { schema });
  return _db;
}

/** Test-only: reset cached db so tests can re-mock cleanly. */
export function _resetDbForTests(): void {
  _db = undefined;
}
