import { getDb, schema } from "./db.js";

export type WebhookProvider = "stripe" | "whatsapp" | "meta_lead";

export type InsertWebhookEventArgs = {
  provider: WebhookProvider;
  eventType: string;
  externalId: string;
  payloadRaw: string;
  /** Optional id override; default uses `${provider}:${externalId}` to match demo format */
  idOverride?: string;
};

export type InsertResult =
  | { inserted: true; eventKey: string }
  | { inserted: false; eventKey: string };

/**
 * Insert into webhook_events with ON CONFLICT (provider, external_id) DO NOTHING.
 *
 * Returns inserted=true if the row was new; inserted=false if the
 * (provider, external_id) pair already existed (duplicate Stripe/Meta delivery).
 *
 * Callers should ONLY enqueue downstream work when inserted=true — duplicates
 * are already in the pipeline.
 */
export async function insertWebhookEvent(
  args: InsertWebhookEventArgs,
): Promise<InsertResult> {
  const db = getDb();
  const eventKey = args.idOverride ?? `${args.provider}:${args.externalId}`;
  const result = await db
    .insert(schema.webhookEvents)
    .values({
      id: eventKey,
      provider: args.provider,
      eventType: args.eventType,
      externalId: args.externalId,
      payloadRaw: args.payloadRaw,
    })
    .onConflictDoNothing({
      target: [schema.webhookEvents.provider, schema.webhookEvents.externalId],
    })
    .returning({ id: schema.webhookEvents.id });

  if (result.length === 0) {
    return { inserted: false, eventKey };
  }
  return { inserted: true, eventKey };
}
