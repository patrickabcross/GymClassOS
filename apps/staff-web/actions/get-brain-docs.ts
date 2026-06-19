// GOB-03: Read all studio Brain docs.
//
// Returns all rows from studio_brain_docs. The Brain route calls this on
// mount and after every write (via useChangeVersions live-refresh) to display
// brand-voice, ethos, and class-catalog docs.
//
// guard:allow-unscoped — studio-global single-tenant Brain (no ownableColumns)

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Get all studio Brain documents (brand-voice, ethos, class-catalog). " +
    "Returns an array of { id, docType, title, body, seededAt, updatedAt }.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();

    // guard:allow-unscoped — studio-global single-tenant Brain
    const rows = await db.select().from(schema.studioBrainDocs);

    return rows.map((r) => ({
      id: r.id,
      docType: r.docType,
      title: r.title,
      body: r.body,
      seededAt: r.seededAt,
      updatedAt: r.updatedAt,
    }));
  },
});
