// GymClassOS Members — R4-03: card-default directory with Tabs card/table toggle, avatars, membership badges, search.

import { useLoaderData, Link, useSearchParams } from "react-router";
import { useState, useMemo } from "react";
import { eq, asc, sql } from "drizzle-orm";
import { format } from "date-fns";
import {
  IconSearch,
  IconUsers,
  IconLayoutGrid,
  IconTable,
} from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymClassOS — Members" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const db = getDb();

  // All members joined to their passes (left so members without passes still
  // appear). Then SUM(passes.granted) gives the granted total per member in
  // one query. We deliberately do NOT chain a second leftJoin to passDebits
  // here — that fan-outs the rows (one row per (pass, debit) combo) which
  // would double-count granted. Debits are aggregated separately below and
  // subtracted in application code.
  const memberPassRows = await db
    .select({
      id: schema.gymMembers.id,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
      email: schema.gymMembers.email,
      phoneE164: schema.gymMembers.phoneE164,
      goal: schema.gymMembers.goal,
      activityLevel: schema.gymMembers.activityLevel,
      createdAt: schema.gymMembers.createdAt,
      granted: sql<number>`COALESCE(SUM(${schema.passes.granted}), 0)`,
    })
    .from(schema.gymMembers)
    .leftJoin(schema.passes, eq(schema.passes.memberId, schema.gymMembers.id))
    .groupBy(
      schema.gymMembers.id,
      schema.gymMembers.firstName,
      schema.gymMembers.lastName,
      schema.gymMembers.email,
      schema.gymMembers.phoneE164,
      schema.gymMembers.goal,
      schema.gymMembers.activityLevel,
      schema.gymMembers.createdAt,
    )
    .orderBy(asc(schema.gymMembers.firstName));

  // Debits per member — joined back through passes to get the member_id.
  const debitTotals = await db
    .select({
      memberId: schema.passes.memberId,
      debited: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)`,
    })
    .from(schema.passDebits)
    .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
    .groupBy(schema.passes.memberId);

  const debitsByMember: Record<string, number> = {};
  for (const r of debitTotals) {
    if (r.memberId) debitsByMember[r.memberId] = Number(r.debited);
  }

  // First purchase = earliest "money in" signal per member: the first recorded
  // payment (occurred_at) or the first granted pass (created_at). Members with
  // neither are still leads (no purchase yet).
  const firstPaymentRows = await db
    .select({
      memberId: schema.payments.memberId,
      first: sql<string | null>`MIN(${schema.payments.occurredAt})`,
    })
    .from(schema.payments)
    .groupBy(schema.payments.memberId);
  const firstPassRows = await db
    .select({
      memberId: schema.passes.memberId,
      first: sql<string | null>`MIN(${schema.passes.createdAt})`,
    })
    .from(schema.passes)
    .groupBy(schema.passes.memberId);

  const firstPurchaseByMember: Record<string, string> = {};
  function consider(memberId: string | null, ts: string | null) {
    if (!memberId || !ts) return;
    const cur = firstPurchaseByMember[memberId];
    if (!cur || ts < cur) firstPurchaseByMember[memberId] = ts;
  }
  for (const r of firstPaymentRows) consider(r.memberId, r.first);
  for (const r of firstPassRows) consider(r.memberId, r.first);

  const members = memberPassRows.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phoneE164: m.phoneE164,
    goal: m.goal,
    activityLevel: m.activityLevel,
    createdAt: m.createdAt,
    firstPurchaseAt: firstPurchaseByMember[m.id] ?? null,
  }));

  const balances: Record<string, number> = {};
  for (const m of memberPassRows) {
    balances[m.id] = Number(m.granted) - (debitsByMember[m.id] ?? 0);
  }

  // Next upcoming class per member — additive query, does not affect members/balances.
  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
  const nowIso = new Date().toISOString();
  const nextClassRows = await db
    .select({
      memberId: schema.bookings.memberId,
      className: schema.classDefinitions.name,
      startsAt: schema.classOccurrences.startsAt,
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
    .where(
      sql`${schema.bookings.status} = 'booked' AND ${schema.classOccurrences.startsAt} > ${nowIso}`,
    )
    .orderBy(asc(schema.classOccurrences.startsAt));

  // Keep only the earliest upcoming class per member.
  const nextClassByMember: Record<
    string,
    { className: string | null; startsAt: string }
  > = {};
  for (const row of nextClassRows) {
    if (!row.memberId) continue;
    if (!nextClassByMember[row.memberId]) {
      nextClassByMember[row.memberId] = {
        className: row.className ?? null,
        startsAt: row.startsAt ?? "",
      };
    }
  }

  return { members, balances, nextClassByMember };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy");
}

function fmtShortDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return format(d, "EEE d MMM · HH:mm");
}

function initials(firstName: string | null, lastName: string | null) {
  return `${(firstName ?? "").charAt(0)}${(lastName ?? "").charAt(0)}`
    .toUpperCase()
    .trim();
}

/** Determine membership status badge for a member. Order: Expiring → Active → No Pass → Lead */
function membershipStatus(balance: number, firstPurchaseAt: string | null) {
  if (balance > 0 && balance < 3) return "expiring" as const;
  if (balance > 0) return "active" as const;
  if (firstPurchaseAt) return "no-pass" as const;
  return "lead" as const;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosMembers() {
  const data = useLoaderData<typeof loader>();
  const [query, setQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-state-driven view toggle: no ?view param = cards (default), ?view=table = table.
  const view = searchParams.get("view") === "table" ? "table" : "cards";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.members;
    return data.members.filter((m) => {
      const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase();
      return (
        name.includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.phoneE164 ?? "").toLowerCase().includes(q)
      );
    });
  }, [data.members, query]);

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold">Members</h1>
              <Badge variant="outline" className="text-[11px]">
                {filtered.length}
                {query.trim() && filtered.length !== data.members.length
                  ? ` / ${data.members.length}`
                  : ""}
              </Badge>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              All gym members and leads. Click a card to open profile.
            </p>
          </div>
          <Link
            to="/gymos"
            className="text-[12px] text-muted-foreground hover:text-foreground transition shrink-0"
          >
            ← Home
          </Link>
        </header>

        {/* Search — above the tabs per spec */}
        <div className="relative mb-4 max-w-sm">
          <IconSearch
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members..."
            className="h-9 pl-8 text-[13px]"
          />
        </div>

        {/* Card / Table toggle via shadcn Tabs with ?view URL param */}
        <Tabs
          value={view}
          onValueChange={(v) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (v === "table") {
                next.set("view", "table");
              } else {
                next.delete("view");
              }
              return next;
            });
          }}
        >
          <TabsList className="bg-muted rounded-md p-0.5 mb-4">
            <TabsTrigger
              value="cards"
              className="flex items-center gap-1.5 text-[12px]"
            >
              <IconLayoutGrid size={14} aria-hidden /> Cards
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="flex items-center gap-1.5 text-[12px]"
            >
              <IconTable size={14} aria-hidden /> Table
            </TabsTrigger>
          </TabsList>

          {/* ── Card view (default) ─────────────────────────────────────────── */}
          <TabsContent value="cards">
            {filtered.length === 0 ? (
              <EmptyState
                isEmpty={data.members.length === 0}
                hasQuery={!!query.trim()}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((m) => {
                  const name =
                    `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() ||
                    "Unnamed";
                  const balance = data.balances[m.id] ?? 0;
                  const status = membershipStatus(balance, m.firstPurchaseAt);
                  const nextClass = data.nextClassByMember[m.id];

                  return (
                    <Link
                      key={m.id}
                      to={`/gymos/members/${m.id}`}
                      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                    >
                      <Card className="p-4 hover:shadow-sm transition cursor-pointer h-full">
                        {/* Avatar + name row */}
                        <div className="flex items-center gap-3 mb-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarFallback className="text-[13px] font-semibold bg-muted text-muted-foreground">
                              {initials(m.firstName, m.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {name}
                            </p>
                            <MembershipBadge status={status} />
                          </div>
                        </div>

                        {/* Next class */}
                        {nextClass?.className && (
                          <p className="text-[12px] text-muted-foreground truncate">
                            Next class:{" "}
                            <span className="font-medium">
                              {nextClass.className}
                            </span>
                            {nextClass.startsAt
                              ? ` · ${fmtShortDateTime(nextClass.startsAt)}`
                              : ""}
                          </p>
                        )}

                        {/* Pass balance */}
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          Pass balance:{" "}
                          <span className="font-medium tabular-nums">
                            {balance} credits
                          </span>
                        </p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Table view (secondary) ──────────────────────────────────────── */}
          <TabsContent value="table">
            {filtered.length === 0 ? (
              <EmptyState
                isEmpty={data.members.length === 0}
                hasQuery={!!query.trim()}
              />
            ) : (
              <div className="rounded-lg border border-border/60 bg-card/30 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                        Name
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                        Pass Balance
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                        Next Class
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                        Member Since
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => {
                      const name =
                        `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() ||
                        "Unnamed";
                      const balance = data.balances[m.id] ?? 0;
                      const nextClass = data.nextClassByMember[m.id];

                      return (
                        <tr
                          key={m.id}
                          className="border-b border-border/30 last:border-b-0 hover:bg-accent/40 transition"
                          style={{ minHeight: "40px" }}
                        >
                          <td
                            className="px-4 py-2.5"
                            style={{ minHeight: "40px" }}
                          >
                            <Link
                              to={`/gymos/members/${m.id}`}
                              className="block font-semibold text-foreground hover:underline"
                            >
                              {name}
                            </Link>
                            {m.email && (
                              <span className="text-[11px] text-muted-foreground">
                                {m.email}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                            {balance} credits
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {nextClass?.className ? (
                              <>
                                <span className="font-medium text-foreground">
                                  {nextClass.className}
                                </span>
                                {nextClass.startsAt && (
                                  <span className="block text-[11px] tabular-nums">
                                    {fmtShortDateTime(nextClass.startsAt)}
                                  </span>
                                )}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                            {fmtDate(m.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MembershipBadge({
  status,
}: {
  status: "active" | "expiring" | "no-pass" | "lead";
}) {
  if (status === "expiring") {
    return (
      <Badge
        variant="secondary"
        className={cn(
          "mt-1 text-[10px]",
          // guard:allow-color — expiring amber semantic, not a brand color
          "text-amber-700",
        )}
      >
        Expiring
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge variant="default" className="mt-1 text-[10px]">
        Active
      </Badge>
    );
  }
  if (status === "no-pass") {
    return (
      <Badge variant="outline" className="mt-1 text-[10px]">
        No Pass
      </Badge>
    );
  }
  // lead
  return (
    <Badge variant="secondary" className="mt-1 text-[10px]">
      Lead
    </Badge>
  );
}

function EmptyState({
  isEmpty,
  hasQuery,
}: {
  isEmpty: boolean;
  hasQuery: boolean;
}) {
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <IconUsers size={28} className="text-muted-foreground" aria-hidden />
        <p className="text-[13px] font-semibold text-foreground">
          No members yet
        </p>
        <p className="text-[12px] text-muted-foreground max-w-xs">
          Members appear here when they join or enquire.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <IconSearch size={28} className="text-muted-foreground" aria-hidden />
      <p className="text-[13px] font-semibold text-foreground">
        No members found
      </p>
      <p className="text-[12px] text-muted-foreground max-w-xs">
        Try a different name or phone number.
      </p>
    </div>
  );
}
