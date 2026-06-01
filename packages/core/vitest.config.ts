/**
 * Per-package vitest config for `@agent-native/core` unit tests.
 *
 * The root `vitest.config.ts` at the workspace root restricts test discovery
 * to `tests/integration/**` (GymClassOS cross-app smoke tests). Without this
 * local override, `pnpm --filter @agent-native/core test` inherits the root
 * config and finds no spec files. This file restores upstream behaviour: any
 * `*.spec.{ts,tsx}` under `src/`.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
  },
});
