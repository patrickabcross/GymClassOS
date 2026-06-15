import { defineConfig } from "vitest/config";

/**
 * Standalone Vitest config for pure, dependency-free unit tests under
 * `app/lib/**` and `shared/**` that do NOT need the app's full vite.config.ts
 * (which pulls in the @agent-native/core vite plugin + framework runtime).
 *
 * Run with:  npx vitest run --config vitest.unit.config.ts
 *
 * The default `vitest --run` (which loads vite.config.ts) remains the runner
 * for component/integration tests in a fully-built environment.
 */
export default defineConfig({
  test: {
    include: ["app/lib/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
