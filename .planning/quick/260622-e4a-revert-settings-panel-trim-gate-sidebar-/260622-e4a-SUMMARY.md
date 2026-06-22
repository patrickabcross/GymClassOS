---
phase: quick-260622-e4a
plan: 01
subsystem: packages/core + apps/staff-web
tags: [settings-panel, operator-gating, single-tenant, env-status, whitelabel]
dependency_graph:
  requires: [quick-260622-d1v]
  provides: [operator-gear-gate, single-tenant-credential-fallback, full-settings-panel]
  affects: [staff-web-gymos-agent-sidebar, core-agent-panel, core-credential-provider, core-env-status]
tech_stack:
  added: []
  patterns: [operator-allowlist-from-root-loader, show-prop-default-true-upstream-safe]
key_files:
  created:
    - .changeset/260622-e4a-operator-gear-single-tenant-env-status.md
  modified:
    - packages/core/src/client/settings/SettingsPanel.tsx
    - packages/core/src/client/AgentPanel.tsx
    - packages/core/src/server/credential-provider.ts
    - packages/core/src/server/core-routes-plugin.ts
    - apps/staff-web/app/root.tsx
    - apps/staff-web/app/components/layout/AppLayout.tsx
decisions:
  - showSettingsGear defaults to true so upstream agent-native apps are unaffected; only the /gymos AgentSidebar mount passes a computed value
  - operatorEmails code default is patrickalexanderross@outlook.com (NOT everyone-open) when RUNSTUDIO_OPERATOR_EMAILS unset
  - isSingleTenantDeploy() is opt-in via AGENT_NATIVE_SINGLE_TENANT=1; defaults off for multi-tenant deploys
  - dist/client/AgentPanel.d.ts updated locally for typecheck (gitignored; Vercel regenerates from source on build)
metrics:
  duration_seconds: ~900
  completed: "2026-06-22T09:32:37Z"
  tasks: 4
  files: 7
---

# Quick Task 260622-e4a: Revert Settings Panel Trim + Gate Sidebar Settings Gear

**One-liner:** Full Settings panel restored, agent-chat gear gated behind operator allowlist for /gymos, `AGENT_NATIVE_SINGLE_TENANT` flag added for deploy-env LLM credential fallback, and env-status `app_secrets` gating bug fixed.

## What Was Built

Three coordinated changes revising quick task 260622-d1v:

**1. Full Settings panel restored (Task 1)**

`git checkout 313846c1 -- packages/core/src/client/settings/SettingsPanel.tsx` restores all 16 upstream sections: Account, LLM, App Default Model, Agent Limits, Voice Transcription, Demo mode, Automations, API Keys & Connections, Hosting, Database, File uploads, Authentication, Email, Integrations, Usage, and Connected Agents (A2A). Previously-removed state/effects restored: `connectUrl`, `orgName`, `envManaged`, `credentialSource`, `builderFlow`, `useBuilderConnectFlow` call, `focusSecretKey`/`setFocusSecretKey`, and the `#secrets:<KEY>` hash `useEffect`.

**2. Settings gear gated behind operator allowlist (Task 2)**

`showSettingsGear?: boolean` prop added to `AgentPanelProps` and `AgentSidebarProps` — defaults `true` so all upstream agent-native apps see the gear unchanged. When `false`:
- The `aria-label="Setup and configuration"` gear button is not rendered
- `useState<PanelMode>` initializer will not restore persisted `"settings"` mode from localStorage
- `agent-panel:open-settings` custom event is ignored (early-return guard)
- The `renderModeButtons` deps array includes `showSettingsGear`

**3. Single-tenant credential fallback + env-status app_secrets fix (Task 3)**

`credential-provider.ts`: new `isSingleTenantDeploy()` (`AGENT_NATIVE_SINGLE_TENANT === "1"`) OR'd into `isDeployCredentialFallbackAllowed()`. When set, the deploy-env ANTHROPIC_API_KEY counts as a valid credential for every signed-in staff member on a single-studio Neon deploy.

`core-routes-plugin.ts` env-status fix: prior logic was `(inEnv || inAppSecrets) && (!isProviderKey || canUseDeployEnv)` which incorrectly and-ed `inAppSecrets` with the provider gate. Fixed to `inAppSecrets || (inEnv && (!isProviderKey || canUseDeployEnv))` so a studio-saved key always shows as configured regardless of the deploy env gate.

**4. staff-web operator allowlist (Task 4)**

`root.tsx` loader: `operatorEmails` computed from `RUNSTUDIO_OPERATOR_EMAILS` env (comma-separated) with code default `["patrickalexanderross@outlook.com"]` when unset or empty. NOT the adminOpen-style "everyone is operator" fallback — empty env means Patrick only, not everyone.

`AppLayout.tsx`: `useSession` + `useRouteLoaderData("root")` called unconditionally at component top (before BARE_ROUTES early return to respect React hooks rules). `isOperator = session?.email && operatorEmails.includes(email.toLowerCase())`. Passed as `showSettingsGear={isOperator}` on the `/gymos` `<AgentSidebar>` mount only. The non-gymos mount (email template) is untouched — gear stays visible there.

## Typecheck Results

```
packages/core tsc --noEmit    EXIT:0
apps/staff-web pnpm typecheck EXIT:0
```

Note: `packages/core/dist/client/AgentPanel.d.ts` (gitignored) was patched locally to add `showSettingsGear` to the type declarations so the staff-web typecheck passes against the pre-built dist. Vercel will regenerate `dist/` from source on build, which will include the prop naturally.

## Commits

| Task | Hash | Message |
|------|------|---------|
| T1 | d869f19a | fix(quick-260622-e4a-01): revert SettingsPanel render trim |
| T2 | cd0399fc | feat(quick-260622-e4a-02): showSettingsGear prop on AgentSidebar/AgentPanel |
| T3 | cb7452e7 | feat(quick-260622-e4a-03): single-tenant deploy flag + env-status fix |
| T4 | 4d6fe256 | feat(quick-260622-e4a-04): staff-web operator allowlist + changeset |

## Manual Deploy Steps (Operator-Only Vercel Config)

These env vars must be set on the Vercel staff-web project by the operator. Do NOT attempt to set them via code.

1. **`AGENT_NATIVE_SINGLE_TENANT=1`** — Enables the single-tenant credential fallback so the deploy-env ANTHROPIC_API_KEY (set on Vercel) lights up the agent chat for every signed-in HUSTLE staff member. Without this, authenticated users on a production Neon deploy get no LLM because `isDeployCredentialFallbackAllowed()` returns false in production with a real DB.

2. **`RUNSTUDIO_OPERATOR_EMAILS=patrickalexanderross@outlook.com`** (optional) — The code default already covers Patrick. Only set this to ADD a second operator email (e.g. a future HQ admin). Multiple emails: comma-separated.

3. **Deploy = `git push origin master`** (Vercel auto-deploys from master). Never use the `vercel` CLI (10 MB upload cap) and NEVER add a root `.vercelignore` (breaks `packages/core` build).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all wired. The operator gate is functional: `isOperator` is computed from session email vs `operatorEmails` from the root loader. The single-tenant flag is functional: `AGENT_NATIVE_SINGLE_TENANT=1` enables the credential fallback path.

## Self-Check: PASSED

Files verified:
- packages/core/src/client/settings/SettingsPanel.tsx — FOUND: connectUrl (10 occurrences), focusSecretKey (2 occurrences)
- packages/core/src/client/AgentPanel.tsx — FOUND: showSettingsGear in AgentPanelProps, AgentSidebarProps, AgentPanelInner, gear guard, deps array, open-settings guard
- packages/core/src/server/credential-provider.ts — FOUND: AGENT_NATIVE_SINGLE_TENANT, isSingleTenantDeploy
- packages/core/src/server/core-routes-plugin.ts — FOUND: inAppSecrets || (inEnv && ...)
- apps/staff-web/app/root.tsx — FOUND: operatorEmails, RUNSTUDIO_OPERATOR_EMAILS
- apps/staff-web/app/components/layout/AppLayout.tsx — FOUND: showSettingsGear={isOperator}, useSession, isOperator
- .changeset/260622-e4a-operator-gear-single-tenant-env-status.md — FOUND

Commits verified in git log:
- d869f19a FOUND
- cd0399fc FOUND
- cb7452e7 FOUND
- 4d6fe256 FOUND
