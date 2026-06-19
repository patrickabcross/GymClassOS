// GOB-02: Idempotent class-catalog seed into studio_brain_docs.
//
// On Brain route load: if the class-catalog row is absent or stale, this
// action reads class_definitions (active rows) and upserts the catalog JSON.
// It also ensures brand-voice and ethos rows exist (onConflictDoNothing) so
// the UI always has rows to render after the first Brain init.
//
// guard:allow-unscoped — studio-global single-tenant Brain (no ownableColumns)

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
// Re-export pure helper so callers can do: import { buildCatalogBody } from "./brain-init.js"
export { buildCatalogBody } from "./brain-init-helpers.js";
import { buildCatalogBody } from "./brain-init-helpers.js";

export default defineAction({
  description:
    "Initialise (or re-seed) the Studio Brain: populate class-catalog from " +
    "class_definitions and ensure brand-voice + ethos doc rows exist. " +
    "Idempotent — safe to call on every Brain page load.",
  schema: z.object({}),
  // No http key → mutation (POST-only auto-mount)
  run: async () => {
    const db = getDb();

    // guard:allow-unscoped — studio-global single-tenant Brain
    const classes = await db
      .select({
        name: schema.classDefinitions.name,
        description: schema.classDefinitions.description,
        durationMin: schema.classDefinitions.durationMin,
        category: schema.classDefinitions.category,
      })
      .from(schema.classDefinitions)
      .where(eq(schema.classDefinitions.active, true))
      .orderBy(schema.classDefinitions.name);

    const body = buildCatalogBody(classes);
    const nowIso = new Date().toISOString();

    // Upsert the class-catalog row — always refreshes on init.
    // guard:allow-unscoped — studio-global single-tenant Brain
    await db
      .insert(schema.studioBrainDocs)
      .values({
        id: "class-catalog",
        docType: "class-catalog",
        title: "Class Catalog",
        body,
        seededAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: schema.studioBrainDocs.id,
        set: {
          body,
          docType: "class-catalog",
          title: "Class Catalog",
          seededAt: nowIso,
          updatedAt: nowIso,
        },
      });

    // Ensure brand-voice row exists (do nothing if already seeded/edited).
    // guard:allow-unscoped — studio-global single-tenant Brain
    await db
      .insert(schema.studioBrainDocs)
      .values({
        id: "brand-voice",
        docType: "brand-voice",
        title: "Brand Voice",
        body: "",
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoNothing();

    // Ensure ethos row exists (do nothing if already seeded/edited).
    // guard:allow-unscoped — studio-global single-tenant Brain
    await db
      .insert(schema.studioBrainDocs)
      .values({
        id: "ethos",
        docType: "ethos",
        title: "Studio Ethos",
        body: "",
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoNothing();

    return { seeded: true, classCount: classes.length };
  },
});
