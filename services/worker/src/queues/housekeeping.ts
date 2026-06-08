import type { PgBoss } from "pg-boss";
import { getDb } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
import { syncWhatsAppTemplates } from "../domain/syncTemplates.js";
import { getMyutikApiKey, getMyutikPhoneNumberId } from "../lib/secrets.js";

const TEMPLATES_SYNC_QUEUE = "templates-sync";

/**
 * WA-08: Daily housekeeping cron for WhatsApp template metadata sync via MYÜTIK.
 *
 * Registers two things, in this order:
 *   1. `boss.work('templates-sync', handler)` — the consumer that pulls
 *      the cron-fired job off the queue and calls syncWhatsAppTemplates().
 *      Worker registers FIRST so when the schedule fires there is already
 *      a consumer (avoids the first tick being an unclaimed job).
 *   2. `boss.schedule('templates-sync', '0 3 * * *', {}, { tz: 'UTC' })`
 *      — the cron schedule. pg-boss singleton guarantees only one tick
 *      fires across all worker replicas in the same Postgres database.
 *
 * If the MYÜTIK API key is not configured (no secrets.myutik_api_key and no
 * MYUTIK_API_KEY env var), the handler logs a warning and returns — worker
 * still boots cleanly. The schedule is registered either way so setting the
 * key later is a zero-redeploy change.
 */
export async function registerHousekeeping(boss: PgBoss): Promise<void> {
  const log = getLogger();

  // Register the consumer FIRST so the schedule has a claim destination.
  await boss.work(TEMPLATES_SYNC_QUEUE, async () => {
    const db = getDb();
    let apiKey: string | undefined;
    try {
      apiKey = await getMyutikApiKey(db);
    } catch {
      /* unconfigured */
    }
    if (!apiKey) {
      log.warn(
        "[templates-sync] MYÜTIK API key not configured; skipping. " +
          "Save it via the in-app Settings → API Keys (secrets.myutik_api_key) " +
          "or set MYUTIK_API_KEY as a Fly secret to enable nightly template sync.",
      );
      return;
    }
    const phoneNumberId = await getMyutikPhoneNumberId(db);
    try {
      const result = await syncWhatsAppTemplates(apiKey, phoneNumberId, db);
      log.info(result, "[templates-sync] completed");
    } catch (err) {
      log.error({ err }, "[templates-sync] failed — will retry next cron tick");
      // Re-throw so pg-boss marks the job failed (and surfaces in metrics).
      throw err;
    }
  });

  // Schedule: daily at 03:00 UTC. pg-boss schedules are idempotent — calling
  // boss.schedule() with the same name+cron is a no-op if already registered.
  await boss.schedule(TEMPLATES_SYNC_QUEUE, "0 3 * * *", {}, {
    tz: "UTC",
  } as any);
  log.info(
    { queue: TEMPLATES_SYNC_QUEUE, cron: "0 3 * * *", tz: "UTC" },
    "[housekeeping] templates-sync scheduled",
  );
}
