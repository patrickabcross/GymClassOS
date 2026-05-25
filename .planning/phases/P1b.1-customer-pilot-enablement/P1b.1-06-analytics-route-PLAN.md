---
phase: P1b.1-customer-pilot-enablement
plan: 06
type: execute
wave: 2
depends_on: [P1b.1-01, P1b.1-03]
files_modified:
  - apps/staff-web/app/routes/gymos.analytics.tsx
autonomous: true
requirements: [INBX-01]
must_haves:
  truths:
    - "Visiting /gymos/analytics renders a page titled 'Analytics' with at least three metric cards: Fill Rate, Cancellation Rate, Pass Utilisation"
    - "Each metric card shows both a 7-day and 30-day value, computed live from seeded gym tables via Drizzle aggregations"
    - "When data is missing (zero rows in the window), the card shows '–' (en-dash) as the value and 'No data yet' as context — not a crash, not a hidden card"
    - "The page renders inside the bare gymos layout (no email chrome) and is reachable via the new Analytics tab in GymosTopNav"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.analytics.tsx"
      provides: "Server-side rendered analytics page with loader fanning out 3+ metric queries in parallel"
      min_lines: 100
      contains: "Fill Rate"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.analytics.tsx loader"
      to: "Neon class_occurrences + bookings + passes tables"
      via: "Drizzle Promise.all fanout"
      pattern: "Promise\\.all"
    - from: "apps/staff-web/app/routes/gymos.analytics.tsx component"
      to: "shadcn Card + Skeleton"
      via: "imports from ~/components/ui"
      pattern: "Card|Skeleton"
---

<objective>
Create the `/gymos/analytics` route — a read-only dashboard showing fill rate, cancellation rate, and pass utilisation over 7-day and 30-day windows. The route is required for ROADMAP success criterion #4 and gives the customer a usable analytics tab on pilot day.

Purpose: Coaches need visibility into class fill rates and member utilisation. The Analytics tab in GymosTopNav (created in plan 01) currently 404s — this plan ships the destination. No date-range picker, no charts, no exports — just three numeric cards from live SQL.

Output:
- `apps/staff-web/app/routes/gymos.analytics.tsx` — new React Router v7 route with loader + page component
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
@apps/staff-web/app/routes/gymos._index.tsx
@apps/staff-web/server/db/schema.ts
@apps/staff-web/app/components/ui/card.tsx
@apps/staff-web/app/components/ui/skeleton.tsx
@apps/staff-web/app/components/ui/badge.tsx

<interfaces>
<!-- React Router v7 route conventions + relevant Drizzle schema. -->

From apps/staff-web/app/routes/gymos._index.tsx (loader pattern):
- Loader is `export async function loader({ request }: LoaderFunctionArgs)` returning `json({...})`
- Uses `getDb()` and `schema` from server/db
- Fan-out pattern: `const [a, b, c] = await Promise.all([...])`
- Component uses `useLoaderData<typeof loader>()` to access data

From apps/staff-web/server/db/schema.ts (existing tables, no schema changes in this plan):
- `classOccurrences` { id, definitionId, startsAt, capacity, status }
- `bookings` { id, occurrenceId, memberId, status, bookedAt }
- `passes` { id, memberId, grantedCredits, expiresAt, status }
- `passDebits` { id, passId, amount, createdAt }

From apps/staff-web/app/components/ui/card.tsx:
- Exports: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`

From apps/staff-web/app/components/ui/skeleton.tsx:
- Default export: `Skeleton` component with className override

shadcn Badge already imported elsewhere in the codebase.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Compute analytics metrics in a loader (fill rate, cancellation, pass utilisation × 7d & 30d)</name>
  <files>apps/staff-web/app/routes/gymos.analytics.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos._index.tsx — read the loader to copy the exact db / schema import paths, `getDb()` usage, and Promise.all fanout pattern
    - apps/staff-web/server/db/schema.ts — verify exact Drizzle export names + column names for classOccurrences, bookings, passes, passDebits
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 5. Analytics Route" — exact SQL for each metric (fill rate, cancellation rate, pass utilisation)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Code Examples > Analytics Drizzle query (fill rate)" — concrete pattern with CASE WHEN aggregation
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Common Pitfalls > Pitfall 6" — seeded May 18-22 dates relative to 2026-05-25; 7-day window catches them but pilot must add live data soon
  </read_first>
  <action>
Create new file `apps/staff-web/app/routes/gymos.analytics.tsx`. This is a React Router v7 route file (file-based routing — the filename creates the `/gymos/analytics` URL).

```tsx
import type { LoaderFunctionArgs } from "react-router";
import { json, useLoaderData } from "react-router";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db/index.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

export async function loader({ request }: LoaderFunctionArgs) {
  const db = getDb();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const nowIso = now.toISOString();

  // Helper: fill rate within a date range.
  async function fillRate(sinceIso: string) {
    const [r] = await db
      .select({
        booked: sql<number>`COUNT(CASE WHEN ${schema.bookings.status} IN ('booked', 'attended') THEN 1 ELSE NULL END)`,
        capacity: sql<number>`COALESCE(SUM(${schema.classOccurrences.capacity}), 0)`,
        occurrenceCount: sql<number>`COUNT(DISTINCT ${schema.classOccurrences.id})`,
      })
      .from(schema.classOccurrences)
      .leftJoin(
        schema.bookings,
        eq(schema.bookings.occurrenceId, schema.classOccurrences.id),
      )
      .where(
        and(
          gte(schema.classOccurrences.startsAt, sinceIso),
          lt(schema.classOccurrences.startsAt, nowIso),
          ne(schema.classOccurrences.status, "cancelled"),
        ),
      );
    const booked = Number(r?.booked ?? 0);
    const capacity = Number(r?.capacity ?? 0);
    const occurrenceCount = Number(r?.occurrenceCount ?? 0);
    return {
      booked,
      capacity,
      occurrenceCount,
      pct: capacity > 0 ? Math.round((booked / capacity) * 100) : null,
    };
  }

  // Helper: cancellation rate within a date range (based on bookings.bookedAt).
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

  // Helper: pass utilisation snapshot — active passes with ≥1 debit / total active passes.
  async function passUtilisation() {
    const [r] = await db
      .select({
        withDebit: sql<number>`COUNT(DISTINCT CASE WHEN ${schema.passDebits.amount} > 0 THEN ${schema.passes.id} ELSE NULL END)`,
        totalActive: sql<number>`COUNT(DISTINCT ${schema.passes.id})`,
      })
      .from(schema.passes)
      .leftJoin(schema.passDebits, eq(schema.passDebits.passId, schema.passes.id))
      .where(eq(schema.passes.status, "active"));
    const withDebit = Number(r?.withDebit ?? 0);
    const totalActive = Number(r?.totalActive ?? 0);
    return {
      withDebit,
      totalActive,
      pct: totalActive > 0 ? Math.round((withDebit / totalActive) * 100) : null,
    };
  }

  const [fillRate7d, fillRate30d, cancRate7d, cancRate30d, passUtil] =
    await Promise.all([
      fillRate(sevenDaysAgo),
      fillRate(thirtyDaysAgo),
      cancellationRate(sevenDaysAgo),
      cancellationRate(thirtyDaysAgo),
      passUtilisation(),
    ]);

  return json({
    fillRate7d,
    fillRate30d,
    cancRate7d,
    cancRate30d,
    passUtil,
  });
}

function formatPct(pct: number | null): string {
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
      <CardHeader className="pb-2 p-0 flex flex-row items-center justify-between">
        <CardTitle className="text-[12px] uppercase tracking-wide text-muted-foreground font-normal">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex flex-col gap-3 mt-3">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold">{primaryValue}</div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            7d
          </Badge>
        </div>
        <div className="text-[12px] text-muted-foreground">{primaryContext}</div>
        <div className="flex items-baseline gap-2 mt-1">
          <div className="text-sm font-semibold">{secondaryValue}</div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            30d
          </Badge>
        </div>
        <div className="text-[12px] text-muted-foreground">{secondaryContext}</div>
      </CardContent>
    </Card>
  );
}

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
```

Critical contract points (per UI-SPEC §3):
- Page title: `Analytics` (14px semibold — `text-sm font-semibold`)
- Subtitle: `Last 7 days · Last 30 days` (11px muted)
- Metric card labels (exact copy): `Fill Rate`, `Cancellation Rate`, `Pass Utilisation`
- Period badges: `7d` / `30d` (10px, bg-muted rounded-full)
- Empty value: `–` (en-dash, U+2013)
- Empty context: `No data yet`
- Card primary value: 14px semibold (`text-sm font-semibold`) — NOT `text-2xl` (UI-SPEC §Checker revision note: text-2xl was disallowed as undeclared 5th font size)
- Cards use `role="region"` + `aria-label`
- Grid: 1 col on mobile, 3 cols on `md:` and larger
- All colors via semantic tokens (`text-muted-foreground`, `bg-card/40`, `border-border/50`) — never hardcoded hex (dark-mode compatibility)

Pitfall 6 note: With seeded occurrences in May 18-22 and today's date 2026-05-25, the 7-day window catches the seeded data. After 8 days, the seeded data drops out of the 7d window — analytics will show "No data yet" for fill rate. This is expected pilot behavior; document in SUMMARY that real bookings need to flow in for sustained metrics.

Run `pnpm --filter staff-web typecheck` after creation.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/app/routes/gymos.analytics.tsx` exists
    - File line count ≥ 100 lines
    - Contains `export async function loader`
    - Contains `export default function GymosAnalytics` (or similar default export of a React component)
    - Contains literal `Promise.all` in the loader (parallel fanout)
    - Contains `schema.classOccurrences` reference (fill rate query)
    - Contains `schema.bookings` reference (fill rate + cancellation queries)
    - Contains `schema.passes` reference (pass utilisation query)
    - Contains `schema.passDebits` reference (pass utilisation query)
    - Contains literal string `"Analytics"` (page title)
    - Contains literal string `"Fill Rate"` (metric label — exact UI-SPEC)
    - Contains literal string `"Cancellation Rate"` (metric label — exact UI-SPEC)
    - Contains literal string `"Pass Utilisation"` (metric label — exact UI-SPEC)
    - Contains literal string `"Last 7 days · Last 30 days"` (subtitle — exact, with middle-dot U+00B7)
    - Contains literal string `"No data yet"` (zero-data context — exact UI-SPEC)
    - Contains literal `"–"` (en-dash for empty value — exact UI-SPEC)
    - Contains `role="region"` AND `aria-label` on metric cards
    - Imports `Card`, `CardHeader`, `CardTitle`, `CardContent` from `~/components/ui/card`
    - Does NOT contain `text-2xl` (UI-SPEC checker disallowed this size)
    - Does NOT contain any hardcoded hex color (`#[0-9a-f]{3,6}`)
    - Does NOT contain `accessFilter` or `resolveAccess` (gym tables exempt per research §6)
    - `pnpm --filter staff-web typecheck` exits with code 0
  </acceptance_criteria>
  <done>
With dev server running, navigating to `/gymos/analytics` (or clicking the Analytics tab in GymosTopNav) renders a page titled "Analytics" with subtitle "Last 7 days · Last 30 days" and three metric cards in a horizontal grid (collapses to single column on mobile). With seeded data: Fill Rate card shows a real percentage for the 7d window (occurrences May 18-22) AND a 30d percentage; Cancellation Rate shows real values; Pass Utilisation shows real values from the 5 seeded passes. When data is missing, the card displays "–" with "No data yet" context — no crash, no hidden card. The page renders inside the bare gymos layout (top-nav visible, no email chrome). Dark mode renders with correct semantic tokens.
  </done>
</task>

</tasks>

<verification>
- /gymos/analytics route loads and shows three metric cards with real values from seeded data
- All UI-SPEC copy strings match verbatim
- No undeclared font sizes (no text-2xl)
- No hardcoded hex colors (semantic tokens only)
- TypeScript compiles
- Page renders inside bare gymos layout (depends on plan 01)
- Loader uses Promise.all for parallel SQL
</verification>

<success_criteria>
1. ROADMAP success criterion #4: /gymos/analytics loads with three real metrics from seeded data
2. Pilot's Analytics tab is no longer a 404 — customer can demonstrate on day one
3. UI-SPEC visual contract preserved (sizing, copy, semantic tokens)
4. Empty state degrades gracefully — no crash if data is missing
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-06-analytics-route-SUMMARY.md` documenting:
- Actual percentage values for each metric against the local Neon seed (provides pilot baseline)
- Confirmation that the loader runs SQL aggregations in parallel via Promise.all
- Confirmation of fallback behavior when bookings table is empty (the "No data yet" path)
- Note on Pitfall 6 — that 7-day window will drop the May seeded data after a week into the pilot; real bookings must flow in for sustained metrics
</output>
