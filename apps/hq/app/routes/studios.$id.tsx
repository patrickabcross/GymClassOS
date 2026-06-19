// apps/hq/app/routes/studios.$id.tsx
//
// HQB per-studio drill-in -- /studios/:id (HQB-05).
//
// Shows telemetry history over time as recharts LineCharts for a single studio:
//   - Active members over time
//   - Messages sent over time
//   - Retention rate (%) over time
//   - Token usage (input + output) over time
//
// Data source: GET /api/studios/:id/snapshots — ordered by period_start ASC.
//
// CRITICAL (Pitfall 6): recharts uses window / document in its chart
// components. In React Router v7 SSR the server render crashes with
// ReferenceError: window is not defined without an SSR guard.
// Every recharts chart MUST be wrapped in <ClientOnly> from
// @agent-native/core/client. The Skeleton renders on the server; the chart
// mounts after hydration.
//
// UI rules:
//   - shadcn/ui Card wrappers around each chart
//   - Tabler icons (@tabler/icons-react) -- no emojis as icons
//   - ClientOnly from @agent-native/core/client wrapping ALL recharts components

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ClientOnly } from "@agent-native/core/client";
import {
  IconArrowLeft,
  IconAlertTriangle,
  IconChartLine,
} from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type {
  StudioSnapshotPoint,
  StudioSnapshotsResponse,
} from "./api.studios.$id.snapshots.js";

// ---------------------------------------------------------------------------
// Chart wrapper component
//
// Wraps each recharts LineChart in a ClientOnly boundary so SSR renders a
// Skeleton and the chart mounts only after hydration (Pitfall 6).
// ---------------------------------------------------------------------------

interface ChartCardProps {
  title: string;
  description: string;
  // Accept StudioSnapshotPoint or any extension (e.g. TokenPoint with extra fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  // String key to allow derived fields like "totalTokens" on TokenPoint
  dataKey: string;
  /** Optional value formatter for the Y axis / tooltip (e.g. "%" suffix). */
  formatter?: (value: number) => string;
}

function ChartCard({
  title,
  description,
  data,
  dataKey,
  formatter,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* CRITICAL: ClientOnly boundary — recharts touches window/document.
            Without this the Vercel SSR render throws
            ReferenceError: window is not defined on /studios/:id (Pitfall 6). */}
        <ClientOnly fallback={<Skeleton className="h-48 w-full rounded" />}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={data}
              margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="periodStart"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: string) => {
                  // Show MM-DD for readability
                  try {
                    return new Date(v).toLocaleDateString(undefined, {
                      month: "2-digit",
                      day: "2-digit",
                    });
                  } catch {
                    return v;
                  }
                }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={
                  formatter ? (v: number) => formatter(v) : undefined
                }
                width={48}
              />
              <Tooltip
                formatter={
                  formatter
                    ? (value: number) => [formatter(value), title]
                    : (value: number) => [value.toLocaleString(), title]
                }
                labelFormatter={(label: string) => {
                  try {
                    return new Date(label).toLocaleDateString();
                  } catch {
                    return label;
                  }
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                dot={false}
                strokeWidth={2}
                stroke="hsl(var(--primary))"
              />
            </LineChart>
          </ResponsiveContainer>
        </ClientOnly>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Token sum helper — projects input + output into a single series point
// ---------------------------------------------------------------------------

interface TokenPoint extends StudioSnapshotPoint {
  totalTokens: number;
}

function addTokenSum(points: StudioSnapshotPoint[]): TokenPoint[] {
  return points.map((p) => ({
    ...p,
    totalTokens: p.llmInputTokens + p.llmOutputTokens,
  }));
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StudioDrillInPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<StudioSnapshotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    fetch(`/api/studios/${id}/snapshots`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StudioSnapshotsResponse;
        setData(json);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const tokenPoints = data ? addTokenSum(data.points) : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back link + page header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
        >
          <Link to="/studios">
            <IconArrowLeft className="size-4" />
            Studios
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <IconChartLine className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">
            {loading ? (
              <Skeleton className="h-6 w-48 inline-block" />
            ) : (
              (data?.displayName ?? id ?? "Studio")
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Telemetry history over time
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <IconAlertTriangle className="size-4 shrink-0" />
              <span>Failed to load telemetry history: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && data && data.points.length === 0 && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center">
            <IconChartLine className="size-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No telemetry history yet for this studio.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Snapshots appear after the first telemetry push from the studio
              worker.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Charts grid — only shown when points exist */}
      {!loading && data && data.points.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chart 1: Active members over time */}
          <ChartCard
            title="Active members"
            description="Members active in the reporting period"
            data={data.points}
            dataKey="activeMembers"
          />

          {/* Chart 2: Messages sent over time */}
          <ChartCard
            title="Messages sent"
            description="Outbound WhatsApp messages sent in the period"
            data={data.points}
            dataKey="messagesSent"
          />

          {/* Chart 3: Retention rate (%) over time */}
          <ChartCard
            title="Retention rate"
            description="Member retention rate (active this period / active prior period)"
            data={data.points}
            dataKey="retentionRate"
            formatter={(v) => `${(v * 100).toFixed(0)}%`}
          />

          {/* Chart 4: Token usage (input + output) over time */}
          <ChartCard
            title="Token usage"
            description="Total LLM tokens used (input + output) in the period"
            data={tokenPoints}
            dataKey="totalTokens"
            formatter={(v) => v.toLocaleString()}
          />
        </div>
      )}
    </div>
  );
}
