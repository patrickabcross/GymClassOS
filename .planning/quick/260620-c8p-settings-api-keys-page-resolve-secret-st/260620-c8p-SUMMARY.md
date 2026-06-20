---
phase: quick-260620-c8p
plan: 01
subsystem: staff-web/secrets
tags: [settings, api-keys, secrets, nitro-plugin, by-key-resolution]
dependency_graph:
  requires: [apps/staff-web/server/lib/app-secrets.ts, apps/staff-web/server/register-secrets.ts]
  provides: [Settings API Keys panel shows all keys as "set" for any staff login]
  affects: [GET /_agent-native/secrets collection handler]
tech_stack:
  added: []
  patterns: [nitro-plugin-middleware-unshift, pure-helper-extraction-for-testability]
key_files:
  created:
    - apps/staff-web/server/plugins/secrets-status-override.ts
    - apps/staff-web/server/plugins/secrets-status-override-helpers.ts
    - apps/staff-web/server/plugins/secrets-status-override.test.ts
  modified:
    - apps/staff-web/vitest.unit.config.ts
decisions:
  - "helpers extracted to secrets-status-override-helpers.ts (no framework imports): same BD4-01 ESM vitest pattern — cannot import nitropack/runtime in vitest unit runner; pure helper file allows testing without server"
  - "unshift (not use/push) to h3['~middleware']: getH3App().use() pushes to end of ~middleware, landing AFTER core's handler which short-circuits; unshift places override FIRST so it wins"
  - "middleware entry shape is bare async function (event, next): inspected registerMiddleware in framework-request-handler.ts confirmed entries are bare functions pushed directly, not {route, handler} objects"
  - "test imports from secrets-status-override-helpers.js not secrets-status-override.js: plugin file imports nitropack/runtime which fails in ESM vitest; helpers file has zero framework deps"
metrics:
  duration: 25min
  completed: "2026-06-20"
  tasks: 2
  files: 4
---

# Quick Task 260620-c8p: Settings API Keys Page — Resolve Secret Status by Key

One-liner: Nitro plugin that shadows GET /_agent-native/secrets with studio-global by-key presence resolution so all staff logins see saved keys as "set".

## What Was Built

**Root cause:** The framework's list handler calls `resolveScopeId(event, "user")` which filters `app_secrets` by `scope='user' AND scope_id=<session email>`. Keys saved by `support@myutik.com` had `scope_id=support@myutik.com` — every other staff login (bobby@, els@, patrickalexanderross@) saw all 7 keys as "unset" even though the runtime worked (which uses `readAppSecretByKey` — resolves by key alone).

**Fix:** A studio-owned Nitro plugin (`secrets-status-override.ts`) that unshifts a middleware into `nitroApp.h3["~middleware"]` so it runs before the framework's secrets handler. It intercepts only collection GET `/_agent-native/secrets`, calls `readAppSecretByKey` per key, and returns the same `SecretStatusPayload[]` shape with studio-global status. All other routes (write/test/delete/ad-hoc/oauth) fall through unchanged.

## Implementation Details

### Task 1: Plugin + Helpers

**`apps/staff-web/server/plugins/secrets-status-override.ts`**
- Default-exports `defineNitroPlugin` (matching the Nitro plugin convention used by sibling plugins)
- Imports `register-secrets.js` at top to ensure the registry is populated even if this plugin loads first
- Imports and re-exports from `secrets-status-override-helpers.js` (pure helper extraction)
- Registers `overrideMiddleware` via `h3["~middleware"].unshift()` — NOT `getH3App().use()` which pushes to end

**`apps/staff-web/server/plugins/secrets-status-override-helpers.ts`**
- Pure file: zero framework imports (no nitropack, no @agent-native/core)
- Exports `SecretPresence` interface and `buildSecretStatusPayload()` function
- Computes `status: "set" | "unset"` and masked `last4` from presence map
- Never touches plaintext; oauth-kind entries emit `status: "unset"` (defensive branch)

**Middleware entry shape verified:** Inspected `registerMiddleware` in `node_modules/@agent-native/core/src/server/framework-request-handler.ts` — entries are bare `async (event, next) => {}` functions pushed directly onto `h3["~middleware"]`. Confirmed `unshift` with a bare function is the correct shape.

**Fallback safety:** Any thrown error in the middleware body catches, logs a redacted message, and `return next()` — the panel degrades to core's old per-user behavior, never crashes.

### Task 2: Unit Tests + Vitest Config

**`apps/staff-web/server/plugins/secrets-status-override.test.ts`** — 18 tests:
- Present/absent api-key entries: 2 present (with correct masked last4), 1 absent (status="unset", no last4)
- All base field carry-through: key, label, description, docsUrl, scope, kind, required
- Security: serialized payload does not contain any plaintext value; only masked last4 appears
- OAuth defensive branch: status="unset", oauthProvider + oauthConnectUrl passed through, kind="oauth"

**`apps/staff-web/vitest.unit.config.ts`** — added `"server/plugins/**/*.test.ts"` to the include array.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file cannot import plugin file (nitropack/runtime not resolvable in vitest)**
- **Found during:** Task 2 RED phase
- **Issue:** `secrets-status-override.ts` imports `defineNitroPlugin` from `nitropack/runtime`; ESM vitest cannot resolve this module in the unit runner environment (same BD4-01 problem: CJS/ESM incompatibility in the framework layer)
- **Fix:** Extracted `buildSecretStatusPayload` and `SecretPresence` into a separate `secrets-status-override-helpers.ts` with zero framework imports. Plugin re-exports from helpers. Test imports from helpers directly. Mirrors the `create-checkout-link-helpers.ts` / `brain-init-helpers.ts` pattern.
- **Files modified:** Added `secrets-status-override-helpers.ts`; updated `secrets-status-override.ts` to import+re-export; updated test import path
- **Commits:** included in both task commits

## Known Stubs

None. This is a read/display fix — no stubs, no placeholder data.

## Post-Deploy Verification (not automated — no local server)

On the live Vercel deploy, sign in as bobby@doyouhustle.co.uk (or els@ / patrickalexanderross@) → Settings → API Keys: the 7 registered keys (ANTHROPIC_API_KEY, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, MYUTIK_API_KEY) should show as configured / REQUIRED badges green.

## Self-Check: PASSED

Files exist:
- FOUND: apps/staff-web/server/plugins/secrets-status-override.ts
- FOUND: apps/staff-web/server/plugins/secrets-status-override-helpers.ts
- FOUND: apps/staff-web/server/plugins/secrets-status-override.test.ts

Commits exist:
- ba34c8b8: feat(quick-260620-c8p): add secrets-status-override Nitro plugin
- 478687ef: test(quick-260620-c8p): unit tests for buildSecretStatusPayload helper

Tests: 18/18 passed
Typecheck: no errors in new files
