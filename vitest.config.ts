/**
 * Root-level Vitest config for the GymClassOS integration suite.
 *
 * SCOPE: this config covers ONLY `tests/integration/**` — the cross-app
 * smoke/integration tests that exercise the live Fly receiver + Neon DB.
 * Per-package unit tests (apps/worker/**, apps/edge-webhooks/**,
 * packages/**) ship their own vitest configs and are run via the
 * `pnpm --filter <pkg> test` chain.
 *
 * Why a separate config:
 *   - These tests are LOCAL-FIRST (gracefully skip without secrets) but
 *     CI-STRICT (fail loudly when secrets are missing in CI — MEDIUM #9).
 *   - They touch network + DB and have a longer timeout than unit tests.
 *   - Including them in a per-package config would either:
 *       (a) silently turn unit-test runs into network-dependent runs, or
 *       (b) accidentally run them under upstream framework test scripts.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
