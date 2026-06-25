import { afterEach, describe, expect, it, vi } from "vitest";
import { isEnvVarWriteAllowed } from "./env-var-writes.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW = process.env.AGENT_NATIVE_ALLOW_ENV_VAR_WRITES;
const ORIGINAL_MULTI_TENANT = process.env.AGENT_NATIVE_MULTI_TENANT;

describe("isEnvVarWriteAllowed", () => {
  afterEach(() => {
    restoreEnv("NODE_ENV", ORIGINAL_NODE_ENV);
    restoreEnv("AGENT_NATIVE_ALLOW_ENV_VAR_WRITES", ORIGINAL_ALLOW);
    restoreEnv("AGENT_NATIVE_MULTI_TENANT", ORIGINAL_MULTI_TENANT);
    vi.unstubAllEnvs();
  });

  // GymClassOS fork: single-tenant-per-deploy is the default. Upstream
  // multi-tenant SaaS behaviour is gated behind AGENT_NATIVE_MULTI_TENANT=true.
  it("allows env-var writes in production by default (single-tenant fork)", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isEnvVarWriteAllowed()).toBe(true);
  });

  it("refuses request-time env writes in production when AGENT_NATIVE_MULTI_TENANT=true, even with the opt-in flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AGENT_NATIVE_MULTI_TENANT", "true");
    vi.stubEnv("AGENT_NATIVE_ALLOW_ENV_VAR_WRITES", "1");

    expect(isEnvVarWriteAllowed()).toBe(false);
  });

  it("allows explicit non-production single-tenant opt-in under multi-tenant mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AGENT_NATIVE_MULTI_TENANT", "true");
    vi.stubEnv("AGENT_NATIVE_ALLOW_ENV_VAR_WRITES", "1");

    expect(isEnvVarWriteAllowed()).toBe(true);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
