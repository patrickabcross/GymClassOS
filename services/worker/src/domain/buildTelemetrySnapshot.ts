/**
 * services/worker/src/domain/buildTelemetrySnapshot.ts
 *
 * BD2-03 / TEL-02: PII-free aggregate engagement/retention snapshot builder.
 *
 * Purpose: called by the BD2-04 telemetry push job (services/worker) to
 * produce a TelemetrySnapshot-shaped object from studio aggregate SQL.
 * The result is serialised to JSON and POSTed to the HQ ingest endpoint.
 *
 * PII boundary (D-02 / D-04):
 *   - NO member name, email, phone_e164, or message body is ever selected.
 *   - All values are COUNT(*) aggregates, numeric rates, or ISO timestamps.
 *   - The returned object keys EXACTLY match the TelemetrySnapshot allow-list
 *     in packages/hq-schema/src/telemetry.ts. No extra keys are present.
 *
 * Aggregation window: 24-hour period ending at call time (UTC).
 *   periodEnd   = now (ISO 8601 UTC)
 *   periodStart = periodEnd - 24 hours
 *
 * Retention window: current 24h vs prior 24h (simple rolling comparison).
 *   retentionRate = |current-active ∩ prior-active| / |prior-active|
 *   Approximated here as: count(distinct members active this window) /
 *   count(distinct members active prior window), clamped to [0,1].
 *   Returns 0 when prior-window active count is 0 (no division by zero).
 *
 * mobileEngagement proxy: count of food_entries logged in the window.
 *   Food diary entries are the primary mobile-only engagement signal available
 *   in the current studio schema (members log food via packages/mobile-app).
 *   Documented proxy; BD3 may refine to a richer mobile-session count.
 */

import { sql } from "drizzle-orm";
import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape of the studio_telemetry_state row (from schema.studioTelemetryState).
 * The push job reads the full row and passes it here so we don't issue a
 * second SELECT inside the snapshot builder (avoids read-then-read race).
 */
export interface StudioTelemetryStateRow {
  id: string;
  tokenUsageTodayInput: number;
  tokenUsageTodayOutput: number;
  requestCountToday: number;
  outboundSentToday: number;
  outboundFailedToday: number;
  lastPushAt: string | null;
  lastPushStatus: string | null;
  updatedAt: string;
}

/**
 * Minimal Drizzle-compatible db interface used by this builder.
 * We only call db.execute(rawSql) for COUNT aggregates — no PII columns.
 */
interface DbLike {
  execute(query: unknown): Promise<{ rows: Array<Record<string, unknown>> }>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build a PII-free TelemetrySnapshot from the studio's aggregate SQL.
 *
 * @param db        - Drizzle db instance connected to the studio Neon.
 * @param studioId  - Opaque studio slug (e.g. "my-gym"). No member identifier.
 * @param state     - The singleton studio_telemetry_state row (llm* source).
 * @returns         - Object whose keys EXACTLY match TelemetrySnapshotInput.
 */
export async function buildTelemetrySnapshot(
  db: DbLike,
  studioId: string,
  state: StudioTelemetryStateRow,
): Promise<TelemetrySnapshotInput> {
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Prior window: 24h immediately before the current window.
  const priorEnd = periodStart;
  const priorStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. activeMembers: distinct members with at least one booking in window ─
  // No PII columns selected — COUNT(DISTINCT member_id) only.
  const activeMembersResult = await db.execute(sql`
    SELECT COUNT(DISTINCT member_id)::INTEGER AS count
    FROM bookings
    WHERE booked_at >= ${periodStart}
      AND booked_at <  ${periodEnd}
      AND status NOT IN ('cancelled')
  `);
  const activeMembers = toInt(activeMembersResult.rows[0]?.count);

  // ── 2. bookings: total confirmed bookings in window ───────────────────────
  const bookingsResult = await db.execute(sql`
    SELECT COUNT(*)::INTEGER AS count
    FROM bookings
    WHERE booked_at >= ${periodStart}
      AND booked_at <  ${periodEnd}
      AND status NOT IN ('cancelled')
  `);
  const bookings = toInt(bookingsResult.rows[0]?.count);

  // ── 3. messagesSent: outbound WhatsApp messages in window ─────────────────
  // direction='out' only. No body / payload columns selected.
  const messagesSentResult = await db.execute(sql`
    SELECT COUNT(*)::INTEGER AS count
    FROM messages
    WHERE direction = 'out'
      AND created_at >= ${periodStart}
      AND created_at <  ${periodEnd}
  `);
  const messagesSent = toInt(messagesSentResult.rows[0]?.count);

  // ── 4. mobileEngagement: food diary entries logged in window (proxy) ──────
  // food_entries are only logged via the mobile app (packages/mobile-app).
  // No member_id or food item name selected — aggregate count only.
  const mobileEngagementResult = await db.execute(sql`
    SELECT COUNT(*)::INTEGER AS count
    FROM food_entries
    WHERE logged_at >= ${periodStart}
      AND logged_at <  ${periodEnd}
  `);
  const mobileEngagement = toInt(mobileEngagementResult.rows[0]?.count);

  // ── 5. retentionRate: current-window active / prior-window active ─────────
  // Approximation: distinct members who booked in current window as a fraction
  // of distinct members who booked in the prior window.
  // Returns 0 when prior denominator is 0 (no division-by-zero).
  const retentionCurrentResult = await db.execute(sql`
    SELECT COUNT(DISTINCT member_id)::INTEGER AS count
    FROM bookings
    WHERE booked_at >= ${periodStart}
      AND booked_at <  ${periodEnd}
      AND status NOT IN ('cancelled')
  `);
  const retentionPriorResult = await db.execute(sql`
    SELECT COUNT(DISTINCT member_id)::INTEGER AS count
    FROM bookings
    WHERE booked_at >= ${priorStart}
      AND booked_at <  ${priorEnd}
      AND status NOT IN ('cancelled')
  `);

  const retentionCurrent = toInt(retentionCurrentResult.rows[0]?.count);
  const retentionPrior = toInt(retentionPriorResult.rows[0]?.count);
  const retentionRate =
    retentionPrior === 0
      ? 0
      : Math.min(1, retentionCurrent / retentionPrior);

  // ── Return ONLY allow-list keys ───────────────────────────────────────────
  // Explicitly enumerate to guarantee no extra keys leak through.
  const snapshot: TelemetrySnapshotInput = {
    studioId,
    periodStart,
    periodEnd,
    llmInputTokens: state.tokenUsageTodayInput,
    llmOutputTokens: state.tokenUsageTodayOutput,
    llmRequestCount: state.requestCountToday,
    activeMembers,
    bookings,
    messagesSent,
    mobileEngagement,
    retentionRate,
  };

  return snapshot;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a COUNT result to a safe non-negative integer.
 * Postgres COUNT returns a string when retrieved via the serverless driver;
 * handle both string and number inputs gracefully.
 */
function toInt(value: unknown): number {
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
