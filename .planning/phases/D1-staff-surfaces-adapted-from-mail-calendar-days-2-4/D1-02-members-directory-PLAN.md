---
phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - templates/mail/app/routes/gymos.members.tsx
  - templates/mail/app/routes/gymos.members.$id.tsx
autonomous: true
requirements: [MEM-01, MEM-02]
must_haves:
  truths:
    - "Coach can open /gymos/members and see all 5 seeded members in a directory list"
    - "Each row shows name, phone, goal, and pass balance"
    - "Clicking a row navigates to /gymos/members/<id> profile page"
    - "Profile shows member basics + pass balance (derived from passes − pass_debits) + upcoming/past bookings + recent food entries + link back to the member's conversation"
  artifacts:
    - path: "templates/mail/app/routes/gymos.members.tsx"
      provides: "Members directory list — loader + default component"
      exports: ["loader", "meta", "default"]
      min_lines: 100
    - path: "templates/mail/app/routes/gymos.members.$id.tsx"
      provides: "Member profile page — loader + default component"
      exports: ["loader", "meta", "default"]
      min_lines: 150
  key_links:
    - from: "gymos.members.tsx loader"
      to: "schema.gymMembers + schema.passes + schema.passDebits"
      via: "drizzle select with leftJoin for pass balance aggregation"
      pattern: "gymMembers.*leftJoin"
    - from: "gymos.members.$id.tsx loader"
      to: "schema.bookings + schema.classOccurrences + schema.classDefinitions"
      via: "drizzle select with leftJoin chain to fetch booking timeline"
      pattern: "bookings.*leftJoin.*classOccurrences"
    - from: "Profile page conversation link"
      to: "/gymos?conversation={conversationId}"
      via: "anchor tag href"
      pattern: "/gymos\\?conversation="
---

<objective>
Build the staff member directory + per-member profile surfaces at `/gymos/members` and `/gymos/members/:id`. The directory shows all 5 seeded members; the profile shows pass balance, bookings timeline, recent food entries, and a deep-link to the member's WhatsApp conversation (closing the loop with the already-shipped inbox).

Purpose: Demo Sprint deliverable for MEM-01 (directory) + MEM-02 (profile). Mirrors the structure of `gymos.tsx` (the already-shipped inbox surface). Demo-grade — no pagination, no search, no edit (those are MEM-03/MEM-05 in Production v1).

Output:
- New route file `templates/mail/app/routes/gymos.members.tsx` — directory list
- New route file `templates/mail/app/routes/gymos.members.$id.tsx` — profile detail (RR v7 dollar-prefix = dynamic segment, matching the existing `$view.$threadId.tsx` pattern)
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

<interfaces>
<!-- Key types and exports the executor needs. Extracted from codebase. -->

From templates/mail/server/db/index.ts:
```typescript
export const getDb: () => DrizzleDb;
export { schema };
```

From templates/mail/server/db/schema.ts:
```typescript
// gymMembers — table "gym_members"
{ id, userId, firstName, lastName, email, phoneE164, dateOfBirth, sex,
  heightCm, weightKg, goal, activityLevel, marketingConsent, notes,
  createdAt, updatedAt }

// passes
{ id, memberId, granted /* int credits */, source, stripeChargeId,
  stripeSubscriptionId, productName, expiresAt, createdAt }

// passDebits — append-only ledger; positive=consumed, negative=refund
{ id, passId, bookingId, amount, reason, createdAt }

// bookings
{ id, occurrenceId, memberId, status, passId, bookedByUserId,
  bookedAt, cancelledAt, attendedAt }

// classOccurrences
{ id, definitionId, startsAt, endsAt, capacity, ... }

// classDefinitions
{ id, name, durationMin, ... }

// foodEntries
{ id, memberId, foodItemId, loggedAt, mealType, quantityG,
  kcal, proteinG, carbsG, fatG, source, createdAt }

// conversations
{ id, memberId, channel, status, unreadCount, lastInboundAt,
  lastOutboundAt, lastMessagePreview, createdAt, updatedAt }
```

From RR v7 file routing convention (confirmed by templates/mail/app/routes/ listing):
- `gymos.members.tsx` → URL `/gymos/members`
- `gymos.members.$id.tsx` → URL `/gymos/members/:id` (dollar prefix = dynamic segment, matches `$view.$threadId.tsx` already in the routes dir)

LoaderFunctionArgs.params is typed `{ [key: string]: string | undefined }`. Access as `params.id`.

Pass balance formula (already used in templates/mail/app/routes/gymos.tsx lines 76-91):
```typescript
const passes = await db.select().from(schema.passes).where(eq(schema.passes.memberId, memberId));
const debitsTotal = await db
  .select({ sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)` })
  .from(schema.passDebits)
  .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
  .where(eq(schema.passes.memberId, memberId))
  .then(r => Number(r[0]?.sum ?? 0));
const balance = passes.reduce((s,p) => s + p.granted, 0) - debitsTotal;
```
</interfaces>

</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /gymos/members directory route with member list + per-row pass balance</name>
  <files>templates/mail/app/routes/gymos.members.tsx</files>
  <read_first>
    - templates/mail/app/routes/gymos.tsx (lines 1-50 for imports + meta pattern; lines 76-91 for the pass-balance aggregation formula)
    - templates/mail/server/db/schema.ts (lines 115-138 for gymMembers columns; lines 235-258 for passes + passDebits columns)
    - templates/mail/app/components/ui/badge.tsx (Badge component already used in gymos.tsx)
  </read_first>
  <action>
Create new file `templates/mail/app/routes/gymos.members.tsx`. React Router v7 framework-mode route at URL path `/gymos/members`.

Module structure (mirror `gymos.tsx`):

1. Header comment: `// GymClassOS Members — Demo Sprint D1. Directory of seeded gym members with pass-balance summary. Standalone for demo; will move to apps/staff-web/features/members/ post-demo.`

2. Imports:
```typescript
import { useLoaderData, Link } from "react-router";
import { eq, asc, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs } from "react-router";
```

3. `export function meta() { return [{ title: "GymClassOS — Members" }]; }`

4. `export async function loader({ request }: LoaderFunctionArgs)`:
   - `const db = getDb();`
   - Query A — members ordered by firstName:
     ```typescript
     const members = await db.select().from(schema.gymMembers).orderBy(asc(schema.gymMembers.firstName));
     ```
   - Query B — pass-balance aggregation per member (single query, joined):
     ```typescript
     const passTotals = await db
       .select({
         memberId: schema.passes.memberId,
         granted: sql<number>`COALESCE(SUM(${schema.passes.granted}), 0)`,
       })
       .from(schema.passes)
       .groupBy(schema.passes.memberId);

     const debitTotals = await db
       .select({
         memberId: schema.passes.memberId,
         debited: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)`,
       })
       .from(schema.passDebits)
       .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
       .groupBy(schema.passes.memberId);

     const balances: Record<string, number> = {};
     for (const r of passTotals) balances[r.memberId] = Number(r.granted);
     for (const r of debitTotals) {
       if (r.memberId) balances[r.memberId] = (balances[r.memberId] ?? 0) - Number(r.debited);
     }
     ```
   - Return `{ members, balances }`.

5. `export default function GymosMembers()`:
   - `const data = useLoaderData<typeof loader>();`
   - Layout: full-height container, max-width 1024px centered.
   - Header: "Members" + count badge.
   - Table-like list (use a div-based list, not `<table>` for simplicity matching gymos.tsx style; or use the shadcn `Table` component imported from `@/components/ui/table` for nicer rendering — either is fine).
   - Each row is a `<Link to={`/gymos/members/${m.id}`}>` showing:
     - Name (firstName + lastName)
     - phoneE164
     - goal (capitalized)
     - Pass balance badge: `{balances[m.id] ?? 0} credits`
   - Hover state: row background tint (`hover:bg-accent/40`).

Run `npx prettier --write templates/mail/app/routes/gymos.members.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/gymos.members.tsx','utf8'); const checks=['export async function loader','export default function','schema.gymMembers','schema.passes','schema.passDebits','from \"react-router\"','Link','to={`/gymos/members/${']; const missing=checks.filter(c=>!s.includes(c)); if(missing.length){console.error('MISSING:',missing);process.exit(1)} process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/gymos.members.tsx` exists
    - `grep -c 'export async function loader' templates/mail/app/routes/gymos.members.tsx` returns 1
    - `grep -c 'export default function' templates/mail/app/routes/gymos.members.tsx` returns 1
    - `grep -c 'schema.gymMembers' templates/mail/app/routes/gymos.members.tsx` returns at least 1
    - `grep -c 'schema.passes' templates/mail/app/routes/gymos.members.tsx` returns at least 1
    - `grep -c 'schema.passDebits' templates/mail/app/routes/gymos.members.tsx` returns at least 1
    - `grep -c 'Link' templates/mail/app/routes/gymos.members.tsx` returns at least 2 (import + JSX)
    - `grep -c '/gymos/members/' templates/mail/app/routes/gymos.members.tsx` returns at least 1 (href to detail)
    - File has at least 100 lines
  </acceptance_criteria>
  <done>Loader returns members + per-member pass balances; default component renders directory list with row-click navigation to /gymos/members/:id</done>
</task>

<task type="auto">
  <name>Task 2: Create /gymos/members/:id profile route with bookings, passes, food, and conversation deep-link</name>
  <files>templates/mail/app/routes/gymos.members.$id.tsx</files>
  <read_first>
    - templates/mail/app/routes/gymos.tsx (lines 58-152 for the member-context aggregation pattern — bookings timeline + pass balance + food summary all already implemented there; this profile page replicates that data shape on a full page instead of a side panel)
    - templates/mail/server/db/schema.ts (lines 115-138 gymMembers; lines 218-232 bookings; lines 235-258 passes/passDebits; lines 282-302 foodEntries; lines 141-156 conversations)
    - templates/mail/app/routes/gymos.members.tsx (the file just created in Task 1 — same import style + Link pattern)
  </read_first>
  <action>
Create new file `templates/mail/app/routes/gymos.members.$id.tsx`. URL path `/gymos/members/:id` (dollar-prefix file convention confirmed by existing `$view.$threadId.tsx` route file in the same directory).

Module structure:

1. Header comment: `// GymClassOS Member Profile — Demo Sprint D1. Per-member detail: pass balance, bookings, recent food, deep-link to WhatsApp conversation.`

2. Imports:
```typescript
import { useLoaderData, Link } from "react-router";
import { eq, desc, sql, asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs } from "react-router";
```

3. `export function meta() { return [{ title: "GymClassOS — Member Profile" }]; }`

4. `export async function loader({ params }: LoaderFunctionArgs)`:
   - `const memberId = params.id; if (!memberId) throw new Response("Not found", { status: 404 });`
   - `const db = getDb();`
   - Query 1 — member:
     ```typescript
     const member = await db.select().from(schema.gymMembers)
       .where(eq(schema.gymMembers.id, memberId)).limit(1).then(r => r[0] ?? null);
     if (!member) throw new Response("Member not found", { status: 404 });
     ```
   - Query 2 — passes for member:
     ```typescript
     const passes = await db.select().from(schema.passes)
       .where(eq(schema.passes.memberId, memberId))
       .orderBy(desc(schema.passes.createdAt));
     ```
   - Query 3 — debits total (re-use formula from gymos.tsx lines 81-89):
     ```typescript
     const debitsTotal = await db
       .select({ sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)` })
       .from(schema.passDebits)
       .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
       .where(eq(schema.passes.memberId, memberId))
       .then(r => Number(r[0]?.sum ?? 0));
     const grantedTotal = passes.reduce((s, p) => s + p.granted, 0);
     const passBalance = grantedTotal - debitsTotal;
     ```
   - Query 4 — bookings joined to occurrences + class definitions, ordered by occurrence start desc:
     ```typescript
     const bookings = await db.select({
       id: schema.bookings.id,
       status: schema.bookings.status,
       bookedAt: schema.bookings.bookedAt,
       startsAt: schema.classOccurrences.startsAt,
       className: schema.classDefinitions.name,
     })
       .from(schema.bookings)
       .leftJoin(schema.classOccurrences, eq(schema.bookings.occurrenceId, schema.classOccurrences.id))
       .leftJoin(schema.classDefinitions, eq(schema.classOccurrences.definitionId, schema.classDefinitions.id))
       .where(eq(schema.bookings.memberId, memberId))
       .orderBy(desc(schema.classOccurrences.startsAt));
     ```
   - Query 5 — recent food entries (limit 10):
     ```typescript
     const foodEntries = await db.select()
       .from(schema.foodEntries)
       .where(eq(schema.foodEntries.memberId, memberId))
       .orderBy(desc(schema.foodEntries.loggedAt))
       .limit(10);
     ```
   - Query 6 — conversation (for the deep-link button):
     ```typescript
     const conversation = await db.select({ id: schema.conversations.id })
       .from(schema.conversations)
       .where(eq(schema.conversations.memberId, memberId))
       .limit(1).then(r => r[0] ?? null);
     ```
   - Return `{ member, passes, passBalance, bookings, foodEntries, conversation }`.

5. `export default function GymosMemberProfile()`:
   - `const data = useLoaderData<typeof loader>();`
   - Layout: max-width 960px centered, vertical stack of Cards.
   - **Header block**: `<Link to="/gymos/members">← All members</Link>` + member name (h1) + phoneE164 + email + goal/activityLevel badges.
     - If `data.conversation`, render `<Link to={`/gymos?conversation=${data.conversation.id}`}><Button>Open WhatsApp conversation</Button></Link>` — this is the key cross-surface deep-link.
   - **Pass balance Card**: large number `{data.passBalance} credits` + list of passes underneath (each: productName, granted, expiresAt if set).
   - **Bookings Card**: list of `data.bookings`. Each row: class name, occurrence date/time, status badge.
     - Split visually into "Upcoming" (occurrence startsAt > now AND status='booked') and "Past" (everything else).
   - **Recent food Card**: list of `data.foodEntries`. Each row: loggedAt date + mealType + kcal + protein (use `food_items` join later in production; demo just shows the snapshotted kcal/protein from foodEntries).

Run `npx prettier --write templates/mail/app/routes/gymos.members.$id.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/gymos.members.$id.tsx','utf8'); const checks=['export async function loader','export default function','params.id','schema.gymMembers','schema.passes','schema.bookings','schema.classOccurrences','schema.foodEntries','schema.conversations','/gymos?conversation=','/gymos/members']; const missing=checks.filter(c=>!s.includes(c)); if(missing.length){console.error('MISSING:',missing);process.exit(1)} process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/gymos.members.$id.tsx` exists (note the $ in filename)
    - `grep -c 'params.id' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c 'schema.gymMembers' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c 'schema.passes' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c 'schema.passDebits' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c 'schema.bookings' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c 'schema.classOccurrences' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c 'schema.foodEntries' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c 'schema.conversations' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1
    - `grep -c '/gymos?conversation=' templates/mail/app/routes/gymos.members.$id.tsx` returns at least 1 (cross-surface deep link)
    - File has at least 150 lines
  </acceptance_criteria>
  <done>Loader fetches all member context with 6 queries; default component renders a profile page with header + pass balance card + bookings card + food card; cross-surface deep-link to inbox conversation present</done>
</task>

</tasks>

<verification>
Manual smoke test:

1. `pnpm --filter mail dev` boots on :8081
2. Open `http://localhost:8081/gymos/members`
3. Expect: list of 5 seeded members with name + phone + goal + pass balance
4. Click one member
5. Expect: profile page renders with that member's name, pass balance card, bookings list, food list, and (if they have a conversation) an "Open WhatsApp conversation" button
6. Click the conversation button
7. Expect: navigate to `/gymos?conversation=conv_xx` and the inbox surface opens that thread (verifies cross-surface deep-link works — closes the inbox ↔ profile loop)

Automated sanity (counts from Neon should match seeded data — 5 members, 5 passes, etc.):
```bash
# Hit the routes directly:
# curl -s http://localhost:8081/gymos/members | grep -c 'gymos/members/mem_' should return 5
# curl -s http://localhost:8081/gymos/members/mem_01 | grep -c 'WhatsApp conversation' should return 1
```
</verification>

<success_criteria>
- [ ] `/gymos/members` lists all 5 seeded members with correct pass balance
- [ ] Each row links to `/gymos/members/<id>`
- [ ] Profile page renders for each member without errors
- [ ] Pass balance on profile equals grantedTotal − debitsTotal (matches inbox panel value for the same member)
- [ ] Bookings list shows the member's bookings with class name + time + status
- [ ] Food entries list shows the seeded entries for that member (if any)
- [ ] Conversation deep-link button navigates back to `/gymos?conversation=<id>`
- [ ] No TypeScript compile errors in either file
</success_criteria>

<output>
After completion, create `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-02-members-directory-SUMMARY.md` documenting: directory and profile routes created, cross-surface deep-link to inbox, demo-grade limits (no pagination/search/edit — flagged for MEM-03/05 in Production v1).
</output>
