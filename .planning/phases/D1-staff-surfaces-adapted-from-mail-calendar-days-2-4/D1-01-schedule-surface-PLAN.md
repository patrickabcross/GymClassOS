---
phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - templates/mail/app/routes/gymos.schedule.tsx
  - templates/mail/server/plugins/auth.ts
autonomous: true
requirements: [SCH-01, BKG-01]
must_haves:
  truths:
    - "Coach can open /gymos/schedule and see a week-grid of the 7 seeded class occurrences"
    - "Each class occurrence card shows class name, start time (studio local), instructor (if set), and capacity used/total"
    - "Coach can click an occurrence to open a booking dialog listing 5 seeded members"
    - "Selecting a member + clicking Book inserts a row in bookings (status='booked') and the dialog closes / page refreshes showing the new booking count"
  artifacts:
    - path: "templates/mail/app/routes/gymos.schedule.tsx"
      provides: "Schedule surface route — week grid + book-from-occurrence dialog"
      exports: ["loader", "action", "meta", "default"]
      min_lines: 200
    - path: "templates/mail/server/plugins/auth.ts"
      provides: "publicPaths extended so /gymos/schedule, /gymos/members, /gymos/payments are demo-public"
      contains: "/gymos/schedule"
  key_links:
    - from: "gymos.schedule.tsx loader"
      to: "schema.classOccurrences + schema.classDefinitions + schema.bookings"
      via: "drizzle select with leftJoin on definitionId"
      pattern: "classOccurrences.*leftJoin.*classDefinitions"
    - from: "gymos.schedule.tsx action (book)"
      to: "schema.bookings INSERT"
      via: "db.insert(schema.bookings).values({...})"
      pattern: "insert\\(schema\\.bookings\\)"
    - from: "auth.ts publicPaths array"
      to: "Better-auth route guard"
      via: "publicPaths string match against request URL"
      pattern: "publicPaths.*gymos"
---

<objective>
Build the staff schedule surface at `/gymos/schedule` — a week-grid of class occurrences from the seeded data (7 occurrences Sun May 18 → Fri May 22) with the ability to book any of the 5 seeded members into any occurrence.

Purpose: Demo Sprint deliverable for SCH-01 (schedule view) + BKG-01 (book from schedule). Mirrors the structure of `gymos.tsx` (the already-shipped inbox surface). Demo-grade — no atomic transactions, no capacity enforcement under concurrent load (production work).

Output:
- New route file `templates/mail/app/routes/gymos.schedule.tsx` (RR v7 framework mode, loader + action + default component)
- `auth.ts` `publicPaths` array extended so all four D1 surfaces (`/gymos`, `/gymos/schedule`, `/gymos/members`, `/gymos/payments`) bypass Google sign-in for the demo
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@templates/mail/app/routes/gymos.tsx
@templates/mail/server/db/schema.ts
@templates/mail/server/plugins/auth.ts

<interfaces>
<!-- Key types and exports the executor needs. Extracted from codebase. -->

From templates/mail/server/db/index.ts:
```typescript
export const getDb: () => DrizzleDb;
export const db: DrizzleProxy;
export { schema };
```

From templates/mail/server/db/schema.ts (relevant tables):
```typescript
// class_definitions
{ id: string, name: string, description: string|null, durationMin: number,
  defaultCapacity: number, defaultInstructorUserId: string|null,
  category: string|null, active: boolean, createdAt: string }

// class_occurrences
{ id: string, definitionId: string, startsAt: string /* ISO with TZ */,
  endsAt: string, capacity: number, instructorUserId: string|null,
  room: string|null, status: "scheduled"|"cancelled"|"completed",
  notes: string|null, createdAt: string }

// bookings
{ id: string, occurrenceId: string, memberId: string,
  status: "booked"|"waitlist"|"cancelled"|"attended"|"no_show",
  passId: string|null, bookedByUserId: string|null,
  bookedAt: string, cancelledAt: string|null, attendedAt: string|null }

// gym_members (Drizzle export: gymMembers)
{ id: string, firstName: string, lastName: string|null, phoneE164: string|null, ... }
```

From templates/mail/app/routes/gymos.tsx (loader + action pattern):
```typescript
import { useSearchParams, useLoaderData, Form, redirect } from "react-router";
import { eq, desc, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export function meta() { return [{ title: "..." }]; }
export async function loader({ request }: LoaderFunctionArgs) { ... }
export async function action({ request }: ActionFunctionArgs) { ... }
export default function GymosX() { const data = useLoaderData<typeof loader>(); ... }
```

From templates/mail/server/plugins/auth.ts (current publicPaths):
```typescript
publicPaths: [
  "/api/gmail/push",
  "/api/gmail/watch/renew",
  "/gymos",
]
```
</interfaces>

</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend auth.ts publicPaths so all D1 demo surfaces bypass Google sign-in</name>
  <files>templates/mail/server/plugins/auth.ts</files>
  <read_first>
    - templates/mail/server/plugins/auth.ts (see current publicPaths array — must preserve existing entries)
    - templates/mail/app/routes/gymos.tsx (reference pattern — confirms /gymos already works as a publicPath)
    - .planning/STATE.md (confirms demo bypass intent — "We bypassed by adding /gymos to publicPaths for the demo")
  </read_first>
  <action>
Edit `templates/mail/server/plugins/auth.ts`. In the `publicPaths` array (currently `["/api/gmail/push", "/api/gmail/watch/renew", "/gymos"]`), replace the single `"/gymos"` entry with these four exact strings:

```
"/gymos",
"/gymos/schedule",
"/gymos/members",
"/gymos/payments",
```

Preserve the two `/api/gmail/*` entries above them. Preserve the surrounding comment block ("GymOS Demo Sprint — bypass auth ..."). Do not touch any other field of `createAuthPlugin({...})`.

This single edit unblocks plans D1-01 (this one), D1-02 (members directory), and D1-03 (payments) to all run in parallel without each needing to touch this file.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/server/plugins/auth.ts','utf8'); const ok=s.includes('\"/gymos\"')&&s.includes('\"/gymos/schedule\"')&&s.includes('\"/gymos/members\"')&&s.includes('\"/gymos/payments\"')&&s.includes('\"/api/gmail/push\"'); process.exit(ok?0:1)"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"/gymos/schedule"' templates/mail/server/plugins/auth.ts` returns at least 1
    - `grep -c '"/gymos/members"' templates/mail/server/plugins/auth.ts` returns at least 1
    - `grep -c '"/gymos/payments"' templates/mail/server/plugins/auth.ts` returns at least 1
    - `grep -c '"/api/gmail/push"' templates/mail/server/plugins/auth.ts` returns at least 1 (existing entry preserved)
    - File still exports `createAuthPlugin({...})` as the default export
  </acceptance_criteria>
  <done>auth.ts publicPaths includes all four demo surface paths plus the pre-existing Gmail entries; no other fields changed</done>
</task>

<task type="auto">
  <name>Task 2: Create /gymos/schedule loader returning the seeded week of occurrences with class metadata and booking counts</name>
  <files>templates/mail/app/routes/gymos.schedule.tsx</files>
  <read_first>
    - templates/mail/app/routes/gymos.tsx (reference structure — mirror the imports, meta(), loader signature, drizzle query style, useLoaderData wiring)
    - templates/mail/server/db/schema.ts (confirms column names — classOccurrences.startsAt is ISO text; classDefinitions exports name + durationMin + defaultCapacity; bookings.status enum includes "booked")
    - templates/mail/app/components/ui/badge.tsx (Badge component used in gymos.tsx — same component will be used here)
  </read_first>
  <action>
Create new file `templates/mail/app/routes/gymos.schedule.tsx`. React Router v7 framework-mode route at URL path `/gymos/schedule` (file naming: dot separator = path segment, matching the existing `gymos.tsx`).

Module structure (mirror `gymos.tsx` exactly for consistency):

1. Header comment block: `// GymOS Schedule — Demo Sprint D1. Week-grid of seeded class occurrences with book-into-occurrence dialog. Standalone for demo; will move to apps/staff-web/features/schedule/ post-demo.`

2. Imports:
```typescript
import { useLoaderData, Form, redirect, useSearchParams } from "react-router";
import { eq, asc, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
```

3. `export function meta() { return [{ title: "GymOS — Schedule" }]; }`

4. `export async function loader({ request }: LoaderFunctionArgs)`:
   - `const url = new URL(request.url); const bookOccurrenceId = url.searchParams.get("book");`
   - `const db = getDb();`
   - Query A — list occurrences joined to definitions, ordered by `startsAt asc`:
     ```typescript
     const occurrences = await db
       .select({
         id: schema.classOccurrences.id,
         startsAt: schema.classOccurrences.startsAt,
         endsAt: schema.classOccurrences.endsAt,
         capacity: schema.classOccurrences.capacity,
         status: schema.classOccurrences.status,
         room: schema.classOccurrences.room,
         className: schema.classDefinitions.name,
         category: schema.classDefinitions.category,
         durationMin: schema.classDefinitions.durationMin,
       })
       .from(schema.classOccurrences)
       .leftJoin(schema.classDefinitions, eq(schema.classOccurrences.definitionId, schema.classDefinitions.id))
       .orderBy(asc(schema.classOccurrences.startsAt));
     ```
   - Query B — booking counts per occurrence (single query, group by):
     ```typescript
     const bookingCountsRows = await db
       .select({
         occurrenceId: schema.bookings.occurrenceId,
         count: sql<number>`COUNT(*)`,
       })
       .from(schema.bookings)
       .where(eq(schema.bookings.status, "booked"))
       .groupBy(schema.bookings.occurrenceId);
     const bookingCounts: Record<string, number> = {};
     for (const r of bookingCountsRows) bookingCounts[r.occurrenceId] = Number(r.count);
     ```
   - Query C — for the "Book a member" dialog: list of all gym members (only when `bookOccurrenceId` truthy):
     ```typescript
     let members: any[] = [];
     let bookOccurrence: any = null;
     if (bookOccurrenceId) {
       members = await db.select({
         id: schema.gymMembers.id,
         firstName: schema.gymMembers.firstName,
         lastName: schema.gymMembers.lastName,
       }).from(schema.gymMembers).orderBy(asc(schema.gymMembers.firstName));
       bookOccurrence = occurrences.find(o => o.id === bookOccurrenceId) ?? null;
     }
     ```
   - Return `{ occurrences, bookingCounts, members, bookOccurrence }`.

5. Helper `function groupByDay(occurrences)`:
   - Returns `Record<string /* YYYY-MM-DD in studio local */, Occurrence[]>`.
   - Use `new Date(o.startsAt).toISOString().slice(0,10)` as key for demo grade. Note in inline comment: "Demo uses UTC date bucket; production must use studio IANA timezone (DST-correct per SCH-07)."

6. Helper `function formatTime(iso: string)`:
   - `return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });`

7. `export default function GymosSchedule()`:
   - `const data = useLoaderData<typeof loader>();`
   - `const [params, setParams] = useSearchParams();`
   - Layout: full-height flex column. Header: "Class Schedule" + count badge.
   - Body: 7-column grid (Sun..Sat) where each column lists the day's occurrences as cards.
     - Each card shows: time (`formatTime(o.startsAt)`), class name, category badge, capacity indicator (`{bookingCounts[o.id] ?? 0} / {o.capacity}`).
     - Each card is a button: `onClick={() => setParams({ book: o.id })}`.
   - Dialog (`<Dialog open={!!data.bookOccurrence} onOpenChange={(open) => !open && setParams({})}>`):
     - Title: `Book into {bookOccurrence.className}`
     - Description: occurrence start time + capacity used/total
     - Body: `<Form method="post">` containing a hidden input `name="occurrenceId" value={bookOccurrence.id}`, a `<Select name="memberId">` populated from `data.members` (option text: `${firstName} ${lastName ?? ""}`), and a `<Button type="submit">Book</Button>` in the footer.

8. (Action defined separately — see Task 3.)

After saving, run `npx prettier --write templates/mail/app/routes/gymos.schedule.tsx` per AGENTS.md conventions.

Do NOT add atomic capacity check / SELECT FOR UPDATE / transaction wrapping. Per ROADMAP D1 success criteria + STATE.md: "demo-grade SELECT + INSERT (no atomic capacity check yet)". A capacity-full warning at render time is sufficient for the demo.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/gymos.schedule.tsx','utf8'); const checks=['export async function loader','export default function','schema.classOccurrences','leftJoin(schema.classDefinitions','schema.bookings','schema.gymMembers','Dialog','formatTime']; const missing=checks.filter(c=>!s.includes(c)); if(missing.length){console.error('MISSING:',missing);process.exit(1)} process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/gymos.schedule.tsx` exists
    - `grep -c 'export async function loader' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - `grep -c 'export default function' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - `grep -c 'schema.classOccurrences' templates/mail/app/routes/gymos.schedule.tsx` returns at least 2 (select + leftJoin reference)
    - `grep -c 'schema.classDefinitions' templates/mail/app/routes/gymos.schedule.tsx` returns at least 1
    - `grep -c 'schema.bookings' templates/mail/app/routes/gymos.schedule.tsx` returns at least 1 (booking-counts query)
    - `grep -c 'schema.gymMembers' templates/mail/app/routes/gymos.schedule.tsx` returns at least 1
    - `grep -c 'from "react-router"' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - `grep -c '@/components/ui/dialog' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - File has at least 200 lines
  </acceptance_criteria>
  <done>Loader queries occurrences + definitions + booking counts; member list query gated on `?book=` param; default component renders week grid with click-to-book interaction; dialog opens when book param is set</done>
</task>

<task type="auto">
  <name>Task 3: Add action handler in gymos.schedule.tsx that inserts a booking row (demo-grade, no atomicity)</name>
  <files>templates/mail/app/routes/gymos.schedule.tsx</files>
  <read_first>
    - templates/mail/app/routes/gymos.schedule.tsx (the file just created in Task 2 — extending it)
    - templates/mail/app/routes/gymos.tsx (lines 167-202 — reference action signature: formData parsing, db.insert pattern, redirect return)
    - templates/mail/server/db/schema.ts (lines 218-232 — bookings table columns: id, occurrenceId, memberId, status, bookedByUserId, bookedAt)
  </read_first>
  <action>
Append `export async function action({ request }: ActionFunctionArgs)` to `templates/mail/app/routes/gymos.schedule.tsx` (place it after `meta()` and before `loader`, matching `gymos.tsx` ordering — or just before the default export, whichever keeps the file readable).

Body:

```typescript
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const occurrenceId = String(formData.get("occurrenceId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  if (!occurrenceId || !memberId) {
    return { error: "Missing occurrenceId or memberId" };
  }

  const db = getDb();

  // Demo grade: simple INSERT. NO atomic capacity check, NO entitlement
  // resolution, NO pass debit. Production (BKG-03/BKG-04) wraps capacity
  // check + entitlement + pass debit in a single SQL transaction with
  // SELECT ... FOR UPDATE on the occurrence row.
  const bookingId = `bkg_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await db.insert(schema.bookings).values({
    id: bookingId,
    occurrenceId,
    memberId,
    status: "booked",
    bookedByUserId: null, // demo: no auth context
    bookedAt: now,
  });

  return redirect(`/gymos/schedule`);
}
```

Make sure `redirect` is imported from `react-router` at the top of the file (it already should be from Task 2 — verify). Make sure `ActionFunctionArgs` is imported as a type.

Run `npx prettier --write templates/mail/app/routes/gymos.schedule.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/gymos.schedule.tsx','utf8'); const checks=['export async function action','db.insert(schema.bookings)','status: \"booked\"','redirect(\"/gymos/schedule\")','ActionFunctionArgs']; const missing=checks.filter(c=>!s.includes(c)); if(missing.length){console.error('MISSING:',missing);process.exit(1)} process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export async function action' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - `grep -c 'db.insert(schema.bookings)' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - `grep -c 'status: "booked"' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - `grep -c 'redirect("/gymos/schedule")' templates/mail/app/routes/gymos.schedule.tsx` returns 1
    - Running `pnpm --filter mail dev` (manual verify, not automated for this task) shows the route compiles without TypeScript errors
  </acceptance_criteria>
  <done>Action handler reads form data, inserts a new booking row with status='booked', returns redirect to /gymos/schedule; combined with Task 2 the route is fully wired for the demo book-from-schedule flow</done>
</task>

</tasks>

<verification>
After all tasks complete, perform a manual smoke test (demo gate — automation can confirm files exist but the visual demo is the real gate):

1. `pnpm --filter mail dev` boots the dev server on `:8081`
2. Open `http://localhost:8081/gymos/schedule`
3. Expect: a week-grid showing the 7 seeded occurrences (Sun May 18 → Fri May 22), each card showing class name + time + capacity (e.g. "0 / 12")
4. Click any occurrence card
5. Expect: a dialog opens titled "Book into {className}" with a dropdown listing the 5 seeded members
6. Select a member, click Book
7. Expect: page refreshes, the clicked occurrence now shows "1 / 12" (or higher) capacity
8. Refresh the page — booking persists (came from DB, not state)

Automated row-level verification:
```bash
# Via Neon SQL — confirm a new booking row exists after a manual test:
# SELECT COUNT(*) FROM bookings WHERE occurrence_id IS NOT NULL AND status = 'booked';
# Count should increase by 1 per book action.
```
</verification>

<success_criteria>
- [ ] `/gymos/schedule` renders without errors
- [ ] All 7 seeded occurrences from Neon are visible in the week grid
- [ ] Each card shows class name + start time + capacity used/total
- [ ] Clicking a card opens a booking dialog
- [ ] Selecting a member + clicking Book inserts a `bookings` row with status='booked'
- [ ] After booking, the capacity count visibly increments on page refresh
- [ ] `/gymos/schedule`, `/gymos/members`, `/gymos/payments` are all in `auth.ts` publicPaths
- [ ] Existing `/gymos` inbox route still works (sanity check)
</success_criteria>

<output>
After completion, create `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-01-schedule-surface-SUMMARY.md` documenting: route file created, auth bypass extension, booking flow demo grade limitations (no atomic capacity check — flagged for BKG-03 in Production v1).
</output>
