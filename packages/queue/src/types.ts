import { z } from "zod";

export const QUEUE_NAMES = {
  OUTBOUND_WHATSAPP: "outbound-whatsapp",
  INBOUND_WHATSAPP: "inbound-whatsapp",
  STRIPE_EVENT: "stripe-event",
  CLASS_REMINDER: "class-reminder",
  /** MPV Phase 2: nightly materialiser — fills class_occurrences from class_schedule_rules */
  CLASS_MATERIALIZE: "class-materialize",
  /** MC1: Meta Conversions API event sender (worker resolves pixelId at execution time) */
  META_CAPI_EVENT: "meta-capi-event",
} as const;

export const OutboundWhatsAppPayload = z.object({
  messageId: z.string().min(1),
  memberId: z.string().min(1),
  payload: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), body: z.string().min(1).max(4096) }),
    z.object({
      type: z.literal("template"),
      name: z.string().min(1),
      vars: z.record(z.string(), z.string()),
      language: z.string().optional(),
    }),
  ]),
});
export type OutboundWhatsAppPayload = z.infer<typeof OutboundWhatsAppPayload>;

/**
 * Inbound WhatsApp payload — HIGH #6 fix.
 *
 * Two variants. Both arrive from the Fly receiver (Plan 04) and are
 * processed by the worker (Plan 05). The receiver MUST construct the
 * payload from structured Meta webhook fields; the worker MUST read
 * structured fields directly. Do NOT reconstruct synthetic strings.
 */
export const InboundWhatsAppMessagePayload = z.object({
  kind: z.literal("message"),
  externalId: z.string().min(1), // wamid of inbound
  from: z.string().min(7), // E.164 sender without +
  messageType: z.string().min(1), // "text" | "image" | "audio" | ...
  body: z.string().optional(), // text body if type="text"
  timestamp: z.string().optional(), // Meta unix timestamp string
  // Direction: "out" when msg.from === metadata.phone_number_id (MYÜTIK
  // outbound mirror). Defaults to "in" so old in-flight jobs without this
  // field parse without error (backward compatible).
  direction: z.enum(["in", "out"]).default("in"),
  // Customer's wa_id from contacts[0].wa_id — present only when direction="out"
  // so the worker can match the gym member by the customer's number (NOT by
  // `from`, which is the business number and matches no member row).
  customerWaId: z.string().optional(),
});

export const InboundWhatsAppStatusPayload = z.object({
  kind: z.literal("status"),
  statusFor: z.string().min(1), // wamid of the OUTBOUND message this status updates
  newStatus: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string().min(1), // Meta unix timestamp string
  errorCode: z.string().optional(), // Meta error code on "failed"
});

export const InboundWhatsAppPayload = z.discriminatedUnion("kind", [
  InboundWhatsAppMessagePayload,
  InboundWhatsAppStatusPayload,
]);
export type InboundWhatsAppPayload = z.infer<typeof InboundWhatsAppPayload>;

export const StripeEventPayload = z.object({
  eventId: z.string().min(1).regex(/^evt_/, "Stripe event IDs start with evt_"),
  // P1c.1: present only for Connect-endpoint events (event.account). Platform
  // events leave it undefined. Threaded to every reducer's refetch as the
  // { stripeAccount } request option (RESEARCH §Connect webhooks).
  stripeAccount: z
    .string()
    .regex(/^acct_/)
    .optional(),
});
export type StripeEventPayload = z.infer<typeof StripeEventPayload>;

export const ClassReminderPayload = z.object({
  bookingId: z.string().min(1),
  remindAt: z.string().datetime(),
});
export type ClassReminderPayload = z.infer<typeof ClassReminderPayload>;

/**
 * MC1: Meta Conversions API event payload.
 *
 * PII fields are PRE-HASHED (SHA-256 hex) by the submit handler before
 * enqueue — raw PII must never enter the queue.
 *
 * fbc, fbp, clientIp, clientUserAgent are PLAIN — Meta requires them unhashed.
 *
 * eventTime is Unix SECONDS (not milliseconds).
 *
 * pixelId is intentionally NOT in the payload — the worker resolves it from
 * studio_owner_config at execution time so queued jobs never carry a stale
 * Pixel ID (per RESEARCH Open Question 1 recommendation).
 */
export const MetaCapiEventPayload = z.object({
  eventId: z.string().min(1), // shared browser <-> server event_id (dedup key)
  memberId: z.string().min(1), // attribution lookup + idempotency
  eventName: z.string().min(1), // "Lead" for MC1 (resolved from stageEventMap)
  actionSource: z.string().min(1), // "website" for form leads
  eventTime: z.number().int(), // Unix SECONDS (NOT milliseconds)
  eventSourceUrl: z.string().optional(),
  // Pre-hashed PII (SHA-256 hex) — never raw PII in the queue
  hashedEmail: z.string().optional(),
  hashedPhone: z.string().optional(),
  hashedFn: z.string().optional(),
  hashedLn: z.string().optional(),
  // Attribution + match signals — PLAIN, never hashed
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  clientIp: z.string().optional(),
  clientUserAgent: z.string().optional(),
  // MC2: Purchase value/currency (LIFE-02). Optional — only Purchase populates them.
  value: z.number().nonnegative().optional(), // MAJOR units, already divided by caller
  currency: z.string().length(3).optional(), // ISO-4217 lowercase (e.g. "gbp")
  // MC2: stage marker write-back key (handler stamps the matching *_sent_at column).
  stageKey: z.enum(["lead", "contact", "purchase", "schedule"]).optional(),
});
export type MetaCapiEventPayload = z.infer<typeof MetaCapiEventPayload>;
