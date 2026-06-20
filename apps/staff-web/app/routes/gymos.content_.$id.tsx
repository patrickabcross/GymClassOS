// gymos.content_.$id.tsx — CV2-01
//
// Content document editor at /gymos/content/:id.
//
// NON-COLLAB Tiptap editor (no Yjs/hocuspocus/websocket/collaboration ext).
// Extensions: StarterKit, Placeholder, Image, Link.
// Auto-save on editor blur + title blur + explicit Save button (CONT-02).
// Image insert via toolbar button (shadcn Dialog + URL input — no window.prompt).
// Agent live re-pull: when useChangeVersions bumps and no pending edit, re-fetch
// and setContent without emitting an update (CONT-05).
//
// The trailing _ in the route name escapes React Router v7's nested-route
// inference, matching the gymos.members_.$id.tsx convention.

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link_ from "@tiptap/extension-link";
import { useChangeVersions } from "@agent-native/core/client";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconPhoto,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentDetail {
  id: string;
  title: string;
  body: string;
  status: string;
  slug: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "GymClassOS — Edit Document" }];
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchDocument(id: string): Promise<DocumentDetail> {
  const res = await fetch(
    `/_agent-native/actions/content-get-document?id=${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as DocumentDetail | { error: string };
  if ("error" in data) throw new Error(data.error);
  return data as DocumentDetail;
}

async function saveDocument(
  id: string,
  patch: { title?: string; body?: string },
): Promise<void> {
  const res = await fetch("/_agent-native/actions/content-update-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Editor route ─────────────────────────────────────────────────────────────

export default function ContentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  // Track pending body for auto-save on blur
  const pendingBodyRef = useRef<string | null>(null);
  // Track the last body we received from the server (for agent live re-pull guard)
  const serverBodyRef = useRef<string>("");

  // Image insert dialog
  const [imgDialogOpen, setImgDialogOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState("");

  // ── Live version tracker for agent edits (CONT-05) ──────────────────────────
  const actionVersion = useChangeVersions(["action"]);
  const actionVersionRef = useRef(actionVersion);

  // ── Tiptap editor (non-collab) ────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
      Image,
      Link_.configure({ openOnClick: false }),
    ],
    content: "",
    editable: true,
    onUpdate: ({ editor: ed }) => {
      // Capture body change for auto-save on blur
      pendingBodyRef.current = ed.getHTML();
      setSaved(false);
    },
  });

  // ── Load document ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchDocument(id)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        serverBodyRef.current = d.body;
        editor?.commands.setContent(d.body || "", { emitUpdate: false });
        pendingBodyRef.current = null;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [id, editor]);

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (opts?: { title?: string; body?: string }) => {
      if (!id || !doc) return;
      setSaving(true);
      try {
        const patch: { title?: string; body?: string } = {};
        const newTitle = opts?.title ?? title;
        const newBody =
          opts?.body ?? pendingBodyRef.current ?? editor?.getHTML() ?? "";

        if (newTitle !== doc.title) patch.title = newTitle;
        if (newBody !== doc.body) patch.body = newBody;

        if (Object.keys(patch).length > 0) {
          await saveDocument(id, patch);
          serverBodyRef.current = patch.body ?? doc.body;
          setDoc((prev) =>
            prev
              ? {
                  ...prev,
                  title: patch.title ?? prev.title,
                  body: patch.body ?? prev.body,
                  updatedAt: new Date().toISOString(),
                }
              : prev,
          );
          pendingBodyRef.current = null;
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [id, doc, title, editor],
  );

  // Auto-save on editor blur
  const handleEditorBlur = useCallback(() => {
    if (pendingBodyRef.current !== null) {
      void handleSave({ body: pendingBodyRef.current });
    }
  }, [handleSave]);

  // Auto-save title on blur
  const handleTitleBlur = useCallback(() => {
    void handleSave({ title });
  }, [handleSave, title]);

  // ── Agent live re-pull (CONT-05) ──────────────────────────────────────────
  // When the agent writes a new body and no local edit is pending, re-fetch
  // and silently update the editor (setContent without emitUpdate so
  // pendingBodyRef stays null).
  useEffect(() => {
    if (!id || !doc || !editor) return;
    if (actionVersion <= actionVersionRef.current) return;
    actionVersionRef.current = actionVersion;

    // Only pull when there is no unsaved local change pending
    if (pendingBodyRef.current !== null) return;

    fetchDocument(id)
      .then((fresh) => {
        if (fresh.updatedAt === doc.updatedAt) return; // no change
        serverBodyRef.current = fresh.body;
        editor.commands.setContent(fresh.body || "", { emitUpdate: false });
        setDoc(fresh);
        setTitle(fresh.title);
      })
      .catch(() => {
        // Silently ignore re-pull errors — user can manually save/refresh
      });
  }, [actionVersion, id, doc, editor]);

  // ── Image insert ──────────────────────────────────────────────────────────
  const handleInsertImage = () => {
    if (!imgUrl.trim() || !editor) return;
    editor.chain().focus().setImage({ src: imgUrl.trim() }).run();
    setImgUrl("");
    setImgDialogOpen(false);
  };

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  // ── Render: error (no doc loaded) ─────────────────────────────────────────
  if (error && !doc) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <Link to="/gymos/content">
          <Button variant="outline" size="sm" className="gap-1.5">
            <IconArrowLeft className="size-4" />
            Back to content
          </Button>
        </Link>
      </div>
    );
  }

  // ── Render: editor ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0">
        <Link to="/gymos/content">
          <Button variant="ghost" size="sm" className="gap-1 px-2">
            <IconArrowLeft className="size-4" />
          </Button>
        </Link>

        {/* Image insert button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setImgDialogOpen(true)}
          className="gap-1.5"
          title="Insert image"
        >
          <IconPhoto className="size-4" />
          Image
        </Button>

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
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
        {/* Title input */}
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaved(false);
          }}
          onBlur={handleTitleBlur}
          className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder-muted-foreground mb-4"
          placeholder="Untitled"
        />

        {/* Non-collab Tiptap editor (CV2-01 / CONT-02) */}
        <EditorContent
          editor={editor}
          onBlur={handleEditorBlur}
          className="prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[300px]"
        />
      </div>

      {/* Image insert dialog (no window.prompt) */}
      <Dialog open={imgDialogOpen} onOpenChange={setImgDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert image</DialogTitle>
          </DialogHeader>
          <Input
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInsertImage();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImgDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleInsertImage}
              disabled={!imgUrl.trim()}
            >
              Insert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
