---
phase: P3-ai-noticeboard-home
plan: 05
type: execute
wave: 4
depends_on: [04]
files_modified:
  - apps/staff-web/app/components/gymos/Noticeboard/AiTodayStrip.tsx
  - apps/staff-web/app/components/gymos/Noticeboard/BoardCard.tsx
  - apps/staff-web/app/components/gymos/Noticeboard/TasksSection.tsx
  - apps/staff-web/app/routes/gymos._index.tsx
autonomous: true
requirements: [SC-1, SC-2, SC-3, SC-4, SC-5]
must_haves:
  truths:
    - "The noticeboard renders 4 section cards (Inbox, Schedule, Members, Revenue) + AI-today strip + Tasks section"
    - "Each card shows a real computed metric subheading from the existing list-* actions (skeleton while loading, em dash on error)"
    - "Persisted AI section notes render on their cards; persisted open tasks render in the Tasks section"
    - "Pending proposals render an Approve (AlertDialog for sends) + Dismiss control wired to approve-proposal/reject-proposal; complete-task wired to the task toggle — all optimistic"
  artifacts:
    - path: "apps/staff-web/app/components/gymos/Noticeboard/BoardCard.tsx"
      provides: "Section card: title label + computed subheading + AI note inset + proposal zone"
      contains: "useActionQuery"
    - path: "apps/staff-web/app/components/gymos/Noticeboard/AiTodayStrip.tsx"
      provides: "Full-width AI-today header strip"
      contains: "IconMessage"
    - path: "apps/staff-web/app/components/gymos/Noticeboard/TasksSection.tsx"
      provides: "Prioritized tasks list with complete toggle + per-task approve"
      contains: "border-l-4"
  key_links:
    - from: "BoardCard.tsx"
      to: "list-fill-rate / list-renewals / list-at-risk-members / list-revenue / list-inbox-summary"
      via: "useActionQuery per card metric"
      pattern: "useActionQuery\\("
    - from: "BoardCard.tsx + TasksSection.tsx"
      to: "approve-proposal / reject-proposal / complete-task actions"
      via: "useActionMutation with optimistic onMutate/onError"
      pattern: "useActionMutation\\("
---

<objective>
Build the three noticeboard components to the APPROVED UI-SPEC and wire them into the `gymos._index.tsx` route created in Plan 04: `AiTodayStrip`, `BoardCard` (×4: inbox/schedule/members/revenue), and `TasksSection`. Cards fetch live metrics client-side via `useActionQuery`; mutations (approve/reject/complete) use `useActionMutation` optimistically. Sends are gated behind an `AlertDialog`.

Purpose: Backs SC-1 (full board renders), SC-2 (real computed subheadings), SC-3 (persisted notes render), SC-4 (tasks render + completable), SC-5 (approve/reject UI for proposals). Implements the UI-SPEC visual/interaction contract exactly.
Output: 3 components + the wired route. This is the visible deliverable of the phase.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md
@apps/staff-web/app/routes/gymos._index.tsx
@apps/staff-web/app/routes/gymos.analytics.tsx
@apps/staff-web/app/hooks/use-draft-queue.ts

<interfaces>
<!-- Hooks (verified): import { useActionQuery, useActionMutation } from "@agent-native/core/client".
       useActionQuery(name, params, options?) -> { data, isLoading, isError } (React Query).
       useActionMutation(name, options?) -> { mutate, mutateAsync, isPending }; supports onMutate/onError/onSuccess for optimistic.
     - useDbSync() is already running in root.tsx — POST mutations auto-invalidate ["action"] keys (Pitfall 5). No manual invalidate needed but you MAY call queryClient.invalidateQueries for instant refresh.
     - Sonner toasts: import { toast } from "sonner" (already used in staff-web).
     - shadcn imports (path alias @/): Card, CardContent, CardHeader from "@/components/ui/card"; Badge "@/components/ui/badge"; Button "@/components/ui/button"; Skeleton "@/components/ui/skeleton"; Separator "@/components/ui/separator"; Tooltip/TooltipTrigger/TooltipContent "@/components/ui/tooltip"; DropdownMenu family "@/components/ui/dropdown-menu"; AlertDialog family "@/components/ui/alert-dialog". ALL already installed.
     - Tabler icons: IconMessage, IconCalendar, IconUsers, IconCurrencyPound, IconDots, IconCheck, IconX, IconCircle, IconCircleCheck from "@tabler/icons-react". NO sparkle/wand/robot for agent affordance — use IconMessage.

     Action return shapes (verified):
       list-inbox-summary -> { unreadConversations, openConversations, asOf }
       list-fill-rate({days:7}) -> Array<{occurrenceId, className, startsAt, capacity, booked, fillPct}>  (avg fillPct + count = subheading)
       list-renewals({}) -> { activeSubscriptions, expiringPasses7d, ... }
       list-at-risk-members({limit:25}) -> Array<{memberId, name, phoneE164, ...}>  (.length = at-risk count)
       list-revenue({}) -> { mrrPounds, net30d, ... }
     Proposal->card association (UI-SPEC §Section-by-Section): inbox & schedule & members cards show send-template-to-members proposals; revenue card shows create-checkout-link proposals.
     navigate action: writeAppState navigate — overflow menu "Go to X" calls navigate({ view }) via useActionMutation("navigate", ...) or a fetch to /_agent-native/actions/navigate. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build AiTodayStrip + TasksSection components</name>
  <read_first>
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md §"AiTodayStrip" and §"TasksSection" (exact anatomy, sizing, copy, priority colors, optimistic contract)
    - apps/staff-web/app/routes/gymos._index.tsx (the loader return shape: notes[], tasks[], proposals[] — components receive these as props)
    - apps/staff-web/app/hooks/use-draft-queue.ts (useActionMutation usage example in this codebase)
  </read_first>
  <action>
Create `apps/staff-web/app/components/gymos/Noticeboard/AiTodayStrip.tsx`:
- Props: `{ note?: { body: string }; pendingCount: number }`.
- Full-width strip (NOT a Card). `py-3 px-4 min-h-[44px]`. Background: `bg-muted/50` when no note; `bg-primary/5 border border-primary/20 rounded-md` when a note exists.
- Left: `<IconMessage size={16} />` (Tabler — NOT sparkle/wand/robot). Then a state label `text-xs font-semibold uppercase tracking-wide text-muted-foreground`: "AI READY" when no note, "AI NOTE" when a note exists.
- Body: when no note, idle copy "The agent is ready. Ask a question or request a recommendation in the chat." (`text-sm text-muted-foreground`). When a note exists, render `note.body` verbatim (`text-sm`).
- When `pendingCount > 0`, render `<Badge variant="secondary">{pendingCount} pending</Badge>` (informational only — no navigation).

Create `apps/staff-web/app/components/gymos/Noticeboard/TasksSection.tsx`:
- Props: `{ tasks: Array<{ id; title; body?: string|null; priority: number; proposalId?: string|null }> }`.
- Section header: label "TASKS" (`text-xs uppercase tracking-wider font-semibold text-muted-foreground`) + `<Badge variant="secondary">` count when `tasks.length > 0`.
- Empty state when `tasks.length === 0`: `div.py-8.text-center` with heading "No tasks yet" (`text-sm font-semibold text-muted-foreground`) + body "The agent will create tasks here as it identifies recommendations. You can also create tasks by asking in the chat." (`text-xs text-muted-foreground mt-1`).
- Each task row: `div.flex.items-start.gap-3.py-3.min-h-[44px]` with a `border-l-4` priority strip — `priority===1` -> `border-l-red-500`, `priority===2` -> `border-l-amber-400`, else `border-l-border`.
  - Complete toggle: `IconCircle` (16px, text-muted-foreground) when open. On click, optimistically swap to `IconCircleCheck` (16px, text-green-600) + apply `opacity-50 line-through` to the row, then call `useActionMutation("complete-task")` with `{ taskId }`. `aria-label="Mark task complete"`. On error, roll back + `toast("Could not mark task as done. Please try again.")`.
  - Title `text-sm font-semibold`; optional body `text-sm text-muted-foreground mt-1 line-clamp-2`.
  - If `task.proposalId`, render an "Approve" `<Button variant="outline" size="sm">` (the per-task proposal action — for V1 it may simply scroll/focus the relevant card's proposal zone, or call approve-proposal directly for non-send proposals; for send proposals defer the AlertDialog to the BoardCard's proposal zone built in Task 2, so here the per-task Approve can be a link/anchor cue — keep it minimal and DO NOT bypass the AlertDialog for sends).
- `<Separator />` between task rows.

Use the loader-provided `tasks` (server-ordered priority ASC, created_at ASC — do not re-sort).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - AiTodayStrip.tsx contains "IconMessage" and NO IconSparkle/IconWand/IconRobot (grep returns no sparkle/wand/robot)
    - AiTodayStrip.tsx contains "AI READY" and "AI NOTE" and "{pendingCount} pending" (or equivalent template) and "min-h-[44px]"
    - TasksSection.tsx contains "border-l-4" and "border-l-red-500" and "border-l-amber-400" and "IconCircle" and "IconCircleCheck"
    - TasksSection.tsx contains the empty-state strings "No tasks yet" and "The agent will create tasks here"
    - TasksSection.tsx uses useActionMutation("complete-task" with onMutate (optimistic) + onError (rollback + toast)
    - Both files import shadcn primitives from "@/components/ui/*" and icons from "@tabler/icons-react"
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>AiTodayStrip (message icon, idle/note states, pending badge) and TasksSection (priority strips, optimistic complete toggle, empty state) built to UI-SPEC; typecheck clean.</done>
</task>

<task type="auto">
  <name>Task 2: Build BoardCard component (metric + note inset + proposal zone with AlertDialog)</name>
  <read_first>
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md §"BoardCard", §"Section-by-Section Design Reference", §"Interaction Contracts" (the Propose→Approve→Execute spec + exact AlertDialog copy)
    - apps/staff-web/app/routes/gymos.analytics.tsx (Card + Badge + Tabler-icon + text-xs uppercase label precedent; do NOT use <CardTitle>)
    - apps/staff-web/actions/list-revenue.ts (return shape for the Revenue primary metric)
  </read_first>
  <action>
Create `apps/staff-web/app/components/gymos/Noticeboard/BoardCard.tsx`. A single configurable component switched by a `section` prop: `"inbox" | "schedule" | "members" | "revenue"`.

Props: `{ section; note?: { body: string; updatedAt?: string }; proposals: Array<{ id; actionName; rationale?: string; paramsJson: string }> }`.

Per-section config (icon 20px, label, navigate target, metric query):
- inbox: `IconMessage`, label "INBOX", nav view "inbox", `useActionQuery("list-inbox-summary", {})` -> subheading `"{unread} unread · {open} open conversations"`.
- schedule: `IconCalendar`, label "SCHEDULE", nav "schedule", `useActionQuery("list-fill-rate", { days: 7 })` -> avg of fillPct rounded + count: `"{avg}% avg fill this week · {n} classes"`.
- members: `IconUsers`, label "MEMBERS", nav "members", combine `useActionQuery("list-renewals", {})` (activeSubscriptions) + `useActionQuery("list-at-risk-members", { limit: 25 })` (.length). Positive framing per UI-SPEC: `"{active} active · no members at risk"` when at-risk===0, else `"{active} active · {m} at risk of lapsing"`.
- revenue: `IconCurrencyPound`, label "REVENUE", nav "analytics", `useActionQuery("list-revenue", {})`. Show MRR as PRIMARY metric value `text-2xl font-semibold` -> `"£{mrrPounds}/mo"`; subheading net growth: `net30d>0` -> `"+{net30d} net new this month"`, `<0` -> `"−{abs} net new this month"`, else `"flat net growth this month"`.

Card structure (UI-SPEC exact):
- `<Card className="min-h-[160px] bg-card border-border/60 shadow-sm">`.
- CardHeader: a `flex items-center justify-between` row with `[Icon 20px] + plain <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{LABEL}</div>` on the left (NOT `<CardTitle>`), and an overflow `<DropdownMenu>` on the right whose trigger is `<Button variant="ghost" size="icon" aria-label="More options"><IconDots size={16} /></Button>`; menu items: "Go to {Section}" (calls navigate via useActionMutation/fetch to `/_agent-native/actions/navigate` with `{ view }`) and "Refresh" (invalidate this card's query key).
  - Below the label: the computed subheading. While the metric query `isLoading`, render `<Skeleton className="h-4 w-40 mt-1" />`. On `isError`, render a `<Tooltip>` wrapping a `<span className="text-sm text-muted-foreground cursor-help">—</span>` with TooltipContent "Metric unavailable. Refresh to retry." Else render `<div className="text-sm text-muted-foreground mt-1">{subheading}</div>`.
- CardContent:
  - AI note inset: if `note?.body` non-empty, `<div className="bg-muted/40 rounded-md p-3"><div className="text-sm italic text-foreground/80">{note.body}</div>{note.updatedAt && <div className="text-xs text-muted-foreground mt-1">{relativeTime}</div>}</div>`. If empty, render the section's empty-note copy from UI-SPEC §"Section card copy patterns" as `text-sm text-muted-foreground` (no inset, no italic).
  - Proposal zone: filter `proposals` for this card (inbox/schedule/members -> actionName==="send-template-to-members"; revenue -> actionName==="create-checkout-link"). For each matching pending proposal: `<Separator />` then rationale `text-sm text-foreground/80`, then an "Approve" `<Button variant="default" size="sm">` with `<IconCheck size={14} />` and a "Dismiss proposal" `<Button variant="ghost" size="sm" className="text-muted-foreground">` with `<IconX size={14} />`.
    - For `send-template-to-members` proposals: Approve opens an `<AlertDialog>`. Parse `paramsJson` to get `templateName` + `memberIds.length` (N). AlertDialogTitle: `"Send {N} WhatsApp messages?"`. AlertDialogDescription (verbatim UI-SPEC): `"This will send {templateName} to {N} member{s}. Messages that are out of window or not opted-in will be skipped by the worker. This action cannot be undone."` Cancel="Cancel", Action="Send messages" (styled `bg-primary`). On confirm -> `useActionMutation("approve-proposal")` with `{ proposalId }`, optimistic: proposal zone -> loading (`opacity-50`, button disabled). On success: zone removed + `toast("Sent to {N} members.")`. On error: restore + error toast "Action failed. {message} The proposal is still pending."
    - For `create-checkout-link` proposals: NO AlertDialog. Approve -> approve-proposal directly; on success copy `result.url` to clipboard + `toast("Checkout link ready. Copied to clipboard.")`.
    - Dismiss -> `useActionMutation("reject-proposal")` with `{ proposalId }`, optimistic zone collapse, rollback + toast on error.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - BoardCard.tsx contains useActionQuery for each of: "list-inbox-summary", "list-fill-rate", "list-renewals", "list-at-risk-members", "list-revenue"
    - BoardCard.tsx contains useActionMutation("approve-proposal" and useActionMutation("reject-proposal"
    - BoardCard.tsx contains the verbatim AlertDialog title pattern "Send" + "WhatsApp messages?" and description "will be skipped by the worker. This action cannot be undone."
    - BoardCard.tsx parses the stored proposal params (contains "JSON.parse(" against proposal.paramsJson) and reads both "memberIds" (e.g. memberIds.length) and "templateName" from the parsed object to populate the AlertDialog title/description — the dialog must NOT be satisfiable by static hardcoded strings
    - BoardCard.tsx uses a plain <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground"> for the label and does NOT use <CardTitle>
    - BoardCard.tsx uses Skeleton for loading and a Tooltip-wrapped "—" for metric error
    - BoardCard.tsx revenue branch renders MRR with "text-2xl font-semibold"
    - Icons used: IconMessage, IconCalendar, IconUsers, IconCurrencyPound, IconDots, IconCheck, IconX (from @tabler/icons-react); no emoji/sparkle/wand
    - create-checkout-link Approve path copies result.url to clipboard (contains "clipboard")
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>BoardCard renders the per-section icon/label, computed metric (skeleton/error states), AI note inset, and the gated proposal zone (AlertDialog for sends, direct approve for checkout) — all optimistic; typecheck clean.</done>
</task>

<task type="auto">
  <name>Task 3: Wire the three components into the noticeboard route</name>
  <read_first>
    - apps/staff-web/app/routes/gymos._index.tsx (the Plan-04 scaffold with the three data-noticeboard-* divs + loader returning notes/tasks/proposals)
    - The three component files just created (AiTodayStrip, BoardCard, TasksSection — confirm their prop signatures)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md §"Layout Contract" (exact board markup + responsive grid)
  </read_first>
  <action>
Edit `apps/staff-web/app/routes/gymos._index.tsx` default export to render the real components in place of the three scaffold placeholder divs (keep the loader from Plan 04 unchanged):

```tsx
import { AiTodayStrip } from "@/components/gymos/Noticeboard/AiTodayStrip";
import { BoardCard } from "@/components/gymos/Noticeboard/BoardCard";
import { TasksSection } from "@/components/gymos/Noticeboard/TasksSection";
// ... existing imports

export default function Noticeboard() {
  const { notes, tasks, proposals } = useLoaderData<typeof loader>();
  const noteFor = (section: string) => notes.find((n) => n.section === section);
  const aiTodayNote = noteFor("ai_today");
  return (
    <div className="flex flex-col gap-4 p-6 h-full overflow-y-auto bg-muted/40">
      <AiTodayStrip note={aiTodayNote} pendingCount={proposals.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-4">
        <BoardCard section="inbox" note={noteFor("inbox")} proposals={proposals} />
        <BoardCard section="schedule" note={noteFor("schedule")} proposals={proposals} />
        <BoardCard section="members" note={noteFor("members")} proposals={proposals} />
        <BoardCard section="revenue" note={noteFor("revenue")} proposals={proposals} />
      </div>
      <TasksSection tasks={tasks} />
    </div>
  );
}
```

Pass the full `proposals` array to each BoardCard (the card filters by actionName/section internally). Ensure the grid classes match UI-SPEC: `grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-4`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - gymos._index.tsx imports AiTodayStrip, BoardCard, TasksSection from "@/components/gymos/Noticeboard/*"
    - Renders <AiTodayStrip note={...} pendingCount={proposals.length} />, four <BoardCard section="inbox|schedule|members|revenue" .../>, and <TasksSection tasks={tasks} />
    - The grid container uses "grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-4"
    - The three data-noticeboard-* placeholder divs from Plan 04 are gone
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>The noticeboard route renders the live AiTodayStrip + 4 BoardCards + TasksSection from loader data; placeholders removed; typecheck clean.</done>
</task>

</tasks>

<verification>
- staff-web `tsc --noEmit` clean after all three tasks.
- UI-SPEC conformance verifiable by grep: message icon (not sparkle/wand) for AI affordance; plain-div uppercase labels (no CardTitle); border-l-4 priority strips; Skeleton/Tooltip metric states; AlertDialog with verbatim send copy; text-2xl MRR.
- All mutations (approve/reject/complete) use useActionMutation with optimistic onMutate/onError (CLAUDE.md mandate).
- VERIFICATION CONSTRAINT honored: no local HTTP / no local render. Component correctness verified by tsc + structural greps against the UI-SPEC. Real rendering, the live metric subheadings, and the propose→approve→execute click-path are deferred to the Plan 07 e2e smoke on the live Vercel deploy.
</verification>

<success_criteria>
SC-1 (board renders), SC-2 (computed subheadings), SC-3 (notes render), SC-4 (tasks render + complete), SC-5 (approve/reject UI gated by AlertDialog for sends) all have their UI in place to the approved UI-SPEC. Plan 06 updates the agent posture so the agent actually authors this content; Plan 07 proves it live.
</success_criteria>

<output>
After completion, create `.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-05-SUMMARY.md` noting any deviations from the UI-SPEC (e.g. relative-time helper choice) and the final prop signatures of the three components.
</output>
