---
phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - templates/mail/app/routes/gymos.tsx
autonomous: true
requirements: [INBX-01, INBX-02, INBX-03, INBX-06, INBX-07]
must_haves:
  truths:
    - "Inbox surface lists 5 seeded conversations (INBX-01 verified)"
    - "Clicking any conversation shows message history with direction-based bubble alignment and per-message status indicator (INBX-02 verified)"
    - "Coach can send a free-text reply when in-window; reply appears in the thread immediately with status='sent' (INBX-03 verified; demo grade — no Meta call)"
    - "Sending a reply shows brief 'Sent (demo)' acknowledgement so the user knows the send succeeded — current implementation persists but gives no visible confirmation"
    - "Member context panel shows pass balance, next class, lifetime bookings, today's nutrition, and goal (INBX-06 thin verified — at least 2 fields populated from real data)"
    - "Top-level navigation strip links to /gymos (Inbox), /gymos/schedule, /gymos/members, /gymos/payments so the four demo surfaces are discoverable as one product (INBX-07 cohesion)"
  artifacts:
    - path: "templates/mail/app/routes/gymos.tsx"
      provides: "Updated inbox surface with top-nav strip, send-acknowledgement, and any thin gap-fills against current INBX-* coverage"
      contains: "/gymos/schedule"
      min_lines: 520
  key_links:
    - from: "gymos.tsx top-nav strip"
      to: "/gymos/schedule, /gymos/members, /gymos/payments"
      via: "React Router <Link> elements in a shared top bar"
      pattern: "to=\"/gymos/schedule\""
    - from: "Send action success indicator"
      to: "User-visible confirmation in the reply form area"
      via: "useFetcher state OR url search param ?sent=1 inspected by the default component"
      pattern: "sent.*demo|Sent \\(demo\\)"
---

<objective>
Audit the already-shipped `templates/mail/app/routes/gymos.tsx` inbox surface against the D1 INBX-* requirements, then make targeted gap-fill edits:

1. **Top-nav strip** — add a shared navigation bar across the top of the inbox linking to the four demo surfaces (Inbox / Schedule / Members / Payments). Without this, the four routes feel like disconnected pages; with it, the product looks like one staff back-office. This is the visual unifier for the D1 demo.
2. **Send-acknowledgement** — current send action redirects back to the conversation but gives no visible "sent" feedback. Add a thin indicator (e.g. brief flash banner using `?sent=1` query param) so the user knows the persist succeeded.
3. **Audit + verify** — confirm INBX-01, INBX-02, INBX-03, INBX-06 (thin), INBX-07 are all covered by the current file + this edit. Add explicit comment markers in the file noting which requirement each section covers (helps the next-session reader and the goal-backward verifier).

Purpose: Demo Sprint deliverable for inbox surface polish + cross-surface navigation cohesion. INBX-07 in this plan is interpreted as "the inbox is a coherent feature of the staff app" (the fork-boundary version of INBX-07 — "copy-out into apps/staff-web/features/inbox/" — is explicitly deferred per STATE.md: "Demo-time fork-boundary loosened — edit inside templates/mail/ directly").

Output:
- Updates to `templates/mail/app/routes/gymos.tsx` — top-nav strip + send-acknowledgement + requirement comment markers. No new files.

**Demo grade limits (intentional):**
- INBX-03 stays demo-grade: reply persists to DB only, no real Meta call. Real WhatsApp send is Production v1 (WA-05/WA-06).
- INBX-06 stays "thin" — at minimum 2 fields populated from real data. Current implementation already shows pass balance + next class + lifetime bookings + today's nutrition + goal = 5 fields. This requirement is already exceeded; only need to verify.
- No retry/optimistic UI for send failures.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@templates/mail/app/routes/gymos.tsx
@templates/mail/server/db/schema.ts

<interfaces>
<!-- The whole file is the reference — extracted key shapes below. -->

From templates/mail/app/routes/gymos.tsx (current shape):
```typescript
export function meta(): { title: string }[];
export async function loader({ request }: LoaderFunctionArgs): Promise<{
  conversations: ConversationRow[];
  selectedConversation: ConversationRow | null;
  selectedMessages: MessageRow[];
  selectedMember: GymMember | null;
  memberStats: {
    passBalance, passProduct, passExpiresAt, lifetimeBookings,
    todayKcal, todayProtein, todayFoodCount
  } | null;
  upcomingBooking: { id, status, startsAt, className } | null;
}>;
export async function action({ request }: ActionFunctionArgs): Promise<Response | { error: string }>;
export default function GymosInbox(): JSX.Element;
```

Three-column layout already present (lines 246-504):
- Left: conversation list aside (w-[320px])
- Center: thread main
- Right: member context panel aside (w-[300px])

`react-router` exports already imported (line 9): `useSearchParams, useLoaderData, Form, redirect`. To use `<Link>` we add it to the import.

INBX requirements current coverage audit (read this carefully before editing):
- INBX-01 conversation list sorted by last-activity → ✅ lines 50, 261-294 (orderBy desc updatedAt + map render)
- INBX-02 open conversation, see message history + delivery indicators → ✅ lines 62-66 (messages query), 329-352 (render + status text)
- INBX-03 send free-text within 24h window → ✅ lines 167-202 (action insert + conv update), 355-386 (Form gated by ws.ok); needs visible success feedback
- INBX-06 thin member context panel — needs ≥2 fields from real data → ✅ EXCEEDED: 5 fields rendered (lines 400-501)
- INBX-07 (demo interpretation — cohesion) → ❌ MISSING: no nav strip; user must guess at URLs for /schedule /members /payments
</interfaces>

</context>

<tasks>

<task type="auto">
  <name>Task 1: Add top-nav strip linking to all four demo surfaces (inbox/schedule/members/payments)</name>
  <files>templates/mail/app/routes/gymos.tsx</files>
  <read_first>
    - templates/mail/app/routes/gymos.tsx (entire file — must understand current 3-column layout before adding a top strip; the wrapper div on line 246 is `flex h-screen w-screen` which currently fills the full viewport horizontally. The top-nav strip must NOT break this layout.)
    - templates/mail/server/db/schema.ts (no edits but confirms no schema change needed)
  </read_first>
  <action>
Edit `templates/mail/app/routes/gymos.tsx`.

**Step 1a — Add `Link` to the react-router import** (line 9 currently is `import { useSearchParams, useLoaderData, Form, redirect } from "react-router";`). Change to:
```typescript
import { useSearchParams, useLoaderData, Form, redirect, Link, useLocation } from "react-router";
```

**Step 1b — Wrap the existing 3-column layout in a vertical flex container, with a new top-nav strip above it.**

Current top-level structure (line 246) is:
```jsx
<div className="flex h-screen w-screen bg-background text-foreground">
  {/* aside (left) */}
  {/* main (center) */}
  {/* aside (right) */}
</div>
```

Change to:
```jsx
<div className="flex flex-col h-screen w-screen bg-background text-foreground">
  <GymosTopNav />
  <div className="flex flex-1 overflow-hidden">
    {/* aside (left) */}
    {/* main (center) */}
    {/* aside (right) */}
  </div>
</div>
```

Note: the original `flex h-screen w-screen` becomes the inner `<div className="flex flex-1 overflow-hidden">` — preserves the existing 3-column behaviour intact. The outer wrapper is `flex-col` to stack nav on top.

**Step 1c — Add `GymosTopNav()` component definition** above `export default function GymosInbox()`. Structure:

```typescript
function GymosTopNav() {
  const location = useLocation();
  const items: Array<{ to: string; label: string; match: (p: string) => boolean }> = [
    { to: "/gymos", label: "Inbox", match: (p) => p === "/gymos" || p.startsWith("/gymos?") },
    { to: "/gymos/schedule", label: "Schedule", match: (p) => p.startsWith("/gymos/schedule") },
    { to: "/gymos/members", label: "Members", match: (p) => p.startsWith("/gymos/members") },
    { to: "/gymos/payments", label: "Payments", match: (p) => p.startsWith("/gymos/payments") },
  ];
  return (
    <nav className="flex items-center gap-1 px-4 h-11 border-b border-border/50 bg-card/40 shrink-0">
      <span className="text-[12px] font-semibold mr-3">GymOS</span>
      {items.map((it) => {
        const active = it.match(location.pathname + location.search);
        return (
          <Link
            key={it.to}
            to={it.to}
            className={cn(
              "px-2.5 py-1 rounded text-[12px] transition",
              active
                ? "bg-accent text-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
          >
            {it.label}
          </Link>
        );
      })}
      <span className="ml-auto text-[10px] text-muted-foreground">Demo Sprint D1</span>
    </nav>
  );
}
```

The `cn` helper is already imported on line 16. `useLocation` is added in Step 1a.

**Step 1d — Add a requirement-marker comment block** just below the header comment at the top of the file (around line 8, before the imports):

```typescript
// Requirements covered (Demo Sprint D1):
// - INBX-01 conversation list sorted by last-activity (left rail)
// - INBX-02 open thread + message history with status text (centre)
// - INBX-03 send free-text within 24h window (demo: persists to DB, no Meta send)
// - INBX-06 member context panel — pass balance, next class, lifetime bookings,
//   today's nutrition, goal (right rail) — DIFFERENTIATOR
// - INBX-07 demo interpretation: top-nav strip ties inbox + schedule + members
//   + payments into one cohesive staff surface (production fork-boundary
//   relocation to apps/staff-web/features/inbox/ deferred per STATE.md)
```

After editing, run `npx prettier --write templates/mail/app/routes/gymos.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/gymos.tsx','utf8'); const checks=['function GymosTopNav','to=\"/gymos/schedule\"','to=\"/gymos/members\"','to=\"/gymos/payments\"','useLocation','Link','// Requirements covered','INBX-01','INBX-06']; const missing=checks.filter(c=>!s.includes(c)); if(missing.length){console.error('MISSING:',missing);process.exit(1)} process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'function GymosTopNav' templates/mail/app/routes/gymos.tsx` returns 1
    - `grep -c 'to="/gymos/schedule"' templates/mail/app/routes/gymos.tsx` returns 1
    - `grep -c 'to="/gymos/members"' templates/mail/app/routes/gymos.tsx` returns 1
    - `grep -c 'to="/gymos/payments"' templates/mail/app/routes/gymos.tsx` returns 1
    - `grep -c 'useLocation' templates/mail/app/routes/gymos.tsx` returns at least 2 (import + usage)
    - `grep -c '// Requirements covered' templates/mail/app/routes/gymos.tsx` returns 1
    - `grep -c 'INBX-01' templates/mail/app/routes/gymos.tsx` returns 1
    - `grep -c 'INBX-06' templates/mail/app/routes/gymos.tsx` returns 1
    - The outer wrapper div still includes `flex-col` AND there is an inner `<div className="flex flex-1` wrapping the three asides/main
    - Existing 3-column rendering preserved (left rail width 320px, right rail width 300px — no regression)
  </acceptance_criteria>
  <done>Top-nav strip renders above the 3-column inbox layout with active-route highlight; routes to the other three demo surfaces are clickable; requirement-marker comment block at top of file documents INBX-* coverage</done>
</task>

<task type="auto">
  <name>Task 2: Add visible send-acknowledgement to the reply form (INBX-03 polish)</name>
  <files>templates/mail/app/routes/gymos.tsx</files>
  <read_first>
    - templates/mail/app/routes/gymos.tsx (lines 167-202 action handler; lines 355-386 reply Form — these are the parts being modified)
  </read_first>
  <action>
Edit `templates/mail/app/routes/gymos.tsx` in two places:

**Step 2a — Action: include `?sent=1` in the redirect.** Currently line 201 is:
```typescript
return redirect(`/gymos?conversation=${conversationId}`);
```
Change to:
```typescript
return redirect(`/gymos?conversation=${conversationId}&sent=1`);
```

**Step 2b — Default component: read `sent` from useSearchParams and render an inline banner.** Just above the reply `<Form method="post">` block (around line 355, inside `data.selectedConversation && (...)`), add:

```typescript
{params.get("sent") === "1" && (
  <div className="px-5 py-2 bg-emerald-500/10 border-t border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
    Sent (demo) — message persisted to DB. Production sends would go through pg-boss → worker → Meta API with 24h-window + opt-in checks.
  </div>
)}
```

`params` is already in scope from line 237 (`const [params] = useSearchParams();`). No additional imports needed.

After editing, run `npx prettier --write templates/mail/app/routes/gymos.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/gymos.tsx','utf8'); const checks=['&sent=1','params.get(\"sent\")','Sent (demo)','emerald']; const missing=checks.filter(c=>!s.includes(c)); if(missing.length){console.error('MISSING:',missing);process.exit(1)} process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '&sent=1' templates/mail/app/routes/gymos.tsx` returns 1 (in the action redirect)
    - `grep -c 'params.get("sent")' templates/mail/app/routes/gymos.tsx` returns 1
    - `grep -c 'Sent (demo)' templates/mail/app/routes/gymos.tsx` returns 1
    - The banner renders only when `?sent=1` is in the URL (conditional check uses `=== "1"`)
    - Existing action body otherwise unchanged (still inserts message row, still updates conversation lastOutboundAt + preview + updatedAt)
  </acceptance_criteria>
  <done>After typing a reply and clicking Send, the URL becomes /gymos?conversation=...&sent=1 and a green "Sent (demo)" banner appears above the reply form; the message also visibly appears in the thread above</done>
</task>

</tasks>

<verification>
Manual smoke test of the inbox after edits:

1. `pnpm --filter mail dev`
2. Open `http://localhost:8081/gymos`
3. Expect: top-nav strip across the top showing "GymOS" + four tabs (Inbox / Schedule / Members / Payments). "Inbox" tab is highlighted (active state).
4. Click "Schedule" — navigates to `/gymos/schedule` (route from D1-01)
5. Click "Members" — navigates to `/gymos/members` (route from D1-02)
6. Click "Payments" — navigates to `/gymos/payments` (route from D1-03)
7. Click "Inbox" — back to `/gymos`, click any conversation
8. Verify three-column layout preserved (left list, middle thread, right context panel — no regression)
9. Verify the right context panel shows ≥2 of: pass balance, next class, lifetime bookings, today's nutrition, goal (this is INBX-06 thin)
10. Type a reply, click Send
11. Expect: green "Sent (demo)" banner appears + the new message is at the bottom of the thread

INBX-* coverage audit:
- INBX-01 ✓ list sorted by last-activity (existing)
- INBX-02 ✓ thread + delivery indicators (existing)
- INBX-03 ✓ send free-text in-window + new sent acknowledgement (this plan)
- INBX-06 ✓ thin context panel (existing — 5 fields, exceeds "≥2" bar)
- INBX-07 ✓ demo cohesion via top-nav strip (this plan; fork-boundary relocation deferred)
</verification>

<success_criteria>
- [ ] Top-nav strip renders on `/gymos` with all four tabs
- [ ] Active tab highlighting works (Inbox bold when on /gymos, etc.)
- [ ] Clicking any tab navigates correctly
- [ ] Send action shows green "Sent (demo)" banner on success
- [ ] Existing 3-column layout NOT regressed (left list, middle thread, right context panel all still visible at full height)
- [ ] Requirement marker comments present at top of file
- [ ] No TypeScript compile errors
</success_criteria>

<output>
After completion, create `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-04-inbox-gap-fill-SUMMARY.md` documenting: INBX-* requirements coverage audit, top-nav strip added, send-acknowledgement added, INBX-07 fork-boundary relocation explicitly deferred to Production v1 (P0 audit task per STATE.md).
</output>
