// content-list-documents — CV2-01
//
// List all content_documents metadata ordered by most recently updated.
// Does NOT return full body content — use content-get-document for the full body.
// Returns a bodyPreview (first ~180 chars, HTML stripped).
//
// Read action: http: { method: "GET" }, readOnly: true.
// guard:allow-unscoped — single-tenant content (no ownableColumns).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { desc } from "drizzle-orm";

function bodyPreview(html: string, maxLength = 180): string {
  const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength).trimEnd()}...`;
}

export default defineAction({
  description:
    "List all studio content documents (id, title, status, slug, updatedAt, bodyPreview). " +
    "Does NOT return full body HTML — use content-get-document to fetch one document's complete body. " +
    "Ordered by most recently updated first. " +
    "Returns {documents: [{id, title, status, slug, updatedAt, createdAt, bodyPreview}]}.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,

  run: async () => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant content
    const rows = await db
      .select({
        id: schema.contentDocuments.id,
        title: schema.contentDocuments.title,
        status: schema.contentDocuments.status,
        slug: schema.contentDocuments.slug,
        body: schema.contentDocuments.body,
        updatedAt: schema.contentDocuments.updatedAt,
        createdAt: schema.contentDocuments.createdAt,
      })
      .from(schema.contentDocuments)
      .orderBy(desc(schema.contentDocuments.updatedAt));

    const documents = rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      slug: r.slug,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
      bodyPreview: bodyPreview(r.body),
    }));

    return { documents };
  },
});
