---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: D0 complete except Vercel deploy; D1 inbox surface shipped ahead of schedule
last_updated: "2026-05-19T07:15:54.770Z"
last_activity: 2026-05-19 -- Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2 execution started
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 20
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-17 — major scope revision late in day)
Vision reference: `.planning/research/PLATFORM-VISION.md` (forward-looking; not architecture-of-record)
Roadmap: `.planning/ROADMAP.md` (two-milestone shape: Demo Sprint week 1 + Production v1 weeks 2-9)
Requirements: `.planning/REQUIREMENTS.md` (130 reqs across 20 categories — see [D] / [P] / [D+P] tags)

**Core value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android Expo app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent.

**Current focus:** Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2 — 4

## Current Position

Milestone: Demo Sprint (1 of 2) — Week 1 (by ~2026-05-24)
Phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2 (4) — EXECUTING
Plan: 1 of 4
Status: Executing Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2
Last activity: 2026-05-19 -- Phase D1-staff-surfaces-adapted-from-mail-calendar-days-2 execution started

Progress: Demo Sprint [██░░░░░░░░] ~20%

### Demo Sprint detail

| Step | Status | Notes |
|---|---|---|
| **D0.1** Fork agent-native | ✓ committed `98c0e926` | Merged `upstream/main` with `--allow-unrelated-histories`; CLAUDE.md conflict resolved (symlink → text with @AGENTS.md include) |
| **D0.2** pnpm install + boot | ✓ | pnpm upgraded to 10.29.1 via `npm i -g`; install took ~12min; Mail boots on `:8081`, 19 framework migrations auto-applied to Neon |
| **D0.3** Neon provisioned | ✓ | Project: **gymos-demo** (id: `billowing-sun-51091059`); connection in `.env.local` (gitignored) |
| **D0.4** Schema + seed | ✓ committed (schema) | 12 GymOS tables created in Neon via `mcp__Neon__run_sql_transaction`; seeded 5 members / 5 conversations / 12 messages / 3 class defs / 7 occurrences / 5 passes / 5 food items / 5 food entries |
| **D0.5** Vercel deploy | ⏳ PENDING | Needs `vercel login` (interactive — Vercel CLI already installed; user is `patrickalexanderross-3109`); needs `NITRO_PRESET=vercel` env var; Mail template currently configured for Netlify (`netlify.toml`). See "Resume notes" below. |
| **D1 inbox surface** | ✓ committed `a52af154` | `/gymos` route — list of conversations + selected thread + member context panel (the differentiator); demo-quality (reply persists to DB but stubs Meta call) |
| **D1 schedule surface** | Not started | `/gymos/schedule` weekly calendar from 7 seeded occurrences |
| **D1 members directory** | Not started | `/gymos/members` + `/gymos/members/:id` profile |
| **D2 member mobile app** | Not started | Fork `packages/mobile-app` (Expo 55 + RN 0.83.9) |
| **D2 calorie counter** | Not started | Build fresh in mobile-app, OFF + USDA data sources |
| **D2 in-app agent** | Not started | 3 tools min: `greet`, `book_class`, `log_food_nl` |

### Production v1 detail

Not started — Demo Sprint runs first. See ROADMAP.md for the 4 production phases (P0 audit / P1a data foundation / P1b webhook spine / P2 product surfaces).

## Performance Metrics

**Velocity:**

- Total commits this session: 8 (planning + execution mixed)
- Schema changes: 12 GymOS tables added (composing on top of 32 framework tables = 44 total in Neon)
- Routes built: 1 demo-quality (`/gymos`)
- Files added: ~3500 from upstream merge + 1 new GymOS route + 1 auth-bypass edit + schema additions

**Time spent:**

- Scope reconciliation + planning artifact rewrites: ~60% of session
- Actual code (fork + schema + seed + route): ~40%

**Lesson for next session:** scope was reconciled twice mid-session (PWA decision reversed when `packages/mobile-app` discovered upstream). Catch upstream-survey findings BEFORE locking architectural decisions next time — saved scope-locking costs ~15 min of doc rewrites both times.

## Accumulated Context

### Decisions

Decisions are logged in `PROJECT.md` Key Decisions table. Recent ones affecting current work:

- **2026-05-17 (mid-session) — Two-milestone restructure:** Demo Sprint (week 1) + Production v1 (weeks 2-9). Demo deliberately cuts corners (skipped atomic transactions, hardcoded data on non-golden paths, single-studio config). Production rebuilds every corner-cut.
- **2026-05-17 (mid-session) — Stripe direct restricted-API-key (NOT Connect):** Studio owns merchant relationship. No application_fee / no deauth handler.
- **2026-05-17 (mid-session) — pg-boss on Neon (NOT BullMQ + Redis):** Queue lives in same Neon DB; no Redis service.
- **2026-05-17 (mid-session) — Calorie counter built fresh (NOT fork OpenNutriTracker):** OpenNutriTracker is Flutter + GPL v3 — incompatible.
- **2026-05-17 (late) — Member surface = Expo fork of `packages/mobile-app`** (NOT web PWA as decided earlier same day). Discovered upstream has a full Expo 55 + Expo Router + RN 0.83.9 mobile app — that's the fork target. Reverses the mid-session PWA-only decision.
- **2026-05-17 (executing D0) — Demo-time fork-boundary loosened:** For demo speed, we edit inside `templates/mail/` directly instead of copy-out to `apps/staff-web/features/`. Post-demo refactor (P0 audit task) will move to the proper fork-boundary layout.

### Pending Todos

None tracked as TODOs; everything is in the roadmap / requirements.

### Blockers/Concerns

**Demo Sprint blockers:**

- **Vercel deploy needs interactive `vercel login`** — user is authenticated locally (`vercel whoami` = `patrickalexanderross-3109`), so this just means running `vercel link` + `vercel deploy` from inside `templates/mail/` after setting `NITRO_PRESET=vercel`. See Resume Notes below.
- **`NITRO_PRESET=vercel` + Mail's `netlify.toml`** — Mail template is preset for Netlify. Need to either set `NITRO_PRESET=vercel` in Vercel project env vars (and possibly add a `vercel.json`), OR deploy to Netlify instead. Decision deferred to next session.
- **Better-auth Google OAuth not configured** — Mail's auth plugin is `googleOnly: true`. We bypassed by adding `/gymos` to `publicPaths` for the demo. Member-side auth (PWA login) will need either: flip `googleOnly: false` and use email/password, OR add WhatsApp-OTP, OR set up Google OAuth proper. Decision in P1a.
- **WhatsApp send doesn't actually call Meta** — `/gymos` reply form persists to DB but doesn't call WhatsApp Cloud API. The single `sendMessage()` chokepoint with 24h-window + opt-in gate is Phase P1b work.

**Customer-facing blockers (Phase P0 of Production v1):**

- Customer's Stripe account creation + restricted API key generation (customer task)
- Customer's Meta Business Account setup + WhatsApp number readiness check (customer task)
- WhatsApp template approvals (≤48h Meta lead time — submit early in P0)

**General concerns:**

- ODbL attribution for Open Food Facts (`CAL-11`) — need to display attribution in calorie counter UI
- PWA web push on iOS 16.4+ — N/A now since mobile is native Expo, not PWA

## Session Continuity

Last session: 2026-05-17 (single very long session — multiple major scope pivots + actual fork + schema + seed + first demo route)
Stopped at: D0 complete except Vercel deploy; D1 inbox surface shipped ahead of schedule
Resume file: None — STATE.md + git log is sufficient

### Resume Notes — Next Session Quick-Start

**Re-orient:**

```bash
cd C:/Users/dimet/hustle
git log --oneline -10              # see what shipped this session
cat .planning/STATE.md             # see this file
cat .planning/ROADMAP.md           # full demo sprint + production v1 plan
```

**Boot the framework locally:**

```bash
pnpm --filter mail dev             # Vite SSR on :8081 (port 8080 taken on this machine)

# → open http://localhost:8081/gymos

# → click any conversation; member context panel renders on the right

# → typing a reply persists to Neon but doesn't call Meta yet

```

**Vercel deploy (the unfinished D0.5):**

```bash

# From templates/mail/:

cd templates/mail
vercel link                                              # interactive — pick gymos-demo or create

# Set env vars in Vercel dashboard OR via CLI:

vercel env add DATABASE_URL                              # paste pooled Neon URL
vercel env add BETTER_AUTH_SECRET                        # generate or paste from .env.local
vercel env add BETTER_AUTH_URL                           # the Vercel preview URL
vercel env add NITRO_PRESET production                   # set to "vercel"

# Mail template has netlify.toml — may need vercel.json to override.

# Nitro presets: https://nitro.unjs.io/deploy/providers/vercel

vercel deploy --prod
```

Likely needs a `vercel.json` at templates/mail/ root:

```json
{
  "buildCommand": "cd ../.. && pnpm install && pnpm --filter mail build",
  "outputDirectory": ".vercel/output",
  "framework": null,
  "env": { "NITRO_PRESET": "vercel" }
}
```

**Pick up D1 surfaces (after Vercel deploy):**

1. **Schedule view** — copy the pattern from `templates/mail/app/routes/gymos.tsx`; new file `gymos.schedule.tsx`; query `class_occurrences` + join `class_definitions`; render as week grid. The 7 seeded occurrences cover Sun May 18 → Fri May 22.
2. **Members directory** — `gymos.members.tsx` (list) + `gymos.members.$id.tsx` (profile). Profile shows bookings + passes + recent food + conversation link.
3. **Booking action** — let coach book a member into an occurrence from /gymos/members/:id. Demo-grade SELECT + INSERT (no atomic capacity check yet).

**Pick up D2 (member mobile app):**

1. Inspect `packages/mobile-app/` — what's already there
2. Fork via copy or in-place mods. Configure Expo Go.
3. Wire member auth (stub for demo) + booking screen + calorie counter (OFF API) + agent chat
4. Get an Expo Go QR code in front of the customer

**Pick up Production v1 (weeks 2-9):**

After demo lands and customer feedback comes back, run P0 audit → P1a data foundation → P1b webhook spine → P2 full product. See ROADMAP.md.

### Files Touched This Session

```
.planning/PROJECT.md              # full rewrite + late-session mobile reversal patch
.planning/REQUIREMENTS.md         # full rewrite — 130 reqs in two-milestone shape
.planning/ROADMAP.md              # full rewrite — Demo Sprint + Production v1
.planning/STATE.md                # this file
.planning/research/PLATFORM-VISION.md     # NEW — vision doc saved as reference
.planning/research/STACK.md       # BullMQ → pg-boss + Stripe direct refresh
.planning/research/ARCHITECTURE.md # BullMQ → pg-boss + topology refresh
.planning/research/SUMMARY.md     # staleness banner
.planning/research/PITFALLS.md    # staleness banner + Pitfall #20 reframe
.planning/research/FEATURES.md    # BullMQ → pg-boss in dep notes

templates/mail/server/db/schema.ts            # GymOS domain tables added
templates/mail/server/db/migrations/          # Drizzle-generated SQL
templates/mail/server/plugins/auth.ts         # publicPaths: ["/gymos"] for demo
templates/mail/app/routes/gymos.tsx           # NEW — WhatsApp inbox demo route
templates/mail/.env.local                     # gitignored — Neon DSN
.env.local                                    # gitignored — workspace-level env

CLAUDE.md                          # resolved upstream symlink conflict

+ ~3500 files from upstream merge (templates/, packages/, .agents/, etc.)

```

Memory files updated (in `~/.claude/projects/C--Users-dimet-hustle/memory/`):

- `project_gymos.md` — refreshed (mobile = Expo, RR v7 + Drizzle + Better-auth, Stripe direct)
- `project_gymos_mobile.md` — reversed twice; final: Expo fork of `packages/mobile-app`
- `project_gymos_stack.md` — pg-boss, Stripe direct, Expo native mobile
- `project_gymos_timeline.md` — two-milestone shape
- `project_gymos_roadmap.md` — Demo Sprint + Production v1
- `MEMORY.md` — index entries updated
