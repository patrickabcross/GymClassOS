# WhatsApp Send/Receive — Handoff (updated 2026-06-22)

**Goal:** send AND receive WhatsApp messages in the GymClassOS `/gymos` inbox.

---

## 2026-06-22 — TEMPLATE-LANGUAGE FIX SHIPPED (Fly v21); "text is required" window-divergence OPEN (waiting on MYÜTIK)

**TL;DR:** Template sends were failing with Meta `#132001`. Root cause: we sent `templateLanguage:"en_US"` but every approved HUSTLE template is approved as **`en`**. Fixed + deployed. A second, older failure (`400 "text is required"`) is the known window-divergence and is **waiting on a MYÜTIK-side change**.

**Two distinct failures in `messages.error_code`:**
1. **`#132001 "Template name does not exist in the translation"`** (today's blocker). The worker hardcoded `templateLanguage:"en_US"`, but all 4 approved templates (`form_response`, `bobby_harrison_beginner_friendly_nudge_v1`, `bobby_harrison_curiosity_checkin_v1`, `bobby_harrison_trial_reminder_v1`) are language **`en`** (confirmed in `whatsapp_templates.language`). **FIXED (commit `32abd6cd`, deployed Fly v21):** `services/worker/src/domain/sendMessage.ts` out-of-window template branch now reads the synced `whatsapp_templates.language` and sends it — precedence `payload.language ?? templateRow.language` (NO hardcoded locale; repeatable per client). Sending `en` is correct regardless of the MYÜTIK change below.
2. **`400 "text is required for free-form messages"`** (OPEN). The window-driven contract biting: the worker decides text-vs-template from **our** `conversations.last_inbound_at` (fed by inbound webhooks); when that's stale (>24h) the worker sends a TEMPLATE but MYÜTIK sees the contact's window OPEN and demands `text`. Proven by a failed row whose `last_inbound_at` was 7 days old. **User is fixing the MYÜTIK side (removing its own `en_US` default + window handling).** Worker-side options if needed: A) send BOTH rendered text + template fields and let MYÜTIK pick (cleanest); B) catch the 400 and retry as rendered text; C) make MYÜTIK the window authority.

**Deploy reality re-confirmed (the thing that bit us):** `git push` deploys **Vercel only**. The Fly worker was stuck on **v20 (Jun 15)** the whole time — the language fix + the Phase 2 recurrence materialiser only went live after a manual `fly deploy --config services/edge-webhooks/fly.toml --dockerfile Dockerfile --remote-only` (→ **v21**, all 3 machines healthy; `class-materialize` cron registered in `pgboss.schedule`).

**Parked:** the **5 historical `failed` `messages` rows are terminal** (no auto-retry). Once MYÜTIK's side lands, re-enqueue the ones still worth sending.

---

## 2026-06-15 EOD — SEND + RECEIVE + TEMPLATES ALL WORKING END-TO-END ✅

**TL;DR:** Everything is live and verified. Outbound sends, inbound from new numbers, in-window template sends, and on-demand template sync all work. The remaining "send didn't arrive" item from 2026-06-09 was never a code bug — it was activation/config (worker couldn't read its MYÜTIK key, and the studio's WhatsApp number had changed so the stored phoneNumberId was stale).

**Root causes found + fixed this session:**
1. **Worker couldn't read `MYUTIK_API_KEY`.** The Fly worker app `gymos-edge-webhooks` had no `BETTER_AUTH_SECRET`/`SECRETS_ENCRYPTION_KEY`, so `readAppSecretByKey` returned null for everything (silent), `getMyutikApiKey` threw "No MYÜTIK API key available", every `outbound-whatsapp` job failed 3× and the `messages` row stayed `queued` forever. **`BETTER_AUTH_SECRET` is UNREADABLE from Vercel** (`vercel env pull` returns empty for all project secrets), so it cannot be copied to the worker — **the worker therefore relies on Fly ENV for creds, not `app_secrets`.** Fix: `fly secrets set MYUTIK_API_KEY=… -a gymos-edge-webhooks` (value from staff-web Settings → API Keys "Get key").
2. **Studio moved to a NEW WhatsApp number → phoneNumberId changed.** Old `302631896256150` now 404s "phoneNumberId not found for this account". The phoneNumberId must be updated in **TWO** places: the Fly worker env `WHATSAPP_PHONE_NUMBER_ID` (send path) AND staff-web Settings `app_secrets WHATSAPP_PHONE_NUMBER_ID` (inbound matching + on-demand template sync).
3. **MYÜTIK send contract is window-driven** (confirmed in `myutik-br1/apps/api/src/modules/messaging/whatsapp/wa.routes.ts:450-482`): `requiresTemplate = waSessionService.requiresTemplate(conversationId)` → window CLOSED ⇒ template branch (needs `templateName`); window OPEN ⇒ free-form branch (needs `text`, **ignores `templateName`**, returns `400 "text is required for free-form messages"` if absent). So a template sent to an in-window member used to 400.
4. **MYÜTIK's relay does not carry the contact's profile name** (0/31 stored payloads have a `profile` field; genuine inbound has no `contacts` block). Auto-created members are therefore named by their E.164 number until renamed.

**Code shipped this session (all on `master`, deployed):**
- `quick-260615-lyu` (`752a2b9f`): worker marks a `messages` row `failed` (with `error_code`) when a non-gate error exhausts retries (no more eternal `queued`); inbox renders the **real var-substituted template body** from `whatsapp_templates.components_json` instead of `[template:name]`.
- `quick fast` (`cda1dd10`): inbox "Update templates" sync falls back to `app_secrets WHATSAPP_PHONE_NUMBER_ID` before the stale hardcoded `302631896256150` (fixed the post-number-change 404).
- `quick-260615-phi` (`6e3afe28` / `9e7c019c`): inbound from an **unknown number auto-creates a `gym_member` + open conversation + opt-in** (race-safe `onConflictDoNothing` on the `phone_e164` partial unique index + re-select; name = WhatsApp profile name → E.164 fallback). Template sync **prunes** templates not returned by the latest successful sync (clears a previous account's templates). **Verified live** with a synthetic inbound (test rows cleaned up).
- `quick-260615-r6t` (`964671b3`): when a template is sent to an **in-window** member, the worker renders the template's BODY text (with vars) and sends it as **free-form text** via MYÜTIK; out-of-window still sends a real template; empty render falls back to the template path; WA-08 approved gate fires in both states. **Verified live** (re-sent a stuck template to an in-window conversation → `status=sent` with a real wamid).

**Deploy commands (reference):** staff-web auto-deploys from `master` via Vercel; the **Fly worker does NOT** — a git push alone never deploys it. Worker deploy: `fly deploy --config services/edge-webhooks/fly.toml -a gymos-edge-webhooks` (build context = repo root, Dockerfile at root). myutik-api source = `C:\Users\dimet\myutik-br1`.

**Remaining housekeeping (operational, no code):**
- Click **"Update templates"** in the inbox to pull the new account's templates and prune the old-account leftovers.
- Auto-created prospects show as their phone number (MYÜTIK relay carries no profile name) — rename in the member profile, or enrich later.
- Optional follow-ups: hide/disable the Templates button while in-window (now redundant since templates work in-window), and STOP-keyword opt-out parsing on inbound (write path + gate already exist).

---

## 2026-06-09 EOD — OUTBOUND SEND REWIRED TO MYÜTIK + DEPLOYED (superseded by 2026-06-15)

**TL;DR for morning:** The send path is now wired to MYÜTIK and **deployed to the Fly worker**. The one thing left is to **send a fresh template from the inbox and confirm it actually arrives** — everything upstream is green.

**What got done today:**
1. **AI auto-fill of template variables (shipped, working in prod).** Selecting an approved template in the inbox Templates dialog now auto-fills its `{{N}}` variables from the open conversation's member context, via the agent chat. New `apps/staff-web/actions/suggest-template-vars.ts` (pure write-back to `application_state`, no LLM in the action — the agent reasons and calls it). The delegation sends to the **active** chat thread (an earlier `newTab`+`background` version created a ghost thread that never ran — see commit `0a5b48e1`). `ANTHROPIC_API_KEY` is confirmed set in staff-web's Vercel env. Quick task `260609-fcm`.
2. **Diagnosed why sends weren't arriving.** A real send queued fine, the worker picked it up, but **Meta rejected it**: `code 100 / subcode 33 "Object 302631896256150 … missing permissions"` (from `pgboss.job.output`). Confirms the GymClassOS Meta app/token can't send on that number — exactly the wiring block, now proven for outbound too. (Also found + fixed a multi-var bug: the template builder emitted one `body` component per var instead of one with all params — commit `2eb3794a`.)
3. **Rewired ALL outbound sends through MYÜTIK (quick task `260609-qe9`, deployed).** New `services/worker/src/domain/sendViaMyutik.ts` POSTs `https://myutik.com/api/channels/whatsapp/send` (`x-api-key` + `phoneNumberId`). `services/worker/src/domain/sendMessage.ts` rewired so `sendViaMyutik` is the **sole** send call site — the `@gymos/whatsapp` direct-Meta path is gone. Compliance gates (opt-in / 24h window / template-approved) and the message status machine are unchanged. Status mapping: 4xx (400/404/409) → terminal `failed`; 502/no-wamid → pg-boss retry; success stores `wamid` (`result.messages[0].id`) as `external_id`. 79/79 worker tests + `tsc` green.
   - **Deployed:** `flyctl deploy --config services/edge-webhooks/fly.toml` — `gymos-edge-webhooks` web + worker machines rolled healthy. The live worker now sends via MYÜTIK.
   - **API key:** user confirmed the stored `MYUTIK_API_KEY` has **all** permissions (incl. `whatsapp:send`) — activation step cleared.

**MYÜTIK `/send` contract (for reference):** body `{ to (E.164 ±+), phoneNumberId, text | (templateName + templateLanguage + templateComponents) }`; `200 { sent, type, conversationId, result }` (wamid at `result.messages[0].id`); `400` bad request; `404` pid-not-owned; `409 { error, requiresTemplate:true }` (window closed, text-only); `502` Meta send failed. Account resolved from the key — no Meta token passed.

**NEXT (morning):**
- Send a **fresh** template from `/gymos/inbox` (the earlier stuck row `msg_3BZURB4eTF35XrQvhKija` will NOT resend — its pg-boss job already exhausted retries on the old Meta path; it stays `queued`).
- Verify in `gymos-demo` Neon (`billowing-sun-51091059`): the new `messages` row reaches `status='sent'` with `external_id` populated, and the `pgboss.job` (`outbound-whatsapp`) is `completed`. And confirm it lands on the phone.
- If it fails, MYÜTIK's error now flows into `messages.error_code` — read it there (or `pgboss.job.output`).

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
