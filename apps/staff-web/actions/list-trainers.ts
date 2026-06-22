// list-trainers — LP3
//
// Returns active trainers ordered by name. Used to populate a trainer picker
// in the New Class dialog and by the agent to answer "who teaches" queries.
//
// Two-exposed: action file (auto-registered) + agent-chat.ts Schedule section
// + AGENTS.md Agent Actions table.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq, asc } from "drizzle-orm";

export default defineAction({
  description:
    "List active trainers (id, name, homeLocation) for the studio roster. " +
    "Use to populate a trainer picker or answer who teaches a class.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables
    const rows = await db
      .select({
        id: schema.trainers.id,
        name: schema.trainers.name,
        homeLocation: schema.trainers.homeLocation,
      })
      .from(schema.trainers)
      .where(eq(schema.trainers.active, true))
      .orderBy(asc(schema.trainers.name));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      homeLocation: r.homeLocation,
    }));
  },
});
