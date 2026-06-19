/**
 * Mock implementations of NeonApi, VercelApi, and FlyApi for unit tests.
 *
 * All methods are vi.fn() stubs with sensible default resolved values.
 * The saga tests in BD2-05 use `makeMockApis()` to get a fresh mock bag
 * per test — avoiding state bleed between tests.
 *
 * Per BD2-RESEARCH Pattern 9 (verbatim + helper function).
 *
 * Usage:
 *   const apis = makeMockApis();
 *   (apis.neon.createProject as vi.MockedFunction<...>).mockResolvedValueOnce(...)
 */

import { vi } from "vitest";
import type { FlyApi, NeonApi, ProvisionApis, VercelApi } from "../../lib/provision-apis/types.js";

// ---------- NeonApi mock ----------

export const mockNeonApi: NeonApi = {
  findProjectBySlug: vi.fn().mockResolvedValue(null),
  createProject: vi.fn().mockResolvedValue({
    projectId: "mock-neon-project-123",
    dbUrl: "postgresql://user:pass@mock-pooler.neon.tech/neondb",
    dbUrlUnpooled: "postgresql://user:pass@mock.neon.tech/neondb",
  }),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  getPooledConnectionUri: vi
    .fn()
    .mockResolvedValue(
      "postgresql://user:pass@mock-pooler.neon.tech/neondb",
    ),
};

// ---------- VercelApi mock ----------

export const mockVercelApi: VercelApi = {
  findProjectBySlug: vi.fn().mockResolvedValue(null),
  createProject: vi.fn().mockResolvedValue({ projectId: "mock-vercel-proj-456" }),
  setEnvVars: vi.fn().mockResolvedValue(undefined),
  deploy: vi.fn().mockResolvedValue({ deployId: "mock-deploy-789" }),
  waitForDeploy: vi.fn().mockResolvedValue(undefined),
  attachDomain: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
};

// ---------- FlyApi mock ----------

export const mockFlyApi: FlyApi = {
  appExists: vi.fn().mockResolvedValue(false),
  createApp: vi.fn().mockResolvedValue(undefined),
  setSecrets: vi.fn().mockResolvedValue(undefined),
  createMachine: vi
    .fn()
    .mockResolvedValue({ machineId: "mock-machine-abc" }),
  waitForMachineStart: vi.fn().mockResolvedValue(undefined),
  deleteApp: vi.fn().mockResolvedValue(undefined),
};

// ---------- factory ----------

/**
 * Returns a fresh ProvisionApis bag of vi.fn() mocks.
 *
 * Call once per test (or beforeEach) so mock state doesn't bleed between tests.
 * Spread the result to override specific methods:
 *
 * @example
 * const apis = makeMockApis();
 * vi.mocked(apis.neon.createProject).mockResolvedValueOnce({
 *   projectId: "specific-id",
 *   dbUrl: "postgres://...",
 *   dbUrlUnpooled: "postgres://...",
 * });
 */
export function makeMockApis(): ProvisionApis {
  return {
    neon: {
      findProjectBySlug: vi.fn().mockResolvedValue(null),
      createProject: vi.fn().mockResolvedValue({
        projectId: "mock-neon-project-123",
        dbUrl: "postgresql://user:pass@mock-pooler.neon.tech/neondb",
        dbUrlUnpooled: "postgresql://user:pass@mock.neon.tech/neondb",
      }),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      getPooledConnectionUri: vi
        .fn()
        .mockResolvedValue(
          "postgresql://user:pass@mock-pooler.neon.tech/neondb",
        ),
    },
    vercel: {
      findProjectBySlug: vi.fn().mockResolvedValue(null),
      createProject: vi
        .fn()
        .mockResolvedValue({ projectId: "mock-vercel-proj-456" }),
      setEnvVars: vi.fn().mockResolvedValue(undefined),
      deploy: vi.fn().mockResolvedValue({ deployId: "mock-deploy-789" }),
      waitForDeploy: vi.fn().mockResolvedValue(undefined),
      attachDomain: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockResolvedValue(undefined),
    },
    fly: {
      appExists: vi.fn().mockResolvedValue(false),
      createApp: vi.fn().mockResolvedValue(undefined),
      setSecrets: vi.fn().mockResolvedValue(undefined),
      createMachine: vi
        .fn()
        .mockResolvedValue({ machineId: "mock-machine-abc" }),
      waitForMachineStart: vi.fn().mockResolvedValue(undefined),
      deleteApp: vi.fn().mockResolvedValue(undefined),
    },
  };
}
