import { Hono } from "hono";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { stripeRoutes } from "./routes/stripe.js";
import { metaLeadRoutes } from "./routes/meta-lead.js";
import { getEnv } from "./lib/env.js";

export function buildApp() {
  const app = new Hono();

  // Lightweight request log so inbound webhook traffic is visible in Fly logs.
  // Without this, a Meta POST that fails HMAC verification 401s silently and
  // leaves no trace (see WHATSAPP_HANDOFF.md debugging notes). Health checks
  // are noisy and uninteresting, so skip /healthz.
  app.use("*", async (c, next) => {
    const log = c.req.path !== "/healthz";
    if (log) console.log(`[req] ${c.req.method} ${c.req.path}`);
    await next();
    if (log)
      console.log(`[req] ${c.req.method} ${c.req.path} -> ${c.res.status}`);
  });

  app.get("/healthz", (c) => {
    const env = getEnv();
    return c.json({ ok: true, version: env.GIT_SHA, app: "edge-webhooks" });
  });

  app.route("/webhooks", whatsappRoutes);
  app.route("/webhooks", stripeRoutes);
  app.route("/webhooks", metaLeadRoutes);

  return app;
}
