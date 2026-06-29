---
phase: MA1-auth-3-role-spine-the-one-way-door
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/lib/role-resolver.ts
  - apps/staff-web/server/lib/member-session.ts
  - apps/staff-web/server/lib/role-resolver.test.ts
  - apps/staff-web/server/lib/member-session.test.ts
  - apps/staff-web/app/routes/api.m.profile.tsx
  - apps/staff-web/app/routes/api.m.schedule.tsx
  - apps/staff-web/app/routes/api.m.bookings.tsx
  - apps/staff-web/app/routes/api.m.purchase.tsx
  - apps/staff-web/app/routes/api.m.content.tsx
  - apps/staff-web/app/routes/api.m.members.list.tsx
  - apps/staff-web/app/routes/api.m.food-entries.tsx
  - apps/staff-web/app/routes/api.m.foods.search.tsx
  - apps/staff-web/app/routes/api.m.foods.barcode.$ean.tsx
  - apps/staff-web/app/routes/api.m.foods.analyze.tsx
  - apps/staff-web/app/routes/api.m.agent.stream.tsx
autonomous: true
requirements: [AUTH-04, AUTH-05, AUTH-06]
user_setup: []

must_haves:
  truths:
    - "A /api/m/* request carrying a valid Bearer token resolves a gym_members row from the verified Better-auth session (not from a header or body)"
    - "A first authenticated member request claims the gym_members row by lower(trim(email)), writing user_id ONLY"
    - "A re-claim attempt (row already linked to a different user) is rejected 409; an unmatched email returns a PHONE_REQUIRED 403 signal; an all-miss returns 403 contact-the-studio; no gym_members row is ever auto-created"
    - "resolveRole(email) returns admin > teacher > member with strict precedence; an admin who is also a member resolves to admin"
    - "In production the verified session is always used; the X-Demo-Member-Id header is honored only when DEMO_MODE === 'true' AND NODE_ENV !== 'production'"
  artifacts:
    - path: "apps/staff-web/server/lib/role-resolver.ts"
      provides: "resolveRole(email) → 'admin' | 'teacher' | 'member' using RUNSTUDIO_OPERATOR_EMAILS / RUNSTUDIO_TEACHER_EMAILS"
      contains: "RUNSTUDIO_TEACHER_EMAILS"
    - path: "apps/staff-web/server/lib/member-session.ts"
      provides: "requireMember(request), claimMemberByEmail(userId, email), requireMemberOrDemo(request) dual-path wrapper"
      exports: ["requireMember", "claimMemberByEmail", "requireMemberOrDemo"]
    - path: "apps/staff-web/server/lib/member-session.test.ts"
      provides: "Unit tests proving claim idempotency, re-claim 409, no-match, user_id-only write, role precedence"
  key_links:
    - from: "apps/staff-web/app/routes/api.m.profile.tsx"
      to: "apps/staff-web/server/lib/member-session.ts"
      via: "requireMemberOrDemo(request) replaces requireDemoMember(request)"
      pattern: "requireMemberOrDemo"
    - from: "apps/staff-web/server/lib/member-session.ts"
      to: "@agent-native/core/server getSession"
      via: "minimal H3Event built from request.headers passed to getSession"
      pattern: "getSession"
    - from: "apps/staff-web/server/lib/member-session.ts"
      to: "schema.gymMembers.userId"
      via: "claim UPDATE SET writes userId ONLY, guarded on isNull(userId)"
      pattern: "\\.set\\(\\{ userId"
---

<objective>
Build the server-side member-identity spine: a `requireMember(request)` that resolves the verified Better-auth session (Bearer) into a `gym_members` row via lazy, transactional, re-claim-guarded claim-by-email, plus a `resolveRole(email)` role resolver, then wire every `/api/m/*` handler to the new dual-path (`requireMemberOrDemo`). This is the foundation the mobile client (Plan 02) and the device spike (Plan 03) prove end-to-end. No migration, no UI.

Purpose: This is the one-way-door server contract. Every downstream surface (MA2 booking, MA3 teacher, MA4 admin agent) hangs off `requireMember` returning the correct claimed member from a verified session. Getting the claim safety (dual-unique-key, idempotency, re-claim 409) and the demo dual-path gate right here is what prevents cross-member data leakage later.

Output: `role-resolver.ts`, `member-session.ts`, their unit tests, and all 11 `/api/m/*` handlers swapped from `requireDemoMember` to `requireMemberOrDemo`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-CONTEXT.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md

<interfaces>
<!-- Contracts the executor needs. Extracted from the codebase — use directly, no exploration needed. -->

From apps/staff-web/server/lib/demo-member.ts (the exact shape requireMember must mirror):
```typescript
export type DemoMember = typeof schema.gymMembers.$inferSelect;
export async function requireDemoMember(request: Request): Promise<DemoMember> {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") {
    throw new Response("Demo mode disabled", { status: 401 });
  }
  const memberId = request.headers.get("x-demo-member-id");
  if (!memberId) throw new Response("Missing X-Demo-Member-Id", { status: 401 });
  const db = getDb();
  // guard:allow-unscoped — demo D-07
  const member = await db.select().from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, memberId)).limit(1).then(r => r[0] ?? null);
  if (!member) throw new Response("Member not found", { status: 404 });
  return member;
}
```

From @agent-native/core/server (the ONLY exported session resolver — getBetterAuthSync is NOT exported):
```typescript
// Takes an H3Event. Its better-auth path reads event.headers (a web Headers) and
// resolves Authorization: Bearer <token> via the mounted bearer() plugin.
export async function getSession(event: H3Event): Promise<AuthSession | null>;
export interface AuthSession {
  email: string;
  userId?: string;   // always set for Better-auth sessions (mapBetterAuthSession, confirmed)
  token?: string;
  name?: string;
  orgId?: string;
  orgRole?: string;
}
```

From apps/staff-web/server/db/schema.ts (gymMembers — userId is the nullable pre-built FK join column):
```typescript
export const gymMembers = table("gym_members", {
  id: text("id").primaryKey(),
  userId: text("user_id"),          // nullable FK to Better-auth user.id — the claim target
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),             // partial-unique WHERE email IS NOT NULL (0003 migration)
  phoneE164: text("phone_e164"),    // partial-unique WHERE phone_e164 IS NOT NULL (0003 migration)
  // ...
});
```

From apps/staff-web/app/root.tsx lines ~85-92 (the env-allowlist resolver pattern to mirror):
```typescript
const operatorEmailsFromEnv = (process.env.RUNSTUDIO_OPERATOR_EMAILS ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const operatorEmails = operatorEmailsFromEnv.length > 0
  ? operatorEmailsFromEnv
  : ["patrickalexanderross@outlook.com"]; // fallback-to-Patrick (NOT everyone)
```

From apps/staff-web/server/lib/csv-leads.ts (server-side phone normalizer to reuse — UK +44 default, returns null on invalid):
```typescript
export function normalizePhone(raw: string): string | null; // → E.164 or null
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: role-resolver.ts + tests</name>
  <files>apps/staff-web/server/lib/role-resolver.ts, apps/staff-web/server/lib/role-resolver.test.ts</files>
  <read_first>
    - apps/staff-web/app/root.tsx (lines 70-100 — GYMOS_ADMIN_EMAILS vs RUNSTUDIO_OPERATOR_EMAILS; mirror the split/trim/lowercase/filter resolver)
    - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md (Finding 7 — the canonical allowlist mapping + the exact resolveRole reference implementation)
  </read_first>
  <behavior>
    - resolveRole("ops@studio.com") with RUNSTUDIO_OPERATOR_EMAILS="ops@studio.com" → "admin"
    - resolveRole("coach@studio.com") with RUNSTUDIO_TEACHER_EMAILS="coach@studio.com" (and not in operator list) → "teacher"
    - resolveRole("member@x.com") with neither list containing it → "member"
    - Precedence: an email present in BOTH operator and teacher lists → "admin" (admin > teacher)
    - Case/whitespace-insensitive: resolveRole("  Ops@Studio.com ") matches "ops@studio.com"
    - Empty RUNSTUDIO_TEACHER_EMAILS → no teachers (every non-admin is member)
  </behavior>
  <action>
    Create `apps/staff-web/server/lib/role-resolver.ts` exporting `export type AppRole = "admin" | "teacher" | "member";` and `export function resolveRole(email: string): AppRole`.

    Implementation (copy exactly — per D-14, D-16, and RESEARCH Finding 7):
    - Parse `RUNSTUDIO_OPERATOR_EMAILS` and a NEW env var `RUNSTUDIO_TEACHER_EMAILS` each with `(process.env.X ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)`.
    - Do NOT apply the Patrick fallback inside resolveRole — that fallback belongs to operator-chrome gating in root.tsx, not the mobile role check. For the mobile resolver, empty operator list = no admin via env (a deploy sets it explicitly). NOTE this divergence in a comment.
    - `const e = email.toLowerCase().trim();`
    - `if (adminEmails.includes(e)) return "admin";` then `if (teacherEmails.includes(e)) return "teacher";` then `return "member";` — strict precedence admin > teacher > member (D-14/D-15).
    - Do NOT read `GYMOS_ADMIN_EMAILS` (it is web-tab gating with empty-list-passes-everyone semantics — RESEARCH Pitfall 6). Add a comment: `// RUNSTUDIO_OPERATOR_EMAILS is the canonical admin allowlist for mobile roles (NOT GYMOS_ADMIN_EMAILS).`

    Create `apps/staff-web/server/lib/role-resolver.test.ts` (Vitest) asserting all six behaviors above. Set env vars via `vi.stubEnv` (or assign `process.env.X` in `beforeEach`/`afterEach`) so tests are hermetic. This is a pure function with no @agent-native/core import (avoids the ESM/CJS vitest issue noted in BD4-01 decisions).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run server/lib/role-resolver.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - role-resolver.ts exports `resolveRole` and `AppRole`
    - File contains the literal string `RUNSTUDIO_TEACHER_EMAILS` and `RUNSTUDIO_OPERATOR_EMAILS`
    - File does NOT contain `GYMOS_ADMIN_EMAILS`
    - `npx vitest run server/lib/role-resolver.test.ts` passes with the admin>teacher precedence test green
  </acceptance_criteria>
  <done>resolveRole resolves the three roles with strict precedence from the two env allowlists; tests pass; GYMOS_ADMIN_EMAILS is not referenced.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: member-session.ts (requireMember + claimMemberByEmail + dual-path) + tests</name>
  <files>apps/staff-web/server/lib/member-session.ts, apps/staff-web/server/lib/member-session.test.ts</files>
  <read_first>
    - apps/staff-web/server/lib/demo-member.ts (the exact return shape and 401/404 throw pattern to mirror)
    - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md (Finding 8 claim pattern, Finding 9 requireMember shape, Finding 5/Pitfall 3 dual-unique-key safety)
    - apps/staff-web/server/db/schema.ts (gymMembers definition ~109-132; confirm userId / email / phoneE164 columns)
    - apps/staff-web/server/lib/csv-leads.ts (normalizePhone signature — reuse for the phone-fallback E.164 normalize)
    - apps/staff-web/app/routes/api.m.profile.tsx (an existing handler so the test mirror of the import surface is correct)
  </read_first>
  <behavior>
    - claimMemberByEmail(userId, email): if a gym_members row already has user_id === userId → returns that row unchanged (idempotent fast path)
    - claimMemberByEmail with an unclaimed row matching lower(trim(email)) and user_id IS NULL → UPDATE sets user_id ONLY and returns the linked row
    - claimMemberByEmail where the email-matched row has a DIFFERENT non-null user_id → returns { error: "RECLAIM", status: 409 }
    - claimMemberByEmail where no email row matches → returns { error: "NO_EMAIL_MATCH" } (sentinel for phone fallback)
    - The claim UPDATE statement references ONLY userId in its SET — never email or phone_e164 (dual-unique-key safety)
    - claimMemberByPhone(userId, phoneE164): same idempotency/re-claim/no-match semantics keyed on phone_e164
  </behavior>
  <action>
    Create `apps/staff-web/server/lib/member-session.ts`. Import `{ eq, and, isNull }` from `drizzle-orm`, `{ getDb, schema }` from `../db`, `{ getSession }` from `@agent-native/core/server`, and `{ normalizePhone }` from `./csv-leads`.

    Export `export type Member = typeof schema.gymMembers.$inferSelect;`

    **H3Event-from-Request adapter (the seam from RESEARCH Open Question 1):** `getSession` takes an H3Event but `/api/m/*` React Router routes receive a Web `Request`. `getBetterAuthSync` is NOT exported from core, so build a minimal H3-compatible event and pass it to the exported `getSession`. h3 v2's better-auth path reads `event.headers` (a web `Headers`). Implement:
    ```typescript
    async function sessionFromRequest(request: Request) {
      // h3 v2 getSession reads event.headers (a web Headers). A React Router
      // Request already exposes request.headers as a web Headers instance.
      const event = { headers: request.headers, node: { req: {}, res: {} }, path: new URL(request.url).pathname } as any;
      return getSession(event);
    }
    ```
    The Plan 03 spike device-verifies this adapter resolves a Bearer token end-to-end. If, at execution, `getSession` throws on the minimal event shape, fall back to the documented direct path — but DO NOT add `getBetterAuthSync` to core's exports; instead widen the mock event until `event.headers.get("authorization")` is what the better-auth `bearer()` plugin reads (it reads `event.headers`).

    Export `async function claimMemberByEmail(userId: string, email: string): Promise<Member | { error: "RECLAIM"; status: 409 } | { error: "NO_EMAIL_MATCH" }>` following RESEARCH Finding 8 EXACTLY:
    - `const normalised = email.toLowerCase().trim();`
    - STEP 1 idempotent fast path: select where `eq(schema.gymMembers.userId, userId)` limit 1 → if found, return it. Carry `// guard:allow-unscoped — single-tenant gym tables`.
    - STEP 2: select where `eq(schema.gymMembers.email, normalised)` limit 1. If found and `row.userId !== null && row.userId !== userId` → return `{ error: "RECLAIM", status: 409 }`. If found and unclaimed → `db.update(schema.gymMembers).set({ userId }).where(and(eq(schema.gymMembers.id, row.id), isNull(schema.gymMembers.userId)))` — **SET writes userId ONLY (D-10, Pitfall 3); never email or phone_e164** — then return `{ ...row, userId }`.
    - STEP 3: no email match → return `{ error: "NO_EMAIL_MATCH" }`.

    Export `async function claimMemberByPhone(userId: string, phoneRaw: string): Promise<Member | { error: "RECLAIM"; status: 409 } | { error: "NO_PHONE_MATCH" }>` mirroring the email claim but keyed on `phoneE164` after `const p = normalizePhone(phoneRaw); if (!p) return { error: "NO_PHONE_MATCH" };`. SET writes `userId` ONLY.

    Export `async function requireMember(request: Request): Promise<Member>` per RESEARCH Finding 9:
    - `const session = await sessionFromRequest(request); if (!session?.userId) throw new Response("Unauthenticated", { status: 401 });`
    - Fast path: select where `eq(schema.gymMembers.userId, session.userId)` limit 1 → return if found.
    - Lazy claim (D-09): `const result = await claimMemberByEmail(session.userId, session.email);`
      - if `"error" in result`:
        - `RECLAIM` → `throw new Response("Account conflict", { status: 409 });`
        - `NO_EMAIL_MATCH` → throw a 403 JSON signal so the client can collect a phone number: `throw new Response(JSON.stringify({ code: "PHONE_REQUIRED" }), { status: 403, headers: { "Content-Type": "application/json" } });` (D-12)
      - else return result.
    NOTE: the phone-claim retry (after the client supplies a phone) is wired via a header in Plan 02's sign-in flow; `claimMemberByPhone` is exported here for that consumer. A request that supplies an `x-claim-phone` header MUST be honored inside requireMember: if present AND the email claim missed, call `claimMemberByPhone(session.userId, header)`; on `NO_PHONE_MATCH` throw `new Response("No membership on file — contact the studio.", { status: 403 })` and best-effort staff-notify (see below); on RECLAIM throw 409; on success return the linked row.

    **Staff-notify for the all-miss dead end (D-13, Claude's discretion):** keep it minimal and reuse existing infra — `console.warn("[member-session] unmatched sign-in — staff follow-up needed", { userId: session.userId, email: session.email })`. Do NOT build new infrastructure; a richer ghost-lead conversation row is explicitly deferred (note it in a `// TODO(MA2+)` comment). This avoids coupling MA1 to the conversations/lead pipeline.

    Export the dual-path wrapper `async function requireMemberOrDemo(request: Request): Promise<Member>` (D-17/D-18):
    ```typescript
    export async function requireMemberOrDemo(request: Request): Promise<Member> {
      if (process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production") {
        return requireDemoMember(request); // imported from ./demo-member
      }
      return requireMember(request);
    }
    ```
    Import `requireDemoMember` from `./demo-member`. The gate condition is verbatim: `process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production"`. `Member` and `DemoMember` are the same `$inferSelect` type so the return is uniform.

    Create `apps/staff-web/server/lib/member-session.test.ts` (Vitest). Mock `getDb` (and `getSession` where needed) so the claim logic is unit-testable without a live DB — assert: idempotent fast-path returns existing row; unclaimed-email claim writes userId only (assert the `.set` argument equals `{ userId }`); reclaim returns `{ error: "RECLAIM", status: 409 }`; no-email-match returns `{ error: "NO_EMAIL_MATCH" }`. Mirror the BD4-01 pure-helper test pattern — if mocking @agent-native/core proves awkward in vitest ESM, extract the pure claim logic into a `member-session-helpers.ts` that takes an injected db and test that (same approach as create-checkout-link-helpers.ts).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run server/lib/member-session.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - member-session.ts exports `requireMember`, `claimMemberByEmail`, `claimMemberByPhone`, `requireMemberOrDemo`, and type `Member`
    - The claim UPDATE in member-session.ts matches the pattern `\.set\(\{ userId` and never sets email/phone_e164 (grep: no `.set({ ...` that includes `email` or `phoneE164` in the claim functions)
    - requireMemberOrDemo contains the verbatim gate `process.env.DEMO_MODE === "true"` AND `process.env.NODE_ENV !== "production"`
    - The NO_EMAIL_MATCH path throws a 403 Response whose body contains `PHONE_REQUIRED`
    - `npx vitest run server/lib/member-session.test.ts` passes; `npx tsc --noEmit` is clean
  </acceptance_criteria>
  <done>requireMember resolves the verified session → claimed gym_members row with idempotent/re-claim-guarded/user_id-only claim; the demo dual-path gate is exact; tests + tsc green.</done>
</task>

<task type="auto">
  <name>Task 3: Swap all /api/m/* handlers to requireMemberOrDemo</name>
  <files>apps/staff-web/app/routes/api.m.profile.tsx, apps/staff-web/app/routes/api.m.schedule.tsx, apps/staff-web/app/routes/api.m.bookings.tsx, apps/staff-web/app/routes/api.m.purchase.tsx, apps/staff-web/app/routes/api.m.content.tsx, apps/staff-web/app/routes/api.m.members.list.tsx, apps/staff-web/app/routes/api.m.food-entries.tsx, apps/staff-web/app/routes/api.m.foods.search.tsx, apps/staff-web/app/routes/api.m.foods.barcode.$ean.tsx, apps/staff-web/app/routes/api.m.foods.analyze.tsx, apps/staff-web/app/routes/api.m.agent.stream.tsx</files>
  <read_first>
    - apps/staff-web/server/lib/member-session.ts (the requireMemberOrDemo you just created)
    - apps/staff-web/app/routes/api.m.profile.tsx (current requireDemoMember call site)
    - apps/staff-web/app/routes/api.m.agent.stream.tsx (SSE route — same swap; this is the spike's admin-SSE target)
  </read_first>
  <action>
    In EACH of the 11 member route files, replace the `requireDemoMember` import and call site with `requireMemberOrDemo`:
    - Change `import { requireDemoMember } from "../../server/lib/demo-member";` → `import { requireMemberOrDemo } from "../../server/lib/member-session";`
    - Change every `const member = await requireDemoMember(request);` → `const member = await requireMemberOrDemo(request);`

    Files (all under apps/staff-web/app/routes/):
    api.m.profile.tsx, api.m.schedule.tsx, api.m.bookings.tsx, api.m.purchase.tsx, api.m.content.tsx, api.m.members.list.tsx, api.m.food-entries.tsx, api.m.foods.search.tsx, api.m.foods.barcode.$ean.tsx, api.m.foods.analyze.tsx, api.m.agent.stream.tsx.

    Do NOT change anything else in these handlers — the returned `member` shape is identical (`$inferSelect`), so all downstream `member.id` / `member.firstName` reads keep working. Leave the `// guard:allow-unscoped` comments intact. Do NOT remove `demo-member.ts` (still used by `requireMemberOrDemo` in the demo branch).

    Confirm the auth.ts `publicPaths` already lists `/api/m` (it does — these routes self-gate). No auth.ts change needed: in production `requireMemberOrDemo` calls `requireMember`, which throws 401 without a valid Bearer; in demo it preserves the X-Demo-Member-Id path. Add NO new public paths.

    Run prettier on all touched files: `npx prettier --write apps/staff-web/app/routes/api.m.*.tsx`.
  </action>
  <verify>
    <automated>cd apps/staff-web && (grep -rl "requireDemoMember" app/routes/api.m.*.tsx | grep -v "member-session" && echo "STRAGGLERS FOUND" && exit 1 || echo "all swapped") && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "requireDemoMember" apps/staff-web/app/routes/api.m.*.tsx` returns ZERO matches (all 11 now call requireMemberOrDemo)
    - `grep -rn "requireMemberOrDemo" apps/staff-web/app/routes/api.m.*.tsx` returns 11 import lines + ≥11 call sites
    - apps/staff-web/server/lib/demo-member.ts still exists (imported by member-session.ts)
    - `npx tsc --noEmit` in apps/staff-web is clean
    - No new entries added to auth.ts publicPaths
  </acceptance_criteria>
  <done>All 11 /api/m/* handlers derive identity from requireMemberOrDemo; production uses the verified session, demo keeps the header fallback; tsc clean; no public-path widening.</done>
</task>

</tasks>

<verification>
- `npx vitest run server/lib/role-resolver.test.ts server/lib/member-session.test.ts` — both green
- `grep -rn "requireDemoMember" apps/staff-web/app/routes/api.m.*.tsx` — zero matches
- claim UPDATE writes user_id ONLY (no email/phone in any `.set` inside the claim functions)
- `npx tsc --noEmit` in apps/staff-web — clean
- No migration added (db.ts latest version stays 36); no unique index on gym_members.email
</verification>

<success_criteria>
- AUTH-06: every /api/m/* handler derives member identity via requireMemberOrDemo (verified session in prod; X-Demo-Member-Id only when DEMO_MODE && !production)
- AUTH-05: claimMemberByEmail is idempotent, re-claim-guarded (409), writes user_id only, never auto-creates; phone-fallback exported for Plan 02
- AUTH-04: resolveRole returns admin > teacher > member from RUNSTUDIO_OPERATOR_EMAILS / RUNSTUDIO_TEACHER_EMAILS; admin-who-is-member → admin
</success_criteria>

<output>
After completion, create `.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-01-SUMMARY.md`
</output>
