# Phase D2: Member Mobile App + Calorie Counter + Agent — Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

A member opens Expo Go on their phone, scans the project's QR code, loads the GymOS member app, picks themselves from a member dropdown, books a class from the schedule, logs a meal in the calorie counter, and chats with the in-app agent. At least one **real** WhatsApp message (inbound from a member's phone OR outbound from the staff inbox) is delivered end-to-end via Meta Graph API.

Demo grade. Hardcoded targets, stubbed auth, no production workers. P-tagged scope (cancellation, USDA fallback, profile-derived macros, persistent agent memory, recents/favourites) is **explicitly deferred** to Production v1 phases P1a/P1b/P2.

**In scope** (D requirements): MEMBR-01, MEMBR-02, MEMBR-03, CAL-01, CAL-02, CAL-03, AGENT-01, AGENT-02, AGENT-03, WA-01, WA-02. MEMAUTH-01 is **stubbed** (member-picker, not magic-link).

**Out of scope this phase** (kicked to Production v1): MEMAUTH-02..04, MEMBR-04..07, CAL-04..11, AGENT-04..09, WA-03..09.

</domain>

<decisions>
## Implementation Decisions

### Mobile shell strategy

- **D-01:** Edit `packages/mobile-app/` **in-place**. Do not fork to `apps/member-app/`. Follows the D0 "demo-time fork-boundary loosened" precedent (templates/mail edited directly for the inbox surface). Post-demo P0 audit can copy-out to `apps/member-app/` if upstream-merge churn becomes a real cost.
- **D-02:** **Rip out the existing `app/(tabs)/` content** (analytics, brain, calendar, clips, content, design, dispatch, forms, index, mail, more, sessions, settings, slides, starter, videos) and replace with GymOS native tabs. The upstream multi-template WebView shell is not the right base; only the Expo / Expo Router / EAS scaffolding is kept. Note in `MODIFICATIONS.md` (P0 task) which files were removed.
- **D-03:** **Native Expo screens**, not WebView wrapper. Use Expo APIs throughout (`expo-camera` for barcode, `expo-router` for navigation, native `<FlatList>` for lists). Reason: barcode scanning inside a WebView is unreliable on iOS WebKit; the demo "wow" hinges on the camera feeling native; and member screens diverge enough from staff-web that the WebView shortcut buys nothing.
- **D-04:** Five top-level tabs: **Home**, **Schedule**, **Food**, **Profile**, plus the agent surface as a FAB (not a tab) — see D-12.

### Member authentication (demo)

- **D-05:** **Member-picker dropdown** on first launch. List shows the 5 seeded members (Sarah Patel / James Wong / Maya Singh / Tom Reilly / Aisha Khan). User taps → member ID persisted to AsyncStorage. No password, no link, no OTP. Subsequent app opens skip the picker and go straight to Home; long-press on Profile screen surfaces "Switch member" for demo persona swapping.
- **D-06:** No `MEMAUTH-01` magic-link in this phase — that becomes P1a work. The picker explicitly displays a caption "Demo only — production uses WhatsApp magic-link" so the customer understands what's stubbed.
- **D-07:** Member identity is propagated to API calls via an `X-Demo-Member-Id` header. Server-side route handlers trust this header **only when** `NODE_ENV !== 'production'` and the configured `DEMO_MODE=true` env flag is set. P1a replaces this with Better-auth member sessions.

### Calorie counter UX

- **D-08:** **Today screen + add-food modal** pattern. Default view = "Today" with a kcal target ring at the top, a P/C/F macro line, and meal-type sections (Breakfast / Lunch / Dinner / Snacks). A single floating "+ Add" button opens a modal with two buttons: "Search" and "Scan barcode."
- **D-09:** **Meal types** (CAL-08) are present in the UI but **demo-grade**: the add-food modal asks "Which meal?" once with a 4-option toggle, no classification logic. Production (P2 / CAL-08) infers from time of day or member-set defaults.
- **D-10:** **Macro targets** (CAL-06) are **hardcoded** at 2100 kcal / 130P / 250C / 60F for the demo. Production (P2 / CAL-06) derives them from Mifflin–St Jeor against the member's profile (height/weight/age/sex/activity).
- **D-11:** **Open Food Facts** is the only data source for the demo (CAL-01, CAL-02). USDA fallback (CAL-05) is **out of scope** this phase. When OFF returns no match, show "Couldn't find — try a different name" rather than rolling over to USDA. Barcode scanning uses `expo-camera`'s built-in barcode detection (EAN-13/UPC), not a separate ZXing dependency.

### In-app agent

- **D-12:** **Persistent FAB → bottom-sheet** placement. Lower-right floating button with a message-bubble icon (Feather `message-circle`), visible on every screen. Tap opens a bottom-sheet that covers ~2/3 of the viewport; underlying screen remains partially visible behind a dimmed scrim. Close via X icon, swipe-down handle, or tap on the dimmed area.
- **D-13:** **3 tools, end-to-end** per AGENT-02: `greet` (intro + capabilities listing), `book_class` (with explicit "confirm before booking?" turn), `log_food_nl` (natural-language parse "I had a chicken caesar at Pret" → food entry via OFF search). No additional tools.
- **D-14:** **Anthropic Claude** for the LLM (per AGENT-09). Use `claude-sonnet-4-6` (current latest production model — verify at plan-phase time) with prompt caching enabled per CLAUDE.md / claude-api skill guidance. Streaming via SSE per AGENT-03.
- **D-15:** **No persistent agent memory or session history** this phase (AGENT-04, AGENT-05). Each agent open starts fresh. The `agent_sessions` and `agent_memory` tables can be schema-defined now (cheap) but not populated.

### Claude's Discretion

The following are NOT user-facing visionary decisions — the planner / executor will pick:

- **Schedule view density** for the member tab — week-grid vs day-by-day vs flat list. Default: mirror the staff schedule's week-grid layout but mobile-optimised (vertical scroll, one day per row, occurrences as cards).
- **WA-01 / WA-02 demo path.** Default approach: stand up a minimal Hono webhook receiver on a Fly machine (or ngrok tunnel for the demo) that signature-verifies and persists inbound messages; outbound calls Meta Graph API directly from the staff inbox `action` handler (no worker queue this phase — STR-03 / WA-05 / WA-06 are P1b). One real test phone + one approved Meta sandbox phone number is enough.
- **Branding** — app name, icon, colours. Default: name = "GymOS", icon = a stylised dumbbell or "G" mark generated via simple PNG; primary colour matches whatever the inbox surface uses today. Replaceable in 5 min for production.
- **Agent system prompt** — exact wording. Default: a short prompt stating the agent's role, member context (name, pass balance, next booking), available tools, and confirmation rules for `book_class`.
- **Permission UX for camera** — when to ask, copy of the consent screen.
- **Booking flow on member side** — full modal vs inline expand. Default: inline expand under the occurrence card with a "Confirm booking" button.
- **Offline/empty/error states** for every screen.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements

- `.planning/ROADMAP.md` §"Phase D2: Member Mobile App + Calorie Counter + Agent (Days 4–7)" — phase goal, success criteria #1–8, risk callouts (#1 24h-window, #19 SDK single-maintainer, #16 RR v7 × Vercel)
- `.planning/REQUIREMENTS.md` §"Member PWA — Booking + Profile" (MEMBR-01..07), §"Member PWA — Calorie Counter (built fresh)" (CAL-01..11), §"Member PWA — In-App Agent" (AGENT-01..09), §"WhatsApp Integration" (WA-01, WA-02 for this phase), §"Member Authentication" (MEMAUTH-01 demo-stub)
- `.planning/REQUIREMENTS.md` header note explaining "PWA / web app" references in MEMBR/CAL/MEMAUTH should be read as **native Expo equivalents** (2026-05-17 mid-session correction)
- `.planning/PROJECT.md` Key Decisions §"2026-05-17 (late) — Member surface = Expo fork of packages/mobile-app" — the reversal that took us off PWA

### Prior-phase context (D1 already shipped)

- `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-01-schedule-surface-PLAN.md` — staff schedule loader/action pattern; the member schedule mirrors this with mobile-tuned rendering
- `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-02-members-directory-PLAN.md` — pass-balance derivation (grant SUM − debit SUM as separate aggregations), `/gymos?conversation=` deep-link pattern, member profile shape
- `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-02-members-directory-SUMMARY.md` — the "leftJoin gymMembers + passes, separate debit aggregation" key-link the planner should reuse

### Project conventions

- `./CLAUDE.md` — full project instructions, response-status-indicator requirement, no-new-branches rule, no-breaking-DB-changes guard, optimistic-UI default, no-emojis-as-icons (use Feather / @expo/vector-icons), Tabler Icons rule **does not apply to mobile** — the mobile app uses `@expo/vector-icons` (Feather + MaterialCommunityIcons) per the existing `packages/mobile-app/components/AppWebView.tsx` precedent
- `./AGENTS.md` (transitive via CLAUDE.md) — agent-native framework rules; relevant subset for mobile: "actions are the single source of truth" (agent tools wrap the same endpoints UI uses), "polling keeps the UI in sync" — adapted for mobile means TanStack Query with refetch intervals
- `./.agents/skills/claude-api/SKILL.md` (if present) — prompt caching + Anthropic SDK patterns for the agent's LLM calls

### Stack & architecture decisions

- `.planning/research/STACK.md` — vendored stack reference; specifically the "Member PWA" → native Expo correction and the Open Food Facts choice for CAL-01
- `.planning/research/ARCHITECTURE.md` — overall topology (staff-web on Vercel, edge-webhooks on Fly, Neon Postgres); WA webhook receiver lives on Fly even for the demo's one-message test
- `.planning/research/PITFALLS.md` §1 (24h window), §16 (RR v7 × Vercel middleware), §19 (`@great-detail/whatsapp` single maintainer)

### External docs (Expo + native-side)

- `https://docs.expo.dev/versions/v55.0.0/sdk/camera/` — `expo-camera` barcode-scanner API (`onBarCodeScanned`, `barCodeScannerSettings`)
- `https://docs.expo.dev/router/introduction/` — Expo Router 55 file-system routing (groups, tabs, dynamic segments — the same patterns RR v7 uses)
- `https://world.openfoodfacts.org/data` — OFF v2 API; product search endpoint `https://world.openfoodfacts.org/cgi/search.pl?search_terms={q}&search_simple=1&json=1`; product-by-barcode `https://world.openfoodfacts.org/api/v0/product/{ean}.json`. ODbL attribution required per CAL-11 (defer attribution UI to P2 — note in the calorie counter screen for completeness)
- `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks` — webhook payload shape + HMAC verification (Meta uses SHA256 with the app secret). WA-01 implementation references this.
- `https://docs.anthropic.com/en/api/messages` — Messages API; tool-use protocol for AGENT-02 tools; SSE streaming for AGENT-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (in `packages/mobile-app/`)

- **`app/_layout.tsx`** — Expo Router root stack with dark theme; reuse as-is and just add a new auth-gate before showing tabs.
- **`app/(tabs)/_layout.tsx`** — Tabs layout shape with conditional `href` (used to hide disabled tabs). Pattern is solid; we replace the contents (all 16 upstream-template tabs) but keep the structure.
- **`lib/get-app-url.ts`, `lib/use-apps.ts`** — `enabledApps` pattern via `@agent-native/shared-app-config`. **Do NOT use** for GymOS member surface; this is the multi-app shell logic we're stripping out.
- **`components/AppCard.tsx`, `components/AppForm.tsx`** — generic styled primitives we can reuse for layouts.
- **`components/AppWebView.tsx`** — **Not used** for native GymOS screens but is a clean reference for session-token handling, if WA-01/02 ever needs an embedded surface.
- **`eas.json`, `app.config.ts`, `app.json`** — EAS Build + Expo config already wired up. For demo via Expo Go, no changes needed; for P2 native builds, update bundle identifier + app icon.
- **`@react-native-async-storage/async-storage`** already in deps — use for the demo member-ID persistence.

### Server-side reusable assets (staff-web / templates/mail)

- **`templates/mail/server/db/schema.ts`** — `gymMembers`, `bookings`, `classOccurrences`, `classDefinitions`, `passes`, `passDebits`, `foodEntries`, `foodItems`, `conversations`, `messages` already defined. Member-app server calls hit the same schema.
- **`templates/mail/server/db/index.ts`** — `getDb()` singleton. Reuse from any new `/gymos/api/m/*` member-API routes.
- **`templates/mail/app/routes/gymos.members.$id.tsx`** — the loader logic (pass balance, upcoming booking, recent food, conversation) is **exactly** what the member home screen needs. Extract a shared loader or just re-query.
- **`templates/mail/app/routes/gymos.schedule.tsx`** — loader for class occurrences + booking action. Member booking calls the same `db.insert(schema.bookings)` path; in P2 / BKG-03 this becomes atomic with capacity enforcement.

### Established Patterns

- **Data fetching:** RR v7 loaders for staff-web (already in use). **Mobile app needs TanStack Query** (`@tanstack/react-query` — already in `packages/core` deps; install in mobile-app per plan-phase).
- **Pass balance derivation:** `SUM(passes.granted)` minus `SUM(passDebits.delta)` as two separate aggregations (D1-02 lesson — never chain leftJoin through pass_debits because fan-out double-counts grants). Same rule applies to member-side.
- **Deep links between surfaces:** search params (e.g. `/gymos?conversation=<id>`) per D1-02. Member-side equivalent: deep-link from agent chat "I've booked you in" → schedule tab with the just-booked occurrence highlighted.
- **No backwards-compat shims:** per CLAUDE.md / AGENTS.md, when ripping out upstream `(tabs)/` content, **delete files cleanly** — do not stub them out with empty exports.

### Integration Points

- New mobile-app screens call **new** `templates/mail/app/routes/api.m.*.ts` API routes (or `.tsx` resource routes — the agent-native action pattern can work here too via `defineAction`).
- Agent tools (`greet`, `book_class`, `log_food_nl`) call the **same** server actions/endpoints the UI calls — agent-native's "actions are the single source of truth" rule (AGENTS.md Rule 3). For demo: keep the agent server-side (talk to Anthropic from a server route), don't put the API key in the mobile bundle.
- WA-01 webhook receiver: **NEW** Fly app `apps/edge-webhooks/` (Hono). Receives Meta POST → HMAC-verify → insert into `messages` + upsert `conversations` → return 200. Even for the demo, do not host this on Vercel (PITFALLS #8: webhooks on Vercel cold-start storms).

</code_context>

<specifics>
## Specific Ideas

- Member-picker copy: "Who are you?" with subtitle "Demo only — production uses WhatsApp magic-link"
- Agent FAB icon: Feather `message-circle`
- Add-food button label: "+ Add" (centred, oversized)
- Today screen kcal display format: "1,142 / 2,100 kcal" with a progress ring above
- Macro line format: "P 82g  C 134g  F 38g"
- Meal-type section headers: Breakfast / Lunch / Dinner / Snacks
- Agent welcome message: "Hi {firstName} 👋 how can I help today?" (the 👋 is **user-authored chat content**, not an icon — per AGENTS.md the no-emoji-as-icon rule explicitly allows user-authored emoji and the agent's chat output is conversational content)
- Bottom-sheet chat header: "Agent — GymOS Coach"

</specifics>

<deferred>
## Deferred Ideas

Captured during discussion — belong in other phases, not D2:

- **Magic-link / phone-OTP member auth** — P1a (MEMAUTH-02, MEMAUTH-03)
- **USDA Food Data Central fallback** — P2 (CAL-05)
- **Profile-derived macro targets via Mifflin–St Jeor** — P2 (CAL-06)
- **Real meal-type classification logic** (time-of-day inference, member defaults) — P2 (CAL-08)
- **`food_items` cache table on first OFF/USDA hit** — P2 (CAL-09)
- **Open Food Facts ODbL attribution UI** — P2 (CAL-11) — note inline in code now, ship the UI later
- **Recents / favourites for fast re-logging** — P2 (CAL-07)
- **Custom food entry (manual name + macros)** — P2 (CAL-04)
- **Weekly view (kcal + macro trends)** — P2 (CAL-10)
- **Booking cancellation from member side** — P2 (MEMBR-04)
- **Profile view + edit (name/email)** — P2 (MEMBR-05)
- **Atomic capacity-checked booking with pass debit** — P1b/P2 (BKG-03, BKG-04)
- **Persistent agent sessions + per-member memory** — P2 (AGENT-04, AGENT-05)
- **Extended agent tools: `view_schedule`, `cancel_booking`, `view_passes`, `escalate_to_coach`** — P2 (AGENT-06)
- **Typed-wrapper architecture for agent tools (single-source-of-truth with UI endpoints)** — P2 (AGENT-07)
- **Agent tool-call audit log** — P2 (AGENT-08)
- **Per-studio agent system prompt loaded from env / `agent_skills`** — P2 (AGENT-09)
- **24h-window enforcement at sender layer** — P1b (WA-05) — demo trusts the operator not to send out-of-window
- **Opt-in gate in `whatsapp_opt_in`** — P1b (WA-06)
- **Stripe payments on member side** — never in v1; staff-side only (D1-03)
- **EAS Build under customer's Apple Dev Account** — P2 / launch prep
- **Copy-out `packages/mobile-app/` → `apps/member-app/` to restore proper fork boundary** — P0 audit task
- **App branding (real icon, splash, colour scheme)** — P2 polish

### Reviewed Todos (not folded)

None — no pending todos matched D2 (verified via `gsd-tools todo match-phase D2`).

</deferred>

---

*Phase: D2-member-mobile-app-calorie-counter-agent-days-4-7*
*Context gathered: 2026-05-19*
