import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { sql } from "drizzle-orm";

export default defineAction({
  description:
    "Identify gym members at risk of churn — members whose last attended class is more than 14 days ago, " +
    "or whose passes are expiring soon, or who have zero bookings in the last 30 days. " +
    "Use this when asked which customers to reach out to, retention outreach, or churn risk. " +
    "Returns an array sorted by most-at-risk first, each row containing memberId, name, phoneE164, " +
    "lastAttendedAt (nullable), bookingCount30d, and earliestPassExpiry (nullable).",
  schema: z.object({
    inactiveDays: z.coerce
      .number()
      .int()
      .min(7)
      .max(180)
      .optional()
      .default(14)
      .describe(
        "Days since last attended class to consider a member at risk (default 14)",
      ),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
  }),
  http: { method: "GET" },
  run: async ({ inactiveDays, limit }) => {
    const db = getDb();
    const now = new Date();
    const inactiveCutoff = new Date(
      now.getTime() - inactiveDays * 86400000,
    ).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const passSoonCutoff = new Date(
      now.getTime() + 14 * 86400000,
    ).toISOString();
    const nowIso = now.toISOString();

    // Single-query approach using subselects for last-attended (joins to
    // class_occurrences for starts_at), 30d booking count, and earliest
    // unexpired pass expiry. Subselects + ${...} use Drizzle's safe parameter
    // binding — these are not raw string concatenations.
    //
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
    // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
    // NOTE: the correlated subqueries reference the outer member id as the
    // LITERAL "gym_members"."id" — NOT ${schema.gymMembers.id}. Drizzle drops
    // the table qualifier for single-table FROM queries (bare "id"), which is
    // ambiguous inside these subqueries (bookings/class_occurrences/passes also
    // have an "id") → Postgres 42702. Keep the qualifier literal.
    const rows = await db
      .select({
        memberId: schema.gymMembers.id,
        firstName: schema.gymMembers.firstName,
        lastName: schema.gymMembers.lastName,
        phoneE164: schema.gymMembers.phoneE164,
        lastAttendedAt: sql<string | null>`(
          SELECT MAX(co.starts_at) FROM bookings b
          JOIN class_occurrences co ON co.id = b.occurrence_id
          WHERE b.member_id = "gym_members"."id" AND b.status = 'attended'
        )`,
        bookingCount30d: sql<number>`(
          SELECT COUNT(*) FROM bookings b
          WHERE b.member_id = "gym_members"."id"
            AND b.booked_at >= ${thirtyDaysAgo}
        )`,
        earliestPassExpiry: sql<string | null>`(
          SELECT MIN(p.expires_at) FROM passes p
          WHERE p.member_id = "gym_members"."id"
            AND p.expires_at IS NOT NULL
            AND p.expires_at >= ${nowIso}
        )`,
      })
      .from(schema.gymMembers)
      // Pull more than limit so we can filter down to at-risk in code. Safe
      // because pilot studio member counts are small (5-50).
      .limit(limit * 4);

    const atRisk = rows
      .map((r) => ({
        memberId: r.memberId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
        phoneE164: r.phoneE164,
        lastAttendedAt: r.lastAttendedAt ?? null,
        bookingCount30d: Number(r.bookingCount30d ?? 0),
        earliestPassExpiry: r.earliestPassExpiry ?? null,
      }))
      .filter((m) => {
        const noRecentAttendance =
          !m.lastAttendedAt || m.lastAttendedAt < inactiveCutoff;
        const noBookings30d = m.bookingCount30d === 0;
        const passExpiringSoon =
          m.earliestPassExpiry !== null &&
          m.earliestPassExpiry >= nowIso &&
          m.earliestPassExpiry <= passSoonCutoff;
        return noRecentAttendance || noBookings30d || passExpiringSoon;
      })
      .sort((a, b) => {
        // Most at-risk first: never attended > oldest attendance
        if (!a.lastAttendedAt && !b.lastAttendedAt) return 0;
        if (!a.lastAttendedAt) return -1;
        if (!b.lastAttendedAt) return 1;
        return a.lastAttendedAt.localeCompare(b.lastAttendedAt);
      })
      .slice(0, limit);

    return atRisk;
  },
});
