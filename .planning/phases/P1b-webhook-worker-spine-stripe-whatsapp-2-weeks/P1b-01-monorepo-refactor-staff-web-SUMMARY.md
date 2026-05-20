---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 01
subsystem: infra
tags: [monorepo, pnpm-workspace, react-router-v7, drizzle, postgres, better-auth, fork-boundary]

# Dependency graph
requires:
  - phase: D0-fork-schema-deploys
    provides: "GymOS routes (gymos.*, /api/m, /webhooks/whatsapp, /pick-member) + 12 domain tables in templates/mail/"
  - phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
    provides: "Staff inbox/schedule/members surfaces — copied verbatim into apps/staff-web/"
  - phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
    provides: "api.m.* + webhooks.whatsapp.tsx + auth.ts publicPaths"
provides:
  - "apps/staff-web/ workspace package (`@gymos/staff-web`) — new home for all GymOS staff-facing routes"
  - "templates/mail/ restored to upstream-clean state (only webhooks.whatsapp.tsx remains, deleted in Plan 09)"
  - "Postgres-flavored Drizzle migration baseline at apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql"
  - "pnpm-workspace.yaml apps/* glob — enables P1b-03/04/05 packages and apps to land alongside"
  - "publicPaths includes / so root redirect to /gymos works without Google sign-in"
affects: [P1b-02-schema-migration, P1b-03-packages, P1b-04-edge-webhooks, P1b-05-worker, P1b-08-staffweb-outbound, P1b-09-validation-cutover, P0-audit]

# Tech tracking
tech-stack:
  added: []  # pure refactor — no new deps
  patterns:
    - "apps/* workspace layout — sits alongside packages/* and templates/*"
    - "Per-app drizzle.config.ts via @agent-native/core/db/drizzle-config (PG dialect auto-detected from DATABASE_URL)"
    - "Postgres-flavored baseline migration committed; live DB unchanged (created out-of-band via MCP during D0.4)"

key-files:
  created:
    - "apps/staff-web/package.json — @gymos/staff-web workspace package"
    - "apps/staff-web/app/routes/gymos.tsx — main WhatsApp inbox route (copied verbatim)"
    - "apps/staff-web/app/routes/gymos.schedule.tsx — week-grid + booking"
    - "apps/staff-web/app/routes/gymos.members.tsx + gymos.members.$id.tsx — directory + profile"
    - "apps/staff-web/app/routes/gymos.payments.tsx — Stripe Checkout (D1-03 paused)"
    - "apps/staff-web/app/routes/pick-member.tsx — D2 mobile demo entry"
    - "apps/staff-web/app/routes/webhooks.whatsapp.tsx — demo WA receiver (deleted in Plan 09)"
    - "apps/staff-web/app/routes/api.m.*.tsx — 8 mobile API routes (profile/schedule/bookings/food-entries/foods.barcode/foods.search/members.list/agent.stream)"
    - "apps/staff-web/server/db/schema.ts — 12 GymOS domain tables (gymMembers, coaches, conversations, messages, classDefinitions, classOccurrences, bookings, passes, passDebits, foodItems, foodEntries, agentSessions, webhookEvents)"
    - "apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql — PG-flavored baseline (TIMESTAMP/BOOLEAN/now())"
    - "apps/staff-web/server/db/migrations/meta/_journal.json + 0000_snapshot.json — Drizzle Kit PG state"
    - "apps/staff-web/server/plugins/auth.ts — publicPaths includes /, /gymos*, /api/m, /pick-member, /webhooks/whatsapp"
    - "apps/staff-web/server/lib/demo-member.ts — requireDemoMember helper"
    - "apps/staff-web/drizzle.config.ts — PG dialect auto-detection via createDrizzleConfig"
    - "apps/staff-web/react-router.config.ts + vite.config.ts + tsconfig.json + netlify.toml + postcss.config.js"
    - "apps/staff-web/.env.local.example — env var template (DATABASE_URL, BETTER_AUTH_*, WHATSAPP_*, ANTHROPIC_API_KEY, DEMO_MODE)"
    - "apps/staff-web/.gitignore — copied from templates/mail/ (post-Task-3 follow-up)"
  modified:
    - "pnpm-workspace.yaml — added `- apps/*` to packages glob"
  deleted:
    - "templates/mail/app/routes/gymos.tsx (653 LOC)"
    - "templates/mail/app/routes/gymos.schedule.tsx (373 LOC)"
    - "templates/mail/app/routes/gymos.members.tsx + gymos.members.$id.tsx (577 LOC)"
    - "templates/mail/app/routes/pick-member.tsx (deleted)"
    - "templates/mail/app/routes/api.m.*.tsx — 8 mobile API routes (821 LOC)"
    - "templates/mail/app/routes/webhooks.whatsapp.tsx (177 LOC) — DEVIATION from plan (see Decisions)"
    - "templates/mail/server/lib/demo-member.ts (31 LOC)"
    - "templates/mail/server/db/migrations/0000_late_professor_monster.sql — SQLite-flavored, replaced by PG version in apps/staff-web/"
    - "templates/mail/server/db/schema.ts — restored to upstream-only (227 GymOS LOC removed)"
    - "templates/mail/server/plugins/auth.ts — publicPaths restored to upstream (Gmail Pub/Sub only)"
    - "templates/mail/app/routes/_index.tsx — restored to upstream Mail index"

key-decisions:
  - "Deleted templates/mail/app/routes/webhooks.whatsapp.tsx in Plan 01 Task 2 (NOT deferred to Plan 09 as originally planned) — its imports referenced the removed schema, so leaving it broke templates/mail typecheck. Cutover semantics preserved because the identical file lives at apps/staff-web/app/routes/webhooks.whatsapp.tsx and will still be the Meta-targeted endpoint until Plan 09 flips Meta to the Fly URL and deletes BOTH copies."
  - "Added `/` (exact-match) to publicPaths in Task 4 follow-up so the root _index.tsx redirect to /gymos bypasses the upstream Mail Google sign-in interstitial. matchesPathList() treats `/` as exact-only (no prefix matching), so this is safe."
  - "Drizzle baseline migration regenerated for Postgres dialect — Plan 02 generates additive migrations against this baseline; an SQLite baseline would have produced broken DDL."
  - "Drizzle config uses createDrizzleConfig (auto-detects PG from DATABASE_URL host) rather than hardcoded dialect — same pattern as upstream agent-native, future-proofs against test/dev DB swaps."

patterns-established:
  - "apps/* workspace layout — `apps/staff-web/`, future `apps/edge-webhooks/`, `apps/worker/` (Plans 04-05) sit here; packages/* stays for libraries (queue/whatsapp/db in Plan 03), templates/* stays upstream-clean."
  - "Per-app drizzle config via createDrizzleConfig + DATABASE_URL detection — no hardcoded dialect strings. Reuse for any future apps/* package that needs Drizzle Kit."
  - "publicPaths comment convention — every entry has a short comment explaining why it bypasses auth + which plan added it. Reduces future merge-time confusion."

requirements-completed: []  # Pure refactor — no requirement IDs

# Metrics
duration: ~45min (across original execution + finalization)
completed: 2026-05-20
---

# Phase P1b Plan 01: Monorepo Refactor (templates/mail → apps/staff-web) Summary

**Moved the entire GymOS staff surface from `templates/mail/` to a new `apps/staff-web/` workspace package; templates/mail restored to upstream-clean for safe future agent-native merges; Drizzle baseline regenerated for Postgres dialect.**

## Performance

- **Duration:** ~45min total (Tasks 1-3 executed earlier today, Task 4 verification + finalization completed 2026-05-20)
- **Tasks:** 4 of 4 (Tasks 1-3 auto, Task 4 human-verify checkpoint)
- **Commits:** 5 task-level + 1 finalization metadata commit
- **Files moved:** 236 files into apps/staff-web/ (53,672 insertions)
- **Files deleted from templates/mail/:** 17 files (2,898 deletions — restoring upstream-clean state)

## Accomplishments

- `apps/staff-web/` workspace package created with the full GymOS staff surface — boots locally on `:8081`, serves `/`, `/gymos`, `/gymos/schedule`, `/gymos/members`, `/gymos/payments`, `/pick-member`, `/api/m/*`, `/webhooks/whatsapp` against the same gymos-demo Neon project as before.
- `templates/mail/` restored to upstream-clean: no `gymos.*` routes, no `/api/m/*` routes, no `pick-member`, no GymOS schema additions, no GymOS publicPaths. `_index.tsx`, `schema.ts`, and `auth.ts` reverted to upstream Mail state.
- `pnpm-workspace.yaml` extended with `- apps/*` glob alongside `packages/*`, `templates/*`, `templates/*/desktop`. Future P1b apps (edge-webhooks, worker) drop into the same layout.
- Drizzle migration baseline regenerated for Postgres at `apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql` (TIMESTAMP/BOOLEAN/`now()` syntax, no SQLite leftovers). Plan 02 will generate `0001_*.sql` against this baseline.
- Root redirect (`/` → `/gymos`) now bypasses the upstream Mail Google sign-in page — `/` added to publicPaths as Task 4 follow-up.

## Task Commits

1. **Task 1: Scaffold apps/staff-web/ as copy of templates/mail/** — `1b601f3c` (chore) — 331 files, 53,672 insertions; @gymos/staff-web added to pnpm workspace.
2. **Task 2: Restore templates/mail/ to upstream-clean state** — `7efcbf9a` (chore) — 17 files deleted/reverted, 2,898 deletions; `webhooks.whatsapp.tsx` had to be removed now rather than Plan 09 (see Deviations).
3. **Task 3: Regenerate Drizzle migration for Postgres dialect** — `a126010a` (chore) — SQLite baseline replaced with PG-flavored `0000_gymos_postgres_initial.sql` + meta snapshot.
4. **Task 3 follow-up: Add missing .gitignore to apps/staff-web/** — `b8cb721a` (chore) — keeps `.env.local`, `.react-router/`, `.generated/` ignored.
5. **Task 4 polish: Add `/` to publicPaths** — `51e67e67` (feat) — root redirect to /gymos bypasses Google sign-in (Task 4 verification work).

**Plan metadata:** _docs commit pending after this SUMMARY_

## Files Created/Modified

See `key-files` in frontmatter for the full list. Headline counts:

- **apps/staff-web/ created** — 236 files including 13 GymOS route files, 12-table schema, 1 PG-flavored baseline migration, drizzle/vite/RR/tsconfig, netlify.toml, .env.local.example, .gitignore, CLAUDE.md+AGENTS.md include shims.
- **templates/mail/ cleaned** — 17 files deleted/reverted to upstream Mail state (gymos.* routes, api.m.* routes, pick-member, webhooks.whatsapp, demo-member helper, schema GymOS exports, auth.ts publicPaths additions).
- **pnpm-workspace.yaml** — `- apps/*` added.

## Decisions Made

- **Delete `webhooks.whatsapp.tsx` from templates/mail/ in Plan 01 rather than Plan 09.** Originally D-05 in the phase context specified the file should remain in templates/mail/ until the very last task of P1b (after Meta URL flip). Discovered during Task 2 that the file's imports referenced the removed GymOS schema (`gym_members`, `conversations`, `webhook_events`), so leaving it broke templates/mail's typecheck. Resolution: delete the templates/mail copy now (Task 2 commit `7efcbf9a`). Cutover semantics are preserved because the identical file lives at `apps/staff-web/app/routes/webhooks.whatsapp.tsx` and remains the Meta-targeted endpoint via ngrok until Plan 09 flips Meta to the Fly URL and deletes BOTH copies. This change is semantically a no-op for the cutover; the only effect is that templates/mail typechecks today instead of after Plan 09.
- **Add `/` to publicPaths (Task 4 polish).** During the Task 4 boot test, `curl http://localhost:8081/` returned the upstream Mail Google sign-in page instead of redirecting to `/gymos`. Cause: `matchesPathList()` in `@agent-native/core/server` checks publicPaths before route loaders run, and `_index.tsx`'s redirect to `/gymos` never executed because `/` itself wasn't whitelisted. The fix is exact-match-safe (matchesPathList treats `/` specially — it won't prefix-match every path). User explicitly approved this polish during checkpoint verification.
- **Drizzle migration is baseline only — NOT applied to gymos-demo Neon.** The live DB at Neon already has all 12 GymOS tables from D0.4's MCP-driven SQL transactions. The generated `0000_gymos_postgres_initial.sql` exists purely to give Drizzle Kit a Postgres-dialect snapshot so Plan 02's `drizzle-kit generate` emits PG syntax (not SQLite). Header comment on the SQL file warns "Do NOT run against gymos-demo."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted templates/mail/app/routes/webhooks.whatsapp.tsx in Task 2 instead of deferring to Plan 09**

- **Found during:** Task 2 (restoring templates/mail/ to upstream-clean)
- **Issue:** The plan specified `webhooks.whatsapp.tsx` should remain in templates/mail/ until Plan 09 (per D-05 in CONTEXT.md). But its imports (`gym_members`, `conversations`, `webhookEvents` from `server/db/schema`) reference GymOS schema exports that Task 2 explicitly removes from templates/mail/server/db/schema.ts. Leaving the file in place would have broken `pnpm --filter mail exec tsc --noEmit`, violating the Task 2 acceptance criterion "Mail template still type-checks."
- **Fix:** Deleted templates/mail/app/routes/webhooks.whatsapp.tsx in Task 2 (commit `7efcbf9a`). Identical file already lives at apps/staff-web/app/routes/webhooks.whatsapp.tsx so the Meta-targeted endpoint is preserved. Plan 09's "delete webhooks.whatsapp.tsx as last task" now refers to the apps/staff-web/ copy after Meta URL flips to Fly — semantically equivalent.
- **Files modified:** templates/mail/app/routes/webhooks.whatsapp.tsx (deleted, 177 LOC)
- **Verification:** `pnpm --filter mail exec tsc --noEmit` returned green per Task 2 commit notes; apps/staff-web/ boots and serves /webhooks/whatsapp verify-token requests successfully.
- **Committed in:** `7efcbf9a` (part of Task 2 commit)

**2. [Rule 2 - Missing Critical] Added `/` to apps/staff-web/server/plugins/auth.ts publicPaths during Task 4 verification**

- **Found during:** Task 4 (human-verify checkpoint — boot test of apps/staff-web/)
- **Issue:** `curl http://localhost:8081/` returned the upstream Mail Google sign-in page instead of redirecting to /gymos. Root cause: better-auth's `matchesPathList()` runs BEFORE the React Router `_index.tsx` redirect, so the `/` → `/gymos` redirect never fired without `/` being in publicPaths. The plan's Task 1 specified copying publicPaths verbatim from templates/mail, but templates/mail never needed `/` whitelisted because its `_index.tsx` was the upstream Mail page (not a GymOS redirect). The redirect was added separately in commit `596a84b3` and never had `/` whitelisted.
- **Fix:** Added literal string `"/"` to the publicPaths array with a 4-line explanatory comment about `matchesPathList()` exact-match semantics. User approved during Task 4 checkpoint verification.
- **Files modified:** apps/staff-web/server/plugins/auth.ts
- **Verification:** `curl http://localhost:8081/` now returns HTTP 200 + title "GymOS — WhatsApp Inbox" + 0 Google sign-in markers (verified by user-run curl tests immediately before this commit).
- **Committed in:** `51e67e67` (this plan's Task 4 polish commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes were necessary for the plan's stated acceptance criteria (Task 2: "Mail template still type-checks"; Task 4: "/gymos demo still works against live Neon"). Neither fix expanded scope — both restored the plan's intended end state.

## Issues Encountered

- **Vite port 8080 already in use** during Task 4 boot — Vite auto-fell-back to `:8081` (the same port templates/mail used). No code change needed; orchestrator updated the verification URLs to use 8081.
- **One non-fatal Nitro env warning** at apps/staff-web/ dev server startup — does not affect SSR; logged for future investigation but did not block any verification step.

## Cross-Plan Invariants (READ BEFORE STARTING PLAN 02+)

These are load-bearing for downstream plans and must NOT be changed without a coordinated update:

1. **`apps/staff-web/drizzle.config.ts` must remain Postgres-flavored (dialect auto-detected via `createDrizzleConfig` + DATABASE_URL pointing at a `neon.tech` host).** Plan 02's `drizzle-kit generate` runs against this config; an SQLite-flavored config would produce broken DDL.
2. **`apps/staff-web/server/db/schema.ts` is the GymOS schema source of truth.** Plan 02 extends THIS file (additive only — new tables for whatsapp_opt_in, whatsapp_templates, stripe_customers, stripe_subscriptions, payments, secrets; new columns delivered_at/read_at/error_code on messages; new UNIQUE constraint on webhook_events). Never extend templates/mail/server/db/schema.ts — that file is upstream-clean now.
3. **`apps/staff-web/app/routes/webhooks.whatsapp.tsx` is the demo WA webhook receiver.** It stays in place until Plan 09 (P1b-09-validation-cutover) flips Meta's webhook URL from the ngrok-tunneled apps/staff-web endpoint to `https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp` (the apps/edge-webhooks Hono receiver). Do NOT delete it before Plan 09 — that's the D-05 cutover ordering.
4. **`publicPaths` in `apps/staff-web/server/plugins/auth.ts` now includes `/`.** Plan 08 (P1b-08-staffweb-outbound-rotation) extends this list when adding `/gymos/settings/integrations` for the Stripe key rotation UI. Existing entries (`/`, `/gymos*`, `/api/m`, `/pick-member`, `/webhooks/whatsapp`) must stay.
5. **`pnpm-workspace.yaml` `apps/*` glob.** Plans 03-05 (`packages/queue`, `packages/whatsapp`, `apps/edge-webhooks`, `apps/worker`) all rely on this glob plus the existing `packages/*` glob. Don't narrow either.

## Next Phase Readiness

- **Plan 02 (schema-migration-additive) is unblocked.** Schema source of truth lives at `apps/staff-web/server/db/schema.ts`; baseline migration is PG-flavored; gymos-demo Neon DB is in the correct starting state (12 tables already applied, ready for P1b additive migration).
- **Plan 03 (packages-queue-whatsapp) is unblocked.** `apps/*` workspace glob exists; future `packages/queue` + `packages/whatsapp` will import schema from `apps/staff-web/server/db/schema.ts` (per CONTEXT D-08 default — extract to `packages/db/` only if cyclic imports emerge).
- **Plan 04 (edge-webhooks-fly-receiver) is unblocked.** `apps/` directory exists; new `apps/edge-webhooks/` package lands alongside `apps/staff-web/` per D-08.
- **No blockers carried forward.** Live `/gymos` demo continues to work against gymos-demo Neon — coach demo on 2026-05-24 unaffected.

## Self-Check: PASSED

Verified during finalization (2026-05-20):

- `apps/staff-web/package.json` exists with `"name": "@gymos/staff-web"` (verified via git show)
- `apps/staff-web/server/db/schema.ts` exists with all 12 GymOS table exports (verified — file count and LOC match templates/mail pre-deletion state)
- `apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql` exists with PG syntax (243 LOC; verified via git show stats)
- `apps/staff-web/server/plugins/auth.ts` publicPaths includes `/`, `/gymos`, `/api/m`, `/pick-member`, `/webhooks/whatsapp` (verified via Read tool)
- `templates/mail/app/routes/gymos.tsx` does not exist (verified via Task 2 commit stat: deleted)
- `templates/mail/app/routes/webhooks.whatsapp.tsx` does not exist (deleted in Task 2 per Deviation 1)
- `pnpm-workspace.yaml` contains `- apps/*` (verified via Task 1 commit stat: 1 line added)
- All 5 task commits exist on master: `1b601f3c`, `7efcbf9a`, `a126010a`, `b8cb721a`, `51e67e67` (verified via `git log --pretty=format:"%h %s" 596a84b3..HEAD`)
- User verified during checkpoint: `/`, `/gymos`, `/gymos/schedule`, `/gymos/members` all return HTTP 200 with correct titles and 0 Google sign-in markers against live gymos-demo Neon.

---

_Phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks_
_Plan: 01 — Monorepo refactor (templates/mail → apps/staff-web)_
_Completed: 2026-05-20_
