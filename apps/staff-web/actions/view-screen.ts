import { defineAction } from "@agent-native/core";
import { readAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server";
import { z } from "zod";
import {
  isConnected,
  getClients,
  listGmailMessages,
  gmailToEmailMessage,
  fetchGmailLabelMap,
} from "../server/lib/google-auth.js";
import { gmailGetThread } from "../server/lib/google-api.js";
import { getSetting } from "@agent-native/core/settings";
import { getAccessTokens, fetchLabelMap } from "./helpers.js";
import {
  listQueuedDrafts,
  requireQueuedDraft,
} from "../server/lib/queued-drafts.js";
import { getSyntheticEmailsForView } from "../server/lib/jobs.js";

const VIEW_QUERIES: Record<string, string> = {
  inbox: "in:inbox -in:sent",
  unread: "is:unread in:inbox -in:sent",
  starred: "is:starred",
  sent: "in:sent",
  drafts: "in:drafts",
  archive: "-in:inbox -in:sent -in:drafts -in:trash",
  trash: "in:trash",
  all: "",
};

function latestPerThread(emails: any[]): any[] {
  const byThread = new Map<string, any>();
  for (const email of emails) {
    const key = `${email.accountEmail ?? ""}:${email.threadId || email.id}`;
    const existing = byThread.get(key);
    if (
      !existing ||
      new Date(email.date).getTime() > new Date(existing.date).getTime()
    ) {
      byThread.set(key, email);
    }
  }
  return Array.from(byThread.values()).sort(
    (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

async function fetchEmailList(
  view: string,
  search?: string,
  _label?: string,
): Promise<any[]> {
  try {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) throw new Error("no authenticated user");
    if (view === "snoozed" || view === "scheduled") {
      let emails = await getSyntheticEmailsForView(ownerEmail, view);
      if (search) {
        const q = search.toLowerCase();
        emails = emails.filter(
          (e: any) =>
            e.subject?.toLowerCase().includes(q) ||
            e.snippet?.toLowerCase().includes(q) ||
            e.body?.toLowerCase().includes(q) ||
            e.from?.name?.toLowerCase().includes(q) ||
            e.from?.email?.toLowerCase().includes(q),
        );
      }
      return emails.slice(0, 50);
    }
    if (await isConnected(ownerEmail)) {
      const clients = await getClients(ownerEmail);
      const labelMap = new Map<string, string>();
      await Promise.all(
        clients.map(async ({ accessToken }) => {
          try {
            const map = await fetchGmailLabelMap(accessToken);
            for (const [id, name] of map) labelMap.set(id, name);
          } catch {}
        }),
      );

      const viewPrefix = VIEW_QUERIES[view] ?? `label:${view}`;
      const gmailQuery = [viewPrefix, search].filter(Boolean).join(" ");
      const effectiveQuery =
        view === "all" && !search ? "" : gmailQuery || "in:inbox -in:sent";
      const { messages } = await listGmailMessages(
        effectiveQuery,
        50,
        ownerEmail,
        undefined,
        {
          mode: "threads",
          threadFormat: "metadata",
          threadCandidateLimit: search ? 500 : undefined,
        },
      );

      return latestPerThread(
        messages.map((m: any) =>
          gmailToEmailMessage(m, m._accountEmail, labelMap),
        ),
      ).slice(0, 50);
    }

    // Fallback: local store
    const data = await getSetting("local-emails");
    if (data && Array.isArray((data as any).emails)) {
      let emails = (data as any).emails;
      switch (view) {
        case "inbox":
          emails = emails.filter(
            (e: any) =>
              !e.isArchived && !e.isTrashed && !e.isDraft && !e.isSent,
          );
          break;
        case "unread":
          emails = emails.filter(
            (e: any) =>
              !e.isRead &&
              !e.isArchived &&
              !e.isTrashed &&
              !e.isDraft &&
              !e.isSent,
          );
          break;
        case "starred":
          emails = emails.filter((e: any) => e.isStarred && !e.isTrashed);
          break;
        case "sent":
          emails = emails.filter((e: any) => e.isSent && !e.isTrashed);
          break;
        case "drafts":
          emails = emails.filter((e: any) => e.isDraft);
          break;
        case "archive":
          emails = emails.filter((e: any) => e.isArchived && !e.isTrashed);
          break;
        case "trash":
          emails = emails.filter((e: any) => e.isTrashed);
          break;
      }
      if (search) {
        const q = search.toLowerCase();
        emails = emails.filter(
          (e: any) =>
            e.subject?.toLowerCase().includes(q) ||
            e.snippet?.toLowerCase().includes(q) ||
            e.body?.toLowerCase().includes(q) ||
            e.from?.name?.toLowerCase().includes(q) ||
            e.from?.email?.toLowerCase().includes(q),
        );
      }
      return emails.slice(0, 50);
    }
    return [];
  } catch {
    return [];
  }
}

async function fetchThreadMessages(threadId: string): Promise<any | null> {
  try {
    const accounts = await getAccessTokens();
    if (accounts.length === 0) return null;

    const labelMap = new Map<string, string>();
    await Promise.all(
      accounts.map(async ({ accessToken }) => {
        try {
          const map = await fetchLabelMap(accessToken);
          for (const [id, name] of map) labelMap.set(id, name);
        } catch {}
      }),
    );

    for (const { email, accessToken } of accounts) {
      try {
        const threadRes = await gmailGetThread(accessToken, threadId, "full");
        const messages = (threadRes.messages || [])
          .map((m: any) =>
            gmailToEmailMessage(
              { ...m, _accountEmail: email },
              email,
              labelMap,
            ),
          )
          .sort(
            (a: any, b: any) =>
              new Date(a.date).getTime() - new Date(b.date).getTime(),
          );

        return {
          threadId,
          messages: messages.map((m: any) => ({
            id: m.id,
            from: m.from?.name
              ? `${m.from.name} <${m.from.email}>`
              : (m.from?.email ?? ""),
            to: (m.to || []).map((t: any) =>
              t.name ? `${t.name} <${t.email}>` : t.email,
            ),
            subject: m.subject,
            body: m.body,
            date: m.date,
            isRead: m.isRead,
          })),
        };
      } catch (err: any) {
        if (err?.message?.includes("404")) continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default defineAction({
  description:
    "See what the user is currently looking at on screen. Returns the current view, email list, and open thread (if any). Always call this first before taking any action.",
  schema: z.object({
    full: z.coerce
      .boolean()
      .optional()
      .describe(
        "Set to true for full detail (deprecated, now always returns full detail)",
      ),
  }),
  http: false,
  run: async () => {
    const navigation = await readAppState("navigation");

    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    // Fetch queued drafts when the user is on the draft queue.
    const nav = navigation as any;
    if (nav?.view === "draft-queue") {
      try {
        const drafts = await listQueuedDrafts({
          scope: nav.queueScope === "requested" ? "requested" : "review",
          status: "active",
          limit: 50,
        });
        screen.draftQueue = {
          scope: nav.queueScope ?? "review",
          count: drafts.length,
          drafts: drafts.map((draft) => ({
            id: draft.id,
            ownerEmail: draft.ownerEmail,
            requesterEmail: draft.requesterEmail,
            to: draft.to,
            subject: draft.subject,
            status: draft.status,
            context: draft.context,
            createdAt: draft.createdAt,
          })),
        };
        if (nav.queuedDraftId) {
          const { draft: selected } = await requireQueuedDraft(
            nav.queuedDraftId,
          );
          screen.queuedDraft = selected;
        }
      } catch (err) {
        screen.draftQueue = {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    } else if (nav?.view === "forms") {
      // AEX-01 — context-aware of the Forms tab. Surface the forms list (and the
      // selected form, if any) so the agent knows what exists before writing.
      const { getDb, schema } = await import("../server/db/index.js");
      const { isNull, eq } = await import("drizzle-orm");
      const db = getDb();
      // guard:allow-unscoped — single-tenant gym forms
      const forms = await db
        .select({
          id: schema.forms.id,
          title: schema.forms.title,
          status: schema.forms.status,
          slug: schema.forms.slug,
          updatedAt: schema.forms.updatedAt,
        })
        .from(schema.forms)
        .where(isNull(schema.forms.deletedAt));
      screen.forms = forms;
      if (nav?.formId) {
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select()
          .from(schema.forms)
          .where(eq(schema.forms.id, nav.formId))
          .limit(1);
        if (form) {
          screen.selectedForm = {
            ...form,
            fields: JSON.parse(form.fields),
            settings: JSON.parse(form.settings),
          };
        }
      }
    } else if (nav?.view === "schedule") {
      // AEX-01 — context-aware of the Schedule tab. Surface upcoming occurrences
      // with their booking counts (and the selected occurrence's detail, if any)
      // so the agent knows what exists before writing (e.g. "Friday's spin has 8 bookings").
      const { getDb, schema } = await import("../server/db/index.js");
      const { eq, and, count, gte, asc } = await import("drizzle-orm");
      const db = getDb();
      const nowIso = new Date().toISOString();
      // guard:allow-unscoped — single-tenant gym tables
      const occurrences = await db
        .select({
          id: schema.classOccurrences.id,
          className: schema.classDefinitions.name,
          startsAt: schema.classOccurrences.startsAt,
          capacity: schema.classOccurrences.capacity,
          status: schema.classOccurrences.status,
        })
        .from(schema.classOccurrences)
        .innerJoin(
          schema.classDefinitions,
          eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
        )
        .where(gte(schema.classOccurrences.startsAt, nowIso))
        .orderBy(asc(schema.classOccurrences.startsAt))
        .limit(30);

      // Per-occurrence active-booking counts (one grouped query, then map).
      const upcomingOccurrences = [];
      for (const occ of occurrences) {
        // guard:allow-unscoped — single-tenant gym tables
        const [bc] = await db
          .select({ booked: count() })
          .from(schema.bookings)
          .where(
            and(
              eq(schema.bookings.occurrenceId, occ.id),
              eq(schema.bookings.status, "booked"),
            ),
          );
        upcomingOccurrences.push({
          ...occ,
          bookingCount: Number(bc?.booked ?? 0),
        });
      }
      screen.schedule = { upcomingOccurrences };

      if (nav?.occurrenceId) {
        // guard:allow-unscoped — single-tenant gym tables
        const [occ] = await db
          .select()
          .from(schema.classOccurrences)
          .where(eq(schema.classOccurrences.id, nav.occurrenceId))
          .limit(1);
        if (occ) {
          // guard:allow-unscoped — single-tenant gym tables
          const [bc] = await db
            .select({ booked: count() })
            .from(schema.bookings)
            .where(
              and(
                eq(schema.bookings.occurrenceId, occ.id),
                eq(schema.bookings.status, "booked"),
              ),
            );
          screen.selectedOccurrence = {
            ...occ,
            bookingCount: Number(bc?.booked ?? 0),
          };
        }
      }
    } else if (nav?.view === "members") {
      // AEX-01 — context-aware of the Members tab. Surface the directory (and the
      // selected member + recent bookings when nav.memberId is set) so the agent
      // can ground "update this member" before calling update-member.
      const { getDb, schema } = await import("../server/db/index.js");
      const { eq, desc } = await import("drizzle-orm");
      const db = getDb();
      // guard:allow-unscoped — single-tenant gym tables
      const members = await db
        .select({
          id: schema.gymMembers.id,
          firstName: schema.gymMembers.firstName,
          lastName: schema.gymMembers.lastName,
          phoneE164: schema.gymMembers.phoneE164,
          email: schema.gymMembers.email,
        })
        .from(schema.gymMembers)
        .limit(100);
      screen.members = members.map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(" ").trim(),
        phoneE164: m.phoneE164,
        email: m.email,
      }));
      if (nav?.memberId) {
        // guard:allow-unscoped — single-tenant gym tables
        const [selected] = await db
          .select()
          .from(schema.gymMembers)
          .where(eq(schema.gymMembers.id, nav.memberId))
          .limit(1);
        if (selected) {
          // guard:allow-unscoped — single-tenant gym tables
          const recentBookings = await db
            .select({
              id: schema.bookings.id,
              occurrenceId: schema.bookings.occurrenceId,
              status: schema.bookings.status,
              bookedAt: schema.bookings.bookedAt,
            })
            .from(schema.bookings)
            .where(eq(schema.bookings.memberId, nav.memberId))
            .orderBy(desc(schema.bookings.bookedAt))
            .limit(10);
          // Never surface consent/opt-in here — update-member cannot touch them.
          screen.selectedMember = {
            id: selected.id,
            firstName: selected.firstName,
            lastName: selected.lastName,
            email: selected.email,
            phoneE164: selected.phoneE164,
            notes: selected.notes,
            createdAt: selected.createdAt,
            recentBookings,
          };
        }
      }
    } else if (nav?.view === "campaigns") {
      // AEX-01 — context-aware of the Campaigns tab. readAppState WORKS here
      // (view-screen is an action, wrapped in runWithRequestContext) — unlike the
      // campaigns page loader, which must read segments client-side.
      // guard:allow-unscoped — application_state is framework-scoped
      const seg = (await readAppState("gymos-campaign-segments")) as {
        segments?: unknown[];
      } | null;
      screen.campaigns = {
        savedSegments: Array.isArray(seg?.segments) ? seg!.segments! : [],
        presets: ["at-risk"],
      };
    } else if (nav?.view === "content") {
      // CV1 NAV-01 — context-aware of the Content tab. CV2 will surface the
      // content_documents list here; for now report the active tab so the agent
      // knows where the user is.
      screen.content = { note: "Content tab — documents arrive in CV2." };
    } else if (nav?.view === "video") {
      // CV1 NAV-01 — context-aware of the Video tab. CV3 will surface the
      // video_compositions list here.
      screen.video = { note: "Video tab — compositions arrive in CV3." };
    } else if (nav?.view) {
      const emails = await fetchEmailList(nav.view, nav.search, nav.label);
      const selectedThreadIds = Array.isArray(nav.selectedThreadIds)
        ? new Set(
            nav.selectedThreadIds.filter(
              (id: unknown): id is string => typeof id === "string",
            ),
          )
        : new Set<string>();
      const compact = emails.slice(0, 50).map((e: any) => ({
        id: e.id,
        threadId: e.threadId,
        isSelected: selectedThreadIds.has(e.threadId || e.id),
        from: e.from?.name
          ? `${e.from.name} <${e.from.email}>`
          : (e.from?.email ?? e.from ?? ""),
        subject: e.subject,
        snippet: e.snippet,
        date: e.date,
        isRead: e.isRead,
        isStarred: e.isStarred,
      }));
      screen.emailList = {
        view: nav.view,
        label: nav.label ?? null,
        search: nav.search ?? null,
        selectedThreadIds: Array.from(selectedThreadIds),
        count: compact.length,
        emails: compact,
      };
    }

    // Fetch thread messages directly via Gmail API if the user is viewing a thread
    if (nav?.threadId) {
      const thread = await fetchThreadMessages(nav.threadId);
      if (thread) screen.thread = thread;
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return JSON.stringify(screen, null, 2);
  },
});
