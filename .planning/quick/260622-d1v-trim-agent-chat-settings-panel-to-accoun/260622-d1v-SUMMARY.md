---
phase: quick-260622-d1v
plan: 01
subsystem: packages/core
tags: [settings-panel, env-status, secrets, whitelabel]
dependency_graph:
  requires: []
  provides: [trimmed-settings-panel, env-status-app-secrets-check]
  affects: [packages/core/src/client/settings/SettingsPanel.tsx, packages/core/src/secrets/storage.ts, packages/core/src/server/core-routes-plugin.ts]
tech_stack:
  added: []
  patterns: [studio-global presence check, presence-only secrets reader]
key_files:
  modified:
    - packages/core/src/client/settings/SettingsPanel.tsx
    - packages/core/src/secrets/storage.ts
    - packages/core/src/server/core-routes-plugin.ts
    - .changeset/260622-d1v-trim-settings-panel-and-env-status-app-secrets.md
decisions:
  - "Remove focusSecretKey state + hash useEffect (only consumer was removed SecretsSection JSX); confirmed no tsc error for these removals"
  - "Remove connectUrl/orgName/envManaged/credentialSource/builderFlow from SettingsPanel — all only fed LLMSectionInner JSX"
  - "Keep ALL removed section component definitions in SettingsPanel.tsx for upstream-merge traceability per plan"
  - "appSecretExistsByKey uses ? placeholder convention matching all other storage.ts queries (getDbExec abstraction handles Postgres/SQLite)"
  - "No guard:allow-unscoped marker needed — app_secrets is a framework table, not an ownableColumns table"
metrics:
  duration: ~10 min
  completed: 2026-06-22
  tasks: 3
  files: 4
---

# Quick Task 260622-d1v: Trim agent-chat Settings panel to Account + Integrations, fix env-status false negative

One-liner: Stripped agent-chat gear Settings panel to Account + Integrations only for the white-labelled RunStudio product, and fixed the env-status endpoint to check app_secrets presence (not just process.env) so saved LLM/provider keys no longer show "needs set up".

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Trim SettingsPanel render to Account + Integrations | 407d6d1e | packages/core/src/client/settings/SettingsPanel.tsx |
| 2 | Add appSecretExistsByKey + fix env-status handler | 772ad7e7 | packages/core/src/secrets/storage.ts, packages/core/src/server/core-routes-plugin.ts |
| 3 | Add changeset + final tsc verification | 99be1e33 | .changeset/260622-d1v-trim-settings-panel-and-env-status-app-secrets.md |

## Task 1: tsc Keep-Green Approach

After removing the JSX for LLM, App default model, Agent limits, Voice Transcription, Demo mode, Automations, API Keys & Connections, Hosting, Database, File uploads, Authentication, Email, Usage, and Connected Agents (A2A) sections from the `SettingsPanel` return block:

**Variables removed from function body** (were only used by removed JSX):
- `connectUrl` (was passed to `useBuilderConnectFlow` and `LLMSectionInner`)
- `orgName`, `envManaged`, `credentialSource` (LLMSectionInner only)
- `builderFlow` (LLMSectionInner only; removed `useBuilderConnectFlow` call)
- `focusSecretKey` / `setFocusSecretKey` state declaration
- The `#secrets:<KEY>` hash `useEffect` (only purpose was to set `focusSecretKey` and open SecretsSection)
- The `if (section !== "secrets") setFocusSecretKey(undefined)` call inside the `initialSection` effect

**Imports removed from function body (none):** All imports in the file are still referenced inside component DEFINITIONS that we kept (`LLMSectionInner`, `EmailSectionInner`, `AgentsSection`, etc. are still defined — just not rendered). tsc confirms they remain "used" via those definitions.

**Confirmed kept:** `builderBranchesAvailable`, `connected`, `builderLoading` — still passed to `CapabilityStatusStrip`. `useBuilderStatus` hook still used.

**Result:** `cd packages/core && npx tsc --noEmit` exits 0. No unused-import or unused-variable errors.

## Task 2: appSecretExistsByKey Implementation

Added to `packages/core/src/secrets/storage.ts` between `listAppSecretsForScope` and `parseAllowlist`:

- Presence-only: does NOT decrypt or return plaintext
- Studio-global: queries by key alone across ALL scopes (no scopeId filter)
- Uses `?` placeholder with `args: [key]` — matching ALL other queries in storage.ts (getDbExec abstraction handles Postgres/SQLite distinction)
- Calls `ensureTable()` before querying (same pattern as all other functions in this file)
- No `guard:allow-unscoped` marker needed: `app_secrets` is a framework secrets table, NOT an `ownableColumns()` table; the guard only applies to ownable resources

env-status handler in `core-routes-plugin.ts` updated:
- `envKeys.map()` → `await Promise.all(envKeys.map(async (cfg) => { ... }))`
- Per-key: `inEnv = !!process.env[cfg.key]` short-circuits the DB call (`inEnv ? false : await appSecretExistsByKey(cfg.key)`)
- `configured: present && (!isProviderKey || canUseDeployEnv)` — gating unchanged
- Import added: `import { appSecretExistsByKey } from "../secrets/storage.js";`

## No apps/staff-web Files Touched

Verified: only `packages/core` source files and `.changeset/` were modified. The `/gymos/settings` page (`apps/staff-web`) was not touched.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both changes are fully wired (presence reader exported and imported; env-status awaits the check).

## Self-Check

- packages/core/src/client/settings/SettingsPanel.tsx — FOUND (modified)
- packages/core/src/secrets/storage.ts — FOUND (modified, appSecretExistsByKey exported)
- packages/core/src/server/core-routes-plugin.ts — FOUND (modified, appSecretExistsByKey imported + awaited)
- .changeset/260622-d1v-trim-settings-panel-and-env-status-app-secrets.md — FOUND (created)
- Commits 407d6d1e, 772ad7e7, 99be1e33 — all exist in git log
- `cd packages/core && npx tsc --noEmit` — EXIT: 0 (verified after each task and at end)

## Self-Check: PASSED
