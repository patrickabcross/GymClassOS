---
phase: MA3-teacher-session-surface
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/plugins/db.ts
  - apps/staff-web/server/lib/teacher-session.ts
  - apps/staff-web/app/routes/api.m.me.tsx
  - apps/staff-web/server/routes/api/m/me.get.ts
autonomous: true
requirements: [TCH-01, TCH-03]
user_setup:
  - service: neon
    why: "Additive migration v37 is NOT auto-run; teacher→trainer link is data, not code"
    dashboard_config:
      - task: "Apply migration v37 (ALTER TABLE trainers ADD COLUMN IF NOT EXISTS user_id TEXT) to Neon billowing-sun-51091059 by hand"
        location: "Neon SQL editor / Neon MCP"
      - task: "Populate trainers.user_id by email for each HUSTLE teacher (manual UPDATE — see Task 1 data step)"
        location: "Neon SQL editor / Neon MCP"
      - task: "Set RUNSTUDIO_TEACHER_EMAILS (comma-separated) on Vercel staff-web — until set, all users resolve to role=member"
        location: "Vercel project env vars (Production)"

must_haves:
  truths:
    - "A logged-in teacher (email in RUNSTUDIO_TEACHER_EMAILS) can call GET /api/m/me and receives { role: 'teacher', userId, email, trainerId }"
    - "trainers.user_id exists as a nullable TEXT column keyed to user.id (never boolean-as-int)"
    - "requireTeacher resolves a teacher's trainerId from trainers.user_id and 403s non-teachers without claiming a gym_members row"
  artifacts:
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "trainers.userId column declaration (text)"
      contains: "userId: text(\"user_id\")"
    - path: "apps/staff-web/server/plugins/db.ts"
      provides: "additive migration v37 adding trainers.user_id"
      contains: "version: 37"
    - path: "apps/staff-web/server/lib/teacher-session.ts"
      provides: "requireTeacher + sessionFromRequest + resolveTrainerIdForUser"
      exports: ["requireTeacher", "sessionFromRequest", "resolveTrainerIdForUser"]
    - path: "apps/staff-web/app/routes/api.m.me.tsx"
      provides: "GET /api/m/me role surface (no member row required)"
      exports: ["loader"]
    - path: "apps/staff-web/server/routes/api/m/me.get.ts"
      provides: "Nitro delegator for GET /api/m/me"
  key_links:
    - from: "apps/staff-web/server/lib/teacher-session.ts"
      to: "apps/staff-web/server/lib/role-resolver.ts"
      via: "resolveRole(session.email) === 'teacher'"
      pattern: "resolveRole"
    - from: "apps/staff-web/server/lib/teacher-session.ts"
      to: "trainers.user_id"
      via: "eq(schema.trainers.userId, session.userId)"
      pattern: "trainers\\.userId"
    - from: "apps/staff-web/app/routes/api.m.me.tsx"
      to: "apps/staff-web/server/lib/teacher-session.ts"
      via: "sessionFromRequest + resolveTrainerIdForUser"
      pattern: "teacher-session"
---

<objective>
Lay the MA3 foundation: the one additive `trainers.user_id` link column, the `requireTeacher` gate (mirrors `member-session.ts` but claims NO `gym_members` row), and the `GET /api/m/me` endpoint that surfaces the already-built `resolveRole` so the mobile client can branch UI by role.

Purpose: Everything downstream in MA3 (teacher schedule/roster/check-in endpoints in Plan 02; mobile FAB-gate + teacher screens in Plan 03) depends on (a) a session-user → trainerId mapping and (b) a role surface. `resolveRole` exists and is unit-tested but is called nowhere — this plan wires it in.
Output: trainers.user_id column + migration v37, teacher-session.ts, /api/m/me route + Nitro delegator, and two documented manual operator steps (apply v37 to Neon; populate user_id by email; set RUNSTUDIO_TEACHER_EMAILS on Vercel).
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
<!-- Contracts the executor needs — extracted from the codebase. Use directly; no exploration needed. -->

resolveRole — EXISTS, UNCHANGED (apps/staff-web/server/lib/role-resolver.ts):
```ts
export type AppRole = "admin" | "teacher" | "member";
export function resolveRole(email: string): AppRole; // admin > teacher > member; env allowlists
```
It already returns "teacher" for RUNSTUDIO_TEACHER_EMAILS and is fully unit-tested (role-resolver.test.ts). Do NOT modify it.

Better-auth session shape (verified in the MA1 spike) — the H3 adapter MUST expose BOTH `req` (the web Request) and `headers`:
```ts
// from member-session.ts — COPY this exact adapter shape
async function sessionFromRequest(request: Request) {
  const event = {
    req: request,
    headers: request.headers,
    url: new URL(request.url),
    path: new URL(request.url).pathname,
  } as any;
  return getSession(event); // returns { userId, email, ... } | null
}
```

trainers table (schema.ts ~line 281) — declared with @agent-native/core `table()`:
```ts
export const trainers = table("trainers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  homeLocation: text("home_location"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now()),
});
```

db.ts runMigrations entries are objects `{ version: N, sql: "..." }`. Latest existing is version 36. ADD-COLUMN precedent (v24/v25): `sql: \`ALTER TABLE class_occurrences ADD COLUMN IF NOT EXISTS trainer_id TEXT\``.

Nitro GET delegator template (server/routes/api/m/schedule.get.ts) — copy verbatim, swap the import path.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Additive trainers.user_id column + migration v37 (+ document manual data step)</name>
  <read_first>
    - apps/staff-web/server/db/schema.ts (trainers export ~line 281; do not touch other tables)
    - apps/staff-web/server/plugins/db.ts (lines ~254-521: migration array shape, v36 is the latest)
    - .planning/STATE.md (active-column boolean gotcha + migration-drift gotcha)
  </read_first>
  <files>apps/staff-web/server/db/schema.ts, apps/staff-web/server/plugins/db.ts</files>
  <action>
    In schema.ts, add ONE field to the `trainers` table export — a plain nullable TEXT column keyed to user.id. NEVER `integer({mode:"boolean"})` and NEVER bigint (active-column gotcha). Place it after `homeLocation`:
    ```ts
    homeLocation: text("home_location"),
    // MA3: link a trainer to a Better-auth user.id so a logged-in teacher maps
    // to their assigned class_occurrences (via class_occurrences.trainer_id).
    // Nullable soft-ref; populated by a manual by-email data step for v1. Added
    // by migration v37. NEVER boolean-as-int (active-column gotcha).
    userId: text("user_id"),
    ```
    In db.ts, append a new migration entry to the SAME runMigrations array (after the v36 entry), strictly additive, IF NOT EXISTS guarded:
    ```ts
    {
      version: 37,
      // MA3 (TCH-01): additive link column — teacher (user.id) → trainer → assigned
      // occurrences. NOT auto-run on prod Neon — apply by hand to billowing-sun-51091059
      // (migration-drift gotcha). TEXT, nullable; no DROP/RENAME/TRUNCATE.
      sql: `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS user_id TEXT`,
    },
    ```
    Then add a `## Manual data step` note block to the eventual SUMMARY (and reference it here) with the exact SQL the operator runs on Neon AFTER v37 is applied, once per HUSTLE teacher:
    ```sql
    -- Run on Neon billowing-sun-51091059 (HUSTLE has ~23 trainers; do only the teaching staff who sign in).
    UPDATE trainers t
    SET user_id = u.id
    FROM "user" u
    WHERE lower(u.email) = lower('<teacher-email>')
      AND lower(t.name)  = lower('<Trainer Name>');
    ```
    Do NOT build an update-trainer UI for this (deferred per MA3-CONTEXT). Do NOT add a unique index on trainers.user_id.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "schema.ts|db.ts" || echo "no schema/db type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n 'userId: text("user_id")' apps/staff-web/server/db/schema.ts` returns the trainers column
    - `grep -n "version: 37" apps/staff-web/server/plugins/db.ts` returns the new migration
    - `grep -n "ADD COLUMN IF NOT EXISTS user_id TEXT" apps/staff-web/server/plugins/db.ts` returns the additive DDL
    - No occurrence of `user_id` declared as boolean/integer/bigint anywhere in the change
  </acceptance_criteria>
  <done>trainers.user_id is a nullable TEXT column in schema.ts; migration v37 is the additive ADD COLUMN entry; the manual by-email population SQL + the "apply v37 to Neon by hand" + "set RUNSTUDIO_TEACHER_EMAILS on Vercel" steps are documented for the operator.</done>
</task>

<task type="auto">
  <name>Task 2: requireTeacher gate (no member-row claim) in teacher-session.ts</name>
  <read_first>
    - apps/staff-web/server/lib/member-session.ts (sessionFromRequest adapter + requireMember shape to mirror — do NOT reuse requireMember, it claims a gym_members row)
    - apps/staff-web/server/lib/role-resolver.ts (resolveRole — use, do not modify)
    - apps/staff-web/server/db/schema.ts (trainers.userId added in Task 1)
  </read_first>
  <files>apps/staff-web/server/lib/teacher-session.ts</files>
  <action>
    Create a NEW file (sibling of member-session.ts) that resolves a teacher identity WITHOUT touching gym_members (teachers have no member row — requireMember would 403 them). Export three things:
    ```ts
    import { eq } from "drizzle-orm";
    import { getDb, schema } from "../db";
    import { getSession } from "@agent-native/core/server";
    import { resolveRole } from "./role-resolver";

    // COPY the exact adapter shape from member-session.ts (h3 v2 needs BOTH req + headers)
    export async function sessionFromRequest(request: Request) {
      const event = {
        req: request,
        headers: request.headers,
        url: new URL(request.url),
        path: new URL(request.url).pathname,
      } as any;
      return getSession(event);
    }

    // Map a Better-auth user.id → their trainers.id (LIMIT 1). null if unlinked.
    export async function resolveTrainerIdForUser(userId: string): Promise<string | null> {
      // guard:allow-unscoped — single-tenant gym tables
      const r = await getDb()
        .select({ id: schema.trainers.id })
        .from(schema.trainers)
        .where(eq(schema.trainers.userId, userId))
        .limit(1);
      return r[0]?.id ?? null;
    }

    export type TeacherIdentity = { userId: string; email: string; trainerId: string | null };

    // 401 if no session; 403 if role !== "teacher" (admin>teacher>member precedence
    // is encoded in resolveRole — a pure admin correctly 403s here and uses MA4).
    export async function requireTeacher(request: Request): Promise<TeacherIdentity> {
      const session = await sessionFromRequest(request);
      if (!session?.userId || !session?.email) {
        throw new Response("Unauthenticated", { status: 401 });
      }
      if (resolveRole(session.email) !== "teacher") {
        throw new Response("Forbidden", { status: 403 });
      }
      const trainerId = await resolveTrainerIdForUser(session.userId);
      return { userId: session.userId, email: session.email, trainerId };
    }
    ```
    Do NOT import or call requireMember/claimMemberByEmail here. Note in a header comment that a null trainerId is a valid state (teacher not yet linked) — callers render an empty/"contact admin" state, never a 500.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run --config vitest.unit.config.ts server/lib/role-resolver.test.ts 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export async function requireTeacher" apps/staff-web/server/lib/teacher-session.ts` present
    - `grep -n "export async function sessionFromRequest" apps/staff-web/server/lib/teacher-session.ts` present
    - `grep -n "export async function resolveTrainerIdForUser" apps/staff-web/server/lib/teacher-session.ts` present
    - `grep -n "resolveRole(session.email) !== \"teacher\"" apps/staff-web/server/lib/teacher-session.ts` present (403 gate)
    - `grep -c "gymMembers\|claimMemberByEmail\|requireMember" apps/staff-web/server/lib/teacher-session.ts` returns 0 (no member-row claim)
    - role-resolver.test.ts still passes (teacher resolution + admin precedence)
  </acceptance_criteria>
  <done>teacher-session.ts exports requireTeacher (401/403, returns {userId,email,trainerId}), sessionFromRequest, and resolveTrainerIdForUser; it never touches gym_members; role-resolver unit tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: GET /api/m/me role endpoint + Nitro delegator</name>
  <read_first>
    - apps/staff-web/app/routes/api.m.profile.tsx (member-route loader shape — but note it requires a member row; /api/m/me must NOT)
    - apps/staff-web/server/routes/api/m/schedule.get.ts (Nitro GET delegator template — copy verbatim)
    - apps/staff-web/server/lib/teacher-session.ts (Task 2 — sessionFromRequest, resolveTrainerIdForUser)
    - apps/staff-web/server/lib/role-resolver.ts (resolveRole)
  </read_first>
  <files>apps/staff-web/app/routes/api.m.me.tsx, apps/staff-web/server/routes/api/m/me.get.ts</files>
  <action>
    Create the resource route loader (app/routes/api.m.me.tsx). It resolves the session, computes role, and ONLY for teachers resolves trainerId. It must NOT call requireMember (members and admins must still get a 200 with their role, not a 403):
    ```ts
    import type { LoaderFunctionArgs } from "react-router";
    import { resolveRole } from "../../server/lib/role-resolver";
    import { sessionFromRequest, resolveTrainerIdForUser } from "../../server/lib/teacher-session";

    export async function loader({ request }: LoaderFunctionArgs) {
      const session = await sessionFromRequest(request);
      if (!session?.userId || !session?.email) {
        throw new Response("Unauthenticated", { status: 401 });
      }
      const role = resolveRole(session.email);
      const trainerId = role === "teacher" ? await resolveTrainerIdForUser(session.userId) : null;
      return { role, userId: session.userId, email: session.email, trainerId };
    }
    ```
    Create the Nitro delegator (server/routes/api/m/me.get.ts) by copying schedule.get.ts verbatim and changing only the import to `../../../../app/routes/api.m.me.js`. (The `[...all].get.ts` catch-all also covers /api/m/* as a backstop, but ship the explicit physical-function delegator to match the proven convention.)
    Document the new endpoint in apps/staff-web/AGENTS.md under "Member API" as: `GET /api/m/me → { role, userId, email, trainerId } — role surface (no member row required); teacher trainerId resolved from trainers.user_id`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "api.m.me|me.get" || echo "no me-route type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export async function loader" apps/staff-web/app/routes/api.m.me.tsx` present
    - `grep -n "role === \"teacher\" ? await resolveTrainerIdForUser" apps/staff-web/app/routes/api.m.me.tsx` present
    - `grep -c "requireMember" apps/staff-web/app/routes/api.m.me.tsx` returns 0
    - `grep -n "api.m.me.js" apps/staff-web/server/routes/api/m/me.get.ts` present
    - `grep -n "/api/m/me" apps/staff-web/AGENTS.md` present (documented)
  </acceptance_criteria>
  <done>GET /api/m/me returns {role,userId,email,trainerId} for any authenticated user (200 for member/admin/teacher; 401 unauthenticated), with trainerId populated only for teachers; the Nitro delegator and AGENTS.md entry exist.</done>
</task>

</tasks>

<verification>
- tsc clean for the changed files (schema.ts, db.ts, teacher-session.ts, api.m.me.tsx, me.get.ts)
- role-resolver unit tests pass (teacher resolution + admin>teacher precedence)
- Static checks: trainers.user_id is TEXT (not boolean/int); migration v37 is ADD COLUMN IF NOT EXISTS; requireTeacher never touches gym_members
- Runtime (operator, post-deploy): apply v37 to Neon billowing-sun-51091059; populate trainers.user_id by email; set RUNSTUDIO_TEACHER_EMAILS on Vercel — only then does a teacher email resolve to role=teacher and /api/m/me return trainerId
</verification>

<success_criteria>
- trainers.user_id (nullable TEXT) declared in schema.ts and added by additive migration v37
- requireTeacher (no member-row claim) + sessionFromRequest + resolveTrainerIdForUser exported from teacher-session.ts
- GET /api/m/me returns the caller's role (and teacher trainerId) without requiring a gym_members row
- Manual operator steps (apply v37, populate user_id, set RUNSTUDIO_TEACHER_EMAILS) documented in the SUMMARY
</success_criteria>

<output>
After completion, create `.planning/phases/MA3-teacher-session-surface/MA3-01-SUMMARY.md` including the verbatim manual data step SQL and the three operator steps.
</output>
