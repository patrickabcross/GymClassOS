/**
 * services/hq-worker/src/queues/hq-owner-send.ts
 *
 * pg-boss queue handler for the "hq-owner-send" queue (HQD-03, BD3-04).
 *
 * Pattern: mirrors registerProvisionStudio — the HqWabaClient is INJECTED so
 * tests can pass mockHqWabaClient without a live Meta WABA connection.
 *
 * Gate ordering is enforced by sendOwnerMessage (BD3-03):
 *   1. hasOwnerOptIn(studioId, db)        → OwnerNoOptInError
 *   2. Load hq_whatsapp_opt_in row        → phone_e164 + last_inbound_at
 *   3. isOwnerInWindow(lastInboundAt)     → OwnerWindowExpiredError (text only)
 *   4. isOwnerTemplateApproved(name, db)  → OwnerTemplateNotApprovedError (template only)
 *   5. client.sendMessage(...)            → { wamid }
 *
 * Terminal vs transient error classification:
 *   - OwnerNoOptInError, OwnerWindowExpiredError, OwnerTemplateNotApprovedError
 *     → terminal (gate failure): logged; NOT re-raised (do not waste pg-boss
 *     retries on operator-config errors).
 *   - All other errors → transient (network, DB down, WABA 5xx): re-raised so
 *     pg-boss applies retryLimit retries.
 *
 * Producer contract (apps/hq/actions/send-owner-whatsapp.ts):
 *   boss.send("hq-owner-send", { studioId, messageId, payload },
 *             { expireInSeconds: 600, retryLimit: 3 })
 *
 * Deferred-on-external-dependency (D-13):
 *   The worker defaults to mockHqWabaClient when HQ_WABA_* env vars are absent.
 *   Live sends are enabled once the operator sets those secrets (after Meta
 *   Business Manager phone number registration + template approval).
 */

import type { PgBoss, Job as PgBossJob } from "pg-boss";
import { getHqDb } from "../lib/db.js";
import {
  sendOwnerMessage,
  OwnerNoOptInError,
  OwnerWindowExpiredError,
  OwnerTemplateNotApprovedError,
} from "../domain/sendOwnerMessage.js";
import type {
  HqWabaClient,
  SendOwnerMessagePayload,
} from "../lib/hq-waba-client.js";
import { getLogger } from "../lib/logger.js";

/** Payload shape stored in pg-boss for the hq-owner-send job. */
export interface HqOwnerSendJobData {
  studioId: string;
  messageId: string;
  payload: SendOwnerMessagePayload;
}

/** Name of the pg-boss hq-owner-send queue. */
export const HQ_OWNER_SEND_QUEUE = "hq-owner-send";

/**
 * Register the hq-owner-send pg-boss worker.
 *
 * Accepts an injected HqWabaClient so the production caller can pass
 * createHqWabaClient (or mockHqWabaClient when creds are absent) and tests
 * can pass mockHqWabaClient directly without a live WABA connection.
 *
 * @param boss   - The pg-boss instance (already started).
 * @param client - The HQ WABA client to use for sends (injected).
 */
export async function registerOwnerSend(
  boss: PgBoss,
  client: HqWabaClient,
): Promise<void> {
  const log = getLogger();

  await boss.work<HqOwnerSendJobData>(
    HQ_OWNER_SEND_QUEUE,
    async (jobs: PgBossJob<HqOwnerSendJobData>[]) => {
      // pg-boss 12 passes an array; default batch size is 1. Process first item.
      const job = jobs[0];
      if (!job) return;

      const { studioId, messageId, payload } = job.data;
      const db = getHqDb();

      log.info(
        { studioId, messageId, payloadType: payload.type },
        "[hq-owner-send] processing job",
      );

      try {
        const result = await sendOwnerMessage({
          studioId,
          messageId,
          payload,
          db,
          client,
        });
        log.info(
          { studioId, messageId, wamid: result.wamid },
          "[hq-owner-send] send succeeded",
        );
      } catch (err) {
        // ── Terminal gate errors — operator config issues; do NOT retry ──────
        if (
          err instanceof OwnerNoOptInError ||
          err instanceof OwnerWindowExpiredError ||
          err instanceof OwnerTemplateNotApprovedError
        ) {
          log.warn(
            { studioId, messageId, errName: (err as Error).name, err },
            "[hq-owner-send] terminal gate error — job will not be retried",
          );
          // Returning without throwing prevents pg-boss from marking this job
          // as failed for retry. The job completes as "handled" (no retry).
          return;
        }

        // ── Transient errors — re-raise for pg-boss retry ────────────────────
        log.error(
          { studioId, messageId, err },
          "[hq-owner-send] transient error — re-raising for pg-boss retry",
        );
        throw err;
      }
    },
  );
}
