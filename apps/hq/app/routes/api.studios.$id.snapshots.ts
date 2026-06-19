// apps/hq/app/routes/api.studios.$id.snapshots.ts
//
// React Router v7 resource route -- GET /api/studios/:id/snapshots
//
// HQB-05: Returns ordered telemetry history for a single studio, projected
// to flat time-series points from hq_telemetry_snapshots.payload_json.
//
// Powers the per-studio drill-in route (BD3-02 Task 3) which renders
// recharts LineChart history over time.
//
// guard:allow-unscoped -- HQ tables are operator-scoped (single super-admin)

import { data, type LoaderFunctionArgs } from "react-router";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db/index.js";
import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single time-series point projected from a hq_telemetry_snapshots row.
 * Flat shape for direct consumption by recharts LineChart data prop.
 */
export interface StudioSnapshotPoint {
  periodStart: string;
  periodEnd: string;
  receivedAt: string;
  activeMembers: number;
  bookings: number;
  messagesSent: number;
  retentionRate: number;
  llmInputTokens: number;
  llmOutputTokens: number;
}

/**
 * Response returned by GET /api/studios/:id/snapshots.
 * `points` is ordered by period_start ASC for charting.
 */
export interface StudioSnapshotsResponse {
  studioId: string;
  displayName: string | null;
  points: StudioSnapshotPoint[];
}

// ---------------------------------------------------------------------------
// Loader (resource route -- returns JSON, not HTML)
// ---------------------------------------------------------------------------

export async function loader({ params }: LoaderFunctionArgs) {
  const studioId = params.id;
  if (!studioId) {
    throw new Response("Missing studio id", { status: 400 });
  }

  const db = getDb();

  // Fetch studio display name (may be null for unknown studios).
  const studioRows = await db
    .select({ displayName: schema.hqStudios.displayName })
    .from(schema.hqStudios)
    .where(eq(schema.hqStudios.id, studioId))
    .limit(1);

  const displayName = studioRows[0]?.displayName ?? null;

  // Fetch all snapshot rows for this studio, ordered by period_start ASC.
  const snapshotRows = await db
    .select({
      periodStart: schema.hqTelemetrySnapshots.periodStart,
      periodEnd: schema.hqTelemetrySnapshots.periodEnd,
      receivedAt: schema.hqTelemetrySnapshots.receivedAt,
      payloadJson: schema.hqTelemetrySnapshots.payloadJson,
    })
    .from(schema.hqTelemetrySnapshots)
    .where(eq(schema.hqTelemetrySnapshots.studioId, studioId))
    .orderBy(asc(schema.hqTelemetrySnapshots.periodStart));

  // Project each snapshot row to a flat time-series point.
  const points: StudioSnapshotPoint[] = snapshotRows.flatMap((row) => {
    let parsed: TelemetrySnapshotInput | null = null;
    try {
      parsed = JSON.parse(row.payloadJson) as TelemetrySnapshotInput;
    } catch {
      return []; // skip malformed rows
    }
    return [
      {
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        receivedAt: row.receivedAt,
        activeMembers: parsed.activeMembers,
        bookings: parsed.bookings,
        messagesSent: parsed.messagesSent,
        retentionRate: parsed.retentionRate,
        llmInputTokens: parsed.llmInputTokens,
        llmOutputTokens: parsed.llmOutputTokens,
      },
    ];
  });

  return data<StudioSnapshotsResponse>({ studioId, displayName, points });
}
