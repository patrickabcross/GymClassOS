import type { PgBoss } from "pg-boss";
import type Stripe from "stripe";
import { eq, and } from "drizzle-orm";
import { QUEUE_NAMES, StripeEventPayload } from "@gymos/queue";
import { getDb, schema } from "../lib/db.js";
import { getStripe } from "../lib/stripe.js";
import { getLogger } from "../lib/logger.js";
import { reducers } from "../domain/stripeReducers/index.js";

/**
 * Register the pg-boss subscriber for the `stripe-event` queue (D-22).
 *
 * Per D-14: concurrency = 3 for stripe-event (Stripe rate-limits are
 *   generous; 3 parallel workers comfortably stays under the floor).
 *
 * NOTE on pg-boss v12: D-14's literal "teamSize=3" maps to
 * batchSize=3 + localConcurrency=3 (v12 dropped v11's teamSize/teamConcurrency
 * keys from WorkOptions — see Plan 05 SUMMARY + Plan 06 outbound-whatsapp
 * which uses the same v12 naming).
 *
 * Per WEB-06: the reducer + the `processed_at` UPDATE on webhook_events
 * MUST run in a single Drizzle transaction. Replay safety (STR-07) is
 * preserved by:
 *   1. processed_at != NULL check — replay of a same evt_id is a no-op.
 *   2. The transaction is the idempotency commit barrier: a partial write
 *      followed by a crash will not set processed_at, so the next replay
 *      runs the reducer again from scratch.
 *
 * Per PITFALL #4 / WEB-06: each reducer REFETCHES from Stripe; the
 * webhook payload is treated as a notification, not the source of truth.
 */
export async function registerStripeEventWorker(boss: PgBoss) {
  const log = getLogger();

  await boss.work(
    QUEUE_NAMES.STRIPE_EVENT,
    { batchSize: 3, localConcurrency: 3 }, // D-14: concurrency=3 (v12 names)
    async (jobs: any) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      const data = StripeEventPayload.parse(job.data);
      const db = getDb();
      const stripe = await getStripe(db);

      // 1. Load webhook_events row keyed on (provider, external_id) — the
      //    P1b-02 composite UNIQUE backs this lookup.
      // guard:allow-unscoped — webhook processor; events are studio-global
      const row = await db
        .select()
        .from(schema.webhookEvents)
        .where(
          and(
            eq(schema.webhookEvents.provider, "stripe"),
            eq(schema.webhookEvents.externalId, data.eventId),
          ),
        )
        .limit(1)
        .then((r) => r[0]);

      if (!row) {
        log.warn(
          { eventId: data.eventId },
          "[stripe-event] no webhook_events row — receiver/worker race?",
        );
        return;
      }
      if (row.processedAt) {
        // STR-07 / success criterion #1: replay returns no-op.
        log.info(
          { eventId: data.eventId },
          "[stripe-event] already processed — skip",
        );
        return;
      }

      const event = JSON.parse(row.payloadRaw) as Stripe.Event;
      const reducer = (reducers as Record<string, any>)[event.type];

      if (!reducer) {
        // Unhandled event type — log and mark processed so it doesn't replay forever.
        log.info(
          { eventType: event.type, eventId: event.id },
          "[stripe-event] no reducer; marking processed",
        );
        // guard:allow-unscoped — webhook processor
        await db
          .update(schema.webhookEvents)
          .set({ processedAt: new Date().toISOString() })
          .where(eq(schema.webhookEvents.id, row.id));
        return;
      }

      // 2. SINGLE TRANSACTION (WEB-06): reducer + processedAt UPDATE atomic.
      // guard:allow-unscoped — webhook processor
      await db.transaction(async (tx) => {
        await reducer(event, tx as any, stripe);
        await tx
          .update(schema.webhookEvents)
          .set({ processedAt: new Date().toISOString() })
          .where(eq(schema.webhookEvents.id, row.id));
      });

      log.info(
        { eventType: event.type, eventId: event.id },
        "[stripe-event] processed",
      );
    },
  );
}
