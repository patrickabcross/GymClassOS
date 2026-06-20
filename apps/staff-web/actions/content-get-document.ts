// content-get-document — CV2-01
//
// Fetch a single content_documents row by id, including the full body HTML.
// Used by the editor route (gymos.content_.$id.tsx) on mount and by the agent
// when it needs to read the current body before rewriting.
//
// Read action: http: { method: "GET" }, readOnly: true.
// guard:allow-unscoped — single-tenant content (no ownableColumns).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Fetch a single content document's full body HTML by id. " +
    "Returns {id, title, body, status, slug, createdAt, updatedAt}. " +
    "Returns {error: 'NOT_FOUND'} if the document does not exist. " +
    "Use this before rewriting or editing a document's body.",
  schema: z.object({
    id: z.string().min(1).describe("Content document id"),
  }),
  http: { method: "GET" },
  readOnly: true,

  run: async ({ id }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant content
    const [doc] = await db
      .select()
      .from(schema.contentDocuments)
      .where(eq(schema.contentDocuments.id, id))
      .limit(1);

    if (!doc) return { error: "NOT_FOUND" };

    return {
      id: doc.id,
      title: doc.title,
      body: doc.body,
      status: doc.status,
      slug: doc.slug,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  },
});
