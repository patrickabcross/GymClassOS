import { eq, and } from "drizzle-orm";
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
import { sendViaMyutik } from "./sendViaMyutik.js";
import { renderApprovedTemplateBody } from "./templateBody.js";
import { getMyutikApiKey, getMyutikPhoneNumberId } from "../lib/secrets.js";

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
 *   3. template approved (WA-08)    — refuse unapproved template name (fires
 *                                     for template payloads in BOTH window
 *                                     states)
 *
 * Template send strategy (quick-260615-r6t):
 *   - IN window:  render the approved template's BODY (vars substituted) and
 *                 send it as free `text` (a real sentence). If the render is
 *                 null/empty, fall back to the real template send below.
 *   - OUT of window: send the real approved template (Meta policy requires it).
 *
 * Then relay through MYÜTIK (POST myutik.com/api/channels/whatsapp/send);
 * update messages.status based on result. The GymClassOS Meta app is not
 * approved to send on Hustle's WABA, so ALL sends go through MYÜTIK's relay,
 * which holds the token with the right WhatsApp permissions (WA-05).
 *
 * Throws on gate failure WITHOUT calling MYÜTIK.
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

  // 4. Window state — computed ONCE here for both the text gate and the
  //    template send-strategy decision below. Inside the 24h window we may
  //    render an approved template's BODY and send it as free text (a real
  //    sentence the member can read); outside the window Meta requires the
  //    real approved-template send.
  const inWindow = isInWindow(lastInboundAt);

  // 4a. Window gate (WA-06) — applies to free-text only. Out-of-window text is
  //     refused at the sender layer (CONTEXT.md: not just discouraged in UI).
  if (payload.type === "text" && !inWindow) {
    throw new WindowExpiredError(memberId, lastInboundAt);
  }

  // 5. Template-approved gate (WA-08) — MUST fire for template payloads in BOTH
  //    window states. In-window we still render+send the approved body, so the
  //    template name must be approved regardless of whether we send it as a real
  //    template (out-of-window) or as rendered text (in-window).
  if (payload.type === "template") {
    if (!(await isTemplateApproved(payload.name, db))) {
      throw new TemplateNotApprovedError(payload.name);
    }
  }

  // 6. Resolve MYÜTIK creds DB-first (WA-05, rotation-capable) — once per send,
  //    before the relay call block. The MYÜTIK account is resolved from the
  //    API key; no Meta token is passed.
  const apiKey = await getMyutikApiKey(db);
  const phoneNumberId = await getMyutikPhoneNumberId(db);

  // 7. Relay through MYÜTIK — KEEP the leading + on the E.164 number
  //    (MYÜTIK accepts with or without +; we keep it).
  const to = member.phoneE164;
  let externalId: string;
  try {
    if (payload.type === "text") {
      const result = await sendViaMyutik({
        apiKey,
        phoneNumberId,
        to,
        text: payload.body,
      });
      externalId = result.wamid;
    } else {
      // In-window template path: render the approved template's BODY text
      // (vars substituted) and send it as free `text`, so the member reads a
      // real sentence rather than a templated message. Out-of-window we MUST
      // use the real approved-template send (Meta policy). If the in-window
      // render comes back null/empty we fall back to the template send — we
      // never send empty text (MYÜTIK's text branch rejects it).
      let renderedBody: string | null = null;
      if (inWindow) {
        // guard:allow-unscoped — template list is studio-global, not per-user
        const templateRows = await db
          .select({ componentsJson: schema.whatsappTemplates.componentsJson })
          .from(schema.whatsappTemplates)
          .where(eq(schema.whatsappTemplates.name, payload.name))
          .limit(1);
        const componentsJson = templateRows[0]?.componentsJson;
        renderedBody = renderApprovedTemplateBody(componentsJson, payload.vars);
      }

      if (renderedBody) {
        const result = await sendViaMyutik({
          apiKey,
          phoneNumberId,
          to,
          text: renderedBody,
        });
        externalId = result.wamid;
      } else {
        // Build a SINGLE body component with params ordered by placeholder
        // number ({{1}}, {{2}}, ...). Empty vars → omit templateComponents.
        const orderedValues = Object.entries(payload.vars)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, v]) => v);
        const templateComponents = orderedValues.length
          ? [
              {
                type: "body",
                parameters: orderedValues.map((v) => ({
                  type: "text",
                  text: v,
                })),
              },
            ]
          : undefined;
        const result = await sendViaMyutik({
          apiKey,
          phoneNumberId,
          to,
          templateName: payload.name,
          templateLanguage: payload.language ?? "en_US",
          templateComponents,
        });
        externalId = result.wamid;
      }
    }
  } catch (err: unknown) {
    // 4xx from MYÜTIK is terminal — mark failed, don't retry.
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

  // 8. Mark sent.
  // guard:allow-unscoped — worker writes own state
  await db
    .update(schema.messages)
    .set({
      status: "sent",
      externalId,
      sentAt: new Date().toISOString(),
    })
    .where(eq(schema.messages.id, messageId));

  // 9. Update last_outbound_at (analytics; no behaviour gate uses it).
  if (conversation) {
    // guard:allow-unscoped — worker writes own state
    await db
      .update(schema.conversations)
      .set({ lastOutboundAt: new Date().toISOString() })
      .where(eq(schema.conversations.id, conversation.id));
  }

  return { externalId };
}
