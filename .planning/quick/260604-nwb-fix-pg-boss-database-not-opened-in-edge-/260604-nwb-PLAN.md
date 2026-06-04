---
quick_id: 260604-nwb
description: Fix pg-boss "Database not opened" in edge-webhooks publish path — start publish-only boss
date: 2026-06-04
mode: quick
status: ready
---

# Quick Task 260604-nwb: pg-boss publisher never started

## Problem

First real inbound WhatsApp (via MYÜTIK relay) reached the edge-webhooks POST
handler, verified + parsed, then 500'd at `enqueueInboundWhatsApp`:

```
AssertionError [ERR_ASSERTION]: Database not opened. Call open() before executing SQL.
  at Manager.getQueue (pg-boss/dist/manager.js)
  at enqueueInboundWhatsApp (packages/queue/dist/publish.js:33)
  at services/edge-webhooks/dist/routes/whatsapp.js:73
[req] POST /webhooks/whatsapp -> 500
```

`packages/queue/boss.ts#getBoss()` constructs a `PgBoss` but never starts it.
Only the **worker** starts a boss — and it starts its *own* singleton
(`services/worker/src/boss.ts`), not `@gymos/queue`'s. The web (publisher)
process publishes through `@gymos/queue`'s boss, which is unstarted → pg-boss
v12 requires `start()` before `send()`. Latent until now because real inbound
never flowed (receiving was blocked); MYÜTIK is the first traffic to exercise it.

The queues already exist (the worker calls `boss.createQueue` for all of them on
boot), so the publisher only needs an opened connection — not schema/queue
creation.

## Fix

`@gymos/queue`'s boss is **publish-only** across all its callers (edge-webhooks
inbound, staff-web outbound Send) — the worker uses a separate boss. So:

### Task 1: publish-only boss + idempotent start helper

**Files:** `packages/queue/src/boss.ts`

- Add publish-only constructor flags so the web/staff processes don't run
  redundant maintenance, cron, or schema migration (the worker owns all three):
  `supervise: false, schedule: false, migrate: false`.
- Add `startBoss(): Promise<PgBoss>` — idempotent (cache the start promise);
  attach a `boss.on("error", ...)` handler; on start failure clear the cache so
  the next call retries (avoid a permanently-cached rejected promise).
- Export `startBoss`; reset its cache in `_resetBossForTests`.

**Verify:** `npx tsc --noEmit` for packages/queue clean; `startBoss` exported
from `@gymos/queue` (`packages/queue/src/index.ts`).

**Done:** publish-only flags set; `startBoss` exported and idempotent.

### Task 2: start the boss on the publish path + at web boot

**Files:** `packages/queue/src/publish.ts`, `services/edge-webhooks/src/index.ts`

- In `publish.ts`, each `enqueue*` resolves the boss via
  `const boss = await startBoss();` instead of the unstarted `getBoss()`. This
  fixes every publisher uniformly (edge-webhooks inbound + staff-web outbound)
  and is safe — `@gymos/queue`'s boss is publish-only, so there is no
  double-`start()` against the worker's separate boss.
- In `services/edge-webhooks/src/index.ts`, `await startBoss()` at boot
  (best-effort: try/catch + log, still `serve()` so `/healthz` stays up; the
  lazy path retries per request if boot start failed) for a warm first request
  and early surfacing of DB/env problems.

**Verify:** `npx tsc --noEmit` for packages/queue and services/edge-webhooks
clean.

**Done:** enqueue functions await `startBoss()`; web entrypoint warm-starts the
boss; types clean.

## Deploy (manual — confirm before running)

Ship to Fly `gymos-edge-webhooks` from repo root:
`fly deploy --config services/edge-webhooks/fly.toml --dockerfile Dockerfile --remote-only .`
(Same app also runs the worker process — redeploy is fine; the worker boss path
is unchanged.)

## Post-deploy verification

Re-send a real inbound from MYÜTIK (or replay) and confirm:
- `[req] POST /webhooks/whatsapp -> 200` (no AssertionError)
- a row lands in `messages` / a `conversations` upsert for the sender, via the
  worker `inbound-whatsapp` consumer.

## must_haves

- truths:
  - "enqueueInboundWhatsApp succeeds from the edge-webhooks web process (boss started before send)"
  - "@gymos/queue boss runs publish-only: supervise/schedule/migrate disabled (worker owns maintenance, cron, schema)"
  - "worker boss lifecycle (services/worker) is unchanged"
- artifacts:
  - "packages/queue/src/boss.ts exports an idempotent startBoss()"
  - "packages/queue/src/publish.ts enqueue functions await startBoss()"
