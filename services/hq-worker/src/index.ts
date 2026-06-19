// hq-worker entrypoint (BD2 — registers provision-studio saga + hq-watchdog)
//
// Boot sequence:
//   1. Validate env (DATABASE_URL_UNPOOLED → HQ Neon, PITFALL #1)
//   2. Boot pg-boss against the HQ Neon (auto-creates pgboss.* schema on first start)
//   3. createQueue for every HQ queue (idempotent — mirrors services/worker boot)
//   4. Register provision-studio saga handler + hq-watchdog recurring job (D-07)
//   5. Serve /healthz on PORT 3003 — the Fly http_check probes this endpoint
//
// Matches services/worker boot order so the /healthz contract is preserved.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getBoss } from "./boss.js";
import { getEnv } from "./lib/env.js";
import { getLogger } from "./lib/logger.js";
import { registerProvisionStudio } from "./queues/provision-studio.js";
import { registerWatchdog } from "./queues/watchdog.js";
import { createProvisionApis } from "./lib/provision-apis/index.js";
import { registerOwnerSend } from "./queues/hq-owner-send.js";
import { createHqWabaClient, mockHqWabaClient } from "./lib/hq-waba-client.js";

async function main() {
  const env = getEnv();
  const log = getLogger();
  log.info({ version: env.GIT_SHA }, "[hq-worker] booting");

  const boss = getBoss();
  boss.on("error", (err) => log.error({ err }, "[pgboss] error"));

  await boss.start();
  log.info("[pgboss] started — HQ Neon schema migration auto-applied");

  // pg-boss v12 requires queues to exist before work()/schedule()/send().
  // Create every HQ queue idempotently before registering consumers.
  // Mirrors the createQueue loop in services/worker/src/index.ts.
  for (const q of ["provision-studio", "hq-watchdog", "hq-owner-send"]) {
    try {
      await boss.createQueue(q);
    } catch (err) {
      // createQueue is effectively idempotent; tolerate "already exists".
      log.warn({ err, queue: q }, "[pgboss] createQueue (continuing)");
    }
  }
  log.info(
    "[hq-worker] queues ensured: provision-studio, hq-watchdog, hq-owner-send",
  );

  // ── Register provision-studio saga handler (BD2-05) ───────────────────────
  // Provider APIs are real in production (tokens from Fly secrets) and mocked
  // in tests. The saga throws "deferred-on-external-dependency" if tokens are
  // unset on a live run (D-12).
  const apis = createProvisionApis(env);
  await registerProvisionStudio(boss, apis);
  log.info("[hq-worker] provision-studio queue registered");

  // ── Register hq-watchdog recurring job (BD2-06) ───────────────────────────
  // Runs every 5 minutes; flags stuck runs (>15m) + missing telemetry (>25h).
  await registerWatchdog(boss);
  log.info("[hq-worker] hq-watchdog scheduled (*/5 * * * *)");

  // ── Register hq-owner-send queue (BD3-04) ────────────────────────────────
  // Processes HQD owner B2B WhatsApp sends through the gate-ordered
  // sendOwnerMessage orchestrator (BD3-03). Uses mockHqWabaClient when HQ WABA
  // credentials are absent (deferred-on-external-dependency, D-13): live sends
  // are enabled once the operator sets HQ_WABA_PHONE_NUMBER_ID + HQ_WABA_API_TOKEN
  // as Fly secrets (after Meta Business Manager phone number registration).
  const wabaClient =
    env.HQ_WABA_PHONE_NUMBER_ID && env.HQ_WABA_API_TOKEN
      ? createHqWabaClient(env.HQ_WABA_PHONE_NUMBER_ID, env.HQ_WABA_API_TOKEN)
      : mockHqWabaClient; // deferred-on-external-dependency (D-13)
  await registerOwnerSend(boss, wabaClient);
  log.info("[hq-worker] hq-owner-send queue registered");

  // ── /healthz admin server — Fly http_check probes this on PORT 3003 ───────
  // Contract matches services/worker (/healthz → { ok, version, app })
  // so the same Fly health-check config works for both services.
  const admin = new Hono();
  admin.get("/healthz", (c) =>
    c.json({ ok: true, version: env.GIT_SHA, app: "hq-worker" }),
  );

  serve({ fetch: admin.fetch, port: env.PORT }, (info) => {
    log.info({ port: info.port }, "[hq-worker] admin healthz listening");
  });
}

main().catch((err) => {
  console.error("[hq-worker] fatal", err);
  process.exit(1);
});
