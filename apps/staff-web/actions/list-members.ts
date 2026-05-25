import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { ilike, or, asc, sql } from "drizzle-orm";

export default defineAction({
  description:
    "List gym members, optionally filtered by name or phone prefix. " +
    "Use this when asked who the gym's members are, or as supporting context when discussing a specific person. " +
    "Returns id, name (first + last), phoneE164, email (if present), and createdAt for each member. Limited to 100 results.",
  schema: z.object({
    query: z
      .string()
      .optional()
      .describe("Optional name or phone prefix to filter members"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50),
  }),
  http: { method: "GET" },
  run: async ({ query, limit }) => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
    // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
    const baseQuery = db
      .select({
        id: schema.gymMembers.id,
        firstName: schema.gymMembers.firstName,
        lastName: schema.gymMembers.lastName,
        phoneE164: schema.gymMembers.phoneE164,
        email: schema.gymMembers.email,
        createdAt: schema.gymMembers.createdAt,
      })
      .from(schema.gymMembers);

    const trimmed = query?.trim() ?? "";
    const rows = trimmed.length > 0
      ? await baseQuery
          .where(
            or(
              ilike(schema.gymMembers.firstName, `%${trimmed}%`),
              ilike(schema.gymMembers.lastName, `%${trimmed}%`),
              ilike(schema.gymMembers.phoneE164, `%${trimmed}%`),
            ),
          )
          .orderBy(asc(schema.gymMembers.firstName))
          .limit(limit)
      : await baseQuery
          .orderBy(asc(schema.gymMembers.firstName))
          .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
      firstName: r.firstName,
      lastName: r.lastName,
      phoneE164: r.phoneE164,
      email: r.email,
      createdAt: r.createdAt,
    }));
  },
});
