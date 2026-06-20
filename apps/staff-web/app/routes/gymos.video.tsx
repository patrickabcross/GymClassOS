// gymos.video.tsx — CV3-01
//
// Video list page at /gymos/video.
//
// REPLACES the CV1 placeholder. Shows a list of video_compositions from a SSR
// loader query, with optimistic "New composition" creation, live-refresh via
// useChangeVersions, and a ⋯ DropdownMenu for secondary actions (rename,
// duplicate, delete via AlertDialog).
//
// CSS poster = a div with the first scene's bgColor + posterText (best-effort;
// no server render, no still-frame export).
//
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
  IconVideo,
  IconPlus,
  IconDots,
  IconPencil,
  IconCopy,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { parseSpec, defaultSpec } from "../../server/lib/video-spec";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompositionRow {
  id: string;
  title: string;
  status: string;
  slug: string | null;
  updatedAt: string;
  createdAt: string;
  format: string;
  sceneCount: number;
  posterText: string;
  posterColor: string;
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

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "GymClassOS — Video" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader(_args: LoaderFunctionArgs) {
  const db = getDb();
  // guard:allow-unscoped — single-tenant video
  const rows = await db
    .select({
      id: schema.videoCompositions.id,
      title: schema.videoCompositions.title,
      status: schema.videoCompositions.status,
      slug: schema.videoCompositions.slug,
      spec: schema.videoCompositions.spec,
      updatedAt: schema.videoCompositions.updatedAt,
      createdAt: schema.videoCompositions.createdAt,
    })
    .from(schema.videoCompositions)
    .orderBy(desc(schema.videoCompositions.updatedAt));

  const compositions: CompositionRow[] = rows.map((r) => {
    let format = "square";
    let sceneCount = 0;
    let posterText = r.title || "Untitled";
    let posterColor = "#0F172A";

    try {
      const spec = parseSpec(r.spec);
      format = spec.format;
      sceneCount = spec.scenes.length;
      if (spec.scenes.length > 0) {
        posterText = spec.scenes[0].text;
        if (spec.scenes[0].bgColor) posterColor = spec.scenes[0].bgColor;
      }
    } catch {
      const def = defaultSpec();
      format = def.format;
      sceneCount = def.scenes.length;
    }

    return {
      id: r.id,
      title: r.title,
      status: r.status,
      slug: r.slug,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
      format,
      sceneCount,
      posterText,
      posterColor,
    };
  });

  return { compositions };
}

// ─── CSS poster ──────────────────────────────────────────────────────────────

function CompositionPoster({ row }: { row: CompositionRow }) {
  const isSquare = row.format !== "landscape";
  return (
    <div
      style={{
        backgroundColor: row.posterColor,
        aspectRatio: isSquare ? "1 / 1" : "16 / 9",
        width: isSquare ? "48px" : "64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        flexShrink: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <span
        style={{
          color: "rgba(255,255,255,0.85)",
          fontSize: "7px",
          fontWeight: 600,
          textAlign: "center",
          padding: "2px 3px",
          lineHeight: 1.2,
          wordBreak: "break-word",
          maxWidth: "90%",
        }}
      >
        {row.posterText.slice(0, 24)}
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function VideoPage() {
  const { compositions: loaderCompositions } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const actionVersion = useChangeVersions(["action"]);
  const navState = useNavigationState();
  const navigate = useNavigate();

  // Sync the navigation state so view-screen video branch shows live data (CV3)
  useEffect(() => {
    navState.sync({ view: "video" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-refresh when agent mutates compositions (VID-04 parity with CONT-05)
  useEffect(() => {
    if (actionVersion > 0) revalidator.revalidate();
  }, [actionVersion]);

  // ── Rename dialog state ────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<CompositionRow | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  // ── Delete alert state ─────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<CompositionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── New composition (optimistic) ──────────────────────────────────────────
  const handleNewComposition = () => {
    const id = nanoid();
    // Fire-and-forget — navigate immediately (optimistic)
    fetch("/_agent-native/actions/video-create-composition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: "Untitled" }),
    }).catch(() => {
      toast.error("Failed to create composition");
    });
    void navigate(`/gymos/video/${id}`);
  };

  // ── Duplicate ──────────────────────────────────────────────────────────────
  const handleDuplicate = async (row: CompositionRow) => {
    const newId = nanoid();
    try {
      await fetch("/_agent-native/actions/video-duplicate-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, newId }),
      });
      revalidator.revalidate();
    } catch {
      toast.error("Failed to duplicate composition");
    }
  };

  // ── Rename submit ──────────────────────────────────────────────────────────
  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      await fetch("/_agent-native/actions/video-rename-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameTarget.id, title: renameTitle.trim() }),
      });
      setRenameTarget(null);
      revalidator.revalidate();
    } catch {
      toast.error("Failed to rename composition");
    } finally {
      setRenaming(false);
    }
  };

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch("/_agent-native/actions/video-delete-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      setDeleteTarget(null);
      revalidator.revalidate();
    } catch {
      toast.error("Failed to delete composition");
    } finally {
      setDeleting(false);
    }
  };

  const compositions = loaderCompositions;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <IconVideo size={18} className="text-muted-foreground" aria-hidden />
          <h1 className="text-base font-semibold">Video</h1>
          <Badge variant="secondary" className="text-xs">
            {compositions.length}
          </Badge>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleNewComposition}
          className="gap-1.5"
        >
          <IconPlus className="size-4" />
          New composition
        </Button>
      </div>

      {/* Empty state */}
      {compositions.length === 0 && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <IconVideo className="size-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No compositions yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Create your first promo video to get started.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={handleNewComposition}
              className="gap-1.5"
            >
              <IconPlus className="size-4" />
              New composition
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Composition list */}
      {compositions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              {compositions.length} composition{compositions.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {compositions.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <Link
                    to={`/gymos/video/${row.id}`}
                    className="flex items-center gap-3 min-w-0 flex-1"
                  >
                    {/* CSS poster thumbnail */}
                    <CompositionPoster row={row} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {row.title || "Untitled"}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                          {row.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {row.format} · {row.sceneCount} scene{row.sceneCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                      {relativeTime(row.updatedAt)}
                    </span>
                  </Link>

                  {/* ⋯ secondary actions (progressive disclosure) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                        aria-label="Composition options"
                      >
                        <IconDots className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget(row);
                          setRenameTitle(row.title);
                        }}
                      >
                        <IconPencil className="size-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleDuplicate(row)}>
                        <IconCopy className="size-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(row)}
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
            <DialogTitle>Rename composition</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            placeholder="Composition title"
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
            <AlertDialogTitle>Delete composition?</AlertDialogTitle>
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
