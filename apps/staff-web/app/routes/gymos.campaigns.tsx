// GymClassOS Campaigns — 260531-n7i Task 3.
//
// Focused surface for missed-session re-engagement bulk sends.
// Coaches pick the at-risk segment (fixed, reused from list-at-risk-members),
// choose an approved WhatsApp template (with shared-variable inputs), see an
// ELIGIBLE recipient count (opted-in AND not opted-out), confirm via
// AlertDialog, and POST to send-template-to-members.
//
// Application-state note: campaign selection state is local React state for
// this core build — full application_state navigation exposure (so the agent
// can "know" the user is on the Campaigns page and which template they've
// selected) is deferred to a follow-up plan, consistent with other /gymos
// sibling routes (gymos.analytics.tsx, gymos.members.tsx) that also defer
// deep application_state wiring.
//
// Custom segment builder: DEFERRED. Fixed at-risk segment (list-at-risk-members
// criteria: 14d inactive OR 0 bookings/30d OR pass expiring in 14d) is the
// only available segment for this core build.
//
// Requirements: WA-07, WA-09, WA-10, RET-01.

import { useState, useMemo } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { inArray, sql } from "drizzle-orm";
import { toast } from "sonner";
import { IconSend, IconUsers, IconTemplate } from "@tabler/icons-react";
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
import type { LoaderFunctionArgs } from "react-router";

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
  const memberRows = await db
    .select({
      memberId: schema.gymMembers.id,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
      phoneE164: schema.gymMembers.phoneE164,
      lastAttendedAt: sql<
        string | null
      >`(SELECT MAX(co.starts_at) FROM bookings b JOIN class_occurrences co ON co.id = b.occurrence_id WHERE b.member_id = ${schema.gymMembers.id} AND b.status = 'attended')`,
      bookingCount30d: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.member_id = ${schema.gymMembers.id} AND b.booked_at >= ${thirtyDaysAgo})`,
      earliestPassExpiry: sql<
        string | null
      >`(SELECT MIN(p.expires_at) FROM passes p WHERE p.member_id = ${schema.gymMembers.id} AND p.expires_at IS NOT NULL AND p.expires_at >= ${nowIso})`,
    })
    .from(schema.gymMembers)
    .limit(200); // over-fetch; filter below

  const atRisk = memberRows
    .map((r) => ({
      memberId: r.memberId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
      phoneE164: r.phoneE164,
      lastAttendedAt: r.lastAttendedAt ?? null,
      bookingCount30d: Number(r.bookingCount30d ?? 0),
      earliestPassExpiry: r.earliestPassExpiry ?? null,
    }))
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

  // 3. Opt-in / opted-out state for the at-risk members.
  //    Eligible = has an opt-in row AND opted_out_at IS NULL.
  //    guard:allow-unscoped — single-tenant gym tables
  const atRiskMemberIds = atRisk.map((m) => m.memberId);
  let eligibleMemberIds: string[] = [];

  if (atRiskMemberIds.length > 0) {
    const optInRows = await db
      .select({
        memberId: schema.whatsappOptIn.memberId,
        optedOutAt: schema.whatsappOptIn.optedOutAt,
      })
      .from(schema.whatsappOptIn)
      .where(inArray(schema.whatsappOptIn.memberId, atRiskMemberIds));

    const eligibleSet = new Set(
      optInRows.filter((r) => r.optedOutAt == null).map((r) => r.memberId),
    );
    eligibleMemberIds = atRiskMemberIds.filter((id) => eligibleSet.has(id));
  }

  return {
    atRisk,
    templates,
    eligibleMemberIds,
    counts: {
      atRisk: atRisk.length,
      eligible: eligibleMemberIds.length,
    },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { atRisk, templates, eligibleMemberIds, counts } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

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
        memberIds: JSON.stringify(eligibleMemberIds),
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
    toast.success(`Queued campaign to ${counts.eligible} members`);
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
  if (actionData?.error && !isSending) {
    // Show error once — reset after display by clearing on next re-render
    // (toast is the display vehicle; actionData persists until next submit)
  }

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

      {/* Card 1: At-risk segment */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <IconUsers
              size={15}
              className="text-muted-foreground"
              aria-hidden
            />
            <span className="text-[13px] font-semibold">
              Missed-session segment
            </span>
            <Badge variant="secondary" className="text-[11px]">
              {counts.atRisk} members
            </Badge>
            {/* Custom segment builder is DEFERRED to a future plan. The fixed
                at-risk segment (14d inactive OR 0 bookings/30d OR pass expiring
                in 14d) is the only available segment for this core build. */}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Members inactive 14+ days, no bookings in 30 days, or pass expiring
            soon. Custom segments are coming in a future update.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {atRisk.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No members at risk right now.
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {atRisk.slice(0, 20).map((m) => (
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
              {atRisk.length > 20 && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  +{atRisk.length - 20} more members
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
            {counts.eligible} eligible recipients
          </span>
          <span className="text-[11px] text-muted-foreground">
            Members who have opted in and have not opted out will receive this
            campaign.
            {counts.atRisk > counts.eligible && (
              <>
                {" "}
                {counts.atRisk - counts.eligible} of the {counts.atRisk} at-risk
                members are excluded (not opted in or opted out).
              </>
            )}
          </span>
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              disabled={!canSend || counts.eligible === 0 || isSending}
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
                <strong>{counts.eligible}</strong> members. Members who
                haven&apos;t opted in or have opted out are skipped by the
                system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSend} disabled={isSending}>
                {isSending ? "Sending…" : `Send to ${counts.eligible} members`}
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
