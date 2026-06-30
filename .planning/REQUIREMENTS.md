# Requirements: RunStudio (GymClassOS) — Milestone v2.3

**Defined:** 2026-06-29
**Milestone:** v2.3 — Mobile App Production Foundation (member / teacher / admin)
**Core Value:** Members book/pay, teachers run sessions and check members in, and admins drive the studio via an in-app AI agent — all from one authenticated native app (Expo), with push notifications closing the loop. The booking app is table stakes; **extending it into a studio-management surface (the admin AI agent) is the differentiator.**

**Scope note:** The RunStudio mobile app (`packages/mobile-app`, Expo) gets a real production auth foundation replacing the demo-id hack (`demoMemberId` in AsyncStorage). One Better-auth login serves **three roles routed server-side**; the AI ops agent is **admin-only**. Native (iOS/Android) only — no react-native-web target this milestone. Single-tenant per deploy preserved; strictly additive DB changes. Customer #1 = HUSTLE.

**Sequencing:** Post-Wednesday work (Wednesday ~2026-07-01 = first paying customer onboarding; that owner uses the **web** agent, already shipped). This milestone follows after Meta tokens + Stripe go-live + the iOS member build.

**Research:** `.planning/research/SUMMARY.md` (committed `26eedafd`) — convergent finding: the Better-auth server is already 90% wired for mobile (`bearer()` + `jwt()` mounted, `emailAndPassword` on, `getSession` resolves Bearer tokens), so auth is LOW risk with **no auth migration** and **one additive `push_tokens` table**. The real risk is the security/data boundary (gated-action leakage, claim-by-email collisions, session-scoped queries).

**Locked decisions (this session):**
- **Login = email + password** (Better-auth `emailAndPassword`, already wired — no new infra). Member gets their email from Stripe checkout; claim-by-email links the existing `gym_members` row.
- **Browse = public; book = authenticated** — the app is open to browse the schedule; login is the wall at the *booking* action.
- **No-membership is the Stripe paywall, not a hard block** — booking without an active pass routes to Stripe inline; purchase grants the pass and links the member.
- **3-way role routing = two env allowlists + member fallback** — admin `RUNSTUDIO_OPERATOR_EMAILS` (exists), teacher `RUNSTUDIO_TEACHER_EMAILS` (new); else member. **No role toggle in the UI** — role is auto-detected post-login; the app feels like a pure member app. Do NOT use Better-auth org roles; do NOT couple teachers to `trainers.email`.
- **Admin agent exposes ONLY non-gated verbs** via a server-side **allow-list** (gated Tier-3 filtered out + unit-tested) — the web agent gates Tier-3 only by prompt + noticeboard, which a naive fork would lose.
- **Push: build the spine, defer most types** — v1 = booking confirmation + class reminder + admin "come look."

---

## v2.3 Requirements

### AUTH — Auth + 3-role foundation (the one-way-door spine)

- [x] **AUTH-01**: A user can sign in to the mobile app with email + password via Better-auth; the session token is stored in `expo-secure-store` (never AsyncStorage).
- [x] **AUTH-02**: A member can create an app account with the email they used at Stripe checkout (sets a password on first sign-up).
- [x] **AUTH-03**: The session persists across app restarts and the user can sign out (token cleared from secure store).
- [x] **AUTH-04**: Role is resolved server-side at login — **admin** (email in `RUNSTUDIO_OPERATOR_EMAILS`) / **teacher** (email in `RUNSTUDIO_TEACHER_EMAILS`) / else **member**, with strict precedence admin > teacher > member. There is **no role-selection toggle** in the UI.
- [x] **AUTH-05**: On first member sign-in, the app claims the existing `gym_members` row by email — idempotent, re-claim-guarded (`isNull(user_id)`), never auto-creating a member, never adding a unique index on `gym_members.email`.
- [x] **AUTH-06**: `/api/m/*` endpoints derive member identity from the verified Better-auth session; the demo `X-Demo-Member-Id` header is honored only as a non-production fallback (the live demo keeps working until the login screen ships).
- [ ] **AUTH-07**: An auth spike proves end-to-end before dependent surfaces are built — sign-in + `getSession` round-trip against the framework Better-auth instance, and the admin SSE call carrying the session (bearer fallback if the streaming POST drops the cookie).

### MEMBER — Booking surface

- [ ] **MEM-01**: Anyone can open the app and **browse the class schedule** without logging in.
- [ ] **MEM-02**: Tapping **Book** while signed out prompts sign-in (the auth wall sits at the booking action, not app entry).
- [ ] **MEM-03**: A signed-in member with an active pass can book a class via `/api/m/bookings`.
- [ ] **MEM-04**: A signed-in member **without** an active pass is routed to Stripe checkout inline; on successful purchase the pass is granted and the booking completes.
- [ ] **MEM-05**: A member can see their home surface — upcoming bookings and current pass balance.

### TEACHER — Session surface (run sessions; no AI)

- [ ] **TCH-01**: A teacher sees the class schedule with their assigned sessions and the roster for a session.
- [ ] **TCH-02**: A teacher can check a member in / mark attendance for a session, driving the existing `mark-booking-attended` chokepoint (no UI exists today — built here).
- [ ] **TCH-03**: A teacher has **no** access to the admin AI agent or any admin-only surface.

### ADMIN-AI — Mobile ops agent (the differentiator + the security keystone)

- [x] **AI-01**: An admin can open an in-app AI ops chat (reusing the `AgentSheet` shell) that calls non-gated platform actions in natural language and renders results that reflect in app state.
- [x] **AI-02**: The mobile admin agent endpoint exposes ONLY the non-gated verb set via a server-side **allow-list**; gated Tier-3 actions (`send-template-to-members`, `create-checkout-link`, `cancel-occurrence`, `reschedule-occurrence`, `publish-form`) are filtered out of the tool list — enforced server-side and covered by a unit test.
- [x] **AI-03**: Agent tool calls run under `runWithRequestContext` with the admin's identity, and the SSE endpoint requires an authenticated admin session (rejects member/teacher).

### NOTIF — Push notifications (build the spine; defer most types)

- [ ] **NOT-01**: The app registers an Expo push token for the authenticated user, persisted in an additive `push_tokens` table keyed to `user.id` (multi-device tolerated; stale tokens pruned on `DeviceNotRegistered`).
- [ ] **NOT-02**: A member receives a booking-confirmation push and a class-reminder push (sent from the Fly worker via `expo-server-sdk`, matching the staff-web-enqueues / worker-sends pattern).
- [ ] **NOT-03**: An admin receives a "come look" push that deep-links into the in-app agent thread.
- [ ] **NOT-04**: Push is enabled on a real EAS dev build with `app.json` `extra.eas.projectId` populated via `eas init` (external dependency: the customer's Apple Developer account — same gate as the existing iOS build blocker).

---

## v2 Requirements (deferred — tracked, not in this milestone)

### Member booking (deferred)

- **MEM-FUT-01**: Waitlist + auto-promotion when a spot opens (biggest deferred revenue lever; needs the push spine from NOT-01).
- **MEM-FUT-02**: Late-cancel / no-show fees (touches Stripe + trust; policy-heavy).
- **MEM-FUT-03**: Walk-in / spot-selection booking.

### Auth (deferred)

- **AUTH-FUT-01**: Passwordless / magic-link or WhatsApp-OTP login (revisit if email+password friction proves too high for WhatsApp-only members).
- **AUTH-FUT-02**: Self-service password reset via email (requires transactional email delivery infra — not present today; **Key Decision for MA1**).

### Push (deferred types)

- **NOT-FUT-01**: Waitlist-spot-open, cancellation alerts, free-push reactivation campaigns (the spine built in v2.3 makes these cheap later).

## Out of Scope

| Feature | Reason |
|---------|--------|
| "Member vs teacher/staff" role toggle on the login screen | Industry norm is auto-detect post-login; the app should feel like a pure member app to the 99% who are members |
| Two separate apps (member app + staff app) | Solo-dev scope; one Expo binary with server-side role routing is the deliberate divergence |
| react-native-web member target | Native iOS/Android only this milestone; `expo-secure-store` is a no-op on web and push doesn't apply — web adds auth/storage edge cases |
| Better-auth org roles / `member` org-join for app roles | Heavier; demo doesn't seed org `member` rows; two env allowlists + member fallback is simpler and sufficient |
| Auto-creating a `gym_members` row on unmatched login | Security + data-integrity; the Stripe paywall is the membership gate, purchase creates/links the record |
| Teacher access to the AI agent | Teachers run sessions; the AI ops surface is admin-only by design |
| New CRM / member pipeline | Members already enter via lead/WhatsApp/form/Stripe; this milestone adds a login + surfaces, not a new pipeline |
| Auth migration / reshaping identity tables | No migration — reuse existing `user`/`session`/`account`; only additive `push_tokens` + the existing nullable `gym_members.user_id` |

## Traceability

Phases assigned by the roadmapper (prefix `MA`). 22/22 requirements mapped, no orphans, no duplicates.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | MA1 | Complete |
| AUTH-02 | MA1 | Complete |
| AUTH-03 | MA1 | Complete |
| AUTH-04 | MA1 | Complete |
| AUTH-05 | MA1 | Complete |
| AUTH-06 | MA1 | Complete |
| AUTH-07 | MA1 | Pending |
| MEM-01 | MA2 | Pending |
| MEM-02 | MA2 | Pending |
| MEM-03 | MA2 | Pending |
| MEM-04 | MA2 | Pending |
| MEM-05 | MA2 | Pending |
| TCH-01 | MA3 | Pending |
| TCH-02 | MA3 | Pending |
| TCH-03 | MA3 | Pending |
| AI-01 | MA4 | Complete |
| AI-02 | MA4 | Complete |
| AI-03 | MA4 | Complete |
| NOT-01 | MA5 | Pending |
| NOT-02 | MA5 | Pending |
| NOT-03 | MA5 | Pending |
| NOT-04 | MA5 | Pending |
