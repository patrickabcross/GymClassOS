// RunStudio Catalog — pass types management surface.
//
// C47: staff-facing Passes & Classes catalog. Studio owner defines pass
// products (name, price, credits, validity, category compatibility) here,
// replacing the blocked bSport CSV dependency. No HUSTLE hardcoding —
// everything is data-driven from the pass_types table.
//
// Rendering: SSR loader (consistent with other /gymos/* pages) + optimistic
// client state. Mutations call create-pass-type / update-pass-type actions
// over HTTP using agentNativePath (ImportLeadsDialog pattern).

import { useLoaderData, useRevalidator } from "react-router";
import { useState } from "react";
import { agentNativePath } from "@agent-native/core/client";
import { asc } from "drizzle-orm";
import { isNotNull } from "drizzle-orm";
import { toast } from "sonner";
import {
  IconPlus,
  IconTag,
  IconTicket,
  IconPencil,
  IconBan,
  IconCircleCheck,
  IconCategory,
} from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "RunStudio — Catalog" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader(_: LoaderFunctionArgs) {
  const db = getDb();

  // guard:allow-unscoped — single-tenant gym tables
  const rawPassTypes = await db
    .select({
      id: schema.passTypes.id,
      name: schema.passTypes.name,
      credits: schema.passTypes.credits,
      pricePennies: schema.passTypes.pricePennies,
      validityDays: schema.passTypes.validityDays,
      allCategories: schema.passTypes.allCategories,
      allowedCategories: schema.passTypes.allowedCategories,
      active: schema.passTypes.active,
      createdAt: schema.passTypes.createdAt,
    })
    .from(schema.passTypes)
    .orderBy(asc(schema.passTypes.name));

  const passTypes = rawPassTypes.map((r) => ({
    id: r.id,
    name: r.name,
    credits: r.credits !== null ? Number(r.credits) : null,
    pricePennies: r.pricePennies !== null ? Number(r.pricePennies) : null,
    validityDays: r.validityDays !== null ? Number(r.validityDays) : null,
    allCategories: Boolean(r.allCategories),
    allowedCategories: (() => {
      try {
        const parsed = JSON.parse(r.allowedCategories ?? "[]");
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [] as string[];
      }
    })(),
    active: Boolean(r.active),
    createdAt: r.createdAt,
  }));

  // Derive the category pick-list from existing class definitions.
  // guard:allow-unscoped — single-tenant gym tables
  const categoryRows = await db
    .selectDistinct({ category: schema.classDefinitions.category })
    .from(schema.classDefinitions)
    .where(isNotNull(schema.classDefinitions.category))
    .orderBy(asc(schema.classDefinitions.category));

  const categories = categoryRows
    .map((r) => r.category as string)
    .filter(Boolean)
    .sort();

  return { passTypes, categories };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type PassType = {
  id: string;
  name: string;
  credits: number | null;
  pricePennies: number | null;
  validityDays: number | null;
  allCategories: boolean;
  allowedCategories: string[];
  active: boolean;
  createdAt: string;
};

// Blank form state
function blankForm() {
  return {
    name: "",
    credits: "",
    pricePennies: "",
    validityDays: "",
    allCategories: false,
    allowedCategories: [] as string[],
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const loaderData = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  // Optimistic local state — mirrors loader data, updated on mutation success.
  const [passTypes, setPassTypes] = useState<PassType[]>(loaderData.passTypes);
  const [categories, setCategories] = useState<string[]>(loaderData.categories);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PassType | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state (shared between create + edit)
  const [form, setForm] = useState(blankForm());

  // Category multiselect popover
  const [categoryPopOpen, setCategoryPopOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");

  // ── Open create dialog
  function openCreate() {
    setForm(blankForm());
    setNewCatInput("");
    setCreateOpen(true);
  }

  // ── Open edit dialog
  function openEdit(pt: PassType) {
    setForm({
      name: pt.name,
      credits: pt.credits !== null ? String(pt.credits) : "",
      pricePennies:
        pt.pricePennies !== null
          ? String((pt.pricePennies / 100).toFixed(2))
          : "",
      validityDays: pt.validityDays !== null ? String(pt.validityDays) : "",
      allCategories: pt.allCategories,
      allowedCategories: [...pt.allowedCategories],
    });
    setNewCatInput("");
    setEditTarget(pt);
  }

  // ── Toggle a category in the multiselect
  function toggleCategory(cat: string) {
    setForm((f) => ({
      ...f,
      allowedCategories: f.allowedCategories.includes(cat)
        ? f.allowedCategories.filter((c) => c !== cat)
        : [...f.allowedCategories, cat],
    }));
  }

  // ── Add a new typed category
  function addNewCategory() {
    const cat = newCatInput.trim();
    if (!cat) return;
    if (!categories.includes(cat)) setCategories((cs) => [...cs, cat].sort());
    if (!form.allowedCategories.includes(cat))
      setForm((f) => ({
        ...f,
        allowedCategories: [...f.allowedCategories, cat],
      }));
    setNewCatInput("");
  }

  // ── Build the payload from form state
  function buildPayload() {
    return {
      name: form.name.trim(),
      credits: form.credits ? parseInt(form.credits, 10) : undefined,
      pricePennies: form.pricePennies
        ? Math.round(parseFloat(form.pricePennies) * 100)
        : undefined,
      validityDays: form.validityDays
        ? parseInt(form.validityDays, 10)
        : undefined,
      allCategories: form.allCategories,
      allowedCategories: form.allCategories ? [] : form.allowedCategories,
    };
  }

  // ── Create pass type
  async function handleCreate() {
    const payload = buildPayload();
    if (!payload.name) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    // Optimistic: add a placeholder row immediately.
    const tempId = `temp_${Date.now()}`;
    const optimisticRow: PassType = {
      id: tempId,
      name: payload.name,
      credits: payload.credits ?? null,
      pricePennies: payload.pricePennies ?? null,
      validityDays: payload.validityDays ?? null,
      allCategories: payload.allCategories,
      allowedCategories: payload.allowedCategories,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setPassTypes((pts) => [...pts, optimisticRow].sort((a, b) => a.name.localeCompare(b.name)));
    setCreateOpen(false);

    try {
      const res = await fetch(agentNativePath("/actions/create-pass-type"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { id: string; name: string };
      // Replace optimistic row with real id.
      setPassTypes((pts) =>
        pts.map((pt) => (pt.id === tempId ? { ...pt, id: data.id } : pt)),
      );
      // Refresh categories in background.
      revalidator.revalidate();
    } catch (err) {
      // Roll back optimistic row on error.
      setPassTypes((pts) => pts.filter((pt) => pt.id !== tempId));
      toast.error("Could not create pass type. Please try again.");
      console.error("[catalog] create-pass-type error:", err);
    } finally {
      setSaving(false);
    }
  }

  // ── Update pass type
  async function handleEdit() {
    if (!editTarget) return;
    const payload = buildPayload();
    if (!payload.name) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    // Optimistic update.
    const prev = passTypes.find((pt) => pt.id === editTarget.id)!;
    const updated: PassType = {
      ...prev,
      name: payload.name,
      credits: payload.credits ?? null,
      pricePennies: payload.pricePennies ?? null,
      validityDays: payload.validityDays ?? null,
      allCategories: payload.allCategories,
      allowedCategories: payload.allowedCategories,
    };
    setPassTypes((pts) =>
      pts.map((pt) => (pt.id === editTarget.id ? updated : pt)),
    );
    setEditTarget(null);

    try {
      const res = await fetch(agentNativePath("/actions/update-pass-type"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passTypeId: editTarget.id, ...payload }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      // Roll back.
      setPassTypes((pts) =>
        pts.map((pt) => (pt.id === editTarget.id ? prev : pt)),
      );
      toast.error("Could not update pass type. Please try again.");
      console.error("[catalog] update-pass-type error:", err);
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle active / inactive
  async function handleToggleActive(pt: PassType) {
    const newActive = !pt.active;
    // Optimistic update.
    setPassTypes((pts) =>
      pts.map((p) => (p.id === pt.id ? { ...p, active: newActive } : p)),
    );
    try {
      const res = await fetch(agentNativePath("/actions/update-pass-type"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passTypeId: pt.id, active: newActive }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      // Roll back.
      setPassTypes((pts) =>
        pts.map((p) => (p.id === pt.id ? { ...p, active: pt.active } : p)),
      );
      toast.error("Could not update pass type. Please try again.");
      console.error("[catalog] toggle-active error:", err);
    }
  }

  // ── Format helpers
  function fmtPrice(pence: number | null) {
    if (pence === null) return null;
    return `£${(pence / 100).toFixed(2)}`;
  }
  function fmtCredits(credits: number | null) {
    return credits === null ? "Unlimited" : String(credits);
  }
  function fmtValidity(days: number | null) {
    return days === null ? "Never expires" : `${days} days`;
  }

  // ── PassTypeForm (shared for create + edit)
  function PassTypeForm() {
    const allCats = form.allCategories;
    return (
      <div className="grid gap-4 py-2">
        {/* Name */}
        <div className="grid gap-1.5">
          <Label htmlFor="pt-name">Name</Label>
          <Input
            id="pt-name"
            placeholder="e.g. Yoga 10-Pack"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={120}
          />
        </div>

        {/* Credits + Price row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pt-credits">Credits (blank = unlimited)</Label>
            <Input
              id="pt-credits"
              type="number"
              min={1}
              placeholder="e.g. 10"
              value={form.credits}
              onChange={(e) =>
                setForm((f) => ({ ...f, credits: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pt-price">Price (£, blank = not for sale)</Label>
            <Input
              id="pt-price"
              type="number"
              min={0}
              step={0.01}
              placeholder="e.g. 85.00"
              value={form.pricePennies}
              onChange={(e) =>
                setForm((f) => ({ ...f, pricePennies: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Validity */}
        <div className="grid gap-1.5">
          <Label htmlFor="pt-validity">
            Validity (days, blank = never expires)
          </Label>
          <Input
            id="pt-validity"
            type="number"
            min={1}
            placeholder="e.g. 90"
            value={form.validityDays}
            onChange={(e) =>
              setForm((f) => ({ ...f, validityDays: e.target.value }))
            }
          />
        </div>

        {/* All classes toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="pt-all-cats"
            checked={form.allCategories}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, allCategories: v }))
            }
          />
          <Label htmlFor="pt-all-cats">Books any class category</Label>
        </div>

        {/* Category multiselect — hidden when All classes is on */}
        {!allCats && (
          <div className="grid gap-1.5">
            <Label>Allowed class categories</Label>
            <Popover open={categoryPopOpen} onOpenChange={setCategoryPopOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start text-left font-normal h-auto min-h-9 flex-wrap gap-1"
                >
                  {form.allowedCategories.length === 0 ? (
                    <span className="text-muted-foreground">
                      Pick categories...
                    </span>
                  ) : (
                    form.allowedCategories.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[11px]">
                        {c}
                      </Badge>
                    ))
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="flex flex-col gap-2">
                  {/* Existing categories from class_definitions */}
                  {categories.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {categories.map((cat) => (
                        <label
                          key={cat}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={form.allowedCategories.includes(cat)}
                            onCheckedChange={() => toggleCategory(cat)}
                          />
                          {cat}
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Type a new category */}
                  <div className="flex gap-1.5 pt-1 border-t border-border/50">
                    <Input
                      placeholder="Add new category..."
                      value={newCatInput}
                      onChange={(e) => setNewCatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addNewCategory();
                        }
                      }}
                      className="h-7 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addNewCategory}
                      className="h-7 px-2"
                    >
                      <IconPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <IconTicket className="h-5 w-5 text-muted-foreground" />
            Passes &amp; Classes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define pass products and their class category compatibility.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <IconPlus className="h-4 w-4" />
          New pass type
        </Button>
      </div>

      {/* Pass type cards */}
      {passTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <IconTicket className="h-8 w-8 opacity-30" />
          <p className="text-sm">No pass types yet.</p>
          <Button variant="outline" size="sm" onClick={openCreate}>
            <IconPlus className="h-4 w-4 mr-1.5" />
            Create your first pass type
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {passTypes.map((pt) => (
            <Card
              key={pt.id}
              className={`p-4 flex flex-col gap-3 ${!pt.active ? "opacity-60" : ""}`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm leading-tight">
                    {pt.name}
                  </span>
                  {!pt.active && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] w-fit mt-0.5"
                    >
                      Inactive
                    </Badge>
                  )}
                </div>
                {/* Actions popover — using a simple inline button group */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Edit"
                    onClick={() => openEdit(pt)}
                  >
                    <IconPencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={pt.active ? "Deactivate" : "Reactivate"}
                    onClick={() => handleToggleActive(pt)}
                  >
                    {pt.active ? (
                      <IconBan className="h-3.5 w-3.5 text-destructive/70" />
                    ) : (
                      <IconCircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Details */}
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <IconTag className="h-3.5 w-3.5" />
                  {fmtCredits(pt.credits)} credits
                  {pt.pricePennies !== null && (
                    <span className="ml-auto font-medium text-foreground">
                      {fmtPrice(pt.pricePennies)}
                    </span>
                  )}
                </span>
                <span>{fmtValidity(pt.validityDays)}</span>
              </div>

              {/* Category compatibility */}
              <div className="pt-1 border-t border-border/40">
                {pt.allCategories ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] gap-1 font-normal"
                  >
                    <IconCategory className="h-3 w-3" />
                    All classes
                  </Badge>
                ) : pt.allowedCategories.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground italic">
                    No categories set
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {pt.allowedCategories.map((cat) => (
                      <Badge
                        key={cat}
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New pass type</DialogTitle>
          </DialogHeader>
          <PassTypeForm />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit pass type</DialogTitle>
          </DialogHeader>
          {editTarget && <PassTypeForm />}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
