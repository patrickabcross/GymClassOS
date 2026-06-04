import { serve } from "@hono/node-server";
import { startBoss } from "@gymos/queue";
import { buildApp } from "./server.js";
import { getEnv } from "./lib/env.js";

const env = getEnv(); // fail-fast on bad env
const app = buildApp();

// Warm-start the publish-only pg-boss so the first inbound webhook doesn't pay
// the connection cost (and DB/env problems surface at boot, not on first POST).
// Best-effort: if this fails we still serve so /healthz stays up — the enqueue
// path calls startBoss() lazily and will retry per request.
startBoss()
  .then(() => console.log("[edge-webhooks] pg-boss publisher started"))
  .catch((err) =>
    console.error(
      "[edge-webhooks] pg-boss warm-start failed (will retry on first publish)",
      err,
    ),
  );

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(
    `[edge-webhooks] listening on :${info.port} (version=${env.GIT_SHA})`,
  );
});
