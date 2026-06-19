// apps/hq/server/lib/list-studios-query.ts
//
// Shared read-model query for the HQB studio console.
//
// Used by both:
//   - apps/hq/app/routes/api.studios.ts  (GET /api/studios resource route)
//   - apps/hq/actions/list-studios.ts    (defineAction for agent tool)
//
// The query joins hq_studios to the latest telemetry snapshot (DISTINCT ON
// studio_id ORDER BY received_at DESC) and to a 30-day token spend aggregate.
// Classification is applied per-row using classifyStudioHealth() — no LLM.
//
// Uses getDbExec() from @agent-native/core/db for raw SQL because the
// DISTINCT ON (studio_id) subquery is Postgres-specific and not expressible
// via the Drizzle query builder. Pattern mirrors usage-metrics.ts.
//
// guard:allow-unscoped -- HQ tables are operator-scoped (single super-admin)

import { getDbExec } from "@agent-native/core/db";
import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";
import {
  classifyStudioHealth,
  type StudioHealthSignals,
} from "./studio-health.js";

// ---------------------------------------------------------------------------
// Raw row type
// ---------------------------------------------------------------------------

interface StudioRow extends Record<string, unknown> {
  id: string;
  slug: string;
  display_name: string;
  owner_email: string;
  status: string;
  provisioned_at: string | null;
  payload_json: string | null;
  last_telemetry_received_at: string | null;
  period_start: string | null;
  period_end: string | null;
  total_input_tokens: string | null; // Postgres SUM returns string via neon driver
  total_output_tokens: string | null;
}

// ---------------------------------------------------------------------------
// Public response types
// ---------------------------------------------------------------------------

export interface StudioConsoleRow {
  id: string;
  slug: string;
  displayName: string;
  ownerEmail: string;
  status: string;
  provisionedAt: string | null;
  lastTelemetryReceivedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  activeMembers: number | null;
  bookings: number | null;
  messagesSent: number | null;
  retentionRate: number | null;
  health: StudioHealthSignals;
}

export interface StudiosResponse {
  studios: StudioConsoleRow[];
}

// ---------------------------------------------------------------------------
// Query + classification
// ---------------------------------------------------------------------------

// The DISTINCT ON read-model SQL. Tested against Postgres (Neon).
// Uses DISTINCT ON (studio_id) ORDER BY received_at DESC to get the latest
// snapshot per studio — Postgres-specific but the only correct way to do
// this in a single query without a correlated subquery.
const STUDIOS_SQL = `
  SELECT
    s.id,
    s.slug,
    s.display_name,
    s.owner_email,
    s.status,
    s.provisioned_at,
    snap.payload_json,
    snap.last_telemetry_received_at,
    snap.period_start,
    snap.period_end,
    COALESCE(tok.total_input, 0)  AS total_input_tokens,
    COALESCE(tok.total_output, 0) AS total_output_tokens
  FROM hq_studios s
  LEFT JOIN (
    SELECT DISTINCT ON (studio_id)
      studio_id,
      payload_json,
      last_telemetry_received_at,
      period_start,
      period_end
    FROM hq_telemetry_snapshots
    ORDER BY studio_id, received_at DESC
  ) snap ON snap.studio_id = s.id
  LEFT JOIN (
    SELECT studio_id,
           SUM(input_tokens)  AS total_input,
           SUM(output_tokens) AS total_output
    FROM hq_token_usage
    WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::TEXT
    GROUP BY studio_id
  ) tok ON tok.studio_id = s.id
  ORDER BY s.created_at DESC
`;

/**
 * Fetch all studios with latest snapshot aggregates, 30-day token spend,
 * and a deterministic health classification per studio.
 *
 * Uses raw SQL via getDbExec() because the DISTINCT ON (studio_id) subquery
 * is not expressible in the Drizzle query builder. Pattern mirrors the
 * usage-metrics.ts queryRows() helper in apps/hq.
 */
export async function queryStudiosWithHealth(): Promise<StudioConsoleRow[]> {
  const result = await getDbExec().execute({ sql: STUDIOS_SQL, args: [] });
  const rows = (result.rows ?? []) as StudioRow[];

  return rows.map((row): StudioConsoleRow => {
    // Parse the snapshot JSON blob — null-safe.
    let snapshot: TelemetrySnapshotInput | null = null;
    if (row.payload_json) {
      try {
        snapshot = JSON.parse(row.payload_json) as TelemetrySnapshotInput;
      } catch {
        snapshot = null;
      }
    }

    // Postgres SUM returns numeric-as-string via the neon serverless driver.
    const totalInputTokens = Number(row.total_input_tokens ?? 0);
    const totalOutputTokens = Number(row.total_output_tokens ?? 0);

    const health = classifyStudioHealth(
      snapshot,
      (row.last_telemetry_received_at as string | null) ?? null,
    );

    return {
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      ownerEmail: row.owner_email,
      status: row.status,
      provisionedAt: (row.provisioned_at as string | null) ?? null,
      lastTelemetryReceivedAt:
        (row.last_telemetry_received_at as string | null) ?? null,
      periodStart: (row.period_start as string | null) ?? null,
      periodEnd: (row.period_end as string | null) ?? null,
      totalInputTokens,
      totalOutputTokens,
      activeMembers: snapshot?.activeMembers ?? null,
      bookings: snapshot?.bookings ?? null,
      messagesSent: snapshot?.messagesSent ?? null,
      retentionRate: snapshot?.retentionRate ?? null,
      health,
    };
  });
}
