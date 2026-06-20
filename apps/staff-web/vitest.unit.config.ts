import { defineConfig } from "vitest/config";

/**
 * Standalone Vitest config for pure, dependency-free unit tests under
 * `app/lib/**`, `shared/**`, and `actions/**` that do NOT need the app's full
 * vite.config.ts (which pulls in the @agent-native/core vite plugin + framework
 * runtime — which fails with "module is not defined" for CJS React in ESM vitest).
 *
 * Action tests must only import pure exported helpers from action files (not the
 * `defineAction` wrapper itself) — see create-checkout-link.test.ts as the
 * established pattern.
 *
 * BD3-04 decision: extended to include actions/**\/*.test.ts so brain-init and
 * similar action helper tests can run without a dev server.
 *
 * Run with:  npx vitest run --config vitest.unit.config.ts
 *
 * The default `vitest --run` (which loads vite.config.ts) remains the runner
 * for component/integration tests in a fully-built environment.
 */
export default defineConfig({
  test: {
    include: [
      "app/lib/**/*.test.ts",
      "shared/**/*.test.ts",
      "actions/**/*.test.ts",
      "server/lib/**/*.test.ts",
    ],
  },
});
