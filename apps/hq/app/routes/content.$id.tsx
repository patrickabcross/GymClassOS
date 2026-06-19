// apps/hq/app/routes/content.$id.tsx
//
// HQ Content editor — /content/:id (HQD-04).
//
// NON-COLLAB Tiptap editor (D-03 / D-10 — single super-admin, no Yjs/CRDT).
//
// DROPPED vs templates/content upstream:
//   - @tiptap/extension-collaboration, @tiptap/extension-collaboration-caret
//   - @tiptap/y-tiptap, yjs, y-protocols
//   - useCollaborativeDoc hook (replaced with plain controlled editor)
//   - CommentsSidebar, NotionConflictBanner, NotionSyncBar
//   - No hocuspocus websocket server plugin
//
// KEPT:
//   - StarterKit (bold, italic, heading, lists, code blocks, etc.)
//   - Placeholder extension
//   - Auto-save on blur + explicit Save button
//   - Version snapshots (content-update-document handles internally)
//
// UI rules:
//   - shadcn/ui primitives (Button, Card)
//   - Tabler icons — no emojis as icons
//   - No browser confirm dialogs

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconTrash,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentDetail {
  id: string;
  title: string;
  content: string;
  icon: string | null;
  isFavorite: boolean;
  visibility: string;
  accessRole: string;
  canEdit: boolean;
  canManage: boolean;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchDocument(id: string): Promise<DocumentDetail> {
  const res = await fetch(
    `/_agent-native/actions/content-get-document?id=${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DocumentDetail;
}

async function saveDocument(
  id: string,
  patch: { title?: string; content?: string; isFavorite?: boolean },
): Promise<void> {
  const res = await fetch("/_agent-native/actions/content-update-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function deleteDocument(id: string): Promise<void> {
  // content-delete-document is not in scope for BD3-05; use a placeholder
  // that alerts the user to delete from the Brain agent if needed.
  throw new Error("Delete not yet implemented — use the agent to remove.");
}

// ---------------------------------------------------------------------------
// Editor route
// ---------------------------------------------------------------------------

export default function ContentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  // Track pending content for auto-save
  const pendingContentRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Tiptap editor — plain non-collab (D-03/D-10)
  // ---------------------------------------------------------------------------
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
    ],
    content: "",
    editable: true,
    onUpdate: ({ editor: ed }) => {
      // Capture content change for auto-save on blur
      pendingContentRef.current = ed.getHTML();
      setSaved(false);
    },
  });

  // ---------------------------------------------------------------------------
  // Load document
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchDocument(id)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        editor?.commands.setContent(d.content || "", { emitUpdate: false });
        pendingContentRef.current = null;
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [id, editor]);

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(
    async (opts?: { title?: string; content?: string }) => {
      if (!id || !doc) return;
      setSaving(true);
      try {
        const patch: { title?: string; content?: string } = {};
        const newTitle = opts?.title ?? title;
        const newContent =
          opts?.content ?? pendingContentRef.current ?? editor?.getHTML() ?? "";

        if (newTitle !== doc.title) patch.title = newTitle;
        if (newContent !== doc.content) patch.content = newContent;

        if (Object.keys(patch).length > 0) {
          await saveDocument(id, patch);
          setDoc((prev) =>
            prev
              ? {
                  ...prev,
                  title: patch.title ?? prev.title,
                  content: patch.content ?? prev.content,
                  updatedAt: new Date().toISOString(),
                }
              : prev,
          );
          pendingContentRef.current = null;
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [id, doc, title, editor],
  );

  // Auto-save on editor blur
  const handleEditorBlur = useCallback(() => {
    if (pendingContentRef.current !== null) {
      void handleSave({ content: pendingContentRef.current });
    }
  }, [handleSave]);

  // Auto-save title on blur
  const handleTitleBlur = useCallback(() => {
    void handleSave({ title });
  }, [handleSave, title]);

  // Toggle favorite
  const handleFavorite = async () => {
    if (!id || !doc) return;
    const next = !doc.isFavorite;
    setDoc((prev) => (prev ? { ...prev, isFavorite: next } : prev));
    try {
      await saveDocument(id, { isFavorite: next });
    } catch {
      setDoc((prev) => (prev ? { ...prev, isFavorite: !next } : prev));
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

  if (error && !doc) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-red-600 text-sm">{error}</p>
        <Link to="/content">
          <Button variant="outline" size="sm" className="mt-3 gap-1.5">
            <IconArrowLeft className="size-4" />
            Back to content
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0">
        <Link to="/content">
          <Button variant="ghost" size="sm" className="gap-1 px-2">
            <IconArrowLeft className="size-4" />
          </Button>
        </Link>

        <div className="flex-1" />

        {error && <span className="text-xs text-red-600 mr-2">{error}</span>}

        {saved && <span className="text-xs text-green-600 mr-2">Saved</span>}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleFavorite()}
          className="gap-1.5 px-2"
          title={doc?.isFavorite ? "Unfavorite" : "Favorite"}
        >
          {doc?.isFavorite ? (
            <IconStarFilled className="size-4 text-amber-400" />
          ) : (
            <IconStar className="size-4 text-muted-foreground" />
          )}
        </Button>

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
          ref={titleRef}
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

        {/* Non-collab Tiptap editor (D-03/D-10) */}
        <EditorContent
          editor={editor}
          onBlur={handleEditorBlur}
          className="prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[300px]"
        />
      </div>
    </div>
  );
}
