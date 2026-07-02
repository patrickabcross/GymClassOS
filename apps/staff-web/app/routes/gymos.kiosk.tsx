// RunStudio Kiosk — admin-gated tablet check-in surface (DE6-02).
//
// Operator logs in, opens /gymos/kiosk on a tablet at the front desk.
// The page shows:
//   • A class picker for today's scheduled occurrences (auto-selects the current class).
//   • A large, server-generated QR encoding `runstudio-checkin:<occurrenceId>` so
//     members can self-scan with the RunStudio mobile app.
//   • A tappable roster of booked members — admin taps a name to check them in
//     immediately (optimistic update + POST /api/m/admin/check-in).
//
// Gate: requireAdmin in the loader — throws 401/403 for non-admins.
// All gym-table queries carry `// guard:allow-unscoped — single-tenant gym tables`.
// There is NO new attendance write path — the tap-to-check-in POST calls the
// mark-booking-attended chokepoint through /api/m/admin/check-in.
import QRCode from "qrcode";
import { useState, useEffect } from "react";
import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import { eq, and, gte, lte, asc, inArray } from "drizzle-orm";
import { toast } from "sonner";
import {
  IconQrcode,
  IconCircleCheck,
  IconUser,
} from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { requireAdmin } from "../../server/lib/admin-session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LoaderFunctionArgs } from "react-router";

type OccurrenceOption = {
  id: string;
  startsAt: string;
  endsAt: string;
  className: string | null;
};

type RosterRow = {
  bookingId: string;
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
};

type LoaderData = {
  occurrences: OccurrenceOption[];
  selectedId: string | null;
  roster: RosterRow[];
  qrDataUrl: string | null;
};

export function meta() {
  return [{ title: "RunStudio — Kiosk" }];
}

export async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  await requireAdmin(request); // throws 401/403 for non-admins

  const url = new URL(request.url);
  const paramId = url.searchParams.get("occurrenceId");

  const db = getDb();
  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const twelveHoursAhead = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

  // Today's scheduled occurrences for the picker (within a 24h window)
  // guard:allow-unscoped — single-tenant gym tables
  const occurrences = await db
    .select({
      id: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      className: schema.classDefinitions.name,
    })
    .from(schema.classOccurrences)
    .leftJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .where(
      and(
        eq(schema.classOccurrences.status, "scheduled"),
        gte(schema.classOccurrences.startsAt, twelveHoursAgo),
        lte(schema.classOccurrences.startsAt, twelveHoursAhead),
      ),
    )
    .orderBy(asc(schema.classOccurrences.startsAt));

  // Select the occurrence: honour ?occurrenceId param, then auto-select current/next
  let selectedId: string | null = null;
  if (paramId && occurrences.some((o) => o.id === paramId)) {
    selectedId = paramId;
  } else {
    // Auto-select: first occurrence whose end+15min is still in the future
    const nowMs = now.getTime();
    const current = occurrences.find(
      (o) => Date.parse(o.endsAt) + 15 * 60_000 >= nowMs,
    );
    selectedId = current?.id ?? occurrences[occurrences.length - 1]?.id ?? null;
  }

  // Roster for the selected occurrence (no ownership gate — admin sees all)
  let roster: RosterRow[] = [];
  if (selectedId) {
    // guard:allow-unscoped — single-tenant gym tables
    roster = await db
      .select({
        bookingId: schema.bookings.id,
        memberId: schema.bookings.memberId,
        firstName: schema.gymMembers.firstName,
        lastName: schema.gymMembers.lastName,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .leftJoin(
        schema.gymMembers,
        eq(schema.bookings.memberId, schema.gymMembers.id),
      )
      .where(
        and(
          eq(schema.bookings.occurrenceId, selectedId),
          inArray(schema.bookings.status, ["booked", "attended"]),
        ),
      );
  }

  // Server-side QR generation (runstudio-checkin:<occurrenceId>)
  const qrDataUrl = selectedId
    ? await QRCode.toDataURL(`runstudio-checkin:${selectedId}`, {
        width: 512,
        margin: 2,
      })
    : null;

  return { occurrences, selectedId, roster, qrDataUrl };
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function memberName(row: RosterRow) {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : "Member";
}

export default function KioskPage() {
  const { occurrences, selectedId, roster, qrDataUrl } =
    useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  // Optimistic local set of bookingIds that have been checked in this session.
  // Merges with server-confirmed `status === "attended"` from the roster.
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());

  // Reset optimistic set when the selected occurrence changes.
  useEffect(() => {
    setCheckedIn(new Set());
  }, [selectedId]);

  function handleClassChange(value: string) {
    navigate(`/gymos/kiosk?occurrenceId=${encodeURIComponent(value)}`);
  }

  async function handleCheckIn(bookingId: string) {
    // Optimistic: mark immediately
    setCheckedIn((prev) => new Set([...prev, bookingId]));
    try {
      const res = await fetch("/api/m/admin/check-in", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Reconcile with server state
      revalidator.revalidate();
    } catch (err: any) {
      // Roll back optimistic entry
      setCheckedIn((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      toast.error(`Check-in failed: ${err.message ?? err}`);
    }
  }

  const selectedOcc = occurrences.find((o) => o.id === selectedId);

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      {/* ── Class picker ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <IconQrcode size={22} className="text-muted-foreground shrink-0" />
        <h1 className="text-xl font-semibold">Kiosk</h1>
        <div className="ml-auto w-72">
          <Select
            value={selectedId ?? ""}
            onValueChange={handleClassChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {occurrences.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {timeLabel(o.startsAt)} &middot; {o.className ?? "Class"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {occurrences.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No classes scheduled in the next 24 hours.
          </CardContent>
        </Card>
      )}

      {selectedId && (
        <div className="flex gap-6 flex-col lg:flex-row">
          {/* ── QR code ──────────────────────────────────────────── */}
          <Card className="flex flex-col items-center justify-center p-6 gap-4 lg:min-w-[320px]">
            {qrDataUrl ? (
              <>
                <img
                  src={qrDataUrl}
                  alt="Check-in QR"
                  className="w-64 h-64 rounded-lg"
                />
                <p className="text-sm text-muted-foreground text-center">
                  Scan with the RunStudio app to check in
                </p>
                {selectedOcc && (
                  <Badge variant="secondary" className="text-xs">
                    {timeLabel(selectedOcc.startsAt)} &middot;{" "}
                    {selectedOcc.className ?? "Class"}
                  </Badge>
                )}
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                No class selected
              </div>
            )}
          </Card>

          {/* ── Roster ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 flex-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Roster ({roster.length})
            </h2>
            {roster.length === 0 && (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground text-sm">
                  No one booked yet
                </CardContent>
              </Card>
            )}
            {roster.map((row) => {
              const attended =
                row.status === "attended" || checkedIn.has(row.bookingId);
              return (
                <Card
                  key={row.bookingId}
                  className="flex flex-row items-center px-4 min-h-[64px] gap-3"
                >
                  <IconUser
                    size={18}
                    className="text-muted-foreground shrink-0"
                  />
                  <span className="flex-1 text-lg font-medium">
                    {memberName(row)}
                  </span>
                  {attended ? (
                    <Badge
                      variant="secondary"
                      className="gap-1.5 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                    >
                      <IconCircleCheck size={14} />
                      Checked in
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleCheckIn(row.bookingId)}
                      disabled={revalidator.state === "loading"}
                    >
                      Check in
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
