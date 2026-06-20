// content-delete-document — CV2-01
//
// Hard-delete a content document by id. NOT_FOUND is a no-op success (idempotent).
// This is a HARD delete — no soft-delete / deleted_at column (per plan hard_constraints;
// the delete is always behind a shadcn AlertDialog confirmation in the UI).
//
// Agent-callable mutation: no `http` key (POST via action endpoint).
// DIRECT — no propose-action gate. The coach confirms destructive deletes via the
// AlertDialog in the UI; the agent surfaces deletes with confirmation language.
//
// Two-exposure: action file (auto-registered) + agent-chat.ts Content section
// + AGENTS.md table.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Delete a content document by id. Idempotent — if the document does not exist, " +
    "the call still returns {deleted:true}. " +
    "This is a HARD delete (no recovery). " +
    "In the UI, deletes are always confirmed via an AlertDialog. " +
    "The agent should confirm destructive intent before calling this tool.",
  schema: z.object({
    id: z.string().min(1).describe("Content document id to delete"),
  }),

  run: async ({ id }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant content
    await db
      .delete(schema.contentDocuments)
      .where(eq(schema.contentDocuments.id, id));

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { deleted: true };
  },
});
