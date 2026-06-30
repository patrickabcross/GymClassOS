---
phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone
plan: 02
subsystem: mobile-admin-agent
tags: [sse, auth-gate, requireAdmin, whoami, runWithRequestContext, allow-list]

# Dependency graph
requires:
  - phase: MA4-01 (security keystone)
    provides: "MOBILE_ADMIN_ALLOWLIST + buildAdminToolList (mobile-admin-tools.ts) + GATED_ACTIONS (gated-actions.ts)"
  - phase: MA1 (auth spine)
    provides: "Better-auth getSession + the h3-v2 session adapter (member-session.ts) + resolveRole (role-resolver.ts)"
provides:
  - "requireAdmin(request) — 401/403 gate that fires BEFORE the SSE stream opens (AI-03)"
  - "resolveRequestRole(request) — non-throwing role resolver reused by whoami"
  - "GET /api/m/whoami — role-discovery surface for the mobile client (enables AI-01 client gating)"
  - "POST /api/m/admin/agent/stream — admin SSE tool loop over the filtered allow-list under runWithRequestContext"
affects: [MA4-03 (client AgentSheet gated by whoami, pointed at the admin endpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate route (NOT a role-branch on the member endpoint) keeps the 403 surface and the tool set structurally independent and independently testable"
    - "Gate-before-stream: requireAdmin throws a Response at the top of action(); the Nitro wrapper's catch forwards it as a clean HTTP status before any ReadableStream is constructed"
    - "Tool loop executes via registry[name].run (already Zod-wrapped — no re-validation) wrapped in runWithRequestContext({ userEmail }) for per-call admin identity"
    - "h3-v2 session adapter ({req,headers,url,path}) replicated, not branched, from member-session.ts"

key-files:
  created:
    - apps/staff-web/server/lib/admin-session.ts
    - apps/staff-web/app/routes/api.m.whoami.tsx
    - apps/staff-web/server/routes/api/m/whoami.get.ts
    - apps/staff-web/app/routes/api.m.admin.agent.stream.tsx
    - apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts
  modified: []

key-decisions:
  - "requireAdmin replicates member-session.ts's h3-v2 adapter rather than importing it — member-session.ts carries member-claim logic (x-claim-phone, gym_members upsert) that has no place in an admin gate"
  - "whoami does NOT 403 non-admins — it is the role-discovery surface for ALL signed-in users (401 only if unauthenticated); the admin SSE endpoint is the security boundary"
  - "Admin route builds tools from the live static registry via loadActionsFromStaticRegistry + buildAdminToolList(registry) — the allow-list + defensive GATED_ACTIONS filter from MA4-01 are the only tool gate"
  - "System prompt states plainly the phone agent can READ + author the noticeboard but CANNOT send messages, take payments, mutate the schedule/catalog/members, or publish forms (those stay web + approval)"
  - "No DB migration — admin chat history is client-only (member-agent precedent)"

patterns-established:
  - "Pattern: gate-before-stream for any SSE endpoint that must reject by role — throw a Response at the top of action(); the Nitro sendWebResponse wrapper forwards it"
  - "Pattern: deeper Nitro wrapper depth math — admin route is one dir deeper than the member coach wrapper (6 ../ to app/routes, vs 5 for member)"

requirements-completed: [AI-01, AI-03]

# Metrics
duration: 3min
completed: 2026-06-30
---

# Phase MA4 Plan 02: Admin Mobile AI Agent — SSE Endpoint + Auth Gate Summary

**A dedicated `POST /api/m/admin/agent/stream` that 403s any member/teacher token BEFORE the SSE stream opens (AI-03), then runs a manual Anthropic tool loop over ONLY the MA4-01 filtered allow-list — every tool call under `runWithRequestContext({ userEmail: admin.email })` — plus a `GET /api/m/whoami` role surface for client gating (AI-01).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-30T20:03:10Z
- **Completed:** 2026-06-30T20:06:02Z
- **Tasks:** 2
- **Files modified:** 5 (all created)

## Accomplishments
- Built `admin-session.ts`: `requireAdmin(request)` (throws 401 no-session / 403 not-admin) and the non-throwing `resolveRequestRole(request)`, both using the proven h3-v2 session adapter (`{req,headers,url,path}`) replicated from `member-session.ts` + `resolveRole` (`RUNSTUDIO_OPERATOR_EMAILS`). The throw fires at the top of the action so it lands BEFORE the stream opens.
- Added `GET /api/m/whoami` (loader + Nitro GET wrapper) returning `{role}` for any signed-in caller (401 if none) — the role-discovery surface MA4-03 consumes to show the admin agent entry point only for `role=admin`.
- Built the admin SSE route `api.m.admin.agent.stream.tsx`: gates on `requireAdmin` first, builds tools from the live registry via `loadActionsFromStaticRegistry` + `buildAdminToolList`, runs the manual loop (`claude-sonnet-4-6`, `turn < 8`, `max_tokens 1024`) executing `registry[name].run(input)` (no re-validation; unknown-tool guarded) under `runWithRequestContext({ userEmail: admin.email })`, emitting the standard `delta|tool_use|tool_result|done|error` events with `cache_control: ephemeral` on the system block.
- Added the Nitro SSE wrapper (`stream.post.ts`, 6 `../` to `app/routes`) forwarding both the streaming body (`sendWebResponse(result)`) and thrown 401/403 Responses (`sendWebResponse(err)`).

## Task Commits

Each task was committed atomically:

1. **Task 1: requireAdmin helper + whoami role-discovery route** - `c7d8476f` (feat)
2. **Task 2: Admin SSE endpoint (manual tool loop over the filtered allow-list, under runWithRequestContext)** - `ff033fcb` (feat)

**Plan metadata:** (final docs commit — see git)

## Files Created/Modified
- `apps/staff-web/server/lib/admin-session.ts` (new) — `requireAdmin` (401/403) + `resolveRequestRole`; h3-v2 adapter + `resolveRole`.
- `apps/staff-web/app/routes/api.m.whoami.tsx` (new) — loader returning `{role}` for any signed-in caller.
- `apps/staff-web/server/routes/api/m/whoami.get.ts` (new) — Nitro GET wrapper (4 `../`), forwards thrown Response status.
- `apps/staff-web/app/routes/api.m.admin.agent.stream.tsx` (new) — admin SSE tool-loop endpoint; gate-before-stream + allow-list tools + `runWithRequestContext`.
- `apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts` (new) — Nitro SSE wrapper (6 `../`), forwards stream AND thrown 403.

## Verification Results
- **tsc:** `npx tsc --noEmit` clean for all five touched files (grep for `admin-session`, `whoami`, `admin.agent.stream` in tsc output returned no errors).
- **Gate-before-stream (AI-03):** in `api.m.admin.agent.stream.tsx`, `requireAdmin(request)` is at line 52; `new ReadableStream` is at line 86 — the 403 throw precedes stream construction. Confirmed by grep.
- **No member-only logic copied:** grep for `x-claim-phone|requireMember` in the admin route → none.
- **No DB migration:** `git diff HEAD~2` touched no `migration`/`schema.ts`/`runMigrations` files and contained no `CREATE/ALTER/DROP TABLE` SQL.
- **MA4-01 keystone unit test still green:** `npx vitest run --config vitest.unit.config.ts server/lib/mobile-admin-tools.test.ts` → 1 file / 5 tests passed (446ms) — the allow-list contract MA4-02 consumes is intact.
- **Prettier:** run on all 5 files (all reported unchanged — already conformant).

## Decisions Made
- Replicated (not imported) the h3-v2 session adapter so the admin gate carries none of member-session's claim-by-email machinery.
- `whoami` is a role-discovery surface for all signed-in users (no 403), keeping the SSE endpoint as the sole security boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None. The endpoint executes live registry actions; no hardcoded/placeholder data. (The client UI half — AgentSheet gated by whoami, pointed at the admin endpoint — is MA4-03 by design, not a stub in this plan's scope.)

## User Setup Required
None for this plan — TypeScript-only, no DB migration. (Runtime needs `ANTHROPIC_API_KEY` — already configured — and `RUNSTUDIO_OPERATOR_EMAILS` to designate admins; both are existing env concerns, not new to MA4-02.)

## Next Phase Readiness
- AI-03 (auth gate) and the AI-01 server half are complete. `GET /api/m/whoami` and `POST /api/m/admin/agent/stream` are ready for MA4-03 to wire the mobile `AgentSheet` (entry gated by `whoami` role, `agent-stream.ts` pointed at the admin endpoint).
- No blockers.

## Self-Check: PASSED

All five created files present on disk; both task commits (`c7d8476f`, `ff033fcb`) exist in git history.

---
*Phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone*
*Completed: 2026-06-30*
