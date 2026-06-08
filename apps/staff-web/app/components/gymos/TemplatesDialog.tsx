// GymClassOS WhatsApp Templates picker — P1b.1-05 / WA-08.
//
// Surfaces the worker-chokepoint template send path in the staff inbox. Single
// shadcn Dialog: left pane lists all whatsapp_templates rows; right pane
// renders the selected template's body preview + per-{{N}} variable inputs;
// footer has Discard draft + Send template.
//
// Submission contract (matches gymos._index.tsx action discriminator):
//   POST / with formData _intent=send-template, conversationId, templateName,
//   vars=JSON.stringify(varsMap). The action does the optimistic insert +
//   enqueueOutboundWhatsApp. The worker's sendMessage() chokepoint re-checks:
//     1. opt-in (WA-07; refuses if no whatsapp_opt_in row)
//     2. window — bypassed for templates (the whole point — WA-06)
//     3. template approval — refuses if status !== 'approved' (WA-08)
//   No direct Meta call from staff-web (D-11 / WA-05). UI pre-gates Send when
//   the loader knows hasOptIn is false, but the worker is authoritative
//   (defence in depth — UI cache can be stale per D-19).
//
// Copywriting: every visible string in this file is verbatim per P1b.1-UI-SPEC
// §"Copywriting Contract". Do not paraphrase — the checker fails otherwise.
//
// Skeleton loading state (UI-SPEC §"Loading states"): deferred. The templates
// list ships in the parent route loader (gymos._index.tsx returns
// `data.templates`), so by the time this Dialog renders the list is already
// populated. No realistic case triggers a loading state. If/when templates
// move to a client fetcher (e.g. a polling refresh while waiting for Meta
// approval to land), wrap the left-pane list in shadcn `<Skeleton>` rows
// (h-8 w-full, 3 rows) per the UI-SPEC contract.

import { useState, useMemo, useEffect } from "react";
import { useFetcher } from "react-router";
import { IconTemplate, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type TemplateRow = {
  name: string;
  status: "pending" | "approved" | "rejected" | "paused" | "disabled";
  category: "utility" | "marketing" | "authentication" | null;
  language: string;
  componentsJson: string;
};

export type TemplatesDialogProps = {
  conversationId: string;
  templates: TemplateRow[];
  hasOptIn: boolean;
};

type ComponentBlock = {
  type?: string;
  text?: string;
};

// Extract sorted unique {{N}} placeholder numbers from a template's BODY
// component. hello_world has 0 vars; class_reminder etc. would have {{1}}, {{2}}.
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

function renderPreview(bodyText: string, vars: Record<string, string>): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, n: string) =>
    vars[n] && vars[n].trim().length > 0 ? vars[n] : `{{${n}}}`,
  );
}

export function TemplatesDialog({
  conversationId,
  templates,
  hasOptIn,
}: TemplatesDialogProps) {
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();
  const isSyncing = syncFetcher.state !== "idle";
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});

  const selected = selectedName
    ? (templates.find((t) => t.name === selectedName) ?? null)
    : null;
  const variables = useMemo(
    () => (selected ? extractVariables(selected.componentsJson) : []),
    [selected],
  );
  const bodyText = useMemo(
    () => (selected ? getBodyText(selected.componentsJson) : ""),
    [selected],
  );
  const preview = useMemo(
    () => renderPreview(bodyText, vars),
    [bodyText, vars],
  );

  const allFilled = variables.every((v) => (vars[v] ?? "").trim().length > 0);
  const canSend =
    selected !== null &&
    selected.status === "approved" &&
    allFilled &&
    hasOptIn;

  const resetState = () => {
    setSelectedName(null);
    setVars({});
  };

  const handleSelect = (name: string, status: string) => {
    if (status !== "approved") return; // disabled rows are not selectable
    setSelectedName(name);
    setVars({});
  };

  const handleSend = () => {
    if (!selected || !canSend) return;
    const fd = new FormData();
    fd.set("_intent", "send-template");
    fd.set("conversationId", conversationId);
    fd.set("templateName", selected.name);
    fd.set("vars", JSON.stringify(vars));
    // Submit to the /gymos/compose resource route (a path-owning route that
    // re-exports the send action). We can't target the /gymos *index* action:
    // single-fetch POSTs to "/gymos.data?index" 404 on this Nitro+Vercel build.
    // Path-owning routes work (same reason gymos.forms.$id submits cleanly).
    fetcher.submit(fd, { method: "post", action: "/gymos/compose" });
    toast.success("Template queued");
    setOpen(false);
    resetState();
  };

  const handleSync = () => {
    const fd = new FormData();
    fd.set("_intent", "sync-templates");
    syncFetcher.submit(fd, { method: "post", action: "/gymos/compose" });
  };

  useEffect(() => {
    if (syncFetcher.state !== "idle") return;
    const r = (
      syncFetcher.data as
        | {
            syncResult?: {
              ok: boolean;
              synced?: number;
              error?: string;
            };
          }
        | undefined
    )?.syncResult;
    if (!r) return;
    if (r.ok) {
      toast.success(`Updated — ${r.synced ?? 0} templates`);
    } else {
      toast.error(r.error ?? "Couldn't update templates");
    }
  }, [syncFetcher.data, syncFetcher.state]);

  const handleDiscard = () => {
    setOpen(false);
    resetState();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetState();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <IconTemplate size={14} aria-hidden className="mr-1" />
          Templates
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-[640px] h-[520px] p-0 gap-0 flex flex-col"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-4 py-3 border-b border-border/50 space-y-0.5 flex flex-row items-start justify-between">
          <div className="space-y-0.5">
            <DialogTitle className="text-sm font-semibold">
              Send a template
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              Approved WhatsApp message templates
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <IconRefresh
              size={14}
              aria-hidden
              className={isSyncing ? "mr-1 animate-spin" : "mr-1"}
            />
            {isSyncing ? "Updating…" : "Update templates"}
          </Button>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* ─── Left pane: template list ─────────────────────────────── */}
          <div className="w-[200px] border-r border-border/50 flex flex-col">
            <ScrollArea className="flex-1">
              <TooltipProvider delayDuration={300}>
                <div
                  className="p-2 flex flex-col gap-1"
                  role="listbox"
                  aria-label="WhatsApp templates"
                >
                  {templates.map((t) => {
                    const isApproved = t.status === "approved";
                    const isSelected = selectedName === t.name;
                    const button = (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={!isApproved}
                        onClick={() => handleSelect(t.name, t.status)}
                        className={[
                          "w-full text-left px-2 py-1.5 rounded text-[13px] transition-colors",
                          isSelected ? "bg-accent" : "hover:bg-accent/40",
                          !isApproved
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer",
                        ].join(" ")}
                      >
                        <div className="truncate">{t.name}</div>
                        <div className="mt-1">
                          {isApproved ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              Approved
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal opacity-70"
                            >
                              Awaiting approval
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                    if (isApproved) {
                      return <div key={t.name}>{button}</div>;
                    }
                    return (
                      <Tooltip key={t.name}>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="block">
                            {button}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-[11px] max-w-[220px]">
                            Awaiting Meta approval — submit templates via your
                            Meta Business Manager
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </ScrollArea>
          </div>

          {/* ─── Right pane: form + preview ───────────────────────────── */}
          <div className="flex-1 px-4 py-3 flex flex-col gap-3 min-w-0">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
                Select a template from the list
              </div>
            ) : (
              <>
                <div className="text-sm font-semibold truncate">
                  {selected.name}
                </div>

                {variables.length === 0 ? (
                  <div className="text-[12px] text-muted-foreground">
                    This template has no variables.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {variables.map((v) => {
                      const value = vars[v] ?? "";
                      const empty = value.trim().length === 0;
                      return (
                        <div key={v} className="flex flex-col gap-1">
                          <label
                            htmlFor={`tpl-var-${v}`}
                            className="text-[12px] text-muted-foreground"
                          >
                            Variable {v}
                          </label>
                          <Input
                            id={`tpl-var-${v}`}
                            className="text-[13px]"
                            value={value}
                            onChange={(e) =>
                              setVars((prev) => ({
                                ...prev,
                                [v]: e.target.value,
                              }))
                            }
                          />
                          {empty && (
                            <div className="text-[11px] text-destructive">
                              Required
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Separator className="my-1" />

                <div className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Preview
                </div>
                <div className="text-[13px] bg-muted/40 rounded p-3 leading-[1.5] whitespace-pre-wrap break-words">
                  {preview || "(empty)"}
                </div>

                {!hasOptIn && (
                  <div className="text-[11px] text-destructive">
                    Member hasn't opted in to WhatsApp messages
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ─── Footer ──────────────────────────────────────────────────── */}
        <div className="border-t border-border/50 px-4 py-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleDiscard}>
            Discard draft
          </Button>
          <Button type="button" disabled={!canSend} onClick={handleSend}>
            Send template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
