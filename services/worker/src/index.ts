// Worker entrypoint — replaces the Plan P1b-04 placeholder stub.
//
// Responsibilities:
//   1. Validate env (DATABASE_URL_UNPOOLED + secrets — PITFALL #1)
//   2. Boot pg-boss (auto-creates pgboss.* schema on first boss.start())
//   3. Register all queue subscribers (inbound-whatsapp now; outbound-whatsapp
//      from Plan 06 and stripe-event from Plan 07 register one boss.work()
//      each below before start())
//   4. Bind /healthz on PORT 3002 (MEDIUM #10 — Fly's worker process check
//      from apps/edge-webhooks/fly.toml probes this endpoint). The endpoint
//      contract is preserved across the stub→real swap so the live check
//      stays passing during deploy.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { QUEUE_NAMES } from "@gymos/queue";
import { getBoss } from "./boss.js";
import { getEnv } from "./lib/env.js";
import { getLogger } from "./lib/logger.js";
import { registerInboundWhatsAppWorker } from "./queues/inbound-whatsapp.js";
import { registerOutboundWhatsAppWorker } from "./queues/outbound-whatsapp.js";
import { registerStripeEventWorker } from "./queues/stripe-event.js";
import { registerHousekeeping } from "./queues/housekeeping.js";
import { registerTelemetryPush } from "./queues/telemetry-push.js";
import { registerDailyOwnerDigest } from "./queues/daily-owner-digest.js";
import { registerHeartbeatReactivate } from "./queues/heartbeat-reactivate.js";
import { registerMaterializeClassOccurrences } from "./queues/materialize-class-occurrences.js";
import { registerMetaCapiEventWorker } from "./queues/meta-capi-event.js";
import { readAppSecretByKey } from "./lib/appSecrets.js";
import { getDb } from "./lib/db.js";

async function main() {
  const env = getEnv();
  const log = getLogger();
  log.info({ version: env.GIT_SHA }, "[worker] booting");

  const boss = getBoss();
  boss.on("error", (err) => log.error({ err }, "[pgboss] error"));

  await boss.start();
  log.info("[pgboss] started — schema migration auto-applied");

  // pg-boss v12 requires a queue to exist before work()/schedule()/send().
  // The worker owns the pgboss schema, so create every queue here on boot —
  // idempotently — before registering consumers. This also unblocks the
  // staff-web send() path (outbound/inbound) which would otherwise fail
  // against a non-existent queue.
  for (const q of [
    QUEUE_NAMES.INBOUND_WHATSAPP,
    QUEUE_NAMES.OUTBOUND_WHATSAPP,
    QUEUE_NAMES.STRIPE_EVENT,
    QUEUE_NAMES.CLASS_REMINDER,
    QUEUE_NAMES.CLASS_MATERIALIZE,
    QUEUE_NAMES.META_CAPI_EVENT,
    "templates-sync",
    "telemetry-push",
    "daily-owner-digest",
    "heartbeat-reactivate",
  ]) {
    try {
      await boss.createQueue(q);
    } catch (err) {
      // createQueue is effectively idempotent; tolerate "already exists".
      log.warn({ err, queue: q }, "[pgboss] createQueue (continuing)");
    }
  }
  log.info("[pgboss] queues ensured");

  // Queue registrations — one boss.work() per line. Plan 06 + Plan 07 add
  // outbound-whatsapp + stripe-event registrations alongside this one before
  // the admin server starts.
  await registerInboundWhatsAppWorker(boss);
  log.info("[worker] inbound-whatsapp queue registered");

  await registerOutboundWhatsAppWorker(boss);
  log.info("[worker] outbound-whatsapp queue registered");

  await registerStripeEventWorker(boss);
  log.info("[worker] stripe-event queue registered");

  // WA-08: daily template-sync cron via pg-boss schedule (Plan P1b-09).
  await registerHousekeeping(boss);
  log.info("[worker] housekeeping (templates-sync) registered");

  // BD2-04: daily telemetry push to HQ /api/telemetry (02:00 UTC).
  // Unconfigured studios (no HQ_INGEST_URL / STUDIO_TELEMETRY_TOKEN) skip
  // cleanly — the handler logs a warning and returns without error.
  await registerTelemetryPush(boss);
  log.info("[worker] telemetry-push (daily HQ ingest) registered");

  // BD4-02: daily owner WhatsApp digest (06:00 studio timezone).
  // Unconfigured studios (no studio_owner_config row or digest_enabled=0) skip cleanly.
  await registerDailyOwnerDigest(boss);
  log.info("[worker] daily-owner-digest registered");

  // BD4-02: daily dormant-member heartbeat reactivation (09:xx studio timezone, staggered).
  // Sends reactivation messages through the existing outbound-whatsapp chokepoint.
  // Suppression ceiling (3/90 days) and opt-out exclusion enforced synchronously from day one.
  await registerHeartbeatReactivate(boss);
  log.info("[worker] heartbeat-reactivate registered");

  // MPV Phase 2: nightly class occurrence materialiser (04:00 UTC).
  // Reads active class_schedule_rules and inserts occurrences for the next 8 weeks
  // using ON CONFLICT DO NOTHING (idempotent via partial unique index on rule_id+starts_at).
  await registerMaterializeClassOccurrences(boss);
  log.info(
    "[worker] class-materialize (recurring class occurrences) registered",
  );

  // MC1: Meta Conversions API sender (D-01 — sole CAPI chokepoint).
  // Decrypts META_CAPI_TOKEN via BETTER_AUTH_SECRET — see D-03 / Task 4 parity check.
  await registerMetaCapiEventWorker(boss);
  log.info("[worker] meta-capi-event queue registered");

  // D-04 Boot-time decrypt self-test: confirm BETTER_AUTH_SECRET on this Fly worker
  // can decrypt app_secrets. Uses WHATSAPP_ACCESS_TOKEN as a known-configured key.
  // If it returns null, BETTER_AUTH_SECRET is absent or mismatched vs. Vercel staff-web
  // (D-03), meaning META_CAPI_TOKEN would also silently skip on every CAPI send.
  // WARNING: does NOT crash the process — other queues must still run.
  try {
    const db = getDb();
    const probe = await readAppSecretByKey("WHATSAPP_ACCESS_TOKEN", db);
    if (probe === null) {
      log.error(
        "[worker] BOOT SELF-TEST: could not decrypt a known app_secret. " +
          "Verify BETTER_AUTH_SECRET on the Fly worker matches the Vercel staff-web value (D-03) — " +
          "otherwise META_CAPI_TOKEN cannot be decrypted and every CAPI send will silently skip.",
      );
    } else {
      log.info("[worker] boot self-test: app_secrets decrypt OK");
    }
  } catch (err) {
    log.error({ err }, "[worker] BOOT SELF-TEST: app_secrets decrypt threw");
  }

  // Tiny admin/healthz HTTP for Fly health checks (MEDIUM #10).
  // MUST listen on PORT 3002 — fly.toml [[services]] for the worker
  // process targets internal_port=3002 and probes /healthz. Plan 04's
  // stub bound the same endpoint; we replace the stub here but keep
  // the contract identical so the live check stays passing.
  const admin = new Hono();
  admin.get("/healthz", (c) =>
    c.json({ ok: true, version: env.GIT_SHA, app: "worker" }),
  );

  serve({ fetch: admin.fetch, port: env.PORT }, (info) => {
    log.info({ port: info.port }, "[worker] admin healthz listening");
  });
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
