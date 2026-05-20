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
 *   - Unknown error → re-throw so pg-boss retries (transient assumption).
 *   - Success → sendMessage already wrote status='sent' + external_id.
 *
 * NOTE on pg-boss v12: D-14's literal "teamSize=1" maps to
 * batchSize=1 + localConcurrency=1 (v12 dropped v11's teamSize/teamConcurrency
 * keys from WorkOptions — see Plan 05 SUMMARY).
 */
export async function registerOutboundWhatsAppWorker(boss: PgBoss) {
  const log = getLogger();

  await boss.work(
    QUEUE_NAMES.OUTBOUND_WHATSAPP,
    { batchSize: 1, localConcurrency: 1 }, // D-14: concurrency=1
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
        // Unknown error → re-throw, pg-boss retries up to retryLimit (D-13).
        log.error(
          { err, messageId: data.messageId },
          "[outbound-whatsapp] transient error",
        );
        throw err;
      }
    },
  );
}
