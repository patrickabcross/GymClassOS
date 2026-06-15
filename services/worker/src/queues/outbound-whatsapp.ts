import type { PgBoss } from "pg-boss";
import { eq } from "drizzle-orm";
import { QUEUE_NAMES, OutboundWhatsAppPayload } from "@gymos/queue";
import { getDb, schema } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
import { sendMessage } from "../domain/sendMessage.js";
import {
  NoOptInError,
  WindowExpiredError,
  TemplateNotApprovedError,
} from "../lib/errors.js";

/**
 * Register the pg-boss subscriber for the `outbound-whatsapp` queue (D-10).
 *
 * Per D-14: concurrency = 1 for outbound (paces under Meta's 80/sec/phone
 *   cap with headroom; per-job latency 50-200ms → effective ~5-20 sends/sec).
 * Per PITFALL #20 / D-13: producer-side singletonKey 'outbound-whatsapp:msg_<id>'
 *   already dedupes staff retries (set in @gymos/queue/publish.ts).
 * Per D-19: gates are re-checked at this layer even when staff-web pre-gates,
 *   because UI state can be stale.
 *
 * Job lifecycle:
 *   - Typed gate refusals (NoOptInError, WindowExpiredError,
 *     TemplateNotApprovedError) → UPDATE messages.status='failed' with the
 *     typed error code, return normally so pg-boss marks the job complete
 *     (these are TERMINAL — no retry will succeed).
 *   - Unknown error on a NON-final attempt → re-throw so pg-boss retries
 *     (transient assumption); the messages row stays 'queued' between tries.
 *   - Unknown error on the FINAL attempt (retryCount >= retryLimit) → write
 *     messages.status='failed' with a truncated errorCode BEFORE re-throwing,
 *     so the inbox stops lying about an eternal 'queued' once retries are
 *     exhausted (FIX 1 / WA-05). Re-throwing after the write is harmless — it
 *     just lets pg-boss record the job itself as failed and preserves the
 *     existing transient-error log line.
 *   - Success → sendMessage already wrote status='sent' + external_id.
 *
 * NOTE: `includeMetadata: true` is passed to boss.work() so the handler
 * receives JobWithMetadata (carrying retryCount / retryLimit) — required to
 * detect the final attempt. retryLimit defaults to 3 (matching
 * @gymos/queue/publish.ts) if metadata is somehow absent.
 *
 * NOTE on pg-boss v12: D-14's literal "teamSize=1" maps to
 * batchSize=1 + localConcurrency=1 (v12 dropped v11's teamSize/teamConcurrency
 * keys from WorkOptions — see Plan 05 SUMMARY).
 */
export async function registerOutboundWhatsAppWorker(boss: PgBoss) {
  const log = getLogger();

  await boss.work(
    QUEUE_NAMES.OUTBOUND_WHATSAPP,
    // D-14: concurrency=1. includeMetadata exposes retryCount/retryLimit so the
    // catch branch can detect the final attempt (FIX 1).
    { batchSize: 1, localConcurrency: 1, includeMetadata: true },
    async (jobs: any) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      const data = OutboundWhatsAppPayload.parse(job.data);
      const db = getDb();

      try {
        const result = await sendMessage({
          memberId: data.memberId,
          messageId: data.messageId,
          payload: data.payload,
          db,
        });
        log.info(
          { messageId: data.messageId, externalId: result.externalId },
          "[outbound-whatsapp] sent",
        );
      } catch (err) {
        // Gate failures are terminal — mark failed in messages, don't retry.
        // (The 4xx-from-Meta path is handled INSIDE sendMessage, which writes
        //  status='failed' and returns normally; we don't reach here for 4xx.)
        if (
          err instanceof NoOptInError ||
          err instanceof WindowExpiredError ||
          err instanceof TemplateNotApprovedError
        ) {
          const code = (err as { code?: string }).code ?? err.name;
          log.warn(
            { messageId: data.messageId, code, error: err.message },
            "[outbound-whatsapp] gate refused",
          );
          // guard:allow-unscoped — worker writes own state
          await db
            .update(schema.messages)
            .set({ status: "failed", errorCode: code })
            .where(eq(schema.messages.id, data.messageId));
          return; // pg-boss marks job complete — no retry
        }
        // Unknown error → retry up to retryLimit (D-13), but once retries are
        // exhausted mark the row 'failed' so the inbox stops showing an eternal
        // 'queued' (FIX 1 / WA-05). retryCount is the number of retries already
        // performed; on the last allowed run it equals retryLimit.
        const retryCount = Number(job?.retryCount ?? 0);
        const retryLimit = Number(job?.retryLimit ?? 3);

        if (retryCount >= retryLimit) {
          const errorCode = (
            err instanceof Error ? err.message : String(err)
          ).slice(0, 200);
          log.error(
            { messageId: data.messageId, retryCount, retryLimit },
            "[outbound-whatsapp] retries exhausted — marking failed",
          );
          // guard:allow-unscoped — worker writes own state
          await db
            .update(schema.messages)
            .set({ status: "failed", errorCode })
            .where(eq(schema.messages.id, data.messageId));
          // Re-throw so pg-boss still records the job itself as failed
          // (harmless — the row is already 'failed').
          throw err;
        }

        // Non-final attempt → log transient error and re-throw so pg-boss
        // retries. Do NOT touch messages.status here (stays 'queued').
        log.error(
          { err, messageId: data.messageId, retryCount, retryLimit },
          "[outbound-whatsapp] transient error",
        );
        throw err;
      }
    },
  );
}
