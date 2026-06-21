// GOB-03: Studio Brain — owner view + edit surface.
//
// Renders under gymos.tsx <Outlet/> and inherits GymosTopNav. Three sections
// with progressive disclosure (shadcn Collapsible):
//   1. Brand Voice — editable Textarea + Save button
//   2. Studio Ethos — editable Textarea + Save button
//   3. Class Methods — read-only class cards (collapsed by default)
//
// Data is fetched client-side via GET /_agent-native/actions/get-brain-docs
// (no SSR loader — Brain content is owner-only, not public). On mount, if
// no class-catalog row exists, brain-init is fired once to seed it.
//
// Live-refresh via useChangeVersions(["action"]) — any write (including by
// the agent) triggers a re-fetch.
//
// Requirements: GOB-01, GOB-02, GOB-03.

import { useState, useEffect, useCallback } from "react";
import { useChangeVersions } from "@agent-native/core/client";
import { toast } from "sonner";
import {
  IconBook2,
  IconDeviceFloppy,
  IconAward,
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
} from "@tabler/icons-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type BrainDoc = {
  id: string;
  docType: string;
  title: string;
  body: string;
  seededAt: string | null;
  updatedAt: string;
};

type ClassEntry = {
  name: string;
  description: string | null;
  durationMin: number;
  category: string | null;
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "RunStudio — Studio Brain" }];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GymosBrain() {
  const actionVersion = useChangeVersions(["action"]);

  // --- State -----------------------------------------------------------------
  const [docs, setDocs] = useState<BrainDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Editable doc bodies (optimistic)
  const [brandVoice, setBrandVoice] = useState("");
  const [ethos, setEthos] = useState("");

  // Save-in-progress flags
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingEthos, setSavingEthos] = useState(false);

  // Class Methods section collapsed by default (progressive disclosure)
  const [methodsOpen, setMethodsOpen] = useState(false);

  // --- Fetch brain docs from get-brain-docs GET action ----------------------
  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/_agent-native/actions/get-brain-docs", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data: BrainDoc[] = await res.json();
      setDocs(data);
      // Update text areas with authoritative server values (non-optimistic reset)
      const bv = data.find((d) => d.id === "brand-voice");
      const eth = data.find((d) => d.id === "ethos");
      if (bv) setBrandVoice(bv.body);
      if (eth) setEthos(eth.body);
    } catch {
      // silent — user sees stale state; toast on explicit save
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Seed class catalog on first load if absent ---------------------------
  const seedIfNeeded = useCallback(
    async (docsSnapshot: BrainDoc[]) => {
      const catalog = docsSnapshot.find((d) => d.id === "class-catalog");
      if (catalog && catalog.body && catalog.body !== "[]") return; // already seeded
      try {
        setSeeding(true);
        const res = await fetch("/_agent-native/actions/brain-init", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          // Re-fetch to pick up seeded rows
          await fetchDocs();
        }
      } catch {
        // silent; catalog will show empty
      } finally {
        setSeeding(false);
      }
    },
    [fetchDocs],
  );

  // --- Initial load ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/_agent-native/actions/get-brain-docs", {
        credentials: "include",
      });
      if (cancelled) return;
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data: BrainDoc[] = await res.json();
      if (cancelled) return;
      setDocs(data);
      const bv = data.find((d) => d.id === "brand-voice");
      const eth = data.find((d) => d.id === "ethos");
      if (bv) setBrandVoice(bv.body);
      if (eth) setEthos(eth.body);
      setLoading(false);
      // Seed class catalog if needed
      await seedIfNeeded(data);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Live-refresh on any action write (agent edits etc.) ------------------
  useEffect(() => {
    if (actionVersion > 0) {
      fetchDocs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionVersion]);

  // --- Save handler ---------------------------------------------------------
  const handleSave = useCallback(
    async (id: "brand-voice" | "ethos", body: string) => {
      const setter = id === "brand-voice" ? setSavingBrand : setSavingEthos;
      setter(true);
      try {
        const res = await fetch("/_agent-native/actions/update-brain-doc", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, body }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(
            `Failed to save — ${(err as { error?: string }).error ?? res.statusText}`,
          );
          // Rollback optimistic body to last server value
          fetchDocs();
          return;
        }
        toast.success(
          id === "brand-voice"
            ? "Brand Voice saved"
            : "Studio Ethos saved",
        );
        // Refresh to ensure we have authoritative value
        fetchDocs();
      } catch {
        toast.error("Network error — changes not saved");
        fetchDocs();
      } finally {
        setter(false);
      }
    },
    [fetchDocs],
  );

  // --- Derived data ---------------------------------------------------------
  const catalogDoc = docs.find((d) => d.id === "class-catalog");
  let classes: ClassEntry[] = [];
  if (catalogDoc?.body) {
    try {
      classes = JSON.parse(catalogDoc.body) as ClassEntry[];
    } catch {
      classes = [];
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <IconBook2 className="size-5 text-muted-foreground" />
        <h1 className="text-base font-semibold">Studio Brain</h1>
        <span className="text-xs text-muted-foreground ml-1">
          Your studio's brand knowledge, editable here
        </span>
      </div>

      {/* ── Brand Voice ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <IconAward className="size-4 text-muted-foreground" />
            Brand Voice
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            How your studio speaks — tone, values, and personality. Used to
            personalise outbound messages to members.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            placeholder="e.g. Energetic and welcoming. We celebrate every step forward, however small. Our coaches are coaches, not instructors — they meet every member where they are."
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            rows={6}
            className="resize-none text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={savingBrand}
              onClick={() => handleSave("brand-voice", brandVoice)}
            >
              <IconDeviceFloppy className="size-3.5 mr-1.5" />
              {savingBrand ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Studio Ethos ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <IconBook2 className="size-4 text-muted-foreground" />
            Studio Ethos
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Your studio's mission, values, and what makes it unique. Helps
            the Brain tailor the daily owner digest and member outreach.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            placeholder="e.g. We believe fitness should be accessible to everyone. Our classes are sized to 12 so every member gets real coaching attention. We run on community, not ego."
            value={ethos}
            onChange={(e) => setEthos(e.target.value)}
            rows={6}
            className="resize-none text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={savingEthos}
              onClick={() => handleSave("ethos", ethos)}
            >
              <IconDeviceFloppy className="size-3.5 mr-1.5" />
              {savingEthos ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Class Methods (read-only, collapsed by default) ──────────────── */}
      <Collapsible open={methodsOpen} onOpenChange={setMethodsOpen}>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle className="text-sm flex items-center gap-2">
                  {methodsOpen ? (
                    <IconChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <IconChevronDown className="size-4 text-muted-foreground" />
                  )}
                  Class Methods
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {seeding ? "syncing…" : `${classes.length} classes`}
                  </Badge>
                </CardTitle>
                <span className="text-xs text-muted-foreground font-normal">
                  Auto-seeded from class catalog
                </span>
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {seeding ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <IconRefresh className="size-3.5 animate-spin" />
                  Syncing class catalog…
                </div>
              ) : classes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No classes in catalog yet. Add classes via the Schedule tab.
                </p>
              ) : (
                <div className="grid gap-2">
                  {classes.map((cls) => (
                    <div
                      key={cls.name}
                      className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{cls.name}</span>
                          {cls.category && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0"
                            >
                              {cls.category}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {cls.durationMin} min
                          </span>
                        </div>
                        {cls.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {cls.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
