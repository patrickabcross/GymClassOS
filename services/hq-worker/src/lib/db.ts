/**
 * services/hq-worker/src/lib/db.ts
 *
 * HQ Neon Drizzle handle for the hq-worker process.
 *
 * Uses the neon-serverless WebSocket driver (Pool) against
 * DATABASE_URL_UNPOOLED — the same unpooled connection string used by
 * pg-boss. pg-boss needs LISTEN/NOTIFY + advisory locks (PITFALL #1);
 * Drizzle shares the same pool without conflict because they don't
 * race on advisory locks.
 *
 * Schema mirror pattern borrowed from services/worker/src/lib/db.ts:
 * the authoritative schema lives in packages/hq-schema/src/schema.ts
 * (which uses @agent-native/core/db/schema helpers that resolve to
 * SQLite types at typecheck time). We re-export the same Drizzle table
 * objects but drive them through the neon-serverless pg driver so
 * queries use Postgres-dialect types.
 *
 * IMPORTANT: this file MUST NOT import from @gymos/whatsapp or stripe.
 * hq-worker's DATABASE_URL_UNPOOLED is the HQ Neon only (D-11 / HQ-FND-06).
 *
 * getBoss is still re-exported from boss.ts — this file is a NEW concern
 * (Drizzle db handle); it does NOT replace the pg-boss factory.
 */

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import ws from "ws";
import { getEnv } from "./env.js";

neonConfig.webSocketConstructor = ws;

// ---------------------------------------------------------------------------
// HQ schema mirror — pg-core dialect.
//
// These mirror packages/hq-schema/src/schema.ts EXACTLY, using drizzle-orm/
// pg-core table builders so types are Postgres-correct at query time.
// Keep in sync with packages/hq-schema/src/schema.ts.
// ---------------------------------------------------------------------------

const now = () => sql`now()`;

/** hq_studios — one row per provisioned (or pending) studio. */
export const hqStudios = pgTable("hq_studios", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  status: text("status").notNull().default("pending"),
  planId: text("plan_id"),
  provisionedAt: text("provisioned_at"),
  createdAt: text("created_at").notNull().default(now()),
});

/**
 * hq_provisioning_runs — per-saga state machine row.
 *
 * Stores ONLY opaque provider resource IDs (neon_project_id, vercel_project_id,
 * fly_app_name, subdomain). NEVER a Neon connection string (D-13 / Pitfall P-05).
 * Column names confirmed by CI guard:hq-no-pii (no *connection*, *database_url*,
 * or *dsn* column names allowed).
 */
export const hqProvisioningRuns = pgTable("hq_provisioning_runs", {
  id: text("id").primaryKey(),
  studioId: text("studio_id").notNull(),
  status: text("status").notNull().default("started"),
  // Opaque provider resource IDs — NOT connection strings.
  neonProjectId: text("neon_project_id"),
  vercelProjectId: text("vercel_project_id"),
  flyAppName: text("fly_app_name"),
  subdomain: text("subdomain"),
  // Per-step completion timestamps (NULL = step not yet run).
  step1At: text("step_1_at"),
  step2At: text("step_2_at"),
  step3At: text("step_3_at"),
  step4At: text("step_4_at"),
  step5At: text("step_5_at"),
  step6At: text("step_6_at"),
  step7At: text("step_7_at"),
  step8At: text("step_8_at"),
  // LIFO compensation error log (JSON object of step→error string).
  compensationErrors: text("compensation_errors").notNull().default("{}"),
  startedAt: text("started_at").notNull().default(now()),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull().default(now()),
});

/**
 * hq_studio_tokens — per-studio telemetry bearer token (sha256 hash only).
 * HQ stores ONLY the hash; studio holds the plaintext (D-05).
 */
export const hqStudioTokens = pgTable("hq_studio_tokens", {
  studioId: text("studio_id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull().default(now()),
  revokedAt: text("revoked_at"),
});

/** hq_telemetry_snapshots — full TelemetrySnapshot JSON per studio per period. */
export const hqTelemetrySnapshots = pgTable("hq_telemetry_snapshots", {
  id: text("id").primaryKey(),
  studioId: text("studio_id").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  payloadJson: text("payload_json").notNull(),
  receivedAt: text("received_at").notNull().default(now()),
  lastTelemetryReceivedAt: text("last_telemetry_received_at"),
});

/** hq_token_usage — daily aggregated LLM token counts per studio. */
export const hqTokenUsage = pgTable("hq_token_usage", {
  studioId: text("studio_id").notNull(),
  date: text("date").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(now()),
});

/**
 * BD3 HQD — hq_whatsapp_opt_in: gym-owner opt-in for HQ WABA B2B comms.
 * One row per studio. owner_email + phone_e164 are the GYM-OWNER's own
 * contact info (B2B) — NOT gym members. last_inbound_at drives the 24h gate.
 */
export const hqWhatsappOptIn = pgTable("hq_whatsapp_opt_in", {
  id: text("id").primaryKey(),
  studioId: text("studio_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  phoneE164: text("phone_e164").notNull(),
  lastInboundAt: text("last_inbound_at"),
  optedInAt: text("opted_in_at").notNull().default(now()),
  optedOutAt: text("opted_out_at"),
  optInSource: text("opt_in_source").notNull().default("signup"),
  createdAt: text("created_at").notNull().default(now()),
});

/**
 * BD3 HQD — hq_whatsapp_templates: approved HQ owner-comms templates.
 * Gate checks status='approved'. Populated manually or via Meta template sync.
 */
export const hqWhatsappTemplates = pgTable("hq_whatsapp_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json"),
  syncedAt: text("synced_at"),
  createdAt: text("created_at").notNull().default(now()),
});

export const schema = {
  hqStudios,
  hqProvisioningRuns,
  hqStudioTokens,
  hqTelemetrySnapshots,
  hqTokenUsage,
  hqWhatsappOptIn,
  hqWhatsappTemplates,
};

export type HqDb = ReturnType<typeof drizzle<typeof schema>>;

/** Inferred row type for hq_provisioning_runs (used by compensate + runStep). */
export type HqProvisioningRun = typeof hqProvisioningRuns.$inferSelect;

let _hqDb: HqDb | undefined;

/**
 * Get (or create) the singleton Drizzle db handle for the HQ Neon.
 *
 * Uses DATABASE_URL_UNPOOLED (the unpooled connection string) shared with
 * pg-boss. Pool reuse is safe: pg-boss advisory locks don't conflict with
 * Drizzle's SELECT/INSERT/UPDATE queries.
 */
export function getHqDb(): HqDb {
  if (_hqDb) return _hqDb;
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED });
  _hqDb = drizzle(pool, { schema });
  return _hqDb;
}

/** Test-only: reset cached HQ db so each test can mock getHqDb afresh. */
export function _resetDbForTests(): void {
  _hqDb = undefined;
}
