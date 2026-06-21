// gymos.content.tsx — CV2-01
//
// Content list page at /gymos/content.
//
// Replaces the CV1 placeholder. Shows a list of content_documents from a SSR
// loader query, with optimistic "New document" creation, live-refresh via
// useChangeVersions, and a ⋯ DropdownMenu for secondary actions (rename,
// duplicate, delete).
//
// No collab/Yjs — single-author documents.
// Admin-gated: route lives inside the admin cluster (gymos.tsx isAdmin wrapper).
// Single-tenant: guard:allow-unscoped on every query.

import { useEffect, useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useChangeVersions } from "@agent-native/core/client";
import { useNavigationState } from "@/hooks/use-navigation-state";
import { nanoid } from "nanoid";
import { desc } from "drizzle-orm";
import { toast } from "sonner";
import {
  IconFileText,
  IconPlus,
  IconDots,
  IconPencil,
  IconCopy,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { getDb, schema } from "../../server/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocRow {
  id: string;
  title: string;
  status: string;
  slug: string | null;
  updatedAt: string;
  createdAt: string;
  bodyPreview: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.floor(diffMs / (1000 * 3600));
  if (diffH < 1) return "< 1h ago";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function bodyPreview(html: string, maxLength = 180): string {
  const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength).trimEnd()}...`;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "RunStudio — Content" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader(_args: LoaderFunctionArgs) {
  const db = getDb();
  // guard:allow-unscoped — single-tenant content
  const rows = await db
    .select({
      id: schema.contentDocuments.id,
      title: schema.contentDocuments.title,
      status: schema.contentDocuments.status,
      slug: schema.contentDocuments.slug,
      body: schema.contentDocuments.body,
      updatedAt: schema.contentDocuments.updatedAt,
      createdAt: schema.contentDocuments.createdAt,
    })
    .from(schema.contentDocuments)
    .orderBy(desc(schema.contentDocuments.updatedAt));

  const documents: DocRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    slug: r.slug,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
    bodyPreview: bodyPreview(r.body),
  }));

  return { documents };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { documents: loaderDocs } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const actionVersion = useChangeVersions(["action"]);
  const navState = useNavigationState();
  const navigate = useNavigate();

  // Sync the navigation state so view-screen content branch shows live data (CV2)
  useEffect(() => {
    navState.sync({ view: "content" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-refresh when agent mutates content (CONT-05)
  useEffect(() => {
    if (actionVersion > 0) revalidator.revalidate();
  }, [actionVersion]);

  // ── Rename dialog state ────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<DocRow | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  // ── Delete alert state ─────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<DocRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── New document (optimistic) ──────────────────────────────────────────────
  const handleNewDocument = () => {
    const id = nanoid();
    // Fire-and-forget — navigate immediately (optimistic)
    fetch("/_agent-native/actions/content-create-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: "Untitled" }),
    }).catch(() => {
      toast.error("Failed to create document");
    });
    void navigate(`/gymos/content/${id}`);
  };

  // ── Duplicate ──────────────────────────────────────────────────────────────
  const handleDuplicate = async (doc: DocRow) => {
    const newId = nanoid();
    try {
      await fetch("/_agent-native/actions/content-duplicate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, newId }),
      });
      revalidator.revalidate();
    } catch {
      toast.error("Failed to duplicate document");
    }
  };

  // ── Rename submit ──────────────────────────────────────────────────────────
  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      await fetch("/_agent-native/actions/content-rename-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameTarget.id, title: renameTitle.trim() }),
      });
      setRenameTarget(null);
      revalidator.revalidate();
    } catch {
      toast.error("Failed to rename document");
    } finally {
      setRenaming(false);
    }
  };

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch("/_agent-native/actions/content-delete-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      setDeleteTarget(null);
      revalidator.revalidate();
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeleting(false);
    }
  };

  const docs = loaderDocs;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <IconFileText size={18} className="text-muted-foreground" aria-hidden />
          <h1 className="text-base font-semibold">Content</h1>
          <Badge variant="secondary" className="text-xs">
            {docs.length}
          </Badge>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleNewDocument}
          className="gap-1.5"
        >
          <IconPlus className="size-4" />
          New document
        </Button>
      </div>

      {/* Empty state */}
      {docs.length === 0 && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <IconFileText className="size-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No documents yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Create your first document to get started.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={handleNewDocument}
              className="gap-1.5"
            >
              <IconPlus className="size-4" />
              New document
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Document list */}
      {docs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              {docs.length} document{docs.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-start gap-2 px-4 py-3 hover:bg-muted/50 transition-colors group">
                  <Link
                    to={`/gymos/content/${doc.id}`}
                    className="flex items-start gap-3 min-w-0 flex-1"
                  >
                    <IconFileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {doc.title || "Untitled"}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                          {doc.status}
                        </Badge>
                      </div>
                      {doc.bodyPreview && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {doc.bodyPreview}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                      {relativeTime(doc.updatedAt)}
                    </span>
                  </Link>

                  {/* ⋯ secondary actions (progressive disclosure) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                        aria-label="Document options"
                      >
                        <IconDots className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget(doc);
                          setRenameTitle(doc.title);
                        }}
                      >
                        <IconPencil className="size-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleDuplicate(doc)}>
                        <IconCopy className="size-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <IconTrash className="size-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Rename Dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            placeholder="Document title"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameSubmit();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleRenameSubmit()}
              disabled={renaming || !renameTitle.trim()}
            >
              {renaming ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title || "Untitled"}" will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteConfirm()}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
