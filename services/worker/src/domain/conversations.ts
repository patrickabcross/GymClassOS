import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { getDb } from "../lib/db.js";
import { schema } from "../lib/db.js";

/**
 * Arguments for materialiseOutboundMirror — the outbound-mirror
 * counterpart to InboundMessage.
 */
export type OutboundMirrorArgs = {
  externalId: string; // wamid
  customerWaId: string; // customer's wa_id from contacts[0].wa_id
  messageType: string; // "text" | "image" | ...
  body?: string; // text body (may be undefined for non-text types)
  timestamp?: string; // Meta unix timestamp string
};

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
 * Resolve a display name for an auto-created member from the raw inbound
 * payload, falling back to the E.164 number.
 *
 * rawPayload is either the full Meta webhook envelope (a JSON string) or a
 * synthetic `{synthetic:true,...}` fallback (see inbound-whatsapp.ts ~L108).
 * The Meta envelope carries the sender's WhatsApp profile name at
 * entry[0].changes[0].value.contacts[0].profile.name.
 *
 * MUST NEVER throw: JSON.parse is wrapped, every lookup is optional-chained,
 * and an empty/whitespace name falls back to the E.164 number.
 */
function resolveInboundDisplayName(
  rawPayload: string,
  fromE164: string,
): string {
  try {
    const parsed: any = JSON.parse(rawPayload);
    const name =
      parsed?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
    if (typeof name === "string" && name.trim().length > 0) {
      return name.trim();
    }
  } catch {
    // Malformed JSON (or synthetic fallback) — fall through to E.164.
  }
  return fromE164;
}

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
): Promise<{ processed: boolean; reason?: string; memberId?: string }> {
  const externalId = msg.id;
  const fromE164 = `+${msg.from}`;
  const messageType = (msg.type ?? "text") as string;
  const body = messageType === "text" ? (msg.text?.body ?? "") : null;

  // 1. Look up member by phone (natural key)
  //    guard:allow-unscoped — webhook processor
  let member = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.phoneE164, fromE164))
    .limit(1)
    .then((r: any) => r[0] ?? null);

  if (!member) {
    // WA-INBOUND-UNKNOWN: an inbound from a number not yet in gym_members is a
    // NEW prospect. Auto-create the member so the conversation surfaces in the
    // staff inbox, then fall through into the EXISTING conversation/message/
    // opt-in logic below — exactly like a known member.
    const resolvedName = resolveInboundDisplayName(rawPayload, fromE164);

    // Race-safe INSERT mirroring the messages.externalId onConflict pattern
    // already used in this file. The phone_e164 partial UNIQUE index is
    // `WHERE phone_e164 IS NOT NULL`, so the matching predicate must be
    // supplied (else Postgres raises 42P10). Bare nanoid() matches the existing
    // gym_members id convention (no prefix).
    // guard:allow-unscoped — webhook processor
    await db
      .insert(schema.gymMembers)
      .values({
        id: nanoid(),
        firstName: resolvedName,
        lastName: null,
        phoneE164: fromE164,
      })
      .onConflictDoNothing({
        target: schema.gymMembers.phoneE164,
        where: sql`${schema.gymMembers.phoneE164} is not null`,
      });

    // Re-SELECT by phone so concurrent inbound from the same new number
    // resolves to ONE member: the loser of the onConflict race reads the
    // winner's row (no duplicate at localConcurrency=5).
    // guard:allow-unscoped — webhook processor
    member = await db
      .select()
      .from(schema.gymMembers)
      .where(eq(schema.gymMembers.phoneE164, fromE164))
      .limit(1)
      .then((r: any) => r[0] ?? null);

    if (!member) {
      // Defensive guard — should not happen (we just inserted-or-conflicted).
      return { processed: false, reason: "member_create_failed" };
    }
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

  return { processed: true, memberId: member.id };
}

/**
 * Materialise an outbound mirror webhook from MYÜTIK (WA-03 outbound path).
 *
 * An outbound mirror is a webhook MYÜTIK sends back to the receiver when
 * an agent reply is delivered. It has msg.from === metadata.phone_number_id
 * (the business number) and the customer's wa_id in contacts[0].wa_id.
 *
 * Key differences from upsertConversationAndMessage (the inbound path):
 *   - Member matched by customerWaId ("+" + args.customerWaId), NOT by `from`.
 *   - Inserts messages row with direction:"out", status:"sent".
 *   - Does NOT bump unreadCount.
 *   - Does NOT set lastInboundAt.
 *   - Does NOT set conversation.status.
 *   - Does NOT insert whatsapp_opt_in (agent reply ≠ opt-in evidence).
 *   - Sets lastOutboundAt + lastMessagePreview on the conversation.
 *   - Self-send dedup via the same onConflictDoNothing partial index.
 *
 * Returns:
 *   { processed: true }           — new row written
 *   { processed: false, reason: "unknown_phone" }    — no member for customerWaId
 *   { processed: false, reason: "duplicate_wamid" }  — already stored (self-send dedup)
 */
export async function materialiseOutboundMirror(
  db: ReturnType<typeof getDb>,
  args: OutboundMirrorArgs,
  rawPayload: string,
): Promise<{ processed: boolean; reason?: string }> {
  const { externalId, customerWaId, messageType, body, timestamp: _ts } = args;
  const toE164 = `+${customerWaId}`;
  const preview = body ?? `(${messageType})`;

  // 1. Look up member by customer's wa_id (NOT by the business sender number)
  //    guard:allow-unscoped — webhook processor
  const member = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.phoneE164, toE164))
    .limit(1)
    .then((r: any) => r[0] ?? null);

  if (!member) {
    return { processed: false, reason: "unknown_phone" };
  }

  // 2. Find or create conversation — DO NOT set status or lastInboundAt here.
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

  const isNewConversation = !conv;
  if (isNewConversation) {
    const convId = `conv_${nanoid()}`;
    // DO NOT pass status — column default ('open') applies.
    // DO NOT pass unreadCount — column default (0) applies.
    // guard:allow-unscoped — webhook processor
    await db.insert(schema.conversations).values({
      id: convId,
      memberId: member.id,
      channel: "whatsapp",
      lastOutboundAt: now,
      lastMessagePreview: preview,
    });
    conv = { id: convId } as any;
  }

  // 3. INSERT messages row with direction:'out', status:'sent'.
  //    Same onConflictDoNothing partial-index shape as the inbound path (HIGH #4).
  //    Self-send mirrors (already written by sendMessage.ts) dedupe here.
  //    guard:allow-unscoped — webhook processor
  const insertResult = await db
    .insert(schema.messages)
    .values({
      id: `msg_${nanoid()}`,
      conversationId: conv.id,
      externalId,
      direction: "out",
      messageType: messageType as any,
      body: body ?? null,
      payload: rawPayload,
      status: "sent",
    })
    .onConflictDoNothing({
      // Matches the partial UNIQUE index created in P1b-02
      // (WHERE external_id IS NOT NULL). Without the `where` predicate
      // Postgres raises 42P10 (no unique or exclusion constraint matching).
      target: schema.messages.externalId,
      where: sql`${schema.messages.externalId} is not null`,
    })
    .returning({ id: schema.messages.id });

  if (insertResult.length === 0) {
    // ON CONFLICT: self-send mirror already stored by sendMessage.ts — clean no-op.
    return { processed: false, reason: "duplicate_wamid" };
  }

  // 4. Update existing conversation (if it already existed) with lastOutboundAt.
  //    DO NOT touch unreadCount / lastInboundAt / status.
  //    guard:allow-unscoped — webhook processor
  if (!isNewConversation) {
    await db
      .update(schema.conversations)
      .set({
        lastOutboundAt: now,
        lastMessagePreview: preview,
        updatedAt: now,
      })
      .where(eq(schema.conversations.id, conv.id));
  }

  // 5. NO whatsapp_opt_in insert — an agent reply is not opt-in evidence.

  return { processed: true };
}
