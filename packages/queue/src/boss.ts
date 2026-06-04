import { PgBoss } from "pg-boss";

let _boss: PgBoss | undefined;

/**
 * Get a singleton PgBoss instance bound to DATABASE_URL_UNPOOLED.
 *
 * CRITICAL (PITFALL #1 in P1b research): pg-boss uses LISTEN/NOTIFY,
 * advisory locks, and prepared statements. ALL THREE are broken by Neon's
 * -pooler endpoint (PgBouncer transaction mode). Must use the direct/
 * unpooled hostname.
 *
 * The DATABASE_URL_UNPOOLED env var is set per-app in Fly Secrets +
 * .env.local. Strip the -pooler suffix from the existing DATABASE_URL.
 */
export function getBoss(): PgBoss {
  if (_boss) return _boss;
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set — pg-boss requires the unpooled Neon endpoint",
    );
  }
  if (url.includes("-pooler")) {
    throw new Error(
      "DATABASE_URL_UNPOOLED must NOT include the -pooler hostname suffix. " +
        "Strip '-pooler' from the existing DATABASE_URL to get the direct endpoint.",
    );
  }
  _boss = new PgBoss({
    connectionString: url,
    max: 10,
    schema: "pgboss",
    // This boss is PUBLISH-ONLY: every caller of @gymos/queue (edge-webhooks
    // inbound, staff-web outbound Send) only sends jobs. The worker owns the
    // pgboss schema, maintenance, and cron via its OWN boss instance
    // (services/worker/src/boss.ts). So disable supervise (maintenance),
    // schedule (cron), and migrate (schema creation) here — the publisher just
    // needs an open connection to send().
    supervise: false,
    schedule: false,
    migrate: false,
    // Note: pg-boss v12 moved retention/delete/archive controls to per-queue
    // options (retentionSeconds / deleteAfterSeconds on QueueOptions / SendOptions).
    // Per-publisher defaults live in publish.ts.
  });
  return _boss;
}

let _started: Promise<PgBoss> | undefined;

/**
 * Start the publish-only boss exactly once and return it ready to `send()`.
 *
 * pg-boss v12 requires `start()` before `send()` ("Database not opened"). This
 * boss is never started by an entrypoint other than via this helper, so the
 * enqueue functions call it lazily. Idempotent: the start promise is cached;
 * on failure the cache is cleared so the next call retries (avoids a
 * permanently-cached rejected promise).
 */
export function startBoss(): Promise<PgBoss> {
  if (_started) return _started;
  const boss = getBoss();
  boss.on("error", (err) => {
    console.error("[pgboss] publisher error", err);
  });
  _started = boss
    .start()
    .then(() => boss)
    .catch((err) => {
      _started = undefined;
      throw err;
    });
  return _started;
}

/** For tests only — reset the cached singleton. */
export function _resetBossForTests() {
  _boss = undefined;
  _started = undefined;
}
