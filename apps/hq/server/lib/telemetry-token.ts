/**
 * apps/hq/server/lib/telemetry-token.ts
 *
 * Per-studio telemetry token helpers (D-05).
 *
 * Re-exports from @gymos/hq-schema/token so that services/hq-worker
 * can import these helpers without crossing the rootDir boundary.
 * (BD2-05: moved canonical implementation to packages/hq-schema/src/token.ts)
 *
 * HQ stores ONLY the sha256 hash in hq_studio_tokens; the studio holds the
 * plaintext (set as a studio-side secret by the provisioning saga, BD2-05).
 *
 * Exports:
 *   hashToken(plain)         — sha256 hex of a plaintext token string.
 *   generateTelemetryToken() — cryptographically-random 48-char base64url token.
 */

export { hashToken, generateTelemetryToken } from "@gymos/hq-schema/token";
