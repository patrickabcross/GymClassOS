// GymClassOS Campaigns — 260531-n7i Task 3 + AE3-02 (AEM-03 / AEM-04).
//
// Focused surface for re-engagement bulk sends with a COMPOSABLE segment
// builder. Coaches (and the agent) define AND-composed segments over three
// axes — # classes attended, recency of last attendance, inquiry/lead date —
// alongside the built-in at-risk preset. They choose an approved WhatsApp
// template (with shared-variable inputs), see an ELIGIBLE recipient count
// (opted-in AND not opted-out, reused verbatim) for the selected segment,
// confirm via AlertDialog, and POST to send-template-to-members.
//
// Segment persistence (AE3-02): named segments are stored FILTER SPECS in the
// framework application_state table under key gymos-campaign-segments — NO
// schema change. The save-segment ACTION writes them (request context exists);
// the Campaigns component reads them CLIENT-SIDE via
// GET /_agent-native/application-state/:key (readAppState THROWS in a loader —
// no request context). The loader supplies the member rows the specs evaluate
// against. An agent-built segment appears without a reload via the
// useChangeVersions(["action"]) re-fetch.
//
// Requirements: WA-07, WA-09, WA-10, RET-01, AEM-03, AEM-04.

import { useState, useMemo, useEffect, useCallback } from "react";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useChangeVersions } from "@agent-native/core/client";
import { inArray, sql } from "drizzle-orm";
import { toast } from "sonner";
import {
  IconSend,
  IconUsers,
  IconTemplate,
  IconPlus,
  IconFilter,
} from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { LoaderFunctionArgs } from "react-router";

// ─── Segment spec types + evaluator (module-level, unit-testable) ─────────────
// A segment is a stored FILTER SPEC, evaluated against current member data at
// render time so it stays live as bookings/attendance change (D-02). The three
// axes are AND-composed (D-03). Shared by the loader and the component.

export type SegmentFilters = {
  minClassesAttended?: number;
  notAttendedInDays?: number;
  inquiryBefore?: string;
  inquiryAfter?: string;
};

export type EvalMember = {
  memberId: string;
  attendedCount: number;
  lastAttendedAt: string | null;
  createdAt: string;
};

export function matchesSpec(
  m: EvalMember,
  f: SegmentFilters,
  nowMs: number,
): boolean {
  if (f.minClassesAttended != null && m.attendedCount < f.minClassesAttended)
    return false;
  if (f.notAttendedInDays != null) {
    const cutoff = new Date(
      nowMs - f.notAttendedInDays * 86400000,
    ).toISOString();
    // "haven't attended in N days" = never attended OR last attended before cutoff
    if (m.lastAttendedAt && m.lastAttendedAt >= cutoff) return false;
  }
  if (f.inquiryBefore && !(m.createdAt < f.inquiryBefore)) return false;
  if (f.inquiryAfter && !(m.createdAt > f.inquiryAfter)) return false;
  return true;
}

// ─── Template helpers (pure, copied from TemplatesDialog.tsx) ────────────────
// These are intentionally duplicated (not imported from TemplatesDialog) because
// TemplatesDialog is a Dialog component — importing it would pull in its full
// dialog state machine. The two pure helpers below have no dependencies beyond
// JSON.parse.

type ComponentBlock = { type?: string; text?: string };

function extractVariables(componentsJson: string): string[] {
  try {
    const parsed = JSON.parse(componentsJson) as {
      components?: ComponentBlock[];
    };
    const body = (parsed.components ?? []).find((c) => c?.type === "BODY");
    if (!body?.text) return [];
    const matches = String(body.text).matchAll(/\{\{(\d+)\}\}/g);
    return [...new Set([...matches].map((m) => m[1]))].sort(
      (a, b) => Number(a) - Number(b),
    );
  } catch {
    return [];
  }
}

function getBodyText(componentsJson: string): string {
  try {
    const parsed = JSON.parse(componentsJson) as {
      components?: ComponentBlock[];
    };
    const body = (parsed.components ?? []).find((c) => c?.type === "BODY");
    return body?.text ?? "";
  } catch {
    return "";
  }
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "GymClassOS — Campaigns" }];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader(_args: LoaderFunctionArgs) {
  const db = getDb();
  const now = new Date();
  const inactiveCutoff = new Date(now.getTime() - 14 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const passSoonCutoff = new Date(now.getTime() + 14 * 86400000).toISOString();
  const nowIso = now.toISOString();

  // 1. At-risk segment — reuse list-at-risk-members criteria directly.
  //    (Importing the action's .run() is unavailable without a ctx; the criteria
  //    are replicated here to keep this route self-contained per the PLAN.md
  //    fallback decision. A packages/db/ extraction in Plan 09 will de-duplicate.)
  //    guard:allow-unscoped — single-tenant gym tables
  //
  //    NOTE: the correlated subqueries reference the outer member id as the
  //    LITERAL "gym_members"."id" — NOT ${schema.gymMembers.id}. Drizzle drops
  //    the table qualifier for single-table FROM queries, emitting a bare "id";
  //    inside these subqueries bookings/class_occurrences/passes also have an
  //    "id", so a bare "id" raises Postgres 42702 "column reference is
  //    ambiguous" (this 500'd the page). Keep the qualifier literal.
  const memberRows = await db
    .select({
      memberId: schema.gymMembers.id,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
      phoneE164: schema.gymMembers.phoneE164,
      createdAt: schema.gymMembers.createdAt, // inquiry/lead date axis
      attendedCount: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')`,
      lastAttendedAt: sql<
        string | null
      >`(SELECT MAX(co.starts_at) FROM bookings b JOIN class_occurrences co ON co.id = b.occurrence_id WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')`,
      bookingCount30d: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.member_id = "gym_members"."id" AND b.booked_at >= ${thirtyDaysAgo})`,
      earliestPassExpiry: sql<
        string | null
      >`(SELECT MIN(p.expires_at) FROM passes p WHERE p.member_id = "gym_members"."id" AND p.expires_at IS NOT NULL AND p.expires_at >= ${nowIso})`,
    })
    .from(schema.gymMembers)
    .limit(500); // over-fetch; filter per spec in app code

  // Normalized member array the component evaluates any segment spec against.
  const allMembers = memberRows.map((r) => ({
    memberId: r.memberId,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
    phoneE164: r.phoneE164,
    createdAt: r.createdAt,
    attendedCount: Number(r.attendedCount ?? 0),
    lastAttendedAt: r.lastAttendedAt ?? null,
    bookingCount30d: Number(r.bookingCount30d ?? 0),
    earliestPassExpiry: r.earliestPassExpiry ?? null,
  }));

  // At-risk built-in preset — same predicate as before, computed from allMembers.
  const atRisk = allMembers
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
      if (!a.lastAttendedAt && !b.lastAttendedAt) return 0;
      if (!a.lastAttendedAt) return -1;
      if (!b.lastAttendedAt) return 1;
      return a.lastAttendedAt.localeCompare(b.lastAttendedAt);
    })
    .slice(0, 50);

  // 2. Approved templates.
  //    guard:allow-unscoped — single-tenant studio-wide templates
  const templates = await db.select().from(schema.whatsappTemplates);

  // 3. Opt-in / opted-out state for ALL members (not just at-risk) so the
  //    component can show an eligible count for ANY selected segment without a
  //    round-trip. Eligible = has an opt-in row AND opted_out_at IS NULL.
  //    Reused verbatim from the existing send gate — DO NOT fork (D-05 / CONTEXT).
  //    guard:allow-unscoped — single-tenant gym tables
  const allMemberIds = allMembers.map((m) => m.memberId);
  const eligibleSet = new Set<string>();
  if (allMemberIds.length > 0) {
    const optInRows = await db
      .select({
        memberId: schema.whatsappOptIn.memberId,
        optedOutAt: schema.whatsappOptIn.optedOutAt,
      })
      .from(schema.whatsappOptIn)
      .where(inArray(schema.whatsappOptIn.memberId, allMemberIds));
    for (const r of optInRows) {
      if (r.optedOutAt == null) eligibleSet.add(r.memberId);
    }
  }
  const eligibleMemberIds = Array.from(eligibleSet);

  return {
    allMembers,
    atRisk,
    templates,
    eligibleMemberIds,
    counts: {
      atRisk: atRisk.length,
      total: allMembers.length,
    },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Saved-segment client read (NOT the loader — readAppState throws there) ──
// Mirrors TemplatesDialog.tsx: GET /_agent-native/application-state/:key, unwrap
// the `.value` envelope, JSON.parse if the stored value came back as a string.

const SEGMENTS_KEY = "gymos-campaign-segments";

type Segment = {
  id: string;
  name: string;
  filters: SegmentFilters;
  createdAt?: string;
};

// Sentinel id for the built-in at-risk preset (sits alongside custom segments).
const AT_RISK = "at-risk" as const;
type SelectedSegmentId = string | typeof AT_RISK;

async function readSegments(): Promise<Segment[]> {
  const res = await fetch(
    `/_agent-native/application-state/${encodeURIComponent(SEGMENTS_KEY)}`,
  );
  if (!res.ok) return [];
  const payload = await res.json().catch(() => null);
  const value = payload?.value ?? payload; // endpoint wraps stored value under `.value`
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed?.segments) ? parsed.segments : [];
}

export default function CampaignsPage() {
  const { allMembers, atRisk, templates, eligibleMemberIds, counts } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const segFetcher = useFetcher();

  // ─── Live-refresh (copy of gymos.schedule.tsx) + segment re-fetch ──────────
  const revalidator = useRevalidator();
  const actionVersion = useChangeVersions(["action"]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const refreshSegments = useCallback(() => {
    readSegments()
      .then(setSegments)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshSegments();
  }, [refreshSegments]);
  useEffect(() => {
    // The agent's save-segment write fires source:"action" — re-run the loader
    // (member rows) AND re-fetch the segment list so an agent-built segment
    // appears without a reload (AEM-04 / success criterion 6).
    if (actionVersion > 0) {
      revalidator.revalidate();
      refreshSegments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionVersion]);

  // ─── Segment selection + matched/eligible computation ──────────────────────
  const eligibleSet = useMemo(
    () => new Set(eligibleMemberIds),
    [eligibleMemberIds],
  );
  const [selectedSegmentId, setSelectedSegmentId] =
    useState<SelectedSegmentId>(AT_RISK);

  const selectedSegment =
    selectedSegmentId === AT_RISK
      ? null
      : (segments.find((s) => s.id === selectedSegmentId) ?? null);

  // If the selected custom segment disappears (e.g. reconciled away), fall back
  // to the at-risk preset so the send flow never points at a missing segment.
  useEffect(() => {
    if (
      selectedSegmentId !== AT_RISK &&
      !segments.some((s) => s.id === selectedSegmentId)
    ) {
      setSelectedSegmentId(AT_RISK);
    }
  }, [segments, selectedSegmentId]);

  const matchedMembers = useMemo(() => {
    const nowMs = Date.now();
    if (selectedSegmentId === AT_RISK) return atRisk;
    if (!selectedSegment) return [];
    return allMembers.filter((m) =>
      matchesSpec(m, selectedSegment.filters, nowMs),
    );
  }, [selectedSegmentId, selectedSegment, allMembers, atRisk]);

  const matchedCount = matchedMembers.length;
  const eligibleForSegment = useMemo(
    () =>
      matchedMembers.map((m) => m.memberId).filter((id) => eligibleSet.has(id)),
    [matchedMembers, eligibleSet],
  );
  const eligibleCount = eligibleForSegment.length;

  // ─── Builder form state (Popover, progressive disclosure) ──────────────────
  const [builderOpen, setBuilderOpen] = useState(false);
  const [segName, setSegName] = useState("");
  const [minAttended, setMinAttended] = useState("");
  const [notInDays, setNotInDays] = useState("");
  const [inquiryBefore, setInquiryBefore] = useState("");
  const [inquiryAfter, setInquiryAfter] = useState("");

  const builderFilters = useMemo<SegmentFilters>(() => {
    const f: SegmentFilters = {};
    if (minAttended.trim()) f.minClassesAttended = Number(minAttended);
    if (notInDays.trim()) f.notAttendedInDays = Number(notInDays);
    if (inquiryBefore) f.inquiryBefore = inquiryBefore;
    if (inquiryAfter) f.inquiryAfter = inquiryAfter;
    return f;
  }, [minAttended, notInDays, inquiryBefore, inquiryAfter]);

  const builderHasFilter = Object.keys(builderFilters).length > 0;
  const builderCanSave = segName.trim().length > 0 && builderHasFilter;

  const resetBuilder = useCallback(() => {
    setSegName("");
    setMinAttended("");
    setNotInDays("");
    setInquiryBefore("");
    setInquiryAfter("");
  }, []);

  // Pre-fill the builder from the at-risk preset's spirit (D-05): a coach
  // starting from at-risk gets a recency-based starting point they can tweak.
  const prefillFromAtRisk = useCallback(() => {
    setSegName("At-risk (custom)");
    setMinAttended("");
    setNotInDays("14");
    setInquiryBefore("");
    setInquiryAfter("");
    setBuilderOpen(true);
  }, []);

  const handleSaveSegment = () => {
    if (!builderCanSave) return;
    const filters = builderFilters;
    const body = new URLSearchParams();
    body.set("name", segName.trim());
    for (const [k, v] of Object.entries(filters)) body.set(k, String(v));
    segFetcher.submit(body, {
      method: "post",
      action: "/_agent-native/actions/save-segment",
      encType: "application/x-www-form-urlencoded",
    });
    // Optimistic: add locally + select; refreshSegments reconciles on the bump.
    const optimistic: Segment = {
      id: `seg_local_${Date.now()}`,
      name: segName.trim(),
      filters,
    };
    setSegments((prev) => [optimistic, ...prev]);
    setSelectedSegmentId(optimistic.id);
    toast.success(`Saved segment "${optimistic.name}"`);
    setBuilderOpen(false);
    resetBuilder();
  };

  // ─── Template state ────────────────────────────────────────────────────────
  const [selectedTemplateName, setSelectedTemplateName] = useState<
    string | null
  >(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const approvedTemplates = useMemo(
    () => templates.filter((t) => t.status === "approved"),
    [templates],
  );

  const selectedTemplate = selectedTemplateName
    ? (approvedTemplates.find((t) => t.name === selectedTemplateName) ?? null)
    : null;

  const variables = useMemo(
    () =>
      selectedTemplate ? extractVariables(selectedTemplate.componentsJson) : [],
    [selectedTemplate],
  );

  const bodyText = useMemo(
    () =>
      selectedTemplate ? getBodyText(selectedTemplate.componentsJson) : "",
    [selectedTemplate],
  );

  const preview = useMemo(
    () =>
      bodyText.replace(/\{\{(\d+)\}\}/g, (_, n: string) =>
        vars[n]?.trim().length ? vars[n] : `{{${n}}}`,
      ),
    [bodyText, vars],
  );

  const allVarsFilled = variables.every(
    (v) => (vars[v] ?? "").trim().length > 0,
  );
  const canSend = selectedTemplate !== null && allVarsFilled;

  const isSending = fetcher.state !== "idle";

  const handleSend = () => {
    if (!selectedTemplate || !canSend) return;
    fetcher.submit(
      {
        memberIds: JSON.stringify(eligibleForSegment),
        templateName: selectedTemplate.name,
        variables: JSON.stringify(vars),
      },
      {
        method: "post",
        action: "/_agent-native/actions/send-template-to-members",
        encType: "application/x-www-form-urlencoded",
      },
    );
    setDialogOpen(false);
    toast.success(`Queued campaign to ${eligibleCount} members`);
  };

  // Handle fetcher errors from the action response.
  const actionData = fetcher.data as
    | {
        error?: string;
        queued?: number;
        conversationsCreated?: number;
        failed?: number;
      }
    | undefined;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <IconSend size={18} className="text-muted-foreground" aria-hidden />
        <h1 className="text-base font-semibold">Campaigns</h1>
        <Badge variant="outline" className="text-[11px] font-normal ml-1">
          Missed-session re-engagement
        </Badge>
      </div>

      {/* Card 1: Segment builder — preset + custom segments */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconUsers
                size={15}
                className="text-muted-foreground"
                aria-hidden
              />
              <span className="text-[13px] font-semibold">Segment</span>
              <Badge variant="secondary" className="text-[11px]">
                {matchedCount} members
              </Badge>
            </div>

            {/* New-segment builder behind a Popover (progressive disclosure). */}
            <Popover open={builderOpen} onOpenChange={setBuilderOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[12px]"
                >
                  <IconPlus size={13} className="mr-1" aria-hidden />
                  New segment
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    <IconFilter
                      size={14}
                      className="text-muted-foreground"
                      aria-hidden
                    />
                    <span className="text-[13px] font-semibold">
                      Build a segment
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Filters are combined with AND. Supply at least one.
                  </p>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="seg-name"
                      className="text-[12px] text-muted-foreground"
                    >
                      Name
                    </label>
                    <Input
                      id="seg-name"
                      className="text-[13px]"
                      value={segName}
                      onChange={(e) => setSegName(e.target.value)}
                      placeholder="e.g. Lapsed regulars"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="seg-min-attended"
                      className="text-[12px] text-muted-foreground"
                    >
                      Attended at least (classes)
                    </label>
                    <Input
                      id="seg-min-attended"
                      type="number"
                      min={1}
                      className="text-[13px]"
                      value={minAttended}
                      onChange={(e) => setMinAttended(e.target.value)}
                      placeholder="e.g. 4"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="seg-not-in-days"
                      className="text-[12px] text-muted-foreground"
                    >
                      Not attended in the last (days)
                    </label>
                    <Input
                      id="seg-not-in-days"
                      type="number"
                      min={1}
                      className="text-[13px]"
                      value={notInDays}
                      onChange={(e) => setNotInDays(e.target.value)}
                      placeholder="e.g. 21"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="seg-inquiry-before"
                      className="text-[12px] text-muted-foreground"
                    >
                      Joined / enquired before
                    </label>
                    <Input
                      id="seg-inquiry-before"
                      type="date"
                      className="text-[13px]"
                      value={inquiryBefore}
                      onChange={(e) => setInquiryBefore(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="seg-inquiry-after"
                      className="text-[12px] text-muted-foreground"
                    >
                      Joined / enquired after
                    </label>
                    <Input
                      id="seg-inquiry-after"
                      type="date"
                      className="text-[13px]"
                      value={inquiryAfter}
                      onChange={(e) => setInquiryAfter(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[12px]"
                      onClick={() => {
                        setBuilderOpen(false);
                        resetBuilder();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-[12px]"
                      disabled={!builderCanSave}
                      onClick={handleSaveSegment}
                    >
                      Save segment
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Segment chooser: at-risk preset + custom segments. */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Button
              type="button"
              variant={selectedSegmentId === AT_RISK ? "default" : "outline"}
              size="sm"
              className="h-7 text-[12px]"
              onClick={() => setSelectedSegmentId(AT_RISK)}
            >
              At-risk preset
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {counts.atRisk}
              </Badge>
            </Button>
            {segments.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant={selectedSegmentId === s.id ? "default" : "outline"}
                size="sm"
                className="h-7 text-[12px]"
                onClick={() => setSelectedSegmentId(s.id)}
              >
                {s.name}
              </Button>
            ))}
          </div>

          {selectedSegmentId === AT_RISK ? (
            <p className="text-[11px] text-muted-foreground mt-2">
              Built-in preset — members inactive 14+ days, no bookings in 30
              days, or pass expiring soon.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={prefillFromAtRisk}
              >
                Customize as a new segment
              </button>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-2">
              Custom segment — live filter evaluated against current member
              data.
            </p>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {matchedCount === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {selectedSegmentId === AT_RISK
                ? "No members at risk right now."
                : "No members match this segment yet. Try loosening the filters."}
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {matchedMembers.slice(0, 20).map((m) => (
                <div
                  key={m.memberId}
                  className="flex items-center justify-between py-1 text-[12px] border-b border-border/30 last:border-0"
                >
                  <span className="font-medium truncate max-w-[180px]">
                    {m.name || m.memberId}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {m.lastAttendedAt
                      ? `Last attended ${new Date(m.lastAttendedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : "Never attended"}
                  </span>
                </div>
              ))}
              {matchedCount > 20 && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  +{matchedCount - 20} more members
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Template picker */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <IconTemplate
              size={15}
              className="text-muted-foreground"
              aria-hidden
            />
            <span className="text-[13px] font-semibold">Template</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Only approved templates can be sent outside the 24-hour conversation
            window.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col gap-3">
          {approvedTemplates.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              No approved templates available. Submit templates via Meta
              Business Manager.
            </p>
          ) : (
            <Select
              value={selectedTemplateName ?? ""}
              onValueChange={(val) => {
                setSelectedTemplateName(val || null);
                setVars({});
              }}
            >
              <SelectTrigger className="text-[13px]">
                <SelectValue placeholder="Select a template…" />
              </SelectTrigger>
              <SelectContent>
                {approvedTemplates.map((t) => (
                  <SelectItem
                    key={t.name}
                    value={t.name}
                    className="text-[13px]"
                  >
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selectedTemplate && (
            <>
              {/* Variable inputs — same values apply to ALL recipients */}
              {variables.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    These values apply to all recipients (shared variables).
                  </p>
                  {variables.map((v) => (
                    <div key={v} className="flex flex-col gap-1">
                      <label
                        htmlFor={`camp-var-${v}`}
                        className="text-[12px] text-muted-foreground"
                      >
                        Variable {`{{${v}}}`}
                      </label>
                      <Input
                        id={`camp-var-${v}`}
                        className="text-[13px]"
                        value={vars[v] ?? ""}
                        onChange={(e) =>
                          setVars((prev) => ({ ...prev, [v]: e.target.value }))
                        }
                        placeholder={`Value for {{${v}}}`}
                      />
                      {!(vars[v] ?? "").trim() && (
                        <span className="text-[11px] text-destructive">
                          Required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Body preview */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Preview
                </span>
                <div className="text-[13px] bg-muted/40 rounded p-3 leading-[1.5] whitespace-pre-wrap break-words">
                  {preview || "(empty template body)"}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Send footer */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/60 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium">
            {eligibleCount} eligible recipients
          </span>
          <span className="text-[11px] text-muted-foreground">
            Members who have opted in and have not opted out will receive this
            campaign.
            {matchedCount > eligibleCount && (
              <>
                {" "}
                {matchedCount - eligibleCount} of the {matchedCount} matched
                members are excluded (not opted in or opted out).
              </>
            )}
          </span>
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              disabled={!canSend || eligibleCount === 0 || isSending}
              className="ml-4 shrink-0"
            >
              <IconSend size={14} className="mr-1.5" aria-hidden />
              Send campaign
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send campaign?</AlertDialogTitle>
              <AlertDialogDescription>
                This will queue a WhatsApp template to{" "}
                <strong>{eligibleCount}</strong> members. Members who
                haven&apos;t opted in or have opted out are skipped by the
                system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSend} disabled={isSending}>
                {isSending ? "Sending…" : `Send to ${eligibleCount} members`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Error display from action */}
      {actionData?.error && (
        <p className="text-[12px] text-destructive">{actionData.error}</p>
      )}
    </div>
  );
}
