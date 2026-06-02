# WhatsApp Send/Receive — Handoff (2026-06-02)

**Goal for next session:** send AND receive WhatsApp messages from the GymClassOS platform (the `/gymos` inbox).

## TL;DR status

The whole pipeline is **deployed and healthy**. The only thing standing between us and *receiving* is a Meta App Dashboard webhook config (user-side). *Sending* needs the staff-web redeploy to pick up one env var, plus awareness of WhatsApp's opt-in/24h-window rules.

## What's COMPLETE ✅

- **Fly app `gymos-edge-webhooks` is live** (region `iad`, one app, two processes):
  - `web` (Hono receiver) ×2 — healthy; `GET https://gymos-edge-webhooks.fly.dev/healthz` → 200.
  - `worker` (pg-boss) — healthy; boots clean, **pg-boss schema auto-created**, all queues created on boot, template-sync scheduled.
- **Made the services deployable** (they never were): `@gymos/queue` + `@gymos/whatsapp` now have a `tsc` build → `dist` + exports→dist (added to repo-root `postinstall` so staff-web/Vercel keeps building them); Dockerfile installs `--ignore-scripts` and builds core/queue/whatsapp/services with tsc; worker creates all pg-boss queues before `work()/schedule()` (v12 requirement); worker health-check port fixed 3002→3001. Committed: `597c4882` (+ port fix earlier).
- **Credentials wired.** The 4 WhatsApp creds were saved via the agent gear panel into `app_secrets` (scope `user`, scope_id `support@myutik.com`, AES-256-GCM keyed by `SHA256(BETTER_AUTH_SECRET)` — local `.env.local` secret matches prod). I decrypted them and set them as **Fly secrets** on `gymos-edge-webhooks`: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, plus `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGCRYPTO_MASTER_KEY`, and placeholder `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.
- **Meta verify handshake tested LIVE = PASS** with the real verify token (decrypted in-process; the token on Fly matches what the user configured).
- **Vercel:** added `DATABASE_URL_UNPOOLED` to staff-web prod env (needed for staff-web → pg-boss enqueue). Takes effect on next staff-web deploy.
- UI fixes shipped earlier today (separate from pipeline): campaigns 500, template-send routing, lead conversations opening, Members search + lead/first-purchase dates, forms Embed popover.

## What's REMAINING ⏳

### To RECEIVE (user-side — Meta App Dashboard, can't be done from code)
developers.facebook.com → app → WhatsApp → Configuration → Webhooks:
1. Callback URL: `https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp`
2. Verify token: the one saved in the gear panel (matches Fly).
3. Verify & Save (will succeed — tested).
4. Subscribe to the **`messages`** field; ensure the number is subscribed to the app.
Then message the business number → should land in `/gymos` within seconds.

### To SEND (from the inbox)
- Confirm staff-web has redeployed since `DATABASE_URL_UNPOOLED` was added (so `enqueueOutboundWhatsApp` works instead of best-effort-swallowing).
- WhatsApp rules: a free-form text reply only works inside the 24h window AND with an opt-in row; otherwise must use an approved template. For the demo, easiest is to first message the business number from a phone (opens the 24h window + the inbound creates the conversation), then reply from the inbox.
- Approved templates: check `whatsapp_templates` table (worker `templates-sync` cron will populate from Meta nightly; can trigger sooner if needed).

## Key facts / commands for next session
- Neon project: `gymos-demo` = `billowing-sun-51091059`, single branch `main`.
- Deploy: `flyctl deploy --config services/edge-webhooks/fly.toml --dockerfile Dockerfile --remote-only .` (run from repo root).
- Logs: `flyctl logs -a gymos-edge-webhooks --machine <id>`; status: `flyctl status -a gymos-edge-webhooks`.
- Health: `curl https://gymos-edge-webhooks.fly.dev/healthz`.
- **First action next session: VERIFY current state** (`flyctl status`, confirm staff-web picked up the env) before changing anything — don't assume.

## Debugging the first real message (if inbound doesn't show)
Tail both processes while sending a test message. Inbound flow: Meta → `web` POST `/webhooks/whatsapp` (HMAC verify via `WHATSAPP_APP_SECRET`) → `webhook_events` dedup + enqueue `inbound-whatsapp` → `worker` `services/worker/src/queues/inbound-whatsapp.ts` → `services/worker/src/domain/conversations.ts` upserts conversation + message → appears in inbox. Check: signature 401 = app-secret mismatch; nothing in `web` logs = Meta not pointed/subscribed; enqueued but no worker action = worker/queue issue.
