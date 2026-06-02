// GymClassOS Members — Demo Sprint D1. Directory of seeded gym members with pass-balance summary. Standalone for demo; will move to apps/staff-web/features/members/ post-demo.

import { useLoaderData, Link } from "react-router";
import { useState, useMemo } from "react";
import { eq, asc, sql } from "drizzle-orm";
import { format } from "date-fns";
import { IconSearch } from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

  return { members, balances };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalise(s: string | null | undefined) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy");
}

const GRID = "grid-cols-[2fr_1.3fr_1.1fr_1.1fr_0.9fr]";

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosMembers() {
  const data = useLoaderData<typeof loader>();
  const [query, setQuery] = useState("");

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
              All gym members and leads. Click a row to open profile.
            </p>
          </div>
          <Link
            to="/gymos"
            className="text-[12px] text-muted-foreground hover:text-foreground transition shrink-0"
          >
            ← Back to inbox
          </Link>
        </header>

        {/* Search */}
        <div className="relative mb-4 max-w-sm">
          <IconSearch
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or phone…"
            className="h-9 pl-8 text-[13px]"
          />
        </div>

        {/* Directory list */}
        <div className="rounded-lg border border-border/60 bg-card/30 overflow-hidden">
          {/* Column header row */}
          <div
            className={cn(
              "grid gap-4 px-4 py-2.5 border-b border-border/60 bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground",
              GRID,
            )}
          >
            <span>Name</span>
            <span>Phone</span>
            <span>Lead received</span>
            <span>First purchase</span>
            <span className="text-right">Pass balance</span>
          </div>

          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              {data.members.length === 0
                ? "No members yet — leads from your forms will appear here."
                : "No members match your search."}
            </div>
          )}

          {filtered.map((m) => {
            const name =
              `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || "Unnamed";
            const balance = data.balances[m.id] ?? 0;
            return (
              <Link
                key={m.id}
                to={`/gymos/members/${m.id}`}
                className={cn(
                  "grid gap-4 px-4 py-3 border-b border-border/30 last:border-b-0",
                  "items-center text-[13px] hover:bg-accent/40 transition",
                  GRID,
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold truncate">{name}</span>
                  {m.email && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {m.email}
                    </span>
                  )}
                  {m.goal && (
                    <span className="text-[11px] text-muted-foreground/70 capitalize">
                      {capitalise(m.goal)}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {m.phoneE164 ?? "—"}
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {fmtDate(m.createdAt)}
                </div>
                <div className="tabular-nums">
                  {m.firstPurchaseAt ? (
                    <span className="text-muted-foreground">
                      {fmtDate(m.firstPurchaseAt)}
                    </span>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-normal"
                    >
                      Lead
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <Badge
                    variant={balance > 0 ? "default" : "outline"}
                    className="tabular-nums text-[11px]"
                  >
                    {balance} credits
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
