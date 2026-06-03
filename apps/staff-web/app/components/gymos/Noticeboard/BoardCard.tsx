// BoardCard — P3-05
//
// One section card (Inbox / Schedule / Members / Revenue).
// A single configurable component switched by `section` prop.
//
// Per-section:
//   inbox:    IconMessage, list-inbox-summary, send-template-to-members proposals
//   schedule: IconCalendar, list-fill-rate{days:7},  send-template-to-members proposals
//   members:  IconUsers, list-renewals + list-at-risk-members, send-template-to-members proposals
//   revenue:  IconCurrencyPound, list-revenue, create-checkout-link proposals
//
// Card label: plain <div className="text-xs uppercase..."> — NOT <CardTitle> (UI-SPEC §Typography)
// Overflow menu: DropdownMenu with "Go to {Section}" + "Refresh"
// Metric loading: Skeleton; metric error: Tooltip-wrapped "—"
// Proposal zone: AlertDialog for send-template-to-members; direct approve for create-checkout-link
// All mutations: optimistic onMutate/onError

"use client";

import { useState, useCallback } from "react";
import {
  IconMessage,
  IconCalendar,
  IconUsers,
  IconCurrencyPound,
  IconDots,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { useActionQuery, useActionMutation } from "@agent-native/core/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// ─── Types ───────────────────────────────────────────────────────────────────

export type Section = "inbox" | "schedule" | "members" | "revenue";

type Note = {
  body: string;
  updatedAt?: string;
};

type Proposal = {
  id: string;
  actionName: string;
  rationale?: string | null;
  paramsJson: string;
};

type BoardCardProps = {
  section: Section;
  note?: Note | null;
  proposals: Proposal[];
};

// ─── Per-section config ───────────────────────────────────────────────────────

const SECTION_CONFIG = {
  inbox: {
    label: "INBOX",
    navView: "inbox",
    navLabel: "Go to Inbox",
    emptyNote: "No notes yet. Ask the agent to review your inbox.",
    proposalActionName: "send-template-to-members",
  },
  schedule: {
    label: "SCHEDULE",
    navView: "schedule",
    navLabel: "Go to Schedule",
    emptyNote: "No notes yet. Ask the agent about upcoming classes.",
    proposalActionName: "send-template-to-members",
  },
  members: {
    label: "MEMBERS",
    navView: "members",
    navLabel: "Go to Members",
    emptyNote: "No notes yet. Ask the agent about member retention.",
    proposalActionName: "send-template-to-members",
  },
  revenue: {
    label: "REVENUE",
    navView: "analytics",
    navLabel: "Go to Analytics",
    emptyNote: "No notes yet. Ask the agent about revenue trends.",
    proposalActionName: "create-checkout-link",
  },
} as const;

// ─── Section icon ─────────────────────────────────────────────────────────────

function SectionIcon({ section }: { section: Section }) {
  switch (section) {
    case "inbox":
      return <IconMessage size={20} className="text-muted-foreground" />;
    case "schedule":
      return <IconCalendar size={20} className="text-muted-foreground" />;
    case "members":
      return <IconUsers size={20} className="text-muted-foreground" />;
    case "revenue":
      return <IconCurrencyPound size={20} className="text-muted-foreground" />;
  }
}

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Metric subheading — per-section hooks ────────────────────────────────────

type MetricResult =
  | { isLoading: true; isError: false; subheading: null; mrrValue: null }
  | { isLoading: false; isError: true; subheading: null; mrrValue: null }
  | {
      isLoading: false;
      isError: false;
      subheading: string;
      mrrValue: string | null;
    };

function useInboxMetric(): MetricResult {
  const q = useActionQuery<{
    unreadConversations: number;
    openConversations: number;
  }>("list-inbox-summary", {});
  if (q.isLoading)
    return {
      isLoading: true,
      isError: false,
      subheading: null,
      mrrValue: null,
    };
  if (q.isError || !q.data)
    return {
      isLoading: false,
      isError: true,
      subheading: null,
      mrrValue: null,
    };
  const { unreadConversations, openConversations } = q.data;
  return {
    isLoading: false,
    isError: false,
    subheading: `${unreadConversations} unread · ${openConversations} open conversations`,
    mrrValue: null,
  };
}

function useScheduleMetric(): MetricResult {
  const q = useActionQuery<Array<{ fillPct: number }>>("list-fill-rate", {
    days: 7,
  } as Record<string, unknown>);
  if (q.isLoading)
    return {
      isLoading: true,
      isError: false,
      subheading: null,
      mrrValue: null,
    };
  if (q.isError || !q.data)
    return {
      isLoading: false,
      isError: true,
      subheading: null,
      mrrValue: null,
    };
  const rows = q.data;
  const n = rows.length;
  const avg =
    n > 0 ? Math.round(rows.reduce((s, r) => s + r.fillPct, 0) / n) : 0;
  return {
    isLoading: false,
    isError: false,
    subheading: `${avg}% avg fill this week · ${n} classes`,
    mrrValue: null,
  };
}

function useMembersMetric(): MetricResult {
  const renewalsQ = useActionQuery<{
    activeSubscriptions: number;
  }>("list-renewals", {});
  const atRiskQ = useActionQuery<Array<{ memberId: string }>>(
    "list-at-risk-members",
    { limit: 25 } as Record<string, unknown>,
  );
  const isLoading = renewalsQ.isLoading || atRiskQ.isLoading;
  const isError =
    !isLoading &&
    (renewalsQ.isError || atRiskQ.isError || !renewalsQ.data || !atRiskQ.data);
  if (isLoading)
    return {
      isLoading: true,
      isError: false,
      subheading: null,
      mrrValue: null,
    };
  if (isError)
    return {
      isLoading: false,
      isError: true,
      subheading: null,
      mrrValue: null,
    };
  const active = renewalsQ.data!.activeSubscriptions;
  const atRiskCount = atRiskQ.data!.length;
  const subheading =
    atRiskCount === 0
      ? `${active} active · no members at risk`
      : `${active} active · ${atRiskCount} at risk of lapsing`;
  return {
    isLoading: false,
    isError: false,
    subheading,
    mrrValue: null,
  };
}

function useRevenueMetric(): MetricResult {
  const q = useActionQuery<{
    mrrPounds: number;
    net30d: number;
  }>("list-revenue", {});
  if (q.isLoading)
    return {
      isLoading: true,
      isError: false,
      subheading: null,
      mrrValue: null,
    };
  if (q.isError || !q.data)
    return {
      isLoading: false,
      isError: true,
      subheading: null,
      mrrValue: null,
    };
  const { mrrPounds, net30d } = q.data;
  const netStr =
    net30d > 0
      ? `+${net30d} net new this month`
      : net30d < 0
        ? `−${Math.abs(net30d)} net new this month`
        : "flat net growth this month";
  return {
    isLoading: false,
    isError: false,
    subheading: netStr,
    mrrValue: `£${mrrPounds}/mo`,
  };
}

function useSectionMetric(section: Section): MetricResult {
  // All hooks called unconditionally — React rules of hooks require this.
  const inbox = useInboxMetric();
  const schedule = useScheduleMetric();
  const members = useMembersMetric();
  const revenue = useRevenueMetric();
  switch (section) {
    case "inbox":
      return inbox;
    case "schedule":
      return schedule;
    case "members":
      return members;
    case "revenue":
      return revenue;
  }
}

// ─── Subheading renderer ──────────────────────────────────────────────────────

function MetricSubheading({ metric }: { metric: MetricResult }) {
  if (metric.isLoading) {
    return <Skeleton className="h-4 w-40 mt-1" />;
  }
  if (metric.isError) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm text-muted-foreground cursor-help mt-1 inline-block">
              &mdash;
            </span>
          </TooltipTrigger>
          <TooltipContent>Metric unavailable. Refresh to retry.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <div className="text-sm text-muted-foreground mt-1">
      {metric.subheading}
    </div>
  );
}

// ─── Proposal zone — one proposal row ────────────────────────────────────────

type ProposalRowProps = {
  proposal: Proposal;
  section: Section;
};

function ProposalRow({ proposal, section }: ProposalRowProps) {
  const queryClient = useQueryClient();
  // Optimistic state: "pending" | "loading" | "dismissed"
  const [status, setStatus] = useState<"pending" | "loading" | "dismissed">(
    "pending",
  );

  const approveMutation = useActionMutation("approve-proposal", {
    onMutate: () => {
      setStatus("loading");
    },
    onError: (err) => {
      setStatus("pending");
      toast(
        `Action failed. ${err.message || "Unexpected error."} The proposal is still pending.`,
      );
    },
    onSuccess: (_data) => {
      setStatus("dismissed");
      if (proposal.actionName === "create-checkout-link") {
        // copy URL to clipboard
        const result = _data as { url?: string } | undefined;
        if (result?.url) {
          navigator.clipboard.writeText(result.url).catch(() => {
            /* clipboard permission denied — silent */
          });
        }
        toast("Checkout link ready. Copied to clipboard.");
      } else {
        // send-template-to-members
        let n = 0;
        try {
          const params = JSON.parse(proposal.paramsJson) as {
            memberIds?: string[];
          };
          n = params.memberIds?.length ?? 0;
        } catch {
          // ignore
        }
        toast(`Sent to ${n} members.`);
      }
      queryClient.invalidateQueries({
        queryKey: ["action", "list-inbox-summary"],
      });
    },
  });

  const rejectMutation = useActionMutation("reject-proposal", {
    onMutate: () => {
      setStatus("dismissed");
    },
    onError: (err) => {
      setStatus("pending");
      toast(
        `Could not dismiss proposal. ${err.message || "Unexpected error."}`,
      );
    },
  });

  if (status === "dismissed") return null;

  // Parse params for AlertDialog
  let parsedParams: { templateName?: string; memberIds?: string[] } = {};
  try {
    parsedParams = JSON.parse(proposal.paramsJson) as typeof parsedParams;
  } catch {
    // leave empty
  }
  const memberCount = parsedParams.memberIds?.length ?? 0;
  const templateName = parsedParams.templateName ?? "template";
  const memberSuffix = memberCount === 1 ? "" : "s";

  const isLoading = status === "loading";

  return (
    <div
      data-proposal-id={proposal.id}
      className={isLoading ? "opacity-50" : ""}
    >
      <Separator className="my-3" />

      {/* Rationale */}
      {proposal.rationale && (
        <p className="text-sm text-foreground/80 mb-3">{proposal.rationale}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {proposal.actionName === "send-template-to-members" ? (
          // AlertDialog gate for outbound WhatsApp (irreversible)
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="default" size="sm" disabled={isLoading}>
                <IconCheck size={14} className="mr-1" />
                Approve
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Send {memberCount} WhatsApp message{memberSuffix}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will send {templateName} to {memberCount} member
                  {memberSuffix}. Messages that are out of window or not
                  opted-in will be skipped by the worker. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-primary text-primary-foreground"
                  onClick={() => {
                    approveMutation.mutate({
                      proposalId: proposal.id,
                    } as Record<string, unknown> as Parameters<
                      typeof approveMutation.mutate
                    >[0]);
                  }}
                >
                  Send messages
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          // create-checkout-link: direct approve (reversible link generation)
          <Button
            variant="default"
            size="sm"
            disabled={isLoading}
            onClick={() => {
              approveMutation.mutate({ proposalId: proposal.id } as Record<
                string,
                unknown
              > as Parameters<typeof approveMutation.mutate>[0]);
            }}
          >
            <IconCheck size={14} className="mr-1" />
            Approve
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={isLoading}
          onClick={() => {
            rejectMutation.mutate({ proposalId: proposal.id } as Record<
              string,
              unknown
            > as Parameters<typeof rejectMutation.mutate>[0]);
          }}
        >
          <IconX size={14} className="mr-1" />
          Dismiss proposal
        </Button>
      </div>
    </div>
  );
}

// ─── BoardCard ────────────────────────────────────────────────────────────────

export function BoardCard({ section, note, proposals }: BoardCardProps) {
  const config = SECTION_CONFIG[section];
  const metric = useSectionMetric(section);
  const queryClient = useQueryClient();

  // Navigate mutation
  const navigateMutation = useActionMutation("navigate");

  // Filter proposals for this card
  const cardProposals = proposals.filter(
    (p) => p.actionName === config.proposalActionName,
  );

  const handleRefresh = useCallback(() => {
    // Invalidate all action queries (they'll refetch on next render)
    queryClient.invalidateQueries({ queryKey: ["action"] });
  }, [queryClient]);

  const hasNote = note && note.body.trim().length > 0;

  return (
    <Card className="min-h-[160px] bg-card border-border/60 shadow-sm">
      {/* Card Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {/* Left: icon + label */}
          <div className="flex items-center gap-2">
            <SectionIcon section={section} />
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              {config.label}
            </div>
          </div>

          {/* Right: overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="More options"
                className="h-7 w-7"
              >
                <IconDots size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  navigateMutation.mutate({ view: config.navView } as Record<
                    string,
                    unknown
                  > as Parameters<typeof navigateMutation.mutate>[0]);
                }}
              >
                {config.navLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleRefresh}>
                Refresh
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Computed subheading */}
        <MetricSubheading metric={metric} />
      </CardHeader>

      {/* Card Content */}
      <CardContent className="pt-0">
        {/* Revenue: primary MRR value at text-2xl font-semibold */}
        {section === "revenue" &&
          !metric.isLoading &&
          !metric.isError &&
          metric.mrrValue && (
            <div className="text-2xl font-semibold mb-2">{metric.mrrValue}</div>
          )}

        {/* AI note inset zone */}
        {hasNote ? (
          <div className="bg-muted/40 rounded-md p-3 mb-2">
            <div className="text-sm italic text-foreground/80">
              {note!.body}
            </div>
            {note!.updatedAt && (
              <div className="text-xs text-muted-foreground mt-1">
                {relativeTime(note!.updatedAt)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground mb-2">
            {config.emptyNote}
          </div>
        )}

        {/* Proposal zone */}
        {cardProposals.map((proposal) => (
          <ProposalRow
            key={proposal.id}
            proposal={proposal}
            section={section}
          />
        ))}
      </CardContent>
    </Card>
  );
}
