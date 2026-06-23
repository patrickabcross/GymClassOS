---
phase: MC1-foundation-lead-event
plan: "03"
subsystem: infra
tags: [meta, capi, pg-boss, fly, worker, conversions-api, graph-api]

# Dependency graph
requires:
  - phase: MC1-01
    provides: meta_lead_attribution table + stageEventMap resolver + META_CAPI_TOKEN secret registration
  - phase: MC1-02
    provides: QUEUE_NAMES.META_CAPI_EVENT + MetaCapiEventPayload Zod schema + enqueueMetaCapiEvent()
provides:
  - registerMetaCapiEventWorker — pg-boss subscriber that POSTs Lead events to Meta Graph v23
  - Worker-side stageEventMap resolver (pure copy, separate build boundary)
  - Boot-time decrypt self-test (D-04) — surfaces BETTER_AUTH_SECRET drift loudly on startup
  - Queue created in index.ts createQueue loop so the queue exists before staff-web enqueues
affects:
  - MC2 (Contact/Purchase/Schedule senders share the same chokepoint handler pattern)
  - Any deploy that needs CAPI sends to work — parity of BETTER_AUTH_SECRET is a hard gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker CAPI sender: boss.work(QUEUE_NAMES.X, { batchSize:1, localConcurrency:1, includeMetadata:true })"
    - "Permanent vs transient Meta error split: code 190 | is_transient:false = permanent (no retry); 5xx/network = retryable throw"
    - "Per-event isolation (D-18): final-attempt branch writes lead_status=failed and returns — process never crashes"
    - "Token security: readAppSecretByKey — token is never interpolated into any log.* call"
    - "Worker DB access: raw db.execute(sql`...`) with guard:allow-unscoped marker — NO staff-web Drizzle import"
    - "Unconfigured-skip: missing pixelId or token = log.warn + return (never throw) — queue stays healthy"
    - "Boot self-test: readAppSecretByKey(WHATSAPP_ACCESS_TOKEN) on startup — null result = prominent error log (D-04)"

key-files:
  created:
    - services/worker/src/queues/meta-capi-event.ts
    - services/worker/src/lib/stage-event-map.ts
  modified:
    - services/worker/src/index.ts

key-decisions:
  - "Worker does NOT import apps/staff-web/server/db/schema.ts — all meta_lead_attribution access is raw parameterized SQL via db.execute(sql`...`) (RESEARCH Open Q3)"
  - "event_time is NOT re-divided in the worker — data.eventTime is already Unix seconds from the submit handler"
  - "test_event_code is a TOP-LEVEL key (sibling of data array), NOT inside the event object — per Meta Graph API v23 spec"
  - "fbc/fbp/client_ip_address/client_user_agent are PLAIN (not hashed) — em/ph/fn/ln arrive pre-hashed SHA-256 from the submit handler"
  - "Boot self-test probes WHATSAPP_ACCESS_TOKEN (an already-configured key) — null result is unambiguous evidence of BETTER_AUTH_SECRET drift"
  - "BETTER_AUTH_SECRET parity (D-03) deferred to deploy-time: code self-test is in place; human parity check recorded as a post-deploy required action"

patterns-established:
  - "Pattern: stageEventMap resolver must be duplicated per build boundary — pure function, no framework deps"
  - "Pattern: unconfigured secrets are a warn+return, not a throw — the queue stays healthy and activates without redeploy"
  - "Pattern: final-attempt isolation — always write lead_status=failed and return on retryCount >= retryLimit; never crash the worker"

requirements-completed: [CAPI-04]

# Metrics
duration: deferred-close (code tasks completed prior session; summary written on plan close)
completed: 2026-06-23
---

# Phase MC1 Plan 03: Worker CAPI Sender Summary

**pg-boss `meta-capi-event` worker sends deduplicated Lead events to Meta Graph v23 with durable 5xx retry, permanent-vs-transient error isolation, raw-SQL write-back, and a boot decrypt self-test that surfaces BETTER_AUTH_SECRET drift loudly**

## Performance

- **Duration:** Deferred close (3 code tasks completed in prior session; summary + state update written on checkpoint resolution)
- **Started:** Prior session (2026-06-23)
- **Completed:** 2026-06-23
- **Tasks:** 4 (Tasks 1-3 code-complete; Task 4 resolved as deploy-time gate)
- **Files modified:** 3

## Accomplishments

- Created `services/worker/src/queues/meta-capi-event.ts` — the sole CAPI send chokepoint (D-01): decrypts `META_CAPI_TOKEN`, resolves pixelId/testEventCode/stageEventMap from `studio_owner_config` at runtime, POSTs to `graph.facebook.com/v23.0/<pixelId>/events`, splits permanent vs retryable errors, writes `lead_status`+`lead_sent_at` back to `meta_lead_attribution` via raw parameterized SQL (no staff-web Drizzle import), never logs the token
- Created `services/worker/src/lib/stage-event-map.ts` — worker-side copy of the stageEventMap resolver (pure function; worker is a separate build and cannot import from `apps/staff-web`); accepts both JSON string and pre-parsed object; never throws
- Extended `services/worker/src/index.ts` — added `META_CAPI_EVENT` to the `createQueue` loop (queue exists before staff-web enqueues); registered `registerMetaCapiEventWorker`; added D-04 boot decrypt self-test that logs a prominent error when `BETTER_AUTH_SECRET` drift prevents decryption

## Task Commits

Each task was committed atomically:

1. **Task 1: Worker-side stageEventMap resolver** - `8f437051` (feat)
2. **Task 2: meta-capi-event.ts worker handler** - `52cbb78e` (feat)
3. **Task 3: Register queue + worker + boot self-test** - `074d0a9e` (feat)
4. **Task 4: BETTER_AUTH_SECRET parity check** - Resolved as deploy-time gate (no code commit — the boot self-test from Task 3 IS the runtime confirmation mechanism; human parity check is a required post-deploy action)

**Plan metadata:** (this summary commit)

## Files Created/Modified

- `services/worker/src/queues/meta-capi-event.ts` — CAPI v23 sender: config resolution, token decrypt, Graph API POST, permanent/retryable error split, raw SQL write-back, unconfigured-skip
- `services/worker/src/lib/stage-event-map.ts` — Worker-local stageEventMap resolver (separate build copy; accepts string | object | null)
- `services/worker/src/index.ts` — Added META_CAPI_EVENT queue creation, registerMetaCapiEventWorker registration, D-04 boot decrypt self-test

## Decisions Made

- Worker does NOT import `apps/staff-web/server/db/schema.ts` — all `meta_lead_attribution` access is raw `db.execute(sql`...`)` with `// guard:allow-unscoped — worker post-send status write` marker (RESEARCH Open Q3 constraint)
- `event_time` is NOT re-divided in the worker — `data.eventTime` arrives already in Unix seconds from the submit handler; dividing again would underflow to sub-second timestamps
- `test_event_code` is set as a TOP-LEVEL key on `capiBody` (sibling of `data` array), per Meta Graph v23 spec — it must NOT be inside the event object
- `fbc`/`fbp`/`client_ip_address`/`client_user_agent` are passed through as PLAIN values; only `em`/`ph`/`fn`/`ln` arrive pre-hashed SHA-256 from the submit handler
- Boot self-test probes `WHATSAPP_ACCESS_TOKEN` (a key that is always set in production) — a `null` result is unambiguous evidence of `BETTER_AUTH_SECRET` drift, not just an unconfigured CAPI token
- BETTER_AUTH_SECRET parity (D-03) is a deploy-time gate: the code infrastructure (boot self-test) is in place; the human confirmation step is deferred to post-deploy and recorded below as a required action

## Deviations from Plan

None — plan executed exactly as written. Task 4 (human-verify checkpoint) resolved by operator approval as a deploy-time gate per instructions; deferred verification is recorded in the "Post-Deploy Actions Required" section below.

---

## Post-Deploy Actions Required

These steps MUST be completed after `git push origin master` deploys the worker. CAPI sends silently no-op until both are confirmed.

### D-03: BETTER_AUTH_SECRET Parity (REQUIRED — CAPI sends are silent no-ops until this passes)

The worker decrypts `META_CAPI_TOKEN` from `app_secrets` using key material derived from `BETTER_AUTH_SECRET` (`sha256(SECRETS_ENCRYPTION_KEY || BETTER_AUTH_SECRET)`). If the Fly worker's `BETTER_AUTH_SECRET` differs from the Vercel staff-web value, `readAppSecretByKey` returns `null` — every CAPI send is silently skipped with a `[meta-capi-event] META_CAPI_TOKEN not configured in app_secrets — skipping` warning.

**Steps:**

1. Confirm the worker Fly app name from `services/worker/fly.toml` (likely `gymos-edge-webhooks` or a worker sibling app).

2. List the worker's secrets to confirm `BETTER_AUTH_SECRET` is present:
   ```
   fly secrets list -a <worker-app>
   ```
   (`fly secrets list` shows a digest, not the plaintext value — confirm presence, not value.)

3. Read the Vercel staff-web `BETTER_AUTH_SECRET` Production value from the Vercel dashboard:
   → gym-class-os project → Settings → Environment Variables → `BETTER_AUTH_SECRET` (Production)

4. If `BETTER_AUTH_SECRET` is absent on the worker OR you are not certain the values are byte-for-byte identical, set it on the worker to match:
   ```
   fly secrets set BETTER_AUTH_SECRET="<exact-staff-web-value>" -a <worker-app>
   ```
   This triggers a worker redeploy automatically.

5. After the worker boots (or reboots), confirm the Task 3 boot self-test passed:
   ```
   fly logs -a <worker-app>
   ```
   Look for: `[worker] boot self-test: app_secrets decrypt OK`

   If instead you see: `[worker] BOOT SELF-TEST: could not decrypt a known app_secret` — the secrets still differ. Repeat step 4.

**Do NOT rely on any CAPI send being delivered until both (a) `BETTER_AUTH_SECRET` is confirmed identical and (b) the boot self-test logged "decrypt OK".**

### Migration Drift: v31 + v32 must be applied to gymos-demo Neon

Migrations `v31` (studio_owner_config meta columns) and `v32` (meta_lead_attribution table) are applied via `runMigrations` on staff-web boot. Confirm they ran after deploy:

1. Check Neon gymos-demo project → Tables browser, confirm `meta_lead_attribution` exists with columns `member_id`, `fbc`, `fbp`, `initial_event_id`, `lead_status`, `lead_sent_at`, `last_error`, `updated_at`.
2. Confirm `studio_owner_config` has columns `meta_pixel_id`, `meta_test_event_code`, `meta_stage_event_map`.
3. If missing, the migrations did not auto-run (migration-drift gotcha). Apply manually via Neon MCP or SQL console from the migration SQL files in `apps/staff-web/server/db/migrations/`.

---

## Known Stubs

None — the worker handler is fully wired. The unconfigured-skip path (missing pixelId or token) is intentional behavior, not a stub.

## Issues Encountered

None during code tasks. Task 4 was a human-verify checkpoint resolved by operator approval as a deploy-time gate.

## Next Phase Readiness

MC1 is code-complete across all 5 plans (MC1-01 through MC1-05). The full Lead event pipeline is in place:
- Browser Pixel fires on form submit with shared `event_id` (MC1-04, PIX-01)
- `embed.js` threads parent `fbclid`/`_fbc`/`_fbp` into the iframe (MC1-04, PIX-02)
- `submissions.ts` hashes PII, persists `meta_lead_attribution`, enqueues `meta-capi-event` (MC1-04, CAPI-03/CAPI-05)
- Worker sender POSTs to Graph v23 with durable retry and per-event isolation (this plan, CAPI-04)
- Settings card lets the operator enter Pixel ID + token + test event code + send a test Lead (MC1-05, CAPI-01/CAPI-06)

**Next step:** Deploy (`git push origin master`), complete the two post-deploy actions above, then verify in Meta Events Manager Test Events that a form submission produces a deduplicated browser+server Lead (counted once, not twice).

**After deploy confirmation:** Phase MC2 (Contact/Purchase/Schedule deep-funnel lifecycle) can be planned via `/gsd:plan-phase MC2`.

---
*Phase: MC1-foundation-lead-event*
*Completed: 2026-06-23*
