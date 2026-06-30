---
phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone
plan: 03
subsystem: mobile-admin-agent-client
tags: [expo, sse, whoami, role-gating, agent-sheet, four-area-contract]

# Dependency graph
requires:
  - phase: MA4-02 (admin SSE endpoint + auth gate)
    provides: "GET /api/m/whoami → {role}; POST /api/m/admin/agent/stream (admin-only SSE)"
  - phase: MA1 (auth spine)
    provides: "getSessionToken (expo-secure-store) + Bearer session; AgentSheet + agent-stream.ts member coach client"
provides:
  - "fetchRole() — GET /api/m/whoami with Bearer → AppRole (client role discovery)"
  - "streamAgent(messages, cb, endpoint?) — endpoint param (default member coach) reuses one SSE client for both agents"
  - "AgentSheet endpoint+title props — admin sheet streams from the admin endpoint with an admin title"
  - "Role-gated agent entry in _layout.tsx (admin → admin endpoint, member/teacher → member coach)"
  - "Mobile Admin Agent section in apps/staff-web/AGENTS.md (four-area skills/instructions contract)"
affects: [MA4 phase complete — differentiator real on phone for the admin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse-not-rebuild: one react-native-sse client (agent-stream.ts) serves both agents via a default-valued endpoint param — member behaviour byte-identical when no endpoint passed"
    - "Client role gating via whoami is UX-only; the server requireAdmin on the admin SSE endpoint is the sole security boundary (a forced URL still 403s)"
    - "Four-area agent-native contract closed: UI (role-gated AgentSheet) + endpoint (MA4-02) + skills/AGENTS.md (this plan) + application-state (tool_result cache invalidation)"

key-files:
  created:
    - packages/mobile-app/lib/whoami.ts
  modified:
    - packages/mobile-app/lib/agent-stream.ts
    - packages/mobile-app/components/AgentSheet.tsx
    - packages/mobile-app/app/_layout.tsx
    - apps/staff-web/AGENTS.md

key-decisions:
  - "Single SSE client reused via an endpoint param (default = member coach) — no second react-native-sse client, per the plan's reuse mandate"
  - "Admin title 'RunStudio Ops' (member keeps 'Agent — GymClassOS Coach'); title drives both the header and the system-welcome line"
  - "Role resolved once on mount via fetchRole().then(setRole) in AgentFabAndSheet; isAdmin === role==='admin' decides endpoint + title"
  - "Existing tool_result cache invalidation (schedule / food-entries / profile) left in place — harmless for admin (keys may not exist) and satisfies AI-01 'reflect in app state' via the invalidation pattern"
  - "No new mobile screens/tabs — change is purely which endpoint/title the single FAB's sheet uses based on role (scope discipline)"

requirements-completed: [AI-01]

# Metrics
duration: 2min
completed: 2026-06-30
---

# Phase MA4 Plan 03: Admin Mobile AI Agent — Mobile Client Summary

**The mobile client now closes the differentiator: it resolves its role via `GET /api/m/whoami`, and when `role==='admin'` the existing `AgentSheet` (one shared `react-native-sse` client) is pointed at `POST /api/m/admin/agent/stream` with a "RunStudio Ops" title — members/teachers keep the member-coach endpoint untouched — and the mobile admin agent + 12-verb allow-list + sanctioned server-side-LLM divergence are documented in `apps/staff-web/AGENTS.md`.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-30T20:09:13Z
- **Completed:** 2026-06-30T20:11:34Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 edited)

## Accomplishments
- **`lib/whoami.ts` (new):** `fetchRole()` calls `GET /api/m/whoami` with the `Bearer` session token and returns `AppRole | null`. Documented inline that it is UX gating only — the server `requireAdmin` is the real boundary.
- **`lib/agent-stream.ts`:** added a 3rd param `endpoint: string = "/api/m/agent/stream"` to `streamAgent` and switched the `EventSource` URL to `` `${API_BASE_URL}${endpoint}` ``. Bearer/header logic untouched. Default keeps member behaviour byte-identical — no second SSE client.
- **`components/AgentSheet.tsx`:** extended `Props` with optional `endpoint` + `title` (defaults = member coach). `title` drives the header `<Text>` and the initial system-welcome message; `endpoint` is passed as the 3rd arg to `streamAgent`. The existing `onToolResult` cache invalidation (schedule / food-entries / profile) is retained.
- **`app/_layout.tsx` (`AgentFabAndSheet`):** added `role` state + `useEffect(() => { fetchRole().then(setRole); }, [])`; `isAdmin = role === "admin"`. The mounted `<AgentSheet>` now receives `endpoint={isAdmin ? "/api/m/admin/agent/stream" : "/api/m/agent/stream"}` and `title={isAdmin ? "RunStudio Ops" : "Agent — GymClassOS Coach"}`. Single FAB, no new screens/tabs.
- **`apps/staff-web/AGENTS.md`:** new `## Mobile Admin Agent (read + dashboard only)` section documenting the admin-only endpoint + gate-before-stream `requireAdmin` (`RUNSTUDIO_OPERATOR_EMAILS`), the explicit 12-verb `MOBILE_ADMIN_ALLOWLIST` (NOT `ALL − GATED`) + defensive `GATED_ACTIONS` filter, the single gated source of truth (`gated-actions.ts`), the `mobile-admin-tools.test.ts` proof, and the sanctioned server-side-LLM divergence.

## Task Commits

Each task was committed atomically:

1. **Task 1: whoami client lib + endpoint param + AgentSheet props + role-gated entry** — `b01b4ad9` (feat)
2. **Task 2: Document the mobile admin agent + allow-list in apps/staff-web/AGENTS.md** — `407d4b15` (docs)

## Files Created/Modified
- `packages/mobile-app/lib/whoami.ts` (new) — `fetchRole()` → `GET /api/m/whoami` with Bearer → `AppRole | null`.
- `packages/mobile-app/lib/agent-stream.ts` (edit) — `streamAgent(messages, cb, endpoint="/api/m/agent/stream")`; URL uses the param.
- `packages/mobile-app/components/AgentSheet.tsx` (edit) — `endpoint?` + `title?` props; header + welcome use `title`; `endpoint` passed to `streamAgent`; cache invalidation retained.
- `packages/mobile-app/app/_layout.tsx` (edit) — role resolved via `fetchRole`; admin sheet → admin endpoint + "RunStudio Ops" title.
- `apps/staff-web/AGENTS.md` (edit) — Mobile Admin Agent documentation section.

## Verification Results
- **tsc (mobile tsconfig):** `cd packages/mobile-app && npx tsc --noEmit` — CLEAN for all four touched files (`whoami`, `agent-stream`, `AgentSheet`, `_layout`; grep of the tsc output for those filenames returned no errors).
- **Member default path unchanged:** `streamAgent` with no `endpoint` arg still resolves to `/api/m/agent/stream` (default param value); verified by grep + the unchanged call sites.
- **Admin path:** `app/_layout.tsx` passes `/api/m/admin/agent/stream` when `isAdmin`; verified by grep.
- **No second SSE client:** only `lib/agent-stream.ts` constructs `EventSource`; AgentSheet imports the same `streamAgent`.
- **No new screens/tabs:** only `_layout.tsx`'s existing single FAB/sheet changed (scope discipline).
- **AGENTS.md documented:** all six acceptance greps passed (Mobile Admin Agent / MOBILE_ADMIN_ALLOWLIST / GATED_ACTIONS / gated-actions / requireAdmin|RUNSTUDIO_OPERATOR_EMAILS / server-side).
- **Prettier:** run on the four mobile files (whoami + _layout already conformant; agent-stream + AgentSheet reformatted).

## Device-Gated Deferrals
- **On-device iOS verification (admin sees the "RunStudio Ops" agent; member/teacher does not; admin chat streams from the admin endpoint) is DEFERRED** — EAS/Apple-gated, the same blocker as MA1-03 and the iOS build (`packages/mobile-app/IOS-EAS-RUNBOOK.md`; needs an active Apple Developer account + a physical iPhone or `eas build`). The code path is complete and tsc-clean; only the on-device run is gated. This matches the MA1-03 device-UAT pattern (record, do not block).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None. The client wires the live whoami + admin SSE endpoints from MA4-02; no hardcoded/placeholder data. Role defaults to `null` until `fetchRole` resolves (member-coach endpoint), which is the intended fail-closed-to-member default, not a stub.

## User Setup Required
None for this plan — TypeScript-only client change, no DB migration. Runtime needs `RUNSTUDIO_OPERATOR_EMAILS` set on Vercel to designate admins (existing env from MA4-02) and `ANTHROPIC_API_KEY` (already configured).

## Next Phase Readiness
- **MA4 phase complete (3/3):** MA4-01 (allow-list keystone) + MA4-02 (admin SSE endpoint + requireAdmin + whoami) + MA4-03 (mobile client) all shipped. The four-area agent-native contract is closed (UI + endpoint + skills/AGENTS.md + application-state). AI-01/02/03 satisfied.
- **Remaining v2.3 work:** MA2 (member booking) + MA3 (teacher check-in) are planned & checker-PASSED, ready to execute; MA5 (push) is last and EAS/Apple-gated.
- No blockers (on-device iOS verification deferred per the documented EAS gate).

## Self-Check: PASSED

All created/modified files present on disk; both task commits (`b01b4ad9`, `407d4b15`) exist in git history.

---
*Phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone*
*Completed: 2026-06-30*
