import { serve } from "@hono/node-server";
import { buildApp } from "./server.js";
import { getEnv } from "./lib/env.js";

const env = getEnv(); // fail-fast on bad env
const app = buildApp();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(
    `[edge-webhooks] listening on :${info.port} (version=${env.GIT_SHA})`,
  );
});
