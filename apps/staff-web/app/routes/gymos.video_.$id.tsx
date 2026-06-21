// gymos.video_.$id.tsx — CV3-01
//
// Video composition editor at /gymos/video/:id.
//
// CRITICAL SSR PITFALL: The @remotion/player <Player> requires a browser
// environment. It MUST be wrapped in <ClientOnly> from @agent-native/core/client.
// Without ClientOnly, the route 500s on Vercel SSR (Remotion accesses browser
// globals on import). The VideoPreviewPlayer wrapper is ONLY imported inside the
// ClientOnly render function to ensure it is never bundled for SSR.
//
// Live preview: the <Player> receives `inputProps={{ spec }}` where `spec` is
// controlled React state. Every scene edit updates the state → new `inputProps`
// object → Remotion re-renders the composition live, no page reload needed.
//
// Agent live re-pull (VID-04): when useChangeVersions bumps and no local edit
// is pending (pendingRef.current === false), re-fetch the composition and replace
// the spec state so the agent's edits appear live.
//
// The trailing _ in the route name escapes React Router v7's nested-route
// inference, matching the gymos.members_.$id.tsx / gymos.content_.$id.tsx convention.

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, Link } from "react-router";
import { ClientOnly, DefaultSpinner } from "@agent-native/core/client";
import { useChangeVersions } from "@agent-native/core/client";

// Lazily import VideoPreviewPlayer so @remotion/player is NEVER bundled for SSR.
// React.lazy() + Suspense ensures the module is only loaded in the browser,
// preventing Remotion from accessing window/document globals during Vercel SSR.
// This is the second layer of SSR protection (ClientOnly is the first).
const VideoPreviewPlayerLazy = lazy(
  () => import("../../features/video/VideoPreviewPlayer").then((m) => ({ default: m.VideoPreviewPlayer })),
);
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconVideo,
  IconWorld,
  IconWorldOff,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  parseSpec,
  defaultSpec,
  recomputeDuration,
} from "../../server/lib/video-spec";
import type { VideoSpec, VideoScene } from "../../server/lib/video-spec";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompositionDetail {
  id: string;
  title: string;
  spec: string; // raw JSON TEXT from DB
  status: string;
  slug: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "RunStudio — Edit Composition" }];
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchComposition(id: string): Promise<CompositionDetail> {
  const res = await fetch(
    `/_agent-native/actions/video-get-composition?id=${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as CompositionDetail | { error: string };
  if ("error" in data) throw new Error((data as { error: string }).error);
  return data as CompositionDetail;
}

async function saveComposition(
  id: string,
  patch: { title?: string; spec?: VideoSpec },
): Promise<void> {
  const res = await fetch("/_agent-native/actions/video-update-composition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { error?: string };
  if (data.error) throw new Error(data.error);
}

// ─── Default scene for "Add scene" ────────────────────────────────────────────

function defaultNewScene(type: VideoScene["type"] = "title"): VideoScene {
  return { type, text: "New scene", durationInFrames: 60 };
}

// ─── Editor route ─────────────────────────────────────────────────────────────

export default function VideoEditorPage() {
  const { id } = useParams<{ id: string }>();

  const [composition, setComposition] = useState<CompositionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState<VideoSpec>(defaultSpec());
  const [selectedSceneIdx, setSelectedSceneIdx] = useState<number>(0);

  // Track whether there's a pending (unsaved) spec change
  const pendingRef = useRef(false);
  // Track the last spec we got from the server (for agent re-pull guard)
  const serverUpdatedAtRef = useRef<string>("");

  // ── Live version tracker for agent edits (VID-04) ──────────────────────────
  const actionVersion = useChangeVersions(["action"]);
  const actionVersionRef = useRef(actionVersion);

  // ── Load composition ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchComposition(id)
      .then((d) => {
        setComposition(d);
        setTitle(d.title);
        serverUpdatedAtRef.current = d.updatedAt;
        try {
          setSpec(parseSpec(d.spec));
        } catch {
          setSpec(defaultSpec());
        }
        pendingRef.current = false;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [id]);

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (opts?: { title?: string; spec?: VideoSpec }) => {
      if (!id || !composition) return;
      setSaving(true);
      setError(null);
      try {
        const patch: { title?: string; spec?: VideoSpec } = {};
        const newTitle = opts?.title ?? title;
        const newSpec = opts?.spec ?? spec;

        if (newTitle !== composition.title) patch.title = newTitle;
        // Always include spec on save (user may have edited scenes)
        patch.spec = recomputeDuration(newSpec);

        if (Object.keys(patch).length > 0) {
          await saveComposition(id, patch);
          setComposition((prev) =>
            prev
              ? {
                  ...prev,
                  title: patch.title ?? prev.title,
                  spec: JSON.stringify(patch.spec ?? newSpec),
                  updatedAt: new Date().toISOString(),
                }
              : prev,
          );
          serverUpdatedAtRef.current = new Date().toISOString();
          pendingRef.current = false;
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setError(msg);
      } finally {
        setSaving(false);
      }
    },
    [id, composition, title, spec],
  );

  // Auto-save title on blur
  const handleTitleBlur = useCallback(() => {
    void handleSave({ title });
  }, [handleSave, title]);

  // ── Publish / Unpublish (CV4) ─────────────────────────────────────────────
  const handleSetStatus = useCallback(
    async (targetStatus: "draft" | "published") => {
      if (!id || !composition) return;
      setPublishing(true);
      setError(null);
      try {
        const res = await fetch(
          "/_agent-native/actions/video-set-status",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status: targetStatus }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as
          | { updated: true; status: string; slug: string | null }
          | { error: string };
        if ("error" in data) throw new Error(data.error);
        setComposition((prev) =>
          prev
            ? {
                ...prev,
                status: targetStatus,
                slug: (data as { updated: true; status: string; slug: string | null }).slug ?? prev.slug,
              }
            : prev,
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Status update failed");
      } finally {
        setPublishing(false);
      }
    },
    [id, composition],
  );

  // ── Agent live re-pull (VID-04) ───────────────────────────────────────────
  useEffect(() => {
    if (!id || !composition) return;
    if (actionVersion <= actionVersionRef.current) return;
    actionVersionRef.current = actionVersion;

    // Only pull when there is no unsaved local change pending
    if (pendingRef.current) return;

    fetchComposition(id)
      .then((fresh) => {
        if (fresh.updatedAt === serverUpdatedAtRef.current) return; // no change
        serverUpdatedAtRef.current = fresh.updatedAt;
        setComposition(fresh);
        setTitle(fresh.title);
        try {
          setSpec(parseSpec(fresh.spec));
        } catch {
          setSpec(defaultSpec());
        }
      })
      .catch(() => {
        // Silently ignore re-pull errors
      });
  }, [actionVersion, id, composition]);

  // ── Spec mutation helpers ─────────────────────────────────────────────────

  function updateScene(idx: number, patch: Partial<VideoScene>) {
    setSpec((prev) => {
      const scenes = prev.scenes.map((s, i) =>
        i === idx ? { ...s, ...patch } : s,
      );
      pendingRef.current = true;
      return recomputeDuration({ ...prev, scenes });
    });
  }

  function addScene(type: VideoScene["type"] = "title") {
    setSpec((prev) => {
      const scenes = [...prev.scenes, defaultNewScene(type)];
      const newIdx = scenes.length - 1;
      setSelectedSceneIdx(newIdx);
      pendingRef.current = true;
      return recomputeDuration({ ...prev, scenes });
    });
  }

  function removeScene(idx: number) {
    if (spec.scenes.length <= 1) return; // at-least-one guard
    setSpec((prev) => {
      const scenes = prev.scenes.filter((_, i) => i !== idx);
      setSelectedSceneIdx((old) => Math.min(old, scenes.length - 1));
      pendingRef.current = true;
      return recomputeDuration({ ...prev, scenes });
    });
  }

  function moveScene(idx: number, direction: "up" | "down") {
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= spec.scenes.length) return;
    setSpec((prev) => {
      const scenes = [...prev.scenes];
      [scenes[idx], scenes[newIdx]] = [scenes[newIdx], scenes[idx]];
      setSelectedSceneIdx(newIdx);
      pendingRef.current = true;
      return recomputeDuration({ ...prev, scenes });
    });
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
      </div>
    );
  }

  // ── Render: error (no composition loaded) ─────────────────────────────────
  if (error && !composition) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <Link to="/gymos/video">
          <Button variant="outline" size="sm" className="gap-1.5">
            <IconArrowLeft className="size-4" />
            Back to video
          </Button>
        </Link>
      </div>
    );
  }

  const selectedScene = spec.scenes[selectedSceneIdx] ?? spec.scenes[0];
  const selectedIdx = Math.min(selectedSceneIdx, spec.scenes.length - 1);

  // ── Render: editor ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0">
        <Link to="/gymos/video">
          <Button variant="ghost" size="sm" className="gap-1 px-2">
            <IconArrowLeft className="size-4" />
          </Button>
        </Link>

        <div className="flex-1" />

        {error && (
          <span className="text-xs text-red-600 mr-2">{error}</span>
        )}
        {saved && (
          <span className="text-xs text-green-600 mr-2">Saved</span>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving}
          className="gap-1.5"
        >
          <IconDeviceFloppy className="size-4" />
          {saving ? "Saving…" : "Save"}
        </Button>

        {/* Publish / Unpublish button (CV4) — outside ClientOnly, plain UI */}
        {composition?.status === "published" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSetStatus("draft")}
            disabled={publishing}
            className="gap-1.5"
            title={`Unpublish — live at /v/${composition.slug ?? ""}`}
          >
            <IconWorldOff className="size-4" />
            {publishing ? "Updating…" : "Unpublish"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSetStatus("published")}
            disabled={publishing}
            className="gap-1.5"
          >
            <IconWorld className="size-4" />
            {publishing ? "Publishing…" : "Publish"}
          </Button>
        )}
      </div>

      {/* Two-column layout (lg: player left, editor right; mobile: stacked) */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ─ Left: Title + Player (ClientOnly — SSR pitfall) ────────────── */}
          <div className="flex flex-col gap-4">
            {/* Title input */}
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              onBlur={handleTitleBlur}
              className="w-full text-xl font-bold bg-transparent border-none outline-none placeholder-muted-foreground"
              placeholder="Untitled"
            />

            {/* Format select */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Format</span>
              <Select
                value={spec.format}
                onValueChange={(val: "square" | "landscape") => {
                  setSpec((prev) => ({ ...prev, format: val }));
                  pendingRef.current = true;
                }}
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="square">Square (1:1)</SelectItem>
                  <SelectItem value="landscape">Landscape (16:9)</SelectItem>
                </SelectContent>
              </Select>

              <Badge variant="secondary" className="text-[10px]">
                {spec.durationInFrames}f · {Math.round(spec.durationInFrames / spec.fps)}s
              </Badge>
            </div>

            {/*
              CRITICAL SSR PITFALL:
              The <Player> from @remotion/player MUST render only in the browser.
              Wrapping in <ClientOnly> ensures the component is never rendered
              during Vercel SSR — without this the route throws a 500 because
              Remotion accesses browser globals (window, document, requestAnimationFrame).

              The VideoPreviewPlayer is imported lazily inside the render function
              so it is never included in the SSR bundle.
            */}
            {/*
              Two-layer SSR protection:
              1. <ClientOnly> — renders nothing on the server (no JSX at all).
              2. React.lazy (VideoPreviewPlayerLazy) — defers the @remotion/player
                 module load until the browser JS bundle executes. This ensures
                 Remotion never runs during Vercel SSR even if ClientOnly changes.
              Without BOTH layers the route 500s on Vercel: Remotion imports
              access window/document/requestAnimationFrame at module evaluation.
            */}
            <ClientOnly fallback={
              <div className="aspect-square w-full bg-slate-900 rounded-lg flex items-center justify-center">
                <DefaultSpinner />
              </div>
            }>
              <Suspense fallback={
                <div className="aspect-square w-full bg-slate-900 rounded-lg flex items-center justify-center">
                  <DefaultSpinner />
                </div>
              }>
                <VideoPreviewPlayerLazy spec={spec} />
              </Suspense>
            </ClientOnly>
          </div>

          {/* ─ Right: Scene editor ────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Scenes</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={() => addScene("title")}
              >
                <IconPlus className="size-3.5" />
                Add scene
              </Button>
            </div>

            {/* Scene list */}
            <div className="flex flex-col gap-1">
              {spec.scenes.map((scene, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedSceneIdx(i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                    i === selectedIdx
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <IconVideo className="size-3.5 shrink-0" />
                  <span className="truncate flex-1">
                    <span className="text-[10px] opacity-60 uppercase mr-1">{scene.type}</span>
                    {scene.text}
                  </span>
                  <span className="text-[10px] opacity-50 shrink-0">
                    {Math.round(scene.durationInFrames / spec.fps)}s
                  </span>

                  {/* Move + delete (inline) */}
                  <span className="flex gap-0.5 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="hover:text-foreground disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveScene(i, "up")}
                      aria-label="Move scene up"
                    >
                      <IconArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="hover:text-foreground disabled:opacity-30"
                      disabled={i === spec.scenes.length - 1}
                      onClick={() => moveScene(i, "down")}
                      aria-label="Move scene down"
                    >
                      <IconArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="hover:text-destructive disabled:opacity-30"
                      disabled={spec.scenes.length <= 1}
                      onClick={() => removeScene(i)}
                      aria-label="Remove scene"
                    >
                      <IconTrash className="size-3.5" />
                    </button>
                  </span>
                </button>
              ))}
            </div>

            {/* Selected scene editor form */}
            {selectedScene && (
              <div className="flex flex-col gap-3 border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    Scene {selectedIdx + 1} of {spec.scenes.length}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      disabled={selectedIdx === 0}
                      onClick={() => moveScene(selectedIdx, "up")}
                      aria-label="Move scene up"
                    >
                      <IconArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      disabled={selectedIdx === spec.scenes.length - 1}
                      onClick={() => moveScene(selectedIdx, "down")}
                      aria-label="Move scene down"
                    >
                      <IconArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      disabled={spec.scenes.length <= 1}
                      onClick={() => removeScene(selectedIdx)}
                      aria-label="Remove scene"
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Scene type */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                  <Select
                    value={selectedScene.type}
                    onValueChange={(val: VideoScene["type"]) =>
                      updateScene(selectedIdx, { type: val })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="textOverImage">Text over image</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Scene text */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Text</label>
                  <Input
                    value={selectedScene.text}
                    onChange={(e) => updateScene(selectedIdx, { text: e.target.value })}
                    placeholder="Scene headline text"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Subtitle */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Subtitle <span className="opacity-50">(optional)</span>
                  </label>
                  <Input
                    value={selectedScene.subtitle ?? ""}
                    onChange={(e) =>
                      updateScene(selectedIdx, {
                        subtitle: e.target.value || undefined,
                      })
                    }
                    placeholder="Secondary text below headline"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Image URL (textOverImage) */}
                {selectedScene.type === "textOverImage" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Image URL <span className="opacity-50">(optional)</span>
                    </label>
                    <Input
                      value={selectedScene.imageUrl ?? ""}
                      onChange={(e) =>
                        updateScene(selectedIdx, {
                          imageUrl: e.target.value || undefined,
                        })
                      }
                      placeholder="https://example.com/image.jpg"
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {/* Background colour */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Background colour <span className="opacity-50">(optional)</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={selectedScene.bgColor ?? "#0F172A"}
                      onChange={(e) =>
                        updateScene(selectedIdx, { bgColor: e.target.value })
                      }
                      className="h-8 w-10 rounded border border-border cursor-pointer p-0.5"
                    />
                    <Input
                      value={selectedScene.bgColor ?? ""}
                      onChange={(e) =>
                        updateScene(selectedIdx, {
                          bgColor: e.target.value || undefined,
                        })
                      }
                      placeholder="#0F172A"
                      className="h-8 text-sm flex-1"
                    />
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Duration (frames at {spec.fps}fps ={" "}
                    {Math.round(selectedScene.durationInFrames / spec.fps)}s)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={selectedScene.durationInFrames}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (n > 0) updateScene(selectedIdx, { durationInFrames: n });
                    }}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Save button (bottom of editor) */}
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="gap-1.5 w-full"
            >
              <IconDeviceFloppy className="size-4" />
              {saving ? "Saving…" : "Save composition"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
