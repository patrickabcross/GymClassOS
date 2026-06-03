// GymClassOS AI Noticeboard — P3 home (replaces the WhatsApp inbox as /gymos index).
//
// P3-04: This file replaces the old inbox (moved verbatim to gymos.inbox.tsx).
// /gymos is now the post-login landing — a Polsia-style noticeboard dashboard.
//
// Loader: persisted dashboard state (notes/tasks/proposals). Live list-* metrics
// are fetched client-side via useActionQuery inside the section components (Plan 05).
// The three fast single-tenant Drizzle SELECTs keep TTFB low (no fan-out queries here).
//
// Scaffold: Plan 05 replaces the data-noticeboard-* placeholder divs with live
// AiTodayStrip / BoardCard grid / TasksSection components.
//
// Requirements backed: SC-1 (structural foundation — /gymos is the noticeboard).
import { useLoaderData } from "react-router";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";

export function meta() {
  return [{ title: "GymClassOS — Home" }];
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
  return (
    <div className="flex flex-col gap-4 p-6 h-full overflow-y-auto bg-muted/40">
      {/* AiTodayStrip — Plan 05 */}
      <div data-noticeboard-ai-today className="min-h-[44px]" />
      {/* Section cards — Plan 05 fills with <BoardCard /> */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-4"
        data-noticeboard-cards
      />
      {/* Tasks — Plan 05 */}
      <div data-noticeboard-tasks />
    </div>
  );
}
