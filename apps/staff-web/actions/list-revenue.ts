// list-revenue — agent tool that mirrors the Business section of
// /gymos/analytics so the assistant can answer "what's our MRR?",
// "did we grow this month?", and "how much drop-in revenue last month?".
//
// Pricing source: https://www.doyouhustle.co.uk/join (fetched 2026-05-25).
// Constants intentionally duplicated from gymos.analytics.tsx — the loader is
// the public truth for the dashboard, this action mirrors it for the agent.
// If prices change, update both (search for "PRICES = {" in apps/staff-web/).
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, gte, sql } from "drizzle-orm";

const PRICES = {
  unlimited: 8500, // pence — £85/mo Unlimited Class Membership
  limited: 4400, // pence — £44/mo Limited Class Membership
  tenPack: 10000, // pence — £100 per 10-pack
} as const;

export default defineAction({
  description:
    "Summarise gym revenue figures from Stripe subscriptions and 10-pack pass purchases. " +
    "Returns Monthly Recurring Revenue (MRR), drop-in revenue from 10-pack sales in the last 30 days, " +
    "Average Revenue Per Member (ARPM), and net member growth (acquired vs lost) in the last 30 days. " +
    "Use this when asked for revenue, MRR, ARPM, churn, growth, or 'are we net positive this month'. " +
    "All monetary values are in GBP minor units (pence) — convert to pounds at the display boundary. " +
    "Returns { mrrPence, mrrPounds, activeSubscribers, unlimitedCount, limitedCount, dropInRevenuePence30d, dropInRevenuePounds30d, tenPacksSold30d, arpmPence, arpmPounds, acquired30d, lost30d, net30d, asOf }.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    const now = new Date();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 86400000,
    ).toISOString();
    const nowIso = now.toISOString();

    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
    // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.

    // MRR — bucket subscribers by plan, multiply by tier price.
    const subRows = await db
      .select({
        planId: schema.stripeSubscriptions.planId,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.stripeSubscriptions)
      .where(
        sql`${schema.stripeSubscriptions.status} IN ('active', 'trialing', 'past_due')`,
      )
      .groupBy(schema.stripeSubscriptions.planId);

    let mrrPence = 0;
    let activeSubscribers = 0;
    let unlimitedCount = 0;
    let limitedCount = 0;
    for (const r of subRows) {
      const c = Number(r.count ?? 0);
      activeSubscribers += c;
      if (r.planId === "plan_monthly_unlimited") {
        mrrPence += c * PRICES.unlimited;
        unlimitedCount += c;
      } else {
        mrrPence += c * PRICES.limited;
        limitedCount += c;
      }
    }

    // Drop-in revenue (30d) — 10-Pack purchases. Note capital-P, matches the
    // seed (seed-demo-data.ts:460,487).
    const [dropRow] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.passes)
      .where(
        and(
          eq(schema.passes.source, "purchase"),
          eq(schema.passes.productName, "10-Pack"),
          gte(schema.passes.createdAt, thirtyDaysAgo),
        ),
      );
    const tenPacksSold30d = Number(dropRow?.c ?? 0);
    const dropInRevenuePence30d = tenPacksSold30d * PRICES.tenPack;

    // Net growth (30d).
    const [acqRow] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.gymMembers)
      .where(gte(schema.gymMembers.createdAt, thirtyDaysAgo));
    const [lostRow] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.stripeSubscriptions)
      .where(
        and(
          eq(schema.stripeSubscriptions.status, "canceled"),
          gte(schema.stripeSubscriptions.updatedAt, thirtyDaysAgo),
        ),
      );
    const acquired30d = Number(acqRow?.c ?? 0);
    const lost30d = Number(lostRow?.c ?? 0);

    const arpmPence =
      activeSubscribers > 0 ? Math.round(mrrPence / activeSubscribers) : null;

    return {
      mrrPence,
      mrrPounds: Math.round(mrrPence / 100),
      activeSubscribers,
      unlimitedCount,
      limitedCount,
      dropInRevenuePence30d,
      dropInRevenuePounds30d: Math.round(dropInRevenuePence30d / 100),
      tenPacksSold30d,
      arpmPence,
      arpmPounds: arpmPence === null ? null : Math.round(arpmPence / 100),
      acquired30d,
      lost30d,
      net30d: acquired30d - lost30d,
      asOf: nowIso,
    };
  },
});
