// hq-worker entrypoint (BD1 skeleton — BD2 adds the provisioning saga queues)
//
// Responsibilities (BD1):
//   1. Validate env (DATABASE_URL_UNPOOLED → HQ Neon, PITFALL #1)
//   2. Boot pg-boss against the HQ Neon (auto-creates pgboss.* schema on first start)
//   3. Serve /healthz on PORT 3003 — the Fly http_check probes this endpoint
//
// BD2 adds: provision-studio queue + brain-ingest queue + provisioning saga workers.
// The boot sequence is kept identical to services/worker so the /healthz contract
// is preserved when the Fly health check passes on deploy.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getBoss } from "./boss.js";
import { getEnv } from "./lib/env.js";
import { getLogger } from "./lib/logger.js";

async function main() {
  const env = getEnv();
  const log = getLogger();
  log.info({ version: env.GIT_SHA }, "[hq-worker] booting");

  const boss = getBoss();
  boss.on("error", (err) => log.error({ err }, "[pgboss] error"));

  await boss.start();
  log.info("[pgboss] started — HQ Neon schema migration auto-applied");

  // BD1: no domain queues yet.
  // BD2 adds: provision-studio, brain-ingest (+ their createQueue calls here).

  log.info("[hq-worker] pg-boss ready — no domain queues in BD1 skeleton");

  // /healthz admin server — Fly http_check probes this on PORT 3003.
  // The endpoint contract matches services/worker (/healthz → { ok, version, app })
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
