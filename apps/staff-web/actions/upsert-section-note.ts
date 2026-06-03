import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Write or update the AI note shown on a dashboard section card (or the AI-today header strip). " +
    "Upserts by section — calling again with the same section REPLACES the note (does not append). " +
    "Sections: inbox, schedule, members, revenue, ai_today. Body is free prose, max 2000 chars. " +
    "Use this to surface a recommendation or a recently-taken-action summary on the noticeboard.",
  schema: z.object({
    section: z
      .enum(["inbox", "schedule", "members", "revenue", "ai_today"])
      .describe("Which dashboard section card the note belongs to"),
    body: z
      .string()
      .max(2000)
      .describe(
        "The note prose. Concise. Replaces any existing note for this section.",
      ),
  }),
  run: async ({ section, body }) => {
    const db = getDb();
    const nowIso = new Date().toISOString();
    const id = `dnote_${section}`;
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db
      .insert(schema.dashboardNotes)
      .values({ id, section, body, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoUpdate({
        target: schema.dashboardNotes.section,
        set: { body, updatedAt: nowIso },
      });
    return { section, updated: true };
  },
});
