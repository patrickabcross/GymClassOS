// content-create-document — CV2-01
//
// Draft a new content document. Optionally accepts a client-generated `id` for
// optimistic UI (the frontend creates the id, navigates immediately, then this
// persists the row). title defaults to "Untitled". status is always 'draft'.
//
// Agent-callable mutation: no `http` key (POST to /_agent-native/actions/content-create-document).
// DIRECT — no propose-action gate. Staff-only authoring, like update-member.
//
// Two-exposure: defined here (auto-registered) AND named in agent-chat.ts
// Content section AND documented in apps/staff-web/AGENTS.md.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { nanoid } from "nanoid";
import { slugify } from "../server/lib/content-slug.js";

export default defineAction({
  description:
    "Draft a new content document for the studio (title, body?). " +
    "body is rich-text HTML (headings, lists, links, images). " +
    "An optional `id` can be supplied for optimistic UI — the caller " +
    "generates the id client-side and navigates immediately; this action " +
    "persists the row. title defaults to 'Untitled'. Status is always 'draft' " +
    "(publishing arrives in CV4). Returns {id, title, status, slug, createdAt, updatedAt}. " +
    "Use for: 'draft a welcome post for our new HIIT class', " +
    "'create a content document about the studio's ethos'.",
  schema: z.object({
    id: z.string().optional().describe("Pre-generated id for optimistic UI"),
    title: z.string().max(500).optional().describe("Document title (defaults to 'Untitled')"),
    body: z.string().optional().describe("Tiptap HTML body content"),
  }),

  run: async ({ id: suppliedId, title: suppliedTitle, body }) => {
    const db = getDb();
    const id = suppliedId ?? nanoid();
    const title = suppliedTitle ?? "Untitled";
    const slug = slugify(title) || id;
    const now = new Date().toISOString();

    // guard:allow-unscoped — single-tenant content
    await db.insert(schema.contentDocuments).values({
      id,
      title,
      body: body ?? "",
      status: "draft",
      slug,
      createdAt: now,
      updatedAt: now,
    });

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { id, title, status: "draft", slug, createdAt: now, updatedAt: now };
  },
});
