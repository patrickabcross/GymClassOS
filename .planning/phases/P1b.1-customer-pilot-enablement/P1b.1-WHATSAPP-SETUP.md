# WhatsApp Cloud API Setup — Production

How to wire the customer's verified WhatsApp Business Account to the live worker so the `/gymos` Templates dialog actually sends through Meta.

**Topology:** `services/edge-webhooks/` and `services/worker/` are two processes that run in the **same** Fly app — `gymos-edge-webhooks` (see `services/edge-webhooks/fly.toml`, `[processes]` block). `web` = inbound webhook receiver on port 3001 (the public surface). `worker` = pg-boss queue consumer on port 3002 (internal). One `fly secrets set --app gymos-edge-webhooks` call therefore covers both processes.

## Prerequisites (the customer already has these)

- Verified Meta Business Account
- WhatsApp Business Account (WABA) ID
- Approved phone number with a `WHATSAPP_PHONE_NUMBER_ID`
- At least one approved template (`hello_world` is pre-approved by Meta on every WABA)

## Env vars the apps need

| Var | Where to find it | Used by |
|-----|------------------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Meta App Dashboard → WhatsApp → API Setup → Permanent token (recommended — temp tokens expire in 24h; permanent comes from Business Settings → System Users → Add System User → Generate Token, scope `whatsapp_business_messaging` + `whatsapp_business_management`) | `services/worker/` (outbound send — `packages/whatsapp/src/sdk-impl.ts` reads from `process.env`) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta App Dashboard → WhatsApp → API Setup → Phone numbers → copy the ID below the phone number | `services/worker/` (outbound send) |
| `WHATSAPP_APP_SECRET` | Meta App Dashboard → App settings → Basic → "App secret" (Show) | `services/edge-webhooks/` (inbound webhook HMAC signature verification — `services/edge-webhooks/src/routes/whatsapp.ts` line 33) |
| `WHATSAPP_VERIFY_TOKEN` | You choose this value (any random string, ≥8 chars). Meta echoes it back during webhook subscribe. | `services/edge-webhooks/` (`/webhooks/whatsapp` GET handshake — `services/edge-webhooks/src/routes/whatsapp.ts` line 15) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta App Dashboard → WhatsApp → API Setup → "WhatsApp Business Account ID" near the top | `services/worker/` (optional — daily template sync cron uses this; absent = warning logged + worker still boots) |

> The worker validates these at boot via Zod (`services/worker/src/lib/env.ts`). If any required var is missing it will refuse to start with a clear `[worker env] validation failed:` message in the logs.

## Step 1 — Set env vars on the Fly app

Both processes live in `gymos-edge-webhooks`, so one command sets the env for both:

```bash
fly secrets set \
  WHATSAPP_ACCESS_TOKEN="EAA..." \
  WHATSAPP_PHONE_NUMBER_ID="123456789012345" \
  WHATSAPP_BUSINESS_ACCOUNT_ID="111122223333444" \
  WHATSAPP_APP_SECRET="abc123..." \
  WHATSAPP_VERIFY_TOKEN="any-random-string-you-pick" \
  --app gymos-edge-webhooks
```

Fly encrypts these at rest and auto-restarts both machines after the secrets land. Confirm with:

```bash
fly secrets list --app gymos-edge-webhooks
fly status --app gymos-edge-webhooks
```

(Worker process should be back to `started`; web process should pass its `/healthz` check.)

## Step 2 — Subscribe Meta to the webhook URL

In **Meta App Dashboard → WhatsApp → Configuration → Webhook**:

1. **Callback URL:** `https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp`
   - That route is mounted in `services/edge-webhooks/src/server.ts` via `app.route("/webhooks", whatsappRoutes)`.
2. **Verify token:** paste the same string you set in `WHATSAPP_VERIFY_TOKEN`.
3. Click **Verify and save**.
   - Meta will `GET` the callback URL with `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
   - The handler in `whatsapp.ts` (line 10-19) checks the token matches and echoes `hub.challenge` back. Verification should succeed within a second.
4. **Subscribe to webhook fields:** at minimum `messages`. That field covers inbound messages, delivery confirmations, and read receipts.

If verification fails, the most common cause is the token in the dashboard not matching what's in `WHATSAPP_VERIFY_TOKEN` on Fly. Check `fly logs --app gymos-edge-webhooks` — the handler returns 403 silently on mismatch.

## Step 3 — Send a test message

1. Open https://gymos-staff-web.vercel.app/gymos (or your current Vercel deployment URL).
2. Make sure at least one demo member has an `opted_in` row in `whatsapp_opt_in` (the seed populated ~244 of them). If you want to use **your own** phone, update one of the seeded members in Neon:

   ```sql
   -- pick any seeded demo member id
   UPDATE gym_members
     SET phone_e164 = '+447700900123'    -- your real test number, E.164 format
   WHERE id = 'demo3m_member_0001';

   -- make sure they're opted in (most demo members already are)
   INSERT INTO whatsapp_opt_in (member_id, opted_in_at, source)
   VALUES ('demo3m_member_0001', NOW(), 'manual_admin')
   ON CONFLICT (member_id) DO UPDATE SET opted_in_at = NOW();
   ```

3. Open that member's conversation in `/gymos` (or text the WABA number from your test phone — the inbound webhook will create the conversation automatically).
4. Click **Templates** → pick `hello_world` → **Send template**.
5. Watch the message status transition in the UI:
   - `queued` (optimistic insert) → `sent` (worker POSTed to Meta successfully) → `delivered` (Meta confirmed handoff to recipient device) → `read` (recipient opened the chat).
6. The test phone should receive "Hello World".

## If it fails

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Stays `queued` indefinitely | Worker process not running, or pg-boss can't reach Postgres | `fly status --app gymos-edge-webhooks` (worker process should be `started`); `fly logs --app gymos-edge-webhooks --instance <worker-machine-id>`; confirm `DATABASE_URL_UNPOOLED` is set (no `-pooler` host segment — see `services/worker/src/lib/env.ts` Zod refine) |
| Goes to `failed` with `error_code='NO_OPT_IN'` | No row in `whatsapp_opt_in` for this member | See SQL snippet in Step 3 above |
| Goes to `failed` with `error_code='WINDOW_EXPIRED'` | Recipient hasn't messaged in within 24h **and** the message isn't a template | Either send a template (which is what the demo dialog does) or have the recipient text in first to open a 24h window |
| Goes to `failed` with `error_code='TEMPLATE_NOT_APPROVED'` | The selected template isn't `approved` on Meta's side | Use `hello_world` (Meta pre-approves it). For custom templates submit them in Meta Dashboard → WhatsApp → Message Templates and wait for Meta review (typically <24h). |
| Worker logs show `401`/`403` from Meta after the gates pass | `WHATSAPP_ACCESS_TOKEN` is invalid or expired | Generate a permanent System User token (Meta Business Settings → System Users → Add System User → Generate Token, scope `whatsapp_business_messaging` + `whatsapp_business_management`). Re-run `fly secrets set WHATSAPP_ACCESS_TOKEN=...` |
| Meta webhook dashboard shows red `Failed` on `messages` field | Inbound signature check failing | Confirm `WHATSAPP_APP_SECRET` matches the App secret in Meta App Dashboard → Settings → Basic. The receiver returns 401 on mismatch (`services/edge-webhooks/src/routes/whatsapp.ts` line 35). |
| `Verify and save` in Meta webhook UI fails | Token mismatch, or callback URL not publicly reachable | Confirm `https://gymos-edge-webhooks.fly.dev/healthz` returns 200 (Fly app is alive and the web process is bound to port 3001). Confirm `WHATSAPP_VERIFY_TOKEN` matches exactly. |

## Where the code lives (for reference)

- **Outbound send chokepoint:** `services/worker/src/domain/sendMessage.ts` — composes the three gates (opt-in → 24h window → template-approved) **before** any Meta API call. Typed errors: `NoOptInError`, `WindowExpiredError`, `TemplateNotApprovedError`.
- **Outbound queue handler:** `services/worker/src/queues/outbound-whatsapp.ts` — consumes the `outbound-whatsapp` pg-boss queue, calls `sendMessage`, writes `status='failed'` + `error_code` on gate-refusal.
- **WhatsApp SDK adapter:** `packages/whatsapp/src/sdk-impl.ts` — wraps `@great-detail/whatsapp@9`. Single call site of the SDK in the worker.
- **Inbound webhook:** `services/edge-webhooks/src/routes/whatsapp.ts` — verifies HMAC via `verifySignature(raw, sig, APP_SECRET)` **before** parsing JSON (PITFALL #9), persists to `webhook_events` with composite `(provider, external_id)` UNIQUE for idempotency, enqueues to `inbound-whatsapp` pg-boss queue.
- **Inbound queue handler:** `services/worker/src/queues/inbound-whatsapp.ts` — materialises messages into the `messages` table + maintains `conversations.last_inbound_at` (the column that drives 24h window state).
- **Staff inbox Send → enqueue:** `apps/staff-web/app/routes/gymos._index.tsx` (loader + action) — replies and template sends both go through `enqueueOutboundWhatsApp()` from `@gymos/queue`; the worker is the only thing that ever calls Meta.

## Variable summary (copy-paste safe)

```bash
fly secrets set \
  WHATSAPP_ACCESS_TOKEN="REPLACE_WITH_PERMANENT_TOKEN" \
  WHATSAPP_PHONE_NUMBER_ID="REPLACE_WITH_PHONE_NUMBER_ID" \
  WHATSAPP_BUSINESS_ACCOUNT_ID="REPLACE_WITH_WABA_ID" \
  WHATSAPP_APP_SECRET="REPLACE_WITH_APP_SECRET" \
  WHATSAPP_VERIFY_TOKEN="pick-any-random-string-min-8-chars" \
  --app gymos-edge-webhooks
```
