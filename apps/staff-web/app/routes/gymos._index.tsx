// RunStudio AI Noticeboard — P3 home (replaces the WhatsApp inbox as /gymos index).
//
// P3-04: This file replaces the old inbox (moved verbatim to gymos.inbox.tsx).
// /gymos is now the post-login landing — a Polsia-style noticeboard dashboard.
//
// Loader: persisted dashboard state (notes/tasks/proposals). Live list-* metrics
// are fetched client-side via useActionQuery inside the section components (Plan 05).
// The three fast single-tenant Drizzle SELECTs keep TTFB low (no fan-out queries here).
//
// P3-05: AiTodayStrip / BoardCard grid / TasksSection wired in.
//
// Requirements backed: SC-1 (board renders), SC-2 (computed subheadings via
// client-side useActionQuery), SC-3 (persisted notes render), SC-4 (tasks +
// completable), SC-5 (approve/reject gated by AlertDialog for sends).
import { useLoaderData } from "react-router";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { AiTodayStrip } from "@/components/gymos/Noticeboard/AiTodayStrip";
import { BoardCard } from "@/components/gymos/Noticeboard/BoardCard";
import { TasksSection } from "@/components/gymos/Noticeboard/TasksSection";

export function meta() {
  return [{ title: "RunStudio — Home" }];
}

export async function loader() {
  const db = getDb();
  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
  const [notes, tasks, proposals] = await Promise.all([
    db.select().from(schema.dashboardNotes),
    db
      .select()
      .from(schema.dashboardTasks)
      .where(eq(schema.dashboardTasks.status, "open"))
      .orderBy(
        asc(schema.dashboardTasks.priority),
        asc(schema.dashboardTasks.createdAt),
      ),
    db
      .select()
      .from(schema.dashboardProposals)
      .where(eq(schema.dashboardProposals.status, "pending")),
  ]);
  return { notes, tasks, proposals };
}

export default function Noticeboard() {
  const { notes, tasks, proposals } = useLoaderData<typeof loader>();

  const noteFor = (section: string) =>
    notes.find((n) => n.section === section) ?? null;
  const aiTodayNote = noteFor("ai_today");

  return (
    <div className="flex flex-col gap-4 p-6 h-full overflow-y-auto bg-muted/40">
      <AiTodayStrip note={aiTodayNote} pendingCount={proposals.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-4">
        <BoardCard
          section="inbox"
          note={noteFor("inbox")}
          proposals={proposals}
        />
        <BoardCard
          section="schedule"
          note={noteFor("schedule")}
          proposals={proposals}
        />
        <BoardCard
          section="members"
          note={noteFor("members")}
          proposals={proposals}
        />
        <BoardCard
          section="revenue"
          note={noteFor("revenue")}
          proposals={proposals}
        />
      </div>
      <TasksSection tasks={tasks} />
    </div>
  );
}
