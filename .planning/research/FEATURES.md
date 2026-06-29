# Feature Research

**Domain:** Boutique fitness / studio-management mobile app — production auth foundation serving 3 roles (member / teacher / admin) on one Expo app
**Researched:** 2026-06-29
**Confidence:** MEDIUM-HIGH (HIGH on member booking + notifications + check-in mechanics, which are mature and well-documented across Mindbody / Glofox / Mariana Tek / PushPress / Walla / F45; MEDIUM on the one-app-multi-role login UX, where the industry norm is actually *two separate apps* — see anti-feature note)

> **Scope discipline (read first).** This milestone (v2.3) is a **production auth foundation**, not a feature-completeness race against Mindbody. The competitor analysis below maps the *whole* domain so you can see where the line is. The MVP section is ruthless about what the foundation actually needs. Most differentiators here are explicitly **DEFER**. The one feature that justifies the entire milestone — and is unique vs every competitor — is the **in-app admin AI ops agent** (no competitor ships a real conversational ops agent on mobile yet; PushPress and Walla are the closest and only announced it in 2025/2026).

---

## The single most important framing finding

**Every major competitor ships TWO apps, not one app with a role toggle.** PushPress = "Members App" + "Staff App". Mariana Tek = consumer booking app + "Biz App" for staff. Mindbody = the consumer Mindbody app + a separate business/"Mindbody Business" surface. The industry has converged on *separate binaries per audience* because members and staff have almost no overlapping screens and bundling them bloats the consumer app and confuses store reviewers.

**The milestone deliberately does ONE app with server-side role routing at login.** That is a legitimate, defensible choice for a solo dev with one customer (one binary to build, one EAS pipeline, one auth flow), but it is **not the table-stakes pattern** — so the bar is: the login screen must *not* expose role complexity to members. Members are ~99% of users; the app must feel like a pure member app to them, with teacher/admin surfaces appearing only after the server says so. Do **not** put a "member / staff" segmented toggle on the login screen (anti-feature below).

---

## Feature Landscape

### Category 1 — Auth / Role selection / login UX

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Email/password login (Better-auth) | Baseline for any account-gated app | MEDIUM | Better-auth client in React Native is **new territory** for this codebase (flagged in PROJECT.md). Tokens in `expo-secure-store`, never AsyncStorage. |
| **Role auto-detected post-login, not chosen by the user** | Members must never see "are you staff?". The server already knows: admin = email in `RUNSTUDIO_OPERATOR_EMAILS`, teacher = staff allowlist, else member. | LOW (server) / MEDIUM (client routing) | Correct pattern AND matches the milestone design. Login screen identical for all 3 roles; the post-login redirect differs. |
| **Member claim-by-email** (link Better-auth `user` → existing `gym_members` row) | The studio already has the member in `gym_members` (from bookings/WhatsApp/Stripe). Members expect their history/passes to "already be there", not to start empty. Universal competitor pattern: "member invite email → claim your account." | MEDIUM | `user_id` nullable FK already in schema. On first login, match by verified email; if a `gym_members` row exists, link it. **Edge case:** Better-auth account email ≠ gym_members email (member signed up with a different address). Provide a fallback claim path (phone match / staff-assisted link). |
| Logout + session refresh | Baseline security hygiene | LOW-MEDIUM | Token refresh on app foreground; clear secure-store on logout. |
| Password reset / forgot password | Users forget passwords; no reset = support tickets | LOW | Better-auth provides this; needs an email sender wired. **Flag:** the studio's only member channel today is WhatsApp — may need a magic-link or WhatsApp-OTP alternative to email. |
| Persistent session (stay logged in) | Nobody re-logs into a fitness app daily | LOW | `expo-secure-store` persistence; default once tokens are stored. |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Passwordless / magic-link or WhatsApp-OTP login | Members live in WhatsApp with this studio; a password is friction. OTP-over-WhatsApp would be on-brand and cut drop-off. | MEDIUM-HIGH | **DEFER** — depends on the WhatsApp send chokepoint + a login-OTP template (Meta approval lead time). Email/password is the safe v1. |
| Social login (Apple/Google) | Apple sign-in is **required by App Store review if you offer any other social login**; otherwise optional | MEDIUM | **DEFER unless** you add Google/Facebook. If v1 is email/password only, no Apple-login obligation. Note for the EAS build phase. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **"Member vs Staff" toggle on the login screen** | Feels honest about the 3 roles | Members (99% of users) shouldn't see staff exists; it leaks the internal model, looks unfinished, invites support questions. Competitors solve this with *separate apps*, not a toggle. | One identical login screen; **server decides the role** and the client routes post-auth. |
| **In-app role switching** ("I'm both teacher and member") | A teacher might also take classes | Real but rare; a v1 trap that adds a role-context switcher to every screen. | One primary role per account for v1 (admin > teacher > member precedence). Defer dual-role until a real teacher asks. |
| Separate signup form re-collecting member data | "New users need to register" | Re-collecting name/phone creates a duplicate `gym_members` row + reconciliation mess (codebase already has a documented dual-unique-key upsert gotcha). | Claim-by-email links to the existing row. Create a row only if no match — and minimal fields. |

---

### Category 2 — Member booking + Stripe paywall

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Browse schedule + book a class | Core member action; `/api/m/bookings` already exists | LOW-MEDIUM | Endpoint exists; this milestone wires the authed UI to it. |
| **Unpaid → routed to purchase before booking completes** | Universal across Mindbody/Glofox/Mariana Tek: no valid pass/membership = booking blocked, user sent to buy. | MEDIUM | Decision point: active pass? If not, route to Stripe (`create-checkout-link` / `/api/m/purchase` already exist) for a pack or membership, then complete the booking. **Pass-debit happens on booking, not purchase** — keep that ledger correct. |
| Buy a class pack / membership in-app | Members expect self-serve purchase | MEDIUM | Reuse existing Stripe flow. **App Store note:** selling an in-person service (a gym class) does NOT require Apple IAP — Stripe is allowed (the standard fitness exemption). Note in the review-prep phase. |
| Cancel a booking | Plans change; non-cancellable bookings feel hostile | LOW-MEDIUM | Cancellation **restores the pass debit** if within policy window. |
| View my upcoming + past bookings | "What did I book / where do I go" | LOW | Read from existing bookings. |
| View my passes / membership status / credits remaining | Members need to know if they can book | LOW-MEDIUM | Read from `passes`. |
| Booking confirmation feedback (immediate) | A booking that doesn't visibly confirm feels broken | LOW | Optimistic UI per AGENTS.md; confirm in-app + push. |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Waitlist with auto-promotion** | Automated waitlists hit ~95% fill vs ~71% industry average — genuinely how boutique studios make money on popular classes | HIGH | **DEFER to v1.x.** Needs a waitlist data model + auto-promote job (cancel → notify next → confirm-window timer → cascade) + push. The push pipeline (this milestone) is a prerequisite. Big lift; not foundation. |
| Cancellation window + late-cancel/no-show policy | Standard 12–24h window; fees $5–$25 (F45 $15 late / $20 no-show). Protects fill rate + revenue. | MEDIUM-HIGH | **DEFER fee enforcement to v1.x.** v1 foundation can enforce the *window* (free cancel or not) + restore the pass debit + *flag* late cancels. Charging a fee touches Stripe + member trust + studio config. Window logic = MEDIUM; fee charging = the hard part. |
| Spot/spot-map selection (pick your bike/reformer) | Mariana Tek signature; expected in cycling/reformer studios | HIGH | **DEFER / likely out of scope** unless HUSTLE's classes are spot-based. |
| Book for a friend / guest pass | Brings new leads in | MEDIUM | **DEFER.** Growth lever, not foundation. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| In-app card entry / storing card details | "Pay without leaving" | PCI scope explosion; project constraint = **card data only ever in Stripe** | Stripe Checkout link / hosted sheet; tokenised IDs only (already locked) |
| Complex multi-pass selection UI at booking time | "Members have different pass types" | Decision paralysis at the booking moment | Auto-select the valid pass; only prompt to purchase when *none* is valid |
| Apple IAP for class purchases | "App Store requires it" | False for in-person services; would cost 15–30% and break the Stripe-direct model | Stripe is permitted for in-person/physical-service purchases. Document in the review-prep phase. |

---

### Category 3 — Teacher / instructor check-in

#### Table Stakes (the minimum viable instructor surface)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Today's classes (my schedule)** | Instructor opens the app for "what am I teaching, who's coming" | LOW-MEDIUM | Filter the existing schedule to the logged-in teacher. Teacher identity linking is part of the milestone's AUTH scope. |
| **Class roster (who's booked)** | Core instructor need: the attendee list for a class | LOW-MEDIUM | Read bookings for the occurrence; show member name (+ cheap context like first-timer if available). |
| **Tap-to-check-in / mark attended** | The single most-used instructor action across PushPress/Mariana Tek staff apps | MEDIUM | Drives the existing `mark-booking-attended` chokepoint (no UI today, deferred per D-11, built here). **Note:** this same action fires the Meta "Schedule"/attendance lifecycle event — attendance is already load-bearing in the v2.2 pipeline. The mobile UI calls the existing chokepoint, not a new write path. |
| Mark no-show | Distinguishing "didn't come" from "not yet checked in" matters for fill-rate analytics + future fee policy | LOW-MEDIUM | A booking status; keep it a simple toggle alongside check-in for v1. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Add a walk-in (member not booked) | Real studios have drop-ins | MEDIUM-HIGH | **DEFER to v1.x.** Needs member-search-on-mobile + create-booking-then-attend + a pass/payment decision. Minimum surface is check-in of *booked* members. |
| Member context at a glance (first class? milestone? note?) | Lets the instructor give a personal welcome — boutique studios live on this | MEDIUM | **DEFER but cheap-ish.** "First visit" badge from booking history is low-cost / high-charm; deeper context (injuries/notes) is a member-data exposure decision. Start with just the name. |
| Kiosk / self-check-in mode | PushPress ships kiosk mode for front desk | HIGH | **Out of scope.** Different device + auth model. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Giving teachers any AI surface | "Consistency across roles" | Milestone is explicit: **teachers get NO AI.** AI ops is admin-only; a teacher AI is undefined scope + a security surface | Teacher app = schedule + roster + check-in. Full stop. |
| Letting teachers edit schedule / members | "They're staff" | Teachers don't need (and shouldn't have) write access to the catalog or member PII; blast-radius + gated-action model | Read schedule + write attendance only. Catalog/member writes stay admin. |
| Payment collection at check-in | "Walk-in needs to pay" | Couples check-in to Stripe; turns the simplest action into a payment flow | Defer with walk-ins. v1 check-in = attendance only. |

---

### Category 4 — In-app AI assistant for studio owners/admins

> **This is the milestone's true differentiator.** As of 2025–2026, PushPress ("PushPress AI Assistant") and Walla ("built-in AI automations") are the only major platforms even *announcing* conversational ops AI, and 2026 trend reporting frames "back-office AI / conversational data" as still-emerging, not table-stakes. **No competitor ships a mature in-app mobile ops agent.** The owner agent already works on web here (`agent-chat.ts`); porting it to mobile is a real, defensible edge — and the driver (owners aren't at their desks; WhatsApp nudges cost Meta fees) is sound.

#### Table Stakes (for an admin AI surface to feel real)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Conversational chat to ask studio questions ("fill rate this week?", "who's at risk?") | The whole point; reuse the curated read tools | MEDIUM | Reuse `AgentSheet` shell + `agent-stream` SSE. New owner SSE endpoint loads the action registry + owner system prompt, authed via Better-auth session, wrapped in `runWithRequestContext({ userEmail, orgId })`. |
| Streaming responses (SSE) | A non-streaming agent feels frozen on mobile | MEDIUM | Already the pattern; the bespoke member agent already streams. Fork the SSE structure. |
| **Gated/Tier-3 actions filtered OUT of the mobile tool list** | Security: destructive/spend/send verbs stay web-only behind the noticeboard | MEDIUM | Endpoint must *filter* `send-template-to-members`, `create-checkout-link`, `cancel-occurrence`, `reschedule-occurrence`, `publish-form`. Exposes only non-gated reads + Tier-2 board authoring + direct class/content/trainer/member writes. **This filtering is the security boundary — get it right.** |
| Admin-only access (not teachers, not members) | The agent can write studio data | LOW | Role gate already established by login routing. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Push-driven "come look" deep-link into the agent thread | Replaces the paid-WhatsApp owner nudge with free Expo push that opens the conversation — the explicit milestone driver | MEDIUM | Depends on Notifications. The agent (or the daily-digest job) sends a push; tapping deep-links into the agent thread. This is the engagement loop that justifies real auth. |
| Voice input to the agent | Owners on the move; hands-free | MEDIUM | **DEFER.** Nice, not foundation. |
| Proactive insights / digest surfaced in-app | The owner-digest already exists (GOD daily digest) | LOW-MEDIUM | **DEFER to v1.x** but cheap — digest content already exists; rendering it in the admin home is a small add once auth + push land. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Exposing gated Tier-3 verbs on mobile | "Full parity with web" | Lets a phone (more easily lost/unlocked) trigger member-wide sends, refunds, schedule cancels with no noticeboard review | Filter them out at the endpoint. Gated verbs stay web-only by design. |
| A second, separate agent harness for mobile | "Mobile is different" | Two agent runtimes to maintain; drift between web and mobile tool behavior | Reuse the registry + owner prompt; the mobile endpoint is a thin SSE fork, not a new brain. |
| Member-facing AI and admin AI sharing one endpoint | "It's all the agent" | The member already has a bespoke 3-tool coach loop; merging risks leaking owner tools to members | Keep them separate endpoints, separate tool sets, separate auth gates (member coach vs admin ops). |

---

### Category 5 — Push notifications

> **Table-stakes by audience.** Across every competitor, push is the retention engine. The good news: Expo push is free and unlimited (the explicit cost win vs paid WhatsApp). The hard part is the *triggers*, not the delivery.

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Register a push token per authenticated user** | Prerequisite for everything else; no token = no push | MEDIUM | New territory: Expo push (APNs/FCM via EAS), token tied to the Better-auth session, store per user. iOS build gated on the Apple Dev account (per STATE.md). |
| Booking confirmation push (member) | A booking with no confirmation feels broken; universal | LOW-MEDIUM | Fire on successful booking. |
| Class reminder push (member, e.g. T-2h / morning-of) | The #1 no-show reducer; every platform ships it | MEDIUM | Needs a scheduled job per booking (pg-boss). Reminder timing is studio-config-y; pick a sane default. |
| Tap-to-deep-link (push opens the right screen) | A push that opens app home instead of the relevant class/thread feels cheap | MEDIUM | Member booking/reminder taps → the class; admin "come look" → the agent thread. Deep-linking from push is new territory (flagged in PROJECT.md). |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Admin "come look" push → agent thread** | The milestone's engagement loop; free push replacing paid WhatsApp owner nudges | MEDIUM | Highest-value non-member push. Pairs with the daily owner-digest job that already exists. |
| Waitlist-spot-available push (member) | Powers the auto-promote waitlist (the 95%-fill lever) | MEDIUM | **DEFER with waitlist.** The push pipeline built here is the prerequisite; the waitlist itself is v1.x. |
| Cancellation / class-changed push (member) | When a studio cancels/reschedules, members must be told | LOW-MEDIUM | **DEFER to v1.x** but high-value; reuses the same push spine. |
| Re-engagement / "we miss you" push (member) | Dormant-member reactivation already exists as the GOD WhatsApp heartbeat | LOW (content exists) | **DEFER.** Moving reactivation from paid WhatsApp to free push for app-installed members is a real cost win — but an optimization, not foundation. |
| Milestone / streak push ("your 50th class!") | Boutique studios run on this kind of delight | LOW-MEDIUM | **DEFER.** Pure charm, v2. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Marketing-blast push without preference controls | "Reach everyone for free" | Push fatigue = uninstalls = losing the channel; app-store policy risk | Transactional push first (booking/reminder/come-look). Add per-type opt-out before any marketing push. |
| Push as a *replacement* for WhatsApp opt-in compliance | "Push is free, skip the gates" | Push and WhatsApp are different channels; the WhatsApp opt-in/24h/template gates still govern WhatsApp sends | Push is additive. The WhatsApp chokepoint rules are untouched. |
| Notifications with no quiet hours / no batching | "Send immediately always" | 6am reminders, midnight come-looks → uninstalls | Respect studio timezone + sane send windows (the digest jobs already do tz-aware scheduling). |

---

## Feature Dependencies

```
[Better-auth login in Expo]  (the one-way door — build first)
    ├──requires──> [expo-secure-store token storage]
    ├──requires──> [server-side 3-way role routing]
    └──enables───> EVERYTHING below

[Member claim-by-email]
    └──requires──> [Better-auth login]   (need a verified user to link)

[Member booking + Stripe paywall]
    ├──requires──> [Better-auth login]    (must know who is booking)
    ├──requires──> [Member claim-by-email] (booking debits THIS member's pass)
    └──reuses────> existing /api/m/bookings + create-checkout-link + /api/m/purchase

[Teacher check-in]
    ├──requires──> [Better-auth login + teacher identity linking]
    └──drives────> existing mark-booking-attended chokepoint (no new write path)

[Admin AI ops agent]
    ├──requires──> [Better-auth login + admin role gate]
    ├──requires──> Tier-3 gated-action FILTER at the endpoint
    └──reuses────> AgentSheet + agent-stream SSE + action registry + owner prompt

[Push notifications]
    ├──requires──> [Better-auth login]    (token registered per authed user)
    ├──enhances──> [Member booking]       (confirmations + reminders)
    └──enhances──> [Admin AI agent]       ("come look" deep-link)

[Waitlist auto-promote]  (v1.x, NOT this milestone)
    └──requires──> [Push notifications] + a new waitlist data model + an auto-promote job

[Late-cancel/no-show FEES]  (v1.x, NOT this milestone)
    └──requires──> [cancellation window logic] + Stripe charge path + studio policy config
```

### Dependency Notes

- **Auth is the root dependency and the one-way door.** Build it real (Better-auth + `expo-secure-store`), correctly, first. Every other feature is gated on it. Security-sensitive; no shortcuts.
- **Claim-by-email gates correct member booking.** Booking debits a pass *on the member's `gym_members` row*; if the Better-auth user isn't linked to that row, the debit is wrong or orphaned. Link before letting them book against a pass.
- **Check-in reuses an existing chokepoint, not a new write.** `mark-booking-attended` already exists and already fires the Meta Schedule lifecycle event. The teacher UI is a *caller*, not a new attendance system. This keeps the v2.2 tracking pipeline intact.
- **Push is the prerequisite for the highest-value DEFERRED features** (waitlist auto-promote, cancellation alerts, free-push reactivation). Building the push *spine* now (token registration + deep-link routing + one or two transactional types) unlocks them cheaply later — so push is worth doing in this milestone even though most push *types* are deferred.
- **Tier-3 action filtering is a hard security boundary, not a nicety.** The mobile admin endpoint must structurally exclude gated verbs; a missing filter = a lost phone can blast members / refund / cancel classes.

---

## MVP Definition

### Launch With (v2.3 — the production foundation)

Ruthless minimum. Each item is justified by "the foundation is incomplete without it."

- [ ] **Better-auth login in Expo + `expo-secure-store` + session refresh/logout** — the one-way door; nothing works without it.
- [ ] **Server-side 3-way role routing** (admin allowlist / teacher allowlist / member fallback) — defines what each user sees; no login-screen role toggle.
- [ ] **Member claim-by-email** linking `user` → existing `gym_members` row — without it, member booking/passes are wrong.
- [ ] **Member: book a class + unpaid→Stripe gate** — the core member action and the explicit paywall requirement; reuses existing endpoints.
- [ ] **Member: view upcoming/past bookings + pass status** — a booking app that can't show your bookings is broken.
- [ ] **Teacher: today's schedule + class roster + tap-to-check-in (attended/no-show)** — the minimum viable instructor surface; drives `mark-booking-attended`.
- [ ] **Admin: in-app AI ops agent (non-gated verbs only, Tier-3 filtered out)** — the milestone's differentiator and cost-saving driver.
- [ ] **Push: register token per authed user + booking confirmation + class reminder + admin "come look" deep-link** — the push *spine* + the 2–3 transactional types that close the loop.

### Add After Validation (v1.x — next increments, push-spine already in place)

- [ ] **Waitlist with auto-promotion + waitlist-available push** — trigger: popular classes filling up; biggest revenue lever (95% vs 71% fill). Highest-value deferred item.
- [ ] **Cancellation window enforcement + late-cancel/no-show flagging** (window logic first, *fees* later) — trigger: studio asks to curb no-shows.
- [ ] **Walk-in / add-unbooked-member at check-in** — trigger: instructors report drop-ins they can't record.
- [ ] **Cancellation / class-changed push** — trigger: first time the studio cancels a class and members aren't told.
- [ ] **First-visit / member-context badge on the roster** — trigger: instructors want to personalise the welcome.
- [ ] **In-app owner digest surface** (reuse existing GOD digest content) — trigger: owner wants insights without WhatsApp.

### Future Consideration (v2+)

- [ ] **Late-cancel/no-show *fee charging* via Stripe** — defer: touches Stripe + member trust + per-studio policy config; needs deliberate policy design.
- [ ] **Passwordless / WhatsApp-OTP login** — defer: needs a login OTP template + Meta approval; measure password-login friction first.
- [ ] **Free-push member reactivation** (move GOD heartbeat from paid WhatsApp to push for app-installed members) — defer: optimization once push adoption is proven.
- [ ] **Dual-role accounts (teacher who also books)** — defer: until a real teacher asks.
- [ ] **Spot/spot-map selection** — defer / likely out of scope unless HUSTLE classes are spot-based.
- [ ] **Voice input to the admin agent; streak/milestone delight push** — defer: charm, not foundation.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Better-auth login + secure-store + role routing | HIGH | HIGH (new RN territory) | P1 |
| Member claim-by-email | HIGH | MEDIUM | P1 |
| Member booking + unpaid→Stripe gate | HIGH | MEDIUM | P1 |
| Member: my bookings + pass status | HIGH | LOW | P1 |
| Teacher: schedule + roster + check-in | HIGH | MEDIUM | P1 |
| Admin AI ops agent (Tier-3 filtered) | HIGH (differentiator) | MEDIUM-HIGH | P1 |
| Push spine + booking/reminder/come-look | HIGH | MEDIUM-HIGH (new RN territory) | P1 |
| Waitlist auto-promotion + push | HIGH | HIGH | P2 |
| Cancellation window enforcement | MEDIUM | MEDIUM | P2 |
| Walk-in check-in | MEDIUM | MEDIUM | P2 |
| Cancellation/class-changed push | MEDIUM | LOW-MEDIUM | P2 |
| Late-cancel/no-show fees | MEDIUM | HIGH | P3 |
| WhatsApp-OTP login | MEDIUM | MEDIUM-HIGH | P3 |
| Free-push reactivation | MEDIUM | LOW-MEDIUM | P3 |
| Dual-role / spot selection / voice | LOW | MEDIUM-HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | Mindbody / Glofox | Mariana Tek / PushPress | Our Approach (v2.3) |
|---------|-------------------|-------------------------|---------------------|
| App structure | Separate consumer app + business app | **Two apps: Members App + Staff/Biz App** | **One app, server-side role routing** (deliberate solo-dev choice; member experience must hide staff entirely) |
| Member signup | Member invite email → claim account | Same (invite/claim) | **Claim-by-email** to existing `gym_members` (matches industry norm) |
| Unpaid booking | Blocked → buy pack/membership first | Same | Unpaid → Stripe checkout, then book |
| Waitlist | Auto-notify next, timed confirm window | Auto-promote up to ~1h before class (F45 pattern) | **Defer to v1.x** (push spine built now as prerequisite) |
| Cancellation policy | 12–24h window, $5–$25 fees | F45: $15 late / $20 no-show | **Window logic v1.x; fees v2** |
| Instructor check-in | Roster + check-in in business app | PushPress Staff App: manage classes, check-in (manual or kiosk), member notes | **Roster + tap-to-check-in/no-show** (kiosk out of scope) |
| Owner AI assistant | None mature | PushPress AI Assistant (2025/26); Walla AI automations | **In-app ops agent reusing web `agent-chat.ts`** — our clearest edge; none ship a mature mobile ops agent |
| Push notifications | Booking/reminder/waitlist/re-engagement | Same + milestones/streaks | **Spine + booking/reminder/come-look in v1**; rest deferred |

---

## Sources

- [PushPress — 10 Best Member Apps for Gyms and Fitness Studios in 2026](https://www.pushpress.com/blog/10-best-member-apps-for-gyms-and-fitness-studios-in-2026) (separate Members App + Staff App; check-in/kiosk; member invite/claim)
- [Mindbody — Staff Management Features](https://www.mindbodyonline.com/business/staff-management) (role/permission tiers: owner/admin, manager, front-desk, instructor)
- [Mariana Tek — Group Fitness Studio Software](https://www.marianatek.com/group-fitness-studio-software/) (Biz App: roster, waitlist, spot swap, guest reservations)
- [Glofox — Best Fitness Class Booking Apps 2026](https://www.glofox.com/blog/fitness-class-booking-app/) and [Health & fitness club membership software](https://www.glofox.com/health-fitness-club-software/) (member booking/payments/check-in/notifications; branded member app)
- [Walla — Fitness Studio Software](https://www.hellowalla.com/) and [San Diego Business Journal — Walla profile](https://www.sdbj.com/technology/software/walla-bolsters-financial-fitness-of-fitness-studios/) (built-in AI automations)
- [Replify — Best AI for Gyms 2026 Buyer's Guide](https://www.replify.ai/ai-sales-service-blog/best-ai-for-gyms-complete-buyers-guide) and [Nutripy — Fitness Studio Technology Trends 2026](https://nutripy.io/blog/fitness-studio-technology-trends) (back-office/conversational AI as emerging, not table-stakes; PushPress AI-first framing)
- [F45 Parkdale — Waitlist & Late Cancel/No-Show Policy](https://medium.com/@parkdale_87263/f45-parkdale-how-the-waitlist-system-works-cancellation-no-show-policy-updates-ddb3d85ab220) (auto-add from waitlist up to 1h before; $15 late / $20 no-show)
- [Glofox — How to Reduce No-Show Appointments](https://www.glofox.com/blog/how-to-reduce-no-show-appointments/) and [ORHUK — Waitlist Management](https://orhuk.com/blog/fitness-studio-waitlist-management) (12–24h windows; 15–30min confirm windows; 95% vs 71% fill)
- [Gymdesk — Member App](https://gymdesk.com/features/member-app), [Gymflow — Members App](https://www.gymflow.io/solutions/mobile-apps) (member invite/claim, account/payment management, branded app)
- [Virtuagym — How to Reduce No Shows](https://business.virtuagym.com/blog/-how-to-reduce-no-shows-at-fitness-classes/), [WellnessLiving — Stop No-Shows](https://www.wellnessliving.com/blog/stop-no-shows-proven-tactics-for-fitness-studios/) (reminder push as primary no-show reducer)

---
*Feature research for: boutique fitness multi-role mobile app (member/teacher/admin production auth foundation)*
*Researched: 2026-06-29*
