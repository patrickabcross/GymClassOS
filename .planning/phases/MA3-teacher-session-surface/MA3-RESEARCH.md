# Phase MA3: Teacher Session Surface — Research

**Researched:** 2026-06-30
**Domain:** Expo mobile teacher surface + server-side role gating + attendance chokepoint (RunStudio / GymClassOS)
**Confidence:** HIGH (all findings grounded in the actual repo; the only true unknown — teacher→trainer mapping — is resolved below with a recommended additive migration)

## Summary

MA3 adds a teacher surface to the existing single-binary Expo app (`packages/mobile-app`). A logged-in teacher (role resolved from `RUNSTUDIO_TEACHER_EMAILS`) must land in a schedule filtered to **their** assigned sessions, open a roster, and check members in by driving the **existing** `mark-booking-attended` action as a caller (no new attendance write path). They must see **no** AI surface and be 403'd from any admin endpoint.

The phase has one real architectural gap: **there is no link today between a Better-auth `user` (the teacher) and the `class_occurrences` they teach.** `class_occurrences` carries two instructor columns — `trainer_id` (LP3, populated by the schedule engine and `create-class-occurrence`, soft-ref to the `trainers` roster) and `instructor_user_id` (in the initial schema, keyed to `user.id`, but **NULL everywhere** — the seed sets it null and no write path populates it). The `trainers` table has only `id, name, home_location, active` — **no email, no user_id**. So neither column currently maps a logged-in teacher to sessions. The recommended close is an **additive `trainers.user_id` column** plus a small resolver, reusing the already-populated `trainer_id` linkage rather than backfilling the unused `instructor_user_id` everywhere.

The second theme is that **role is built but not yet surfaced.** `resolveRole(email)` exists (`server/lib/role-resolver.ts`) and is unit-tested, but **nothing calls it in any handler or route** — there is no endpoint that tells the client its role, and every `/api/m/*` route uses `requireMemberOrDemo`, which resolves a `gym_members` row and will **403 a teacher who has no member row.** MA3 must add (a) a role/identity endpoint the client reads to branch UI, and (b) a `requireTeacher(request)` gate that does NOT require a `gym_members` row.

**Primary recommendation:** Add an additive `trainers.user_id` column + `requireTeacher()` gate + a `/api/m/me` role endpoint; build teacher schedule/roster/check-in as new `/api/m/teacher/*` resource routes that bearer-gate a teacher, verify session ownership via the `trainers.user_id → class_occurrences.trainer_id` join, and call `mark-booking-attended`'s exported `.run({bookingId})` as the sole attendance writer. Gate the existing agent FAB so it is absent for `role !== "member"` (teachers and—until MA4—admins see no AI), keeping TCH-03 satisfied without waiting on MA4.

<user_constraints>
## User Constraints (from REQUIREMENTS.md locked decisions — this milestone has no per-phase CONTEXT.md)

### Locked Decisions (governing MA3)
- **3-way role routing = two env allowlists + member fallback** — admin `RUNSTUDIO_OPERATOR_EMAILS` (exists) > teacher `RUNSTUDIO_TEACHER_EMAILS` (new) > member; strict precedence. **No role toggle in the UI** — role is auto-detected post-login; the app feels like a pure member app. **Do NOT use Better-auth org roles; do NOT couple teachers to `trainers.email`.**
- **Teacher has no AI** — the AI ops agent is admin-only by design (Out of Scope: "Teacher access to the AI agent"). Teachers run sessions only.
- **`mark-booking-attended` is the single attendance chokepoint** — MA3 calls it as a *caller*; NO new write path. The v2.2 Meta `Schedule` CAPI event must still fire once per (member, occurrence).
- **`/api/m/*` derives identity from the verified Better-auth session, never a header/body** (AUTH-06). The demo `X-Demo-Member-Id` path is a non-production fallback only.
- **Strictly additive DB changes** — `runMigrations` next version after v36; no DROP/RENAME/TRUNCATE, no `drizzle-kit push`. The migration-drift gotcha applies: additive `runMigrations` versions are **NOT auto-run** — apply to studio Neon `billowing-sun-51091059` by hand.
- **No auth migration / no identity-table reshape** — reuse existing `user`/`session`/`account`; never add a unique index on `gym_members.email`.
- **Native iOS/Android only** — no react-native-web target.
- **Single-tenant per deploy preserved; customer #1 = HUSTLE.** No `studio_id`. Gym tables carry `// guard:allow-unscoped — single-tenant gym tables`.
- **Repeatable per client** — no hardcoded HUSTLE/Patrick names; resolve config by key/env.

### Claude's Discretion
- Exact shape of the teacher schedule/roster UI (reuse the member `schedule.tsx` patterns).
- Whether the role endpoint is a new `/api/m/me` or an extension of `/api/m/profile` (recommendation: new `/api/m/me`, because `/api/m/profile` requires a member row and teachers may not have one).
- How `trainers.user_id` is populated for HUSTLE (manual SQL by-email, or an extension to `update-trainer`).

### Deferred Ideas (OUT OF SCOPE for MA3)
- The admin AI agent itself (MA4) — MA3 only needs to ensure teachers are *excluded*.
- Push notifications (MA5).
- Member booking/Stripe flow (MA2).
- Teacher self-service editing of the schedule, class cancellation, capacity changes (admin/agent surfaces).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TCH-01 | A teacher sees the class schedule with their assigned sessions and the roster for a session. | Needs the teacher→trainer link (additive `trainers.user_id`) + a new `/api/m/teacher/schedule` (occurrences WHERE trainer_id = my trainer) and `/api/m/teacher/roster?occurrenceId=` (bookings JOIN gym_members). Reuse `api.m.schedule.tsx` query shape. |
| TCH-02 | A teacher can check a member in / mark attendance, driving the existing `mark-booking-attended` chokepoint (no UI exists today — built here). | `mark-booking-attended` action confirmed as sole writer; invoked programmatically via `mod.default.run({bookingId})` (same pattern `approve-proposal.ts` uses). New `/api/m/teacher/check-in` action route gates a teacher + verifies occurrence ownership, then calls `.run()`. Meta Schedule CAPI fires inside the action unchanged. |
| TCH-03 | A teacher has NO access to the admin AI agent or any admin-only surface. | Client: gate the `AgentFabAndSheet` in `app/_layout.tsx` so it renders only for `role === "member"`. Server: `requireTeacher`/`requireAdmin` gates; the MA4 admin SSE must `requireAdmin` (dependency noted). The current member coach SSE (`api.m.agent.stream.tsx`) uses `requireMemberOrDemo` — a teacher with no member row is already 403'd there, but the FAB must also be hidden. |
</phase_requirements>

## Standard Stack

No new libraries. MA3 is built entirely on what is already installed and proven in MA1/MA2.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Expo Router | SDK 55 | File-based mobile routing/tabs | The app shell (`app/(tabs)/_layout.tsx`, `app/_layout.tsx`) is already Expo Router |
| TanStack Query | ^5 | Client data fetch/cache + optimistic UI | Every mobile screen routes through `apiFetch` + `useQuery`/`useMutation` |
| `expo-secure-store` | SDK 55 | Bearer token storage | MA1-02 `lib/session.ts` — `SESSION_TOKEN_KEY` is the single source of truth |
| Drizzle ORM | ^0.45.x | Server queries | `apps/staff-web/server/db/schema.ts` |
| Better-auth (`getSession`) | ^1.6.x | Session resolution from Bearer | `member-session.ts` already adapts a Web Request → H3 event for `getSession` |
| `@expo/vector-icons` (Feather) | bundled | Icons | The mobile app uses Feather throughout (note: root AGENTS.md mandates Tabler for **staff-web**; the mobile app's established convention is Feather — keep mobile consistent with itself) |

### Installation
None required. `npx expo install` only if any new `expo-*` package is added (none anticipated). **Never bare `npm install`** for `expo-*` (SDK-55 pin discipline).

## Architecture Patterns

### Recommended file layout (additive)
```
apps/staff-web/
├── server/lib/
│   ├── role-resolver.ts          # EXISTS — resolveRole(email): "admin"|"teacher"|"member"
│   ├── teacher-session.ts        # NEW — requireTeacher(request) → {userId,email,trainerId}
│   └── member-session.ts         # EXISTS — requireMember / requireMemberOrDemo (member-row gate)
├── app/routes/
│   ├── api.m.me.tsx              # NEW — GET → { role, userId, email, trainerId? }
│   ├── api.m.teacher.schedule.tsx# NEW — GET → teacher's assigned occurrences
│   ├── api.m.teacher.roster.tsx  # NEW — GET ?occurrenceId= → roster (bookings JOIN gym_members)
│   └── api.m.teacher.check-in.tsx# NEW — POST {bookingId} → calls mark-booking-attended.run()
├── server/routes/api/m/
│   ├── me.get.ts                 # NEW — Nitro delegator (mirrors schedule.get.ts)
│   └── teacher/
│       ├── schedule.get.ts       # NEW Nitro delegator
│       ├── roster.get.ts         # NEW Nitro delegator
│       └── check-in.post.ts      # NEW Nitro delegator
└── actions/mark-booking-attended.ts  # EXISTS — UNCHANGED; called as a library

packages/mobile-app/
├── app/_layout.tsx               # EDIT — gate AgentFabAndSheet by role; read /api/m/me once
├── app/(tabs)/_layout.tsx        # EDIT — branch tab set by role (teacher tabs vs member tabs)
└── app/teacher/                  # NEW — teacher schedule list + roster/check-in screen(s)
```

### Pattern 1: Nitro route → React Router resource loader/action (MANDATORY — established convention)
Every `/api/m/*` endpoint is a thin Nitro `defineEventHandler` in `server/routes/api/m/**` that delegates to a React Router `loader`/`action` in `app/routes/api.m.*.tsx`. The Nitro layer maps a thrown/returned `Response` to status + JSON. Copy `server/routes/api/m/schedule.get.ts` verbatim as the template for GETs and `server/routes/api/m/agent/stream.post.ts` for POSTs.
```ts
// server/routes/api/m/teacher/schedule.get.ts  (Source: existing schedule.get.ts)
import { defineEventHandler, setResponseStatus } from "h3";
import { loader } from "../../../../../app/routes/api.m.teacher.schedule.js";
export default defineEventHandler(async (event) => {
  const request = event.req as unknown as Request;
  try {
    const result = await loader({ request, params: {}, context: {} } as any);
    if (result instanceof Response) { /* map status + JSON.parse(text) */ }
    return result;
  } catch (err) { /* if (err instanceof Response) → setResponseStatus + parse */ throw err; }
});
```

### Pattern 2: `requireTeacher(request)` — role gate that does NOT need a member row
Teachers may have no `gym_members` row. `requireMember` 403s them. Build a sibling that resolves the session, runs `resolveRole`, and resolves the trainer link — NO member claim.
```ts
// server/lib/teacher-session.ts  (Source: member-session.ts sessionFromRequest + role-resolver.ts)
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getSession } from "@agent-native/core/server";
import { resolveRole } from "./role-resolver";

async function sessionFromRequest(request: Request) {
  const event = { req: request, headers: request.headers,
    url: new URL(request.url), path: new URL(request.url).pathname } as any;
  return getSession(event); // resolves Authorization: Bearer (verified in MA1 spike)
}

export async function requireTeacher(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session?.userId || !session?.email) throw new Response("Unauthenticated", { status: 401 });
  if (resolveRole(session.email) !== "teacher")
    throw new Response("Forbidden", { status: 403 }); // admin > teacher precedence handled by resolveRole
  // Resolve the teacher's trainer row (see Migration section)
  // guard:allow-unscoped — single-tenant gym tables
  const trainer = await getDb().select({ id: schema.trainers.id })
    .from(schema.trainers).where(eq(schema.trainers.userId, session.userId)).limit(1)
    .then((r) => r[0] ?? null);
  return { userId: session.userId, email: session.email, trainerId: trainer?.id ?? null };
}
```
**Note on admin precedence:** `resolveRole` returns "admin" for an operator email even if also in the teacher list, so `requireTeacher` would 403 a pure admin. That is correct — admins use the MA4 admin surface, not the teacher surface. If a single human must be both, add them to `RUNSTUDIO_TEACHER_EMAILS` only (not operator) for the teacher device, or accept that admin-precedence routes them to the admin surface.

### Pattern 3: Calling the attendance chokepoint as a library (TCH-02)
`mark-booking-attended` is a `defineAction` with **no `http` key** (agent/staff-only). The established way to invoke an action programmatically is exactly what `approve-proposal.ts` does:
```ts
// app/routes/api.m.teacher.check-in.tsx (action)  (Source: actions/approve-proposal.ts line 60-82)
const mod = await import("../../actions/mark-booking-attended.js");
const parsed = mod.default.schema.safeParse({ bookingId });
if (!parsed.success) return new Response("Bad input", { status: 400 });
const result = await mod.default.run(parsed.data); // fires Meta Schedule CAPI internally
// result = {attended:true} | {error:"BOOKING_NOT_FOUND"|"BOOKING_CANCELLED"}
```
This guarantees: single write path preserved, idempotent re-mark is a no-op, and the v2.2 Meta `Schedule` event still enqueues (best-effort) — all unchanged. **Do NOT replicate the UPDATE in the route.**

### Pattern 4: Ownership check before check-in (security)
Before calling `.run()`, verify the booking's occurrence belongs to this teacher: load the booking → its `occurrenceId` → `class_occurrences.trainer_id` and assert it equals `requireTeacher().trainerId`. Reject with 403 otherwise. This stops a teacher checking members into another teacher's class.

### Pattern 5: Roster query (TCH-01)
```ts
// occurrences for this teacher (next 7 days), reuse api.m.schedule.tsx Query A shape
.where(and(
  eq(schema.classOccurrences.trainerId, trainerId),
  gte(schema.classOccurrences.startsAt, nowIso),
  lte(schema.classOccurrences.startsAt, sevenDaysIso),
  eq(schema.classOccurrences.status, "scheduled"),
))
// roster for one occurrence: bookings (booked|attended) JOIN gym_members
.where(and(
  eq(schema.bookings.occurrenceId, occurrenceId),
  inArray(schema.bookings.status, ["booked", "attended"]),
))
```
Return `bookingId, memberId, firstName, lastName, status` so the UI can show a check tick for `status === "attended"`.

### Anti-Patterns to Avoid
- **Don't use `requireMemberOrDemo` for teacher routes** — it claims/needs a `gym_members` row and 403s teachers who aren't members. Use `requireTeacher`.
- **Don't add a second attendance UPDATE** — call `mark-booking-attended.run()`.
- **Don't infer teacher-ness from the `trainers` roster or `trainers.email`** — role is env-allowlist only (locked). The `trainers.user_id` link is for *session→assigned-sessions mapping ONLY*, not for deciding who is a teacher.
- **Don't show the agent FAB to teachers** — it currently renders for everyone behind `AuthGate` in `app/_layout.tsx`.
- **Don't backfill `instructor_user_id`** — it's unused and would require dual-writing in `create-class-occurrence` + the materialiser + a data migration. The `trainers.user_id` route reuses already-populated `trainer_id`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Attendance write + Meta event | A new UPDATE in the teacher route | `mark-booking-attended.run()` | Single chokepoint, idempotency, CAPI enqueue, attribution-row upsert all live inside it (D-17 best-effort) |
| Session → identity | Manual JWT/cookie parsing | `getSession(event)` via the `member-session.ts` H3 adapter | MA1 spike proved the exact adapter shape (`{req, headers, url, path}`) needed for h3 v2 |
| Role decision | Ad-hoc email checks in routes | `resolveRole(email)` | Already implemented + unit-tested; encodes admin>teacher>member precedence |
| Action invocation | Re-importing DB + duplicating logic | `mod.default.schema` + `mod.default.run()` | The framework's programmatic-action pattern (see `approve-proposal.ts`) |

**Key insight:** MA3 is almost entirely *wiring existing pieces together behind a new role gate* — the only genuinely new persistent state is the one `trainers.user_id` link column.

## Runtime State Inventory

This is a feature-add phase, not a rename/refactor, but it has live-state implications worth stating explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `class_occurrences.trainer_id` is populated by the schedule engine (`class_schedule_rules`) and `create-class-occurrence`; `instructor_user_id` is **NULL everywhere** (seed sets null; no writer). `trainers` table has NO user/email link. | Additive `trainers.user_id` column (migration) + populate it per teacher for HUSTLE (data step). |
| Live service config | `RUNSTUDIO_TEACHER_EMAILS` env var is **new** — does not exist on Vercel/Fly yet. Role resolution returns "member" for everyone until it is set. | Operator must set `RUNSTUDIO_TEACHER_EMAILS` on Vercel (staff-web) for the teacher(s). Document as a manual deploy step. |
| OS-registered state | None. | None — verified (mobile app reads role from API, no native registration). |
| Secrets/env vars | No new secrets. `RUNSTUDIO_TEACHER_EMAILS` is a plain env var (not a secret), same handling as `RUNSTUDIO_OPERATOR_EMAILS`. | Set env var; no app_secrets change. |
| Build artifacts | `.generated/actions-registry.*` is gitignored and auto-discovered — no new *action* files are added by MA3 (the check-in route is a resource route, not an action), so no registry regeneration needed. `mark-booking-attended` already registered. | None. |

## Common Pitfalls

### Pitfall 1: Teacher has no `gym_members` row → 403 from member endpoints
**What goes wrong:** Reusing `requireMember`/`requireMemberOrDemo` for teacher routes throws 403 (NO_EMAIL_MATCH / PHONE_REQUIRED) because teachers aren't members.
**How to avoid:** Use `requireTeacher` (Pattern 2) — resolve role from the session email, never claim a member row.
**Warning sign:** Teacher login lands on the right tabs but every teacher API call returns 403.

### Pitfall 2: `active`-column boolean gotcha (STATE.md / project memory)
**What goes wrong:** `trainers.active` and `class_schedule_rules.active` were historically `bigint`, which made `eq(active, true)` 500 the whole schedule loader (the v36 fix converted them to BOOLEAN). Any NEW additive column on `trainers` declared as `integer({mode:"boolean"})` emits a Postgres BOOLEAN — but a hand-written migration that types it `integer`/`bigint` will recreate the bug.
**How to avoid:** Declare `trainers.user_id` as plain `text("user_id")` (nullable, no boolean). For any future boolean column, the migration DDL must be `BOOLEAN`. Mirror migration v36's guarded `DO` block style.
**Warning sign:** Schedule/roster loader 500s with a type-mismatch on a comparison.

### Pitfall 3: Empty state ≠ error (success criterion 1)
**What goes wrong:** A teacher with `trainerId === null` (not yet linked) or with zero upcoming assigned sessions sees a crash or an error toast.
**How to avoid:** When `trainerId` is null OR the occurrences array is empty, return `{ items: [] }` (HTTP 200) and render a clear empty state ("No sessions assigned to you this week"). The member `schedule.tsx` already has a `ListEmptyComponent` pattern to copy. Distinguish "not linked yet" (contact admin) from "no sessions this week" if useful.
**Warning sign:** New teacher sees "Couldn't load schedule" instead of an empty state.

### Pitfall 4: Migration not auto-run (migration-drift gotcha)
**What goes wrong:** Adding the `trainers.user_id` `runMigrations` version does NOT auto-apply — staff-web routes 500 until the DDL is applied to Neon by hand.
**How to avoid:** Ship the additive migration in `server/plugins/db.ts` (next version after v36) AND apply it to `billowing-sun-51091059` by hand (Neon MCP/SQL), AND set `trainers.user_id` for the teacher(s). Document both as manual steps in the plan.
**Warning sign:** Teacher schedule 500s post-deploy with "column user_id does not exist".

### Pitfall 5: TCH-03 timing — admin SSE doesn't exist yet
**What goes wrong:** Success criterion 3 says "the admin SSE endpoint rejects a teacher session," but the admin SSE endpoint is built in **MA4**, not MA3. The only SSE today is the *member* coach (`api.m.agent.stream.tsx`, gated by `requireMemberOrDemo` — already rejects teachers since they have no member row).
**How to avoid:** In MA3, satisfy TCH-03 by (a) hiding the agent FAB client-side for `role !== "member"`, and (b) ensuring the member coach SSE stays member-gated. Add a `<!-- MA4 dependency -->` note that the admin SSE built in MA4 MUST `requireAdmin` (reject member/teacher 403) — that is MA4's AI-03. MA3's verification asserts the FAB is absent for teachers and the member SSE 403s a teacher token.
**Warning sign:** Reviewer expects an admin endpoint to test in MA3 that doesn't exist yet.

### Pitfall 6: Four-area agent-native contract
**What goes wrong:** Adding a feature without updating all four areas (UI / Actions / Skills / Application State) breaks the contract per AGENTS.md.
**How to avoid:** MA3 is mostly member-API surface (not agent tools), so the "Actions" obligation is light — but document the new `/api/m/teacher/*` endpoints in `apps/staff-web/AGENTS.md` (Member API section), and the teacher surface in the roadmap/STATE. No new agent LLM tool is added (teachers have no AI — TCH-03), which is the deliberate exception. Note this explicitly so a reviewer doesn't flag a "missing agent tool."

## Code Examples

### Client reads its role once and branches (TCH-03 + TCH-01)
```tsx
// packages/mobile-app — read role after auth, before rendering tabs/FAB
// (Source: existing apiFetch in lib/api.ts + AuthGate in app/_layout.tsx)
const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => apiFetch("/api/m/me") });
const role: "admin" | "teacher" | "member" = me?.role ?? "member";
// In AgentFabAndSheet: if (role !== "member") return null;   // no AI for teachers (and admins until MA4)
// In (tabs)/_layout: render teacher tab set when role === "teacher"
```

### `/api/m/me` role endpoint (no member row required)
```ts
// app/routes/api.m.me.tsx  (Source: role-resolver.ts + member-session sessionFromRequest)
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await sessionFromRequest(request); // shared helper
  if (!session?.userId) throw new Response("Unauthenticated", { status: 401 });
  const role = resolveRole(session.email);
  return { role, userId: session.userId, email: session.email };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `demoMemberId` in AsyncStorage + `X-Demo-Member-Id` header | Better-auth Bearer in `expo-secure-store`; `/api/m/*` gates from verified session | MA1 (2026-06-29) | Teacher identity comes from the verified session; `requireTeacher` builds on the same `getSession` adapter |
| Schedule loader joined `trainers` for filters (d06) | Same join is reusable for teacher-scoped occurrence queries | 2026-06-25 | The `trainer_id` linkage already exists in queries; MA3 adds the `user_id` half |

**Deprecated/outdated:**
- `instructor_user_id` on `class_occurrences`: present in the initial schema but **never populated** — do not rely on or revive it; use `trainers.user_id → trainer_id`.

## Open Questions

1. **How to populate `trainers.user_id` for HUSTLE teachers**
   - What we know: additive column is the right shape; teachers sign in with a known email; `trainers` rows exist with names.
   - What's unclear: whether to (a) extend `update-trainer` to accept `userId`, (b) add a tiny by-email linker action, or (c) just run `UPDATE trainers SET user_id=(SELECT id FROM "user" WHERE lower(email)=...) WHERE lower(name)=...` by hand.
   - Recommendation: ship the column + resolver in MA3; for HUSTLE's handful of teachers, a documented manual SQL data step is sufficient v1 (matches the "apply migration by hand" discipline). Optionally extend `update-trainer` with an optional `userId` field for repeatability (no agent exposure needed).

2. **Does a teacher own exactly one `trainers` row?**
   - What we know: `trainers` dedupes on `lower(name)`; one human = one trainer row.
   - What's unclear: edge case of a teacher mapped to multiple trainer rows.
   - Recommendation: model `trainers.user_id` as a per-trainer nullable link; resolve the teacher's trainer with `LIMIT 1`. If multi-trainer-per-user ever appears, switch the occurrence filter to `inArray(trainer_id, [...myTrainerIds])` — cheap to extend.

3. **Should the member coach FAB also be hidden for teachers, or repurposed?**
   - What we know: the FAB today opens the member coach (book/log food) — irrelevant and partly broken for a teacher (no member row).
   - Recommendation: hide it for `role !== "member"` (TCH-03 — "no teacher AI"). Do not build a teacher agent.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon Postgres `billowing-sun-51091059` | `trainers.user_id` migration + queries | ✓ | PG16 | — |
| `RUNSTUDIO_TEACHER_EMAILS` env (Vercel) | role=teacher resolution | ✗ (new) | — | Until set, all users resolve to "member" — teacher surface unreachable. Set as a manual deploy step. |
| Expo SDK 55 toolchain | mobile build | ✓ | SDK 55 | iOS device verification gated on Apple Dev account (same blocker as MA1/MA5) — code + simulator/Android can verify logic |
| `mark-booking-attended` action | TCH-02 | ✓ (shipped MC2) | — | — |

**Missing dependencies with no fallback:** none that block *building*; `RUNSTUDIO_TEACHER_EMAILS` must be set for *runtime* teacher access (operator step, documented).

**Note on device verification:** Like MA1, on-device iOS verification is gated on the customer's Apple Developer account / EAS build. MA3 logic (role gating, queries, check-in) is fully verifiable via the server routes + Android/simulator; record any device-gated checks the way MA1-03 did.

## Sources

### Primary (HIGH confidence — direct repo inspection, 2026-06-30)
- `apps/staff-web/server/lib/role-resolver.ts` — `resolveRole`, two-allowlist precedence; only used in its test (not wired into any route).
- `apps/staff-web/server/lib/member-session.ts` — `requireMember`/`requireMemberOrDemo`, `getSession` H3 adapter shape (verified in MA1 spike), claim-by-email semantics.
- `apps/staff-web/actions/mark-booking-attended.ts` — sole attendance writer, idempotent, fires Meta Schedule CAPI; no `http` key.
- `apps/staff-web/actions/approve-proposal.ts` (lines 60-82) — programmatic action invocation pattern (`mod.default.schema` + `mod.default.run`).
- `apps/staff-web/server/db/schema.ts` (lines 201-303) — `class_occurrences` (`trainer_id`, `instructor_user_id`), `trainers` (no user/email link), `bookings` (status enum incl. `attended`).
- `apps/staff-web/server/db/seeds/seed-demo-data.ts` — `instructorUserId: null` (confirms the column is unpopulated).
- `apps/staff-web/actions/create-class-occurrence.ts` — writes `trainerId` + `instructorUserId` (latter optional, generally null); confirms `trainer_id` is the live linkage.
- `apps/staff-web/app/routes/api.m.schedule.tsx` / `api.m.profile.tsx` / `api.m.agent.stream.tsx` — member-route patterns, `requireMemberOrDemo` usage, member coach SSE.
- `apps/staff-web/server/routes/api/m/schedule.get.ts` / `agent/stream.post.ts` — Nitro→loader/action delegation template.
- `packages/mobile-app/app/_layout.tsx` — `AgentFabAndSheet` renders for everyone behind `AuthGate`; `app/(tabs)/_layout.tsx` member-only tabs; `lib/session.ts`, `lib/api.ts` — Bearer wiring.
- `.planning/{STATE,ROADMAP,REQUIREMENTS}.md` — locked decisions, MA-wide discipline, active-boolean gotcha, migration-drift gotcha, v36 latest migration.
- `.agents/skills/authentication/SKILL.md` — `getSession(event)` for custom routes; actions auto-protected.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all components inspected in-repo.
- Architecture (role gate, route delegation, action invocation): HIGH — every pattern has a concrete in-repo precedent.
- Teacher→trainer mapping: HIGH on the gap diagnosis (columns inspected, seed confirms `instructor_user_id` null, `trainers` has no link); MEDIUM on the population mechanism (manual vs action — a small plan-time choice).
- Pitfalls: HIGH — drawn from documented project incidents (active-boolean, migration-drift) + the literal code.

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (stable internal codebase; re-verify if MA4 lands the admin SSE before MA3, which would let MA3 directly assert the admin 403).
