import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { getDb } from "../lib/db.js";
import { schema } from "../lib/db.js";

export type InboundMessage = {
  id: string; // wamid
  from: string; // phone WITHOUT leading + (e.g. "447700900000")
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "location"
    | "sticker"
    | "interactive"
    | string;
  text?: { body?: string };
  timestamp?: string;
};

/**
 * Upsert conversation + insert messages row for an inbound WA message (WA-03).
 *
 * Race-safe (HIGH #4): messages.external_id is the partial UNIQUE index
 * (Plan P1b-02). The INSERT uses .onConflictDoNothing({ target: externalId })
 * so two concurrent jobs racing on the same wamid produce exactly one row.
 *
 * Returns { processed: true } if the message was newly written,
 * { processed: false, reason } if skipped (member not found OR duplicate).
 */
export async function upsertConversationAndMessage(
  db: ReturnType<typeof getDb>,
  msg: InboundMessage,
  rawPayload: string,
): Promise<{ processed: boolean; reason?: string }> {
  const externalId = msg.id;
  const fromE164 = `+${msg.from}`;
  const messageType = (msg.type ?? "text") as string;
  const body = messageType === "text" ? (msg.text?.body ?? "") : null;

  // 1. Look up member by phone (natural key)
  //    guard:allow-unscoped — webhook processor
  const member = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.phoneE164, fromE164))
    .limit(1)
    .then((r: any) => r[0] ?? null);

  if (!member) {
    // Demo parity (the deleted templates/mail/.../webhooks.whatsapp.tsx
    // behaved the same way at line 117). Full WA-03 "stub member" path is
    // deferred — CONTEXT does not lock it in.
    return { processed: false, reason: "unknown_phone" };
  }

  // 2. Upsert conversation
  //    guard:allow-unscoped — webhook processor
  const now = new Date().toISOString();
  let conv = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.memberId, member.id),
        eq(schema.conversations.channel, "whatsapp"),
      ),
    )
    .limit(1)
    .then((r: any) => r[0] ?? null);

  if (!conv) {
    const convId = `conv_${nanoid()}`;
    await db.insert(schema.conversations).values({
      id: convId,
      memberId: member.id,
      channel: "whatsapp",
      status: "open",
      unreadCount: 1,
      lastInboundAt: now,
      lastMessagePreview: body ?? `(${messageType})`,
    });
    conv = { id: convId, unreadCount: 0 } as any;
  } else {
    await db
      .update(schema.conversations)
      .set({
        // Promote to the working inbox on any inbound: a 'lead' who actually
        // messages is now a live conversation, and a closed/snoozed thread
        // reactivates on reply. The inbox loader hides status='lead'.
        status: "open",
        lastInboundAt: now,
        unreadCount: (conv.unreadCount ?? 0) + 1,
        lastMessagePreview: body ?? `(${messageType})`,
        updatedAt: now,
      })
      .where(eq(schema.conversations.id, conv.id));
  }

  // 3. INSERT message row — HIGH #4: race-safe via .onConflictDoNothing on
  //    the partial UNIQUE index (Plan P1b-02). Two concurrent jobs on the
  //    same wamid won't produce duplicate rows even at concurrency=5.
  //    guard:allow-unscoped — webhook processor
  const insertResult = await db
    .insert(schema.messages)
    .values({
      id: `msg_${nanoid()}`,
      conversationId: conv.id,
      externalId,
      direction: "in",
      messageType: messageType as any,
      body,
      payload: rawPayload,
      status: "delivered",
    })
    .onConflictDoNothing({
      // The unique index on external_id is PARTIAL (WHERE external_id IS NOT
      // NULL). Postgres can only infer a partial index for ON CONFLICT when the
      // matching predicate is supplied — without it the insert throws 42P10
      // ("no unique or exclusion constraint matching the ON CONFLICT
      // specification"). Drizzle maps `where` to the conflict-target predicate.
      target: schema.messages.externalId,
      where: sql`${schema.messages.externalId} is not null`,
    })
    .returning({ id: schema.messages.id });

  if (insertResult.length === 0) {
    // ON CONFLICT triggered — another concurrent job won the race for this wamid
    return { processed: false, reason: "duplicate_wamid" };
  }

  // 4. WA-09: auto-capture opt-in on first inbound.
  //    onConflictDoNothing(member_id) makes it idempotent:
  //    - If no opt-in row exists → creates one (source='inbound_reply').
  //    - If a row already exists (any source) → no-op; never overwrites.
  //    - If the member is opted-out (opted_out_at IS SET) → no-op; the existing
  //      row is preserved unchanged. Re-opt-in is a manual_admin action, not
  //      implied by an inbound (onConflictDoNothing preserves opted_out_at).
  //
  //    DEFERRED: STOP-keyword auto-detection from inbound text is deferred.
  //    The opt-out WRITE PATH (opted_out_at column) and gate (optInGate.ts)
  //    are in place; a future plan can parse the body for "STOP" and call
  //    db.update(whatsappOptIn).set({ optedOutAt: now }).where(eq(memberId, ...)).
  //
  //    guard:allow-unscoped — webhook processor
  await db
    .insert(schema.whatsappOptIn)
    .values({
      memberId: member.id,
      evidenceMessageId: externalId,
      evidencePayload: rawPayload,
      source: "inbound_reply",
    })
    .onConflictDoNothing({ target: schema.whatsappOptIn.memberId });

  return { processed: true };
}
