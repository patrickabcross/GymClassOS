# Stack Research — GymClassOS

**Domain:** Boutique fitness studio management platform (staff web + WhatsApp + Stripe + member-mobile-integration)
**Researched:** 2026-05-17
**Confidence:** HIGH for framework/DB/auth/payments (verified against agent-native repo and official docs); MEDIUM for WhatsApp client (deprecated official SDK); MEDIUM for jobs runtime (depends on Phase 0 audit findings).

---

## The Single Most Important Finding (Read This First)

**agent-native does NOT use Next.js.** It uses **React Router v7 (Framework Mode) + Vite + Drizzle ORM + H3 server + Better-auth**. The Mail template (which becomes the WhatsApp client) is built on this stack with Radix UI primitives and Tailwind.

This is decisive: do NOT pick Next.js, do NOT pick Prisma, do NOT pick NextAuth. Match the upstream so merges from `BuilderIO/agent-native` stay tractable. Every recommendation below assumes alignment with what's already in the framework.

Verified from `BuilderIO/agent-native` (commit-level web inspection 2026-05-17):

| Choice in agent-native | Files inspected |
|---|---|
| React Router v7 (framework mode, SSR) | `templates/mail/react-router.config.ts`, `vite.config.ts` |
| Vite as the build tool | `templates/mail/vite.config.ts` |
| Drizzle ORM via `@agent-native/core/db/drizzle-config` | `templates/mail/drizzle.config.ts`, `packages/core/package.json` (`drizzle-orm@^0.45.2`) |
| H3 as the server runtime | `packages/core/package.json` (h3 used inside templates' `server/middleware/*`) |
| **Better-auth** for sessions | `packages/core/package.json` (`better-auth@^1.6.0`); `auth.ts` middleware delegates to `runAuthGuard` from `@agent-native/core/server` |
| Radix UI + Tailwind v4 + Lucide + Sonner | `templates/mail/package.json`, `templates/starter/package.json` |
| React Hook Form + Zod + TanStack Query | `templates/mail/package.json` |
| Tiptap for rich text editing | `templates/mail/package.json` |
| `@neondatabase/serverless@^1.1.0` already in core | `packages/core/package.json` |
| LibSQL is the *default* dev DB but Postgres/Neon is supported via the same Drizzle config | `packages/core/package.json` lists both `@libsql/client` and `@neondatabase/serverless` |

This means: **the only DB swap we need to make is configuring Drizzle for `pg`/`neon-http` instead of `libsql` at fork time** — agent-native's core already imports the Neon serverless driver as a first-class option.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|---|---|---|---|
| **TypeScript** | `^5.7.x` (catalog-managed in pnpm workspace) | Language | Locked-in; matches agent-native |
| **React** | `19.2.x` | UI runtime | Matches agent-native `^19.2.5` |
| **React Router v7** | `^7.13.x` (latest stable line; the 8.0 RC is *not* worth chasing for a 2-month ship) | Routing + SSR framework mode | This **replaces Next.js** for us. Agent-native ships with it. Loader/action data model is closer to old Remix and is a clean fit for typed full-stack code with no React Server Components complexity to fight. |
| **Vite** | `^6.x` (catalog version inherited from agent-native) | Dev server + bundler | Comes with React Router v7 framework mode. Cloudflare-tuned in upstream but the same `vite.config.ts` works for Vercel/Node targets. |
| **Postgres (Neon)** | Postgres 16, Neon managed | Application database | Locked-in. One Neon project per studio per the tenancy model. |
| **Drizzle ORM** | `^0.45.x` (stay on 0.45 line — agent-native is on `0.45.2`; **do NOT jump to 1.0-beta** mid-ship) | DB schema + queries | Already in agent-native. TS-first. Pairs natively with `@neondatabase/serverless`. Migration story is `drizzle-kit generate` + `drizzle-kit migrate` (note: agent-native has a `guard:no-drizzle-push` script — push is disallowed; use generate+migrate). |
| **`@neondatabase/serverless`** | `^1.1.x` | DB driver (HTTP + WebSocket) | Already a dep in `@agent-native/core`. Use the HTTP driver for Vercel-hosted stateless routes (cold-start friendly) and the WebSocket driver for the long-lived Fly worker (better latency for transactional workloads). |
| **H3** | `^2.0.x` (RC line in upstream — the same version agent-native ships) | Server runtime inside the React Router app | Already wired up by agent-native's middleware layer. Used for the global auth guard middleware. Do not replace; extend. |
| **Better-auth** | `^1.6.x` | Staff auth | Already in agent-native (`runAuthGuard` from `@agent-native/core/server` is Better-auth under the hood). Email/password + magic link for v1 staff login is enough; add OAuth later if needed. |
| **Stripe Node SDK** | `^17.x` (latest stable — verify the exact patch at install time; pin to the version that matches your target API version) | Payments | Use `stripe.webhooks.constructEvent()` — never hand-roll HMAC. Use Stripe Connect (OAuth) so studios authorise GymClassOS onto their *existing* account. |
| **`@great-detail/whatsapp`** | `^9.x` (April 2026) | WhatsApp Cloud API client | **Critical**: Meta's official `WhatsApp/WhatsApp-Nodejs-SDK` was paused (see Issue #31, "Pausing Development of the WhatsApp SDK"). `@great-detail/whatsapp` is the maintained fork. Tracks Cloud API v23, ships TS types, ESM + CJS, includes `event.verifySignature(appSecret)` for webhook validation. **Confidence: MEDIUM** — depends on a single maintainer; mitigation in the "What NOT to Use" section below. |
| **Hono** | `^4.x` | The Fly.io webhook receiver app + the Fly.io background worker's tiny admin HTTP surface | Hono is the right TS-native choice for the *Fly.io side* (which is a *separate* app from the React Router app on Vercel). Tiny bundle, first-class TS, easy raw-body handling for Stripe and WhatsApp signature verification. Do *not* use Hono for the staff web app — that's React Router. |
| **pg-boss** | `^10.x` | Background job queue on Fly.io (Postgres-backed) | Postgres-native queue running against the same Neon instance as application data. Eliminates Redis entirely — one fewer service, one fewer secret, one fewer failure mode. Supports delayed jobs (`sendAfter`), idempotency (`singletonKey`), retries with backoff, cron schedules, and dead-letter via `expireInHours`. Used for: outbound WhatsApp send queue, Stripe webhook post-processing, class reminder scheduling, weekly schedule materialisation. Locked in over BullMQ for the simplicity gain — solo-dev, low-volume v1. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| **Tailwind CSS** | `^4.x` | Styling | Already in agent-native; v4 is the version `@agent-native/core` peers against |
| **shadcn/ui** | latest CLI (no semver — copy-in components) | UI components | shadcn officially supports React Router v7 (`ui.shadcn.com/docs/installation/react-router`). Already aligned with agent-native's Radix + Tailwind + CVA stack — `shadcn add` should drop in cleanly without ejecting existing Radix usages. Use to fill gaps where agent-native's components don't cover GymClassOS-specific surfaces (forms, data tables, calendars beyond what's in the Calendar template). |
| **Radix UI primitives** | `^1.1.x` / `^2.2.x` | Accessible UI primitives | Already in agent-native; underlies shadcn |
| **Lucide React** | `^1.8.x` | Icon set | Already in agent-native |
| **Sonner** | `^2.0.x` | Toast notifications | Already in agent-native |
| **Zod** | `^4.x` | Schema validation (API payloads, env vars, WhatsApp webhook bodies, Stripe webhook bodies) | Already in agent-native; v4 |
| **React Hook Form** | `^7.71.x` | Forms in staff app | Already in agent-native |
| **TanStack Query** | `^5.99.x` | Client-side data fetching/cache | Already in agent-native |
| **date-fns** | `^4.1.x` | Date math for class schedules, 24h-window enforcement, reminder windows | Already in agent-native. Use `date-fns-tz` for the studio's local timezone (booked classes always render in studio time). |
| **Jose** | `^6.2.x` | JWT (already in agent-native; mostly for Better-auth internals) | Don't roll your own JWT — Better-auth uses Jose under the hood |
| **Nanoid** | `^5.1.x` | Short opaque IDs (idempotency keys, public-facing booking codes) | Already in agent-native |
| **Pino** | `^9.x` | Structured logging on Fly.io | Logs ship to Better Stack via Fly Logshipper (see Logging section) |

### Development Tools

| Tool | Purpose | Notes |
|---|---|---|
| **pnpm** | Package manager | Required — agent-native is a pnpm workspace with version `10.14.0`. Use the same. The `catalog:` versions in agent-native's package.json only work under pnpm. |
| **Drizzle Kit** | Schema migration generation | Use `drizzle-kit generate` + `drizzle-kit migrate`. Agent-native ships `guard:no-drizzle-push` — push is forbidden because it drops data. Preserve this guard in the fork. |
| **Vitest** | Unit tests | Already in agent-native templates. Use for: Zod schemas, idempotency key logic, WhatsApp 24h-window enforcer, Stripe event reducers. Avoid Vitest browser mode for React Router v7 components — there's a known preamble-detection bug; do that work in Playwright instead. |
| **Playwright** | E2E tests | Use for: staff login flow, sending a WhatsApp template, booking a class, processing a Stripe webhook end-to-end (via Stripe CLI fixtures). |
| **Stripe CLI** | Webhook testing locally | `stripe listen --forward-to localhost:3001/webhooks/stripe`. Required for any safe webhook iteration. |
| **`ngrok` or Cloudflare Tunnel** | WhatsApp webhook testing locally | Meta requires a public HTTPS URL to register a webhook subscriber. Pick one and stick with it. |
| **Prettier** | Formatting | Already in agent-native (`^3.6.2`). Inherit its config. |
| **Changesets** | Version management (optional for v1) | Agent-native uses it; for a solo-dev forked monorepo with one customer it's overkill — defer to Phase 4+. |

## Installation

> **Don't run a green-field `npm init`.** The starting point is `git clone https://github.com/BuilderIO/agent-native gymos && cd gymos && pnpm install`. The "installation" below is what to *add* on top of the fork for the GymClassOS-specific layer.

```bash
# Inside the fork — packages added for GymClassOS-specific surfaces
pnpm add @great-detail/whatsapp        # WhatsApp Cloud API client (maintained fork)
pnpm add stripe                        # Stripe Node SDK
pnpm add hono                          # Fly.io webhook receiver framework
pnpm add pg-boss                       # Background job queue (Postgres-backed, no Redis)
pnpm add date-fns-tz                   # Timezone-aware date math for class schedules
pnpm add pino pino-http                # Structured logging on Fly

# Dev-only additions
pnpm add -D @playwright/test           # E2E
pnpm add -D stripe-cli-wrapper         # OPTIONAL — most setups just call the stripe CLI binary directly
```

Already present from the agent-native fork (do NOT re-install — let `pnpm install` from upstream resolve):
React, React Router v7, Vite, Drizzle ORM, `@neondatabase/serverless`, H3, Better-auth, Radix UI, Tailwind v4, Lucide, Sonner, Zod, React Hook Form, TanStack Query, Vitest, Prettier.

## The Three Apps You're Actually Deploying

The locked-in tenancy model (one Neon project + one Vercel deploy + one Fly app per studio) means three deployable artefacts per studio, all from the same monorepo:

| App | Where | What | Why there |
|---|---|---|---|
| **`apps/staff-web`** (forked from agent-native templates: Mail → WhatsApp client, Calendar → class schedule, Content → KB, Analytics → reporting, Calorie tracker → calorie counter) | Vercel | React Router v7 SSR app — staff login, WhatsApp inbox, schedule, member directory, reports | Stateless, edge/serverless-friendly. Vercel's React Router v7 support (`@vercel/react-router` adapter) is first-class. |
| **`apps/edge-webhooks`** (new — Hono) | Fly.io (single small machine, always on) | Receives Meta WhatsApp inbound webhooks and Stripe webhooks. Verifies signatures. Enqueues via pg-boss directly against Neon. Returns 200 within Meta's/Stripe's tight timeout windows. | Vercel functions are *fine for Stripe* but Meta WhatsApp webhooks need a permanently warm endpoint with a stable IP for Meta's allowlist — Fly is the right home. Co-locating Stripe here keeps webhook ingress in one place; idempotency state lives in Postgres (`webhook_events` table). |
| **`apps/worker`** (new — Node pg-boss workers) | Fly.io (same Fly app or sibling) | Processes the pg-boss queues: outbound WhatsApp sender (enforces 24h window + template gate), Stripe event reducer, class-reminder scheduler, schedule materialisation cron | Long-running, needs persistent process. Workers subscribe to pg-boss queues over the same Neon connection used for app data. Vercel cron is too coarse for reminder windows. |

## Server Actions vs API Routes — Use Loaders + Actions

This is a Next.js-shaped question; in React Router v7 the answer is different. Use **loaders** for reads and **actions** for writes within the staff app. For *external* webhooks (Stripe, WhatsApp), do NOT mount them as React Router actions — host them in the Fly Hono app instead. Reasons:

1. Webhook handlers need raw body access for signature verification. React Router/H3 will happily parse JSON before you can grab the raw bytes; Hono on Fly gives you a clean `c.req.raw` boundary.
2. Webhook handlers need to be permanently warm. Vercel cold starts on a low-traffic studio break Meta's retry expectations.
3. Webhook handlers need a stable egress for Meta's optional IP allowlist. Vercel functions don't give you that; a Fly machine does.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| React Router v7 (framework mode) | Next.js App Router | Never for this project — would force divergence from upstream agent-native, killing the merge story. Pick Next only if you ever fully **stop** merging from agent-native. |
| Drizzle ORM | Prisma | Prisma's DX is nicer for some, but agent-native is Drizzle and the `@agent-native/core/db/drizzle-config` is the schema integration point. Switching means re-writing the DB layer of every template you adopt. Not worth it. |
| Drizzle ORM | Kysely / Raw SQL | Kysely is great for type-safe SQL without an ORM, but you'd lose the migration tooling and have to re-wire agent-native's DB layer. Worse trade. |
| Better-auth | NextAuth/Auth.js, Clerk, Lucia | Better-auth is already what `@agent-native/core` ships with via `runAuthGuard`. NextAuth assumes Next.js. Clerk costs money per MAU and is overkill for staff-only auth (small N of users per studio). Lucia is in maintenance mode (author confirmed end of 2025). Stay with what the framework ships. |
| `@great-detail/whatsapp` | Hand-rolling Graph API calls with `fetch` + a 300-line typed wrapper | Acceptable backup if the maintained fork goes stale. Track it in PITFALLS.md. The Graph API itself is simple; the value of the SDK is mostly the webhook signature verification + typed templates. If you hand-roll, copy their `verifySignature` implementation. |
| `@great-detail/whatsapp` | Twilio/MessageBird/Vonage | **Locked out** by project constraint. |
| Hono on Fly for webhooks | Express on Fly | Hono's raw-body story is cleaner and the TS types are designed-in. Express works but you'll fight `express.json()` middleware order for webhook signature verification — a documented Stripe footgun. |
| pg-boss on Neon | BullMQ + Redis on Fly | Pick BullMQ only if v1 job volume actually exceeds pg-boss's comfortable range (broadly ~10k jobs/day per studio with default polling). Trade: + more mature rate-limit primitives and priority lanes; − adds Redis as a service, adds an Upstash bill, adds a secret, doubles the things-that-can-break. For a solo-dev / one-studio / 2-month ship, the simplicity wins. Re-evaluate at the milestone after the first studio is live. |
| pg-boss on Neon | Inngest (managed) | Inngest is excellent and tempting for solo devs, but it's a *third-party SaaS* — adds another vendor, another billing relationship, and routes job execution through their cloud. For a per-studio deploy model this means N Inngest projects to manage. pg-boss stays inside the per-studio Neon boundary and matches the one-deploy-per-studio mental model. Reconsider Inngest if you ever centralise multi-studio observability. |
| pg-boss on Neon | Trigger.dev | Same trade as Inngest, plus Trigger.dev shines for *long, complex multi-step workflows* — overkill for the current job set (send a message, idempotency-check an event, schedule a reminder). |
| pg-boss on Neon | Native Node `setInterval` / Vercel Cron | Insufficient — reminders need per-class scheduling, WhatsApp sender needs queue retries + delayed jobs, no observability story. |
| shadcn/ui on top of agent-native's existing Radix components | Mantine, Chakra, custom Tailwind | Agent-native already uses Radix + Tailwind + CVA, which IS shadcn's stack. Adding shadcn = adding more components in the same idiom. Switching to Mantine/Chakra means two design systems clashing. |
| Better Stack (log management) | Axiom | Axiom is arguably stronger for high-volume serverless logs; pick it if you grow past 50GB/month or want Vercel-native function logs. For a per-studio deploy with modest volume, Better Stack's free tier + Fly Logshipper + Vercel integration is the lower-friction starting point. |

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| **Next.js (any router)** | Would force divergence from agent-native upstream; you'd be re-porting every template merge from the framework manually | React Router v7 framework mode (what agent-native ships) |
| **`WhatsApp/WhatsApp-Nodejs-SDK`** (Meta's official) | Officially paused — see Issue #31 "Pausing Development of the WhatsApp SDK". No 2026 maintenance. Will break on Cloud API version upgrades. | `@great-detail/whatsapp` (the maintained fork, currently v9, April 2026) |
| **Prisma** | Not what agent-native uses; would require rewriting the DB layer of every template fork. Prisma's runtime is also heavier in serverless contexts than the Neon HTTP driver. | Drizzle ORM (already in agent-native) |
| **NextAuth / Auth.js** | Tightly coupled to Next.js conventions; doesn't fit React Router v7 + H3 + agent-native's middleware model | Better-auth (already in agent-native) |
| **Lucia Auth** | In maintenance mode as of 2025 — author has publicly recommended migrating away | Better-auth |
| **Clerk / Auth0 / WorkOS** | Per-MAU pricing + extra vendor surface area; staff-auth-only context doesn't justify the cost. Member auth is the customer's existing mobile app's responsibility per project constraints. | Better-auth |
| **Drizzle 1.0-beta** | API churn risk during your 2-month ship window. The 0.45.x line is what agent-native uses and what production deployments run on today. | Drizzle `^0.45.x` — re-evaluate post-launch |
| **`drizzle-kit push`** | Drops data silently. Agent-native ships a `guard:no-drizzle-push` script for a reason. | `drizzle-kit generate` + `drizzle-kit migrate` |
| **Hosting webhooks on Vercel functions** | Cold starts + no stable egress IP break Meta's webhook retry expectations and IP-allowlist option. Stripe replays will pile up during cold-start storms. | Always-on Fly machine running the Hono app |
| **`express.json()` ahead of Stripe webhook route** | Documented footgun — destroys the raw body needed for signature verification | Hono with explicit `c.req.raw` access, or Express with raw-body middleware *before* `express.json()` |
| **`drizzle-kit` with multi-schema files spread across packages** | Agent-native expects a single drizzle config delegating to `@agent-native/core/db/drizzle-config`. Don't fragment it. | One `drizzle.config.ts` per deployable, schema lives in the app it belongs to. |
| **Building member-facing web UI** | Locked out by project scope — member surface is mobile in v1, integrated into the customer's existing RN app | Defer until post-v1; no member web portal |
| **Multi-tenant column scoping (`studio_id` everywhere)** | Locked out by tenancy decision | One Neon project per studio, no tenant column |

## Stack Patterns by Variant

**If Phase 0 audit decides "fork-clean" (preserve agent-native upstream merges):**
- Keep `@agent-native/core` as a pnpm workspace dep; never edit it in-place
- All GymClassOS-specific code lives in `apps/staff-web` (NEW), `apps/edge-webhooks` (NEW), `apps/worker` (NEW)
- The Mail/Calendar/Content/Analytics/Calorie templates are *copied into* `apps/staff-web/features/{whatsapp,schedule,kb,reports,calorie}/` then modified — original templates stay untouched in `templates/` so upstream merges can flow
- Use git remotes: `upstream = BuilderIO/agent-native`, `origin = your fork`. Periodically `git fetch upstream && git merge upstream/main` into the framework-layer branches.

**If Phase 0 audit decides "adapt" (vendoring without merge expectations):**
- Same structure but stop pretending you'll merge upstream — delete the `templates/` directory after copying out what you need
- Pin every dep explicitly (drop the `catalog:` indirection)
- Cheaper short-term, more expensive long-term

**If Phase 0 audit decides "build fresh":**
- Drop agent-native entirely. Reconsider: do you still want React Router v7? (Probably yes, for the speed-of-iteration and SSR ergonomics.) Do you still want Better-auth? (Yes — the auth analysis above is independent of the framework choice.)
- Effectively a different STACK.md. Flag for re-research if this branch is chosen.

**If background job volume per studio exceeds ~10k jobs/day after launch:**
- Re-evaluate pg-boss → BullMQ + Redis. Concrete trigger: pg-boss polling latency p95 > 2s OR Postgres write contention on the queue tables observed in slow-query logs.
- Migration path is contained: the worker subscribe/handler signature is conceptually identical between the two libraries, and `webhook_events` (the source-of-truth idempotency table) is unchanged. The change is the queue library and the addition of one Redis (Upstash on Fly).
- Until that trigger fires, the simpler choice is correct.

## Version Compatibility

| Package A | Compatible With | Notes |
|---|---|---|
| React 19.2.x | React Router v7.13+ | Confirmed in agent-native templates |
| React Router v7 (framework mode) | Vite 6.x | Required pairing; Vite 5 will not work |
| React Router v7 (framework mode) | Vercel (`@vercel/react-router` adapter) | Officially supported per Vercel changelog 2025 |
| Drizzle ORM 0.45.x | `@neondatabase/serverless` 1.x | First-class via `drizzle-orm/neon-http` and `drizzle-orm/neon-serverless` |
| Drizzle Kit 0.31.x | Drizzle ORM 0.45.x | Same release line agent-native pins |
| Tailwind v4 | shadcn/ui (latest CLI) | shadcn officially documented Tailwind v4 support |
| Better-auth 1.6.x | React Router v7 + H3 | Used in this exact combo by agent-native — confirm at Phase 0 by reading `runAuthGuard` source in `@agent-native/core/server` |
| `@great-detail/whatsapp` 9.x | Node 22+ | Will not run on Node 20 LTS — pin Fly machine to Node 22 (or Bun 1.2+) |
| Hono 4.x | Node 22+ on Fly | Works on Node 20 too, but match the WhatsApp SDK's Node 22 requirement and standardise |
| pg-boss 10.x | Postgres 11+ (Neon satisfies) | Auto-creates its own `pgboss` schema on `boss.start()`; runs alongside the application schema in the same Neon project |
| Stripe Node SDK 17.x | Stripe API version pinned in `apiVersion` constructor option | Always pin `apiVersion` explicitly; never let it float |

## Confidence Notes (Read Before Locking Any Choice)

- **HIGH** confidence in the framework layer (React Router v7 + Vite + Drizzle + Better-auth + H3) — verified by direct inspection of `BuilderIO/agent-native` package.json files and template configs.
- **HIGH** confidence in Tailwind v4 + Radix + shadcn — agent-native uses Radix + Tailwind already; shadcn is additive.
- **HIGH** confidence on Stripe SDK + webhook pattern — Stripe's official docs are authoritative.
- **MEDIUM** confidence on `@great-detail/whatsapp` — official Meta SDK is dead; the fork is the best option, but it's a single-maintainer project. **Mitigation**: at Phase 0, fork the package to your own GitHub org as insurance, and write the webhook signature verification + send-template paths in such a way that swapping to hand-rolled Graph API calls is a one-file change.
- **HIGH** confidence on **pg-boss as v1 queue** — locked in 2026-05-17. Trades BullMQ's mature primitives for the operational simplicity of eliminating Redis. Re-evaluation trigger documented in §Stack Patterns by Variant ("If background job volume per studio exceeds ~10k jobs/day").
- **MEDIUM** confidence on **Vercel deployment of React Router v7 framework mode** — Vercel officially supports it (per changelog) but the community thread "React Router v7 with middleware fails on Vercel" shows there are edge cases with v7's middleware feature. **Action**: at Phase 0, deploy a hello-world React Router v7 + Better-auth app to Vercel before committing to the architecture.
- **LOW-MEDIUM** confidence on the **exact React Router v7 patch version** — the 7.x line is moving fast. Pin to whatever `BuilderIO/agent-native@main` currently uses at fork time.

## Sources

- `BuilderIO/agent-native` repository (web-inspected 2026-05-17):
  - `packages/core/package.json` — confirmed Better-auth ^1.6.0, Drizzle ORM ^0.45.2, `@neondatabase/serverless` ^1.1.0, H3 ^2.0.x, Tailwind v4 peer, React 19.2.x
  - `templates/mail/package.json` — React Router 7.13.1, Vite, Tiptap, React Hook Form, Zod 4, Radix UI, Lucide, Sonner
  - `templates/mail/react-router.config.ts` — SSR enabled, `appDirectory: "app"`, route discovery initial
  - `templates/mail/vite.config.ts` — uses `reactRouter()` from `@react-router/dev/vite`; Cloudflare-tuned but framework-portable
  - `templates/mail/drizzle.config.ts` — delegates to `createDrizzleConfig()` from `@agent-native/core/db/drizzle-config`
  - `templates/mail/server/middleware/auth.ts` — delegates to `runAuthGuard` from `@agent-native/core/server` (Better-auth)
- React Router v7 docs (`reactrouter.com/start/modes`, `reactrouter.com/start/framework/deploying`) — framework mode + Vercel deploy support
- Vercel changelog "Support for React Router v7" — confirmed first-class support
- Drizzle ORM docs (`orm.drizzle.team/docs/connect-neon`, `orm.drizzle.team/docs/latest-releases`) — neon-http + neon-websockets drivers; 0.45.x is current stable, 1.0-beta exists but is not production-recommended yet
- `WhatsApp/WhatsApp-Nodejs-SDK` Issue #31 "Pausing Development of the WhatsApp SDK" — confirmed official SDK is dead
- `@great-detail/whatsapp` npm + GitHub — v9.0.0 dated 2026-04-17, Cloud API v23, includes `verifySignature` and template messaging
- Stripe docs (`docs.stripe.com/webhooks/signature`, `docs.stripe.com/webhooks/quickstart?lang=node`) — `stripe.webhooks.constructEvent()` is the only correct pattern
- Better-auth docs + 2026 comparison surveys (PkgPulse, BuildPilot) — Better-auth is the current state of the art for self-hosted auth, Lucia confirmed in maintenance mode
- shadcn/ui docs (`ui.shadcn.com/docs/installation/react-router`, `ui.shadcn.com/docs/tailwind-v4`) — first-class React Router v7 and Tailwind v4 support
- Fly.io docs (`fly.io/docs/blueprints/work-queues/`) — Fly's documented queue patterns include BullMQ + Redis; pg-boss is the lighter alternative when the application is already on Postgres
- pg-boss docs (`github.com/timgit/pg-boss/blob/master/docs/readme.md`) — `boss.start()`, `boss.send()`, `boss.work()`, `singletonKey`, `sendAfter`, schedule API
- Hono docs (`hono.dev`) + Express vs Hono 2026 surveys — Hono is the TS-native default for new webhook receivers
- Better Stack + Axiom Vercel/Fly integration docs — both supported; Better Stack lower-friction at GymClassOS volume

---

*Stack research for: boutique fitness studio management platform (GymClassOS)*
*Researched: 2026-05-17*
*Confidence: HIGH for framework stack and pg-boss queue choice; MEDIUM for WhatsApp client (single-maintainer mitigation in §What NOT to Use)*
