# Feature Landscape: v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher

**Domain:** Operator HQ console + zero-touch provisioning + per-studio brain/dispatcher + heartbeat reactivation
**Researched:** 2026-06-19
**Confidence:** HIGH for provisioning API capabilities (verified Neon/Vercel/Fly docs); HIGH for health-score/CS patterns (industry-standard); MEDIUM for AI content-generation workflow (emerging practice, agent-native templates observed not tested); HIGH for WhatsApp reactivation cadence (fitness-specific sources + existing GymClassOS worker constraints)

> **Scope:** NEW features only. Already shipped and excluded from this document: staff WhatsApp inbox, class schedule, member CRM, payments, analytics, forms, campaigns, Stripe Connect flows, worker pipeline (opt-in / 24h-window / template-approved), agentic tab editing. This file covers v2.0 only — the seven requirement categories HQ-FND, PROV, TEL, HQB, HQD, GOB, GOD.

---

## Requirement Category Mapping

| Code | What It Is | New vs Existing Foundation |
|------|-----------|---------------------------|
| **HQ-FND** | `apps/hq` shell — forked from agent-native Dispatch + Brain + Content + Video; own Neon; super-admin auth | Net-new app |
| **PROV** | Zero-touch self-serve provisioning of independent per-customer systems | Net-new orchestrator + APIs |
| **TEL** | Token-usage + engagement telemetry pushed up from each studio; no PII | Net-new pipeline |
| **HQB** | HQ Brain — model of gym-owner customers + installation health + cohorts | Net-new data model in `apps/hq` |
| **HQD** | HQ Dispatcher — Content + Video for GymClassOS website + WhatsApp to gym owners (product topics only) | Net-new dispatch in `apps/hq` |
| **GOB** | Gym-owner Brain in the studio deploy — studio brand/classes/ethos | Net-new in `apps/staff-web` |
| **GOD** | Gym-owner Dispatcher — daily digest + member heartbeat reactivation + activation nudges | Net-new in `apps/staff-web` + worker |

---

## 1. Self-Serve Provisioning (PROV)

### Table Stakes

Features a gym owner who clicks "Sign up" expects. Missing any = provisioning is broken or manual.

| Feature | Why Expected | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| **Signup form with studio details** | First touchpoint; captures studio name, owner name, email, WhatsApp number, subdomain choice | S | PROV | Static RR v7 page on GymClassOS marketing site; stores lead row in HQ Neon; does NOT trigger provisioning until email verified |
| **Email verification before provisioning starts** | Prevents bot signups from consuming Neon/Vercel quota; industry-standard gate | S | PROV | Better-auth magic link or OTP; only after click does the HQ orchestrator enqueue a provisioning job |
| **Fully automated infrastructure creation** | Modern SaaS — no "we'll set up your account in 1–2 business days" | L | PROV | HQ calls: Neon Management API (create project), Vercel API (create project + env vars + trigger deploy), Fly API (deploy edge-webhooks + worker machines); all three must succeed or the job rolls back |
| **Idempotent provisioning with retry** | API calls fail transiently; a retry must not double-create resources | M | PROV | Each step writes a `provisioning_steps` row in HQ Neon with status; job resumes from last successful step on retry. Neon/Vercel APIs support idempotency keys or name-collision detection |
| **Rollback on partial failure** | Half-provisioned tenant is worse than no tenant | M | PROV | If Fly deploy fails after Neon + Vercel succeed, the orchestrator must teardown the Neon project and Vercel project before surfacing an error to the owner |
| **Migration + seed run as part of provisioning** | New studio Neon needs the full schema + initial data (class templates, default WhatsApp templates) | M | PROV | Orchestrator runs `drizzle-kit migrate` via a short-lived ephemeral task (not a Fly machine — use Neon HTTP driver from HQ directly, pointing at the new project's connection string) |
| **Admin user created and credentials sent** | Owner needs a login to their new system | S | PROV | Orchestrator calls Better-auth's `createUser` against the new studio's staff-web app (or inserts directly into the new Neon), then emails a magic-link welcome message |
| **Real-time status/progress UI during provisioning** | Signup → blank waiting screen = abandonment | M | PROV | After form submit, show a progress page (Steps: Email verified → DB created → App deployed → Worker started → Done); poll HQ via `useDbSync` or SSE; each step updates as the orchestrator job progresses |
| **Post-provisioning welcome + setup checklist** | Owner lands in their new system and knows what to do next | S | PROV | Static onboarding checklist rendered on first login: Connect your WhatsApp number → Add your first class → Invite your team. Powered by agent-native `onboarding` skill — register steps in the studio staff-web app |
| **Telemetry token issued at provisioning time** | Studio needs a signed token to authenticate its telemetry pushes to HQ | S | PROV | HQ generates a per-studio JWT (or opaque token), stores the secret in HQ Neon `studio_telemetry_tokens`, and sets it as an env var in the studio's Vercel + Fly apps at provisioning time |
| **Subdomain / custom domain routing** | Each studio needs `studiox.gymclassos.com` or their own domain | M | PROV | Vercel API supports programmatic domain assignment; add subdomain pointing at the new Vercel project; custom CNAME support deferred to v2.x |

### Differentiators

| Feature | Value Proposition | Complexity | Category | Notes |
|---------|-------------------|------------|----------|-------|
| **Provisioning ETA display** | "Your studio will be ready in ~3 minutes" — sets expectation, reduces anxiety | S | PROV | Based on p90 provisioning time from telemetry; static estimate for v2.0 |
| **WhatsApp number pre-validation during signup** | Catches invalid numbers before provisioning commits | S | PROV | E.164 Zod validation on the signup form; warn if number format looks wrong |
| **Trial tier with feature flag** | First 14 days free, then billing kicks in — without blocking provisioning | M | PROV | `trial_ends_at` column on the `studios` HQ table; feature-flag check in staff-web routes reads from env var set at provisioning time |
| **Provisioning webhook to HQ Brain** | As soon as provisioning completes, HQ Brain is seeded with the new studio's initial profile | S | HQ-FND + PROV | Orchestrator fires a `studio.provisioned` event after the job finishes; HQB processes it to create the initial Brain entity for this customer |

### Anti-Features for PROV

| Anti-Feature | Why Avoid | What Instead |
|---|---|---|
| **Manual human step in provisioning** | Defeats the product promise; doesn't scale past 5 studios without a full-time ops person | Full API automation. If any API doesn't support what we need, that's a blocker to resolve before shipping PROV |
| **Shared Neon project / schema-per-tenant** | Violates the locked tenancy decision (single-tenant code, per-customer deploy); breaks "no `studio_id`" invariant | One Neon project per studio, always |
| **Email/password credentials emailed in plain text** | Security and deliverability risk | Better-auth magic link — owner clicks link, sets password on first login |
| **Provisioning on the same Vercel/Fly infra as the HQ app** | HQ failure takes down provisioning; HQ should be the control plane, not the runtime | Each studio gets independent Vercel + Fly apps; HQ only orchestrates |
| **Multi-region Fly app per studio in v2.0** | Operational complexity; premature for one studio → dozens of studios | Single-region Fly app per studio; multi-region is a v3+ concern |

---

## 2. HQ Foundation (HQ-FND)

### Table Stakes

| Feature | Why Expected | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| **`apps/hq` app shell** | HQ needs its own app with its own auth context, isolated from studio staff-web | M | HQ-FND | Fork agent-native Dispatch + Brain templates into `apps/hq`; own Neon project (NOT a studio Neon); single super-admin login via Better-auth email/password |
| **Studio registry (list of all provisioned studios)** | Operator needs to see all customers in one place | S | HQ-FND | `studios` table in HQ Neon: id, name, owner_email, owner_whatsapp, subdomain, provisioned_at, trial_ends_at, status (trial / active / suspended / churned) |
| **Single super-admin login** | Only the operator (you) should access HQ | S | HQ-FND | Better-auth email/password; auth allowlist in env var; no self-serve signup on HQ |

### Differentiators

| Feature | Value | Complexity | Category | Notes |
|---------|-------|------------|----------|-------|
| **HQ agent with gym-owner context** | Ask "which studios haven't sent a WhatsApp this week?" — agent queries TEL data | M | HQ-FND | Register HQ-specific agent actions: `list-studios`, `get-studio-health`, `list-at-risk-studios`. Agent system prompt knows it's the operator console |

### Anti-Features for HQ-FND

| Anti-Feature | Why Avoid | What Instead |
|---|---|---|
| **Multi-user HQ access (roles, team, sharing)** | Solo operator in v2.0; zero ROI on the auth complexity | Single super-admin. Revisit when a second person needs access |
| **HQ accessing a studio's Neon directly** | Breaks the PII isolation guarantee; security/compliance nightmare | TEL pipeline pushes aggregate data up; HQ never queries studio DB |

---

## 3. Telemetry Pipeline (TEL)

### Table Stakes

| Feature | Why Expected | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| **AI token usage instrumentation per studio** | Operator needs to know cost attribution per studio for billing/pricing decisions | M | TEL | Each studio's agent actions wrap `Anthropic SDK` calls and record `{ input_tokens, output_tokens, model, action_name, timestamp }` into a local `agent_token_usage` table (additive migration in studio Neon); worker pushes aggregate totals to HQ on a daily schedule |
| **Mobile engagement metrics per studio** | Understand if members are actually using the mobile app | M | TEL | `{ daily_active_users, weekly_active_users, sessions_per_user_7d, feature_views: { calorie_counter, class_booking, inbox } }` — aggregated client-side in the Expo app, pushed via a `/api/telemetry` endpoint in staff-web that accepts and stores locally, then worker rolls up and pushes to HQ |
| **Push cadence to HQ on a schedule** | Telemetry should be timely but not real-time | S | TEL | Daily pg-boss recurring job in studio worker; sends HTTP POST to HQ `/api/ingest-telemetry` with telemetry token in Authorization header |
| **HQ ingestion endpoint** | HQ must receive and store the pushed aggregate data | M | TEL | `POST /api/ingest-telemetry` on HQ app; validates token against `studio_telemetry_tokens`; upserts into HQ `studio_metrics` table: `{ studio_id, date, dau, wau, token_input, token_output, class_fill_rate, active_members, dormant_members }` |
| **Aggregate-only guarantee (no PII)** | Hard PII boundary — member names, emails, phones, conversations never leave the studio | M | TEL | Review TEL payload schema at design time; exclude any row-level member data; counts and rates only; lint check in code review to confirm no PII fields |

### Differentiators

| Feature | Value | Complexity | Category | Notes |
|---------|-------|------------|----------|-------|
| **WhatsApp send volume + template breakdown** | Operator can see if studios are using the WhatsApp feature or not | S | TEL | Add `whatsapp_sends_7d`, `whatsapp_templates_used` to the aggregate push; data lives in worker's `whatsapp_sends` audit log already |
| **Stripe revenue aggregate** | See MRR per studio without accessing their Stripe account | S | TEL | Sum of `stripe_payments.amount` per studio, pushed as aggregate — no individual transaction detail |

### Anti-Features for TEL

| Anti-Feature | Why Avoid | What Instead |
|---|---|---|
| **Real-time telemetry streaming** | Network overhead + cost; aggregate is sufficient for the operator's decision-making | Daily batch push |
| **Storing any member PII in HQ** | Violates the stated hard boundary; GDPR/data sovereignty risk if studios are in different jurisdictions | Aggregate counts only; no names, emails, phone numbers, messages |
| **HQ querying studio Neon directly** | Authentication complexity + security risk; breaks the single-tenant model cleanly | TEL push from studio to HQ; HQ never pulls |

---

## 4. HQ Brain (HQB)

### Table Stakes

Operator CS observability — what defines "is this customer getting value / at-risk of churn."

| Feature | Why Expected | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| **Studio health score** | Core operator CS signal: at a glance, which studios are healthy vs at-risk | M | HQB | Computed daily from TEL data: weighted composite of DAU trend, WhatsApp send rate, class fill rate, token usage, days since last owner login. Stored as `health_score` (0–100) in HQ `studio_metrics` |
| **Activation status tracking** | Did the owner actually connect WhatsApp + run their first class + have active members? | S | HQB | Three activation milestones stored as nullable timestamps in `studios`: `whatsapp_connected_at`, `first_class_at`, `first_active_member_at`. Computed from TEL data on ingest |
| **Cohort segmentation** | Group studios by health/lifecycle stage for targeted messaging | M | HQB | Rule-based cohorts computed from `studios` + `studio_metrics`: new (provisioned <30d), activating (provisioned >7d, not all milestones hit), healthy (health_score >70), at-risk (health_score <40 + declining trend), churned (status=churned) |
| **At-risk studio list** | Operator needs to know which studios to worry about today | S | HQB | Sorted query on `studio_metrics` for `health_score < 40` or `dau = 0 for 7d`; surfaced as the default view in HQB tab of `apps/hq` |
| **Per-studio timeline** | Chronological log of provisioning, activation milestones, telemetry anomalies, comms sent | M | HQB | `studio_events` table in HQ Neon: `{ studio_id, event_type, occurred_at, payload }`. Populated by: provisioning steps, TEL ingest anomalies, HQD sends |

### Differentiators

| Feature | Value | Complexity | Category | Notes |
|---------|-------|------------|----------|-------|
| **HQ agent with health context** | Ask "which studios haven't had a member book a class in 14 days?" and get an answer | M | HQB | `list-at-risk-studios` agent action queries `studio_metrics` with configurable thresholds; registered in HQ agent-chat |
| **Token cost per studio per month** | Pricing/billing insight: is the AI usage covered by the studio's plan? | S | HQB | Derived from TEL `token_input + token_output` × Anthropic pricing rates; displayed on studio detail page |

### Anti-Features for HQB

| Anti-Feature | Why Avoid | What Instead |
|---|---|---|
| **ML-based health scoring** | Overkill for <20 studios; model maintenance complexity | Weighted rule-based formula with explicit coefficients; easy to tune manually |
| **Real-time health score updates** | Not meaningful at hourly granularity; misleads more than it helps | Daily recompute on TEL ingest |
| **Gainsight / third-party CS platform** | Per-MAU pricing; vendor lock-in; integrating it with the single-tenant model is more work than building | Custom HQ Brain |

---

## 5. HQ Dispatcher (HQD)

### Table Stakes

| Feature | Why Expected | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| **WhatsApp messaging to gym owners** | Primary communication channel (they're gym operators; WhatsApp is their world) | M | HQD | Uses the HQ's own WhatsApp Business Account (NOT the studio's WABA — the studio's number is for member comms only). Sends only to `studios.owner_whatsapp`. Topics: product updates, feature announcements, provisioning status only. Routed through HQ's own Fly worker |
| **Approved templates for out-of-window sends** | HQD comms to gym owners are not always within 24h of their last inbound; same Meta rules apply | M | HQD | HQD must use approved templates for any send where the owner hasn't messaged GymClassOS in the last 24h. Template categories: feature announcements, onboarding nudges, activation reminders |
| **Onboarding nudge sequence** | Newly provisioned studios need guided prompts to reach activation milestones | M | HQD | Automated sequence triggered by provisioning event: Day 1 → "Connect your WhatsApp number"; Day 3 (if not connected) → follow-up; Day 7 (if no first class) → "Set up your first class"; Day 14 (if not activated) → "Need help?" Each message is a distinct pg-boss job scheduled by HQD at provisioning time |
| **Feature announcement broadcast** | Operator needs to tell all studios about new features | M | HQD | HQD action `broadcast-to-studios` takes a cohort filter + message draft; agent approves final template; job fan-out per studio via pg-boss |
| **AI-generated Content for GymClassOS website** | Operator needs fresh marketing content (blog posts, landing pages, case studies) | M | HQD | Uses agent-native Content template adapted into `apps/hq/features/content/`; agent drafts content informed by HQB insights ("Studios using the class fill-rate widget have 30% better retention"); operator reviews + publishes |
| **AI-generated Video for GymClassOS website** | Product demo / feature explanation videos | L | HQD | Uses agent-native Video template adapted into `apps/hq/features/video/`; likely text-to-video via an external AI API (Runway, Sora, etc.); requires API key + credit; operator reviews + publishes |

### Differentiators

| Feature | Value | Complexity | Category | Notes |
|---------|-------|------------|----------|-------|
| **Health-score-triggered messaging** | When a studio's health score drops below 40 for 3 consecutive days, HQD auto-proposes a "check in" WhatsApp to the owner | M | HQD | pg-boss recurring job checks `studio_metrics` for declining cohorts; creates a `propose-action` entry in HQ for the operator to approve before sending |
| **Content seeded from HQB insights** | Blog post about "how to improve class fill rate" is drafted using the actual fill-rate data from studios | M | HQD | HQD agent action pulls aggregate stats from HQB (anonymised — no studio-specific attribution in public content), passes as context to content-generation agent |
| **Usage-based activation prompts** | "You've had 3 enquiries this week but none have booked — try sending them a class schedule via WhatsApp" | M | HQD | Triggered by TEL anomaly detection: high form submissions + low bookings → activation nudge template |

### Anti-Features for HQD

| Anti-Feature | Why Avoid | What Instead |
|---|---|---|
| **HQD messaging gym members** | Hard PII boundary. HQD knows nothing about members. Member-facing comms are GOD's responsibility at Tier 2 inside the studio | HQD messages gym owners only, about product and system topics |
| **Automated sends without operator approval** | Out-of-24h sends using templates must not go out without the operator verifying the message is appropriate | All HQD sends (except simple onboarding nudges from pre-approved templates) go through the `propose-action` / `approve-proposal` pattern in `apps/hq` |
| **Email as primary channel to gym owners** | WhatsApp is already the owner's primary channel for their business; email is ignored | WhatsApp first; email as fallback for provisioning credentials only |
| **Sending product metrics to gym owners in WhatsApp** | Metrics in WhatsApp are hard to read; creates noise and training operators to ignore the messages | Send a daily digest link (URL to their staff-web analytics tab) if a digest is requested — not raw numbers in WhatsApp |

---

## 6. Gym-Owner Brain (GOB)

### Table Stakes

| Feature | Why Expected | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| **Studio knowledge base** | The gym-owner brain needs a structured representation of what this studio is | M | GOB | Agent-native Brain template adapted in `apps/staff-web/features/brain/`; seeded at provisioning with: studio name, location, class types, pricing, key policies |
| **Class catalog ingestion** | Brain must know the studio's class methods, instructors, timetable patterns to generate relevant comms | S | GOB | Brain reads from `class_definitions` (already exists) — no new table; Brain index includes class_name, description, default_capacity, category, active |
| **Brand voice / ethos document** | Informs the tone of GOD-generated member messages | M | GOB | A freeform text document stored in Brain (agent-native Brain `knowledge_items` table or equivalent); owner edits via the `apps/staff-web/features/brain/` UI; GOD's prompt includes it verbatim |
| **Studio FAQ / policies** | Cancellation policy, booking rules, class descriptions — feeds both the staff agent and member-facing comms | M | GOB | Same Brain `knowledge_items` store; agent-native Brain handles ingestion + RAG retrieval natively |

### Differentiators

| Feature | Value | Complexity | Category | Notes |
|---------|-------|------------|----------|-------|
| **Brain-aware staff agent** | When a staff member asks the inbox agent "what classes do we offer on Tuesdays?", agent queries GOB instead of just the schedule table — returns context-rich answer | M | GOB | Register a `search-studio-brain` action in `apps/staff-web`; agent-chat uses it when query is about studio identity, not operational data |
| **Automatic Brain update on class definition change** | When a class is renamed or a new class type added, GOB re-indexes without manual trigger | M | GOB | `class_definitions` mutation actions fire an event that GOB's background job detects and re-ingests; uses agent-native `automations` skill |

### Anti-Features for GOB

| Anti-Feature | Why Avoid | What Instead |
|---|---|---|
| **Member data in GOB** | GOB is about the studio's identity, not its members. Member context lives in the inbox agent's per-conversation context | GOB = studio/brand knowledge; member data = existing `gym_members` + conversations |
| **Internet-scraped content for GOB** | Web scraping the gym's website introduces stale / inaccurate information without the owner's review | Owner-controlled: owner inputs or reviews all Brain content |

---

## 7. Gym-Owner Dispatcher (GOD)

### Table Stakes

| Feature | Why Expected | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| **Daily studio digest to owner** | Gym owners want to know: what happened yesterday, what's coming today, what needs attention | M | GOD | Daily pg-boss job (configurable time, default 7am studio local time); generates a WhatsApp message to the gym owner via the studio's WABA; content: yesterday's class attendance, today's schedule, at-risk renewals, recent enquiries. Uses GOB brand voice. Must use a Meta-approved template |
| **Dormant member detection** | Define "dormant": member who has not attended a class or booked in N days (default 30) | S | GOD | SQL query: `gym_members` with no `bookings` (status=attended) in past 30 days AND `whatsapp_opt_in` exists AND not churned; result set = candidates for heartbeat campaign |
| **Heartbeat reactivation campaign — approved template send** | Regularly re-engage dormant members to pull them back | M | GOD | pg-boss recurring job (configurable cadence, default: every Monday); for each dormant member, enqueue a `send-template-to-members` job; all sends go through the EXISTING worker chokepoint (opt-in check + 24h-window + approved-template gate); no bypass |
| **Heartbeat suppression rules** | Must not spam dormant members repeatedly; suppression prevents alienating people who have genuinely left | M | GOD | Suppression table `heartbeat_suppression`: `{ member_id, suppressed_until, reason }`; reasons: `no_response_after_3_attempts`, `explicit_opt_out`, `subscription_cancelled`. Member is added to suppression after 3 sent-but-no-response attempts within 90 days; removed on next booking |
| **Activation layer — staff nudges** | Prompt the gym owner to use features they haven't discovered yet | M | GOD | Checks studio's activation milestones from TEL data (local copy); if `first_campaign_sent_at` is null and studio is >14 days old, GOD sends owner a nudge via WhatsApp: "You haven't sent a class reminder campaign yet — want me to draft one?" |
| **GOD send queue via existing worker** | All GOD sends go through the existing `apps/worker` pg-boss queue + chokepoint | S | GOD | GOD actions produce pg-boss jobs targeting the same `whatsapp_send` queue the worker already processes; zero new send infrastructure |

### Differentiators

| Feature | Value | Complexity | Category | Notes |
|---------|-------|------------|----------|-------|
| **Brand-voice heartbeat messages** | Member receives a reactivation message that sounds like the studio (warm, personal, specific to the class type they used to attend), not a generic "we miss you" | M | GOD | Agent generates heartbeat template text using GOB brand voice + member's last attended class type; output reviewed by gym owner via propose→approve before sending |
| **Time-of-day personalisation** | Send heartbeat at the time the member typically attended class (e.g. someone who always booked Saturday 9am receives their message Saturday morning) | M | GOD | Query `bookings.created_at` distribution per member to infer preferred day/time; schedule pg-boss job at that offset; fall back to studio default (Monday 9am) if insufficient history |
| **Three-attempt cadence with escalation** | Attempt 1: warm check-in; Attempt 2 (14 days later if no response): specific offer / class highlight; Attempt 3 (14 days later): "last message before we stop" | M | GOD | State tracked in `heartbeat_sends` table: `{ member_id, attempt_number, sent_at, responded_at }`. Worker advances attempt number per member on each send cycle |
| **Daily digest with agentic draft** | Owner doesn't manually compose the digest; the GOD agent drafts it, owner approves before it goes | M | GOD | GOD agent action reads schedule + bookings + at-risk members, drafts a WhatsApp-formatted digest, creates a `propose-action` in staff-web for owner one-tap approval; after approval, worker sends it |
| **Reactivation success tracking** | Know which heartbeat cohorts actually come back | S | GOD | When a dormant member books a class after a heartbeat send, record the causal attribution in `heartbeat_sends.reactivation_at`; surface as "reactivated this month: N" in the analytics tab |

### Anti-Features for GOD

| Anti-Feature | Why Avoid | What Instead |
|---|---|---|
| **Automated heartbeat without any owner visibility** | Owner doesn't know their studio is messaging members on their behalf; trust and compliance risk | All GOD sends: either pre-approved template auto-send (low-risk, owner toggled this on) OR propose→approve; never fully silent |
| **Bypassing the worker chokepoint** | The chokepoint (opt-in check + 24h-window + template-approved gate) is the only thing standing between the studio and Meta account suspension | GOD produces pg-boss jobs; worker processes them through the same chokepoint as all other sends |
| **Unlimited heartbeat attempts** | After 3 unanswered attempts over 90 days, the person has clearly churned; continued messaging risks opt-out complaints and Meta policy flags | 3-attempt limit; then `heartbeat_suppression` row; never message again until member returns on their own |
| **PII-rich heartbeat content ("Hi Sarah, we noticed you haven't attended since March 15th")** | Specific attendance data in WhatsApp messages could violate member expectations and GDPR legitimate-interest basis | Generic but warm: "Hi [first name], it's been a while since we've seen you at [studio name] — we'd love to welcome you back" — no specific dates or visit history in the message |
| **Multi-channel campaign engine (email, SMS, push)** | Out of scope for v2.0; adding channels before validating WhatsApp adds cost + operational complexity | WhatsApp only for v2.0. Multi-channel is a v3+ feature |
| **Segment-builder for heartbeat targeting** | Already deferred from v1 "multi-channel campaign engine"; heartbeat uses a fixed dormancy threshold, not a complex segment | Use the fixed "no booking in 30 days + opted-in" rule. The existing Campaigns segment builder (AE3) is for staff-manual campaigns; heartbeat is automated and doesn't need custom segmentation in v2.0 |

---

## Feature Dependencies

```
PROV → HQ-FND
  (PROV orchestrator lives inside `apps/hq`; HQ app must exist before PROV can run)

PROV → TEL token issuance
  (Telemetry token must be set at provisioning time)

TEL → HQB health score computation
  (HQB health scores are derived from TEL data; HQB is inert without TEL)

TEL → HQD health-score-triggered messaging
  (HQD can't detect at-risk studios without TEL data)

HQB → HQD content generation
  (HQD content is seeded from HQB insights; weak but real dependency)

GOB → GOD heartbeat message quality
  (GOD uses GOB brand voice in heartbeat drafts; GOD works without GOB but produces generic messages)

GOD → worker chokepoint (existing)
  (GOD produces pg-boss jobs; the worker chokepoint is ALREADY BUILT and must be used unmodified)

GOD daily digest → GOB class knowledge
  (Digest benefits from GOB's class descriptions; falls back to `class_definitions` table if GOB not seeded)

HQ-FND (own Neon + Better-auth) → all other HQ features
  (Nothing in HQ-FND's owned services can start until the HQ app and DB are running)
```

### Key Dependency Notes

- **PROV must ship before anything else** — it creates the per-studio systems that GOB and GOD run inside. HQ-FND is the container for PROV. Logical order: HQ-FND shell → PROV orchestrator → TEL pipeline → HQB → HQD → GOB + GOD.
- **GOD does NOT depend on GOB for v2.0** — GOD can send a generic digest + heartbeat without a GOB brand-voice document. GOB enhances quality but is not a blocker; build GOB and GOD in parallel.
- **TEL data won't exist on day one** — HQB and HQD must gracefully handle studios with no telemetry history (new provisions); health score defaults to "unknown" until first TEL push arrives.
- **Worker chokepoint is an existing hard dependency for GOD** — GOD MUST NOT circumvent it. This is non-negotiable.

---

## MVP Definition for v2.0

### Must ship (v2.0 launch criteria)

- [ ] **HQ-FND**: `apps/hq` shell with Neon + Better-auth super-admin login — blocker for everything else
- [ ] **PROV**: Neon + Vercel API automation with idempotent steps + rollback + progress UI — the product promise
- [ ] **PROV**: Email verification gate + telemetry token issuance at provisioning time
- [ ] **PROV**: Onboarding checklist in newly provisioned studio
- [ ] **TEL**: Token-usage instrumentation + daily push to HQ
- [ ] **TEL**: Studio engagement aggregate push (DAU/WAU, key feature views)
- [ ] **HQB**: Health score computed from TEL data; cohort segmentation (new / activating / healthy / at-risk)
- [ ] **HQB**: Studio list with health scores + at-risk flagging
- [ ] **HQD**: Onboarding nudge sequence (WhatsApp to owner, pre-approved templates, day 1/3/7/14)
- [ ] **GOB**: Brain shell + studio knowledge base UI; class catalog auto-ingestion
- [ ] **GOD**: Dormant member detection query
- [ ] **GOD**: Heartbeat reactivation send via existing worker chokepoint + suppression rules (3-attempt / 90-day)
- [ ] **GOD**: Daily digest to owner (propose→approve → send via WABA)

### Defer to v2.x (after v2.0 validation)

- [ ] **GOD**: Time-of-day personalisation for heartbeat — add after proving basic heartbeat works
- [ ] **GOD**: Three-attempt escalating cadence — v2.0 ships attempt 1 only; attempts 2 + 3 add after results measured
- [ ] **HQD**: AI-generated Content + Video for GymClassOS website — valuable but lowest priority; content can be written manually until v2.x
- [ ] **HQD**: Health-score-triggered automated messaging to at-risk studios — requires TEL data to stabilise first
- [ ] **PROV**: Custom domain / CNAME support per studio — subdomain is sufficient for v2.0
- [ ] **PROV**: Trial-tier feature flags — manual account management acceptable for first 5–10 signups
- [ ] **GOB**: Automatic Brain re-index on class definition change — manual refresh is acceptable for v2.0

### Defer to v3+ (product-market fit required first)

- [ ] Multi-channel campaigns (email, SMS, push) for member reactivation
- [ ] Self-service plan management and billing (Stripe integration for HQ billing to studios)
- [ ] Multi-user / role-based HQ access
- [ ] ML-based health scoring (replace rule-based)
- [ ] Multi-region Fly deployment per studio

---

## Feature Prioritisation Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| HQ-FND shell + auth | HIGH (blocker) | M | P1 |
| PROV: Neon + Vercel API automation | HIGH (the product promise) | L | P1 |
| PROV: Progress UI during provisioning | HIGH (abandonment prevention) | M | P1 |
| PROV: Idempotent steps + rollback | HIGH (correctness) | M | P1 |
| TEL: Token usage push | HIGH (cost attribution) | M | P1 |
| TEL: Engagement aggregate push | HIGH (health score input) | M | P1 |
| HQB: Health score + cohorts | HIGH (operator insight) | M | P1 |
| HQD: Onboarding nudge sequence | HIGH (activation rate) | M | P1 |
| GOD: Heartbeat reactivation + suppression | HIGH (member retention value prop) | M | P1 |
| GOD: Daily owner digest | MEDIUM (habit formation) | M | P1 |
| GOB: Brain shell + class catalog | MEDIUM (enhances GOD quality) | M | P2 |
| GOD: Three-attempt cadence | MEDIUM (optimises reactivation) | M | P2 |
| HQD: Content + Video generation | MEDIUM (marketing flywheel) | L-M | P2 |
| HQD: Health-score-triggered messaging | MEDIUM (proactive CS) | M | P2 |
| GOD: Time-of-day personalisation | LOW (marginal lift) | M | P3 |
| PROV: Custom domain support | LOW (nice UX) | M | P3 |

---

## Sources

Research sources consulted for this document:

- [Northflank: Multi-tenant SaaS platform deployment 2026](https://northflank.com/blog/multi-tenant-saas-platform-deployment) — single-tenant per-deploy automation patterns
- [Neon API-first programmatic provisioning](https://neon.com/docs/get-started/built-to-scale) — Neon Management API capabilities confirmed
- [ChurnBuster: B2B SaaS churn rate 2026](https://churnbuster.io/articles/b2b-saas-churn-rate) — health score signal selection
- [SaaS Hero: Reduce churn B2B SaaS 2026](https://www.saashero.net/customer-retention/reduce-b2b-saas-churn-2026/) — activation depth in first 60 days as primary retention predictor
- [buildmvpfast: Leading indicators of churn B2B SaaS 2026](https://www.buildmvpfast.com/blog/leading-indicators-churn-b2b-saas-2026) — login frequency, sticky-feature adoption, active-user-count as core health signals
- [WATI: WhatsApp API for SaaS — growth and retention](https://www.wati.io/en/blog/whatsapp-api-for-saas/) — WhatsApp lifecycle messaging patterns for B2B SaaS; 98% open rate statistic
- [Cloudstudio Manager: Reactivation campaigns for frozen/lapsed members 2026](https://cloudstudiomanager.com/reactivation-campaigns/) — fitness-specific dormant member cadence
- [Hashmeta: Reactivation campaigns — winning back lost customers](https://hashmeta.com/blog/reactivation-campaigns-winning-back-lost-customers-through-strategic-re-engagement/) — 3–5 touch suppression ceiling; 90-day cutoff
- [Keepme: WhatsApp integration for fitness operators](https://www.keepme.ai/connect/the-smartest-whatsapp-integration-for-fitness-operators/) — fitness studio WhatsApp automation, 18% reactivation rate via targeted vs 2% cold
- [Digital Applied: Customer win-back campaigns 2026 playbook](https://www.digitalapplied.com/blog/customer-win-back-campaigns-2026-retention-playbook) — cadence structure and suppression rules

---

*Feature research for: GymClassOS v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher*
*Researched: 2026-06-19*
