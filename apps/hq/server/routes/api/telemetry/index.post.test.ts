/**
 * apps/hq/server/routes/api/telemetry/index.post.test.ts
 *
 * Unit tests for the HQ telemetry ingest business logic.
 *
 * DESIGN CONSTRAINT: No server boot (no-local-dev-server constraint).
 * Tests import pure helpers from ./ingest-helpers.ts which has no H3 /
 * @agent-native/core runtime deps — same pattern as auth.test.ts → auth-helpers.ts.
 *
 * Five behaviours tested (TEL-03..06):
 *   1. Missing bearer token → returns null (caller returns 401)
 *   2. Unknown bearer token (hash not in DB) → returns null (caller returns 401)
 *   3. Valid token but revoked (revokedAt set) → returns null (caller returns 401)
 *   4. Valid token + body with member_email (PII) → parseTelemetryBody returns error (422)
 *   5. Valid token + valid body → buildIngestPayload returns correct upsert data
 *
 * PII boundary (TEL-04 / D-04): test 4 proves `.strict()` rejects PII.
 * studioId from token row (TEL-03 / anti-spoof): test 5 proves studioId is
 *   taken from the token row, never the body.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  extractBearerToken,
  hashToken,
  parseTelemetryBody,
  buildIngestPayload,
  isTokenRowValid,
} from "./ingest-helpers.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_SNAPSHOT = {
  studioId:        "body-studio-id",  // will be IGNORED — taken from token row
  periodStart:     "2026-06-18T00:00:00.000Z",
  periodEnd:       "2026-06-18T23:59:59.999Z",
  llmInputTokens:  12_500,
  llmOutputTokens:  3_200,
  llmRequestCount:  47,
  activeMembers:   260,
  bookings:        423,
  messagesSent:     90,
  mobileEngagement: 180,
  retentionRate:   0.87,
};

const TOKEN_PLAIN = "test-token-plain-abc123";
const TOKEN_HASH  = createHash("sha256").update(TOKEN_PLAIN).digest("hex");

const ACTIVE_TOKEN_ROW = {
  studioId:  "studio-from-db",   // The real studioId — from the token row, not body
  tokenHash: TOKEN_HASH,
  createdAt: "2026-06-18T00:00:00.000Z",
  revokedAt: null as string | null,
};

const REVOKED_TOKEN_ROW = {
  ...ACTIVE_TOKEN_ROW,
  revokedAt: "2026-06-19T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// extractBearerToken
// ---------------------------------------------------------------------------

describe("extractBearerToken", () => {
  it("returns the token string from a valid Bearer header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive for the Bearer prefix", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
    expect(extractBearerToken("BEARER abc123")).toBe("abc123");
  });

  it("returns null when Authorization header is missing", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
  });

  it("returns null when Authorization header is not a Bearer token", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hashToken
// ---------------------------------------------------------------------------

describe("hashToken", () => {
  it("returns the SHA-256 hex digest of the input", () => {
    expect(hashToken(TOKEN_PLAIN)).toBe(TOKEN_HASH);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("is deterministic (same input → same output)", () => {
    expect(hashToken("hello")).toBe(hashToken("hello"));
  });
});

// ---------------------------------------------------------------------------
// isTokenRowValid — Test 2 + 3
// ---------------------------------------------------------------------------

describe("isTokenRowValid", () => {
  // Test 2: no token row
  it("returns false when tokenRow is null (unknown token → 401)", () => {
    expect(isTokenRowValid(null)).toBe(false);
  });

  it("returns false when tokenRow is undefined (unknown token → 401)", () => {
    expect(isTokenRowValid(undefined)).toBe(false);
  });

  // Test 3: revoked token
  it("returns false when tokenRow.revokedAt is set (revoked token → 401)", () => {
    expect(isTokenRowValid(REVOKED_TOKEN_ROW)).toBe(false);
  });

  it("returns true when tokenRow exists and revokedAt is null (active token)", () => {
    expect(isTokenRowValid(ACTIVE_TOKEN_ROW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTelemetryBody — Test 4 (PII rejection)
// ---------------------------------------------------------------------------

describe("parseTelemetryBody — PII rejection via .strict()", () => {
  // Test 4: PII field in body
  it("returns a parse failure when body contains member_email (PII)", () => {
    const withPii = { ...VALID_SNAPSHOT, member_email: "alice@example.com" };
    const result = parseTelemetryBody(withPii);
    expect(result.success).toBe(false);
  });

  it("returns a parse failure when body contains memberPhone (PII)", () => {
    const withPii = { ...VALID_SNAPSHOT, memberPhone: "+44 7700 900000" };
    const result = parseTelemetryBody(withPii);
    expect(result.success).toBe(false);
  });

  it("returns a parse failure when body contains an unknown field", () => {
    const withExtra = { ...VALID_SNAPSHOT, extraField: "should_fail" };
    const result = parseTelemetryBody(withExtra);
    expect(result.success).toBe(false);
  });

  it("returns success for a clean aggregate snapshot", () => {
    const result = parseTelemetryBody(VALID_SNAPSHOT);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildIngestPayload — Test 5 (anti-spoof + last_telemetry_received_at)
// ---------------------------------------------------------------------------

describe("buildIngestPayload — studioId from token row, not body", () => {
  it("uses studioId from the token row (ignores studioId in the body)", () => {
    const result = parseTelemetryBody(VALID_SNAPSHOT);
    if (!result.success) throw new Error("Unexpected parse failure");

    const payload = buildIngestPayload(result.data, ACTIVE_TOKEN_ROW);

    // studioId MUST come from ACTIVE_TOKEN_ROW, not from the body value "body-studio-id"
    expect(payload.snapshot.studioId).toBe(ACTIVE_TOKEN_ROW.studioId);
    expect(payload.snapshot.studioId).toBe("studio-from-db");
    expect(payload.snapshot.studioId).not.toBe("body-studio-id");
  });

  it("sets receivedAt and lastTelemetryReceivedAt to ISO strings", () => {
    const result = parseTelemetryBody(VALID_SNAPSHOT);
    if (!result.success) throw new Error("Unexpected parse failure");

    const before = new Date();
    const payload = buildIngestPayload(result.data, ACTIVE_TOKEN_ROW);
    const after = new Date();

    const receivedAt = new Date(payload.snapshot.receivedAt);
    const lastAt     = new Date(payload.snapshot.lastTelemetryReceivedAt);

    expect(receivedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
    expect(receivedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
    expect(lastAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
  });

  it("builds correct tokenUsage payload with periodEnd date and token counts", () => {
    const result = parseTelemetryBody(VALID_SNAPSHOT);
    if (!result.success) throw new Error("Unexpected parse failure");

    const payload = buildIngestPayload(result.data, ACTIVE_TOKEN_ROW);

    expect(payload.tokenUsage.date).toBe("2026-06-18");   // periodEnd.slice(0, 10)
    expect(payload.tokenUsage.inputTokens).toBe(VALID_SNAPSHOT.llmInputTokens);
    expect(payload.tokenUsage.outputTokens).toBe(VALID_SNAPSHOT.llmOutputTokens);
    expect(payload.tokenUsage.requestCount).toBe(VALID_SNAPSHOT.llmRequestCount);
    expect(payload.tokenUsage.studioId).toBe(ACTIVE_TOKEN_ROW.studioId);
  });
});
