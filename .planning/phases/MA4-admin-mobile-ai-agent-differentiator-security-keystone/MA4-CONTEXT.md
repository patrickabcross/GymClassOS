# Phase MA4: Admin Mobile AI Agent — Context

**Gathered:** 2026-06-30
**Status:** Ready for planning
**Source:** User decision (locked) + MA4-RESEARCH.md

<domain>
## Phase Boundary

An admin opens an in-app AI ops chat (reusing the existing `AgentSheet` shell + RN SSE client) that drives the studio in natural language. The mobile admin agent exposes ONLY a server-side allow-list of NON-MUTATING verbs; the five gated Tier-3 verbs (and in fact ALL mutations) are absent from the tool list, enforced server-side and proven by a unit test. The SSE endpoint is locked to authenticated admins — a member or teacher token is rejected (403) before the stream opens.
</domain>

<decisions>
## Implementation Decisions

### Scope of the mobile admin agent (v1) — LOCKED: "Read + dashboard only"
- The mobile admin agent's allow-list is **read + board-authoring only — NO data mutation from the phone.**
- **INCLUDE — Tier 1 reads:** `list-fill-rate`, `list-renewals`, `list-revenue`, `list-payments`, `list-at-risk-members`, `list-inbox-summary`, `list-classes`, `list-members`, `list-trainers`.
- **INCLUDE — Tier 2 board authoring:** `upsert-section-note`, `create-task`, `complete-task` (these write to `dashboard_notes` / `dashboard_tasks`).
- **EXCLUDE — all mutating ops verbs** (create/update class definitions & occurrences, schedule rules, trainers, `update-member`, `set-occurrence-capacity`, `mark-occurrence-complete`, content/video/forms authoring, Stripe connect, import-leads, etc.). Even though they are not in the gated-5, the v1 phone agent does not mutate studio data.
- **EXCLUDE — the 5 gated Tier-3 verbs** (`send-template-to-members`, `create-checkout-link`, `cancel-occurrence`, `reschedule-occurrence`, `publish-form`) — no mobile approval UI exists.
- **EXCLUDE — web-only UI tools** `navigate` and `view-screen` (no mobile equivalent; per research).
- The `MOBILE_ADMIN_ALLOWLIST` is an **explicit list**, NOT `ALL − GATED` (the static registry has ~80 actions incl. upstream Mail + staff-only verbs that subtraction would leak). A defensive `.filter(t => !GATED_ACTIONS.has(t))` runs on top (belt-and-suspenders).

### Allow-list mechanism (security keystone)
- Extract the five gated verbs into ONE exported `GATED_ACTIONS` constant (single source of truth), re-imported by both `approve-proposal.ts` (`ACTION_ALLOWLIST`) and `propose-action.ts` (Zod enum) so they can never drift.
- Unit test (vitest) MUST assert: (a) every gated verb is ABSENT from the mobile admin tool list, and (b) — given the "read + dashboard only" scope — the exposed set contains no mutating verb. Mind the BD4-01 ESM/CJS vitest caveat (extract pure helpers to `*-helpers.ts` if `@agent-native/core` import breaks under vitest).

### Auth gate (AI-03)
- New `requireAdmin(request)` helper mirroring `member-session.ts`'s h3-v2 session adapter + `resolveRole()` (`RUNSTUDIO_OPERATOR_EMAILS`). Returns 403 for teacher/member. Called at the TOP of the action so the 403 fires BEFORE the SSE stream opens. The Nitro wrapper already forwards thrown `Response` 403s.

### Endpoint shape
- NEW route `api.m.admin.agent.stream.tsx` + matching Nitro wrapper under `apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts` (do NOT branch the member coach endpoint on role — keeps the 403 ahead of the stream and the tool sets cleanly separate).
- Tool loop runs under `runWithRequestContext({ userEmail: admin.email })` (real `@agent-native/core/server` export). Execute tools via `registry[name].run(input)` with `entry.tool.parameters` as `input_schema`.

### Client role-gating
- Add `GET /api/m/whoami` (role is server-only today) so the mobile client knows its role and shows the admin agent entry point only for `role=admin`. (Resolution of Open Question 2 — whoami over embedding role in sign-in response.)
- Reuse the existing `AgentSheet` + `lib/agent-stream.ts`, pointed at the admin endpoint with an admin system prompt. Minimal client change.

### Turn cap (Open Question 3)
- Admin analytics flows: turn cap `< 8` (vs the member coach's 5), `max_tokens` 1024.

### Four-area agent-native contract (this phase must touch)
- **UI:** admin `AgentSheet` entry gated by `whoami` role.
- **Actions/endpoint:** `api.m.admin.agent.stream.tsx` + `whoami` + `requireAdmin` + `GATED_ACTIONS` extraction + `MOBILE_ADMIN_ALLOWLIST`.
- **Skills/instructions:** document the mobile admin agent + allow-list in `apps/staff-web/AGENTS.md` (and note `RUNSTUDIO_OPERATOR_EMAILS` drives admin role).
- **Application state:** tool results invalidate the relevant react-query caches so results reflect in app state.

### Claude's Discretion
- Exact admin system-prompt wording; precise file/module names for the allow-list + helpers; how `whoami` shapes its response payload; test file location.
</decisions>

<specifics>
## Specific Ideas

- Mirror the member SSE endpoint structure (`apps/staff-web/app/routes/api.m.agent.stream.tsx`) for the manual tool loop + `event: delta|tool_use|tool_result|done|error`.
- Chat history stays client-only (member-agent precedent) — NO new table, NO migration.
</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-RESEARCH.md` — full findings, file paths, code patterns
- `apps/staff-web/app/routes/api.m.agent.stream.tsx` — member SSE precedent to mirror
- `apps/staff-web/actions/approve-proposal.ts` + `apps/staff-web/actions/propose-action.ts` — current home of the gated-verb list (extract `GATED_ACTIONS` from here)
- `apps/staff-web/server/lib/role-resolver.ts` + `apps/staff-web/server/lib/member-session.ts` — role + session adapter to mirror for `requireAdmin`
- `apps/staff-web/AGENTS.md` — operator action catalog + Tier model
- `packages/mobile-app/components/AgentSheet.tsx` + `packages/mobile-app/lib/agent-stream.ts` — client to reuse
</canonical_refs>

<deferred>
## Deferred Ideas

- Direct-authoring / mutating verbs on the phone agent (catalog/member/schedule mutations) — deferred to a later milestone; v1 is read + dashboard only.
- A mobile approval UI for the gated Tier-3 verbs — out of scope (the gated verbs stay web-only).
</deferred>

---

*Phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone*
*Context gathered: 2026-06-30 (user decision + research)*
