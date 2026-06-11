/**
 * ImportLeadsDialog — CSV bulk-upload interface for the inbox Leads view.
 *
 * Coach clicks "Import leads", picks a CSV, sees auto-detected column mapping +
 * importable/opted-in/skipped counts + up to 5 sample rows, then confirms to
 * import. The action does all normalisation and dedup server-side.
 *
 * Conventions:
 * - shadcn Dialog/DialogTrigger/DialogContent, Button, Badge
 * - Tabler icons only (no emojis as icons)
 * - No custom dropdown/modal — shadcn Dialog primitive
 * - agentNativePath from @agent-native/core/client for the action endpoint
 */

import { useState, useRef } from "react";
import { IconUpload, IconFileText } from "@tabler/icons-react";
import { toast } from "sonner";
import { agentNativePath } from "@agent-native/core/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types matching the import-leads action response ─────────────────────────

type FieldMapping = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  marketingConsent?: string;
  unsubscribed?: string;
  consentDate?: string;
};

type ImportCounts = {
  importable: number;
  optedIn: number;
  notOptedIn: number;
  skipNoFirstName: number;
  skipNoValidPhone: number;
  skipDuplicateInFile: number;
  skipAlreadyInDb: number;
};

type SampleRow = {
  firstName: string;
  lastName: string | null;
  phoneE164: string;
  email: string | null;
  optIn: boolean;
};

type PreviewPayload = {
  ok: true;
  mapping: FieldMapping;
  rawHeaders: string[];
  counts: ImportCounts;
  sample: SampleRow[];
  committed: number;
  leadsCreated: number;
};

type ErrorPayload = {
  ok: false;
  error: string;
  mapping?: FieldMapping;
  rawHeaders?: string[];
};

type ActionResponse = PreviewPayload | ErrorPayload;

// ─── Props ───────────────────────────────────────────────────────────────────

export type ImportLeadsDialogProps = {
  /** Called after a successful import so the route can revalidate. */
  onImported?: () => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

const MAPPING_FIELDS: (keyof FieldMapping)[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "marketingConsent",
  "unsubscribed",
  "consentDate",
];

function fieldLabel(f: keyof FieldMapping): string {
  switch (f) {
    case "firstName":
      return "First name";
    case "lastName":
      return "Last name";
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "marketingConsent":
      return "Opt-in";
    case "unsubscribed":
      return "Unsubscribed";
    case "consentDate":
      return "Consent date";
  }
}

export function ImportLeadsDialog({ onImported }: ImportLeadsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setErrorMsg(null);
    setCsvText(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    setPreview(null);

    let text: string;
    try {
      text = await file.text();
    } catch {
      setErrorMsg("Could not read the file.");
      setLoading(false);
      return;
    }

    setCsvText(text);

    // POST to the action for a dry-run preview
    try {
      const res = await fetch(agentNativePath("/actions/import-leads"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csvText: text, dryRun: true }),
      });
      const data = (await res.json()) as ActionResponse;

      if (!data.ok) {
        const errData = data as ErrorPayload;
        let msg = errData.error ?? "Unknown error";
        if (errData.rawHeaders && errData.rawHeaders.length > 0) {
          msg += `\nHeaders found: ${errData.rawHeaders.join(", ")}`;
        }
        setErrorMsg(msg);
      } else {
        setPreview(data as PreviewPayload);
      }
    } catch (err: unknown) {
      setErrorMsg(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!csvText || !preview) return;

    setLoading(true);
    try {
      const res = await fetch(agentNativePath("/actions/import-leads"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csvText, dryRun: false }),
      });
      const data = (await res.json()) as ActionResponse;

      if (!data.ok) {
        const errData = data as ErrorPayload;
        toast.error(errData.error ?? "Import failed");
      } else {
        const okData = data as PreviewPayload;
        toast.success(
          `Imported ${okData.committed} lead${okData.committed === 1 ? "" : "s"}`,
        );
        setOpen(false);
        reset();
        onImported?.();
      }
    } catch (err: unknown) {
      toast.error(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const canImport =
    preview !== null && preview.counts.importable > 0 && !loading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <IconUpload size={14} aria-hidden className="mr-1" />
          Import leads
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-w-[560px] p-0 gap-0 flex flex-col"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-4 py-3 border-b border-border/50">
          <DialogTitle className="text-sm font-semibold">
            Import leads from CSV
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Auto-detects column headers, normalises phones to E.164, and skips
            duplicates.
          </p>
        </DialogHeader>

        <div className="px-4 py-4 flex flex-col gap-4">
          {/* File picker */}
          <div>
            <label
              htmlFor="csv-file-input"
              className="block text-[12px] font-medium mb-1.5"
            >
              CSV file
            </label>
            <input
              ref={fileInputRef}
              id="csv-file-input"
              type="file"
              accept=".csv,text/csv"
              disabled={loading}
              onChange={handleFileChange}
              className="block w-full text-[13px] text-foreground
                file:mr-3 file:py-1 file:px-3
                file:rounded file:border file:border-border/60
                file:text-[12px] file:font-medium file:bg-card
                file:text-foreground file:cursor-pointer
                hover:file:bg-accent/40
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Loading indicator */}
          {loading && (
            <div className="text-[12px] text-muted-foreground animate-pulse">
              Analysing CSV…
            </div>
          )}

          {/* Error block */}
          {errorMsg && !loading && (
            <div className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive whitespace-pre-wrap">
              {errorMsg}
            </div>
          )}

          {/* Preview — only shown after a file is chosen and preview succeeds */}
          {preview && !loading && (
            <div className="flex flex-col gap-3">
              {/* Column mapping */}
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  Detected columns
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {MAPPING_FIELDS.map((f) => (
                    <div key={f} className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground w-[90px] shrink-0">
                        {fieldLabel(f)}
                      </span>
                      <span className="text-[11px] font-mono truncate">
                        {preview.mapping[f] ?? (
                          <span className="text-muted-foreground/50">
                            not found
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Counts */}
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  Summary
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {preview.counts.importable} importable
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    {preview.counts.optedIn} opted in
                  </Badge>
                  {preview.counts.skipNoFirstName > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[11px] text-muted-foreground"
                    >
                      {preview.counts.skipNoFirstName} skip — no name
                    </Badge>
                  )}
                  {preview.counts.skipNoValidPhone > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[11px] text-muted-foreground"
                    >
                      {preview.counts.skipNoValidPhone} skip — bad phone
                    </Badge>
                  )}
                  {preview.counts.skipDuplicateInFile > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[11px] text-muted-foreground"
                    >
                      {preview.counts.skipDuplicateInFile} skip — duplicate
                    </Badge>
                  )}
                  {preview.counts.skipAlreadyInDb > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[11px] text-muted-foreground"
                    >
                      {preview.counts.skipAlreadyInDb} skip — already in system
                    </Badge>
                  )}
                </div>
              </div>

              {/* Sample rows */}
              {preview.sample.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Sample rows (first {preview.sample.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {preview.sample.map((row, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[11px] bg-muted/30 rounded px-2 py-1"
                      >
                        <IconFileText
                          size={11}
                          aria-hidden
                          className="text-muted-foreground shrink-0"
                        />
                        <span className="font-medium">
                          {row.firstName} {row.lastName ?? ""}
                        </span>
                        <span className="text-muted-foreground font-mono">
                          {row.phoneE164}
                        </span>
                        {row.email && (
                          <span className="text-muted-foreground truncate">
                            {row.email}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[9px] ml-auto shrink-0 ${row.optIn ? "text-emerald-600" : "text-muted-foreground"}`}
                        >
                          {row.optIn ? "opted in" : "no consent"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.counts.importable === 0 && (
                <div className="text-[12px] text-muted-foreground">
                  No importable rows found after deduplication. Nothing to
                  import.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 px-4 py-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canImport} onClick={handleImport}>
            {loading
              ? "Importing…"
              : `Import ${preview?.counts.importable ?? 0} leads`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
