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
    // Note: pg-boss v12 moved retention/delete/archive controls to per-queue
    // options (retentionSeconds / deleteAfterSeconds on QueueOptions / SendOptions).
    // Per-publisher defaults live in publish.ts.
  });
  return _boss;
}

/** For tests only — reset the cached singleton. */
export function _resetBossForTests() {
  _boss = undefined;
}
