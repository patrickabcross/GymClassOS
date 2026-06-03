---
phase: P3-ai-noticeboard-home
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - apps/staff-web/actions/list-inbox-summary.ts
  - apps/staff-web/actions/upsert-section-note.ts
  - apps/staff-web/actions/create-task.ts
  - apps/staff-web/actions/complete-task.ts
autonomous: true
requirements: [SC-2, SC-3, SC-4]
must_haves:
  truths:
    - "Noticeboard Inbox card can show a real computed unread/open count from list-inbox-summary"
    - "Agent can write a section body that upserts (one row per section) and persists across reload"
    - "Agent can create a prioritized task and mark a task completed; both persist in SQL"
  artifacts:
    - path: "apps/staff-web/actions/list-inbox-summary.ts"
      provides: "Inbox card computed subheading (unread + open conversation counts)"
      contains: "defineAction("
    - path: "apps/staff-web/actions/upsert-section-note.ts"
      provides: "Agent authors per-section dashboard note (upsert on section key)"
      contains: "onConflictDoUpdate"
    - path: "apps/staff-web/actions/create-task.ts"
      provides: "Agent creates a dashboard task with priority"
      contains: "defineAction("
    - path: "apps/staff-web/actions/complete-task.ts"
      provides: "Agent or coach marks a task complete"
      contains: "defineAction("
  key_links:
    - from: "apps/staff-web/actions/upsert-section-note.ts"
      to: "dashboard_notes (section UNIQUE)"
      via: "INSERT ... ON CONFLICT (section) DO UPDATE"
      pattern: "onConflictDoUpdate"
    - from: "apps/staff-web/actions/list-inbox-summary.ts"
      to: "conversations table"
      via: "COUNT(*) FILTER (WHERE unread_count > 0) excluding status='lead'"
      pattern: "FILTER \\(WHERE"
---

<objective>
Create the four read + authoring actions the agent and noticeboard need: a computed inbox-summary metric (for the Inbox card subheading), and three dashboard-authoring mutations (`upsert-section-note`, `create-task`, `complete-task`) that write into the migration-0005 tables. These are the "Tier 2 — author dashboard content" actions.

Purpose: Backs SC-2 (real computed Inbox metric) and SC-3/SC-4 (agent authors section notes + tasks that persist in SQL).
Output: 4 new `defineAction` files. Auto-registered into `.generated/actions-registry.js` by the Vite plugin on dev/build restart (no manual registration).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md
@apps/staff-web/actions/list-fill-rate.ts
@apps/staff-web/server/db/schema.ts

<interfaces>
<!-- defineAction convention (verified from list-fill-rate.ts):
       import { z } from "zod";
       import { defineAction } from "@agent-native/core";
       import { getDb, schema } from "../server/db/index.js";  // .js ESM extension
       import { eq, and, ne, sql, count } from "drizzle-orm";
       export default defineAction({ description, schema: z.object({...}), http: { method: "GET" } | default POST, run: async (args) => {...} });
     - guard:allow-unscoped comment REQUIRED on every query against gym/dashboard tables (single-tenant).
     - Read actions: http: { method: "GET" }. Mutations: omit http (defaults to POST) — POST triggers useDbSync invalidation.
     - Return structured objects/arrays, never JSON.stringify().
     - nanoid for ids: import { nanoid } from "nanoid".
     - New P3 tables available on schema after Plan 01: schema.dashboardNotes, schema.dashboardTasks, schema.dashboardProposals.
     - conversations has columns: status (open/closed/snoozed/lead), unreadCount (snake unread_count). Exclude status='lead' from inbox counts (leads are not WhatsApp inbox conversations). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create list-inbox-summary read action (Inbox card metric)</name>
  <read_first>
    - apps/staff-web/actions/list-fill-rate.ts (canonical GET read-action shape + guard:allow-unscoped placement)
    - apps/staff-web/actions/list-renewals.ts (a simpler scalar-aggregate read action returning an object)
    - apps/staff-web/app/routes/gymos._index.tsx lines 30-130 (how the inbox loader counts unread/open conversations today — mirror the same filter semantics: exclude status='lead')
  </read_first>
  <action>
Create `apps/staff-web/actions/list-inbox-summary.ts`:

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { ne, sql, count } from "drizzle-orm";

export default defineAction({
  description:
    "Summarise the WhatsApp inbox — unread conversation count and open conversation count. " +
    "Used by the noticeboard Inbox card subheading and for 'how many unread?' questions. " +
    "Excludes lead conversations (status='lead'). Returns { unreadConversations, openConversations, asOf }.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    const [unreadRow] = await db
      .select({ c: sql<number>`COUNT(*) FILTER (WHERE ${schema.conversations.unreadCount} > 0)` })
      .from(schema.conversations)
      .where(ne(schema.conversations.status, "lead"));
    // guard:allow-unscoped — single-tenant gym tables
    const [openRow] = await db
      .select({ c: count() })
      .from(schema.conversations)
      .where(ne(schema.conversations.status, "lead"));
    return {
      unreadConversations: Number(unreadRow?.c ?? 0),
      openConversations: Number(openRow?.c ?? 0),
      asOf: new Date().toISOString(),
    };
  },
});
```

If the Drizzle column for unread is named differently than `schema.conversations.unreadCount` (confirm by reading schema.ts), use the actual export name — the SQL column is `unread_count`. Do NOT invent a column.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/list-inbox-summary.ts contains "defineAction(" and 'http: { method: "GET" }'
    - File contains "FILTER (WHERE" and "ne(schema.conversations.status, \"lead\")"
    - File contains a "guard:allow-unscoped" comment
    - Return object has keys unreadConversations, openConversations, asOf
    - Replaying the two SELECTs against gymos-demo Neon returns integer counts (unread <= open) — verify via Neon MCP, no cleanup needed (read-only)
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>list-inbox-summary returns real unread + open conversation counts (leads excluded); typechecks; SQL replays against Neon return sane integers.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create upsert-section-note authoring action (upsert on section key)</name>
  <read_first>
    - apps/staff-web/actions/list-fill-rate.ts (action skeleton)
    - apps/staff-web/server/db/schema.ts (dashboardNotes export from Plan 01 — confirm column names section/body/createdAt/updatedAt)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"Pattern 2: upsert-section-note Action"
  </read_first>
  <action>
Create `apps/staff-web/actions/upsert-section-note.ts` (POST mutation — omit `http`):

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Write or update the AI note shown on a dashboard section card (or the AI-today header strip). " +
    "Upserts by section — calling again with the same section REPLACES the note (does not append). " +
    "Sections: inbox, schedule, members, revenue, ai_today. Body is free prose, max 2000 chars. " +
    "Use this to surface a recommendation or a recently-taken-action summary on the noticeboard.",
  schema: z.object({
    section: z
      .enum(["inbox", "schedule", "members", "revenue", "ai_today"])
      .describe("Which dashboard section card the note belongs to"),
    body: z
      .string()
      .max(2000)
      .describe("The note prose. Concise. Replaces any existing note for this section."),
  }),
  run: async ({ section, body }) => {
    const db = getDb();
    const nowIso = new Date().toISOString();
    const id = `dnote_${section}`;
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db
      .insert(schema.dashboardNotes)
      .values({ id, section, body, createdAt: nowIso, updatedAt: nowIso })
      .onConflictDoUpdate({
        target: schema.dashboardNotes.section,
        set: { body, updatedAt: nowIso },
      });
    return { section, updated: true };
  },
});
```
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/upsert-section-note.ts contains "defineAction(" and "onConflictDoUpdate"
    - schema uses z.enum(["inbox", "schedule", "members", "revenue", "ai_today"]) and z.string().max(2000)
    - File does NOT set http: { method: "GET" } (it is a POST mutation)
    - File contains a "guard:allow-unscoped" comment
    - Replaying INSERT...ON CONFLICT (section) twice for section='members' against gymos-demo Neon yields exactly ONE row for that section with the second body value; then delete the test row (id='dnote_members') — verify via Neon MCP
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>upsert-section-note replaces (not appends) the note for a section; verified single-row upsert against Neon; test row cleaned up; typechecks.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Create create-task + complete-task authoring actions</name>
  <read_first>
    - apps/staff-web/actions/list-fill-rate.ts (action skeleton)
    - apps/staff-web/server/db/schema.ts (dashboardTasks export — columns id/title/body/priority/status/proposalId/createdAt/completedAt)
    - apps/staff-web/actions/send-template-to-members.ts (nanoid id pattern: `prefix_${nanoid()}`)
  </read_first>
  <action>
Create TWO files.

`apps/staff-web/actions/create-task.ts` (POST mutation):

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Create a prioritized task on the noticeboard Tasks list. " +
    "priority: 1=high, 2=medium, 3=low. Optionally link to a proposal via proposalId " +
    "so the task row shows a one-click Approve button. Returns { taskId }.",
  schema: z.object({
    title: z.string().min(1).max(200).describe("Short task title (the headline line)"),
    body: z.string().max(1000).optional().describe("Optional detail shown under the title"),
    priority: z.coerce.number().int().min(1).max(3).optional().default(2)
      .describe("1=high, 2=medium, 3=low"),
    proposalId: z.string().optional()
      .describe("Optional dashboard_proposals.id to attach a one-click action to this task"),
  }),
  run: async ({ title, body, priority, proposalId }) => {
    const db = getDb();
    const id = `dtask_${nanoid()}`;
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db.insert(schema.dashboardTasks).values({
      id,
      title,
      body: body ?? null,
      priority,
      status: "open",
      proposalId: proposalId ?? null,
      createdAt: new Date().toISOString(),
    });
    return { taskId: id };
  },
});
```

`apps/staff-web/actions/complete-task.ts` (POST mutation):

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Mark a noticeboard task as completed. Sets status='completed' and stamps completed_at. " +
    "Called by the coach (clicking Mark done) or by the agent after it finishes the task's work. " +
    "Returns { taskId, completed }.",
  schema: z.object({
    taskId: z.string().min(1).describe("dashboard_tasks.id to complete"),
  }),
  run: async ({ taskId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db
      .update(schema.dashboardTasks)
      .set({ status: "completed", completedAt: new Date().toISOString() })
      .where(eq(schema.dashboardTasks.id, taskId));
    return { taskId, completed: true };
  },
});
```
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/create-task.ts contains "defineAction(" and "schema.dashboardTasks" and `dtask_${nanoid()}`
    - create-task schema has priority z.coerce.number().int().min(1).max(3) defaulting to 2
    - apps/staff-web/actions/complete-task.ts contains "defineAction(" and "status: \"completed\"" and "completedAt"
    - Both files contain a "guard:allow-unscoped" comment and do NOT set http GET (POST mutations)
    - Replay against gymos-demo Neon: INSERT a dtask_test task (priority 1), UPDATE it to completed, confirm status='completed' + completed_at non-null, then DELETE the test row — verify via Neon MCP
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>create-task inserts a prioritized open task; complete-task flips it to completed with a timestamp; verified via Neon replay + cleanup; typechecks.</done>
</task>

</tasks>

<verification>
- All four action files compile (staff-web `tsc --noEmit` clean).
- Each query carries a guard:allow-unscoped marker (single-tenant gym/dashboard tables).
- upsert-section-note proven to upsert (single row per section) via Neon replay; create/complete-task proven via Neon replay; all test rows cleaned up.
- VERIFICATION CONSTRAINT honored: no local HTTP. Actions are exercised by replaying their SQL against gymos-demo Neon + tsc. True over-HTTP invocation + agent tool-calling is deferred to the Plan 06 e2e smoke on the live Vercel deploy.
- NOTE: these actions are auto-registered by the Vite plugin into .generated/actions-registry.js on the next dev/build — no manual registration. The agent will only CALL them once the system prompt names them (Plan 05).
</verification>

<success_criteria>
SC-2 (Inbox card real metric) and SC-3/SC-4 (persisted agent-authored notes + tasks) have their action layer in place. The noticeboard UI (Plan 04) consumes list-inbox-summary; the propose/approve plan (Plan 03) reuses the same patterns; Plan 05 names create-task/complete-task/upsert-section-note in the system prompt.
</success_criteria>

<output>
After completion, create `.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-02-SUMMARY.md` recording the actual conversations unread column export name used, and the Neon replay results for the upsert + task lifecycle checks.
</output>
