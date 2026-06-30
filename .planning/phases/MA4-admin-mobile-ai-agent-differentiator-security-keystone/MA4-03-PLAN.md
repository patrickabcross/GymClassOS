---
phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - packages/mobile-app/lib/whoami.ts
  - packages/mobile-app/lib/agent-stream.ts
  - packages/mobile-app/components/AgentSheet.tsx
  - packages/mobile-app/app/_layout.tsx
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [AI-01]
must_haves:
  truths:
    - "When the signed-in user resolves to role=admin, the in-app agent chat points at the admin endpoint with an admin title"
    - "When the user is a member/teacher, the agent chat keeps its existing member-coach behaviour (member endpoint)"
    - "Tool results invalidate react-query caches so results reflect in app state"
    - "The mobile admin agent + allow-list + the server-side-LLM divergence are documented in apps/staff-web/AGENTS.md"
  artifacts:
    - path: "packages/mobile-app/lib/whoami.ts"
      provides: "fetchRole() — GET /api/m/whoami with Bearer → role"
      contains: "whoami"
    - path: "packages/mobile-app/lib/agent-stream.ts"
      provides: "streamAgent with an endpoint param (default member)"
      contains: "endpoint"
    - path: "packages/mobile-app/components/AgentSheet.tsx"
      provides: "AgentSheet accepting endpoint + title props"
      contains: "endpoint"
    - path: "apps/staff-web/AGENTS.md"
      provides: "Mobile admin agent documentation section"
      contains: "Mobile Admin Agent"
  key_links:
    - from: "packages/mobile-app/app/_layout.tsx"
      to: "packages/mobile-app/lib/whoami.ts"
      via: "fetchRole() decides admin vs member entry"
      pattern: "whoami|fetchRole"
    - from: "packages/mobile-app/components/AgentSheet.tsx"
      to: "packages/mobile-app/lib/agent-stream.ts"
      via: "streamAgent(messages, cb, endpoint)"
      pattern: "streamAgent"
    - from: "packages/mobile-app/lib/whoami.ts"
      to: "apps/staff-web/app/routes/api.m.whoami.tsx"
      via: "GET /api/m/whoami"
      pattern: "/api/m/whoami"
---

<objective>
Wire the mobile client to the admin agent (AI-01) and complete the four-area agent-native contract. The client resolves its role via `GET /api/m/whoami`; when `role==='admin'` the existing `AgentSheet` is pointed at the admin SSE endpoint with an admin title; otherwise it keeps its member-coach behaviour. Tool results invalidate react-query caches (reflect in app state). Finally, document the mobile admin agent + allow-list + the sanctioned server-side-LLM divergence in `apps/staff-web/AGENTS.md`.

Purpose: This makes the differentiator real for the admin on a phone, with a minimal client change (reuse, not rebuild), and records the new surface so future agents respect the allow-list boundary.

Output: 1 new client lib (whoami), 2 small client edits (agent-stream endpoint param, AgentSheet props), 1 _layout role-gated entry, 1 AGENTS.md section. No new mobile screens.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-CONTEXT.md
@packages/mobile-app/lib/agent-stream.ts
@packages/mobile-app/components/AgentSheet.tsx
@packages/mobile-app/app/_layout.tsx
@packages/mobile-app/lib/session.ts

<interfaces>
From packages/mobile-app/lib/session.ts:
```ts
export const SESSION_TOKEN_KEY = "session_token";
export async function getSessionToken(): Promise<string | null>;
```
From packages/mobile-app/lib/api.ts:
```ts
export const API_BASE_URL: string; // base for /api/m/* calls
```
Current streamAgent signature (packages/mobile-app/lib/agent-stream.ts) — add a 3rd param:
```ts
export async function streamAgent(messages, cb: StreamCallbacks): Promise<() => void>;
// hardcodes `${API_BASE_URL}/api/m/agent/stream`
```
Current AgentSheet (packages/mobile-app/components/AgentSheet.tsx):
```ts
type Props = { onClose: () => void };
// hardcoded header "Agent — GymClassOS Coach"; calls streamAgent(wireMessages, {...})
```
Server route added in MA4-02: GET /api/m/whoami → { role: "admin" | "teacher" | "member" } (401 if no session)
Server route added in MA4-02: POST /api/m/admin/agent/stream (admin-only SSE)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: whoami client lib + endpoint param + AgentSheet props + role-gated entry</name>
  <read_first>
    - packages/mobile-app/lib/agent-stream.ts (the file being modified — add an endpoint param without breaking the member default; note Bearer header handling)
    - packages/mobile-app/components/AgentSheet.tsx (the file being modified — add endpoint+title props; note streamAgent call at line ~153 and the onToolResult invalidation at lines 173-185)
    - packages/mobile-app/app/_layout.tsx (the file being modified — AgentFabAndSheet at lines 76-123 is where the sheet mounts)
    - packages/mobile-app/lib/session.ts (getSessionToken + SESSION_TOKEN_KEY)
    - packages/mobile-app/lib/api.ts (API_BASE_URL)
  </read_first>
  <files>packages/mobile-app/lib/whoami.ts (new), packages/mobile-app/lib/agent-stream.ts (edit), packages/mobile-app/components/AgentSheet.tsx (edit), packages/mobile-app/app/_layout.tsx (edit)</files>
  <action>
1. Create `packages/mobile-app/lib/whoami.ts`:
```ts
// Role discovery for client-side UX gating (MA4 AI-01). The real security
// boundary is the server requireAdmin on /api/m/admin/agent/stream — this only
// decides which agent entry to show. A member who forces the admin URL still 403s.
import { getSessionToken } from "./session";
import { API_BASE_URL } from "./api";

export type AppRole = "admin" | "teacher" | "member";

export async function fetchRole(): Promise<AppRole | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/m/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { role?: AppRole };
    return json.role ?? null;
  } catch {
    return null;
  }
}
```
2. Edit `packages/mobile-app/lib/agent-stream.ts`: add a 3rd param `endpoint: string = "/api/m/agent/stream"` to `streamAgent(messages, cb, endpoint)` and use `` `${API_BASE_URL}${endpoint}` `` in the `new EventSource(...)` URL. Default keeps member behaviour identical. Do not touch the Bearer/header logic.
3. Edit `packages/mobile-app/components/AgentSheet.tsx`:
   - Extend Props: `type Props = { onClose: () => void; endpoint?: string; title?: string };` Default `endpoint = "/api/m/agent/stream"`, `title = "Agent — GymClassOS Coach"`.
   - Use `title` in the header `<Text style={styles.headerTitle}>` and in the initial system-welcome message text.
   - Pass `endpoint` as the 3rd arg to `streamAgent(wireMessages, {...}, endpoint)`.
   - Leave the existing `onToolResult` cache invalidation (schedule / food-entries / profile) in place — it is harmless for admin (keys may not exist) and satisfies AI-01's "reflect in app state" via the invalidation pattern.
4. Edit `packages/mobile-app/app/_layout.tsx` `AgentFabAndSheet`:
   - Add `const [role, setRole] = useState<AppRole | null>(null);` and a `useEffect(() => { fetchRole().then(setRole); }, []);` (import `fetchRole`, `AppRole` from `../lib/whoami`).
   - Compute `const isAdmin = role === "admin";`
   - When rendering `<AgentSheet ... />`, pass `endpoint={isAdmin ? "/api/m/admin/agent/stream" : "/api/m/agent/stream"}` and `title={isAdmin ? "RunStudio Ops" : "Agent — GymClassOS Coach"}`.
   - (Keep the single FAB; the change is purely which endpoint/title the sheet uses based on role. Do NOT add new tabs or screens — out of scope.)
  </action>
  <verify>
    <automated>cd packages/mobile-app && npx tsc --noEmit 2>&1 | grep -E "whoami|agent-stream|AgentSheet|_layout" || echo "TSC CLEAN for touched files"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export async function fetchRole" packages/mobile-app/lib/whoami.ts`
    - `grep -q "/api/m/whoami" packages/mobile-app/lib/whoami.ts`
    - `grep -q "endpoint" packages/mobile-app/lib/agent-stream.ts` (param added)
    - `grep -q "\${API_BASE_URL}\${endpoint}" packages/mobile-app/lib/agent-stream.ts` (URL uses the param)
    - `grep -q "endpoint?: string" packages/mobile-app/components/AgentSheet.tsx` (prop added)
    - `grep -q "/api/m/admin/agent/stream" packages/mobile-app/app/_layout.tsx` (admin endpoint wired when admin)
    - `grep -q "fetchRole" packages/mobile-app/app/_layout.tsx` (role resolved client-side)
    - `grep -q "invalidateQueries" packages/mobile-app/components/AgentSheet.tsx` (app-state reflection retained)
  </acceptance_criteria>
  <done>The client resolves role via whoami; an admin's agent sheet streams from /api/m/admin/agent/stream with an admin title; members keep the existing coach endpoint; tool results still invalidate caches; tsc clean for touched files.</done>
</task>

<task type="auto">
  <name>Task 2: Document the mobile admin agent + allow-list in apps/staff-web/AGENTS.md</name>
  <read_first>
    - apps/staff-web/AGENTS.md (the file being modified — see the "Two-exposure rule" notes and the Tier model; add the new section in the same documentary style)
    - apps/staff-web/server/lib/mobile-admin-tools.ts (the locked 12-verb allow-list to document)
    - apps/staff-web/server/lib/gated-actions.ts (the single gated source of truth to reference)
  </read_first>
  <files>apps/staff-web/AGENTS.md (edit)</files>
  <action>
Add a new top-level section to `apps/staff-web/AGENTS.md` titled `## Mobile Admin Agent (read + dashboard only)` that documents:
1. The endpoint `POST /api/m/admin/agent/stream` (app/routes/api.m.admin.agent.stream.tsx + Nitro wrapper) is admin-only via `requireAdmin` (RUNSTUDIO_OPERATOR_EMAILS), gated with a 403 BEFORE the SSE stream opens; teachers and members are rejected.
2. The tool surface is the explicit `MOBILE_ADMIN_ALLOWLIST` (12 verbs: the nine Tier-1 reads + upsert-section-note / create-task / complete-task) built by `buildAdminToolList` in `server/lib/mobile-admin-tools.ts`. It is an explicit allow-list, NOT ALL−GATED subtraction, with a defensive `.filter(!GATED_ACTIONS.has)` on top. v1 is READ + DASHBOARD ONLY — no mutating verbs, no gated Tier-3 verbs, no navigate/view-screen.
3. The five gated Tier-3 verbs now live in ONE source of truth: `server/lib/gated-actions.ts` (`GATED_ACTION_LIST` / `GATED_ACTIONS`), re-imported by `approve-proposal.ts` and `propose-action.ts` — this replaces the old "update both files" rule. Gated verbs remain reachable on web only via propose-action → approve-proposal.
4. AI-02 is proven by `server/lib/mobile-admin-tools.test.ts` (vitest) — gated + mutating verbs are structurally absent from the built tool list.
5. Note the sanctioned divergence: like the member agent, the mobile admin agent calls the LLM server-side (the Expo binary cannot use `sendToAgentChat`). This is an intentional exception to the delegate-to-agent rule, not a bug to "fix".
6. Note `RUNSTUDIO_OPERATOR_EMAILS` drives the admin role (set on Vercel for the deploy).
  </action>
  <verify>
    <automated>grep -q "Mobile Admin Agent" apps/staff-web/AGENTS.md && grep -q "MOBILE_ADMIN_ALLOWLIST" apps/staff-web/AGENTS.md && grep -q "GATED_ACTIONS" apps/staff-web/AGENTS.md && echo "AGENTS.md documented"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "Mobile Admin Agent" apps/staff-web/AGENTS.md`
    - `grep -q "MOBILE_ADMIN_ALLOWLIST" apps/staff-web/AGENTS.md`
    - `grep -q "gated-actions" apps/staff-web/AGENTS.md` (single source of truth referenced)
    - `grep -q "requireAdmin\|RUNSTUDIO_OPERATOR_EMAILS" apps/staff-web/AGENTS.md` (admin gate documented)
    - `grep -qi "server-side" apps/staff-web/AGENTS.md` (LLM divergence noted)
  </acceptance_criteria>
  <done>apps/staff-web/AGENTS.md has a Mobile Admin Agent section documenting the endpoint, the admin gate, the explicit allow-list + defensive filter, the single gated source of truth, the unit-test proof, and the sanctioned server-side-LLM divergence.</done>
</task>

</tasks>

<verification>
- `cd packages/mobile-app && npx tsc --noEmit` clean for whoami.ts, agent-stream.ts, AgentSheet.tsx, _layout.tsx.
- Member default path unchanged: streamAgent with no endpoint arg still hits /api/m/agent/stream.
- Admin path: when whoami returns admin, the sheet streams from /api/m/admin/agent/stream.
- AGENTS.md documents the new surface (four-area contract: skills/instructions area satisfied).
- No new mobile screens/tabs added (scope discipline).
</verification>

<success_criteria>
- AI-01: an admin opens the in-app AI ops chat (reusing AgentSheet) that calls the non-gated allow-list verbs in natural language; tool results invalidate caches so they reflect in app state.
- Minimal client change (endpoint + title props + role gate), member behaviour untouched.
- Four-area contract complete: UI (role-gated AgentSheet), endpoint (MA4-02), skills/AGENTS.md (this plan), application-state (cache invalidation).
</success_criteria>

<output>
After completion, create `.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-03-SUMMARY.md`.
</output>
