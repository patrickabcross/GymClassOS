/**
 * Fly adapter unit tests (TDD — fly.ts execa behaviors).
 *
 * These tests mock `execa` and `getLogger` so they run without:
 *   - A real Fly API token
 *   - A live flyctl binary
 *   - Any real network calls
 *
 * Behaviors verified:
 *   1. setSecrets invokes execa with ARRAY args (not a shell string) — injection safety
 *   2. Logger receives only key NAMES (no "=value" substrings) — Pitfall P-04
 *   3. A secret value containing a shell metacharacter (`;rm -rf`) is passed as a
 *      single array element and is NOT split, proving array-arg injection safety
 */

import { beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";

// ---------- module mocks (hoisted) ----------

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

vi.mock("../logger.js", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------- imports (after mocks) ----------

import { execa as execaMock } from "execa";
import { getLogger } from "../logger.js";
import { createFlyApi } from "./fly.js";

// ---------- helpers ----------

function makeFlyEnv(overrides: Partial<{ FLY_API_TOKEN: string; FLY_ORG_SLUG: string; GYMOS_WORKER_IMAGE: string }> = {}) {
  return {
    FLY_API_TOKEN: "tok_test_org_scoped_1234567890",
    FLY_ORG_SLUG: "gymos",
    GYMOS_WORKER_IMAGE: "registry.fly.io/gymos-worker:latest",
    ...overrides,
  };
}

// ---------- tests ----------

describe("createFlyApi — setSecrets", () => {
  let loggerMock: { info: MockedFunction<(...args: unknown[]) => void> };
  let execaFn: MockedFunction<typeof execaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerMock = getLogger() as unknown as typeof loggerMock;
    execaFn = execaMock as MockedFunction<typeof execaMock>;
  });

  it("Behavior 1: invokes execa with array args (never a shell string)", async () => {
    const api = createFlyApi(makeFlyEnv());

    await api.setSecrets("test-studio", {
      DATABASE_URL: "postgres://user:pass@host/db",
      BETTER_AUTH_SECRET: "secret123",
    });

    expect(execaFn).toHaveBeenCalledOnce();

    // First arg must be the executable name string "flyctl"
    const [executable, args] = execaFn.mock.calls[0] as [string, string[], unknown];
    expect(executable).toBe("flyctl");

    // Second arg must be an ARRAY — not a string (no shell interpolation)
    expect(Array.isArray(args)).toBe(true);

    // Array must contain the subcommands and app name
    expect(args).toContain("secrets");
    expect(args).toContain("set");
    expect(args).toContain("--app");
    expect(args).toContain("gymos-test-studio-worker");
    expect(args).toContain("--stage");

    // Key=value pairs must be individual array elements (not a single string)
    const hasDbUrl = args.some((a: string) => a.startsWith("DATABASE_URL="));
    const hasSecret = args.some((a: string) => a.startsWith("BETTER_AUTH_SECRET="));
    expect(hasDbUrl).toBe(true);
    expect(hasSecret).toBe(true);
  });

  it("Behavior 2: logger receives key NAMES only — no =value substrings", async () => {
    const api = createFlyApi(makeFlyEnv());

    await api.setSecrets("test-studio", {
      DATABASE_URL: "postgres://user:very-secret-pass@host/db",
      STRIPE_SECRET_KEY: "sk_live_abc123xyz",
    });

    // Logger must have been called with the info level
    expect(loggerMock.info).toHaveBeenCalled();

    // Inspect all calls to logger.info — none may contain "=" (key=value separator)
    const allInfoCalls = loggerMock.info.mock.calls;
    for (const call of allInfoCalls) {
      const logObject = call[0] as Record<string, unknown>;

      // The `keys` array must exist and contain only key names (no values)
      if (logObject.keys) {
        const keys = logObject.keys as string[];
        for (const key of keys) {
          expect(key).not.toContain("=");
        }
      }

      // No argument in the call may contain secret values
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain("very-secret-pass");
      expect(callStr).not.toContain("sk_live_abc123xyz");
    }
  });

  it("Behavior 3: shell metacharacter in secret value passed as single element (injection safety)", async () => {
    const api = createFlyApi(makeFlyEnv());

    const maliciousValue = ";rm -rf /;echo pwned";
    await api.setSecrets("test-studio", {
      EVIL_VAR: maliciousValue,
    });

    const [, args] = execaFn.mock.calls[0] as [string, string[], unknown];

    // The malicious value must appear in the args array as a SINGLE element
    // prefixed with "EVIL_VAR=" — proving it is not shell-interpreted
    const evilPair = `EVIL_VAR=${maliciousValue}`;
    expect(args).toContain(evilPair);

    // The malicious value must NOT appear as a separate array element on its own
    // (which would indicate it was incorrectly split on the metacharacter)
    expect(args).not.toContain(";rm -rf /;echo pwned");
    expect(args).not.toContain(";rm");
    expect(args).not.toContain("-rf");
  });
});
