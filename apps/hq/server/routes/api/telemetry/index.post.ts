/**
 * apps/hq/server/routes/api/telemetry/index.post.ts
 *
 * HQ telemetry ingest endpoint — POST /api/telemetry
 *
 * TEL-03: studio-side push job POSTs here with a per-studio bearer token.
 * TEL-04: strict Zod parse → HTTP 422 on any unknown/PII field.
 * TEL-05: records last_telemetry_received_at per studio.
 * TEL-06: HQ never accepts or stores a studio connection string.
 *
 * Auth flow (D-05):
 *   1. Extract bearer token from Authorization header (→ 401 if missing).
 *   2. SHA-256 hash it, look up in hq_studio_tokens WHERE revokedAt IS NULL.
 *      → 401 if not found or revoked.
 *   3. Use tokenRow.studioId for every FK write — NEVER the body's studioId
 *      (anti-spoof: a compromised studio must not inject into another studio).
 *
 * PII boundary (D-04 / D-06):
 *   parseTelemetryBody() calls TelemetrySnapshot.strict().safeParse(), which
 *   rejects any field outside the aggregate allow-list (counts, rates, timestamps).
 *   member_email, memberPhone, etc. all return 422.
 *
 * This route must be in publicPaths (apps/hq/server/plugins/auth.ts) because
 * it is server-to-server authenticated via the per-studio bearer token, not by
 * a Better-auth session cookie.
 */

// guard:allow-unscoped — server-to-server ingest: studioId resolved from the
// authenticated token row before any DB write; no ownable-resource table access.

import { and, eq, isNull, sql } from "drizzle-orm";
import {
  createError,
  defineEventHandler,
  getHeader,
} from "h3";
import { readBody } from "@agent-native/core/server";
import { getDb, schema } from "../../../db/index.js";
import {
  extractBearerToken,
  hashToken,
  isTokenRowValid,
  parseTelemetryBody,
  buildIngestPayload,
} from "./ingest-helpers.js";

export default defineEventHandler(async (event) => {
  // ── 1. Extract bearer token ─────────────────────────────────────────────
  const authHeader = getHeader(event, "authorization");
  const token = extractBearerToken(authHeader);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Missing bearer token" });
  }

  // ── 2. Hash and look up in hq_studio_tokens ─────────────────────────────
  // SQL WHERE already filters revokedAt IS NULL — double-checked by isTokenRowValid.
  const tokenHash = hashToken(token);
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.hqStudioTokens)
    .where(
      and(
        eq(schema.hqStudioTokens.tokenHash, tokenHash),
        isNull(schema.hqStudioTokens.revokedAt),
      ),
    );

  const tokenRow = rows[0] ?? null;
  if (!isTokenRowValid(tokenRow)) {
    throw createError({ statusCode: 401, statusMessage: "Invalid or revoked token" });
  }

  // ── 3. Parse body with strict Zod (PII wall — TEL-04) ───────────────────
  const body = await readBody(event);
  const parsed = parseTelemetryBody(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: "Invalid telemetry body",
      data: parsed.error,
    });
  }

  // ── 4. Build upsert payloads ─────────────────────────────────────────────
  // studioId is ALWAYS from tokenRow, never from the body (anti-spoof).
  const { snapshot, tokenUsage } = buildIngestPayload(parsed.data, tokenRow);

  // ── 5. Upsert hq_telemetry_snapshots (UNIQUE studioId + periodStart) ────
  // On re-push: update payloadJson and lastTelemetryReceivedAt (TEL-05).
  await db
    .insert(schema.hqTelemetrySnapshots)
    .values(snapshot)
    .onConflictDoUpdate({
      target: [
        schema.hqTelemetrySnapshots.studioId,
        schema.hqTelemetrySnapshots.periodStart,
      ],
      set: {
        payloadJson:              sql`excluded.payload_json`,
        lastTelemetryReceivedAt:  sql`excluded.last_telemetry_received_at`,
      },
    });

  // ── 6. Upsert hq_token_usage (PK studioId + date), accumulate counts ────
  // Uses SQL expressions to accumulate into existing row rather than overwrite.
  await db
    .insert(schema.hqTokenUsage)
    .values(tokenUsage)
    .onConflictDoUpdate({
      target: [schema.hqTokenUsage.studioId, schema.hqTokenUsage.date],
      set: {
        inputTokens:  sql`hq_token_usage.input_tokens  + excluded.input_tokens`,
        outputTokens: sql`hq_token_usage.output_tokens + excluded.output_tokens`,
        requestCount: sql`hq_token_usage.request_count + excluded.request_count`,
        updatedAt:    sql`excluded.updated_at`,
      },
    });

  return { ok: true };
});
