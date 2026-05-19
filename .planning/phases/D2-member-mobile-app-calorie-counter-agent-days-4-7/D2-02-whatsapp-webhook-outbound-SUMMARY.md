---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 02
subsystem: whatsapp-webhook-outbound
tags: [whatsapp, meta-cloud-api, webhook, hmac, react-router-v7, drizzle, idempotency, demo-sprint]

# Dependency graph
requires:
  - phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
    provides:
      - "templates/mail/server/db/schema.ts — conversations, messages, webhook_events, gymMembers (with phoneE164 natural key) already in place"
      - "templates/mail/app/routes/gymos.tsx — staff WhatsApp inbox with stub send action"
  - phase: D2-member-mobile-app-calorie-counter-agent-days-4-7 (plan 01)
    provides:
      - "templates/mail/server/plugins/auth.ts — publicPaths already includes /webhooks/whatsapp (D2-01 Task 4); D2-02 did not need to touch auth.ts"

provides:
  - "templates/mail/app/routes/webhooks.whatsapp.tsx — RR v7 resource route at /webhooks/whatsapp"
  - "GET handshake (hub.mode=subscribe + hub.verify_token check) for Meta webhook registration"
  - "POST receiver: HMAC-SHA256 on raw body BEFORE JSON.parse (Pitfall #9 discipline)"
  - "Idempotency via webhook_events keyed on `whatsapp:${wamid}` — re-POSTing same wamid is a no-op"
  - "Conversation upsert keyed on gym_members.phoneE164 (E.164 natural key)"
  - "templates/mail/app/routes/gymos.tsx action — augmented with real Meta Graph API v23 outbound send"
  - "Graph API send returns wamid → captured into messages.externalId"
  - "Env-gated: missing WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID falls back to existing stub send (with console.warn)"
  - "Failed Meta calls insert row with status='failed' + error populated + redirect ?sent=0"

affects:
  - D2-03-member-schedule-booking (no overlap — different routes)
  - D2-04-member-home-tab (no overlap)
  - D2-05-food-calorie-counter (no overlap)
  - D2-06-agent-chat-sse-tools (agent's `book_class` confirmation flow may surface WhatsApp via this same outbound action in future — no code dep yet)

# Tech tracking
tech-stack:
  added:
    - "(none — uses node:crypto built-in, native fetch, existing drizzle-orm)"
  patterns:
    - "Raw-body-first HMAC verification: `await request.text()` before any JSON.parse so the exact bytes Meta sent feed the HMAC"
    - "Timing-safe signature comparison via crypto.timingSafeEqual with length-pre-check"
    - "Idempotency table pattern: select-then-insert on webhook_events keyed on `<provider>:<external_id>` — production hardens to atomic INSERT … ON CONFLICT DO NOTHING in P1b"
    - "Env-gated production integration with stub fallback: external API call only runs when env vars present; otherwise console.warn + stub path. Enables dev environments without WhatsApp creds to keep working."
    - "Conversation upsert by member: select-then-insert-or-update on conversations.memberId (one open conversation per member per channel)"

key-files:
  created:
    - "templates/mail/app/routes/webhooks.whatsapp.tsx (177 lines — GET handshake + POST receiver with HMAC + idempotency + member lookup + conversation upsert + inbound message insert)"
  modified:
    - "templates/mail/app/routes/gymos.tsx (action function — 36 stub lines replaced with 110 lines of real Meta v23 send + fallback + error handling)"

key-decisions:
  - "Hosting: templates/mail/ + ngrok tunnel (NOT apps/edge-webhooks/ on Fly yet) — per CONTEXT.md Claude's Discretion §WA-01/02. Production target apps/edge-webhooks/ on Fly deferred to P1b/WEB-01."
  - "Single route file uses RR v7 framework-mode resource route convention: filename `webhooks.whatsapp.tsx` → URL `/webhooks/whatsapp` (dot separator = path segment). Exports `loader` (GET) + `action` (POST), no default component."
  - "Env-gated rather than required: missing WHATSAPP_ACCESS_TOKEN keeps the existing stub send path working — dev environments without Meta creds (most contributors) don't break. Production deployment must set the env vars explicitly."
  - "24h-window enforcement NOT in code: deferred to P1b sender chokepoint (WA-05/06). Demo discipline is the operator's responsibility — UI already shows lastInboundAt and a 'Out of window' badge on the send form."
  - "No code change to auth.ts: D2-01 Task 4 already added /webhooks/whatsapp to publicPaths. Verified before starting Task 1 and confirmed no edit needed (avoided parallel-edit merge concern)."

patterns-established:
  - "HMAC-verified webhook receivers in RR v7 framework-mode: resource route file (no default export) with `loader` for GET handshake + `action` for POST receiver"
  - "Raw-body-first pattern: `await request.text()` is the FIRST thing the action does, before any header inspection that could trigger side-effects"
  - "Idempotency-then-process pattern: webhook_events check happens BEFORE any conversation/message writes — so a retried delivery cannot create partial duplicates even if it crashes mid-loop"

requirements-completed:
  - WA-01
  - WA-02

# Metrics
duration: 3min (code work; live smoke test deferred to user — see User Setup Required)
completed: 2026-05-19
---

# Phase D2 Plan 02: WhatsApp Webhook + Outbound Summary

**Demo-grade WhatsApp surface: HMAC-verified inbound receiver at `/webhooks/whatsapp` (ngrok-tunnelled) + real Meta Graph API v23 outbound send from the existing `/gymos` staff inbox. Closes the "real WhatsApp" beat of ROADMAP D2 success criterion #8.**

## Performance

- **Duration:** ~3 min code work (tasks 1+2). Live smoke test (Task 3) deferred — needs user Meta env vars + ngrok tunnel + verified test phone.
- **Started:** 2026-05-19T12:44:30Z
- **Code committed:** 2026-05-19T12:47:17Z
- **Tasks:** 2/3 code-shipped; Task 3 is `human-verify` checkpoint deferred to user (see User Setup Required)
- **Files created:** 1 (`templates/mail/app/routes/webhooks.whatsapp.tsx`)
- **Files modified:** 1 (`templates/mail/app/routes/gymos.tsx` — action only; loader + default component untouched)

## Accomplishments

- **Inbound webhook live in code:** `/webhooks/whatsapp` handles Meta's GET verify-token handshake + POST inbound messages with HMAC-SHA256 verification. The raw-body-first discipline (Pitfall #9) is enforced — `await request.text()` precedes any JSON.parse, so the exact bytes Meta sent feed the HMAC.
- **Idempotency hardened:** `webhook_events` keyed on `whatsapp:${wamid}` prevents duplicate inserts when Meta retries (which it does aggressively on any non-2xx).
- **Conversation upsert:** member is looked up by `gym_members.phoneE164` (E.164 natural key); one `conversations` row per member per channel is maintained.
- **Outbound send wired:** `/gymos` action now calls `https://graph.facebook.com/v23.0/{phone_number_id}/messages` with a Bearer token; the returned `wamid` is captured into `messages.externalId`.
- **Failure paths handled:** Meta returns non-2xx → row inserted with `status='failed'` + `error` populated; redirect appends `?sent=0`. Network failure (fetch throws) → same treatment. Missing env vars → falls back to the existing stub send with `console.warn` (dev environments without WhatsApp creds keep working).
- **No auth.ts edit needed:** D2-01 Task 4 pre-added `/webhooks/whatsapp` to publicPaths; D2-02 verified before changing anything and skipped the file entirely.

## Task Commits

Each task was committed atomically (linear history on `master`, no branching per CLAUDE.md rule):

1. **Task 1: Create `webhooks.whatsapp.tsx`** — `316605c0` (feat) — 177-line resource route; GET handshake + POST receiver with HMAC + idempotency + member lookup + conversation upsert + inbound message insert
2. **Task 2: Augment `gymos.tsx` action** — `f3aa33ae` (feat) — replaced 36-line stub send with 110-line env-gated Meta v23 send + fallback + error handling
3. **Task 3: Live smoke test** — DEFERRED (see "User Setup Required" — requires Meta App + verified test phone + ngrok tunnel)

**Plan metadata:** to be committed with this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md updates.

## Files Created/Modified

**Created:**
- `templates/mail/app/routes/webhooks.whatsapp.tsx` — 177 lines:
  - `loader` (GET): Meta verify-token handshake — checks `hub.mode=subscribe` + `hub.verify_token === WHATSAPP_VERIFY_TOKEN` → returns `hub.challenge` (status 200) on match, else 403
  - `action` (POST): raw-body-first HMAC-SHA256 verification → JSON parse → idempotency check on `webhook_events.id = whatsapp:${wamid}` → member lookup by `phoneE164` → conversation upsert → inbound message insert
  - File-level comment block documents demo-only hosting + production target (`apps/edge-webhooks/` on Fly per P1b/WEB-01) + the 4 deferred items (WA-03 stub-member, WA-04 status updates, WA-05 24h-window, WA-06 opt-in)

**Modified:**
- `templates/mail/app/routes/gymos.tsx` — `action` function only:
  - Resolves recipient `phoneE164` via conversation → member chain (using existing `eq`, `schema`, `getDb`)
  - Reads `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` from env; gated execution
  - When configured + member has phone: POST to `https://graph.facebook.com/v23.0/${phoneNumberId}/messages` with `Authorization: Bearer ${accessToken}` and body `{ messaging_product: "whatsapp", to: "<E.164 without +>", type: "text", text: { body } }`
  - Success: `externalId = json.messages[0].id` (the wamid)
  - Meta error: `sendStatus = "failed"`, `sendError = "Meta ${status}: ${error}"`, row inserted with `status='failed'`
  - Network error: same treatment with `Network: ${err.message}`
  - Env vars missing OR `toPhone` null: `console.warn` + stub behaviour (existing demo path preserved)
  - Redirect: `?sent=1` on success, `?sent=0` on failure
  - `loader`, `meta`, `relativeTime`, `windowState`, `GymosTopNav`, `GymosInbox` default export — UNCHANGED

## Decisions Made

- **No `&sent=0` UI banner extension:** Plan §Task 2 marked this as discretion — the existing `?sent=1` banner reads the search param and renders a green confirmation; `?sent=0` falls through to no banner. For demo this is acceptable (the staff member sees no green confirmation and can refresh to inspect the message row's `status='failed'` via SQL or the existing message list's `· ${m.status}` indicator). A proper "Send failed" red banner can be added in a quick follow-up if the demo runtime hits a Meta error.
- **Env-gated rather than required for `WHATSAPP_ACCESS_TOKEN`:** Most dev environments won't have Meta credentials. Treating it as required would break every contributor's local flow. The fallback is identical to the existing stub, so behaviour is preserved exactly when env vars are absent.
- **Conversation upsert by `memberId` only (not `(memberId, channel)`):** The current schema only supports `channel='whatsapp'` per the enum constraint, so memberId alone is sufficient. Future channels (SMS, email) would need the composite key.
- **HMAC compare via `Buffer.from(sig)` + length-pre-check + `timingSafeEqual`:** `timingSafeEqual` throws on length mismatch; the explicit length check returns 401 cleanly instead. This matches Meta's docs pattern.

## Deviations from Plan

None — plan executed exactly as written. Both automated verification checks (Task 1's order check + Task 2's compile check) passed on first run. `pnpm --filter mail exec tsc --noEmit` returns clean exit.

## Issues Encountered

- **Cannot run Task 3 live smoke test from CLI** — Task 3 requires a Meta Business App, verified test phone, ngrok tunnel, and the 4 WhatsApp env vars set in `.env.local`. None of which are accessible from the execution environment. Documented under "User Setup Required" below. This mirrors the D2-01 Task 5 pattern (smoke test deferred to user for physical-device verification).
- **Prettier line wrap on `new Response("WHATSAPP_VERIFY_TOKEN not configured", { status: 500 })`** — prettier split this across 3 lines on save. Cosmetic only; the verification grep still passes.

## User Setup Required

**Critical manual steps before WA-01 / WA-02 can be exercised live:**

1. **Get Meta env vars** and add to `templates/mail/.env.local`:
   ```
   WHATSAPP_APP_SECRET=<Meta App Dashboard → Settings → Basic → App Secret>
   WHATSAPP_VERIFY_TOKEN=<arbitrary string, e.g. "gymos-demo-verify">
   WHATSAPP_PHONE_NUMBER_ID=<Meta WhatsApp → API Setup → From phone number ID, numeric>
   WHATSAPP_ACCESS_TOKEN=<Meta WhatsApp → API Setup → 24h temp token OR permanent system-user token>
   ```

2. **Boot the dev server:**
   ```bash
   pnpm --filter mail dev   # :8081
   ```

3. **Start ngrok in a second terminal:**
   ```bash
   ngrok http 8081
   ```
   Copy the `https://*.ngrok-free.app` URL.

4. **Register the webhook in Meta:**
   - Meta App Dashboard → WhatsApp → Configuration → Webhook → Edit
   - **Callback URL:** `https://<your-ngrok-id>.ngrok-free.app/webhooks/whatsapp`
   - **Verify token:** the EXACT value of `WHATSAPP_VERIFY_TOKEN` (e.g. `gymos-demo-verify`)
   - Click **Verify and Save** → expected: success (Meta hit GET endpoint and got the challenge back)
   - Subscribe to the **messages** field

5. **Ensure a seeded member's `phoneE164` matches your test phone** (Neon SQL):
   ```sql
   UPDATE gym_members SET phone_e164 = '+<your-test-phone-E164>' WHERE id = 'mem_sarah_patel';
   ```
   Use the test phone that's authorised as a recipient in Meta's API Setup (Cloud sandbox only sends to verified test numbers).

6. **WA-01 — Inbound smoke test:**
   - Send a WhatsApp message from the test phone to the Meta sandbox number (or your configured `WHATSAPP_PHONE_NUMBER_ID`)
   - Expect: webhook receiver logs signature-verified + persistence; `/gymos` shows the new message
   - Verify in Neon: `SELECT id, direction, body, external_id, status FROM messages ORDER BY created_at DESC LIMIT 1;` — `direction='in'`, `external_id` starts with `wamid.`

7. **Idempotency test:** Use Meta's "Resend" button (or curl-replay the captured payload) to send the same wamid twice. Verify: `SELECT COUNT(*) FROM webhook_events WHERE id = 'whatsapp:<wamid>';` returns exactly 1.

8. **HMAC tamper test:**
   ```bash
   curl -X POST https://<ngrok>/webhooks/whatsapp \
     -H 'X-Hub-Signature-256: sha256=deadbeef' \
     -H 'Content-Type: application/json' \
     -d '{"entry":[]}'
   ```
   Expect: HTTP 401 "Bad signature" with no rows written.

9. **WA-02 — Outbound smoke test:**
   - In `/gymos` UI, click the conversation with the test phone
   - Type "Hi from GymOS demo" and press Send
   - Expect: `?sent=1` banner appears; test phone receives the message within ~5 seconds
   - Verify in Neon: `SELECT id, direction, status, external_id, error FROM messages WHERE direction='out' ORDER BY created_at DESC LIMIT 1;` — `status='sent'`, `external_id` starts with `wamid.`, `error IS NULL`

**Out-of-window discipline (NOT enforced in code):** Do NOT attempt to send to a number whose `lastInboundAt` is > 24h ago — Meta returns a 24h-window error. Deferred to P1b/WA-05/WA-06 (worker chokepoint).

**Auto-approve note:** This plan's Task 3 was `human-verify` type. Under `workflow.auto_advance=true`, code-only tasks auto-advanced. The live smoke test cannot be auto-approved (it needs Meta credentials + a phone) so it is surfaced here for the user to run before declaring WA-01/WA-02 demo-complete.

## Next Phase Readiness

**Ready for:**
- **D2-03 (member schedule + booking)** — no shared files with D2-02; independent.
- **D2-04 (member home tab)** — no shared files.
- **D2-05 (food / calorie counter)** — no shared files.
- **D2-06 (agent chat + SSE + tools)** — `book_class` tool's confirmation flow may surface WhatsApp via this same outbound action in future, but no code dependency exists today.

**Blockers:**
- Task 3 live smoke test deferred to user — needs Meta App + verified test phone + ngrok tunnel + 4 env vars in `.env.local`. Code-complete; pending live verification before WA-01/WA-02 can be marked done in REQUIREMENTS.md beyond "code complete."

## Self-Check: PASSED

Verified post-write:
- `templates/mail/app/routes/webhooks.whatsapp.tsx` exists on disk (177 lines)
- `templates/mail/app/routes/gymos.tsx` modified (action function rewritten; loader + default component preserved)
- Task commits present in `git log --oneline`: `316605c0` (Task 1), `f3aa33ae` (Task 2)
- Automated verification check passes: text() → HMAC → JSON.parse order correct; all 12 required identifiers in webhooks file; all 7 required identifiers in gymos file; exactly 1 loader / 1 action / 1 default export in gymos.tsx
- `pnpm --filter mail exec tsc --noEmit` exits 0 with no output

---

*Phase: D2-member-mobile-app-calorie-counter-agent-days-4-7*
*Completed: 2026-05-19*
