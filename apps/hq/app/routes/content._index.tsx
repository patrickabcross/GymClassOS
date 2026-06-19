// apps/hq/app/routes/content._index.tsx
//
// HQ Content surface — /content (HQD-04).
//
// Lists all HQ content documents for the operator (super-admin).
// Documents are org-scoped (HQ_ORG_ID) via accessFilter in content-list-documents.
// "New document" CTA creates a blank doc and navigates to the editor.
//
// UI rules:
//   - shadcn/ui primitives (Card, Button, Skeleton)
//   - Tabler icons (@tabler/icons-react) — no emojis as icons
//   - No collab/Yjs/Notion UI — D-03/D-10 non-collab path

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  IconFileText,
  IconPlus,
  IconVideo,
  IconRefresh,
  IconStarFilled,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentMeta {
  id: string;
  parentId: string | null;
  title: string;
  contentPreview: string;
  contentLength: number;
  icon: string | null;
  position: number;
  isFavorite: boolean;
  visibility: string;
  accessRole: string;
  canEdit: boolean;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListDocumentsResult {
  documents: DocumentMeta[];
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.floor(diffMs / (1000 * 3600));
  if (diffH < 1) return "< 1h ago";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ContentIndexPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ListDocumentsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/_agent-native/actions/content-list-documents", {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ListDocumentsResult;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, []);

  const handleNewDocument = async () => {
    setCreating(true);
    try {
      const res = await fetch(
        "/_agent-native/actions/content-create-document",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Untitled" }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = (await res.json()) as { id: string };
      void navigate(`/content/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setCreating(false);
    }
  };

  const rootDocs = (data?.documents ?? []).filter((d) => !d.parentId);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <IconFileText className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Content</h1>
            <p className="text-sm text-muted-foreground">
              Operator marketing content + knowledge base
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Video stub nav */}
          <Link to="/content/video">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <IconVideo className="size-4" />
              Video
            </Button>
          </Link>

          {/* Refresh */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchDocuments()}
            disabled={loading}
            className="gap-1.5"
          >
            <IconRefresh
              className={["size-4", loading ? "animate-spin" : ""].join(" ")}
            />
            Refresh
          </Button>

          {/* New document */}
          <Button
            type="button"
            size="sm"
            onClick={() => void handleNewDocument()}
            disabled={creating}
            className="gap-1.5"
          >
            <IconPlus className="size-4" />
            {creating ? "Creating…" : "New document"}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeletons */}
      {loading && !data && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && data && rootDocs.length === 0 && (
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
              onClick={() => void handleNewDocument()}
              disabled={creating}
              className="gap-1.5"
            >
              <IconPlus className="size-4" />
              {creating ? "Creating…" : "New document"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Document list */}
      {!loading && data && rootDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {rootDocs.length} document{rootDocs.length !== 1 ? "s" : ""}
            </CardTitle>
            <CardDescription className="text-xs">
              Click to open editor. Video generation is deferred (HQD-05).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rootDocs.map((doc) => (
                <li key={doc.id}>
                  <Link
                    to={`/content/${doc.id}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-lg leading-none mt-0.5">
                      {doc.icon ?? (
                        <IconFileText className="size-5 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">
                          {doc.title}
                        </span>
                        {doc.isFavorite && (
                          <IconStarFilled className="size-3 text-amber-400 shrink-0" />
                        )}
                      </div>
                      {doc.contentPreview && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {doc.contentPreview}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                      {relativeTime(doc.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
