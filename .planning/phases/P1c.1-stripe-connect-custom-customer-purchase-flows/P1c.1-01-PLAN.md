---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/migrations/0006_p1c1_connected_accounts.sql
  - apps/staff-web/server/db/schema.ts
  - packages/queue/src/types.ts
  - packages/queue/src/publish.ts
  - packages/queue/src/publish.test.ts
autonomous: true
requirements: [STR-01]
must_haves:
  truths:
    - "A connected_accounts table exists in gymos-demo Neon holding acct_id + readiness flags"
    - "StripeEventPayload carries an optional stripeAccount field that platform events leave undefined and Connect events populate"
    - "Drizzle schema exports connectedAccounts so reducers + actions can read/write it"
  artifacts:
    - path: "apps/staff-web/server/db/migrations/0006_p1c1_connected_accounts.sql"
      provides: "Additive connected_accounts table DDL applied direct-to-Neon"
      contains: "create table if not exists connected_accounts"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "connectedAccounts Drizzle table export"
      contains: "connected_accounts"
    - path: "packages/queue/src/types.ts"
      provides: "StripeEventPayload.stripeAccount optional field"
      contains: "stripeAccount"
  key_links:
    - from: "packages/queue/src/publish.ts"
      to: "StripeEventPayload"
      via: "enqueueStripeEvent passes stripeAccount through"
      pattern: "stripeAccount"
---

<objective>
Lay the additive data + queue-contract foundation for Stripe Connect. Create the `connected_accounts` table (acct_id + readiness flags) in gymos-demo Neon via direct MCP apply, export it through the Drizzle schema barrel, and extend the `StripeEventPayload` queue contract with an optional `stripeAccount` field so the Connect webhook (Plan 02) can thread the connected-account id all the way to the reducers (Plan 03).

Purpose: Every later plan reads `connectedAccounts` or threads `stripeAccount`. This plan establishes both with zero behavioural change to existing platform-event processing (the field is optional; platform events leave it undefined).
Output: `connected_accounts` table live in Neon + Drizzle export; `StripeEventPayload` with `stripeAccount?`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-RESEARCH.md

<interfaces>
<!-- Existing queue contract the new field extends (packages/queue/src/types.ts) -->
```typescript
export const StripeEventPayload = z.object({
  eventId: z.string().min(1).regex(/^evt_/, "Stripe event IDs start with evt_"),
});
export type StripeEventPayload = z.infer<typeof StripeEventPayload>;
```
<!-- enqueueStripeEvent (packages/queue/src/publish.ts) singletons by eventId. -->

<!-- Existing mirror tables (apps/staff-web/server/db/schema.ts) — DO NOT modify, shown for the `table`/`now()` helper convention: -->
```typescript
export const secrets = table("secrets", {
  name: text("name").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: text("updated_at").notNull().default(now()),
  lastUsedAt: text("last_used_at"),
});
```
</interfaces>

**CRITICAL — migration apply pattern (STATE.md):** `db.ts` does NOT auto-run gymos migrations. Apply 0006 DIRECT to gymos-demo Neon via the Neon MCP (`mcp__Neon__run_sql_transaction`), following the 0001–0005 precedent. Do NOT call `runMigrations` or `drizzle-kit push`. Strictly additive — no rename/drop (CLAUDE.md "no breaking DB changes").

**Single-tenant rule:** no `studio_id`. `studio_label` is a descriptive text column only; one row expected.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create + apply the connected_accounts migration; export the Drizzle table</name>
  <files>apps/staff-web/server/db/migrations/0006_p1c1_connected_accounts.sql, apps/staff-web/server/db/schema.ts</files>
  <action>
Write `0006_p1c1_connected_accounts.sql` with strictly-additive DDL (per RESEARCH §Schema):

```sql
CREATE TABLE IF NOT EXISTS connected_accounts (
  id               text PRIMARY KEY,           -- "acct_xxx"
  studio_label     text,                       -- descriptive only; single-tenant, no studio_id FK
  charges_enabled  boolean NOT NULL DEFAULT false,
  payouts_enabled  boolean NOT NULL DEFAULT false,
  requirements_due text,                        -- JSON array string of requirements.currently_due
  disabled_reason  text,
  raw_json         text NOT NULL DEFAULT '{}',
  created_at       text NOT NULL DEFAULT (now()::text),
  updated_at       text NOT NULL DEFAULT (now()::text)
);
```

Apply it to gymos-demo Neon via `mcp__Neon__run_sql_transaction` (project id `billowing-sun-51091059`). Then add the Drizzle export to `schema.ts` next to the other Stripe mirrors (after `secrets`), using the existing `table` + `text`/`boolean` + `now()` helpers:

```typescript
// P1c.1 (2026-06-12) — Stripe Connect: the connected (Custom-equivalent) account.
export const connectedAccounts = table("connected_accounts", {
  id: text("id").primaryKey(),            // "acct_xxx"
  studioLabel: text("studio_label"),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  requirementsDue: text("requirements_due"),
  disabledReason: text("disabled_reason"),
  rawJson: text("raw_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
```

Confirm `boolean` is already imported from drizzle-orm/pg-core at the top of schema.ts; add it to the import if missing.
  </action>
  <verify>
    <automated>Replay against Neon via MCP: `SELECT to_regclass('public.connected_accounts');` returns a non-null relation, and `INSERT INTO connected_accounts (id) VALUES ('acct_test_p1c1') ON CONFLICT DO NOTHING; SELECT charges_enabled, payouts_enabled FROM connected_accounts WHERE id='acct_test_p1c1';` returns `false,false`; then `DELETE FROM connected_accounts WHERE id='acct_test_p1c1';` to clean up.</automated>
  </verify>
  <done>connected_accounts table exists in Neon with the 9 columns + defaults; schema.ts exports connectedAccounts; cleanup row removed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add optional stripeAccount to StripeEventPayload + thread through enqueueStripeEvent</name>
  <files>packages/queue/src/types.ts, packages/queue/src/publish.ts, packages/queue/src/publish.test.ts</files>
  <behavior>
    - Test: `StripeEventPayload.parse({ eventId: "evt_1" })` succeeds with `stripeAccount` undefined (backward compatible — platform events).
    - Test: `StripeEventPayload.parse({ eventId: "evt_1", stripeAccount: "acct_x" })` succeeds and preserves `stripeAccount: "acct_x"`.
    - Test: `enqueueStripeEvent({ eventId: "evt_1", stripeAccount: "acct_x" })` sends a job whose data includes `stripeAccount: "acct_x"` (assert via the boss.send mock's call args), and the singletonKey remains `stripe-event:stripe_evt_1` (unchanged — dedup keyed on eventId only).
  </behavior>
  <action>
In `types.ts`, extend `StripeEventPayload`:

```typescript
export const StripeEventPayload = z.object({
  eventId: z.string().min(1).regex(/^evt_/, "Stripe event IDs start with evt_"),
  // P1c.1: present only for Connect-endpoint events (event.account). Platform
  // events leave it undefined. Threaded to every reducer's refetch as the
  // { stripeAccount } request option (RESEARCH §Connect webhooks).
  stripeAccount: z.string().regex(/^acct_/).optional(),
});
```

In `publish.ts`, `enqueueStripeEvent` already does `StripeEventPayload.parse(args)` then `boss.send(...data...)`, so the new field flows through automatically — confirm `data` (not a hand-picked subset) is passed to `boss.send`. Keep `singletonKey` keyed on `data.eventId` only (do NOT include stripeAccount — a Stripe replay of the same event must still dedup). Add the three behavior tests to `publish.test.ts` (extend the existing enqueueStripeEvent describe block; mock `startBoss`/`boss.send` the same way existing tests do).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/queue test</automated>
  </verify>
  <done>queue tests green; StripeEventPayload accepts optional acct_-prefixed stripeAccount; enqueueStripeEvent forwards it; singletonKey unchanged.</done>
</task>

</tasks>

<verification>
- `to_regclass('public.connected_accounts')` non-null in Neon.
- `pnpm --filter @gymos/queue test` passes (new + existing).
- No existing worker/edge-webhooks test breaks (field is optional): `pnpm --filter @gymos/worker test && pnpm --filter edge-webhooks test` still green.
</verification>

<success_criteria>
- Additive connected_accounts table live in gymos-demo Neon (Drizzle export present).
- StripeEventPayload carries optional stripeAccount; platform events parse unchanged.
- Zero behavioural change to existing platform-event flow (regression suites green).
</success_criteria>

<output>
After completion, create `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-01-SUMMARY.md`
</output>
