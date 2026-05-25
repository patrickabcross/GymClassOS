---
phase: P1b.1-customer-pilot-enablement
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/list-fill-rate.ts
  - apps/staff-web/actions/list-classes.ts
  - apps/staff-web/actions/list-members.ts
autonomous: true
requirements: [AGENT-04]
must_haves:
  truths:
    - "The action `list-fill-rate` is invokable via GET /_agent-native/actions/list-fill-rate and returns an array of class occurrences with capacity, booked count, and fillPct for the trailing 7 days"
    - "The action `list-classes` is invokable via the agent (as a tool) and via HTTP and returns the gym's class definitions + recent occurrences"
    - "The action `list-members` is invokable via the agent and via HTTP and returns the gym's seeded member roster"
    - "All three actions use defineAction from @agent-native/core — they are auto-registered as both agent tools and HTTP endpoints"
    - "None of the queries are unscoped — gym tables are single-tenant by design (no ownableColumns), so accessFilter is not required (per research §6)"
  artifacts:
    - path: "apps/staff-web/actions/list-fill-rate.ts"
      provides: "Trailing-N-days class fill rate aggregation"
      contains: "defineAction"
    - path: "apps/staff-web/actions/list-classes.ts"
      provides: "Class definitions + recent occurrences list"
      contains: "defineAction"
    - path: "apps/staff-web/actions/list-members.ts"
      provides: "Gym member roster"
      contains: "defineAction"
  key_links:
    - from: "apps/staff-web/actions/list-fill-rate.ts"
      to: "Neon class_occurrences + bookings tables"
      via: "Drizzle ORM via getDb()"
      pattern: "classOccurrences|bookings"
    - from: "apps/staff-web/actions/list-classes.ts"
      to: "Neon class_definitions + class_occurrences tables"
      via: "Drizzle ORM"
      pattern: "classDefinitions|classOccurrences"
    - from: "apps/staff-web/actions/list-members.ts"
      to: "Neon gym_members table"
      via: "Drizzle ORM"
      pattern: "gymMembers"
---

<objective>
Land three new `defineAction` files — the foundation for the gym-aware agent (P1b.1-07) and the analytics route (P1b.1-06). These actions become both LLM tools (agent surface) and HTTP endpoints auto-mounted at `/_agent-native/actions/<name>`.

Purpose: The signed customer pilot needs the right-rail Chat to answer real gym questions. The three hardcoded chip prompts and any free-form gym question require these primitive read actions. This plan delivers the three actions that have NO dependencies on other plans — read-only aggregations / lists over already-seeded gym tables.

Output:
- `apps/staff-web/actions/list-fill-rate.ts` — answers "Which classes haven't been filled in the last week?"
- `apps/staff-web/actions/list-classes.ts` — supporting action used by the agent for context
- `apps/staff-web/actions/list-members.ts` — supporting action used by the agent for context
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md
@apps/staff-web/server/db/schema.ts
@apps/staff-web/actions/list-emails.ts
@.agents/skills/actions/SKILL.md

<interfaces>
<!-- Existing defineAction pattern + relevant Drizzle schema. -->

From @agent-native/core (existing usage in apps/staff-web/actions/*.ts):
```typescript
export default defineAction({
  description: string,              // tool description for the LLM
  schema: z.object({...}),          // input schema (Zod) — defines tool params
  http: { method: "GET" | "POST" }, // optional, defaults POST
  run: async (input, ctx?) => { ... return result },
});
```

From apps/staff-web/server/db/schema.ts (verify column names by reading at task time):
```typescript
// gym_members
export const gymMembers = table("gym_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phoneE164: text("phone_e164").notNull(),
  email: text("email"),
  createdAt: text("created_at").notNull().default(now()),
});

// class_definitions
export const classDefinitions = table("class_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  durationMin: integer("duration_min").notNull(),
  defaultCapacity: integer("default_capacity").notNull(),
});

// class_occurrences
export const classOccurrences = table("class_occurrences", {
  id: text("id").primaryKey(),
  definitionId: text("definition_id").notNull().references(() => classDefinitions.id),
  startsAt: text("starts_at").notNull(),
  capacity: integer("capacity").notNull(),
  status: text("status", { enum: ["scheduled", "cancelled", "completed"] }).notNull(),
});

// bookings
export const bookings = table("bookings", {
  id: text("id").primaryKey(),
  occurrenceId: text("occurrence_id").notNull().references(() => classOccurrences.id),
  memberId: text("member_id").notNull().references(() => gymMembers.id),
  status: text("status", { enum: ["booked", "attended", "no_show", "cancelled"] }).notNull(),
  bookedAt: text("booked_at").notNull().default(now()),
});
```

Note: gym tables do NOT use `ownableColumns()` — they are single-tenant domain tables. Per research §6 "no unscoped queries" guard, these tables are exempt because they have no owner column. No `accessFilter` / `resolveAccess` calls required.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create list-fill-rate.ts action</name>
  <files>apps/staff-web/actions/list-fill-rate.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — confirm exact exported names for `classOccurrences`, `bookings`, `classDefinitions` tables and their column names (camelCase Drizzle exports vs snake_case SQL)
    - apps/staff-web/actions/list-emails.ts — reference defineAction pattern (imports, schema, http, run shape)
    - apps/staff-web/server/db/index.ts — confirm the `getDb` export path used by other actions
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 6. New Gym Actions (D-09)" — exact action signature and SQL approach
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Code Examples > Analytics Drizzle query (fill rate)" — example aggregation pattern
  </read_first>
  <action>
Create new file `apps/staff-web/actions/list-fill-rate.ts` with this exact structure (adjust import paths if the project uses a different convention — read `list-emails.ts` first):

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";

export default defineAction({
  description:
    "List class occurrences from the trailing N days with their fill rate (bookings / capacity). " +
    "Use this when asked which classes are not filling up, which classes had low attendance, " +
    "or for fill-rate analytics. Returns one row per occurrence with name, date, capacity, booked count, and fillPct.",
  schema: z.object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .default(7)
      .describe("Trailing days to look back from now (default 7, max 90)"),
  }),
  http: { method: "GET" },
  run: async ({ days }) => {
    const db = getDb();
    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
    const nowIso = new Date().toISOString();

    const rows = await db
      .select({
        occurrenceId: schema.classOccurrences.id,
        className: schema.classDefinitions.name,
        startsAt: schema.classOccurrences.startsAt,
        capacity: schema.classOccurrences.capacity,
        booked: sql<number>`COUNT(CASE WHEN ${schema.bookings.status} = 'booked' OR ${schema.bookings.status} = 'attended' THEN 1 ELSE NULL END)`,
      })
      .from(schema.classOccurrences)
      .innerJoin(
        schema.classDefinitions,
        eq(schema.classDefinitions.id, schema.classOccurrences.definitionId),
      )
      .leftJoin(
        schema.bookings,
        eq(schema.bookings.occurrenceId, schema.classOccurrences.id),
      )
      .where(
        and(
          gte(schema.classOccurrences.startsAt, sinceIso),
          lt(schema.classOccurrences.startsAt, nowIso),
          ne(schema.classOccurrences.status, "cancelled"),
        ),
      )
      .groupBy(
        schema.classOccurrences.id,
        schema.classDefinitions.name,
        schema.classOccurrences.startsAt,
        schema.classOccurrences.capacity,
      )
      .orderBy(schema.classOccurrences.startsAt);

    return rows.map((r) => ({
      occurrenceId: r.occurrenceId,
      className: r.className,
      startsAt: r.startsAt,
      capacity: Number(r.capacity),
      booked: Number(r.booked ?? 0),
      fillPct: r.capacity > 0 ? Math.round((Number(r.booked ?? 0) / Number(r.capacity)) * 100) : 0,
    }));
  },
});
```

Critical notes:
- Verify the exact Drizzle export names from `schema.ts` (e.g. `classOccurrences` vs `class_occurrences` — Drizzle exports are camelCase even when SQL is snake_case)
- Verify the import path `../server/db/index.js` matches what other actions use (might be `../server/db/schema` or `../server/db`)
- Use `innerJoin` for class_definitions (every occurrence has a definition) and `leftJoin` for bookings (zero-booking occurrences should still appear with `booked: 0`)
- The COUNT counts `booked` OR `attended` statuses — `cancelled` and `no_show` bookings are excluded from fill rate
- The Number() casts on aggregation results are defensive (Drizzle returns sql<number> values that can come back as strings depending on driver)

Run `pnpm --filter staff-web typecheck` after creation.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/list-fill-rate.ts` exists
    - Contains literal `defineAction` import
    - Contains literal `from "drizzle-orm"` import with at least `sql`, `eq`, and either `and` or `gte` named imports
    - Contains a literal `description:` string field describing fill rate / class attendance
    - Contains `schema: z.object({` with a `days` field
    - Contains `http: { method: "GET" }` (must be GET for safe idempotent reads)
    - Contains `schema.classOccurrences` reference
    - Contains `schema.bookings` reference
    - Contains `schema.classDefinitions` reference
    - Contains literal `fillPct` in the return shape
    - Does NOT contain `accessFilter` or `resolveAccess` (gym tables are single-tenant — research §6 confirms exempt)
    - `pnpm --filter staff-web typecheck` exits with code 0
    - File line count ≥ 40 lines
  </acceptance_criteria>
  <done>
After dev server restart, `curl http://localhost:8081/_agent-native/actions/list-fill-rate?days=7` returns a JSON array. With seeded data (May 18–22 occurrences and at least one booking from prior D1 work), the array has at least one row with `{ occurrenceId, className, startsAt, capacity, booked, fillPct }`. The fillPct values are integers 0–100. Days outside the range are not included.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create list-classes.ts action</name>
  <files>apps/staff-web/actions/list-classes.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — verify `classDefinitions` and `classOccurrences` exports
    - apps/staff-web/actions/list-fill-rate.ts — the action file just created; match its import style and defineAction shape
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 6. New Gym Actions (D-09)" — supporting actions
  </read_first>
  <action>
Create new file `apps/staff-web/actions/list-classes.ts`. This is a simpler supporting action — list class definitions and their upcoming/recent occurrences. Used by the agent for context when answering questions about the schedule.

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, gte, lt, sql } from "drizzle-orm";

export default defineAction({
  description:
    "List the gym's class definitions (e.g. 'Yoga', 'HIIT') along with a count of occurrences in a recent window. " +
    "Use this when asked what classes the gym offers, what's on the schedule, or for class catalog context. " +
    "Returns one row per class definition with name, default duration, default capacity, and the count of occurrences in the last N days.",
  schema: z.object({
    windowDays: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .default(14)
      .describe("Window size (days both backward and forward) for the occurrence count"),
  }),
  http: { method: "GET" },
  run: async ({ windowDays }) => {
    const db = getDb();
    const sinceIso = new Date(Date.now() - windowDays * 86400000).toISOString();
    const untilIso = new Date(Date.now() + windowDays * 86400000).toISOString();

    const rows = await db
      .select({
        id: schema.classDefinitions.id,
        name: schema.classDefinitions.name,
        durationMin: schema.classDefinitions.durationMin,
        defaultCapacity: schema.classDefinitions.defaultCapacity,
        occurrencesInWindow: sql<number>`COUNT(${schema.classOccurrences.id})`,
      })
      .from(schema.classDefinitions)
      .leftJoin(
        schema.classOccurrences,
        and(
          eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
          gte(schema.classOccurrences.startsAt, sinceIso),
          lt(schema.classOccurrences.startsAt, untilIso),
        ),
      )
      .groupBy(
        schema.classDefinitions.id,
        schema.classDefinitions.name,
        schema.classDefinitions.durationMin,
        schema.classDefinitions.defaultCapacity,
      )
      .orderBy(schema.classDefinitions.name);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      durationMin: Number(r.durationMin),
      defaultCapacity: Number(r.defaultCapacity),
      occurrencesInWindow: Number(r.occurrencesInWindow ?? 0),
    }));
  },
});
```

Run `pnpm --filter staff-web typecheck` after creation.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/list-classes.ts` exists
    - Contains literal `defineAction` import
    - Contains `schema.classDefinitions` reference
    - Contains `schema.classOccurrences` reference
    - Contains `http: { method: "GET" }`
    - The `description` field references "class" and "schedule" or "catalog"
    - Does NOT contain `accessFilter` or `resolveAccess`
    - `pnpm --filter staff-web typecheck` exits with code 0
    - File line count ≥ 30 lines
  </acceptance_criteria>
  <done>
`curl http://localhost:8081/_agent-native/actions/list-classes` returns a JSON array of class definitions with id, name, durationMin, defaultCapacity, occurrencesInWindow. With the 3 seeded class definitions, the array length is 3.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create list-members.ts action</name>
  <files>apps/staff-web/actions/list-members.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — verify `gymMembers` export and its columns (id, name, phoneE164, email, createdAt)
    - apps/staff-web/actions/list-fill-rate.ts — match the import / defineAction style
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 6. New Gym Actions (D-09)" — supporting actions
  </read_first>
  <action>
Create new file `apps/staff-web/actions/list-members.ts`. List the gym's seeded members, with optional name-prefix search.

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { ilike, or, sql } from "drizzle-orm";

export default defineAction({
  description:
    "List gym members, optionally filtered by name or phone prefix. " +
    "Use this when asked who the gym's members are, or as supporting context when discussing a specific person. " +
    "Returns id, name, phoneE164, email (if present), and createdAt for each member. Limited to 100 results.",
  schema: z.object({
    query: z
      .string()
      .optional()
      .describe("Optional name or phone prefix to filter members"),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
  http: { method: "GET" },
  run: async ({ query, limit }) => {
    const db = getDb();

    const baseQuery = db
      .select({
        id: schema.gymMembers.id,
        name: schema.gymMembers.name,
        phoneE164: schema.gymMembers.phoneE164,
        email: schema.gymMembers.email,
        createdAt: schema.gymMembers.createdAt,
      })
      .from(schema.gymMembers);

    const rows = query && query.trim().length > 0
      ? await baseQuery
          .where(
            or(
              ilike(schema.gymMembers.name, `%${query.trim()}%`),
              ilike(schema.gymMembers.phoneE164, `%${query.trim()}%`),
            ),
          )
          .orderBy(schema.gymMembers.name)
          .limit(limit)
      : await baseQuery.orderBy(schema.gymMembers.name).limit(limit);

    return rows;
  },
});
```

Notes:
- `ilike` is the Postgres case-insensitive LIKE — confirm it's available in the project's Drizzle import (`drizzle-orm`)
- `gym_members` does NOT use `ownableColumns()` per research §6; no `accessFilter` required
- The limit is bounded at 100 to prevent the agent from dumping huge result sets into its context

Run `pnpm --filter staff-web typecheck` after creation.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/list-members.ts` exists
    - Contains literal `defineAction` import
    - Contains `schema.gymMembers` reference
    - Contains `http: { method: "GET" }`
    - The `description` field references "member" and "gym"
    - Contains a `limit` parameter capped at 100
    - Does NOT contain `accessFilter` or `resolveAccess`
    - `pnpm --filter staff-web typecheck` exits with code 0
    - File line count ≥ 30 lines
  </acceptance_criteria>
  <done>
`curl http://localhost:8081/_agent-native/actions/list-members` returns a JSON array of members. With the 5 seeded members (per STATE.md D0.4), the array length is 5 when no query is given. Adding `?query=Alice` (or any seeded name prefix) returns the matching subset.
  </done>
</task>

</tasks>

<verification>
- All three action files exist and use defineAction from @agent-native/core
- All three are HTTP GET endpoints (safe for agent + UI consumption)
- All three skip accessFilter (gym tables are single-tenant per research §6)
- TypeScript compiles
- After dev restart, each action is reachable at /_agent-native/actions/<name>
</verification>

<success_criteria>
1. The fill-rate, classes, and members actions exist and are auto-registered (defineAction + dev server picks them up via .generated/actions-registry)
2. Each action returns sensible data against the existing seeded gym tables
3. The agent (P1b.1-07) will have these tools available in its registry
4. The analytics route (P1b.1-06) can call `list-fill-rate` directly from its loader (or via fetch)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-03-gym-actions-part-a-SUMMARY.md` documenting:
- Verified import path for `getDb` / `schema` / `defineAction`
- Verified Drizzle export names for the gym tables touched
- Any deviations from the SQL patterns shown
- Sample output from each action against the local Neon seed
</output>
