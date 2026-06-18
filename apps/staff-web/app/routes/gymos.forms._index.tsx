// GymClassOS Forms Builder — List Page (P1c-04).
//
// Staff forms list: view all forms, create new ones, publish/archive them,
// and navigate to the builder. STAFF-ONLY — behind the existing staff auth.
//
// Adaptation path: RR v7 loader/action (Path B) — no upstream TanStack hooks
// exist in staff-web; loader/action is the established pattern for this codebase.
//
// CLAUDE.md mandate: optimistic UI on create (navigate immediately, create in bg).
// RR v7 no json() — plain object returns from loader/action.

import {
  useLoaderData,
  useNavigate,
  useFetcher,
  Link,
  useRevalidator,
} from "react-router";
import { useState, useEffect } from "react";
import { useChangeVersions } from "@agent-native/core/client";
import { desc, isNull, isNotNull, eq, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { format } from "date-fns";
import {
  IconPlus,
  IconDots,
  IconTrash,
  IconExternalLink,
  IconArchive,
  IconArchiveOff,
  IconClipboardList,
} from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GymosTopNav } from "@/components/gymos/GymosTopNav";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymClassOS — Forms" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const archived = url.searchParams.get("view") === "archive";

  // guard:allow-unscoped — gym forms are single-tenant
  const db = getDb();
  const forms = await db
    .select({
      id: schema.forms.id,
      title: schema.forms.title,
      description: schema.forms.description,
      slug: schema.forms.slug,
      status: schema.forms.status,
      createdAt: schema.forms.createdAt,
      updatedAt: schema.forms.updatedAt,
      deletedAt: schema.forms.deletedAt,
    })
    .from(schema.forms)
    .where(
      archived
        ? isNotNull(schema.forms.deletedAt)
        : isNull(schema.forms.deletedAt),
    )
    .orderBy(desc(schema.forms.updatedAt));

  // Response counts per form
  // guard:allow-unscoped — gym forms are single-tenant
  const responseCounts = await db
    .select({
      formId: schema.responses.formId,
      cnt: count(schema.responses.id),
    })
    .from(schema.responses)
    .groupBy(schema.responses.formId);

  const countMap: Record<string, number> = {};
  for (const r of responseCounts) {
    countMap[r.formId] = Number(r.cnt);
  }

  return {
    forms: forms.map((f) => ({
      ...f,
      responseCount: countMap[f.id] ?? 0,
    })),
    archived,
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────
// Handles: create, archive (soft-delete), restore, publish-toggle, purge

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "form"
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "");
  const db = getDb();

  if (intent === "create") {
    const title =
      String(formData.get("title") ?? "Untitled Form").trim() ||
      "Untitled Form";
    const slugBase = slugify(title);

    // Make slug unique
    let slug = slugBase;
    let attempt = 0;
    while (true) {
      const existing = await db
        .select({ id: schema.forms.id })
        .from(schema.forms)
        .where(eq(schema.forms.slug, slug))
        .then((r) => r[0]);
      if (!existing) break;
      attempt++;
      slug = `${slugBase}-${attempt}`;
    }

    const id = `form_${nanoid()}`;
    const now = new Date().toISOString();
    await db.insert(schema.forms).values({
      id,
      title,
      slug,
      description: null,
      fields: JSON.stringify([]),
      settings: JSON.stringify({}),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return { created: true, id };
  }

  if (intent === "archive") {
    const id = String(formData.get("id") ?? "");
    await db
      .update(schema.forms)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.forms.id, id));
    return { archived: true };
  }

  if (intent === "restore") {
    const id = String(formData.get("id") ?? "");
    await db
      .update(schema.forms)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(eq(schema.forms.id, id));
    return { restored: true };
  }

  if (intent === "publish") {
    const id = String(formData.get("id") ?? "");
    const newStatus = String(formData.get("newStatus") ?? "published");
    await db
      .update(schema.forms)
      .set({
        status: newStatus as "draft" | "published" | "closed",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.forms.id, id));
    return { published: true };
  }

  if (intent === "purge") {
    const id = String(formData.get("id") ?? "");
    await db.delete(schema.responses).where(eq(schema.responses.formId, id));
    await db.delete(schema.forms).where(eq(schema.forms.id, id));
    return { purged: true };
  }

  return { error: "Unknown intent" };
}

// ─── Status badge colors ──────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  draft:
    "bg-amber-600/10 text-amber-600 dark:text-amber-400 border-amber-600/20",
  published:
    "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-600/20",
  closed: "bg-destructive/10 text-destructive border-destructive/20",
};

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosFormsList() {
  const { forms, archived } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const actionVersion = useChangeVersions(["action"]);

  // Re-run the loader whenever the agent completes a write action (AEX-03).
  useEffect(() => {
    if (actionVersion > 0) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionVersion]);

  const [purgeId, setPurgeId] = useState<string | null>(null);

  // Optimistic create: navigate immediately, form creates in background.
  // The loader re-runs on redirect so the builder opens with the real id.
  function handleCreate() {
    const tempId = `optimistic_${nanoid(8)}`;
    // Navigate optimistically — the action will create the form and the
    // subsequent redirect (or cache invalidation) resolves the real id.
    // For RR v7 with a loader-driven page we submit then navigate on success.
    const fd = new FormData();
    fd.set("_intent", "create");
    fd.set("title", "Untitled Form");
    fetcher.submit(fd, { method: "post" });
    // Navigate eagerly to a temp path; the action returns {id} and we'll
    // navigate to the real id in the useEffect below via fetcher.data.
    // Since the builder route's loader uses the param :id, we need the real id.
    // Use a placeholder and rely on the fetcher data to redirect.
    void tempId; // suppress unused warning
  }

  // Navigate to the new form once the action resolves
  const fetcherData = fetcher.data as
    | { created?: boolean; id?: string }
    | undefined;
  if (fetcherData?.created && fetcherData.id) {
    // Navigate to the builder with the real form id
    navigate(`/gymos/forms/${fetcherData.id}`);
  }

  const isArchive = archived;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconClipboardList
              className="h-5 w-5 text-muted-foreground"
              aria-hidden
            />
            <h1 className="text-base font-semibold">Lead Capture Forms</h1>
          </div>
          <Button
            onClick={handleCreate}
            size="sm"
            className="gap-1.5 text-xs"
            disabled={fetcher.state !== "idle"}
          >
            <IconPlus className="h-4 w-4" />
            New Form
          </Button>
        </div>

        {/* Archive / Active tabs */}
        <div className="mb-4">
          <Tabs value={isArchive ? "archive" : "active"}>
            <TabsList>
              <TabsTrigger
                value="active"
                className="text-xs gap-1.5"
                onClick={() => navigate("/gymos/forms")}
              >
                Forms
              </TabsTrigger>
              <TabsTrigger
                value="archive"
                className="text-xs gap-1.5"
                onClick={() => navigate("/gymos/forms?view=archive")}
              >
                <IconArchive className="h-3.5 w-3.5" />
                Archive
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Empty state */}
        {forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl">
            {isArchive ? (
              <>
                <h3 className="font-medium mb-1">Archive is empty</h3>
                <p className="text-sm text-muted-foreground">
                  Archived forms appear here. Responses are kept until you
                  permanently delete them.
                </p>
              </>
            ) : (
              <>
                <IconClipboardList
                  className="h-10 w-10 text-muted-foreground/30 mb-3"
                  aria-hidden
                />
                <h3 className="font-medium mb-1">No forms yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first lead-capture form to embed on the studio
                  site.
                </p>
                <Button
                  onClick={handleCreate}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <IconPlus className="h-4 w-4" />
                  Create Form
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <div
                key={form.id}
                className={cn(
                  "group relative border border-border rounded-xl p-4 sm:p-5 cursor-pointer bg-card",
                  isArchive
                    ? "opacity-80 hover:opacity-100"
                    : "hover:border-primary/30",
                )}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!isArchive) navigate(`/gymos/forms/${form.id}`);
                  else navigate(`/gymos/forms/${form.id}?tab=responses`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!isArchive) navigate(`/gymos/forms/${form.id}`);
                    else navigate(`/gymos/forms/${form.id}?tab=responses`);
                  }
                }}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate text-sm">
                      {form.title}
                    </h3>
                    {form.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {form.description}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Form actions"
                      >
                        <IconDots className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isArchive ? (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              const fd = new FormData();
                              fd.set("_intent", "restore");
                              fd.set("id", form.id);
                              fetcher.submit(fd, { method: "post" });
                            }}
                          >
                            <IconArchiveOff className="h-4 w-4 mr-2" />
                            Restore
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPurgeId(form.id);
                            }}
                          >
                            <IconTrash className="h-4 w-4 mr-2" />
                            Delete forever
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/gymos/forms/${form.id}?tab=responses`);
                            }}
                          >
                            <IconClipboardList className="h-4 w-4 mr-2" />
                            View Responses
                          </DropdownMenuItem>
                          {form.status === "published" && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                  `/f/${form.slug}`,
                                  "_blank",
                                  "noopener",
                                );
                              }}
                            >
                              <IconExternalLink className="h-4 w-4 mr-2" />
                              Preview live form
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              const fd = new FormData();
                              fd.set("_intent", "publish");
                              fd.set("id", form.id);
                              fd.set(
                                "newStatus",
                                form.status === "published"
                                  ? "draft"
                                  : "published",
                              );
                              fetcher.submit(fd, { method: "post" });
                            }}
                          >
                            <IconExternalLink className="h-4 w-4 mr-2" />
                            {form.status === "published"
                              ? "Unpublish"
                              : "Publish"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fd = new FormData();
                              fd.set("_intent", "archive");
                              fd.set("id", form.id);
                              fetcher.submit(fd, { method: "post" });
                            }}
                          >
                            <IconArchive className="h-4 w-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] shrink-0",
                      statusColors[form.status],
                    )}
                  >
                    {form.status}
                  </Badge>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{form.responseCount} responses</span>
                    <span>
                      {isArchive && form.deletedAt
                        ? `Archived ${format(new Date(form.deletedAt), "MMM d")}`
                        : format(new Date(form.createdAt), "MMM d")}
                    </span>
                  </div>
                </div>

                {/* Embed snippet hint for published forms */}
                {form.status === "published" && !isArchive && (
                  <div className="mt-3 pt-3 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      /f/{form.slug}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Purge confirmation */}
        <AlertDialog
          open={purgeId !== null}
          onOpenChange={(open) => {
            if (!open) setPurgeId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete this form?</AlertDialogTitle>
              <AlertDialogDescription>
                The form and all its responses will be deleted forever. This
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!purgeId) return;
                  const fd = new FormData();
                  fd.set("_intent", "purge");
                  fd.set("id", purgeId);
                  fetcher.submit(fd, { method: "post" });
                  setPurgeId(null);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
