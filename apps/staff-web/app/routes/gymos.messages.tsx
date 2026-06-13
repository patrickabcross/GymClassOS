// GymClassOS WhatsApp Messages — R3-04 (NAME-03 route rename).
//
// Relocated from gymos.inbox.tsx in R3 naming pass. The old route
// /gymos/inbox now lives as a 301 redirect shim → /gymos/messages.
// All self-referential path strings updated from /gymos/inbox to
// /gymos/messages below.
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
// P3-04 relocation: this file was moved verbatim from gymos._index.tsx to
// gymos.inbox.tsx so the AI noticeboard can own /gymos (index). The inbox now
// lives at /gymos/inbox. Self-referential redirect targets and filter-chip
// navigation links updated from /gymos to /gymos/inbox accordingly.
//
// Requirements covered:
// - WA-05: single sendMessage chokepoint — staff-web NEVER calls Meta
// - WA-06: 24h-window enforcement (worker authoritative; UI pre-gates)
// - WA-07: opt-in gate surfaced in UI (worker still enforces)
// - WA-08: template send path (P1b.1-05) — Templates dialog enqueues
//   payload.type='template' which the worker chokepoint re-checks for
//   status='approved' before any Meta call. hello_world is seeded as the
//   only approved template; the other four show as awaiting-approval.
// - INBX-01..03, INBX-06, INBX-07 (carried from D1)

import {
  useSearchParams,
  useLoaderData,
  useRevalidator,
  Form,
  redirect,
  Link,
} from "react-router";
import { useState } from "react";
import { eq, ne, desc, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  IconPointFilled,
  IconMessage,
  IconUsers,
  IconInbox,
} from "@tabler/icons-react";
import { getDb, schema } from "../../server/db";
import { readAppSecretByKey } from "../../server/lib/app-secrets";
import { enqueueOutboundWhatsApp } from "@/lib/queue-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { TemplatesDialog } from "@/components/gymos/TemplatesDialog";
import { ImportLeadsDialog } from "@/components/gymos/ImportLeadsDialog";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export function meta() {
  return [{ title: "GymClassOS — Messages" }];
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const selectedId = url.searchParams.get("conversation");
  // P1c-04 leads filter: ?filter=leads shows status='lead' conversations;
  // default (no param or any other value) shows non-lead statuses so the inbox
  // stays focused and leads don't clutter the working inbox.
  const filter = url.searchParams.get("filter");
  const isLeadsView = filter === "leads";
  const db = getDb();

  // List of conversations + the member each one is with
  // guard:allow-unscoped — coach inbox shows all conversations in the studio
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
    .where(
      isLeadsView
        ? eq(schema.conversations.status, "lead")
        : ne(schema.conversations.status, "lead"),
    )
    .orderBy(desc(schema.conversations.updatedAt));

  // Resolve the selected conversation by id, INDEPENDENT of the active list
  // filter. A lead lives only in the leads list (status='lead'); clicking it
  // navigates with ?conversation=<id>, and if ?filter=leads isn't carried the
  // default list query excludes it — so finding the selection inside the list
  // failed and the thread silently bounced back to the inbox. Look it up
  // directly so any conversation opens regardless of which list is showing.
  let selectedRow = selectedId
    ? (conversationsRows.find((c) => c.id === selectedId) ?? null)
    : null;
  if (selectedId && !selectedRow) {
    selectedRow = await db
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
      .where(eq(schema.conversations.id, selectedId))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  // ─── Window state + opt-in fan-out (P1b-08 / D-19 / D-20) ──────────────
  //
  // whatsapp_window_state is a Drizzle-managed VIEW (Plan 02) — not exported
  // as a Drizzle table, so we query via raw SQL. D-15 chose VIEW over a
  // materialised mirror so the value is always fresh against
  // conversations.last_inbound_at.

  // Include the selected conversation (which may be a lead outside the list) in
  // the window-state + opt-in fan-out so the open thread shows correct state.
  const conversationIds = Array.from(
    new Set([
      ...conversationsRows.map((c) => c.id),
      ...(selectedRow ? [selectedRow.id] : []),
    ]),
  );
  const memberIds = Array.from(
    new Set(
      [
        ...conversationsRows.map((c) => c.memberId),
        ...(selectedRow ? [selectedRow.memberId] : []),
      ].filter((m): m is string => Boolean(m)),
    ),
  );

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

  // ─── Templates fan-out (P1b.1-05 / WA-08) ─────────────────────────────
  //
  // All seeded whatsapp_templates rows. The reply-form Templates dialog
  // renders these (approved=selectable, others=disabled). Worker re-checks
  // status='approved' at sendMessage chokepoint per WA-05 / WA-08.
  // guard:allow-unscoped — single-tenant deploy; templates are studio-wide
  const templates = await db
    .select({
      name: schema.whatsappTemplates.name,
      status: schema.whatsappTemplates.status,
      category: schema.whatsappTemplates.category,
      language: schema.whatsappTemplates.language,
      componentsJson: schema.whatsappTemplates.componentsJson,
    })
    .from(schema.whatsappTemplates)
    .orderBy(schema.whatsappTemplates.name);

  let selectedConversation = null;
  let selectedMessages: any[] = [];
  let selectedMember: any = null;
  let memberStats: any = null;
  let upcomingBooking: any = null;

  if (selectedRow) {
    selectedConversation = selectedRow;

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

      // Derive last visit: most recent PAST booking with status='attended',
      // falling back to 'booked' if no attended records exist. Reuses the
      // existing bookings array — no new DB query.
      const pastBookings = bookings.filter(
        (b) =>
          b.startsAt &&
          new Date(b.startsAt) < now &&
          (b.status === "attended" || b.status === "booked"),
      );
      // Prefer attended over booked; both arrays are ordered by startsAt ASC so last element = most recent
      const lastVisitAttended = [...pastBookings]
        .filter((b) => b.status === "attended")
        .at(-1);
      const lastVisitBooked = [...pastBookings]
        .filter((b) => b.status === "booked")
        .at(-1);
      const lastVisitRecord = lastVisitAttended ?? lastVisitBooked ?? null;
      const lastVisit: {
        className: string | null;
        startsAt: string;
      } | null = lastVisitRecord
        ? {
            className: lastVisitRecord.className ?? null,
            startsAt: lastVisitRecord.startsAt as string,
          }
        : null;

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
        lastVisit,
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
    templates,
    isLeadsView,
  };
}

// ─── Action: enqueue outbound message (P1b-08) ───────────────────────────────
//
// D-18 optimistic insert: messages row written with status='queued' BEFORE
// the enqueue call. The UI re-fetches via redirect and the queued bubble
// renders immediately. Worker flips status to 'sent' (+ external_id) or
// 'failed' (+ error_code) as it processes.

// Best-effort enqueue. The outbound pipeline (pg-boss on the unpooled Neon
// endpoint -> Fly worker -> Meta) is not stood up in every environment yet:
// getBoss() throws if DATABASE_URL_UNPOOLED is unset, and the worker may not be
// running. We still want the optimistic 'queued' message row to persist and the
// UI to update, so a missing/unconfigured queue must NOT 500 the send. When the
// worker pipeline is live, enqueue succeeds and delivery proceeds normally; the
// queued row is the source of truth either way (worker flips status to
// sent/delivered/failed). Errors are logged loudly so this never hides a real
// queue outage silently.
async function enqueueBestEffort(
  args: Parameters<typeof enqueueOutboundWhatsApp>[0],
): Promise<void> {
  try {
    await enqueueOutboundWhatsApp(args);
  } catch (err) {
    console.warn(
      `[gymos] outbound enqueue skipped (queue not configured/unavailable) for message ${args.messageId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "send-text");
  const conversationId = String(formData.get("conversationId") ?? "");

  // ─── sync-templates branch (260608-gn1 / WA-08 on-demand) ──────────────────
  //
  // Pulls approved templates from MYÜTIK into whatsapp_templates on demand.
  // No conversationId required — runs before the conversationId guard below.
  if (intent === "sync-templates") {
    try {
      const apiKey = await readAppSecretByKey("MYUTIK_API_KEY");
      if (!apiKey) {
        return {
          syncResult: {
            ok: false,
            error:
              "No MYÜTIK API key configured — add it in Settings → API Keys",
          },
        };
      }
      const phoneNumberId =
        (await readAppSecretByKey("MYUTIK_PHONE_NUMBER_ID")) ??
        "302631896256150";

      const baseUrl = new URL(
        "https://myutik.com/api/channels/whatsapp/templates",
      );
      baseUrl.searchParams.set("phoneNumberId", phoneNumberId);
      baseUrl.searchParams.set("limit", "200");

      const db = getDb();
      let synced = 0;
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        const url = new URL(baseUrl.toString());
        if (after) url.searchParams.set("after", after);
        const res = await fetch(url.toString(), {
          headers: { "x-api-key": apiKey },
        });
        if (!res.ok) {
          return { syncResult: { ok: false, error: `MYÜTIK ${res.status}` } };
        }
        const json = (await res.json()) as {
          templates?: Array<{
            name: string;
            status: string;
            category?: string | null;
            language?: string;
            components?: unknown;
          }>;
          paging?: { next?: string | null };
        };
        const rows = json.templates ?? [];
        for (const tpl of rows) {
          // guard:allow-unscoped — single-tenant; templates are studio-wide
          await db
            .insert(schema.whatsappTemplates)
            .values({
              name: tpl.name,
              status: tpl.status.toLowerCase() as any,
              category: (tpl.category
                ? tpl.category.toLowerCase()
                : null) as any,
              language: tpl.language ?? "en_US",
              componentsJson: JSON.stringify({
                components: tpl.components ?? [],
              }),
              lastSyncedAt: new Date().toISOString(),
            })
            .onConflictDoUpdate({
              target: schema.whatsappTemplates.name,
              set: {
                status: tpl.status.toLowerCase() as any,
                category: (tpl.category
                  ? tpl.category.toLowerCase()
                  : null) as any,
                language: tpl.language ?? "en_US",
                componentsJson: JSON.stringify({
                  components: tpl.components ?? [],
                }),
                lastSyncedAt: new Date().toISOString(),
              },
            });
          synced += 1;
        }
        const next = json.paging?.next;
        if (next) after = next;
        else break;
      }
      return { syncResult: { ok: true, synced } };
    } catch (err) {
      return {
        syncResult: {
          ok: false,
          error:
            err instanceof Error
              ? `Couldn't update templates: ${err.message}`
              : "Couldn't update templates",
        },
      };
    }
  }

  if (!conversationId) {
    return { error: "Missing conversation" };
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

  // ─── send-template branch (P1b.1-05 / WA-08) ─────────────────────────────
  //
  // Identical optimistic-insert + enqueue pattern to send-text, but with a
  // `type: 'template'` payload. The worker's sendMessage chokepoint re-checks
  // template approval (WA-08) and opt-in (WA-07) before any Meta call.
  // Templates bypass the 24h-window gate (WA-06) — that's the whole point.
  if (intent === "send-template") {
    const templateName = String(formData.get("templateName") ?? "").trim();
    const varsJson = String(formData.get("vars") ?? "{}");
    let vars: Record<string, string> = {};
    try {
      const parsed = JSON.parse(varsJson);
      if (parsed && typeof parsed === "object") {
        vars = parsed as Record<string, string>;
      }
    } catch {
      return { error: "Invalid template variables JSON" };
    }
    if (!templateName) {
      return { error: "Missing template name" };
    }

    const messageId = `msg_${nanoid()}`;
    const nowIso = new Date().toISOString();
    const previewBody = `[template: ${templateName}]`;

    await db.insert(schema.messages).values({
      id: messageId,
      conversationId,
      direction: "out",
      messageType: "template",
      body: previewBody,
      payload: JSON.stringify({ name: templateName, vars }),
      status: "queued",
      createdAt: nowIso,
    });

    await db
      .update(schema.conversations)
      .set({
        lastMessagePreview: previewBody,
        updatedAt: nowIso,
      })
      .where(eq(schema.conversations.id, conversationId));

    // Hand to worker chokepoint. Empty vars (e.g. hello_world with 0
    // placeholders) flow through as `vars: {}` — the @gymos/whatsapp
    // sdk-impl maps Object.values({}) -> [] and Meta accepts an empty
    // components array, so no extra guard is needed here.
    await enqueueBestEffort({
      messageId,
      memberId: conv.memberId,
      payload: {
        type: "template",
        name: templateName,
        vars,
        language: "en_US",
      },
    });

    return redirect(`/gymos/messages?conversation=${conversationId}&sent=1`);
  }

  // ─── send-text branch (existing behaviour — unchanged) ───────────────────
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return { error: "Missing body" };
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
  await enqueueBestEffort({
    messageId,
    memberId: conv.memberId,
    payload: { type: "text", body },
  });

  return redirect(`/gymos/messages?conversation=${conversationId}&sent=1`);
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

// ─── MemberContextCards ──────────────────────────────────────────────────────
// Reusable card stack rendered in BOTH the desktop aside (Task 1) and the
// mobile bottom Sheet (Task 2 / R4-06 SWEB-06). Props mirror the loader fields
// consumed by the member-context panel.

interface MemberContextCardsProps {
  member: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phoneE164?: string | null;
  };
  stats: {
    passBalance: number;
    passExpiresAt?: string | null;
    lastVisit?: { className: string | null; startsAt: string } | null;
  };
  upcomingBooking?: {
    className?: string | null;
    startsAt?: string | null;
  } | null;
}

function MemberContextCards({
  member,
  stats,
  upcomingBooking,
}: MemberContextCardsProps) {
  return (
    <>
      {/* Panel header: avatar + name + phone */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-[11px] font-semibold">
            {[member.firstName?.[0], member.lastName?.[0]]
              .filter(Boolean)
              .join("")
              .toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {[member.firstName, member.lastName].filter(Boolean).join(" ") ||
              "Unknown"}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {member.phoneE164 ?? ""}
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* ── WIDGET 1: PASS BALANCE ──────────────────────────────────── */}
        <Card className="p-3 mt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            PASS BALANCE
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={
                stats.passBalance > 0
                  ? "text-xl font-bold text-primary tabular-nums"
                  : "text-xl font-bold text-muted-foreground tabular-nums"
              }
            >
              {stats.passBalance}
            </span>
            <span className="text-[12px] text-muted-foreground">credits</span>
          </div>
          {stats.passBalance <= 0 && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              No active pass
            </div>
          )}
          {stats.passExpiresAt && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Expires{" "}
              {new Date(stats.passExpiresAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
          )}
        </Card>

        {/* ── WIDGET 2: NEXT CLASS ────────────────────────────────────── */}
        <Card className="p-3 mt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            NEXT CLASS
          </div>
          {upcomingBooking ? (
            <>
              <div className="text-[13px] font-semibold">
                {upcomingBooking.className}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {upcomingBooking.startsAt &&
                  new Date(upcomingBooking.startsAt).toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
              </div>
            </>
          ) : (
            <div className="text-[12px] text-muted-foreground">
              No upcoming class
            </div>
          )}
        </Card>

        {/* ── WIDGET 3: LAST VISIT ────────────────────────────────────── */}
        <Card className="p-3 mt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            LAST VISIT
          </div>
          {stats.lastVisit ? (
            <>
              <div className="text-[13px] font-semibold tabular-nums">
                {new Date(stats.lastVisit.startsAt).toLocaleDateString(
                  "en-GB",
                  {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  },
                )}
              </div>
              {stats.lastVisit.className && (
                <div className="text-[11px] text-muted-foreground">
                  {stats.lastVisit.className}
                </div>
              )}
            </>
          ) : (
            <div className="text-[12px] text-muted-foreground">
              No visits recorded
            </div>
          )}
        </Card>

        {/* ── Footer: View Member Profile CTA ─────────────────────────── */}
        <Button asChild variant="outline" size="sm" className="w-full mt-3">
          <Link to={`/gymos/members/${member.id}`}>View Member Profile</Link>
        </Button>
      </div>
    </>
  );
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function GymosMessages() {
  const data = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const selectedId = params.get("conversation");
  const { isLeadsView } = data;
  const [reply, setReply] = useState("");
  const revalidator = useRevalidator();

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
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-semibold">
                {isLeadsView ? "Leads" : "Messages"}
              </h1>
              <Badge variant="outline" className="text-[10px] h-5">
                {data.conversations.length}
              </Badge>
            </div>
            {isLeadsView && (
              <ImportLeadsDialog onImported={() => revalidator.revalidate()} />
            )}
          </div>
          {/* P1c-04: Messages / Leads filter chips — minimal, progressive disclosure.
              Default shows non-lead conversations; Leads chip shows status='lead'. */}
          <div className="flex items-center gap-1 mt-2">
            <Link
              to="/gymos/messages"
              preventScrollReset
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition",
                !isLeadsView
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              <IconInbox size={10} aria-hidden />
              Messages
            </Link>
            <Link
              to="/gymos/messages?filter=leads"
              preventScrollReset
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition",
                isLeadsView
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              <IconUsers size={10} aria-hidden />
              Leads
            </Link>
          </div>
        </header>
        {/* R3-SC2: "Conversations" section label — gym-domain vocabulary per NAME-02 / D-02 */}
        {!isLeadsView && (
          <div className="px-4 py-2 border-b border-border/30 bg-muted/20">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Conversations
            </span>
          </div>
        )}
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
                to={`/gymos/messages?conversation=${c.id}${data.isLeadsView ? "&filter=leads" : ""}`}
                preventScrollReset
                className={cn(
                  "block px-4 py-3 border-b border-border/30 hover:bg-accent/40 transition",
                  isSelected && "bg-accent/60",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13px] font-semibold truncate">
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
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {!data.selectedConversation ? (
          // Empty-state — replaces the bare "Select a conversation to start"
          // placeholder. Coaches landing on /gymos/messages with no thread selected
          // should see something actionable: friendly framing + a clear hint
          // that the left rail is where conversations live, plus a quick
          // jump-into-the-first-thread affordance when there are any.
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <IconMessage
                className="h-5 w-5 text-muted-foreground"
                aria-hidden
              />
            </div>
            <h2 className="text-sm font-semibold text-foreground mb-1">
              No conversation selected
            </h2>
            <p className="text-[12px] text-muted-foreground max-w-[320px] mb-5">
              Pick a thread from the left to read it, reply, and see the
              member's pass balance, next class, and recent nutrition.
            </p>
            {data.conversations.length > 0 ? (
              <Link
                to={`/gymos/messages?conversation=${data.conversations[0].id}`}
                preventScrollReset
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background hover:opacity-90 transition"
              >
                Open most recent conversation
              </Link>
            ) : (
              <p className="text-[12px] text-muted-foreground italic">
                No conversations yet — they appear here as members message your
                WhatsApp number.
              </p>
            )}
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
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
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
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded bg-zinc-500/15 text-zinc-700 dark:text-zinc-300">
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
                          ? "bg-destructive/10 text-destructive border border-destructive/30"
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
                    <p className="text-[11px] text-destructive mt-1 px-1">
                      {failedCopy(m.errorCode)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <Form
              method="post"
              action="/gymos/compose"
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
                        ? "Out of 24h window — use a template"
                        : "Type a reply..."
                  }
                  disabled={!canSendText}
                  className="text-[13px]"
                />
                <TemplatesDialog
                  conversationId={data.selectedConversation.id}
                  templates={data.templates}
                  hasOptIn={selectedHasOptIn}
                  memberContext={
                    data.selectedMember
                      ? {
                          firstName: data.selectedMember.firstName,
                          lastName: data.selectedMember.lastName,
                          passBalance: data.memberStats?.passBalance,
                          passProduct: data.memberStats?.passProduct,
                          passExpiresAt: data.memberStats?.passExpiresAt,
                          lifetimeBookings: data.memberStats?.lifetimeBookings,
                          nextClassName: data.upcomingBooking?.className,
                          nextClassStartsAt: data.upcomingBooking?.startsAt,
                        }
                      : undefined
                  }
                />
                <Button type="submit" disabled={!canSendText || !reply.trim()}>
                  Send
                </Button>
              </div>
            </Form>
          </>
        )}
      </main>

      {/* ─── Member context panel (right rail) — DIFFERENTIATOR ──────────── */}
      {/* Three scannable widget cards (Pass Balance / Next Class / Last Visit)  */}
      {/* per R4-UI-SPEC §2 — NOT a field list or data table.                    */}
      {/* MemberContextCards component renders the same stack in the mobile Sheet */}
      {/* (R4-06 SWEB-06). Desktop aside hidden below md breakpoint.             */}
      {data.selectedMember && data.memberStats && (
        <aside className="hidden md:flex w-[300px] shrink-0 border-l border-border/50 flex-col bg-card/20 overflow-y-auto">
          {/* Screen-reader heading per Copywriting Contract */}
          <h3 className="sr-only">Member Context</h3>
          <MemberContextCards
            member={data.selectedMember}
            stats={data.memberStats}
            upcomingBooking={data.upcomingBooking}
          />
        </aside>
      )}
    </div>
  );
}
