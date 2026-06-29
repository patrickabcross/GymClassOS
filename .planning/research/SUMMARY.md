# Project Research Summary

**Project:** RunStudio (GymClassOS) — v2.3 Mobile App Production Foundation
**Domain:** Production auth (3 roles) + admin mobile AI agent + Expo push, added to an EXISTING Expo app on a React Router v7 / Nitro / Better-auth / Drizzle+Neon stack
**Researched:** 2026-06-29
**Confidence:** HIGH (framework integration points verified by reading the installed `@agent-native/core` dist + the app code; package versions verified via npm)

## Executive Summary

This milestone replaces the `demoMemberId`/`X-Demo-Member-Id` hack with **real Better-auth login serving three roles (member / teacher / admin) on one Expo binary**, then adds an admin-only mobile AI ops agent and Expo push to close a free engagement loop (replacing paid-WhatsApp owner nudges). The single most important — and convergent — finding across all four research files is that **the server is already 90% configured for this**: the installed framework mounts Better-auth `bearer()` and `jwt()` plugins unconditionally, `emailAndPassword` is hardcoded on, and `getSession(event)` already resolves an `Authorization: Bearer <token>` against the mounted bearer plugin. That makes the mobile auth foundation **mostly a client-side task** (Expo app stores the session in `expo-secure-store` and attaches it as a Bearer header), with a **small additive server change** — register `trustedOrigins` for the app scheme (and optionally the official `@better-auth/expo` `expo()` plugin), swap `requireDemoMember -> requireMember`. **No auth migration. No identity-table reshape. Exactly ONE new additive table (`push_tokens`).** Better-auth-in-Expo is therefore a **LOW-risk** unknown — the riskiest "no cookies in React Native" question is solved either by the first-party plugin (cookie-string-over-SecureStore) or, as a zero-new-dependency fallback, the already-live `bearer()` path.

The recommended approach is a strict build order anchored on **MA1 as a one-way door**: prove the auth + role spine first and alone, then fan out MA2 (member) / MA3 (teacher) / MA4 (admin agent) — which depend only on MA1 identity and can be sequenced by business value — and do MA5 (push) **last**, because push has nothing to notify and nowhere to deep-link until the surfaces (especially the admin agent thread) exist. Build the push **spine** (token registration + deep-link routing) now, but defer most push **types**: v1 push is exactly booking confirmation + class reminder + admin "come look." This is a *production foundation*, not a feature race against Mindbody — most differentiators (waitlist auto-promote, cancellation fees, walk-ins, WhatsApp-OTP) are explicitly deferred to v1.x/v2.

The dominant risks are **security boundaries, not technology**. Three are non-negotiable: (1) the mobile admin agent loads the full action registry but has **no noticeboard approve UI**, so gated Tier-3 verbs (`send-template-to-members`, `create-checkout-link`, `cancel-occurrence`, `reschedule-occurrence`, `publish-form`) must be filtered out with a **server-side ALLOW-LIST + a test** — the web app gates these only by prompt convention, which is not a control on mobile; (2) **claim-by-email** linking Better-auth `user -> gym_members.user_id` must be transactional/idempotent/re-claim-guarded against a `gym_members.email` that is **nullable and non-unique by design** — never add a unique index, never auto-create a member; (3) all DB changes stay strictly additive through `runMigrations` (the repo has a real prod incident from a destructive migration). Role routing is two env allowlists (`RUNSTUDIO_OPERATOR_EMAILS` + new `RUNSTUDIO_TEACHER_EMAILS`) plus a member fallback — **not** org roles, **not** coupled to `trainers.email` — and the login screen exposes **no member/staff toggle**; role is auto-detected post-login so the app feels like a pure member app.

## Key Findings

### Recommended Stack

The existing stack (Expo 55, Expo Router, RN 0.83.9, TanStack Query, `react-native-sse`, Better-auth ^1.6 server, Drizzle/Neon, pg-boss, Fly worker) is **fixed**. This milestone adds four new client/server pieces, all additive. See [STACK.md](STACK.md).

**Core technologies (the four new pieces):**
- **`@better-auth/expo@1.6.22`** (client `expoClient()` + optional server `expo()` plugin): session-cookie-over-SecureStore transport for RN — purpose-built for "no browser cookies." Requires bumping server `better-auth` core `^1.6.0 -> ^1.6.22` so client/server peers agree.
- **`expo-secure-store@55.0.15`** (sdk-55 tag): OS-keychain-backed storage for the session token — replaces the AsyncStorage demo hack. Never AsyncStorage for credentials.
- **`expo-notifications@55.0.24`** + **`expo-network@55.0.15`** (sdk-55 tags): push permission/token/foreground-handler/deep-link on the client; `expo-network` is a required plugin peer.
- **`expo-server-sdk@6.1.0`** (Node, on the Fly worker): validates tokens, chunks, sends, polls receipts, prunes `DeviceNotRegistered`. **Send from the worker (pg-boss), enqueue from staff-web** — matches the locked "worker is the single sender" pattern.

**Hard stack traps:**
- **SDK-55 dist-tag pinning** — `latest` for every `expo-*` package is now SDK 56; installing it into the SDK-55 app breaks the native build. **Use `npx expo install`, never bare `npm install`.**
- **Push requires an EAS dev/prod build** (removed from Expo Go on SDK 53+) and an **`eas init` `projectId`** in `app.json` (currently MISSING) — both gated on the customer Apple Developer account.

### Expected Features

The industry ships **two apps** (member + staff); this milestone deliberately does **one app, server-side role routing** — a defensible solo-dev choice provided the login screen hides role complexity. See [FEATURES.md](FEATURES.md).

**Must have (table stakes / the v2.3 foundation):**
- Better-auth login + `expo-secure-store` + session refresh/logout — the one-way door.
- Server-side 3-way role routing (admin allowlist / teacher allowlist / member fallback); **no login-screen role toggle** — role auto-detected post-login.
- Member claim-by-email linking `user -> gym_members` row.
- Member: book a class + unpaid->Stripe gate; view upcoming/past bookings + pass status.
- Teacher: today schedule + class roster + tap-to-check-in (drives the existing `mark-booking-attended` chokepoint; **no teacher AI**).
- Admin: in-app AI ops agent, **Tier-3 filtered out** (the milestone true differentiator — no competitor ships a mature mobile ops agent).
- Push **spine** + booking confirmation + class reminder + admin "come look" deep-link.

**Should have (deferred to v1.x — push spine already in place):**
- Waitlist with auto-promotion + waitlist-available push (biggest revenue lever: ~95% vs ~71% fill).
- Cancellation-window enforcement + late-cancel/no-show flagging (window first, **fees** later).
- Walk-in check-in; cancellation/class-changed push; first-visit badge; in-app owner digest.

**Defer (v2+):** late-cancel/no-show **fee charging**; WhatsApp-OTP/passwordless login; free-push reactivation; dual-role accounts; spot selection; voice input to the agent.

### Architecture Approach

The build is framed as **integration points into existing files** (NEW vs MODIFIED), because the merge surface matters more than greenfield design. Auth is mostly client-side; the server changes are a role resolver, a `requireMember` claim-by-email gate, `trustedOrigins`, and `/api/owner` `publicPaths` edits. See [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
1. **Mobile session + role router** (`lib/session.ts` NEW, `lib/api.ts`/`_layout.tsx` MODIFIED) — Bearer in SecureStore; route tab set by role.
2. **Server role resolver + member gate** (`resolve-role.ts` NEW, `require-member.ts` NEW) — two-allowlist precedence (admin > teacher > member); idempotent claim-by-email into the existing nullable `gym_members.user_id`.
3. **Admin mobile agent SSE** (`api.owner.agent.stream.tsx` NEW + nitro delegate) — forks the **lean member SSE loop** (NOT `agent-chat.ts`), loads the registry, filters Tier-3 by allow-list, wraps in `runWithRequestContext`, extracts the owner prompt into a shared file.
4. **Teacher attendance** (`api.m.attendance.tsx` NEW) — a *caller* of the existing `mark-booking-attended` chokepoint, not a new write path (keeps the v2.2 Meta tracking pipeline intact).
5. **Push** (`push_tokens` additive table keyed to **Better-auth `user.id`** not `gym_members.id`; new pg-boss `expo-push` queue on the worker; deep-link listener in `_layout.tsx`).

### Critical Pitfalls

Top 5 of 10 (full list + verification checklist in [PITFALLS.md](PITFALLS.md)):

1. **Gated Tier-3 actions leak into the mobile admin agent** — the web app gates them only by prompt convention + the (mobile-absent) noticeboard. **Avoid:** build the tool list from a server-side **ALLOW-LIST** (`MOBILE_ADMIN_ALLOWED_TOOLS`), not a deny-list (a deny-list silently re-admits any *new* Tier-3 verb), and assert with a unit/CI test that the gated set is absent.
2. **Claim-by-email identity collision** — `gym_members.email` is nullable + non-unique; case/whitespace mismatch orphans users; re-claim can steal a link. **Avoid:** normalise `lower(trim(email))` both sides; claim in one transaction guarded by `isNull(user_id)`; 409 on re-claim; 403 (never auto-create) when no row; resolve admin-is-also-member precedence to admin. **Never add a unique index on `email`.**
3. **`/api/m/*` left public after removing the demo gate** — the path stays in `publicPaths`, so deleting `requireDemoMember` without a Bearer check = unauthenticated cross-member access. **Avoid:** `requireMember` derives the member id from the **verified session, never a header/body**; keep the path public-to-guard but bearer-gate inside every handler.
4. **Better-auth session transport in RN** — cookies do not exist in RN fetch. **Avoid:** `@better-auth/expo` client with `expo-secure-store` storage (or the already-live `bearer()` fallback); never AsyncStorage for the token. **LOW risk** because both transports are already enabled server-side.
5. **Destructive migration / auth-table reshape on the shared prod DB** — the repo has a real prod incident here. **Avoid:** all v2.3 changes strictly additive through `runMigrations` (next version after v36); reuse the existing nullable `user_id`; **do not reshape** Better-auth identity tables (would strand the HUSTLE web owner); keep `requireDemoMember` behind `DEMO_MODE && !production` until a real EAS build verifies real auth.

## Implications for Roadmap

Research strongly converges on a **5-phase structure prefixed `MA`**, with MA1 as a one-way door and MA2/MA3/MA4 parallelizable by value.

### Phase MA1: Auth + 3-Role Spine (the one-way door — build first, build real, build alone)
**Rationale:** Every downstream feature hangs off `getSession`-based identity; auth is the dependency root and security-sensitive. The convergent finding makes this lower-risk than feared — mostly client work plus small additive server changes.
**Delivers:** Better-auth login in Expo (`expo-secure-store`, session refresh/logout); two-allowlist role resolver (admin > teacher > member) with **no login-screen toggle**; transactional/idempotent **claim-by-email**; `trustedOrigins` + `/api/owner` publicPaths; `requireDemoMember -> requireMember` swap (transitional dual-path); bump server `better-auth` core to 1.6.22.
**Addresses:** AUTH (login, secure storage, 3-way routing, claim-by-email, teacher identity).
**Avoids:** Pitfalls #2 (claim collision), #3 (role precedence), #4 (RN transport), #5 (`/api/m` gating), #6 (Expo Go vs EAS origin matrix), #9 (additive identity + dual-path coexistence).
**Keystone first task — the AUTH SPIKE:** prove sign-in + `getSession` round-trip on a real device, claim-by-email links the row, **and the admin SSE carries the session** (verify the `Cookie`/`Authorization: Bearer` header survives the `react-native-sse` streaming POST; fall back to the live `bearer()` plugin if the cookie path is stripped). Resolve "can `createAuthPlugin` forward `trustedOrigins`/the server `expo()` plugin?" here — it forks the MA1 design.

### Phase MA2: Member Surface (book / pay-gate / home)
**Rationale:** Members are ~99% of users and the milestone own justification for doing auth at all (no login = no booking/Stripe); natural second.
**Delivers:** book via `/api/m/bookings`; unpaid -> Stripe (`create-checkout-link`/`/api/m/purchase`); my bookings + pass status; optimistic booking confirmation.
**Uses:** existing Stripe + booking endpoints; MA1 member identity only.
**Avoids:** verifies #2/#5 end-to-end (book/pay on a correctly-claimed, caller-scoped row; pass-debit on booking, not purchase).

### Phase MA3: Teacher Surface (schedule + check-in)
**Rationale:** Independent of MA2; depends only on MA1 `role=teacher`. Minimal surface: schedule + roster + attendance. **No teacher AI.**
**Delivers:** today schedule (filtered to the teacher); class roster; tap-to-check-in/no-show via `api.m.attendance.tsx` -> existing `mark-booking-attended` chokepoint.
**Implements:** the deferred D-11 attendance UI as a *caller* (keeps the v2.2 Meta Schedule lifecycle event intact).
**Avoids:** #3 teacher-with-no-record empty state.

### Phase MA4: Admin Mobile AI Agent (the differentiator + the security keystone)
**Rationale:** The milestone true edge; depends on MA1 `role=admin` + Bearer. The security boundary lives here.
**Delivers:** `api.owner.agent.stream.tsx` (NEW) forking the lean member SSE loop; registry loaded then **Tier-3 filtered via server-side ALLOW-LIST + test**; `runWithRequestContext` from the verified session; owner prompt extracted to a shared file; `AgentSheet`/`agent-stream.ts` parametrized (endpoint/auth/title). Teachers/members get **no agent surface**.
**Avoids:** Pitfalls #1 (gated-action allow-list — defining requirement), #7 (`runWithRequestContext` scoping), #8 (SSE bearer header + `requireAdmin` before stream opens; a member token must be rejected 403).

### Phase MA5: Push Notifications (closes the loop — do LAST)
**Rationale:** Nothing to notify and nowhere to deep-link until the surfaces (esp. the admin thread) exist; **externally gated** on EAS/Apple Dev account. Build the **spine** now, defer most **types**.
**Delivers:** `push_tokens` additive table keyed to `user.id`; `/api/m/push-token` route; pg-boss `expo-push` worker job (enqueue from staff-web, send from worker, prune `DeviceNotRegistered`); `_layout.tsx` deep-link listener. v1 push types = **booking confirmation + class reminder + admin "come look."**
**Avoids:** #6 (EAS-build gate + `eas init` projectId), #9 (additive push-token table — register it in `runMigrations`; the migration-drift gotcha applies), #10 (token churn/pruning, contextual permission ask, quiet hours/frequency, foreground handler + cold-start deep-link).

### Phase Ordering Rationale
- **MA1 is a one-way door** — no role, no auth, nothing downstream resolves; ship it alone and device-verified before fanning out.
- **MA2/MA3/MA4 depend only on MA1 identity** and are reorderable by business priority (MA2 natural second as the auth justification; MA4 carries the security keystone).
- **MA5 last** — push needs identities to key tokens and surfaces to deep-link into, and is externally blocked on the Apple Dev account.
- **Additive-only discipline + dual-path (demo and real) coexistence** thread through every phase to avoid the destructive-migration / mid-migration-breakage incidents the repo has already hit.

### Research Flags

Phases likely needing deeper research/spike during planning:
- **MA1 (auth):** the **auth spike is the keystone first task** — `createAuthPlugin` `trustedOrigins`/`expo()` forwarding, the `set-auth-token` header name on the installed better-auth version, the mapped session shape (userId vs email-only), and the SSE-carries-session verification. Highest-uncertainty phase despite low overall risk.
- **MA5 (push):** new territory for this codebase (no Expo push code present); confirm exact `expo-notifications` API + receipt-pruning flow at plan time; externally gated on EAS/Apple Dev account.

Phases with well-documented patterns (lighter research):
- **MA2 (member):** reuses existing `/api/m/bookings` + Stripe endpoints; standard optimistic-UI patterns.
- **MA3 (teacher):** thin caller of the existing `mark-booking-attended` chokepoint; established schedule/roster patterns.
- **MA4 (admin agent):** forks the existing member SSE loop + registry; the *novel* part is the allow-list filter (a small, testable control), not the transport.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Packages + versions verified via npm registry; Better-auth Expo docs official. MEDIUM only on SSE-with-session interaction (spike-verify in MA1) and the SDK-55-vs-56 pin edge. |
| Features | MEDIUM-HIGH | HIGH on member booking/notification/check-in mechanics (mature across Mindbody/Glofox/Mariana Tek/PushPress/Walla/F45); MEDIUM on the one-app-multi-role UX (industry norm is two apps — a deliberate, defensible divergence). |
| Architecture | HIGH | Integration points grounded by reading the installed `@agent-native/core` dist (`bearer()`/`jwt()` always mounted, `emailAndPassword` hardcoded on, `getSession` resolves Bearer, basePath `/_agent-native/auth/ba`) + the app code. MEDIUM only on Expo push specifics (not yet in repo). |
| Pitfalls | HIGH | The three highest-blast-radius pitfalls (Tier-3 leakage, claim collision, destructive migration) derive from direct code inspection + documented prior repo incidents. MEDIUM where prevention depends on code not yet written (new admin SSE endpoint, teacher allowlist). |

**Overall confidence:** HIGH — the framework integration is verified, the build order is dependency-clean, and the risks are well-understood security/data boundaries with concrete mitigations.

### Gaps to Address (carried-over Open Questions -> resolve as Key Decisions)

These three are carried in from PROJECT.md and the pitfalls research and should be answered before/at MA1 plan time (requirements-definition should surface them explicitly):

- **Unmatched-login-email policy** — when claim-by-email finds no `gym_members` row: show "no membership on file — contact the studio" (recommended; **never auto-create** a member — auto-create pollutes the CRM and trips the dual-unique-key upsert gotcha) vs a staff-assisted/phone-match fallback. Decide and document so code does not re-derive it inconsistently.
- **Member-web target in scope for v2.3?** — `expo-secure-store` is a no-op on web and the Better-auth Expo client falls back to web cookie handling. PROJECT notes the member surface is native-first (web is a dev convenience). Confirm whether web is a shipping target; if yes, spike the web auth fallback.
- **Password-reset path when WhatsApp is the only member channel** — Better-auth reset assumes an email sender; the studio only member channel today is WhatsApp. Decide v1: email/password with an email sender wired, magic-link, or a deferred WhatsApp-OTP (needs a Meta-approved login template). Email/password is the safe v1; WhatsApp-OTP is explicitly v2.

Plus the operational gate: **MA5 is blocked on EAS init (`projectId`) + the customer Apple Developer account** for iOS push credentials — flag as an external dependency in the roadmap.

## Sources

### Primary (HIGH confidence)
- **Direct codebase inspection** — `@agent-native/core` dist `better-auth-instance.js` (`bearer()`+`jwt()` always mounted, `emailAndPassword.enabled` hardcoded, `config.plugins` spread, no `trustedOrigins`), `auth.js` (`getSession` Bearer resolution order, basePath `/_agent-native/auth/ba/*`, `googleOnly` affects login HTML only), `action-discovery.js` (`loadActionsFromStaticRegistry` returns name->{tool,run,http}); `apps/staff-web` (`auth.ts`, `agent-chat.ts`, `schema.ts` gym_members.userId nullable / trainers no email, `api.m.*`, `demo-member.ts`); `packages/mobile-app` (`api.ts`, `agent-stream.ts`, `current-member.ts`, `AgentSheet.tsx`, `_layout.tsx`, `app.json` scheme + no extra.eas.projectId).
- **npm registry** (2026-06-29) — `@better-auth/expo@1.6.22` (+ peerDeps on `better-auth@^1.6.22`, `expo-network>=8.0.7`), `expo-secure-store` sdk-55=55.0.15/latest=56.0.4, `expo-notifications` sdk-55=55.0.24, `expo-server-sdk@6.1.0`.
- **Better-auth official Expo docs** — `expo()`/`expoClient({scheme,storagePrefix,storage:SecureStore})`, `getCookie()` + `credentials:omit`, `trustedOrigins`, custom-basePath note, `set-auth-token` bearer flow.
- **Expo push docs** — `getExpoPushTokenAsync({projectId})`, dev-build requirement (removed from Expo Go on SDK 53+), APNs-during-`eas build`, FCM V1, `addNotificationResponseReceivedListener`/`getLastNotificationResponse` deep-link pattern; `expo-server-sdk` chunk/send/receipt/DeviceNotRegistered flow.

### Secondary (MEDIUM confidence)
- Competitor feature analysis — PushPress, Mariana Tek, Mindbody, Glofox, Walla, F45 (two-app norm; invite/claim; unpaid->buy gate; waitlist auto-promote ~95% vs ~71%; check-in/kiosk; emerging owner AI).
- LogRocket "React Native auth with Better Auth + Expo" — `expoClient` config + `trustedOrigins` + dev-build caveat.

### Tertiary (LOW confidence — verify in spike)
- `set-auth-token` exact header name on the installed better-auth version; mapped session shape (userId vs email-only); `react-native-sse` preserving the session header on a streaming POST — all to be confirmed in the MA1 auth spike.

---
*Research completed: 2026-06-29*
*Ready for roadmap: yes*
