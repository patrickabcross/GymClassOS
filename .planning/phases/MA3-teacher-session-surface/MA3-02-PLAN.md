---
phase: MA3-teacher-session-surface
plan: 02
type: execute
wave: 2
depends_on: ["MA3-01"]
files_modified:
  - apps/staff-web/app/routes/api.m.teacher.schedule.tsx
  - apps/staff-web/server/routes/api/m/teacher/schedule.get.ts
  - apps/staff-web/app/routes/api.m.teacher.roster.tsx
  - apps/staff-web/server/routes/api/m/teacher/roster.get.ts
  - apps/staff-web/app/routes/api.m.teacher.check-in.tsx
  - apps/staff-web/server/routes/api/m/teacher/check-in.post.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [TCH-01, TCH-02]
user_setup: []

must_haves:
  truths:
    - "A teacher can GET /api/m/teacher/schedule and receive only occurrences where trainer_id = their trainerId (next 7 days, status scheduled)"
    - "A teacher with trainerId null OR no upcoming sessions gets HTTP 200 { items: [], trainerLinked } — never an error"
    - "A teacher can GET /api/m/teacher/roster?occurrenceId= and receive bookings (booked|attended) joined to gym_members, only for an occurrence they own"
    - "POST /api/m/teacher/check-in {bookingId} drives mark-booking-attended.run() (single write path; Meta Schedule CAPI fires inside it) only for a booking in a session the teacher owns"
  artifacts:
    - path: "apps/staff-web/app/routes/api.m.teacher.schedule.tsx"
      provides: "teacher's assigned occurrences loader"
      exports: ["loader"]
    - path: "apps/staff-web/app/routes/api.m.teacher.roster.tsx"
      provides: "per-occurrence roster loader with ownership gate"
      exports: ["loader"]
    - path: "apps/staff-web/app/routes/api.m.teacher.check-in.tsx"
      provides: "check-in action calling the attendance chokepoint"
      exports: ["action"]
  key_links:
    - from: "apps/staff-web/app/routes/api.m.teacher.check-in.tsx"
      to: "apps/staff-web/actions/mark-booking-attended.ts"
      via: "mod.default.schema + mod.default.run({bookingId})"
      pattern: "mark-booking-attended"
    - from: "apps/staff-web/app/routes/api.m.teacher.check-in.tsx"
      to: "class_occurrences.trainer_id"
      via: "ownership check booking → occurrence → trainer_id === requireTeacher().trainerId"
      pattern: "trainerId"
    - from: "apps/staff-web/app/routes/api.m.teacher.schedule.tsx"
      to: "apps/staff-web/server/lib/teacher-session.ts"
      via: "requireTeacher(request)"
      pattern: "requireTeacher"
---

<objective>
Build the three teacher resource routes — assigned schedule (TCH-01), per-session roster (TCH-01), and tap-to-check-in (TCH-02) — each gated by `requireTeacher` and each enforcing session ownership via the `trainers.user_id → class_occurrences.trainer_id` join. Check-in is a pure *caller* of the existing `mark-booking-attended` chokepoint: no new attendance write path, the v2.2 Meta Schedule CAPI event still fires inside the action.

Purpose: These are the server surfaces the Plan 03 mobile screens consume. They reuse the proven `api.m.schedule.tsx` query shape and the `approve-proposal.ts` programmatic-action pattern.
Output: 3 resource routes + 3 Nitro delegators (one nested `teacher/` directory) + AGENTS.md Member API documentation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA3-teacher-session-surface/MA3-CONTEXT.md
@.planning/phases/MA3-teacher-session-surface/MA3-RESEARCH.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- Contracts the executor needs — extracted from the codebase. -->

requireTeacher — from Plan 01 (apps/staff-web/server/lib/teacher-session.ts):
```ts
export type TeacherIdentity = { userId: string; email: string; trainerId: string | null };
export async function requireTeacher(request: Request): Promise<TeacherIdentity>; // throws 401/403
```

mark-booking-attended — EXISTS, UNCHANGED (apps/staff-web/actions/mark-booking-attended.ts):
```ts
// defineAction with NO http key — invoke as a library, never re-implement the UPDATE.
export default { schema: z.object({ bookingId: z.string().min(1) }), run: (args) => Promise<{attended:true} | {error:"BOOKING_NOT_FOUND"|"BOOKING_CANCELLED"}> }
```
Programmatic invocation pattern (from approve-proposal.ts lines 60-82):
```ts
const mod = await import("../../actions/mark-booking-attended.js");
const parsed = mod.default.schema.safeParse({ bookingId });
if (!parsed.success) return new Response("Bad input", { status: 400 });
const result = await mod.default.run(parsed.data); // fires Meta Schedule CAPI internally
```

Member schedule loader query shape to reuse (apps/staff-web/app/routes/api.m.schedule.tsx):
```ts
const nowIso = new Date().toISOString();
const sevenDaysIso = new Date(Date.now() + 7*24*60*60*1000).toISOString();
db.select({ id, startsAt, endsAt, capacity, status, room, className: classDefinitions.name, category, durationMin })
  .from(classOccurrences)
  .leftJoin(classDefinitions, eq(classOccurrences.definitionId, classDefinitions.id))
  .where(and(...))
  .orderBy(asc(classOccurrences.startsAt));
```

Relevant schema (apps/staff-web/server/db/schema.ts):
```ts
classOccurrences: { id, definitionId, startsAt, endsAt, capacity, status("scheduled"|"cancelled"|"completed"), room, location, trainerId, ... }
bookings: { id, occurrenceId, memberId, status("booked"|"waitlist"|"cancelled"|"attended"|"no_show"), ... }
gymMembers: { id, firstName(notNull), lastName(nullable), ... }
```

Nitro delegators: GET → copy server/routes/api/m/schedule.get.ts; POST → copy server/routes/api/m/bookings.post.ts. Nested files live in server/routes/api/m/teacher/ — the import path needs FIVE `../` to reach app/ (e.g. `../../../../../app/routes/api.m.teacher.schedule.js`).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Teacher assigned-schedule endpoint (TCH-01) + Nitro delegator</name>
  <read_first>
    - apps/staff-web/app/routes/api.m.schedule.tsx (Query A shape — copy and scope by trainerId)
    - apps/staff-web/server/routes/api/m/schedule.get.ts (GET delegator template)
    - apps/staff-web/server/lib/teacher-session.ts (requireTeacher)
    - apps/staff-web/server/db/schema.ts (classOccurrences, classDefinitions)
  </read_first>
  <files>apps/staff-web/app/routes/api.m.teacher.schedule.tsx, apps/staff-web/server/routes/api/m/teacher/schedule.get.ts</files>
  <action>
    Create the loader (app/routes/api.m.teacher.schedule.tsx). Gate with requireTeacher. If trainerId is null, return `{ items: [], trainerLinked: false }` (HTTP 200) — a teacher not yet linked is an empty state, NOT an error (Pitfall 3). Otherwise query occurrences scoped to the teacher's trainerId:
    ```ts
    import { and, asc, eq, gte, lte } from "drizzle-orm";
    import { getDb, schema } from "../../server/db";
    import { requireTeacher } from "../../server/lib/teacher-session";
    import type { LoaderFunctionArgs } from "react-router";

    export async function loader({ request }: LoaderFunctionArgs) {
      const teacher = await requireTeacher(request); // 401/403 inside
      if (!teacher.trainerId) return { items: [], trainerLinked: false };
      const db = getDb();
      const nowIso = new Date().toISOString();
      const sevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      // guard:allow-unscoped — single-tenant gym tables
      const items = await db
        .select({
          id: schema.classOccurrences.id,
          startsAt: schema.classOccurrences.startsAt,
          endsAt: schema.classOccurrences.endsAt,
          capacity: schema.classOccurrences.capacity,
          status: schema.classOccurrences.status,
          room: schema.classOccurrences.room,
          location: schema.classOccurrences.location,
          className: schema.classDefinitions.name,
          category: schema.classDefinitions.category,
          durationMin: schema.classDefinitions.durationMin,
        })
        .from(schema.classOccurrences)
        .leftJoin(schema.classDefinitions, eq(schema.classOccurrences.definitionId, schema.classDefinitions.id))
        .where(and(
          eq(schema.classOccurrences.trainerId, teacher.trainerId),
          gte(schema.classOccurrences.startsAt, nowIso),
          lte(schema.classOccurrences.startsAt, sevenDaysIso),
          eq(schema.classOccurrences.status, "scheduled"),
        ))
        .orderBy(asc(schema.classOccurrences.startsAt));
      return { items, trainerLinked: true };
    }
    ```
    Create the Nitro delegator server/routes/api/m/teacher/schedule.get.ts by copying schedule.get.ts and setting the import to `../../../../../app/routes/api.m.teacher.schedule.js` (FIVE `../` — file is one directory deeper).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "teacher.schedule" || echo "no teacher.schedule type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "requireTeacher(request)" apps/staff-web/app/routes/api.m.teacher.schedule.tsx` present
    - `grep -n "trainerLinked: false" apps/staff-web/app/routes/api.m.teacher.schedule.tsx` present (empty-state, not error)
    - `grep -n "eq(schema.classOccurrences.trainerId, teacher.trainerId)" apps/staff-web/app/routes/api.m.teacher.schedule.tsx` present (scoped query)
    - `grep -n "api.m.teacher.schedule.js" apps/staff-web/server/routes/api/m/teacher/schedule.get.ts` present
    - `grep -n "guard:allow-unscoped" apps/staff-web/app/routes/api.m.teacher.schedule.tsx` present
  </acceptance_criteria>
  <done>GET /api/m/teacher/schedule returns only the teacher's assigned scheduled occurrences for the next 7 days; an unlinked teacher or one with no sessions gets 200 {items:[], trainerLinked}; non-teachers 403.</done>
</task>

<task type="auto">
  <name>Task 2: Per-session roster endpoint with ownership gate (TCH-01) + Nitro delegator</name>
  <read_first>
    - apps/staff-web/app/routes/api.m.teacher.schedule.tsx (Task 1 — requireTeacher pattern)
    - apps/staff-web/server/db/schema.ts (bookings, gymMembers, classOccurrences)
    - apps/staff-web/server/routes/api/m/schedule.get.ts (GET delegator template)
  </read_first>
  <files>apps/staff-web/app/routes/api.m.teacher.roster.tsx, apps/staff-web/server/routes/api/m/teacher/roster.get.ts</files>
  <action>
    Create the loader (app/routes/api.m.teacher.roster.tsx). Read `occurrenceId` from the query string; gate with requireTeacher; verify the occurrence belongs to this teacher BEFORE returning any roster (403 otherwise — stops a teacher viewing another teacher's class):
    ```ts
    import { and, eq, inArray } from "drizzle-orm";
    import { getDb, schema } from "../../server/db";
    import { requireTeacher } from "../../server/lib/teacher-session";
    import type { LoaderFunctionArgs } from "react-router";

    export async function loader({ request }: LoaderFunctionArgs) {
      const teacher = await requireTeacher(request);
      const occurrenceId = new URL(request.url).searchParams.get("occurrenceId");
      if (!occurrenceId) throw new Response("occurrenceId required", { status: 400 });
      const db = getDb();
      // Ownership gate: the occurrence must be assigned to this teacher's trainerId
      // guard:allow-unscoped — single-tenant gym tables
      const [occ] = await db
        .select({ trainerId: schema.classOccurrences.trainerId })
        .from(schema.classOccurrences)
        .where(eq(schema.classOccurrences.id, occurrenceId))
        .limit(1);
      if (!occ) throw new Response("Not found", { status: 404 });
      if (!teacher.trainerId || occ.trainerId !== teacher.trainerId) {
        throw new Response("Forbidden", { status: 403 });
      }
      // Roster: booked|attended bookings joined to member name
      // guard:allow-unscoped — single-tenant gym tables
      const roster = await db
        .select({
          bookingId: schema.bookings.id,
          memberId: schema.bookings.memberId,
          firstName: schema.gymMembers.firstName,
          lastName: schema.gymMembers.lastName,
          status: schema.bookings.status,
        })
        .from(schema.bookings)
        .leftJoin(schema.gymMembers, eq(schema.bookings.memberId, schema.gymMembers.id))
        .where(and(
          eq(schema.bookings.occurrenceId, occurrenceId),
          inArray(schema.bookings.status, ["booked", "attended"]),
        ));
      return { occurrenceId, roster };
    }
    ```
    Create the Nitro delegator server/routes/api/m/teacher/roster.get.ts (copy schedule.get.ts; import `../../../../../app/routes/api.m.teacher.roster.js`).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "teacher.roster" || echo "no teacher.roster type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "occ.trainerId !== teacher.trainerId" apps/staff-web/app/routes/api.m.teacher.roster.tsx` present (ownership gate)
    - `grep -n 'inArray(schema.bookings.status, \["booked", "attended"\])' apps/staff-web/app/routes/api.m.teacher.roster.tsx` present
    - `grep -n "requireTeacher(request)" apps/staff-web/app/routes/api.m.teacher.roster.tsx` present
    - `grep -n "api.m.teacher.roster.js" apps/staff-web/server/routes/api/m/teacher/roster.get.ts` present
  </acceptance_criteria>
  <done>GET /api/m/teacher/roster?occurrenceId= returns booked+attended members (bookingId, memberId, firstName, lastName, status) only when the occurrence belongs to the requesting teacher; 403 otherwise; 400 without occurrenceId.</done>
</task>

<task type="auto">
  <name>Task 3: Check-in action route (TCH-02) — caller of mark-booking-attended + ownership gate + Nitro POST delegator</name>
  <read_first>
    - apps/staff-web/actions/approve-proposal.ts (lines 60-82 — mod.default.schema + mod.default.run invocation pattern)
    - apps/staff-web/actions/mark-booking-attended.ts (the chokepoint — do NOT re-implement the UPDATE)
    - apps/staff-web/server/routes/api/m/bookings.post.ts (POST delegator template)
    - apps/staff-web/server/db/schema.ts (bookings.occurrenceId, classOccurrences.trainerId)
  </read_first>
  <files>apps/staff-web/app/routes/api.m.teacher.check-in.tsx, apps/staff-web/server/routes/api/m/teacher/check-in.post.ts, apps/staff-web/AGENTS.md</files>
  <action>
    Create the action route (app/routes/api.m.teacher.check-in.tsx). It parses {bookingId}, verifies the booking's occurrence is owned by this teacher, THEN calls the existing chokepoint. NO new attendance UPDATE — the Meta Schedule CAPI fires inside mark-booking-attended:
    ```ts
    import { eq } from "drizzle-orm";
    import { getDb, schema } from "../../server/db";
    import { requireTeacher } from "../../server/lib/teacher-session";
    import type { ActionFunctionArgs } from "react-router";

    export async function action({ request }: ActionFunctionArgs) {
      const teacher = await requireTeacher(request); // 401/403
      let body: any;
      try { body = await request.json(); } catch { return new Response("Bad input", { status: 400 }); }
      const bookingId = body?.bookingId;
      if (!bookingId || typeof bookingId !== "string") {
        return new Response("bookingId required", { status: 400 });
      }
      const db = getDb();
      // Ownership: booking → occurrence → trainer_id must equal this teacher's trainerId
      // guard:allow-unscoped — single-tenant gym tables
      const [row] = await db
        .select({ occTrainerId: schema.classOccurrences.trainerId })
        .from(schema.bookings)
        .leftJoin(schema.classOccurrences, eq(schema.bookings.occurrenceId, schema.classOccurrences.id))
        .where(eq(schema.bookings.id, bookingId))
        .limit(1);
      if (!row) return new Response(JSON.stringify({ error: "BOOKING_NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
      if (!teacher.trainerId || row.occTrainerId !== teacher.trainerId) {
        throw new Response("Forbidden", { status: 403 });
      }
      // Call the SOLE attendance chokepoint (approve-proposal.ts pattern). Do NOT
      // replicate the UPDATE. Meta Schedule CAPI fires inside .run().
      const mod = await import("../../actions/mark-booking-attended.js");
      const parsed = mod.default.schema.safeParse({ bookingId });
      if (!parsed.success) return new Response("Bad input", { status: 400 });
      const result = await mod.default.run(parsed.data);
      return result; // {attended:true} | {error:"BOOKING_NOT_FOUND"|"BOOKING_CANCELLED"}
    }
    ```
    Create the Nitro POST delegator server/routes/api/m/teacher/check-in.post.ts (copy bookings.post.ts; import `../../../../../app/routes/api.m.teacher.check-in.js`; it imports `action`, not `loader`).
    Document all three teacher endpoints in apps/staff-web/AGENTS.md "Member API" table: GET /api/m/teacher/schedule, GET /api/m/teacher/roster, POST /api/m/teacher/check-in — and add a one-line note that check-in is a *caller* of mark-booking-attended (single write path; no new attendance write; ownership-gated by trainer_id). Note explicitly that NO new agent LLM tool is added (teachers have no AI — TCH-03), so the four-area "Actions" obligation is satisfied by documentation only.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "teacher.check-in" || echo "no teacher.check-in type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "mark-booking-attended.js" apps/staff-web/app/routes/api.m.teacher.check-in.tsx` present (caller, not re-impl)
    - `grep -n "mod.default.run(parsed.data)" apps/staff-web/app/routes/api.m.teacher.check-in.tsx` present
    - `grep -c "update(schema.bookings)\|set({ status" apps/staff-web/app/routes/api.m.teacher.check-in.tsx` returns 0 (no new attendance write path)
    - `grep -n "row.occTrainerId !== teacher.trainerId" apps/staff-web/app/routes/api.m.teacher.check-in.tsx` present (ownership gate)
    - `grep -n "api.m.teacher.check-in.js" apps/staff-web/server/routes/api/m/teacher/check-in.post.ts` present
    - `grep -n "/api/m/teacher/check-in" apps/staff-web/AGENTS.md` present
  </acceptance_criteria>
  <done>POST /api/m/teacher/check-in {bookingId} marks attendance ONLY via mark-booking-attended.run() (single write path; Meta Schedule CAPI preserved), gated so a teacher can only check in members for sessions they own (403 otherwise); all three teacher endpoints documented in AGENTS.md.</done>
</task>

</tasks>

<verification>
- tsc clean for the three resource routes + three Nitro delegators
- Static checks: check-in contains NO attendance UPDATE (calls the chokepoint); roster + check-in both enforce trainer_id ownership; schedule returns 200 empty-state for unlinked/no-session teachers
- Manual (operator, post-deploy, after Plan 01 migration + RUNSTUDIO_TEACHER_EMAILS set): curl each endpoint with a teacher Bearer → schedule returns only assigned occurrences; roster of a foreign occurrence → 403; check-in of an owned booking → {attended:true} and a Schedule CAPI row enqueues; check-in of a foreign booking → 403
</verification>

<success_criteria>
- TCH-01: teacher assigned-schedule + per-session roster endpoints exist, scoped to trainerId, with a clear empty state (not an error)
- TCH-02: check-in endpoint drives the existing mark-booking-attended chokepoint as a caller (no new write path; CAPI preserved), gated by occurrence ownership
- All three endpoints reachable via their Nitro delegators and documented in AGENTS.md
</success_criteria>

<output>
After completion, create `.planning/phases/MA3-teacher-session-surface/MA3-02-SUMMARY.md`.
</output>
