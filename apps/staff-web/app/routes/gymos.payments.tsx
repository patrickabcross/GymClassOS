// GymClassOS Payments — real page (replaces the Coming Soon stub).
// Shows the 100 most-recent Stripe payments with the member who paid.

import { useLoaderData, Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { IconReceiptPound } from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LoaderFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymClassOS — Payments" }];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: (currency || "GBP").toUpperCase(),
    }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return format(d, "d MMM yyyy, HH:mm");
  } catch {
    return "—";
  }
}

type StatusStyle = { className: string; label: string };

function statusStyle(
  status: "succeeded" | "failed" | "refunded" | "pending" | string,
): StatusStyle {
  switch (status) {
    case "succeeded":
      return {
        className: "text-green-600 border-green-600/30",
        label: "Succeeded",
      };
    case "refunded":
      return {
        className: "text-amber-600 border-amber-600/30",
        label: "Refunded",
      };
    case "failed":
      return { className: "text-red-600 border-red-600/30", label: "Failed" };
    case "pending":
    default:
      return {
        className: "text-muted-foreground border-border",
        label: status
          ? status.charAt(0).toUpperCase() + status.slice(1)
          : "Unknown",
      };
  }
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const db = getDb();

  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns) per
  // P1b.1-RESEARCH.md §6 "no unscoped queries" exemption.
  const rows = await db
    .select({
      id: schema.payments.id,
      memberId: schema.payments.memberId,
      amountMinorUnits: schema.payments.amountMinorUnits,
      currency: schema.payments.currency,
      status: schema.payments.status,
      occurredAt: schema.payments.occurredAt,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
      phoneE164: schema.gymMembers.phoneE164,
    })
    .from(schema.payments)
    .leftJoin(
      schema.gymMembers,
      eq(schema.gymMembers.id, schema.payments.memberId),
    )
    .orderBy(desc(schema.payments.occurredAt))
    .limit(100);

  const payments = rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    amountMinorUnits: Number(r.amountMinorUnits),
    currency: r.currency,
    status: r.status,
    occurredAt: r.occurredAt,
    memberName:
      [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || null,
    memberPhone: r.phoneE164 ?? null,
  }));

  return { payments };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosPayments() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[900px] px-6 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold">Payments</h1>
              <Badge variant="outline" className="text-[11px]">
                {data.payments.length}
              </Badge>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Recent Stripe payments recorded via webhook.
            </p>
          </div>
          <Link
            to="/gymos"
            className="text-[12px] text-muted-foreground hover:text-foreground transition shrink-0"
          >
            ← Back to inbox
          </Link>
        </header>

        {/* Empty state */}
        {data.payments.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card/30 p-10 flex flex-col items-center gap-3 text-center">
            <IconReceiptPound
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden
            />
            <p className="text-[13px] text-muted-foreground">
              No payments yet — they'll appear here as members pay
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-card/30 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground w-[170px]">
                    Date
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Member
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground text-right w-[110px]">
                    Amount
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground w-[110px]">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => {
                  const style = statusStyle(p.status);
                  const memberDisplay = p.memberName || p.memberPhone || "—";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-[13px] tabular-nums text-muted-foreground">
                        {fmtDate(p.occurredAt)}
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {memberDisplay}
                      </TableCell>
                      <TableCell className="text-[13px] tabular-nums text-right font-medium">
                        {formatAmount(p.amountMinorUnits, p.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-normal ${style.className}`}
                        >
                          {style.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
