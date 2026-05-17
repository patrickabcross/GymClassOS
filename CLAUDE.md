<!-- GSD:project-start source:PROJECT.md -->
## Project

**GymOS**

GymOS is a boutique fitness studio management platform — staff web app, member mobile features, and direct integrations with WhatsApp Business API and Stripe — built by adapting Builder.io's MIT-licensed `agent-native` framework into a vertical product. The first deployment is a signed gym studio customer; the same fork pattern is intended to seed future verticals in other industries.

**Core Value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp conversations + class bookings + member context), and members book / pay / log activity from the studio's existing mobile app — without staff cobbling together WhatsApp, calendar, and CRM tools.

### Constraints

- **Tech stack — Postgres:** Neon (managed Postgres). CLI and MCP server installed locally.
- **Tech stack — Web:** Vercel hosting + TypeScript end-to-end.
- **Tech stack — Long-running services / webhooks:** Fly.io. WhatsApp inbound webhook and Stripe webhook receivers live here; stateless API routes can live on Vercel.
- **Tech stack — Mobile:** TypeScript on top of the customer's existing React Native app (Expo vs bare workflow determined by that codebase, confirmed at Phase 3 planning time).
- **Tech stack — Nutrition data:** OpenFoodFacts (free, packaged-food focus, no API key required) for the calorie counter; LLM fills gaps for natural-language descriptions it can't match.
- **Timeline:** Hard deadline under 2 months from 2026-05-17 — target ship date on or before **2026-07-15** for Phases 0-2 (v1). Phases 3-5 follow after first customer is live. *This is aggressive for solo work; every differentiator must justify its cost against this deadline.*
- **Compliance — PCI:** Card data never stored anywhere other than Stripe. Tokenised customer / subscription IDs only.
- **Compliance — Meta:** Outbound WhatsApp messages outside the 24h window must use an approved template; non-template sends out of window MUST be rejected at the sender layer (not just discouraged in UI).
- **Reliability — Stripe webhooks:** Handlers MUST be idempotent. Stripe replays events out of order and retries on transient failures; non-idempotent handlers silently corrupt member/pass/payment state.
- **Distribution — Mobile:** No new App Store / Play Store submissions in this project. Mobile work is updates to the customer's existing app under their existing developer accounts.
- **Architecture — Tenancy:** Single-tenant code, multi-tenant deploy. No `studio_id` in schema, no tenant scoping in queries.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## The Single Most Important Finding (Read This First)
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
| **Stripe Node SDK** | `^17.x` (latest stable — verify the exact patch at install time; pin to the version that matches your target API version) | Payments | Use `stripe.webhooks.constructEvent()` — never hand-roll HMAC. Use Stripe Connect (OAuth) so studios authorise GymOS onto their *existing* account. |
| **`@great-detail/whatsapp`** | `^9.x` (April 2026) | WhatsApp Cloud API client | **Critical**: Meta's official `WhatsApp/WhatsApp-Nodejs-SDK` was paused (see Issue #31, "Pausing Development of the WhatsApp SDK"). `@great-detail/whatsapp` is the maintained fork. Tracks Cloud API v23, ships TS types, ESM + CJS, includes `event.verifySignature(appSecret)` for webhook validation. **Confidence: MEDIUM** — depends on a single maintainer; mitigation in the "What NOT to Use" section below. |
| **Hono** | `^4.x` | The Fly.io webhook receiver app + the Fly.io background worker's tiny admin HTTP surface | Hono is the right TS-native choice for the *Fly.io side* (which is a *separate* app from the React Router app on Vercel). Tiny bundle, first-class TS, easy raw-body handling for Stripe and WhatsApp signature verification. Do *not* use Hono for the staff web app — that's React Router. |
| **BullMQ** | `^5.x` | Background job queue on Fly.io | Industry-standard Node queue. Pairs with Redis. Workers run as a separate Fly machine. Used for: outbound WhatsApp send queue, Stripe webhook idempotent post-processing, class reminder scheduling. |
| **Upstash for Redis** (via Fly) | latest | Redis for BullMQ | Provisioned with `fly redis create` — runs inside the Fly org, private network, no public Redis exposure. Fixed-price plan (start at $10/mo / 250MB) because BullMQ is chatty and PAYG will surprise you. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---|---|---|---|
| **Tailwind CSS** | `^4.x` | Styling | Already in agent-native; v4 is the version `@agent-native/core` peers against |
| **shadcn/ui** | latest CLI (no semver — copy-in components) | UI components | shadcn officially supports React Router v7 (`ui.shadcn.com/docs/installation/react-router`). Already aligned with agent-native's Radix + Tailwind + CVA stack — `shadcn add` should drop in cleanly without ejecting existing Radix usages. Use to fill gaps where agent-native's components don't cover GymOS-specific surfaces (forms, data tables, calendars beyond what's in the Calendar template). |
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
# Inside the fork — packages added for GymOS-specific surfaces
# Dev-only additions
## The Three Apps You're Actually Deploying
| App | Where | What | Why there |
|---|---|---|---|
| **`apps/staff-web`** (forked from agent-native templates: Mail → WhatsApp client, Calendar → class schedule, Content → KB, Analytics → reporting, Calorie tracker → calorie counter) | Vercel | React Router v7 SSR app — staff login, WhatsApp inbox, schedule, member directory, reports | Stateless, edge/serverless-friendly. Vercel's React Router v7 support (`@vercel/react-router` adapter) is first-class. |
| **`apps/edge-webhooks`** (new — Hono) | Fly.io (single small machine, always on) | Receives Meta WhatsApp inbound webhooks and Stripe webhooks. Verifies signatures. Enqueues to BullMQ. Returns 200 within Meta's/Stripe's tight timeout windows. | Vercel functions are *fine for Stripe* but Meta WhatsApp webhooks need a permanently warm endpoint with a stable IP for Meta's allowlist — Fly is the right home. Co-locating Stripe here too keeps idempotency state in one Redis. |
| **`apps/worker`** (new — Node BullMQ workers) | Fly.io (same Fly app or sibling) | Processes the BullMQ queues: outbound WhatsApp sender (enforces 24h window + template gate), Stripe event reducer, class-reminder scheduler | Long-running, needs persistent process + Redis. Vercel cron is too coarse for reminder windows. |
## Server Actions vs API Routes — Use Loaders + Actions
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
| BullMQ + Redis on Fly | Inngest (managed) | Inngest is excellent and tempting for solo devs, but it's a *third-party SaaS* — adds another vendor, another billing relationship, and routes job execution through their cloud. For a per-studio deploy model this means N Inngest projects to manage. BullMQ on Fly stays inside the Fly app boundary and matches the one-deploy-per-studio mental model. Reconsider Inngest if you ever centralise multi-studio observability. |
| BullMQ + Redis on Fly | Trigger.dev | Same trade as Inngest, plus Trigger.dev shines for *long, complex multi-step workflows* — overkill for the current job set (send a message, idempotency-check an event, schedule a reminder). |
| BullMQ + Redis on Fly | pg-boss (Postgres-backed queue, no Redis) | Genuinely viable for a low-volume v1 and would remove the Redis dependency. **If the Phase 0 audit finds Redis ops a meaningful burden, switch to pg-boss.** Marked LOW-MEDIUM confidence; revisit at Phase 2 milestone planning. |
| BullMQ + Redis on Fly | Native Node `setInterval` / Vercel Cron | Insufficient — reminders need per-class scheduling, WhatsApp sender needs queue retries + rate limits. |
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
- Keep `@agent-native/core` as a pnpm workspace dep; never edit it in-place
- All GymOS-specific code lives in `apps/staff-web` (NEW), `apps/edge-webhooks` (NEW), `apps/worker` (NEW)
- The Mail/Calendar/Content/Analytics/Calorie templates are *copied into* `apps/staff-web/features/{whatsapp,schedule,kb,reports,calorie}/` then modified — original templates stay untouched in `templates/` so upstream merges can flow
- Use git remotes: `upstream = BuilderIO/agent-native`, `origin = your fork`. Periodically `git fetch upstream && git merge upstream/main` into the framework-layer branches.
- Same structure but stop pretending you'll merge upstream — delete the `templates/` directory after copying out what you need
- Pin every dep explicitly (drop the `catalog:` indirection)
- Cheaper short-term, more expensive long-term
- Drop agent-native entirely. Reconsider: do you still want React Router v7? (Probably yes, for the speed-of-iteration and SSR ergonomics.) Do you still want Better-auth? (Yes — the auth analysis above is independent of the framework choice.)
- Effectively a different STACK.md. Flag for re-research if this branch is chosen.
- Drop BullMQ, drop Redis, use `pg-boss` (Postgres-backed queue) on the existing Neon instance
- Removes a service. Loses some queue-features (less mature rate limiting, no built-in priority lanes) but the simplicity wins at low volume.
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
| BullMQ 5.x | Redis 6.2+ (Upstash satisfies) | Use a fixed-price Upstash plan, not PAYG |
| Stripe Node SDK 17.x | Stripe API version pinned in `apiVersion` constructor option | Always pin `apiVersion` explicitly; never let it float |
## Confidence Notes (Read Before Locking Any Choice)
- **HIGH** confidence in the framework layer (React Router v7 + Vite + Drizzle + Better-auth + H3) — verified by direct inspection of `BuilderIO/agent-native` package.json files and template configs.
- **HIGH** confidence in Tailwind v4 + Radix + shadcn — agent-native uses Radix + Tailwind already; shadcn is additive.
- **HIGH** confidence on Stripe SDK + webhook pattern — Stripe's official docs are authoritative.
- **MEDIUM** confidence on `@great-detail/whatsapp` — official Meta SDK is dead; the fork is the best option, but it's a single-maintainer project. **Mitigation**: at Phase 0, fork the package to your own GitHub org as insurance, and write the webhook signature verification + send-template paths in such a way that swapping to hand-rolled Graph API calls is a one-file change.
- **MEDIUM** confidence on **BullMQ vs pg-boss** — BullMQ is more capable but pg-boss is simpler. Final call should depend on actual job volume estimates from REQUIREMENTS.md. Flag for Phase 2 plan-time revisit.
- **MEDIUM** confidence on **Vercel deployment of React Router v7 framework mode** — Vercel officially supports it (per changelog) but the community thread "React Router v7 with middleware fails on Vercel" shows there are edge cases with v7's middleware feature. **Action**: at Phase 0, deploy a hello-world React Router v7 + Better-auth app to Vercel before committing to the architecture.
- **LOW-MEDIUM** confidence on the **exact React Router v7 patch version** — the 7.x line is moving fast. Pin to whatever `BuilderIO/agent-native@main` currently uses at fork time.
## Sources
- `BuilderIO/agent-native` repository (web-inspected 2026-05-17):
- React Router v7 docs (`reactrouter.com/start/modes`, `reactrouter.com/start/framework/deploying`) — framework mode + Vercel deploy support
- Vercel changelog "Support for React Router v7" — confirmed first-class support
- Drizzle ORM docs (`orm.drizzle.team/docs/connect-neon`, `orm.drizzle.team/docs/latest-releases`) — neon-http + neon-websockets drivers; 0.45.x is current stable, 1.0-beta exists but is not production-recommended yet
- `WhatsApp/WhatsApp-Nodejs-SDK` Issue #31 "Pausing Development of the WhatsApp SDK" — confirmed official SDK is dead
- `@great-detail/whatsapp` npm + GitHub — v9.0.0 dated 2026-04-17, Cloud API v23, includes `verifySignature` and template messaging
- Stripe docs (`docs.stripe.com/webhooks/signature`, `docs.stripe.com/webhooks/quickstart?lang=node`) — `stripe.webhooks.constructEvent()` is the only correct pattern
- Better-auth docs + 2026 comparison surveys (PkgPulse, BuildPilot) — Better-auth is the current state of the art for self-hosted auth, Lucia confirmed in maintenance mode
- shadcn/ui docs (`ui.shadcn.com/docs/installation/react-router`, `ui.shadcn.com/docs/tailwind-v4`) — first-class React Router v7 and Tailwind v4 support
- Fly.io docs (`fly.io/docs/blueprints/work-queues/`, `fly.io/docs/upstash/redis/`) — BullMQ + Upstash Redis is the official pattern; fixed-price plans recommended
- Hono docs (`hono.dev`) + Express vs Hono 2026 surveys — Hono is the TS-native default for new webhook receivers
- Better Stack + Axiom Vercel/Fly integration docs — both supported; Better Stack lower-friction at GymOS volume
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
