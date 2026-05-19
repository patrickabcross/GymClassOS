// GymOS WhatsApp Inbox — Demo Sprint D1.
// Self-contained route that bypasses Mail's email-specific layout to render
// our conversations + messages + member context panel.
//
// Lives at /gymos (?conversation=conv_01 to select). Standalone for the demo;
// will be refactored into apps/staff-web/features/inbox/ post-demo per the
// agent-native fork boundary (PROJECT.md).
//
// Requirements covered (Demo Sprint D1):
// - INBX-01 conversation list sorted by last-activity (left rail)
// - INBX-02 open thread + message history with status text (centre)
// - INBX-03 send free-text within 24h window (demo: persists to DB, no Meta send)
// - INBX-06 member context panel — pass balance, next class, lifetime bookings,
//   today's nutrition, goal (right rail) — DIFFERENTIATOR
// - INBX-07 demo interpretation: top-nav strip ties inbox + schedule + members
//   + payments into one cohesive staff surface (production fork-boundary
//   relocation to apps/staff-web/features/inbox/ deferred per STATE.md)

import {
  useSearchParams,
  useLoaderData,
  Form,
  redirect,
  Link,
  useLocation,
} from "react-router";
import { useState } from "react";
import { eq, desc, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymOS — WhatsApp Inbox" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const selectedId = url.searchParams.get("conversation");
  const db = getDb();

  // List of conversations + the member each one is with
  const conversationsRows = await db
    .select({
      id: schema.conversations.id,
      memberId: schema.conversations.memberId,
      status: schema.conversations.status,
      unreadCount: schema.conversations.unreadCount,
      lastInboundAt: schema.conversations.lastInboundAt,
      lastOutboundAt: schema.conversations.lastOutboundAt,
      lastMessagePreview: schema.conversations.lastMessagePreview,
      updatedAt: schema.conversations.updatedAt,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
      phoneE164: schema.gymMembers.phoneE164,
    })
    .from(schema.conversations)
    .leftJoin(
      schema.gymMembers,
      eq(schema.conversations.memberId, schema.gymMembers.id),
    )
    .orderBy(desc(schema.conversations.updatedAt));

  let selectedConversation = null;
  let selectedMessages: any[] = [];
  let selectedMember: any = null;
  let memberStats: any = null;
  let upcomingBooking: any = null;

  if (selectedId) {
    selectedConversation = conversationsRows.find((c) => c.id === selectedId);

    if (selectedConversation) {
      selectedMessages = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, selectedId))
        .orderBy(schema.messages.createdAt);

      selectedMember = await db
        .select()
        .from(schema.gymMembers)
        .where(eq(schema.gymMembers.id, selectedConversation.memberId))
        .limit(1)
        .then((r) => r[0] ?? null);

      // Member context: pass balance + upcoming bookings
      const passes = await db
        .select()
        .from(schema.passes)
        .where(eq(schema.passes.memberId, selectedConversation.memberId));

      const debitsTotal = await db
        .select({
          sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)`,
        })
        .from(schema.passDebits)
        .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
        .where(eq(schema.passes.memberId, selectedConversation.memberId))
        .then((r) => Number(r[0]?.sum ?? 0));

      const grantedTotal = passes.reduce((s, p) => s + p.granted, 0);
      const balance = grantedTotal - debitsTotal;
      const activePass = passes.find((p) => {
        if (!p.expiresAt) return true;
        return new Date(p.expiresAt) > new Date();
      });

      const bookings = await db
        .select({
          id: schema.bookings.id,
          status: schema.bookings.status,
          startsAt: schema.classOccurrences.startsAt,
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
        .where(eq(schema.bookings.memberId, selectedConversation.memberId))
        .orderBy(schema.classOccurrences.startsAt);

      const now = new Date();
      upcomingBooking = bookings.find(
        (b) =>
          b.startsAt && new Date(b.startsAt) > now && b.status === "booked",
      );

      const lifetimeBookings = bookings.filter(
        (b) => b.status === "attended" || b.status === "booked",
      ).length;

      // Recent food entries (today)
      const today = new Date().toISOString().slice(0, 10);
      const todaysFood = await db
        .select({
          kcal: sql<number>`COALESCE(SUM(${schema.foodEntries.kcal}), 0)`,
          protein: sql<number>`COALESCE(SUM(${schema.foodEntries.proteinG}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.foodEntries)
        .where(
          sql`${schema.foodEntries.memberId} = ${selectedConversation.memberId} AND ${schema.foodEntries.loggedAt} LIKE ${today + "%"}`,
        )
        .then((r) => r[0] ?? { kcal: 0, protein: 0, count: 0 });

      memberStats = {
        passBalance: balance,
        passProduct: activePass?.productName ?? "No active pass",
        passExpiresAt: activePass?.expiresAt ?? null,
        lifetimeBookings,
        todayKcal: Number(todaysFood.kcal),
        todayProtein: Number(todaysFood.protein),
        todayFoodCount: Number(todaysFood.count),
      };
    }
  }

  return {
    conversations: conversationsRows,
    selectedConversation,
    selectedMessages,
    selectedMember,
    memberStats,
    upcomingBooking,
  };
}

// ─── Action: send outbound message ───────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || !body) {
    return { error: "Missing conversation or body" };
  }
  const db = getDb();
  const id = `msg_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // Demo: insert message with status='sent' immediately. Real path will go
  // through pg-boss → worker → Meta. We're stubbing Meta for the demo.
  await db.insert(schema.messages).values({
    id,
    conversationId,
    direction: "out",
    messageType: "text",
    body,
    status: "sent",
    createdAt: now,
    sentAt: now,
  });

  // Update conversation last_outbound + preview + updated_at
  await db
    .update(schema.conversations)
    .set({
      lastOutboundAt: now,
      lastMessagePreview: body,
      updatedAt: now,
    })
    .where(eq(schema.conversations.id, conversationId));

  return redirect(`/gymos?conversation=${conversationId}&sent=1`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = (now - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function windowState(lastInbound: string | null) {
  if (!lastInbound) return { ok: false, label: "No inbound yet" };
  const since = (Date.now() - new Date(lastInbound).getTime()) / 1000 / 3600;
  if (since > 24) {
    return {
      ok: false,
      label: `Out of window (${Math.floor(since)}h ago) — template only`,
    };
  }
  const remaining = 24 - since;
  return {
    ok: true,
    label: `In window — ${remaining.toFixed(1)}h left`,
  };
}

// ─── Top-nav strip (INBX-07 demo cohesion) ───────────────────────────────────
// Visual unifier that ties the four demo surfaces (Inbox / Schedule / Members /
// Payments) into one back-office product. Each tab links via React Router
// <Link> elements; the active tab is highlighted from useLocation().pathname.

function GymosTopNav() {
  const location = useLocation();
  const path = location.pathname;
  const tabClass = (active: boolean) =>
    cn(
      "px-2.5 py-1 rounded text-[12px] transition",
      active
        ? "bg-accent text-foreground font-medium"
        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
    );
  const isInbox = path === "/gymos";
  const isSchedule = path.startsWith("/gymos/schedule");
  const isMembers = path.startsWith("/gymos/members");
  const isPayments = path.startsWith("/gymos/payments");
  return (
    <nav className="flex items-center gap-1 px-4 h-11 border-b border-border/50 bg-card/40 shrink-0">
      <span className="text-[12px] font-semibold mr-3">GymOS</span>
      <Link to="/gymos" className={tabClass(isInbox)}>
        Inbox
      </Link>
      <Link to="/gymos/schedule" className={tabClass(isSchedule)}>
        Schedule
      </Link>
      <Link to="/gymos/members" className={tabClass(isMembers)}>
        Members
      </Link>
      <Link to="/gymos/payments" className={tabClass(isPayments)}>
        Payments
      </Link>
      <span className="ml-auto text-[10px] text-muted-foreground">
        Demo Sprint D1
      </span>
    </nav>
  );
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosInbox() {
  const data = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const selectedId = params.get("conversation");
  const [reply, setReply] = useState("");

  const ws = data.selectedConversation
    ? windowState(data.selectedConversation.lastInboundAt)
    : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground">
      <GymosTopNav />
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Conversation list (left rail) ──────────────────────────────── */}
        <aside className="w-[320px] shrink-0 border-r border-border/50 flex flex-col bg-card/30">
          <header className="px-4 py-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-semibold">WhatsApp Inbox</h1>
              <Badge variant="outline" className="text-[10px] h-5">
                {data.conversations.length}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              All member conversations
            </p>
          </header>
          <div className="flex-1 overflow-y-auto">
            {data.conversations.map((c) => {
              const isSelected = c.id === selectedId;
              const name =
                `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Unknown";
              return (
                <a
                  key={c.id}
                  href={`/gymos?conversation=${c.id}`}
                  className={cn(
                    "block px-4 py-3 border-b border-border/30 hover:bg-accent/40 transition",
                    isSelected && "bg-accent/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13px] font-medium truncate">
                      {name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.unreadCount > 0 && (
                        <span className="text-[10px] bg-primary text-primary-foreground rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                          {c.unreadCount}
                        </span>
                      )}
                      <time className="text-[10px] text-muted-foreground">
                        {relativeTime(c.updatedAt)}
                      </time>
                    </div>
                  </div>
                  <p className="text-[12px] text-muted-foreground line-clamp-2">
                    {c.lastMessagePreview ?? "No messages yet"}
                  </p>
                </a>
              );
            })}
          </div>
        </aside>

        {/* ─── Message thread (center) ────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!data.selectedConversation ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a conversation to start
            </div>
          ) : (
            <>
              <header className="px-5 py-3 border-b border-border/50 flex items-center justify-between bg-card/40">
                <div>
                  <h2 className="text-[14px] font-semibold">
                    {data.selectedMember?.firstName}{" "}
                    {data.selectedMember?.lastName}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {data.selectedMember?.phoneE164}
                  </p>
                </div>
                {ws && (
                  <span
                    className={cn(
                      "text-[10px] font-medium px-2 py-1 rounded",
                      ws.ok
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {ws.label}
                  </span>
                )}
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {data.selectedMessages.map((m: any) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col max-w-[75%]",
                      m.direction === "out"
                        ? "ml-auto items-end"
                        : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                        m.direction === "out"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/70",
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                      {relativeTime(m.createdAt)}
                      {m.direction === "out" && ` · ${m.status}`}
                    </span>
                  </div>
                ))}
              </div>

              {params.get("sent") === "1" && (
                <div className="px-5 py-2 bg-emerald-500/10 border-t border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
                  Sent (demo) — message persisted to DB. Production sends would
                  go through pg-boss → worker → Meta API with 24h-window +
                  opt-in checks.
                </div>
              )}

              <Form
                method="post"
                className="border-t border-border/50 px-5 py-3 bg-card/30"
              >
                <input
                  type="hidden"
                  name="conversationId"
                  value={data.selectedConversation.id}
                />
                <div className="flex gap-2">
                  <Input
                    name="body"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={
                      ws?.ok
                        ? "Type a reply..."
                        : "Out of 24h window — template send required (not in demo)"
                    }
                    disabled={!ws?.ok}
                    className="text-[13px]"
                  />
                  <Button type="submit" disabled={!ws?.ok || !reply.trim()}>
                    Send
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Demo: messages persist to DB but don't actually call Meta.
                  Production sends go through pg-boss → worker → Meta API with
                  opt-in + window enforcement at the sender layer.
                </p>
              </Form>
            </>
          )}
        </main>

        {/* ─── Member context panel (right rail) — DIFFERENTIATOR ──────────── */}
        {data.selectedMember && data.memberStats && (
          <aside className="w-[300px] shrink-0 border-l border-border/50 flex flex-col bg-card/20 overflow-y-auto">
            <header className="px-4 py-3 border-b border-border/50">
              <h3 className="text-sm font-semibold">Member context</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Why GymOS &gt; Mindbody — this panel
              </p>
            </header>
            <div className="px-4 py-3 space-y-4 text-[12px]">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Pass balance
                </div>
                <div className="text-[15px] font-semibold tabular-nums">
                  {data.memberStats.passBalance}{" "}
                  <span className="text-[10px] text-muted-foreground font-normal">
                    credits
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {data.memberStats.passProduct}
                  {data.memberStats.passExpiresAt && (
                    <>
                      {" "}
                      · expires{" "}
                      {new Date(
                        data.memberStats.passExpiresAt,
                      ).toLocaleDateString()}
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Next class
                </div>
                {data.upcomingBooking ? (
                  <div>
                    <div className="text-[13px] font-medium">
                      {data.upcomingBooking.className}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(data.upcomingBooking.startsAt).toLocaleString(
                        "en-GB",
                        {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-muted-foreground italic">
                    No upcoming class
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Lifetime bookings
                </div>
                <div className="text-[15px] font-semibold tabular-nums">
                  {data.memberStats.lifetimeBookings}
                </div>
              </div>

              <div className="border-t border-border/40 pt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Today's nutrition
                </div>
                {data.memberStats.todayFoodCount > 0 ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Calories</span>
                      <span className="tabular-nums">
                        {Math.round(data.memberStats.todayKcal)} kcal
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Protein</span>
                      <span className="tabular-nums">
                        {Math.round(data.memberStats.todayProtein)}g
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {data.memberStats.todayFoodCount} entries logged today
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-muted-foreground italic">
                    Nothing logged today
                  </div>
                )}
              </div>

              <div className="border-t border-border/40 pt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Goal
                </div>
                <div className="text-[12px] capitalize">
                  {data.selectedMember.goal ?? "Not set"}
                </div>
                <div className="text-[11px] text-muted-foreground capitalize">
                  {data.selectedMember.activityLevel?.replace(/_/g, " ") ?? ""}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
