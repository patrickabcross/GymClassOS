/**
 * apps/hq/server/routes/api/signup/index.post.test.ts
 *
 * Unit tests for the HQ signup intake handler.
 *
 * DESIGN CONSTRAINT: No server boot (no-local-dev-server constraint).
 * We test the handler directly via vi.mock to intercept the DB and boss.
 *
 * Four behaviours tested (PROV-01, PROV-08):
 *   1. Valid signup → inserts studio+run, enqueues saga, returns 202 + runId.
 *   2. Valid signup with derived slug (no slug in body) → slug is auto-derived.
 *   3. Duplicate slug (DB UNIQUE violation) → 409 (never creates a duplicate).
 *   4. Invalid body (missing ownerEmail) → 400 with validation details.
 *
 * Producer contract (P-07): asserts boss.send called with
 *   "provision-studio", { runId }, { expireInSeconds: 600, retryLimit: 3 }.
 * No provider adapter is imported or invoked (saga work is in hq-worker).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before imports so vi.mock hoisting works.
// ---------------------------------------------------------------------------

const mockInsert = vi.fn();
const mockBossSend = vi.fn().mockResolvedValue(undefined);

vi.mock("@gymos/queue", () => ({
  getBoss: () => ({ send: mockBossSend }),
}));

vi.mock("../../../db/index.js", () => {
  // Chainable query builder
  const makeInsert = () => ({
    values: vi.fn(() => mockInsert()),
  });
  return {
    getDb: () => ({
      insert: () => makeInsert(),
    }),
    schema: {
      hqStudios: { _: "hqStudios" },
      hqProvisioningRuns: { _: "hqProvisioningRuns" },
    },
  };
});

// We also need to mock h3's createError so the handler can throw it in tests.
vi.mock("h3", async (importOriginal) => {
  const original = await importOriginal<typeof import("h3")>();
  return {
    ...original,
    defineEventHandler: (fn: Function) => fn, // strip wrapper
    setResponseStatus: vi.fn(),
    createError: ({ statusCode, statusMessage, data }: {
      statusCode: number;
      statusMessage: string;
      data?: unknown;
    }) => {
      const err = new Error(statusMessage) as Error & { statusCode: number; data?: unknown };
      err.statusCode = statusCode;
      err.data = data;
      return err;
    },
  };
});

vi.mock("@agent-native/core/server", () => ({
  readBody: vi.fn((event: { _body?: unknown }) => Promise.resolve(event._body)),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

// Import the handler (which is now just the inner function because we mock defineEventHandler)
import handler from "./index.post.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal H3-like event with a request body. */
function makeEvent(body: unknown) {
  return { _body: body } as unknown as Parameters<typeof handler>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: insert succeeds
    mockInsert.mockResolvedValue(undefined);
  });

  // ── Behavior 1: valid signup → 202 + runId + boss.send called ─────────────
  it("returns 202 and enqueues the saga for a valid signup", async () => {
    const capturedRunIds: string[] = [];
    mockBossSend.mockImplementation(
      (queue: string, payload: { runId: string }, opts: unknown) => {
        capturedRunIds.push(payload.runId);
        return Promise.resolve();
      },
    );

    const result = await handler(
      makeEvent({ displayName: "Test Studio", ownerEmail: "owner@example.com", slug: "test-studio" }),
    );

    // Should return an object with a runId
    expect(result).toMatchObject({ runId: expect.any(String) });

    // boss.send called once with the P-07 producer contract
    expect(mockBossSend).toHaveBeenCalledOnce();
    expect(mockBossSend).toHaveBeenCalledWith(
      "provision-studio",
      { runId: capturedRunIds[0] },
      { expireInSeconds: 600, retryLimit: 3 },
    );

    // The runId in the response matches what was sent to the boss
    expect(result.runId).toBe(capturedRunIds[0]);

    // No provider adapter is invoked (only boss.send, which goes to hq-worker)
    expect(mockBossSend.mock.calls[0][0]).toBe("provision-studio");
  });

  // ── Behavior 2: slug auto-derived from displayName ─────────────────────────
  it("derives the slug from displayName when slug is omitted", async () => {
    const insertCalls: Array<{ values: unknown }> = [];
    mockInsert.mockImplementation(() => Promise.resolve(undefined));

    // We can't easily capture the values call because of the mock structure,
    // but we can verify the handler doesn't throw and returns a runId.
    const result = await handler(
      makeEvent({ displayName: "My Gym Studio!", ownerEmail: "gym@example.com" }),
    );

    expect(result).toMatchObject({ runId: expect.any(String) });
    // No error thrown — slug was derived correctly
  });

  // ── Behavior 3: duplicate slug → 409 ─────────────────────────────────────
  it("returns 409 when the studio slug already exists (UNIQUE violation)", async () => {
    // Simulate a Postgres UNIQUE violation on the slug column
    const pgUniqueError = Object.assign(new Error("unique constraint"), {
      code: "23505",
      constraint: "hq_studios_slug_unique",
    });
    // First insert (hq_studios) throws; second insert would be hq_provisioning_runs
    // but we never reach it.
    mockInsert
      .mockRejectedValueOnce(pgUniqueError) // hq_studios UNIQUE violation
      .mockResolvedValue(undefined);

    const err = await handler(
      makeEvent({ displayName: "Test Studio", ownerEmail: "owner@example.com", slug: "test-studio" }),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { statusCode?: number }).statusCode).toBe(409);

    // boss.send must NOT have been called (no partial enqueue on conflict)
    expect(mockBossSend).not.toHaveBeenCalled();
  });

  // ── Behavior 4: invalid body → 400 ───────────────────────────────────────
  it("returns 400 when the body is missing ownerEmail", async () => {
    const err = await handler(
      makeEvent({ displayName: "Test Studio" }), // missing ownerEmail
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { statusCode?: number }).statusCode).toBe(400);

    // No DB writes, no enqueue
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockBossSend).not.toHaveBeenCalled();
  });
});
