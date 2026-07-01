# Handoff — UAT + Move Platform Tokens to Production

**Created:** 2026-07-01
**Restart focus:** (A) migrate all platform tokens/secrets to PRODUCTION, then (B) run UAT.
**Deploy:** `master` is LIVE on Vercel (`gym-class-os.vercel.app`) — deploy = `git push origin master` ONLY (no vercel CLI, no root `.vercelignore`). All work below is already pushed + smoke-tested live.

---

## What shipped this session (2026-06-30 → 07-01)

- **v2.3 mobile milestone MA2 + MA3 + MA4 — BUILT, verified, DEPLOYED, live-smoke-tested.** (MA1 was already done; MA5 Push is the only remaining phase — intentionally last, EAS/Apple-gated.)
  - **MA4 Admin AI agent** (differentiator + security keystone): single `GATED_ACTIONS` source re-imported by approve-proposal + propose-action; explicit 12-verb `MOBILE_ADMIN_ALLOWLIST` (read + dashboard only) + `buildAdminToolList` defensive filter + AI-02 unit test (5/5); `requireAdmin` 403-before-stream; `POST /api/m/admin/agent/stream` under `runWithRequestContext`; `GET /api/m/whoami`; mobile `AgentSheet` role-gated. **Live-verified:** admin SSE + teacher endpoints 403 a member token.
  - **MA3 Teacher surface**: additive `trainers.user_id` (TEXT) migration v37 — **APPLIED to Neon `billowing-sun-51091059`**; `requireTeacher` (no member claim) + `resolveTrainerIdForUser`; `GET /api/m/me`; `/api/m/teacher/{schedule,roster,check-in}` (check-in is a caller of the existing `mark-booking-attended` chokepoint — no new write path); mobile role-branched tabs + FAB hidden for teachers (reconciled with MA4 admin FAB as `role !== "member" && !isAdmin`).
  - **MA2 Member booking**: `getOptionalMember` + anonymous `/api/m/schedule` (public browse); **atomic pass-debit-on-booking transaction** (capacity + FIFO active-pass + `pass_debits` + `bookings.pass_id`, mirrors `cancel-occurrence.ts`; 402 NO_PASS / 409 CAPACITY_FULL); product picker → Stripe → poll-for-grant → re-book; `upcomingBookings[]` on profile + Home list. **Live-verified:** anon schedule 200, booking no-pass → 402 with ZERO mutation.
- **Bug #2 fixed** (quick 260630-mw8): mobile sign-in maps 401/`INVALID_EMAIL_OR_PASSWORD` → "Incorrect email or password." (reaches devices only on next EAS build).
- **Bug #1 diagnosed** (calorie photo 401): NOT a backend defect — server honors Bearer on the POST/image path (proven live incl. 4.3MB body, real photo → 200 estimate). It's a client/device token-availability issue; retest on device with the current build.
- **Recurring timetable created** (data, not code): 6 weekly rules → 2 classes/day, 112 occurrences generated via the real DST-correct generator; nightly `class-materialize` cron extends it idempotently. Morning 07:00 = HIIT(M/W/F)/STRENGTH(T/Th)/HYROX(Sa/Su); Evening 18:00 = BOX(M/W/F)/ROUNDS(T/Th)/Vinyasa(Sa/Su); Norwich + Wymondham. Verified live on `/api/m/schedule`.

---

## (A) PRODUCTION TOKEN / SECRET MIGRATION — the restart's main job

Secrets live in three places: **Vercel env** (staff-web), **`app_secrets`** table (Settings → Integrations → "API Keys & Connections", resolved by-key studio-global), and **Fly env** (`gymos-edge-webhooks`, covers both `web` + `worker` processes). Gotcha: `app_secrets` UI shows keys as EMPTY for any login ≠ the original saver, but they ARE set (runtime resolves by-key) — do NOT re-paste (creates a competing row that wins via `updated_at DESC`).

### 1. Meta CAPI (currently a NO-OP — highest-value token gap)
Pipeline (MC1–MC3) is built + deployed; sends no-op until keys exist.
- **DONE:** `BETTER_AUTH_SECRET` set on Fly `gymos-edge-webhooks` (web+worker) — worker can decrypt `app_secrets`.
- **TODO (operator, in `/gymos/settings/integrations` → Meta Conversion Tracking card):** enter **Pixel ID**, **CAPI token**, **Test Event Code**, **Page Access Token**. No `META_*` keys are in `app_secrets` yet.
- **TODO (Meta dashboard):** subscribe the Page's **`leadgen`** webhook field to `https://gymos-edge-webhooks.fly.dev/webhooks/meta-lead` (verify token = `WHATSAPP_VERIFY_TOKEN`).
- **Optimisation target:** `Contact` event (first inbound WhatsApp reply). Event names configurable via `stageEventMap` on `studio_owner_config` — rename to match existing Meta custom conversions, zero code change.
- **Verify:** Meta Events Manager → Test Events shows `Lead`/`Contact`/`Purchase`/`Schedule` firing with the Test Event Code.

### 2. Stripe → LIVE (currently TEST)
- Test key live on Fly + Vercel; platform acct `acct_1JiJBpEDUyRYOcLT`; **Stripe Connect** model (studio = connected account, direct charge).
- **TODO:** complete Connect **KYC** (Account Link onboarding via Settings → Integrations "Connect Stripe"); swap the platform Stripe **secret key** test→LIVE on Vercel + Fly; rotate the **Stripe webhook signing secret** (Fly) for the live endpoint.
- **TODO for MA2 booking paywall (MEM-04):** on the **connected** account create 3 products with keyword descriptions (`drop-in` / `5-pack` / `10-pack` — the `checkout-session-completed` reducer grants credits by keyword) and set `STRIPE_PRICE_DROP_IN` / `STRIPE_PRICE_5_PACK` / `STRIPE_PRICE_10_PACK` (connected-account price ids) on Vercel. Until then `GET /api/m/purchase` degrades to "contact the studio" (a pass-holder still books).

### 3. MA3 teacher activation (new env this session)
- **TODO:** populate `trainers.user_id` by email, once per HUSTLE teacher who will sign in:
  ```sql
  UPDATE trainers t SET user_id = u.id FROM "user" u
  WHERE lower(u.email)=lower('<teacher-email>') AND lower(t.name)=lower('<Trainer Name>');
  ```
- **TODO:** set `RUNSTUDIO_TEACHER_EMAILS=a@x,b@y` on Vercel (staff-web, Production). Until set, EVERY login resolves to `member` and the teacher surface is unreachable (safe default). `RUNSTUDIO_OPERATOR_EMAILS` (admin) already includes Patrick — add any HQ email there too.
- Migration v37 (`trainers.user_id`) already applied to Neon.

### 4. WhatsApp / MYÜTIK (verify, likely already prod)
- Worker creds live as **Fly ENV** (not app_secrets — worker can't decrypt without BETTER_AUTH_SECRET, now set). MYÜTIK relay; send is window-driven (open→text only; closed→approved template). If the number changes, `phoneNumberId` changes → update worker Fly env + Settings `app_secrets`. Src: `C:\Users\dimet\myutik-br1`. See `WHATSAPP_HANDOFF.md`.

### 5. Confirm the rest are production values
- `ANTHROPIC_API_KEY` (LLM — powers agent + calorie estimate), `BETTER_AUTH_SECRET` (Vercel + Fly parity), `DATABASE_URL` (Neon), `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_VERIFY_TOKEN`.

### 6. Cleanup (test artifacts left in PROD from this session)
- Throwaway Better-auth users `bugtest-*@example.com` (several) + `bugtest-happy-1782833922@example.com` in the `user` table (no membership).
- Test `gym_members` row `mbr_bugtest_happy_001` (linked to the bugtest-happy user).
- These were used for live smoke tests; safe to delete. (Ask before DELETE per Neon safety.)

---

## (B) UAT

### Web (can do now against live deploy)
- Staff `/gymos/schedule`: the new recurring timetable renders; try the location/class/trainer filters; try edit/deactivate-series (bookings-safe).
- Meta Test Events (after tokens entered): submit a lead form → `Lead`/`Contact` fire.
- Booking API sanity already smoke-tested (anon browse 200; no-pass → 402, zero mutation).

### Device (EAS/Apple-gated — same blocker as MA1-03)
Needs an EAS dev build on a physical iPhone (Apple Dev account) OR an Android device. `eas init` writes owner/projectId (see `packages/mobile-app/IOS-EAS-RUNBOOK.md`).
- **Member (MA2):** anon browse → Book wall → sign-in resume → pass-holder optimistic book (verify Neon `+1 pass_debits` + `bookings.pass_id`) → full-class rollback → no-pass picker → Stripe → poll → auto-book → Home upcoming list.
- **Teacher (MA3):** teacher email lands on teacher schedule (assigned only), roster, tap-to-check-in (drives chokepoint, Meta `Schedule` fires), NO agent FAB, empty-state not error.
- **Admin (MA4):** admin sees "RunStudio Ops" sheet, streams from the admin endpoint; member/teacher do NOT.
- **Bug #1 retest:** calorie photo estimate on device (should work now; if 401, harden `apiFetch` to treat 401 as session-expired → re-sign-in).
- **Bug #2 confirm:** wrong password shows the friendly message.

---

## Pointers / gotchas
- Deploy = `git push origin master`. NEVER add a root `.vercelignore`. Every file in `server/plugins/` needs a default export (helpers → `server/lib`).
- Migrations are additive-only and NOT auto-run — apply to Neon `billowing-sun-51091059` by hand. `active` columns MUST be boolean.
- `app_secrets` by-key resolution + the empty-UI gotcha (don't re-paste).
- Verification docs: `.planning/phases/MA{2,3,4}-*/MA*-VERIFICATION.md` (all `human_needed` = device/operator only, no code gaps).
- Prior open tails still tracked: delete stray Vercel project `agent-native-mail-probe`; MYÜTIK "text is required" window-divergence; 5 terminal failed WhatsApp message rows to re-enqueue.
