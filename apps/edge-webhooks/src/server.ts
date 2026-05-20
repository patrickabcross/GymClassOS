import { Hono } from "hono";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { stripeRoutes } from "./routes/stripe.js";
import { getEnv } from "./lib/env.js";

export function buildApp() {
  const app = new Hono();

  app.get("/healthz", (c) => {
    const env = getEnv();
    return c.json({ ok: true, version: env.GIT_SHA, app: "edge-webhooks" });
  });

  app.route("/webhooks", whatsappRoutes);
  app.route("/webhooks", stripeRoutes);

  return app;
}
