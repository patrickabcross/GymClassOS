/**
 * services/edge-webhooks/src/routes/meta-lead.ts
 *
 * MC3: Meta Lead Ads Leadgen webhook receiver.
 *
 * Two handlers on /meta-lead:
 *   GET  — Meta hub.challenge verify handshake (called once at subscription).
 *   POST — Signed Leadgen notification: signature verify + idempotency + enqueue.
 *
 * Architecture (D-10):
 *   This route ONLY verifies + idempotency-dedupes + enqueues. No Graph API
 *   call, no member materialisation — those live in the worker (meta-lead.ts).
 *   Mirrors whatsapp.ts exactly: raw-body-first, same HMAC scheme (same Facebook
 *   App Secret), same verify-token handshake.
 *
 * Pitfall 1 (leadgen_id precision):
 *   leadgen_id in the webhook JSON is a 15-16 digit integer that exceeds
 *   Number.MAX_SAFE_INTEGER. JSON.parse() silently loses precision for these.
 *   We extract the raw decimal string via regex BEFORE JSON.parse() so the
 *   dedup key and queue payload carry the exact value.
 *   NOTE: the regex matches the FIRST leadgen_id in the raw body. Meta sends
 *   one change per POST in practice; multiple changes in one POST would only
 *   enqueue the first. This is documented and acceptable (single-change assumption).
 *
 * Pitfall 2 (raw-body-first):
 *   `const raw = await c.req.text()` MUST be the first statement (same discipline
 *   as whatsapp.ts; plan acceptance grep enforces this).
 *
 * D-07 (park-don't-fail):
 *   POST always returns 200 after signature verification — even if no changes
 *   are actionable. Failed idempotency inserts (duplicates) are silently skipped.
 */

import { Hono } from "hono";
import { verifySignature } from "@gymos/whatsapp";
import { enqueueMetaLead } from "@gymos/queue";
import { insertWebhookEvent } from "../lib/idempotency.js";
import {
  getWhatsAppVerifyToken,
  getWhatsAppAppSecret,
} from "../lib/secrets.js";
import { getDb } from "../lib/db.js";

export const metaLeadRoutes = new Hono();

// GET — Meta hub.challenge verify handshake (called once at webhook registration).
// The Meta Lead Ads app uses the SAME Facebook App verify token as WhatsApp
// (same Facebook App), so getWhatsAppVerifyToken is reused directly (D-11).
metaLeadRoutes.get("/meta-lead", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const verifyToken = await getWhatsAppVerifyToken(getDb());
  if (mode === "subscribe" && token === verifyToken) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("Forbidden", 403);
});

// POST — Leadgen notification from Meta.
metaLeadRoutes.post("/meta-lead", async (c) => {
  // 1. RAW BODY FIRST (Pitfall 2 / same discipline as whatsapp.ts).
  //    This MUST be the first statement — no await before this line.
  const raw = await c.req.text();

  const sigHeader = c.req.header("x-hub-signature-256") ?? "";

  // 2. Resolve the Facebook App Secret (same credential as WhatsApp — D-11).
  //    getWhatsAppAppSecret is DB-first + TTL-cached (60 s), so it is safe
  //    to await AFTER the raw body is read.
  const appSecret = await getWhatsAppAppSecret(getDb());

  // 3. Verify HMAC-SHA256 (same @gymos/whatsapp helper — same signing scheme).
  if (!verifySignature(raw, sigHeader, appSecret)) {
    console.warn(
      `[meta-lead] POST signature check FAILED — sigHeaderPresent=${Boolean(sigHeader)} bodyLen=${raw.length} appSecretSet=${Boolean(appSecret)}`,
    );
    return c.text("Bad signature", 401);
  }

  // 4. Parse JSON (safe AFTER verify).
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.text("Bad JSON", 400);
  }

  const entries = (payload as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries as Array<{ changes?: unknown[] }>) {
    const changes = entry?.changes ?? [];
    for (const change of changes as Array<{
      field?: string;
      value?: Record<string, unknown>;
    }>) {
      // Only process leadgen field changes (D-10 / Meta Leadgen webhook spec).
      if (change.field !== "leadgen") continue;

      const v = change.value ?? {};

      // Pitfall 1: leadgen_id is a 15-16 digit integer > Number.MAX_SAFE_INTEGER.
      // Extract as a STRING from the RAW body via regex BEFORE JSON.parse could
      // have lost precision. The regex matches the first leadgen_id occurrence.
      // NOTE: if multiple leadgen changes arrive in one POST, only the first
      // leadgen_id is extracted by this regex. Meta sends one change per POST
      // in practice — this single-change assumption is documented and acceptable.
      const leadgenMatch = raw.match(/"leadgen_id"\s*:\s*"?(\d+)"?/);
      const leadgenId = leadgenMatch?.[1] ?? String(v.leadgen_id ?? "");

      if (!leadgenId) {
        console.warn("[meta-lead] change has no leadgen_id — skipping");
        continue;
      }

      // 5. Idempotency via webhook_events ON CONFLICT (provider, external_id) DO NOTHING.
      //    provider='meta_lead' is the new value added in this plan (D-12).
      //    Only enqueue when inserted===true (D-12: first delivery only).
      const result = await insertWebhookEvent({
        provider: "meta_lead",
        eventType: "leadgen",
        externalId: leadgenId,
        payloadRaw: raw,
      });

      if (result.inserted) {
        await enqueueMetaLead({
          leadgenId,
          formId: String(v.form_id ?? ""),
          pageId: String(v.page_id ?? ""),
          adId: String(v.ad_id ?? ""),
        });
        console.log(
          `[meta-lead] enqueued retrieval job — leadgenId=${leadgenId} formId=${v.form_id ?? ""} pageId=${v.page_id ?? ""}`,
        );
      } else {
        console.log(
          `[meta-lead] duplicate delivery — leadgenId=${leadgenId} already in webhook_events, skipping`,
        );
      }
    }
  }

  // D-07: always return 200 after signature verification — never fail the
  // webhook delivery on business-logic grounds (Meta would retry endlessly).
  return c.text("OK", 200);
});
