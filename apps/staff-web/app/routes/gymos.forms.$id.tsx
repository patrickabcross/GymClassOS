// GymClassOS Forms Builder — Edit Page (P1c-04).
//
// Forked from templates/forms/app/pages/FormBuilderPage.tsx.
// STRIPPED from upstream:
//   - AgentToggleButton — no agent embedding in the builder for pilot
//   - ShareButton — single-tenant; no per-form sharing needed for pilot
//   - VisibilityBadge — no sharing model in pilot
//   - CloudUpgrade modal — not relevant (Neon is always "cloud")
//   - NotificationsBell — not wired in staff-web
//   - useSendToAgentChat / useAgentPromptRun — no in-builder agent chat
//   - appPath() — staff-web uses paths directly (same origin)
//   - useDbStatus / isLocal check — always cloud (Neon)
//
// KEPT: field add/edit/reorder, settings editor, responses view, publish toggle.
//
// Adaptation:
//   - @agent-native/core/client imports removed
//   - @shared/types replaced with features/forms/types.ts
//   - No ~/ aliases — uses @/ only
//   - RR v7 loader/action, plain-object returns (no json())
//   - useNavigate for back-to-list
//
// STAFF-ONLY — behind the existing staff auth (not in publicPaths).
// guard:allow-unscoped — gym forms are single-tenant.

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  useFetcher,
  redirect,
} from "react-router";
import { nanoid } from "nanoid";
import { eq, count, desc } from "drizzle-orm";
import { format } from "date-fns";
import {
  IconExternalLink,
  IconCheck,
  IconGripVertical,
  IconPlus,
  IconChevronDown,
  IconCopy,
  IconCode,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
  IconSearch,
  IconTrash,
  IconDownload,
  IconRefresh,
  IconLoader2,
  IconChevronLeft,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FieldRenderer } from "@/components/forms/FieldRenderer";
import { FieldPropertiesPanel } from "@/components/forms/FieldPropertiesPanel";
import { getDb, schema } from "../../server/db";
import type {
  FormField,
  FormFieldType,
  FormSettings,
} from "../../features/forms/types";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymClassOS — Form Builder" }];
}

// ─── Field type defaults ──────────────────────────────────────────────────────

const fieldTypeDefaults: Record<FormFieldType, Partial<FormField>> = {
  text: { label: "Text Field", placeholder: "Enter text..." },
  email: { label: "Email", placeholder: "you@example.com" },
  number: { label: "Number", placeholder: "0" },
  textarea: { label: "Long Answer", placeholder: "Type your answer..." },
  select: { label: "Dropdown", options: ["Option 1", "Option 2", "Option 3"] },
  multiselect: {
    label: "Multi-select",
    options: ["Option 1", "Option 2", "Option 3"],
  },
  checkbox: { label: "Checkbox" },
  radio: {
    label: "Multiple Choice",
    options: ["Option 1", "Option 2", "Option 3"],
  },
  date: { label: "Date" },
  rating: { label: "Rating" },
  scale: { label: "Scale", validation: { min: 1, max: 10 } },
};

const fieldTypeLabels: Record<FormFieldType, string> = {
  text: "Short Text",
  email: "Email",
  number: "Number",
  textarea: "Long Text",
  select: "Dropdown",
  multiselect: "Multi-select",
  checkbox: "Checkbox",
  radio: "Multiple Choice",
  date: "Date",
  rating: "Rating",
  scale: "Scale",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeFields(fields: unknown): FormField[] {
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (f): f is FormField =>
      f !== null && typeof f === "object" && typeof f.id === "string",
  );
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params as { id: string };

  // guard:allow-unscoped — gym forms are single-tenant
  const db = getDb();
  const form = await db
    .select()
    .from(schema.forms)
    .where(eq(schema.forms.id, id))
    .then((r) => r[0] ?? null);

  if (!form) {
    throw new Response("Form not found", { status: 404 });
  }

  const responseCount = await db
    .select({ cnt: count(schema.responses.id) })
    .from(schema.responses)
    .where(eq(schema.responses.formId, id))
    .then((r) => Number(r[0]?.cnt ?? 0));

  // Responses for the results tab
  const responseRows = await db
    .select()
    .from(schema.responses)
    .where(eq(schema.responses.formId, id))
    .orderBy(desc(schema.responses.submittedAt));

  return {
    form: {
      ...form,
      fields: JSON.parse(form.fields) as FormField[],
      settings: JSON.parse(form.settings) as FormSettings,
      responseCount,
    },
    responses: responseRows.map((r) => ({
      id: r.id,
      formId: r.formId,
      data: JSON.parse(r.data) as Record<string, unknown>,
      submittedAt: r.submittedAt,
      submitterEmail: r.submitterEmail,
    })),
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const { id } = params as { id: string };
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "update");
  const db = getDb();

  if (intent === "update") {
    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    const titleVal = formData.get("title");
    const descVal = formData.get("description");
    const fieldsVal = formData.get("fields");
    const settingsVal = formData.get("settings");
    const statusVal = formData.get("status");

    if (typeof titleVal === "string") updates.title = titleVal.trim();
    if (typeof descVal === "string") updates.description = descVal;
    if (typeof fieldsVal === "string") {
      try {
        JSON.parse(fieldsVal);
        updates.fields = fieldsVal;
      } catch {}
    }
    if (typeof settingsVal === "string") {
      try {
        JSON.parse(settingsVal);
        updates.settings = settingsVal;
      } catch {}
    }
    if (
      typeof statusVal === "string" &&
      ["draft", "published", "closed"].includes(statusVal)
    ) {
      updates.status = statusVal;
    }

    await db.update(schema.forms).set(updates).where(eq(schema.forms.id, id));
    return { updated: true };
  }

  return { error: "Unknown intent" };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosFormBuilder() {
  const { form: initialForm, responses } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "edit";
  const [activeTab, setActiveTab] = useState(initialTab);
  const fetcher = useFetcher();

  // Local form state — prevents fetcher-driven refetches from resetting inputs
  const [localTitle, setLocalTitle] = useState(initialForm.title);
  const [localDescription, setLocalDescription] = useState(
    initialForm.description ?? "",
  );
  const [localFields, setLocalFields] = useState<FormField[]>(
    normalizeFields(initialForm.fields),
  );
  const [localSettings, setLocalSettings] = useState<FormSettings>(
    initialForm.settings,
  );
  const [currentStatus, setCurrentStatus] = useState(initialForm.status);
  const [pendingStatus, setPendingStatus] = useState<
    "published" | "draft" | null
  >(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  // Origin is only known client-side (builder is a logged-in CSR page). Default
  // to the prod origin so the snippet is still correct if read before hydration.
  const [origin, setOrigin] = useState("https://gym-class-os.vercel.app");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const titleFocused = useRef(false);
  const descriptionFocused = useRef(false);
  const fieldsDirty = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedFieldId) setSelectedFieldId(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFieldId]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(saveTimeout.current);
      clearTimeout(savedTimeout.current);
    },
    [],
  );

  // Clear pending publish state once current status reflects it
  useEffect(() => {
    if (pendingStatus && currentStatus === pendingStatus) {
      setPendingStatus(null);
    }
  }, [currentStatus, pendingStatus]);

  // Debounced save
  const save = useCallback(
    (data: {
      title?: string;
      description?: string;
      fields?: FormField[];
      settings?: FormSettings;
      status?: string;
    }) => {
      clearTimeout(saveTimeout.current);
      clearTimeout(savedTimeout.current);
      setSaveState("saving");
      saveTimeout.current = setTimeout(() => {
        const fd = new FormData();
        fd.set("_intent", "update");
        if (data.title !== undefined) fd.set("title", data.title);
        if (data.description !== undefined)
          fd.set("description", data.description);
        if (data.fields !== undefined)
          fd.set("fields", JSON.stringify(data.fields));
        if (data.settings !== undefined)
          fd.set("settings", JSON.stringify(data.settings));
        if (data.status !== undefined) {
          fd.set("status", data.status);
          setCurrentStatus(data.status as any);
        }
        fetcher.submit(fd, { method: "post" });
        setSaveState("saved");
        savedTimeout.current = setTimeout(() => setSaveState("idle"), 2000);
        if (data.fields !== undefined) fieldsDirty.current = false;
      }, 500);
    },
    [fetcher],
  );

  function addField(type: FormFieldType) {
    const defaults = fieldTypeDefaults[type] || {};
    const newField: FormField = {
      id: nanoid(8),
      type,
      label: defaults.label || "New Field",
      placeholder: defaults.placeholder,
      required: false,
      options: defaults.options,
      validation: defaults.validation,
      width: "full",
    };
    const newFields = [...localFields, newField];
    setLocalFields(newFields);
    fieldsDirty.current = true;
    setSelectedFieldId(newField.id);
    save({ fields: newFields });
  }

  function updateField(updated: FormField) {
    const newFields = localFields.map((f) =>
      f.id === updated.id ? updated : f,
    );
    setLocalFields(newFields);
    fieldsDirty.current = true;
    save({ fields: newFields });
  }

  function deleteField(fieldId: string) {
    const newFields = localFields.filter((f) => f.id !== fieldId);
    setLocalFields(newFields);
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
    fieldsDirty.current = true;
    save({ fields: newFields });
  }

  function moveField(from: number, to: number) {
    const newFields = [...localFields];
    const [moved] = newFields.splice(from, 1);
    newFields.splice(to, 0, moved);
    setLocalFields(newFields);
    fieldsDirty.current = true;
    save({ fields: newFields });
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveField(dragIdx, idx);
      setDragIdx(idx);
    }
  }
  function handleDragEnd() {
    setDragIdx(null);
  }

  function handleTogglePublish() {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    setPendingStatus(newStatus);
    save({ status: newStatus });
    toast.success(
      newStatus === "published" ? "Form published!" : "Form unpublished",
    );
  }

  function copyShareLink() {
    if (currentStatus !== "published") {
      toast.info("Publish this form before copying its public link");
      return;
    }
    const url = `${window.location.origin}/f/${initialForm.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied to clipboard");
  }

  const publicUrl = `${origin}/f/${initialForm.slug}`;
  // Paste this on the studio's marketing site. embed.js injects an
  // auto-resizing iframe for [data-gymos-form="<slug>"] (see
  // features/forms/lib/embed-snippet.ts).
  const embedSnippet = `<div data-gymos-form="${initialForm.slug}"></div>\n<script src="${origin}/embed.js" async></script>`;

  function copyEmbed() {
    navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
    toast.success("Embed code copied");
  }

  const selectedField = localFields.find((f) => f.id === selectedFieldId);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-3 sm:px-4 h-12 shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 gap-1 text-xs text-muted-foreground shrink-0"
            onClick={() => navigate("/gymos/forms")}
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Forms
          </Button>
          <span className="text-muted-foreground/40 text-xs">/</span>
          <Input
            value={localTitle}
            onChange={(e) => {
              setLocalTitle(e.target.value);
              save({ title: e.target.value });
            }}
            onFocus={() => (titleFocused.current = true)}
            onBlur={() => (titleFocused.current = false)}
            className="h-7 text-sm font-medium border-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 max-w-[40vw] sm:max-w-72"
          />
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] shrink-0 hidden sm:inline-flex",
              currentStatus === "published"
                ? "bg-emerald-600/10 text-emerald-600 border-emerald-600/20"
                : "bg-amber-600/10 text-amber-600 border-amber-600/20",
            )}
          >
            {currentStatus}
          </Badge>
          {saveState !== "idle" && (
            <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
              {saveState === "saving" ? "Saving..." : "Saved"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {currentStatus === "published" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a
                    href={`/f/${initialForm.slug}`}
                    target="_blank"
                    rel="noopener"
                  >
                    <IconExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preview published form</TooltipContent>
            </Tooltip>
          )}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentStatus !== "published"}
                    aria-label="Share or embed form"
                  >
                    <IconCode className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {currentStatus === "published"
                  ? "Share or embed this form"
                  : "Publish before sharing or embedding"}
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-96 space-y-4">
              {/* Public link */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Public link</p>
                <div className="flex gap-1.5">
                  <Input
                    readOnly
                    value={publicUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={copyShareLink}
                    aria-label="Copy public link"
                  >
                    {copied ? (
                      <IconCheck className="h-4 w-4" />
                    ) : (
                      <IconCopy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Embed snippet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Embed on your website</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[11px]"
                    onClick={copyEmbed}
                  >
                    {embedCopied ? (
                      <IconCheck className="h-3.5 w-3.5" />
                    ) : (
                      <IconCopy className="h-3.5 w-3.5" />
                    )}
                    {embedCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="rounded-md bg-muted p-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all">
                  {embedSnippet}
                </pre>
                <p className="text-[11px] text-muted-foreground">
                  Paste this just before{" "}
                  <code className="font-mono">&lt;/body&gt;</code> on your site.
                  The form auto-resizes to fit. Lock it to your domain under{" "}
                  <strong>Settings → Allowed origins</strong>.
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            className="text-xs"
            onClick={handleTogglePublish}
            disabled={pendingStatus !== null}
          >
            {pendingStatus !== null && (
              <IconLoader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            {pendingStatus === "published"
              ? "Publishing..."
              : pendingStatus === "draft"
                ? "Unpublishing..."
                : currentStatus === "published"
                  ? "Unpublish"
                  : "Publish"}
          </Button>
        </div>
      </div>

      {/* Tab row */}
      <div className="border-b border-border px-2 sm:px-4 py-2 shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="edit" className="text-xs">
              Edit
            </TabsTrigger>
            <TabsTrigger value="results" className="text-xs">
              Results
              {initialForm.responseCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 text-[9px] px-1 py-0 h-4 min-w-4"
                >
                  {initialForm.responseCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">
              Settings
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab content */}
      {activeTab === "edit" && (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Live preview / builder */}
          <div className="flex-1 overflow-auto bg-muted/30">
            <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
              {/* Form header inputs */}
              <div className="mb-6">
                <Input
                  value={localTitle}
                  onChange={(e) => {
                    setLocalTitle(e.target.value);
                    save({ title: e.target.value });
                  }}
                  onFocus={() => (titleFocused.current = true)}
                  onBlur={() => (titleFocused.current = false)}
                  className="text-2xl font-semibold border-none bg-transparent px-0 focus-visible:ring-0 h-auto"
                  placeholder="Form Title"
                />
                <textarea
                  value={localDescription}
                  onChange={(e) => {
                    setLocalDescription(e.target.value);
                    save({ description: e.target.value });
                  }}
                  onFocus={() => (descriptionFocused.current = true)}
                  onBlur={() => (descriptionFocused.current = false)}
                  className="mt-1 w-full text-sm text-muted-foreground bg-transparent px-0 focus-visible:outline-none resize-none overflow-hidden"
                  placeholder="Add a description..."
                  rows={1}
                  style={{ minHeight: "24px", maxHeight: "120px" }}
                />
              </div>

              {/* Fields */}
              <div className="space-y-3">
                {localFields.map((field, idx) => (
                  <Popover
                    key={field.id}
                    open={selectedFieldId === field.id}
                    onOpenChange={(open) => {
                      if (!open) setSelectedFieldId(null);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <div
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        onClick={() =>
                          setSelectedFieldId(
                            selectedFieldId === field.id ? null : field.id,
                          )
                        }
                        className={cn(
                          "group relative rounded-lg border p-4 cursor-pointer",
                          selectedFieldId === field.id
                            ? "border-primary ring-1 ring-primary/20 bg-card"
                            : "border-border bg-card hover:border-primary/30",
                          dragIdx === idx && "opacity-50",
                        )}
                      >
                        <div
                          className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab hidden sm:block"
                          aria-label="Drag to reorder"
                        >
                          <IconGripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <FieldRenderer field={field} preview />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent
                      side="right"
                      align="start"
                      sideOffset={12}
                      className="w-[calc(100vw-2rem)] sm:w-72 max-h-[70vh] sm:max-h-[520px] overflow-auto p-0"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                      onInteractOutside={(e) => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest(
                            "[data-radix-popper-content-wrapper]",
                          ) ||
                          target.closest("[role='listbox']") ||
                          target.closest("[role='option']")
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <FieldPropertiesPanel
                        field={field}
                        onChange={updateField}
                        onDelete={() => deleteField(field.id)}
                      />
                    </PopoverContent>
                  </Popover>
                ))}
              </div>

              {/* Add field button */}
              <div className="mt-4 flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <IconPlus className="h-4 w-4" />
                      Add Field
                      <IconChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {Object.entries(fieldTypeLabels).map(([type, label]) => (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => addField(type as FormFieldType)}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "results" && (
        <ResultsContent
          responses={responses}
          fields={localFields}
          formTitle={localTitle}
        />
      )}

      {activeTab === "settings" && (
        <div className="flex-1 overflow-auto">
          <div className="max-w-lg mx-auto py-4 sm:py-8 px-3 sm:px-4">
            <SettingsEditor
              key={JSON.stringify(localSettings)}
              settings={localSettings}
              onSave={(settings) => {
                setLocalSettings(settings);
                save({ settings });
                toast.success("Settings saved");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Results content ──────────────────────────────────────────────────────────

type ResponseRow = {
  id: string;
  formId: string;
  data: Record<string, unknown>;
  submittedAt: string;
  submitterEmail?: string | null;
};

function ResultsContent({
  responses: allResponses,
  fields,
  formTitle,
}: {
  responses: ResponseRow[];
  fields: FormField[];
  formTitle: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("_submitted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = search.trim()
    ? allResponses.filter((r) => {
        const needle = search.toLowerCase();
        return fields.some((f) => {
          const val = r.data[f.id];
          if (val == null) return false;
          const str = Array.isArray(val) ? val.join(" ") : String(val);
          return str.toLowerCase().includes(needle);
        });
      })
    : allResponses;

  const responses = [...filtered].sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    if (sortKey === "_submitted") {
      av = new Date(a.submittedAt).getTime();
      bv = new Date(b.submittedAt).getTime();
    } else {
      const aVal = a.data[sortKey];
      const bVal = b.data[sortKey];
      av =
        aVal == null
          ? ""
          : Array.isArray(aVal)
            ? aVal.join(", ")
            : String(aVal);
      bv =
        bVal == null
          ? ""
          : Array.isArray(bVal)
            ? bVal.join(", ")
            : String(bVal);
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function exportCsv() {
    if (!fields.length || !responses.length) return;
    const headers = ["Submitted At", ...fields.map((f) => f.label)];
    const rows = responses.map((r) => [
      r.submittedAt,
      ...fields.map((f) => {
        const val = r.data[f.id];
        if (Array.isArray(val)) return val.join(", ");
        return String(val ?? "");
      }),
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formTitle || "responses"}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (responses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20">
        <h3 className="font-medium mb-1">No responses yet</h3>
        <p className="text-sm text-muted-foreground">
          Publish and share your form to start collecting responses.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {responses.length} response{responses.length !== 1 ? "s" : ""}
          </Badge>
          {search.trim() && filtered.length !== allResponses.length && (
            <span className="text-xs text-muted-foreground">
              {filtered.length} match{filtered.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search responses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs w-44 sm:w-56"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={exportCsv}
          >
            <IconDownload className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-auto">
        <div className="w-max min-w-full">
          <table className="min-w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th
                  scope="col"
                  className="min-w-10 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
                >
                  #
                </th>
                <th
                  scope="col"
                  className="min-w-36 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
                >
                  <SortableHeader
                    label="Submitted"
                    active={sortKey === "_submitted"}
                    dir={sortDir}
                    onClick={() => toggleSort("_submitted")}
                  />
                </th>
                {fields.map((f) => (
                  <th
                    key={f.id}
                    scope="col"
                    className="min-w-40 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
                  >
                    <SortableHeader
                      label={f.label}
                      active={sortKey === f.id}
                      dir={sortDir}
                      onClick={() => toggleSort(f.id)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {responses.map((response, idx) => (
                <tr
                  key={response.id}
                  className="border-b border-border hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {responses.length - idx}
                  </td>
                  <td className="min-w-36 px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(response.submittedAt), "MMM d, h:mm a")}
                  </td>
                  {fields.map((f) => {
                    const val = response.data[f.id];
                    const display =
                      val === undefined || val === null
                        ? "-"
                        : Array.isArray(val)
                          ? val.join(", ")
                          : String(val);
                    return (
                      <td
                        key={f.id}
                        className="min-w-40 max-w-[220px] truncate px-4 py-2.5 text-xs"
                        title={display}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? (
          <IconArrowUp className="h-3 w-3" />
        ) : (
          <IconArrowDown className="h-3 w-3" />
        )
      ) : (
        <IconArrowsSort className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

// ─── Settings editor ──────────────────────────────────────────────────────────

function SettingsEditor({
  settings: initialSettings,
  onSave,
}: {
  settings: FormSettings;
  onSave: (settings: FormSettings) => void;
}) {
  const [settings, setSettings] = useState<FormSettings>({
    ...initialSettings,
  });

  function update(partial: Partial<FormSettings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Form Settings</h2>

      <div className="space-y-2">
        <Label className="text-xs">Submit button text</Label>
        <Input
          value={settings.submitText || "Submit"}
          onChange={(e) => update({ submitText: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Success message</Label>
        <Textarea
          value={
            settings.successMessage ||
            "Thank you! Your response has been recorded."
          }
          onChange={(e) => update({ successMessage: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Redirect URL (optional)</Label>
        <Input
          value={settings.redirectUrl || ""}
          onChange={(e) => update({ redirectUrl: e.target.value })}
          placeholder="https://..."
          className="h-8 text-sm"
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">
          Allowed origins (one per line, empty = any)
        </Label>
        <Textarea
          value={(settings.allowedOrigins ?? []).join("\n")}
          onChange={(e) =>
            update({
              allowedOrigins: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="https://doyouhustle.co.uk"
          rows={3}
          className="text-sm font-mono"
        />
      </div>

      <Button onClick={() => onSave(settings)} className="w-full" size="sm">
        Save Settings
      </Button>
    </div>
  );
}
