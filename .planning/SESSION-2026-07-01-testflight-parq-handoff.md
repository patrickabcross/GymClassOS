# Handoff — TestFlight onboarding + PARQ + post-demo scope

**Created:** 2026-07-01 (demo went well; goal = prove RunStudio replaces bSport for HUSTLE)
**Deploy:** `git push origin master` → Vercel prod (`gym-class-os.vercel.app`). Mobile = EAS build.

---

## Shipped + LIVE-VERIFIED this session
- **Mobile owner AI + teacher surfaces activated on prod:** set `RUNSTUDIO_OPERATOR_EMAILS` + `RUNSTUDIO_TEACHER_EMAILS` on Vercel. Owner AI verified streaming real data on device.
- **Parallel-tool bug fixed** (admin agent stream now handles multiple `tool_use` blocks; was stalling on "what's my retention rate"). Live-verified.
- **"Everyone is a member; role reveals extra" model adopted** — admins/teachers get `gym_members` rows so `/api/m/profile` stops 403→PHONE_REQUIRED.
- **PARQ v1** — HUSTLE's exact PAR-Q published at **`/f/parq`** (+ Full name/Email/DOB identity fields).
- **PARQ v2 backend — LIVE + E2E-verified:** `gym_members.parq_completed_at` + `parq_flagged` (migration 0009 / runMigrations v38); `/api/m/bookings` returns **403 PARQ_REQUIRED** until PARQ signed; `/f/parq` submit stamps the columns + flags any health "yes"; `/api/m/profile` exposes status. Verified: no-PARQ→403, submit→stamps, re-book→NO_PASS (cleared), health-yes→flagged true.

## Test accounts (prod)
| Email | Password | Role |
|---|---|---|
| owner.test@runstudio.dev | `TestPass123!` | admin (test) |
| teacher.test@runstudio.dev | `TestPass123!` | teacher (test; linked trn_seed_12 Ben O'Connor) |
| **bobby@rarebirdlondon.co.uk** | `HustleApp2026!` | **admin — REAL gym owner (TestFlight)** |
| **eleanor.perllman@hotmail.co.uk** | `HustleApp2026!` | **admin — REAL gym owner (TestFlight)** |

Seeded for teacher roster: `mbr_uat_roster_001` (Uat Roster-Test) booked into `cocc_nk1rrtjmuqkr`.

## Mobile changes committed but NOT yet on any device (need a rebuild)
All on `master`; the last EAS builds predate them. One `eas build -p ios --profile testflight` (+ `eas submit`) folds in ALL of:
1. FAB gated to **owner/admin only** + member tabs shown for all roles + AgentSheet composer restructure (quick fq6)
2. Bottom-sheet `enableDynamicSizing:false` — chat sheet scrolls, composer pinned
3. **Sparkle "AI chat" FAB** + **role-refresh on auth transition** (fixes stale-role showing FAB to teacher/member after switching accounts)
4. **PARQ Book-prompt** — on Book, PARQ-incomplete member is prompted to `/f/parq` (backend gate already enforces regardless)

---

## NEXT STEPS (priority order)

**① TestFlight — IN PROGRESS.** Owner accounts + `testflight` EAS profile (store dist + live API + push stripped) done. Owner was running `eas build -p ios --profile testflight` → `eas submit -p ios --latest`. **Remaining:** finish submit → in App Store Connect add bobby + eleanor Apple IDs as **internal testers** → they install via TestFlight → sign in with the creds above. NOTE: choose Apple team **Patrick Ross Individual (847AQY2QXN)** — bundle id `com.airunstudio.app` is registered there; the Hustle Norwich org team would hit a bundle-id conflict (transfer to org later for production).

**Rebuild** (recommended alongside ①): the current testflight build predates the PARQ prompt + sparkle FAB + role-refresh — one more `testflight` build gets everything on device.

**⑥ Stripe sandbox for HUSTLE.** Create 3 **test-mode** products on the connected account with keyword descriptions (`drop-in` / `5-pack` / `10-pack`) → set `STRIPE_PRICE_DROP_IN` / `_5_PACK` / `_10_PACK` on Vercel → redeploy. Then book-and-pay works in the app (Disconnect button on Settings→Integrations resets the connection). Only DROP_IN + MEMBERSHIP price ids currently set.

**② bSport migration.** bSport API access is blocked → user will **copy-paste**. Need: passes/subscriptions **with exact prices** + class list + **compatible-pass mapping**. Teachers already migrated (23 trainers match bSport). ~30 classes, ~30 passes. **Design gap:** RunStudio passes are *generic credits*; bSport restricts which passes book which class — decide replicate-vs-generic-v1 before building the importer.

**④ Gym check-in kiosk** (tablet: pick class + profile → confirm attendance → drives `mark-booking-attended`; in-app QR as the smoother option). Later.

**⑤ Calorie app → AI-image-only, photo-first** (camera is step 1; drop/hide barcode+search). Mobile change — batch with a rebuild. Later.

## Also still open (older)
- **Meta CAPI tokens** not entered → CAPI sends no-op. (Explored a strong future idea: AI reads WhatsApp conversation → fires mid-funnel CAPI stage events matched by hashed phone; `stage_event_map` + `getMemberHashes` already exist. Not built.)
- Stripe still TEST platform key.

## Cleanup pending (prod test artifacts — ASK before delete; KEEP bobby/eleanor = real owners)
`owner.test` / `teacher.test` users + `mbr_staff_owner_001` / `mbr_staff_teacher_001` / `mbr_uat_roster_001` + booking `bkg_uat_roster_001`; older `bugtest-*` users. (owner.test `parq_flagged` got set true during a flag test — harmless.)

## Gotchas reinforced this session
- Sign-in-only app; accounts created via Better-auth sign-up endpoint (`/_agent-native/auth/ba/sign-up/email`). Email is a username — no inbox access needed to log in.
- TestFlight needs a **store** build (`testflight` profile) — ad-hoc `preview-install` builds can't be submitted.
- Vercel env changes need a **redeploy** (empty commit + push) to take effect; Fly `secrets set` restarts automatically.
- `app_secrets`/env empty-UI gotcha: keys can read empty for a non-saver login but still be set — don't re-paste.
