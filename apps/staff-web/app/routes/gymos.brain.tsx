// GOB-03: Studio Brain — owner view + edit surface.
//
// Renders under gymos.tsx <Outlet/> and inherits GymosTopNav. Four sections
// with progressive disclosure (shadcn Collapsible):
//   0. Brand & Styling  — URL-extract + 11 token fields + live preview + Save
//   1. Brand Voice      — editable Textarea + Save button
//   2. Studio Ethos     — editable Textarea + Save button
//   3. Class Methods    — read-only class cards (collapsed by default)
//
// Data is fetched client-side via GET /_agent-native/actions/get-brain-docs
// (no SSR loader — Brain content is owner-only, not public). On mount, if
// no class-catalog row exists, brain-init is fired once to seed it.
//
// Live-refresh via useChangeVersions(["action"]) — any write (including by
// the agent) triggers a re-fetch.
//
// Requirements: GOB-01, GOB-02, GOB-03, 260622-jga T3.

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
  IconPalette,
  IconWorld,
} from "@tabler/icons-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type BrandTokens = {
  displayName: string;
  fontFamily: string;
  googleFontsHref: string;
  primary: string;
  primaryText: string;
  secondaryAccent: string;
  ink: string;
  bg: string;
  bgAlt: string;
  radius: number;
  logoUrl: string;
};

const EMPTY_BRAND: BrandTokens = {
  displayName: "",
  fontFamily: "",
  googleFontsHref: "",
  primary: "",
  primaryText: "",
  secondaryAccent: "",
  ink: "",
  bg: "",
  bgAlt: "",
  radius: 8,
  logoUrl: "",
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

  // Brand & Styling state
  const [brandTokens, setBrandTokens] = useState<BrandTokens>(EMPTY_BRAND);
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [savingBrandStyle, setSavingBrandStyle] = useState(false);

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
      // Hydrate brand tokens from stored JSON
      const bs = data.find((d) => d.id === "brand-styling");
      if (bs?.body) {
        try {
          const parsed = JSON.parse(bs.body) as Partial<BrandTokens>;
          setBrandTokens((prev) => ({ ...prev, ...parsed }));
        } catch {
          // leave defaults
        }
      }
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
      // Hydrate brand tokens
      const bs = data.find((d) => d.id === "brand-styling");
      if (bs?.body) {
        try {
          const parsed = JSON.parse(bs.body) as Partial<BrandTokens>;
          setBrandTokens((prev) => ({ ...prev, ...parsed }));
        } catch {
          // leave defaults
        }
      }
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

  // --- Brand extract handler ------------------------------------------------
  const handleExtract = useCallback(async () => {
    if (!extractUrl.trim()) {
      toast.error("Enter a URL to extract from");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/_agent-native/actions/brain-extract-brand", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: extractUrl.trim() }),
      });
      const data = await res.json() as { ok: boolean; tokens?: BrandTokens; error?: string };
      if (!data.ok || !data.tokens) {
        toast.error(
          `Extract failed — ${data.error ?? "unknown error"}`,
        );
        return;
      }
      setBrandTokens(data.tokens);
      toast.success("Brand tokens extracted — review and save");
    } catch {
      toast.error("Network error — extract failed");
    } finally {
      setExtracting(false);
    }
  }, [extractUrl]);

  // --- Save brand styling ---------------------------------------------------
  const handleSaveBrandStyle = useCallback(async () => {
    setSavingBrandStyle(true);
    try {
      const res = await fetch("/_agent-native/actions/update-brain-doc", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "brand-styling",
          body: JSON.stringify(brandTokens),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          `Failed to save — ${(err as { error?: string }).error ?? res.statusText}`,
        );
        return;
      }
      const data = await res.json() as { updated: boolean; reason?: string };
      if (!data.updated) {
        toast.error(`Validation failed — ${data.reason ?? "invalid tokens"}`);
        return;
      }
      toast.success("Brand & Styling saved");
      fetchDocs();
    } catch {
      toast.error("Network error — changes not saved");
    } finally {
      setSavingBrandStyle(false);
    }
  }, [brandTokens, fetchDocs]);

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

      {/* ── Brand & Styling ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <IconPalette className="size-4 text-muted-foreground" />
            Brand & Styling
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Visual identity tokens — colours, fonts, and logo. Used by public
            SSR pages (forms, schedule widget, embeds, videos). Paste your
            website URL and click Fetch &amp; extract to auto-fill.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* URL extractor row */}
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://yourstudio.com"
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              className="text-sm flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={extracting}
              onClick={handleExtract}
            >
              <IconWorld className="size-3.5 mr-1.5" />
              {extracting ? "Fetching…" : "Fetch & extract"}
            </Button>
          </div>

          {/* Token fields — 2-column grid on wider screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                { key: "displayName", label: "Studio name", type: "text" },
                { key: "fontFamily", label: "Font family", type: "text" },
                {
                  key: "googleFontsHref",
                  label: "Google Fonts URL",
                  type: "url",
                },
                { key: "primary", label: "Primary colour", type: "text" },
                {
                  key: "primaryText",
                  label: "Primary text colour",
                  type: "text",
                },
                {
                  key: "secondaryAccent",
                  label: "Secondary accent",
                  type: "text",
                },
                { key: "ink", label: "Body text colour", type: "text" },
                { key: "bg", label: "Background", type: "text" },
                { key: "bgAlt", label: "Alt background", type: "text" },
                { key: "radius", label: "Border radius (px)", type: "number" },
                { key: "logoUrl", label: "Logo URL", type: "url" },
              ] as { key: keyof BrandTokens; label: string; type: string }[]
            ).map(({ key, label, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`bt-${key}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`bt-${key}`}
                  type={type}
                  value={String(brandTokens[key])}
                  onChange={(e) =>
                    setBrandTokens((prev) => ({
                      ...prev,
                      [key]:
                        type === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                    }))
                  }
                  className="text-sm"
                />
              </div>
            ))}
          </div>

          {/* Live preview swatch */}
          <div
            className="rounded-lg p-4 flex items-center gap-3 border"
            style={{ background: brandTokens.bg || "#ffffff" }}
          >
            {brandTokens.logoUrl && (
              <img
                src={brandTokens.logoUrl}
                alt="logo preview"
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div
              className="flex-1 min-w-0 text-sm font-semibold truncate"
              style={{ color: brandTokens.ink || "#111111" }}
            >
              {brandTokens.displayName || "Studio Name"}
            </div>
            <div
              className="text-xs px-3 py-1 font-medium"
              style={{
                background: brandTokens.primary || "#000000",
                color: brandTokens.primaryText || "#ffffff",
                borderRadius: `${brandTokens.radius ?? 8}px`,
              }}
            >
              Book now
            </div>
            <div
              className="text-xs px-3 py-1 font-medium"
              style={{
                background: brandTokens.secondaryAccent || "#555555",
                color: "#ffffff",
                borderRadius: `${brandTokens.radius ?? 8}px`,
              }}
            >
              Learn more
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={savingBrandStyle}
              onClick={handleSaveBrandStyle}
            >
              <IconDeviceFloppy className="size-3.5 mr-1.5" />
              {savingBrandStyle ? "Saving…" : "Save brand tokens"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
