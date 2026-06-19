/**
 * services/worker/src/queues/telemetry-push.ts
 *
 * BD2-04 / TEL-03: Studio daily telemetry push job.
 *
 * Mirrors housekeeping.ts exactly — same consumer-first, then schedule pattern.
 *
 * What it does:
 *   1. Read the studio_telemetry_state singleton (LLM token counts + outbound counts).
 *   2. Call buildTelemetrySnapshot() to aggregate engagement/retention from studio SQL.
 *   3. POST the snapshot to HQ POST /api/telemetry with a per-studio bearer token.
 *   4. On success: reset the daily accumulators (tokenUsageTodayInput/Output, etc.).
 *   5. On non-2xx HTTP: throw so pg-boss marks the job failed and retries.
 *
 * Unconfigured-skip pattern (same as housekeeping.ts):
 *   If HQ_INGEST_URL or STUDIO_TELEMETRY_TOKEN is absent, the handler logs a
 *   warning and returns cleanly. The worker still boots; the schedule is still
 *   registered. Setting the env vars later (via provisioning Step 7) is a
 *   zero-redeploy activation.
 *
 * Schedule: 02:00 UTC daily (different from templates-sync at 03:00 UTC to
 * spread load). pg-boss schedule() is idempotent — safe to call on every boot.
 */

import type { PgBoss } from "pg-boss";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db.js";
import { getEnv } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { buildTelemetrySnapshot } from "../domain/buildTelemetrySnapshot.js";

const TELEMETRY_PUSH_QUEUE = "telemetry-push";

/**
 * Register the studio daily telemetry-push job with pg-boss.
 *
 * Call order mirrors housekeeping.ts:
 *   1. boss.work() — register the consumer FIRST so the schedule has a claim
 *      destination when the first cron tick fires.
 *   2. boss.schedule() — register the 02:00 UTC daily cron (idempotent).
 */
export async function registerTelemetryPush(boss: PgBoss): Promise<void> {
  const log = getLogger();

  // ── Register consumer FIRST ─────────────────────────────────────────────
  await boss.work(TELEMETRY_PUSH_QUEUE, async () => {
    const env = getEnv();

    // Unconfigured-skip: log a warning and return without error so the worker
    // boots cleanly on studios that haven't been provisioned yet (BD2-05/06
    // sets these values during provisioning Step 4/5/7).
    if (!env.HQ_INGEST_URL || !env.STUDIO_TELEMETRY_TOKEN) {
      log.warn(
        "[telemetry-push] HQ_INGEST_URL or STUDIO_TELEMETRY_TOKEN not configured; " +
          "skipping. These are set automatically by the provisioning saga (BD2-05/06).",
      );
      return;
    }

    if (!env.STUDIO_ID) {
      log.warn(
        "[telemetry-push] STUDIO_ID not configured; skipping. " +
          "Set via provisioning Step 4.",
      );
      return;
    }

    const db = getDb();

    // ── Read the telemetry-state singleton ───────────────────────────────
    const [state] = await db
      .select()
      .from(schema.studioTelemetryState)
      .where(eq(schema.studioTelemetryState.id, "singleton"));

    if (!state) {
      // Studio Neon not yet seeded — schedule fires too early or state table
      // not installed (BD2-03 migration not applied). Log and skip.
      log.warn(
        "[telemetry-push] studio_telemetry_state singleton row not found; " +
          "skipping. Ensure BD2-03 migration has been applied.",
      );
      return;
    }

    // ── Build the aggregate snapshot (PII-free) ───────────────────────────
    const snapshot = await buildTelemetrySnapshot(db, env.STUDIO_ID, state);

    // ── POST to HQ /api/telemetry ─────────────────────────────────────────
    log.info(
      { studioId: env.STUDIO_ID, periodEnd: snapshot.periodEnd },
      "[telemetry-push] posting snapshot to HQ",
    );

    const resp = await fetch(env.HQ_INGEST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STUDIO_TELEMETRY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
    });

    if (!resp.ok) {
      const body = await resp.text();
      // Throw so pg-boss marks the job failed and retries on next cron tick.
      throw new Error(
        `[telemetry-push] HQ ingest returned ${resp.status}: ${body}`,
      );
    }

    // ── Reset daily accumulators after successful push ────────────────────
    // All counters back to 0 so the next 24h window starts clean.
    await db
      .update(schema.studioTelemetryState)
      .set({
        tokenUsageTodayInput:  0,
        tokenUsageTodayOutput: 0,
        requestCountToday:     0,
        outboundSentToday:     0,
        outboundFailedToday:   0,
        lastPushAt:            new Date().toISOString(),
        lastPushStatus:        "ok",
      })
      .where(eq(schema.studioTelemetryState.id, "singleton"));

    log.info(
      { studioId: env.STUDIO_ID },
      "[telemetry-push] completed — accumulators reset",
    );
  });

  // ── Schedule: 02:00 UTC daily ────────────────────────────────────────────
  // Idempotent: calling schedule() with the same queue name+cron is a no-op
  // if already registered (safe on every worker restart).
  await boss.schedule(TELEMETRY_PUSH_QUEUE, "0 2 * * *", {}, {
    tz: "UTC",
  } as any);

  log.info(
    { queue: TELEMETRY_PUSH_QUEUE, cron: "0 2 * * *", tz: "UTC" },
    "[telemetry-push] daily push scheduled",
  );
}
