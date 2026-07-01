---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: — Mobile App Production Foundation
status: planning
stopped_at: "Completed quick task 260701-gka: add non-destructive Stripe Disconnect button to Settings Integrations page"
last_updated: "2026-07-01T11:06:11Z"
last_activity: "2026-07-01 — Completed quick task 260701-dyk: EXPO_PUBLIC_API_BASE on the preview-install EAS profile (standalone iOS build targets live backend). Also this session (not quick tasks): activated mobile admin (owner AI) + teacher surfaces on prod for UAT — set RUNSTUDIO_OPERATOR_EMAILS + RUNSTUDIO_TEACHER_EMAILS (deploy fac67ba1), created owner.test/teacher.test accounts, linked trainers.trn_seed_12 → teacher, seeded a booked member into a teacher class; all role gating API-verified."
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-24 — Current Milestone: v2.3 — Mobile App Production Foundation)
Roadmap: `.planning/ROADMAP.md` (v2.3 section at top, 5 phases MA1–MA5; v2.2/v2.1 sections below; v2.0 collapsed to shipped summary)
Requirements: `.planning/REQUIREMENTS.md` (v2.3 requirements, 22 in-scope: AUTH-01..07, MEM-01..05, TCH-01..03, AI-01..03, NOT-01..04; traceability mapped MA1–MA5)

**Core value:** Members book/pay, teachers run sessions and check members in, and admins drive the studio via an in-app AI agent — all from one authenticated native Expo app, with push notifications closing the loop. The booking app is table stakes; the admin AI agent is the differentiator.

**Current milestone:** v2.3 — Mobile App Production Foundation (member / teacher / admin). Started 2026-06-29. The RunStudio mobile app (`packages/mobile-app`, Expo) gets a real production Better-auth foundation serving 3 server-routed roles, replacing the `demoMemberId` hack: member booking + Stripe paywall, teacher check-in, admin AI ops agent, Expo push.

**Roadmap shape (5 phases, prefix `MA`):** MA1 Auth + 3-role spine (one-way door; auth spike first) → MA2 Member booking → MA3 Teacher check-in → MA4 Admin AI agent (allow-list keystone) → MA5 Push (last; EAS/Apple-gated). MA2/MA3/MA4 depend only on MA1 and are reorderable by value; MA5 is last. MA1 + MA5 flagged for phase-level research/spike.

## Current Position

Milestone: v2.3 — Mobile App Production Foundation (member / teacher / admin)
Phase: MA1–MA4 COMPLETE + DEPLOYED (live-smoke-tested); MA5 (Push) is the only remaining phase (last; EAS/Apple-gated)
Plan: none active — next work is NON-code: (A) UAT + (B) moving platform tokens to production
Status: **RESTART HERE → `.planning/SESSION-2026-07-01-uat-and-production-tokens-handoff.md`.** This session (2026-06-30→07-01): planned+verified+executed MA2/MA3/MA4 (all plan-checkers PASSED; all phase-verifiers PASSED at code level, only device/operator items `human_needed`); pushed 52 commits to master → Vercel; **live-smoke-tested** (anon `/api/m/schedule` 200, `whoami` role, admin + teacher endpoints 403 a member token, booking no-pass → 402 with ZERO mutation); fixed bug #2 (sign-in error UX, quick 260630-mw8); diagnosed bug #1 (calorie photo 401 = client/device token issue, backend proven fine live); seeded a **recurring timetable** (6 rules → 2 classes/day, 112 occurrences, DST-correct, materialiser extends). `trainers.user_id` v37 APPLIED to Neon. **Next focus: (A) move platform tokens to PRODUCTION — Meta CAPI tokens (sends no-op until entered in Settings→Integrations + subscribe leadgen webhook), Stripe test→LIVE + connected-account products + STRIPE_PRICE_*, RUNSTUDIO_TEACHER_EMAILS + populate trainers.user_id, verify app_secrets/Fly parity, delete bugtest-* test accounts; (B) UAT — web now, mobile via EAS build. FULL CHECKLIST in the handoff doc.**

---

### (Archived detail — MA2/MA3/MA4 execution, this session)

Status: MA2-03 COMPLETE — mobile schedule booking + inline purchase wired end-to-end (MEM-02/03/04). Two atomic commits on master (`77502c3d` Book-press auth gate + resume + optimistic NO_PASS/CAPACITY branches; `672724bd` no-pass product picker + Stripe purchase → poll-for-grant → re-book). One edited screen (`app/(tabs)/schedule.tsx`) + 2 new files (`lib/purchase-poll.ts` pollForGrant 2s/30s; `components/ProductPickerSheet.tsx` drop-in/5-pack/10-pack, drop-in default-highlighted). Book press gates on `getSessionToken()` → signed-out stores intent + `/sign-in`; `useFocusEffect` resumes once after sign-in (server-authoritative — always mutates, lets onError(NO_PASS) open the picker). Optimistic booking: 402 NO_PASS → picker (no red error); 409 CAPACITY_FULL → rollback + "just filled up". No-pass flow: GET /api/m/purchase products → POST → `WebBrowser.openBrowserAsync` hosted Checkout → `pollForGrant` (browser return = "user came back" only, grant observed by polling) → re-POST /api/m/bookings; poll timeout → "tap Book again"; empty product list / 503 → "contact the studio" degrade (a pass-holder always books). Stale "Pay drop-in" stub (booked without paying) replaced by a single gated Book action. **Full `packages/mobile-app` tsc --noEmit EXIT 0**; prettier run; no new dependency; no migration. On-device iOS verify deferred (EAS/Apple-gated, MA1-03 pattern) — MA2-04 is the formal device pass. **OPERATOR (end-to-end MEM-04 only):** set `STRIPE_PRICE_DROP_IN`/`5_PACK`/`10_PACK` on the connected account + product descriptions containing the credit keywords. Next: MA2-04 (final member-booking plan / device UAT).
Status (prior, MA2-02): MA2-02 COMPLETE — mobile entry/sign-in/home wired (MEM-01 client + MEM-02 mechanism + MEM-05 client). One new file (`lib/pending-booking.ts`) + 3 edits; AuthGate wall moved off app entry; sign-in returns to `/(tabs)/schedule` on a pending intent; Home renders additive `upcomingBookings[]`. MA3/MA4 `_layout.tsx` role gating reconciled, NOT clobbered.
Status (prior, MA3): MA3 COMPLETE — TCH-01/02/03 all done. MA3-03 SHIPPED (mobile teacher surface, `packages/mobile-app`). Five files, three atomic commits on master (`5c04c2dc` useRole+FAB-gate+tabs, `34b97f1c` teacher-schedule tab, `3be6cc4d` roster+check-in). `lib/use-role.ts` reads `GET /api/m/me` once (TanStack Query, 5m staleTime, defaults member). App role-branches off it: member 5-tab set vs teacher Schedule+Profile via Expo Router `href` toggle (tabs stay declared unconditionally). **FAB gate reconciled with MA4:** `role !== "member" && !isAdmin` → members get coach FAB, admins keep the MA4 "RunStudio Ops" sheet, teachers get NO AI surface (TCH-03); also hidden while role null (no flash). Teacher Schedule tab (`app/(tabs)/teacher-schedule.tsx`, TCH-01) lists assigned sessions grouped by day, each → pushed roster; empty states are copy keyed on `trainerLinked` (unlinked vs no-sessions), never an error. Roster screen (`app/teacher-roster.tsx`, TCH-02) = optimistic tap-to-check-in (onMutate row→attended, onError rollback+toast, onSuccess invalidate) → `POST /api/m/teacher/check-in {bookingId}` (the existing mark-booking-attended chokepoint). All five MA3-03 files tsc-clean (Feather icons, prettier). Deferred: 1 pre-existing `fontVariant` readonly-tuple tsc error in unmodified `app/(tabs)/index.tsx:546` (see MA3 deferred-items.md). On-device iOS verify deferred (EAS/Apple-gated, MA1-03 pattern). **OPERATOR steps pending (runtime, from MA3-01):** apply v37 to Neon `billowing-sun-51091059`; populate `trainers.user_id` by email per teacher; set `RUNSTUDIO_TEACHER_EMAILS` on Vercel — until done, all logins resolve to member (app safely shows the member surface) and teacher routes 403. Next: MA5 (Push, last; EAS/Apple-gated). Prior: MA1 complete, MA2 planned, MA4 complete (3/3).
Last activity: 2026-07-01 — Completed quick task 260701-gka: non-destructive "Disconnect Stripe" button on staff-web Integrations (clears local connected_accounts row via scoped delete + shadcn AlertDialog confirm; reconnectable; no accounts.del) — web change, deploys via push. Device UAT in progress: preview-install iOS build live on device; owner login + owner AI (RunStudio Ops) verified streaming real data on device; Bug#1 (calorie photo) + Bug#2 (wrong-email alert) confirmed fixed. Adopted "everyone is a member; role reveals extra" model — gave owner.test/teacher.test gym_members rows (mbr_staff_owner_001 / mbr_staff_teacher_001) so /api/m/profile stops 403→PHONE_REQUIRED. Completed quick task 260701-fq6 (FAB owner-only + member tabs for all roles + AgentSheet composer fix) — NEEDS a preview-install rebuild to land on device. Earlier: quick 260701-dyk: EXPO_PUBLIC_API_BASE on the preview-install EAS profile (standalone iOS build targets live backend). Also this session (not quick tasks): activated mobile admin (owner AI) + teacher surfaces on prod for UAT — set RUNSTUDIO_OPERATOR_EMAILS + RUNSTUDIO_TEACHER_EMAILS (deploy fac67ba1), created owner.test/teacher.test accounts, linked trainers.trn_seed_12 → teacher, seeded a booked member into a teacher class; all role gating API-verified.

1. **Schedule filters** (quick 260625-d06): location/class-type/trainer on the staff calendar (shadcn Popover) + public embed (native selects); loader Query A widened w/ trainer leftJoin. SHIPPED.
2. **Studio-global sites config** (quick 260625-gsg): `resolveSites` + `sites` JSONB col (v35) + Settings→Integrations→Locations card; replaces the hardcoded Norwich/Wymondham picker. SHIPPED; HUSTLE sites seeded as DATA on Neon (singleton row).
3. **Tenancy stash-pop resolved** (701ba1f1): `isDeployCredentialFallbackAllowed`/`isEnvVarWriteAllowed` now default single-tenant-per-deploy (allow), `AGENT_NATIVE_MULTI_TENANT=true` opt-in restores the upstream gate. Direction shift → shared/sharded subdomains (≤10 gyms, shared DB) supersedes "single-tenant code, multi-tenant deploy". See [[project_gymos_tenancy_direction]].
4. **SCHEDULE 500 OUTAGE fixed** (quick 260625-mvn): `trainers.active` + `class_schedule_rules.active` were `bigint` not `boolean` → Drizzle `eq(active,true)` 500'd the whole loader (broken since lp3 06-22, unnoticed). Prod HOTFIXED on Neon (ALTER to boolean) + durable guarded v36 migration / `0008_active_boolean_fix.sql`. **Brain page scroll fixed** (was missing the `overflow-y-auto` wrapper). See [[project_gymos_active_boolean_gotcha]].
5. **iOS build prep** (commits c2257a52/41753cfa/24726608): `app.json` → name Hustle, slug hustle, bundle `uk.co.doyouhustle.app`, upstream owner/projectId stripped for `eas init`; expo-doctor pre-flight (removed invalid `newArchEnabled`, 15/19); `packages/mobile-app/IOS-EAS-RUNBOOK.md`. Repo fully prepped; build gated on Apple Dev account.
6. **Wearable health SPEC** written (`.planning/specs/HEALTH-WEARABLES-SPEC.md`): Apple Watch/HealthKit first, Garmin fast-follow — but **Garmin paused new API approvals** → Apple-only build. See [[project_gymos_apple_health]].
7. **Inbox: merged Messages+Leads** (quick 260625-x34): the Messages/Leads tabs (a `?filter=leads` partition on `conversations.status`) are GONE — `/gymos/messages` is now one unified "Inbox" list of all conversations. Each lead carries a source badge: `Form: {form title}` (derived live from `form_submissions → forms.title`), `Imported`, `WhatsApp`, `Meta ad`, `Added manually`. NO schema change (derives from existing tables: `whatsapp_opt_in.source` + form link). Loader SQL validated against prod Neon before push (no 500 risk — lesson from #4). DEPLOYED. **Known gap (RESOLVED quick 260626-egy):** leads with no source data (e.g. the "Diag Test" rows — no opt-in, no form submission) now show a secondary "Lead" badge with IconUserPlus. Commit 21b63fd7.

**OPEN ITEMS / next-session pickup:**

- **Meta activation — step 1 DONE (2026-06-26), steps 2+3 still user-gated:** (1) ✅ `BETTER_AUTH_SECRET` set on Fly app `gymos-edge-webhooks` (covers BOTH `web` + `worker` processes — worker runs as a process in the same app, not a separate Fly app). Value pulled from `apps/staff-web/.env.local` and PROVEN correct by test-decrypting a live `app_secrets` row (WHATSAPP_PHONE_NUMBER_ID → valid 16-digit id). Worker can now decrypt app_secrets. (2) **PENDING (operator):** enter Pixel ID + CAPI token + Test Event Code + Page Access Token in `/gymos/settings/integrations` — no META_* keys in app_secrets yet, so CAPI sends still no-op until entered; (3) **PENDING (Meta dashboard):** subscribe the Page's `leadgen` webhook field in Meta to `https://gymos-edge-webhooks.fly.dev/webhooks/meta-lead` (verify token = WHATSAPP_VERIFY_TOKEN). See [[project_gymos_deploy]].
- **Delete stray Vercel project `agent-native-mail-probe`** (vanilla agent-native pg-crash comparison probe, ~31d old, abandoned) — user to delete in Vercel dashboard.
- **Embed cross-origin fix (quick 260624-icd) SHIPPED + verified live** — embed.js CORP=cross-origin, /f/{slug} XFO removed; embeds now work on third-party sites (doyouhustle.co.uk). Hard-refresh the Squarespace page to clear its cached empty state.
- **ROLLOUT STAGES (defined 2026-06-25):** (a) on-site **chatbot** = embed MYÜTIK's agent widget (near-zero repo code; needs MYÜTIK-side agent config) — see [[project_gymos_chatbot]]; (b) **iOS app** — see iOS below; (c) **Stripe go-live** (KYC + live keys; still partial); (d) schedule **filters** DONE; (e) **trainers** in platform DONE (+ sites config). 3 of 5 shipped.
- **iOS build — gated on Apple Dev account going live (user provisioning it).** Next concrete step (can run NOW, Expo logged in as patrickalexanderross, no Apple needed): `cd packages/mobile-app && eas init` → writes new owner/projectId. THEN (needs active Apple acct + a physical iPhone): register App ID `uk.co.doyouhustle.app`, grab Team ID, `eas device:create`, `eas build -p ios --profile development`. Full steps + expo-doctor findings in `packages/mobile-app/IOS-EAS-RUNBOOK.md`.
- **LIVE-VERIFY pending (do a click-through):** `/gymos/schedule` (500 fixed via prod DB ALTER — confirmed HTTP 200 via curl) and `/gymos/brain` (scroll fix pushed, deploys via Vercel — needs a visual check; it's an authed CSR page so can't curl-verify). The d06 filters shipped onto an already-broken schedule page, so a real click-through of both is worth doing.
- **Garmin Health API on hold** — Garmin temporarily paused approving new API requests; wearable-health build is Apple-only until they reopen (or route via an aggregator). See [[project_gymos_apple_health]].

Prior (v2.1):
Status: CV1-CV4 built + committed on master. Full staff-web `tsc` clean (0 errors), 115/115 unit tests pass. **NOT deployed** — production push held for explicit user go-ahead (autonomous run pre-approved build only). CV-RENDER remains gated.
Last activity: 2026-06-26 — Completed quick task 260626-m1c (swap marketing homepage video slot to runstudio-film.mp4; static asset + SSR markup, 5 locale homepages share it). Earlier: 260624-vzw (schedule embed onboarding UI — Share/embed Popover on schedule header; backend already existed). Earlier: 260624-p2x (lead-ack auto-reply middle var → personalized qualifying question, DEPLOYED 2e2b6b0c + confirmed working live; needs 2-slot approved template for clean wording). Earlier: 260624-klo (inline lead-form validation, DEPLOYED 97129e85), 260624-icd (cross-origin embed headers fix). Earlier still: Phase 2 recurring classes (quick 260622-mpv) DONE + DEPLOYED (Vercel + Fly v21, class-materialize cron live). Plus shipped+deployed: WhatsApp template-language fix (en, commit 32abd6cd), editable Forms submit button (14501fd1), conversational template auto-fill (6cfff666). OPEN: WhatsApp "text is required" window-divergence (waiting on MYÜTIK); 5 terminal failed message rows to re-enqueue later. NEXT: Phase 3 (populate HUSTLE timetable) + tracking setup.

> **Open tails from prior milestones:** v2.0 live UAT (BD1–BD4 `*-HUMAN-UAT.md`) deferred-on-external-dependency. v1.2 Agentic Tab Editing live UAT pending (AE1–AE3 deployed). v1.0 Production + Mobile Demo (AE4) remain tracked.

**Progress bar (v2.1):** [██████████] 100% (4/4 active phases, 4/4 plans) — built, not yet deployed

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| fast | Mobile owner FAB: (a) sparkle "AI chat" pill — Feather message-circle → Ionicons `sparkles` + "AI chat" label, round FAB → pill; (b) role-staleness fix — `fetchRole` was once-on-mount so testing owner first cached role=admin and the FAB then showed for later teacher/member logins; now re-resolves when `segments[0]` flips sign-in↔(tabs), clearing on sign-in. `app/_layout.tsx`. Needs preview-install rebuild. | 2026-07-01 | 0d91a71e | — |
| fast | Owner AI stalled on "what's my retention rate" ("let me get that" then nothing). Root cause: admin agent stream (`api.m.admin.agent.stream.tsx`) used `final.content.find(tool_use)` — handled only the FIRST tool_use, but Claude batched parallel calls (renewals + at-risk); assistant msg had 2 tool_use ids, follow-up sent 1 tool_result → Anthropic 400 → stream errored. Fixed: `.filter()` all tool_use blocks, execute+emit each, return a tool_result per id; per-tool try/catch. Server-side, deploys via push (no rebuild). NOTE: member coach endpoint likely has the same latent bug (currently unreachable — FAB owner-only). | 2026-07-01 | c557f12e | — |
| 260701-gka | Add non-destructive Stripe Disconnect button to Settings Integrations — `deleteConnectedAccount(accountId)` scoped DELETE helper + `disconnect-stripe` action intent + AlertDialog-guarded `disconnectFetcher` button in both connected states (pending + ready). No Stripe accounts.del; loader revalidates to not-connected state on success. | 2026-07-01 | 0a808064 | [260701-gka-add-disconnect-stripe-button-to-settings](./quick/260701-gka-add-disconnect-stripe-button-to-settings/) |
| fast | Agent chat sheet not scrolling + composer under the window on device: gorhom bottom-sheet v5 defaults `enableDynamicSizing:true`, overriding the fixed `["90%"]` snap point so flex:1 children (BottomSheetFlatList) get no bounded height. Set `enableDynamicSizing:false` in `lib/bottom-sheet-impl.ts` so the 90% height wins → list scrolls internally, composer stays pinned. Follow-up to fq6; needs a `preview-install` rebuild. | 2026-07-01 | cdd13aca | — |
| 260701-fq6 | Mobile role UX + agent composer: FAB gated to admin/owner-only (`if (!isAdmin) return null` — removes coach/teacher chat for now); member tabs (Home/Classes/Passes/Log) shown for ALL roles (`href: undefined`), teacher keeps additive Schedule tab; AgentSheet reply box fixed — RN FlatList/TextInput → gorhom `BottomSheetFlatList`/`BottomSheetTextInput`, dropped nested KeyboardAvoidingViews, safe-area bottom padding, snap point 66%→90% + keyboard props. Client-only, 4 files. Needs a `preview-install` rebuild to reach device. | 2026-07-01 | 8c37fb29 | [260701-fq6-mobile-role-ux-agent-composer-fab-owner-](./quick/260701-fq6-mobile-role-ux-agent-composer-fab-owner-/) |
| 260701-dyk | Add `EXPO_PUBLIC_API_BASE=https://gym-class-os.vercel.app` to the `preview-install` EAS build profile env in `packages/mobile-app/eas.json` so standalone iOS builds target the live Vercel backend instead of the `localhost:8081` fallback (UAT device-testing setup). Additive one-key JSON change; no app source, no other profile touched. | 2026-07-01 | 1dcdab84 | [260701-dyk-add-expo-public-api-base-to-preview-inst](./quick/260701-dyk-add-expo-public-api-base-to-preview-inst/) |
| 260630-mw8 | Fix mobile-app sign-in wrong-password UX — `signInWithEmail` `!res.ok` branch now maps 401/`INVALID_EMAIL_OR_PASSWORD` → "Incorrect email or password." and other non-2xx → "Couldn't sign you in. Please try again." (was surfacing raw `Sign-in failed (401): {json}`); set-auth-token/Origin/network/PHONE_REQUIRED paths untouched. Bug #2 from MA1-03 device UAT. Single-file client change, no migration. | 2026-06-30 | 199cc200 | [260630-mw8-fix-mobile-app-sign-in-wrong-password-ux](./quick/260630-mw8-fix-mobile-app-sign-in-wrong-password-ux/) |
| 260620-c8p | Settings API Keys page: resolve secret status studio-global (by key) so saved keys show as set for every staff login, not just the saver | 2026-06-20 | ba34c8b8 | [260620-c8p-settings-api-keys-page-resolve-secret-st](./quick/260620-c8p-settings-api-keys-page-resolve-secret-st/) |
| 260622-d1v | Trim agent-chat Settings panel to Account+Integrations only; fix LLM env-status app_secrets false-negative | 2026-06-22 | 2ecf2387 | [260622-d1v-trim-agent-chat-settings-panel-to-accoun](./quick/260622-d1v-trim-agent-chat-settings-panel-to-accoun/) |
| 260622-e4a | Revert SettingsPanel trim; gate agent-chat gear behind operator allowlist; AGENT_NATIVE_SINGLE_TENANT flag; env-status app_secrets fix | 2026-06-22 | 4d6fe256 | [260622-e4a-revert-settings-panel-trim-gate-sidebar-](./quick/260622-e4a-revert-settings-panel-trim-gate-sidebar-/) |
| 260622-f8j | Generalize operator chrome gate: rename showSettingsGear -> showOperatorChrome; also hide Workspace button, FeedbackButton, and model picker for non-operators | 2026-06-22 | 88bc6766 | [260622-f8j-generalize-operator-chrome-gate-also-hid](./quick/260622-f8j-generalize-operator-chrome-gate-also-hid/) |
| 260622-g2k | Fast: env-status no-short-circuit — app_secrets always checked, so a key in BOTH env and app_secrets reports configured (clears false "AI assistant not configured") | 2026-06-22 | (see git) | — |
| 260622-ifj | HUSTLE tenant brand restyle — tenant-brand.ts config (Poppins, #FAD02C, #121212) + 5 customer-facing SSR surfaces + Remotion GymPromo; "RunStudio" -> "Hustle" in /v pages | 2026-06-22 | 08c7beba | [260622-ifj-customer-facing-hustle-brand-restyle-ten](./quick/260622-ifj-customer-facing-hustle-brand-restyle-ten/) |
| 260622-lp3 | Trainers roster Phase 1 — trainers table (v22-v26, 23-name seed), list/create/update-trainer actions, location+trainer columns on class_occurrences, ManageTrainersDialog + NewClassDialog trainer/location selects | 2026-06-22 | 652b5a40 | [260622-lp3-recurring-staff-phase-1-trainers-roster-](./quick/260622-lp3-recurring-staff-phase-1-trainers-roster-/) |
| 260622-mpv | Phase 2 recurring classes engine — class_schedule_rules (v27-v30) + DST-correct Europe/London generator + nightly materialiser worker (class-materialize cron) + create/update/deactivate-schedule-rule actions + Repeat-weekly UI + booking-safe series-cancel UI | 2026-06-22 | 958e2782 | [260622-mpv-phase-2-recurring-classes-engine-schedul](./quick/260622-mpv-phase-2-recurring-classes-engine-schedul/) |
| 260624-icd | Fix cross-origin embed headers — CORP cross-origin on /embed.js + drop X-Frame-Options:DENY on public form + schedule-widget SSR so embeds load/iframe on third-party sites (e.g. doyouhustle.co.uk); CORS untouched (already ACAO:*) | 2026-06-24 | 8c5ce184 | [260624-icd-fix-cross-origin-embed-headers-corp-on-e](./quick/260624-icd-fix-cross-origin-embed-headers-corp-on-e/) |
| 260624-klo | Inline per-field validation on public/embed lead form — replace fixed-bottom toast (which covered the CTA in short iframes) with inline `.field-error` under each field + red border/aria-invalid + scroll-to/focus first invalid; toast now only for network/submit failures. Single-file SSR change. DEPLOYED (push 97129e85). | 2026-06-24 | dc7d893d | [260624-klo-improve-validation-error-ux-on-the-publi](./quick/260624-klo-improve-validation-error-ux-on-the-publi/) |
| 260624-vzw | Schedule embed onboarding UI — Share/embed Popover on the staff schedule header (mirrors forms embed): copies `<div data-gymos-schedule></div>`+/embed.js snippet AND the /embed/schedule public link, with copied-state + toast. Backend (/embed/schedule SSR + /embed.js data-gymos-schedule) already existed; this surfaces it to the operator. Single-file (gymos.schedule.tsx), shadcn Popover + Tabler. Live-UI verify pending. | 2026-06-24 | 09704d30 | [260624-vzw-add-share-embed-schedule-affordance-to-s](./quick/260624-vzw-add-share-embed-schedule-affordance-to-s/) |
| 260624-p2x | Lead-ack auto-reply: middle WhatsApp template var ({{2}}) now a personalized qualifying question (class + lead's stated level + ONE open question) instead of a bare class name; prompt rewritten + per-slot cap 60→200, max_tokens 300→400, model unchanged. Needs a 2-slot approved template ("Hey {{1}}, thanks for your interest in {{2}} Feel free to reply here.") + LEAD_ACK_TEMPLATE_NAME pointed at it. Single-file (lead-ack.ts); 6/6 tests pass. | 2026-06-24 | 6dcd05a2 | [260624-p2x-rework-lead-ack-whatsapp-auto-reply-midd](./quick/260624-p2x-rework-lead-ack-whatsapp-auto-reply-midd/) |
| 260625-d06 | Schedule filters — three AND-composed filters (location, class type, trainer) on both the staff calendar (shadcn Popover + Select, client-side over loaded data) and the public embed timetable (native `<select>`, data-* attributes, inline applyFilters() JS). Loader Query A widened with leftJoin(trainers). No schema migration. | 2026-06-25 | 511a4b39 | [260625-d06-add-location-class-type-trainer-filters-](./quick/260625-d06-add-location-class-type-trainer-filters-/) |
| 260625-gsg | Make class sites/locations a studio-global config — pure resolveSites resolver + additive sites JSONB column (migration v35) + schedule loader threading + configurable NewClassDialog picker (replaces hardcoded Norwich/Wymondham) + Settings Locations card with UPSERT action (save-sites-config). 10/10 unit tests pass. REPEATABLE-PER-CLIENT: empty-array default, no gym names in code. TWO manual operator steps required: apply 0007_studio_sites.sql to Neon + seed HUSTLE sites as data. | 2026-06-25 | 107f1e0b | [260625-gsg-make-class-sites-locations-a-studio-glob](./quick/260625-gsg-make-class-sites-locations-a-studio-glob/) |
| 260625-mvn | Brain page scroll fix + durable active-column corrective — migration v36 (guarded idempotent DO block, NO-OP on HUSTLE prod already hotfixed) converts trainers.active + class_schedule_rules.active INTEGER→BOOLEAN with USING(active<>0); schema.ts comment-only update; Brain page both return paths wrapped in h-full overflow-y-auto scroll container mirroring integrations page. | 2026-06-25 | 126445fa | [260625-mvn-fix-brain-page-scroll-durable-corrective](./quick/260625-mvn-fix-brain-page-scroll-durable-corrective/) |
| 260625-x34 | Merge Messages/Leads inbox into one unified list — remove isLeadsView partition; loader loads ALL conversations; per-lead sourceMap fan-out (opt-in source + form title override via DISTINCT ON); leadSource: {type,label}|null on each row; single "Inbox" header + unconditional Import leads; no Messages/Leads chips; subtle secondary Badge with Tabler icon per lead source type. No schema migration. | 2026-06-25 | 89fa763f | [260625-x34-merge-messages-leads-inbox-into-one-list](./quick/260625-x34-merge-messages-leads-inbox-into-one-list/) |
| 260626-egy | Generic "Lead" fallback badge for source-less leads — loader now falls back to `{ type: "lead", label: "Lead" }` for leads with no sourceMap entry (no opt-in/form); `sourceIcon("lead")` returns IconUserPlus; member rows unaffected (still null). Single-file (gymos.messages.tsx). tsc clean. | 2026-06-26 | 21b63fd7 | [260626-egy-inbox-add-generic-lead-fallback-badge-fo](./quick/260626-egy-inbox-add-generic-lead-fallback-badge-fo/) |
| 260626-m1c | Swap marketing homepage video slot to roughcut_overlaid_v4.mp4 — copied the 12.7 MB roughcut to `apps/staff-web/public/marketing/runstudio-film.mp4`; `videoSlot()` now takes optional `src` and renders `<video autoplay muted loop playsinline preload="metadata">` (drops play-button placeholder, keeps tag+caption); `agentSection()` wires `/marketing/runstudio-film.mp4`, so all 5 locale homepages (/, /uk, /us, /fr, /de) share it. Static-asset + SSR-markup only, no migration. | 2026-06-26 | a62aa557 | [260626-m1c-swap-marketing-homepage-video-slot-to-ro](./quick/260626-m1c-swap-marketing-homepage-video-slot-to-ro/) |
| 260626-n3y | RunStudio-brand logged-in staff-web app + favicon — default.css replaced with ink/pulse/distance RunStudio skin (light + dark); global.css base :root studio-accent fallback → pulse; root.tsx theme-color → #14171C; favicon/icon-180/192/512.svg replaced with double-chevron mark; manifest.json de-Mailed (RunStudio name + ink colours); apple-mobile-web-app-title → RunStudio. CSS/SVG/JSON/TSX only, no DB migration. | 2026-06-26 | 818ae1c5 | [260626-n3y-runstudio-brand-logged-in-app-favicon](./quick/260626-n3y-runstudio-brand-logged-in-app-favicon/) |

### v2.3 Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| MA1. Auth + 3-Role Spine ⚑ | Better-auth login in Expo (`expo-secure-store`); two-allowlist role resolver (admin > teacher > member, no UI toggle); transactional/idempotent claim-by-email; `requireDemoMember → requireMember` dual-path. **Auth spike first.** | AUTH-01..07 | Complete — auth spine production-verified (MA1-03 device UAT) |
| MA2. Member Booking Surface | Browse public / book authenticated; pass-holder books via `/api/m/bookings`; no-pass → Stripe inline → pass grant → booking; home (upcoming + balance) | MEM-01..05 | **In Progress (2/4)** — 01 server contract done (MEM-01/03/05 server halves). 02 mobile entry/sign-in/home done (MEM-01 client wall-off-entry + MEM-02 pending-booking store & return-to-class + MEM-05 Home list; tsc clean; MA3/MA4 _layout role gating untouched). 03/04 (schedule Book-press gate + Stripe inline purchase) next |
| MA3. Teacher Session Surface | Teacher schedule (assigned) + roster; tap-to-check-in via existing `mark-booking-attended` chokepoint; no teacher AI | TCH-01..03 | **Complete (3/3)** — 01 auth foundation + 02 resource endpoints + 03 mobile teacher surface (useRole role-branch, teacher Schedule tab, roster optimistic check-in, FAB hidden for teachers). TCH-01/02/03 done; on-device iOS verify deferred (EAS-gated) |
| MA4. Admin Mobile AI Agent | In-app AI ops chat (reuse `AgentSheet`/`agent-stream`); server-side ALLOW-LIST filters gated Tier-3 (+ unit test); `runWithRequestContext` + `requireAdmin` on SSE | AI-01..03 | **Complete (3/3)** — 01 keystone + 02 SSE endpoint/requireAdmin/whoami + 03 mobile client (whoami-gated AgentSheet, admin endpoint reuse, AGENTS.md doc). AI-01/02/03 done; on-device iOS verify deferred (EAS-gated) |
| MA5. Push Notifications ⚑ | Additive `push_tokens` (keyed `user.id`) + Expo token reg + deep-link; pg-boss `expo-push` worker job (staff-web enqueues, worker sends); v1 types = booking confirm + reminder + admin "come look". EAS/Apple-gated | NOT-01..04 | Not started |

**Coverage:** 22/22 v2.3 requirements mapped across MA1–MA5. No orphans, no duplicates. **⚑ = needs phase-level research/spike** (MA1 auth spike; MA5 Expo push, externally gated).

**Next action:** `/gsd:plan-phase MA1` — the auth spike is the keystone first task. MA1 plan-time Key Decisions: (a) password-reset path (transactional email infra may not exist — email+password safe v1, WhatsApp-OTP is v2); (b) confirm `mapBetterAuthSession` exposes `userId`; (c) confirm the `bearer()` `set-auth-token` header name on the installed better-auth version; (d) unmatched-login-email policy (show "no membership on file", never auto-create).

### v2.1 Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| CV1. Foundation | Tiptap + Remotion deps; additive `content_documents` + `video_compositions` schema; features/ scaffold; Content + Video tabs in GymosTopNav; application_state context-awareness; tsc clean | DEP-01, MIG-01, NAV-01 | **Complete** — CV1-01 (2026-06-20) |
| CV2. Content tab | `/gymos/content` list + Tiptap editor (create/rename/duplicate/delete/edit); useChangeVersions live-refresh; agent actions two-exposed | CONT-01, CONT-02, CONT-03, CONT-04, CONT-05 | **Complete** — CV2-01 (2026-06-20) |
| CV3. Video tab | `/gymos/video` list + `@remotion/player` in-browser editor (create/rename/duplicate/delete/edit composition); agent actions two-exposed | VID-01, VID-02, VID-03, VID-04 | **Complete** — CV3-01 (2026-06-20) |
| CV4. Publish pipeline | `draft`/`published` toggle; `/api/m/content` member API (published only); public SSR `/c/:slug` + `/v/:slug` pages | PUB-01, PUB-02, PUB-03, PUB-04 | **Complete** — CV4-01 (2026-06-20) |
| CV-RENDER [GATED] | Server-side MP4 render via Fly worker + pg-boss; MP4 storage + member surfacing | RENDER-01, RENDER-02 | Gated — awaiting go-ahead |

**Next action:** Deploy to production (push `master` → Vercel) — HELD for explicit user go-ahead — then live UAT (Content + Video tabs, publish, /c + /v pages, /api/m/content). Migrations v20/v21 apply on deploy; verify tables in gymos-demo Neon after.

## Performance Metrics

**v2.1 milestone start:** 2026-06-20

**v2.0 reference velocity (completed 2026-06-19, single ~9h session):**

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| BD2 | 01 | 35min | 3 | 7 | 2026-06-19 |
| BD2 | 02 | 16min | 3 | 10 | 2026-06-19 |
| BD2 | 03 | 975s (~16min) | 3 | 6 | 2026-06-19 |
| Phase BD2 P04 | 45 | 2 tasks | 9 files |
| Phase BD2 P05 | 1145 | 3 tasks | 12 files |
| Phase BD2 P06 | 45 | 4 tasks | 11 files |
| Phase BD3 P01 | 838 | 2 tasks | 8 files |
| Phase BD3 P03 | 461 | 3 tasks | 12 files |
| Phase BD3 P02 | 711 | 3 tasks | 6 files |
| Phase BD3 P04 | 397 | 3 tasks | 8 files |
| Phase BD3 P05 | 687 | 3 tasks | 14 files |
| Phase BD4 P01 | 14 | 3 tasks | 9 files |
| Phase BD4 P02 | 25 | 3 tasks | 6 files |
| Phase CV1-foundation P01 | 522 | 3 tasks | 13 files |
| Phase CV2-content-tab P01 | 667 | 3 tasks | 14 files |
| Phase CV3-video-tab P01 | 810 | 3 tasks | 17 files |
| Phase CV4-publish-pipeline P01 | 834 | 3 tasks | 17 files |
| Phase MC1 P01 | 336 | 3 tasks | 5 files |
| Phase MC1 P02 | 6min | 2 tasks | 4 files |
| Phase MC1 P03 | deferred-close | 3 tasks | 3 files |
| Phase MC1 P04 | 241 | 3 tasks | 3 files |
| Phase MC1 P05 | 30 | 3 tasks | 2 files |
| Phase MC2 P01 | 249 | 3 tasks | 5 files |
| Phase MC2-deep-funnel-lifecycle P02 | 140 | 2 tasks | 3 files |
| Phase MC2 P03 | 180 | 2 tasks | 2 files |
| Phase MC2 P04 | 205 | 2 tasks | 2 files |
| Phase MC3 P01 | 20 | 3 tasks | 9 files |
| Phase MC3 P03 | 424 | 2 tasks | 2 files |
| Phase MC3 P02 | 7 | 3 tasks | 7 files |
| Phase MA1 P01 | 780 | 3 tasks | 16 files |
| Phase MA1 P02 | 571 | 3 tasks | 10 files |
| Phase MA4 P01 | 4 | 2 tasks | 5 files |
| Phase MA4 P02 | 172 | 2 tasks | 5 files |
| Phase MA4 P03 | 141 | 2 tasks | 5 files |
| Phase MA3 P01 | 4min | 3 tasks | 6 files |
| Phase MA3 P02 | 4min | 3 tasks | 7 files |
| Phase MA3 P03 | 480 | 3 tasks | 5 files |
| Phase MA2 P01 | 5min | 3 tasks | 5 files |
| Phase MA2 P02 | 4min | 3 tasks | 4 files |
| Phase MA2 P03 | 7min | 2 tasks | 3 files |

## Accumulated Context

### MA2-02 Decisions (2026-06-30)

- **2026-06-30 MA2-02 — AuthGate wall moved OFF app entry by removing exactly one line.** Deleted `if (!token && !onSignIn) router.replace("/sign-in")` in `app/_layout.tsx` `AuthGate`; kept the bounce-off-sign-in (`if (token && onSignIn) router.replace("/(tabs)")`) and the `checked` render-gate. Anonymous (tokenless) users now reach the tabs and browse the schedule (server side unblocked by MA2-01's anon `/api/m/schedule`); member-only tabs already degrade gracefully on 401 (existing "Couldn't load …" + Retry). **MA3/MA4 reconciliation:** `AgentFabAndSheet` is byte-untouched — admin Ops FAB via `isAdmin`, teacher FAB-hide via `role !== "member" && !isAdmin`, `fetchRole`/null-flash guard, and the `teacher-roster`/`food-*` `Stack.Screen` declarations all survive (the `_layout.tsx` diff is +5/-6, confined to `AuthGate`).
- **2026-06-30 MA2-02 — Pending-booking intent = in-session module-level store (`lib/pending-booking.ts`), NOT persisted.** `setPendingBooking`/`getPendingBooking`/`clearPendingBooking` over a single module var. MEM-02 only needs the sign-in→return hop within one app run; persisting across a cold start would surprise a member mid-flow. `sign-in.tsx` reads `getPendingBooking()` on BOTH success branches (email + phone-claim) → routes to `/(tabs)/schedule` when pending, else `/(tabs)`; branch inlined in each path. Intent is NOT cleared in sign-in — MA2-03's schedule on-focus resume consumes + clears it. The "unknown error — navigate anyway" fallback keeps its bare `/(tabs)` (error recovery, not a clean success).
- **2026-06-30 MA2-02 — Home renders additive `upcomingBookings[]` (cap 5, label flips 'Next class' → 'Upcoming'), single-card + empty-state fallback preserved.** `ProfileResponse` extended with the optional array (singular `upcomingBooking` kept for back-compat); each list row → `/(tabs)/schedule`, Feather `chevron-right`, existing `bookingRow`/`Title`/`Time` styles. **Also fixed the pre-existing `fontVariant` readonly-tuple tsc error** (`["tabular-nums"] as const` → `["tabular-nums" as const]`) — `index.tsx` was previously out-of-scope/deferred but Task 3 edits it, so it's now in-scope; full `packages/mobile-app` `tsc --noEmit` exits 0. Marked RESOLVED in MA3 deferred-items.md.
- **2026-06-30 MA2-02 — On-device iOS verify DEFERRED (EAS/Apple-gated, MA1-03 pattern).** Anonymous-browse-then-Book, sign-in return-to-class, and the Home list render against live `/api/m/*` need an EAS dev build on a physical iPhone (Expo Go dead-ends at SDK 54; Simulator needs a Mac). Static + tsc verification done; MA2-03's schedule resume closes the MEM-02 loop end-to-end.

### MA2-01 Decisions (2026-06-30)

- **2026-06-30 MA2-01 — `getOptionalMember(request)` is `requireMember` minus all throws AND minus the lazy claim.** Session→member resolution that returns `Member | null` (no session → null; session with no claimed `gym_members` row → null, NO lazy claim-by-email). It reuses the existing `sessionFromRequest` h3-v2 adapter shim (RESEARCH Pitfall 5 — never re-derive the event shape). `GET /api/m/schedule` now resolves the member via this helper so anonymous browse returns 200 (never 401); Query C (per-member booked-set) is guarded behind a non-null member, so `isBookedByMe` defaults false for anon. The claim still fires on the first write/profile call via `requireMember`, keeping the public GET side-effect-free. All WRITE endpoints keep `requireMember`/`requireMemberOrDemo`.
- **2026-06-30 MA2-01 — `POST /api/m/bookings` is ONE `db.transaction`** mirroring `cancel-occurrence.ts`: (1) in-txn idempotency pre-check (already-booked → return existing id, no insert), (2) `FOR UPDATE` occurrence lock + status check, (3) capacity count (`>= capacity` → 409 CAPACITY_FULL), (4) FIFO active-pass pick (`expires_at` NULL-or-future, order `expires_at ASC NULLS LAST, created_at ASC`; per-pass remaining = `granted − SUM(its OWN debits)` via a SEPARATE aggregation, NEVER chain-join `pass_debits`; none → 402 NO_PASS), (5) booking insert with `pass_id`, (6) `+1` `pass_debits` row (`reason:'class_booking'`) — the exact mirror of the `-1` refund, so cancellations reconcile against the same `pass_id`. **Pass debited ON BOOKING, never on purchase.** Errors also include 409 OCCURRENCE_UNAVAILABLE / 404 OCCURRENCE_NOT_FOUND.
- **2026-06-30 MA2-01 — `FOR UPDATE` applied via a narrow cast `(occQuery as any).for("update")`.** `getDb()` is typed `LibSQLDatabase` at compile time (SQLite has no `FOR UPDATE`) but the runtime driver is Neon Postgres; the cast keeps `tsc` clean while still locking on prod. The in-transaction capacity count is the correctness floor if the lock clause ever no-ops. Same LibSQL-type reason the two pre-existing `mark-booking-attended.ts` `db.execute` tsc errors persist (unrelated, out of scope).
- **2026-06-30 MA2-01 — `upcomingBookings[]` on `/api/m/profile` is ADDITIVE.** New member-scoped list query (status booked, future, `asc(startsAt)`, `limit 10`) added alongside the preserved singular `upcomingBooking` (back-compat). NO migration (derived query; `bookings.pass_id` already existed). Zero new dependency (`nanoid` already a dep). Booking-behavior live-replay deferred to deploy smoke (no Neon MCP in env; local server can't boot — standing v1.0 constraint).

### MA3-03 Decisions (2026-06-30)

- **2026-06-30 MA3-03 — Mobile FAB gate is `role !== "member" && !isAdmin`, NOT the plan's literal `role !== "member"`.** The MA3-03 plan was authored before MA4 shipped its admin ops FAB; the literal gate would have clobbered it. Reconciled: members → coach FAB, admins → MA4 "RunStudio Ops" sheet (endpoint/title switched by `isAdmin`, untouched), teachers → NO AI surface (TCH-03). Also hidden while `role` is null so the AI never flashes for a teacher. MA4's FAB role source (`lib/whoami.ts` `fetchRole`) was left untouched; `useRole` (`GET /api/m/me`) drives only the tab-set branch.
- **2026-06-30 MA3-03 — Role-branch via Expo Router `href: undefined|null`, every `<Tabs.Screen>` declared unconditionally.** `app/(tabs)/_layout.tsx` reads `useRole()` and toggles visibility: member → Home/Classes/Passes/Log, teacher → Schedule, Profile shared. Never conditionally unmount Tabs.Screen children (the Expo Router idiom). `lib/use-role.ts` defaults to `member` (safe fallback) and is UX-only — server `requireTeacher` is the boundary.
- **2026-06-30 MA3-03 — Teacher empty states are COPY keyed on `trainerLinked`, never an error.** `teacher-schedule.tsx` mirrors the member `schedule.tsx` FlatList/day-grouping (booking/pass stripped); `trainerLinked === false` → "not linked to a trainer yet — contact the studio", linked+empty → "No sessions assigned to you this week", genuine fetch error → Retry view. Roster check-in (`teacher-roster.tsx`) is optimistic (mirrors `bookMutation`): onMutate flips the row to `attended`, onError rolls back + inline toast, onSuccess invalidates; drives `POST /api/m/teacher/check-in` (the existing chokepoint). All five files tsc-clean (Feather icons). Deferred: pre-existing `fontVariant` tsc error in unmodified `index.tsx:546`.

### MA3-02 Decisions (2026-06-30)

- **2026-06-30 MA3-02 — Teacher schedule empty-state is 200, NOT an error.** `GET /api/m/teacher/schedule` returns `{ items: [], trainerLinked: false }` when `requireTeacher` resolves a teacher whose `trainerId` is null (trainers.user_id not yet linked). A linked teacher with no upcoming sessions returns `{ items: [], trainerLinked: true }`. Non-teachers 401/403 inside `requireTeacher` before any query. Query reuses the `api.m.schedule.tsx` Query-A shape scoped by `eq(class_occurrences.trainer_id, teacher.trainerId)`, next 7d, status `scheduled` (adds `location` to the field set).
- **2026-06-30 MA3-02 — Roster + check-in are ownership-gated by `trainer_id` BEFORE any data return/write.** `GET /api/m/teacher/roster?occurrenceId=` fetches the occurrence's `trainer_id` first and 403s unless it equals the teacher's `trainerId`; a null `trainerId` always 403s (an unlinked teacher can never view a foreign class). 400 without `occurrenceId`, 404 unknown. Roster = `booked|attended` bookings leftJoin `gym_members` (firstName/lastName). Same gate on check-in via booking → occurrence → trainer_id.
- **2026-06-30 MA3-02 — Check-in is a pure CALLER of the `mark-booking-attended` chokepoint, zero new write paths.** `POST /api/m/teacher/check-in {bookingId}` does `mod.default.schema.safeParse` + `mod.default.run(parsed.data)` (approve-proposal.ts pattern). The booking status flip AND the Meta `Schedule` CAPI event both fire inside the chokepoint (single attendance writer preserved). Static check: `grep -c "update(schema.bookings)\|set({ status"` on the new route = **0**. No new agent LLM tool added (teachers have no AI surface — TCH-03); the four-area Actions obligation is met by AGENTS.md docs.
- **2026-06-30 MA3-02 — Nested Nitro delegators need five `../`.** `server/routes/api/m/teacher/*.{get,post}.ts` are one directory deeper than the `/api/m/*` siblings, so the import path to `app/routes/api.m.teacher.*.js` uses five `../` (vs four for `/api/m/*`).
- **2026-06-30 MA3-02 — Deferred (out of scope):** two pre-existing `db.execute` tsc type-inference errors in `actions/mark-booking-attended.ts` (byte-identical to its MC3-01 state, unmodified by MA3-02) — logged to `.planning/phases/MA3-teacher-session-surface/deferred-items.md`, not fixed. MA3-02's own six files are fully tsc-clean.

### MA3-01 Decisions (2026-06-30)

- **2026-06-30 MA3-01 — `trainers.user_id` is plain nullable TEXT, never boolean-as-int (active-column gotcha), no unique index.** Additive migration v37 (`ALTER TABLE trainers ADD COLUMN IF NOT EXISTS user_id TEXT`), appended after the v36 entry in the runMigrations array (the array is NOT strictly numerically ordered — v15 trails v36). One human = one trainer row, resolved via `LIMIT 1`; multi-trainer-per-user is a cheap future `inArray` extension.
- **2026-06-30 MA3-01 — Role is decided by `resolveRole` (RUNSTUDIO_TEACHER_EMAILS env allowlist) ONLY; the `trainers.user_id` link is for assigned-sessions mapping, NOT for deciding teacher-ness.** `requireTeacher` (`server/lib/teacher-session.ts`) mirrors member-session.ts's h3-v2 adapter ({req,headers,url,path}) but NEVER touches `gym_members` (teachers have no member row — the member gates would 403 them). Throws 401 (no session) / 403 (role!=="teacher"; a pure admin correctly 403s and uses the MA4 surface).
- **2026-06-30 MA3-01 — `null` trainerId is a VALID unlinked-teacher state**, not an error. Callers (MA3-02/03) render an empty / "contact admin" view, never a 500. `resolveTrainerIdForUser(userId)` returns `string | null`.
- **2026-06-30 MA3-01 — `GET /api/m/me` is the FIRST caller of `resolveRole`** (built + unit-tested in MA1, wired nowhere until now). Returns `{ role, userId, email, trainerId }` for ANY authenticated caller (200 for member/admin/teacher; 401 unauthenticated); `trainerId` populated only for teachers. Does NOT call requireMember — members/admins must get their role, not a 403. Nitro delegator `server/routes/api/m/me.get.ts` mirrors schedule.get.ts. This is role-discovery (UX), NOT a security boundary — teacher routes (MA3-02) gate with `requireTeacher`.
- **2026-06-30 MA3-01 — OPERATOR runtime steps (NOT code, migration-drift gotcha):** (1) apply v37 to Neon `billowing-sun-51091059` by hand; (2) populate `trainers.user_id` by email per HUSTLE teacher via `UPDATE trainers t SET user_id=u.id FROM "user" u WHERE lower(u.email)=lower('<email>') AND lower(t.name)=lower('<name>')`; (3) set `RUNSTUDIO_TEACHER_EMAILS` on Vercel — until set, ALL users resolve to role=member. Full SQL in MA3-01-SUMMARY.md.

### MA4-03 Decisions (2026-06-30)

- **2026-06-30 MA4-03 — One SSE client reused via an endpoint param, NOT a second client.** `streamAgent(messages, cb, endpoint="/api/m/agent/stream")` got a 3rd default-valued param; `EventSource` URL is now `${API_BASE_URL}${endpoint}`. Member behaviour is byte-identical when no endpoint is passed. `AgentSheet` got optional `endpoint`+`title` props (defaults = member coach); `title` drives both the header and the system-welcome line.
- **2026-06-30 MA4-03 — Client role gating is UX-only.** `lib/whoami.ts` `fetchRole()` calls `GET /api/m/whoami` with the Bearer token; `_layout.tsx` `AgentFabAndSheet` resolves it once on mount (`fetchRole().then(setRole)`) and `isAdmin` decides `endpoint`/`title`. The server `requireAdmin` on the admin SSE endpoint is the sole security boundary — a forced URL still 403s. Fail-closed-to-member: role is `null` (member coach) until whoami resolves.
- **2026-06-30 MA4-03 — Admin title "RunStudio Ops"; member keeps "Agent — GymClassOS Coach".** No new screens/tabs — the single FAB's sheet just switches endpoint/title by role.
- **2026-06-30 MA4-03 — Existing tool_result cache invalidation (schedule/food-entries/profile) left in place for both agents.** Harmless for admin (keys may not exist) and satisfies AI-01 "reflect in app state" via the invalidation pattern (four-area application-state contract).
- **2026-06-30 MA4-03 — Mobile admin agent + 12-verb allow-list + sanctioned server-side-LLM divergence documented in `apps/staff-web/AGENTS.md`** (new "Mobile Admin Agent (read + dashboard only)" section). Closes the four-area skills/instructions contract. MA4 phase complete (3/3); AI-01/02/03 satisfied. On-device iOS verification deferred (EAS/Apple-gated, MA1-03 pattern).

### MA4-02 Decisions (2026-06-30)

- **2026-06-30 MA4-02 — Admin SSE is a SEPARATE route, not a role-branch.** `POST /api/m/admin/agent/stream` (`app/routes/api.m.admin.agent.stream.tsx` + Nitro wrapper `server/routes/api/m/admin/agent/stream.post.ts`, 6 `../` to app/routes — one dir deeper than the member coach wrapper's 5). Keeps the 403 surface and the tool set structurally independent from the member endpoint.
- **2026-06-30 MA4-02 — Gate-before-stream (AI-03).** `requireAdmin(request)` (`server/lib/admin-session.ts`) throws a `Response` 401 (no session) / 403 (not admin) at the TOP of `action()` — verified to precede `new ReadableStream` (line 52 vs 86). The Nitro wrapper's `catch (err instanceof Response) → sendWebResponse(err)` forwards it as a clean HTTP status. `requireAdmin` REPLICATES member-session.ts's h3-v2 adapter ({req,headers,url,path}) rather than importing it (member-session carries claim-by-email machinery that has no place in an admin gate) + `resolveRole` (RUNSTUDIO_OPERATOR_EMAILS).
- **2026-06-30 MA4-02 — Tool loop = registry actions under runWithRequestContext.** Tools built from the live registry via `loadActionsFromStaticRegistry(actionsRegistry)` + `buildAdminToolList(registry)` (MA4-01 allow-list + defensive GATED_ACTIONS filter — the only gate). Manual Anthropic loop: `claude-sonnet-4-6`, `turn < 8`, `max_tokens 1024`, events `delta|tool_use|tool_result|done|error`, executes `registry[name].run(input)` (already Zod-wrapped — no re-validation; unknown tool returns `{ok:false,error:"Tool not available"}`), the WHOLE stream wrapped in `runWithRequestContext({ userEmail: admin.email })`. No DB migration (chat history client-only).
- **2026-06-30 MA4-02 — `GET /api/m/whoami` is role-discovery, NOT a gate.** Returns `{role}` for any signed-in caller (401 only if unauthenticated) via `resolveRequestRole`. MA4-03 consumes it to show the admin agent entry only for `role=admin`. The SSE endpoint stays the sole security boundary.

### MA4-01 Decisions (2026-06-30)

- **2026-06-30 MA4-01 — Gated verbs now live in exactly one file.** `apps/staff-web/server/lib/gated-actions.ts` exports `GATED_ACTION_LIST` (tuple) + `GATED_ACTIONS` (Set); `approve-proposal.ts` (`ACTION_ALLOWLIST`) and `propose-action.ts` (Zod enum `z.enum(GATED_ACTION_LIST)`) both import it. Collapses the v1.2 "update both files" gate-atomicity rule (2026-06-18) into one edit point — the two files can no longer drift.
- **2026-06-30 MA4-01 — `MOBILE_ADMIN_ALLOWLIST` is an explicit 12-verb list, NOT ALL−GATED.** 9 Tier-1 reads + 3 Tier-2 board-authoring verbs (`upsert-section-note`, `create-task`, `complete-task`). Subtraction would leak the ~80-action registry's upstream Mail + staff-only verbs. `buildAdminToolList(registry, allowlist?)` is a pure function that runs a defensive `.filter(!GATED_ACTIONS.has)` on top — a gated verb wrongly added to the allow-list is still structurally stripped.
- **2026-06-30 MA4-01 — AI-02 keystone unit test uses a stub registry, no `@agent-native/core` import.** Lives at `server/lib/mobile-admin-tools.test.ts`; 5/5 green under `vitest.unit.config.ts`. Asserts gated-set integrity, the exact 12-verb allow-list, absence of any gated/mutating verb, and that the built tool list excludes injected gated verbs. `gated-actions.ts` and `mobile-admin-tools.ts` stay pure (no framework import) so they remain importable from the unit runner (BD4-01 ESM/CJS caveat).

### MC1-03 Decisions (2026-06-23)

- **2026-06-23 MC1-03 — Worker NEVER imports apps/staff-web/server/db/schema.ts.** All `meta_lead_attribution` access from the worker is raw `db.execute(sql\`...\`)` with `// guard:allow-unscoped — worker post-send status write` marker. Separate build boundary — no cross-app Drizzle imports.
- **2026-06-23 MC1-03 — event_time is NOT re-divided in the worker.** `data.eventTime` arrives already as Unix seconds from the submit handler. Dividing by 1000 again would produce a sub-second timestamp broken for Meta.
- **2026-06-23 MC1-03 — test_event_code is a TOP-LEVEL key (sibling of the data array).** Per Meta Graph v23 spec, it must NOT be inside the event object. Setting it inside the event array silently fails Test Events validation.
- **2026-06-23 MC1-03 — BETTER_AUTH_SECRET parity (D-03) deferred to deploy-time.** Boot self-test (D-04) is in place (probes WHATSAPP_ACCESS_TOKEN decrypt; null = prominent error log). Human parity check is a required post-deploy action before CAPI sends can be relied on.
- **2026-06-23 MC1-03 — stageEventMap resolver must be duplicated per build boundary.** It is a pure function with no framework deps — safe to copy. The worker copy lives in services/worker/src/lib/stage-event-map.ts; keep in sync with the staff-web copy when DEFAULT_STAGE_EVENT_MAP changes.
- **2026-06-23 — Phase MC1 complete (all 5 plans).** Next: deploy master → Vercel, complete BETTER_AUTH_SECRET parity check + migration drift check, verify in Meta Test Events, then plan MC2 via `/gsd:plan-phase MC2`.

### v2.1 Roadmap Decisions (2026-06-20)

- **2026-06-20 — Phase prefix CV to avoid .planning/phases/ collisions with BD/AE/R/D/P dirs.**
- **2026-06-20 — 4 active phases (coarse granularity): CV1 Foundation, CV2 Content tab, CV3 Video tab, CV4 Publish pipeline.** CV-RENDER is gated (not part of the default build).
- **2026-06-20 — DEP-01 + MIG-01 + NAV-01 all land in CV1.** These are cross-cutting infrastructure reqs; landing them first unblocks CV2 and CV3 in parallel.
- **2026-06-20 — CV2 and CV3 are independently executable after CV1 completes.** Content and Video don't depend on each other. They can be planned and run in parallel (coarse granularity means one execution order is fine; call `/gsd:plan-phase CV2` then CV3 sequentially).
- **2026-06-20 — CV4 depends on both CV2 (content_documents published state) and CV3 (video_compositions published state).** The publish pipeline needs both entity types to exist.
- **2026-06-20 — Strip Yjs from the Tiptap fork.** The HQ Content surface (BD3-05) already demonstrates the non-collab pattern — copy it. Remove `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `y-prosemirror`, `yjs`, `y-indexeddb` from the staff-web Tiptap install.
- **2026-06-20 — @remotion/player only (no @remotion/renderer) for CV1-CV4.** `@remotion/renderer` is headless Chromium and requires a server process; it is gated to CV-RENDER. In-browser preview via `@remotion/player` has no server dependency.
- **2026-06-20 — Helper/test files in server/lib, NOT server/plugins.** Nitro bundler error on Vercel if utilities land in server/plugins/ (plugins must export Nitro plugin objects). The HQ BD-series phases all followed this rule.
- **2026-06-20 — Prior art for Content actions: apps/hq/actions/content-{create,list,get,update}-document.ts (forked from templates/content in BD3-05).** Use as the direct copy-and-adapt base. The main changes needed for staff-web: (a) remove ownableColumns/accessFilter (gym tables are single-tenant, use guard:allow-unscoped); (b) add `status` field (draft/published) not present in HQ version; (c) rename deepLink app from 'content' to match staff-web navigation.
- **2026-06-20 — No member web portal constraint is the governing constraint for CV4.** `/c/:slug` public SSR page and `/api/m/content` member API are the delivery mechanisms; no new member login-required routes inside /gymos.
- **2026-06-20 — RENDER-01 / RENDER-02 mapped to gated CV-RENDER phase.** Not counted in the default coverage total (11 in-scope reqs across CV1-CV4). Gated phase requires explicit go-ahead + infra planning before `/gsd:plan-phase CV-RENDER`.

### CV2-01 Decisions (2026-06-20)

- **2026-06-20 CV2-01 — actions-registry.ts is gitignored (auto-generated); content-* actions auto-discovered on next dev/build start.** Updated registry locally for tsc; do not commit.
- **2026-06-20 CV2-01 — slugify("café & co") = "caf-co": strip non-ASCII as single codepoints (no NFD normalization first).** é is U+00E9 single codepoint; removed entirely rather than decomposed to e + combining accent. All 8 slug unit tests assert this exact output.
- **2026-06-20 CV2-01 — @tiptap/extension-link imported as Link_ to avoid shadowing React Router Link.** Cosmetic alias only; no functional impact.
- **2026-06-20 CV2-01 — Hard delete on content-delete-document (no soft-delete/deleted_at column).** Per plan hard_constraints; delete is always behind shadcn AlertDialog in UI; no new migration needed.

### BD4-01 Decisions (2026-06-19) — preserved for reference

- **2026-06-19 BD4-01 — All three BD4 tables owned by BD4-01 to prevent db.ts collision with BD4-02: studio_brain_docs (v16), studio_owner_config (v17), reactivation_attempts (v18), index (v19) all in BD4-01; BD4-02 reads them without touching db.ts.**
- **2026-06-19 BD4-01 — Pure helper extraction to brain-init-helpers.ts: vitest.unit.config.ts + ESM vitest cannot import @agent-native/core (CJS React "module is not defined"); pure helpers extracted to *-helpers.ts (mirrors create-checkout-link-helpers.ts pattern).**
- **2026-06-19 BD4-01 — Collapsible shadcn primitive for Class Methods: progressive disclosure — Class Methods section collapsed by default on /gymos/brain per AGENTS.md rule.**
- **2026-06-19 BD4-01 — Client-side fetch in gymos.brain.tsx (no loader): readAppState and getDb() in a React Router v7 loader need request context; client-side pattern matches gymos.campaigns.tsx segment-fetch.**

### v2.0 Roadmap Decisions — preserved for reference

- **2026-06-19 — Phase prefix BD (not integer) to avoid .planning/phases/ collisions with existing AE/R/D/P phase directories.**
- **2026-06-19 — 4 phases (coarse granularity).** Research converged on BD1-BD4. BD2 and BD4 each contain two parallel plans within the phase (TEL+PROV in BD2; GOB+GOD in BD4).
- **2026-06-19 — Provisioner runs in services/hq-worker (Fly), not Vercel.** 8-step saga exceeds Vercel's 300-second timeout. pg-boss job in hq-worker drives forward steps and LIFO rollback.
- **2026-06-19 — PROV rollback code ships before happy-path code (CRITICAL).** Non-idempotent provisioning creates orphaned cloud resources.
- **2026-06-19 — Three PII-up enforcement mechanisms (all three must ship together in BD1/BD2).**
- **2026-06-19 — HQ needs its own WABA (separate from any studio WABA).**
- **2026-06-19 — Anthropic call-site audit is a BD1 task, not BD2.**
- **2026-06-19 — Meta template approval lead times are calendar dependencies, not engineering tasks.**
- **2026-06-19 — GOD suppression ceiling (3 attempts / 90-day window) ships from day one (Pitfall W-01).**
- **2026-06-19 — GOD heartbeat cron start times staggered by hash(studio_id) % 60 min (Pitfall W-02).**
- **2026-06-19 — `sendMessage.ts` is NOT modified in BD4.**
- **2026-06-19 — HQ org + super-admin seed row in runMigrations (Pitfall F-02).**

### v1.2 Roadmap Decisions — preserved for reference

- **2026-06-18 — Phase prefix AE to avoid .planning/phases/ collisions.**
- **2026-06-18 — Gate atomicity: new gated actions must update both `ACTION_ALLOWLIST` in `approve-proposal.ts` AND Zod enum in `propose-action.ts` in the same commit.**
- **2026-06-18 — Consent exclusion is structural (`.strict()` Zod schema), not behavioral.**
- **2026-06-18 — Cancel-occurrence correctness: BOOKINGS_EXIST guard + atomic transaction.**
- **2026-06-18 — No local dev server constraint continues (NitroViteError).**
- **2026-06-18 — Two-exposure rule per action: action file registry + system prompt bullet, both required.**

### v1.0 Accumulated Context — preserved for reference

**P1c-WIDE VERIFICATION CONSTRAINT:** The local `agent-native dev` server cannot boot (`NitroViteError: Vite environment "nitro" is unavailable` -> 503 on server routes). NO plan can run a local HTTP walkthrough. Verify via replay against live Neon DB via Neon MCP or defer to e2e smoke test on Vercel deploy.

- **2026-05-17 — Two-milestone restructure:** Demo Sprint (week 1) + Production v1 (weeks 2-9).
- **2026-05-17 — pg-boss on Neon (NOT BullMQ + Redis):** Queue lives in same Neon DB; no Redis service.
- **2026-05-17 — Calorie counter built fresh (NOT fork OpenNutriTracker):** OpenNutriTracker is Flutter + GPL v3.
- **2026-05-17 (late) — Member surface = Expo fork of `packages/mobile-app`** (NOT web PWA).

**Live deployment state (master):**

- Staff-web: `https://gym-class-os.vercel.app` (Vercel, auto-deploys from `master`). As of 2026-06-22 (commit `082854ba`): **RunStudio rebrand live**; 4 localized marketing homepages live at `/ /uk /us /fr /de` (FR/DE native); Content tab hidden; video brief pipeline stages 1-2 live; v2.1 Content/Video Studio live. **Deploy = git push to master ONLY** (the `vercel` CLI fails — monorepo source > 10 MB upload cap; and NO root `.vercelignore` — it breaks the `packages/core` build).
- Staff-web (history): AE3 live as of commit `120d11c3`, deployed 2026-06-19
- Worker + edge-webhooks: Fly app `gymos-edge-webhooks`
- Neon project: `gymos-demo` (id `billowing-sun-51091059`)
- Demo data: 260 members / 423 class occurrences / 4,162 bookings / 200 active subs / 90 conversations / 453 messages

## Session Continuity

Last session: 2026-07-01T10:26:54.601Z
Stopped at: Completed quick task 260701-fq6: mobile role UX + agent composer FAB gate + keyboard fix
Resume file: None

Prior session: 2026-06-20T10:22:33.153Z — Completed CV4-publish-pipeline CV4-01-PLAN.md

### PICK UP HERE — plan MA1 (v2.3)

v2.3 roadmap is written (Mobile App Production Foundation). Five phases MA1–MA5 defined with success criteria + requirement mappings (22 reqs, 22/22 mapped). No implementation yet. MA1 + MA5 flagged for phase-level research/spike.

**Next step — plan Phase MA1 (Auth + 3-Role Spine):** `/gsd:plan-phase MA1`

MA1 is the one-way door. **First task = the AUTH SPIKE** (device-verified before any role surface is built): prove sign-in + `getSession` round-trip against the framework Better-auth instance, claim-by-email links the `gym_members` row, AND the admin SSE call carries the session (`Cookie`/`Authorization: Bearer` survives the `react-native-sse` streaming POST; bearer fallback if cookie is stripped).

**Key Decisions to resolve at MA1 plan time:**

- **Password-reset path** — Better-auth reset assumes an email sender; the studio's only member channel today is WhatsApp and transactional email infra may not exist. Decide: email+password-with-a-wired-sender (safe v1) vs magic-link vs deferred WhatsApp-OTP (explicitly v2).
- Confirm `mapBetterAuthSession` exposes `userId` (not email-only).
- Confirm the `bearer()` `set-auth-token` header name on the installed better-auth version.
- **Unmatched-login-email policy** — show "no membership on file — contact the studio" (recommended); **never auto-create** a `gym_members` row; never add a unique index on `gym_members.email`.
- Can `createAuthPlugin` forward `trustedOrigins` / the server `expo()` plugin? (forks the MA1 design).

**MA-wide discipline (every phase):** additive-only `runMigrations` (next after v36; NOT auto-run — apply to Neon `billowing-sun-51091059` by hand per the migration-drift gotcha); no identity-table reshape; `/api/m/*` bearer-gates from the verified session inside each handler; worker is the single push sender; `npx expo install` (not bare npm) for SDK-55 pins.

**MA5 external gate:** `eas init` (`projectId`, currently missing from `app.json`) + the customer's Apple Developer account for iOS push credentials — same blocker as the existing iOS build (see `packages/mobile-app/IOS-EAS-RUNBOOK.md`). Build the spine + register the migration now; the gate only blocks on-device push verification.

**MA2/MA3/MA4** depend only on MA1 identity and are reorderable by business value (MA2 natural second; MA4 carries the security keystone — the Tier-3 allow-list filter + test). MA5 last.

---

### PICK UP HERE — plan MC1

v2.2 roadmap is written (Meta Conversion Tracking). Three phases MC1-MC3 defined with success criteria + requirement mappings (16 reqs). No implementation yet.

**Next step — plan Phase MC1 (Foundation + Lead event):** `/gsd:plan-phase MC1`

MC1 hook points (confirmed by codebase map 2026-06-23):

- Browser Pixel + fbc/fbp/fbclid capture → `apps/staff-web/features/forms/lib/public-form-ssr.ts` (the `/f/:slug` page) + `apps/staff-web/features/forms/lib/embed-snippet.ts` (`/embed.js` — parent→iframe bridge for fbclid + consent).
- Extend submit payload + persist + enqueue → `apps/staff-web/features/forms/handlers/submissions.ts` (`submitLeadForm`).
- New additive `meta_lead_attribution` table → `apps/staff-web/server/db/schema.ts` + a new `runMigrations` version (NOT auto-run — apply to gymos-demo Neon by hand per migration-drift gotcha).
- Studio config (pixelId/stageEventMap/testEventCode) → `studio_brain_docs` pattern (mirror `tenant-brand-resolver.ts`); `META_CAPI_TOKEN` → `registerRequiredSecret` in `apps/staff-web/server/register-secrets.ts`, read via `apps/staff-web/server/lib/app-secrets.ts`.
- Settings card → `/gymos/settings/integrations` (next to Stripe Connect).
- `meta-capi-event` queue → `packages/queue/src/{types,publish}.ts` + register in `services/worker/src/index.ts`; worker sender modeled on `services/worker/src/queues/telemetry-push.ts` (env-gated, throw-to-retry) + `sendViaMyutik.ts` (status-carrying errors). Worker needs `BETTER_AUTH_SECRET` Fly secret to decrypt the CAPI token.
- MC2 hooks (later): `services/worker/src/domain/conversations.ts` + `queues/inbound-whatsapp.ts` (Contact); `services/worker/src/domain/stripeReducers/` checkout-session-completed + invoice.paid (Purchase, value/currency); `bookings.status='attended'` write (Schedule).

---

### Prior pickup (v2.1 — reference only)

**Next step — plan Phase CV1:** `/gsd:plan-phase CV1`

CV1 is the foundational phase: Tiptap (no collab) + `@remotion/player` deps installed in `apps/staff-web/package.json`; additive `content_documents` + `video_compositions` `runMigrations` versions; `features/content/` + `features/video/` scaffolded from templates; Content + Video tabs added to `GymosTopNav`; `application_state` updated for context-awareness; tsc + Nitro build verified clean.

**Prior art to mine at plan time:**

- `apps/hq/actions/content-{create,list,get,update}-document.ts` — BD3-05 non-collab Content fork; adapt imports + add `status` field + remove `ownableColumns`/`accessFilter` (use `guard:allow-unscoped`)
- `apps/hq/app/routes/content._index.tsx` + `content.$id.tsx` — list + editor UI; adapt to staff-web gymos route conventions
- `apps/hq/server/lib/documents.ts` — `parseDocumentFavorite` helper; copy into `apps/staff-web/server/lib/`
- `apps/hq/app/routes/content.video.tsx` — thin stub only (no Remotion); CV1 scaffold can be similarly thin; CV3 adds `@remotion/player`

**CV2 + CV3 can be planned in parallel after CV1 completes** (no dependency between them). CV4 depends on both.

**RENDER go-ahead note:** If server-side MP4 render is approved at any point, run `/gsd:plan-phase CV-RENDER`. The gated phase is fully specified in ROADMAP.md (RENDER-01/RENDER-02) but blocked on explicit infra/cost decision.
| 2026-06-25 | fast | Stage Hustle iOS identity (bundle uk.co.doyouhustle.app) + EAS build runbook | ✅ |
| 2026-06-25 | fast | iOS prep: remove invalid newArchEnabled + expo-doctor pre-flight notes | ✅ |
