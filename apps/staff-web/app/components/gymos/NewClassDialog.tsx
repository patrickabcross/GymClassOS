"use client";

// NewClassDialog — AES-04 / AES-05 UI (LP3 extended, MPV Phase 2 recurring)
//
// A "New Class" affordance for the Schedule header. Lets staff schedule a
// class occurrence from the UI, either picking an existing class type or
// defining a new one inline.
//
// LP3 additions: Trainer Select (from loader trainers roster) and Location
// Select (Norwich / Wymondham). Both optional. Order follows bsport style:
// class type → new-type fields → date/time → capacity → room → location → trainer.
//
// MPV Phase 2 addition: "Repeat weekly" toggle.
//   - When off (default): behaves as before — create-class-definition (if new
//     type) then create-class-occurrence.
//   - When on: shows a day-of-week picker. On submit, calls create-schedule-rule
//     with daysOfWeek (selected days), timeOfDay (HH:MM from the time input),
//     and startsOn (YYYY-MM-DD from the date input). If a new class type was
//     also requested, create-class-definition is called first.
//
// ORCHESTRATION: two-step via defineActions:
//   1. create-class-definition  (only when "+ New class type…" is chosen)
//   2a. create-class-occurrence  (repeat=false)
//   2b. create-schedule-rule    (repeat=true)
//
// OPTIMISTIC UI: close dialog immediately + toast, then run mutations +
// revalidator.revalidate(). Nothing is optimistically rendered so rollback is
// automatic (the failed occurrence simply never appears).
//
// SENTINEL VALUES: Radix Select cannot use empty string as value. We use
// "__none__" as the "no selection" sentinel for location and trainer; it is
// mapped to undefined on submit.

import { useState } from "react";
import { IconPlus, IconRepeat } from "@tabler/icons-react";
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
import { Switch } from "@/components/ui/switch";

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

/** Weekday labels 0=Sun … 6=Sat */
const WEEKDAYS: { label: string; short: string; value: number }[] = [
  { label: "Sunday", short: "Su", value: 0 },
  { label: "Monday", short: "Mo", value: 1 },
  { label: "Tuesday", short: "Tu", value: 2 },
  { label: "Wednesday", short: "We", value: 3 },
  { label: "Thursday", short: "Th", value: 4 },
  { label: "Friday", short: "Fr", value: 5 },
  { label: "Saturday", short: "Sa", value: 6 },
];

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

  // MPV Phase 2: repeat weekly
  const [repeat, setRepeat] = useState<boolean>(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const createDef = useActionMutation("create-class-definition", {
    onError: (e) => toast(e.message ?? "Failed to create class type"),
  });
  const createOcc = useActionMutation("create-class-occurrence", {
    onError: (e) => toast(e.message ?? "Failed to schedule class"),
  });
  const createRule = useActionMutation("create-schedule-rule", {
    onError: (e) => toast(e.message ?? "Failed to create recurring rule"),
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
    setRepeat(false);
    setSelectedDays([]);
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

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
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
    if (repeat && selectedDays.length === 0) {
      toast("Select at least one day of the week");
      return;
    }

    // Extract date (YYYY-MM-DD) and time (HH:MM) from datetime-local input.
    // Format is always "YYYY-MM-DDTHH:MM" — slice directly rather than using
    // Date parsing so we stay in the browser's (studio) local time zone.
    const datePart = datetime.slice(0, 10); // "YYYY-MM-DD"
    const timePart = datetime.slice(11, 16); // "HH:MM"

    // For one-off occurrences: build a full ISO timestamp
    // (browser local tz → toISOString shifts to UTC)
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
    toast(repeat ? "Creating recurring schedule…" : "Scheduling class…");

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

      if (repeat) {
        // ─── Recurring: create-schedule-rule ────────────────────────────
        const ruleResult = (await createRule.mutateAsync({
          definitionId,
          daysOfWeek: selectedDays,
          timeOfDay: timePart,
          startsOn: datePart,
          capacity: capacityNum,
          location: locationVal,
          trainerId: trainerIdVal,
        } as Record<string, unknown> as Parameters<
          typeof createRule.mutateAsync
        >[0])) as { error?: string; occurrencesGenerated?: number };
        if (ruleResult?.error) {
          throw new Error(ruleResult.error);
        }
        const count = ruleResult?.occurrencesGenerated ?? 0;
        revalidator.revalidate();
        toast(
          `Recurring schedule created — ${count} occurrence${count !== 1 ? "s" : ""} generated`,
        );
      } else {
        // ─── One-off: create-class-occurrence ───────────────────────────
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
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to schedule class");
    }
  }

  const pending =
    createDef.isPending || createOcc.isPending || createRule.isPending;

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
            <Label htmlFor="datetime">
              {repeat ? "Start date & time" : "Date & time"}
            </Label>
            <Input
              id="datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              required
            />
          </div>

          {/* MPV Phase 2: Repeat weekly toggle */}
          <div className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5">
            <IconRepeat size={16} className="shrink-0 text-muted-foreground" />
            <Label
              htmlFor="repeat"
              className="flex-1 cursor-pointer text-sm font-normal"
            >
              Repeat weekly
            </Label>
            <Switch
              id="repeat"
              checked={repeat}
              onCheckedChange={(checked) => {
                setRepeat(checked);
                if (!checked) setSelectedDays([]);
              }}
            />
          </div>

          {/* Day-of-week picker — shown only when repeat=true */}
          {repeat && (
            <div className="space-y-2">
              <Label>Repeat on</Label>
              <div className="flex gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = selectedDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-label={day.label}
                      aria-pressed={active}
                      onClick={() => toggleDay(day.value)}
                      className={[
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      ].join(" ")}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Room (one-off only — not applicable to recurring rules) */}
          {!repeat && (
            <div className="space-y-2">
              <Label htmlFor="room">Room (optional)</Label>
              <Input
                id="room"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Studio A"
              />
            </div>
          )}

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
            {repeat ? "Create recurring schedule" : "Schedule class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
