// GymOS Member Profile — Demo Sprint D1. Per-member detail: pass balance, bookings, recent food, deep-link to WhatsApp conversation.
//
// URL: /gymos/members/:id (dollar-prefix file convention = dynamic segment,
// matches the existing $view.$threadId.tsx route in this directory).
//
// The "Open WhatsApp conversation" button is the key cross-surface link —
// closes the inbox ↔ profile loop so coaches can pivot between the contact's
// chat history and their gym record in one click.

import { useLoaderData, Link } from "react-router";
import { eq, desc, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymOS — Member Profile" }];
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

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "attended") return "default";
  if (status === "booked") return "secondary";
  if (status === "cancelled" || status === "no_show") return "destructive";
  return "outline";
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosMemberProfile() {
  const data = useLoaderData<typeof loader>();
  const { member, passes, passBalance, bookings, foodEntries, conversation } =
    data;

  const fullName =
    `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || "Unnamed";

  const now = new Date();
  const upcoming = bookings.filter(
    (b) => b.startsAt && new Date(b.startsAt) > now && b.status === "booked",
  );
  const past = bookings.filter(
    (b) => !b.startsAt || new Date(b.startsAt) <= now || b.status !== "booked",
  );

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
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
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {fullName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
                {member.phoneE164 && (
                  <span className="tabular-nums">{member.phoneE164}</span>
                )}
                {member.email && <span>{member.email}</span>}
              </div>
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

            {/* Cross-surface deep-link to inbox — the differentiator pivot */}
            {conversation && (
              <Link to={`/gymos?conversation=${conversation.id}`}>
                <Button size="sm">Open WhatsApp conversation</Button>
              </Link>
            )}
          </div>
        </div>

        {/* ─── Pass balance ───────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pass balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-3xl font-semibold tabular-nums">
                {passBalance}
                <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                  credits
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Grant total − debits ledger
              </div>
            </div>
            {passes.length > 0 ? (
              <div className="space-y-1.5 border-t border-border/40 pt-3">
                {passes.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <div>
                      <span className="font-medium">
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
            ) : (
              <p className="text-[12px] text-muted-foreground italic">
                No passes on file.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ─── Bookings ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bookings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upcoming */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                Upcoming
              </div>
              {upcoming.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic">
                  No upcoming classes booked.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {upcoming.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 text-[12px] rounded-md border border-border/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {b.className ?? "Class"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtDateTime(b.startsAt)}
                        </div>
                      </div>
                      <Badge
                        variant={statusVariant(b.status)}
                        className="capitalize text-[10px]"
                      >
                        {b.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Past */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                Past
              </div>
              {past.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic">
                  No past bookings.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {past.map((b) => (
                    <div
                      key={b.id}
                      className={cn(
                        "flex items-center justify-between gap-3 text-[12px] rounded-md border border-border/30 px-3 py-2",
                        b.status === "cancelled" || b.status === "no_show"
                          ? "opacity-60"
                          : "",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {b.className ?? "Class"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtDateTime(b.startsAt)}
                        </div>
                      </div>
                      <Badge
                        variant={statusVariant(b.status)}
                        className="capitalize text-[10px]"
                      >
                        {b.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ─── Recent food ────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent food entries</CardTitle>
          </CardHeader>
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
                      <div className="font-medium">
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
            <p className="mt-3 text-[10px] text-muted-foreground">
              Demo-grade: shows the snapshotted kcal/protein from food_entries.
              Production v1 joins food_items for richer descriptions + macros.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
