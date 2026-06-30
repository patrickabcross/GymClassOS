# Phase MA4: Admin Mobile AI Agent (differentiator + security keystone) — Research

**Researched:** 2026-06-30
**Domain:** Server-side SSE agent loop + tool allow-listing + Better-auth admin gating (no new external deps)
**Confidence:** HIGH (every recommendation is grounded in a file read in this repo, not training data)

## Summary

MA4 is **almost entirely a recombination of code that already exists in this repo** — there is no new library, no new external service, and (confirmed) **no DB migration**. The member agent SSE endpoint (`apps/staff-web/app/routes/api.m.agent.stream.tsx`), its Nitro wrapper, the mobile SSE client (`packages/mobile-app/lib/agent-stream.ts`), and the chat UI (`packages/mobile-app/components/AgentSheet.tsx`) are all production-shaped patterns to copy. The full operator toolset already exists as a static, importable registry (`apps/staff-web/.generated/actions-registry.ts`), normalised by `loadActionsFromStaticRegistry` into `{ name → { tool, run, http, ... } }`. `runWithRequestContext` is a real export from `@agent-native/core/server` and is exactly how the framework's own HTTP action mount scopes every call.

The single novel, load-bearing piece is the **security keystone (AI-02)**: the gated Tier-3 verbs must be *structurally* absent from the mobile admin tool list, proven by a unit test. The good news is the gated set **already exists as a maintained constant in two places** kept in lockstep by a standing project rule (`ACTION_ALLOWLIST` in `actions/approve-proposal.ts` and the Zod enum in `actions/propose-action.ts`). The cleanest design extracts that set to ONE exported constant, derives the mobile tool list as `EXPLICIT_ALLOW_LIST` then defensively `.filter(name => !GATED_ACTIONS.has(name))`, and unit-tests both that the gated set never intersects the built tool list and that the allow-list is itself gated-clean.

**Primary recommendation:** Build a **new** SSE route `api.m.admin.agent.stream.tsx` + Nitro wrapper (do NOT branch the member route), gated by a new `requireAdmin(request)` helper, that imports the static actions registry, selects an explicit non-gated allow-list, hard-filters the exported `GATED_ACTIONS` set, runs the manual tool loop inside `runWithRequestContext({ userEmail: admin email })`, and point a thin admin variant of `AgentSheet` (different URL + system prompt) at it. Add one unit test asserting gated absence. Touch all four agent-native areas (UI, actions/endpoint, AGENTS.md, app-state via cache invalidation).

<phase_requirements>
## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|-----------------------------------|------------------|
| AI-01 | Admin opens an in-app AI ops chat (reusing `AgentSheet`) that calls non-gated platform actions in natural language and renders results that reflect in app state | Reuse `AgentSheet.tsx` + `agent-stream.ts` (Focus Q5); new SSE endpoint mirrors `api.m.agent.stream.tsx` manual tool loop (Focus Q2/Q4); "reflect in app state" = the existing `onToolResult → qc.invalidateQueries` pattern (Architecture §App-state contract) |
| AI-02 | Mobile admin endpoint exposes ONLY the non-gated verb set via a server-side **allow-list**; gated Tier-3 (`send-template-to-members`, `create-checkout-link`, `cancel-occurrence`, `reschedule-occurrence`, `publish-form`) absent + unit test | Single exported `GATED_ACTIONS` source-of-truth (Focus Q1); explicit allow-list + defensive filter + test (Architecture §Allow-list, Code Examples) |
| AI-03 | Tool calls run under `runWithRequestContext` with admin identity; SSE requires authenticated admin session (rejects member/teacher 403) | `runWithRequestContext` from `@agent-native/core/server` (Focus Q4); new `requireAdmin` mirroring `member-session.ts` + `role-resolver.ts` (Focus Q3) |
</phase_requirements>

## Locked Decisions / Constraints (from REQUIREMENTS.md + STATE.md)

These are LOCKED for this milestone — research within them, do not propose alternatives:

- **Admin agent exposes ONLY non-gated verbs via a server-side allow-list** (gated Tier-3 filtered out + unit-tested). The web agent gates Tier-3 only by prompt + noticeboard; a naive fork would lose that gate. This is the keystone.
- **Role = `RUNSTUDIO_OPERATOR_EMAILS` (admin) / `RUNSTUDIO_TEACHER_EMAILS` (teacher) / else member**, precedence admin > teacher > member. Resolved server-side. No role toggle in the UI. Use `resolveRole()` in `server/lib/role-resolver.ts` — NOT Better-auth org roles, NOT `GYMOS_ADMIN_EMAILS`.
- **Teachers have NO access to the admin agent** (TCH-03). The 403 gate must reject teacher tokens, not just member tokens.
- **No auth migration; strictly additive DB only.** This phase needs **no migration at all** (confirmed — no new tables; chat history is client-only state like the member agent).
- **Native iOS/Android only** — no react-native-web target.
- **Single-tenant per deploy.** Gym tables carry `// guard:allow-unscoped` and do not need org scoping.

## Standard Stack

No new dependencies. Everything required is already installed and in use.

### Core (already present)
| Library | Version (installed) | Purpose | Where used today |
|---------|--------------------|---------|------------------|
| `@anthropic-ai/sdk` | (server, staff-web) | Server-side tool loop + streaming | `api.m.agent.stream.tsx` (member agent) |
| `react-native-sse` | (mobile) | POST + Bearer + named SSE events | `packages/mobile-app/lib/agent-stream.ts` |
| `@agent-native/core` / `/server` | workspace | `defineAction`, `getSession`, `runWithRequestContext`, `loadActionsFromStaticRegistry` | actions + agent-chat plugin |
| `drizzle-orm` | `^0.45.x` | DB reads in action `run()` | every `actions/*.ts` |
| `zod` | `^4.x` | Action schemas (already wraps each `run`) | every action |
| `@tanstack/react-query` | `^5.x` (mobile) | App-state reflection via cache invalidation | `AgentSheet.tsx` |
| `vitest` | (staff-web `vitest.unit.config.ts`) | The AI-02 unit test | existing `*.test.ts` in `actions/` and `server/lib/` |

**Model constant:** `claude-sonnet-4-6` (verbatim from the member endpoint, line 21 — do NOT use `claude-sonnet-4-7` (does not exist) or `3-5-*`). Reuse the same constant.

**Installation:** none. `// guard:` — adding a dependency for this phase would be a smell.

## Architecture Patterns

### Recommended file layout (all NEW unless noted)
```
apps/staff-web/
├── app/routes/
│   └── api.m.admin.agent.stream.tsx       # NEW — admin SSE action (mirror of member route)
├── server/routes/api/m/admin/agent/
│   └── stream.post.ts                     # NEW — Nitro wrapper (copy of m/agent/stream.post.ts)
├── server/lib/
│   ├── admin-session.ts                   # NEW — requireAdmin(request)
│   └── gated-actions.ts                   # NEW — single GATED_ACTIONS source of truth
├── actions/
│   ├── approve-proposal.ts                # EDIT — import GATED_ACTIONS instead of inline list
│   └── propose-action.ts                  # EDIT — import GATED_ACTIONS for the Zod enum
├── server/lib/
│   └── mobile-admin-tools.ts              # NEW — buildAdminToolList(registry): pure, testable
└── server/lib/mobile-admin-tools.test.ts  # NEW — AI-02 unit test (gated set absent)

packages/mobile-app/
├── components/
│   └── AdminAgentSheet.tsx                # NEW (or param on AgentSheet) — admin URL + prompt
├── lib/
│   ├── agent-stream.ts                    # EDIT — accept an endpoint path param (default member)
│   └── whoami.ts                          # NEW — GET /api/m/whoami → { role } for client gating
└── app/(tabs)/...                         # EDIT — show admin agent entry only when role==='admin'

apps/staff-web/app/routes/api.m.whoami.tsx + server wrapper   # NEW — role surface for client UX
```

### Pattern 1 — Manual tool loop driving registry actions (the heart of the endpoint)
**What:** Mirror the member endpoint's `ReadableStream` + `client.messages.stream` + `while (turn < N)` loop, but (a) build `TOOLS` from the filtered registry, (b) execute via `registry[name].run(input)` instead of a hand-written `runTool`, (c) wrap the whole loop body in `runWithRequestContext`.
**When:** This is the only viable shape — the mobile app is a separate Expo binary and cannot use `sendToAgentChat` (the `delegate-to-agent` skill's normal path). The member endpoint already establishes this server-side-LLM divergence; MA4 follows the same precedent. Note the divergence in AGENTS.md.
**Key facts about registry entries** (verified in `packages/core/src/action.ts` + `action-discovery.ts`):
- Each entry = `{ tool: { description, parameters }, run, http?, readOnly?, schema? }`.
- `entry.tool.parameters` is **already JSON Schema** (Zod→JSON via `schemaToJsonSchema`) → drop straight into Anthropic's `input_schema`.
- `entry.run(args)` is **already Zod-wrapped** (`wrapWithValidation`) — invalid input throws a self-correcting error string; you do not re-validate.
- The registry contains ~80 actions including upstream Mail actions (`send-email`, `archive-email`, `list-emails`…) and staff-only non-agent actions (`create-connect-account`, `mark-booking-attended`, `brain-extract-brand`). **Pure `ALL − GATED` is WRONG** — it would expose `send-email` and friends. Use an explicit allow-list (below).

### Pattern 2 — Allow-list with single-source gated set (AI-02 keystone)
**What:** Two collaborating constants:
1. `GATED_ACTIONS` — extract verbatim from `approve-proposal.ts`'s `ACTION_ALLOWLIST` into `server/lib/gated-actions.ts` and re-import it in BOTH `approve-proposal.ts` and `propose-action.ts`. This collapses the standing "update both files" rule (v1.2 decision, 2026-06-18) into one edit point and makes the gated set machine-readable.
2. `MOBILE_ADMIN_ALLOWLIST` — an explicit array of the non-gated agent verbs the admin should drive from a phone (the Tier-1 reads + Tier-2 authoring + selected direct authoring). Build the tool list as:
```ts
buildAdminToolList(registry) =
  MOBILE_ADMIN_ALLOWLIST
    .filter(name => !GATED_ACTIONS.has(name))   // defensive structural filter
    .filter(name => registry[name])             // skip anything missing
    .map(name => ({ name, description: registry[name].tool.description,
                    input_schema: registry[name].tool.parameters }));
```
**Why both:** the explicit allow-list satisfies AI-02's literal "exposes ONLY the non-gated verb set via a server-side allow-list" AND keeps upstream Mail/staff-only actions out. The `GATED_ACTIONS` filter is belt-and-suspenders: even if a future maintainer mistakenly adds a gated verb to the allow-list, the filter strips it AND the unit test fails. This is the "derive from a tagged registry, not a hardcoded subtraction" property the phase asked for — `GATED_ACTIONS` IS the tag.

**Recommended `MOBILE_ADMIN_ALLOWLIST` starting set** (Tier-1 read + Tier-2 author + safe direct authoring; refine at plan time):
`list-fill-rate, list-renewals, list-revenue, list-payments, list-at-risk-members, list-inbox-summary, list-classes, list-members, list-trainers, content-list-documents, content-get-document, video-list-compositions, video-get-composition, upsert-section-note, create-task, complete-task` — plus optionally direct authoring verbs (`update-member`, `create-class-definition`, `create-class-occurrence`, `set-occurrence-capacity`, `update-class-definition`, `mark-occurrence-complete`, `create-trainer`, `update-trainer`, `create-schedule-rule`, `update-schedule-rule`, `deactivate-schedule-rule`, `save-segment`, `content-*`, `video-*`). **Exclude** `navigate` and `view-screen` (they target web `/gymos/*` routes + browser application_state that don't exist in the Expo app — see Pitfall 4). **Exclude** `propose-action`/`approve-proposal` (there is no mobile approval UI — that is the whole point of the gate).

### Pattern 3 — Endpoint gated BEFORE the stream opens (AI-03)
**What:** `requireAdmin(request)` runs at the top of the `action()` (exactly where the member route calls `requireMemberOrDemo`), before constructing the `ReadableStream`. On non-admin it throws a `Response("Forbidden", { status: 403 })`. The Nitro wrapper already catches thrown `Response` and forwards via `sendWebResponse` (see `m/agent/stream.post.ts` lines 17–21) — so a teacher/member token gets a clean 403 and no SSE stream is ever created.
**`requireAdmin` implementation** (new `server/lib/admin-session.ts`):
```ts
import { getSession } from "@agent-native/core/server";
import { resolveRole } from "./role-resolver.js";

export async function requireAdmin(request: Request): Promise<{ email: string; userId: string }> {
  // Mirror member-session.ts's sessionFromRequest adapter (h3 v2 needs BOTH req + headers)
  const url = new URL(request.url);
  const event = { req: request, headers: request.headers, url, path: url.pathname } as any;
  const session = await getSession(event);
  if (!session?.userId || !session?.email) throw new Response("Unauthenticated", { status: 401 });
  if (resolveRole(session.email) !== "admin") throw new Response("Forbidden", { status: 403 });
  return { email: session.email, userId: session.userId };
}
```
Note: `sessionFromRequest` is currently a private function in `member-session.ts`. Either **export it** and reuse, or replicate the 4-line adapter. Reuse is cleaner (single h3-v2 adapter). The adapter shape (`{ req, headers, url, path }`) is load-bearing — it was hard-won in the MA1 spike (see the comment block at `member-session.ts:29-44`).

### Pattern 4 — Tool execution under request context (AI-03)
Wrap the loop so EVERY `entry.run()` sees the admin identity:
```ts
return runWithRequestContext({ userEmail: admin.email }, async () => { /* ReadableStream + loop */ });
```
This mirrors the framework's own `mountActionRoutes` (`action-routes.ts:165`), which wraps each action call in `runWithRequestContext({ userEmail, userName, orgId, timezone })`. For single-tenant gym tables the `run()` bodies use `guard:allow-unscoped` and don't read context, so wrapping is mostly for (a) the AI-03 success criterion, (b) any action that calls `resolveCredential`/`getCredentialContext` (e.g. anything resolving an API key), and (c) future-proofing. `orgId` can be omitted (single-tenant) — do not invent one.

### Anti-Patterns to avoid
- **Branching `api.m.agent.stream.tsx` on role.** A single endpoint mixing member-scoped tools and admin-scoped tools makes the security boundary a runtime `if` instead of a separate, independently-tested route. A new route gives a clean 403 surface and a self-contained allow-list. (Focus Q2 → new route.)
- **`ALL_REGISTRY − GATED` subtraction.** Leaks upstream Mail + staff-only actions. Use an explicit allow-list (Pattern 2).
- **Hardcoding the gated list a third time** inside the mobile endpoint. Import the one `GATED_ACTIONS` const. Three copies will drift.
- **Re-validating action inputs in the loop.** `entry.run` is already Zod-wrapped.
- **A new DB table for chat history.** Member agent has none; admin agent needs none. No migration.
- **Helper/test files under `server/plugins/`.** Nitro requires a default-export plugin from every file there → Vercel build breaks. Put `gated-actions.ts`, `admin-session.ts`, `mobile-admin-tools.ts` in `server/lib/` (STATE.md migration-drift / Nitro-plugins gotcha; v2.1 decision 2026-06-20).

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Tool JSON schemas | Hand-author `input_schema` per tool | `registry[name].tool.parameters` | Already generated from each action's Zod schema; hand copies drift from the action |
| Input validation in the loop | Re-parse args | `registry[name].run(args)` | `defineAction` wraps `run` with `wrapWithValidation` already |
| Session resolution | Custom token parsing | `getSession(event)` from `@agent-native/core/server` | Resolves Bearer (`set-auth-token`) + cookie; proven in MA1 |
| Per-request identity | `process.env.AGENT_USER_EMAIL` mutation | `runWithRequestContext` | AsyncLocalStorage; env mutation leaks across concurrent requests (see `request-context.ts:1-17`) |
| SSE POST + Bearer on RN | `fetch` + manual chunk parsing | `react-native-sse` (`agent-stream.ts`) | Already handles POST body + header re-set on reconnect |
| Gated-set sync | Maintain the list in 3 files | One exported `GATED_ACTIONS` | Standing v1.2 rule already requires syncing two; make it one |

**Key insight:** the registry is the contract. The tool list, schemas, descriptions, and execution all derive from `loadActionsFromStaticRegistry(actionsRegistry)`. The phase's only genuinely new logic is *which subset* to expose and *proving* the gated subset is excluded.

## Runtime State Inventory

This is a feature-add phase, not a rename/migration — but the security-keystone framing warrants the equivalent "what could leak" sweep:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — admin chat history is client-only React state (member agent precedent); no new table | None. No migration. Verified: member agent persists nothing server-side. |
| Live service config | `RUNSTUDIO_OPERATOR_EMAILS` (exists, admin allowlist) and `RUNSTUDIO_TEACHER_EMAILS` (NEW env, referenced by `role-resolver.ts` but may be unset in prod) | Confirm `RUNSTUDIO_OPERATOR_EMAILS` is set on Vercel for HUSTLE; set `RUNSTUDIO_TEACHER_EMAILS` if teacher rejection is to be tested with a real teacher |
| OS-registered state | None | None |
| Secrets/env vars | `ANTHROPIC_API_KEY` (already required by the member endpoint; same key) | None new |
| Build artifacts | `.generated/actions-registry.ts` is gitignored + auto-generated; new actions (none planned) would need a dev/build restart | If any new action IS added, restart to regenerate registry (CV2-01 gotcha) |

**The canonical question for this phase:** after the allow-list ships, can the admin agent reach a gated verb by any path? Answer must be "no" via three layers: (1) verb not in `MOBILE_ADMIN_ALLOWLIST`, (2) `.filter(!GATED_ACTIONS.has)` strips it even if added, (3) the unit test fails if either breaks. Note the gated actions remain reachable *on web* via `propose-action → approve-proposal` — unchanged.

## Common Pitfalls

### Pitfall 1: Pure subtraction leaks upstream Mail + staff-only actions
**What goes wrong:** `tools = registry − GATED` exposes `send-email`, `archive-email`, `create-connect-account`, `import-leads`, etc. on a member's phone.
**Why:** the registry is the full forked-Mail-template surface, not the curated agent toolset. The web agent's tool *curation* lives only in the system prompt, not in a flag.
**Avoid:** explicit `MOBILE_ADMIN_ALLOWLIST`; never enumerate by exclusion alone.
**Warning sign:** the built tool list length is ~80 instead of ~15–30.

### Pitfall 2: Gating after the stream opens
**What goes wrong:** if `requireAdmin` runs inside the `ReadableStream.start`, the 200 + `text/event-stream` headers are already sent; a member sees an open stream that errors mid-flight instead of a clean 403.
**Why:** SSE responses commit status/headers on first byte.
**Avoid:** call `requireAdmin(request)` at the very top of `action()`, before `new Response(stream, …)` — exactly where the member route calls `requireMemberOrDemo`. The Nitro wrapper forwards thrown `Response` 403s.
**Warning sign:** test of a teacher token returns 200 with an `error` event instead of HTTP 403.

### Pitfall 3: h3 v2 session adapter shape
**What goes wrong:** `getSession` crashes with "Cannot read properties of undefined (reading 'headers')" if the event object lacks `req` (the web Request).
**Why:** installed core resolves h3 v2 (2.0.x-rc); `getHeader` dereferences `event.req`. Documented at `member-session.ts:29-44`.
**Avoid:** build the event as `{ req: request, headers: request.headers, url, path }` — both `req` and `headers`. Reuse the member adapter.

### Pitfall 4: `navigate` / `view-screen` don't map to mobile
**What goes wrong:** including them yields tools that try to drive web `/gymos/*` routes / read browser application_state that the Expo app doesn't have.
**Avoid:** exclude both from `MOBILE_ADMIN_ALLOWLIST`. If in-app navigation is wanted later, add a mobile-specific tool.

### Pitfall 5: Anthropic tool-loop turn limit / token spend
**What goes wrong:** unbounded `while` loops burn tokens; a stuck tool can loop.
**Avoid:** keep the member endpoint's `turn < 5` cap (admin flows may warrant 6–8 — decide at plan time). Keep `max_tokens` modest. Reuse prompt caching (`cache_control: ephemeral`) on system + admin-context blocks as the member route does.
**Note:** the mobile client `cancel()` on sheet close already aborts in-flight streams (`AgentSheet.tsx:119-122`).

### Pitfall 6: SSE on Vercel
**What goes wrong:** streaming responses behind serverless need the streaming Response handed through untouched.
**Why/avoid:** the existing `m/agent/stream.post.ts` already proves the Nitro `sendWebResponse(result)` pattern works for SSE on this Vercel deploy (staff-web is live). Copy it verbatim; don't buffer the body. Keep `Cache-Control: no-cache, no-transform`.

### Pitfall 7: Forgetting the four-area agent-native contract
**What goes wrong:** shipping the endpoint but not the AGENTS.md note or the app-state reflection.
**Avoid (four areas this phase MUST touch):**
- **UI:** `AdminAgentSheet` (or `AgentSheet` with a role/endpoint prop) + the role-gated entry point in the tabs.
- **Actions/endpoint:** the new SSE route + allow-list (no new `defineAction`s expected; if any are added, apply the **two-exposure rule** — action file + agent surface).
- **Skills/AGENTS.md:** add a section to `apps/staff-web/AGENTS.md` documenting the mobile admin allow-list + `GATED_ACTIONS` source-of-truth + the divergence (server-side LLM call, like the member agent).
- **Application state:** AI-01's "reflect in app state" = the `onToolResult → queryClient.invalidateQueries` pattern already in `AgentSheet.tsx:173-185` (invalidate the relevant admin caches). No `application_state` DB row needed.

### Pitfall 8: Client can't tell it's an admin
**What goes wrong:** role is resolved server-side only; the mobile client today has no `role` (only a session token in `session.ts`). It can't decide whether to render the admin agent entry.
**Avoid:** add a tiny `GET /api/m/whoami` (resolve session → `resolveRole(email)` → `{ role, firstName }`). Client shows the admin agent only when `role === 'admin'`. This is **UX gating only** — the SSE `requireAdmin` is the real security boundary (a member who forces the URL still gets 403). `whoami` is also reusable by MA2/MA3.

## Code Examples

### AI-02 unit test (vitest) — the keystone proof
```ts
// apps/staff-web/server/lib/mobile-admin-tools.test.ts
import { describe, it, expect } from "vitest";
import { GATED_ACTIONS } from "./gated-actions.js";
import { MOBILE_ADMIN_ALLOWLIST, buildAdminToolList } from "./mobile-admin-tools.js";
import actionsRegistry from "../../.generated/actions-registry.js";
import { loadActionsFromStaticRegistry } from "@agent-native/core/server";

const GATED = ["send-template-to-members","create-checkout-link","cancel-occurrence","reschedule-occurrence","publish-form"];

describe("mobile admin tool allow-list (AI-02)", () => {
  it("GATED_ACTIONS is exactly the five gated Tier-3 verbs", () => {
    expect([...GATED_ACTIONS].sort()).toEqual([...GATED].sort());
  });
  it("the allow-list itself contains no gated verb", () => {
    for (const g of GATED) expect(MOBILE_ADMIN_ALLOWLIST).not.toContain(g);
  });
  it("the BUILT tool list structurally excludes every gated verb", () => {
    const reg = loadActionsFromStaticRegistry(actionsRegistry as any);
    const names = buildAdminToolList(reg).map(t => t.name);
    for (const g of GATED) expect(names).not.toContain(g);
  });
});
```
Run with the existing `apps/staff-web/vitest.unit.config.ts`. (Note: vitest+ESM cannot import `@agent-native/core` CJS internals in some unit configs — see BD4-01 decision; if the registry import pulls that in, test against `MOBILE_ADMIN_ALLOWLIST` + a stubbed registry of just the names, which still proves AI-02.)

### Endpoint skeleton (mirror of member route)
```ts
// apps/staff-web/app/routes/api.m.admin.agent.stream.tsx
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "../../server/lib/admin-session.js";
import { runWithRequestContext, loadActionsFromStaticRegistry } from "@agent-native/core/server";
import actionsRegistry from "../../.generated/actions-registry.js";
import { buildAdminToolList } from "../../server/lib/mobile-admin-tools.js";
import type { ActionFunctionArgs } from "react-router";

const MODEL = "claude-sonnet-4-6";

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);                 // 401/403 BEFORE stream
  if (!process.env.ANTHROPIC_API_KEY) return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  const registry = loadActionsFromStaticRegistry(actionsRegistry as any);
  const tools = buildAdminToolList(registry);                // allow-list + GATED filter
  // ... parse messages (copy member route) ...
  return runWithRequestContext({ userEmail: admin.email }, async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const stream = new ReadableStream({ async start(controller) {
      // manual loop: client.messages.stream({ model: MODEL, tools, ... })
      // on tool_use: const result = await registry[toolUse.name].run(toolUse.input);
      // send 'tool_use' / 'tool_result' / 'delta' / 'done' / 'error' (same event names)
    }});
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
  });
}
```
Source patterns: `api.m.agent.stream.tsx` (loop, events, caching), `action-routes.ts:165` (runWithRequestContext usage), `member-session.ts` (session adapter).

### Mobile client reuse
```ts
// agent-stream.ts — add an endpoint param (default keeps member behaviour)
export async function streamAgent(messages, cb, endpoint = "/api/m/agent/stream") { /* …use ${API_BASE_URL}${endpoint}… */ }
// AdminAgentSheet → streamAgent(wire, cbs, "/api/m/admin/agent/stream")
```
`AgentSheet.tsx` is copy-or-parameterise: change header title + system-prompt-driven behaviour comes from the server; swap the cache keys invalidated in `onToolResult` to the admin-relevant ones.

## State of the Art

| Old approach | Current approach | Impact |
|--------------|------------------|--------|
| Member agent hand-writes `TOOLS` + `runTool` switch (`api.m.agent.stream.tsx`) | Admin agent derives tools + execution from the shared registry | Less duplication; new gym actions become admin-callable by adding to one allow-list |
| Gated set duplicated in `approve-proposal.ts` + `propose-action.ts` (synced by rule) | Single exported `GATED_ACTIONS` | Removes a drift class; makes the set testable from the mobile endpoint |
| Role resolved server-side, invisible to client | Add `GET /api/m/whoami` | Client can gate UX; reusable by MA2/MA3 |

**Not deprecated, but note:** the `delegate-to-agent` skill says "UI/server never call an LLM directly." The mobile agents are a **sanctioned exception** (separate Expo binary, no chat bridge). Document it; don't "fix" it.

## Environment Availability

| Dependency | Required by | Available | Notes |
|------------|-------------|-----------|-------|
| `ANTHROPIC_API_KEY` (Vercel env) | SSE tool loop | ✓ (member agent uses it) | Same key; no change |
| `RUNSTUDIO_OPERATOR_EMAILS` (Vercel env) | `requireAdmin` admin allow | ✓ (operator chrome already uses it) | Confirm set for HUSTLE; resolver has NO Patrick-fallback (intentional) |
| `RUNSTUDIO_TEACHER_EMAILS` (Vercel env) | teacher rejection test | ✗ likely unset | Optional; only needed to test a real teacher token → 403 |
| Vercel SSE streaming | endpoint delivery | ✓ proven | `m/agent/stream.post.ts` already live |
| `vitest` (`vitest.unit.config.ts`) | AI-02 test | ✓ | Existing config; mind the ESM/CJS caveat (BD4-01) |
| Real iPhone / EAS build | on-device UAT | ✗ gated | Same Apple-account gate as MA1/MA5; build can be verified server-side + simulator/Android meanwhile |

**Blocking:** none for build. **Gated:** on-device admin UAT shares the standing Apple/EAS gate (not required to land the endpoint + test).

## Open Questions

1. **Direct authoring verbs on mobile — how many?**
   - Known: Tier-1 reads + Tier-2 authoring are clearly in. The direct (non-gated) authoring verbs (`update-member`, `create-class-*`, `content-*`, `video-*`, schedule-rule verbs, `create/update-trainer`, `save-segment`) are *technically* non-gated and admin-safe.
   - Unclear: whether v1 admin-on-a-phone should mutate the catalog, or stay read+author-the-board for the demo.
   - Recommendation: start with reads + board authoring + member/schedule edits; defer content/video authoring to keep the surface tight. Decide in plan-time scoping; the allow-list makes it a one-line change.

2. **`whoami` vs. embedding role in the sign-in response.**
   - Recommendation: a small `GET /api/m/whoami` is cleaner and reusable than threading role through the Better-auth `set-auth-token` flow; the sign-in path (`sign-in-api.ts`) is deliberately minimal.

3. **Turn cap + max_tokens for admin flows.**
   - Member uses `turn < 5`, `max_tokens: 1024`. Admin analytics answers may need a couple more turns. Recommendation: `turn < 8`, keep `max_tokens` ~1024–1536; revisit if truncation appears.

## Sources

### Primary (HIGH — direct file reads in this repo, 2026-06-30)
- `apps/staff-web/app/routes/api.m.agent.stream.tsx` — member SSE loop, events, model constant, prompt caching
- `apps/staff-web/server/routes/api/m/agent/stream.post.ts` — Nitro SSE wrapper + thrown-Response forwarding
- `apps/staff-web/server/lib/member-session.ts` + `member-session-helpers.ts` — `getSession` h3-v2 adapter, claim flow, `Member` type
- `apps/staff-web/server/lib/role-resolver.ts` (+ `.test.ts`) — `resolveRole`, env allowlists, precedence
- `apps/staff-web/actions/approve-proposal.ts` + `propose-action.ts` — `ACTION_ALLOWLIST` / Zod enum (the gated set)
- `apps/staff-web/actions/list-fill-rate.ts`, `list-members.ts` — action shape, `guard:allow-unscoped`
- `apps/staff-web/server/plugins/agent-chat.ts` — web operator toolset + system prompt (mirror source)
- `apps/staff-web/.generated/actions-registry.ts` — full static registry (incl. `navigate`, `view-screen`, Mail actions)
- `packages/core/src/action.ts` — `defineAction`, Zod→JSON schema, `wrapWithValidation`
- `packages/core/src/server/action-discovery.ts` — `loadActionsFromStaticRegistry`, `ActionEntry` shape
- `packages/core/src/server/action-routes.ts` — `runWithRequestContext` usage pattern (`getOwnerFromEvent`/`resolveOrgId`)
- `packages/core/src/server/request-context.ts` — `runWithRequestContext` / `getRequestUserEmail` semantics
- `packages/mobile-app/lib/agent-stream.ts`, `components/AgentSheet.tsx`, `lib/session.ts`, `lib/sign-in-api.ts` — client SSE + Bearer + cache-invalidation
- `apps/staff-web/AGENTS.md` — Tier 1/2/3 model + two-exposure rule + gated-set definition
- `.planning/STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` — locked decisions, MA-wide discipline, AI-01..03 wording
- `.agents/skills/authentication/SKILL.md`, `delegate-to-agent/SKILL.md` — `getSession`, the LLM-delegation rule (and its sanctioned mobile exception)
- `.planning/config.json` — `nyquist_validation: false` (Validation Architecture section intentionally omitted)

### Secondary / Tertiary
- None required — every claim is verified against a primary repo file. No external/web sources needed for this phase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all libs read in-repo and in active use.
- Architecture (endpoint, allow-list, requireAdmin, runWithRequestContext): HIGH — every piece mirrors an existing, production-deployed pattern; the only new logic is the allow-list + test.
- Pitfalls: HIGH — drawn from in-repo gotchas (h3-v2 adapter, Nitro plugins, ESM/CJS vitest, SSE-on-Vercel) and direct code reading.
- Scoping of the direct-authoring allow-list: MEDIUM — a product/scope call, flagged as Open Question 1.

**Research date:** 2026-06-30
**Valid until:** ~2026-07-30 (stable; the only volatility is registry contents if new actions land — re-confirm the allow-list against `.generated/actions-registry.ts` at plan time).
