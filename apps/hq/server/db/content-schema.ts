/**
 * apps/hq/server/db/content-schema.ts
 *
 * HQ Content documents schema — NON-COLLAB path (D-03 / D-10 / BD1).
 *
 * Forked from: templates/content/server/db/schema.ts
 * Fork date: 2026-06-19
 * Reason: HQD-04 Content fork (non-collab) — single super-admin, no Yjs/CRDT.
 *
 * DROPPED vs upstream:
 *   - documentComments (collab-only; add-comment/list-comments actions dropped)
 *   - documentSyncLinks (Notion sync — not needed)
 *   - notionCommentId column from documentComments
 * KEPT:
 *   - documents — core table with ownableColumns() for HQ org scoping
 *   - documentVersions — version snapshot ring buffer (no collab dependency)
 *   - documentShares — standard share table for accessFilter
 *
 * No Yjs / collab / Notion columns — guard:hq-no-pii passes by design
 * (no connection/database_url/dsn columns).
 */

import {
  table,
  text,
  integer,
  now,
  ownableColumns,
  createSharesTable,
} from "@agent-native/core/db/schema";

export const documents = table("documents", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  icon: text("icon"),
  position: integer("position").notNull().default(0),
  isFavorite: integer("is_favorite").notNull().default(0),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
  ...ownableColumns(),
});

export const documentVersions = table("document_versions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  documentId: text("document_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(now()),
});

export const documentShares = createSharesTable("document_shares");
