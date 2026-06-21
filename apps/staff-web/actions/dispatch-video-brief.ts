// dispatch-video-brief — video content pipeline, stage 2 ("send it to the trainer")
//
// Sends an approved WhatsApp template to the coach (trainer) with a video brief
// so they can go shoot it. Goes through the EXISTING queue → worker → sendMessage
// chokepoint (D-11) — NO direct Meta call from staff-web. The worker enforces
// opt-in (gate #1, fires even for templates), and the template-approved gate.
//
// Why a template (not free text): a free-text WhatsApp message only sends inside
// a 24h window; the coach has no open window with the business, so out-of-window
// delivery requires an approved template (Meta policy, enforced at the worker).
//
// PREREQUISITES (operator setup — until these are done this returns a clear
// error rather than silently failing):
//   1. Approve a WhatsApp template (default name "video_brief") in Meta/MYÜTIK
//      with three body variables: {{1}} title, {{2}} hook, {{3}} script.
//      NOTE: template variables CANNOT contain newlines / 4+ spaces, so the
//      script is flattened to a single line here.
//   2. The coach must exist as a gym_members row (matched by COACH_WHATSAPP_E164)
//      WITH whatsapp opt-in — the worker refuses any send to a non-opted-in member.
//   3. Env: COACH_WHATSAPP_E164 (the coach's number, E.164) and optionally
//      VIDEO_BRIEF_TEMPLATE_NAME (defaults to "video_brief").
//
// Agent-callable: the coach asks the chat to "send me that brief" and the agent
// calls this. briefId is optional — omit to dispatch the most recent draft brief.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import {
  readAppState,
  writeAppState,
} from "@agent-native/core/application-state";
import { getDb, schema } from "../server/db/index.js";
import { enqueueOutboundWhatsApp } from "../app/lib/queue-client.js";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";

const BRIEFS_KEY = "gymos-video-briefs";

type Brief = {
  id: string;
  title: string;
  hook: string;
  angle: string;
  script: string;
  status: string;
};

// WhatsApp template params reject newlines / 4+ consecutive spaces — flatten.
function flattenForTemplate(s: string, max = 700): string {
  const oneLine = s
    .replace(/\s*\n+\s*/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return oneLine.length > max
    ? oneLine.slice(0, max - 1).trimEnd() + "…"
    : oneLine;
}

export default defineAction({
  description:
    "Send a saved video brief to the coach's WhatsApp as an approved template so they can go shoot it. " +
    "Pass {briefId} to dispatch a specific brief, or omit it to send the most recent draft brief. " +
    "Delivery requires operator setup (an approved 'video_brief' template, the coach as an opted-in member, " +
    "and COACH_WHATSAPP_E164) — otherwise returns a clear {error} explaining what's missing. " +
    "Returns {dispatched:true, briefId, template} | {error}.",
  schema: z
    .object({
      briefId: z.string().max(64).optional(),
    })
    .strict(),
  run: async ({ briefId }) => {
    // 1. Load briefs from app-state.
    // guard:allow-unscoped — application_state is framework-scoped
    const stateRaw = (await readAppState(BRIEFS_KEY)) as {
      briefs?: Brief[];
    } | null;
    const briefs: Brief[] = Array.isArray(stateRaw?.briefs)
      ? (stateRaw!.briefs as Brief[])
      : [];
    if (briefs.length === 0) return { error: "NO_BRIEFS" };

    const brief = briefId
      ? briefs.find((b) => b.id === briefId)
      : (briefs.find((b) => b.status === "draft") ?? briefs[0]);
    if (!brief) return { error: "BRIEF_NOT_FOUND" };

    // 2. Config: coach number + template name.
    const coachPhone = (process.env.COACH_WHATSAPP_E164 ?? "").trim();
    if (!coachPhone) return { error: "COACH_NOT_CONFIGURED" };
    const templateName = (
      process.env.VIDEO_BRIEF_TEMPLATE_NAME ?? "video_brief"
    ).trim();

    const db = getDb();

    // 3. Resolve the coach member by phone (worker send is member-bound).
    //    guard:allow-unscoped — single-tenant gym tables; lookup by phone
    const coach = await db
      .select({ id: schema.gymMembers.id })
      .from(schema.gymMembers)
      .where(eq(schema.gymMembers.phoneE164, coachPhone))
      .limit(1)
      .then((r: any) => r[0] ?? null);
    if (!coach) return { error: "COACH_NOT_A_MEMBER" };

    // 4. Defence-in-depth template pre-gate (worker re-checks per job).
    //    guard:allow-unscoped — single-tenant studio-wide templates table
    const tpl = await db
      .select({ status: schema.whatsappTemplates.status })
      .from(schema.whatsappTemplates)
      .where(eq(schema.whatsappTemplates.name, templateName))
      .limit(1)
      .then((r: any) => r[0] ?? null);
    if (!tpl || tpl.status !== "approved") {
      return { error: "TEMPLATE_NOT_APPROVED", templateName };
    }

    const vars = {
      "1": brief.title,
      "2": flattenForTemplate(brief.hook, 200),
      "3": flattenForTemplate(brief.script, 700),
    };

    const nowIso = new Date().toISOString();

    // 5. Resolve / create the coach's WhatsApp conversation (mirrors send-template).
    //    guard:allow-unscoped — single-tenant gym tables
    let conv = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.memberId, coach.id),
          eq(schema.conversations.channel, "whatsapp"),
        ),
      )
      .limit(1)
      .then((r: any) => r[0] ?? null);
    if (!conv) {
      const convId = `conv_${nanoid()}`;
      // guard:allow-unscoped — single-tenant gym tables
      await db.insert(schema.conversations).values({
        id: convId,
        memberId: coach.id,
        channel: "whatsapp",
        status: "open",
        unreadCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      conv = { id: convId };
    }

    // 6. Optimistic queued message + enqueue (mirrors send-template-to-members).
    const messageId = `msg_${nanoid()}`;
    const previewBody = `[video brief: ${brief.title}]`;
    // guard:allow-unscoped — single-tenant gym tables
    await db.insert(schema.messages).values({
      id: messageId,
      conversationId: conv.id,
      direction: "out",
      messageType: "template",
      body: previewBody,
      payload: JSON.stringify({ name: templateName, vars }),
      status: "queued",
      createdAt: nowIso,
    });
    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.conversations)
      .set({ lastMessagePreview: previewBody, updatedAt: nowIso })
      .where(eq(schema.conversations.id, conv.id));

    await enqueueOutboundWhatsApp({
      messageId,
      memberId: coach.id,
      payload: {
        type: "template",
        name: templateName,
        vars,
        language: "en_US",
      },
    });

    // 7. Mark the brief dispatched.
    brief.status = "dispatched";
    // guard:allow-unscoped — application_state is framework-scoped
    await writeAppState(BRIEFS_KEY, { briefs });

    return { dispatched: true, briefId: brief.id, template: templateName };
  },
});
