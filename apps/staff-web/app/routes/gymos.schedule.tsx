// RunStudio Schedule — month-grid calendar with day drill-down.
//
// Route: /gymos/schedule (file naming: dot separator = path segment in RR v7
// framework mode, matching the existing gymos.tsx inbox route).
//
// Shape: standard month grid (7 cols × N weeks), today highlighted, each day
// cell shows a class-count badge. Click a day to select it; the right-hand
// detail pane lists that day's occurrences with the existing book-into-
// occurrence dialog preserved.
//
// Why month grid (over a 5-day strip): the seed carries ~423 occurrences
// across 3 months — density information is actually present, so a month grid
// gives operators the most signal at a glance. date-fns helpers cover the
// awkward calendar math (week roll, month boundaries).
//
// State lives in URL search params (month=YYYY-MM, date=YYYY-MM-DD, book=<id>)
// so the calendar is SSR-stable and shareable. Defaults: month=current month,
// date=today.
//
// Loader still pulls the full occurrence + booking-count set. For 3 months
// of seed data this is ~423 rows; once production windows grow we'll add a
// month-range filter in the loader URL (covered post-pilot under SCH-08).
//
// Action: unchanged from the previous flat-list version — insert booking row
// (demo-grade, no atomic capacity check). Production atomicity ships in
// BKG-03/BKG-04.

import {
  useLoaderData,
  Form,
  redirect,
  useSearchParams,
  useRevalidator,
} from "react-router";
import { useEffect } from "react";
import { useChangeVersions } from "@agent-native/core/client";
import { eq, asc, sql } from "drizzle-orm";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NewClassDialog } from "@/components/gymos/NewClassDialog";
import { ManageTrainersDialog } from "@/components/gymos/ManageTrainersDialog";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "RunStudio — Schedule" }];
}

// ─── Action: insert booking row (demo-grade, no atomicity) ──────────────────

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const occurrenceId = String(formData.get("occurrenceId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/gymos/schedule");
  if (!occurrenceId || !memberId) {
    return { error: "Missing occurrenceId or memberId" };
  }

  const db = getDb();

  // Demo grade: simple INSERT. NO atomic capacity check, NO entitlement
  // resolution, NO pass debit. Production (BKG-03/BKG-04) wraps capacity
  // check + entitlement + pass debit in a single SQL transaction with
  // SELECT ... FOR UPDATE on the occurrence row.
  const bookingId = `bkg_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await db.insert(schema.bookings).values({
    id: bookingId,
    occurrenceId,
    memberId,
    status: "booked",
    bookedByUserId: null, // demo: no auth context
    bookedAt: now,
  });

  return redirect(returnTo);
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const bookOccurrenceId = url.searchParams.get("book");
  const db = getDb();

  // Query A — list occurrences joined to definitions, ordered by start time.
  //
  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
  // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
  const occurrences = await db
    .select({
      id: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      capacity: schema.classOccurrences.capacity,
      status: schema.classOccurrences.status,
      room: schema.classOccurrences.room,
      className: schema.classDefinitions.name,
      category: schema.classDefinitions.category,
      durationMin: schema.classDefinitions.durationMin,
    })
    .from(schema.classOccurrences)
    .leftJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .orderBy(asc(schema.classOccurrences.startsAt));

  // Query B — booking counts per occurrence (single grouped query).
  //
  // guard:allow-unscoped — single-tenant gym tables.
  const bookingCountsRows = await db
    .select({
      occurrenceId: schema.bookings.occurrenceId,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.bookings)
    .where(eq(schema.bookings.status, "booked"))
    .groupBy(schema.bookings.occurrenceId);

  const bookingCounts: Record<string, number> = {};
  for (const r of bookingCountsRows) {
    bookingCounts[r.occurrenceId] = Number(r.count);
  }

  // Query D — active class definitions for the "New Class" dialog Select.
  // Unconditional (cheap; ~tens of rows).
  //
  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns).
  const classTypes = await db
    .select({
      id: schema.classDefinitions.id,
      name: schema.classDefinitions.name,
      durationMin: schema.classDefinitions.durationMin,
      defaultCapacity: schema.classDefinitions.defaultCapacity,
      category: schema.classDefinitions.category,
    })
    .from(schema.classDefinitions)
    .where(eq(schema.classDefinitions.active, true))
    .orderBy(asc(schema.classDefinitions.name));

  // Query E — active trainers for the "New Class" trainer picker (LP3).
  // Mirrors Query D / classTypes pattern (cheap; ~tens of rows; unconditional).
  //
  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns).
  const trainers = await db
    .select({
      id: schema.trainers.id,
      name: schema.trainers.name,
      homeLocation: schema.trainers.homeLocation,
    })
    .from(schema.trainers)
    .where(eq(schema.trainers.active, true))
    .orderBy(asc(schema.trainers.name));

  // Query C — only fetch members + selected occurrence when dialog is open.
  let members: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
  }> = [];
  let bookOccurrence: (typeof occurrences)[number] | null = null;
  if (bookOccurrenceId) {
    members = await db
      .select({
        id: schema.gymMembers.id,
        firstName: schema.gymMembers.firstName,
        lastName: schema.gymMembers.lastName,
      })
      .from(schema.gymMembers)
      .orderBy(asc(schema.gymMembers.firstName));
    bookOccurrence = occurrences.find((o) => o.id === bookOccurrenceId) ?? null;
  }

  return {
    occurrences,
    bookingCounts,
    members,
    bookOccurrence,
    classTypes,
    trainers,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type Occurrence = Awaited<ReturnType<typeof loader>>["occurrences"][number];

// Demo uses UTC date bucket; production must use studio IANA timezone
// (DST-correct per SCH-07).
function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function groupByDay(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const out = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = dayKey(o.startsAt);
    const bucket = out.get(key);
    if (bucket) bucket.push(o);
    else out.set(key, [o]);
  }
  return out;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Build the rendered month grid (always whole weeks, Mon–Sun).
function monthGridDays(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

// Parse a YYYY-MM string into a Date anchored at the first of that month.
// Falls back to today if the param is missing or malformed.
function parseMonthParam(raw: string | null): Date {
  if (!raw) return startOfMonth(new Date());
  const parsed = parse(raw, "yyyy-MM", new Date());
  return isNaN(parsed.getTime()) ? startOfMonth(new Date()) : parsed;
}

// Parse a YYYY-MM-DD string into a Date. Falls back to today.
function parseDateParam(raw: string | null): Date {
  if (!raw) return new Date();
  const parsed = parse(raw, "yyyy-MM-dd", new Date());
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosSchedule() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const revalidator = useRevalidator();
  const actionVersion = useChangeVersions(["action"]);

  // Re-run the loader whenever the agent completes a write action (AEX-03).
  useEffect(() => {
    if (actionVersion > 0) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionVersion]);

  // ─── URL-driven state ───────────────────────────────────────────────────
  const monthAnchor = parseMonthParam(searchParams.get("month"));
  const selectedDate = parseDateParam(searchParams.get("date"));
  const monthLabel = format(monthAnchor, "MMMM yyyy");

  // ─── Derived calendar data ──────────────────────────────────────────────
  const byDay = groupByDay(data.occurrences);
  const gridDays = monthGridDays(monthAnchor);
  const selectedKey = format(selectedDate, "yyyy-MM-dd");
  const selectedOccurrences = (byDay.get(selectedKey) ?? [])
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // ─── Nav helpers — preserve other params; only swap calendar params ─────
  function navigateTo(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next);
  }

  function goPrevMonth() {
    navigateTo({ month: format(subMonths(monthAnchor, 1), "yyyy-MM") });
  }
  function goNextMonth() {
    navigateTo({ month: format(addMonths(monthAnchor, 1), "yyyy-MM") });
  }
  function goToday() {
    const today = new Date();
    navigateTo({
      month: format(startOfMonth(today), "yyyy-MM"),
      date: format(today, "yyyy-MM-dd"),
    });
  }
  function selectDay(d: Date) {
    navigateTo({
      month: format(startOfMonth(d), "yyyy-MM"),
      date: format(d, "yyyy-MM-dd"),
    });
  }
  function openBookDialog(occurrenceId: string) {
    navigateTo({ book: occurrenceId });
  }
  function closeBookDialog() {
    navigateTo({ book: null });
  }

  // ─── Dialog state ───────────────────────────────────────────────────────
  const dialogOpen = !!data.bookOccurrence;
  const occ = data.bookOccurrence;
  const occBookedCount = occ ? (data.bookingCounts[occ.id] ?? 0) : 0;
  const occFull = occ ? occBookedCount >= occ.capacity : false;
  const returnTo = `/gymos/schedule?${(() => {
    const r = new URLSearchParams(searchParams);
    r.delete("book");
    return r.toString();
  })()}`;

  const totalThisMonth = gridDays
    .filter((d) => isSameMonth(d, monthAnchor))
    .reduce(
      (sum, d) => sum + (byDay.get(format(d, "yyyy-MM-dd"))?.length ?? 0),
      0,
    );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {/* ─── Header ───────────────────────────────────────────────────── */}
      <header className="border-b border-border/50 bg-card/30 px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold">Class Schedule</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Pick a day to see its classes · click a class to book a member
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ManageTrainersDialog trainers={data.trainers} />
            <NewClassDialog
              classTypes={data.classTypes}
              trainers={data.trainers}
              defaultDate={selectedKey}
            />
            <Badge variant="outline" className="h-5 text-[10px]">
              {totalThisMonth} this month
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[12px]"
              onClick={goToday}
            >
              Today
            </Button>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={goPrevMonth}
                aria-label="Previous month"
              >
                <IconChevronLeft size={14} aria-hidden />
              </Button>
              <div className="min-w-[112px] text-center text-[12px] font-semibold tabular-nums">
                {monthLabel}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={goNextMonth}
                aria-label="Next month"
              >
                <IconChevronRight size={14} aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Two-pane body: calendar grid (left) + day detail (right) ─── */}
      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden px-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        {/* ─── Month grid ─────────────────────────────────────────────── */}
        <section
          className="flex min-h-0 flex-col rounded-lg border border-border/50 bg-card/20"
          aria-label={`${monthLabel} calendar`}
        >
          {/* Weekday header (Mon–Sun) */}
          <div className="grid grid-cols-7 border-b border-border/40 px-2 py-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
              <div
                key={w}
                className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div
            className="grid flex-1 grid-cols-7 gap-1 overflow-auto p-2"
            style={{
              gridAutoRows: "minmax(64px, 1fr)",
            }}
          >
            {gridDays.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const count = byDay.get(key)?.length ?? 0;
              const inMonth = isSameMonth(d, monthAnchor);
              const isSelected = isSameDay(d, selectedDate);
              const today = isToday(d);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDay(d)}
                  aria-pressed={isSelected}
                  aria-label={`${format(d, "EEEE d MMMM")}, ${count} ${
                    count === 1 ? "class" : "classes"
                  }`}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-md border px-2 py-1.5 text-left transition",
                    "border-border/40 bg-background/40 hover:bg-accent/40",
                    !inMonth && "opacity-40",
                    today &&
                      "border-[color:var(--studio-accent)]/30 bg-[color:var(--studio-accent)]/10",
                    isSelected &&
                      "border-foreground bg-accent ring-1 ring-foreground/20",
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        "text-[12px] tabular-nums",
                        today
                          ? "font-semibold text-foreground"
                          : "text-foreground",
                        !inMonth && "text-muted-foreground",
                      )}
                    >
                      {format(d, "d")}
                    </span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "rounded-full bg-foreground/80 px-1.5 text-[10px] tabular-nums text-background",
                        )}
                        aria-hidden
                      >
                        {count}
                      </span>
                    )}
                  </div>
                  {count > 0 ? (
                    <span
                      className="h-1 w-1 rounded-full bg-foreground/60"
                      aria-hidden
                    />
                  ) : (
                    <span className="h-1 w-1" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Day detail pane ─────────────────────────────────────────── */}
        <section
          className="flex min-h-0 flex-col rounded-lg border border-border/50 bg-card/20"
          aria-label={`Classes on ${format(selectedDate, "EEEE d MMMM yyyy")}`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {format(selectedDate, "EEEE")}
              </div>
              <div className="text-sm font-semibold">
                {format(selectedDate, "d MMMM yyyy")}
              </div>
            </div>
            <Badge variant="outline" className="h-5 text-[10px]">
              {selectedOccurrences.length}{" "}
              {selectedOccurrences.length === 1 ? "class" : "classes"}
            </Badge>
          </header>

          <div className="flex-1 overflow-auto p-2">
            {selectedOccurrences.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <IconCalendarEvent
                  size={28}
                  className="text-muted-foreground"
                  aria-hidden
                />
                <div className="text-[13px] text-muted-foreground">
                  No classes scheduled
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Pick another day from the calendar
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedOccurrences.map((o) => {
                  const booked = data.bookingCounts[o.id] ?? 0;
                  const full = booked >= o.capacity;
                  const cancelled = o.status === "cancelled";
                  const spotsLeft = o.capacity - booked;
                  const capacityClass = cn(
                    "rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                    full
                      ? "bg-destructive/10 text-destructive"
                      : spotsLeft <= 3
                        ? // guard:allow-color — capacity-warning amber semantic, not a brand color
                          "bg-amber-100 text-amber-700"
                        : "text-muted-foreground",
                  );
                  return (
                    <li key={o.id}>
                      <Card
                        className={cn(
                          "border-border/50 bg-background/60 p-3",
                          cancelled && "opacity-50",
                        )}
                      >
                        <CardContent className="flex flex-col gap-2 p-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-semibold tabular-nums">
                              {formatTime(o.startsAt)}
                              <span className="text-muted-foreground">
                                {" – "}
                                {formatTime(o.endsAt)}
                              </span>
                            </span>
                            <span className={capacityClass}>
                              {booked} / {o.capacity}
                              {full && " · Full"}
                            </span>
                          </div>
                          <div className="text-[13px] font-semibold">
                            {o.className ?? "Untitled class"}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {o.category && (
                              <Badge
                                variant="secondary"
                                className="h-4 px-1.5 text-[9px] uppercase"
                              >
                                {o.category}
                              </Badge>
                            )}
                            {o.room && (
                              <span className="text-[11px] text-muted-foreground">
                                {o.room}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              · {o.durationMin ?? "?"}min
                            </span>
                            {cancelled && (
                              <Badge
                                variant="outline"
                                className="ml-auto h-4 px-1.5 text-[9px] uppercase"
                              >
                                Cancelled
                              </Badge>
                            )}
                            {!cancelled && (
                              <Button
                                type="button"
                                size="sm"
                                variant={full ? "outline" : "default"}
                                disabled={full}
                                onClick={() => openBookDialog(o.id)}
                                className="ml-auto h-6 px-2 text-[11px]"
                              >
                                {full ? "Full" : "Book"}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* ─── Booking dialog ───────────────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeBookDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {occ && (
            <>
              <DialogHeader>
                <DialogTitle>Book into {occ.className ?? "class"}</DialogTitle>
                <DialogDescription>
                  {new Date(occ.startsAt).toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  <span
                    className={cn(
                      "tabular-nums",
                      occFull
                        ? "text-destructive"
                        : occ.capacity - occBookedCount <= 3
                          ? // guard:allow-color — capacity-warning amber semantic, not a brand color
                            "text-amber-700"
                          : "",
                    )}
                  >
                    {occBookedCount} / {occ.capacity} booked
                  </span>
                  {occFull && " · Full"}
                </DialogDescription>
              </DialogHeader>

              <Form method="post" className="space-y-4">
                <input type="hidden" name="occurrenceId" value={occ.id} />
                <input type="hidden" name="returnTo" value={returnTo} />

                <div className="space-y-2">
                  <label
                    htmlFor="memberId"
                    className="text-[12px] font-semibold text-muted-foreground"
                  >
                    Member
                  </label>
                  <Select name="memberId" required>
                    <SelectTrigger id="memberId">
                      <SelectValue placeholder="Select a member..." />
                    </SelectTrigger>
                    <SelectContent>
                      {data.members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {`${m.firstName} ${m.lastName ?? ""}`.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeBookDialog}
                  >
                    Discard
                  </Button>
                  {/* occFull gate is UI-only; production atomicity
                      (capacity check inside the booking transaction) ships
                      in BKG-03/BKG-04. */}
                  <Button type="submit" disabled={occFull}>
                    Book
                  </Button>
                </DialogFooter>
              </Form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
