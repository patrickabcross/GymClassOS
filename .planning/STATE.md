---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: — Mobile App Production Foundation
status: executing
stopped_at: Completed MA1-02-PLAN.md
last_updated: "2026-06-29T16:21:13.817Z"
last_activity: 2026-06-29
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
Phase: MA1 (Auth + 3-Role Spine (the one-way door)) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-06-29

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
| MA1. Auth + 3-Role Spine ⚑ | Better-auth login in Expo (`expo-secure-store`); two-allowlist role resolver (admin > teacher > member, no UI toggle); transactional/idempotent claim-by-email; `requireDemoMember → requireMember` dual-path. **Auth spike first.** | AUTH-01..07 | Not started — plan next |
| MA2. Member Booking Surface | Browse public / book authenticated; pass-holder books via `/api/m/bookings`; no-pass → Stripe inline → pass grant → booking; home (upcoming + balance) | MEM-01..05 | Not started |
| MA3. Teacher Session Surface | Teacher schedule (assigned) + roster; tap-to-check-in via existing `mark-booking-attended` chokepoint; no teacher AI | TCH-01..03 | Not started |
| MA4. Admin Mobile AI Agent | In-app AI ops chat (reuse `AgentSheet`/`agent-stream`); server-side ALLOW-LIST filters gated Tier-3 (+ unit test); `runWithRequestContext` + `requireAdmin` on SSE | AI-01..03 | Not started |
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

## Accumulated Context

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

Last session: 2026-06-29T16:21:13.797Z
Stopped at: Completed MA1-02-PLAN.md
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
