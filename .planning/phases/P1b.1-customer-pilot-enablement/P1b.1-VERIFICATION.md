# P1b.1 — End-to-End Verification

> Walkthrough of the 6 ROADMAP success criteria for Phase P1b.1: Customer Pilot Enablement + the negative auth test. This file is the final gate before the customer pilot launches.
>
> **Walked by:** _<user>_
> **Date:** _<YYYY-MM-DD>_
> **Deployment URL:** _<production URL or `http://localhost:8081`>_
> **Worker location:** _<Fly `gymos-worker` OR local `pnpm --filter @gymos/worker dev`>_

---

## What was shipped (P1b.1-01 through P1b.1-07)

| Plan | What landed | Key commits |
|---|---|---|
| **P1b.1-01** Bare gymos layout | `/gymos/*` now skips email AppLayout chrome (no hamburger, no Important/Other tabs, no email sidebar, no Compose). Only `GymosTopNav` + content + right-rail `AgentSidebar`. Added Analytics tab to `GymosTopNav` between Payments and Settings. Gym-themed chip prompts scoped to `/gymos/*` only (no longer leaking onto `/inbox` / `/sent`). | `00d363c5`, `07aa7d76` |
| **P1b.1-02** Auth allowlist + `/access-denied` | `CUSTOMER_ALLOWED_EMAILS` env-var allowlist gates `/gymos`. Empty/unset = dev fallback (any Google account passes). Branded `/access-denied` route with `IconLock` + "Sign in with a different account" CTA. Composable Nitro plugin pattern: framework auth plugin runs first, then app appends allowlist H3 middleware. | `d8ca108e`, `b8814453` |
| **P1b.1-03** Gym actions Part A | Three primitive read actions: `list-fill-rate`, `list-classes`, `list-members`. All HTTP GET, auto-mounted at `/_agent-native/actions/<name>`. `guard:allow-unscoped` marker on each query (single-tenant gym tables). | `19ff3587`, `34ede69e`, `a09c3480` |
| **P1b.1-04** Gym actions Part B + WA template seed | Two churn-context actions: `list-renewals`, `list-at-risk-members`. Seeded `whatsapp_templates` with 5 rows: `hello_world` (status=`approved`), `class_reminder` / `waitlist_offer` / `payment_failed` / `pass_expiring` (status=`pending`). Categories seeded lowercase to match schema enum. | `c43cf8a7`, `90d7ba4d`, `1d55b43c` |
| **P1b.1-05** Templates dialog | `<TemplatesDialog>` picker beside Send in `/gymos` reply form. Left list shows 5 templates (1 selectable, 4 with "Awaiting approval" badge + tooltip). Right pane: name, variable inputs (none for `hello_world`), live preview. Send enqueues `payload.type='template'` job through existing worker chokepoint. Removed `"(P2)"` debug suffix from out-of-window placeholder. | `02af7dfd`, `f1e91674` |
| **P1b.1-06** Analytics route | `/gymos/analytics` route with three live metric cards: Fill Rate, Cancellation Rate, Pass Utilisation. Each card shows 7d primary + 30d secondary. Loader fans 5 SQL aggregations via `Promise.all`. Empty-state: `–` (en-dash U+2013) + "No data yet". | `ca26019e` |
| **P1b.1-07** Gym agent surface | `agent-chat.ts` rewritten: `appId="gymos"`, gym systemPrompt names 5 gym tools + read-only constraint + forbidden vocabulary. `mentionProviders` cleared to `{}`. `apps/staff-web/AGENTS.md` fully replaced with 85-line gym-domain dev guide. Mail action files left on disk (systemPrompt is the tool gate, not deletion). | `06d3a797`, `0038dca3` |

---

## Operational notes / risks surfaced by prior summaries

Read these BEFORE walking the script — they explain expected behavior that might otherwise look like a bug.

1. **`CUSTOMER_ALLOWED_EMAILS` empty == dev fallback.** When unset, any authenticated Google account passes the allowlist. The negative auth test (below) is meaningless until this env var is set in the deployment.

2. **Pitfall 6 — seeded data ageing out of analytics 7d window.** Seeded class occurrences are dated **May 18-22, 2026**. Today is **2026-05-25**. On **2026-05-26** the seeded occurrences drop out of the 7d Fill Rate window, so that card will show `–` / "No data yet" for the 7d slot until real bookings flow in. The **30d window** holds until ~mid-June. Criterion 4 (analytics) explicitly accepts `–` + "No data yet" as PASS — do NOT fail it for empty cards.

3. **`passes` table has NO `status` column.** Some docs (incl. parts of `AGENTS.md`) reference `passes.status`. The actual schema has only `expires_at`. "Active pass" everywhere in this phase means `expires_at IS NULL OR expires_at >= now()`. Used consistently across `list-renewals`, `list-at-risk-members`, `gymos.members.$id.tsx`, and `gymos.analytics.tsx`. If a future plan adds `passes.status`, AGENTS.md needs a follow-up.

4. **`whatsapp_templates.category` is lowercase.** Schema enum requires lowercase (`utility`/`marketing`/`authentication`); Meta API returns uppercase. P1b-09 sync cron will normalize on ingest. If you re-seed manually, use lowercase.

5. **Worker file lives at `services/worker/...`, not `apps/worker/...`.** Some plan text uses the older path. Real path: `services/worker/src/domain/sendMessage.ts`.

6. **Mail action files (`archive-email`, `list-emails`, etc.) are still on disk.** They auto-register in `.generated/actions-registry.ts`, but the gym systemPrompt doesn't name them, so the LLM has no signal to call them. Deletion belongs to the P0 audit. The cross-check in Criterion 5 (ask "archive my emails") tests this gate.

7. **Deployment status (per STATE.md):** Vercel deploy of staff-web (D0.5) is **PENDING** — Mail template is preset for Netlify (`netlify.toml`); needs `NITRO_PRESET=vercel` + possibly a `vercel.json`. **Local dev (`pnpm --filter @gymos/staff-web dev` on :8081) is the safest verification target today.** If you intend to verify the deployed URL, confirm a deploy went out within the last 24h.

8. **Worker may not be running on Fly yet.** STATE.md notes `gymos-worker` Fly app is pending `fly launch`. For Criteria 3 + 6 (worker chokepoint behavior) you may need to boot it locally: `pnpm --filter @gymos/worker dev`. Confirm pg-boss is connected to the same Neon database the staff-web is using.

9. **Auth paths verified against framework source:** sign-out is `POST /_agent-native/auth/logout`; sign-in entrypoint is `/_agent-native/google/auth-url?redirect=1`. The earlier `/_better_auth/*` paths in some plan templates are stale — do NOT type those into the browser if you're trying to start a fresh OAuth flow.

10. **TemplatesDialog imports `@/components/...` (not `~/...`).** `apps/staff-web/tsconfig.json` only defines `@/*`. Plan templates that referenced `~/` were wrong; this was already corrected in P1b.1-05.

---

## Prerequisites (verify ALL before walking the script)

- [ ] **CUSTOMER_ALLOWED_EMAILS env var set** in the deployment OR in `apps/staff-web/.env.local` for local. Must include the Google email you'll sign in with. For the negative test, ensure at least one Google account you control is NOT on the list. Example: `CUSTOMER_ALLOWED_EMAILS=patrickalexanderross@outlook.com`
- [ ] **Worker running** — Fly `gymos-worker` machine has status `started` (`fly status -a gymos-worker`) OR `pnpm --filter @gymos/worker dev` is running in a separate terminal with `DATABASE_URL` + `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` in env
- [ ] **`whatsapp_templates` has 5 rows in Neon:** `SELECT name, status, category FROM whatsapp_templates ORDER BY name;` → returns `class_reminder=pending`, `hello_world=approved`, `pass_expiring=pending`, `payment_failed=pending`, `waitlist_offer=pending`. If 0 rows: run `pnpm --filter @gymos/staff-web db:seed-templates`
- [ ] **Deployed URL reachable** (open in browser, get the Google sign-in page) OR **local dev running** (`pnpm --filter @gymos/staff-web dev` shows Vite on `:8081`)
- [ ] **Test WhatsApp number ready for Criterion 3** — a phone that (a) has opted in to the studio's WABA AND (b) has sent an inbound WhatsApp message to the studio number within the last 24 hours (so a `whatsapp_opt_in` row exists AND `conversations.last_inbound_at` is recent enough for the 24h window to be open)
- [ ] **Stale conversation ready for Criterion 6** — find or manufacture a conversation with `last_inbound_at > 24h ago`. Either use a known-stale test member or manually update: `UPDATE conversations SET last_inbound_at = NOW() - INTERVAL '25 hours' WHERE id = '<some-id>';` (record the id you used so you can clean up after)

---

## Verification script (walk in order)

> Open the deployed URL (or `http://localhost:8081`) in an incognito browser window. Sign in with the allowlisted Google account. Then walk the seven criteria in order, recording PASS or FAIL in the table at the bottom.

### Criterion 1 — Customer sign-in lands on `/gymos` (no email redirect)

1. Open an incognito browser. Navigate to the deployment URL.
2. You should be redirected to the Google sign-in page.
3. Sign in with the allowlisted Google account.
4. **PASS** if the post-sign-in URL is `/gymos` (or any `/gymos/*` route) and you see the `GymosTopNav`.
5. **FAIL** if you land on `/inbox`, `/email`, `/draft-queue`, `/team`, or `/settings` (Mail).

### Criterion 2 — `/gymos/*` shows only gymos top-nav + content + right-rail Chat

1. On `/gymos`, visually inspect the page.
2. **PASS** if you see ONLY: `GymosTopNav` (Inbox · Schedule · Members · Payments · Analytics · Settings), main content area, right-rail `AgentSidebar` (open by default on desktop).
3. **FAIL** if you see ANY of: hamburger menu button, "Important" / "Other 25" tabs, email-style sidebar (left panel with folders), Compose pen button, refresh icon, bell icon.
4. Visit `/gymos/schedule`, `/gymos/members`, `/gymos/payments`, `/gymos/analytics`, `/gymos/settings/integrations` — same check on each.

### Criterion 3 — Templates dialog → real Meta send

1. On `/gymos`, open any conversation **with `hasOptIn=true`** AND with `last_inbound_at` within the last 24h (i.e., not the stale one you're reserving for Criterion 6).
2. Click the **"Templates"** button beside Send in the reply form.
3. Dialog opens. You see 5 templates in the left list:
   - `hello_world` with green "Approved" badge (enabled)
   - `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring` each with muted "Awaiting approval" badge (disabled, opacity-50)
4. Hover one of the pending templates → tooltip shows _"Awaiting Meta approval — submit templates via your Meta Business Manager"_.
5. Click `hello_world`. Right pane shows: template name, _"This template has no variables."_, preview block reading _"Hello World"_, Send template button **enabled**.
6. Click **Send template**. Dialog closes. Sonner toast _"Template queued"_ fires. A new message row appears in the thread with `status='queued'` (optimistic).
7. **PASS** if within ~10 seconds, the message status moves to `sent` (worker successfully POSTed to Meta) AND the test WhatsApp number receives _"Hello World"_.
8. **FAIL** if the message stays `queued` indefinitely, OR status moves to `failed`, OR the test number doesn't receive the message.

> **Diagnosis tip:** If `failed`, check the failed-bubble copy — it maps `error_code` directly: `NO_OPT_IN` → "no opt-in", `WINDOW_EXPIRED` → "24h window closed", `TEMPLATE_NOT_APPROVED` → unlikely for hello_world. Worker logs will show the typed error name.

### Criterion 4 — `/gymos/analytics` shows at least 3 real metrics

1. Click the **Analytics** tab in `GymosTopNav`.
2. Page loads with title "Analytics" + subtitle "Last 7 days · Last 30 days".
3. Three metric cards visible in a row (desktop) or stacked (mobile): **Fill Rate**, **Cancellation Rate**, **Pass Utilisation**.
4. Each card shows TWO values — primary (7d) and secondary (30d).
5. **PASS** if **at least one card** shows a non-`–` value. (Per Pitfall 6: on 2026-05-25 the seeded May 18-22 occurrences should give Fill Rate or Pass Utilisation real numbers. From 2026-05-26 onward, the 7d slot may go to `–` but the 30d slot should still hold.)
6. **PASS** if cards with no data show `–` + "No data yet" (not a crash, not a hidden card).
7. **FAIL** if the page 404s, crashes, or shows email-themed analytics.

### Criterion 5 — Right-rail Chat answers all 3 chip prompts with real gym data

1. On any `/gymos/*` route, click the first suggestion chip **"Provide renewal numbers"**.
2. **PASS** if the agent's response references `activeSubscriptions` count AND `expiringPasses` counts (real numbers from `list-renewals`). On the current seed: subscriptions=0, expiringPasses7d=0, expiringPasses30d=0 — agent should still surface those zero values, not refuse.
3. **FAIL** if the agent says it can't help, refers to email, or fabricates numbers.
4. Repeat with **"Which classes haven't been filled in the last week?"**.
5. **PASS** if the response cites specific class names + fill percentages (real data from `list-fill-rate`). With today's date, the 7-day window catches seeded May 18-22 occurrences.
6. Repeat with **"Which customers should I reach out to?"**.
7. **PASS** if the response cites specific member names + reasons (e.g., "no bookings in 30 days", "pass expiring next week"). All 5 seeded members should be at-risk per `list-at-risk-members` logic (last booking is May 18-22, > 14 days old by today).
8. **CROSS-CHECK (negative test):** ask _"archive my emails"_. **PASS** if the agent refuses / says it's gym-only. **FAIL** if it tries to use `archive-email` or `list-emails`. (Mail actions are still on disk; the systemPrompt is the only gate.)

### Criterion 6 — Free-text out-of-window send rejected by worker chokepoint

1. Open the conversation you prepared with `last_inbound_at > 24h ago` (or update one row now: `UPDATE conversations SET last_inbound_at = NOW() - INTERVAL '25 hours' WHERE id = '<some-id>';`).
2. Open that conversation.
3. Send a free-text message via the **Send** button (NOT Templates). _Note: the UI's pre-flight gate may disable Send and show "Out of 24h window — use a template". If so, the UI prevented the send — that's a PASS for the UI hint, but to verify Criterion 6 you need to exercise the worker chokepoint. Either temporarily flip the UI gate OR (preferred) call the action endpoint directly via curl/devtools to bypass the UI hint and confirm the worker rejects it._
4. The optimistic message inserts with `status='queued'`.
5. **PASS** if within ~10 seconds, the status moves to `failed` AND the failed-bubble copy reads something like _"24h window closed"_ (per the `failedCopy(errorCode)` mapping for `WINDOW_EXPIRED`).
6. **PASS CROSS-CHECK** if the worker logs show the typed `WindowExpiredError` was raised BEFORE any Meta API call (confirms gate held). Check with `fly logs -a gymos-worker` or look at the local worker terminal output.
7. **FAIL** if the message reached Meta (worker logs show a Meta POST attempt), OR if status never updates from `queued`.

### Criterion AUTH-neg — Non-allowlisted Google account → `/access-denied`

1. Open another incognito session.
2. Sign in with a Google account whose email is NOT in `CUSTOMER_ALLOWED_EMAILS`.
3. **PASS** if you land on `/access-denied` with the branded page (GymClassOS wordmark, `IconLock`, _"Access not permitted"_ heading, body about studio admin, _"Sign in with a different account"_ button).
4. **FAIL** if you land on `/gymos`, on a 401/403 error page, or anywhere else.

> **Cleanup after AUTH-neg:** click _"Sign in with a different account"_ — it should POST to `/_agent-native/auth/logout` then redirect to `/_agent-native/google/auth-url?redirect=1` (fresh Google consent screen).

---

## Success Criteria Results

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Sign-in lands on /gymos with no email redirect | PENDING | _Fill in: PASS or FAIL + observed URL_ |
| 2 | /gymos/* shows only gymos top-nav + content + right-rail Chat | PENDING | _Fill in: PASS or FAIL + which surfaces checked_ |
| 3 | Templates dialog → selecting hello_world → real Meta send | PENDING | _Fill in: PASS or FAIL + final message status + whether test number received_ |
| 4 | /gymos/analytics shows at least 3 real metrics | PENDING | _Fill in: PASS or FAIL + which cards had non-– values_ |
| 5 | Right-rail Chat answers all 3 chip prompts with gym data | PENDING | _Fill in: PASS or FAIL per prompt + result of "archive my emails" cross-check_ |
| 6 | Free-text out-of-window send rejected by worker chokepoint | PENDING | _Fill in: PASS or FAIL + which error code surfaced + worker log confirmation_ |
| AUTH-neg | Non-allowlisted Google account lands on /access-denied | PENDING | _Fill in: PASS or FAIL + observed landing URL_ |

---

## Open Issues

> List any FAILs here. For each failure, capture:
> - **Criterion:** which one
> - **What happened:** observed behaviour
> - **Suspected plan:** which P1b.1-NN plan likely needs revision
> - **Suggested fix:** if obvious

_(None yet — fill in during walkthrough.)_

---

## Sign-off

- [ ] **All 7 criteria PASS** — phase complete, ready to update ROADMAP (mark P1b.1 phase ✓, advance state)
- [ ] **Some FAILs** — gap closure required via `/gsd:plan-phase P1b.1 --gaps` (the failed criterion numbers tell us which plans need revision)

---

*Phase: P1b.1-customer-pilot-enablement*
*Plan: 08 (end-to-end verification)*
*Scaffold created: 2026-05-25 (pre-walkthrough — results PENDING)*
