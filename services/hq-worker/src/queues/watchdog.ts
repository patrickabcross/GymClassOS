// services/hq-worker/src/queues/watchdog.ts
//
// HQ watchdog recurring job -- "hq-watchdog" -- Pattern 8.
//
// Runs every 5 minutes (cron: "every5min") and performs two health checks:
//
//   1. STUCK RUNS -- provisioning runs that have been in a non-terminal state
//      (not 'completed' and not 'failed_terminal') for more than 15 minutes.
//      These indicate a hung saga (timeout, deadlock, provider error) that
//      pg-boss did not expire. Logs an ERROR-level alert for each stuck run.
//
//   2. MISSING TELEMETRY -- active studios (status='active') whose
//      last_telemetry_received_at is NULL or older than 25 hours.
//      A healthy studio pushes daily; >25h means a missed push.
//      Logs a WARN-level alert with the list of stale studio IDs.
//
// Alert surfaces: Pino ERROR/WARN logs shipped to Better Stack via Fly
// Logshipper. No silent failures -- research "no silent caps".
//
// TODO BD3: Postmark email alert when stuck runs / missing telemetry detected.
//
// Registration contract (consumer-first per Pattern 8 + housekeeping.ts):
//   1. boss.work("hq-watchdog", handler)  -- register consumer
//   2. boss.schedule("hq-watchdog", every-5-min, {}, { tz: "UTC" })  -- cron

import type { PgBoss } from "pg-boss";
import { sql } from "drizzle-orm";
import { getHqDb } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";

const WATCHDOG_QUEUE = "hq-watchdog";

// Thresholds
const STUCK_THRESHOLD_MINUTES = 15;
const STALE_TELEMETRY_THRESHOLD_HOURS = 25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StuckRun extends Record<string, unknown> {
  id: string;
  studioId: string;
  status: string;
  startedAt: string | null;
}

interface StaleTelemetryStudio extends Record<string, unknown> {
  id: string;
  slug: string;
  lastTelemetryReceivedAt: string | null;
}

// ---------------------------------------------------------------------------
// Watchdog handler
// ---------------------------------------------------------------------------

async function runWatchdog(): Promise<void> {
  const log = getLogger();
  const db = getHqDb();

  // ── 1. Stuck provisioning runs (>15 minutes, non-terminal) ───────────────
  // SQL: status NOT IN ('completed','failed_terminal') AND started_at < NOW()-15min
  const stuckRuns = await db.execute<StuckRun>(sql`
    SELECT
      id,
      studio_id AS "studioId",
      status,
      started_at AS "startedAt"
    FROM hq_provisioning_runs
    WHERE
      status NOT IN ('completed', 'failed_terminal')
      AND started_at < NOW() - INTERVAL '${sql.raw(String(STUCK_THRESHOLD_MINUTES))} minutes'
  `);

  if (stuckRuns.rows && stuckRuns.rows.length > 0) {
    log.error(
      {
        alert: "stuck-provisioning-runs",
        count: stuckRuns.rows.length,
        runs: stuckRuns.rows.map((r) => ({
          runId: r.id,
          studioId: r.studioId,
          status: r.status,
          startedAt: r.startedAt,
          stuckForMinutes: STUCK_THRESHOLD_MINUTES,
        })),
        // TODO BD3: Postmark email alert
      },
      `[watchdog] ALERT: ${stuckRuns.rows.length} provisioning run(s) stuck >${STUCK_THRESHOLD_MINUTES} minutes`,
    );
  }

  // ── 2. Missing telemetry (active studios, >25h since last push) ───────────
  // SQL: hq_studios (status='active') LEFT JOIN hq_telemetry_snapshots
  //      WHERE last_telemetry_received_at IS NULL OR < NOW()-25h
  const staleTelemetry = await db.execute<StaleTelemetryStudio>(sql`
    SELECT
      s.id,
      s.slug,
      ts.last_telemetry_received_at AS "lastTelemetryReceivedAt"
    FROM hq_studios s
    LEFT JOIN (
      SELECT DISTINCT ON (studio_id)
        studio_id,
        last_telemetry_received_at
      FROM hq_telemetry_snapshots
      ORDER BY studio_id, received_at DESC
    ) ts ON ts.studio_id = s.id
    WHERE
      s.status = 'active'
      AND (
        ts.last_telemetry_received_at IS NULL
        OR ts.last_telemetry_received_at < NOW() - INTERVAL '${sql.raw(String(STALE_TELEMETRY_THRESHOLD_HOURS))} hours'
      )
  `);

  if (staleTelemetry.rows && staleTelemetry.rows.length > 0) {
    log.warn(
      {
        alert: "missing-telemetry",
        count: staleTelemetry.rows.length,
        studios: staleTelemetry.rows.map((s) => ({
          studioId: s.id,
          slug: s.slug,
          lastTelemetryReceivedAt: s.lastTelemetryReceivedAt,
          staleThresholdHours: STALE_TELEMETRY_THRESHOLD_HOURS,
        })),
        // TODO BD3: Postmark email alert
      },
      `[watchdog] WARN: ${staleTelemetry.rows.length} studio(s) missing telemetry >${STALE_TELEMETRY_THRESHOLD_HOURS} hours`,
    );
  }

  // Clean tick — both checks empty, no alert needed.
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the hq-watchdog pg-boss worker + 5-min schedule.
 *
 * Consumer is registered FIRST so when the schedule fires on the first tick
 * there is already a worker claim destination (Pattern 8 / housekeeping.ts).
 *
 * @param boss - The pg-boss instance (already started).
 */
export async function registerWatchdog(boss: PgBoss): Promise<void> {
  const log = getLogger();

  // 1. Consumer first.
  await boss.work(WATCHDOG_QUEUE, async () => {
    try {
      await runWatchdog();
    } catch (err) {
      // Log but don't re-throw — a failing watchdog tick shouldn't
      // block subsequent ticks or crash the worker.
      log.error({ err }, "[watchdog] tick failed unexpectedly");
    }
  });

  // 2. Schedule: every 5 minutes UTC.
  await boss.schedule(WATCHDOG_QUEUE, "*/5 * * * *", {}, {
    tz: "UTC",
  } as Parameters<typeof boss.schedule>[3]);

  log.info(
    { queue: WATCHDOG_QUEUE, cron: "*/5 * * * *", tz: "UTC" },
    "[hq-worker] hq-watchdog scheduled",
  );
}
