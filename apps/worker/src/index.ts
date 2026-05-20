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
import { getBoss } from "./boss.js";
import { getEnv } from "./lib/env.js";
import { getLogger } from "./lib/logger.js";
import { registerInboundWhatsAppWorker } from "./queues/inbound-whatsapp.js";
import { registerOutboundWhatsAppWorker } from "./queues/outbound-whatsapp.js";
import { registerStripeEventWorker } from "./queues/stripe-event.js";

async function main() {
  const env = getEnv();
  const log = getLogger();
  log.info({ version: env.GIT_SHA }, "[worker] booting");

  const boss = getBoss();
  boss.on("error", (err) => log.error({ err }, "[pgboss] error"));

  await boss.start();
  log.info("[pgboss] started — schema migration auto-applied");

  // Queue registrations — one boss.work() per line. Plan 06 + Plan 07 add
  // outbound-whatsapp + stripe-event registrations alongside this one before
  // the admin server starts.
  await registerInboundWhatsAppWorker(boss);
  log.info("[worker] inbound-whatsapp queue registered");

  await registerOutboundWhatsAppWorker(boss);
  log.info("[worker] outbound-whatsapp queue registered");

  await registerStripeEventWorker(boss);
  log.info("[worker] stripe-event queue registered");

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
