---
phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone
verified: 2026-06-30T21:20:00Z
status: human_needed
score: 11/11 must-haves verified (automated); 1 item device-gated (human)
human_verification:
  - test: "On a real iPhone, sign in as an admin (email in RUNSTUDIO_OPERATOR_EMAILS) and open the in-app agent sheet"
    expected: "Sheet title reads 'RunStudio Ops'; chat streams from /api/m/admin/agent/stream; admin can ask analytics questions (fill rate, revenue, at-risk members) and author noticeboard notes/tasks in natural language; results reflect in app state"
    why_human: "Mobile UI runtime is EAS/Apple-gated (no Expo Go on SDK 55; needs EAS dev build + physical iPhone). Same blocker as MA1-03. Code path is tsc-clean and fully wired."
  - test: "On a real iPhone, sign in as a member or teacher and open the agent sheet"
    expected: "Sheet keeps member-coach behaviour (title 'Agent — GymClassOS Coach', member endpoint); admin ops surface is not shown; if the admin URL is forced it 403s server-side"
    why_human: "Device-gated mobile UI; role-gating behaviour observable only on a running build."
---

# Phase MA4: Admin Mobile AI Agent (Differentiator + Security Keystone) Verification Report

**Phase Goal:** An admin opens an in-app AI ops chat that drives the studio in natural language — calling non-gated platform actions and reflecting results in app state — while the gated Tier-3 verbs that have no mobile approval UI are structurally filtered out and proven absent by test, and the whole surface is locked to authenticated admins.

**Verified:** 2026-06-30T21:20:00Z
**Status:** human_needed (all automated/server-side checks PASS; only on-device iOS UI confirmation remains, and it is EAS/Apple-gated — not a gap)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | The five gated Tier-3 verbs live in exactly one exported constant, imported by both approve-proposal.ts and propose-action.ts | ✓ VERIFIED | `gated-actions.ts` exports `GATED_ACTION_LIST` + `GATED_ACTIONS`; `approve-proposal.ts:5` imports it (`const ACTION_ALLOWLIST = GATED_ACTION_LIST`); `propose-action.ts:5` imports it and uses `.enum(GATED_ACTION_LIST)` (lines 20-21) |
| 2  | The mobile admin tool list is built from an explicit 12-verb allow-list (read + dashboard), never ALL−GATED subtraction | ✓ VERIFIED | `mobile-admin-tools.ts` `MOBILE_ADMIN_ALLOWLIST` = 9 Tier-1 reads + 3 Tier-2 authoring verbs, hand-listed |
| 3  | Even a gated verb wrongly added to the allow-list is structurally excluded (defensive filter) | ✓ VERIFIED | `buildAdminToolList` runs `.filter((name) => !GATED_ACTIONS.has(name))`; unit test "defensive filter strips a polluted allow-list" passes |
| 4  | A unit test fails if any gated OR mutating verb appears in the built tool list | ✓ VERIFIED | `mobile-admin-tools.test.ts` 5/5 green (asserts GATED + 18-verb MUTATING set absent from allow-list and built list) |
| 5  | A teacher/member token hitting POST /api/m/admin/agent/stream gets 403 BEFORE any SSE stream opens | ✓ VERIFIED | `requireAdmin(request)` at `api.m.admin.agent.stream.tsx:52`; `new ReadableStream` at line 86 — gate precedes stream; throws `Response(403)` |
| 6  | An admin token can drive the non-gated allow-list verbs in natural language over SSE | ✓ VERIFIED | Manual Anthropic tool loop (`claude-sonnet-4-6`, `turn < 8`) over `buildAdminToolList(registry)`, executing `entry.run(input)`; emits delta/tool_use/tool_result/done/error |
| 7  | Every tool call executes under runWithRequestContext with the admin's email | ✓ VERIFIED | Whole stream wrapped in `runWithRequestContext({ userEmail: admin.email }, ...)` at line 84 |
| 8  | GET /api/m/whoami returns the caller's resolved role | ✓ VERIFIED | `api.m.whoami.tsx` loader returns `{role}` (401 if no session); Nitro GET wrapper `whoami.get.ts` forwards status |
| 9  | Admin's in-app agent points at the admin endpoint with an admin title; member/teacher keeps member-coach behaviour | ✓ VERIFIED | `_layout.tsx:80-89,128-135`: `fetchRole().then(setRole)`, `isAdmin`, endpoint/title ternary ('RunStudio Ops' vs 'Agent — GymClassOS Coach') |
| 10 | Tool results invalidate react-query caches so results reflect in app state | ✓ VERIFIED | `AgentSheet.tsx:192-194` invalidates schedule/food-entries/profile in `onToolResult` |
| 11 | The mobile admin agent + allow-list + server-side-LLM divergence documented in apps/staff-web/AGENTS.md | ✓ VERIFIED | AGENTS.md "Mobile Admin Agent (read + dashboard only)" section: endpoint, requireAdmin gate, explicit allow-list + defensive filter, single gated source, unit-test proof, sanctioned server-side divergence |

**Score:** 11/11 truths verified by automated/static means. Truths 9-10 are additionally device-gated for on-device UI confirmation (human).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/staff-web/server/lib/gated-actions.ts` | Single GATED source | ✓ VERIFIED | Pure, zero-import; `GATED_ACTION_LIST` (5 verbs) + `GATED_ACTIONS` Set |
| `apps/staff-web/server/lib/mobile-admin-tools.ts` | Allow-list + builder | ✓ VERIFIED | `MOBILE_ADMIN_ALLOWLIST` (12) + `buildAdminToolList` w/ defensive `GATED_ACTIONS.has` filter; only import is `./gated-actions.js` |
| `apps/staff-web/server/lib/mobile-admin-tools.test.ts` | AI-02 proof | ✓ VERIFIED | 5/5 assertions green under vitest.unit.config.ts; stub registry, no @agent-native/core import |
| `apps/staff-web/server/lib/admin-session.ts` | requireAdmin + resolveRequestRole | ✓ VERIFIED | h3-v2 adapter (`req,headers,url,path`); 401/403 throws |
| `apps/staff-web/app/routes/api.m.admin.agent.stream.tsx` | Admin SSE tool loop | ✓ VERIFIED | gate-before-stream, allow-list tools, runWithRequestContext |
| `apps/staff-web/server/routes/api/m/admin/agent/stream.post.ts` | Nitro SSE wrapper | ✓ VERIFIED | `sendWebResponse(result)` for stream; `sendWebResponse(err)` for thrown 401/403 |
| `apps/staff-web/app/routes/api.m.whoami.tsx` + `server/routes/api/m/whoami.get.ts` | Role discovery | ✓ VERIFIED | Loader returns `{role}`; Nitro wrapper forwards status |
| `packages/mobile-app/lib/whoami.ts` | fetchRole() | ✓ VERIFIED | GET /api/m/whoami with Bearer → AppRole |
| `packages/mobile-app/lib/agent-stream.ts` | endpoint param | ✓ VERIFIED | `streamAgent(messages, cb, endpoint="/api/m/agent/stream")`; URL `${API_BASE_URL}${endpoint}` |
| `packages/mobile-app/components/AgentSheet.tsx` | endpoint+title props | ✓ VERIFIED | `Props` extended; passes `endpoint` to streamAgent; title in header + welcome |
| `packages/mobile-app/app/_layout.tsx` | role-gated entry | ✓ VERIFIED | fetchRole → isAdmin → admin endpoint + 'RunStudio Ops' title |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| approve-proposal.ts | gated-actions.ts | import GATED_ACTION_LIST | ✓ WIRED |
| propose-action.ts | gated-actions.ts | `.enum(GATED_ACTION_LIST)` | ✓ WIRED |
| mobile-admin-tools.ts | gated-actions.ts | `GATED_ACTIONS.has` filter | ✓ WIRED |
| api.m.admin.agent.stream.tsx | admin-session.ts | requireAdmin at top of action() | ✓ WIRED (line 52, before stream at 86) |
| api.m.admin.agent.stream.tsx | mobile-admin-tools.ts | buildAdminToolList(registry) | ✓ WIRED |
| api.m.admin.agent.stream.tsx | @agent-native/core/server | runWithRequestContext | ✓ WIRED |
| stream.post.ts | api.m.admin.agent.stream.tsx | import action, sendWebResponse | ✓ WIRED |
| _layout.tsx | whoami.ts | fetchRole() gates entry | ✓ WIRED |
| AgentSheet.tsx | agent-stream.ts | streamAgent(msgs, cb, endpoint) | ✓ WIRED |
| whoami.ts | api.m.whoami.tsx | GET /api/m/whoami | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| AI-02 keystone unit test | `npx vitest run --config vitest.unit.config.ts server/lib/mobile-admin-tools.test.ts` | 1 file / 5 tests passed (498ms) | ✓ PASS |
| tsc on MA4-touched staff-web files | `npx tsc --noEmit` (grep touched files) | No errors in any MA4 file | ✓ PASS |
| No DB migration introduced | git show --stat across 6 MA4 commits | No migration/schema/.sql files touched | ✓ PASS |
| Admin SSE running end-to-end on device | (requires EAS build + iPhone) | — | ? SKIP (device-gated) |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| AI-01 (admin in-app AI ops chat, non-gated actions, reflect in app state) | MA4-02, MA4-03 | ✓ SATISFIED (code); on-device confirmation human-gated | Admin SSE endpoint + tool loop + client role-gating + cache invalidation |
| AI-02 (gated Tier-3 verbs structurally filtered out, proven by test) | MA4-01 | ✓ SATISFIED | Single GATED source + explicit allow-list + defensive filter + 5/5 unit test |
| AI-03 (surface locked to authenticated admins, 403 before stream) | MA4-02 | ✓ SATISFIED | requireAdmin throws 401/403 before ReadableStream; Nitro wrapper forwards; runWithRequestContext carries admin identity |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder in the MA4 files. No hollow returns — the SSE endpoint executes live registry actions; the client wires live whoami + admin endpoints. Role defaults to `null` until fetchRole resolves (intended fail-closed-to-member default, not a stub).

### Human Verification Required

1. **Admin sees RunStudio Ops agent on device** — sign in as admin on a real iPhone (EAS dev build), open the agent sheet, confirm title 'RunStudio Ops', streaming from the admin endpoint, and that analytics/noticeboard verbs work in natural language. EAS/Apple-gated (same blocker as MA1-03).
2. **Member/teacher does not see admin surface** — confirm member-coach behaviour persists and a forced admin URL 403s. Device-gated.

### Gaps Summary

No gaps. Every must-have is verified statically and the AI-02 keystone is proven by a green unit test; AI-03's gate-before-stream and AI-01's server tool loop are confirmed in source; the mobile client role-gating reuses the single SSE client. No DB migration was introduced. tsc is clean for all touched files. The only outstanding item is on-device iOS confirmation of the mobile UI, which is EAS/Apple-gated and explicitly recorded (not blocked) per the MA1-03 device-UAT pattern.

---

_Verified: 2026-06-30T21:20:00Z_
_Verifier: Claude (gsd-verifier)_
