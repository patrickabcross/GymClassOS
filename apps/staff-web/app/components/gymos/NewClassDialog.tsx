"use client";

// NewClassDialog — AES-04 / AES-05 UI (LP3 extended)
//
// A "New Class" affordance for the Schedule header. Lets staff schedule a
// class occurrence from the UI, either picking an existing class type or
// defining a new one inline.
//
// LP3 additions: Trainer Select (from loader trainers roster) and Location
// Select (Norwich / Wymondham). Both optional. Order follows bsport style:
// class type → new-type fields → date/time → capacity → room → location → trainer.
//
// ORCHESTRATION: two-step via defineActions:
//   1. create-class-definition  (only when "+ New class type…" is chosen)
//   2. create-class-occurrence  (always; now includes optional trainerId + location)
//
// OPTIMISTIC UI: close dialog immediately + toast, then run mutations +
// revalidator.revalidate(). Nothing is optimistically rendered so rollback is
// automatic (the failed occurrence simply never appears).
//
// SENTINEL VALUES: Radix Select cannot use empty string as value. We use
// "__none__" as the "no selection" sentinel for location and trainer; it is
// mapped to undefined on submit.

import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { useActionMutation } from "@agent-native/core/client";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

type ClassType = {
  id: string;
  name: string;
  durationMin: number;
  defaultCapacity: number;
  category: string | null;
};

type Trainer = {
  id: string;
  name: string;
  homeLocation: string | null;
};

const NEW_TYPE = "__new__";
const NONE = "__none__";

type DefResult = { id?: string; name?: string; error?: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewClassDialog({
  classTypes,
  trainers,
  defaultDate,
}: {
  classTypes: ClassType[];
  trainers: Trainer[];
  defaultDate: string /* "yyyy-MM-dd" */;
}) {
  const [open, setOpen] = useState(false);

  // Form state
  const [typeId, setTypeId] = useState<string>("");
  const [datetime, setDatetime] = useState<string>(`${defaultDate}T18:00`);
  const [capacity, setCapacity] = useState<string>("12");
  const [room, setRoom] = useState<string>("");
  // LP3: optional location + trainer
  const [location, setLocation] = useState<string>(NONE);
  const [trainerId, setTrainerId] = useState<string>(NONE);

  // New-type fields (only used when typeId === NEW_TYPE)
  const [newName, setNewName] = useState<string>("");
  const [newDuration, setNewDuration] = useState<string>("45");
  const [newCapacity, setNewCapacity] = useState<string>("12");
  const [newCategory, setNewCategory] = useState<string>("");

  const createDef = useActionMutation("create-class-definition", {
    onError: (e) => toast(e.message ?? "Failed to create class type"),
  });
  const createOcc = useActionMutation("create-class-occurrence", {
    onError: (e) => toast(e.message ?? "Failed to schedule class"),
  });
  const revalidator = useRevalidator();

  const isNewType = typeId === NEW_TYPE;

  function resetForm() {
    setTypeId("");
    setDatetime(`${defaultDate}T18:00`);
    setCapacity("12");
    setRoom("");
    setLocation(NONE);
    setTrainerId(NONE);
    setNewName("");
    setNewDuration("45");
    setNewCapacity("12");
    setNewCategory("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  // When picking an existing type, prefill the capacity from its default.
  function handleTypeChange(value: string) {
    setTypeId(value);
    if (value === NEW_TYPE) {
      setCapacity(newCapacity || "12");
    } else {
      const def = classTypes.find((c) => c.id === value);
      if (def) setCapacity(String(def.defaultCapacity));
    }
  }

  async function onCreate() {
    // ─── Validate before firing ──────────────────────────────────────────
    if (!datetime) {
      toast("Pick a date and time");
      return;
    }
    if (!typeId) {
      toast("Pick a class type");
      return;
    }
    if (isNewType && !newName.trim()) {
      toast("Name the new class type");
      return;
    }

    // datetime-local has no tz → new Date() reads it in the browser's local
    // (studio-operator) zone. That is the intended studio-local semantic; the
    // resulting ISO is stored verbatim by create-class-occurrence.
    const startsAt = new Date(datetime).toISOString();
    const capacityNum = Number(capacity) || undefined;
    const roomVal = room.trim() || undefined;
    // Map NONE sentinels back to undefined so the action receives no key.
    const locationVal = location && location !== NONE ? location : undefined;
    const trainerIdVal =
      trainerId && trainerId !== NONE ? trainerId : undefined;

    // Capture new-type values before we close + reset.
    const newTypePayload = isNewType
      ? {
          name: newName.trim(),
          durationMin: Number(newDuration) || 45,
          defaultCapacity: Number(newCapacity) || 12,
          category: newCategory.trim() || undefined,
        }
      : null;
    const existingTypeId = isNewType ? null : typeId;

    // ─── Optimistic close ────────────────────────────────────────────────
    setOpen(false);
    resetForm();
    toast("Scheduling class…");

    // ─── Orchestrate after close ─────────────────────────────────────────
    try {
      let definitionId: string;
      if (newTypePayload) {
        const def = (await createDef.mutateAsync(
          newTypePayload as Record<string, unknown> as Parameters<
            typeof createDef.mutateAsync
          >[0],
        )) as DefResult;
        if (def?.error || !def?.id) {
          throw new Error(def?.error ?? "Failed to create class type");
        }
        definitionId = def.id;
      } else {
        definitionId = existingTypeId as string;
      }

      const occResult = (await createOcc.mutateAsync({
        definitionId,
        startsAt,
        capacity: capacityNum,
        room: roomVal,
        trainerId: trainerIdVal,
        location: locationVal,
      } as Record<string, unknown> as Parameters<
        typeof createOcc.mutateAsync
      >[0])) as { error?: string };
      if (occResult?.error) {
        throw new Error(occResult.error);
      }

      revalidator.revalidate();
      toast("Class scheduled");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to schedule class");
    }
  }

  const pending = createDef.isPending || createOcc.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="h-7 text-[12px]">
          <IconPlus size={14} className="mr-1" aria-hidden />
          New Class
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a class</DialogTitle>
          <DialogDescription>
            Pick an existing class type or define a new one, then set the time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Class type */}
          <div className="space-y-2">
            <Label htmlFor="classType">Class type</Label>
            <Select value={typeId} onValueChange={handleTypeChange}>
              <SelectTrigger id="classType">
                <SelectValue placeholder="Select a class type…" />
              </SelectTrigger>
              <SelectContent>
                {classTypes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.category ? ` · ${c.category}` : ""}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_TYPE}>+ New class type…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* New-type fields */}
          {isNewType && (
            <div className="space-y-3 rounded-md border border-border/50 bg-muted/20 p-3">
              <div className="space-y-2">
                <Label htmlFor="newName">Name</Label>
                <Input
                  id="newName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Vinyasa Yoga"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="newDuration">Duration (min)</Label>
                  <Input
                    id="newDuration"
                    type="number"
                    min={5}
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newCapacity">Default capacity</Label>
                  <Input
                    id="newCapacity"
                    type="number"
                    min={1}
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newCategory">Category (optional)</Label>
                <Input
                  id="newCategory"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. yoga"
                />
              </div>
            </div>
          )}

          {/* Date & time */}
          <div className="space-y-2">
            <Label htmlFor="datetime">Date & time</Label>
            <Input
              id="datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              required
            />
          </div>

          {/* Capacity */}
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>

          {/* Room */}
          <div className="space-y-2">
            <Label htmlFor="room">Room (optional)</Label>
            <Input
              id="room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. Studio A"
            />
          </div>

          {/* Location (LP3) */}
          <div className="space-y-2">
            <Label htmlFor="location">Location (optional)</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger id="location">
                <SelectValue placeholder="— none —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— none —</SelectItem>
                <SelectItem value="Norwich">Norwich</SelectItem>
                <SelectItem value="Wymondham">Wymondham</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trainer (LP3) */}
          <div className="space-y-2">
            <Label htmlFor="trainer">Trainer (optional)</Label>
            <Select value={trainerId} onValueChange={setTrainerId}>
              <SelectTrigger id="trainer">
                <SelectValue placeholder="— none —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— none —</SelectItem>
                {trainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.homeLocation ? ` · ${t.homeLocation}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onCreate} disabled={pending}>
            Schedule class
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
