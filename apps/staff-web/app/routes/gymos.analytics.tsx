// GymClassOS Analytics — P1b.1-06 + P1b.1-livefix (business metrics) + 260531-kbm redesign.
//
// Read-only operational dashboard, two sections:
//   Activity   — Fill Rate, Cancellation Rate, Pass Utilisation
//   Business   — MRR, Drop-in Revenue (30d), Net Growth (30d), ARPM
//
// Loader fans every query out in parallel via Promise.all per UI-SPEC.
// All metrics degrade gracefully — "No data yet" / "–" when the window is empty.
//
// Deviations from PLAN.md (auto-applied):
//   - Rule 1: `passes` table has NO `status` column (schema.ts:235); the plan's
//     `eq(passes.status, "active")` won't compile. Active is defined as
//     `expires_at IS NULL OR expires_at >= now()` — same definition used in
//     list-at-risk-members.ts and gymos.members.tsx for balance computation.
//   - Rule 1: react-router v7 framework mode does not export `json()` from the
//     `react-router` package — loaders return plain objects (matches every
//     sibling route in this repo: gymos._index.tsx, gymos.members.tsx, etc).
//   - Rule 1: tsconfig.json paths only define `@/*`, not `~/*` — switched all
//     `~/components/ui/...` imports to `@/components/ui/...` (matches the
//     convention used in gymos.members.$id.tsx and every other staff-web file).
//   - Rule 1: shadcn CardTitle defaults to a font size disallowed by UI-SPEC
//     (the second-largest body size, see card.tsx CardTitle). The analytics
//     metric labels need text-[12px] uppercase per UI-SPEC §3, so we render the
//     label in a plain <div> inside CardHeader rather than via CardTitle.
//   - Rule 1 (livefix): seed productName is "10-Pack" (capital P) at
//     seed-demo-data.ts:460,487 — match casing exactly when filtering passes.
//   - Rule 1 (260531-kbm redesign): KPI primary values are now rendered at
//     Display / metric size — `text-3xl font-semibold` (~30px, weight 600) for all
//     cards, and `text-4xl font-semibold` (~36px, weight 600) for MRR (the single
//     most-important Business KPI). This reverses the 2026-05-25 UI-SPEC checker
//     downgrade from text-2xl → text-sm and is the authorized successor per the
//     updated Typography section in P1b.1-UI-SPEC.md. The new Display / metric
//     role is scoped to /gymos/analytics only — all other gymos surfaces continue
//     using the 4-size 10–14px scale. Direction-aware trend indicators
//     (IconTrendingUp / IconTrendingDown / IconMinus) are shown on the two
//     7d→30d comparison cards (Fill Rate and Cancellation Rate) only: emerald for
//     a genuinely-good direction, muted for neutral/bad — never destructive red.
//
// Requirements covered: INBX-01 (analytics tab destination, no longer 404).
//
// Skeleton loading state (UI-SPEC §"Loading states"): deferred to P2. This
// route's loader runs synchronously in SSR — the first paint always carries
// real values, and there is no client-side fetcher whose `state==="loading"`
// could trigger a skeleton on revalidation. If/when this route grows a
// fetcher (e.g. a date-range picker), wrap each MetricCard value/context in
// shadcn `<Skeleton>` (h-8 w-24 + h-4 w-32) per the UI-SPEC contract.

import { useLoaderData } from "react-router";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from "@tabler/icons-react";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymClassOS — Analytics" }];
}

// ─── Pricing constants ──────────────────────────────────────────────────────
//
// Source: https://www.doyouhustle.co.uk/join (fetched 2026-05-25).
// All values in minor units (pence) so MRR / drop-in math stays integer
// throughout — divide by 100 only at the render boundary.
//
// Tier mapping:
//   plan_monthly_unlimited → £85 / month  (Unlimited Class Membership)
//   plan_drop_in_10        → £44 / month  (Limited Class Membership, ~1-2/wk)
//                                          treated as the closest "subscription"
//                                          equivalent for revenue purposes —
//                                          the seed uses this plan_id for the
//                                          non-unlimited sub cohort, so map it
//                                          to the published Limited tier price.
//   Drop-in (per class)    → £10
//   10-pack bundle         → £10 × 10 = £100 (sticker price; no bundle
//                                          discount published on the join page)
const PRICES = {
  unlimited: 8500, // pence — £85/mo Unlimited Class Membership
  limited: 4400, // pence — £44/mo Limited Class Membership (1-2 cls/wk)
  dropIn: 1000, // pence — £10 per drop-in class
  tenPack: 10000, // pence — £100 per 10-pack (10 × £10, sticker; no bundle discount published)
} as const;

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const db = getDb();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const nowIso = now.toISOString();

  // ─── Helper: Fill rate within a date range ──────────────────────────────
  //
  // booked seats = bookings (status booked|attended) against non-cancelled
  //                occurrences whose starts_at falls inside the window.
  // capacity     = SUM(class_occurrences.capacity) for those same occurrences.
  // pct          = booked / capacity, rounded.
  //
  // Why two queries instead of one with a leftJoin: leftJoin from
  // class_occurrences to bookings fans out occurrence rows by booking count,
  // so SUM(capacity) over the joined result multi-counts capacity. We compute
  // capacity from the un-joined occurrences table and the booking count from
  // a join in the opposite direction, then divide in JS.
  //
  // Same windowing predicates run on both sides so the ratio stays consistent.
  //
  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
  // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
  async function fillRate(sinceIso: string) {
    const occurrenceWhere = and(
      gte(schema.classOccurrences.startsAt, sinceIso),
      lt(schema.classOccurrences.startsAt, nowIso),
      ne(schema.classOccurrences.status, "cancelled"),
    );

    const [capRow] = await db
      .select({
        capacity: sql<number>`COALESCE(SUM(${schema.classOccurrences.capacity}), 0)`,
        occurrenceCount: sql<number>`COUNT(*)`,
      })
      .from(schema.classOccurrences)
      .where(occurrenceWhere);

    const [bookRow] = await db
      .select({
        booked: sql<number>`COUNT(CASE WHEN ${schema.bookings.status} IN ('booked', 'attended') THEN 1 ELSE NULL END)`,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.classOccurrences,
        eq(schema.bookings.occurrenceId, schema.classOccurrences.id),
      )
      .where(occurrenceWhere);

    const capacity = Number(capRow?.capacity ?? 0);
    const occurrenceCount = Number(capRow?.occurrenceCount ?? 0);
    const booked = Number(bookRow?.booked ?? 0);
    return {
      booked,
      capacity,
      occurrenceCount,
      pct: capacity > 0 ? Math.round((booked / capacity) * 100) : null,
    };
  }

  // ─── Helper: Cancellation rate within a date range ─────────────────────
  //
  // cancelled = bookings with status='cancelled' booked in window
  // total     = total bookings booked in window
  //
  // guard:allow-unscoped — single-tenant gym tables.
  async function cancellationRate(sinceIso: string) {
    const [r] = await db
      .select({
        cancelled: sql<number>`COUNT(CASE WHEN ${schema.bookings.status} = 'cancelled' THEN 1 ELSE NULL END)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(schema.bookings)
      .where(gte(schema.bookings.bookedAt, sinceIso));
    const cancelled = Number(r?.cancelled ?? 0);
    const total = Number(r?.total ?? 0);
    return {
      cancelled,
      total,
      pct: total > 0 ? Math.round((cancelled / total) * 100) : null,
    };
  }

  // ─── Helper: Pass utilisation snapshot ──────────────────────────────────
  //
  // "Active pass" definition: passes.expires_at IS NULL OR expires_at >= now.
  // (passes table has no `status` column — schema.ts:235. Same definition is
  // used in list-at-risk-members.ts and gymos.members.$id.tsx balance calcs.)
  //
  // withDebit  = distinct active passes that have ≥1 positive debit
  // totalActive = distinct active passes
  //
  // guard:allow-unscoped — single-tenant gym tables.
  async function passUtilisation() {
    const [r] = await db
      .select({
        withDebit: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.passDebits.amount} > 0 THEN ${schema.passes.id} ELSE NULL END)`,
        totalActive: sql<number>`COUNT(DISTINCT ${schema.passes.id})`,
      })
      .from(schema.passes)
      .leftJoin(
        schema.passDebits,
        eq(schema.passDebits.passId, schema.passes.id),
      )
      .where(
        sql`${schema.passes.expiresAt} IS NULL OR ${schema.passes.expiresAt} >= ${nowIso}`,
      );
    const withDebit = Number(r?.withDebit ?? 0);
    const totalActive = Number(r?.totalActive ?? 0);
    return {
      withDebit,
      totalActive,
      pct: totalActive > 0 ? Math.round((withDebit / totalActive) * 100) : null,
    };
  }

  // ─── Helper: MRR + active subscriber breakdown ─────────────────────────
  //
  // MRR = SUM(price for each non-terminal sub) where price is mapped from
  // plan_id. Treat 'active', 'trialing', 'past_due' as revenue-bearing —
  // past_due is still on the books and Stripe will retry the charge.
  //
  // Plan tier mapping comes from seed-demo-data.ts:740-742 which writes
  // `plan_monthly_unlimited` and `plan_drop_in_10`. Unknown plans default to
  // the Limited tier (the cheaper of the two known options) so MRR doesn't
  // over-state on bad data.
  //
  // guard:allow-unscoped — single-tenant gym tables.
  async function mrr() {
    const rows = await db
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
    let activeSubs = 0;
    let unlimitedCount = 0;
    let limitedCount = 0;
    for (const r of rows) {
      const c = Number(r.count ?? 0);
      activeSubs += c;
      if (r.planId === "plan_monthly_unlimited") {
        mrrPence += c * PRICES.unlimited;
        unlimitedCount += c;
      } else {
        // plan_drop_in_10 + any unknown plan → Limited tier (£44)
        mrrPence += c * PRICES.limited;
        limitedCount += c;
      }
    }
    return { mrrPence, activeSubs, unlimitedCount, limitedCount };
  }

  // ─── Helper: Drop-in revenue (30d) ──────────────────────────────────────
  //
  // 10-Pack purchases sold in the last 30d × PRICES.tenPack.
  // Seed inserts `productName: "10-Pack"` (capital P, seed-demo-data.ts:460,487)
  // — match case exactly.
  //
  // guard:allow-unscoped — single-tenant gym tables.
  async function dropInRevenue30d() {
    const [r] = await db
      .select({
        packsSold: sql<number>`COUNT(*)`,
      })
      .from(schema.passes)
      .where(
        and(
          eq(schema.passes.source, "purchase"),
          eq(schema.passes.productName, "10-Pack"),
          gte(schema.passes.createdAt, thirtyDaysAgo),
        ),
      );
    const packsSold = Number(r?.packsSold ?? 0);
    return {
      packsSold,
      revenuePence: packsSold * PRICES.tenPack,
    };
  }

  // ─── Helper: Net membership growth (30d) ────────────────────────────────
  //
  // Acquired = COUNT(gym_members) where created_at within last 30d.
  // Lost     = COUNT(stripe_subscriptions) where status='canceled' AND
  //            updated_at within last 30d. (No archived_at on gym_members;
  //            sub cancellation is the cleanest churn proxy in the schema.)
  // Net      = Acquired - Lost.
  //
  // guard:allow-unscoped — single-tenant gym tables.
  async function netGrowth30d() {
    const [acq] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.gymMembers)
      .where(gte(schema.gymMembers.createdAt, thirtyDaysAgo));
    const [lost] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(schema.stripeSubscriptions)
      .where(
        and(
          eq(schema.stripeSubscriptions.status, "canceled"),
          gte(schema.stripeSubscriptions.updatedAt, thirtyDaysAgo),
        ),
      );
    const acquired = Number(acq?.c ?? 0);
    const lostCount = Number(lost?.c ?? 0);
    return {
      acquired,
      lost: lostCount,
      net: acquired - lostCount,
    };
  }

  // ─── Parallel fanout ────────────────────────────────────────────────────
  const [
    fillRate7d,
    fillRate30d,
    cancRate7d,
    cancRate30d,
    passUtil,
    mrrData,
    dropIn,
    growth,
  ] = await Promise.all([
    fillRate(sevenDaysAgo),
    fillRate(thirtyDaysAgo),
    cancellationRate(sevenDaysAgo),
    cancellationRate(thirtyDaysAgo),
    passUtilisation(),
    mrr(),
    dropInRevenue30d(),
    netGrowth30d(),
  ]);

  // ARPM derives from MRR / active subscribers — computed in JS so we don't
  // run a 7th query just to divide two integers.
  const arpmPence =
    mrrData.activeSubs > 0
      ? Math.round(mrrData.mrrPence / mrrData.activeSubs)
      : null;

  return {
    fillRate7d,
    fillRate30d,
    cancRate7d,
    cancRate30d,
    passUtil,
    mrr: mrrData,
    dropIn,
    growth,
    arpmPence,
  };
}

// ─── View helpers ───────────────────────────────────────────────────────────

function formatPct(pct: number | null): string {
  // en-dash (U+2013) for empty value per UI-SPEC §3.
  return pct === null ? "–" : `${pct}%`;
}

function formatGbp(pence: number | null): string {
  if (pence === null) return "–";
  // £ + thousands-separated whole pounds. Drop pence for headline figures —
  // analytics is for orientation, not invoicing.
  const pounds = Math.round(pence / 100);
  return `£${pounds.toLocaleString("en-GB")}`;
}

function formatSignedNumber(n: number): string {
  if (n > 0) return `+${n}`;
  // Negative numbers carry their own minus sign; zero renders plain.
  return String(n);
}

// ─── Trend indicator ────────────────────────────────────────────────────────
//
// Only Fill Rate and Cancellation Rate have a 7d→30d comparison.
// Direction is metric-specific:
//   trendGoodWhen="up"   → Fill Rate (higher is better)
//   trendGoodWhen="down" → Cancellation Rate (lower is better)
//
// Colour rules (per UI-SPEC and plan trend_indicator_rules):
//   Genuinely-good direction → text-emerald-600 dark:text-emerald-400
//   Neutral/flat or bad      → text-muted-foreground
//   NEVER text-destructive   — UI-SPEC reserves destructive for failed actions.

type TrendDirection = "up" | "down" | "flat";

function computeTrend(
  primaryPct: number | null,
  secondaryPct: number | null,
): TrendDirection | null {
  if (primaryPct === null || secondaryPct === null) return null;
  const delta = primaryPct - secondaryPct;
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function formatTrendLabel(
  primaryPct: number | null,
  secondaryPct: number | null,
): string {
  if (primaryPct === null || secondaryPct === null) return "";
  const delta = primaryPct - secondaryPct;
  if (delta === 0) return "flat vs 30d";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}pts vs 30d`;
}

type TrendIndicatorProps = {
  primaryPct: number | null;
  secondaryPct: number | null;
  trendGoodWhen: "up" | "down";
};

function TrendIndicator({
  primaryPct,
  secondaryPct,
  trendGoodWhen,
}: TrendIndicatorProps) {
  const direction = computeTrend(primaryPct, secondaryPct);
  if (direction === null) return null;

  // flat is never "good" — it gets muted colour
  const isGood =
    direction === "flat"
      ? false
      : trendGoodWhen === "up"
        ? direction === "up"
        : direction === "down";

  const colorClass = isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-muted-foreground";

  const label = formatTrendLabel(primaryPct, secondaryPct);

  return (
    <div className={`flex items-center gap-1 ${colorClass}`}>
      {direction === "up" && (
        <IconTrendingUp size={14} aria-hidden className="shrink-0" />
      )}
      {direction === "down" && (
        <IconTrendingDown size={14} aria-hidden className="shrink-0" />
      )}
      {direction === "flat" && (
        <IconMinus size={14} aria-hidden className="shrink-0" />
      )}
      <span className="text-[11px]">{label}</span>
    </div>
  );
}

// ─── MetricCard ─────────────────────────────────────────────────────────────
//
// MetricCard variants:
//   - default:  7d / 30d comparison (two stacked value rows + badges + trend)
//   - snapshot: single primary value with no badge split — used for
//               point-in-time metrics like Pass Utilisation, MRR, ARPM,
//               Net Growth, Drop-in Revenue
//
// Typography (260531-kbm redesign — Display / metric role, analytics-only):
//   Label (top)   : text-[12px] uppercase tracking-wide text-muted-foreground
//   Primary value : text-3xl font-semibold (text-4xl for optional hero card)
//   Context (sub) : text-[12px] text-muted-foreground
//   30d secondary : text-sm font-semibold text-muted-foreground (baseline)

type MetricCardProps = {
  label: string;
  primaryValue: string;
  primaryContext: string;
  primaryTone?: "default" | "muted";
  /** Promote to text-4xl hero size (use for the single most-important KPI only). */
  heroSize?: boolean;
} & (
  | {
      variant?: "default";
      secondaryValue: string;
      secondaryContext: string;
      /** Raw pct values from loader for trend delta computation (no recompute). */
      primaryPct: number | null;
      secondaryPct: number | null;
      /** Direction in which an improvement is good for this metric. */
      trendGoodWhen: "up" | "down";
    }
  | {
      variant: "snapshot";
      secondaryValue?: never;
      secondaryContext?: never;
      primaryPct?: never;
      secondaryPct?: never;
      trendGoodWhen?: never;
    }
);

function MetricCard(props: MetricCardProps) {
  const { label, primaryValue, primaryContext } = props;
  const isSnapshot = props.variant === "snapshot";
  const primaryTone = props.primaryTone ?? "default";
  const heroSize = props.heroSize ?? false;

  // Display / metric role — the KPI value is the visual hero of the card.
  // text-4xl opt-in for the single most-important card (MRR).
  const sizeClass = heroSize ? "text-4xl" : "text-3xl";
  const primaryClass =
    primaryTone === "muted"
      ? `${sizeClass} font-semibold text-muted-foreground leading-none`
      : `${sizeClass} font-semibold leading-none`;

  return (
    <Card
      role="region"
      aria-label={label}
      className="p-5 border-border/50 bg-card/40"
    >
      <CardHeader className="pb-0 p-0 flex flex-row items-center justify-between space-y-0">
        <div className="text-[12px] uppercase tracking-wide text-muted-foreground font-normal">
          {label}
        </div>
      </CardHeader>
      <CardContent className="p-0 flex flex-col gap-2 mt-4">
        {/* Primary (7d) value — the visual hero */}
        <div className="flex items-baseline gap-2">
          <div className={primaryClass}>{primaryValue}</div>
          {!isSnapshot && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              7d
            </Badge>
          )}
        </div>
        {/* Primary context */}
        <div className="text-[12px] text-muted-foreground leading-snug">
          {primaryContext}
        </div>

        {/* Default variant: trend indicator + 30d baseline */}
        {!isSnapshot && (
          <>
            {/* Trend row — only rendered when both pcts are non-null */}
            <TrendIndicator
              primaryPct={props.primaryPct}
              secondaryPct={props.secondaryPct}
              trendGoodWhen={props.trendGoodWhen}
            />

            {/* 30d secondary — baseline reference, visually subordinate to 7d hero */}
            <div className="flex items-baseline gap-2 mt-2 pt-2 border-t border-border/30">
              <div className="text-sm font-semibold text-muted-foreground">
                {props.secondaryValue}
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                30d
              </Badge>
            </div>
            <div className="text-[12px] text-muted-foreground">
              {props.secondaryContext}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GymosAnalytics() {
  const data = useLoaderData<typeof loader>();

  // Net growth tone: positive = default emphasis, negative = muted (no
  // bespoke destructive colour — UI-SPEC reserves destructive for failed
  // actions, not "we lost some members").
  const netTone: "default" | "muted" =
    data.growth.net < 0 ? "muted" : "default";

  return (
    <div className="flex flex-col gap-8 p-5">
      <div>
        <h1 className="text-sm font-semibold">Analytics</h1>
        <p className="text-[11px] text-muted-foreground">
          Last 7 days · Last 30 days
        </p>
      </div>

      {/* ─── Activity section ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            label="Fill Rate"
            primaryValue={formatPct(data.fillRate7d.pct)}
            primaryContext={
              data.fillRate7d.occurrenceCount === 0
                ? "No data yet"
                : `${data.fillRate7d.booked} of ${data.fillRate7d.capacity} seats across ${data.fillRate7d.occurrenceCount} classes`
            }
            primaryPct={data.fillRate7d.pct}
            secondaryValue={formatPct(data.fillRate30d.pct)}
            secondaryContext={
              data.fillRate30d.occurrenceCount === 0
                ? "No data yet"
                : `${data.fillRate30d.booked} of ${data.fillRate30d.capacity} seats across ${data.fillRate30d.occurrenceCount} classes`
            }
            secondaryPct={data.fillRate30d.pct}
            trendGoodWhen="up"
          />
          <MetricCard
            label="Cancellation Rate"
            primaryValue={formatPct(data.cancRate7d.pct)}
            primaryContext={
              data.cancRate7d.total === 0
                ? "No data yet"
                : `${data.cancRate7d.cancelled} of ${data.cancRate7d.total} bookings`
            }
            primaryPct={data.cancRate7d.pct}
            secondaryValue={formatPct(data.cancRate30d.pct)}
            secondaryContext={
              data.cancRate30d.total === 0
                ? "No data yet"
                : `${data.cancRate30d.cancelled} of ${data.cancRate30d.total} bookings`
            }
            secondaryPct={data.cancRate30d.pct}
            trendGoodWhen="down"
          />
          <MetricCard
            variant="snapshot"
            label="Pass Utilisation"
            primaryValue={formatPct(data.passUtil.pct)}
            primaryContext={
              data.passUtil.totalActive === 0
                ? "No data yet"
                : `${data.passUtil.withDebit} of ${data.passUtil.totalActive} active passes used · snapshot`
            }
          />
        </div>
      </div>

      {/* ─── Business section ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Business</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* MRR gets text-4xl hero size — the single most-important Business KPI */}
          <MetricCard
            variant="snapshot"
            heroSize
            label="Monthly Recurring Revenue"
            primaryValue={formatGbp(data.mrr.mrrPence)}
            primaryContext={
              data.mrr.activeSubs === 0
                ? "No active subscribers"
                : `${data.mrr.activeSubs} active subscribers · ${data.mrr.unlimitedCount} unlimited · ${data.mrr.limitedCount} limited`
            }
          />
          <MetricCard
            variant="snapshot"
            label="Drop-in Revenue (30d)"
            primaryValue={formatGbp(data.dropIn.revenuePence)}
            primaryContext={
              data.dropIn.packsSold === 0
                ? "No 10-packs sold in last 30 days"
                : `${data.dropIn.packsSold} 10-packs sold`
            }
          />
          <MetricCard
            variant="snapshot"
            label="Net Growth (30d)"
            primaryValue={formatSignedNumber(data.growth.net)}
            primaryTone={netTone}
            primaryContext={
              data.growth.acquired === 0 && data.growth.lost === 0
                ? "No data yet"
                : `${data.growth.acquired} joined · ${data.growth.lost} left`
            }
          />
          <MetricCard
            variant="snapshot"
            label="Avg Revenue Per Member"
            primaryValue={
              data.arpmPence === null
                ? "–"
                : `${formatGbp(data.arpmPence)} / month`
            }
            primaryContext={
              data.mrr.activeSubs === 0
                ? "No active subscribers"
                : `Across ${data.mrr.activeSubs} active subscribers`
            }
          />
        </div>
      </div>
    </div>
  );
}
