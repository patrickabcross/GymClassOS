---
quick_id: 260604-nwb
description: Fix pg-boss "Database not opened" in edge-webhooks publish path — start publish-only boss
date: 2026-06-04
status: complete
commit: 3dfd99d7
---

# Quick Task 260604-nwb — Summary

## Problem

First real inbound WhatsApp (MYÜTIK relay) reached the edge-webhooks POST
handler, verified + parsed, then 500'd at `enqueueInboundWhatsApp` with
`AssertionError: Database not opened. Call open() before executing SQL.`

`@gymos/queue`'s `getBoss()` constructs a `PgBoss` but never starts it. Only the
worker starts a boss — and a *separate* one (`services/worker/src/boss.ts`). The
web (publisher) process publishes through `@gymos/queue`'s boss, which was never
started; pg-boss v12 requires `start()` before `send()`. Latent until now
because real inbound never flowed (receiving was blocked) — MYÜTIK is the first
traffic to exercise the publish path.

## Fix (commit 3dfd99d7)

- **`packages/queue/src/boss.ts`** — `@gymos/queue`'s boss is publish-only across
  all callers (edge-webhooks inbound, staff-web outbound Send), so constructed it
  with `supervise: false, schedule: false, migrate: false` (the worker owns
  maintenance, cron, and the pgboss schema via its own boss). Added
  `startBoss(): Promise<PgBoss>` — idempotent (caches the start promise; clears
  the cache on failure so the next call retries) with a `boss.on("error")`
  handler. Exported it (`index.ts`); reset its cache in `_resetBossForTests`.
- **`packages/queue/src/publish.ts`** — every `enqueue*` now resolves the boss
  via `await startBoss()` instead of the unstarted `getBoss()`. Fixes all
  publishers uniformly (edge-webhooks inbound + staff-web outbound). Safe: this
  boss is publish-only, so no double-`start()` against the worker's separate boss.
- **`services/edge-webhooks/src/index.ts`** — `startBoss()` warm-start at boot
  (best-effort: logs + still `serve()`s so `/healthz` stays up; the lazy path
  retries per request if boot start failed).

## Verification

- `packages/queue`: `tsc --noEmit` clean; built `tsc -p tsconfig.build.json`
  clean; `startBoss` present in `dist/index.d.ts` + `dist/boss.d.ts`.
- `services/edge-webhooks`: `tsc --noEmit` clean.
- prettier applied. `dist/` is gitignored (Dockerfile rebuilds on deploy) — only
  the 4 src files committed. `@gymos/queue` is `private` → no changeset.

## Deploy + post-deploy check

Deploy `gymos-edge-webhooks` (repo root):
`fly deploy --config services/edge-webhooks/fly.toml --dockerfile Dockerfile --remote-only .`

Then re-send a real inbound from MYÜTIK and confirm `[req] POST /webhooks/whatsapp -> 200`
(no AssertionError) and a `conversations`/`messages` row for the sender via the
worker `inbound-whatsapp` consumer.

## Commit

- `3dfd99d7` — fix(queue): start publish-only pg-boss before send (edge-webhooks inbound 500)
