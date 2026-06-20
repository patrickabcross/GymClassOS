// video-delete-composition — CV3-01
//
// Hard-delete a video composition by id. NOT_FOUND is a no-op success (idempotent).
// This is a HARD delete — no soft-delete (delete is always behind shadcn AlertDialog
// confirmation in the UI). The agent confirms destructive intent before calling.
//
// Agent-callable mutation: no `http` key (POST via action endpoint).
// DIRECT — no propose-action gate. Agent should confirm destructive deletes.
//
// Two-exposure: action file (auto-registered) + agent-chat.ts Video section
// + AGENTS.md table.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Delete a video composition by id. Idempotent — if the composition does not exist, " +
    "the call still returns {deleted:true}. " +
    "This is a HARD delete (no recovery). " +
    "In the UI, deletes are always confirmed via an AlertDialog. " +
    "The agent should confirm destructive intent before calling this tool.",
  schema: z.object({
    id: z.string().min(1).describe("Video composition id to delete"),
  }),

  run: async ({ id }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant video
    await db
      .delete(schema.videoCompositions)
      .where(eq(schema.videoCompositions.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { deleted: true };
  },
});
