/**
 * packages/hq-schema/src/telemetry.test.ts
 *
 * TelemetrySnapshot Zod schema — PII rejection + validation tests.
 *
 * These tests prove the structural PII-up boundary (D-04 / D-06):
 * the HQ ingest endpoint uses `.strict()` so any unknown field — including
 * member names, emails, or phones — is rejected at parse time, never stored.
 *
 * Run: pnpm --filter @gymos/hq-schema test -- telemetry
 */

import { describe, it, expect } from "vitest";
import { TelemetrySnapshot } from "./telemetry.js";

/** A valid, fully-populated TelemetrySnapshot payload. */
const validSnapshot = {
  studioId: "gymos-demo",
  periodStart: "2026-06-18T00:00:00.000Z",
  periodEnd: "2026-06-18T23:59:59.999Z",
  llmInputTokens: 12_500,
  llmOutputTokens: 3_200,
  llmRequestCount: 47,
  activeMembers: 260,
  bookings: 423,
  messagesSent: 90,
  mobileEngagement: 180,
  retentionRate: 0.87,
};

describe("TelemetrySnapshot", () => {
  it("accepts a valid aggregate snapshot with all required fields", () => {
    const result = TelemetrySnapshot.strict().safeParse(validSnapshot);
    expect(result.success).toBe(true);
  });

  it("rejects a payload that contains member_email (PII field)", () => {
    const withPii = { ...validSnapshot, member_email: "alice@example.com" };
    const result = TelemetrySnapshot.strict().safeParse(withPii);
    expect(result.success).toBe(false);
  });

  it("rejects a payload that contains memberName (PII field)", () => {
    const withPii = { ...validSnapshot, memberName: "Bob Smith" };
    const result = TelemetrySnapshot.strict().safeParse(withPii);
    expect(result.success).toBe(false);
  });

  it("rejects a snapshot missing a required token count field", () => {
    const { llmRequestCount: _omitted, ...missing } = validSnapshot;
    const result = TelemetrySnapshot.strict().safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects negative token counts (nonnegative constraint)", () => {
    const invalid = { ...validSnapshot, llmInputTokens: -1 };
    const result = TelemetrySnapshot.strict().safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a retentionRate outside the 0..1 range", () => {
    const invalid = { ...validSnapshot, retentionRate: 1.5 };
    const result = TelemetrySnapshot.strict().safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer token counts", () => {
    const invalid = { ...validSnapshot, llmInputTokens: 12.5 };
    const result = TelemetrySnapshot.strict().safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
