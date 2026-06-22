// create-trainer — LP3
//
// Reactivate-or-create a trainer by name. Dedupes via lower(name) lookup so
// calling create-trainer with an existing name is always safe:
//   - name matches an INACTIVE trainer → reactivate (and optionally update
//     homeLocation if provided)
//   - name matches an ACTIVE trainer → idempotent no-op (optionally update
//     homeLocation if provided)
//   - no match → insert a fresh row with trn_<nanoid> id
//
// This mirrors the member-upsert dual-key reconciliation pattern documented in
// MEMORY.md to avoid blindly hitting the unique index and losing data.
//
// Two-exposed: action file + agent-chat.ts Schedule section + AGENTS.md table.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { sql, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Add a trainer to the studio roster ({name, homeLocation?}). " +
    "Dedupes by name — reactivates a deactivated same-name trainer instead of inserting a duplicate. " +
    "Returns {id, name}.",
  schema: z.object({
    name: z.string().min(1).max(120),
    homeLocation: z.string().max(120).optional(),
  }),
  run: async ({ name, homeLocation }) => {
    const db = getDb();

    // Look up an existing trainer by lower(name) match (case-insensitive dedupe).
    // guard:allow-unscoped — single-tenant gym tables
    const [existing] = await db
      .select({
        id: schema.trainers.id,
        name: schema.trainers.name,
        active: schema.trainers.active,
      })
      .from(schema.trainers)
      .where(sql`lower(${schema.trainers.name}) = lower(${name})`)
      .limit(1);

    if (existing) {
      // Build update object — always try to set homeLocation if provided.
      const updates: Partial<typeof schema.trainers.$inferInsert> = {};
      if (!existing.active) updates.active = true; // reactivate
      if (homeLocation !== undefined) updates.homeLocation = homeLocation;

      if (Object.keys(updates).length > 0) {
        // guard:allow-unscoped — single-tenant gym tables
        await db
          .update(schema.trainers)
          .set(updates)
          .where(eq(schema.trainers.id, existing.id));
      }
      return { id: existing.id, name: existing.name };
    }

    // No match — insert a fresh trainer.
    const id = `trn_${nanoid()}`;
    const createdAt = new Date().toISOString();
    // guard:allow-unscoped — single-tenant gym tables
    await db.insert(schema.trainers).values({
      id,
      name,
      homeLocation: homeLocation ?? null,
      active: true,
      createdAt,
    });
    return { id, name };
  },
});
