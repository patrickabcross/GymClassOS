import { eq, and } from "drizzle-orm";
import { sendText, sendTemplate } from "@gymos/whatsapp";
import type { getDb } from "../lib/db.js";
import { schema } from "../lib/db.js";
import {
  NoOptInError,
  WindowExpiredError,
  TemplateNotApprovedError,
} from "../lib/errors.js";
import { hasOptIn } from "./gates/optInGate.js";
import { isInWindow } from "./gates/windowGate.js";
import { isTemplateApproved } from "./gates/templateGate.js";

export type SendMessagePayload =
  | { type: "text"; body: string }
  | {
      type: "template";
      name: string;
      vars: Record<string, string>;
      language?: string;
    };

export type SendMessageArgs = {
  memberId: string;
  /** Local PK 'msg_<nanoid>' — already inserted with status='queued' by caller. */
  messageId: string;
  payload: SendMessagePayload;
  db: ReturnType<typeof getDb>;
};

export type SendMessageResult = { externalId: string };

/**
 * THE chokepoint for outbound WhatsApp sends (D-10, WA-05).
 *
 * Per CONTEXT.md "rejected at sender layer (not just discouraged in UI)":
 * even if the staff-web UI pre-gates, this function re-checks at call time
 * because UI state can be stale (D-19 defence in depth).
 *
 * Gate order (D-10):
 *   1. opt-in (WA-07; PITFALL #17)  — refuse if member never opted in
 *   2. window (WA-06; PITFALL #1)   — refuse free-text outside 24h
 *   3. template approved (WA-08)    — refuse unapproved template name
 *
 * Then call @gymos/whatsapp adapter; update messages.status based on result.
 *
 * Throws on gate failure WITHOUT calling Meta.
 * Returns { externalId } on success.
 * Returns { externalId: "" } and marks status='failed' on 4xx terminal.
 * Re-throws on 5xx / network — pg-boss retries.
 */
export async function sendMessage(
  args: SendMessageArgs,
): Promise<SendMessageResult> {
  const { memberId, messageId, payload, db } = args;

  // 1. Opt-in gate (WA-07) — refuse BEFORE any DB load or Meta call.
  if (!(await hasOptIn(memberId, db))) {
    throw new NoOptInError(memberId);
  }

  // 2. Load member for phone_e164.
  // guard:allow-unscoped — worker chokepoint; the gate above is the access check.
  const memberRows = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, memberId))
    .limit(1);
  const member = memberRows[0];
  if (!member?.phoneE164) {
    throw new Error(`member ${memberId} has no phone_e164`);
  }

  // 3. Load conversation for lastInboundAt (window gate input).
  // guard:allow-unscoped — worker chokepoint
  const conversationRows = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.memberId, memberId),
        eq(schema.conversations.channel, "whatsapp"),
      ),
    )
    .limit(1);
  const conversation = conversationRows[0];

  const lastInboundAt = conversation?.lastInboundAt
    ? new Date(conversation.lastInboundAt)
    : null;

  // 4. Window gate (WA-06) — applies to free-text only. Templates bypass.
  if (payload.type === "text" && !isInWindow(lastInboundAt)) {
    throw new WindowExpiredError(memberId, lastInboundAt);
  }

  // 5. Template-approved gate (WA-08)
  if (payload.type === "template") {
    if (!(await isTemplateApproved(payload.name, db))) {
      throw new TemplateNotApprovedError(payload.name);
    }
  }

  // 6. Call adapter — STRIP leading + from E.164 per Meta's API contract.
  const to = member.phoneE164.replace(/^\+/, "");
  let externalId: string;
  try {
    if (payload.type === "text") {
      const result = await sendText({ to, body: payload.body });
      externalId = result.messageId;
    } else {
      // SendTemplateArgs.language is Zod-defaulted to "en_US"; explicit
      // fallback keeps the type checker happy without changing runtime
      // semantics (the Zod parse inside the adapter applies the same default).
      const result = await sendTemplate({
        to,
        name: payload.name,
        vars: payload.vars,
        language: payload.language ?? "en_US",
      });
      externalId = result.messageId;
    }
  } catch (err: unknown) {
    // 4xx from Meta is terminal — mark failed, don't retry.
    // 5xx / fetch error → re-throw, pg-boss retries up to retryLimit.
    const status =
      (err as { status?: number; statusCode?: number })?.status ??
      (err as { statusCode?: number })?.statusCode;
    const message = err instanceof Error ? err.message : String(err);
    const errorCode = message.slice(0, 500);

    if (typeof status === "number" && status >= 400 && status < 500) {
      // guard:allow-unscoped — worker writes own state
      await db
        .update(schema.messages)
        .set({ status: "failed", errorCode })
        .where(eq(schema.messages.id, messageId));
      return { externalId: "" };
    }
    throw err; // 5xx — let pg-boss retry
  }

  // 7. Mark sent.
  // guard:allow-unscoped — worker writes own state
  await db
    .update(schema.messages)
    .set({
      status: "sent",
      externalId,
      sentAt: new Date().toISOString(),
    })
    .where(eq(schema.messages.id, messageId));

  // 8. Update last_outbound_at (analytics; no behaviour gate uses it).
  if (conversation) {
    // guard:allow-unscoped — worker writes own state
    await db
      .update(schema.conversations)
      .set({ lastOutboundAt: new Date().toISOString() })
      .where(eq(schema.conversations.id, conversation.id));
  }

  return { externalId };
}
