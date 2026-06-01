---
phase: P1b.1-customer-pilot-enablement
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/list-renewals.ts
  - apps/staff-web/actions/list-at-risk-members.ts
  - apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts
  - apps/staff-web/package.json
autonomous: true
requirements: [AGENT-05, WA-05]
must_haves:
  truths:
    - "The action `list-renewals` answers 'Provide renewal numbers' — returns activeSubscriptions count, expiringPasses7d count, expiringPasses30d count"
    - "The action `list-at-risk-members` answers 'Which customers should I reach out to?' — returns members with declining attendance or lapsed passes"
    - "After the seed script runs, the whatsapp_templates table has exactly 5 rows: hello_world (status='approved'), class_reminder/waitlist_offer/payment_failed/pass_expiring (status='pending')"
    - "The seed script is idempotent — running it twice does not create duplicate rows"
    - "Seeded rows have valid JSON in components_json that the Templates dialog (plan 05) can parse for variable extraction"
  artifacts:
    - path: "apps/staff-web/actions/list-renewals.ts"
      provides: "Subscription + expiring-pass renewal aggregation"
      contains: "defineAction"
    - path: "apps/staff-web/actions/list-at-risk-members.ts"
      provides: "At-risk member identification (declining attendance / lapsed pass)"
      contains: "defineAction"
    - path: "apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts"
      provides: "Idempotent seed of 5 whatsapp_templates rows including approved hello_world"
      contains: "hello_world"
  key_links:
    - from: "apps/staff-web/actions/list-renewals.ts"
      to: "Neon stripe_subscriptions + passes tables"
      via: "Drizzle ORM"
      pattern: "stripeSubscriptions|passes"
    - from: "apps/staff-web/actions/list-at-risk-members.ts"
      to: "Neon gym_members + bookings + passes tables"
      via: "Drizzle ORM"
      pattern: "gymMembers|bookings"
    - from: "apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts"
      to: "Neon whatsapp_templates table"
      via: "Drizzle insert with ON CONFLICT DO NOTHING"
      pattern: "whatsappTemplates|ON CONFLICT"
---

<objective>
Complete the gym-aware action surface (`list-renewals`, `list-at-risk-members`) and seed the WhatsApp templates table so the Templates dialog (plan 05) has data to render and at least one sendable approved template (`hello_world`) on pilot day one.

Purpose: The remaining two chip prompts ("Provide renewal numbers", "Which customers should I reach out to?") require these two actions. Independently, the Templates dialog needs `whatsapp_templates` rows to render — without `hello_world` approved, the customer cannot demonstrate a real template send on pilot day. Both work streams are independent and combine into one plan.

Output:
- `apps/staff-web/actions/list-renewals.ts`
- `apps/staff-web/actions/list-at-risk-members.ts`
- `apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts` (idempotent, run with `pnpm --filter staff-web db:seed-templates`)
- Updated `apps/staff-web/package.json` with the `db:seed-templates` script
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
@apps/staff-web/package.json

<interfaces>
<!-- Drizzle schema for new actions + seed -->

From apps/staff-web/server/db/schema.ts (verify exact names at task time):
```typescript
// stripe_subscriptions (added in P1b-02)
export const stripeSubscriptions = table("stripe_subscriptions", {
  id: text("id").primaryKey(),                              // Stripe sub_xxx
  memberId: text("member_id").references(() => gymMembers.id),
  status: text("status").notNull(),                         // active | past_due | canceled | unpaid | ...
  currentPeriodEnd: text("current_period_end"),             // ISO timestamp
  // ... other fields
});

// passes
export const passes = table("passes", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => gymMembers.id),
  grantedCredits: integer("granted_credits").notNull(),
  expiresAt: text("expires_at"),                            // nullable = never expires
  status: text("status", { enum: ["active", "expired", "void"] }).notNull(),
});

// pass_debits (ledger)
export const passDebits = table("pass_debits", {
  id: text("id").primaryKey(),
  passId: text("pass_id").notNull().references(() => passes.id),
  amount: integer("amount").notNull(),                      // positive = debit, negative = reversal
  createdAt: text("created_at").notNull().default(now()),
});

// whatsapp_templates (added in P1b-02)
export const whatsappTemplates = table("whatsapp_templates", {
  name: text("name").primaryKey(),
  status: text("status", { enum: ["pending", "approved", "rejected", "paused", "disabled"] }).notNull(),
  category: text("category"),                               // MARKETING | UTILITY | AUTHENTICATION
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json").notNull(),
  lastSyncedAt: text("last_synced_at").notNull().default(now()),
});
```

Seed templates (from research §3 "whatsapp_templates Table"):
- `hello_world` (approved) — `{"components":[{"type":"BODY","text":"Hello World"}]}` — 0 variables
- `class_reminder` (pending) — `{"components":[{"type":"BODY","text":"Hi {{1}}, your {{2}} class is tomorrow at {{3}}. See you there!"}]}` — 3 vars
- `waitlist_offer` (pending) — 3 vars (see research)
- `payment_failed` (pending) — 2 vars (see research)
- `pass_expiring` (pending) — 3 vars (see research)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create list-renewals.ts action</name>
  <files>apps/staff-web/actions/list-renewals.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — verify `stripeSubscriptions` and `passes` exports + column names
    - apps/staff-web/actions/list-fill-rate.ts (from plan 03 — created before this plan runs in parallel; if not yet created, the executor falls back to reading any existing action like list-emails.ts for defineAction pattern)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 6. New Gym Actions (D-09)" — list-renewals row defining return shape `{activeSubscriptions, expiringPasses7d, expiringPasses30d}`
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md D-09 — `list-renewals` data source includes BOTH stripe_subscriptions AND member_passes per discretion note
  </read_first>
  <action>
Create `apps/staff-web/actions/list-renewals.ts`. Returns a single object summarizing renewal numbers — both active recurring subscriptions and expiring one-off passes.

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, count, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

export default defineAction({
  description:
    "Summarise renewal numbers — count of active Stripe subscriptions and count of passes expiring in the next 7 and 30 days. " +
    "Use this when asked for renewal numbers, retention figures, or upcoming-renewals context. " +
    "Returns { activeSubscriptions, expiringPasses7d, expiringPasses30d, subscriptionsRenewingNext30d }.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000).toISOString();
    const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString();
    const nowIso = now.toISOString();

    const [activeSubsRow] = await db
      .select({ c: count() })
      .from(schema.stripeSubscriptions)
      .where(eq(schema.stripeSubscriptions.status, "active"));

    const [renewingSoonRow] = await db
      .select({ c: count() })
      .from(schema.stripeSubscriptions)
      .where(
        and(
          eq(schema.stripeSubscriptions.status, "active"),
          isNotNull(schema.stripeSubscriptions.currentPeriodEnd),
          gte(schema.stripeSubscriptions.currentPeriodEnd, nowIso),
          lte(schema.stripeSubscriptions.currentPeriodEnd, in30Days),
        ),
      );

    const [expiring7Row] = await db
      .select({ c: count() })
      .from(schema.passes)
      .where(
        and(
          eq(schema.passes.status, "active"),
          isNotNull(schema.passes.expiresAt),
          gte(schema.passes.expiresAt, nowIso),
          lte(schema.passes.expiresAt, in7Days),
        ),
      );

    const [expiring30Row] = await db
      .select({ c: count() })
      .from(schema.passes)
      .where(
        and(
          eq(schema.passes.status, "active"),
          isNotNull(schema.passes.expiresAt),
          gte(schema.passes.expiresAt, nowIso),
          lte(schema.passes.expiresAt, in30Days),
        ),
      );

    return {
      activeSubscriptions: Number(activeSubsRow?.c ?? 0),
      subscriptionsRenewingNext30d: Number(renewingSoonRow?.c ?? 0),
      expiringPasses7d: Number(expiring7Row?.c ?? 0),
      expiringPasses30d: Number(expiring30Row?.c ?? 0),
      asOf: nowIso,
    };
  },
});
```

Notes:
- `count()` from drizzle-orm returns a SQL COUNT(*) helper — verify it's the correct import at task time; fallback is `sql<number>\`COUNT(*)\``
- The `passes.expiresAt` column may be nullable (passes that never expire) — the `isNotNull` filter excludes those from "expiring" counts
- `stripe_subscriptions.currentPeriodEnd` may also be nullable for grandfathered rows
- Schema field is `current_period_end` SQL → Drizzle export `currentPeriodEnd` (verify)
- Returns a single object, not an array — matches the "summary" semantics

Run `pnpm --filter staff-web typecheck` after creation.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/list-renewals.ts` exists
    - Contains literal `defineAction` import
    - Contains literal `schema.stripeSubscriptions` reference
    - Contains literal `schema.passes` reference
    - Contains literal `activeSubscriptions` in the return shape
    - Contains literal `expiringPasses7d` in the return shape
    - Contains literal `expiringPasses30d` in the return shape
    - Contains `http: { method: "GET" }`
    - Does NOT contain `accessFilter` or `resolveAccess`
    - `pnpm --filter staff-web typecheck` exits with code 0
    - File line count ≥ 40 lines
  </acceptance_criteria>
  <done>
`curl http://localhost:8081/_agent-native/actions/list-renewals` returns a JSON object with the four numeric counts plus asOf timestamp. Values reflect the current seeded DB state (some may be 0 depending on seeded subscriptions/passes expiry windows).
  </done>
</task>

<task type="auto">
  <name>Task 2: Create list-at-risk-members.ts action</name>
  <files>apps/staff-web/actions/list-at-risk-members.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — verify `gymMembers`, `bookings`, `passes` exports + column names
    - apps/staff-web/actions/list-fill-rate.ts (if it exists from plan 03) — match the defineAction style
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 6. New Gym Actions (D-09)" — list-at-risk-members return shape `[{name, lastAttended, passExpiry, bookingCount30d}]`
  </read_first>
  <action>
Create `apps/staff-web/actions/list-at-risk-members.ts`. Identifies members at risk of churn — declining attendance or expired/expiring passes.

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, gte, max, sql } from "drizzle-orm";

export default defineAction({
  description:
    "Identify gym members at risk of churn — members whose last attended class is more than 14 days ago, " +
    "or whose passes are expiring soon, or who have zero bookings in the last 30 days. " +
    "Use this when asked which customers to reach out to, retention outreach, or churn risk. " +
    "Returns an array sorted by most-at-risk first, each row containing memberId, name, phoneE164, lastAttendedAt (nullable), " +
    "bookingCount30d, and earliestPassExpiry (nullable).",
  schema: z.object({
    inactiveDays: z.coerce
      .number()
      .int()
      .min(7)
      .max(180)
      .optional()
      .default(14)
      .describe("Days since last attended class to consider a member at risk (default 14)"),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
  }),
  http: { method: "GET" },
  run: async ({ inactiveDays, limit }) => {
    const db = getDb();
    const now = new Date();
    const inactiveCutoff = new Date(now.getTime() - inactiveDays * 86400000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const nowIso = now.toISOString();

    // Single-query approach using subselects for last attended + 30d booking count + earliest pass expiry.
    const rows = await db
      .select({
        memberId: schema.gymMembers.id,
        name: schema.gymMembers.name,
        phoneE164: schema.gymMembers.phoneE164,
        lastAttendedAt: sql<string | null>`(
          SELECT MAX(co.starts_at) FROM bookings b
          JOIN class_occurrences co ON co.id = b.occurrence_id
          WHERE b.member_id = ${schema.gymMembers.id} AND b.status = 'attended'
        )`,
        bookingCount30d: sql<number>`(
          SELECT COUNT(*) FROM bookings b
          WHERE b.member_id = ${schema.gymMembers.id}
            AND b.booked_at >= ${thirtyDaysAgo}
        )`,
        earliestPassExpiry: sql<string | null>`(
          SELECT MIN(p.expires_at) FROM passes p
          WHERE p.member_id = ${schema.gymMembers.id}
            AND p.status = 'active'
            AND p.expires_at IS NOT NULL
        )`,
      })
      .from(schema.gymMembers)
      .limit(limit * 4); // pull more than limit so we can filter down to at-risk in code

    // Apply at-risk filter in code (simpler than nested SQL):
    const atRisk = rows
      .map((r) => ({
        memberId: r.memberId,
        name: r.name,
        phoneE164: r.phoneE164,
        lastAttendedAt: r.lastAttendedAt ?? null,
        bookingCount30d: Number(r.bookingCount30d ?? 0),
        earliestPassExpiry: r.earliestPassExpiry ?? null,
      }))
      .filter((m) => {
        const noRecentAttendance = !m.lastAttendedAt || m.lastAttendedAt < inactiveCutoff;
        const noBookings30d = m.bookingCount30d === 0;
        const passExpiringSoon =
          m.earliestPassExpiry !== null &&
          m.earliestPassExpiry >= nowIso &&
          new Date(m.earliestPassExpiry).getTime() <= now.getTime() + 14 * 86400000;
        return noRecentAttendance || noBookings30d || passExpiringSoon;
      })
      .sort((a, b) => {
        // Most at-risk first: never attended > oldest attendance
        if (!a.lastAttendedAt && !b.lastAttendedAt) return 0;
        if (!a.lastAttendedAt) return -1;
        if (!b.lastAttendedAt) return 1;
        return a.lastAttendedAt.localeCompare(b.lastAttendedAt);
      })
      .slice(0, limit);

    return atRisk;
  },
});
```

Notes:
- The subselect approach keeps the query single-trip without complex joins; the filter is applied in code for readability
- The SQL string interpolation in `sql\`...\`` uses Drizzle's safe parameter binding via `${...}` — these are NOT raw string concatenations
- The 14-day pass-expiry-soon threshold is a heuristic; the planner-discretion choice is documented
- Limit×4 fetched upfront then sliced — safe because gym member counts are small (5–50 for the pilot studio)

Run `pnpm --filter staff-web typecheck` after creation.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/list-at-risk-members.ts` exists
    - Contains literal `defineAction` import
    - Contains `schema.gymMembers` reference
    - Contains a `bookings` reference (raw SQL or schema)
    - Contains a `passes` reference (raw SQL or schema)
    - Contains literal `lastAttendedAt` in the return shape
    - Contains literal `bookingCount30d` in the return shape
    - Contains literal `earliestPassExpiry` in the return shape
    - Contains `http: { method: "GET" }`
    - Does NOT contain `accessFilter` or `resolveAccess`
    - `pnpm --filter staff-web typecheck` exits with code 0
    - File line count ≥ 50 lines
  </acceptance_criteria>
  <done>
`curl http://localhost:8081/_agent-native/actions/list-at-risk-members` returns a JSON array. The array length is bounded by `limit` (default 25). Each row has memberId, name, phoneE164, lastAttendedAt (nullable), bookingCount30d, earliestPassExpiry (nullable). With the 5 seeded members and demo-era bookings, multiple members will satisfy the at-risk heuristic (their bookings are >14 days old by 2026-05-25).
  </done>
</task>

<task type="auto">
  <name>Task 3: Seed whatsapp_templates with hello_world (approved) + 4 named templates (pending)</name>
  <files>apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts, apps/staff-web/package.json</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — verify `whatsappTemplates` export and column names
    - apps/staff-web/package.json — current `scripts` block; identify how existing db scripts are wired (look for db:seed, db:studio, etc.)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 3. whatsapp_templates Table" — exact components_json strings for all 5 seeded rows
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md D-03 — seed rationale and approval status per template
    - apps/staff-web/server/db/index.ts — confirm how to obtain a db instance for a standalone Node script (may need a different entry than getDb)
  </read_first>
  <action>
1. **Create the seed script** `apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts`:

```typescript
/**
 * Idempotent seed for whatsapp_templates.
 *
 * Pre-populates 5 rows for the P1b.1 pilot Templates dialog:
 * - hello_world (approved) — Meta's pre-approved default; gives the pilot a real sendable on day one.
 * - class_reminder, waitlist_offer, payment_failed, pass_expiring (pending) — visible in the picker
 *   but disabled until Meta approval lands (per P0/FND-06). The WA-08 daily sync cron (P1b-09)
 *   replaces these rows once approvals come through.
 *
 * Run with: pnpm --filter staff-web db:seed-templates
 * Safe to re-run — uses ON CONFLICT DO NOTHING on the primary key (name).
 */
import { sql } from "drizzle-orm";
import { getDb, schema } from "../index.js";

type SeedRow = {
  name: string;
  status: "approved" | "pending";
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  componentsJson: string;
};

const SEED_ROWS: SeedRow[] = [
  {
    name: "hello_world",
    status: "approved",
    category: "UTILITY",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [{ type: "BODY", text: "Hello World" }],
    }),
  },
  {
    name: "class_reminder",
    status: "pending",
    category: "UTILITY",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text: "Hi {{1}}, your {{2}} class is tomorrow at {{3}}. See you there!",
        },
      ],
    }),
  },
  {
    name: "waitlist_offer",
    status: "pending",
    category: "UTILITY",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text:
            "Good news {{1}}! A spot opened in {{2}} on {{3}}. Reply YES to confirm your booking.",
        },
      ],
    }),
  },
  {
    name: "payment_failed",
    status: "pending",
    category: "UTILITY",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, your payment for {{2}} failed. Please update your payment method to keep your membership active.",
        },
      ],
    }),
  },
  {
    name: "pass_expiring",
    status: "pending",
    category: "UTILITY",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, your {{2}} pass expires on {{3}}. Renew now to keep attending classes.",
        },
      ],
    }),
  },
];

async function main() {
  const db = getDb();
  console.log(`Seeding ${SEED_ROWS.length} whatsapp_templates rows...`);

  for (const row of SEED_ROWS) {
    await db
      .insert(schema.whatsappTemplates)
      .values({
        name: row.name,
        status: row.status,
        category: row.category,
        language: row.language,
        componentsJson: row.componentsJson,
        lastSyncedAt: new Date().toISOString(),
      })
      .onConflictDoNothing({ target: schema.whatsappTemplates.name });
    console.log(`  + ${row.name} (${row.status})`);
  }

  // Verify count.
  const all = await db.select({ name: schema.whatsappTemplates.name }).from(schema.whatsappTemplates);
  console.log(`Done. whatsapp_templates now has ${all.length} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

Critical notes:
- `onConflictDoNothing` is Drizzle's PostgreSQL ON CONFLICT helper — verify the exact API surface at task time. If `onConflictDoNothing` is not available, fall back to raw `db.execute(sql\`INSERT ... ON CONFLICT (name) DO NOTHING\`)` per the pattern used in `apps/worker/src/domain/sendMessage.ts`.
- The seed uses `getDb()` from the existing db index — verify this works in a standalone tsx script (may need to set DATABASE_URL via dotenv). If `getDb()` requires the framework runtime, instantiate a direct `drizzle(neon(process.env.DATABASE_URL!))` client in this script instead.
- `process.exit(0)` is essential — without it, the Neon connection holds the script open.

2. **Add the script to `apps/staff-web/package.json`** under `scripts`:

```json
"db:seed-templates": "tsx server/db/seeds/seed-whatsapp-templates.ts"
```

Verify `tsx` is already a dev dependency (used by other dev scripts). If not, run `pnpm --filter staff-web add -D tsx` and document it in the SUMMARY.

3. **Run the seed** once locally to verify it works:
```bash
cd apps/staff-web && pnpm db:seed-templates
```

Expected output: 5 lines like `+ hello_world (approved)`, then `Done. whatsapp_templates now has 5 rows.`. Re-run to verify idempotency — output should still say "5 rows" (no duplicates created).
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm db:seed-templates</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts` exists
    - Contains literal string `"hello_world"` exactly once in SEED_ROWS
    - Contains literal string `"class_reminder"` exactly once
    - Contains literal string `"waitlist_offer"` exactly once
    - Contains literal string `"payment_failed"` exactly once
    - Contains literal string `"pass_expiring"` exactly once
    - Contains `status: "approved"` for hello_world (case-sensitive match on the status literal)
    - Contains `status: "pending"` for at least one of the named templates
    - Contains `onConflictDoNothing` OR `ON CONFLICT` (idempotency guarantee)
    - Contains the literal "Hello World" body for hello_world
    - Contains `{{1}}` placeholder for class_reminder body
    - `apps/staff-web/package.json` scripts block contains a `db:seed-templates` key pointing at the new file
    - Running `pnpm --filter staff-web db:seed-templates` exits with code 0 and prints "Done. whatsapp_templates now has 5 rows."
    - Running it a SECOND time still prints "5 rows" (idempotency)
    - SQL check (run via psql or Neon MCP): `SELECT name, status FROM whatsapp_templates ORDER BY name;` returns exactly 5 rows with hello_world=approved and the other 4=pending
  </acceptance_criteria>
  <done>
The whatsapp_templates table has exactly 5 rows after seeding. `hello_world` has status='approved' and parseable JSON with 0 variables. The four named templates have status='pending' and parseable JSON with placeholders for variable substitution. The seed script can be re-run safely (idempotent). The Templates dialog (plan 05) can now read these rows from the loader.
  </done>
</task>

</tasks>

<verification>
- list-renewals returns the four expected numeric counts
- list-at-risk-members returns a sorted array of at-risk members
- whatsapp_templates has exactly 5 seeded rows after the script runs
- Idempotency: re-running seed does not create duplicates
- TypeScript compiles
</verification>

<success_criteria>
1. Two more gym actions ship (`list-renewals`, `list-at-risk-members`) — agent surface now covers all three chip prompts
2. Templates dialog has data to render — `hello_world` approved + 4 pending
3. Seed script is committable and re-runnable (no destructive operations)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-04-gym-actions-and-template-seed-SUMMARY.md` documenting:
- Verified Drizzle API used for ON CONFLICT (onConflictDoNothing or raw SQL)
- Whether getDb() worked in the standalone script or a custom drizzle client was needed
- Sample output from list-renewals and list-at-risk-members against the local seed
- Confirmation that whatsapp_templates row count is 5 after seed
</output>
