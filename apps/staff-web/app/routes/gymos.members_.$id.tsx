// RunStudio Member Profile — R4-02 visual refresh: pass-balance pill + next-class card + bookings timeline.
//
// URL: /gymos/members/:id
//
// Loader already returns { member, passes, passBalance, bookings, foodEntries, conversation }.
// No loader/schema changes in this plan (SWEB-04 scope only).

import { useLoaderData, Link, useRevalidator } from "react-router";
import { eq, desc, sql } from "drizzle-orm";
import { useState, useEffect } from "react";
import { useChangeVersions } from "@agent-native/core/client";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckoutLinkButton } from "@/components/gymos/CheckoutLinkButton";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "RunStudio — Member Profile" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ params }: LoaderFunctionArgs) {
  const memberId = params.id;
  if (!memberId) throw new Response("Not found", { status: 404 });

  const db = getDb();

  // 1. Member record
  const member = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, memberId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!member) throw new Response("Member not found", { status: 404 });

  // 2. Passes (newest first)
  const passes = await db
    .select()
    .from(schema.passes)
    .where(eq(schema.passes.memberId, memberId))
    .orderBy(desc(schema.passes.createdAt));

  // 3. Pass balance = SUM(granted) - SUM(debits)
  const debitsTotal = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)`,
    })
    .from(schema.passDebits)
    .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
    .where(eq(schema.passes.memberId, memberId))
    .then((r) => Number(r[0]?.sum ?? 0));
  const grantedTotal = passes.reduce((s, p) => s + p.granted, 0);
  const passBalance = grantedTotal - debitsTotal;

  // 4. Bookings — joined to occurrences + class definitions for the timeline
  const bookings = await db
    .select({
      id: schema.bookings.id,
      status: schema.bookings.status,
      bookedAt: schema.bookings.bookedAt,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      className: schema.classDefinitions.name,
    })
    .from(schema.bookings)
    .leftJoin(
      schema.classOccurrences,
      eq(schema.bookings.occurrenceId, schema.classOccurrences.id),
    )
    .leftJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .where(eq(schema.bookings.memberId, memberId))
    .orderBy(desc(schema.classOccurrences.startsAt));

  // 5. Recent food entries
  const foodEntries = await db
    .select()
    .from(schema.foodEntries)
    .where(eq(schema.foodEntries.memberId, memberId))
    .orderBy(desc(schema.foodEntries.loggedAt))
    .limit(10);

  // 6. Conversation (for the cross-surface deep-link)
  const conversation = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.memberId, memberId))
    .limit(1)
    .then((r) => r[0] ?? null);

  return { member, passes, passBalance, bookings, foodEntries, conversation };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalise(s: string | null | undefined) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(firstName: string | null, lastName: string | null) {
  const f = (firstName ?? "").charAt(0).toUpperCase();
  const l = (lastName ?? "").charAt(0).toUpperCase();
  return f + l || "?";
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosMemberProfile() {
  const data = useLoaderData<typeof loader>();
  const { member, passes, passBalance, bookings, foodEntries, conversation } =
    data;

  // Live-refresh: re-run the loader after an agent write (e.g. update-member),
  // so the profile card reflects the change without a manual reload (AEX-03).
  const revalidator = useRevalidator();
  const actionVersion = useChangeVersions(["action"]);
  useEffect(() => {
    if (actionVersion > 0) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionVersion]);

  const fullName =
    `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || "Unnamed";

  const now = new Date();
  const upcoming = bookings.filter(
    (b) => b.startsAt && new Date(b.startsAt) > now && b.status === "booked",
  );

  // First active pass: null or future expiresAt
  const activePass = passes.find(
    (p) => !p.expiresAt || new Date(p.expiresAt) > now,
  );

  // Collapsible state — pass breakdown + bookings show-all
  const [passesOpen, setPassesOpen] = useState(false);
  const [bookingsOpen, setBookingsOpen] = useState(false);

  // Bookings: first 5 visible, rest behind Collapsible
  const VISIBLE_COUNT = 5;
  const visibleBookings = bookings.slice(0, VISIBLE_COUNT);
  const hiddenBookings = bookings.slice(VISIBLE_COUNT);

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[960px] px-6 py-8 space-y-6">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div>
          <Link
            to="/gymos/members"
            className="text-[12px] text-muted-foreground hover:text-foreground transition"
          >
            ← All members
          </Link>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {/* Avatar with initials fallback */}
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarFallback className="bg-muted text-[14px] font-semibold text-muted-foreground">
                  {getInitials(member.firstName, member.lastName)}
                </AvatarFallback>
              </Avatar>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Member Profile
                </div>
                <h1 className="text-sm font-semibold">{fullName}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                  {member.phoneE164 && (
                    <span className="tabular-nums">{member.phoneE164}</span>
                  )}
                  {member.email && <span>{member.email}</span>}
                </div>
                {member.createdAt && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Member since {fmtDate(member.createdAt)}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {member.goal && (
                    <Badge variant="outline" className="capitalize text-[11px]">
                      Goal: {capitalise(member.goal)}
                    </Badge>
                  )}
                  {member.activityLevel && (
                    <Badge variant="outline" className="capitalize text-[11px]">
                      {capitalise(member.activityLevel)}
                    </Badge>
                  )}
                  {member.sex && (
                    <Badge variant="outline" className="capitalize text-[11px]">
                      {capitalise(member.sex)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Header actions: payment link (always shown) + WhatsApp pivot (when conversation exists) */}
            <div className="flex items-center gap-2">
              <CheckoutLinkButton memberId={member.id} memberName={fullName} />
              {/* Cross-surface deep-link to inbox — the differentiator pivot */}
              {conversation && (
                <Link to={`/gymos?conversation=${conversation.id}`}>
                  <Button size="sm" variant="outline">
                    Open WhatsApp conversation
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ─── Widget card row: Pass Balance + Next Class ─────────────── */}
        {/* TASK 1: Two side-by-side widget cards per R4-UI-SPEC §3 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Card A: PASS BALANCE */}
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              PASS BALANCE
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              {passBalance > 0 ? (
                <span className="text-xl font-bold text-primary tabular-nums">
                  {passBalance}
                </span>
              ) : (
                <span className="text-xl font-bold text-muted-foreground tabular-nums">
                  0
                </span>
              )}
              <span className="text-[12px] text-muted-foreground">credits</span>
            </div>
            {passBalance <= 0 && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                No active pass
              </div>
            )}
            {passBalance > 0 && activePass?.expiresAt && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Expires {fmtDate(activePass.expiresAt)}
              </div>
            )}

            {/* Progressive disclosure: pass breakdown list */}
            {passes.length > 0 && (
              <Collapsible open={passesOpen} onOpenChange={setPassesOpen}>
                <CollapsibleTrigger asChild>
                  <button className="mt-2 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition">
                    {passesOpen ? "Hide passes" : "Show passes"}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
                    {passes.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-[12px]"
                      >
                        <div>
                          <span className="font-semibold">
                            {p.productName ?? capitalise(p.source)}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            +{p.granted} credits
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.expiresAt
                            ? `expires ${fmtDate(p.expiresAt)}`
                            : "no expiry"}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </Card>

          {/* Card B: NEXT CLASS */}
          <Card className="p-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              NEXT CLASS
            </div>
            {upcoming[0] ? (
              <div className="mt-1.5">
                <div className="text-[13px] font-semibold">
                  {upcoming[0].className ?? "Class"}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {fmtDateTime(upcoming[0].startsAt)}
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-muted-foreground mt-1.5">
                No upcoming class
              </div>
            )}
          </Card>
        </div>

        {/* ─── Bookings timeline ──────────────────────────────────────── */}
        {/* TASK 2: Chronological card timeline with status badges + progressive disclosure */}
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            BOOKINGS
          </div>

          {bookings.length === 0 ? (
            <p className="text-[13px] text-muted-foreground text-center py-6">
              No bookings yet
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {/* First 5 always visible */}
              {visibleBookings.map((b) => (
                <li key={b.id}>
                  <Card className="flex items-center gap-3 p-2 border-border/40">
                    <span className="text-[12px] text-muted-foreground tabular-nums w-36 shrink-0">
                      {fmtDateTime(b.startsAt)}
                    </span>
                    <span className="text-[13px] font-semibold flex-1 truncate">
                      {b.className ?? "Class"}
                    </span>
                    {b.status === "booked" && (
                      <Badge variant="secondary">Booked</Badge>
                    )}
                    {b.status === "attended" && (
                      <Badge variant="outline">Attended</Badge>
                    )}
                    {b.status === "no_show" && (
                      // guard:allow-color — no_show semantic state, not a brand color
                      <Badge className="bg-destructive/10 text-destructive border-0">
                        No-show
                      </Badge>
                    )}
                    {b.status === "cancelled" && (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        Cancelled
                      </Badge>
                    )}
                    {/* Fallback for unexpected statuses */}
                    {!["booked", "attended", "no_show", "cancelled"].includes(
                      b.status,
                    ) && (
                      <Badge variant="outline" className="capitalize">
                        {b.status}
                      </Badge>
                    )}
                  </Card>
                </li>
              ))}

              {/* Remaining bookings behind Collapsible */}
              {hiddenBookings.length > 0 && (
                <Collapsible open={bookingsOpen} onOpenChange={setBookingsOpen}>
                  <CollapsibleContent>
                    <ul className="flex flex-col gap-1.5">
                      {hiddenBookings.map((b) => (
                        <li key={b.id}>
                          <Card className="flex items-center gap-3 p-2 border-border/40">
                            <span className="text-[12px] text-muted-foreground tabular-nums w-36 shrink-0">
                              {fmtDateTime(b.startsAt)}
                            </span>
                            <span className="text-[13px] font-semibold flex-1 truncate">
                              {b.className ?? "Class"}
                            </span>
                            {b.status === "booked" && (
                              <Badge variant="secondary">Booked</Badge>
                            )}
                            {b.status === "attended" && (
                              <Badge variant="outline">Attended</Badge>
                            )}
                            {b.status === "no_show" && (
                              // guard:allow-color — no_show semantic state, not a brand color
                              <Badge className="bg-destructive/10 text-destructive border-0">
                                No-show
                              </Badge>
                            )}
                            {b.status === "cancelled" && (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                              >
                                Cancelled
                              </Badge>
                            )}
                            {![
                              "booked",
                              "attended",
                              "no_show",
                              "cancelled",
                            ].includes(b.status) && (
                              <Badge variant="outline" className="capitalize">
                                {b.status}
                              </Badge>
                            )}
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                  <CollapsibleTrigger asChild>
                    <button className="mt-1.5 w-full text-[12px] text-muted-foreground hover:text-foreground transition text-center py-1.5 border border-border/40 rounded-md">
                      {bookingsOpen
                        ? "Show less"
                        : `Show all (${bookings.length} total)`}
                    </button>
                  </CollapsibleTrigger>
                </Collapsible>
              )}
            </ul>
          )}
        </div>

        {/* ─── Recent food ────────────────────────────────────────────── */}
        {/* Intentionally unchanged — out of SWEB-04 scope */}
        <Card>
          <div className="px-4 pt-4 pb-2">
            <div className="text-sm font-semibold">Recent food entries</div>
          </div>
          <CardContent>
            {foodEntries.length === 0 ? (
              <p className="text-[12px] text-muted-foreground italic">
                Nothing logged yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {foodEntries.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-3 text-[12px] rounded-md border border-border/30 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="capitalize text-[11px] text-muted-foreground">
                          {f.mealType}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          · {fmtDateTime(f.loggedAt)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.quantityG}g · {capitalise(f.source)}
                      </div>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className="font-semibold">
                        {Math.round(f.kcal)} kcal
                      </div>
                      {f.proteinG != null && (
                        <div className="text-[11px] text-muted-foreground">
                          {Math.round(f.proteinG)}g protein
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
