# Phase P3: AI Noticeboard Home — Research

**Researched:** 2026-06-03
**Domain:** React Router v7 CSR dashboard UI + agent-authored SQL state + propose→approve→execute handshake
**Confidence:** HIGH (all critical claims grounded in actual codebase files)

---

<user_constraints>
## User Constraints (from ROADMAP.md — no CONTEXT.md for this phase)

### Locked Decisions
1. **AI role = "Suggest + one-click act".** AI proposes an action (draft a win-back WhatsApp to lapsing members, promote an under-filled class); coach approves with one click; AI executes via the **existing** actions (`send-template-to-members`, `create-checkout-link`, `navigate`). CRITICAL: existing WhatsApp compliance gates (opt-in + 24h window + approved-template, enforced at the worker chokepoint) MUST stay in force — one-click approve does NOT bypass them. Coach approves every send.
2. **Progress subheadings = computed** from existing `list-*` actions wherever a real metric exists (`list-fill-rate`, `list-renewals`, `list-at-risk-members`, `list-revenue`, inbox unread/open counts); AI-written prose only fills gaps + section bodies.
3. **V1 sections** = Inbox (WhatsApp), Schedule, Members, Revenue — PLUS an "AI today" status header strip (what the agent just did / is working on) and an AI-curated overall **Tasks** section (prioritized; each task can carry a one-click action).

### Claude's Discretion
None explicitly listed for this phase — see "Open Questions" section below for recommendations on deferred design choices.

### Deferred Ideas (OUT OF SCOPE)
None explicitly listed. The scope boundary is the noticeboard itself: new tables + new actions + new `/gymos` home route + AGENTS.md update. All other `/gymos/*` surfaces are untouched.
</user_constraints>

---

## Summary

Phase P3 replaces the `/gymos` post-login landing (currently the WhatsApp inbox at `gymos._index.tsx`) with a noticeboard dashboard. The inbox moves to a dedicated sub-route or becomes a sibling view, and the noticeboard becomes the new `gymos._index.tsx`. This phase requires all four areas of the agent-native contract: new UI route, two new SQL tables (or equivalent), three–four new actions, and an AGENTS.md update that transitions the agent from "read-only for pilot" to "suggest + one-click act."

The codebase investigation found that all six named `list-*` actions (`list-fill-rate`, `list-renewals`, `list-at-risk-members`, `list-revenue`, `list-classes`, `list-members`) exist with verified signatures. The two target action operations (`send-template-to-members`, `create-checkout-link`) also exist and both route through the worker chokepoint without any direct Meta API call from staff-web. The security-critical `enqueueOutboundWhatsApp` path is already the only approved outbound route.

The key architectural decision for storage is **dedicated tables over `application_state`** for the dashboard state. The agent writes structured records (tasks with priority/status, section notes with section keys, pending proposals with action payloads) that need typed queries, ordered results, and the ability to survive process restarts. `application_state` is an unscoped key-value store designed for ephemeral UI state (composes, navigations, signals) — it would require JSON blob extraction for every dashboard query and can't be directly queried by the UI's data hooks.

**Primary recommendation:** Build `dashboard_notes`, `dashboard_tasks`, and `dashboard_proposals` as three small additive Neon tables (migration 0005). New actions `upsert-section-note`, `create-task`, `complete-task`, `propose-action`, and `approve-proposal` wire the agent authoring loop. The noticeboard UI route is a CSR page that fetches all five sections in parallel using the existing `useActionQuery` hook pattern.

---

## Project Constraints (from CLAUDE.md)

- TypeScript everywhere — `.ts`/`.tsx` only
- shadcn/ui primitives for all standard UI; no custom dropdowns/modals/popovers
- Tabler icons (`@tabler/icons-react`) only — no emojis as icons, no Lucide, no inline SVG
- `defineAction` is the only path for new operations (Six Rules #3)
- No `studio_id` — single-tenant code, multi-tenant deploy
- Gym domain tables don't use `ownableColumns()` — `guard:allow-unscoped` marker required on all queries
- `drizzle-kit push` is blocked; all schema changes via additive `.sql` files applied directly to Neon via MCP
- `db.ts` does NOT auto-run gymos migrations — each `.sql` file must be applied manually
- staff-web MUST NOT import `@gymos/whatsapp` — enforced by `guard-no-whatsapp-in-staff-web.mjs`
- No `json()` from `react-router` — loaders return plain objects
- Path alias is `@/*` (not `~/`) — `apps/staff-web/tsconfig.json` only defines `@/*`
- Optimistic UI on every mutation — never await a server round-trip before updating the screen
- Strictly additive DB changes — never rename or drop a column or table

---

## Critical Codebase Investigation

### 1. The Existing `/gymos` Landing Page

**File:** `apps/staff-web/app/routes/gymos._index.tsx` (915 lines)

This is the **WhatsApp inbox** — conversation list on the left, selected thread on the right, member context panel on the far right. It is a React Router **loader-backed route** (not ClientOnly) that fetches conversations, window state, opt-in state, templates, and member context in the loader. The `action()` handles outbound sends.

The layout shell is `apps/staff-web/app/routes/gymos.tsx` — a thin wrapper that renders `<GymosTopNav />` + `<Outlet />`. The current inbox renders inside that Outlet when the user visits `/gymos` (the index route).

**P3 replaces `gymos._index.tsx` with the noticeboard.** The existing inbox becomes `gymos.inbox.tsx` (or stays accessible via the "Inbox" nav tab link in `GymosTopNav.tsx`). The noticeboard becomes the new index. This is the most impactful structural change.

The `<AgentSidebar>` right-rail is wired in `AppLayout.tsx:145–161`:
```tsx
if (location.pathname.startsWith("/gymos")) {
  return (
    <div data-gymos-agent-sidebar className="flex flex-1 min-w-0 min-h-0">
      <AgentSidebar position="right" defaultOpen={!isMobile} ...>
        {children}
      </AgentSidebar>
    </div>
  );
}
```
The noticeboard needs no changes here — it automatically gets the right-rail.

**CSR note (from locked decisions):** The noticeboard is a logged-in page, so ClientOnly wrapping is allowed. However, looking at existing gymos routes (`gymos._index.tsx`, `gymos.analytics.tsx`, `gymos.campaigns.tsx`), they are **NOT wrapped in ClientOnly** — they use React Router loaders (SSR) but only load real data after auth is confirmed. The simplest approach is to follow the same loader pattern the existing routes use: the noticeboard's data-heavy sections can be fetched in the loader using `Promise.all`, same as `gymos.analytics.tsx`. Alternatively, since the dashboard data comes from `useActionQuery` hooks (client-side after hydration), a hybrid approach works: loader returns basic layout data, hooks fetch the dynamic section content client-side. Given the locked decision says "CSR via `ClientOnly`" — follow that for the dashboard section queries (use `useActionQuery` per section), but the route file itself can still have a minimal server-side loader for auth-check / page title.

### 2. The Existing `list-*` Actions — Verified Signatures

All six actions exist at `apps/staff-web/actions/`. Signatures verified from source:

| Action | File | Input Params | Return Shape (for noticeboard subheadings) |
|--------|------|-------------|---------------------------------------------|
| `list-fill-rate` | `list-fill-rate.ts` | `{ days?: number (1–90, default 7) }` | `Array<{ occurrenceId, className, startsAt, capacity, booked, fillPct }>` — compute avg/min fillPct for the Schedule card subheading |
| `list-renewals` | `list-renewals.ts` | `{}` | `{ activeSubscriptions, subscriptionsRenewingNext30d, expiringPasses7d, expiringPasses30d, asOf }` — Members card uses `activeSubscriptions` + `expiringPasses7d` |
| `list-at-risk-members` | `list-at-risk-members.ts` | `{ inactiveDays?: number (7–180, default 14), limit?: number (1–50, default 25) }` | `Array<{ memberId, name, phoneE164, lastAttendedAt, bookingCount30d, earliestPassExpiry }>` — Members card uses `.length` as at-risk count |
| `list-revenue` | `list-revenue.ts` | `{}` | `{ mrrPence, mrrPounds, activeSubscribers, unlimitedCount, limitedCount, dropInRevenuePence30d, dropInRevenuePounds30d, tenPacksSold30d, arpmPence, arpmPounds, acquired30d, lost30d, net30d, asOf }` — Revenue card uses `mrrPounds` + `net30d` |
| `list-classes` | `list-classes.ts` | `{}` | Array of class definitions with occurrence counts |
| `list-members` | `list-members.ts` | optional name/phone filter | Array of member rows |

**Inbox unread/open counts:** These are NOT a standalone action. The inbox loader in `gymos._index.tsx` queries `conversations.unreadCount` directly via Drizzle. For the noticeboard Inbox card subheading, two options:
- (a) Write a new `list-inbox-summary` action that queries `COUNT(unreadCount > 0)` and `COUNT(status='open')` — recommended, keeps the noticeboard loader thin
- (b) Include the inbox summary query inline in the noticeboard loader via `getDb()` directly

Option (a) is cleaner for the agent to also call.

### 3. The Propose→Approve→Execute Target Actions

**`send-template-to-members`** (`apps/staff-web/actions/send-template-to-members.ts`)
- Input: `{ memberIds: string[] (1–500), templateName: string, variables?: Record<string, string> }`
- Returns: `{ queued, conversationsCreated, failed }`
- **Gate enforcement:** The action pre-checks `whatsapp_templates.status === 'approved'` before any enqueue (whole-batch gate). Per-member opt-in, opted-out, and window checks are enforced by the worker's `sendMessage()` chokepoint when the job runs. Staff-web never calls Meta directly — it calls `enqueueOutboundWhatsApp()` from `@/lib/queue-client`.
- The `guard-no-whatsapp-in-staff-web.mjs` script prevents any `@gymos/whatsapp` import in staff-web at CI time.

**`create-checkout-link`** (`apps/staff-web/actions/create-checkout-link.ts`)
- Input: `{ memberId: string, priceId: string, productName?: string }`
- Returns: `{ url, sessionId, productName }`
- Creates a Stripe Hosted Checkout session with `metadata.memberId` so the P1b-07 worker reducer binds the pass on `checkout.session.completed`.

**`navigate`** (`apps/staff-web/actions/navigate.ts`)
- Input: `{ view?, threadId?, settingsSection?, queuedDraftId?, composeDraftId? }`
- Uses `writeAppState("navigate", nav)` — agent-only action (`http: false`)
- Note: the navigate action's description still says "email thread" vocabulary. P3 should update the action description to include gymos route names (inbox, schedule, members, analytics, campaigns). This is part of the AGENTS.md + agent-posture update.

**The security-critical path for one-click approve:**
When the coach approves a proposal on the noticeboard, the approve action MUST:
1. Look up the `dashboard_proposals` row by ID
2. Validate the stored action name is in an allowlist (`send-template-to-members`, `create-checkout-link`)
3. Call the target action's `run()` function (or invoke it via HTTP at `/_agent-native/actions/:name`) with the stored params
4. Mark the proposal as `approved` in `dashboard_proposals`

This ensures the worker chokepoint gates are hit — the approve handler itself never touches Meta or Stripe directly, it just calls the same existing actions.

### 4. `defineAction` Pattern in Staff-Web

Verified from `list-fill-rate.ts` and `list-renewals.ts`:

```typescript
// apps/staff-web/actions/<action-name>.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js"; // note: .js extension for ESM
import { ... } from "drizzle-orm";

export default defineAction({
  description: "...",
  schema: z.object({ ... }),
  http: { method: "GET" },  // or POST (default) for mutations
  run: async (args) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    const rows = await db.select({ ... }).from(schema.someTable).where(...);
    return rows;
  },
});
```

Key conventions:
- Import path for DB: `"../server/db/index.js"` (ESM `.js` convention — resolves to `.ts` at dev time)
- `guard:allow-unscoped` comment required on every query touching gym domain tables
- Return structured data (objects/arrays), never `JSON.stringify()`
- Zod schema with `.describe()` on each parameter
- `http: { method: "GET" }` for read-only, default (POST) for mutations
- `http: false` for agent-only actions (no HTTP endpoint)

### 5. Agent Chat Right-Rail and Action Registration

From `apps/staff-web/server/plugins/agent-chat.ts`:
```typescript
import actionsRegistry from "../../.generated/actions-registry.js";

export default createAgentChatPlugin({
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  appId: "gymos",
  systemPrompt: `...`,
});
```

The `.generated/actions-registry.js` file is **auto-generated by a Vite plugin** — it scans `actions/` and registers every `defineAction` export. **New P3 actions are automatically picked up** after the dev server restarts. No manual registration step.

The system prompt in `agent-chat.ts` is the gate for which tools the agent "knows" to call. Currently it names the 7 read-only tools. For P3, the system prompt must be updated to name the new dashboard-authoring tools (`upsert-section-note`, `create-task`, `complete-task`, `propose-action`) AND to remove the "READ-ONLY for pilot" constraint and replace it with the suggest-and-act posture.

**CRITICAL:** The system prompt update is the mechanism that unlocks agent authoring. Simply adding the action files is not enough — they must be named in the system prompt or the LLM won't call them.

### 6. SQL Migration Pattern for Gymos

Migration files live at: `apps/staff-web/server/db/migrations/`

Existing files:
- `0000_gymos_postgres_initial.sql` — initial demo schema
- `0001_p1b_webhook_worker_spine.sql` — P1b additions (whatsapp_opt_in, templates, stripe tables, secrets, pgcrypto)
- `0002_campaign_opt_out.sql` — opt-out column
- `0003_p1c_public_site_leads.sql` — lead funnel (conversations.status CHECK, partial uniques)
- `0004_p1c_forms_responses.sql` — forms + responses tables

**`db.ts` does NOT auto-run these.** The `getDb()` function in `apps/staff-web/server/db/index.ts` is just `createGetDb(schema)` — no migration runner. Migrations must be applied directly to `gymos-demo` Neon via the Neon MCP (`mcp__Neon__run_sql_transaction`), verified by querying the table, then committed to git.

P3 migration filename: `0005_p3_dashboard_state.sql`

**Drizzle schema update:** After applying the SQL, the Drizzle schema (`apps/staff-web/server/db/schema.ts`) must be updated with the new table definitions so TypeScript types resolve. The schema file uses the `table()` helper from `@agent-native/core/db/schema`.

### 7. Drizzle Schema and the Ambiguous-ID Gotcha

Gymos domain tables are defined in `apps/staff-web/server/db/schema.ts`. The table helper is:
```typescript
import { table, text, integer, real, now } from "@agent-native/core/db/schema";
```

**Ambiguous-ID gotcha (documented in MEMORY.md):** When a query has a single-table `FROM`, Drizzle drops table qualifiers on `WHERE` columns. But correlated subqueries that reference the outer table's `id` column need the **literal string qualifier** (e.g., `"gym_members"."id"`) — NOT `${schema.gymMembers.id}`. Using `${schema.gymMembers.id}` inside a correlated subquery generates bare `"id"` which is ambiguous with the inner table's id → Postgres error 42702.

For P3 new tables (`dashboard_tasks`, `dashboard_notes`, `dashboard_proposals`), the PKs are all `id TEXT PRIMARY KEY`, same convention. Correlated subqueries involving these tables must use literal qualified column names.

**Important:** `text()` columns use ISO string timestamps (not `integer` epoch). The upstream Mail tables use `integer` epoch; the GymClassOS tables use `text` ISO strings. New P3 tables should follow the GymClassOS convention (`text().default(now())`).

### 8. `application_state` vs Dedicated Tables — Recommendation

**`application_state` is NOT the right choice for P3 dashboard state.** Here's why:

`application_state` (from `@agent-native/core/application-state`) is a key-value store backed by the framework's `application_state` SQL table. It's designed for **ephemeral UI state** — compose windows, navigation commands, refresh signals. Examples in use: `writeAppState("navigate", nav)`, `writeAppState("compose-${id}", draft)`, `writeAppState("refresh-signal", { ts: Date.now() })`.

Its limitations for dashboard state:
- No typed schema — values are arbitrary JSON blobs stored as text
- No ORDER BY on tasks (priority sort requires SQL ORDER, not key-value)
- No WHERE filtering on section keys — would require fetching all state and filtering in JS
- Scoped per-user in the framework's multi-tenant model, but gym tables are single-tenant — mismatch in the access model
- Can't be queried by `useActionQuery` directly — would need a custom action anyway

**Recommendation: Three dedicated tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `dashboard_notes` | Per-section AI-authored notes (recommendation text, last-action summary) | `id TEXT PK`, `section TEXT` (inbox/schedule/members/revenue/ai_today), `body TEXT`, `createdAt TEXT`, `updatedAt TEXT` |
| `dashboard_tasks` | AI-curated prioritized tasks list | `id TEXT PK`, `title TEXT`, `body TEXT`, `priority INTEGER` (1=high, 3=low), `status TEXT` (open/completed), `proposalId TEXT` (nullable FK), `createdAt TEXT`, `completedAt TEXT` |
| `dashboard_proposals` | Pending one-click action proposals | `id TEXT PK`, `taskId TEXT` (nullable FK), `actionName TEXT` (enum: send-template-to-members/create-checkout-link), `paramsJson TEXT` (JSON), `proposedAt TEXT`, `status TEXT` (pending/approved/rejected/executed), `executedAt TEXT`, `resultJson TEXT` |

**Why `dashboard_notes` is a UPSERT target on `section` key** (not a new row per update): The agent should replace the current section note, not append indefinitely. The `upsert-section-note` action does `INSERT ... ON CONFLICT (section) DO UPDATE SET body = $body, updatedAt = $now`. The `section` column gets a UNIQUE constraint.

**Why `dashboard_proposals` has `status` lifecycle:** The propose→approve→execute round-trip needs an audit trail (what was proposed, approved, and what the result was). Storing the full `paramsJson` also makes the approve handler verifiable — the coach can see exactly what will be sent before approving.

### 9. Existing Card Layout Precedent

**`gymos.analytics.tsx`** is the most directly reusable precedent. It uses:
- `Card`, `CardContent`, `CardHeader` from `@/components/ui/card`
- `Badge` from `@/components/ui/badge`
- Tabler icons: `IconTrendingUp`, `IconTrendingDown`, `IconMinus`
- KPI metric sizing: `text-3xl font-semibold` for primary values, `text-4xl font-semibold` for the hero MRR metric
- `text-[12px] uppercase` label style (NOT shadcn CardTitle — it's a plain `<div>`)
- Grid layout: `grid grid-cols-2 gap-4` on mobile, `md:grid-cols-4` for wider screens

**`gymos.campaigns.tsx`** demonstrates:
- `AlertDialog` for confirmation before destructive mutation
- `useFetcher` for form submissions without full navigation
- Segment-info cards with `Card` + computed count badges

**Available shadcn primitives in `apps/staff-web/app/components/ui/`** (full list confirmed):
accordion, alert-dialog, alert, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input-otp, input, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toast, toaster, toggle-group, toggle, tooltip

**Noticeboard aesthetic options** (for UI-SPEC.md research):
- The "Polsia-style / bulletin board" aesthetic suggests a 2-column card grid with visible card borders, possibly a slight off-white or kraft-paper-tone background for the board area, pinned-card visual metaphor using `border-border` + subtle `shadow-sm`, section headers as bold label tabs or pinned-tape-style visual dividers
- The existing gymos surfaces use `bg-card/40` and `border-border/50` for a light-wash panel effect — the noticeboard can lean into this further
- Tasks section could use a vertical list with priority indicators (colored left-border strips: red for high, yellow for medium, gray for low) using `border-l-4` Tailwind utility
- The "AI today" header strip could be a full-width banner using `bg-muted/50` with an AI indicator icon (suggestion: `IconRobot` or `IconBulb` from Tabler — NOT a sparkle/wand per AGENTS.md)
- One-click approve buttons: `Button variant="default" size="sm"` with a checkmark icon (`IconCheck`)

---

## Standard Stack

### Core (all already in staff-web)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| React Router v7 | `^7.13.x` | Route file `gymos._index.tsx` (replacing inbox with noticeboard) | Already used by all gymos routes |
| Drizzle ORM | `^0.45.x` | New table definitions + queries | Already in agent-native |
| `@agent-native/core` `defineAction` | same monorepo | New actions | Required by Six Rules #3 |
| shadcn/ui `Card`, `Badge`, `Button`, `Dialog`, `AlertDialog`, `Skeleton` | existing install | Noticeboard UI | Already installed |
| `@tabler/icons-react` | existing install | Section icons | AGENTS.md mandate |
| `nanoid` | `^5.1.x` | Generate IDs for new table rows | Already in staff-web |
| `@tanstack/react-query` `useActionQuery` / `useActionMutation` | existing | Client-side data fetching | Already used in staff-web |
| `zod` v4 | existing | Action schemas | Already in staff-web |

### No New Dependencies Required
P3 does not require any new npm packages. All required libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure for P3

```
apps/staff-web/
├── actions/
│   ├── list-inbox-summary.ts          # NEW: unread/open count for noticeboard
│   ├── upsert-section-note.ts         # NEW: agent writes section body
│   ├── create-task.ts                 # NEW: agent creates a task
│   ├── complete-task.ts               # NEW: agent or coach completes a task
│   ├── propose-action.ts              # NEW: agent creates a pending proposal
│   └── approve-proposal.ts           # NEW: coach approves → executes target action
├── app/routes/
│   ├── gymos._index.tsx               # REPLACE with noticeboard dashboard
│   ├── gymos.inbox.tsx               # NEW: move current gymos._index.tsx content here
│   └── gymos.tsx                     # UNCHANGED layout shell
├── app/components/gymos/
│   ├── GymosTopNav.tsx               # EDIT: add "Home" tab, rename "Inbox"
│   ├── Noticeboard/
│   │   ├── BoardCard.tsx             # Section card with title/metric/note/proposals
│   │   ├── TasksSection.tsx          # Tasks list with priority + complete/approve
│   │   └── AiTodayStrip.tsx          # Header strip showing agent's recent activity
│   └── TemplatesDialog.tsx           # UNCHANGED
└── server/db/
    ├── migrations/
    │   └── 0005_p3_dashboard_state.sql # NEW: dashboard_notes + dashboard_tasks + dashboard_proposals
    └── schema.ts                      # ADD: new table exports
```

### Pattern 1: Noticeboard Route (CSR hybrid)

The noticeboard `gymos._index.tsx` uses a minimal server loader for the page title + auth check, then client-side `useActionQuery` calls for each section's live data. This avoids the "loader fans out 6+ queries in parallel on every navigation" problem while still rendering something immediately.

```typescript
// apps/staff-web/app/routes/gymos._index.tsx (P3 version)
// Server loader — only fetches dashboard_notes, dashboard_tasks, dashboard_proposals
// (persisted state lives in SQL, minimal query). Live metrics fetch client-side.
export async function loader() {
  const db = getDb();
  // guard:allow-unscoped — single-tenant gym tables
  const [notes, tasks, proposals] = await Promise.all([
    db.select().from(schema.dashboardNotes),
    db.select().from(schema.dashboardTasks)
      .where(eq(schema.dashboardTasks.status, "open"))
      .orderBy(schema.dashboardTasks.priority),
    db.select().from(schema.dashboardProposals)
      .where(eq(schema.dashboardProposals.status, "pending")),
  ]);
  return { notes, tasks, proposals };
}

export default function Noticeboard() {
  const { notes, tasks, proposals } = useLoaderData();
  // Live metrics fetched client-side via useActionQuery
  const { data: fillRate } = useActionQuery("list-fill-rate", { days: 7 });
  const { data: renewals } = useActionQuery("list-renewals", {});
  const { data: atRisk } = useActionQuery("list-at-risk-members", { limit: 10 });
  const { data: revenue } = useActionQuery("list-revenue", {});
  const { data: inbox } = useActionQuery("list-inbox-summary", {});
  // ... render BoardCard components
}
```

### Pattern 2: `upsert-section-note` Action

```typescript
// apps/staff-web/actions/upsert-section-note.ts
export default defineAction({
  description: "Write or update the AI note for a dashboard section...",
  schema: z.object({
    section: z.enum(["inbox", "schedule", "members", "revenue", "ai_today"]),
    body: z.string().max(2000),
  }),
  // default: POST (mutation — triggers UI refresh via useDbSync)
  run: async ({ section, body }) => {
    const db = getDb();
    const id = `dnote_${section}`;
    // guard:allow-unscoped — single-tenant gym tables
    await db.insert(schema.dashboardNotes).values({
      id, section, body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: schema.dashboardNotes.section,
      set: { body, updatedAt: new Date().toISOString() },
    });
    return { section, updated: true };
  },
});
```

### Pattern 3: Propose→Approve→Execute Handshake

```typescript
// apps/staff-web/actions/propose-action.ts
// Agent calls this to create a pending proposal visible on the noticeboard
export default defineAction({
  description: "Propose a one-click action for the coach to approve...",
  schema: z.object({
    taskId: z.string().optional(),
    actionName: z.enum(["send-template-to-members", "create-checkout-link"]),
    params: z.record(z.unknown()),
    rationale: z.string().max(500).describe("Why the agent is recommending this"),
  }),
  run: async ({ taskId, actionName, params, rationale }) => {
    const db = getDb();
    const id = `dprop_${nanoid()}`;
    // guard:allow-unscoped
    await db.insert(schema.dashboardProposals).values({
      id, taskId: taskId ?? null,
      actionName, paramsJson: JSON.stringify(params),
      rationale, status: "pending",
      proposedAt: new Date().toISOString(),
    });
    return { proposalId: id };
  },
});

// apps/staff-web/actions/approve-proposal.ts
// Coach clicks "Approve" → this action executes the stored proposal
// SECURITY: allowlist check + calls existing gated actions only
const ACTION_ALLOWLIST = ["send-template-to-members", "create-checkout-link"] as const;

export default defineAction({
  description: "Approve a pending AI proposal and execute it...",
  schema: z.object({ proposalId: z.string() }),
  run: async ({ proposalId }) => {
    const db = getDb();
    // guard:allow-unscoped
    const [proposal] = await db.select().from(schema.dashboardProposals)
      .where(and(
        eq(schema.dashboardProposals.id, proposalId),
        eq(schema.dashboardProposals.status, "pending"),
      ))
      .limit(1);
    if (!proposal) return { error: "Proposal not found or already actioned" };
    if (!ACTION_ALLOWLIST.includes(proposal.actionName as any)) {
      return { error: "Action not in allowlist" };
    }
    const params = JSON.parse(proposal.paramsJson);
    // Import the target action's run function directly (server-side execution)
    // This routes through the SAME action that enforces worker chokepoint
    let result: unknown;
    if (proposal.actionName === "send-template-to-members") {
      const action = await import("./send-template-to-members.js");
      result = await action.default.run(params);
    } else if (proposal.actionName === "create-checkout-link") {
      const action = await import("./create-checkout-link.js");
      result = await action.default.run(params);
    }
    // guard:allow-unscoped
    await db.update(schema.dashboardProposals)
      .set({ status: "executed", executedAt: new Date().toISOString(), resultJson: JSON.stringify(result) })
      .where(eq(schema.dashboardProposals.id, proposalId));
    return { executed: true, result };
  },
});
```

**IMPORTANT NOTE on importing action `run` functions:** The `defineAction` shape exposes `run` as a plain async function but the `defineAction` wrapper adds `description`, `schema`, etc. The clean way to invoke a target action server-side is to import the action module and call its `run` property (since `defineAction` exports an object with `.run`). This avoids an internal HTTP round-trip and keeps the execution in-process. An alternative is to call `/_agent-native/actions/send-template-to-members` via `fetch` internally — either works, but the direct import is cleaner and avoids the overhead.

### Pattern 4: GymosTopNav Update

The noticeboard replaces the inbox as the landing page, so the top-nav "Inbox" tab now links to `/gymos/inbox`, and a new "Home" tab links to `/gymos` (the noticeboard). The tab order becomes: **Home | Inbox | Schedule | Members | Payments | Analytics | Campaigns | Forms | Settings**.

```typescript
// GymosTopNav.tsx update
const isHome = path === "/gymos";
const isInbox = path.startsWith("/gymos/inbox");
// ... rest unchanged
```

### Anti-Patterns to Avoid

- **Do NOT call `writeAppState` for dashboard tasks/notes** — `application_state` is ephemeral and untyped; use dedicated SQL tables.
- **Do NOT call Meta or Stripe directly from `approve-proposal.ts`** — always route through the existing gated action functions.
- **Do NOT implement a "reject" proposal flow that silently discards the proposal** — set `status = 'rejected'` with a `rejectedAt` timestamp so the agent has feedback.
- **Do NOT add the new actions to the system prompt without also removing "READ-ONLY for pilot"** — the two must change together or the agent will receive contradictory instructions.
- **Do NOT render the noticeboard with a server-side loader that fetches all 6 metrics** — the 6 `list-*` actions each run SQL aggregations; fanning them all out in the SSR loader adds ~200–400ms to the initial navigation. Use `useActionQuery` for the live metrics, loader only for the persisted dashboard state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation before approve | Custom modal + useState | shadcn `AlertDialog` | Keyboard nav, focus trap, accessible |
| Task priority display | Custom badge system | shadcn `Badge` + Tabler icon | Consistent with existing gymos surfaces |
| Loading states per section | Custom spinner | shadcn `Skeleton` | Matches analytics route deferred pattern |
| Action allowlist security | Regex or string.includes | `z.enum([...])` in Zod schema + runtime check | Zod enum compile-time + runtime validates at HTTP boundary |
| Inbox unread count | Rewrite gymos._index.tsx logic | New `list-inbox-summary` action | Single source of truth, reusable by agent |

---

## Common Pitfalls

### Pitfall 1: Noticeboard Breaks Inbox Navigation
**What goes wrong:** P3 moves the inbox to `gymos.inbox.tsx`. The "Inbox" links in `GymosTopNav.tsx` currently point to `/gymos` (the index route). If the top-nav `<Link to="/gymos">` is not updated to `<Link to="/gymos/inbox">`, the inbox becomes unreachable from the nav after P3.
**How to avoid:** Update `GymosTopNav.tsx` in the same plan wave as creating `gymos.inbox.tsx`. Update `isInbox` check to `path.startsWith("/gymos/inbox")`.
**Warning signs:** "Inbox" tab highlights on the noticeboard home; clicking Inbox goes back to home.

### Pitfall 2: `approveProposal` Imports `run` Without the Action's Schema Validation
**What goes wrong:** If `approve-proposal.ts` calls a target action's `run()` directly, it bypasses the Zod validation layer that the HTTP endpoint performs. A malformed `paramsJson` stored in the database could cause a runtime error inside `sendMessage` with no typed error.
**How to avoid:** Parse and validate `params` through the target action's schema before calling `run()`. Extract the Zod schema from the action definition and call `.safeParse()` on the stored params. Reject if validation fails, return the Zod errors.

### Pitfall 3: Agent Calls `propose-action` Without Coach Visibility
**What goes wrong:** The agent proposes actions but the UI doesn't surface pending proposals prominently. Coach never sees the "Approve" buttons.
**How to avoid:** The `dashboard_proposals` table is fetched in the noticeboard loader. Pending proposals are displayed inline on the relevant BoardCard (e.g., a "send-template-to-members" proposal appears on the Members card) AND in the Tasks section if linked to a task. The AI-today strip also shows the count of pending proposals.

### Pitfall 4: `upsert-section-note` Appends Instead of Upserts
**What goes wrong:** Each agent note call adds a new row. The noticeboard shows stale old notes alongside the new one.
**How to avoid:** The `dashboard_notes` table has a UNIQUE constraint on `section`. The upsert uses `ON CONFLICT (section) DO UPDATE`. The migration SQL must include `UNIQUE (section)` on the section column.

### Pitfall 5: Dashboard Metrics Stale After Mutation
**What goes wrong:** Coach approves a proposal (e.g., sends a template batch). The Members card still shows the old at-risk count because `useActionQuery("list-at-risk-members")` is cached.
**How to avoid:** `useDbSync()` (already wired in `root.tsx`) polls `/_agent-native/poll` every 2 seconds and invalidates `["action"]` React Query keys after any mutating action completes. The `approve-proposal` action is a POST (default, mutating), so it triggers the invalidation. The `list-at-risk-members` query refetches automatically. No manual `queryClient.invalidateQueries` needed — but verify `useDbSync` is running (it's in `root.tsx:useDbSync()`).

### Pitfall 6: Drizzle Schema `table()` Helper vs `pgTable()`
**What goes wrong:** Staff-web's schema uses `table()` from `@agent-native/core/db/schema` (not `pgTable` from drizzle-orm/pg-core). New table definitions must use the same helper. If a developer uses `pgTable` directly, the `getDb()` factory won't include the new tables in its type inference.
**How to avoid:** All new table exports in `schema.ts` must use `import { table, text, integer, now } from "@agent-native/core/db/schema"`. The existing tables (e.g., `gymMembers`, `conversations`) all follow this pattern.

### Pitfall 7: Navigate Action Vocabulary Is Email-Centric
**What goes wrong:** The `navigate` action's description still says "email thread" / view names like "inbox, starred, sent, drafts." The agent may try to navigate to these views when the user is on the noticeboard.
**How to avoid:** Update the `navigate` action's Zod schema `.describe()` to include gymos route names (e.g., `home, inbox, schedule, members, analytics, campaigns, forms`). This is a one-line change per param.

---

## Code Examples

### Migration 0005 — Dashboard State Tables

```sql
-- apps/staff-web/server/db/migrations/0005_p3_dashboard_state.sql
-- P3: AI Noticeboard Home — dashboard state (additive)
-- Applied directly to gymos-demo Neon via Neon MCP (NOT runMigrations).

-- Per-section AI-authored notes (recommendation text, last-action summary).
-- UNIQUE(section) enables upsert-by-section-key.
CREATE TABLE IF NOT EXISTS dashboard_notes (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  CONSTRAINT dashboard_notes_section_unique UNIQUE (section)
);

-- AI-curated task list. priority: 1=high, 2=medium, 3=low.
CREATE TABLE IF NOT EXISTS dashboard_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed')),
  proposal_id TEXT, -- FK dashboard_proposals.id (nullable)
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  completed_at TEXT
);

-- Pending one-click action proposals. action_name is allowlisted in approve-proposal.ts.
CREATE TABLE IF NOT EXISTS dashboard_proposals (
  id TEXT PRIMARY KEY,
  task_id TEXT, -- FK dashboard_tasks.id (nullable)
  action_name TEXT NOT NULL
    CHECK (action_name IN ('send-template-to-members', 'create-checkout-link')),
  params_json TEXT NOT NULL DEFAULT '{}',
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
  proposed_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  executed_at TEXT,
  rejected_at TEXT,
  result_json TEXT
);
```

### Drizzle Schema Additions (`schema.ts`)

```typescript
// Add after the formSubmissions export in apps/staff-web/server/db/schema.ts

// P3: AI Noticeboard Home — dashboard state tables.
export const dashboardNotes = table("dashboard_notes", {
  id: text("id").primaryKey(),
  section: text("section", {
    enum: ["inbox", "schedule", "members", "revenue", "ai_today"],
  }).notNull(),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const dashboardTasks = table("dashboard_tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  priority: integer("priority").notNull().default(2), // 1=high, 2=medium, 3=low
  status: text("status", { enum: ["open", "completed"] }).notNull().default("open"),
  proposalId: text("proposal_id"), // nullable FK to dashboardProposals.id
  createdAt: text("created_at").notNull().default(now()),
  completedAt: text("completed_at"),
});

export const dashboardProposals = table("dashboard_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id"), // nullable FK to dashboardTasks.id
  actionName: text("action_name", {
    enum: ["send-template-to-members", "create-checkout-link"],
  }).notNull(),
  paramsJson: text("params_json").notNull().default("{}"),
  rationale: text("rationale"),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "executed"],
  }).notNull().default("pending"),
  proposedAt: text("proposed_at").notNull().default(now()),
  executedAt: text("executed_at"),
  rejectedAt: text("rejected_at"),
  resultJson: text("result_json"),
});
```

### `list-inbox-summary` New Action

```typescript
// apps/staff-web/actions/list-inbox-summary.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { ne, sql, count } from "drizzle-orm";

export default defineAction({
  description: "Summarise the WhatsApp inbox state — unread count and open conversation count. " +
    "Used by the noticeboard Inbox card subheading. " +
    "Returns { unreadConversations, openConversations, asOf }.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables
    const [unreadRow] = await db
      .select({ c: sql<number>`COUNT(*) FILTER (WHERE unread_count > 0)` })
      .from(schema.conversations)
      .where(ne(schema.conversations.status, "lead"));
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

### System Prompt Update in `agent-chat.ts`

The system prompt needs these changes:

1. Remove: `"You are READ-ONLY for the pilot. You cannot..."` block
2. Add the new tool names: `upsert-section-note`, `create-task`, `complete-task`, `propose-action`
3. Add guidance on the suggest-and-act posture: propose before acting; explain rationale; coach must approve sends

---

## AGENTS.md Update Plan

The file `apps/staff-web/AGENTS.md` currently has:

- Line 7: `"You are read-only for the pilot — coaches still own all mutations through the UI."`
- Lines 78–86: `"What the Agent CAN Do (read-only for pilot)"` / `"What the Agent CANNOT Do"` sections that state the agent cannot book, send WhatsApp, cancel bookings, etc.

**Required changes:**

1. Update the Role description to reflect suggest-and-act posture
2. Add new actions (`upsert-section-note`, `create-task`, `complete-task`, `propose-action`) to the Agent Actions table
3. Replace the binary "CAN/CANNOT" sections with a "How the Agent Acts" section that describes the three-tier model:
   - Tier 1 — **Read and Report:** Direct answers using `list-*` actions
   - Tier 2 — **Author Dashboard Content:** Write section notes and tasks using `upsert-section-note`, `create-task`
   - Tier 3 — **Propose + One-Click Act:** Use `propose-action` to queue a send or checkout link for coach approval; `approve-proposal` executes the gated action
4. Add a critical note: "Proposals for WhatsApp sends ALWAYS route through the existing worker chokepoint. One-click approve is not a bypass — the worker still enforces opt-in, 24h window, and approved-template gates."
5. Remove the "read-only" note about `create-checkout-link` (currently says it's not in the system prompt due to pilot posture)

---

## Environment Availability Audit

Step 2.6: SKIPPED for the most part — P3 is code/config changes with no new external service dependencies. All required tools (Neon MCP for migration apply, Vercel for deploy) are already in use.

One relevant note: The local `agent-native dev` server cannot boot (`NitroViteError`) — same constraint documented in STATE.md for P1c. All SQL verification must go through Neon MCP. No local HTTP walkthroughs are possible. Plan should verify new table creation and action behavior by:
1. Applying `0005` migration via Neon MCP and running verification queries
2. Running `pnpm tsc --noEmit` to verify TypeScript compiles cleanly
3. Deploying to Vercel and verifying the noticeboard renders with real data

---

## State of the Art

| Old Approach | Current Approach (P3) | Notes |
|--------------|----------------------|-------|
| Agent is "read-only for pilot" | Agent can author dashboard state + propose actions | Coach still approves every outbound send |
| `/gymos` index = WhatsApp inbox | `/gymos` index = noticeboard; inbox moves to `/gymos/inbox` | Top-nav needs "Home" tab addition |
| No persisted AI content in SQL | `dashboard_notes`, `dashboard_tasks`, `dashboard_proposals` tables | Migration 0005 |
| Agent proposes via chat prose | Agent proposes via `propose-action` → rendered approve button | Structured; survives page reload |

---

## Open Questions

1. **Where does the inbox route move?**
   - What we know: `gymos._index.tsx` currently IS the inbox. P3 needs the index for the noticeboard.
   - What's unclear: Does the inbox move to `/gymos/inbox` (new route file `gymos.inbox.tsx`) or to `/gymos?view=inbox` (search param)?
   - Recommendation: Move to `/gymos/inbox` as a proper route file (`gymos.inbox.tsx`). Search params are fragile for navigation. Update `GymosTopNav.tsx` link from `/gymos` to `/gymos/inbox`.

2. **Should the noticeboard loader fetch `dashboard_proposals` and join on `dashboard_tasks`, or fetch them separately?**
   - What we know: Tasks and proposals are separate tables with a nullable FK.
   - What's unclear: For the one-click approve UI, the BoardCard needs both the task title AND the proposal's action params.
   - Recommendation: Fetch both tables separately in `Promise.all`, join in JS by `task.proposalId`. Avoids a LEFT JOIN that could return duplicate rows if a task has multiple proposals.

3. **Should `reject-proposal` be a separate action or a param on `approve-proposal`?**
   - Recommendation: Add a `reject-proposal.ts` action for symmetry. The coach should be able to dismiss a proposal without approving it. The agent needs feedback on rejected proposals to learn not to re-propose the same thing immediately.

4. **Should the Tasks section support drag-to-reorder or is order-by-priority enough for V1?**
   - Recommendation: Order by `priority INTEGER` is sufficient for V1. Drag-to-reorder requires a client-side DnD library (not currently in staff-web) and adds complexity disproportionate to the V1 timeline.

5. **Should `propose-action` be callable from the agent chat, or only from other actions?**
   - Recommendation: Make it callable from agent chat (include in system prompt). The key use case is: coach says "recommend an action for the lapsing members" → agent calls `list-at-risk-members`, then calls `propose-action` with `send-template-to-members` params. The proposal appears on the noticeboard immediately.

---

## Sources

### Primary (HIGH confidence)
- `apps/staff-web/app/routes/gymos.tsx` — layout shell; `apps/staff-web/app/routes/gymos._index.tsx` — inbox (current landing); verified by direct read
- `apps/staff-web/actions/list-fill-rate.ts`, `list-renewals.ts`, `list-at-risk-members.ts`, `list-revenue.ts` — all action signatures verified by direct read
- `apps/staff-web/actions/send-template-to-members.ts`, `create-checkout-link.ts`, `navigate.ts` — target action signatures verified; queue-client path confirmed
- `apps/staff-web/server/db/schema.ts` — full gymos schema; all existing tables documented
- `apps/staff-web/server/db/migrations/` — migration file list (0000–0004); pattern confirmed
- `apps/staff-web/server/db/index.ts` — confirmed `db.ts` does NOT auto-run migrations
- `apps/staff-web/server/plugins/agent-chat.ts` — system prompt + action registration via static registry; auto-pickup on dev restart confirmed
- `apps/staff-web/app/components/layout/AppLayout.tsx` — gymos AgentSidebar layout (lines 145–161)
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — full tab list + active-tab logic
- `.agents/skills/actions/SKILL.md` — `defineAction` pattern, `useActionQuery`/`useActionMutation` hooks
- `.agents/skills/storing-data/SKILL.md` — `application_state` vs dedicated tables
- `apps/staff-web/AGENTS.md` — current agent posture ("read-only for pilot")
- `.planning/config.json` — `nyquist_validation: false` → Validation Architecture section omitted

### Secondary (MEDIUM confidence)
- ROADMAP.md §Phase P3 — locked decisions, success criteria, scope
- STATE.md — Accumulated Context (P1b.1 decisions, migration apply pattern, NitroViteError constraint)
- `apps/staff-web/app/routes/gymos.analytics.tsx`, `gymos.campaigns.tsx` — UI pattern precedent

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing patterns verified from source
- Architecture (route replacement, action registration): HIGH — verified from source files
- SQL migration pattern: HIGH — 4 prior migrations confirm the direct-to-Neon-via-MCP workflow
- Propose→approve→execute security path: HIGH — source-verified; `send-template-to-members` confirmed to use `enqueueOutboundWhatsApp` with no direct Meta call
- `application_state` vs dedicated tables recommendation: HIGH — `writeAppState`/`readAppState` usage confirmed as ephemeral KV; SQL pattern matches all prior gym domain tables

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable stack — nothing in this research depends on fast-moving library APIs)
