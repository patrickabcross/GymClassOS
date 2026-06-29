# GymClassOS

> **NOTE (2026-05-17, late):** Earlier in this session I claimed agent-native templates were all web (React Router v7) and the member surface should be a PWA. That was wrong — `packages/mobile-app` exists in agent-native upstream as a full Expo 55 + Expo Router + React Native 0.83.9 app (iOS/Android/web). Decision REVERSED: member surface is now `packages/mobile-app` forked & extended. Demo via Expo Go on customer's phone. Production via EAS Build under customer's Apple Dev Account. PWA references throughout this file should be read as "Expo native app" — surgically corrected in the key places below; if you find a stale "PWA" reference, the native decision wins.

## What This Is

GymClassOS is a boutique fitness studio management platform — staff back-office web app and a native member-facing mobile app (React Native via Expo), with direct integrations to WhatsApp Business API and Stripe — built by adapting Builder.io's MIT-licensed `agent-native` framework into a vertical product. The staff back-office adapts agent-native's Mail and Calendar web templates; the member app forks agent-native's `packages/mobile-app` (Expo + RN). The first deployment is a signed gym studio customer; the same fork pattern is intended to seed future verticals in other industries.

## Core Value

Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp conversations + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent — without staff cobbling together WhatsApp, calendar, calorie-tracking, and CRM tools.

## Current Milestone: v2.3 — Mobile App Production Foundation (member / teacher / admin)

**Started 2026-06-29.** The RunStudio mobile app (`packages/mobile-app`, Expo) gets a real production auth foundation serving **three roles** on one Better-auth login, replacing the demo-id hack (`demoMemberId` in AsyncStorage) and the paid-WhatsApp owner nudge.

**Driver:** Gym owners aren't at their desks, and nudging them via WhatsApp incurs per-conversation Meta fees. Free, unlimited Expo push + an in-app feature set + the AI ops agent = a cheaper, richer engagement loop. And members need login anyway (to book + hit the Stripe paywall), so real auth is a **shared foundation**, not owner-only overhead.

**Goal:** Members book/pay, teachers run sessions and check members in, and admins drive the studio via the in-app AI agent — all from one authenticated native app, with push notifications closing the loop.

**Three roles, routed server-side at login:**
- **Admin** (email in `RUNSTUDIO_OPERATOR_EMAILS`) — full AI ops agent (non-gated verbs) + operator features.
- **Teacher** (email in a new staff allowlist, *not* admin) — staff schedule view + member **check-in / attendance**; **no AI surface**.
- **Member** (otherwise) — book, pay (Stripe gate when unpaid), calorie counter; linked to `gym_members` by email (**claim-by-email**).

**Target features (REQ-IDs in REQUIREMENTS.md):**
- **AUTH** — Better-auth login in the Expo app; tokens in `expo-secure-store` (NOT AsyncStorage); session refresh/logout; 3-way role routing via two env allowlists + member fallback; **member claim-by-email** linking Better-auth `user` → existing `gym_members` row via `user_id` (nullable FK already in schema); teacher identity linking.
- **MEMBER** — book a class via `/api/m/bookings`; unpaid (no active pass) → redirect to Stripe (`create-checkout-link` / `/api/m/purchase` already exist); member home surface.
- **TEACHER** — staff schedule view; member **check-in / attendance** UI driving the existing `mark-booking-attended` chokepoint (no UI today, deferred per D-11 — built here).
- **ADMIN-AI** — owner ops agent in mobile, **admin-only**: reuse the `AgentSheet` shell + `agent-stream` SSE; new owner SSE endpoint that loads the action registry + owner system prompt, authed via Better-auth session, wrapped in `runWithRequestContext({ userEmail, orgId })`. Exposes ONLY the **non-gated** verb set (Tier 1 reads, Tier 2 board authoring, direct class/content/trainer/member writes); the endpoint **filters gated Tier-3 actions** (`send-template-to-members`, `create-checkout-link`, `cancel-occurrence`, `reschedule-occurrence`, `publish-form`) out of the tool list — those stay web-only behind the noticeboard.
- **NOTIF** — Expo push notifications; register a push token per authenticated user; admin "come look" deep-links into the agent thread, member booking/reminder taps.

**Key context / constraints carried in:**
- **Post-Wednesday work.** Wednesday (~2026-07-01) = first paying customer (HUSTLE) onboarding; that owner uses the **web** agent (already shipped, `agent-chat.ts`). Wednesday priorities are Meta token setup + Stripe go-live + the iOS member build — this milestone sequences after.
- **The owner agent already ships on web** (`apps/staff-web/server/plugins/agent-chat.ts`, `loadActionsFromStaticRegistry` + propose/approve gating). The mobile member agent is a separate bespoke loop (`app/routes/api.m.agent.stream.tsx`, 3 hardcoded tools, demo auth). The new mobile admin endpoint forks the SSE structure but loads the registry + owner prompt.
- **Auth is the one-way door** — security-sensitive; build it real (Better-auth, `expo-secure-store`), justified by the member side alone (no login = no booking/Stripe/push).
- **New technical territory for this codebase:** Better-auth client in React Native/Expo, secure token storage, Expo push (APNs/FCM via EAS — iOS build gated on the Apple Dev account per STATE.md), deep-linking from push into app surfaces.
- Single-tenant per deploy preserved; strictly additive DB changes; customer #1 = HUSTLE.
- Phase prefix **`MA`** to avoid `.planning/phases/` collisions with existing D/P/R/AE/BD/CV/MC dirs.

## Previous Milestone: v2.2 — Meta Conversion Tracking

**Started 2026-06-23.** Reports HUSTLE's lead conversions and full CRM lifecycle to the studio's **own Meta Pixel** via browser Pixel + Conversions API (deduplicated, consent-gated), then extends the same chokepoint to Meta Lead Ads. This is the "tracking setup" queued as next in STATE.md after the recurring-classes work. Grounded against DB transitions that already exist — **no new CRM/pipeline is built**.

**Goal:** Every lead the studio captures (website form or Meta Instant Form) and every step it takes — replied, bought, attended — is reported to Meta so the studio's ad campaigns optimise for deep-funnel quality and LTV, not raw form-fills.

**Target features (REQ-IDs in REQUIREMENTS.md):**
- **PIX** — browser Meta Pixel in the public form iframe (`/f/:slug`); `embed.js` bridges `fbclid`/`_fbc`/`_fbp` from the parent page into the cross-origin iframe so ad-click attribution survives the boundary.
- **CAPI** — server Conversions API spine: studio config (`pixelId`/`stageEventMap`/`testEventCode`) + encrypted `META_CAPI_TOKEN`, a **"Meta Conversion Tracking" card in `/gymos/settings/integrations`** for operator self-serve entry, additive `meta_lead_attribution` table, a pg-boss `meta-capi-event` queue fired by the **Fly worker** (staff-web only enqueues), SHA-256 PII hashing, browser↔server dedup via shared `event_id`, durable retry. Graph **v23**.
- **LIFE** — deep-funnel lifecycle events off existing transitions: **Contact** (first WhatsApp reply, worker), **Purchase** (Stripe reducer, carries `value`/`currency`, renewals report), **Schedule** (booking→attended); read stored attribution; deterministic idempotency.
- **LEAD** — Meta **Lead Ads** (Instant Form) ingestion via the Lead Retrieval webhook → `gym_members`; lifecycle reported back keyed on `lead_id` (Conversions API for CRM) so in-platform leads progress in Meta's Leads Center; WhatsApp follow-ups stay on the existing chokepoint.

**Key context / constraints carried in:**
- **Single-tenant per deploy** — `pixelId`/`capiToken` are studio-global config entered per client in Settings; no hardcoding to HUSTLE (repeatable-per-client).
- **Chokepoint rule** — all Meta events originate from the backend off DB writes; the Fly worker is the single sender (it owns 3 of the 4 transitions and can decrypt `app_secrets` with `BETTER_AUTH_SECRET`).
- **Consent (assumed, not gated by us)** — Meta Pixel/ad-tracking consent is the customer's responsibility, managed by their own site consent bar and assumed correct; we fire unconditionally and build no consent gate/bridge. We control only the form's WhatsApp opt-in (governs messaging, not Meta tracking). Caveat on record: a parent-site consent bar does not natively govern a cross-origin iframe.
- **Attribution correctness** — capture `fbc`/`fbclid` + `fbp` at submit time and persist them, because stage events fire later with no browser; `embed.js` must pass them across the iframe boundary or attribution silently fails.
- Strictly additive DB changes; fork-boundary discipline; no local dev server (verify via deploy + Test Events).
- Phase prefix **`MC`** to avoid `.planning/phases/` collisions with existing D/P/R/AE/BD/CV dirs.

## Earlier Milestone: v2.1 — Content & Video Studio (staff-web)

**Started 2026-06-20.** Adds two new staff tabs to `apps/staff-web` by adapting agent-native templates: a **Content** tab (from `templates/content` — Tiptap editor; reuse the non-collab pattern already built for `apps/hq` in BD3) and a **Video** tab (from `templates/videos` — in-browser Remotion editor via `@remotion/player`). Purpose: HUSTLE staff create **marketing & social** content/videos AND **member-facing** content/videos.

**Goal:** HUSTLE staff can author rich content documents and video compositions inside the staff app — with the right-rail agent assisting — and publish them so they reach members (mobile app + public marketing pages), without a new member web portal.

**Target features (REQ-IDs in REQUIREMENTS.md):**
- **CONT** — `/gymos/content` tab: create/list/edit/delete rich documents (Tiptap, single-studio non-collab), agent-authored marketing copy, draft→publish.
- **VID** — `/gymos/video` tab: create/list/edit Remotion compositions with in-browser `@remotion/player` preview, agent-assisted.
- **PUB** — publish pipeline: published content + videos surfaced to members via `/api/m/*` and public SSR marketing pages — respecting the no-member-web-portal constraint.
- **RENDER (flagged / gated)** — server-side video render/export to MP4 (for social posting + member playback) via `@remotion/renderer`. This is NEW infra (a Fly render worker) + recurring cost. **Default: deferred** — Video ships as in-app editor/preview first; render is a separate gated phase requiring explicit go-ahead on the infra spend.

**Key context / constraints carried in:**
- Reuse the adaptation pattern: copy template → `apps/staff-web/features/{content,video}`, additive-only migrations into the studio Neon, port actions into the staff-web registry, `gymos.content`/`gymos.video` routes under `gymos.tsx`, tabs in `GymosTopNav.tsx`, agent wiring in `agent-chat.ts` + `application_state` (four-area checklist).
- Prior art: `apps/hq` already has a non-collab Content surface + a Video stub (BD3 HQD) — mine it for the staff-web adaptation.
- No member web portal (members are on the Expo mobile app); member-facing = publish pipeline (API + public SSR pages), NOT a new member web UI.
- Single-tenant code preserved; no `studio_id`. Strictly additive DB changes.
- Strip Tiptap real-time collaboration / Yjs (single-studio staff use).
- Nitro build gotcha: helper/test files go in `server/lib` (NOT `server/plugins`) — only fails on the Vercel build, not local `tsc`/`vitest`.
- Keep staff-web UX clean (progressive disclosure; it already has many tabs).
- HUSTLE (gym #1, live at `gym-class-os.vercel.app`) is the only customer; this milestone enriches HUSTLE, not multi-tenant/HQ work.
- Phase prefix **`CV`** to avoid `.planning/phases/` collisions with existing BD/AE/R/D/P dirs.

## Earlier Milestone: v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher — ✅ SHIPPED 2026-06-19 (code)

> **Started & code-complete 2026-06-19** (BD1–BD4, 19 plans, 40/40 requirements). Archived → [`milestones/v2.0-ROADMAP.md`](milestones/v2.0-ROADMAP.md) · [`milestones/v2.0-REQUIREMENTS.md`](milestones/v2.0-REQUIREMENTS.md) · [`MILESTONES.md`](MILESTONES.md). Introduced an entirely new product layer (the operator HQ) plus a new tier of capability (gym-owner brain/dispatcher + member activation) and self-serve provisioning of fully independent per-customer systems.
>
> **Current State:** v2.0 code-complete, tagged. Remaining work is operational, not code: stand up the HQ Neon + HQ/studio deploys, set provider API tokens, submit + await Meta approval of the HQ owner-comms + GOD member-reactivation templates (2-7 day lead), then run the deferred live UAT items captured in each phase's `*-HUMAN-UAT.md` (BD1–BD4). Prior milestone v1.2 (Agentic Tab Editing AE1–AE3) is code-complete, live on Vercel; v1.0 Production + Mobile Demo (AE4) remain tracked in the roadmap.
>
> **Next milestone:** TBD — run `/gsd:new-milestone` after the v2.0 live-UAT/operational items are cleared. Candidate themes: zero-touch billing/trial gating at signup (PROV-FUT-01), HQ multi-user/roles, live-run hardening of the provisioning saga, and the Apple Health member-app integration.

**Goal:** A gym signs up on the GymClassOS site and gets a fully provisioned, independent system with zero human steps; the operator (you) gets a brain/dispatcher to understand and grow your gym-owner customers; each gym gets its own brain/dispatcher to activate its members — all with no member PII ever leaving the studio deploy.

**Three tiers:** Tier 1 = You / GymClassOS HQ (operator). Tier 2 = Gym-owners (your customers). Tier 3 = Gym members (your customers' customers). Both Tier 1 and Tier 2 get their own Brain + Dispatcher.

**Target features (requirement categories refined in REQUIREMENTS.md):**
- **HQ-FND** — `apps/hq` forked from agent-native **Dispatch + Brain** templates; own Neon project; single super-admin Better-auth login; fork-boundary discipline preserved.
- **PROV** — **zero-touch self-serve provisioning**: signup on the GymClassOS site → HQ orchestrates Neon (create project) + Vercel (deploy `staff-web`) + Fly (edge-webhooks + worker), runs migrations + seed + admin user, sets per-customer secrets, subdomain/DNS, **idempotent retries + rollback on partial failure**, then registers the customer + issues a telemetry token. Signup → live system, no human step.
- **TEL** — telemetry pipeline: per-studio AI **token-usage** instrumentation (net-new) + aggregate **mobile-app / user engagement + retention** metrics, pushed up on a schedule authenticated by the per-studio token; HQ ingests, **never queries a studio's Neon**. No PII.
- **HQB** — HQ **Brain** (Tier 1): model of your gym-owner customers + per-installation performance; at-risk / health cohorts ("sets of clients").
- **HQD** — HQ **Dispatcher** (Tier 1): generates marketing **Content + Video** for the GymClassOS website (agent-native Content + Video tools) from Brain insights; messages gym-owners **about system/product features only — never about their members**.
- **GOB** — Gym-owner **Brain** (Tier 2, in the studio deploy): their classes, fitness methods, studio brand + ethos.
- **GOD** — Gym-owner **Dispatcher** (Tier 2, in the studio deploy): **daily studio digest** to the owner + **daily heartbeat reactivation campaigns** to members + the **activation layer** driving GymClassOS usage; all member sends go through the existing worker chokepoint (opt-in / 24h-window / approved-template).

**Key constraints carried in:**
- **Completely independent per-customer systems** (own Neon + Vercel + Fly each); single-tenant code preserved; HQ sits *above* tenants and provisions them. No `studio_id`, no tenant scoping.
- **Hard PII boundary:** Tier-1 dispatcher → gym-owners only, system topics only. Member-facing comms live at Tier 2 inside the studio deploy where member data legitimately lives. **No member/lead PII ever flows up to HQ** — telemetry is aggregate engagement + token usage only.
- agent-native fork-boundary discipline: `templates/` untouched; HQ work in `apps/hq`, Tier-2 work in `apps/staff-web` + worker.
- No breaking DB changes — strictly additive (both the HQ Neon and each studio Neon).
- Provisioning automation (Neon/Vercel/Fly APIs + rollback) is the key risk → research-first milestone.
- Solo dev; single super-admin for HQ v2.0; multi-user/roles deferred.
- No local dev server (Nitro/Vite bug) for staff-web — verify via deploy or unit tests + `tsc`.
- Phase prefix **`BD`** to avoid `.planning/phases/` collisions with existing AE/R/D/P dirs.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] **Workspace bootstrapped from `BuilderIO/agent-native` fork** — Mail template copied to `apps/staff-web/`, Calendar pattern adapted for schedule, member app forks `packages/mobile-app/`. *Validated in Phase D0 (2026-05-17).*
- [x] **`apps/staff-web` deployed to Vercel** — Better-auth + Neon Postgres connected, agent reads `ANTHROPIC_API_KEY` from `app_secrets` (in-app Settings UI is the source of truth). *Validated in Phase P1b.1 (2026-05-26, live-accepted).*
- [x] **Drizzle schema migrated to Neon** — gym_members, conversations, messages, class_definitions, class_occurrences, bookings, passes, pass_debits, whatsapp_templates, whatsapp_opt_in, stripe_customers/subscriptions/payments, secrets, webhook_events, agent_sessions, food_items, food_entries — all live in `gymos-demo`. *Validated through D0 → P1b.*
- [x] **Staff back-office surfaces** — `/gymos` WhatsApp inbox with member context panel (differentiator), `/gymos/schedule` month-grid calendar, `/gymos/members` + detail, `/gymos/payments`, `/gymos/analytics` (Fill Rate / Cancellation / Pass Utilisation + MRR / Net Growth / ARPM / Drop-in Revenue using Hustle's published prices), `/gymos/settings/integrations`. *Validated in Phase P1b.1 (2026-05-26).*
- [x] **Gym-aware right-rail agent** — 5 gym actions (`list-fill-rate`, `list-classes`, `list-members`, `list-renewals`, `list-at-risk-members`) + `list-revenue` registered as `defineAction` LLM tools; gym systemPrompt forbids email vocabulary. *Validated in Phase P1b.1 (2026-05-26).*
- [x] **Customer Pilot Enablement** — auth allowlist, `/access-denied` branded denial page, sign-out, Templates dialog (WhatsApp template send through worker chokepoint), demo seed of 3 months of activity (260 members / 423 classes / 4,162 bookings / 200 active subs). *Validated in Phase P1b.1 (2026-05-26, live-accepted in lieu of formal walkthrough).*
- [x] **Webhook + worker spine** — `services/edge-webhooks/` (Hono receiver, Stripe + WhatsApp signature verification) + `services/worker/` (pg-boss subscriber, sendMessage chokepoint with opt-in / 24h-window / template-approved gates). *Validated in Phase P1b (8/9 plans, 2026-05-23).*
- [x] **Stripe Connect (Custom-equivalent) + customer purchase flows** — GymClassOS platform account with a white-label connected account (`acct_1Thn4XER2RI3cQpx`, onboarded to charges/payouts-enabled via Account Link); separate `/webhooks/stripe-connect` endpoint (signature-verified, idempotent, account-scoped reducers); direct charges on the connected account for drop-ins (pass grant) + membership subscriptions; staff `/gymos/payments` list + member-profile checkout-link button; public `/embed/buy`. STR-01, STR-02, PAY-01–04. *Validated end-to-end in Phase P1c.1 (2026-06-13, live test-mode purchase → webhook → payment row + pass credit). Deferred manual UAT: subscription/refund/portal/mobile live-tests (mechanism proven).*
- [x] **v1.1 Audit baseline (AUDT-01, AUDT-02)** — before-state screenshots of all three surfaces (20 staff-web + 3 embed + 8 mobile PNGs, INDEX.md manifest with deploy SHA) in `.planning/ui-reviews/baseline/`; NAMING-RECORD.md inventories 60+ email-vocabulary items across 4 rename layers with proposed targets, gating R3–R5 scope. Reusable Playwright harness in `scripts/ui-baseline/`. Mobile captured via react-native-web fallback (Expo Go SDK 56 vs app SDK 55 — on-device re-shoot at R5). *Validated in Phase R1 (2026-06-12).*
- [x] **v1.2 Agentic tab editing — Members + Campaigns (AEM-01..04, AEX-01/03/04)** — `update-member` agent action edits only first/last name, email, phone, notes via a `.strict()` Zod schema (consent/opt-in structurally excluded; phone validated E.164 and rejected, never normalized; collision pre-checks); composable Campaigns segment builder (`save-segment`) stores named filter specs in `application_state` (no schema change), with UI controls + the agent writing the identical spec, at-risk retained as a built-in preset; both actions two-exposed (registry + `agent-chat.ts` + `apps/staff-web/AGENTS.md`), run direct (no propose→approve), with `useChangeVersions(["action"])` live-refresh on members/detail/campaigns. *Code-validated in Phase AE3 (2026-06-19); 3 live agent+browser items in AE3-HUMAN-UAT.md await the Vercel deploy.*
- [x] **v2.2 Meta Lead Ads + CRM lifecycle (LEAD-01..03)** — in-platform Facebook/Instagram Instant-Form leads now get the same treatment as website-form leads. A signature-verified **Leadgen webhook** in `services/edge-webhooks` (same `@gymos/whatsapp` HMAC, GET handshake, `leadgen_id` extracted as a string before `JSON.parse` to dodge JS precision loss) records idempotency (`webhook_events` provider `'meta_lead'`, keyed on `leadgen_id`) and enqueues a `META_LEAD` job; the **worker** retrieves `field_data` via Graph v23 `GET /{leadgen_id}` (Page token from `app_secrets`), then ingests through a sibling of `submissions.ts` — dual-unique-key reconcile (email/phone, park+log if neither), `meta_lead_attribution.meta_lead_id` stored, opt-in `source='meta_lead_ads'`, and **no initial Lead CAPI** (D-03, avoids double-counting Meta's own attribution). Downstream Contact/Purchase/Schedule events now carry `user_data.lead_id` (plain, unhashed) so progression reports against the Lead Ad in Meta's Leads Center. Page token added to the existing Meta Settings card. *Code-validated in Phase MC3 (2026-06-24); worker 152/152 + queue 35/35 tests, worker/edge/queue/staff-web tsc all clean. NOT deployed — 3 ops prerequisites pending: apply additive migration v34 (`meta_lead_id`) to Neon by hand, enter `META_PAGE_ACCESS_TOKEN`, subscribe the Page's `leadgen` field.*
- [x] **v2.2 Meta deep-funnel lifecycle (LIFE-01..04)** — building on MC1's Pixel + CAPI foundation (`meta_lead_attribution` table, `meta-capi-event` pg-boss queue + worker sender), MC2 adds the three deep-funnel fire points through the single existing sender: **Contact** on first inbound WhatsApp reply (worker `inbound-whatsapp` path, gated on durable `contact_sent_at`), **Purchase** from both Stripe reducers (`checkout.session.completed` + `invoice.paid`) carrying currency-correct `value`/`currency` and keyed on the Stripe object id so renewals each report and replays dedupe (best-effort — never rolls back the reducer), and **Schedule** via a single `mark-booking-attended` chokepoint action (the only writer of `bookings.status='attended'`, stamps `attended_at`, enqueues exactly one event per member/occurrence). Shared worker helper `metaLifecycle.ts` (minor-units conversion, SHA-256 PII hashing, member-keyed attribution upsert). LIFE-04 ops note names Contact as the recommended Meta campaign optimisation target. *Code-validated in Phase MC2 (2026-06-23); queue 30/30 + worker 152/152 tests + staff-web/worker/queue `tsc` all clean. NOT deployed — production push held for explicit go-ahead.*
- [x] **v2.0 Studio Brain + Dispatcher (GOB-01..03, GOD-01..05)** — each studio deploy gets its own gym-owner Brain + Dispatcher. **GOB:** lightweight `studio_brain_docs` table (brand-voice + ethos editable docs, class-catalog auto-seeded from `class_definitions` on Brain init) with a `/gymos/brain` owner view+edit surface (shadcn Accordion progressive disclosure, Tabler icons, `defineAction` + `useChangeVersions` live-refresh); all three additive tables (`studio_brain_docs`, `studio_owner_config`, `reactivation_attempts`) registered as `runMigrations` versions 16-19. **GOD:** daily owner-digest pg-boss job (06:00 studio-tz, numeric metrics from `buildTelemetrySnapshot`, owner resolved by phone) + daily heartbeat (09:00 studio-tz with `hash(STUDIO_ID)%60` stagger via pg-boss `schedule(..., { tz })`) that detects 30-day-dormant members and reactivates them as a NEW producer into the existing `outbound-whatsapp` chokepoint — `sendMessage.ts` and the gates verified untouched. 3-attempts/90-day suppression ceiling + synchronous opt-out exclusion enforced day one (checked before enqueue, attempt recorded on the same path); brand-voice personalization with generic fallback. Live sends mock-first/deferred per D-15 (Meta template approval). *Code-validated in Phase BD4 (2026-06-19); 138/138 worker tests + staff-web `tsc` clean; 3 live items in BD4-HUMAN-UAT.md await the Vercel/Fly deploys + Meta-approved `owner_daily_digest`/`member_reactivation` templates.*

### Active

<!-- Current scope. Building toward these. The detailed REQ-IDs live in REQUIREMENTS.md. -->

**v1.1 UI Redesign (this branch — `redesign/ui-refresh`):** see Current Milestone section above; detailed REQ-IDs in REQUIREMENTS.md once defined.

**v1.0 workstreams (continuing on `master`, listed for context — NOT this branch's scope):**

- [ ] **WhatsApp integration deep wire** — migrate `services/worker/` + `services/edge-webhooks/` to read Meta credentials from `app_secrets` (so the in-app Settings UI is the single source of truth, not `fly secrets set`); wire **P1b-09** WA-08 template sync cron so real approved Meta templates replace the seeded stubs; end-to-end test of outbound send + inbound delivery/read callbacks against the verified WABA
- [ ] **Mobile app (member surface)** — resume D2 work (Task 4 of in-app agent was pending; D2-06 verification deferred); harden the Expo fork against iteration that landed during the staff-web pilot fixes; cut an EAS preview build under the customer's existing Apple Developer Account
- [ ] **P1c — Public Site Integrations (drafted, not yet planned)** — fork agent-native's `templates/forms/` for embeddable lead-capture / signup forms whose submissions land in `/gymos` as conversations; ship public `/embed/schedule` booking widget for `doyouhustle.co.uk` (anonymous Stripe Checkout + pass binding via P1b-07 reducer); cross-origin `postMessage` callbacks. The real commercial unlock vs Mindbody/Bsport. Run `/gsd:plan-phase P1c` when ready

**Carry-over from P1b.1 live-acceptance (three Plan-08 criteria not formally walked):**

- [ ] Real WhatsApp send against the verified WABA (rolls into WhatsApp deep wire)
- [ ] Worker chokepoint out-of-window rejection against the LIVE deployment (rolls into WhatsApp deep wire)
- [ ] Negative auth test — non-allowlisted Google account lands on `/access-denied` (needs a second Google account)

**Production v1 (Weeks 2–9, ship by ~2026-07-15) — harden + extend the demo:**

- [ ] Framework audit completed — `audit/<template>.md` for each adapted agent-native template + `audit/decision.md` ruling on fork-clean vs adapt vs build-fresh per surface
- [ ] Drizzle schema production-grade on Neon: append-only `pass_debits` ledger with CHECK constraints, `schedule_rule` + `class_occurrence` two-table TZ-correct (IANA), `webhook_events` idempotency, `audit_log`
- [ ] WhatsApp Business API integration (Meta direct, via `@great-detail/whatsapp` SDK fork): inbound webhook + outbound sender + template management + 24h-window enforcement at sender layer + opt-in gate + delivery/read receipts
- [ ] Stripe integration: **direct restricted-API-key model** (studio gives us a scoped key on their own account, stored encrypted) + idempotent webhook handlers for the listed event set + Checkout/Portal link generation + per-studio webhook signing secret
- [ ] Webhook + worker spine on Fly.io (`apps/edge-webhooks` Hono receiver + `apps/worker` pg-boss subscriber against Neon; no Redis)
- [ ] Staff web app (RR v7 + Better-auth + agent-native templates): WhatsApp inbox surface + member context panel (differentiator) + class schedule + bookings + waitlist + payments + member CRM + settings
- [ ] Member-facing PWA (RR v7, mobile-optimised, installable to home screen): browse + book classes, view passes + history, profile, calorie counter (food search + barcode + meal logging + daily macro rings), in-app agent with skill set
- [ ] Calorie counter built fresh in agent-native style (NOT a fork of OpenNutriTracker — incompatible Flutter + GPL v3 license), using Open Food Facts + USDA Food Data Central as nutrition data sources
- [ ] Per-customer deploy script (`scripts/deploy.sh <studio>` + `studios/<studio>/env.yml`) deploying all three apps (Vercel staff-web, Fly edge-webhooks + worker)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Multi-tenant schema** — using single-tenant code with per-customer deploy instead (one Neon project + one Vercel deploy + one Fly app per studio). Avoids `studio_id` leakage everywhere and keeps the schema crisp.
- **Building member mobile from scratch (NOT adapting `packages/mobile-app`)** — the fork-and-extend path is the rule; do NOT spin up a new Expo project. Always start from `packages/mobile-app` in the upstream fork.
- **Fresh per-studio App Store / Play Store listings** — overwrites customer's existing app on their existing Apple Developer Account (their existing bundle ID + listing). No new submissions / no Fastlane-per-studio-from-scratch.
- **HealthKit integration in week 1 demo** — deferred from demo sprint scope (Expo Go doesn't support custom native modules). Production v1 enables HealthKit via `react-native-health` once we move to EAS Dev Client / production builds. Coach View with health context follows.
- **Managed WhatsApp providers (Twilio, MessageBird, Vonage)** — direct Meta integration for cost and control.
- **Cross-channel CRM (email / SMS / push as parallel channels)** — WhatsApp is the only active member channel in v1. Postmark / Twilio / APNs are deferred.
- **Stripe Connect (OAuth platform model)** — using direct restricted-API-key model instead (studio creates Stripe account, gives scoped key, we store encrypted). Avoids Connect onboarding ceremony, application-fee logic, and `account.application.deauthorized` handling. Aligns with "studio owns merchant relationship" thesis.
- **Card data storage** — Stripe holds everything; we hold tokenised IDs only.
- **Sending WhatsApp outside the 24-hour window without an approved template** — Meta will flag / suspend the number. Enforced at sender layer (worker chokepoint), not just UI.
- **Premature abstraction into a generic "vertical SaaS framework"** — build GymClassOS cleanly first, observe what's actually reusable when vertical #2 begins, *then* extract.
- **Multi-channel campaign engine + segment builder** — deferred from v1. Segment builder + campaigns are post-v1 (covered in PLATFORM-VISION.md reference doc).
- **A2A (Agent-to-Agent) cross-app signed calls** — one workspace, one auth context for v1; A2A overkill until multiple deployments coexist.
- **Forking OpenNutriTracker** — Flutter + GPL v3 (would force the whole codebase to GPL v3, killing commercial distribution). Used as inspiration only.
- **bsport migration tooling productisation** — the migration playbook lives in PLATFORM-VISION.md as future onboarding tooling. When the signed customer is ready to cut over from bsport, the work happens; productising the playbook is post-v1.

## Context

**Source framework.** Builder.io's `agent-native` (`https://github.com/BuilderIO/agent-native`, MIT) ships 22 templates. The README headlines 11 (Mail, Calendar, Content, Slides, Video, Analytics, Clips, Design, Dispatch, Forms, Brain). GymClassOS adapts a subset for the studio domain:

| Template | GymClassOS surface | When |
|---|---|---|
| Mail | Staff WhatsApp inbox | Demo Sprint + production v1 |
| Calendar | Class schedule + bookings | Demo Sprint + production v1 |
| Content | Knowledge base | Post-v1 |
| Analytics | Operational reporting | Post-v1 |
| Forms | Onboarding intake / waivers | If needed |
| Brain | Coach knowledge / member context retrieval | Post-v1 |

**Calorie counter is built fresh** (no `Calorie tracker` template exists upstream — verified 2026-05-17 by direct README + grep). Reference: OpenNutriTracker (Flutter, GPL v3 — read for product/UX inspiration only; no code copied). Data sources: Open Food Facts + USDA Food Data Central. Lives as a new app/surface inside the agent-native workspace using RR v7 + Drizzle + shadcn + agent-skill tools.

**Vertical-SaaS factory framing.** GymClassOS is the first of multiple vertical products planned off the same agent-native foundation. Subsequent businesses (other verticals, not other gym customers) will get their own modified template sets. Decisions made here should keep the agent-native-modifications layer distinguishable from the GymClassOS-specific layer — without prematurely extracting a framework.

**Tenancy model.** Single-tenant code, multi-tenant deploy. One Neon project + one Vercel deploy + one Fly app per studio customer. No `studio_id` columns anywhere. New customers get a deployment, not a tenant row.

**Customer status.** A specific gym studio is signed as the v1 launch customer and is expecting a **prototype-quality demo this week**. They will see the demo via a URL on their phone (member PWA install-to-home-screen) and a URL on their laptop (staff back-office). Production cutover follows after demo feedback.

**Team.** Solo (one developer + Claude). Within the Demo Sprint week, scope is deliberately thin-but-end-to-end. Within production v1, phases run sequentially; parallelization happens within a phase between independent plans.

## Constraints

- **Tech stack — Postgres:** Neon (managed Postgres). CLI + MCP server installed locally.
- **Tech stack — Web:** Vercel hosting + TypeScript end-to-end. Framework: **React Router v7 framework mode** (matches agent-native upstream — verified). ORM: **Drizzle**. Auth: **Better-auth** (via `runAuthGuard` from `@agent-native/core/server`).
- **Tech stack — Long-running services / webhooks:** Fly.io. WhatsApp inbound webhook + Stripe webhook receivers live here (Hono app). Background worker (pg-boss subscriber against Neon, NO Redis) runs as a sibling process in the same Fly app.
- **Tech stack — Queue:** pg-boss on Neon. No Redis. No BullMQ. Postgres handles queueing in its own `pgboss.*` schema alongside the application schema.
- **Tech stack — Member surface:** Native iOS/Android app via **Expo 55 + Expo Router + React Native 0.83.9**, forked from agent-native's `packages/mobile-app`. Demo via **Expo Go** on customer's phone this week; production via **EAS Build** + customer's existing Apple Developer Account (overwrites their existing app on their account).
- **Tech stack — WhatsApp:** `@great-detail/whatsapp` (^9.x, mirrored to studio org's GitHub at fork time; pin to mirror git SHA — the official Meta `WhatsApp/WhatsApp-Nodejs-SDK` is paused per Issue #31). Wrapped in a thin adapter so the SDK can be swapped for hand-rolled Graph API calls in one file change.
- **Tech stack — Stripe:** Stripe Node SDK with `apiVersion` explicitly pinned. **Direct restricted-API-key model** (studio creates Stripe account, generates restricted key, we store encrypted in Postgres via `pgcrypto`). NOT Stripe Connect.
- **Tech stack — Nutrition data:** Open Food Facts (free, packaged-food focus, no API key required) + USDA Food Data Central as fallback for natural-language items not in OFF. LLM fills gaps for descriptions neither matches.
- **Tech stack — Agent runtime:** Anthropic SDK (Claude). One shared `ANTHROPIC_API_KEY` per workspace. Agent endpoints stream via SSE. Skills + tools live in `packages/shared/agent-skills/`.
- **Timeline:** **Demo this week (~2026-05-24)** for the signed customer's first look. **Production v1 by ~2026-07-15** — 8 weeks of work to harden the demo + extend to full production scope. *Aggressive for solo work; every differentiator must justify its cost against the deadline.*
- **Compliance — PCI:** Card data never stored anywhere other than Stripe. Tokenised customer / subscription IDs only.
- **Compliance — Meta:** Outbound WhatsApp messages outside the 24h window MUST use an approved template; non-template sends out of window MUST be rejected at the sender layer (not just discouraged in UI).
- **Compliance — WhatsApp opt-in:** Members must have recorded opt-in evidence (`whatsapp_opt_in` table) before any outbound. Sender refuses if no opt-in row exists.
- **Reliability — Stripe webhooks:** Handlers MUST be idempotent. Stripe replays events out of order and retries on transient failures; non-idempotent handlers silently corrupt member/pass/payment state.
- **Architecture — Tenancy:** Single-tenant code, multi-tenant deploy. No `studio_id` in schema, no tenant scoping in queries.
- **Architecture — agent-native fork boundary:** `templates/` and `packages-vendored/*` are NEVER edited in place. Modifications go in `apps/staff-web/features/*` (copies) or `apps/staff-web/app/lib/*` (wrappers). Two git remotes (`origin` + `upstream`); `MODIFICATIONS.md` tracks every modification. Preserves upstream merge tractability.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork `BuilderIO/agent-native` as foundation | Mature template head start across mail / calendar / content / analytics / forms / brain / dispatch + others; MIT-licensed; AI-native UX shape matches the product vision | — Pending Phase 0 audit |
| React Router v7 + Drizzle + Better-auth + H3 stack | Locked by agent-native upstream (verified by direct repo inspection 2026-05-17). Mismatching the stack kills the merge story. | — Locked |
| Postgres on Neon | User already has CLI + MCP set up; managed Postgres avoids ops overhead; branching speeds up dev workflows | — Locked |
| Vercel (web) + Fly.io (long-running / webhooks) | Vercel handles stateless API + UI; Fly handles always-on webhook receivers and background workers | — Locked |
| pg-boss on Neon (no Redis, no BullMQ) | Eliminates Redis as a service; queue lives in the same DB as the app data; one service to provision, one secret. Re-evaluate at >10k jobs/day per studio. | — Locked |
| WhatsApp Business API direct from Meta (no Twilio) | Avoids per-message markup of managed providers; full control over template lifecycle; differentiator clarity | — Locked |
| **Stripe direct restricted-API-key (NOT Connect)** | Studio owns merchant relationship outright; cleaner than Connect; no application-fee or deauth handling; bsport-migration story works cleanly | — Locked 2026-05-17 |
| Single-tenant code, multi-tenant deploy | Keeps schema clean, eliminates whole class of tenant-isolation bugs, fits per-customer deploy model used by future verticals | — Locked |
| Open Food Facts + USDA Food Data Central for nutrition | Free, no API key for OFF; broad packaged-food coverage; LLM fills natural-language gaps | — Locked |
| **Member surface = Expo native app forked from agent-native `packages/mobile-app`** | agent-native ships a working Expo 55 + Expo Router + RN 0.83.9 + iOS/Android/web mobile-app in `packages/mobile-app`. Forking it satisfies "modify agent-native products" and avoids reinventing a mobile shell. Demo this week via Expo Go (no native modules needed); production via EAS Build under customer's existing Apple Dev Account. | — Locked 2026-05-17 (REVERSED earlier mid-session PWA decision after `packages/mobile-app` was discovered) |
| **Calorie counter built fresh in agent-native style (NOT fork OpenNutriTracker)** | OpenNutriTracker is Flutter + GPL v3 — wrong stack AND wrong license for proprietary commercial distribution. Use as inspiration only. | — Locked 2026-05-17 |
| Demo this week + production v1 by 2026-07-15 (two milestones) | Customer demo pressure forces a vertical slice now; production hardens what the demo taught us | — Locked 2026-05-17 |
| Don't extract a generic "vertical framework" yet | Premature abstraction risk; let two verticals exist before deciding what's truly reusable | — Locked |
| Vision doc (PLATFORM-VISION.md) is reference, NOT architecture-of-record | New scope doc had several conflicts with current constraints (Next.js+Prisma misidentification of agent-native, Hetzner self-host, native mobile, Twilio multi-channel, tenant_id+RLS). Reconciled item-by-item 2026-05-17. | — Locked |
| **Meta conversion tracking fires from the Fly worker (pg-boss `meta-capi-event`), not staff-web** | 3 of 4 lifecycle transitions already live in the worker; worker can hold the encrypted CAPI token; pg-boss gives durable retry (events must not drop). staff-web only enqueues — matches "staff-web never calls external APIs directly". | — Locked 2026-06-23 |
| **Meta-consent is the customer's site responsibility — we do not gate on it** | Pixel/ad-tracking consent is managed by the customer's own site consent bar and assumed correct; we fire unconditionally and build no consent gate/bridge. We control only the form's WhatsApp opt-in (distinct purpose: messaging). Caveat: a parent-site consent bar does not natively govern a cross-origin iframe. | — Locked 2026-06-23 |
| **Lifecycle events fire off existing DB transitions — no CRM/pipeline built** | A "lead" is already a `gym_members` row + `conversations(status='lead')`; replied/bought/attended map to inbound writes, Stripe reducers, and `bookings.status='attended'`. Building a separate pipeline would be redundant. | — Locked 2026-06-23 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-24 — Milestone v2.2 (Meta Conversion Tracking) fully BUILT: MC1 (Foundation + Lead), MC2 (Deep-funnel lifecycle: Contact/Purchase/Schedule), MC3 (Meta Lead Ads + CRM lifecycle) all complete and code-validated on master (15/15 v2.2 requirements). NOT yet deployed — production push + ops prerequisites (v34 migration, Meta tokens/Page subscription) held for explicit go-ahead. Reports form-lead + Meta Lead-Ad conversions and the full CRM lifecycle (Lead/Contact/Purchase/Schedule) to the studio's own Meta Pixel via browser Pixel + Conversions API (deduplicated). Meta-consent is assumed handled by the customer's site (we don't gate); we control only the form's WhatsApp opt-in. Fires from the Fly worker (pg-boss `meta-capi-event`); staff-web only enqueues. Operator enters Pixel ID + CAPI token + Test Event Code in a "Meta Conversion Tracking" card in /gymos/settings/integrations. Additive `meta_lead_attribution` table. Graph v23. Three phases: MC1 Foundation+Lead, MC2 Deep funnel, MC3 Lead Ads. Requirements → roadmap → /gsd:plan-phase MC1. Phase prefix `MC`.*

*Earlier: 2026-06-20 — Milestone v2.1 (Content & Video Studio for staff-web) started. Adds `/gymos/content` (Tiptap, non-collab — reuse apps/hq BD3 pattern) + `/gymos/video` (Remotion `@remotion/player` editor) tabs to apps/staff-web, for marketing/social + member-facing content. Publish pipeline → member mobile API + public SSR pages (no member web portal). Server-side MP4 render (`@remotion/renderer` on Fly) flagged + deferred (infra/cost gate). Phase prefix `CV`. Requirements → roadmap next.*

*Earlier: 2026-06-19 — v2.0 Phase BD4 (Studio Brain + Dispatcher) COMPLETE (code) — **final v2.0 phase**: studio-tier mirror of BD3. **GOB** — lightweight `studio_brain_docs` (brand-voice + ethos docs, class-catalog auto-seeded from `class_definitions` on init), `/gymos/brain` owner view+edit (shadcn Accordion + Tabler + `defineAction`/`useChangeVersions`), all three additive tables (`studio_brain_docs`, `studio_owner_config`, `reactivation_attempts`) as `runMigrations` v16-19. **GOD** — daily owner-digest job (06:00 studio-tz, numeric `buildTelemetrySnapshot` metrics, owner-by-phone) + daily heartbeat (09:00 studio-tz, `hash(STUDIO_ID)%60` stagger, pg-boss `schedule(..., {tz})`) detecting 30-day-dormant members and reactivating them as a NEW producer into the existing `outbound-whatsapp` chokepoint (`sendMessage.ts` + gates verified untouched). 3/90-day suppression ceiling + synchronous opt-out enforced day-one (checked before enqueue); brand-voice personalization + generic fallback; live sends mock-first/deferred per D-15. 138/138 worker tests green; `tsc` clean. GOB-01..03 + GOD-01..05 code-verified. Deferred on external deps (BD4-HUMAN-UAT.md): live `/gymos/brain` browser session, owner digest + heartbeat reactivation on a running Fly worker with Meta-approved `owner_daily_digest`/`member_reactivation` templates. **v2.0 milestone code-complete (BD1-BD4).** Next: live UAT + Meta template submissions; consider `/gsd:complete-milestone`.*

*Earlier: 2026-06-19 — v2.0 Phase BD3 (HQ Brain + Dispatcher) COMPLETE (code): two parallel tracks inside `apps/hq`. **HQB** — deterministic `classifyStudioHealth` engine (no LLM in trust path; staleness-first gate so stale/missing telemetry is never "healthy"), `last_telemetry_received_at` exclusion via `DISTINCT ON (studio_id)`, computed at-risk/power-user cohorts, `/api/studios` + `/api/studios/:id/snapshots` read models, `/studios` console (shadcn Table + health badges + cohort filter) and `/studios/:id` drill-in (recharts under `ClientOnly`). **HQD** — additive migrations v8/v9/v10 (`hq_whatsapp_opt_in`, `hq_whatsapp_templates`, content `documents`; no-PII), HQ-owned mirrored gates (opt-in→24h-window→approved-template; NEVER imports `services/worker` — new `guard:hqd-no-worker-import`), mockable `HqWabaClient` + gate-ordered `sendOwnerMessage`, `send-owner-whatsapp` `.strict()` action that structurally excludes member targets (16 tests incl. memberId→throw), HQD system-prompt constraint (copy-out fork of agent-chat.ts), `hq-owner-send` pg-boss queue, non-collab Content surface (no Yjs/Notion) + HQD-05 Video thin stub. 114 HQ/worker tests green; guard:hq-no-pii + guard:hq-fork-boundary + guard:hqd-no-worker-import all clean. HQB-01..05 + HQD-01..05 code-verified. Deferred on external deps (BD3-HUMAN-UAT.md): live `/studios` + content-editor browser session, hq-owner-send end-to-end on running worker, and live WABA send (HQ WABA second-number Meta registration + owner-comms template approval). Next: BD4 Studio Brain + Dispatcher (GOD member-reactivation Meta templates to submit now — 2-7 day lead).*

*Earlier: 2026-06-19 — v2.0 Phase BD2 (Telemetry + Provisioning) COMPLETE (code): HQ schema v4-v7 (studios/provisioning_runs/telemetry_snapshots/token_usage/studio_tokens, additive, no-PII), TelemetrySnapshot Zod `.strict()` (422 on PII), studio token_usage AFTER-INSERT trigger (fork-safe) + buildTelemetrySnapshot (PII-free), HQ `/api/telemetry` ingest (token-hash auth) + studio daily push job, Neon/Vercel/Fly find-or-create adapters, 8-step provisioning saga with LIFO rollback-first + runStep idempotency (mock-tested), public `/api/signup` (202 queue pattern), operator provisioning dashboard, watchdog. 192 tests green. TEL-01..06 + PROV-01..10 code-verified. Deferred on external creds: HQ/studio deploys, provider API tokens, real StudioMigrator/Seeder, live runs (BD2-HUMAN-UAT.md). Next: BD3 HQ Brain + Dispatcher (HQD needs HQ WABA + Meta template approval — external).*

*Earlier: 2026-06-19 — v2.0 Phase BD1 (HQ Foundation) COMPLETE (code): `apps/hq` forked from Dispatch+Brain, `packages/hq-schema` (additive, no-PII), HQ Better-auth single super-admin + org seed (19 tests), `services/hq-worker` skeleton (flyctl baked in), two CI guards (fork-boundary + PII-up), Anthropic token-usage seam audited (production-agent.ts:2654 → DB-trigger for BD2 TEL). HQ-FND-01..06 code-verified. Deferred on external creds: HQ Neon project + HQ secrets + Vercel/Fly deploys (BD1-HUMAN-UAT.md). Next: BD2 Telemetry + Provisioning.*

*Earlier: 2026-06-19 — Milestone v2.0 (Self-Serve Platform + Two-Tier Brain/Dispatcher) started. Introduces operator HQ (`apps/hq` from Dispatch+Brain+Content+Video), zero-touch self-serve provisioning of independent per-customer systems, PII-free telemetry up, and a Tier-2 gym-owner brain/dispatcher (digest + heartbeat reactivation). v1.2 Agentic Tab Editing complete (live, UAT pending).*

*Earlier: 2026-06-18 — v1.2 Agentic Tab Editing: phases AE1 (Forms) + AE2 (Schedule) complete. AE3 (Members + Campaigns) next.*

*Earlier: 2026-06-13 — P1c.1 Stripe Connect (Custom-equivalent) + customer purchase flows completed and validated end-to-end against production (live test-mode drop-in purchase flowed Checkout → Connect webhook → payment row + pass credit). STR-01/02 + PAY-01–04 moved to Validated. Deferred manual UAT (subscription/refund/Customer Portal/mobile live-tests) tracked in P1c.1-HUMAN-UAT.md — all extensions of the now-proven mechanism.*

*Earlier: 2026-06-12 — Phase R1 (Audit Baseline) complete: before-state screenshots + naming decision record committed; two discoveries flagged for master: `/api/m/*` member API is production-gated to 401 (mobile app cannot fetch live data), and Expo Go can no longer run the SDK 55 app (EAS dev client needed).*

*Earlier: 2026-06-12 — Milestone v1.1 UI Redesign started on branch `redesign/ui-refresh` (studio-skinnable GymClassOS design system + gym-domain naming across staff web, public widgets, member mobile app; parallel track, merge when ready).*

*Earlier: 2026-05-26 — P1b.1 Customer Pilot Enablement live-accepted on `gym-class-os.vercel.app` after iterative live-fix wave; P1c Public Site Integrations drafted (forms fork + `/embed/schedule` booking widget); validated requirements section refreshed from "(None yet)" to the shipped surfaces; next-up workstreams: WhatsApp deep wire + Mobile EAS build + P1c plan-phase.*

*Earlier: 2026-05-17 — major scope revision (Demo Sprint + Production v1 two-milestone shape; mobile = native Expo not PWA; Stripe direct restricted-key; calorie counter in v1; pg-boss replaces BullMQ/Redis). See PLATFORM-VISION.md for the reconciliation log.*
