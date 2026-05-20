// GymOS Schedule — Demo Sprint D1. Week-grid of seeded class occurrences with
// book-into-occurrence dialog. Standalone for demo; will move to
// apps/staff-web/features/schedule/ post-demo.
//
// Route: /gymos/schedule (file naming: dot separator = path segment in RR v7
// framework mode, matching the existing gymos.tsx inbox route).
//
// Loader returns the full seeded week (Sun May 18 → Fri May 22, 7 occurrences).
// Action inserts a booking row (status='booked'); demo-grade — no atomic
// capacity check, no entitlement resolution, no pass debit. Production
// (BKG-03/BKG-04) wraps capacity + entitlement + debit in a single transaction
// with SELECT ... FOR UPDATE on the occurrence row.

import { useLoaderData, Form, redirect, useSearchParams } from "react-router";
import { eq, asc, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymOS — Schedule" }];
}

// ─── Action: insert booking row (demo-grade, no atomicity) ──────────────────

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const occurrenceId = String(formData.get("occurrenceId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
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

  return redirect("/gymos/schedule");
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const bookOccurrenceId = url.searchParams.get("book");
  const db = getDb();

  // Query A — list occurrences joined to definitions, ordered by start time.
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

  return { occurrences, bookingCounts, members, bookOccurrence };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type Occurrence = Awaited<ReturnType<typeof loader>>["occurrences"][number];

// Demo uses UTC date bucket; production must use studio IANA timezone
// (DST-correct per SCH-07).
function groupByDay(occurrences: Occurrence[]): Record<string, Occurrence[]> {
  const out: Record<string, Occurrence[]> = {};
  for (const o of occurrences) {
    const key = new Date(o.startsAt).toISOString().slice(0, 10);
    (out[key] ??= []).push(o);
  }
  return out;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayHeader(yyyymmdd: string) {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  return {
    weekday: d.toLocaleDateString("en-GB", {
      weekday: "short",
      timeZone: "UTC",
    }),
    dayMonth: d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
  };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosSchedule() {
  const data = useLoaderData<typeof loader>();
  const [, setParams] = useSearchParams();

  const byDay = groupByDay(data.occurrences);
  const dayKeys = Object.keys(byDay).sort();

  const dialogOpen = !!data.bookOccurrence;
  const occ = data.bookOccurrence;
  const occBookedCount = occ ? (data.bookingCounts[occ.id] ?? 0) : 0;
  const occFull = occ ? occBookedCount >= occ.capacity : false;

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      {/* ─── Header ───────────────────────────────────────────────────── */}
      <header className="border-b border-border/50 bg-card/30 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">Class Schedule</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Week view · click an occurrence to book a member
            </p>
          </div>
          <Badge variant="outline" className="h-5 text-[10px]">
            {data.occurrences.length} occurrences
          </Badge>
        </div>
      </header>

      {/* ─── Week grid ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto px-5 py-4">
        {dayKeys.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No class occurrences in the database.
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${dayKeys.length}, minmax(180px, 1fr))`,
            }}
          >
            {dayKeys.map((dayKey) => {
              const header = formatDayHeader(dayKey);
              return (
                <section
                  key={dayKey}
                  className="flex flex-col rounded-lg border border-border/50 bg-card/20"
                >
                  <header className="border-b border-border/40 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {header.weekday}
                    </div>
                    <div className="text-[13px] font-semibold">
                      {header.dayMonth}
                    </div>
                  </header>
                  <div className="flex-1 space-y-2 p-2">
                    {byDay[dayKey].map((o) => {
                      const booked = data.bookingCounts[o.id] ?? 0;
                      const full = booked >= o.capacity;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setParams({ book: o.id })}
                          className={cn(
                            "w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-left transition hover:bg-accent/40",
                            o.status === "cancelled" && "opacity-50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium tabular-nums">
                              {formatTime(o.startsAt)}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] tabular-nums",
                                full
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground",
                              )}
                            >
                              {booked} / {o.capacity}
                            </span>
                          </div>
                          <div className="mt-1 text-[13px] font-semibold">
                            {o.className ?? "Untitled class"}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            {o.category && (
                              <Badge
                                variant="secondary"
                                className="h-4 px-1.5 text-[9px] uppercase"
                              >
                                {o.category}
                              </Badge>
                            )}
                            {o.room && (
                              <span className="text-[10px] text-muted-foreground">
                                · {o.room}
                              </span>
                            )}
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {o.durationMin ?? "?"}min
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* ─── Booking dialog ───────────────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setParams({});
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
                      occFull && "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {occBookedCount} / {occ.capacity} booked
                  </span>
                  {occFull && " (over capacity — demo allows this)"}
                </DialogDescription>
              </DialogHeader>

              <Form method="post" className="space-y-4">
                <input type="hidden" name="occurrenceId" value={occ.id} />

                <div className="space-y-2">
                  <label
                    htmlFor="memberId"
                    className="text-[12px] font-medium text-muted-foreground"
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

                <p className="text-[10px] text-muted-foreground">
                  Demo: inserts a bookings row directly. Production wraps
                  capacity check + entitlement resolution + pass debit in a
                  single SQL transaction (BKG-03/BKG-04).
                </p>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setParams({})}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Book</Button>
                </DialogFooter>
              </Form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
