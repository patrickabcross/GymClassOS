---
phase: MC1-foundation-lead-event
plan: 03
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - services/worker/src/queues/meta-capi-event.ts
  - services/worker/src/index.ts
  - services/worker/src/lib/stage-event-map.ts
autonomous: true
requirements: [CAPI-04]
user_setup:
  - service: fly-worker
    why: "The worker decrypts META_CAPI_TOKEN from app_secrets using BETTER_AUTH_SECRET — it MUST be the identical value on Fly worker and Vercel staff-web (D-03), or every CAPI send silently skips"
    env_vars:
      - name: BETTER_AUTH_SECRET
        source: "MUST equal the Vercel staff-web BETTER_AUTH_SECRET. Verify with `fly secrets list -a gymos-edge-webhooks` (or the worker app) and compare to the Vercel env var."

must_haves:
  truths:
    - "The worker POSTs a Lead event to https://graph.facebook.com/v23.0/<pixelId>/events with hashed PII, plain fbc/fbp, client IP/UA, and event_time in Unix seconds"
    - "test_event_code is sent at the TOP LEVEL of the body (not inside the event), and only when configured"
    - "Transient errors (5xx, network, is_transient) re-throw to retry; permanent errors (code 190 bad token, 4xx is_transient:false) return without retry; final attempt logs FATAL and returns (event isolated, D-18)"
    - "META_CAPI_TOKEN is decrypted via readAppSecretByKey, never logged"
    - "pixelId + stageEventMap + testEventCode resolved from studio_owner_config at execution time"
    - "On send result the worker writes back lead_status + lead_sent_at on meta_lead_attribution"
    - "A boot-time decrypt self-test logs a clear warning if app_secrets cannot be read (D-04)"
  artifacts:
    - path: "services/worker/src/queues/meta-capi-event.ts"
      provides: "registerMetaCapiEventWorker + CAPI POST handler"
      contains: "graph.facebook.com/v23.0"
    - path: "services/worker/src/index.ts"
      provides: "META_CAPI_EVENT queue creation + worker registration + boot self-test"
      contains: "registerMetaCapiEventWorker"
  key_links:
    - from: "meta-capi-event.ts handler"
      to: "Meta Graph CAPI v23 endpoint"
      via: "fetch POST with access_token query param"
      pattern: "graph\\.facebook\\.com/v23\\.0"
    - from: "meta-capi-event.ts handler"
      to: "studio_owner_config + app_secrets"
      via: "readAppSecretByKey + config read"
      pattern: "readAppSecretByKey"
---

<objective>
Build the Fly worker CAPI sender: a `meta-capi-event` queue handler modeled on `outbound-whatsapp.ts` that decrypts `META_CAPI_TOKEN`, resolves pixelId/testEventCode/stageEventMap from `studio_owner_config`, builds the Graph v23 Lead payload (hashed PII + plain fbc/fbp + client IP/UA + `event_time` in seconds + top-level `test_event_code`), POSTs it, splits terminal vs retryable errors, and writes back send status to `meta_lead_attribution`. Plus a boot-time decrypt self-test (D-04).

Purpose: This is the single chokepoint that talks to Meta (D-01). Durable retry on 5xx (CAPI-04); per-event isolation (D-18); token never logged or sent client-side (D-17).
Output: `services/worker/src/queues/meta-capi-event.ts`, queue registration + boot self-test in `index.ts`, and a worker-side copy of the stageEventMap resolver.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md
@.planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md
@.planning/phases/MC1-foundation-lead-event/MC1-02-SUMMARY.md

<interfaces>
<!-- The frozen queue contract from MC1-02 — build the handler against this verbatim. -->
MetaCapiEventPayload fields: eventId, memberId, eventName, actionSource, eventTime (Unix seconds),
  eventSourceUrl?, hashedEmail?, hashedPhone?, hashedFn?, hashedLn?, fbc?, fbp?, clientIp?, clientUserAgent?
pixelId is NOT in the payload — resolve from studio_owner_config at execution time.

<!-- Worker decrypt + schema access (verified file paths from MC1-RESEARCH canonical refs). -->
services/worker/src/lib/appSecrets.ts — readAppSecretByKey(key, db) returns string|null (worker-side AES-256-GCM via BETTER_AUTH_SECRET).
services/worker/src/lib/env.ts — worker DB connection (DATABASE_URL_UNPOOLED).
services/worker/src/queues/outbound-whatsapp.ts — the canonical register/handler/retry/final-attempt template to copy.
services/worker/src/queues/telemetry-push.ts — the closest outbound-HTTP-to-external + unconfigured-skip analog.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Worker-side stageEventMap resolver</name>
  <files>services/worker/src/lib/stage-event-map.ts</files>
  <read_first>
    - services/worker/src/lib/ — confirm helper-file conventions (this is the worker's lib dir; check an existing lib file's import/export style).
    - .planning/phases/MC1-foundation-lead-event/MC1-01-SUMMARY.md — the staff-web resolver this mirrors (same logic, worker copy because the worker is a separate build that does not import from apps/staff-web).
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 12".
  </read_first>
  <action>
    Create `services/worker/src/lib/stage-event-map.ts` — an identical pure resolver to the staff-web one (the worker is a separate build and cannot import from `apps/staff-web`):
    ```typescript
    export const DEFAULT_STAGE_EVENT_MAP = {
      lead: "Lead",
      contact: "Contact",
      purchase: "Purchase",
      schedule: "Schedule",
    } as const;
    export type StageKey = keyof typeof DEFAULT_STAGE_EVENT_MAP;
    export function resolveStageEvent(
      config: string | Record<string, string> | null | undefined,
      stage: StageKey,
    ): string {
      if (!config) return DEFAULT_STAGE_EVENT_MAP[stage];
      let map: Record<string, string>;
      if (typeof config === "string") {
        try { map = JSON.parse(config) as Record<string, string>; }
        catch { return DEFAULT_STAGE_EVENT_MAP[stage]; }
      } else { map = config; }
      const v = map[stage];
      return typeof v === "string" && v.length > 0 ? v : DEFAULT_STAGE_EVENT_MAP[stage];
    }
    ```
    Handle BOTH a JSON string and an already-parsed object (the JSONB column may read back as an object depending on the worker's Drizzle/driver). Never throw.
  </action>
  <verify>
    <automated>grep -n "resolveStageEvent" services/worker/src/lib/stage-event-map.ts && grep -n 'lead: "Lead"' services/worker/src/lib/stage-event-map.ts</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/lib/stage-event-map.ts` exports `resolveStageEvent` and `DEFAULT_STAGE_EVENT_MAP`
    - Defaults are `{ lead: "Lead", contact: "Contact", purchase: "Purchase", schedule: "Schedule" }`
    - Resolver accepts string OR object config and never throws on malformed input
  </acceptance_criteria>
  <done>Worker has its own pure stageEventMap resolver (string + object input safe).</done>
</task>

<task type="auto">
  <name>Task 2: meta-capi-event.ts worker handler (CAPI v23 POST + error split + status write-back)</name>
  <files>services/worker/src/queues/meta-capi-event.ts</files>
  <read_first>
    - services/worker/src/queues/outbound-whatsapp.ts — READ IN FULL. Copy its exact structure: the `registerXWorker(boss)` export, the `boss.work(QUEUE_NAMES.X, { batchSize: 1, localConcurrency: 1, includeMetadata: true }, async (jobs) => {...})` shape, payload `.parse(job.data)`, the retryCount/retryLimit final-attempt branch, and the logger usage.
    - services/worker/src/queues/telemetry-push.ts — the outbound `fetch()` to an external HTTP API + the unconfigured-skip (return-cleanly) pattern.
    - services/worker/src/lib/appSecrets.ts — `readAppSecretByKey(key, db)` signature.
    - services/worker/src/lib/env.ts + how outbound-whatsapp.ts obtains its DB handle — copy the same DB access.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 1", "Pattern 6", "Pattern 7", and "Code Examples → CAPI POST fetch".
  </read_first>
  <action>
    Create `services/worker/src/queues/meta-capi-event.ts` exporting `registerMetaCapiEventWorker(boss)`. Mirror `outbound-whatsapp.ts` structure exactly. Inside `boss.work(QUEUE_NAMES.META_CAPI_EVENT, { batchSize: 1, localConcurrency: 1, includeMetadata: true }, async (jobs) => { ... })`:

    1. `const data = MetaCapiEventPayload.parse(job.data);` (import from `@gymos/queue`).

    2. Resolve config from `studio_owner_config` singleton via the worker's DB handle (same DB access pattern as outbound-whatsapp.ts). Read `meta_pixel_id`, `meta_test_event_code`, `meta_stage_event_map`. Use a raw SQL select or the Drizzle `studioOwnerConfig` export — match how outbound-whatsapp.ts reads config. If no singleton row OR `meta_pixel_id` is null/empty → **unconfigured-skip**: `log.warn({ eventId: data.eventId }, "[meta-capi-event] pixelId not configured — skipping")` and `return` (NO throw — per telemetry-push.ts unconfigured pattern).

    3. `const token = await readAppSecretByKey("META_CAPI_TOKEN", db);` If `!token` → unconfigured-skip (warn + return). NEVER log the token value — log only presence/absence.

    4. Resolve event name: `const eventName = resolveStageEvent(config.metaStageEventMap, "lead");` (import the worker resolver from Task 1). For MC1 the payload's `eventName` is already "Lead"; prefer the resolver result so a renamed map flows through without code change (D-05 forward-compat). Use `data.eventName || eventName`.

    5. Build the CAPI body EXACTLY (RESEARCH Pattern 1). `event_time` is Unix SECONDS (already seconds in `data.eventTime` — do NOT divide again). `test_event_code` at TOP LEVEL, only when `meta_test_event_code` is set:
    ```typescript
    const userData: Record<string, unknown> = {};
    if (data.hashedEmail) userData.em = [data.hashedEmail];
    if (data.hashedPhone) userData.ph = [data.hashedPhone];
    if (data.hashedFn) userData.fn = data.hashedFn;
    if (data.hashedLn) userData.ln = data.hashedLn;
    if (data.fbc) userData.fbc = data.fbc;                       // PLAIN
    if (data.fbp) userData.fbp = data.fbp;                       // PLAIN
    if (data.clientIp) userData.client_ip_address = data.clientIp;       // PLAIN
    if (data.clientUserAgent) userData.client_user_agent = data.clientUserAgent; // PLAIN
    const capiBody: Record<string, unknown> = {
      data: [{
        event_name: data.eventName || eventName,
        event_time: data.eventTime,        // Unix SECONDS
        event_id: data.eventId,            // shared with browser Pixel (dedup)
        action_source: data.actionSource,  // "website"
        ...(data.eventSourceUrl ? { event_source_url: data.eventSourceUrl } : {}),
        user_data: userData,
      }],
    };
    if (config.metaTestEventCode) capiBody.test_event_code = config.metaTestEventCode;
    const endpoint = `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${token}`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiBody),
    });
    const respJson = await resp.json().catch(() => ({} as any));
    ```

    6. Error split (RESEARCH Pattern 7):
    ```typescript
    const metaError = (respJson as any)?.error;
    const isPermanent =
      !resp.ok &&
      (metaError?.is_transient === false ||
       metaError?.code === 190 ||
       (resp.status >= 400 && resp.status < 500 && metaError?.is_transient !== true));
    ```
    - On `resp.ok`: write back `lead_status='sent'`, `lead_sent_at=NOW()` on `meta_lead_attribution` for `data.memberId`; `log.info({ eventId: data.eventId, fbtrace: respJson?.fbtrace_id }, "[meta-capi-event] sent")`; return.
    - On `isPermanent`: write `lead_status='failed'`; `log.warn({ eventId: data.eventId, error: metaError }, "[meta-capi-event] permanent error — not retrying")`; return (pg-boss marks complete — never retried).
    - Else (transient/retryable): if final attempt (`job.retryCount >= job.retryLimit` — fields available because `includeMetadata: true`): write `lead_status='failed'`, `log.error(... "[meta-capi-event] giving up after final retry")`, return (event lost but ISOLATED, D-18). Otherwise `throw new Error("Meta CAPI " + resp.status + ": " + JSON.stringify(metaError))` so pg-boss retries with backoff.

    7. Wrap network/fetch exceptions: a thrown fetch (ECONNREFUSED/ETIMEDOUT) propagates as retryable — same final-attempt guard applies (on final attempt write `lead_status='failed'` and return; otherwise let it throw to retry). Match outbound-whatsapp.ts's try/catch-and-final-attempt shape.

    The `lead_status`/`lead_sent_at` write uses a single `UPDATE meta_lead_attribution SET lead_status=..., lead_sent_at=NOW(), updated_at=NOW() WHERE member_id = ${data.memberId}` — add the `// guard:allow-unscoped — single-tenant meta attribution` marker comment above any raw query on this single-tenant table.

    NEVER log `token`. Run prettier.
  </action>
  <verify>
    <automated>grep -n "graph.facebook.com/v23.0" services/worker/src/queues/meta-capi-event.ts && grep -n "test_event_code" services/worker/src/queues/meta-capi-event.ts && grep -n "is_transient" services/worker/src/queues/meta-capi-event.ts && grep -n "readAppSecretByKey" services/worker/src/queues/meta-capi-event.ts && grep -n "lead_status" services/worker/src/queues/meta-capi-event.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exports `registerMetaCapiEventWorker`
    - `boss.work` call uses `includeMetadata: true`
    - Endpoint string is `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${token}` (v23, token as query param)
    - `event_time: data.eventTime` is used directly (no `/1000` re-division in the worker)
    - `test_event_code` is set on `capiBody` at the top level (a sibling of `data`), guarded by `config.metaTestEventCode`
    - `fbc`, `fbp`, `client_ip_address`, `client_user_agent` are assigned from plain values (NOT passed through any hash function)
    - Permanent-error branch checks `metaError?.code === 190` and `is_transient === false`; returns without throwing
    - Retryable branch `throw`s except on final attempt (`retryCount >= retryLimit`) where it writes `lead_status='failed'` and returns
    - On 2xx, an `UPDATE meta_lead_attribution SET lead_status='sent', lead_sent_at=NOW()` runs for `data.memberId`, with a `guard:allow-unscoped` marker comment
    - The unconfigured-skip path (`!token` or no pixelId) returns without throwing
    - No `token` value is interpolated into any `log.*` call (grep: no `log.*token` printing the value)
  </acceptance_criteria>
  <done>Worker handler POSTs Graph v23 Lead with correct payload shape, splits terminal/retryable errors, writes send status, never logs the token.</done>
</task>

<task type="auto">
  <name>Task 3: Register the queue + worker in index.ts + boot-time decrypt self-test (D-04)</name>
  <files>services/worker/src/index.ts</files>
  <read_first>
    - services/worker/src/index.ts — read the `createQueue` loop (the `for (const q of [...])` block ~line 45) and the `registerXWorker(boss)` registration calls (~lines 68-78). The new queue + registration slot in alongside these.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 11 → Boot-time self-test".
  </read_first>
  <action>
    1. Import: `import { registerMetaCapiEventWorker } from "./queues/meta-capi-event.js";` (use the `.js` extension to match the existing ESM import style in this file).

    2. Add `QUEUE_NAMES.META_CAPI_EVENT` to the `for (const q of [ ... ])` createQueue array (alongside `QUEUE_NAMES.CLASS_MATERIALIZE` etc.) so the queue exists before staff-web's `send()` runs.

    3. Add the registration after the existing ones (e.g. after `registerStripeEventWorker`):
    ```typescript
    await registerMetaCapiEventWorker(boss);
    log.info("[worker] meta-capi-event queue registered");
    ```

    4. Boot-time decrypt self-test (D-04) — after `boss.start()` and after the worker DB handle is available, attempt a known-secret decrypt and log loudly on failure. Test against an already-configured key (`WHATSAPP_ACCESS_TOKEN`) so a `null` is unambiguous evidence of `BETTER_AUTH_SECRET` drift:
    ```typescript
    try {
      const probe = await readAppSecretByKey("WHATSAPP_ACCESS_TOKEN", db);
      if (probe === null) {
        log.error(
          "[worker] BOOT SELF-TEST: could not decrypt a known app_secret. " +
          "Verify BETTER_AUTH_SECRET on the Fly worker matches the Vercel staff-web value (D-03) — " +
          "otherwise META_CAPI_TOKEN cannot be decrypted and every CAPI send will silently skip.",
        );
      } else {
        log.info("[worker] boot self-test: app_secrets decrypt OK");
      }
    } catch (err) {
      log.error({ err }, "[worker] BOOT SELF-TEST: app_secrets decrypt threw");
    }
    ```
    Do NOT log the decrypted value. Do NOT crash the process on failure (warn loudly; the worker must still run other queues). Use the same `db` handle and `readAppSecretByKey` import the new handler uses.

    Run prettier.
  </action>
  <verify>
    <automated>grep -n "registerMetaCapiEventWorker" services/worker/src/index.ts && grep -n "META_CAPI_EVENT" services/worker/src/index.ts && grep -n "BOOT SELF-TEST" services/worker/src/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/index.ts` imports `registerMetaCapiEventWorker` from `./queues/meta-capi-event.js`
    - `QUEUE_NAMES.META_CAPI_EVENT` is in the `createQueue` loop array
    - `await registerMetaCapiEventWorker(boss)` is called in the registration sequence with a log line
    - A boot self-test block calls `readAppSecretByKey("WHATSAPP_ACCESS_TOKEN", db)` and `log.error`s a BETTER_AUTH_SECRET-drift message when it returns null, without crashing the process
    - The self-test does not log any decrypted secret value
  </acceptance_criteria>
  <done>meta-capi-event queue is created + registered on boot; a decrypt self-test surfaces BETTER_AUTH_SECRET drift loudly.</done>
</task>

</tasks>

<verification>
- `services/worker/src/queues/meta-capi-event.ts` exists with v23 endpoint, top-level test_event_code, error split, status write-back.
- Worker resolver + index registration + boot self-test present.
- `npx tsc --noEmit` (or the worker's typecheck script) passes for services/worker.
- D-03 checklist: SUMMARY must instruct verifying `BETTER_AUTH_SECRET` is identical on the Fly worker and Vercel staff-web (`fly secrets list` vs Vercel env), and that the boot self-test logged "decrypt OK" after deploy.
</verification>

<success_criteria>
- CAPI-04: pg-boss meta-capi-event worker POSTs to Meta CAPI (Graph v23) with SHA-256-hashed email/phone + fbc/fbp + client IP/UA, retries on 5xx/network (events never dropped), and a failing send for one event is isolated (D-18). Token read from app_secrets, never logged, never client-side (D-17).
</success_criteria>

<output>
After completion, create `.planning/phases/MC1-foundation-lead-event/MC1-03-SUMMARY.md`.
Flag the D-03 BETTER_AUTH_SECRET parity check and the post-deploy boot-self-test log line as explicit verification steps.
</output>
