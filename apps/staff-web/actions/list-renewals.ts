import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, count, eq, gte, isNotNull, lte } from "drizzle-orm";

export default defineAction({
  description:
    "Summarise renewal numbers — count of active Stripe subscriptions and count of passes expiring in the next 7 and 30 days. " +
    "Use this when asked for renewal numbers, retention figures, or upcoming-renewals context. " +
    "Returns { activeSubscriptions, subscriptionsRenewingNext30d, expiringPasses7d, expiringPasses30d, asOf }.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000).toISOString();
    const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString();
    const nowIso = now.toISOString();

    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
    // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
    const [activeSubsRow] = await db
      .select({ c: count() })
      .from(schema.stripeSubscriptions)
      .where(eq(schema.stripeSubscriptions.status, "active"));

    const [renewingSoonRow] = await db
      .select({ c: count() })
      .from(schema.stripeSubscriptions)
      .where(
        and(
          eq(schema.stripeSubscriptions.status, "active"),
          isNotNull(schema.stripeSubscriptions.currentPeriodEnd),
          gte(schema.stripeSubscriptions.currentPeriodEnd, nowIso),
          lte(schema.stripeSubscriptions.currentPeriodEnd, in30Days),
        ),
      );

    const [expiring7Row] = await db
      .select({ c: count() })
      .from(schema.passes)
      .where(
        and(
          isNotNull(schema.passes.expiresAt),
          gte(schema.passes.expiresAt, nowIso),
          lte(schema.passes.expiresAt, in7Days),
        ),
      );

    const [expiring30Row] = await db
      .select({ c: count() })
      .from(schema.passes)
      .where(
        and(
          isNotNull(schema.passes.expiresAt),
          gte(schema.passes.expiresAt, nowIso),
          lte(schema.passes.expiresAt, in30Days),
        ),
      );

    return {
      activeSubscriptions: Number(activeSubsRow?.c ?? 0),
      subscriptionsRenewingNext30d: Number(renewingSoonRow?.c ?? 0),
      expiringPasses7d: Number(expiring7Row?.c ?? 0),
      expiringPasses30d: Number(expiring30Row?.c ?? 0),
      asOf: nowIso,
    };
  },
});
