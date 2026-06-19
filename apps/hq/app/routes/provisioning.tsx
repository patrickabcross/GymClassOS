// apps/hq/app/routes/provisioning.tsx
//
// Operator provisioning dashboard -- PROV-10.
//
// Shows recent hq_provisioning_runs with per-step status badges so the
// operator can see which steps completed and where a run failed.
// Operator-only (super-admin); data fetched from the resource route at
// GET /api/provisioning-runs.
//
// UI rules:
//   - shadcn/ui primitives only (Badge, Card, Skeleton, Table)
//   - Tabler icons (@tabler/icons-react) -- no emojis, no custom dropdowns
//   - Progressive disclosure: compensation_errors shown only on expand

import { useEffect, useState } from "react";
import {
  IconCheck,
  IconCircleDashed,
  IconAlertTriangle,
  IconLoader2,
  IconRefresh,
  IconServer2,
  IconChevronDown,
  IconChevronRight,
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
import type { ProvisioningRunsResponse, ProvisioningRunRow } from "./api.provisioning-runs.js";

// ---------------------------------------------------------------------------
// Step strip helpers
// ---------------------------------------------------------------------------

const STEP_LABELS = [
  "Neon project",
  "Migrations",
  "Seed + admin",
  "Vercel deploy",
  "Fly apps",
  "Subdomain/DNS",
  "Telemetry token",
  "Registry",
] as const;

type StepKey = "step1At" | "step2At" | "step3At" | "step4At" | "step5At" | "step6At" | "step7At" | "step8At";

const STEP_KEYS: StepKey[] = [
  "step1At",
  "step2At",
  "step3At",
  "step4At",
  "step5At",
  "step6At",
  "step7At",
  "step8At",
];

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

type RunStatus = "started" | "completed" | "failed_terminal" | string;

function runStatusBadge(status: RunStatus) {
  if (status === "completed") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <IconCheck className="size-3" />
        Completed
      </Badge>
    );
  }
  if (status === "failed_terminal") {
    return (
      <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
        <IconAlertTriangle className="size-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1">
      <IconLoader2 className="size-3 animate-spin" />
      {status === "started" ? "In progress" : status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Per-step strip component
// ---------------------------------------------------------------------------

function StepStrip({ run }: { run: ProvisioningRunRow }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {STEP_KEYS.map((key, i) => {
        const done = Boolean(run[key as keyof ProvisioningRunRow]);
        return (
          <div
            key={key}
            title={done ? `Step ${i + 1}: ${STEP_LABELS[i]} — done` : `Step ${i + 1}: ${STEP_LABELS[i]} — pending`}
            className={[
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium border",
              done
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-muted text-muted-foreground border-border",
            ].join(" ")}
          >
            {done ? (
              <IconCheck className="size-3 shrink-0" />
            ) : (
              <IconCircleDashed className="size-3 shrink-0" />
            )}
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compensation errors detail (progressive disclosure)
// ---------------------------------------------------------------------------

function CompensationErrorsDetail({ json }: { json: string }) {
  const [open, setOpen] = useState(false);

  let parsed: Record<string, string> = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground gap-1"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <IconChevronDown className="size-3" />
        ) : (
          <IconChevronRight className="size-3" />
        )}
        {entries.length} compensation error{entries.length !== 1 ? "s" : ""}
      </Button>
      {open && (
        <div className="mt-1 rounded border border-border bg-muted/50 p-2 text-xs space-y-1">
          {entries.map(([step, err]) => (
            <div key={step} className="flex gap-2">
              <span className="font-mono font-medium text-muted-foreground shrink-0">
                step {step}:
              </span>
              <span className="text-foreground break-all">{err}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run card
// ---------------------------------------------------------------------------

function RunCard({ run }: { run: ProvisioningRunRow }) {
  const startedAt = run.startedAt
    ? new Date(run.startedAt).toLocaleString()
    : null;

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{run.displayName}</CardTitle>
            <CardDescription className="text-xs mt-0.5 truncate">
              {run.slug} &middot; {run.ownerEmail}
            </CardDescription>
          </div>
          <div className="shrink-0">{runStatusBadge(run.runStatus)}</div>
        </div>
      </CardHeader>
      <CardContent>
        {/* 8-step progress strip */}
        <StepStrip run={run} />

        {/* Started at timestamp */}
        {startedAt && (
          <p className="mt-2 text-xs text-muted-foreground">Started {startedAt}</p>
        )}

        {/* Compensation errors (progressive disclosure) */}
        <CompensationErrorsDetail json={run.compensationErrors} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProvisioningPage() {
  const [data, setData] = useState<ProvisioningRunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/provisioning-runs");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as ProvisioningRunsResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuns();
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <IconServer2 className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Provisioning</h1>
            <p className="text-sm text-muted-foreground">
              Studio provisioning runs with per-step status
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchRuns()}
          disabled={loading}
          className="gap-1.5"
        >
          <IconRefresh className={["size-4", loading ? "animate-spin" : ""].join(" ")} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <IconAlertTriangle className="size-4 shrink-0" />
              <span>Failed to load provisioning runs: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeletons */}
      {loading && !data && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-64 mt-1" />
              </CardHeader>
              <CardContent>
                <div className="flex gap-1.5">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <Skeleton key={j} className="h-5 w-8 rounded" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Run list */}
      {data && !loading && (
        <>
          {data.runs.length === 0 ? (
            <Card>
              <CardContent className="pt-6 pb-6 text-center">
                <IconServer2 className="size-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No provisioning runs yet. POST to /api/signup to start one.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                {data.runs.length} recent run{data.runs.length !== 1 ? "s" : ""}
              </p>
              {data.runs.map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
