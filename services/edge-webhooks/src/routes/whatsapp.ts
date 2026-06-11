import { Hono } from "hono";
import { verifySignature } from "@gymos/whatsapp";
import { enqueueInboundWhatsApp } from "@gymos/queue";
import { insertWebhookEvent } from "../lib/idempotency.js";
import {
  getWhatsAppVerifyToken,
  getWhatsAppAppSecret,
} from "../lib/secrets.js";
import { getDb } from "../lib/db.js";

export const whatsappRoutes = new Hono();

// GET — Meta verify_token handshake (called once at webhook registration)
whatsappRoutes.get("/whatsapp", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const verifyToken = await getWhatsAppVerifyToken(getDb());
  if (mode === "subscribe" && token === verifyToken) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("Forbidden", 403);
});

// POST — inbound messages + status updates
whatsappRoutes.post("/whatsapp", async (c) => {
  // 1. RAW BODY FIRST (PITFALL #9) — never c.req.json() and never
  //    crypto.createHmac before this line. Line-order enforced by plan
  //    acceptance grep: A (await c.req.text()) < B (verifySignature(...)).
  const raw = await c.req.text();
  const sigHeader = c.req.header("x-hub-signature-256") ?? "";

  // 2. Resolve app secret DB-first (TTL-cached — safe to await after raw read,
  //    NOT before, per PITFALL #9 raw-body-first discipline).
  const appSecret = await getWhatsAppAppSecret(getDb());

  // 3. Verify HMAC via @gymos/whatsapp adapter (uses crypto.createHmac
  //    internally — AFTER raw body read).
  if (!verifySignature(raw, sigHeader, appSecret)) {
    console.warn(
      `[whatsapp] POST signature check FAILED — sigHeaderPresent=${Boolean(
        sigHeader,
      )} bodyLen=${raw.length} appSecretSet=${Boolean(appSecret)}`,
    );
    return c.text("Bad signature", 401);
  }
  console.log(
    `[whatsapp] POST signature OK — bodyLen=${raw.length}, processing entries`,
  );

  // 4. Parse JSON (safe AFTER verify).
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.text("Bad JSON", 400);
  }

  // 4b. MYÜTIK verify handshake: a signed POST with body
  //     {"event":"verify","challenge":"<uuid>"}. MYÜTIK substring-checks the
  //     response body for the challenge, so echo it back. Authenticated — this
  //     runs only after verifySignature passed. Harmless to Meta, which verifies
  //     via the GET handshake above and never POSTs event:"verify".
  if ((payload as { event?: string }).event === "verify") {
    console.log("[whatsapp] MYÜTIK verify event — echoing challenge");
    return c.json({ challenge: (payload as { challenge?: string }).challenge });
  }

  // 5. Persist + enqueue each item (idempotent on (provider, external_id)).
  //    Receiver does NO business logic — worker handles materialisation.
  //    HIGH #6: enqueue STRUCTURED payloads (kind: 'message' | 'status').
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  console.log(`[whatsapp] payload parsed — entries=${entries.length}`);
  for (const entry of entries as Array<{ changes?: unknown[] }>) {
    const changes = entry?.changes ?? [];
    for (const change of changes as Array<{ value?: unknown }>) {
      const value = (change?.value ?? {}) as {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body?: string };
          timestamp?: string;
        }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp?: string;
          errors?: Array<{ code: number | string; title?: string }>;
        }>;
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string }>;
      };

      // Outbound mirror detection: when msg.from === metadata.phone_number_id
      // it is a MYÜTIK mirror of an agent reply (business sent it), NOT a
      // customer inbound. The customer's wa_id is in contacts[0].wa_id.
      const phoneNumberId = String(value.metadata?.phone_number_id ?? "");
      const customerWaId =
        value.contacts?.[0]?.wa_id != null
          ? String(value.contacts[0].wa_id)
          : undefined;

      // Inbound messages (WA-03)
      for (const msg of value.messages ?? []) {
        const externalId = msg.id; // wamid
        const result = await insertWebhookEvent({
          provider: "whatsapp",
          eventType: "messages.inbound",
          externalId,
          payloadRaw: raw,
        });
        if (result.inserted) {
          // Direction: "out" when the sender IS the business number (outbound
          // mirror from MYÜTIK), "in" for normal customer messages.
          const direction =
            phoneNumberId && String(msg.from) === phoneNumberId ? "out" : "in";
          // HIGH #6: structured message payload — worker reads fields directly.
          await enqueueInboundWhatsApp({
            kind: "message",
            externalId,
            from: String(msg.from ?? ""),
            messageType: String(msg.type ?? "text"),
            body: msg.text?.body != null ? String(msg.text.body) : undefined,
            timestamp:
              msg.timestamp != null ? String(msg.timestamp) : undefined,
            direction,
            ...(customerWaId !== undefined ? { customerWaId } : {}),
          });
        }
      }

      // Status updates (WA-04) — HIGH #6: structured payload.
      // The webhook_events.external_id dedup key still uses a derived concat
      // so the same status doesn't replay, but the ENQUEUED payload is the
      // typed variant the worker reads directly.
      for (const status of value.statuses ?? []) {
        const dedupKey = `wamid_status_${status.id}_${status.timestamp ?? ""}_${status.status ?? ""}`;
        const result = await insertWebhookEvent({
          provider: "whatsapp",
          eventType: "messages.status",
          externalId: dedupKey,
          payloadRaw: raw,
        });
        if (result.inserted) {
          const errorCode =
            status.errors?.[0]?.code != null
              ? String(status.errors[0].code)
              : undefined;
          // HIGH #6: structured status payload — explicit fields the worker
          // reads directly. NO synthetic externalId concat in the enqueue arg.
          await enqueueInboundWhatsApp({
            kind: "status",
            statusFor: String(status.id),
            newStatus: status.status,
            timestamp: String(status.timestamp ?? ""),
            errorCode,
          });
        }
      }
    }
  }

  return c.text("OK", 200);
});
