// GymClassOS Analytics — P1b.1-06.
//
// Read-only operational dashboard showing three metrics over 7d/30d windows:
//   - Fill Rate: booked seats vs capacity across non-cancelled past occurrences
//   - Cancellation Rate: cancelled bookings vs total bookings created in window
//   - Pass Utilisation: active passes with ≥1 debit vs total active passes
//
// Loader fans all five queries out in parallel via Promise.all per UI-SPEC.
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
//
// Requirements covered: INBX-01 (analytics tab destination, no longer 404).

import { useLoaderData } from "react-router";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymClassOS — Analytics" }];
}

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

  // ─── Parallel fanout ────────────────────────────────────────────────────
  const [fillRate7d, fillRate30d, cancRate7d, cancRate30d, passUtil] =
    await Promise.all([
      fillRate(sevenDaysAgo),
      fillRate(thirtyDaysAgo),
      cancellationRate(sevenDaysAgo),
      cancellationRate(thirtyDaysAgo),
      passUtilisation(),
    ]);

  return {
    fillRate7d,
    fillRate30d,
    cancRate7d,
    cancRate30d,
    passUtil,
  };
}

// ─── View helpers ───────────────────────────────────────────────────────────

function formatPct(pct: number | null): string {
  // en-dash (U+2013) for empty value per UI-SPEC §3.
  return pct === null ? "–" : `${pct}%`;
}

function MetricCard({
  label,
  primaryValue,
  primaryContext,
  secondaryValue,
  secondaryContext,
}: {
  label: string;
  primaryValue: string;
  primaryContext: string;
  secondaryValue: string;
  secondaryContext: string;
}) {
  return (
    <Card
      role="region"
      aria-label={label}
      className="p-4 border-border/50 bg-card/40"
    >
      <CardHeader className="pb-2 p-0 flex flex-row items-center justify-between space-y-0">
        <div className="text-[12px] uppercase tracking-wide text-muted-foreground font-normal">
          {label}
        </div>
      </CardHeader>
      <CardContent className="p-0 flex flex-col gap-3 mt-3">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold">{primaryValue}</div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            7d
          </Badge>
        </div>
        <div className="text-[12px] text-muted-foreground">
          {primaryContext}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <div className="text-sm font-semibold">{secondaryValue}</div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            30d
          </Badge>
        </div>
        <div className="text-[12px] text-muted-foreground">
          {secondaryContext}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GymosAnalytics() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-sm font-semibold">Analytics</h1>
        <p className="text-[11px] text-muted-foreground">
          Last 7 days · Last 30 days
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Fill Rate"
          primaryValue={formatPct(data.fillRate7d.pct)}
          primaryContext={
            data.fillRate7d.occurrenceCount === 0
              ? "No data yet"
              : `${data.fillRate7d.booked} of ${data.fillRate7d.capacity} seats across ${data.fillRate7d.occurrenceCount} classes`
          }
          secondaryValue={formatPct(data.fillRate30d.pct)}
          secondaryContext={
            data.fillRate30d.occurrenceCount === 0
              ? "No data yet"
              : `${data.fillRate30d.booked} of ${data.fillRate30d.capacity} seats across ${data.fillRate30d.occurrenceCount} classes`
          }
        />
        <MetricCard
          label="Cancellation Rate"
          primaryValue={formatPct(data.cancRate7d.pct)}
          primaryContext={
            data.cancRate7d.total === 0
              ? "No data yet"
              : `${data.cancRate7d.cancelled} of ${data.cancRate7d.total} bookings`
          }
          secondaryValue={formatPct(data.cancRate30d.pct)}
          secondaryContext={
            data.cancRate30d.total === 0
              ? "No data yet"
              : `${data.cancRate30d.cancelled} of ${data.cancRate30d.total} bookings`
          }
        />
        <MetricCard
          label="Pass Utilisation"
          primaryValue={formatPct(data.passUtil.pct)}
          primaryContext={
            data.passUtil.totalActive === 0
              ? "No data yet"
              : `${data.passUtil.withDebit} of ${data.passUtil.totalActive} active passes used`
          }
          secondaryValue={formatPct(data.passUtil.pct)}
          secondaryContext="Snapshot — all active passes"
        />
      </div>
    </div>
  );
}
