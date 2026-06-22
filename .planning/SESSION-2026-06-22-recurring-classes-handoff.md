# Handoff — Recurring classes + staff/trainers (Phase 2 DONE; Phase 3 NEXT)

Date 2026-06-22. Phase 1 + **Phase 2 are DONE and DEPLOYED**. Resume at **Phase 3 (populate HUSTLE's timetable)**.

> **STATUS 2026-06-22 — Phase 2 DONE (quick `260622-mpv`, merge `b2fcb2d7` + gap-fix `958e2782`), DEPLOYED.**
> Shipped: migrations **v27–v30** (`class_schedule_rules` + `class_occurrences.rule_id` + partial unique idx + active idx — confirmed applied in `gymos-demo`), DST-correct Europe/London generator (Intl-based, zero-dep; duplicated in `apps/staff-web/server/lib/recurrence-generator.ts` + `services/worker/src/domain/recurrence-generator.ts`; 5 TDD cases prove BST 17:00Z vs GMT 18:00Z), nightly **`class-materialize`** worker cron (registered in `pgboss.schedule`, `0 4 * * *` **UTC** — executor used UTC not Europe/London, harmless), three two-exposed actions (`create-schedule-rule` generates the first 8-week window inline; `update-schedule-rule`; `deactivate-schedule-rule` is **booking-safe** — cancels future *unbooked* series occurrences, keeps booked ones), and the **Repeat-weekly** toggle + **Cancel-whole-series** UI on the Schedule. `daysOfWeek` stored as JSON string `"[1,3]"`. Deployed: Vercel (staff-web) auto on push; **Fly worker manually deployed → v21** (git push does NOT deploy the worker). SUMMARY: `.planning/quick/260622-mpv-phase-2-recurring-classes-engine-schedul/260622-mpv-SUMMARY.md`.

## DONE + DEPLOYED today (master, live on Vercel)
- **Class catalog** — 21 HUSTLE class types written directly to `gymos-demo` Neon `class_definitions` (active); 3 demo classes deactivated. Durations inferred from timetable, **capacities are placeholders** the owner should verify. (Direct SQL, not a migration.)
- **Customer-facing brand** (quick `260622-ifj`) — `tenant-brand.ts` + 5 public SSR surfaces (schedule/forms/buy/video/content) render Poppins + HUSTLE colours.
- **Brain "Brand & Styling"** (quick `260622-jga`) — `brand-styling` doc = source of truth (Path A); `getTenantBrand()` DB-backed resolver feeds the SSR surfaces; URL-fetch→Claude-extract→review→save in the Brain tab (SSRF-guarded `safe-fetch.ts`).
- **Trainers + location Phase 1** (quick `260622-lp3`) — see below.

## bsport model (their platform; HUSTLE runs on it — "Powered by bsport")
Add sessions → activity → recurrence (weekly / every-other-week / daily / monthly) → select days-of-week → **date range (start→end)** → establishment (location) + teacher → generates all sessions in range. Edit = edit one session then **multi-select** "sessions to modify" for bulk apply. Refs: intercom.help/bsport-helpcenter articles 5900899, 5013015.
**Our model = bsport's familiar setup flow BUT stored rule + rolling 8-week auto-fill (set-and-forget) instead of bsport's fixed end-date + manual regen.** User confirmed: "stored weekly, fills 8 weeks."

## Locked decisions
- Trainers = **lightweight roster** (NOT auth users). ✅ DONE (Phase 1).
- Locations = **structured Norwich/Wymondham field**. ✅ DONE (Phase 1).
- Recurrence = **stored weekly rule + rolling 8-week materialisation**, Europe/London TZ.

## Phase 1 (DONE, `260622-lp3`) — what exists now
- Migrations **v22–v26** in `apps/staff-web/server/plugins/db.ts` (auto-run on deploy): `trainers` table (id, name, home_location, active, created_at + UNIQUE lower(name)); `class_occurrences` got `location` (text) + `trainer_id` (text) columns; 23 trainers seeded.
- Actions: `list-trainers` (GET), `create-trainer`, `update-trainer` (reactivate-or-create dedupe; no hard delete). Two-exposed (agent-chat.ts Schedule section + AGENTS.md).
- `create-class-occurrence.ts` takes optional `trainerId` + `location`.
- UI: `NewClassDialog.tsx` has Trainer + Location selects (bsport order activity→location→teacher); `ManageTrainersDialog.tsx` opened from the Schedule header.

## Phase 2 (DONE — quick `260622-mpv`, deployed) — recurrence engine
✅ Built + deployed (see STATUS banner at top). Spec as built:
1. **Schema (additive, db.ts next version = v27+):**
   - `class_schedule_rules`: id, definition_id, days_of_week (JSON array or CSV of 0–6), time_of_day (TEXT "HH:MM" studio-local), location (TEXT Norwich/Wymondham), capacity (int), trainer_id (text nullable), starts_on (date), ends_on (date nullable — null = open-ended), active (bool default 1), generated_through (TEXT date cursor), created_at.
   - ADD COLUMN `rule_id` (text nullable) to `class_occurrences` (links occurrence → series; enables series cancel/edit + dedupe).
   - **PARTIAL UNIQUE INDEX** `class_occurrences(rule_id, starts_at) WHERE rule_id IS NOT NULL` for idempotent generation (`ON CONFLICT DO NOTHING`). Existing manual occurrences (rule_id NULL) are unaffected.
2. **Generator lib** (shared): given a rule, compute occurrence start instants for a rolling window (default 8 weeks) in **Europe/London** (BST-aware!). starts_at is stored verbatim ISO today (SCH-07 IANA-TZ deferred) — recurrence MUST compute wall-clock e.g. 18:00 London → correct UTC per week across DST. Check if `date-fns-tz` is a dep (stack says date-fns + date-fns-tz); else use Intl/`Temporal` polyfill. **This is the trickiest part — get DST right.**
3. **Worker job** (`services/worker`): `src/queues/materialize-class-occurrences.ts` following `housekeeping.ts` pattern — register consumer (`boss.work`) FIRST, then `boss.schedule(QUEUE, "0 4 * * *", {}, { tz })`; add the queue name to `packages/queue/src/types.ts` (a `CLASS_REMINDER` stub already exists — add e.g. `CLASS_MATERIALIZE`) and create it in `services/worker/src/index.ts` boot loop + call register in main(). Each run: read active rules, generate occurrences for the next ~8 weeks `ON CONFLICT DO NOTHING`, advance `generated_through`. Worker DB via `services/worker/src/lib/db.js` (getDb/schema).
4. **Actions (two-exposed):** `create-schedule-rule` (also generates the first window immediately so the UI shows occurrences without waiting for the cron), `update-schedule-rule`, `deactivate-schedule-rule` (stops future materialisation; decide whether to also cancel未-started future occurrences — recommend yes, cancel future scheduled ones tied to the rule). `// guard:allow-unscoped — single-tenant` on rule queries.
5. **UI:** extend `NewClassDialog.tsx` with a "Repeat weekly" toggle → day-of-week multi-select (Mon–Sun); when on, submit creates a `class_schedule_rule` (which generates the window) instead of a single occurrence. Add a way to cancel/deactivate a series (e.g. on an occurrence that has a rule_id, offer "cancel this one" vs "cancel the whole series"). Bulk multi-select edit (bsport-style) = fast-follow, not v1.

## Phase 3 (AFTER Phase 2) — populate HUSTLE's timetable
Turn the two timetable images (weeks of Mon 22/06 and Mon 29/06) into `class_schedule_rules` — one rule per recurring weekly slot (day, time, class type, location Norwich/Wymondham, trainer, capacity). The two weeks are nearly identical = the weekly pattern; reconcile differences (e.g. **HUSTLE SUMMER GAMES** appears only 29/06 week → treat as a one-off occurrence, not a rule). Likely done as a seed script or via the new actions. Source images cached this session; re-request if not available.

## Verified tech refs
- Migrations: `apps/staff-web/server/plugins/db.ts` runMigrations (auto-run on Vercel boot). After Phase 1, latest version = **26** → Phase 2 starts at **27**. Additive only; no drizzle-kit push; don't edit standalone .sql files (not auto-run). Mirror every change in `server/db/schema.ts` Drizzle defs.
- `class_occurrences` columns now: id, definition_id, starts_at, ends_at, capacity, instructor_user_id, room, **location**, **trainer_id**, status (scheduled/cancelled/completed), notes, created_at. No hard FKs (soft refs). No `(definition_id, starts_at)` unique index (only PK on id) — Phase 2 adds the partial unique on (rule_id, starts_at).
- `trainers`: id, name, home_location, active, created_at + UNIQUE lower(name).
- Worker: `services/worker/src/index.ts` (boot/createQueue/register), `queues/housekeeping.ts` (canonical cron pattern: `boss.schedule(name, cron, data, {tz})`), `lib/db.js`. `packages/queue/src/types.ts` = QUEUE_NAMES (+ `CLASS_REMINDER` + `ClassReminderPayload` stub, unwired).
- Schedule UI: `gymos.schedule.tsx` (loader pulls all occurrences+defs+booking counts; header has New Class + Manage Trainers), `NewClassDialog.tsx`, `ManageTrainersDialog.tsx`.
- create-occurrence: `apps/staff-web/actions/create-class-occurrence.ts` (definitionId, startsAt, capacity?, room?, instructorUserId?, notes?, trainerId?, location?; computes endsAt from definition.durationMin).
- GSD flow: each phase = `/gsd:quick` → planner (opus) → executor (sonnet, worktree) → I ff/merge + re-run `cd apps/staff-web && pnpm typecheck` on master (executors have twice claimed clean when not — ALWAYS re-verify), commit PLAN, remove worktree, push. No packages/core touch = no changeset.

## NEXT STEP on resume
Phase 2 is DONE + deployed. Build **Phase 3** (populate HUSTLE's timetable from the two timetable images → `class_schedule_rules`, one rule per weekly slot; SUMMER GAMES = one-off occurrence, not a rule) — likely a seed script or via `create-schedule-rule`. Deploy: `git push origin master` deploys **staff-web/Vercel only**; if any `services/worker` change is involved, also run `fly deploy --config services/edge-webhooks/fly.toml --dockerfile Dockerfile --remote-only` (worker is NOT auto-deployed).
