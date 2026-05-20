//
// WhatsApp Cloud API webhook receiver — Demo Sprint D2 (WA-01).
//
// DEMO ONLY hosting: this route lives in templates/mail/ and is tunnelled to
// Meta via ngrok during the demo. Production target is apps/edge-webhooks/
// on Fly.io with min_machines=1 (see PITFALLS #8 + REQUIREMENTS WEB-01).
// Move to Fly in Phase P1b — until then, ngrok is the documented demo path.
//
// HMAC verification follows Meta's docs:
//   X-Hub-Signature-256: sha256=<HMAC-SHA256(APP_SECRET, raw_body)>
// CRITICAL: HMAC is computed on the EXACT bytes Meta sent. Any JSON parse
// before the signature check destroys the hash (PITFALLS #9).
//
// Demo limitations (deferred to P1b):
//   - No 24h-window enforcement at sender layer (WA-05)
//   - No opt-in gate (WA-06)
//   - No stub-member creation for unknown phones (WA-03) — we skip and warn
//   - Status webhooks (delivered/read/failed) acknowledged but not processed (WA-04)
//

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

// ─── GET — verify-token handshake (Meta calls this once at webhook registration) ──
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expectedToken) {
    return new Response("WHATSAPP_VERIFY_TOKEN not configured", {
      status: 500,
    });
  }
  if (mode === "subscribe" && token === expectedToken) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ─── POST — inbound messages + status updates ────────────────────────────────
export async function action({ request }: ActionFunctionArgs) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return new Response("WHATSAPP_APP_SECRET not configured", { status: 500 });
  }

  // 1. RAW BODY FIRST. Do NOT touch request.json() before this — JSON parse
  //    re-stringifies and any whitespace / key-order change destroys the HMAC.
  const raw = await request.text();
  const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(raw).digest("hex");

  const sigBuf = Buffer.from(sigHeader);
  const expBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return new Response("Bad signature", { status: 401 });
  }

  // 2. Signature OK — now parse.
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const db = getDb();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      // Inbound messages
      for (const msg of value?.messages ?? []) {
        const externalId = msg.id; // wamid
        const fromE164 = `+${msg.from}`;
        const messageType = (msg.type as string) ?? "text";
        const body = messageType === "text" ? (msg.text?.body ?? "") : null;

        // Idempotency — webhook_events keyed on `whatsapp:<wamid>`
        const eventKey = `whatsapp:${externalId}`;
        // guard:allow-unscoped — demo D-07 (webhook event store; no per-user scoping)
        const existing = await db
          .select()
          .from(schema.webhookEvents)
          .where(eq(schema.webhookEvents.id, eventKey))
          .limit(1)
          .then((r) => r[0]);
        if (existing) continue; // Meta retry — already processed

        await db.insert(schema.webhookEvents).values({
          id: eventKey,
          provider: "whatsapp",
          eventType: "messages.inbound",
          payloadRaw: raw,
        });

        // Lookup member by phone (natural key)
        // guard:allow-unscoped — demo D-07
        const member = await db
          .select()
          .from(schema.gymMembers)
          .where(eq(schema.gymMembers.phoneE164, fromE164))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (!member) {
          // Demo: skip unrecognised numbers. Production (WA-03) creates a stub member.
          console.warn(
            `[whatsapp webhook] inbound from unknown phone ${fromE164} — skipped`,
          );
          continue;
        }

        // Upsert conversation
        // guard:allow-unscoped — demo D-07
        let conv = await db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.memberId, member.id))
          .limit(1)
          .then((r) => r[0] ?? null);

        const now = new Date().toISOString();
        if (!conv) {
          const convId = `conv_${crypto.randomUUID()}`;
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
              lastInboundAt: now,
              unreadCount: (conv.unreadCount ?? 0) + 1,
              lastMessagePreview: body ?? `(${messageType})`,
              updatedAt: now,
            })
            .where(eq(schema.conversations.id, conv.id));
        }

        await db.insert(schema.messages).values({
          id: `msg_${crypto.randomUUID()}`,
          conversationId: conv.id,
          externalId,
          direction: "in",
          messageType: messageType as any,
          body,
          payload: JSON.stringify(msg),
          status: "delivered",
        });
      }

      // Status webhooks (sent/delivered/read/failed) — out of scope for demo
      // (WA-04 in P1b handles status updates via ordinal-guarded UPDATE).
      // Acknowledge but don't process.
    }
  }

  return new Response("OK", { status: 200 });
}
