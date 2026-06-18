"use client";

// NewClassDialog — AES-04 / AES-05 UI
//
// A "New Class" affordance for the Schedule header. Lets staff schedule a
// class occurrence from the UI, either picking an existing class type or
// defining a new one inline.
//
// ORCHESTRATION: This dialog is the two-step orchestrator. The write logic
// lives in two atomic, agent-reusable defineActions:
//   1. create-class-definition  (only when "+ New class type…" is chosen)
//   2. create-class-occurrence  (always)
// Neither action accepts an inline newDefinition — keeping them atomic makes
// each independently reusable as an agent tool in v1.2 Phase AE2.
//
// TIMEZONE: The <input type="datetime-local"> value has no timezone, so
// `new Date(value)` interprets it in the browser's local zone — which is the
// studio operator's local time, the intended studio-local semantic. The
// resulting ISO string is stored verbatim by create-class-occurrence; the
// calendar renders it back via `new Date(iso)`. (Production IANA-TZ alignment
// is deferred to SCH-07.)
//
// OPTIMISTIC UI: On submit we close the dialog immediately and toast
// "Scheduling class…", then run the orchestration and `revalidator.revalidate()`
// so the new occurrence appears on the calendar. We do NOT optimistically
// insert into loader state — the close-then-revalidate middle-ground keeps the
// UI snappy without a spinner-block; rollback is automatic (nothing was
// optimistically rendered, so a failed schedule simply never appears).

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

const NEW_TYPE = "__new__";

type DefResult = { id?: string; name?: string; error?: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewClassDialog({
  classTypes,
  defaultDate,
}: {
  classTypes: ClassType[];
  defaultDate: string /* "yyyy-MM-dd" */;
}) {
  const [open, setOpen] = useState(false);

  // Form state
  const [typeId, setTypeId] = useState<string>("");
  const [datetime, setDatetime] = useState<string>(`${defaultDate}T18:00`);
  const [capacity, setCapacity] = useState<string>("12");
  const [room, setRoom] = useState<string>("");

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
