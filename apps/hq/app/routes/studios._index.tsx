// apps/hq/app/routes/studios._index.tsx
//
// HQB operator console -- /studios (HQB-01, HQB-04).
//
// Lists all studios from GET /api/studios with:
//   - Health badge (keyed on health.status — stale is ALWAYS grey, NEVER green)
//   - Cohort column
//   - Last telemetry received (relative or "Never")
//   - Active members, messages sent, retention, token spend
//   - Expandable signals detail (progressive disclosure)
//   - Cohort filter tabs: All / At-risk / Power-user (HQB-04)
//
// UI rules:
//   - shadcn/ui primitives only (Badge, Card, Skeleton, Table, Button)
//   - Tabler icons (@tabler/icons-react) -- no emojis as icons
//   - No custom dropdowns; cohort filter is a Button group
//   - Progressive disclosure: health.signals shown on expand only

import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  IconActivity,
  IconAlertTriangle,
  IconClock,
  IconChevronDown,
  IconChevronRight,
  IconRefresh,
  IconBuilding,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudioConsoleRow, StudiosResponse } from "./api.studios.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CohortFilter = "all" | "at-risk" | "power-user";

// ---------------------------------------------------------------------------
// Health badge helpers
//
// CRITICAL (HQB-03): stale studios ALWAYS render a grey badge.
// The badge is derived EXCLUSIVELY from health.status — never from engagement
// numbers directly, so a stale studio with high historical numbers still shows
// grey rather than green.
// ---------------------------------------------------------------------------

function healthBadge(row: StudioConsoleRow) {
  const { status } = row.health;

  if (status === "stale") {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-300 gap-1">
        <IconClock className="size-3" />
        Stale
      </Badge>
    );
  }

  if (status === "at-risk") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
        <IconAlertTriangle className="size-3" />
        At-risk
      </Badge>
    );
  }

  if (status === "dormant") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
        <IconAlertTriangle className="size-3" />
        Dormant
      </Badge>
    );
  }

  if (status === "under-messaging") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
        <IconAlertTriangle className="size-3" />
        Under-messaging
      </Badge>
    );
  }

  if (status === "low-retention") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
        <IconAlertTriangle className="size-3" />
        Low retention
      </Badge>
    );
  }

  // "healthy" — only reached when isStale is false AND no at-risk signals
  return (
    <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
      <IconActivity className="size-3" />
      Healthy
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.floor(diffMs / (1000 * 3600));
  if (diffH < 1) return "< 1h ago";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// ---------------------------------------------------------------------------
// Expandable signals row (progressive disclosure)
// ---------------------------------------------------------------------------

function SignalsDetail({ signals }: { signals: string[] }) {
  const [open, setOpen] = useState(false);
  if (signals.length === 0)
    return <span className="text-muted-foreground text-xs">—</span>;

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs text-muted-foreground gap-0.5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <IconChevronDown className="size-3" />
        ) : (
          <IconChevronRight className="size-3" />
        )}
        {signals.length} signal{signals.length !== 1 ? "s" : ""}
      </Button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-1 text-xs text-muted-foreground">
          {signals.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cohort filter tabs
// ---------------------------------------------------------------------------

function CohortTabs({
  active,
  counts,
  onChange,
}: {
  active: CohortFilter;
  counts: { all: number; "at-risk": number; "power-user": number };
  onChange: (f: CohortFilter) => void;
}) {
  const tabs: { value: CohortFilter; label: string }[] = [
    { value: "all", label: `All (${counts.all})` },
    { value: "at-risk", label: `At-risk (${counts["at-risk"]})` },
    { value: "power-user", label: `Power-user (${counts["power-user"]})` },
  ];

  return (
    <div className="flex gap-1" role="group" aria-label="Cohort filter">
      {tabs.map((tab) => (
        <Button
          key={tab.value}
          type="button"
          variant={active === tab.value ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => onChange(tab.value)}
          aria-pressed={active === tab.value}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StudiosPage() {
  const [data, setData] = useState<StudiosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cohortFilter, setCohortFilter] = useState<CohortFilter>("all");

  const fetchStudios = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/studios");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StudiosResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStudios();
  }, []);

  // Cohort filter: at-risk includes stale + at-risk cohorts (both are "at risk"
  // from the operator's perspective — needs attention).
  const filteredStudios = (data?.studios ?? []).filter((row) => {
    if (cohortFilter === "all") return true;
    if (cohortFilter === "at-risk") {
      return row.health.cohort === "at-risk" || row.health.cohort === "unknown";
    }
    return row.health.cohort === "power-user";
  });

  const counts = {
    all: data?.studios.length ?? 0,
    "at-risk": (data?.studios ?? []).filter(
      (r) => r.health.cohort === "at-risk" || r.health.cohort === "unknown",
    ).length,
    "power-user": (data?.studios ?? []).filter(
      (r) => r.health.cohort === "power-user",
    ).length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <IconBuilding className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Studios</h1>
            <p className="text-sm text-muted-foreground">
              Studio health + engagement overview
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchStudios()}
          disabled={loading}
          className="gap-1.5"
        >
          <IconRefresh
            className={["size-4", loading ? "animate-spin" : ""].join(" ")}
          />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <IconAlertTriangle className="size-4 shrink-0" />
              <span>Failed to load studios: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeletons */}
      {loading && !data && (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data loaded */}
      {data && !loading && (
        <>
          {/* Cohort filter (HQB-04) */}
          <div className="mb-4">
            <CohortTabs
              active={cohortFilter}
              counts={counts}
              onChange={setCohortFilter}
            />
          </div>

          {filteredStudios.length === 0 ? (
            <Card>
              <CardContent className="pt-6 pb-6 text-center">
                <IconBuilding className="size-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {data.studios.length === 0
                    ? "No studios provisioned yet."
                    : `No studios in the "${cohortFilter}" cohort.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {filteredStudios.length} studio
                  {filteredStudios.length !== 1 ? "s" : ""}
                </CardTitle>
                <CardDescription className="text-xs">
                  Click a studio to see telemetry history over time.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Studio</TableHead>
                        <TableHead>Health</TableHead>
                        <TableHead>Cohort</TableHead>
                        <TableHead>Last telemetry</TableHead>
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Messages</TableHead>
                        <TableHead className="text-right">Retention</TableHead>
                        <TableHead className="text-right">
                          Tokens (30d)
                        </TableHead>
                        <TableHead>Signals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudios.map((row) => (
                        <TableRow key={row.id}>
                          {/* Display name + link to drill-in */}
                          <TableCell>
                            <div className="min-w-0">
                              <Link
                                to={`/studios/${row.id}`}
                                className="font-medium hover:underline truncate block max-w-[200px]"
                                title={row.displayName}
                              >
                                {row.displayName}
                              </Link>
                              <span className="text-xs text-muted-foreground truncate block max-w-[200px]">
                                {row.ownerEmail}
                              </span>
                            </div>
                          </TableCell>

                          {/* Health badge — driven by health.status, NEVER from raw numbers */}
                          <TableCell>{healthBadge(row)}</TableCell>

                          {/* Cohort */}
                          <TableCell>
                            <span className="text-xs capitalize text-muted-foreground">
                              {row.health.cohort}
                            </span>
                          </TableCell>

                          {/* Last telemetry received (relative) */}
                          <TableCell>
                            <span
                              className="text-xs text-muted-foreground"
                              title={
                                row.lastTelemetryReceivedAt ?? "No telemetry"
                              }
                            >
                              {relativeTime(row.lastTelemetryReceivedAt)}
                            </span>
                          </TableCell>

                          {/* Active members */}
                          <TableCell className="text-right">
                            <span className="text-sm tabular-nums">
                              {row.activeMembers ?? "—"}
                            </span>
                          </TableCell>

                          {/* Messages sent */}
                          <TableCell className="text-right">
                            <span className="text-sm tabular-nums">
                              {row.messagesSent ?? "—"}
                            </span>
                          </TableCell>

                          {/* Retention rate (%) */}
                          <TableCell className="text-right">
                            <span className="text-sm tabular-nums">
                              {row.retentionRate != null
                                ? `${(row.retentionRate * 100).toFixed(0)}%`
                                : "—"}
                            </span>
                          </TableCell>

                          {/* Token spend (input + output, last 30d) */}
                          <TableCell className="text-right">
                            <span className="text-sm tabular-nums">
                              {(
                                row.totalInputTokens + row.totalOutputTokens
                              ).toLocaleString()}
                            </span>
                          </TableCell>

                          {/* Signals (progressive disclosure) */}
                          <TableCell>
                            <SignalsDetail signals={row.health.signals} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
