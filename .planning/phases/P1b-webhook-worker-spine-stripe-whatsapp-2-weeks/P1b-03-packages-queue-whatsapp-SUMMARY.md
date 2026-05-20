---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 03
subsystem: infra
tags: [pg-boss, whatsapp, queue, zod, hmac, neon, workspace-package]

# Dependency graph
requires:
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
    provides: "P1b-01 monorepo refactor — apps/staff-web/ + packages/* layout"
provides:
  - "@gymos/whatsapp workspace package — sendText, sendTemplate, verifySignature (transport-only)"
  - "@gymos/queue workspace package — typed pg-boss publishers with D-13 singletonKey discipline"
  - "InboundWhatsAppPayload as Zod discriminated union (HIGH #6 fix — message/status variants with structured fields)"
  - "DATABASE_URL_UNPOOLED runtime guard preventing pg-boss against Neon -pooler endpoint (PITFALL #1)"
  - "Compile-time + scripts guard preventing apps/staff-web from importing @gymos/whatsapp (D-11)"
affects: [P1b-04-edge-webhooks, P1b-05-worker-inbound, P1b-06-worker-sendmessage, P1b-07-worker-stripe, P1b-08-staffweb-outbound]

# Tech tracking
tech-stack:
  added:
    - "@great-detail/whatsapp@9.0.0 (Cloud API v23 transport)"
    - "pg-boss@12.18.2 (Neon-backed queue)"
    - "pg@8.13+ (pg-boss transport)"
    - "zod@^4 (payload schemas)"
    - "vitest@^2 (unit tests in both packages)"
  patterns:
    - "Workspace package layout: pnpm workspace pkg with src/*.ts entry pointing to TS source (no build step), tsconfig noEmit"
    - "Singleton getBoss() / getSdk() pattern with env-var validation + reset hooks for tests"
    - "Zod discriminated union as the source-of-truth contract crossing two services (receiver → worker)"
    - "D-13 singletonKey convention: '<queue-name>:<entity-prefix>_<id>' for idempotent send-on-replay"
    - "Compile-time D-11 enforcement via gymos.forbiddenDependencies block + AST-free recursive source scan"

key-files:
  created:
    - "packages/whatsapp/package.json"
    - "packages/whatsapp/tsconfig.json"
    - "packages/whatsapp/src/index.ts"
    - "packages/whatsapp/src/sdk-impl.ts"
    - "packages/whatsapp/src/types.ts"
    - "packages/whatsapp/src/verify-signature.ts"
    - "packages/whatsapp/src/verify-signature.test.ts"
    - "packages/queue/package.json"
    - "packages/queue/tsconfig.json"
    - "packages/queue/src/index.ts"
    - "packages/queue/src/boss.ts"
    - "packages/queue/src/publish.ts"
    - "packages/queue/src/types.ts"
    - "packages/queue/src/boss.test.ts"
    - "packages/queue/src/publish.test.ts"
    - "scripts/guard-no-whatsapp-in-staff-web.mjs"
  modified:
    - "apps/staff-web/package.json (add @gymos/queue, add gymos.forbiddenDependencies block)"
    - "package.json (add guard:no-whatsapp-in-staff-web script + wire into guards)"
    - "pnpm-lock.yaml (workspace deps resolved)"

key-decisions:
  - "Used named import { PgBoss } not default — pg-boss v12 dropped the default export"
  - "Used Client from @great-detail/whatsapp (not 'SDK' — v9 API surface is Client/CloudAPI/default, all aliasing the same class)"
  - "pg-boss v12 removed retentionDays / archiveCompletedAfterSeconds / deleteAfterDays from ConstructorOptions — these are now per-send/per-queue (retentionSeconds, deleteAfterSeconds). Constructor passes only connectionString, max, schema; per-publisher retention left to caller."
  - "Guard script does its own recursive walk (Node fs APIs) instead of shelling to grep — Windows-friendly, no platform-shell coupling"
  - "Used z.discriminatedUnion('kind') with two child schemas (InboundWhatsAppMessagePayload + InboundWhatsAppStatusPayload) exported individually so Plan 04 receiver can reference variant schemas directly"

patterns-established:
  - "Workspace-package contract pattern: src/*.ts as the main/types entry, with package.json exports pointing at TS source; consumers in the same workspace get full type inference without a build step"
  - "Forbidden-dependency declarative block: 'gymos.forbiddenDependencies' in package.json paired with a static-analysis guard wired into pnpm guards script"
  - "Discriminated union as cross-service contract: receiver and worker share the same Zod schema, eliminating synthetic-string parsing on either boundary"

requirements-completed: [WA-09]

# Metrics
duration: 18min
completed: 2026-05-20
---

# Phase P1b Plan 03: Packages Queue + WhatsApp Summary

**Two workspace packages (@gymos/queue typed pg-boss publishers, @gymos/whatsapp thin Meta transport adapter) with HIGH #6 discriminated InboundWhatsAppPayload union and compile-time D-11 enforcement preventing staff-web from importing the WhatsApp transport.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-20T16:05:21Z
- **Completed:** 2026-05-20T16:23:00Z
- **Tasks:** 3
- **Files created:** 16
- **Files modified:** 3

## Accomplishments

- `@gymos/whatsapp` published as workspace package — three transport-only exports (sendText, sendTemplate, verifySignature) wrapping @great-detail/whatsapp v9. 6 unit tests covering signature HMAC edge cases (valid, tampered body, wrong secret, length mismatch, empty header, empty secret) all pass; typecheck clean.
- `@gymos/queue` published as workspace package — four typed pg-boss publishers (enqueueOutboundWhatsApp, enqueueInboundWhatsApp, enqueueStripeEvent, enqueueClassReminder-stubbed) with D-13 singletonKey discipline and a runtime guard refusing pg-boss against Neon's -pooler endpoint (PITFALL #1). 13 unit tests pass; typecheck clean.
- HIGH #6 contract upgrade landed: `InboundWhatsAppPayload` is now a `z.discriminatedUnion("kind", [message, status])` with explicit per-variant fields (`statusFor`, `newStatus`, `timestamp`, `errorCode?`). The fragile synthetic-string `wamid_status_<id>_<ts>_<status>` reconstruction between receiver (Plan 04) and worker (Plan 05) is removed before either side has been built — both will consume the typed schema directly.
- D-11 enforced two layers deep: `apps/staff-web/package.json` now carries a `gymos.forbiddenDependencies: ["@gymos/whatsapp"]` block; new `scripts/guard-no-whatsapp-in-staff-web.mjs` walks `apps/staff-web/` recursively scanning for `from "@gymos/whatsapp"` and is wired into the root `guards` script. Staff-web also picked up `@gymos/queue` as a workspace dep (the legal enqueue path per D-12).

## Task Commits

1. **Task 1: Create packages/whatsapp/ thin transport adapter** — `4890d492` (feat) — 6 verify-signature tests, sendText/sendTemplate via Client SDK
2. **Task 2: Create packages/queue/ typed pg-boss publisher (HIGH #6)** — `4e8147c8` (feat) — 13 tests covering boss singleton, -pooler guard, all payload schemas including discriminated-union variants, QUEUE_NAMES kebab-case discipline
3. **Task 3: Compile-time enforce D-11 (no @gymos/whatsapp in apps/staff-web)** — `494eb746` (feat) — gymos.forbiddenDependencies block + recursive source scan guard + wire into pnpm guards

## Files Created/Modified

**packages/whatsapp/** — transport-only adapter (D-09)

- `package.json` — `@gymos/whatsapp` workspace pkg, pins `@great-detail/whatsapp@^9.0.0` + `zod@^4`
- `tsconfig.json` — strict TS, ES2022, bundler resolution, noEmit
- `src/index.ts` — barrel re-export of sendText / sendTemplate / verifySignature
- `src/types.ts` — Zod SendTextArgs, SendTemplateArgs schemas (validate at boundary)
- `src/verify-signature.ts` — crypto.timingSafeEqual byte-for-byte preserved from `templates/mail/app/routes/webhooks.whatsapp.tsx` demo (lines 52-67 of historical file)
- `src/sdk-impl.ts` — Client singleton bound to WHATSAPP_ACCESS_TOKEN, message.createMessage().json() for both text and template paths
- `src/verify-signature.test.ts` — 6 tests

**packages/queue/** — typed publishers (D-12, D-13)

- `package.json` — `@gymos/queue` workspace pkg, pins `pg-boss@^12.18.0` + `pg@^8.13`
- `tsconfig.json` — same shape as whatsapp pkg
- `src/index.ts` — barrel exporting all four publishers + getBoss + all schemas
- `src/types.ts` — `QUEUE_NAMES`, `OutboundWhatsAppPayload`, `InboundWhatsAppPayload` (discriminated union — HIGH #6), `InboundWhatsAppMessagePayload`, `InboundWhatsAppStatusPayload`, `StripeEventPayload`, `ClassReminderPayload`
- `src/boss.ts` — `getBoss()` singleton, throws on missing DATABASE_URL_UNPOOLED and on `-pooler` substring (PITFALL #1)
- `src/publish.ts` — D-13 singletonKey discipline; per-variant key derivation for InboundWhatsApp; enqueueClassReminder throws (P2 stub)
- `src/boss.test.ts` — 3 tests covering env-missing, -pooler-present, clean-URL paths
- `src/publish.test.ts` — 10 tests covering both Outbound variants, both Inbound variants (message + status), Stripe event-id regex, unknown-status rejection, missing-kind rejection, QUEUE_NAMES values

**Repo-level changes** (D-11 enforcement)

- `apps/staff-web/package.json` — added `gymos.forbiddenDependencies` block, added `@gymos/queue: workspace:*` dep
- `scripts/guard-no-whatsapp-in-staff-web.mjs` — recursive Node-native source scan (Windows-friendly, no grep dependency)
- `package.json` — added `guard:no-whatsapp-in-staff-web` script and chained it into `guards`

## Decisions Made

- **Default-import vs. named-import for pg-boss:** pg-boss v12's `dist/index.d.ts` declares `PgBoss` as a `declare class` with named exports only (no `default`). Switched `boss.ts` from `import PgBoss from "pg-boss"` to `import { PgBoss } from "pg-boss"`. Documented in the boss.ts header.
- **SDK class name:** `@great-detail/whatsapp` v9 exports the SDK class as `Client` (aliased to `CloudAPI` and `default`). Plan said "SDK" — adjusted to `import { Client, MessageType } from "@great-detail/whatsapp"`. The auth model is `request.headers.Authorization: "Bearer ${token}"` on the constructor options, not a top-level `accessToken` key.
- **pg-boss v12 ConstructorOptions surface:** v12 moved `retentionDays`, `archiveCompletedAfterSeconds`, `deleteAfterDays` out of constructor and into per-queue/per-send options as `retentionSeconds` / `deleteAfterSeconds`. Constructor now passes only `connectionString` + `max` + `schema`. Per-publisher policy lives in `publish.ts` (`retryLimit`, `retryBackoff`, `expireInSeconds`).
- **Guard script implementation language:** Plan suggested shelling out to `grep`. Switched to a Node-native recursive walk to keep the guard Windows-friendly (this repo runs on Win11 + PowerShell). Same semantics, no platform-shell coupling.
- **MessageType / TemplateLanguage typing:** `@great-detail/whatsapp` exposes a declared `enum MessageType` and a `type TemplateLanguage` (large string-literal union). The Plan's literal-string call sites failed strict typecheck. Adjusted to import the enum (`MessageType.Text` / `MessageType.Template`) and to cast the language code to `TemplateLanguage` since the user-supplied value (e.g. `"en_US"`) is opaque to TS at the boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] pg-boss v12 dropped `default` export and reshaped ConstructorOptions**

- **Found during:** Task 2 (initial typecheck of `boss.ts`)
- **Issue:** Plan specified `import PgBoss from "pg-boss"` and passed `retentionDays / archiveCompletedAfterSeconds / deleteAfterDays` to the constructor. Both are valid against pg-boss `^11.x` but rejected by v12.18.2 (the version pnpm resolved against `pg-boss: "^12.18.0"`).
- **Fix:** Changed to `import { PgBoss } from "pg-boss"` and dropped the three retention fields from the constructor — they are now per-queue (`QueueOptions.retentionSeconds`, `deleteAfterSeconds`). A comment in `boss.ts` documents the relocation.
- **Files modified:** `packages/queue/src/boss.ts`
- **Verification:** `pnpm --filter @gymos/queue typecheck` exits 0; `pnpm --filter @gymos/queue test` 13/13 pass.
- **Committed in:** `4e8147c8` (Task 2 commit)

**2. [Rule 3 — Blocking] @great-detail/whatsapp v9 exports `Client`, not `SDK`**

- **Found during:** Task 1 (typecheck of `sdk-impl.ts`)
- **Issue:** Plan specified `import { SDK } from "@great-detail/whatsapp"`. v9's `dist/index.d.ts` exports the class as `Client` (also aliased `CloudAPI` and `default`); there is no named `SDK` export. Plan also specified `new SDK({ accessToken })` — actual v9 constructor takes `Options$1` with optional `request.headers.Authorization`.
- **Fix:** Switched to `import { Client, MessageType } from "@great-detail/whatsapp"`; constructor wires the bearer header (`request: { headers: { Authorization: "Bearer ${token}" } }`); `createMessage(...).json()` resolves the typed payload. Imported `TemplateLanguage` for the language-code cast.
- **Files modified:** `packages/whatsapp/src/sdk-impl.ts`
- **Verification:** `pnpm --filter @gymos/whatsapp typecheck` exits 0; `pnpm --filter @gymos/whatsapp test` 6/6 pass.
- **Committed in:** `4890d492` (Task 1 commit)

**3. [Rule 1 — Bug] Guard script used POSIX `grep` syntax on a Windows host**

- **Found during:** Task 3 (writing `scripts/guard-no-whatsapp-in-staff-web.mjs`)
- **Issue:** Plan's reference implementation invoked `execSync("grep -rE …")` which depends on a POSIX grep binary and POSIX path/escape semantics. This repo runs on Windows + PowerShell; the existing `scripts/guard-*.mjs` files all avoid shelling out.
- **Fix:** Rewrote the source-scan as a Node-native recursive `readdirSync` walk with an explicit regex match. Same effective semantics (matches `from "@gymos/whatsapp"` and `require("@gymos/whatsapp")`); plus an explicit skip-list for `node_modules`, `.react-router`, `dist`, `build`, etc.
- **Files modified:** `scripts/guard-no-whatsapp-in-staff-web.mjs`
- **Verification:** `pnpm run guard:no-whatsapp-in-staff-web` exits 0 with `OK: apps/staff-web does not import @gymos/whatsapp`.
- **Committed in:** `494eb746` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking dependency-API drift, 1 platform-portability bug)
**Impact on plan:** None of the deviations changed the contract. All three were SDK-API or platform corrections — the public exports, the singletonKey strings, the discriminated-union shape, the env-var names, and the D-11 enforcement contract are all exactly as specified.

## Issues Encountered

- pnpm install ran twice end-to-end (Task 1 install ≈3 min, Task 3 install ≈2 min). That's the cost of cold-resolving `@great-detail/whatsapp` + `pg-boss` from npm; no avoidable issue.
- Vitest initially reported `"__vite_ssr_import_0__.default is not a constructor"` for the "does not throw with clean URL" boss test. Root cause was the failing `import PgBoss from "pg-boss"` (Vite couldn't resolve a default that didn't exist). Switching to the named import in the deviation #1 fix removed the symptom in the same edit.

## Known Stubs

- **`enqueueClassReminder` in `packages/queue/src/publish.ts`** — intentionally throws `"enqueueClassReminder is stubbed — full impl ships in P2/NOTIF-01"`. Documented in the plan's `truths[0]` and required so the worker file structure does not churn between P1b and P2. NOT a blocker for any P1b plan (no consumer exists yet).

## User Setup Required

None — no external service configuration required at this plan boundary. Plans 04 (Fly receiver) and 06 (worker sendMessage) will require the runtime env vars (`DATABASE_URL_UNPOOLED`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`) but neither this plan nor any consumer of these packages dereferences those at import time — they are read lazily on first call.

## Notes for Downstream Plans

- **Plan 04 (apps/edge-webhooks Fly receiver):** Import `verifySignature` from `@gymos/whatsapp`; import `enqueueInboundWhatsApp`, `enqueueStripeEvent` from `@gymos/queue`. When the Meta webhook decodes a status entry, construct the typed `{ kind: "status", statusFor, newStatus, timestamp, errorCode? }` payload from the structured `change.value.statuses[*]` fields — do NOT serialize back into a synthetic wamid string. The discriminated-union schema rejects flat-shape payloads (`InboundWhatsAppPayload safeParse` test in `publish.test.ts` covers this).
- **Plan 05 (worker inbound):** Subscribe to `QUEUE_NAMES.INBOUND_WHATSAPP` (`"inbound-whatsapp"`). Branch on `data.kind === "status"` vs `"message"`. Read the explicit status fields directly; no parsing required.
- **Plan 06 (worker sendMessage chokepoint):** This is the ONLY app that imports `@gymos/whatsapp`. The D-11 guard expressly permits this — guard only scans `apps/staff-web/`. apps/worker should import `sendText` / `sendTemplate` after the 24h-window + opt-in checks.
- **Plan 08 (staff-web outbound rotation):** Import `enqueueOutboundWhatsApp` from `@gymos/queue` (already wired as a workspace dep). Must NOT add `@gymos/whatsapp` to `apps/staff-web/package.json` — guard will fail CI.
- **Exact versions installed:** `pg-boss@12.18.2`, `@great-detail/whatsapp@9.0.0`. Plan's `verify-output` asked us to capture this — these are the active locked versions in `pnpm-lock.yaml`.

## Next Phase Readiness

- Wave 2 of P1b can now proceed in parallel: Plans 04 / 05 / 06 / 07 / 08 all have stable typed package contracts to build against.
- Both packages publish source-only (no build step) — workspace consumers get type inference immediately via the package.json `exports` block pointing at `./src/index.ts`.
- D-11 enforcement is live in the `guards` chain — if any downstream plan accidentally adds `@gymos/whatsapp` to `apps/staff-web/`, `pnpm prep` will fail.

---

_Phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks_
_Plan: 03_
_Completed: 2026-05-20_

## Self-Check: PASSED
