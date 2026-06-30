---
phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - apps/staff-web/server/lib/admin-session.ts
  - apps/staff-web/app/routes/api.m.whoami.tsx
  - apps/staff-web/server/routes/api/m/whoami.get.ts
  - apps/staff-web/app/routes/api.m.admin.agent.stream.tsx
  - apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts
autonomous: true
requirements: [AI-01, AI-03]
must_haves:
  truths:
    - "A teacher or member token hitting POST /api/m/admin/agent/stream gets HTTP 403 BEFORE any SSE stream opens"
    - "An admin token can drive the non-gated allow-list verbs in natural language over SSE"
    - "Every tool call executes under runWithRequestContext with the admin's email"
    - "GET /api/m/whoami returns the caller's resolved role for client-side gating"
  artifacts:
    - path: "apps/staff-web/server/lib/admin-session.ts"
      provides: "requireAdmin(request) (401/403) + resolveRequestRole(request)"
      contains: "export async function requireAdmin"
    - path: "apps/staff-web/app/routes/api.m.admin.agent.stream.tsx"
      provides: "Admin SSE tool-loop endpoint over the filtered allow-list"
      contains: "buildAdminToolList"
    - path: "apps/staff-web/app/routes/api.m.whoami.tsx"
      provides: "Role-discovery loader for the mobile client"
      contains: "resolveRequestRole"
    - path: "apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts"
      provides: "Nitro wrapper forwarding the SSE Response (and thrown 403/401)"
      contains: "sendWebResponse"
  key_links:
    - from: "apps/staff-web/app/routes/api.m.admin.agent.stream.tsx"
      to: "apps/staff-web/server/lib/admin-session.ts"
      via: "requireAdmin called at top of action() before the stream"
      pattern: "requireAdmin"
    - from: "apps/staff-web/app/routes/api.m.admin.agent.stream.tsx"
      to: "apps/staff-web/server/lib/mobile-admin-tools.ts"
      via: "buildAdminToolList(registry)"
      pattern: "buildAdminToolList"
    - from: "apps/staff-web/app/routes/api.m.admin.agent.stream.tsx"
      to: "@agent-native/core/server"
      via: "runWithRequestContext wraps the tool loop"
      pattern: "runWithRequestContext"
    - from: "apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts"
      to: "apps/staff-web/app/routes/api.m.admin.agent.stream.tsx"
      via: "Nitro wrapper imports the action"
      pattern: "api.m.admin.agent.stream"
---

<objective>
Build the admin SSE endpoint and its auth gate (AI-03) plus a `whoami` role surface for the client (enables AI-01). A new route `POST /api/m/admin/agent/stream` rejects non-admins with a clean 403 before the stream opens, then runs a manual Anthropic tool loop over ONLY the filtered allow-list from MA4-01, with every tool call wrapped in `runWithRequestContext({ userEmail })`. A `GET /api/m/whoami` returns the caller's resolved role.

Purpose: This is the server half of the differentiator. A separate route (NOT a role-branch on the member endpoint) keeps the security boundary structural — the 403 surface and the tool set are independent and independently testable.

Output: 1 new admin-session helper, 1 new whoami route + Nitro wrapper, 1 new admin SSE route + Nitro wrapper. No DB migration (chat history is client-only).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-CONTEXT.md
@.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-RESEARCH.md
@apps/staff-web/server/lib/role-resolver.ts
@apps/staff-web/server/lib/mobile-admin-tools.ts

<interfaces>
<!-- The h3-v2 session adapter (hard-won in MA1 spike). getSession needs BOTH req and headers. -->
From apps/staff-web/server/lib/member-session.ts (the proven adapter — replicate, do NOT branch member-session):
```ts
const event = {
  req: request,
  headers: request.headers,
  url: new URL(request.url),
  path: new URL(request.url).pathname,
} as any;
return getSession(event); // getSession from "@agent-native/core/server"; returns { userId, email } | null
```

From apps/staff-web/server/lib/role-resolver.ts:
```ts
export type AppRole = "admin" | "teacher" | "member";
export function resolveRole(email: string): AppRole; // RUNSTUDIO_OPERATOR_EMAILS=admin, RUNSTUDIO_TEACHER_EMAILS=teacher
```

From apps/staff-web/server/lib/mobile-admin-tools.ts (MA4-01):
```ts
export function buildAdminToolList(registry, allowlist?): { name; description; input_schema }[];
```

From @agent-native/core/server (confirmed exports):
```ts
export function loadActionsFromStaticRegistry(registry): Record<string, { tool: { description; parameters }; run; http?; ... }>;
export function runWithRequestContext<T>(ctx: { userEmail?: string; orgId?: string; ... }, fn: () => Promise<T>): Promise<T>;
export function getSession(event): Promise<{ userId: string; email: string } | null>;
```

Member SSE precedent to mirror (events, model, prompt caching, manual loop):
  apps/staff-web/app/routes/api.m.agent.stream.tsx  — MODEL = "claude-sonnet-4-6"; events: delta | tool_use | tool_result | done | error; while (turn < 5); max_tokens 1024
Nitro SSE wrapper precedent (forwards thrown Response 403):
  apps/staff-web/server/routes/api/m/agent/stream.post.ts
Nitro JSON GET wrapper precedent (for whoami):
  apps/staff-web/server/routes/api/m/profile.get.ts
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: requireAdmin helper + whoami role-discovery route</name>
  <read_first>
    - apps/staff-web/server/lib/member-session.ts (the h3-v2 sessionFromRequest adapter at lines 45-53 — replicate it; note the comment block 29-44 on why both req+headers are load-bearing)
    - apps/staff-web/server/lib/role-resolver.ts (resolveRole + AppRole)
    - apps/staff-web/server/routes/api/m/profile.get.ts (the Nitro JSON GET wrapper to mirror for whoami; note it forwards thrown Response status)
    - apps/staff-web/app/routes/api.m.profile.tsx (a member loader route shape to mirror — read its loader signature)
  </read_first>
  <files>apps/staff-web/server/lib/admin-session.ts (new), apps/staff-web/app/routes/api.m.whoami.tsx (new), apps/staff-web/server/routes/api/m/whoami.get.ts (new)</files>
  <action>
1. Create `apps/staff-web/server/lib/admin-session.ts`:
```ts
// Admin identity resolution for the mobile admin agent (AI-03).
// Mirrors member-session.ts's h3-v2 session adapter (the {req,headers,url,path}
// shape is load-bearing — see member-session.ts:29-44). resolveRole comes from
// role-resolver.ts (RUNSTUDIO_OPERATOR_EMAILS = admin; NOT GYMOS_ADMIN_EMAILS).
import { getSession } from "@agent-native/core/server";
import { resolveRole, type AppRole } from "./role-resolver.js";

async function sessionFromRequest(request: Request) {
  const url = new URL(request.url);
  return getSession({ req: request, headers: request.headers, url, path: url.pathname } as any);
}

export async function resolveRequestRole(
  request: Request,
): Promise<{ email: string; userId: string; role: AppRole } | null> {
  const session = await sessionFromRequest(request);
  if (!session?.userId || !session?.email) return null;
  return { email: session.email, userId: session.userId, role: resolveRole(session.email) };
}

// Throws 401 (no session) or 403 (not admin) — caller MUST invoke at the top of
// the action so the throw fires BEFORE any SSE stream opens.
export async function requireAdmin(
  request: Request,
): Promise<{ email: string; userId: string }> {
  const ctx = await resolveRequestRole(request);
  if (!ctx) throw new Response("Unauthenticated", { status: 401 });
  if (ctx.role !== "admin") throw new Response("Forbidden", { status: 403 });
  return { email: ctx.email, userId: ctx.userId };
}
```
2. Create `apps/staff-web/app/routes/api.m.whoami.tsx` — a loader that returns the caller's role (does NOT 403 non-admins; it is the role-discovery surface for ALL signed-in users):
```ts
import type { LoaderFunctionArgs } from "react-router";
import { resolveRequestRole } from "../../server/lib/admin-session.js";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await resolveRequestRole(request);
  if (!ctx) return new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ role: ctx.role }), { status: 200, headers: { "Content-Type": "application/json" } });
}
```
3. Create `apps/staff-web/server/routes/api/m/whoami.get.ts` — copy `profile.get.ts` verbatim but import the whoami loader: `import { loader } from "../../../../app/routes/api.m.whoami.js";` (4 `../` — same depth as profile.get.ts). Keep the thrown-Response status forwarding.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -E "admin-session|whoami" || echo "TSC CLEAN for touched files"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export async function requireAdmin" apps/staff-web/server/lib/admin-session.ts`
    - `grep -q "export async function resolveRequestRole" apps/staff-web/server/lib/admin-session.ts`
    - `grep -q "status: 403" apps/staff-web/server/lib/admin-session.ts` (non-admin rejected)
    - `grep -q "req: request" apps/staff-web/server/lib/admin-session.ts` (correct h3-v2 adapter shape)
    - `grep -q "resolveRequestRole" apps/staff-web/app/routes/api.m.whoami.tsx`
    - `grep -q "api.m.whoami" apps/staff-web/server/routes/api/m/whoami.get.ts` (wrapper wired to loader)
  </acceptance_criteria>
  <done>requireAdmin throws 401/403 using the proven h3-v2 adapter + resolveRole; whoami returns {role} for any signed-in caller via a Nitro GET wrapper; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Admin SSE endpoint (manual tool loop over the filtered allow-list, under runWithRequestContext)</name>
  <read_first>
    - apps/staff-web/app/routes/api.m.agent.stream.tsx (the member SSE route to mirror — copy the ReadableStream + client.messages.stream + while-loop + send() helper + event names + prompt-caching pattern; lines 84-214)
    - apps/staff-web/server/routes/api/m/agent/stream.post.ts (the Nitro SSE wrapper to mirror — forwards the streaming Response AND thrown Response 403)
    - apps/staff-web/server/lib/admin-session.ts (requireAdmin — created in Task 1)
    - apps/staff-web/server/lib/mobile-admin-tools.ts (buildAdminToolList — from MA4-01)
  </read_first>
  <files>apps/staff-web/app/routes/api.m.admin.agent.stream.tsx (new), apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts (new)</files>
  <action>
1. Create `apps/staff-web/app/routes/api.m.admin.agent.stream.tsx`. Mirror the member route's structure exactly, with these differences:
   - Imports:
     ```ts
     import Anthropic from "@anthropic-ai/sdk";
     import { requireAdmin } from "../../server/lib/admin-session.js";
     import { buildAdminToolList } from "../../server/lib/mobile-admin-tools.js";
     import { runWithRequestContext, loadActionsFromStaticRegistry } from "@agent-native/core/server";
     import actionsRegistry from "../../.generated/actions-registry.js";
     import type { ActionFunctionArgs } from "react-router";
     ```
   - `const MODEL = "claude-sonnet-4-6";` (same constant — do NOT invent a new model string).
   - At the TOP of `action({ request })`, before anything else: `const admin = await requireAdmin(request);` (this throws 401/403 BEFORE the stream — Pitfall 2). Then the `if (!process.env.ANTHROPIC_API_KEY) return new Response(..., { status: 500 })` guard. Then parse `messages` from the JSON body exactly as the member route does.
   - Build tools from the registry: `const registry = loadActionsFromStaticRegistry(actionsRegistry as any); const tools = buildAdminToolList(registry);`
   - Wrap the WHOLE ReadableStream construction + return in `return runWithRequestContext({ userEmail: admin.email }, async () => { ... });` (AI-03).
   - Manual loop (copy member route shape): `while (turn < 8)` (CONTEXT turn cap < 8), `max_tokens: 1024`. On `stop_reason === "tool_use"`: send `tool_use`, then execute `const result = await registry[toolUse.name].run(toolUse.input);` (registry run is already Zod-wrapped — do NOT re-validate), send `tool_result`, append assistant + tool_result to convo, continue. Use the SAME event names: `delta | tool_use | tool_result | done | error`.
   - Guard an unknown/absent tool: if `!registry[toolUse.name]` send `tool_result` with `{ ok:false, error:"Tool not available" }` (do not crash the loop).
   - System prompt (Claude's discretion on wording) — an admin ops assistant for a boutique fitness studio that answers analytics questions (fill rate, renewals, revenue, payments, at-risk members, inbox, classes, members, trainers) and maintains the noticeboard (section notes + tasks). State plainly it can READ and author the board but CANNOT send messages, take payments, cancel/reschedule classes, or publish forms from the phone (those stay on the web with approval). Use the same `cache_control: { type: "ephemeral" }` on the system block as the member route.
   - Return the streaming `new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } })` from inside the runWithRequestContext callback.
2. Create `apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts` — copy `server/routes/api/m/agent/stream.post.ts` verbatim, changing only the import path to `import { action } from "../../../../../../app/routes/api.m.admin.agent.stream.js";` (6 `../` — the dir is two levels deeper than the member wrapper). Keep `sendWebResponse(result)` for the stream AND the `catch (err instanceof Response) → sendWebResponse(err)` branch so thrown 401/403 forward as clean HTTP statuses.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -E "admin.agent.stream" || echo "TSC CLEAN for touched files"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "requireAdmin(request)" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx` AND it appears before `new ReadableStream` (gate before stream)
    - `grep -q "buildAdminToolList" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx`
    - `grep -q "runWithRequestContext" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx`
    - `grep -q "userEmail: admin.email" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx`
    - `grep -q "claude-sonnet-4-6" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx` (correct model constant)
    - `grep -q "turn < 8" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx` (turn cap per CONTEXT)
    - `grep -q "registry\[toolUse.name\].run" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx` (executes via registry, not a hand-written switch)
    - `grep -q "sendWebResponse" apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts`
    - `grep -q "api.m.admin.agent.stream" apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts`
    - `! grep -q "x-claim-phone\|requireMember" apps/staff-web/app/routes/api.m.admin.agent.stream.tsx` (did not copy member-only logic)
  </acceptance_criteria>
  <done>POST /api/m/admin/agent/stream gates on requireAdmin (401/403) before the stream, builds tools from buildAdminToolList, runs the manual Anthropic loop executing registry actions under runWithRequestContext({ userEmail }), and emits the standard delta/tool_use/tool_result/done/error events; Nitro wrapper forwards both the SSE body and thrown 403s; tsc clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean for admin-session.ts, api.m.whoami.tsx, whoami.get.ts, api.m.admin.agent.stream.tsx, stream.post.ts.
- requireAdmin throws BEFORE the ReadableStream is constructed (gate-before-stream, Pitfall 2).
- The admin route executes tools via `registry[name].run` (registry-derived), never a hand-written runTool switch, and never re-validates input.
- runWithRequestContext wraps the loop with the admin's email (AI-03).
- whoami returns {role} for any signed-in caller (401 if none).
- No DB migration introduced (grep the diff: no `runMigrations`/schema edits).
</verification>

<success_criteria>
- AI-03: SSE endpoint requires an authenticated admin session, rejecting member/teacher with HTTP 403 before the stream; tool calls run under runWithRequestContext with admin identity.
- AI-01 (server half): admin can drive the non-gated allow-list verbs in natural language over SSE.
- whoami role surface exists for client gating (consumed by MA4-03).
- Separate route — member endpoint untouched, no role-branch.
</success_criteria>

<output>
After completion, create `.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-02-SUMMARY.md`.
</output>
