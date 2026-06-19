/**
 * packages/hq-schema/src/telemetry.ts
 *
 * Canonical TelemetrySnapshot Zod schema — shared between the studio-side
 * telemetry push job (services/worker) and the HQ ingest endpoint (apps/hq).
 *
 * PII-up boundary (D-04 / D-06):
 *   This schema is an ALLOW-LIST of aggregate counts, rates, and timestamps
 *   only. Member names, emails, phone numbers, message content, and any other
 *   personally identifiable fields are structurally absent.
 *
 *   The ingest endpoint MUST call `.strict()` at parse time so any unknown
 *   field (including future PII fields added by mistake) is rejected with
 *   HTTP 422 rather than silently accepted and stored. Tests in
 *   telemetry.test.ts prove this behaviour.
 *
 *   The schema itself is exported WITHOUT `.strict()` to stay composable —
 *   consumers (ingest endpoint, push job serialiser) can add `.strict()`
 *   at their boundary. Do NOT call `.strict()` here.
 *
 * Field guide:
 *   Identity
 *     studioId        — opaque studio slug (no member identifiers)
 *     periodStart     — ISO 8601 UTC timestamp for period start
 *     periodEnd       — ISO 8601 UTC timestamp for period end
 *
 *   LLM token usage (aggregate, from studio token_usage table)
 *     llmInputTokens  — total input tokens consumed in the period
 *     llmOutputTokens — total output tokens consumed in the period
 *     llmRequestCount — total Anthropic API requests in the period
 *
 *   Engagement metrics (aggregate counts only — no individual identifiers)
 *     activeMembers   — distinct members with at least one booking in period
 *     bookings        — total class bookings confirmed in period
 *     messagesSent    — total outbound WhatsApp messages sent in period
 *     mobileEngagement — proxy for mobile-app opens / activity in period
 *
 *   Retention metric
 *     retentionRate   — fraction 0..1 (e.g. 0.87 = 87% retained)
 *                       Computed over the lookback window agreed at planning.
 */

import { z } from "zod";

export const TelemetrySnapshot = z.object({
  // ── Identity ────────────────────────────────────────────────────────────────
  /** Opaque studio identifier — the studio slug, never a member identifier. */
  studioId: z.string().min(1),

  /** ISO 8601 UTC: start of the reporting period (inclusive). */
  periodStart: z.string().min(1),

  /** ISO 8601 UTC: end of the reporting period (inclusive). */
  periodEnd: z.string().min(1),

  // ── LLM token usage ─────────────────────────────────────────────────────────
  /** Total Anthropic input tokens consumed in the period. Non-negative integer. */
  llmInputTokens: z.number().int().nonnegative(),

  /** Total Anthropic output tokens generated in the period. Non-negative integer. */
  llmOutputTokens: z.number().int().nonnegative(),

  /** Total Anthropic API request calls in the period. Non-negative integer. */
  llmRequestCount: z.number().int().nonnegative(),

  // ── Engagement aggregates ────────────────────────────────────────────────────
  /** Count of distinct members with at least one booking in the period. */
  activeMembers: z.number().int().nonnegative(),

  /** Total class bookings confirmed in the period. */
  bookings: z.number().int().nonnegative(),

  /** Total outbound WhatsApp messages sent in the period. */
  messagesSent: z.number().int().nonnegative(),

  /** Proxy for mobile-app engagement (e.g. session count) in the period. */
  mobileEngagement: z.number().int().nonnegative(),

  // ── Retention metric ─────────────────────────────────────────────────────────
  /**
   * Fraction of members retained over the lookback window (0 to 1 inclusive).
   * Example: 0.87 = 87% retained. Not a percentage — do not multiply by 100.
   */
  retentionRate: z.number().min(0).max(1),
});

/**
 * TypeScript type inferred from the TelemetrySnapshot schema.
 *
 * Use this type for the studio-side snapshot builder and HQ-side ingest handler.
 * The ingest handler should use `TelemetrySnapshot.strict().safeParse(body)` to
 * reject any unknown / PII field at the HTTP boundary.
 */
export type TelemetrySnapshotInput = z.infer<typeof TelemetrySnapshot>;
