// GymOS WhatsApp Inbox — P1b (post-spine).
//
// P1b-08 refactor (2026-05-20): Send action no longer calls Meta directly.
// Outbound flow is now:
//   1. action() inserts messages row with status='queued' (D-18 optimistic)
//   2. enqueueOutboundWhatsApp({messageId, memberId, payload}) hands the job
//      to pg-boss
//   3. worker's outbound-whatsapp queue handler runs sendMessage() chokepoint
//      (24h-window + opt-in + template-approved gates) and POSTs to Meta v23
//   4. inbound webhook updates messages.status as Meta delivers
//
// D-19 defence-in-depth: this UI pre-gates Send when the loader knows the
// member is out-of-window or has no opt-in, but the worker re-checks at send
// time — UI cache can be stale.
//
// D-20 badge UX: every conversation row + the thread header show window-state.
// LOW #12: badges use Tabler IconPointFilled (NOT the bullet character),
// resolving AGENTS.md "no emojis as icons" ambiguity.
//
// Requirements covered:
// - WA-05: single sendMessage chokepoint — staff-web NEVER calls Meta
// - WA-07: opt-in gate surfaced in UI (worker still enforces)
// - INBX-01..03, INBX-06, INBX-07 (carried from D1)

import {
  useSearchParams,
  useLoaderData,
  Form,
  redirect,
  Link,
} from "react-router";
import { useState } from "react";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { IconPointFilled } from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { enqueueOutboundWhatsApp } from "@/lib/queue-client";
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

  // ─── Window state + opt-in fan-out (P1b-08 / D-19 / D-20) ──────────────
  //
  // whatsapp_window_state is a Drizzle-managed VIEW (Plan 02) — not exported
  // as a Drizzle table, so we query via raw SQL. D-15 chose VIEW over a
  // materialised mirror so the value is always fresh against
  // conversations.last_inbound_at.

  const conversationIds = conversationsRows.map((c) => c.id);
  const memberIds = conversationsRows
    .map((c) => c.memberId)
    .filter((m): m is string => Boolean(m));

  const windowMap: Record<
    string,
    { inWindow: boolean; hoursLeft: number | null }
  > = {};
  if (conversationIds.length > 0) {
    // guard:allow-unscoped — coach inbox shows all conversations in the studio
    //
    // staff-web's `db` proxy is typed as LibSQLDatabase (framework default) but
    // resolves to a Neon/Postgres driver at runtime via DATABASE_URL. Postgres
    // Drizzle exposes .execute(); the cast keeps TS happy without changing the
    // runtime behaviour. whatsapp_window_state is a VIEW (Plan 02) — not a
    // Drizzle table export, so we query it via raw SQL.
    const windowRows = await (db as any).execute(sql`
      SELECT conversation_id, in_window, hours_left
      FROM whatsapp_window_state
      WHERE conversation_id IN (${sql.join(
        conversationIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
    const rows =
      (windowRows as any)?.rows ?? (windowRows as any as any[]) ?? [];
    for (const r of rows) {
      windowMap[r.conversation_id as string] = {
        inWindow: Boolean(r.in_window),
        hoursLeft: r.hours_left !== null ? Number(r.hours_left) : null,
      };
    }
  }

  const optInSet = new Set<string>();
  if (memberIds.length > 0) {
    // guard:allow-unscoped — coach inbox shows all conversations in the studio
    const optInRows = await db
      .select({ memberId: schema.whatsappOptIn.memberId })
      .from(schema.whatsappOptIn)
      .where(inArray(schema.whatsappOptIn.memberId, memberIds));
    for (const r of optInRows) optInSet.add(r.memberId);
  }
  const optInByMemberId: Record<string, boolean> = {};
  for (const id of memberIds) optInByMemberId[id] = optInSet.has(id);

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
    windowStateByConvId: windowMap,
    optInByMemberId,
  };
}

// ─── Action: enqueue outbound message (P1b-08) ───────────────────────────────
//
// D-18 optimistic insert: messages row written with status='queued' BEFORE
// the enqueue call. The UI re-fetches via redirect and the queued bubble
// renders immediately. Worker flips status to 'sent' (+ external_id) or
// 'failed' (+ error_code) as it processes.

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || !body) {
    return { error: "Missing conversation or body" };
  }

  const db = getDb();

  // guard:allow-unscoped — P1b spine; full coach role check ships in P1a/AUTH-04
  const conv = await db
    .select({
      id: schema.conversations.id,
      memberId: schema.conversations.memberId,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!conv) {
    throw new Response("Conversation not found", { status: 404 });
  }

  // D-18: OPTIMISTIC insert with status='queued'. The bubble renders on the
  // next render pass; the worker will flip to 'sent' / 'failed' as it picks
  // up the job.
  const messageId = `msg_${nanoid()}`;
  const nowIso = new Date().toISOString();
  await db.insert(schema.messages).values({
    id: messageId,
    conversationId,
    direction: "out",
    messageType: "text",
    body,
    status: "queued",
    createdAt: nowIso,
  });

  // Update conversation preview so the inbox list reflects the latest send
  // without waiting for worker completion.
  await db
    .update(schema.conversations)
    .set({
      lastMessagePreview: body,
      updatedAt: nowIso,
    })
    .where(eq(schema.conversations.id, conversationId));

  // Hand the job to pg-boss (-> worker -> sendMessage chokepoint -> Meta v23).
  // No direct Meta Graph API call here per D-11 / WA-05.
  await enqueueOutboundWhatsApp({
    messageId,
    memberId: conv.memberId,
    payload: { type: "text", body },
  });

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

// D-19 failed-bubble copy. Worker writes typed codes (NO_OPT_IN,
// WINDOW_EXPIRED, TEMPLATE_NOT_APPROVED) into messages.error_code. We map
// to friendly copy on render; unknown codes fall back to the raw value so
// triage isn't silently swallowed.
function failedCopy(errorCode: string | null | undefined): string {
  const err = errorCode ?? "";
  if (err.includes("WINDOW_EXPIRED") || err.includes("WindowExpiredError"))
    return "Couldn't send — outside 24-hour window. Use a template.";
  if (err.includes("NO_OPT_IN") || err.includes("NoOptInError"))
    return "Couldn't send — member hasn't opted in to WhatsApp messages.";
  if (
    err.includes("TEMPLATE_NOT_APPROVED") ||
    err.includes("TemplateNotApprovedError")
  )
    return "Couldn't send — template isn't approved yet.";
  return err ? `Couldn't send — ${err}` : "Couldn't send.";
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosInbox() {
  const data = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const selectedId = params.get("conversation");
  const [reply, setReply] = useState("");

  const selectedWs = data.selectedConversation
    ? data.windowStateByConvId[data.selectedConversation.id]
    : null;
  const selectedHasOptIn = data.selectedConversation
    ? Boolean(data.optInByMemberId[data.selectedConversation.memberId])
    : false;
  const canSendText = Boolean(selectedWs?.inWindow) && selectedHasOptIn;

  return (
    <div className="flex h-full w-full overflow-hidden">
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
            const ws = data.windowStateByConvId[c.id];
            const inWindow = Boolean(ws?.inWindow);
            const hoursLeft = ws?.hoursLeft ?? null;
            return (
              <Link
                key={c.id}
                to={`/gymos?conversation=${c.id}`}
                preventScrollReset
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
                {/* D-20 window-state badge (LOW #12: Tabler IconPointFilled, not the bullet char) */}
                <span className="mt-1 inline-flex items-center gap-1 text-[10px]">
                  {inWindow ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <IconPointFilled
                        size={8}
                        className="text-emerald-500"
                        aria-hidden
                      />
                      in window
                      {hoursLeft !== null
                        ? ` · ${Math.floor(hoursLeft)}h left`
                        : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <IconPointFilled
                        size={8}
                        className="text-zinc-400"
                        aria-hidden
                      />
                      out of window — template only
                    </span>
                  )}
                </span>
              </Link>
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
              {/* D-20 thread-header window-state badge (LOW #12: IconPointFilled) */}
              {selectedWs ? (
                selectedWs.inWindow ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    <IconPointFilled
                      size={10}
                      className="text-emerald-500"
                      aria-hidden
                    />
                    in window
                    {selectedWs.hoursLeft !== null
                      ? ` · ${Math.floor(selectedWs.hoursLeft)}h left`
                      : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded bg-zinc-500/15 text-zinc-700 dark:text-zinc-300">
                    <IconPointFilled
                      size={10}
                      className="text-zinc-400"
                      aria-hidden
                    />
                    out of window — template only
                  </span>
                )
              ) : null}
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {data.selectedMessages.map((m: any) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col max-w-[75%]",
                    m.direction === "out" ? "ml-auto items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                      m.direction === "out"
                        ? m.status === "failed"
                          ? "bg-red-500/10 text-red-900 dark:text-red-200 border border-red-500/30"
                          : "bg-primary text-primary-foreground"
                        : "bg-muted/70",
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {relativeTime(m.createdAt)}
                    {m.direction === "out" && ` · ${m.status}`}
                  </span>
                  {/* D-19 failed-bubble error copy */}
                  {m.direction === "out" && m.status === "failed" && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 px-1">
                      {failedCopy(m.errorCode)}
                    </p>
                  )}
                </div>
              ))}
            </div>

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
                    !selectedHasOptIn
                      ? "Member hasn't opted in to WhatsApp messages"
                      : !selectedWs?.inWindow
                        ? "Out of 24h window — use a template (P2)"
                        : "Type a reply..."
                  }
                  disabled={!canSendText}
                  className="text-[13px]"
                />
                <Button type="submit" disabled={!canSendText || !reply.trim()}>
                  Send
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Sends route through pg-boss → worker → Meta v23. The worker
                re-checks opt-in + 24h-window at the chokepoint (defence in
                depth — UI cache can be stale).
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
  );
}
