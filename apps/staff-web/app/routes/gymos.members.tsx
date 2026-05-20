// GymOS Members — Demo Sprint D1. Directory of seeded gym members with pass-balance summary. Standalone for demo; will move to apps/staff-web/features/members/ post-demo.

import { useLoaderData, Link } from "react-router";
import { eq, asc, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymOS — Members" }];
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

  const members = memberPassRows.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phoneE164: m.phoneE164,
    goal: m.goal,
    activityLevel: m.activityLevel,
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

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosMembers() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[1024px] px-6 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
              <Badge variant="outline" className="text-[11px]">
                {data.members.length}
              </Badge>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              All gym members. Click a row to open profile.
            </p>
          </div>
          <Link
            to="/gymos"
            className="text-[12px] text-muted-foreground hover:text-foreground transition"
          >
            ← Back to inbox
          </Link>
        </header>

        {/* Directory list */}
        <div className="rounded-lg border border-border/60 bg-card/30 overflow-hidden">
          {/* Column header row */}
          <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr] gap-4 px-4 py-2.5 border-b border-border/60 bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span>Phone</span>
            <span>Goal</span>
            <span className="text-right">Pass balance</span>
          </div>

          {data.members.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              No members yet — seed gym_members in Neon to populate.
            </div>
          )}

          {data.members.map((m) => {
            const name =
              `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || "Unnamed";
            const balance = data.balances[m.id] ?? 0;
            return (
              <Link
                key={m.id}
                to={`/gymos/members/${m.id}`}
                className={cn(
                  "grid grid-cols-[2fr_1.5fr_1.5fr_1fr] gap-4 px-4 py-3 border-b border-border/30 last:border-b-0",
                  "items-center text-[13px] hover:bg-accent/40 transition",
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{name}</span>
                  {m.email && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {m.email}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {m.phoneE164 ?? "—"}
                </div>
                <div className="text-muted-foreground capitalize">
                  {capitalise(m.goal)}
                  {m.activityLevel && (
                    <span className="text-[11px] text-muted-foreground/70 block">
                      {capitalise(m.activityLevel)}
                    </span>
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

        {/* Demo-grade limits footer */}
        <p className="mt-4 text-[11px] text-muted-foreground">
          Demo-grade: no pagination, no search, no edit (MEM-03 / MEM-05 in
          Production v1).
        </p>
      </div>
    </div>
  );
}
