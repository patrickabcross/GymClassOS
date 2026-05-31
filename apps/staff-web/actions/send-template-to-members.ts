// send-template-to-members — batch WhatsApp template fan-out (campaign send).
//
// Fans out one enqueueOutboundWhatsApp job per member through the EXISTING
// queue → worker → @gymos/whatsapp chokepoint. NO direct Meta call from
// staff-web (D-11). The worker's sendMessage() chokepoint re-checks:
//   1. opt-in gate (WA-07; WA-09/WA-10 opted-out check)
//   2. window gate (bypassed for templates — the whole point)
//   3. template-approved gate (WA-08)
//
// Defence-in-depth: this action pre-gates the TEMPLATE (whole-batch property)
// by checking whatsapp_templates.status === 'approved'. Per-member opt-in /
// opted-out / window checks are NOT done here — the worker is authoritative
// (D-19; UI cache can be stale). Jobs that fail per-member gates will land
// with status='failed' + errorCode in the messages table.
//
// Variables: a SINGLE shared `variables` map is applied to EVERY recipient.
// Per-member personalisation (e.g. first name in {{1}}) is out of scope for
// this core build — document the limitation in the variables Zod schema and
// return it in the response so callers are aware.
//
// Capacity cap: memberIds is bounded at 500 (practical studio-size limit at
// pilot scale; raise when multi-studio volume demands it).
//
// Requirements: WA-07, WA-09, WA-10, RET-01

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { enqueueOutboundWhatsApp } from "../app/lib/queue-client.js";
import { nanoid } from "nanoid";
import { eq, and, inArray } from "drizzle-orm";

export default defineAction({
  description:
    "Batch-send an approved WhatsApp template to a set of members (campaign fan-out). " +
    "One queued job per member via the worker chokepoint. " +
    "Rejects the entire batch if the template is not approved. " +
    "Per-member opt-in and window checks are enforced by the worker (not this action). " +
    "Returns { queued, conversationsCreated, failed }.",
  schema: z.object({
    memberIds: z
      .array(z.string().min(1))
      .min(1)
      .max(500) // practical cap at pilot scale — raise for multi-studio
      .describe("Member IDs to send the template to (max 500 per batch)"),
    templateName: z
      .string()
      .min(1)
      .describe("Name of the WhatsApp template to send"),
    variables: z
      .record(z.string(), z.string())
      .optional()
      .default({})
      .describe(
        "Shared variable map applied to EVERY recipient — per-member personalisation is out of scope for this core build. " +
          "Keys are the {{N}} placeholder numbers (as strings), values are the substitution text.",
      ),
  }),
  http: { method: "POST" },
  run: async ({ memberIds, templateName, variables }) => {
    const db = getDb();

    // 1. Defence-in-depth template pre-gate (whole-batch property).
    //    Worker still re-checks per job (D-19), but reject early if template
    //    is missing or not approved so the coach gets immediate feedback.
    //    guard:allow-unscoped — single-tenant studio-wide templates table
    const templateRows = await db
      .select({
        name: schema.whatsappTemplates.name,
        status: schema.whatsappTemplates.status,
      })
      .from(schema.whatsappTemplates)
      .where(eq(schema.whatsappTemplates.name, templateName))
      .limit(1);

    if (templateRows.length === 0 || templateRows[0].status !== "approved") {
      return {
        error: "Template is not approved",
        queued: 0,
        conversationsCreated: 0,
        failed: 0,
      };
    }

    let queued = 0;
    let conversationsCreated = 0;
    let failed = 0;
    const nowIso = new Date().toISOString();

    // 2. Fan-out: per-member optimistic insert + enqueue.
    for (const memberId of memberIds) {
      try {
        // 2a. Resolve or create the member's WhatsApp conversation.
        //     guard:allow-unscoped — single-tenant gym tables
        let convRow = await db
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(
            and(
              eq(schema.conversations.memberId, memberId),
              eq(schema.conversations.channel, "whatsapp"),
            ),
          )
          .limit(1)
          .then((r: any) => r[0] ?? null);

        if (!convRow) {
          const convId = `conv_${nanoid()}`;
          // guard:allow-unscoped — single-tenant gym tables
          await db.insert(schema.conversations).values({
            id: convId,
            memberId,
            channel: "whatsapp",
            status: "open",
            unreadCount: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          convRow = { id: convId };
          conversationsCreated++;
        }

        // 2b. Optimistic queued-message insert (mirrors gymos._index.tsx send-template branch).
        //     Mirrors the D-18 pattern: insert with status='queued', then enqueue.
        const messageId = `msg_${nanoid()}`;
        const previewBody = `[template: ${templateName}]`;
        // guard:allow-unscoped — single-tenant gym tables
        await db.insert(schema.messages).values({
          id: messageId,
          conversationId: convRow.id,
          direction: "out",
          messageType: "template",
          body: previewBody,
          payload: JSON.stringify({ name: templateName, vars: variables }),
          status: "queued",
          createdAt: nowIso,
        });

        // 2c. Update conversation preview.
        // guard:allow-unscoped — single-tenant gym tables
        await db
          .update(schema.conversations)
          .set({ lastMessagePreview: previewBody, updatedAt: nowIso })
          .where(eq(schema.conversations.id, convRow.id));

        // 2d. Enqueue — singletonKey is messageId-derived inside the publisher.
        //     NEVER import @gymos/whatsapp here — that is in forbiddenDependencies.
        await enqueueOutboundWhatsApp({
          messageId,
          memberId,
          payload: {
            type: "template",
            name: templateName,
            vars: variables,
            language: "en_US",
          },
        });

        queued++;
      } catch (err) {
        // One bad member does not abort the batch — log and continue.
        console.error(
          `[send-template-to-members] failed for member ${memberId}:`,
          err,
        );
        failed++;
      }
    }

    return { queued, conversationsCreated, failed };
  },
});
