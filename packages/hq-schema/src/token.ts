/**
 * packages/hq-schema/src/token.ts
 *
 * Per-studio telemetry token helpers (D-05).
 *
 * Originally in apps/hq/server/lib/telemetry-token.ts (BD2-04).
 * Moved here so services/hq-worker (which has rootDir restricted to src/)
 * can import without a cross-package relative path that violates rootDir.
 *
 * apps/hq/server/lib/telemetry-token.ts re-exports from this module to
 * maintain backward compatibility with existing imports.
 *
 * HQ stores ONLY the sha256 hash in hq_studio_tokens; the studio holds the
 * plaintext (set as a studio-side secret by the provisioning saga, BD2-05).
 *
 * Exports:
 *   hashToken(plain)         — sha256 hex of a plaintext token string.
 *   generateTelemetryToken() — cryptographically-random 48-char base64url token.
 */

import { createHash, randomBytes } from "crypto";

/**
 * Compute the SHA-256 hex digest of a plaintext token.
 *
 * Used at ingest time: hash the incoming bearer token and look it up in
 * hq_studio_tokens.token_hash. Token comparison is thus index-equality on the
 * hash — no timing-sensitive string comparison needed (SQL = is constant-time
 * for a fixed-length hex column).
 */
export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Generate a cryptographically-random per-studio telemetry bearer token.
 *
 * Uses Node's crypto.randomBytes for CSPRNG output. The 36 random bytes
 * produce a 48-character base64url string (ceil(36 * 4/3) = 48), which gives
 * ~288 bits of entropy — well above the 128-bit minimum for secret tokens.
 *
 * BD2-05 Step 7 calls this once per studio, stores hashToken(token) in
 * hq_studio_tokens, and sets the plaintext as the studio's
 * STUDIO_TELEMETRY_TOKEN secret (Vercel env + Fly secret).
 */
export function generateTelemetryToken(): string {
  return randomBytes(36).toString("base64url");
}
