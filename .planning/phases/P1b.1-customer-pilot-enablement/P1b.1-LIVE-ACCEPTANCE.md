---
type: live-acceptance
phase: P1b.1-customer-pilot-enablement
created: 2026-05-26
accepted_by: patrickalexanderross@outlook.com
accepted_at: 2026-05-26
accepted_in_lieu_of: P1b.1-08-end-to-end-verification (formal walkthrough)
verification_file: P1b.1-VERIFICATION.md (scaffold retained as reference)
---

# P1b.1 — Live Acceptance Record

Phase P1b.1 (Customer Pilot Enablement) was accepted in-situ on the live Vercel deployment `gym-class-os.vercel.app` on **2026-05-26**, after a wave of post-deploy live-fixes that exercised every surface the formal Plan 08 walkthrough would have tested.

## Why no formal walkthrough

Plan 08 was a scripted 7-criterion human-verify checkpoint to be walked against the deployed app before declaring the phase complete. Instead, the user walked the surfaces directly while reporting bugs, and we shipped fixes in real time. The cumulative live-fix wave covered every functional area the script would have exercised, plus several real-world issues the script wouldn't have caught (e.g. the framework's multi-tenant credential gate, Gmail-scope sign-in regression, env-vars POST 403). The user signed off the surface as "working well enough" once the cumulative live-fix wave settled.

## Live-fix wave summary (2026-05-25 → 2026-05-26)

Each item below shipped as one or more commits during interactive UAT.

| Area | Fix | Why |
|---|---|---|
| Layout | Removed over-broad CSS suppressor that was killing agent input | Defence-in-depth attempt for Builder.io card hide had a too-broad `:has()` selector |
| Layout | `gymos.tsx` wrapper changed from `w-screen h-screen` to `h-full w-full min-w-0` | Agent sidebar was overlaying content instead of sitting as a flex column |
| Inbox | Empty state replaced placeholder with badge + heading + "Open most recent conversation" CTA | User asked for actionable empty state, not a passive placeholder |
| Settings panel | Stripped Builder.io rows from `CapabilityStatusStrip`, plus Builder sub-cards across LLM/Hosting/Database/File-uploads/Authentication; removed Browser Automation + Background Agent sections (Builder-coupled) | Customer pilot shouldn't see Builder.io branding or features tied to the upstream framework's dev mode |
| Top nav | Added "Sign out" entry to `GymosTopNav` (after Settings); POSTs `/_agent-native/auth/logout` then redirects to `/` | User asked for an obvious sign-out affordance |
| Members | Route file renamed `gymos.members.$id.tsx` → `gymos.members_.$id.tsx` to escape parent-route nesting under `gymos.members.tsx` | Click on member row was no-op because the detail route was nested under the parent (which has no `<Outlet />`) |
| Schedule | Rebuilt as month-grid calendar with day drill-down (URL-stateful via `?month=&date=`), today highlighted, off-month muted, count badges per day | Flat list of every booking date was unscalable |
| Analytics | Reorganised into Activity (Fill Rate / Cancellation / Pass Utilisation) + Business (MRR / Drop-in Revenue / Net Growth / ARPM) sections | User asked for revenue + net growth figures |
| Analytics | MRR computed from `stripe_subscriptions` × £85 (unlimited) / £44 (limited); Drop-in revenue from `passes WHERE source='purchase' AND product_name='10-pack'` × £80; Net Growth = members joined (30d) − subs canceled (30d); ARPM = MRR / active members | Prices sourced from https://www.doyouhustle.co.uk/join — the customer's published rates |
| Analytics | Added `apps/staff-web/actions/list-revenue.ts` (`defineAction`) so the agent can answer revenue questions directly | Surface MRR/ARPM/Net Growth through the right-rail Chat without N tool calls |
| AssistantChat | Removed inline `BuilderConnectCta` block inside `BuilderSetupCard`, rewrote heading to "AI assistant not configured — Add an Anthropic API key in Settings", promoted "Open Settings" to a primary button | Customer should not see Builder.io marketing on the agent sidebar |
| Framework — credential resolver | Iteration 1: added `AGENT_NATIVE_SINGLE_TENANT` escape hatch in `credential-provider.ts` / `env-var-writes.ts`. **Reverted.** | Wrong shape — the framework's documented pattern is `registerRequiredSecret()`, not a fork patch to the gate |
| Framework — credential resolver | Iteration 2: shipped `apps/staff-web/server/register-secrets.ts` registering `ANTHROPIC_API_KEY` (+ 4 WhatsApp keys) via `registerRequiredSecret({ scope: "user", kind: "api-key" })` | Framework-native path. Key appears in Settings → API Keys with a working Save → encrypted into `app_secrets` → read by `resolveSecret()` on every request |
| Framework — env-vars POST | Patched `/_agent-native/env-vars` POST handler in both `create-server.ts` and `core-routes-plugin.ts` to fall back to `writeAppSecret(scope:"user")` when `isEnvVarWriteAllowed()` returns false AND the caller is authenticated | The legacy LLM / Onboarding / ApiKeySettings / Email-provider UIs all POST to that endpoint; the framework returned 403 in production. The fallback preserves the multi-tenant safety model (per-user write, not deployment-wide global) while making the legacy UIs work |
| Framework — Google OAuth | Replaced `gmailGetProfile(tokens.access_token)` in `apps/staff-web/server/lib/google-auth.ts` (line ~233) with a direct call to `https://www.googleapis.com/oauth2/v2/userinfo` | Identity-only scopes mean Gmail endpoints 403. Sign-in had been silently broken since scopes were tightened |
| Seed | Demo data: 260 members, 423 class occurrences, 4,162 bookings, ~200 active subs, 90 conversations, 453 messages — 3 months ending today, idempotent via deterministic `demo3m_*` IDs | Customer logs into a populated surface, not an empty shell |
| Docs | `apps/staff-web/AGENTS.md` `passes.status` → `passes.expires_at` (active = NULL or future) | Schema fix surfaced during the audit |
| Docs | `P1b.1-WHATSAPP-SETUP.md` created with the actual Fly app name (`gymos-edge-webhooks`), webhook route, and 5 env vars derived from the codebase | User asked for setup instructions; the doc replaces guesswork |

## Acceptance signal

> "Everything is working well enough. Can you update the mds so it shows next steps is the whatsapp integration and mobile app?"
> — patrickalexanderross@outlook.com, 2026-05-26

## What did NOT get formally checked

The Plan 08 script's 7 criteria were not walked verbatim. The areas most worth re-checking before declaring "production-pilot-ready":

1. **Criterion 3 — real WhatsApp send.** The Templates dialog send path is wired but the worker still reads `process.env.WHATSAPP_*`. To exercise this against real Meta delivery, the user must (a) `fly secrets set` the WhatsApp credentials on `gymos-edge-webhooks`, OR (b) wait for the next-up "WhatsApp deep wire" workstream to migrate the worker to read from `app_secrets`. See `P1b.1-WHATSAPP-SETUP.md`.
2. **Criterion 6 — worker chokepoint rejecting out-of-window free-text sends.** Verified at unit-test level in `P1b-06` but not exercised against the live deployment with a real stale conversation.
3. **Criterion AUTH-neg — non-allowlisted Google sign-in lands on `/access-denied`.** Allowlist is wired (`CUSTOMER_ALLOWED_EMAILS` env on Vercel) and the route exists; needs a second Google account to actually walk.

These three are captured below as carry-over items for the next phase.

## Carry-over items (rolled into next-up workstreams)

- **WhatsApp deep wire workstream:** migrate `services/worker/` and `services/edge-webhooks/` to read Meta credentials from `app_secrets` via `resolveSecret`/`readAppSecret`; wire WA-08 template sync cron; do the real Meta delivery test (Criterion 3); do the worker-chokepoint out-of-window test (Criterion 6); WA-08 template sync is the open P1b-09 plan
- **Mobile app workstream:** resume D2-06 Task 4 (in-app agent live demo); cut EAS preview build under customer's Apple Developer Account
- **Operational:** walk the negative-auth test (Criterion AUTH-neg) once a non-allowlisted Google account is available
