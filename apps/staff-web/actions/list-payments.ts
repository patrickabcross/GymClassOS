import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { desc, eq } from "drizzle-orm";

export default defineAction({
  description:
    "List the 100 most-recent Stripe payments recorded in the payments table, " +
    "joined to the gym member who made the payment (if known). " +
    "Use this when asked for recent payments, payment history, 'who paid recently', " +
    "or any question about payment activity. " +
    "Returns { payments: Array<{ id, memberId, amountMinorUnits, currency, status, occurredAt, memberName, memberPhone }> } " +
    "where amountMinorUnits is the raw integer (e.g. 1200 for £12.00) and currency is lowercase ISO (e.g. 'gbp'). " +
    "memberName is the composed first+last name or null if the payment has no linked member. " +
    "memberPhone is the E.164 phone or null. Results are ordered most-recent first.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();

    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
    // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
    const rows = await db
      .select({
        id: schema.payments.id,
        memberId: schema.payments.memberId,
        amountMinorUnits: schema.payments.amountMinorUnits,
        currency: schema.payments.currency,
        status: schema.payments.status,
        occurredAt: schema.payments.occurredAt,
        firstName: schema.gymMembers.firstName,
        lastName: schema.gymMembers.lastName,
        phoneE164: schema.gymMembers.phoneE164,
      })
      .from(schema.payments)
      .leftJoin(
        schema.gymMembers,
        eq(schema.gymMembers.id, schema.payments.memberId),
      )
      .orderBy(desc(schema.payments.occurredAt))
      .limit(100);

    return {
      payments: rows.map((r) => ({
        id: r.id,
        memberId: r.memberId,
        amountMinorUnits: Number(r.amountMinorUnits),
        currency: r.currency,
        status: r.status,
        occurredAt: r.occurredAt,
        memberName:
          [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || null,
        memberPhone: r.phoneE164 ?? null,
      })),
    };
  },
});
