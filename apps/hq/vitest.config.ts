// apps/hq/vitest.config.ts
//
// Vitest config for apps/hq server-side unit tests.
//
// Scope: pure-function tests in server/** that require no browser, no
// react-router plugin, and no dev server (P1c constraint). Examples:
//   - studio-health.test.ts (classification engine — pure TS, no DB)
//
// The react-router vite.config.ts is intentionally NOT used here — it
// configures the SSR build, not the test runner. Mixing the react-router
// plugin with vitest causes preamble-detection errors for pure TS tests.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only match server-side unit tests, not browser/route tests.
    include: ["server/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Needed so that @gymos/hq-schema subpath exports resolve in tests.
    conditions: ["import", "default"],
  },
});
