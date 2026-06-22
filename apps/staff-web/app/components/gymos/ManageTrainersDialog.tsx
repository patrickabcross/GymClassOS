"use client";

// ManageTrainersDialog — LP3
//
// Manage the studio's trainer roster: list active trainers, add a new trainer,
// inline-edit name/home-location, and deactivate.
//
// Wire: useActionMutation for create-trainer and update-trainer. On success,
// close the inline edit row and revalidator.revalidate() (loader Query E picks
// up the fresh list — same pattern as NewClassDialog's optimistic revalidate).
//
// DESIGN: Dialog (not Sheet) to match the screen's existing NewClassDialog /
// book-member-into-class dialog idiom. "Manage trainers" trigger is a small
// outline button in the Schedule header with an IconUsers icon.
//
// DEACTIVATE: reversible via update-trainer({ id, active: false }). No
// window.confirm — deactivate is non-destructive and immediate (can be
// reactivated by adding the same name again via create-trainer).
//
// NO hard delete — there is no delete-trainer action. active:false is the only
// removal path.

import { useState } from "react";
import { IconUsers, IconPencil, IconCheck, IconX } from "@tabler/icons-react";
import { useActionMutation } from "@agent-native/core/client";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Trainer = {
  id: string;
  name: string;
  homeLocation: string | null;
};

type UpdateResult = {
  updated?: boolean;
  reason?: string;
  error?: string;
};

type CreateResult = {
  id?: string;
  name?: string;
  error?: string;
};

const HOME_LOCATION_OPTIONS = [
  { value: "__none__", label: "— none —" },
  { value: "Norwich", label: "Norwich" },
  { value: "Wymondham", label: "Wymondham" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManageTrainersDialog({ trainers }: { trainers: Trainer[] }) {
  const [open, setOpen] = useState(false);

  // Add-trainer form state
  const [addName, setAddName] = useState("");
  const [addLocation, setAddLocation] = useState("__none__");

  // Inline-edit state: which trainer id is being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("__none__");

  const createTrainer = useActionMutation("create-trainer", {
    onError: (e) => toast(e.message ?? "Failed to add trainer"),
  });
  const updateTrainer = useActionMutation("update-trainer", {
    onError: (e) => toast(e.message ?? "Failed to update trainer"),
  });
  const revalidator = useRevalidator();

  function resetAddForm() {
    setAddName("");
    setAddLocation("__none__");
  }

  function startEdit(trainer: Trainer) {
    setEditingId(trainer.id);
    setEditName(trainer.name);
    setEditLocation(trainer.homeLocation ?? "__none__");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditLocation("__none__");
  }

  async function handleAdd() {
    const name = addName.trim();
    if (!name) {
      toast("Enter a trainer name");
      return;
    }

    // Optimistic feedback
    toast("Adding trainer…");
    resetAddForm();

    try {
      const result = (await createTrainer.mutateAsync({
        name,
        homeLocation:
          addLocation && addLocation !== "__none__" ? addLocation : undefined,
      } as Record<string, unknown> as Parameters<
        typeof createTrainer.mutateAsync
      >[0])) as CreateResult;

      if (result?.error) {
        throw new Error(result.error);
      }
      revalidator.revalidate();
      toast(`${result.name ?? name} added`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add trainer");
    }
  }

  async function handleSaveEdit(id: string) {
    const name = editName.trim();
    if (!name) {
      toast("Name cannot be empty");
      return;
    }

    const homeLocation =
      editLocation && editLocation !== "__none__" ? editLocation : undefined;

    cancelEdit();
    toast("Saving…");

    try {
      const result = (await updateTrainer.mutateAsync({
        id,
        name,
        homeLocation,
      } as Record<string, unknown> as Parameters<
        typeof updateTrainer.mutateAsync
      >[0])) as UpdateResult;

      if (result?.error === "NAME_IN_USE") {
        throw new Error("That name is already in use by another trainer");
      }
      if (result?.error) {
        throw new Error(result.error);
      }
      revalidator.revalidate();
      toast("Trainer updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update trainer");
    }
  }

  async function handleDeactivate(id: string, name: string) {
    toast(`Deactivating ${name}…`);
    try {
      const result = (await updateTrainer.mutateAsync({
        id,
        active: false,
      } as Record<string, unknown> as Parameters<
        typeof updateTrainer.mutateAsync
      >[0])) as UpdateResult;

      if (result?.error) {
        throw new Error(result.error);
      }
      revalidator.revalidate();
      toast(`${name} deactivated`);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to deactivate trainer",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-[12px]">
          <IconUsers size={14} className="mr-1" aria-hidden />
          Trainers
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage trainers</DialogTitle>
          <DialogDescription>
            Add, edit, or deactivate trainers on the studio roster.
          </DialogDescription>
        </DialogHeader>

        {/* ── Trainer list ─────────────────────────────────────────────── */}
        <div className="max-h-64 overflow-y-auto">
          {trainers.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">
              No active trainers yet — add one below.
            </p>
          ) : (
            <ul className="divide-y divide-border/30">
              {trainers.map((t) => (
                <li key={t.id} className="py-2">
                  {editingId === t.id ? (
                    /* ── Inline edit row ─────────────────────────── */
                    <div className="space-y-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-[12px]"
                        aria-label="Trainer name"
                      />
                      <Select
                        value={editLocation}
                        onValueChange={setEditLocation}
                      >
                        <SelectTrigger className="h-7 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOME_LOCATION_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 text-[11px]"
                          onClick={() => handleSaveEdit(t.id)}
                        >
                          <IconCheck size={11} className="mr-1" aria-hidden />
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px]"
                          onClick={cancelEdit}
                        >
                          <IconX size={11} className="mr-1" aria-hidden />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ── Read row ───────────────────────────────── */
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">
                          {t.name}
                        </div>
                        {t.homeLocation && (
                          <div className="text-[11px] text-muted-foreground">
                            {t.homeLocation}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          aria-label={`Edit ${t.name}`}
                          onClick={() => startEdit(t)}
                        >
                          <IconPencil size={12} aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                          aria-label={`Deactivate ${t.name}`}
                          onClick={() => handleDeactivate(t.id, t.name)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Add trainer row ─────────────────────────────────────────── */}
        <div className="space-y-3 border-t border-border/40 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Add trainer
          </p>
          <div className="space-y-2">
            <Label htmlFor="addName" className="text-[12px]">
              Name
            </Label>
            <Input
              id="addName"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. Matty Wiseman"
              className="h-8 text-[12px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addLocation" className="text-[12px]">
              Home location (optional)
            </Label>
            <Select value={addLocation} onValueChange={setAddLocation}>
              <SelectTrigger id="addLocation" className="h-8 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOME_LOCATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full text-[12px]"
            onClick={handleAdd}
            disabled={createTrainer.isPending}
          >
            Add trainer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
