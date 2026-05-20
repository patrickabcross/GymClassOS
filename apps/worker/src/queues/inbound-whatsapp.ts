import type { PgBoss } from "pg-boss";
import { eq, and } from "drizzle-orm";
import { QUEUE_NAMES, InboundWhatsAppPayload } from "@gymos/queue";
import { getDb, schema } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
import { upsertConversationAndMessage } from "../domain/conversations.js";
import {
  applyOrdinalStatusUpdate,
  type MessageStatus,
} from "../domain/messageStatus.js";

/**
 * Register the pg-boss subscriber for the `inbound-whatsapp` queue.
 *
 * Per D-14: concurrency = 5 (teamSize 5, teamConcurrency 5).
 * Per HIGH #6: dispatch on the typed `payload.kind` discriminator from
 *   InboundWhatsAppPayload. The receiver (Plan P1b-04) constructed structured
 *   payloads; we read structured fields directly — no synthetic-string
 *   parsing between the receiver↔worker boundary.
 * Per HIGH #4: messages INSERT (in upsertConversationAndMessage) uses
 *   .onConflictDoNothing({ target: externalId }) backed by the partial
 *   UNIQUE index from Plan P1b-02 — race-safe at concurrency=5.
 * Per WA-04 / PITFALL #11 / Blocker #2: status updates use ordinal-guarded
 *   single SQL UPDATE with `updated_at = NOW()`.
 */
export async function registerInboundWhatsAppWorker(boss: PgBoss) {
  const log = getLogger();
  // D-14: concurrency = 5. pg-boss v12 renamed v11's teamSize/teamConcurrency
  // to batchSize (jobs fetched per poll) + localConcurrency (workers per-node).
  // localConcurrency=5 spawns 5 in-process workers; batchSize=5 lets each fetch
  // up to 5 jobs per poll for throughput under burst load. teamSize/teamConcurrency
  // (the plan's literal text) no longer exist on the v12 WorkOptions type.
  await boss.work(
    QUEUE_NAMES.INBOUND_WHATSAPP,
    { batchSize: 5, localConcurrency: 5 },
    async (jobs: any) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      const data = InboundWhatsAppPayload.parse(job.data);
      const db = getDb();

      // HIGH #6: dispatch on the typed discriminator — no synthetic-string
      // parsing across the receiver↔worker boundary.
      if (data.kind === "status") {
        // Status path — read structured fields directly. No webhook_events
        // load needed (the structured payload carries everything we need).
        const result = await applyOrdinalStatusUpdate(
          db,
          data.statusFor, // wamid of the OUTBOUND message
          data.newStatus as MessageStatus, // "sent"|"delivered"|"read"|"failed"
          data.timestamp,
          data.errorCode ?? null,
        );
        log.info(
          {
            statusFor: data.statusFor,
            newStatus: data.newStatus,
            updatedRows: result.updatedRows,
          },
          "[inbound-whatsapp] status update applied",
        );

        // Mark the matching webhook_events row processed (best-effort — the
        // dedup key from Plan 04 receiver is wamid_status_<id>_<ts>_<status>).
        // This is only a bookkeeping marker, NOT routing — the dispatch
        // decision above was made purely on data.kind (HIGH #6).
        // guard:allow-unscoped — webhook processor
        const dedupKey = `wamid_status_${data.statusFor}_${data.timestamp}_${data.newStatus}`;
        await db
          .update(schema.webhookEvents)
          .set({ processedAt: new Date().toISOString() })
          .where(
            and(
              eq(schema.webhookEvents.provider, "whatsapp"),
              eq(schema.webhookEvents.externalId, dedupKey),
            ),
          );
        return;
      }

      // kind === "message" — materialise conversation + message.
      // Try to load the original raw payload from webhook_events; if missing,
      // synthesise a minimal payload from the structured fields.
      // guard:allow-unscoped — webhook processor
      const row = await db
        .select()
        .from(schema.webhookEvents)
        .where(
          and(
            eq(schema.webhookEvents.provider, "whatsapp"),
            eq(schema.webhookEvents.externalId, data.externalId),
          ),
        )
        .limit(1)
        .then((r: any) => r[0]);

      if (row?.processedAt) {
        // Idempotency (success criterion #2): already processed, no-op
        log.info(
          { externalId: data.externalId },
          "[inbound-whatsapp] message already processed — skipping",
        );
        return;
      }

      const inboundMsg = {
        id: data.externalId,
        from: data.from,
        type: data.messageType,
        text: data.body != null ? { body: data.body } : undefined,
        timestamp: data.timestamp,
      };
      const rawPayload =
        row?.payloadRaw ?? JSON.stringify({ synthetic: true, ...data });

      const result = await upsertConversationAndMessage(
        db,
        inboundMsg as any,
        rawPayload,
      );
      log.info(
        {
          externalId: data.externalId,
          processed: result.processed,
          reason: result.reason,
        },
        "[inbound-whatsapp] message materialised",
      );

      // Mark processed (best-effort if row is null — receiver may not have
      // written webhook_events for synthetic-replay paths)
      if (row) {
        // guard:allow-unscoped — webhook processor
        await db
          .update(schema.webhookEvents)
          .set({ processedAt: new Date().toISOString() })
          .where(eq(schema.webhookEvents.id, row.id));
      }
    },
  );
}
