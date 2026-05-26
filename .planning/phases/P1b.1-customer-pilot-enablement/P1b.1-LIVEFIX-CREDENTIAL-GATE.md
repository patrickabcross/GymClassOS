# P1b.1 Livefix: Single-Tenant Credential Gate

**Date:** 2026-05-26
**Trigger:** Customer-facing — agent sidebar still showed "Connect Builder.io" card on production despite `ANTHROPIC_API_KEY` being set in Vercel env vars. Saving a key through the in-app Settings → API Keys UI returned 403.

## What was wrong

Upstream `agent-native` assumes a multi-tenant SaaS deployment model where one shared deploy is fronted by many tenants. To prevent one tenant from silently spending another tenant's `process.env.ANTHROPIC_API_KEY` quota, the framework refuses to fall back to deploy-level env vars for **authenticated requests** in **production** with a **remote DB**.

Three call sites are gated by the same helper:

| File | Symptom |
|---|---|
| `packages/core/src/server/credential-provider.ts` — `isDeployCredentialFallbackAllowed()` | `resolveSecret("ANTHROPIC_API_KEY")` returns null → AgentSidebar empty-state shows "Connect Builder.io" card |
| `packages/core/src/agent/production-agent.ts` (three uses) | `effectiveApiKey` resolves to undefined → chat returns `missing_api_key` SSE event |
| `packages/core/src/server/env-var-writes.ts` — `isEnvVarWriteAllowed()` | Settings → API Keys POST returns 403: `"env-vars endpoint disabled on multi-tenant deployments"` |

GymClassOS is **single-tenant code, multi-tenant deploy** per CLAUDE.md — one Vercel project per customer, one Neon project per customer. The cross-tenant hazard the upstream gate exists to prevent does not exist in this topology, because there is exactly one tenant per deploy.

## What was fixed

Introduced `AGENT_NATIVE_SINGLE_TENANT=true` env var as an explicit opt-in escape hatch in both gates. Upstream multi-tenant SaaS behaviour is unchanged when the flag is absent.

**Patched files (fenced with `// GymClassOS fork:` so upstream merges flag the conflict):**

- `packages/core/src/server/credential-provider.ts` — `isDeployCredentialFallbackAllowed()` now returns `true` in production when `AGENT_NATIVE_SINGLE_TENANT` is `1`/`true`. This single helper cascades through `canUseDeployCredentialFallbackForRequest()` → `resolveSecret()` (read fallback) AND through `shouldBlockDeployCredentialFallback()` in `production-agent.ts` (engine resolution + per-request engine override + plugin-construction-time `options.apiKey`).
- `packages/core/src/server/env-var-writes.ts` — `isEnvVarWriteAllowed()` now returns `true` in production when `AGENT_NATIVE_SINGLE_TENANT` is `1`/`true`. The original `AGENT_NATIVE_ALLOW_ENV_VAR_WRITES` flag still behaves exactly as before in production (refuses), so the existing test in `env-var-writes.spec.ts` stays green.
- `apps/staff-web/.env.example` — documents the new var, marks it REQUIRED on every Vercel project.
- `apps/staff-web/.env.local.example` — mirrors documentation; local dev was never blocked but this keeps local mirroring production.

## What the user must do

Set this env var in the Vercel project (Settings → Environment Variables, Production scope):

```
AGENT_NATIVE_SINGLE_TENANT=true
```

Then redeploy. After redeploy, the AgentSidebar will read `ANTHROPIC_API_KEY` from env and the chat will work end-to-end.

## Verification

- `pnpm --filter @agent-native/core typecheck` — exit 0
- `pnpm --filter @gymos/staff-web typecheck` — exit 0
- `pnpm --filter @agent-native/core build` — exit 0
- Existing `env-var-writes.spec.ts` tests stay green (the `AGENT_NATIVE_ALLOW_ENV_VAR_WRITES` test is unaffected because it stubs a different env var name).

## Why Option A (env-var override) over Option B (pass apiKey to plugin)

`createAgentChatPlugin({ apiKey: process.env.ANTHROPIC_API_KEY })` would NOT have worked. `production-agent.ts:1955` runs `shouldBlockDeployCredentialFallback()` BEFORE honouring `options.apiKey`, so the plugin-construction-time apiKey is dropped on production+remote-DB for authenticated requests:

```typescript
const effectiveApiKey = shouldBlockDeployCredentialFallback()
  ? userApiKey                                        // ← would be undefined
  : (userApiKey ?? options.apiKey ?? readDeployCredentialEnv("ANTHROPIC_API_KEY"));
```

Option A patches the central helper, which unblocks all three code paths (read fallback, engine resolution, env-var write endpoint) with one change. Option B would have left the in-app save UI 403 unsolved.
