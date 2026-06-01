---
phase: quick-260601-muh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - services/worker/src/lib/secrets.ts
  - services/worker/src/lib/secrets.test.ts
  - packages/whatsapp/src/sdk-impl.ts
  - packages/whatsapp/src/types.ts
  - packages/whatsapp/src/index.ts
  - services/worker/src/domain/sendMessage.ts
  - services/worker/src/queues/housekeeping.ts
  - services/edge-webhooks/src/lib/secrets.ts
  - services/edge-webhooks/src/lib/secrets.test.ts
  - services/edge-webhooks/src/routes/whatsapp.ts
autonomous: true
requirements: [WA-05, WA-08, STR-01-analog]

must_haves:
  truths:
    - "Worker resolves WhatsApp access token / phone-number-id from the secrets table first, falling back to process.env"
    - "Worker WA-08 template-sync job reads the business account id + access token DB-first with env fallback"
    - "edge-webhooks verifies inbound WhatsApp signatures + handshake using the verify-token and app-secret resolved DB-first with env fallback"
    - "edge-webhooks caches secret reads in-memory (TTL) so the inbound hot path does not query Postgres on every request"
    - "Unit tests cover the new readers (DB-first, env-fallback) and the edge-webhooks TTL cache"
  artifacts:
    - path: "services/worker/src/lib/secrets.ts"
      provides: "getWhatsAppAccessToken / getWhatsAppPhoneNumberId / getWhatsAppBusinessAccountId readers"
      contains: "getWhatsAppAccessToken"
    - path: "services/edge-webhooks/src/lib/secrets.ts"
      provides: "readSecret + getWhatsAppVerifyToken / getWhatsAppAppSecret with TTL cache"
      contains: "getWhatsAppAppSecret"
    - path: "services/edge-webhooks/src/lib/secrets.test.ts"
      provides: "tests for DB-first, env-fallback, and cache TTL"
  key_links:
    - from: "services/worker/src/domain/sendMessage.ts"
      to: "services/worker/src/lib/secrets.ts"
      via: "getWhatsAppAccessToken/getWhatsAppPhoneNumberId resolved then passed into the @gymos/whatsapp adapter"
      pattern: "getWhatsAppAccessToken|getWhatsAppPhoneNumberId"
    - from: "services/worker/src/queues/housekeeping.ts"
      to: "services/worker/src/lib/secrets.ts"
      via: "getWhatsAppBusinessAccountId/getWhatsAppAccessToken in the templates-sync handler"
      pattern: "getWhatsAppBusinessAccountId"
    - from: "services/edge-webhooks/src/routes/whatsapp.ts"
      to: "services/edge-webhooks/src/lib/secrets.ts"
      via: "getWhatsAppVerifyToken (GET handshake) + getWhatsAppAppSecret (POST signature verify)"
      pattern: "getWhatsAppAppSecret|getWhatsAppVerifyToken"
---

<objective>
Migrate Meta WhatsApp credentials in `services/worker` and `services/edge-webhooks` from `process.env` to the pgcrypto-backed `secrets` table, mirroring the existing `getStripeSecretKey()` DB-first / env-fallback pattern, so the in-app Settings UI becomes the single source of truth without a worker/edge redeploy.

Purpose: today the worker still requires `fly secrets set WHATSAPP_*` even though staff have saved the keys in-app. After this migration both Fly processes resolve creds DB-first (rotation-capable, zero-restart) and fall back to env so existing deploys keep working.

Output:
- Worker: three new readers + `sendMessage` and the WA-08 templates-sync job switched off `process.env`.
- edge-webhooks: a new `secrets.ts` reader (it has none today) with an in-memory TTL cache on the inbound hot path + the whatsapp route switched off `process.env`.
- Unit tests for the new readers and the cache.

OUT OF SCOPE (explicit): the live end-to-end send/receive test against the verified WABA. That is customer-gated (requires real creds in `secrets` + Meta-approved templates) and is DEFERRED per the workstream notes in STATE.md. Do NOT attempt a live Meta send or inbound webhook test. Code is left ready only.
</objective>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- The exact contracts the executor builds against. No codebase exploration needed. -->

THE PATTERN TO MIRROR — services/worker/src/lib/secrets.ts:
```typescript
export async function readSecret(name: string, db: ReturnType<typeof getDb>): Promise<string | null>; // UPDATE secrets SET last_used_at=NOW() WHERE name=$ RETURNING pgp_sym_decrypt(...)
export async function writeSecret(name: string, plaintext: string, db: ReturnType<typeof getDb>): Promise<void>;
// DB-first, env-fallback, throw if neither:
export async function getStripeSecretKey(db): Promise<string> {
  const fromDb = await readSecret("stripe_restricted_key", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  if (env.STRIPE_SECRET_KEY) return env.STRIPE_SECRET_KEY;
  throw new Error("No Stripe key available — ...");
}
```
Note the naming asymmetry: DB secret name = lowercase snake_case (`stripe_restricted_key`); env var = `STRIPE_SECRET_KEY`. Mirror this exactly for WhatsApp.

ENV VAR NAMES CURRENTLY IN USE (verified — these are the env-fallback keys):
- Worker (services/worker/src/lib/env.ts): `WHATSAPP_ACCESS_TOKEN` (min 8, required), `WHATSAPP_PHONE_NUMBER_ID` (min 4, required), `WHATSAPP_BUSINESS_ACCOUNT_ID` (min 4, OPTIONAL).
- edge-webhooks (services/edge-webhooks/src/lib/env.ts): `WHATSAPP_VERIFY_TOKEN` (min 8, required), `WHATSAPP_APP_SECRET` (min 8, required).

DB SECRET NAMES TO USE (analogous to stripe_restricted_key):
- `whatsapp_access_token`, `whatsapp_phone_number_id`, `whatsapp_business_account_id`, `whatsapp_verify_token`, `whatsapp_app_secret`.

WHERE CREDS ARE READ TODAY (the consumers to switch):
1. `packages/whatsapp/src/sdk-impl.ts` getSdk()/getPhoneNumberId() read `process.env.WHATSAPP_ACCESS_TOKEN` + `process.env.WHATSAPP_PHONE_NUMBER_ID` directly. `sendMessage.ts` calls `sendText({to,body})` / `sendTemplate({to,name,vars,language})` — so the creds enter via the adapter, NOT via sendMessage. The adapter must be made to accept creds so the worker can inject DB-resolved values.
2. `services/worker/src/queues/housekeeping.ts` templates-sync handler reads `env.WHATSAPP_ACCESS_TOKEN` + `env.WHATSAPP_BUSINESS_ACCOUNT_ID` and passes them to `syncWhatsAppTemplates(accessToken, wabaId, db)` (which is already parameterised — no change needed in syncTemplates.ts itself, only the call site).
3. `services/edge-webhooks/src/routes/whatsapp.ts` reads `env.WHATSAPP_VERIFY_TOKEN` (GET handshake) + `env.WHATSAPP_APP_SECRET` (POST `verifySignature(raw, sig, secret)`).

edge-webhooks DB setup (services/edge-webhooks/src/lib/db.ts): `getDb()` returns a neon-serverless drizzle instance; uses `db.execute(sql\`...\`)`. The `secrets` table is NOT in its local schema mirror — reads go through raw `db.execute(sql\`...\`)` exactly like the worker's readSecret. `getEnv()` lives in services/edge-webhooks/src/lib/env.ts. NOTE: edge-webhooks env.ts has NO `PGCRYPTO_MASTER_KEY` field — it must be added to the edge-webhooks EnvSchema (the secrets table decrypt needs it).

PGCRYPTO decrypt SQL (copy from worker readSecret):
```sql
UPDATE secrets SET last_used_at = NOW() WHERE name = ${name}
RETURNING pgp_sym_decrypt(ciphertext::bytea, ${env.PGCRYPTO_MASTER_KEY}) AS plaintext
```
result rows access pattern: `const rows = (result as any)?.rows ?? (result as any); rows[0]?.plaintext`.

TEST PATTERN (mirror services/worker/src/lib/secrets.test.ts): vi.mock("./env.js") returning getEnv with fixed PGCRYPTO_MASTER_KEY + env fallbacks; `executeMock = vi.fn()` as `mockDb.execute`; assert DB-first wins, env-fallback on null, and JSON.stringify(sql) contains expected fragments.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Worker WhatsApp secret readers + adapter cred injection + consumer switch</name>
  <files>services/worker/src/lib/secrets.ts, services/worker/src/lib/secrets.test.ts, packages/whatsapp/src/sdk-impl.ts, packages/whatsapp/src/types.ts, packages/whatsapp/src/index.ts, services/worker/src/domain/sendMessage.ts, services/worker/src/queues/housekeeping.ts</files>
  <behavior>
    - getWhatsAppAccessToken(db): returns secrets.whatsapp_access_token when present; else env.WHATSAPP_ACCESS_TOKEN; else throws (matches getStripeSecretKey error shape).
    - getWhatsAppPhoneNumberId(db): returns secrets.whatsapp_phone_number_id; else env.WHATSAPP_PHONE_NUMBER_ID; else throws.
    - getWhatsAppBusinessAccountId(db): returns secrets.whatsapp_business_account_id; else env.WHATSAPP_BUSINESS_ACCOUNT_ID; else returns null (it is OPTIONAL — do NOT throw; the templates-sync handler already guards on absence and logs+skips).
    - Each reader prefers DB over env (test: DB hit wins; test: DB miss falls back to env).
    - sendText/sendTemplate accept optional { accessToken, phoneNumberId } creds; when provided they are used instead of process.env (backward-compatible: when omitted, fall back to process.env exactly as today so other callers/tests are unaffected).
  </behavior>
  <action>
1. services/worker/src/lib/secrets.ts — add THREE readers below getStripeSecretKey, mirroring its exact DB-first/env-fallback shape:
   - `getWhatsAppAccessToken(db)`: `readSecret("whatsapp_access_token", db)` → `env.WHATSAPP_ACCESS_TOKEN` → throw "No WhatsApp access token available — neither secrets.whatsapp_access_token nor env WHATSAPP_ACCESS_TOKEN is set".
   - `getWhatsAppPhoneNumberId(db)`: `readSecret("whatsapp_phone_number_id", db)` → `env.WHATSAPP_PHONE_NUMBER_ID` → throw analogous message.
   - `getWhatsAppBusinessAccountId(db)`: `readSecret("whatsapp_business_account_id", db)` → `env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null` → return null (NOT throw — it is optional in env and the WA-08 handler already handles absence).
   Reuse the existing `readSecret` + `getEnv` already in the file.

2. packages/whatsapp/src/types.ts — add an optional creds type so the worker can inject DB-resolved values:
   - Add `export type WhatsAppCreds = { accessToken: string; phoneNumberId: string };`
   - Extend `SendTextArgs` and `SendTemplateArgs` Zod schemas? NO — keep the Zod arg schemas for {to,body}/{to,name,vars,language} unchanged. Instead pass creds as a SECOND optional parameter to sendText/sendTemplate (see step 3) so the validated payload contract stays identical and existing tests keep passing.

3. packages/whatsapp/src/sdk-impl.ts — make creds injectable WITHOUT breaking the env-default path:
   - Change `getSdk()` → `getSdk(token?: string)`: `const t = token ?? process.env.WHATSAPP_ACCESS_TOKEN; if (!t) throw ...`. (Do NOT cache the singleton when an explicit token is passed — only memoize the env-default client. Simplest: when `token` is provided, build and return a fresh Client; only memoize the no-arg env path in `_sdk`.)
   - Change `getPhoneNumberId(id?: string)`: `const v = id ?? process.env.WHATSAPP_PHONE_NUMBER_ID; if (!v) throw ...`.
   - `sendText(args, creds?: WhatsAppCreds)`: pass `creds?.accessToken` into getSdk and `creds?.phoneNumberId` into getPhoneNumberId.
   - `sendTemplate(args, creds?: WhatsAppCreds)`: same.
   - Keep `_resetSdkForTests()` as-is.

4. packages/whatsapp/src/index.ts — also export the new `WhatsAppCreds` type alongside the existing exports.

5. services/worker/src/domain/sendMessage.ts — resolve creds DB-first and pass them into the adapter:
   - Import `getWhatsAppAccessToken, getWhatsAppPhoneNumberId` from "../lib/secrets.js".
   - Immediately before the adapter call block (the `try { if (payload.type === "text") ...`), resolve once: `const creds = { accessToken: await getWhatsAppAccessToken(db), phoneNumberId: await getWhatsAppPhoneNumberId(db) };`
   - Pass `creds` as the 2nd arg: `sendText({ to, body: payload.body }, creds)` and `sendTemplate({ ... }, creds)`.
   - Do NOT change gate order, error handling, or status-write logic.

6. services/worker/src/queues/housekeeping.ts — switch the templates-sync handler off env:
   - Import `getWhatsAppAccessToken, getWhatsAppBusinessAccountId` from "../lib/secrets.js" and `getDb` is already imported.
   - In the `boss.work(TEMPLATES_SYNC_QUEUE, ...)` handler: `const db = getDb(); const wabaId = await getWhatsAppBusinessAccountId(db);` then `if (!wabaId) { log.warn(... existing skip message ...); return; }`. Replace the old `env.WHATSAPP_BUSINESS_ACCOUNT_ID` guard.
   - `const accessToken = await getWhatsAppAccessToken(db);` then call `syncWhatsAppTemplates(accessToken, wabaId, db)`. (syncTemplates.ts itself is already parameterised — leave it unchanged.)
   - Remove the now-unused `getEnv` import from housekeeping.ts only if nothing else uses it.

7. Update services/worker/src/lib/secrets.test.ts — add cases mirroring the getStripeSecretKey tests: extend the vi.mock env to include WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_BUSINESS_ACCOUNT_ID fallbacks; assert each reader prefers DB over env (executeMock.mockResolvedValueOnce({rows:[{plaintext:"db_val"}]}) → returns db_val) and falls back to env on `{rows:[]}`; assert getWhatsAppBusinessAccountId returns null when both DB miss AND env undefined (set that env key undefined in a dedicated case).

Run prettier on all touched files after editing (npx prettier --write).

Note: this is the WA-05 send chokepoint + WA-08 sync wiring. Per CLAUDE.md, packages/whatsapp is a publishable-package-adjacent change but `packages/whatsapp` is private to this fork (not in the @agent-native publishable set) — no changeset needed; if `pnpm` flags one, the file lives under services/packages of the gymos fork, skip.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker exec vitest run src/lib/secrets.test.ts src/domain/sendMessage.test.ts</automated>
  </verify>
  <done>secrets.test.ts passes new WhatsApp reader cases (DB-first, env-fallback, BusinessAccountId null-on-miss); sendMessage.test.ts still green (adapter creds injection is backward-compatible — the mocked @gymos/whatsapp accepts the extra arg); sendMessage.ts and housekeeping.ts contain no `process.env.WHATSAPP_*` / `env.WHATSAPP_*` reads for these creds.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: edge-webhooks secrets reader with TTL cache + whatsapp route switch</name>
  <files>services/edge-webhooks/src/lib/secrets.ts, services/edge-webhooks/src/lib/secrets.test.ts, services/edge-webhooks/src/lib/env.ts, services/edge-webhooks/src/routes/whatsapp.ts</files>
  <behavior>
    - readSecret(name, db): mirrors worker — UPDATE secrets SET last_used_at=NOW() ... RETURNING pgp_sym_decrypt(...); returns plaintext or null.
    - getWhatsAppVerifyToken(db): secrets.whatsapp_verify_token → env.WHATSAPP_VERIFY_TOKEN → throw.
    - getWhatsAppAppSecret(db): secrets.whatsapp_app_secret → env.WHATSAPP_APP_SECRET → throw.
    - Both reads are wrapped in a short in-memory TTL cache (default 60s) keyed by secret name so the inbound POST hot path does not hit Postgres on every webhook. Cache returns the previously-resolved value until TTL expires, then re-resolves DB-first.
    - Env fallback is RETAINED (hard requirement): if the DB read returns null/throws transiently, env still answers. A successful resolve (DB or env) is what gets cached.
    - Test: cache returns the same value within TTL without a second db.execute call; after TTL (advance fake timers) it re-queries.
  </behavior>
  <action>
1. services/edge-webhooks/src/lib/env.ts — ADD `PGCRYPTO_MASTER_KEY: z.string().min(16)` to the EnvSchema (the decrypt SQL needs it). Strictly additive; do not remove existing fields. WHATSAPP_VERIFY_TOKEN / WHATSAPP_APP_SECRET stay required (they ARE the env fallback).

2. CREATE services/edge-webhooks/src/lib/secrets.ts mirroring the worker's secrets.ts adapted to edge-webhooks db:
   - `import { sql } from "drizzle-orm"; import { getEnv } from "./env.js"; import type { getDb } from "./db.js";`
   - `readSecret(name, db)`: same UPDATE...RETURNING pgp_sym_decrypt SQL as the worker; `const rows = (result as any)?.rows ?? (result as any); if (!rows?.length) return null; return rows[0].plaintext as string;` Add `// guard:allow-unscoped — secrets is studio-global (one studio per deploy)`.
   - In-memory TTL cache: module-level `const cache = new Map<string, { value: string; expires: number }>(); const TTL_MS = 60_000;`. Helper `async function resolveCached(name, db, resolver): Promise<string>` that checks the cache (not expired → return), else `const v = await resolver(); cache.set(name, { value: v, expires: Date.now() + TTL_MS }); return v;`.
   - `getWhatsAppVerifyToken(db)`: resolver = `readSecret("whatsapp_verify_token", db)` → `getEnv().WHATSAPP_VERIFY_TOKEN` → throw "No WhatsApp verify token available — ...". Wrap via resolveCached("whatsapp_verify_token", ...).
   - `getWhatsAppAppSecret(db)`: resolver = `readSecret("whatsapp_app_secret", db)` → `getEnv().WHATSAPP_APP_SECRET` → throw. Wrap via resolveCached.
   - Export a `_resetSecretsCacheForTests()` that clears the Map (tests + safety).

3. services/edge-webhooks/src/routes/whatsapp.ts — switch both reads off env:
   - Import `{ getWhatsAppVerifyToken, getWhatsAppAppSecret }` from "../lib/secrets.js" and `{ getDb }` from "../lib/db.js".
   - GET handler: make it `async`; `const verifyToken = await getWhatsAppVerifyToken(getDb());` and compare `token === verifyToken` (replace `env.WHATSAPP_VERIFY_TOKEN`). Keep the rest of the handshake unchanged.
   - POST handler: keep RAW-BODY-FIRST discipline (`await c.req.text()` MUST remain the first statement before any verification). Resolve `const appSecret = await getWhatsAppAppSecret(getDb());` AFTER reading raw + sigHeader but BEFORE `verifySignature(raw, sigHeader, appSecret)`. Replace `env.WHATSAPP_APP_SECRET`.
   - Drop the now-unused `getEnv()`/`env` references for these two fields (if `getEnv` is no longer used in the file at all, remove its import).
   - Do NOT change line-order invariant: `await c.req.text()` stays the first body operation (PITFALL #9). Resolving the app secret is a DB/cache read, not a body read, so it is safe after the raw read.

4. CREATE services/edge-webhooks/src/lib/secrets.test.ts mirroring services/worker/src/lib/secrets.test.ts plus cache cases:
   - vi.mock("./env.js") → getEnv returning { PGCRYPTO_MASTER_KEY: "test-master-key-1234567890abcdef", WHATSAPP_VERIFY_TOKEN: "vt_envfallback", WHATSAPP_APP_SECRET: "as_envfallback" }.
   - executeMock as mockDb.execute. beforeEach: executeMock.mockReset() AND call _resetSecretsCacheForTests().
   - readSecret returns plaintext / null cases.
   - getWhatsAppVerifyToken / getWhatsAppAppSecret: DB-first wins; env-fallback on DB miss; throw when both absent (env mock returning undefined for that field in a dedicated case).
   - CACHE: with executeMock resolving {rows:[{plaintext:"v1"}]} once, call getWhatsAppAppSecret twice → second call returns "v1" without a 2nd executeMock call (assert executeMock.mock.calls.length === 1). Then use vi.useFakeTimers()/vi.advanceTimersByTime(60_001) (or vi.setSystemTime) → third call re-queries (executeMock called again). Reset timers in afterEach.
   - assert SQL fragments: JSON.stringify(executeMock.mock.calls[0][0]) contains "UPDATE secrets", "pgp_sym_decrypt", "last_used_at = NOW()".

Run prettier on all touched files (npx prettier --write).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/edge-webhooks exec vitest run src/lib/secrets.test.ts</automated>
  </verify>
  <done>secrets.test.ts passes: readSecret, DB-first, env-fallback, throw-on-both-absent, and the TTL cache cases (single executeMock call within TTL, re-query after advancing timers). whatsapp.ts no longer reads env.WHATSAPP_VERIFY_TOKEN / env.WHATSAPP_APP_SECRET; raw-body-first line order preserved.</done>
</task>

<task type="auto">
  <name>Task 3: Typecheck both services + run full suites + confirm no residual process.env WhatsApp cred reads</name>
  <files>services/worker, services/edge-webhooks, packages/whatsapp</files>
  <action>
1. Typecheck both services and the adapter package to catch the cross-package signature change (sendText/sendTemplate now take an optional 2nd creds arg):
   - `pnpm --filter @gymos/worker exec tsc --noEmit`
   - `pnpm --filter @gymos/edge-webhooks exec tsc --noEmit`
   - `pnpm --filter @gymos/whatsapp exec tsc --noEmit` (use the actual package name from packages/whatsapp/package.json if different — read it first).
   If any filter name is wrong, read the relevant package.json `name` field and use it. Fix any type errors (most likely: the edge-webhooks GET handler must be `async` now; verify Hono accepts an async GET handler — it does, it returns a Promise<Response>).

2. Run the full unit suites for both services to confirm nothing regressed:
   - `pnpm --filter @gymos/worker exec vitest run`
   - `pnpm --filter @gymos/edge-webhooks exec vitest run`

3. Grep-confirm no residual direct cred reads remain in the migrated consumers (the adapter env-default path inside packages/whatsapp/src/sdk-impl.ts is the INTENTIONAL fallback and is allowed to keep its process.env reads):
   - There should be NO `process.env.WHATSAPP_` or `env.WHATSAPP_VERIFY_TOKEN`/`env.WHATSAPP_APP_SECRET`/`env.WHATSAPP_ACCESS_TOKEN`/`env.WHATSAPP_BUSINESS_ACCOUNT_ID` reads in: services/worker/src/domain/sendMessage.ts, services/worker/src/queues/housekeeping.ts, services/edge-webhooks/src/routes/whatsapp.ts.
   - The env SCHEMA definitions in env.ts files (the z.object fields) MUST remain — they back the env fallback. Do not remove them.

4. DEFERRED-TEST GUARD: confirm no live Meta call was added anywhere. The only network calls remain the pre-existing ones (syncTemplates fetch to graph.facebook.com behind the sync handler, and the @gymos/whatsapp SDK inside sendText/sendTemplate). No new live test harness, no real send, no real inbound webhook fired. The live WABA end-to-end test stays DEFERRED (customer-gated).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker exec tsc --noEmit && pnpm --filter @gymos/edge-webhooks exec tsc --noEmit && pnpm --filter @gymos/worker exec vitest run && pnpm --filter @gymos/edge-webhooks exec vitest run</automated>
  </verify>
  <done>Both services typecheck clean; full vitest suites green for worker and edge-webhooks; no `process.env.WHATSAPP_*` reads remain in the three migrated consumer files; env-fallback schema fields retained in both env.ts files; no live Meta send/receive test was added (deferred).</done>
</task>

</tasks>

<verification>
- Worker readers mirror getStripeSecretKey exactly (DB-first → env → throw; BusinessAccountId returns null on miss since it is optional).
- edge-webhooks gains a secrets.ts reader (none existed) with a 60s in-memory TTL cache on the inbound hot path; env fallback retained.
- sendMessage.ts, housekeeping.ts, whatsapp.ts read creds via the new readers, not process.env/env.
- Raw-body-first HMAC discipline (PITFALL #9) preserved in edge-webhooks POST handler.
- New unit tests cover DB-first, env-fallback, throw-on-absent, null-on-optional-miss, and cache TTL behavior.
- No breaking DB changes: this plan only READS the existing `secrets` table (created in P1b-02) — no schema edits, no migrations.
- LIVE WABA send/receive test explicitly DEFERRED — not attempted.
</verification>

<success_criteria>
- `pnpm --filter @gymos/worker exec vitest run` and `pnpm --filter @gymos/edge-webhooks exec vitest run` both green.
- `tsc --noEmit` clean for both services and the whatsapp adapter.
- The three consumer files contain zero WhatsApp-cred env reads; env fallback works (verified by unit test, since the DB may be empty until staff save keys in-app).
- The in-app Settings UI (writing to the pgcrypto `secrets` table) is now the single source of truth for Meta creds across both Fly processes, with env as a transparent fallback — no `fly secrets set WHATSAPP_*` required once keys are saved in-app.
</success_criteria>

<output>
After completion, create `.planning/quick/260601-muh-migrate-meta-whatsapp-credentials-in-ser/260601-muh-SUMMARY.md`.
</output>
