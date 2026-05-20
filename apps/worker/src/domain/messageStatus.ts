import { sql } from "drizzle-orm";
import type { getDb } from "../lib/db.js";

export const STATUS_RANK = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
} as const;

export type MessageStatus = keyof typeof STATUS_RANK;

/**
 * Apply an ordinal-guarded status update to messages.status.
 *
 * Per PITFALL #11 + WA-04: status webhooks arrive out-of-order and
 * at-least-once. We must never DOWNGRADE a status (e.g. delivered → sent).
 * The UPDATE uses a CASE rank guard: only applies when the new rank exceeds
 * the current rank.
 *
 * Idempotent: replaying the same (externalId, status) is a no-op (the
 * WHERE clause fails because new_rank is not strictly greater than current).
 *
 * Writes updated_at = NOW() per Plan 02 Blocker #2 (the column was added in
 * the additive migration; the SET clause is now valid).
 */
export async function applyOrdinalStatusUpdate(
  db: ReturnType<typeof getDb>,
  externalId: string,
  newStatus: MessageStatus,
  timestampUnix: string | number | null,
  errorCode?: string | null,
): Promise<{ updatedRows: number }> {
  const newRank = STATUS_RANK[newStatus];
  if (newRank === undefined) {
    throw new Error(`Unknown message status: ${newStatus}`);
  }

  const timestampISO = timestampUnix
    ? new Date(Number(timestampUnix) * 1000).toISOString()
    : new Date().toISOString();

  // Single UPDATE with rank guard. Uses raw SQL for the CASE expression
  // because Drizzle's typed query builder doesn't easily compose this.
  const result = await db.execute(sql`
    UPDATE messages
    SET status = ${newStatus},
        sent_at      = COALESCE(sent_at,      CASE WHEN ${newStatus} = 'sent'      THEN ${timestampISO} END),
        delivered_at = COALESCE(delivered_at, CASE WHEN ${newStatus} = 'delivered' THEN ${timestampISO} END),
        read_at      = COALESCE(read_at,      CASE WHEN ${newStatus} = 'read'      THEN ${timestampISO} END),
        error_code   = COALESCE(error_code,   CASE WHEN ${newStatus} = 'failed'    THEN ${errorCode ?? null} END),
        updated_at = NOW()
    WHERE external_id = ${externalId}
      AND (
        CASE status
          WHEN 'queued'    THEN 0
          WHEN 'sent'      THEN 1
          WHEN 'delivered' THEN 2
          WHEN 'read'      THEN 3
          WHEN 'failed'    THEN 4
          ELSE -1
        END
      ) < ${newRank}
  `);

  // neon-serverless drizzle returns the underlying pg result on .execute
  const rowCount =
    (result as any)?.rowCount ?? (result as any)?.rows?.length ?? 0;
  return { updatedRows: rowCount };
}
