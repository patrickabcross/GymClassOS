# Platform Vision — Reference Document

> **Status:** Reference / inspiration only. This document was provided 2026-05-17 as a forward-looking vision. Many of its specific architectural choices (Next.js+Prisma, Redis, tenant_id+RLS, Twilio multi-channel, Hetzner self-hosting, per-tenant Apple Dev Account / Fastlane / Expo native) were reconciled against the current GymOS constraints (agent-native lock-in, solo-dev / 2-month timeline, signed customer's realities) and explicitly rejected. The decisions log at the bottom of this file records what was kept vs reframed.
>
> Read this for **product/feature inspiration** (coach view, segments, bsport migration, member context surfacing), not as the architecture of record. The architecture of record is PROJECT.md + STACK.md + ARCHITECTURE.md + ROADMAP.md.

---

# Studio Platform — Technical Architecture

A multi-tenant studio management platform combining class booking, CRM, payments, and a member-facing branded mobile app with HealthKit integration and calorie tracking.

---

## 1. System Overview

Each studio operates as an isolated tenant with its own white-labelled iOS app and its own Stripe account. The platform is built as an **agent-native workspace** (Builder.io `agent-native` framework), where every app is both a structured UI and an agent surface — actions can be triggered from a click or from a prompt, and both write to the same database.

**Core principles:**

1. **Stripe is the system of record for money.** Each studio holds their own direct Stripe account. The platform never holds funds and never owns the merchant relationship.
2. **Agent and UI are equal citizens.** Every member-facing and staff-facing action exists as both a button and a tool the agent can call. Database is shared across both paths.
3. **Tenants are isolated at the data layer but share platform infrastructure.** One Postgres, tenant_id everywhere, row-level security enforced.
4. **The mobile app is the unified daily-engagement surface.** Booking + payments + HealthKit + food logging + contextual coaching in one branded experience.

```
┌─────────────────────────────────────────────────────────────┐
│  MEMBER APP (React Native, per-tenant white-label)          │
│  ├── Booking, payments, profile                             │
│  ├── HealthKit reads (workouts, sleep, HRV, energy)         │
│  ├── Food logging + barcode scan                            │
│  ├── In-app agent (contextual coaching)                     │
│  └── Push notifications                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS / JWT
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STUDIO BACK OFFICE (Next.js, agent-native workspace)       │
│  apps/                                                      │
│  ├── schedule/   — class scheduling                         │
│  ├── members/    — member CRUD, history, coach view         │
│  ├── crm/        — segments, campaigns, lifecycle           │
│  ├── billing/    — memberships, Stripe ops, reporting       │
│  └── coach/      — instructor pre-class context             │
│  packages/shared/ — auth, theme, agent skills, A2A registry │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  API LAYER (Next.js Route Handlers)                         │
│  ├── REST + tRPC for typed client calls                     │
│  ├── Tool endpoints (consumed by agents AND UI)             │
│  ├── Webhook receivers (Stripe, Twilio, Meta)               │
│  └── A2A endpoints for cross-app agent calls                │
└─────────────────────────────────────────────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐
│  Postgres    │ │  Redis   │ │  Stripe      │ │  Agent     │
│  (multi-     │ │ (queues, │ │  (per-tenant │ │  runtime   │
│  tenant +    │ │ pub/sub, │ │  direct      │ │ (Anthropic │
│  RLS)        │ │ sessions)│ │  accounts)   │ │  SDK)      │
└──────────────┘ └──────────┘ └──────────────┘ └────────────┘
```

---

## 2. Multi-Tenancy Model

**Single database, `tenant_id` discriminator on every table.** Row-level security in Postgres enforces isolation; ORM middleware (Prisma) adds belt-and-braces.

Each tenant owns:

- A direct Stripe account (their own — NOT a Connect sub-account under the platform)
- An iOS app on their own Apple Developer account
- An APNs auth key
- A subdomain (`studio.platform.com`) plus optional custom domain
- A theme config (colours, logo, app name, app icon, fonts)
- A set of agent skills/instructions scoped to that tenant

**Tenant resolution:**

| Surface | Resolution |
|--------|------------|
| Mobile app | `TENANT_ID` baked into build-time env, carried in JWT |
| Back office | Subdomain → tenant_id lookup at edge |
| Public booking widget | `tenant_id` passed in widget init script |
| Agent requests | JWT-derived; agent inherits the calling user's tenant scope |

---

## 3. Agent-Native Workspace Layout

Following `@agent-native/core` conventions. The platform repo is a pnpm workspace with `apps/` containing each functional app and `packages/shared/` containing cross-app concerns.

```
studio-platform/
├── package.json                  # declares agent-native.workspaceCore
├── pnpm-workspace.yaml
├── .env                          # ANTHROPIC_API_KEY, A2A_SECRET, DATABASE_URL...
├── packages/
│   ├── shared/
│   │   ├── auth/                 # JWT, session, tenant resolution
│   │   ├── db/                   # Prisma schema + client
│   │   ├── theme/                # per-tenant theming primitives
│   │   ├── agent-skills/         # skills exposed to all apps' agents
│   │   ├── a2a-registry/         # agent discovery for cross-app calls
│   │   └── stripe/               # per-tenant Stripe client factory
│   ├── ui/                       # shadcn-based component library
│   └── mobile-shared/            # shared RN components & hooks
└── apps/
    ├── back-office/              # Next.js — staff-facing web
    │   ├── schedule/
    │   ├── members/
    │   ├── crm/
    │   ├── billing/
    │   └── coach/
    ├── member-app/               # React Native — per-tenant mobile
    ├── booking-widget/           # embeddable web booking widget
    └── public-site/              # marketing/landing per studio
```

Each app exposes:

- **UI routes** (Next.js pages or RN screens)
- **Tool endpoints** consumed by the agent runtime AND by the UI's data layer (single source of truth)
- **Skills** — agent capabilities specific to that app
- **A2A handlers** — endpoints other apps' agents can call (with `A2A_SECRET` signing)

---

## 4. Data Model (Core Entities)

```sql
-- ── TENANTS ─────────────────────────────────────────────
tenants (
  id UUID PK,
  name TEXT,
  slug TEXT UNIQUE,
  stripe_account_id TEXT,         -- studio's own Stripe acct.id
  stripe_key_ciphertext BYTEA,    -- encrypted restricted key
  apple_team_id TEXT,
  apns_key_id TEXT,
  apns_key_ciphertext BYTEA,
  theme_json JSONB,
  timezone TEXT,
  currency CHAR(3),
  agent_config_json JSONB,        -- tenant-specific agent instructions
  created_at TIMESTAMPTZ
)

-- ── PEOPLE ──────────────────────────────────────────────
staff_users (
  id UUID PK, tenant_id UUID,
  email TEXT, role TEXT,          -- owner | manager | instructor | front_desk
  ...
)

members (
  id UUID PK, tenant_id UUID,
  stripe_customer_id TEXT,
  email TEXT, phone TEXT,
  first_name TEXT, last_name TEXT,
  dob DATE, sex TEXT,
  height_cm INT, weight_kg NUMERIC,
  goal TEXT,                       -- maintain | lose | gain | performance
  activity_level TEXT,
  marketing_consent BOOL,
  health_data_consent BOOL,
  apns_device_tokens TEXT[],
  created_at TIMESTAMPTZ
)

-- ── MEMBERSHIPS ─────────────────────────────────────────
membership_plans (
  id UUID PK, tenant_id UUID,
  name TEXT,
  stripe_price_id TEXT,
  billing_interval TEXT,           -- weekly | monthly | quarterly | annual
  credits_per_interval INT,        -- NULL if unlimited
  unlimited BOOL,
  class_categories_allowed TEXT[],
  active BOOL
)

memberships (
  id UUID PK, tenant_id UUID,
  member_id UUID, plan_id UUID,
  stripe_subscription_id TEXT,
  status TEXT,                     -- active | paused | cancelled | past_due
  current_period_end TIMESTAMPTZ,
  credits_remaining INT,
  paused_until DATE,
  cancelled_at TIMESTAMPTZ
)

-- ── SCHEDULE ────────────────────────────────────────────
class_templates (
  id UUID PK, tenant_id UUID,
  name TEXT, category TEXT,
  duration_min INT, capacity INT,
  default_credits_cost INT,
  description TEXT, image_url TEXT
)

class_instances (
  id UUID PK, tenant_id UUID,
  template_id UUID,
  instructor_id UUID,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  capacity INT,
  room TEXT,
  status TEXT,                     -- scheduled | cancelled | completed
  notes TEXT
)

bookings (
  id UUID PK, tenant_id UUID,
  class_instance_id UUID,
  member_id UUID,
  status TEXT,                     -- booked | waitlist | cancelled | attended | no_show
  credits_used INT,
  booked_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ
)

-- ── HEALTH & FOOD ───────────────────────────────────────
health_snapshots (
  id UUID PK, tenant_id UUID, member_id UUID,
  date DATE,
  sleep_hours NUMERIC,
  hrv_ms INT,
  resting_hr INT,
  steps INT,
  active_energy_kcal INT,
  workouts JSONB,                  -- [{type, duration, kcal, source}]
  created_at TIMESTAMPTZ,
  UNIQUE (tenant_id, member_id, date)
)

food_items (                       -- shared across tenants
  id UUID PK,
  name TEXT, brand TEXT,
  barcode TEXT,
  kcal_per_100g NUMERIC,
  protein_g NUMERIC, carbs_g NUMERIC, fat_g NUMERIC,
  fibre_g NUMERIC, sugar_g NUMERIC, sodium_mg NUMERIC,
  source TEXT,                     -- openfoodfacts | edamam | custom
  verified BOOL
)

food_entries (
  id UUID PK, tenant_id UUID, member_id UUID,
  food_id UUID,
  logged_at TIMESTAMPTZ,
  meal_type TEXT,                  -- breakfast | lunch | dinner | snack
  quantity_g NUMERIC,
  kcal NUMERIC,
  protein_g NUMERIC, carbs_g NUMERIC, fat_g NUMERIC,
  source TEXT                      -- manual | barcode | search | favourite
)

-- ── CRM ─────────────────────────────────────────────────
member_tags (member_id UUID, tag TEXT, set_at TIMESTAMPTZ)

segments (
  id UUID PK, tenant_id UUID,
  name TEXT,
  filter_json JSONB,               -- filter tree compiled to SQL
  member_count INT,
  refreshed_at TIMESTAMPTZ
)

campaigns (
  id UUID PK, tenant_id UUID,
  segment_id UUID,
  channel TEXT,                    -- email | sms | push | whatsapp
  template_id UUID,
  scheduled_at TIMESTAMPTZ,
  status TEXT
)

messages (
  id UUID PK, tenant_id UUID, member_id UUID,
  channel TEXT, direction TEXT,
  body TEXT, sent_at TIMESTAMPTZ, status TEXT,
  campaign_id UUID,
  agent_initiated BOOL
)

-- ── AGENT STATE ─────────────────────────────────────────
agent_sessions (
  id UUID PK, tenant_id UUID,
  user_id UUID,                    -- staff or member
  user_type TEXT,                  -- staff | member
  app TEXT,                        -- which app the session belongs to
  messages JSONB,                  -- assistant-ui message tree
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

agent_skills (
  id UUID PK, tenant_id UUID,
  scope TEXT,                      -- tenant | user
  user_id UUID,
  name TEXT,
  instructions TEXT,
  enabled BOOL
)

agent_memory (
  id UUID PK, tenant_id UUID,
  user_id UUID,
  key TEXT, value JSONB,
  expires_at TIMESTAMPTZ
)

-- ── AUDIT ───────────────────────────────────────────────
stripe_events (
  id UUID PK, tenant_id UUID,
  event_id TEXT UNIQUE, type TEXT,
  payload_json JSONB,
  processed_at TIMESTAMPTZ
)

audit_log (
  id UUID PK, tenant_id UUID,
  actor_type TEXT,                 -- staff | member | agent | system
  actor_id UUID,
  action TEXT, target_type TEXT, target_id UUID,
  before_json JSONB, after_json JSONB,
  created_at TIMESTAMPTZ
)
```

`food_items` is the only cross-tenant table — a single food database serves all studios. Everything else is strictly tenant-scoped.

---

## 5. Mobile App (React Native)

### 5.1 Stack

| Concern | Library |
|---|---|
| Framework | React Native 0.74+ with TypeScript |
| Build | Expo + EAS Build (per-tenant build configs) |
| Server state | TanStack Query |
| Local state | Zustand |
| Navigation | Expo Router (file-based) |
| HealthKit | `react-native-health` |
| Payments | `@stripe/stripe-react-native` |
| Barcode | `react-native-vision-camera` + ML Kit |
| Push | `expo-notifications` (APNs per tenant) |
| Agent UI | `assistant-ui` React components, custom RN bridge |

### 5.2 Auth

JWT-based. App built per tenant with `TENANT_ID` and `API_BASE_URL` as env vars baked into the bundle. Login: email + magic link, or SMS OTP via Twilio Verify. JWT carries `member_id`, `tenant_id`, `exp`. Refresh tokens stored in Keychain.

### 5.3 Booking

```
GET    /api/v1/classes?from=&to=&category=
POST   /api/v1/bookings           { class_instance_id }
DELETE /api/v1/bookings/:id
GET    /api/v1/members/me/bookings?status=upcoming
POST   /api/v1/bookings/:id/waitlist
```

Booking atomically deducts credits from active membership in a single transaction. If no credits and unlimited plan doesn't cover the class category, surface a one-off purchase via Stripe PaymentSheet.

### 5.4 HealthKit

On first launch, request read permissions for: `Steps`, `HeartRate`, `HeartRateVariabilitySDNN`, `SleepAnalysis`, `ActiveEnergyBurned`, `Workout`, `BodyMass`, `RestingHeartRate`. All read-only; no writes in alpha.

```ts
// Background task with expo-task-manager
const HEALTH_SYNC = 'health-sync';
TaskManager.defineTask(HEALTH_SYNC, async () => {
  const snapshot = await collectHealthSnapshot(yesterday);
  await api.post('/health-snapshots', snapshot);
  return BackgroundFetch.BackgroundFetchResult.NewData;
});
```

**Sync cadence:**
- App open if `last_sync > 6h ago`
- Daily background fetch around 06:00 local time
- Delta sync only — submit yesterday's daily summary, not raw samples

```
POST /api/v1/health-snapshots
{
  "date": "2026-05-16",
  "sleep_hours": 6.5,
  "hrv_ms": 42,
  "resting_hr": 58,
  "steps": 8421,
  "active_energy_kcal": 412,
  "workouts": [
    { "type": "HIIT", "duration_min": 45, "kcal": 380, "source": "studio" }
  ]
}
```

### 5.5 Food Logging

Input paths: barcode scan, search, recents/favourites, custom entry.

```
GET  /api/v1/foods/search?q=
GET  /api/v1/foods/barcode/:code
POST /api/v1/food-entries          { food_id, quantity_g, meal_type, logged_at }
GET  /api/v1/members/me/food-entries?date=
```

Daily macro targets calculated from member profile (Mifflin-St Jeor BMR × activity factor, adjusted for goal). Home screen shows kcal/protein/carb/fat rings.

### 5.6 In-App Agent

The agent surface in the member app is a chat sheet accessible from any screen via Cmd+I equivalent (long-press FAB on mobile). It has tools to:

- Read the member's recent health snapshots, bookings, food entries
- Suggest class swaps and book them (with confirmation)
- Log food via natural language ("I had a chicken caesar at Pret")
- Answer training/nutrition questions in the studio's voice
- Escalate to a human coach via a tool that creates a CRM task

Tool calls hit the same API endpoints the UI uses — single source of truth.

### 5.7 Push Notifications

APNs auth key per tenant, stored encrypted server-side. Push categories:

- **Booking reminders** — 24h and 2h before class
- **Coaching nudges** — agent-initiated based on health context
- **Campaign sends** — from CRM
- **Transactional** — payment failures, membership renewals

---

## 6. Back Office (Next.js, agent-native)

### 6.1 Stack

| Concern | Library |
|---|---|
| Framework | Next.js 15 App Router |
| ORM | Prisma |
| UI | shadcn/ui + Tailwind |
| Tables | TanStack Table |
| Charts | Recharts |
| Auth | NextAuth (credentials + magic link) |
| Agent | `@agent-native/core`, Anthropic SDK |
| Realtime | Server-Sent Events for agent streaming |

### 6.2 Apps

Each app is a separate folder under `apps/back-office/` (within the agent-native workspace shape, this could also be split into top-level apps — choose one model and stay consistent).

#### `schedule/`
- Week and day views
- Click-to-create class instances
- Drag to reschedule
- Capacity, waitlist, room conflicts
- Recurring schedule templates

#### `members/`
- Searchable, filterable list
- Member detail: bookings, memberships, payments, health context, food summary, message thread, notes, tags
- Bulk actions (tag, message, export)
- Coach view (see §6.4)

#### `crm/`
- Segment builder (filter tree → SQL)
- Campaign composer (email/SMS/push/WhatsApp)
- Automation flows (trigger → conditions → actions)
- Templates library
- Send-time analytics

#### `billing/`
- Plan CRUD (creates Stripe Products + Prices in studio's account)
- Active subscriptions, churn dashboard
- Failed payment recovery
- Refunds, credits, manual charges
- Revenue reporting

#### `coach/`
- Per-class instructor view
- Member list with photos, health context, food adherence, notes

### 6.3 Segment Builder

Segments are filter trees stored as JSON, compiled to parameterised SQL by a builder service. Example:

```json
{
  "all": [
    { "field": "memberships.status", "op": "=", "value": "active" },
    { "field": "bookings.last_attended", "op": ">=", "value": "-14d" },
    {
      "any": [
        { "field": "health.avg_hrv_7d", "op": "<", "value": 35 },
        { "field": "health.avg_sleep_7d", "op": "<", "value": 6 }
      ]
    }
  ]
}
```

→ "Active members showing recovery stress" — used to trigger a coach-touchpoint workflow.

### 6.4 Coach View

The differentiator. For an upcoming class, the instructor sees:

- Member list with photos
- Recent sleep average, HRV trend, training load (last 7d)
- Food adherence flag (on-track / off-track, no specifics)
- Notes from previous classes
- Goals, milestones, recent PRs

This is what converts instructors from class-deliverers into ongoing coaches with continuous member context — and justifies the premium membership pricing the studio can charge.

---

## 7. Payments (Stripe Direct, Per-Tenant)

**Each studio holds their own direct Stripe account.** The platform is NOT a Stripe Connect platform. This is deliberate — it avoids replicating the bsport architecture where the studio doesn't own its processor relationship and can't take their data when leaving.

### 7.1 Onboarding

1. Studio creates their own Stripe account (or connects an existing one)
2. Stripe OAuth flow: studio authorises platform to act on their account via restricted API key
3. Platform stores the restricted key encrypted (Postgres `pgcrypto` or external KMS)
4. All Stripe calls hit the studio's account directly — funds flow studio → studio's bank with zero platform involvement
5. Webhook endpoint registered in the studio's Stripe account, pointing at platform webhook URL with tenant-specific signing secret

Required Stripe permissions on the restricted key:
- Products / Prices: read + write
- Customers: read + write
- Subscriptions: read + write
- PaymentIntents: read + write
- SetupIntents: read + write
- Charges: read
- Refunds: read + write
- Webhooks: read

### 7.2 Subscription Lifecycle

| Trigger | Action |
|---|---|
| Plan created in back office | Create Stripe Product + Price |
| Member signs up | Create Stripe Customer, attach payment method via SetupIntent |
| Member buys membership | Create Stripe Subscription |
| `invoice.paid` webhook | Mark `memberships.current_period_end`, top up credits |
| `invoice.payment_failed` webhook | Set membership to `past_due`, fire dunning sequence |
| `customer.subscription.deleted` webhook | Set membership to `cancelled` |

### 7.3 Drop-Ins & Add-Ons

One-off purchases use Stripe PaymentIntent with saved payment method. Credits added to a non-subscription credit bucket on the member.

### 7.4 Webhooks

```
POST /api/webhooks/stripe/:tenant_id
→ Verify signature with tenant-specific webhook secret
→ Insert into stripe_events table (idempotency on event_id)
→ Enqueue to Redis Stream for async processing
→ 200 OK immediately
```

Processing happens async to keep latency under Stripe's 30s timeout. Failed processing requeues with exponential backoff.

---

## 8. Agent Runtime

Built on `@agent-native/core` primitives, the agent layer is woven through both back office and member app. There is no separate orchestration service — agents run as part of the apps, invoked via standard HTTP routes.

### 8.1 Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Agent Entry Points                                       │
│  ├── Member app chat sheet         (member-scoped)        │
│  ├── Back office Cmd+I             (staff-scoped)         │
│  ├── Scheduled triggers            (system-scoped, cron)  │
│  └── Event-driven triggers         (system, from Redis)   │
└───────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│  Agent Loop (per app, sharing skills via packages/shared) │
│  ├── Resolve user + tenant + scope                        │
│  ├── Load skills (tenant + user level)                    │
│  ├── Load memory (key/value, scoped)                      │
│  ├── Call Anthropic with tools list                       │
│  ├── Execute tool calls against same APIs the UI uses     │
│  └── Stream response back to client (SSE)                 │
└───────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│  A2A — Agent-to-Agent (cross-app)                         │
│  Member-app agent can tag the back-office CRM agent       │
│  to draft a coach follow-up. CRM agent can ask the        │
│  billing agent to check payment status. Signed with       │
│  A2A_SECRET per call.                                     │
└───────────────────────────────────────────────────────────┘
```

### 8.2 Skills

Skills are versioned instruction sets + tool bundles. They live in `packages/shared/agent-skills/` and per-tenant overrides in the `agent_skills` table.

Examples for the alpha:

| Skill | Scope | Description |
|---|---|---|
| `book-class` | member | Book/cancel/swap classes with member confirmation |
| `log-food-nl` | member | Parse "I had a Pret chicken caesar" → food entry |
| `recovery-check` | member | Read health, suggest training adjustments |
| `draft-coach-message` | staff | Compose personalised follow-up for a member |
| `segment-build` | staff | Translate NL ("active members losing engagement") → segment JSON |
| `recover-failed-payment` | staff/system | Run dunning sequence with appropriate tone |
| `class-fill-optimiser` | staff/system | Suggest waitlist promotions, member nudges to fill classes |

### 8.3 Tools

Tools are typed wrappers around the platform's existing API endpoints — the same endpoints the UI calls. Each tool has a Zod schema, an executor, and an audit hook.

```ts
// packages/shared/agent-skills/tools/book-class.ts
export const bookClassTool = defineTool({
  name: 'book_class',
  description: 'Book a class instance for the current member.',
  input: z.object({
    class_instance_id: z.string().uuid(),
  }),
  execute: async ({ input, ctx }) => {
    // Same code path as the mobile app's booking action
    return await bookings.create({
      tenantId: ctx.tenantId,
      memberId: ctx.userId,
      classInstanceId: input.class_instance_id,
    });
  },
  audit: { actor_type: 'agent', action: 'book_class' },
});
```

### 8.4 Memory

Per-user key/value JSON in `agent_memory`. Used for:

- Member preferences ("prefers morning classes", "vegetarian")
- Coaching context ("currently in deload week")
- Staff workflow state ("draft campaign in progress")

Memory is scoped tenant + user. TTLs supported for transient state.

### 8.5 Scheduled & Event-Driven Triggers

Cron jobs and Redis Stream consumers invoke agent skills as system-scoped actions. Examples:

| Trigger | Skill |
|---|---|
| Daily 06:30 per member after health sync | `recovery-check` |
| `bookings.no_show` event | `draft-coach-message` (lapse nudge) |
| `subscription.past_due` event | `recover-failed-payment` |
| Hourly check of classes starting in 2h | `class-fill-optimiser` |
| `member.signup` event | Welcome sequence |

System-scoped agent runs are audited like any other agent action and their messages stored against a synthetic system user.

---

## 9. Food Database

**Alpha:** Wrap Open Food Facts (free, EU-friendly, strong barcode coverage) as the primary source. Use Edamam Nutrition API (~£80-100/mo) for natural-language food parsing and recipe nutrition.

**Pattern:** Treat external sources as caches. First lookup of a barcode or query hits the external API, then persists to `food_items`. Every subsequent member benefits without re-hitting the API. After a few months you'll have a usable proprietary database covering the most-consumed foods across your studios.

```
GET /api/v1/foods/barcode/:code
  → check food_items by barcode
  → if miss, call Open Food Facts
  → persist result to food_items
  → return to client
```

---

## 10. Infrastructure

### 10.1 Production

| Component | Spec |
|---|---|
| App servers | Hetzner CPX41 (8 vCPU / 16GB) × 2, Caddy in front |
| Database | Hetzner managed Postgres OR self-hosted CPX31 with replica, daily backups to S3-compatible storage |
| Redis | Hetzner CPX21, AOF persistence enabled |
| Object storage | Hetzner Storage Box or Cloudflare R2 (images, exports) |
| CDN / WAF | Cloudflare in front of everything |
| Errors | Sentry |
| Product analytics | PostHog (self-hosted on Hetzner) |
| Email | Postmark transactional, AWS SES for bulk |
| SMS | Twilio |
| Push | APNs direct (per-tenant key) |

### 10.2 CI/CD

| Pipeline | Stack |
|---|---|
| Web/API | GitHub Actions → Docker → Hetzner via SSH/systemd |
| Mobile builds | EAS Build, one profile per tenant |
| App Store submission | Fastlane scripts, semi-automated per tenant |
| DB migrations | Prisma Migrate, gated behind approval in production |

### 10.3 Secrets

| Secret | Storage |
|---|---|
| Per-tenant Stripe restricted keys | Postgres encrypted with `pgcrypto`, key from env |
| Per-tenant APNs auth keys | Same |
| Per-tenant webhook signing secrets | Same |
| Anthropic API key | Workspace `.env`, single shared key |
| A2A signing secret | Workspace `.env` |
| Database password | Workspace `.env`, rotated quarterly |

Encryption keys themselves stored outside the database in environment variables, ideally backed by a KMS in production.

---

## 11. Security & Compliance

- **GDPR** — Member data deletion cascades across all tables, triggers Stripe customer deletion, sends instructions to member for clearing Health data locally. Audit log preserves the fact of deletion without retaining the data.
- **HealthKit** — Apple's terms require explicit purpose disclosure, no advertising use of health data, no sale or transfer to third parties beyond essential service providers. Encryption in transit (TLS 1.3) and at rest (Postgres encryption). Clear privacy policy required for App Store review.
- **PCI** — Platform never touches raw card data. All card input via Stripe Elements (web) or PaymentSheet (mobile). Platform is out of PCI scope at the application level.
- **Agent audit** — Every agent action is logged with actor type, skill, tool call, inputs, outputs, and timestamp. Staff can review the full agent history for any member.
- **App Store review** — HealthKit-reading apps need a clear medical/fitness justification in App Store Connect review notes. Budget 1-2 review cycles per tenant launch. The white-label model means each tenant has their own listing and must clear review independently.

---

## 12. Migration from bsport (Per Tenant)

This is a productised playbook to run for each incoming studio.

### Phase 1 — Pre-cutover (1 week)

1. Pull bsport reports — Members report, Subscriptions report (with Subscription + Expiry date fields added). Export both.
2. Request bsport API alpha access via support, frame as integration not exit.
3. Reconcile CSV gaps:
   - Flag offline payers for manual setup
   - Identify paused memberships (bsport doesn't distinguish in export)
   - Capture unlimited-pass holders (bsport drops these)
   - Identify members with duplicate memberships (bsport keeps one)
4. Confirm with bsport in writing: £150 banking detail migration covers BOTH SEPA mandates AND stored card payment methods to the studio's nominated Stripe account, with an ID mapping file delivered.

### Phase 2 — Parallel running (4-6 weeks)

5. New sign-ups go to new platform; existing members stay on bsport.
6. Replicate plans, classes, schedule in new platform.
7. Build staff up on new back office.
8. Soft-launch member app to a beta cohort (10-20 members) for feedback.

### Phase 3 — Stripe transfer (1-2 weeks elapsed, mostly waiting)

9. Studio formally requests the £150 migration from bsport.
10. bsport contacts Stripe support to initiate processor-to-processor transfer to studio's destination Stripe account.
11. Receive ID mapping file. Persist mapping as `stripe_id_mapping` table.

### Phase 4 — Cutover

12. Recreate subscriptions in destination Stripe account against migrated payment methods, using the ID mapping. Match billing anchor dates to avoid double-charging or gaps.
13. Verify a small sample manually before bulk creation.
14. Cancel subscriptions in bsport (this stops bsport-side billing).
15. Switch the member app to live status.
16. Communicate to members: "your subscription was moved to our new platform, you may receive a cancellation email from the old system — please ignore it."

### Phase 5 — Post-cutover

17. Monitor failed payments closely for the first billing cycle (some mandates re-tokenise and need member action).
18. Run reconciliation report: bsport-active members vs new-platform-active members. Target <1% drop.
19. Cancel bsport account with support.

---

## 13. Build Sequence — Alpha Scope (12 weeks)

| Weeks | Focus |
|---|---|
| 1-3 | Backend foundations: workspace setup, auth, multi-tenancy, data model, Stripe per-tenant integration, webhook plumbing |
| 3-6 | Back office MVP: schedule, members, memberships, basic CRM |
| 5-9 | Mobile app MVP: auth, booking flow, payments, profile, push |
| 8-11 | HealthKit + food logging + in-app agent |
| 10-12 | Coach view, agent skills (recovery-check, log-food-nl, draft-coach-message), polish |

Pre-launch: bsport migration playbook execution for the alpha tenant. App Store submission for the first white-labelled app.

---

## 14. Open Questions for Dev Team

1. **Workspace shape** — One `back-office` app with internal sub-routes, or split into separate agent-native apps (`schedule`, `members`, `crm`, `billing`)? Splitting follows the framework's grain but adds plumbing; consolidating ships faster.
2. **Agent UI in mobile** — `assistant-ui` is React-first. Confirm RN bridge feasibility, or build a custom chat surface using the same API contracts.
3. **Push delivery at scale** — APNs direct is fine for <50 tenants; at scale, consider OneSignal or a self-hosted push gateway.
4. **Food database licensing** — Open Food Facts is ODbL-licensed (attribution required, share-alike on derivative databases). Confirm acceptable for the alpha; revisit if proprietary database becomes a moat.
5. **HealthKit on Android** — Health Connect is the parallel; ship iOS-first, add Android in v2.

---

## Reconciliation Log (2026-05-17)

How this document was reconciled with current GymOS constraints. **Final decisions live in PROJECT.md / STACK.md / ARCHITECTURE.md / ROADMAP.md — those are authoritative, not this file.**

| Topic | This doc says | GymOS decision | Reason |
|---|---|---|---|
| Framework | Next.js + Prisma + NextAuth | React Router v7 + Drizzle + Better-auth + H3 | agent-native is RR v7 — verified by direct repo inspection; this doc was mistaken about agent-native's stack |
| Tenancy | Single Postgres + `tenant_id` + RLS | Per-customer deploy, NO `tenant_id` anywhere | Eliminates entire tenant-scoping bug class; matches WhatsApp/Stripe-per-account model; right for solo-dev + 1-30 studios |
| Mobile | Per-tenant white-label React Native + Expo + EAS + Fastlane + HealthKit | NO native mobile in v1. Member surface is web PWA on RR v7 | Drops Apple Dev Account dance / Fastlane / App Store review cycles; ships faster; HealthKit deferred |
| Stripe | Direct restricted-API-key (no Connect) | **Adopted** — restricted-key model per this doc | Cleaner, no Connect ceremony, studio owns merchant relationship — agreed |
| Messaging | Twilio + Postmark + APNs + WhatsApp multi-channel + campaigns | WhatsApp-only (Meta direct) | PROJECT.md constraint; differentiator focus; defer multi-channel until needed |
| Queue/cache | Redis + (BullMQ-style streams) | pg-boss on Neon, NO Redis | Eliminates Redis as a service; aligns with Vercel↔Fly stack |
| Hosting | Hetzner CPX self-hosted (servers + Postgres + Redis + PostHog) | Vercel + Fly.io + Neon (all managed) | Solo dev / 2-month deadline; managed services are right call |
| Calorie counter | (not in this doc) | Build fresh in agent-native style, RR v7 + Drizzle + shadcn, Open Food Facts + USDA data | OpenNutriTracker considered as fork target but rejected (Flutter, GPL v3 — incompatible with stack + commercial use) |
| Coach View | Premium feature with HealthKit context | Deferred to post-demo (no HealthKit in v1 = no health context to surface) | Demo this week + HealthKit-out scope |
| Segment Builder + Campaigns | Alpha scope | Deferred to post-v1 | No multi-channel campaigns in v1; segments depend on member data we don't have yet |
| bsport migration | Productised per-tenant playbook | Future onboarding tooling, not v1 | Signed customer's migration timing TBD; relevant when onboarding starts |
| A2A (Agent-to-Agent) | Cross-app signed calls | Out of scope v1, possibly post-v1 | One workspace, one auth context — A2A overkill until multiple deployments |
| Agent skills | Full library (7+ skills) | Demo scope: book_class + log_food_nl + (one or two more); production v1 adds more | Demo simplicity |

**Kept as direct inspiration:**
- Stripe direct restricted-key onboarding model
- Open Food Facts + USDA FDC as nutrition data sources
- Schema patterns for food_items + food_entries (adapted)
- Schema patterns for agent_sessions + agent_skills + agent_memory
- "Tools wrap the same API endpoints UI uses" — single source of truth principle
- Coach View as the premium differentiator (deferred to v1.x when HealthKit lands)
- bsport migration playbook (deferred — relevant at customer onboarding time)
- Mifflin-St Jeor BMR + activity multipliers for calorie targets (public-domain math)

**Reference status:** keep this file as `.planning/research/PLATFORM-VISION.md`. Future planning sessions consult it for product/feature inspiration (especially HealthKit + coach view + segments + bsport migration), but architecture-of-record is PROJECT.md.
