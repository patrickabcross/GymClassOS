---
phase: quick-260625-mvn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.brain.tsx
  - apps/staff-web/server/plugins/db.ts
  - apps/staff-web/server/db/migrations/0008_active_boolean_fix.sql
  - apps/staff-web/server/db/schema.ts
autonomous: true
requirements: [BRAIN-SCROLL, ACTIVE-BOOL-DURABLE]

must_haves:
  truths:
    - "The Studio Brain page (/gymos/brain) scrolls — all cards below the fold are reachable, matching the Integrations page scroll behaviour."
    - "Re-running runMigrations against a Neon where trainers.active and class_schedule_rules.active are ALREADY boolean is a strict no-op (idempotent, no error, no data change)."
    - "trainers.active and class_schedule_rules.active are declared in schema.ts as the dialect-agnostic boolean helper that maps to Postgres BOOLEAN; active stays a TS boolean."
    - "staff-web tsc compiles clean — create-trainer / update-trainer / list-trainers and the schedule-rule actions still build."
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.brain.tsx"
      provides: "Both loading + main return states wrapped in the scroll container"
      contains: "h-full w-full overflow-y-auto"
    - path: "apps/staff-web/server/plugins/db.ts"
      provides: "Migration v36 — guarded idempotent INTEGER→BOOLEAN corrective"
      contains: "version: 36"
    - path: "apps/staff-web/server/db/migrations/0008_active_boolean_fix.sql"
      provides: "Standalone manual-apply mirror of v36"
      contains: "DO $$"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "trainers.active + classScheduleRules.active boolean decl"
  key_links:
    - from: "apps/staff-web/server/db/migrations/0008_active_boolean_fix.sql"
      to: "apps/staff-web/server/plugins/db.ts (v36)"
      via: "identical guarded DO block — manual-apply path mirrors the in-app mirror"
---

<objective>
Two independent staff-web bug fixes, shipped together as one quick task.

1. **Brain scroll fix (Task 1):** `/gymos/brain` does not scroll — its content is rendered in a plain `max-w-2xl mx-auto` flex column with no scroll container, so cards below the fold (Class Methods, etc.) are unreachable. Wrap both return states in the same scroll wrapper the Integrations page already uses.

2. **Durable active-column corrective (Task 2):** The schedule prod outage (caused by `trainers.active` / `class_schedule_rules.active` existing as INTEGER instead of BOOLEAN on Neon) **was already hotfixed by hand** on Neon `billowing-sun-51091059`. This task makes that fix durable and repeatable in code: a guarded, idempotent migration v36 (+ standalone SQL mirror) that converts those two columns INTEGER→BOOLEAN *only if not already boolean*, value-preserving, and a schema.ts declaration cleanup. On HUSTLE this migration is a strict no-op because prod is already boolean.

Purpose: scroll bug is a live UX defect; the corrective makes the prod hotfix reproducible for the next gym deploy (REPEATABLE-PER-CLIENT) and prevents the same outage on a fresh Neon.
Output: 4 files changed, tsc clean, prettier-formatted, no DB applied by this run (HUSTLE prod already correct).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/staff-web/AGENTS.md

# Brain page — the two return states to wrap (loading ~346, main ~355)
@apps/staff-web/app/routes/gymos.brain.tsx

# The CORRECT scroll pattern to mirror (~line 585)
@apps/staff-web/app/routes/gymos.settings.integrations.tsx

# runMigrations array — v35 is current highest; v36 is new. Mirror the v35 entry shape.
@apps/staff-web/server/plugins/db.ts

# Standalone manual-apply SQL convention to mirror
@apps/staff-web/server/db/migrations/0007_studio_sites.sql

# schema.ts — trainers.active (~281), classScheduleRules.active (~258), classDefinitions.active (~196 DO NOT TOUCH)
@apps/staff-web/server/db/schema.ts

<interfaces>
<!-- Load-bearing finding from planning codebase inspection. Executor: read this before Task 2c. -->

The schema module `@agent-native/core/db/schema` exports ONLY: `table`, `text`,
`integer`, `real`, `now`, `sql`, plus sharing primitives. There is NO standalone
`boolean(...)` export.

The dialect-agnostic boolean column helper in THIS codebase is:
    integer("active", { mode: "boolean" })

Per packages/core/src/db/schema.ts lines 62-67, when running against Postgres
that helper already emits a Postgres `boolean` column (it calls `pgBoolean`),
and the Drizzle TS type is already `boolean`. So:
  - The CURRENT decl `integer("active", { mode: "boolean" })` is ALREADY the
    correct dialect-agnostic boolean declaration and ALREADY yields a TS boolean.
  - Do NOT introduce `import { boolean } from "drizzle-orm/pg-core"` — that breaks
    the dialect-agnostic wrapper pattern (SQLite path) and is not how any column
    in this schema is declared.

Therefore Task 2c is a DECLARATION-INTENT cleanup, not a type change. See Task 2c
for the exact mechanical instruction. The runtime durability fix lives entirely in
the migration (Task 2a/2b) — that is what corrects the on-Neon INTEGER drift.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wrap /gymos/brain in the scroll container (both return states)</name>
  <files>apps/staff-web/app/routes/gymos.brain.tsx</files>
  <action>
    The page has TWO return statements that each render a bare
    `max-w-2xl mx-auto p-6` flex column with NO scroll container, so the page does
    not scroll. Mirror gymos.settings.integrations.tsx exactly (line ~585): an
    outer scroll wrapper with the existing content nested inside.

    LOADING return (~line 344-352). Currently:
        return (
          <div className="flex flex-col gap-4 p-6 max-w-2xl mx-auto">
            ...skeletons...
          </div>
        );
    Change to:
        return (
          <div className="h-full w-full overflow-y-auto bg-background text-foreground">
            <div className="flex flex-col gap-4 p-6 max-w-2xl mx-auto">
              ...skeletons...
            </div>
          </div>
        );

    MAIN return (~line 354). Currently the root is:
        <div className="flex flex-col gap-5 p-6 max-w-2xl mx-auto">
          ...all cards...
        </div>
    Change to wrap that entire existing div in the outer scroll container:
        <div className="h-full w-full overflow-y-auto bg-background text-foreground">
          <div className="flex flex-col gap-5 p-6 max-w-2xl mx-auto">
            ...all cards (unchanged)...
          </div>
        </div>

    RULES:
    - Keep the existing inner classes EXACTLY as they are (`gap-4`/`gap-5`,
      `p-6 max-w-2xl mx-auto`). Only ADD the outer wrapper. Do not merge classes,
      do not change gaps, do not touch any card content.
    - The outer wrapper string must be byte-identical to integrations.tsx:
      `h-full w-full overflow-y-auto bg-background text-foreground`.
    - Nothing else in the file changes. No new imports needed (plain divs).
    - Run `npx prettier --write apps/staff-web/app/routes/gymos.brain.tsx`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | head -20 ; grep -c "h-full w-full overflow-y-auto bg-background text-foreground" app/routes/gymos.brain.tsx</automated>
  </verify>
  <done>grep count for the scroll-wrapper string is 2 (one per return state); tsc reports no new errors; inner content classes unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Durable INTEGER→BOOLEAN corrective — migration v36 + standalone SQL + schema decl</name>
  <files>apps/staff-web/server/plugins/db.ts, apps/staff-web/server/db/migrations/0008_active_boolean_fix.sql, apps/staff-web/server/db/schema.ts</files>
  <action>
    The schedule prod outage was already hotfixed by hand on Neon
    `billowing-sun-51091059` (trainers.active + class_schedule_rules.active →
    boolean). This task encodes that fix so it is reproducible on a fresh Neon and
    is a STRICT NO-OP where the columns are already boolean. NOT destructive — no
    DROP COLUMN/TABLE, no data loss, value-preserving (active<>0 → true).

    --- (2a) Add migration v36 to runMigrations in db.ts ---
    Insert a new array entry following the EXACT registration shape of the existing
    v35 entry (around line 447-453: `{ version: NN, sql: \`...\` }` with a leading
    comment). Place it adjacent to v35. The SQL is a PL/pgSQL DO block that, PER
    COLUMN, checks information_schema.columns.data_type and only converts when the
    column is NOT already boolean:

      {
        version: 36,
        // MVN: durable INTEGER→BOOLEAN corrective for trainers.active and
        // class_schedule_rules.active. The schedule prod outage was already
        // hotfixed BY HAND on Neon billowing-sun-51091059 — this is the
        // durability/repeatability mirror and is a STRICT NO-OP where the
        // columns are already boolean. Value-preserving (active<>0). NOT
        // destructive (no DROP COLUMN/TABLE). NOT auto-applied to Neon by the
        // build (migration-drift gotcha) — standalone mirror is
        // server/db/migrations/0008_active_boolean_fix.sql.
        sql: `DO $$
DECLARE
  v_type text;
BEGIN
  -- trainers.active
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_name = 'trainers' AND column_name = 'active';
  IF v_type IS NOT NULL AND v_type <> 'boolean' THEN
    ALTER TABLE trainers ALTER COLUMN active DROP DEFAULT;
    ALTER TABLE trainers ALTER COLUMN active TYPE boolean USING (active <> 0);
    ALTER TABLE trainers ALTER COLUMN active SET DEFAULT true;
  END IF;

  -- class_schedule_rules.active
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_name = 'class_schedule_rules' AND column_name = 'active';
  IF v_type IS NOT NULL AND v_type <> 'boolean' THEN
    ALTER TABLE class_schedule_rules ALTER COLUMN active DROP DEFAULT;
    ALTER TABLE class_schedule_rules ALTER COLUMN active TYPE boolean USING (active <> 0);
    ALTER TABLE class_schedule_rules ALTER COLUMN active SET DEFAULT true;
  END IF;
END $$;`,
      },

    NOTES:
    - Use a plain `DO $$ ... $$;` block. Do NOT use a custom dollar-quote tag
      that collides with the surrounding JS template literal. The block contains
      no nested `$...$` so plain `$$` is safe inside a JS backtick string.
    - DO NOT touch class_definitions.active (line ~196) — it is out of scope.
    - Match v35's object shape and comment style; keep it value-preserving.

    --- (2b) Standalone SQL mirror: apps/staff-web/server/db/migrations/0008_active_boolean_fix.sql ---
    Create the file mirroring 0007_studio_sites.sql's convention: a header comment
    explaining it is the manual-apply path + the SAME guarded DO block as v36
    (byte-for-byte the same DO block). Header comment, e.g.:

      -- MVN-01: durable INTEGER→BOOLEAN corrective for trainers.active and
      -- class_schedule_rules.active. Guarded + idempotent — STRICT NO-OP where
      -- already boolean. Value-preserving (active<>0), NOT destructive.
      -- Apply by hand to the Neon DB (billowing-sun-51091059); db.ts runMigrations
      -- v36 is the in-app mirror but is NOT auto-run against Neon by the build.
      -- HUSTLE prod was already hotfixed by hand — applying this there is a no-op.

      <the same DO $$ ... $$; block>

    --- (2c) schema.ts declaration cleanup (DECLARATION-INTENT only) ---
    READ the <interfaces> block in <context> FIRST. There is NO `boolean(...)`
    export from `@agent-native/core/db/schema`; the dialect-agnostic boolean helper
    is `integer("active", { mode: "boolean" })`, which ALREADY emits a Postgres
    BOOLEAN column and ALREADY types `active` as a TS boolean.

    Therefore: the existing declarations on `trainers.active` (~281) and
    `classScheduleRules.active` (~258) are ALREADY
    `integer("active", { mode: "boolean" }).notNull().default(true)` — which is the
    correct dialect-agnostic boolean declaration. DO NOT change them to a
    non-existent `boolean(...)` import.

    The only change for 2c: update the two STALE schema comments that describe
    `active` as integer-0/1, so the declared intent matches reality. Specifically:
      - trainers block comment (~lines 272-275): the sentence
        "active uses integer-boolean (mode:\"boolean\") ... Drizzle stores 0/1; SQL
        DDL is INTEGER NOT NULL DEFAULT 1." — update to state active is a BOOLEAN
        column (Postgres `boolean`, default true), mapped via the dialect-agnostic
        `integer(..., {mode:'boolean'})` helper, corrected on legacy Neon by
        migration v36.
      - classScheduleRules `active` field comment (~line 257): change
        "/** 1 = active (materialise on cron), 0 = deactivated */" to
        "/** true = active (materialise on cron), false = deactivated */".
      - Leave the `integer(..., {mode:'boolean'}).notNull().default(true)` decl
        lines themselves UNCHANGED for BOTH columns. Leave classDefinitions.active
        (~196) entirely untouched.

    If the executor judges that literally swapping the helper call would be cleaner
    AND can confirm a `boolean` export exists in the dialect-agnostic module
    (it does NOT, per planning), they must NOT do so — the codebase has no such
    export and every boolean column uses the integer-mode helper. Keep the helper.

    Run `npx prettier --write` on db.ts, schema.ts, and the new .sql file
    (prettier formats SQL via the sql plugin only if configured; if it errors on
    the .sql file, skip prettier for that file — it is not required for .sql).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | head -30 ; grep -n "version: 36" server/plugins/db.ts ; grep -c "active <> 0" server/plugins/db.ts server/db/migrations/0008_active_boolean_fix.sql ; grep -n "DROP TABLE\|DROP COLUMN\|TRUNCATE" server/plugins/db.ts server/db/migrations/0008_active_boolean_fix.sql || echo "NO_DESTRUCTIVE_SQL_OK"</automated>
  </verify>
  <done>
    tsc clean (no new errors — create-trainer/update-trainer/list-trainers + schedule-rule actions still compile since active stays a TS boolean); v36 present in db.ts and matches the v35 entry shape; the guarded DO block appears in BOTH db.ts and 0008_active_boolean_fix.sql with `active <> 0` (idempotent, value-preserving); zero DROP TABLE/DROP COLUMN/TRUNCATE in either file; classDefinitions.active untouched; the two stale integer-0/1 comments updated.
  </done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` — clean (no new errors).
- gymos.brain.tsx: both return states wrapped in `h-full w-full overflow-y-auto bg-background text-foreground` (grep count 2); inner content unchanged.
- db.ts: v36 registered with the v35 entry shape; guarded DO block checks `information_schema.columns.data_type` and only converts when `<> 'boolean'`.
- 0008_active_boolean_fix.sql exists with the same guarded DO block + manual-apply header (mirrors 0007).
- No destructive SQL anywhere (no DROP TABLE / DROP COLUMN / TRUNCATE / unqualified DELETE).
- class_definitions.active untouched.
- All changed files prettier-formatted (.ts/.tsx; .sql best-effort).
- Stayed on master; no branch created/switched.
</verification>

<success_criteria>
- /gymos/brain scrolls, matching /gymos/settings/integrations behaviour.
- v36 is a guarded, idempotent, value-preserving INTEGER→BOOLEAN corrective for trainers.active + class_schedule_rules.active — a strict no-op when already boolean.
- Standalone 0008 SQL mirror exists for the manual-apply path.
- schema.ts intent matches reality (boolean columns via the dialect-agnostic helper; stale 0/1 comments corrected); active remains a TS boolean so all consuming actions compile.
- No DB applied by this run — HUSTLE prod was already hotfixed by hand.
</success_criteria>

<output>
After completion, create `.planning/quick/260625-mvn-fix-brain-page-scroll-durable-corrective/260625-mvn-SUMMARY.md`.

The SUMMARY MUST state:
- The schedule prod outage was ALREADY hotfixed BY HAND on Neon `billowing-sun-51091059` (trainers.active + class_schedule_rules.active converted to boolean).
- Migration v36 (+ standalone 0008_active_boolean_fix.sql) is the durability/repeatability fix and is a STRICT NO-OP on HUSTLE because prod is already boolean. It only does work on a fresh Neon where those columns were created as INTEGER.
- Per migration-drift gotcha, v36 is NOT auto-applied to Neon by the build; the standalone 0008 SQL is the manual-apply path for the next gym deploy.
- Planning finding: `@agent-native/core/db/schema` has no `boolean(...)` export; the integer-mode helper IS the dialect-agnostic boolean column and already yields Postgres BOOLEAN — so schema decl lines were intentionally left as the helper and only stale comments were corrected.
</output>
