---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/package.json
  - apps/staff-web/app/**
  - apps/staff-web/server/**
  - apps/staff-web/react-router.config.ts
  - apps/staff-web/vite.config.ts
  - apps/staff-web/drizzle.config.ts
  - apps/staff-web/netlify.toml
  - apps/staff-web/.env.local.example
  - apps/staff-web/CLAUDE.md
  - apps/staff-web/AGENTS.md
  - pnpm-workspace.yaml
  - templates/mail/app/routes/gymos.tsx
  - templates/mail/app/routes/gymos.schedule.tsx
  - templates/mail/app/routes/gymos.members.tsx
  - templates/mail/app/routes/gymos.members.$id.tsx
  - templates/mail/app/routes/gymos.payments.tsx
  - templates/mail/app/routes/pick-member.tsx
  - templates/mail/app/routes/api.m.*
  - templates/mail/server/db/schema.ts
  - templates/mail/server/plugins/auth.ts
autonomous: false
requirements: []
must_haves:
  truths:
    - "apps/staff-web/ boots locally on :8081 with same /gymos routes as before"
    - "templates/mail/ is upstream-clean — no gymos.* routes, no GymOS schema additions, no GymOS publicPaths"
    - "pnpm-workspace.yaml lists apps/* alongside packages/* and templates/*"
    - "Drizzle config is regenerated for Postgres (Neon) dialect — no SQLite syntax in any new migration"
    - "Existing /gymos page still renders against gymos-demo Neon (same DATABASE_URL works from new location)"
  artifacts:
    - path: "apps/staff-web/package.json"
      provides: "Workspace package named @gymos/staff-web with React Router v7 + Drizzle + Better-auth deps"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "All GymOS domain tables (gymMembers, conversations, messages, webhookEvents, ...) — copied verbatim from templates/mail"
    - path: "apps/staff-web/app/routes/gymos.tsx"
      provides: "Main inbox route — copied verbatim from templates/mail"
    - path: "apps/staff-web/drizzle.config.ts"
      provides: "Drizzle Kit config pointing at apps/staff-web/server/db/schema.ts; consumes DATABASE_URL for PG dialect detection"
    - path: "pnpm-workspace.yaml"
      provides: "apps/* added to packages list"
  key_links:
    - from: "apps/staff-web/server/db/index.ts"
      to: "apps/staff-web/server/db/schema.ts"
      via: "named export { schema }"
      pattern: "export.*schema"
    - from: "apps/staff-web/server/plugins/auth.ts"
      to: "@agent-native/core/server"
      via: "createAuthPlugin import + publicPaths includes /gymos, /api/m, /webhooks/whatsapp"
      pattern: "publicPaths.*gymos"
---

<objective>
Move the entire `templates/mail/` GymOS surface to a new top-level workspace package `apps/staff-web/` so future P1b plans (edge-webhooks, worker, packages/queue, packages/whatsapp) can sit alongside it under `apps/`/`packages/` and templates/mail/ stays upstream-clean for future agent-native merges. This is purely mechanical — NO new features, NO webhook code, NO new schema, NO new env vars. The point is that after this plan lands the existing /gymos demo still works AND templates/mail/ has no GymOS code in it AND we have a clean apps/ tree to build on.

Purpose: D-06 + D-07 — avoid TWO sets of merge conflicts when later moving staff-web out of templates/mail/. Doing it once now means subsequent plans land in a stable layout.
Output: Functional `apps/staff-web/` workspace + cleaned `templates/mail/` + working /gymos demo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@templates/mail/package.json
@templates/mail/server/db/schema.ts
@templates/mail/app/routes/gymos.tsx
@templates/mail/server/plugins/auth.ts
@pnpm-workspace.yaml
@CLAUDE.md
@AGENTS.md

<interfaces>
<!-- Existing in templates/mail/ that must be preserved verbatim in apps/staff-web/ -->

templates/mail/server/db/schema.ts exports (lines 100-326):
- gymMembers, coaches, conversations, messages, classDefinitions, classOccurrences,
  bookings, passes, passDebits, foodItems, foodEntries, agentSessions, webhookEvents
- Re-exports from @agent-native/core/db/schema: table, text, integer, real, now, etc.

templates/mail/server/plugins/auth.ts:
- createAuthPlugin({ googleOnly: true, publicPaths: [...] }) — list at lines 53-71
- /gymos, /gymos/schedule, /gymos/members, /gymos/payments, /api/m, /pick-member, /webhooks/whatsapp

GymOS routes to copy (under templates/mail/app/routes/):
- gymos.tsx (main inbox — 600+ lines)
- gymos.schedule.tsx (D1-01)
- gymos.members.tsx, gymos.members.$id.tsx (D1-02)
- gymos.payments.tsx (D1-03 paused but file exists)
- pick-member.tsx (D2-01)
- webhooks.whatsapp.tsx (D2-02 — KEEP for now, deleted as last task of P1b per D-05)
- api.m.* routes (mobile API)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/staff-web/ scaffold + copy templates/mail/ files into it</name>
  <files>apps/staff-web/package.json, apps/staff-web/react-router.config.ts, apps/staff-web/vite.config.ts, apps/staff-web/drizzle.config.ts, apps/staff-web/tsconfig.json, apps/staff-web/CLAUDE.md, apps/staff-web/AGENTS.md, apps/staff-web/app/**, apps/staff-web/server/**, apps/staff-web/netlify.toml, apps/staff-web/postcss.config.js, apps/staff-web/.env.local.example, pnpm-workspace.yaml</files>
  <read_first>
    - templates/mail/package.json (full dep list to mirror)
    - templates/mail/react-router.config.ts
    - templates/mail/vite.config.ts
    - templates/mail/drizzle.config.ts
    - templates/mail/tsconfig.json
    - templates/mail/CLAUDE.md (currently `@AGENTS.md` include)
    - templates/mail/AGENTS.md
    - templates/mail/netlify.toml
    - templates/mail/server/db/schema.ts (must be copied byte-for-byte)
    - templates/mail/server/db/index.ts
    - templates/mail/server/plugins/auth.ts
    - templates/mail/app/routes/gymos.tsx (head + tail to confirm structure)
    - templates/mail/app/root.tsx
    - pnpm-workspace.yaml
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-06, D-07, D-08)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Recommended Project Structure (post-refactor)" + §"pnpm-workspace.yaml update"
    - CLAUDE.md (no-branch rule, no-drizzle-push guard, prettier)
    - AGENTS.md (no-breaking-DB-changes rule)
  </read_first>
  <action>
    Concrete steps:

    1. Update `pnpm-workspace.yaml`: add `- apps/*` to the `packages:` list, alongside existing `- packages/*`, `- templates/*`, `- templates/*/desktop`. Final shape:
       ```yaml
       packages:
         - packages/*
         - templates/*
         - templates/*/desktop
         - apps/*
       catalog:
         # ...existing entries preserved verbatim...
       ```

    2. Create `apps/staff-web/` directory tree by COPYING from `templates/mail/`. Use the Read tool to read each source file then Write to the target. Copy these exactly (byte-for-byte for code; rename only `name` field in package.json):
       - `templates/mail/package.json` → `apps/staff-web/package.json`. Change ONLY `"name": "mail"` → `"name": "@gymos/staff-web"`, `"description"` field to `"GymOS staff web app (forked from agent-native Mail template)"`. Keep all dependencies, devDependencies, scripts identical. Do NOT add or remove deps in this task — this is purely a move.
       - `templates/mail/react-router.config.ts` → `apps/staff-web/react-router.config.ts` (identical bytes)
       - `templates/mail/vite.config.ts` → `apps/staff-web/vite.config.ts` (identical bytes)
       - `templates/mail/drizzle.config.ts` → `apps/staff-web/drizzle.config.ts` (identical bytes)
       - `templates/mail/tsconfig.json` → `apps/staff-web/tsconfig.json` (identical bytes)
       - `templates/mail/postcss.config.js` if present → `apps/staff-web/postcss.config.js` (identical bytes)
       - `templates/mail/netlify.toml` → `apps/staff-web/netlify.toml` (identical bytes — Vercel migration is OPEN QUESTION 6 in RESEARCH; keep Netlify config for now since demo never finished Vercel deploy)
       - `templates/mail/CLAUDE.md` → `apps/staff-web/CLAUDE.md` (content: just `@AGENTS.md`)
       - `templates/mail/AGENTS.md` → `apps/staff-web/AGENTS.md` (identical bytes)
       - Entire `templates/mail/app/` tree → `apps/staff-web/app/` (use Glob to enumerate, then Read+Write each file)
       - Entire `templates/mail/server/` tree → `apps/staff-web/server/` (Glob+Read+Write)
       - Entire `templates/mail/public/` tree → `apps/staff-web/public/` if it exists
       - `templates/mail/.env.local` IS gitignored — do NOT copy it. Instead create `apps/staff-web/.env.local.example` listing the env var NAMES from the existing .env.local (read it locally, list keys with empty values). Required vars at minimum: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ANTHROPIC_API_KEY`, `DEMO_MODE`.

    3. Confirm the `apps/staff-web/server/plugins/auth.ts` publicPaths array still contains exactly: `/api/gmail/push`, `/api/gmail/watch/renew`, `/gymos`, `/gymos/schedule`, `/gymos/members`, `/gymos/payments`, `/api/m`, `/pick-member`, `/webhooks/whatsapp`. Do not modify yet — webhooks.whatsapp.tsx still lives here until last task of P1b.

    4. Create `apps/staff-web/CLAUDE.md` containing the single line `@AGENTS.md` (matching the templates/mail pattern that lets project-level CLAUDE.md cascade through).

    5. Do NOT delete from templates/mail/ yet — that happens in Task 2 (split for safety + reviewable diffs).

    6. Run `pnpm install` at repo root to wire the new workspace package. Confirm it resolves without errors.

    7. Run `npx prettier --write apps/staff-web/**/*.{ts,tsx,json,md}` per CLAUDE.md formatting rule.
  </action>
  <verify>
    <automated>pnpm -w list --depth -1 2>&amp;1 | grep -i "@gymos/staff-web"</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/package.json` exists AND contains `"name": "@gymos/staff-web"`
    - File `apps/staff-web/app/routes/gymos.tsx` exists AND has same line count (±1) as `templates/mail/app/routes/gymos.tsx`
    - File `apps/staff-web/server/db/schema.ts` exists AND contains `export const webhookEvents = table("webhook_events"` (verbatim copy)
    - File `apps/staff-web/server/plugins/auth.ts` exists AND contains literal strings `"/gymos"`, `"/api/m"`, `"/webhooks/whatsapp"` in its publicPaths list
    - `pnpm-workspace.yaml` contains line `  - apps/*` (with leading two spaces) in the packages: block
    - `pnpm-workspace.yaml` still contains lines `  - packages/*` AND `  - templates/*` (no entries removed)
    - `pnpm install` at repo root exits 0
    - `pnpm -w list --depth -1` output includes `@gymos/staff-web`
    - `apps/staff-web/CLAUDE.md` file size ≤ 30 bytes (contains only `@AGENTS.md` + optional newline)
    - templates/mail/app/routes/gymos.tsx STILL EXISTS (not yet deleted — that's Task 2)
  </acceptance_criteria>
  <done>apps/staff-web/ workspace package exists with full copy of templates/mail/ GymOS surface; pnpm install resolves; templates/mail/ untouched (deletion in Task 2).</done>
</task>

<task type="auto">
  <name>Task 2: Delete GymOS code from templates/mail/ (restore upstream-clean state)</name>
  <files>templates/mail/app/routes/gymos.tsx, templates/mail/app/routes/gymos.schedule.tsx, templates/mail/app/routes/gymos.members.tsx, templates/mail/app/routes/gymos.members.$id.tsx, templates/mail/app/routes/gymos.payments.tsx, templates/mail/app/routes/pick-member.tsx, templates/mail/app/routes/api.m.*.tsx, templates/mail/app/routes/api.m.*.ts, templates/mail/server/db/schema.ts, templates/mail/server/plugins/auth.ts</files>
  <read_first>
    - templates/mail/server/db/schema.ts (need to know which exports are GymOS — lines 100-326 per CONTEXT)
    - templates/mail/server/plugins/auth.ts (publicPaths to revert)
    - apps/staff-web/server/db/schema.ts (verify the copy is complete BEFORE deletion)
    - apps/staff-web/app/routes/gymos.tsx (verify copy is complete BEFORE deletion)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-06 — templates/mail goes back upstream-clean)
    - CLAUDE.md (no-breaking-DB-changes — but templates/mail/ tables aren't applied to Neon; the demo's schema lives only in apps/staff-web's schema file now)
    - AGENTS.md (no backwards-compat shims rule — delete cleanly, don't stub)
  </read_first>
  <action>
    Concrete steps:

    1. Verify Task 1 completion (read apps/staff-web/server/db/schema.ts and confirm it contains `export const webhookEvents`; read apps/staff-web/app/routes/gymos.tsx and confirm file size > 10KB). If either is missing, STOP and report.

    2. Use Glob to enumerate all GymOS files under templates/mail/app/routes/:
       - Glob pattern: `templates/mail/app/routes/gymos*.tsx`
       - Glob pattern: `templates/mail/app/routes/api.m.*` (covers `api.m.profile.ts`, `api.m.schedule.ts`, etc.)
       - Glob pattern: `templates/mail/app/routes/pick-member*`
       - Glob pattern: `templates/mail/app/routes/webhooks.whatsapp.tsx` — KEEP this file in templates/mail/ for now. Per D-05 it is deleted as the LAST task of P1b (Plan 09 task) after Meta URL flip is verified.

    3. Delete each GymOS file found in step 2 using the Bash tool with `Remove-Item` (PowerShell). Do NOT delete `webhooks.whatsapp.tsx`.

    4. Edit `templates/mail/server/db/schema.ts`: remove all GymOS table exports added in D0.4. Per CONTEXT line 206 these are: `gymMembers`, `coaches`, `conversations`, `messages`, `classDefinitions`, `classOccurrences`, `bookings`, `passes`, `passDebits`, `foodItems`, `foodEntries`, `agentSessions`, `webhookEvents`. Identify the start marker: search for the first `gym` table definition or a comment like `// GymOS` and remove from there to end of file (where the file currently ends with `webhookEvents` at line 318+). Restore the file to what it was before D0.4 — if you can git log/show the pre-D0.4 version, use that as the canonical state; otherwise truncate after the last upstream-only export.

       Use `git log --oneline templates/mail/server/db/schema.ts` first to identify the commit BEFORE GymOS additions (search for D0.4 commit per STATE.md). If found, use `git show <pre-D0.4-sha>:templates/mail/server/db/schema.ts` to capture the upstream-clean content and Write that back. If not findable, leave a comment `// GymOS schema additions moved to apps/staff-web/server/db/schema.ts (P1b-01 refactor)` at the location where they used to be and delete the table defs.

    5. Edit `templates/mail/server/plugins/auth.ts`: in the `publicPaths` array, remove these entries (added in D2-D01 and D2-02): `"/gymos"`, `"/gymos/schedule"`, `"/gymos/members"`, `"/gymos/payments"`, `"/api/m"`, `"/pick-member"`, `"/webhooks/whatsapp"`. Keep `"/api/gmail/push"` and `"/api/gmail/watch/renew"` (these are upstream Mail entries). Final publicPaths should match the upstream Mail template state.

    6. Run `npx prettier --write templates/mail/server/db/schema.ts templates/mail/server/plugins/auth.ts`.

    7. Verify Mail template still type-checks: `pnpm --filter mail typecheck` (or `pnpm --filter mail exec tsc --noEmit` if no typecheck script).
  </action>
  <verify>
    <automated>pnpm --filter mail exec tsc --noEmit 2>&amp;1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/gymos.tsx` DOES NOT EXIST
    - File `templates/mail/app/routes/gymos.schedule.tsx` DOES NOT EXIST
    - File `templates/mail/app/routes/gymos.members.tsx` DOES NOT EXIST
    - File `templates/mail/app/routes/gymos.members.$id.tsx` DOES NOT EXIST
    - File `templates/mail/app/routes/pick-member.tsx` DOES NOT EXIST
    - File `templates/mail/app/routes/webhooks.whatsapp.tsx` STILL EXISTS (deleted later in Plan 09)
    - `templates/mail/server/db/schema.ts` does NOT contain string `gymMembers` (grep returns nothing)
    - `templates/mail/server/db/schema.ts` does NOT contain string `webhookEvents` (grep returns nothing)
    - `templates/mail/server/plugins/auth.ts` does NOT contain string `"/gymos"` (grep returns nothing — note: with quotes)
    - `templates/mail/server/plugins/auth.ts` still contains `"/api/gmail/push"` (upstream entries preserved)
    - `pnpm --filter mail exec tsc --noEmit` exits 0 OR only fails on pre-existing upstream errors unrelated to GymOS
  </acceptance_criteria>
  <done>templates/mail/ is upstream-clean except for the demo webhook receiver (which gets deleted last in Plan 09). All GymOS code lives in apps/staff-web/.</done>
</task>

<task type="auto">
  <name>Task 3: Regenerate Drizzle migration for Postgres dialect against apps/staff-web/</name>
  <files>apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql, apps/staff-web/server/db/migrations/meta/_journal.json, apps/staff-web/server/db/migrations/meta/0000_snapshot.json, apps/staff-web/drizzle.config.ts</files>
  <read_first>
    - apps/staff-web/drizzle.config.ts (current dialect detection logic — uses @agent-native/core/db/drizzle-config)
    - apps/staff-web/server/db/schema.ts (full schema — what migrations need to express)
    - packages/core/src/db/drizzle-config.ts (createDrizzleConfig source — confirms dialect switching on DATABASE_URL detection)
    - templates/mail/server/db/migrations/ (existing migration files — to verify they were SQLite-flavored per RESEARCH §"Build artifacts" + Pitfall #6)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pitfall #6: Drizzle's SQLite-flavored migration file vs Neon Postgres" + Pitfall #7
    - .env.local at repo root (DATABASE_URL value — needs to be the Neon pooled URL for introspection)
    - CLAUDE.md (no-drizzle-push rule — MUST use `drizzle-kit generate` not `push`)
    - AGENTS.md (no-breaking-DB-changes rule — generation is read-only against schema.ts; the migration file is created but NOT applied in this task)
  </read_first>
  <action>
    Concrete steps. NOTE: this task generates the migration file only — Plan 02 applies P1b's additive migration. We're just establishing that apps/staff-web/ has a Postgres-flavored migration baseline.

    1. Read `apps/staff-web/drizzle.config.ts` to confirm it imports from `@agent-native/core/db/drizzle-config` and reads `DATABASE_URL`. If the config doesn't detect dialect correctly (e.g. hardcodes `sqlite`), edit it to use Postgres. Target config shape (verify via `createDrizzleConfig` source first):
       ```ts
       import { createDrizzleConfig } from "@agent-native/core/db/drizzle-config";
       export default createDrizzleConfig({
         schema: "./server/db/schema.ts",
         out: "./server/db/migrations",
       });
       ```
       (No literal `dialect` field — let `createDrizzleConfig` detect from DATABASE_URL per RESEARCH Pitfall #6.)

    2. Delete any existing SQLite-flavored migration files from `apps/staff-web/server/db/migrations/`:
       - List all `.sql` files in that directory using Glob
       - For each, read first 5 lines and search for SQLite markers: `datetime('now')`, `INTEGER DEFAULT 1` (used as boolean), or `PRAGMA`
       - If found, delete the file. Also delete `meta/_journal.json` and `meta/*_snapshot.json` (Drizzle Kit regenerates them).

    3. Set DATABASE_URL to point at gymos-demo Neon for introspection-or-generation. Read it from repo-root `.env.local` (gitignored — read but do NOT write back). The hostname will be `ep-holy-thunder-aqsb7xp1-pooler.c-8.us-east-1.aws.neon.tech` per RESEARCH §"Runtime State Inventory".

    4. Run `DATABASE_URL=<neon-pooled-url> pnpm --filter @gymos/staff-web exec drizzle-kit generate --name gymos_postgres_initial` from repo root (PowerShell: `$env:DATABASE_URL="..."; pnpm --filter @gymos/staff-web exec drizzle-kit generate --name gymos_postgres_initial`). This produces:
       - `apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql`
       - `apps/staff-web/server/db/migrations/meta/_journal.json`
       - `apps/staff-web/server/db/migrations/meta/0000_snapshot.json`

    5. Open `apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql` and verify it is Postgres-flavored:
       - Look for `TIMESTAMP` or `TIMESTAMPTZ` columns (PG) — NOT `INTEGER` epoch (SQLite-style)
       - Look for `BOOLEAN` columns (PG) — NOT `INTEGER DEFAULT 1` (SQLite-style)
       - Look for `NOW()` defaults (PG) — NOT `datetime('now')` (SQLite-style)
       - Verify table names are unquoted lowercase (PG convention)

    6. **CRITICAL — do NOT apply this migration.** The Neon DB at gymos-demo already has these tables (created via MCP Neon SQL during D0.4). Plan 02 (Wave 1, can run parallel to this task) handles the additive migration that's the real P1b schema change. This task just establishes that the baseline migration FILE is Postgres-flavored so subsequent `drizzle-kit generate` runs emit PG syntax.

    7. Add a header comment to the generated SQL: `-- BASELINE MIGRATION — schema already applied to gymos-demo Neon project via MCP during D0.4. -- This file exists to give drizzle-kit a Postgres-dialect baseline. Do NOT run against gymos-demo. -- P1b additive changes ship in 0001_*.sql via Plan P1b-02.` — insert as the first lines of the file.

    8. Run `npx prettier --write apps/staff-web/drizzle.config.ts`.
  </action>
  <verify>
    <automated>cat apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql | head -50 | grep -i "TIMESTAMP\|BOOLEAN\|NOW()" | head -3</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/server/db/migrations/0000_gymos_postgres_initial.sql` EXISTS
    - File contains at least one line matching pattern `TIMESTAMP|TIMESTAMPTZ|BOOLEAN` (Postgres syntax markers)
    - File DOES NOT contain string `datetime('now')` (SQLite syntax)
    - File DOES NOT contain string `INTEGER DEFAULT 1` (SQLite boolean idiom)
    - File DOES NOT contain string `PRAGMA` (SQLite-only directive)
    - File `apps/staff-web/server/db/migrations/meta/_journal.json` exists
    - File contains header comment string `BASELINE MIGRATION` (added by Task 3 step 7)
    - Old SQLite migration `templates/mail/server/db/migrations/0000_late_professor_monster.sql` either remains untouched in templates/mail/ (upstream concern) OR is irrelevant — only check apps/staff-web/ migrations
  </acceptance_criteria>
  <done>apps/staff-web/ has a Postgres-flavored Drizzle migration baseline so subsequent `drizzle-kit generate` runs emit PG syntax. No migration is applied to Neon in this task.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Boot apps/staff-web/ locally and verify /gymos demo still works</name>
  <what-built>
    Refactored monorepo: `templates/mail/` GymOS surface moved to `apps/staff-web/` with all files preserved verbatim. templates/mail/ restored to upstream-clean (except `webhooks.whatsapp.tsx` deleted last task of P1b). Drizzle migration regenerated for Postgres dialect.
  </what-built>
  <files>(human verification — no specific file write; see &lt;how-to-verify&gt; below)</files>
  <action>
    This is a checkpoint task — the work is human verification of the steps described in &lt;how-to-verify&gt; below. The agent's job for this task is to:
      1. Print the &lt;how-to-verify&gt; steps to the user
      2. Wait for the &lt;resume-signal&gt; from the user
      3. Halt execution until the signal arrives
    Do NOT execute the verification steps autonomously — they are deliberately interactive.
  </action>
  <verify>
    <automated>echo "checkpoint:human-verify — awaiting user signal"</automated>
  </verify>
  <how-to-verify>
    1. Boot apps/staff-web/ locally:
       ```pwsh
       cd C:/Users/dimet/hustle
       cp apps/staff-web/.env.local.example apps/staff-web/.env.local
       # Edit apps/staff-web/.env.local: paste values from templates/mail/.env.local (still gitignored), specifically DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WHATSAPP_* keys
       pnpm install
       pnpm --filter @gymos/staff-web dev
       ```
       Expected: Vite SSR boots on `:8081` (or next available port). 19 framework migrations are NOT re-applied (they were already applied during D0.2; Drizzle Kit's `migrate` command is idempotent).

    2. Open `http://localhost:8081/gymos` in a browser.
       Expected: Same conversation list as the demo. Click a conversation. See member context panel on the right. Type a reply and hit Send — message persists to Neon (existing demo behaviour, unchanged).

    3. Open `http://localhost:8081/gymos/schedule`.
       Expected: Week grid renders with 7 seeded class occurrences.

    4. Open `http://localhost:8081/gymos/members`.
       Expected: Member directory lists 5 seeded members.

    5. Open `http://localhost:8081/pick-member` (mobile demo entry).
       Expected: Member picker renders.

    6. Confirm `http://localhost:8081/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=test123` returns `test123` with HTTP 200 (this still lives in templates/mail/ for now per D-05; the route is reachable because templates/mail still runs alongside apps/staff-web at this point — OR if templates/mail is no longer started, this URL test is N/A and that's fine because Plan 04 will move the webhook to Fly).

    7. If templates/mail/ is also expected to boot for the upstream Mail demo: run `pnpm --filter mail dev` separately and confirm it still boots without GymOS routes. The `/gymos` URL should return 404 there.

    Report any errors. Do NOT proceed to Plan 02 until the demo /gymos surface is confirmed working in apps/staff-web/.
  </how-to-verify>
  <resume-signal>Type "approved" if all 5 surfaces render correctly in apps/staff-web/. Type the error message + which step failed otherwise.</resume-signal>
  <acceptance_criteria>
    - User confirms /gymos loads in apps/staff-web/ on port 8081
    - User confirms /gymos/schedule loads
    - User confirms /gymos/members loads
    - User confirms /pick-member loads
    - User confirms reply send still persists to Neon (existing demo behaviour preserved)
  </acceptance_criteria>
  <done>apps/staff-web/ is the new home for the GymOS demo. templates/mail/ is upstream-clean. Subsequent P1b plans build alongside apps/staff-web/.</done>
</task>

</tasks>

<verification>
- `pnpm install` exits 0 at repo root
- `pnpm --filter @gymos/staff-web dev` boots on :8081
- /gymos, /gymos/schedule, /gymos/members, /pick-member all render correctly
- templates/mail/ does NOT contain any `gymos*` route file (except `webhooks.whatsapp.tsx`)
- templates/mail/server/db/schema.ts does NOT contain `gymMembers` or `webhookEvents` exports
- apps/staff-web/ contains the full GymOS surface
- Drizzle baseline migration in apps/staff-web/ uses Postgres syntax (`TIMESTAMP`/`BOOLEAN`/`NOW()`)
</verification>

<success_criteria>
1. apps/staff-web/ workspace package exists and boots locally with the same /gymos demo functioning
2. templates/mail/ is upstream-clean (only `webhooks.whatsapp.tsx` remains, deleted in Plan 09)
3. pnpm-workspace.yaml includes `apps/*`
4. Drizzle config emits Postgres syntax for any future `drizzle-kit generate` runs
5. No git branch was created (per CLAUDE.md no-branch rule)
6. No env vars were committed (apps/staff-web/.env.local stays gitignored)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-01-SUMMARY.md` recording:
- Files moved (count + tree structure)
- Total LOC moved
- Any deviations from the planned target shape
- Confirmation that /gymos demo still works post-refactor
- Notes for Plan 02 about Drizzle config + schema location
</output>
