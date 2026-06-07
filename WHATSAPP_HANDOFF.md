# WhatsApp Send/Receive — Handoff (updated 2026-06-07 EOD)

**Goal:** send AND receive WhatsApp messages in the GymClassOS `/gymos` inbox.

---

## 2026-06-07 EOD — templates blocker diagnosed, going via MYÜTIK

**Where we are now:** Inbound **works** (MYÜTIK relays Hustle inbound → our Fly webhook in Meta format; deployed + DB-validated 06-04, see fj3/nwb/op8). Today's work was the **send / templates** side.

**Shipped today:**
- **Inbox send was 404ing — fixed.** Sending a template (or text reply) from `/gymos/inbox` did `POST /gymos/compose.data` → `404 Cannot find any route matching [POST]`. Root cause: the Nitro SSR catch-all was mounted **GET-only** (`server/routes/[...page].get.ts`), so React-Router framework-mode action POSTs never reached the handler. Fix: added `apps/staff-web/server/routes/[...page].post.ts` (same method-agnostic `createH3SSRHandler`). Commit `6edc640d`. **Needs Vercel redeploy + retest.**
- **MYÜTIK API key input** added to Settings → API Keys (gear button on the AI input) via `registerRequiredSecret('MYUTIK_API_KEY')`. Commit `c83da064`. User has already pasted the key (`app_secrets`, scope `support@myutik.com`).

**The templates problem (diagnosed, not yet fixed):**
- The templates shown in the inbox picker are **stale demo data** — synced **once on 2026-05-25** from the *GymClassOS test WABA*: `hello_world` (approved) + `class_reminder` / `waitlist_offer` / `payment_failed` / `pass_expiring` (all **pending**, all `en_US`). None are the Hustle account's. `hustle_followup_v1` (from the MYÜTIK send doc) isn't among them.
- **Meta route is blocked by token scope, not the WABA id.** Decrypted `WHATSAPP_ACCESS_TOKEN` (app_secrets) and called Meta directly:
  - `debug_token` → it's a **SYSTEM_USER** token for the **GymClassOS** app (`1638609197193795`), scopes = `ads_management, ads_read, business_management, public_profile` — **no `whatsapp_business_management`**.
  - WABA id was corrected by the user to **`115640014972621`** (Hustle gym's real WABA). `GET /{waba}/message_templates` now returns **`403 (#200) permission denied`** (was `400 nonexisting field` when it pointed at the HUSTLE *business portfolio* `2484390155164803`). The 400→403 shift **confirms `115640014972621` is the real WABA** — the token just isn't authorized on it.
  - To open the Meta route would need: (a) assign WABA `115640014972621` as an asset to the GymClassOS system user (full control), AND (b) regenerate that token **with `whatsapp_business_management` (+ `whatsapp_business_messaging`)** scopes, then rotate it into Settings. Only possible **if the HUSTLE portfolio actually owns/has the WABA** — likely it's GHL/LeadConnector-owned, so this may stay closed.
- **Decision: expose templates via MYÜTIK instead.** MYÜTIK already holds a Meta token with WhatsApp permission on the Hustle WABA. Specced a new read endpoint for the MYÜTIK dev (see below).

**Next session (in order):**
1. **MYÜTIK dev builds `GET /api/channels/whatsapp/templates`** — thin proxy to Meta `GET /{WABA}/message_templates?fields=name,language,status,category,components`, resolving WABA from `phoneNumberId=302631896256150`, gated behind a new `whatsapp:read` key scope, returns `{ phoneNumberId, wabaId, templates:[{name,language,status,category,components}], paging }`. (Full spec was handed to the user.)
2. **GymClassOS side:** repoint the template sync (`services/worker/src/domain/syncTemplates.ts`, currently hits Meta Graph) at the MYÜTIK endpoint using `MUTIK_API_KEY` + `phoneNumberId`; write results into `whatsapp_templates`. Then the inbox picker shows real Hustle templates and the send gate passes. (Offered to stage this; **not started** — awaiting endpoint.)
3. **Send path** (GymOS → MYÜTIK campaigns/replies): wire outbound through `POST https://myutik.com/api/channels/whatsapp/send` with `phoneNumberId: "302631896256150"`, try-text-then-409→template. Still pending on the GymClassOS sender.

---

## TL;DR — where we actually are

The Fly pipeline is deployed, healthy, and now has **request logging**. Receiving is blocked on a **Meta app/WABA wiring problem we fully diagnosed today** (not a code problem):

- The first customer's (Hustle) WhatsApp number is **managed by GoHighLevel / LeadConnector** (they're the full-control partner; payment is on **HighLevel Inc.'s credit line**). That's why normal "assign access" is greyed out for everyone including the business owner (Bobby).
- The **Myütik business** has *partial* partner access to the Hustle WABA. Myütik owns **two apps**: the **GymClassOS** app (App ID `1638609197193795`, whose secrets are on Fly → our webhook) and a **separate "Myütik" app** the user is building (its own webhook, different project).
- The number got connected to the **Myütik app**, so inbound messages route to *that* app's webhook, **not** GymClassOS's. `webhook_events` is still **0** — Meta has never POSTed to our Fly endpoint.

**The fix (morning task): subscribe the GymClassOS app (NOT the Myütik app) to the Hustle WABA, point its webhook at our Fly URL.** Nothing on Fly changes — Fly already holds the GymClassOS app's secrets.

## Verified state (all green except the wiring)

- **Fly `gymos-edge-webhooks`** — version 3, 2× web + 1× worker, all checks passing. `GET /healthz` → 200.
- **Request logging is LIVE** (added today): every non-health request logs `[req] METHOD /path -> status`; the WhatsApp POST handler logs `[whatsapp] POST signature OK|FAILED` and `payload parsed — entries=N`. Confirmed working (saw our own probe `[req] GET /webhooks/whatsapp -> 403`).
- **Fly secrets** — all 9 present (GymClassOS app's `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` + DB + pgcrypto + Stripe placeholders).
- **Verify token** (decrypted from `app_secrets`, matches Fly): `gymos_wa_verify_n_1aboNIv5uM1Z4GJCbGUVmW_i2u-vb7`. GET handshake against Fly with this token returns the challenge (200).
- **Meta app GymClassOS is published / Live.**
- **Neon `gymos-demo`** = `billowing-sun-51091059`. `webhook_events` = 0 (decisive: no inbound has ever reached us). conversations/messages tables hold seed data only.

## Morning task — wire the RIGHT app (do all of this in the GymClassOS app)

1. **developers.facebook.com → GymClassOS app → WhatsApp → API Setup.** Check whether the **HUSTLE GYM** WABA + phone number now appears in the dropdown (Myütik business has partner access, GymClassOS app lives in Myütik, so it *should*). Select it.
2. **GymClassOS app → WhatsApp → Configuration → Webhooks:** callback `https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp`, verify token `gymos_wa_verify_n_1aboNIv5uM1Z4GJCbGUVmW_i2u-vb7`, Save → subscribe **`messages`**.
3. **In the separate Myütik app, unsubscribe the Hustle WABA** so the gym's messages stop flowing into that other project (otherwise both apps receive them).
4. Send a test message → watch it route to GymClassOS app → our Fly webhook → `/gymos`.

**If the WABA does NOT appear in the GymClassOS app's API Setup dropdown:** Myütik's *partial* access isn't enough to attach it to a second app → back to the LeadConnector/HighLevel control gate. Escalation options then: get LeadConnector/HighLevel to grant fuller control, OR **use the GymClassOS app's own free WhatsApp test number** (API Setup auto-provisions one — fully under our control, zero GHL entanglement) just to demo the pipeline. If we use the test number, repoint Fly's `WHATSAPP_PHONE_NUMBER_ID` (+ token) to it.

## Send-side caveat (after receiving works)

`WHATSAPP_ACCESS_TOKEN` on Fly must have access to whatever WABA we end up using. If it doesn't, *receiving* will work but *sending* 401s. Fix: generate a **System User token in Myütik** with access to the (shared) WABA, update the Fly secret, then test a send from the inbox.

## How to watch / debug (commands)

- Tail while testing: `flyctl logs -a gymos-edge-webhooks` then grep for `[req] POST` / `[whatsapp]`. (On Windows Git Bash, `export MSYS_NO_PATHCONV=1` before curling bare `/` paths.)
- Inbound flow: Meta → `web` POST `/webhooks/whatsapp` (HMAC via `WHATSAPP_APP_SECRET`) → `webhook_events` dedup + enqueue `inbound-whatsapp` → `worker` `services/worker/src/queues/inbound-whatsapp.ts` → `services/worker/src/domain/conversations.ts` upserts conversation + message → inbox.
- Diagnosis from logs: **no `[req] POST`** = Meta isn't pointed at us (wrong app subscribed). **`signature FAILED`** = Fly `WHATSAPP_APP_SECRET` ≠ the subscribed app's secret. **`signature OK` but no DB row** = worker/queue issue.
- Redeploy edge-webhooks: `flyctl deploy --config services/edge-webhooks/fly.toml --dockerfile Dockerfile --remote-only .` (from repo root).
- Decrypt an `app_secrets` value: AES-256-GCM, key = `SHA256(BETTER_AUTH_SECRET)` (in `apps/staff-web/.env.local`), format `v1:iv:ct:tag`.

## Also shipped today (separate from the WhatsApp wiring)

- **Public homepage (`/`) + privacy policy (`/privacy`)** on staff-web — needed for Meta (Privacy Policy URL). Self-contained SSR Nitro routes (`apps/staff-web/features/marketing/lib/marketing-ssr.ts` + `server/routes/index.get.ts` + `privacy.get.ts`), made public via `server/plugins/auth.ts` publicPaths + allowlist skip. GymClassOS-branded, contact `patrickabcross@outlook.com`. Verified locally (both 200, real HTML); typecheck passes. **Once deployed:** homepage `https://gym-class-os.vercel.app/`, privacy `https://gym-class-os.vercel.app/privacy` → put the privacy URL in Meta App → Settings → Basic. NOTE: `/` now shows the homepage instead of auto-redirecting to `/gymos`; staff click "Open app".
- **Backlog items added** (commit `c682feb7`): 999.2 (dedicated GymClassOS Meta business + verification — start now, slow) and 999.3 (transfer app into it + build WhatsApp Embedded Signup for self-onboarding studio #2+).
- **Idea parked (not yet backlogged):** multi-agent "different agent per stage of the customer journey" (lead-nurture / booking / retention). Application-layer, independent of Meta plumbing.
