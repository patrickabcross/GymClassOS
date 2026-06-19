// apps/hq/server/lib/studio-health.ts
//
// HQB deterministic health-classification engine (D-01).
//
// Classifies a studio into a health status and cohort using threshold rules
// over telemetry aggregates from hq_telemetry_snapshots + hq_token_usage.
// No LLM in the trust path — pure TS + named constants from @gymos/hq-schema.
//
// Staleness gate (D-02 / HQB-03):
//   Any studio whose last_telemetry_received_at is null or older than
//   TELEMETRY_STALENESS_HOURS is classified "stale"/"unknown" — NEVER shown
//   as "healthy"/"active". The staleness checks run BEFORE any engagement
//   check so a high-numbers-but-stale studio cannot slip through.
//
// Signals array (D-01 operator auditability):
//   Every tripped signal adds a human-readable reason string so the operator
//   can see *why* a studio is at-risk, not just an opaque status badge.

import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";
import {
  TELEMETRY_STALENESS_HOURS,
  DORMANT_ACTIVE_MEMBERS_THRESHOLD,
  UNDER_MESSAGING_THRESHOLD,
  LOW_RETENTION_THRESHOLD,
  POWER_USER_RETENTION_THRESHOLD,
  POWER_USER_ACTIVE_MEMBERS_THRESHOLD,
  POWER_USER_MESSAGES_THRESHOLD,
} from "@gymos/hq-schema/constants";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Health status of a studio as derived by the classification engine. */
export type HealthStatus =
  | "healthy"
  | "dormant"
  | "under-messaging"
  | "low-retention"
  | "stale"
  | "at-risk";

/**
 * Cohort membership computed from the same deterministic signals (D-04).
 *
 * - "power-user" — high engagement + healthy retention + active messaging
 * - "at-risk"    — dormant OR under-messaging OR low-retention OR stale
 * - "healthy"    — no at-risk signal, below power-user bar
 * - "unknown"    — stale/missing telemetry; cannot be classified
 */
export type CohortMembership = "power-user" | "at-risk" | "healthy" | "unknown";

/**
 * Full classification output returned by classifyStudioHealth().
 *
 * Contains both coarse status/cohort labels and per-signal booleans so the
 * UI can render specific badges and the agent can surface specific insights.
 */
export interface StudioHealthSignals {
  /** Overall health status. */
  status: HealthStatus;

  /** Cohort membership (computed view, not stored). */
  cohort: CohortMembership;

  /**
   * True when last_telemetry_received_at is null or older than
   * TELEMETRY_STALENESS_HOURS. Staleness gates all other signals.
   */
  isStale: boolean;

  /**
   * True when activeMembers < DORMANT_ACTIVE_MEMBERS_THRESHOLD.
   * Only meaningful when isStale is false.
   */
  isDormant: boolean;

  /**
   * True when messagesSent < UNDER_MESSAGING_THRESHOLD.
   * Only meaningful when isStale is false.
   */
  isUnderMessaging: boolean;

  /**
   * True when retentionRate < LOW_RETENTION_THRESHOLD.
   * Only meaningful when isStale is false.
   */
  isLowRetention: boolean;

  /**
   * Human-readable reason strings for each tripped signal.
   * Empty array = no signals tripped = studio is healthy.
   * Used by the operator console to display "why at-risk" detail.
   */
  signals: string[];
}

// ---------------------------------------------------------------------------
// Classification function
// ---------------------------------------------------------------------------

/**
 * Classify a studio's health based on its latest telemetry snapshot and
 * the timestamp of the most recent telemetry push.
 *
 * @param snapshot              - Parsed TelemetrySnapshotInput, or null if
 *                                no snapshot row exists for this studio.
 * @param lastTelemetryReceivedAt - ISO 8601 timestamp of the most recent
 *                                  telemetry push (from hq_telemetry_snapshots
 *                                  via DISTINCT ON studio_id ORDER BY received_at DESC).
 *                                  Null = never received.
 * @param now                   - Reference time for age calculations. Defaults
 *                                to the current wall clock (injectable for tests).
 * @returns StudioHealthSignals  - Immutable classification result.
 */
export function classifyStudioHealth(
  snapshot: TelemetrySnapshotInput | null,
  lastTelemetryReceivedAt: string | null,
  now: Date = new Date(),
): StudioHealthSignals {
  // ── Staleness gate (FIRST — D-02 / HQB-03) ─────────────────────────────
  // A studio with null or stale telemetry is classified "stale"/"unknown"
  // regardless of snapshot data. These checks MUST precede all engagement
  // checks so a high-numbers-but-stale studio cannot appear healthy.

  if (!lastTelemetryReceivedAt) {
    return {
      status: "stale",
      cohort: "unknown",
      isStale: true,
      isDormant: false,
      isUnderMessaging: false,
      isLowRetention: false,
      signals: ["No telemetry received"],
    };
  }

  const ageHours =
    (now.getTime() - new Date(lastTelemetryReceivedAt).getTime()) /
    (1000 * 3600);

  if (ageHours > TELEMETRY_STALENESS_HOURS) {
    return {
      status: "stale",
      cohort: "unknown",
      isStale: true,
      isDormant: false,
      isUnderMessaging: false,
      isLowRetention: false,
      signals: [`Telemetry stale: ${Math.round(ageHours)}h ago`],
    };
  }

  if (!snapshot) {
    return {
      status: "stale",
      cohort: "unknown",
      isStale: true,
      isDormant: false,
      isUnderMessaging: false,
      isLowRetention: false,
      signals: ["No snapshot data"],
    };
  }

  // ── Engagement signal checks ─────────────────────────────────────────────
  // Only reached when telemetry is fresh and a snapshot exists.

  const isDormant = snapshot.activeMembers < DORMANT_ACTIVE_MEMBERS_THRESHOLD;
  const isUnderMessaging = snapshot.messagesSent < UNDER_MESSAGING_THRESHOLD;
  const isLowRetention = snapshot.retentionRate < LOW_RETENTION_THRESHOLD;

  const signals: string[] = [];
  if (isDormant) {
    signals.push(`Low active members (${snapshot.activeMembers})`);
  }
  if (isUnderMessaging) {
    signals.push(`Low messages sent (${snapshot.messagesSent})`);
  }
  if (isLowRetention) {
    signals.push(
      `Low retention (${(snapshot.retentionRate * 100).toFixed(0)}%)`,
    );
  }

  // ── Cohort derivation (D-04) ─────────────────────────────────────────────

  const isAtRisk = isDormant || isUnderMessaging || isLowRetention;

  const isPowerUser =
    !isAtRisk &&
    snapshot.retentionRate >= POWER_USER_RETENTION_THRESHOLD &&
    snapshot.activeMembers >= POWER_USER_ACTIVE_MEMBERS_THRESHOLD &&
    snapshot.messagesSent >= POWER_USER_MESSAGES_THRESHOLD;

  return {
    status: isAtRisk ? "at-risk" : "healthy",
    cohort: isAtRisk ? "at-risk" : isPowerUser ? "power-user" : "healthy",
    isStale: false,
    isDormant,
    isUnderMessaging,
    isLowRetention,
    signals,
  };
}
