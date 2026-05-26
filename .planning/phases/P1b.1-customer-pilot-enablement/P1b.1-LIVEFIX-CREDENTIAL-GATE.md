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

## Iteration 1 (commit `a1d8a1ff`): explicit opt-in env var

First pass introduced `AGENT_NATIVE_SINGLE_TENANT=true` as an explicit opt-in escape hatch in both gates. Worked, but required the customer to set a second env var on Vercel — easy to miss, and the 403 on save returned even after `ANTHROPIC_API_KEY` was pasted because the in-app save path still uses the env-var-writes endpoint, not the secrets registry.

## Iteration 2 (this fix): use the framework's secrets registry

Stop fighting the framework. agent-native already has a documented secrets-registry pattern (`registerRequiredSecret()` — see `packages/core/src/templates/workspace-core/.agents/skills/secrets/SKILL.md`) that:

1. Makes `ANTHROPIC_API_KEY` appear in the in-app Settings → API Keys UI with a WORKING Save button (POST `/_agent-native/secrets/:key`, NOT the disabled `/_agent-native/env-vars` endpoint).
2. Persists the key encrypted in the `app_secrets` table via `writeAppSecret` — the proper multi-tenant-safe path.
3. Makes `getOwnerApiKey("anthropic", session.email)` find it on every chat request — automatically, no `process.env` involvement.

The staff-web fork (forked from Mail template) never registered any secrets because Mail assumes Builder-hosted LLM credits. Templates like `templates/voice/server/register-secrets.ts` and `templates/slides/server/register-secrets.ts` show the exact pattern.

### Files in iteration 2

**New:**
- `apps/staff-web/server/register-secrets.ts` — registers `ANTHROPIC_API_KEY` with a validator that pings `https://api.anthropic.com/v1/models`, plus the four WhatsApp secrets (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) so the customer can see/rotate them from the same panel. Single source of truth — point further additions here.

**Modified:**
- `apps/staff-web/server/plugins/agent-chat.ts` — adds `import "../register-secrets.js";` side-effect at the top, matching how the existing `import "../onboarding.js";` runs the onboarding registration at boot. File lives outside `server/plugins/` on purpose: Nitro's auto-discovery expects a `defineNitroPlugin`-shaped default export and silently skips files that don't match.

**Reverted (iteration 1 patches dropped):**
- `packages/core/src/server/credential-provider.ts` — dropped the `AGENT_NATIVE_SINGLE_TENANT` branch in `isDeployCredentialFallbackAllowed()`. Back at upstream state.
- `packages/core/src/server/env-var-writes.ts` — dropped the `AGENT_NATIVE_SINGLE_TENANT` branch in `isEnvVarWriteAllowed()`. Back at upstream state.
- `apps/staff-web/.env.example` — removed the `AGENT_NATIVE_SINGLE_TENANT=true` block. `ANTHROPIC_API_KEY` is now documented as OPTIONAL (local-dev only); production paste happens in the in-app UI. Adds WhatsApp env-var documentation since the webhook handlers still read from `process.env` (see scope note below).
- `apps/staff-web/.env.local.example` — same revert, documents the new flow.

Rationale: the framework patches were treating a symptom. The proper primitive for "this deploy needs ANTHROPIC_API_KEY" is the secrets registry, which is what every other template uses. Keeping the fork close to upstream reduces merge friction every time we pull `agent-native@main`.

## Scope decision in `register-secrets.ts`: user vs org

The plan called for `scope: "org"` (staff at the same studio share one key). We registered with `scope: "user"` instead. The framework's POST handler (`packages/core/src/secrets/routes.ts → canMutateOrgScope`) refuses org-scoped writes unless the caller has an active org AND owner/admin role. GymClassOS staff-web does NOT set `AUTO_CREATE_DEFAULT_ORG`, and the pilot has no org-provisioning UX, so org-scoped saves would 403. User scope works without any org setup; the per-customer pilot has 1-2 staff so duplicate paste is negligible. Revisit when AUTH-02 introduces org-based ACL.

## Scope decision for WhatsApp secrets: UI-visible, env-var-backed

The four WhatsApp secrets are registered so the customer SEES which credentials the deploy needs and can rotate them from the same panel. However, the staff-web webhook receiver (`apps/staff-web/app/routes/webhooks.whatsapp.tsx`) and the Fly worker/edge-webhooks services currently read these from `process.env` directly, NOT from `app_secrets`. Until those handlers migrate to `resolveSecret`, the in-app paste must be paired with the matching `fly secrets set` / `vercel env add` for the webhook to actually work in production. The `description` fields in `register-secrets.ts` flag this clearly.

Tracking the handler migration is out of scope for the credential-gate livefix.

## What the user must do

After the next Vercel redeploy:

1. Sign into `/gymos` with an allowlisted Google account.
2. Open Settings → API Keys. The `ANTHROPIC_API_KEY` card will appear with a "REQUIRED" badge.
3. Paste your Anthropic key (same one currently in Vercel env vars — `console.anthropic.com/settings/keys`).
4. Click Save. The validator pings Anthropic's `/v1/models` endpoint to confirm the key works.
5. The right-rail Chat agent works immediately. No redeploy needed.
6. Repeat for the four WhatsApp cards (visibility/rotation only; production webhook still reads `process.env`).
7. The `ANTHROPIC_API_KEY` env var on Vercel can now be removed (in-app UI is the source of truth).

If `AGENT_NATIVE_SINGLE_TENANT=true` is still set on the Vercel project from iteration 1, removing it is safe (no longer referenced anywhere).

## Verification

- `pnpm --filter @agent-native/core build` — exit 0
- `pnpm --filter @agent-native/core typecheck` — exit 0
- `pnpm --filter @gymos/staff-web typecheck` — exit 0
- After deploy: Settings → API Keys shows ANTHROPIC_API_KEY card → paste → Save returns 200 → right-rail Chat returns Anthropic SSE responses without any deploy-level env-var dependency.
