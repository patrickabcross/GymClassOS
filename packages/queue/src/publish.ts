import { getBoss } from "./boss.js";
import {
  QUEUE_NAMES,
  OutboundWhatsAppPayload,
  InboundWhatsAppPayload,
  StripeEventPayload,
  ClassReminderPayload,
} from "./types.js";

/**
 * Enqueue an outbound WhatsApp send job. Singleton-keyed by messageId
 * (D-13) so a staff retry on the same draft doesn't double-send.
 */
export async function enqueueOutboundWhatsApp(
  args: OutboundWhatsAppPayload,
): Promise<string | null> {
  const data = OutboundWhatsAppPayload.parse(args);
  const boss = getBoss();
  return boss.send(QUEUE_NAMES.OUTBOUND_WHATSAPP, data, {
    singletonKey: `${QUEUE_NAMES.OUTBOUND_WHATSAPP}:${data.messageId}`,
    retryLimit: 3,
    retryBackoff: true,
    expireInSeconds: 60,
  });
}

/**
 * Enqueue an inbound WhatsApp processing job.
 *
 * HIGH #6 fix: payload is a discriminated union (`kind: "message" | "status"`).
 * singletonKey is derived from the variant's structured fields — no synthetic
 * `wamid_status_<id>_<ts>_<status>` concat strings. The receiver constructs
 * the payload from typed Meta webhook fields and the worker reads them
 * directly (statusFor, newStatus, timestamp).
 */
export async function enqueueInboundWhatsApp(
  args: InboundWhatsAppPayload,
): Promise<string | null> {
  const data = InboundWhatsAppPayload.parse(args);
  const boss = getBoss();

  // Per-variant singletonKey — see D-13 convention
  const singletonKey =
    data.kind === "message"
      ? `${QUEUE_NAMES.INBOUND_WHATSAPP}:msg_${data.externalId}`
      : `${QUEUE_NAMES.INBOUND_WHATSAPP}:status_${data.statusFor}_${data.newStatus}_${data.timestamp}`;

  return boss.send(QUEUE_NAMES.INBOUND_WHATSAPP, data, {
    singletonKey,
    retryLimit: 5,
    retryBackoff: true,
  });
}

/**
 * Enqueue a Stripe event processing job. Singleton-keyed by event.id
 * so Stripe replays produce exactly one worker job.
 */
export async function enqueueStripeEvent(
  args: StripeEventPayload,
): Promise<string | null> {
  const data = StripeEventPayload.parse(args);
  const boss = getBoss();
  return boss.send(QUEUE_NAMES.STRIPE_EVENT, data, {
    singletonKey: `${QUEUE_NAMES.STRIPE_EVENT}:stripe_${data.eventId}`,
    retryLimit: 5,
    retryBackoff: true,
  });
}

/**
 * STUB for P2 NOTIF-01 (class reminders). Defined so worker file structure
 * doesn't churn between P1b and P2. Throws to make accidental P1b use loud.
 */
export async function enqueueClassReminder(
  args: ClassReminderPayload,
): Promise<string | null> {
  ClassReminderPayload.parse(args);
  throw new Error(
    "enqueueClassReminder is stubbed — full impl ships in P2/NOTIF-01",
  );
}
