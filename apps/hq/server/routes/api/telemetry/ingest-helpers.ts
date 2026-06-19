/**
 * apps/hq/server/routes/api/telemetry/ingest-helpers.ts
 *
 * Pure business-logic helpers for the telemetry ingest endpoint.
 *
 * No H3 / @agent-native/core imports — importable in unit tests without
 * a dev server (same pattern as auth-helpers.ts).
 *
 * Exports used by the ingest handler (index.post.ts) and by tests:
 *   extractBearerToken  — extract the token string from an Authorization header
 *   hashToken           — SHA-256 hex of a plaintext string
 *   isTokenRowValid     — check token row exists and is not revoked
 *   parseTelemetryBody  — TelemetrySnapshot.strict().safeParse (rejects PII)
 *   buildIngestPayload  — build the snapshot + tokenUsage upsert payloads
 */

import { createHash, randomBytes } from "crypto";
import { TelemetrySnapshot } from "@gymos/hq-schema/telemetry";

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Extract the plaintext bearer token from an Authorization header string.
 * Returns null when the header is absent, empty, or not a Bearer scheme.
 */
export function extractBearerToken(
  authHeader: string | undefined,
): string | null {
  if (!authHeader) return null;
  const lower = authHeader.toLowerCase();
  if (!lower.startsWith("bearer ")) return null;
  const token = authHeader.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Compute the SHA-256 hex digest of a plaintext token string.
 *
 * Token comparison is done in SQL as a hash equality lookup (SELECT WHERE
 * token_hash = ?), which is inherently constant-time for a fixed-length hex
 * column. Direct string comparison of tokens is never needed.
 */
export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

// ---------------------------------------------------------------------------
// Token row validation
// ---------------------------------------------------------------------------

export interface TokenRow {
  studioId:  string;
  tokenHash: string;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Returns true only when the token row exists and is not revoked.
 * The SQL WHERE already filters on `revokedAt IS NULL`, but an extra runtime
 * check ensures correctness even if the query result is passed in from tests.
 */
export function isTokenRowValid(row: TokenRow | null | undefined): boolean {
  if (!row) return false;
  if (row.revokedAt != null) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Body parsing (PII wall — TEL-04 / D-04 / Pitfall P-06)
// ---------------------------------------------------------------------------

/**
 * Parse the request body with TelemetrySnapshot.strict().
 *
 * Returns a Zod SafeParseReturnType. On failure (unknown/PII field), the caller
 * should return HTTP 422. The `.strict()` call ensures any field outside the
 * allow-list — including `member_email`, `memberPhone`, `database_url`, etc. —
 * is rejected structurally (not silently stored).
 *
 * CRITICAL: This MUST use `.strict()`. Without it, PII fields are silently
 * accepted and persisted (Pitfall P-06).
 */
export function parseTelemetryBody(body: unknown) {
  return TelemetrySnapshot.strict().safeParse(body);
}

// ---------------------------------------------------------------------------
// Ingest payload builder (anti-spoof: studioId from token row, not body)
// ---------------------------------------------------------------------------

export interface IngestPayload {
  snapshot: {
    id: string;
    studioId: string;
    periodStart: string;
    periodEnd: string;
    payloadJson: string;
    receivedAt: string;
    lastTelemetryReceivedAt: string;
  };
  tokenUsage: {
    studioId: string;
    date: string;
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
    updatedAt: string;
  };
}

/**
 * Build the upsert payloads for hq_telemetry_snapshots and hq_token_usage.
 *
 * CRITICAL ANTI-SPOOFING RULE: the `studioId` written to the DB MUST come from
 * `tokenRow.studioId` (the row authenticated by the bearer token hash lookup).
 * Never use `snap.studioId` from the body for the FK write — a compromised
 * studio could otherwise inject fake telemetry for another studio.
 *
 * @param snap     — The parsed TelemetrySnapshot (body, already .strict()-validated)
 * @param tokenRow — The hq_studio_tokens row authenticated via the bearer hash
 * @param nanoidFn — Optional ID generator (defaults to 21-char nanoid for tests)
 */
export function buildIngestPayload(
  snap: ReturnType<typeof TelemetrySnapshot.parse>,
  tokenRow: TokenRow,
  nanoidFn?: () => string,
): IngestPayload {
  const id = nanoidFn ? nanoidFn() : generateId();
  const now = new Date().toISOString();
  const studioId = tokenRow.studioId;   // ← ALWAYS from the token row, never snap.studioId

  return {
    snapshot: {
      id,
      studioId,
      periodStart: snap.periodStart,
      periodEnd:   snap.periodEnd,
      payloadJson: JSON.stringify(snap),
      receivedAt:  now,
      lastTelemetryReceivedAt: now,
    },
    tokenUsage: {
      studioId,
      date:         snap.periodEnd.slice(0, 10),  // "2026-06-18T..." → "2026-06-18"
      inputTokens:  snap.llmInputTokens,
      outputTokens: snap.llmOutputTokens,
      requestCount: snap.llmRequestCount,
      updatedAt:    now,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a 21-character random base62-ish ID using Node crypto. */
function generateId(): string {
  const chars =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(21);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
