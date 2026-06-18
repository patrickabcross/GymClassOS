---
phase: AE2-schedule-write-tools
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/set-occurrence-capacity.ts
  - apps/staff-web/actions/update-class-definition.ts
  - apps/staff-web/actions/mark-occurrence-complete.ts
  - apps/staff-web/.generated/actions-registry.ts
  - apps/staff-web/app/routes/gymos.schedule.tsx
autonomous: true
requirements: [AES-02, AES-05, AES-06]
must_haves:
  truths:
    - "Agent can change an occurrence's capacity directly, but the write is rejected (no mutation) when the new capacity is below the count of active bookings"
    - "Agent can edit a class definition's name, duration, default capacity, and category (never touches the active flag)"
    - "Agent can mark a past occurrence completed; a future occurrence is rejected with OCCURRENCE_IN_FUTURE"
    - "All three new actions are present in .generated/actions-registry.ts so the framework can dispatch them at runtime"
    - "The Schedule route re-runs its loader after any agent write action with no manual reload"
  artifacts:
    - path: "apps/staff-web/actions/set-occurrence-capacity.ts"
      provides: "set-occurrence-capacity defineAction with CAPACITY_BELOW_BOOKINGS guard (AES-02)"
      contains: "CAPACITY_BELOW_BOOKINGS"
    - path: "apps/staff-web/actions/update-class-definition.ts"
      provides: "update-class-definition defineAction (AES-05 edit path)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/mark-occurrence-complete.ts"
      provides: "mark-occurrence-complete defineAction (AES-06)"
      contains: "OCCURRENCE_IN_FUTURE"
    - path: "apps/staff-web/.generated/actions-registry.ts"
      provides: "Registry imports + map entries for the three new direct actions"
      contains: "set-occurrence-capacity"
    - path: "apps/staff-web/app/routes/gymos.schedule.tsx"
      provides: "useChangeVersions([\"action\"]) + useRevalidator live-refresh (AEX-03 for the Schedule tab)"
      contains: "useChangeVersions"
  key_links:
    - from: "apps/staff-web/actions/set-occurrence-capacity.ts"
      to: "schema.bookings"
      via: "count(bookings WHERE occurrenceId + status='booked') guard before UPDATE"
      pattern: "CAPACITY_BELOW_BOOKINGS"
    - from: "apps/staff-web/.generated/actions-registry.ts"
      to: "apps/staff-web/actions/set-occurrence-capacity.ts"
      via: "import * as a_set_occurrence_capacity + modules map entry"
      pattern: "a_set_occurrence_capacity"
    - from: "apps/staff-web/app/routes/gymos.schedule.tsx"
      to: "@agent-native/core/client useChangeVersions"
      via: "useChangeVersions([\"action\"]) + useRevalidator"
      pattern: "useChangeVersions"
---

<objective>
Ship the three DIRECT (ungated) schedule write actions — `set-occurrence-capacity` (with a bookings guard), `update-class-definition`, and `mark-occurrence-complete` — register them manually in `.generated/actions-registry.ts`, and wire live-refresh into the Schedule route. This is Wave 1 of AE2: everything that does NOT route through propose→approve.

Purpose: Give the agent the direct-write side of the schedule lifecycle (edit a definition, change an occurrence's capacity with a correctness guard, mark a past occurrence complete) and make the Schedule tab refresh automatically after agent writes, matching the AEX-03 pattern AE1 shipped for Forms.

Output: 3 new defineAction files, manual registry entries for them, and a live-refresh edit to `gymos.schedule.tsx`. NO system-prompt change in this plan (that ships in Wave 3, AE2-03), NO gate wiring (that is Wave 2, AE2-02), and NO schema change (research confirms none is needed — all tables exist).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- classDefinitions columns (apps/staff-web/server/db/schema.ts lines 188-198), exported via schema.classDefinitions -->
<!-- id (PK, cdef_), name NOT NULL, description (nullable), durationMin NOT NULL, defaultCapacity NOT NULL (default 12), -->
<!-- defaultInstructorUserId (nullable), category (nullable), active (integer boolean NOT NULL default true), createdAt NOT NULL -->

<!-- classOccurrences columns (schema.ts lines 201-216), exported via schema.classOccurrences -->
<!-- id (PK, cocc_), definitionId NOT NULL, startsAt (text ISO w/ tz offset), endsAt (text), capacity NOT NULL, -->
<!-- instructorUserId (nullable), room (nullable), status enum ["scheduled","cancelled","completed"] default "scheduled", notes (nullable), createdAt -->

<!-- bookings columns (schema.ts lines 218-232), exported via schema.bookings -->
<!-- id (PK), occurrenceId NOT NULL, memberId NOT NULL, status enum ["booked","waitlist","cancelled","attended","no_show"] default "booked", -->
<!-- passId (nullable FK passes.id), bookedByUserId (nullable), bookedAt, cancelledAt (nullable), attendedAt (nullable) -->
<!-- Active bookings filter = status = 'booked' -->

<!-- DB access (apps/staff-web/server/db/index.ts): -->
<!-- import { getDb, schema } from "../server/db/index.js";  // getDb() returns the Drizzle client -->
<!-- Action import-path convention is the ../server/db/index.js ESM .js suffix (see create-class-occurrence.ts line 20) -->

<!-- Drizzle helpers from "drizzle-orm": eq, and, count. count() in pg mode may surface as string — wrap Number() (RESEARCH Open Q2). -->

<!-- Live-refresh hook (confirmed export, used in gymos.forms._index.tsx after AE1): -->
<!-- import { useChangeVersions } from "@agent-native/core/client";  // signature: (sources: string[]) => number -->
<!-- import { useRevalidator } from "react-router"; -->

<!-- gymos.schedule.tsx CURRENT route imports (line 28): -->
<!--   import { useLoaderData, Form, redirect, useSearchParams } from "react-router"; -->
<!-- The route component has NO useRevalidator/useChangeVersions today (NewClassDialog.tsx has its own useRevalidator — leave it). -->

<!-- Registry convention (.generated/actions-registry.ts): import alias is a_<name with underscores>, -->
<!-- e.g. create-class-occurrence -> a_create_class_occurrence; map key is the kebab action name. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add set-occurrence-capacity, update-class-definition, mark-occurrence-complete actions</name>
  <files>apps/staff-web/actions/set-occurrence-capacity.ts, apps/staff-web/actions/update-class-definition.ts, apps/staff-web/actions/mark-occurrence-complete.ts</files>
  <read_first>
    - apps/staff-web/actions/create-class-occurrence.ts (defineAction shape + the `../server/db/index.js` import path convention + guard:allow-unscoped comment style)
    - apps/staff-web/actions/create-class-definition.ts (the existing definition Zod schema to mirror field names + bounds for the edit action)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Pattern 1" (set-occurrence-capacity verbatim) + "update-class-definition (AES-05)" code example + "Pitfall 5" (mark-complete future guard)
    - apps/staff-web/server/db/schema.ts lines 188-232 (classDefinitions, classOccurrences, bookings columns)
  </read_first>
  <behavior>
    - set-occurrence-capacity: occurrence with 9 active bookings + requested capacity 8 returns {error:"CAPACITY_BELOW_BOOKINGS", bookingCount:9, requestedCapacity:8} and performs NO UPDATE
    - set-occurrence-capacity: occurrence with 5 active bookings + requested capacity 10 UPDATEs capacity and returns {updated:true, occurrenceId, capacity:10}
    - set-occurrence-capacity: missing occurrence returns {error:"OCCURRENCE_NOT_FOUND"}; non-scheduled occurrence returns {error:"OCCURRENCE_NOT_SCHEDULABLE", status}
    - update-class-definition: only the supplied optional fields are written; an empty patch returns {updated:false, reason:"no changes"}; missing definition returns {error:"DEFINITION_NOT_FOUND"}
    - mark-occurrence-complete: future occurrence (startsAt > now) returns {error:"OCCURRENCE_IN_FUTURE"}; past scheduled occurrence sets status='completed' and returns {completed:true}; already-completed occurrence is a no-op success
  </behavior>
  <action>
    Create THREE defineAction files in `apps/staff-web/actions/`. Each imports `{ getDb, schema } from "../server/db/index.js"` and the needed helpers from `drizzle-orm`. Every Drizzle query carries a `// guard:allow-unscoped — single-tenant gym tables` comment in the same file (the guard CI scan requires it). NONE of these files gets an `http` key (write actions are agent-only per AGENTS.md "Adding a New Gym Action" step 2).

    FILE 1 — `set-occurrence-capacity.ts` (AES-02). Counts active bookings and rejects a capacity below that count WITHOUT mutating. Verbatim:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq, and, count } from "drizzle-orm";

    export default defineAction({
      description:
        "Change a class occurrence's capacity. Rejected if the new capacity is " +
        "below the current number of active bookings — returns {error:'CAPACITY_BELOW_BOOKINGS', " +
        "bookingCount, requestedCapacity} with no mutation. Returns {updated:true, occurrenceId, capacity} on success.",
      schema: z.object({
        occurrenceId: z.string().min(1),
        capacity: z.number().int().min(1).max(500),
      }),
      run: async ({ occurrenceId, capacity }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym tables
        const [occ] = await db
          .select({
            id: schema.classOccurrences.id,
            status: schema.classOccurrences.status,
          })
          .from(schema.classOccurrences)
          .where(eq(schema.classOccurrences.id, occurrenceId))
          .limit(1);
        if (!occ) return { error: "OCCURRENCE_NOT_FOUND" };
        if (occ.status !== "scheduled")
          return { error: "OCCURRENCE_NOT_SCHEDULABLE", status: occ.status };

        // guard:allow-unscoped — single-tenant gym tables
        const [row] = await db
          .select({ bookingCount: count() })
          .from(schema.bookings)
          .where(
            and(
              eq(schema.bookings.occurrenceId, occurrenceId),
              eq(schema.bookings.status, "booked"),
            ),
          );
        const bookingCount = Number(row?.bookingCount ?? 0);

        if (capacity < bookingCount) {
          return {
            error: "CAPACITY_BELOW_BOOKINGS",
            bookingCount,
            requestedCapacity: capacity,
          };
        }

        // guard:allow-unscoped — single-tenant gym tables
        await db
          .update(schema.classOccurrences)
          .set({ capacity })
          .where(eq(schema.classOccurrences.id, occurrenceId));
        return { updated: true, occurrenceId, capacity };
      },
    });
    ```

    FILE 2 — `update-class-definition.ts` (AES-05). Edits only name/durationMin/defaultCapacity/category — never `active`. Verbatim:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";

    export default defineAction({
      description:
        "Edit a class definition's name, duration, default capacity, or category. " +
        "Only the supplied fields change; never touches the active flag, instructor, or description. " +
        "Returns {updated:true} or {updated:false, reason} or {error}.",
      schema: z.object({
        definitionId: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        durationMin: z.number().int().min(5).max(480).optional(),
        defaultCapacity: z.number().int().min(1).max(500).optional(),
        category: z.string().min(1).max(60).optional(),
      }),
      run: async ({ definitionId, name, durationMin, defaultCapacity, category }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym tables
        const [def] = await db
          .select({ id: schema.classDefinitions.id })
          .from(schema.classDefinitions)
          .where(eq(schema.classDefinitions.id, definitionId))
          .limit(1);
        if (!def) return { error: "DEFINITION_NOT_FOUND" };

        const updates: Partial<typeof schema.classDefinitions.$inferInsert> = {};
        if (name !== undefined) updates.name = name;
        if (durationMin !== undefined) updates.durationMin = durationMin;
        if (defaultCapacity !== undefined) updates.defaultCapacity = defaultCapacity;
        if (category !== undefined) updates.category = category;
        if (Object.keys(updates).length === 0)
          return { updated: false, reason: "no changes" };

        // guard:allow-unscoped — single-tenant gym tables
        await db
          .update(schema.classDefinitions)
          .set(updates)
          .where(eq(schema.classDefinitions.id, definitionId));
        return { updated: true };
      },
    });
    ```

    FILE 3 — `mark-occurrence-complete.ts` (AES-06). Marks a PAST scheduled occurrence completed; rejects future occurrences (Pitfall 5); already-completed is a no-op success. Verbatim:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";

    export default defineAction({
      description:
        "Mark a past class occurrence as completed. Rejects a future occurrence " +
        "(returns {error:'OCCURRENCE_IN_FUTURE'}). An already-completed occurrence is a no-op success. " +
        "Returns {completed:true} or {error}.",
      schema: z.object({
        occurrenceId: z.string().min(1),
      }),
      run: async ({ occurrenceId }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym tables
        const [occ] = await db
          .select({
            id: schema.classOccurrences.id,
            status: schema.classOccurrences.status,
            startsAt: schema.classOccurrences.startsAt,
          })
          .from(schema.classOccurrences)
          .where(eq(schema.classOccurrences.id, occurrenceId))
          .limit(1);
        if (!occ) return { error: "OCCURRENCE_NOT_FOUND" };
        if (occ.status === "completed") return { completed: true };
        if (occ.status === "cancelled")
          return { error: "OCCURRENCE_CANCELLED" };
        if (new Date(occ.startsAt) > new Date())
          return { error: "OCCURRENCE_IN_FUTURE" };

        // guard:allow-unscoped — single-tenant gym tables
        await db
          .update(schema.classOccurrences)
          .set({ status: "completed" })
          .where(eq(schema.classOccurrences.id, occurrenceId));
        return { completed: true };
      },
    });
    ```
    Run `npx prettier --write apps/staff-web/actions/set-occurrence-capacity.ts apps/staff-web/actions/update-class-definition.ts apps/staff-web/actions/mark-occurrence-complete.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: actions/set-occurrence-capacity.ts, actions/update-class-definition.ts, actions/mark-occurrence-complete.ts — each contains `defineAction`
    - set-occurrence-capacity.ts contains the string `CAPACITY_BELOW_BOOKINGS` and uses `count()` from drizzle-orm wrapped in `Number(`
    - set-occurrence-capacity.ts performs the bookingCount comparison BEFORE the `.update(` call (grep: the `if (capacity < bookingCount)` early-return precedes any `db.update`)
    - update-class-definition.ts `set(updates)` object never assigns `active` (grep the file: no `updates.active` and no `active:` key)
    - mark-occurrence-complete.ts contains `OCCURRENCE_IN_FUTURE` and compares `new Date(occ.startsAt) > new Date()`
    - Every file contains at least one `// guard:allow-unscoped` comment
    - None of the three files contains an `http:` key
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Three direct schedule write actions compile; the capacity guard provably blocks under-booking writes; mark-complete provably rejects future occurrences; no action touches the definition active flag.</done>
</task>

<task type="auto">
  <name>Task 2: Manually register the three new actions in .generated/actions-registry.ts</name>
  <files>apps/staff-web/.generated/actions-registry.ts</files>
  <read_first>
    - apps/staff-web/.generated/actions-registry.ts (FULL file — the existing `import * as a_create_class_occurrence from "../actions/create-class-occurrence"` import block + the `modules` Record entries; replicate the exact alias + key convention)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Pitfall 6" + "actions-registry.ts manual entry pattern" (confirms manual entries are REQUIRED — the registry is stale; AE1 forms actions are absent)
  </read_first>
  <action>
    Edit `apps/staff-web/.generated/actions-registry.ts`. The registry is auto-generated only during `pnpm build` (Vercel deploy); it is stale locally (RESEARCH Pitfall 6 — AE1 forms actions are missing from it). Add the three new direct actions manually so the framework can dispatch them at runtime.

    First, READ the file to confirm the exact import style and the `modules` map shape. Then:

    (a) Add three import lines alongside the existing `a_create_class_*` imports (match the existing alias convention — underscores, lowercase, no `.ts`/`.js` suffix, path `../actions/<name>`):
    ```typescript
    import * as a_set_occurrence_capacity from "../actions/set-occurrence-capacity";
    import * as a_update_class_definition from "../actions/update-class-definition";
    import * as a_mark_occurrence_complete from "../actions/mark-occurrence-complete";
    ```

    (b) Add three entries to the `modules` Record (the kebab action name is the key; match the existing trailing-comma + quoting style of neighbouring entries):
    ```typescript
    "set-occurrence-capacity": a_set_occurrence_capacity,
    "update-class-definition": a_update_class_definition,
    "mark-occurrence-complete": a_mark_occurrence_complete,
    ```

    Match the EXACT formatting of the surrounding lines (this is a generated file — do not reformat the whole file). If the file already contains any of these entries (a build may have regenerated it), leave the existing entry and do NOT duplicate.

    Run `npx prettier --write apps/staff-web/.generated/actions-registry.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - actions-registry.ts contains all three import aliases: `a_set_occurrence_capacity`, `a_update_class_definition`, `a_mark_occurrence_complete`
    - actions-registry.ts `modules` map contains the keys `"set-occurrence-capacity"`, `"update-class-definition"`, `"mark-occurrence-complete"` (grep each kebab string appears exactly once)
    - No import path uses a `.ts` or `.js` suffix (matches the existing `../actions/<name>` convention)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>All three new actions are imported and mapped in the registry; tsc resolves the imports; the framework can dispatch them by their kebab names.</done>
</task>

<task type="auto">
  <name>Task 3: Wire live-refresh (useChangeVersions + useRevalidator) into the Schedule route</name>
  <files>apps/staff-web/app/routes/gymos.schedule.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.schedule.tsx (FULL file — the route import line at line 28 and the default-export route component function body; find the component fn and its first hook calls)
    - apps/staff-web/app/routes/gymos.forms._index.tsx (the AE1-shipped reference: useChangeVersions(["action"]) import + useRevalidator + the useEffect with [actionVersion] dependency array)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Pattern 6" + "Pitfall 7" (useRevalidator must be added at the ROUTE import level; NewClassDialog's own import stays untouched)
  </read_first>
  <action>
    Edit `apps/staff-web/app/routes/gymos.schedule.tsx` for AEX-03 live-refresh. The route is an RR v7 loader route; `useDbSync` only invalidates TanStack Query, NOT loaders, so we subscribe to the "action" change source and call the revalidator — identical to the Forms route AE1 shipped.

    1. Extend the existing react-router import (line 28) to add `useRevalidator`, and add a new `useChangeVersions` import + extend the react import to include `useEffect`. The file currently has:
    ```typescript
    import { useLoaderData, Form, redirect, useSearchParams } from "react-router";
    ```
    Change it to:
    ```typescript
    import {
      useLoaderData,
      Form,
      redirect,
      useSearchParams,
      useRevalidator,
    } from "react-router";
    ```
    Then add (near the other top-of-file imports — place after the react-router import; if `useEffect`/`useState` are already imported from "react", extend that import instead of adding a duplicate):
    ```typescript
    import { useEffect } from "react";
    import { useChangeVersions } from "@agent-native/core/client";
    ```
    Note: do NOT touch `NewClassDialog.tsx` — it has its own `useRevalidator` import (Pitfall 7). This edit is at the ROUTE file level only.

    2. Inside the default-export route component function body (the component returned for `/gymos/schedule`, which calls `useLoaderData()` and `useSearchParams()`), add the following AFTER the existing `useSearchParams()` / `useLoaderData()` hook calls:
    ```typescript
      const revalidator = useRevalidator();
      const actionVersion = useChangeVersions(["action"]);

      // Re-run the loader whenever the agent completes a write action (AEX-03).
      useEffect(() => {
        if (actionVersion > 0) {
          revalidator.revalidate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [actionVersion]);
    ```
    Do NOT add `revalidator` to the dependency array (it is a new object each render and would loop — same as the AE1 Forms route). Leave the rest of the component unchanged.

    Run `npx prettier --write apps/staff-web/app/routes/gymos.schedule.tsx`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - gymos.schedule.tsx imports `useRevalidator` from "react-router", `useEffect` from "react", and `useChangeVersions` from "@agent-native/core/client"
    - gymos.schedule.tsx contains `useChangeVersions(["action"])` and a `useEffect` whose dependency array is `[actionVersion]` (NOT including `revalidator`)
    - The route component body calls `revalidator.revalidate()` inside the `if (actionVersion > 0)` guard
    - NewClassDialog.tsx is NOT in this plan's diff (its useRevalidator import is untouched)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>The Schedule list route revalidates on the "action" change source with the correct (non-looping) dependency array, matching the AE1 Forms pattern.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0 (whole app compiles with the 3 new actions + registry edits + route edit)
- `cd apps/staff-web && npx prettier --check actions/set-occurrence-capacity.ts actions/update-class-definition.ts actions/mark-occurrence-complete.ts app/routes/gymos.schedule.tsx` reports no formatting issues
- grep confirms every new action file contains `// guard:allow-unscoped`
- grep confirms all three kebab action names appear in `.generated/actions-registry.ts`
- NO edit to agent-chat.ts, propose-action.ts, approve-proposal.ts, or schema.ts in this plan (those are Waves 2 + 3)
- NO new file under `apps/staff-web/server/db/migrations/` (AE2 needs no schema change — all tables exist)
- Optional DB replay (Neon MCP, gymos-demo project billowing-sun-51091059): pick a scheduled occurrence with > 0 active bookings, run the set-occurrence-capacity guard SQL (count booked, compare to a below-count value) and confirm the count blocks the UPDATE; do not write.
</verification>

<success_criteria>
- 3 direct write actions exist and compile: set-occurrence-capacity, update-class-definition, mark-occurrence-complete
- set-occurrence-capacity rejects (no mutation) when the requested capacity is below the active-booking count, and saves directly otherwise
- update-class-definition cannot change the definition's active flag
- mark-occurrence-complete rejects future occurrences
- All three actions are manually present in the actions registry (the registry is stale; manual entries required)
- The Schedule list route re-runs its loader on the "action" change source (no manual reload) without an infinite revalidate loop
- AES-02, AES-05, AES-06 have shipped actions (system-prompt exposure deferred to AE2-03)
</success_criteria>

<output>
After completion, create `.planning/phases/AE2-schedule-write-tools/AE2-01-SUMMARY.md`
</output>
