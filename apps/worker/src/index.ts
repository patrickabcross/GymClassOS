// PLACEHOLDER — Plan P1b-05 replaces this with the real pg-boss worker
// loop (inbound-whatsapp, stripe-event, class-reminder consumers). For
// now we expose /healthz on port 3002 so Fly's worker-process health
// check (MEDIUM #10 in P1b-04 fly.toml) reports passing immediately,
// allowing fly deploy to validate the two-process topology end-to-end
// before Plan 05 ships the real consumers.
//
// Contract preserved across the replacement:
//  - Binds to env.PORT (default 3002)
//  - GET /healthz returns 200 + JSON { ok: true, version, app: "worker" }

import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/healthz", (c) =>
  c.json({
    ok: true,
    version: process.env.GIT_SHA ?? "stub",
    app: "worker",
    note: "placeholder — see Plan P1b-05 for real worker impl",
  }),
);

const port = Number(process.env.PORT ?? 3002);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `[worker] placeholder healthz listening on :${info.port} — see Plan P1b-05`,
  );
});
