---
phase: MA2-member-booking-surface
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/lib/member-session.ts
  - apps/staff-web/app/routes/api.m.schedule.tsx
  - apps/staff-web/app/routes/api.m.bookings.tsx
  - apps/staff-web/app/routes/api.m.profile.tsx
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [MEM-01, MEM-03, MEM-05]
must_haves:
  truths:
    - "An anonymous request (no Bearer) to GET /api/m/schedule returns 200 with items (every isBookedByMe:false), never 401"
    - "A signed-in member with an active pass + capacity that POSTs /api/m/bookings gets a booking with pass_id set AND a +1 pass_debits row in one transaction"
    - "A booking attempt with no active pass returns HTTP 402 {error:'NO_PASS'} and inserts NO booking row"
    - "A booking attempt on a full occurrence returns HTTP 409 {error:'CAPACITY_FULL'} and inserts NO booking row"
    - "GET /api/m/profile returns an additive upcomingBookings[] array scoped to the caller's own member.id (no cross-member rows)"
  artifacts:
    - path: "apps/staff-web/server/lib/member-session.ts"
      provides: "getOptionalMember(request): Member | null — never throws 401"
      contains: "export async function getOptionalMember"
    - path: "apps/staff-web/app/routes/api.m.bookings.tsx"
      provides: "Atomic capacity-check + pass-pick + pass_debits +1 + bookings.pass_id"
      contains: "db.transaction"
    - path: "apps/staff-web/app/routes/api.m.schedule.tsx"
      provides: "Anonymous read branch via getOptionalMember"
      contains: "getOptionalMember"
    - path: "apps/staff-web/app/routes/api.m.profile.tsx"
      provides: "upcomingBookings[] additive field"
      contains: "upcomingBookings"
  key_links:
    - from: "api.m.bookings.tsx"
      to: "schema.passDebits"
      via: "tx.insert with amount:1, reason:'class_booking', passId, bookingId"
      pattern: "passDebits"
    - from: "api.m.bookings.tsx"
      to: "schema.bookings.passId"
      via: "insert booking with passId set to the picked active pass"
      pattern: "passId"
    - from: "api.m.schedule.tsx"
      to: "member-session.getOptionalMember"
      via: "import + call instead of requireMemberOrDemo for the read"
      pattern: "getOptionalMember"
---

<objective>
Make the member API server-side honor "browse public, book authenticated, debit-on-booking". Three changes, no schema migration:

1. **MEM-01 (server half):** add `getOptionalMember(request)` and switch `/api/m/schedule` to an anonymous read branch so unauthenticated requests get the browse-only schedule (HTTP 200, never 401).
2. **MEM-03 (server):** replace the demo-grade `/api/m/bookings` insert with one atomic transaction (capacity check + active-pass resolution + positive `pass_debits` + `bookings.pass_id`), mirroring `apps/staff-web/actions/cancel-occurrence.ts` so cancellations reconcile against the same `passId`.
3. **MEM-05 (server half):** add an additive `upcomingBookings[]` array to `/api/m/profile` scoped to the caller's own `member.id`.

Purpose: this is the server contract the mobile plans (MA2-02 / MA2-03) wire against. The booking transaction is the core correctness work of the whole phase.
Output: 4 modified server files. NO migration. NO new dependency. NO new agent tool (member booking stays REST).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/MA2-member-booking-surface/MA2-CONTEXT.md
@.planning/phases/MA2-member-booking-surface/MA2-RESEARCH.md

<interfaces>
<!-- Contracts the executor needs — extracted from the codebase. Use directly; no exploration. -->

Schema (apps/staff-web/server/db/schema.ts — DO NOT change, all columns already exist):
```ts
bookings:    { id, occurrenceId, memberId, status('booked'|'waitlist'|'cancelled'|'attended'|'no_show'),
               passId /* text, nullable — already exists */, bookedByUserId, bookedAt, cancelledAt, attendedAt }
passes:      { id, memberId, granted /* int */, source, stripeChargeId, stripeSubscriptionId,
               productName, expiresAt /* ISO text or null = never */, createdAt }
              // NO status column — "active" = expiresAt IS NULL OR expiresAt > now()
passDebits:  { id, passId /* NOT NULL */, bookingId /* nullable */, amount /* int, +consumed / -refund */,
               reason, createdAt }
classOccurrences: { id, definitionId, startsAt, endsAt, capacity /* int */, status('scheduled'|'cancelled'|'completed'), room, ... }
```

requireMember contract (apps/staff-web/server/lib/member-session.ts — keep unchanged, mirror its shape):
```ts
export async function requireMember(request: Request): Promise<Member>  // throws 401/403/409 Responses
async function sessionFromRequest(request: Request)  // h3 v2 adapter shim — { req, headers, url, path }; REUSE, do not re-derive (RESEARCH Pitfall 5)
export type Member  // = gymMembers $inferSelect
```

cancel-occurrence refund mirror (apps/staff-web/actions/cancel-occurrence.ts — the proven transaction pattern):
```ts
await db.transaction(async (tx) => { /* re-check status, fetch bookings, batch update, per-booking pass_debit, update occurrence */ });
await tx.insert(schema.passDebits).values({ id:`pdebit_refund_${nanoid()}`, passId: booking.passId!, bookingId: booking.id, amount: -1, reason: "cancellation_refund", createdAt: new Date().toISOString() });
```
Booking debit is the MIRROR IMAGE: amount: +1, reason: "class_booking".
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getOptionalMember + anonymous read branch on /api/m/schedule (MEM-01 server)</name>
  <files>apps/staff-web/server/lib/member-session.ts, apps/staff-web/app/routes/api.m.schedule.tsx, apps/staff-web/AGENTS.md</files>
  <read_first>
    - apps/staff-web/server/lib/member-session.ts (requireMember + sessionFromRequest shim — getOptionalMember mirrors requireMember minus the throws)
    - apps/staff-web/app/routes/api.m.schedule.tsx (Query A/B/C; Query C is the per-member booked-set)
    - apps/staff-web/AGENTS.md (Member API section — document the anon-read exception here)
  </read_first>
  <action>
    1. In `apps/staff-web/server/lib/member-session.ts`, add and export:
       `export async function getOptionalMember(request: Request): Promise<Member | null>`.
       Implementation = `requireMember` minus all throws. Steps:
       - `const session = await sessionFromRequest(request);` (REUSE the existing shim — RESEARCH Pitfall 5; do NOT build a new event shape).
       - If `!session?.userId` return `null`.
       - Fast-path claim lookup: `select * from gymMembers where userId = session.userId limit 1` (carry `// guard:allow-unscoped — single-tenant gym tables`). If found, return it.
       - If not found, return `null` (do NOT attempt the lazy claim-by-email here — keep the GET side-effect-free; claim happens on the first write/profile call via requireMember). Never throw.
    2. In `apps/staff-web/app/routes/api.m.schedule.tsx`:
       - Replace `import { requireMemberOrDemo }` with `import { getOptionalMember } from "../../server/lib/member-session";` (keep requireMemberOrDemo import only if still needed elsewhere — it is not).
       - Replace `const member = await requireMemberOrDemo(request);` with `const member = await getOptionalMember(request);` (returns `Member | null`).
       - Keep Query A (occurrences) and Query B (booking counts) exactly as-is — they run for everyone.
       - Guard Query C (the per-member booked-set): only run it when `member` is non-null; otherwise `const mySet = new Set<string>();`. Then `isBookedByMe: mySet.has(o.id)` evaluates to false for anonymous callers.
       - Note: in DEMO_MODE the demo header path is dropped for this read; that is intentional and acceptable (anonymous browse supersedes demo for the public schedule). All write endpoints keep requireMemberOrDemo.
    3. In `apps/staff-web/AGENTS.md` Member API section, add one line documenting that `/api/m/schedule` GET has a deliberate anonymous read branch via `getOptionalMember` (returns browse-only data, no member-scoped fields) — this honors the bearer-gate rule because an anonymous read asserts NO identity and returns NO member-scoped data.
  </action>
  <acceptance_criteria>
    - `grep -n "export async function getOptionalMember" apps/staff-web/server/lib/member-session.ts` matches.
    - `grep -n "sessionFromRequest" apps/staff-web/server/lib/member-session.ts` shows getOptionalMember reuses the shim (no new `node:{req,res}` shape introduced).
    - `grep -n "getOptionalMember" apps/staff-web/app/routes/api.m.schedule.tsx` matches; `grep -n "requireMemberOrDemo" apps/staff-web/app/routes/api.m.schedule.tsx` returns nothing.
    - `grep -n "member ?" apps/staff-web/app/routes/api.m.schedule.tsx` OR an explicit `if (member)` guard wraps Query C (mySet defaults to empty Set when member is null).
    - `npx tsc --noEmit` in apps/staff-web is clean for these files (getOptionalMember return type Member|null handled).
    - apps/staff-web/AGENTS.md mentions the anonymous read branch for /api/m/schedule.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Atomic pass-debit-on-booking transaction in /api/m/bookings (MEM-03 server) — the core work</name>
  <files>apps/staff-web/app/routes/api.m.bookings.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/api.m.bookings.tsx (current demo-grade insert — its own comment says "NO atomic capacity check, NO entitlement resolution, NO pass debit")
    - apps/staff-web/actions/cancel-occurrence.ts (the proven db.transaction pattern + the negative pass_debit shape to mirror as +1)
    - apps/staff-web/app/routes/api.m.profile.tsx (the two-aggregation balance pattern — granted SUM vs debits SUM; NEVER chain-join pass_debits)
    - apps/staff-web/server/db/schema.ts lines 289-329 (bookings.passId, passes.expiresAt, passDebits)
  </read_first>
  <action>
    Rewrite the `action()` POST handler so the booking insert runs inside ONE `db.transaction(async (tx) => {...})`, using the SAME `getDb()` + `db.transaction` pattern proven in `cancel-occurrence.ts` (transaction-capable driver already in prod). Keep `requireMemberOrDemo(request)` as the gate and the JSON body parse / missing-occurrenceId 400s exactly as they are now. Inside the transaction, in order:

    1. **Idempotency pre-check (move INSIDE the txn):** `select id from bookings where occurrenceId=? and memberId=member.id and status='booked' limit 1`. If found, set a captured `existingId` and return early from the txn (no insert). After the txn, respond 200 `{ bookingId: existingId, alreadyBooked: true }`.
    2. **Lock + validate the occurrence:** `select id, capacity, status from class_occurrences where id=occurrenceId limit 1` with a row lock — `.for("update")` (closes the capacity race per RESEARCH Pattern 3; if the driver rejects FOR UPDATE the transaction + count below is still the correctness floor). If no row → capture `notFound=true`, return. If `status !== 'scheduled'` → capture `unavailable=true`, return.
    3. **Capacity check:** `select count(*) from bookings where occurrenceId=? and status='booked'`. If `count >= occurrence.capacity` → capture `capacityFull=true`, return.
    4. **Resolve an active pass with remaining credit (FIFO):**
       - `select id, granted, expiresAt, createdAt from passes where memberId=member.id and (expiresAt IS NULL OR expiresAt > now)` ordered by `expiresAt ASC NULLS LAST, createdAt ASC` (use drizzle `sql` for NULLS LAST). `now = new Date().toISOString()`.
       - For each candidate pass compute remaining = `granted - SUM(amount of its own pass_debits)` (per-pass: `select COALESCE(SUM(amount),0) from pass_debits where passId = candidate.id`). Pick the FIRST candidate with `remaining > 0`. Do NOT chain-join through pass_debits (fan-out double-counts).
       - If none has remaining > 0 → capture `noPass=true`, return.
    5. **Insert booking with passId:** `tx.insert(bookings).values({ id:`bkg_${crypto.randomUUID()}`, occurrenceId, memberId:member.id, status:'booked', passId: pickedPass.id, bookedByUserId:null, bookedAt:new Date().toISOString() })`. Capture `bookingId`.
    6. **Insert the positive debit (mirror of cancel-occurrence's -1):** `tx.insert(passDebits).values({ id:`pdebit_${nanoid()}`, passId: pickedPass.id, bookingId, amount: 1, reason:'class_booking', createdAt:new Date().toISOString() })`. Import `nanoid` from "nanoid" (same import cancel-occurrence uses).

    After the transaction, translate the captured flags to Responses (Content-Type application/json):
    - `notFound` → 404 `{ error: "OCCURRENCE_NOT_FOUND" }`
    - `unavailable` → 409 `{ error: "OCCURRENCE_UNAVAILABLE" }`
    - `capacityFull` → 409 `{ error: "CAPACITY_FULL" }`
    - `noPass` → 402 `{ error: "NO_PASS" }`
    - existing → 200 `{ bookingId: existingId, alreadyBooked: true }`
    - success → 200 `{ bookingId, passId: pickedPass.id, alreadyBooked: false }`

    Keep all gym-table queries marked `// guard:allow-unscoped — single-tenant gym tables`. Update the file's top comment to state the demo-grade caveat is now resolved (atomic capacity + entitlement + debit + passId).
  </action>
  <acceptance_criteria>
    - `grep -n "db.transaction" apps/staff-web/app/routes/api.m.bookings.tsx` matches exactly one transaction.
    - `grep -n "passDebits" apps/staff-web/app/routes/api.m.bookings.tsx` shows a +1 insert with `reason: "class_booking"` (`grep -n "class_booking"` matches).
    - `grep -n "passId:" apps/staff-web/app/routes/api.m.bookings.tsx` shows the booking insert sets passId to the picked pass.
    - `grep -nE "NO_PASS|CAPACITY_FULL" apps/staff-web/app/routes/api.m.bookings.tsx` matches both error codes; `grep -n "402" / "409"` present for the respective statuses.
    - `grep -n "expiresAt" apps/staff-web/app/routes/api.m.bookings.tsx` shows the active-pass filter (NULL or future); FIFO order present (`grep -nE "createdAt|NULLS LAST"`).
    - NO chain-join: `grep -n "leftJoin" apps/staff-web/app/routes/api.m.bookings.tsx` returns nothing through pass_debits for balance (per-pass SUM is a separate select).
    - `grep -n "from \"nanoid\"" apps/staff-web/app/routes/api.m.bookings.tsx` matches.
    - `npx tsc --noEmit` clean for this file.
    - Logic replay against Neon (billowing-sun-51091059) via Neon MCP OR a deploy smoke: a member with 1 credit booking an open class produces 1 booking row (passId set) + 1 pass_debits row (amount 1); a second identical POST is idempotent (no new rows); a member with 0 credits gets 402 and 0 new rows.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Additive upcomingBookings[] on /api/m/profile (MEM-05 server)</name>
  <files>apps/staff-web/app/routes/api.m.profile.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/api.m.profile.tsx (already returns single `upcomingBooking` via limit(1); two-aggregation passBalance; all queries scoped to member.id)
  </read_first>
  <action>
    Add an additive `upcomingBookings` array to the loader response — do NOT remove or change the existing `upcomingBooking` (singular, back-compat) or any other field.
    1. After the existing `upcoming` (limit 1) query, add a parallel query `upcomingList`: same joins (bookings → classOccurrences → classDefinitions), same WHERE (`bookings.memberId = member.id AND bookings.status='booked' AND classOccurrences.startsAt >= nowIso`), ordered `asc(classOccurrences.startsAt)`, `limit(10)`. Select `{ bookingId: bookings.id, occurrenceId: classOccurrences.id, startsAt: classOccurrences.startsAt, className: classDefinitions.name }`. Carry `// guard:allow-unscoped — single-tenant gym tables`.
    2. Add `upcomingBookings: upcomingList` to the returned object (alongside `upcomingBooking`). The array is inherently scoped to the caller's own `member.id` (success criterion 4 — no cross-member data).
  </action>
  <acceptance_criteria>
    - `grep -n "upcomingBookings" apps/staff-web/app/routes/api.m.profile.tsx` matches the returned field.
    - `grep -n "upcomingBooking" apps/staff-web/app/routes/api.m.profile.tsx` still shows the singular field (back-compat preserved).
    - `grep -n "limit(10)" apps/staff-web/app/routes/api.m.profile.tsx` matches the list query.
    - `grep -n "member.id" apps/staff-web/app/routes/api.m.profile.tsx` shows the list WHERE is member-scoped.
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` in apps/staff-web is clean for all four files.
- No new migration: `git diff --stat apps/staff-web/server/plugins/db.ts` shows NO change; no new file under server/db/migrations.
- No new dependency: `git diff apps/staff-web/package.json` is empty (nanoid already a dep — used by cancel-occurrence).
- Anonymous `GET /api/m/schedule` (no Authorization header) returns 200 with items (verify by deploy smoke or Neon-replay of the loader logic), every isBookedByMe:false.
- Booking endpoint behaviors proven by Neon-replay/deploy smoke: active-pass+capacity → booking+debit+passId; no pass → 402 NO_PASS, no rows; full → 409 CAPACITY_FULL, no rows; duplicate → idempotent.
</verification>

<success_criteria>
- MEM-01 (server): anonymous schedule read returns 200, never 401.
- MEM-03 (server): one atomic transaction does capacity check + active-pass FIFO pick + bookings.pass_id + +1 pass_debits; refunds via cancel-occurrence reconcile against the same passId.
- MEM-05 (server): upcomingBookings[] present, member-scoped, additive (singular preserved).
- Zero schema migration, zero new dependency, zero new agent tool.
</success_criteria>

<output>
After completion, create `.planning/phases/MA2-member-booking-surface/MA2-01-SUMMARY.md`.
</output>
