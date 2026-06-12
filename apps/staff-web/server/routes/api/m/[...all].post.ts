// Catch-all POST handler for /api/m/* routes (same rationale as [...all].get.ts).
import { createH3SSRHandler } from "@agent-native/core/server/ssr-handler";

export default createH3SSRHandler(
  () => import("virtual:react-router/server-build"),
);
