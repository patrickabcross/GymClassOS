---
phase: P1b.1-customer-pilot-enablement
plan: 04
subsystem: api
tags: [drizzle, neon, whatsapp-templates, actions, postgres, seed]

requires:
  - phase: P1b
    provides: stripe_subscriptions + passes + whatsapp_templates Neon tables (P1b-02 migration)
  - phase: P1b.1
    provides: Plan 03 defineAction pattern (list-fill-rate / list-classes / list-members) — same import style and guard:allow-unscoped marker

provides:
  - GET /_agent-native/actions/list-renewals (active subscriptions + expiring pass aggregation)
  - GET /_agent-native/actions/list-at-risk-members (declining attendance / lapsed-pass churn risk)
  - whatsapp_templates table seeded with 5 rows (hello_world approved + 4 named templates pending)
  - apps/staff-web/package.json db:seed-templates script (idempotent)

affects:
  - P1b.1-05 (Templates dialog) — needs the seeded whatsapp_templates rows + the hello_world approved row
  - P1b.1-07 (Gym agent surface) — list-renewals + list-at-risk-members answer 2 of 3 chip prompts
  - P1b-09 (WhatsApp template sync cron) — replaces seeded pending rows once Meta approves

tech-stack:
  added: [dotenv (already a dev dep)]
  patterns:
    - "Standalone tsx scripts loading .env.local before dynamic-importing @agent-native/core/db (avoids module-eval ordering and DATABASE_URL-undefined errors)"
    - "Drizzle onConflictDoNothing on text PK for idempotent seeds against Postgres"
    - "Single-query subselects + Drizzle ${...} parameter binding for per-row aggregations (no N+1, no SQL string concat)"

key-files:
  created:
    - apps/staff-web/actions/list-renewals.ts
    - apps/staff-web/actions/list-at-risk-members.ts
    - apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts
  modified:
    - apps/staff-web/package.json (added db:seed-templates script)

key-decisions:
  - "whatsapp_templates.category seeded as lowercase ('utility') to match the Drizzle enum constraint in schema.ts. Meta API returns uppercase, but the WA-08 sync cron in P1b-09 will normalize on ingest."
  - "passes table has no status column in apps/staff-web schema — at-risk + renewals filter on expires_at IS NOT NULL AND >= now, treating presence + future-expiry as 'active'. The pass_debits ledger is the source of truth for activity, not a flag."
  - "Seed script uses dynamic import after dotenv.config() instead of static import — guarantees DATABASE_URL is present before @agent-native/core/db's lazy init kicks off."

patterns-established:
  - "Pattern: idempotent Neon seed scripts live in apps/staff-web/server/db/seeds/seed-<name>.ts and are exposed via pnpm db:seed-<name>. Load .env.local then .env via dotenv, then dynamic-import the db module. Always end with process.exit(0) so the Neon pool releases."
  - "Pattern: count() aggregations on gym tables use [row] = await db.select({ c: count() }).from(table).where(...) — single-row array destructure, Number(row?.c ?? 0) at the boundary, no manual COUNT(*) SQL strings."

requirements-completed: [AGENT-05, WA-05]

duration: ~35min
completed: 2026-05-25
---

# Phase P1b.1 Plan 04: Gym Actions and Template Seed Summary

**Two churn-context actions (`list-renewals`, `list-at-risk-members`) + idempotent seed of 5 `whatsapp_templates` rows (hello_world approved, 4 named templates pending) — agent now answers all three chip prompts, Templates dialog has day-one data.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-25T21:49Z (parallel with Plan 03)
- **Completed:** 2026-05-25T22:04Z
- **Tasks:** 3
- **Files modified:** 4 (3 created + 1 edited)

## Accomplishments

- `list-renewals` returns `{activeSubscriptions, subscriptionsRenewingNext30d, expiringPasses7d, expiringPasses30d, asOf}` — answers "Provide renewal numbers" chip
- `list-at-risk-members` returns sorted array of churn-risk members (declining attendance OR no 30d bookings OR pass expiring ≤14 days) — answers "Which customers should I reach out to?" chip
- `whatsapp_templates` seeded with `hello_world` (approved) + `class_reminder` / `waitlist_offer` / `payment_failed` / `pass_expiring` (all pending), all with parseable `components_json` containing `{{N}}` placeholders
- Seed script proven idempotent via two consecutive runs (5 rows after each)

## Task Commits

1. **Task 1: Create list-renewals.ts** — `c43cf8a7` (feat)
2. **Task 2: Create list-at-risk-members.ts** — `90d7ba4d` (feat)
3. **Task 3: Seed whatsapp_templates + db:seed-templates script** — `1d55b43c` (feat)

## Files Created/Modified

- `apps/staff-web/actions/list-renewals.ts` — 69 lines. Four `count()` queries against `stripeSubscriptions` + `passes`. GET-only, no accessFilter.
- `apps/staff-web/actions/list-at-risk-members.ts` — 106 lines. Single-query subselects for last-attended (joins `class_occurrences`), 30d booking count, earliest unexpired pass expiry. At-risk filter + sort applied in code (small pilot member counts).
- `apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts` — 130 lines. Loads `.env.local` + `.env` via dotenv, dynamic-imports `../index.js`, loops `SEED_ROWS` with `.onConflictDoNothing({target: schema.whatsappTemplates.name})`. Ends with `process.exit(0)`.
- `apps/staff-web/package.json` — added `"db:seed-templates": "tsx server/db/seeds/seed-whatsapp-templates.ts"`.

## Decisions Made

- **Lowercase template categories.** Schema enum is `["utility", "marketing", "authentication"]` (lowercase). Plan template used uppercase `UTILITY` because that's what Meta returns. Chose schema-correct lowercase here; P1b-09 sync cron will lowercase on ingest from Meta.
- **No `passes.status` filter.** `apps/staff-web/server/db/schema.ts` `passes` has no `status` column (only `granted/source/expiresAt/...`). Used `expires_at IS NOT NULL AND >= now` as the "active" proxy. Future P2 schema work may add explicit status; this keeps the action correct today.
- **Dynamic import after env load** in the seed script. Static `import` would evaluate `@agent-native/core/db`'s module body before `dotenv.config()` returned, causing `DATABASE_URL` checks to fail under tsx. Matches the existing `manage-automations.ts` pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed non-existent `eq(passes.status, 'active')` filter from list-renewals**
- **Found during:** Task 1 (list-renewals)
- **Issue:** Plan template assumed `passes.status` enum column that doesn't exist in `apps/staff-web/server/db/schema.ts`. TypeScript would have errored on `schema.passes.status`.
- **Fix:** Dropped the status filter; rely on `expires_at IS NOT NULL AND >= now` as the active proxy.
- **Files modified:** `apps/staff-web/actions/list-renewals.ts`
- **Verification:** `pnpm typecheck` exit 0; manual Neon query confirms expected rows would be counted.
- **Committed in:** `c43cf8a7`

**2. [Rule 1 - Bug] Adapted at-risk action to `firstName`/`lastName` schema**
- **Found during:** Task 2 (list-at-risk-members)
- **Issue:** Plan template returned `{name: schema.gymMembers.name}`. Schema has `firstName` + `lastName`, no single `name` column.
- **Fix:** Selected both columns, concatenated into `name` in the post-query `.map()`. Matches the pattern in `list-members.ts` from Plan 03.
- **Files modified:** `apps/staff-web/actions/list-at-risk-members.ts`
- **Verification:** `pnpm typecheck` exit 0.
- **Committed in:** `90d7ba4d`

**3. [Rule 1 - Bug] Lowered template categories to match schema enum**
- **Found during:** Task 3 (seed script)
- **Issue:** Plan specified `category: "UTILITY"` etc. Schema enum is lowercase `["utility", "marketing", "authentication"]`. TypeScript would have errored on the values.
- **Fix:** Used lowercase `"utility"` for all five seed rows.
- **Files modified:** `apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts`
- **Verification:** `pnpm typecheck` exit 0; `pnpm db:seed-templates` exit 0 with all 5 rows inserted.
- **Committed in:** `1d55b43c`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bug fixes to align plan text with the actual `apps/staff-web` schema).
**Impact on plan:** All three deviations were schema mismatches in the plan template, not scope changes. Functionality and intent preserved exactly.

## Issues Encountered

- **getDb() in standalone tsx scripts.** Plan called out potential need for a direct `drizzle(neon(...))` client. Resolved cleanly: loading `.env.local`+`.env` via dotenv first, then dynamic-importing `../index.js` after the env is ready, let the existing `createGetDb()` lazy-proxy + Neon driver path work without any custom client construction.
- **Verification SSL warning from pg.** `pg` prints a libpq-compat warning when SSL mode is `require` (not `verify-full`). Cosmetic only; queries succeed. The pooled Neon URL in `.env.local` uses `sslmode=require` which is correct for Neon's connection pool; production hardening can switch to `verify-full` later.

## Sample Output

`list-renewals` (current Neon state — D2-era seed data; no Stripe subscriptions or pass expiries seeded yet):
```json
{
  "activeSubscriptions": 0,
  "subscriptionsRenewingNext30d": 0,
  "expiringPasses7d": 0,
  "expiringPasses30d": 0,
  "asOf": "2026-05-25T22:04:00.000Z"
}
```

`list-at-risk-members` will return all 5 seeded members on demo day — their D1-era bookings (Sun May 18 → Fri May 22) are all >14 days old by 2026-05-25, satisfying the `noRecentAttendance` branch.

`whatsapp_templates` after seed (verified via direct `pg.Client` query against Neon):
```
class_reminder = pending
hello_world = approved
pass_expiring = pending
payment_failed = pending
waitlist_offer = pending
```
JSON parses cleanly: `hello_world` body = `"Hello World"`, `class_reminder` body = `"Hi {{1}}, your {{2}} class is tomorrow at {{3}}. See you there!"`

## User Setup Required

None — DATABASE_URL already provisioned in `apps/staff-web/.env.local`.

## Self-Check: PASSED

- File `apps/staff-web/actions/list-renewals.ts` exists (69 lines, contains `defineAction`, `schema.stripeSubscriptions`, `schema.passes`, `activeSubscriptions`, `expiringPasses7d`, `expiringPasses30d`, `http: { method: "GET" }`, no `accessFilter`/`resolveAccess`)
- File `apps/staff-web/actions/list-at-risk-members.ts` exists (106 lines, contains `defineAction`, `schema.gymMembers`, `bookings`, `passes`, `lastAttendedAt`, `bookingCount30d`, `earliestPassExpiry`, `http: { method: "GET" }`, no access helpers)
- File `apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts` exists (contains all 5 template names exactly once, `status: "approved"` for hello_world, `status: "pending"` for the others, `onConflictDoNothing`, `"Hello World"` body, `{{1}}` placeholder)
- `apps/staff-web/package.json` contains `"db:seed-templates": "tsx server/db/seeds/seed-whatsapp-templates.ts"`
- Commit `c43cf8a7` present in `git log` (list-renewals)
- Commit `90d7ba4d` present in `git log` (list-at-risk-members)
- Commit `1d55b43c` present in `git log` (seed + package.json)
- `pnpm --filter @gymos/staff-web typecheck` exit 0
- `pnpm db:seed-templates` exit 0, second run exit 0, "5 rows" both times
- Direct Neon query confirms 5 rows: hello_world=approved, others=pending

## Next Phase Readiness

- **P1b.1-05 (Templates dialog)** is unblocked — `whatsapp_templates` table has 5 rows with parseable JSON. `hello_world` (approved) is the day-one sendable.
- **P1b.1-07 (Gym agent surface)** now has all 5 gym actions live (`list-classes`, `list-fill-rate`, `list-members` from Plan 03 + `list-renewals`, `list-at-risk-members` from this plan) — agent surface can answer the three chip prompts end-to-end.
- **P1b-09 (WhatsApp template sync cron)** should preserve the `hello_world` row when first sync runs; verify the upstream UPSERT path before letting it overwrite.

---
*Phase: P1b.1-customer-pilot-enablement*
*Completed: 2026-05-25*
