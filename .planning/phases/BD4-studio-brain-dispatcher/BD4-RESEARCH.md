# Phase BD4: Studio Brain + Dispatcher — Research

**Researched:** 2026-06-19
**Domain:** per-studio Brain (non-collab fork) + pg-boss scheduled jobs (digest + heartbeat) + reactivation via existing sendMessage chokepoint
**Confidence:** HIGH (all findings verified against actual codebase files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** — Studio Brain forks `templates/brain` into `apps/staff-web` on the non-collab single-studio path (no Yjs/CRDT). Brain knowledge persists in the studio's own Neon via additive migration to `apps/staff-web/server/db/schema.ts`. Single-tenant, no `studio_id` column.

**D-02** — Class catalog auto-ingest (GOB-02) populates Brain from `class_definitions` on init. Re-sync cadence is Claude's discretion; on-init suffices for the success criterion.

**D-03** — Brand voice + ethos are stored as editable documents (net-new, additive). The `brand` column in `food_items` is unrelated. Brand-voice storage is net-new.

**D-04** — New route `gymos.brain.tsx` at `/gymos/brain` inside the existing `/gymos` staff shell, following the `gymos.*` tab convention. shadcn primitives + progressive disclosure (AGENTS.md UI rules).

**D-05** — All Brain writes go through `defineAction` (actions-first). `useChangeVersion` live-refresh. Whether brand-voice editing is also an agent write-tool is Claude's discretion.

**D-06** — Daily owner digest = new pg-boss scheduled job in `services/worker` mirroring `telemetry-push.ts` exactly (consumer-first, idempotent `boss.schedule()`, unconfigured-skip). Reuses `buildTelemetrySnapshot` / `studio_telemetry_state` aggregates.

**D-07** — Digest sends to owner via the existing outbound chokepoint (`enqueueOutboundWhatsApp` → `sendMessage`). Out-of-window uses an approved owner-digest template.

**D-08** — Heartbeat = separate daily pg-boss schedule at 09:00 in the studio's IANA timezone. Timezone from PROV-seeded owner config (see research flag resolution below). Sensible default applies if unset.

**D-09** — "Dormant" = deterministic SQL over attendance/booking activity (no LLM in the trust path). Detection excludes opted-out members synchronously. Dormancy window = named config constant.

**D-10** — Heartbeat enqueues via `@gymos/queue`'s `enqueueOutboundWhatsApp`. `sendMessage.ts` and gate modules NOT modified.

**D-11** — Suppression ceiling = max 3 reactivation attempts per member per rolling 90-day window, tracked in a new additive `reactivation_attempts` table. Heartbeat queries synchronously before enqueue.

**D-12** — Suppression ceiling ships from day one. Recording an attempt and checking the ceiling are the same path that enqueues.

**D-13** — Reactivation copy personalized from GOB brand voice/ethos. Generic fallback when GOB not yet seeded.

**D-14** — Two parallel plans: GOB plan + GOD plan. GOD's personalization reads GOB with a generic fallback so GOD can be built and unit-tested independently.

**D-15** — Live GOD member sends deferred pending Meta template approval. Build + unit-test heartbeat, digest, dormant detection, suppression, enqueue with WhatsApp send mocked — exactly as BD2/BD3.

### Claude's Discretion

- Brain knowledge table shape/naming
- Class re-ingest cadence (on-init suffices)
- Dormancy window value (e.g. 30 days)
- Digest metric set + formatting
- Reactivation template wording
- Named config constant values
- Whether brand-voice editing is also an agent write-tool
- Precise location of the suppression check relative to the enqueue call

### Deferred Ideas (OUT OF SCOPE)

- Live GOD member reactivation sends (pending Meta template approval)
- Agent write-tool exposure for brand-voice editing (beyond GOB-03)
- Periodic class-catalog re-sync (on-init suffices)
- Richer LLM Brain distillation over studio data
- Member-facing Brain/coaching surface (owner-facing only in BD4)
- Billing/trial gating (PROV-FUT-01)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GOB-01 | Each studio deploy stores the studio's brand + ethos (brand voice) as Brain knowledge | Section 1: new `studio_brain_docs` table; non-collab fork of `templates/brain` Knowledge model |
| GOB-02 | Each studio deploy stores its classes + fitness methods as Brain context usable by the dispatcher | Section 1: class catalog auto-ingest from `class_definitions` on Brain init via `brain-init` action |
| GOB-03 | The gym owner can view and edit their studio Brain (brand voice, ethos, methods) from the staff app | Section 1: `gymos.brain.tsx` route; `useChangeVersion(["action"])` live-refresh; `defineAction` writes |
| GOD-01 | Each studio sends its gym owner a daily WhatsApp digest of the studio's own telemetry/metrics | Section 3: `daily-owner-digest` pg-boss job; `buildTelemetrySnapshot`; owner phone from `studio_owner_config` |
| GOD-02 | Each studio runs a daily "heartbeat" job (pg-boss schedule, studio IANA timezone) that detects dormant members | Sections 3 + 6: heartbeat job; `boss.schedule('heartbeat-reactivate', '0 9 * * *', {}, { tz })` with IANA tz |
| GOD-03 | The heartbeat sends member reactivation messages through the existing worker `sendMessage` chokepoint | Section 5: exact `enqueueOutboundWhatsApp` producer API; `sendMessage.ts` NOT modified |
| GOD-04 | Reactivation enforces suppression ceiling (max 3/90-day) and honors member opt-outs | Section 5 + schema section 2: `reactivation_attempts` table; synchronous opt-out exclusion via `whatsapp_opt_in.opted_out_at` |
| GOD-05 | Reactivation messages personalized from GOB brand/ethos, generic fallback when GOB not seeded | Section 7: reads `studio_brain_docs` for brand voice; falls back to generic template when null |
</phase_requirements>

---

## Summary

BD4 is the studio-tier mirror of BD3. Every pattern needed already exists in the codebase — the work is applying those patterns at the studio level in `apps/staff-web` and `services/worker`.

**GOB (Brain fork):** The `templates/brain` non-collab fork pattern was already established in BD3 for `apps/hq`. The Brain schema tables (`brainSources`, `brainRawCaptures`, `brainKnowledge`, `brainProposals`, `brainSyncRuns`, `brainIngestQueue`) were copied from `templates/brain` into `apps/hq/server/db/brain-schema.ts`. BD4 repeats this copy into `apps/staff-web/server/db/`. However, for the studio-tier use-case, the Brain machinery (full distillation pipeline with `brainRawCaptures` → `brainKnowledge`) is heavier than needed. A simpler `studio_brain_docs` table (brand voice, ethos, class methods as typed documents) plus a seed action that reads `class_definitions` is the right fit. The full Brain template tables can be added if the owner needs a richer knowledge surface later.

**GOD (Digest + Heartbeat):** `telemetry-push.ts` is the exact template to replicate. The `tz` option in `boss.schedule()` is confirmed available in pg-boss 12.18.2 (`ScheduleOptions.tz?: string`). The existing `outbound-whatsapp` queue / `sendMessage` chokepoint is the one path; GOD becomes a producer into it without touching the consumer. The `STUDIO_TIMEZONE` env var already exists in `services/worker/src/lib/env.ts` (optional field), which resolves the owner-config research flag.

**Critical finding (owner config):** No `studio_owner_config` table exists anywhere in the codebase. BD4 must add it additively. The worker's `env.ts` already has `STUDIO_TIMEZONE: z.string().optional()` — the timezone can be sourced from this env var (set by provisioning at Fly deploy time) rather than a DB table, which simplifies the implementation. The owner phone for the digest must come from a new table or env var. Recommendation: add a `studio_owner_config` singleton table additively (version 16 in `db.ts`), seeded by the provisioner.

**Primary recommendation:** Fork the GOB Brain as a lightweight `studio_brain_docs` table (not the full Brain template distillation pipeline). Add `studio_owner_config` as an additive singleton table in the studio Neon. Use `STUDIO_TIMEZONE` env var as the primary timezone source with `studio_owner_config.studio_timezone` as the DB fallback. Register GOD jobs following the exact `telemetry-push.ts` pattern.

---

## Project Constraints (from CLAUDE.md)

These directives are locked and must be followed by the planner:

- **Additive-only migrations:** `drizzle-kit generate` + `drizzle-kit migrate` only. No `drizzle-kit push`, no DROP/TRUNCATE/destructive ALTER. Guard `guard:no-drizzle-push` in place.
- **Migration drift gotcha:** Studio `apps/staff-web/server/db/migrations/*.sql` are NOT auto-run by `db.ts`. The `runMigrations` array in `apps/staff-web/server/plugins/db.ts` IS auto-run. New additive migrations must be added as new version entries in that array, not as standalone `.sql` files (those are only applied by hand).
- **Fork-boundary discipline:** `templates/brain/` is never edited in place. GOB additions live in `apps/staff-web/` only.
- **Actions-first:** All Brain writes use `defineAction`. No bespoke `/api/` routes for Brain mutations.
- **sendMessage.ts NOT modified:** GOD is a producer into `outbound-whatsapp`; `sendMessage.ts` and gate modules are read-only for BD4.
- **No `studio_id` columns:** Single-tenant code, multi-tenant deploy.
- **Tabler Icons, shadcn/ui primitives, TypeScript everywhere.**
- **useChangeVersion live-refresh** for the Brain edit UI (established in AE phases).
- **No local dev server:** NitroViteError — verify via Vercel deploy + unit tests + `tsc`.
- **No breaking DB changes ever.**

---

## Section 1: Studio Brain Fork (GOB-01, GOB-02, GOB-03)

### What was forked in BD3 (the mirror pattern)

BD3 copied `templates/brain/` into `apps/hq` as a non-collab Brain. The fork:
1. Copied Brain routes into `apps/hq/app/routes/brain/` (files: `_index.tsx`, `knowledge.tsx`, `sources.tsx`, `ops.tsx`, `review.tsx`, `search.tsx`, `settings.tsx`)
2. Created `apps/hq/server/db/brain-schema.ts` with the full Brain table set (exact copy from template)
3. Merged Brain tables into the HQ db schema barrel at `apps/hq/server/db/index.ts`

### Studio Brain: simpler approach recommended

The full Brain template distillation pipeline (`brainRawCaptures` → queued `brainIngestQueue` → `brainKnowledge`) is designed for ingesting external sources (Slack, Notion, docs) over time. The studio Brain use-case for BD4 is simpler: the owner edits brand voice + ethos as text documents, and the class catalog is seeded from `class_definitions`. A dedicated lightweight table is the right fit.

**Recommended schema (additive, version 16 in db.ts runMigrations):**

```sql
CREATE TABLE IF NOT EXISTS studio_brain_docs (
  id         TEXT PRIMARY KEY,          -- 'brand-voice' | 'ethos' | 'class-catalog'
  doc_type   TEXT NOT NULL,             -- 'brand-voice' | 'ethos' | 'class-catalog'
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',  -- Markdown content
  seeded_at  TEXT,                      -- ISO — null until first seed/edit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Three rows, one per doc_type (brand-voice, ethos, class-catalog). Primary key is the doc_type value itself (singleton-per-type pattern). The `body` of `class-catalog` is JSON-encoded class definitions, updated on Brain init. The `brand-voice` and `ethos` docs are editable by the owner.

**If the planner wants the full Brain distillation surface** (for richer agent `ask-brain` queries), the HQ `brain-schema.ts` tables can be copied verbatim into `apps/staff-web/server/db/brain-schema.ts` and added to the schema barrel. However, the `ownableColumns()` decoration on `brainSources`, `brainKnowledge`, and `brainProposals` requires `orgId` — the studio schema should strip `ownableColumns()` (single-tenant, no org scoping) and add a `// guard:allow-unscoped` comment on Brain queries. This is additional complexity vs. the lightweight approach above. Recommendation: start with `studio_brain_docs` for BD4 (satisfies GOB-01..03); upgrade to full Brain tables in a future phase.

### `/gymos/brain` route (GOB-03)

The route follows the exact `gymos.*` flat-route convention. Add:
- `apps/staff-web/app/routes/gymos.brain.tsx` — the Brain view/edit surface
- Tab entry in `GymosTopNav.tsx` (admin-only tab, same gating as Payments/Analytics)

The route is a client-side page (no SSR loader required — Brain content is not public). Pattern from `gymos.campaigns.tsx` / `gymos.forms._index.tsx` applies exactly:

```tsx
import { useChangeVersions } from "@agent-native/core/client";
const actionVersion = useChangeVersions(["action"]);
// Use actionVersion as a TanStack Query key dependency to re-fetch on writes
```

### Class catalog auto-ingest action (GOB-02)

A new `defineAction` action `brain-init` (or `seed-brain-catalog`) runs on Brain route load if `studio_brain_docs` has no `class-catalog` row. It queries `class_definitions` (all active rows, `name`, `description`, `durationMin`, `category`) and writes the JSON to `studio_brain_docs.body` where `id='class-catalog'`. The action is idempotent (upsert by id). It is a direct action, no approval gate.

```typescript
// apps/staff-web/actions/brain-init.ts
// Reads class_definitions, writes studio_brain_docs id='class-catalog'
// guard:allow-unscoped — studio-global Brain, single-tenant
```

---

## Section 2: Studio Schema Additive Changes

### Current highest migration version

`apps/staff-web/server/plugins/db.ts` defines `runMigrations([...], { table: "mail_migrations" })`. Current versions run through **version 15** (BD2-03 telemetry accumulator trigger). Next version to add is **16**.

### How runMigrations works

`runMigrations` from `@agent-native/core/db` is a Nitro plugin that runs SQL migrations tracked in the `mail_migrations` table (version-keyed, each version runs exactly once). To add a new migration: append a `{ version: N, sql: '...' }` entry to the array in `apps/staff-web/server/plugins/db.ts`. This IS auto-applied on server boot — unlike the `apps/staff-web/server/db/migrations/*.sql` files which are applied by hand.

**Note on dual-dialect:** Versions 14/15 demonstrate the SQLite/Postgres dialect pattern. Use `DEFAULT (datetime('now'))` for TEXT timestamps (SQLite-compatible), and wrap Postgres-specific SQL in the `DO $dialect$ IF EXISTS information_schema.tables` guard.

### New tables needed (BD4)

**Version 16 — `studio_brain_docs`** (GOB-01, GOB-02, GOB-03):
```sql
CREATE TABLE IF NOT EXISTS studio_brain_docs (
  id         TEXT PRIMARY KEY,
  doc_type   TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  seeded_at  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Version 17 — `studio_owner_config`** (GOD-01, GOD-02 — the research flag resolution):
```sql
CREATE TABLE IF NOT EXISTS studio_owner_config (
  id                   TEXT PRIMARY KEY,        -- always 'singleton'
  owner_phone_e164     TEXT NOT NULL DEFAULT '',
  studio_timezone      TEXT NOT NULL DEFAULT 'Europe/London',
  digest_enabled       INTEGER NOT NULL DEFAULT 1,
  heartbeat_enabled    INTEGER NOT NULL DEFAULT 1,
  heartbeat_batch_size INTEGER NOT NULL DEFAULT 50,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Version 18 — `reactivation_attempts`** (GOD-04 suppression ceiling):
```sql
CREATE TABLE IF NOT EXISTS reactivation_attempts (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL,
  sent_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reactivation_attempts_member_sent
  ON reactivation_attempts(member_id, sent_at);
```

**Drizzle schema entries** — add to `apps/staff-web/server/db/schema.ts`:
```typescript
export const studioBrainDocs = table("studio_brain_docs", {
  id: text("id").primaryKey(),
  docType: text("doc_type").notNull(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  seededAt: text("seeded_at"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const studioOwnerConfig = table("studio_owner_config", {
  id: text("id").primaryKey(), // always 'singleton'
  ownerPhoneE164: text("owner_phone_e164").notNull().default(""),
  studioTimezone: text("studio_timezone").notNull().default("Europe/London"),
  digestEnabled: integer("digest_enabled", { mode: "boolean" }).notNull().default(true),
  heartbeatEnabled: integer("heartbeat_enabled", { mode: "boolean" }).notNull().default(true),
  heartbeatBatchSize: integer("heartbeat_batch_size").notNull().default(50),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

export const reactivationAttempts = table("reactivation_attempts", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  sentAt: text("sent_at").notNull().default(now()),
  createdAt: text("created_at").notNull().default(now()),
});
```

### Migration drift gotcha (re-stated)

The `.sql` files in `apps/staff-web/server/db/migrations/` (0000 through 0006) were applied to `gymos-demo` Neon by hand and are NOT run by `db.ts`. All BD4 schema changes MUST go through `runMigrations` array entries in `db.ts` (versions 16/17/18), which ARE auto-applied on server boot. Never add a standalone `.sql` file expecting it to auto-run.

---

## Section 3: Daily Digest + Heartbeat Jobs (GOD-01, GOD-02)

### Exact pattern from telemetry-push.ts

File: `services/worker/src/queues/telemetry-push.ts`

Key characteristics:
1. Consumer registered with `boss.work(QUEUE_NAME, async () => { ... })` FIRST
2. `boss.schedule(QUEUE_NAME, cronExpr, {}, scheduleOptions)` called AFTER the consumer
3. Unconfigured-skip: check for required env vars / DB rows at top of handler; log `.warn()` and `return` cleanly without throwing
4. Idempotent: `boss.schedule()` with the same queue name + cron string is a no-op if already registered
5. Queue must be created in `services/worker/src/index.ts` at boot before `registerXxx()` is called

### pg-boss 12.18.2 schedule() signature — CONFIRMED

From `services/worker/node_modules/pg-boss/dist/types.d.ts`:

```typescript
export type ScheduleOptions = SendOptions & {
  tz?: string;   // IANA timezone string e.g. "Europe/London"
  key?: string;
};
```

**`boss.schedule(queue, cron, data, options)` with `{ tz: ianaTimezone }` is the correct API.** No `as any` cast needed (the `tz` field is typed). The existing `telemetry-push.ts` uses `{ tz: "UTC" } as any` — BD4 jobs should use the same pattern for consistency but the cast is not required.

### Daily owner digest (GOD-01)

New file: `services/worker/src/queues/daily-owner-digest.ts`

```typescript
const DIGEST_QUEUE = "daily-owner-digest";

export async function registerDailyOwnerDigest(boss: PgBoss): Promise<void> {
  await boss.work(DIGEST_QUEUE, async () => {
    const env = getEnv();
    // Unconfigured-skip: no owner phone → skip
    // Read studio_owner_config singleton
    // Check digest_enabled flag
    // Build metrics from buildTelemetrySnapshot() (reuse DB query functions directly)
    // Insert messages row (status='queued')
    // enqueueOutboundWhatsApp({ messageId, memberId: OWNER_MEMBER_ID, payload })
  });

  // Schedule at 06:00 in studio timezone (configurable, default 'Europe/London')
  const tz = getEnv().STUDIO_TIMEZONE ?? "Europe/London";
  await boss.schedule(DIGEST_QUEUE, "0 6 * * *", {}, { tz } as any);
}
```

**Owner member ID:** The digest sends to the owner's phone, so the owner must have a `gym_members` row (for the `messages.member_id` FK and for `sendMessage` to look up `phone_e164`). The `studio_owner_config.owner_phone_e164` is the owner's phone. At digest send time, look up the `gym_members` row by `phone_e164` to get the `memberId`. If no matching member row, unconfigured-skip (log warning, return).

**Template for digest:** An approved Meta template named e.g. `owner_daily_digest`. Mock at the chokepoint level (deferred-on-external-dependency, D-15).

### Heartbeat (GOD-02)

New file: `services/worker/src/queues/heartbeat-reactivate.ts`

```typescript
const HEARTBEAT_QUEUE = "heartbeat-reactivate";

export async function registerHeartbeatReactivate(boss: PgBoss): Promise<void> {
  await boss.work(HEARTBEAT_QUEUE, async () => {
    // 1. Read studio_owner_config — check heartbeat_enabled
    // 2. Run dormant detection SQL (Section 6 below)
    // 3. For each dormant member (up to heartbeat_batch_size):
    //    a. Check reactivation_attempts — skip if >= 3 in last 90 days
    //    b. Check whatsapp_opt_in — skip if opted out or not opted in
    //    c. INSERT reactivation_attempts row
    //    d. INSERT messages row (status='queued')
    //    e. enqueueOutboundWhatsApp(...)
  });

  const tz = getEnv().STUDIO_TIMEZONE ?? "Europe/London";
  await boss.schedule(HEARTBEAT_QUEUE, "0 9 * * *", {}, { tz } as any);
}
```

**Stagger offset (roadmap decision):** The STATE.md records "GOD heartbeat cron start times staggered by `hash(studio_id) % 60 min`". This means the cron expression for the heartbeat should NOT be a fixed `"0 9 * * *"` across all studios. Instead: `const minuteOffset = simpleHash(env.STUDIO_ID ?? 'default') % 60; const cron = \`${minuteOffset} 9 * * *\`;`. This stagger is set at boot time (env-dependent), not at provisioning time.

### Queue registration in index.ts

Add to `services/worker/src/index.ts`:
```typescript
import { registerDailyOwnerDigest } from "./queues/daily-owner-digest.js";
import { registerHeartbeatReactivate } from "./queues/heartbeat-reactivate.js";
// In main():
await boss.createQueue("daily-owner-digest");
await boss.createQueue("heartbeat-reactivate");
await registerDailyOwnerDigest(boss);
await registerHeartbeatReactivate(boss);
```

---

## Section 4: Owner Contact + IANA Timezone Source (RESEARCH FLAG — RESOLVED)

**Definitive answer:** No `studio_owner_config` table or code exists anywhere in the codebase. Grep over all of `packages/`, `apps/`, `services/` confirms zero matches for `owner_config`, `studio_owner_config`, `owner_phone`, or `studio_timezone` in schema or action files (only in `.planning/research/` documents and the `ROADMAP.md` depend-on text).

**However:** `services/worker/src/lib/env.ts` already declares `STUDIO_TIMEZONE: z.string().optional()`. This is the timezone env var set by the provisioner at Fly deploy time.

**Recommended approach for BD4:**

1. Add `studio_owner_config` as an additive singleton table (version 17 in `db.ts`) as specified in Section 2 above.
2. **Timezone resolution order for pg-boss schedule:**
   - Primary: `env.STUDIO_TIMEZONE` (already in the worker env schema, set by provisioner at deploy time)
   - Fallback: read `studio_owner_config.studio_timezone` from the DB at boot
   - Default: `"Europe/London"` (makes sense for the first customer, Hustle UK gym)
3. **Owner phone resolution order for digest:**
   - Primary: `studio_owner_config.owner_phone_e164` (seeded by provisioner)
   - Fallback: unconfigured-skip with `log.warn`
4. **Seeding:** The provisioner saga (BD2 PROV step 3 "seed admin user + initial rows") seeds the `studio_owner_config` singleton row with `owner_phone_e164` from the signup form and `studio_timezone` from the studio's submitted timezone preference.

**Default if studio_owner_config is NULL at BD4 ship time (the live gymos-demo studio):** The `gymos-demo` Neon needs a manual one-time INSERT to seed the singleton row for the owner. Document this in the plan as a manual verification step.

---

## Section 5: Reactivation via Existing Chokepoint (GOD-03, GOD-04)

### Exact producer API

From `packages/queue/src/publish.ts`:

```typescript
export async function enqueueOutboundWhatsApp(
  args: OutboundWhatsAppPayload,
): Promise<string | null>
```

`OutboundWhatsAppPayload` shape (from `packages/queue/src/types.ts`):
```typescript
z.object({
  messageId: z.string().min(1),   // 'msg_<nanoid>' — must be pre-inserted in messages table
  memberId: z.string().min(1),    // gym_members.id
  payload: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), body: z.string().min(1).max(4096) }),
    z.object({
      type: z.literal("template"),
      name: z.string().min(1),     // approved template name
      vars: z.record(z.string(), z.string()),
      language: z.string().optional(),
    }),
  ]),
})
```

**singletonKey dedupe:** `publish.ts` sets `singletonKey: \`outbound-whatsapp:${data.messageId}\`` automatically. Since `messageId` is generated by the heartbeat per-member per-run (`nanoid()`), each heartbeat invocation produces a unique `messageId`. No duplicate suppression needed at the producer level for heartbeat sends — the `reactivation_attempts` table is the per-member dedupe.

### Required pre-condition: messages row must be inserted BEFORE enqueue

From `sendMessage.ts`:
```typescript
// sendMessage writes messages.status='sent' and messages.external_id
// The messages row must already exist with status='queued' before enqueueing
```

Heartbeat flow per dormant member:
```typescript
const messageId = `msg_${nanoid()}`;
// 1. INSERT INTO messages (..., id, conversation_id, direction, message_type, status, body, agent_initiated, created_at)
//    VALUES (messageId, conversationId, 'out', 'template', 'queued', null, true, now())
// 2. INSERT INTO reactivation_attempts (id, member_id, sent_at) VALUES (nanoid(), memberId, now())
// 3. await enqueueOutboundWhatsApp({ messageId, memberId, payload: { type: 'template', name: REACTIVATION_TEMPLATE, vars: {...} } })
```

**conversationId:** Each dormant member must have (or need) a `conversations` row for the `messages.conversation_id` FK. Look up by `memberId` + `channel='whatsapp'`. If none exists, the heartbeat creates a conversation row first (status='closed') — the reactivation message opens the thread.

### Gate order (unchanged, re-stated for GOD context)

`sendMessage.ts` gate order:
1. **opt-in gate** — `hasOptIn(memberId, db)`: queries `whatsapp_opt_in` where `memberId=? AND opted_out_at IS NULL`
2. **window gate** — `isInWindow(lastInboundAt)`: pure function, true if last inbound < 24h ago
3. **template-approved gate** — `isTemplateApproved(templateName, db)`: queries `whatsapp_templates` where `name=? AND status='approved'`

**Defense-in-depth:** The heartbeat ALSO checks opt-in synchronously before enqueue (step b in the heartbeat loop above). This reads `whatsapp_opt_in` directly. Members without an opt-in row or with `opted_out_at IS NOT NULL` are skipped before enqueueing — they never reach the chokepoint.

### Opt-in state storage (confirmed)

`apps/staff-web/server/db/schema.ts` — `whatsappOptIn` table:
```
memberId    TEXT PRIMARY KEY  — FK gym_members.id
optedInAt   TEXT
optedOutAt  TEXT              — nullable; set = opted out
source      TEXT enum
```

Synchronous pre-check in heartbeat:
```sql
SELECT opted_out_at FROM whatsapp_opt_in WHERE member_id = ?
```
Skip member if no row OR `opted_out_at IS NOT NULL`.

### Suppression ceiling check (GOD-04)

```sql
SELECT COUNT(*) AS attempt_count
FROM reactivation_attempts
WHERE member_id = ?
  AND sent_at >= (now() - INTERVAL '90 days')
```

Skip if `attempt_count >= 3`. This check runs BEFORE inserting the `reactivation_attempts` row and BEFORE calling `enqueueOutboundWhatsApp` — atomic in the sense that both writes (messages + reactivation_attempts) happen before enqueue, so a failed enqueue doesn't leave a ghost attempt row. Recommended pattern: wrap the INSERT + enqueue in a try/catch; if enqueue fails, delete the `reactivation_attempts` row (rollback by ID).

---

## Section 6: Dormant Detection (GOD-02, GOD-09)

### Available activity tables

From `apps/staff-web/server/db/schema.ts`:

| Table | Activity signal | Column to use |
|-------|-----------------|---------------|
| `bookings` | Class attendance | `attended_at` (status='attended') or `booked_at` (status='booked'/'attended') |
| `food_entries` | Mobile app engagement | `logged_at` |
| `pass_debits` | Pass usage | `created_at` |
| `conversations` + `messages` | WhatsApp interaction | `last_inbound_at` on conversations |

**Recommendation — primary dormancy signal:** Last class attendance (`bookings.attended_at IS NOT NULL AND status='attended'`). Secondary: last booking (including `status='booked'`). Members with no attended booking in the last N days are "dormant". Members with no booking at all (zero history) are included (they were leads who never converted).

### Dormancy SQL

```sql
-- Dormant: no attended or active booking in last DORMANCY_DAYS days
SELECT gm.id AS member_id
FROM gym_members gm
LEFT JOIN bookings b ON b.member_id = gm.id
  AND b.status IN ('attended', 'booked')
  AND b.booked_at >= (NOW() - INTERVAL '${DORMANCY_DAYS} days')
LEFT JOIN whatsapp_opt_in woi ON woi.member_id = gm.id
  AND woi.opted_out_at IS NULL
WHERE b.id IS NULL          -- no recent booking
  AND woi.member_id IS NOT NULL  -- has opt-in (pre-filter; chokepoint re-checks)
  AND gm.phone_e164 IS NOT NULL  -- must have a phone to message
GROUP BY gm.id
```

**Recommended constant:** `DORMANCY_DAYS = 30` (30 days without a booking = dormant). Named constant in the heartbeat file: `const DORMANCY_DAYS = 30;`.

**Batch limit:** `LIMIT studio_owner_config.heartbeat_batch_size` (default 50). Prevents a single run from flooding Meta if hundreds of members are dormant after a first install.

---

## Section 7: Personalization + Meta Template Compliance (GOD-05, GOD-01)

### Brand voice read

```typescript
// In heartbeat reactivation vars assembly:
const brainDoc = await db
  .select({ body: schema.studioBrainDocs.body })
  .from(schema.studioBrainDocs)
  .where(eq(schema.studioBrainDocs.id, "brand-voice"))
  .limit(1);
const brandVoice = brainDoc[0]?.body ?? null;

// Generic fallback when GOB not seeded:
const reactivationVars = brandVoice
  ? assembleBrandedVars(brandVoice, member)
  : assembleGenericVars(member);
```

The personalization is template-variable substitution, not LLM-generated freeform text (which would violate the out-of-window constraint). Template vars like `{{1}}` can include a studio-voice greeting drawn from brand voice doc.

### Meta template compliance (out-of-window)

All reactivation messages are out-of-window sends (dormant members, by definition, haven't messaged recently). Out-of-window MUST use an approved Meta template — this is the project constraint enforced at the sender layer (`sendMessage.ts` throws `WindowExpiredError` for `type:"text"` out of window).

GOD heartbeat must use `payload: { type: "template", name: REACTIVATION_TEMPLATE_NAME, vars: {...} }`.

**Template names (pending Meta approval):**
- Member reactivation: `member_reactivation` (submitted at BD3 completion per the ROADMAP calendar dependency)
- Owner daily digest: `owner_daily_digest`

**Deferred-on-external-dependency (D-15):** Build + unit-test the heartbeat + digest with WhatsApp send mocked at the `enqueueOutboundWhatsApp` level (or mock `sendViaMyutik` one level deeper). The mock should log the would-be send and return a fake `externalId`. Live sends activate when `WHATSAPP_TEMPLATES` table has `status='approved'` for both template names.

**What already exists for template gating:** `whatsapp_templates` table + `templateGate.ts` (`isTemplateApproved(name, db)`) — these are already in production. The template needs a row with `status='approved'` for the gates to pass.

---

## Section 8: Anthropic Call-Site (GOD-05 personalization)

BD1 audited the Anthropic call-site. The BD1-ANTHROPIC-AUDIT.md wrapper is in place. If the digest uses an LLM to generate a natural-language summary (as described in ARCHITECTURE §V2-7), it goes through the existing `anthropic.ts` wrapper in `apps/staff-web/server/` (the same one the staff chat uses). This is the PII-safe path: the digest aggregates are numeric (`activeMembers`, `bookings`, `messagesSent`, `retentionRate`) — no member names/phones are in the LLM input.

For the **heartbeat reactivation copy** (GOD-05), LLM personalization of the template vars is allowed but must respect:
- No member PII in the LLM prompt (no names, phones, email — use generic "studio member" references)
- Template vars are strings substituted into an approved template — the LLM generates the var value, not freeform text
- The worker is a separate Fly process; it uses the DB-connected Anthropic client from `services/worker/src/lib/` (check `services/worker/src/domain/` for an anthropic.ts or similar — not yet verified; if absent, the worker must import the Anthropic SDK directly following the BD1 audit pattern)

**Confidence note:** Whether `services/worker` has its own `anthropic.ts` was not verified in this research pass. If LLM personalization is wanted in the heartbeat (beyond simple template var assembly from the brand-voice doc), the implementer must check `services/worker/src/` for an anthropic wrapper. If absent, add one following the BD1-ANTHROPIC-AUDIT.md pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Daily scheduled job | Custom `setInterval` or cron package | `boss.schedule()` in pg-boss 12.18.2 | Already in stack; supports IANA tz; idempotent on restart |
| Timezone-aware schedule | UTC-fixed cron with offset calculation | `boss.schedule(queue, cron, {}, { tz: "Europe/London" })` | pg-boss `tz` option confirmed in v12 types |
| WhatsApp send | Direct `sendViaMyutik` call | `enqueueOutboundWhatsApp(...)` from `@gymos/queue` | Passes through all compliance gates in `sendMessage.ts` |
| Opt-in check | Custom SQL | `hasOptIn(memberId, db)` from `services/worker/src/domain/gates/optInGate.ts` | Already the gate; re-read the source for the import path |
| Window check | Custom date math | `isInWindow(lastInboundAt)` from `windowGate.ts` | Pure function, tested |
| Template approval check | Meta API call | `isTemplateApproved(name, db)` from `templateGate.ts` | Queries local `whatsapp_templates` table |
| Brain doc edit | bespoke `/api/brain` route | `defineAction` + `useChangeVersion(["action"])` | AGENTS.md actions-first rule; live-refresh via existing pattern |

---

## Common Pitfalls

### Pitfall 1: Registering the queue in index.ts

**What goes wrong:** `boss.work()` on a queue that hasn't been created with `boss.createQueue()` throws in pg-boss v12.
**Prevention:** Add `"daily-owner-digest"` and `"heartbeat-reactivate"` to the `for (const q of [...])` loop in `services/worker/src/index.ts` before calling `registerDailyOwnerDigest` / `registerHeartbeatReactivate`.
**Reference:** Existing `index.ts` lines 42-57 — same pattern for telemetry-push.

### Pitfall 2: Heartbeat sends without a pre-existing messages row

**What goes wrong:** `sendMessage.ts` updates `messages.status` by `messageId`. If the messages row doesn't exist before enqueue, the `UPDATE` is a no-op and the inbox shows no record of the send.
**Prevention:** INSERT `messages` row (status='queued') BEFORE calling `enqueueOutboundWhatsApp`. The `messageId` used in the enqueue must match the inserted row's primary key.

### Pitfall 3: Suppression ceiling race

**What goes wrong:** Two heartbeat runs fire within the same minute (unlikely but possible on a pg-boss restart storm). Both read `attempt_count=2`, both proceed, both insert, member gets 2 sends.
**Why it happens:** No row-level lock on `reactivation_attempts`.
**Mitigation:** Use `singletonKey` on the heartbeat job itself (`boss.send(HEARTBEAT_QUEUE, {}, { singletonKey: "heartbeat-daily" })` is what `boss.schedule()` effectively does — one job per cron tick). Additionally, the pg-boss `batchSize=1, localConcurrency=1` on the heartbeat worker prevents concurrent processing of the same job. This is sufficient for the low-volume case; a DB-level advisory lock is overkill for BD4.

### Pitfall 4: studio_owner_config singleton not seeded on gymos-demo

**What goes wrong:** The digest and heartbeat run unconfigured-skip indefinitely because the `studio_owner_config` row doesn't exist in the live `gymos-demo` Neon.
**Prevention:** Include a manual verification step in the GOD plan: after the migration runs, INSERT the owner config row via Neon console:
```sql
INSERT INTO studio_owner_config (id, owner_phone_e164, studio_timezone)
VALUES ('singleton', '+44XXXXXXXXXX', 'Europe/London')
ON CONFLICT (id) DO NOTHING;
```

### Pitfall 5: Brain route missing from GymosTopNav

**What goes wrong:** `gymos.brain.tsx` route exists but no tab link renders; owner has no way to navigate to it.
**Prevention:** Add `const isBrain = path.startsWith("/gymos/brain");` and a `<Link to="/gymos/brain">` tab in `GymosTopNav.tsx`. Admin-only (same gating as Analytics/Campaigns/Payments).

### Pitfall 6: migrations in .sql files not auto-applied

**What goes wrong:** Developer adds `apps/staff-web/server/db/migrations/0007_bd4_brain.sql` expecting it to auto-run; it doesn't; routes 500 with "no such table: studio_brain_docs".
**Prevention:** All BD4 schema changes go into the `runMigrations([...], { table: "mail_migrations" })` array in `db.ts` as version 16/17/18. The standalone `.sql` files are historical artifacts for the gymos-demo Neon (pre-runMigrations era) and must NEVER be used as the migration mechanism going forward.

### Pitfall 7: ownableColumns() on studio Brain tables

**What goes wrong:** If the planner copies `brain-schema.ts` from `apps/hq` verbatim, `brainSources` etc. include `ownableColumns()` which adds `orgId`. The studio has an org (Better-auth org created by the framework), but all Brain queries must then filter by `orgId`. Without the correct `orgId` in the query, the Brain returns empty.
**Prevention:** If using the lightweight `studio_brain_docs` approach (recommended), no `ownableColumns()` is needed — add `// guard:allow-unscoped — single-tenant studio Brain`. If copying the full Brain tables, strip `ownableColumns()` from all tables and use `// guard:allow-unscoped` on queries.

---

## Architecture Patterns

### GOB: Lightweight Brain doc approach
```
apps/staff-web/
├── server/db/schema.ts           + studioBrainDocs, studioOwnerConfig, reactivationAttempts
├── server/plugins/db.ts          + versions 16, 17, 18
├── actions/brain-init.ts         seeds class-catalog from class_definitions (on-init, idempotent)
├── actions/update-brain-doc.ts   owner edits brand-voice/ethos (defineAction, no gate)
├── actions/get-brain-docs.ts     reads all studio_brain_docs rows
└── app/routes/gymos.brain.tsx    Brain view/edit UI; useChangeVersions(["action"])
```

### GOD: Worker scheduled jobs
```
services/worker/src/
├── queues/daily-owner-digest.ts      registers boss.work + boss.schedule("0 6 * * *", {}, { tz })
├── queues/heartbeat-reactivate.ts    registers boss.work + boss.schedule("${offset} 9 * * *", {}, { tz })
└── index.ts                          + createQueue for both + registerXxx calls
```

### GOD: Heartbeat internal flow
```
heartbeat job fires
  → read studio_owner_config (heartbeat_enabled check)
  → SQL: dormant members (no attended booking in 30 days, opted-in, has phone)
    LIMIT heartbeat_batch_size
  → for each member:
      check reactivation_attempts (< 3 in 90 days)
      check whatsapp_opt_in (row exists AND opted_out_at IS NULL)
      read studio_brain_docs id='brand-voice' for personalization vars
      INSERT messages (status='queued', messageId='msg_<nanoid>')
      INSERT reactivation_attempts (member_id, sent_at)
      enqueueOutboundWhatsApp({ messageId, memberId, payload: { type: 'template', name: 'member_reactivation', vars } })
  → [sendMessage.ts runs async in worker, re-checks all gates]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ + Redis | pg-boss on Neon | 2026-05-17 (v1.0 decision) | No Redis; pg-boss v12.18.2 is installed |
| Meta official WhatsApp SDK | MYÜTIK relay via `sendViaMyutik` | 2026-06-15 | All sends go through MYÜTIK; no direct Meta Graph API calls from GOD |
| Sequential migration via .sql files | `runMigrations` array in db.ts | BD2-03 (2026-06-19) | Versions 14/15 in runMigrations; BD4 adds 16/17/18 |

---

## Open Questions

1. **Worker Anthropic wrapper**
   - What we know: BD1 audited the Anthropic call-site in `apps/staff-web`. The worker (`services/worker`) uses `sendViaMyutik` for WhatsApp but may not have an Anthropic wrapper.
   - What's unclear: Does `services/worker/src/` have an `anthropic.ts`? If not, and if the digest wants an LLM-generated natural-language summary (per ARCHITECTURE §V2-7 step 3), the worker needs one.
   - Recommendation: For GOD-01 digest, skip LLM summary in BD4 — send a structured metrics digest using the `buildTelemetrySnapshot` numbers directly (e.g. "Bookings: 42, Active members: 18, Retention: 72%"). LLM narrative can be added in a follow-on phase.

2. **Owner must be a gym_members row**
   - What we know: `sendMessage.ts` looks up `gym_members` by `memberId` to get `phone_e164`. The digest sends to the owner.
   - What's unclear: Does the owner (studio admin) have a `gym_members` row?
   - Recommendation: The `studio_owner_config` row stores `owner_phone_e164`. At digest send time, look up `gym_members` by `phone_e164` — if not found, create a `gym_members` row for the owner automatically (or require the provisioner to create it). Document this as a plan task.

3. **Conversations row for heartbeat sends**
   - What we know: `messages.conversation_id` is required. Dormant members may not have an open conversation.
   - Recommendation: The heartbeat should look up or create a `conversations` row for each dormant member (status='closed' for truly dormant members) before inserting the `messages` row. This is standard — it's what the existing `send-template-to-members` action does.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pg-boss | GOD job scheduling | Yes (installed in services/worker) | 12.18.2 | — |
| `@gymos/queue` producer | GOD enqueue | Yes (packages/queue/src/publish.ts) | workspace | — |
| `enqueueOutboundWhatsApp` | GOD heartbeat + digest | Yes | — | — |
| `buildTelemetrySnapshot` | GOD digest metrics | Yes (services/worker/src/domain/) | — | — |
| `studio_owner_config` table | GOD digest + heartbeat | No — must be added additively | — | unconfigured-skip |
| `studio_brain_docs` table | GOB-01..03, GOD-05 | No — must be added additively | — | generic fallback for GOD-05 |
| `reactivation_attempts` table | GOD-04 suppression | No — must be added additively | — | — |
| `member_reactivation` template (Meta approved) | GOD-03 live sends | No (pending submission) | — | mock at chokepoint (D-15) |
| `owner_daily_digest` template (Meta approved) | GOD-01 live sends | No (pending submission) | — | mock at chokepoint (D-15) |
| STUDIO_TIMEZONE env var | GOD schedule timezone | Yes (in env.ts, optional) | — | default 'Europe/London' |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured per-package) |
| Config file | `services/worker/vitest.config.ts` (if present; mirror BD3-01 pattern of adding per-package config) |
| Quick run command | `pnpm --filter services/worker vitest run` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GOB-01 | `studio_brain_docs` INSERT + SELECT round-trip | unit | `pnpm --filter services/worker vitest run` | No — Wave 0 |
| GOB-02 | `brain-init` action reads `class_definitions`, writes class-catalog doc | unit | vitest | No — Wave 0 |
| GOD-01 | `daily-owner-digest` handler: unconfigured-skip when no owner config | unit | vitest | No — Wave 0 |
| GOD-02 | Heartbeat cron registers with correct tz via `boss.schedule` | unit (mock boss) | vitest | No — Wave 0 |
| GOD-03 | Heartbeat calls `enqueueOutboundWhatsApp` for each dormant member | unit | vitest | No — Wave 0 |
| GOD-04 | Suppression ceiling: member at 3 attempts is skipped; member at 2 proceeds | unit | vitest | No — Wave 0 |
| GOD-05 | Brand-voice vars from `studio_brain_docs`; generic fallback when missing | unit | vitest | No — Wave 0 |

### Sampling Rate
- Per task commit: `pnpm --filter services/worker vitest run`
- Per wave merge: `pnpm vitest run && pnpm tsc --noEmit`
- Phase gate: Full suite green + `tsc` clean before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `services/worker/vitest.config.ts` — needed (BD3-01 decision: per-package vitest config; check if it already exists)
- [ ] `services/worker/src/queues/daily-owner-digest.test.ts` — covers GOD-01 unconfigured-skip + happy path
- [ ] `services/worker/src/queues/heartbeat-reactivate.test.ts` — covers GOD-02..05 (dormant detection, suppression ceiling, opt-out exclusion, enqueue call)
- [ ] `apps/staff-web/actions/brain-init.test.ts` — covers GOB-02 class catalog ingest

---

## Sources

### Primary (HIGH confidence — directly verified in codebase)
- `apps/staff-web/server/plugins/db.ts` — runMigrations array, versions 1-15, migration table name `mail_migrations`
- `apps/staff-web/server/db/schema.ts` — all existing tables: `class_definitions`, `gym_members`, `whatsapp_opt_in`, `bookings`, `food_entries`, `studioTelemetryState`, `whatsapp_templates`
- `services/worker/src/queues/telemetry-push.ts` — canonical pattern for GOD scheduled jobs
- `services/worker/src/domain/sendMessage.ts` — complete chokepoint; gate order; pre-conditions
- `services/worker/src/domain/gates/optInGate.ts` — `hasOptIn` signature; `opted_out_at` logic
- `services/worker/src/domain/gates/windowGate.ts` — `isInWindow` pure function
- `services/worker/src/lib/env.ts` — `STUDIO_TIMEZONE: z.string().optional()` confirmed
- `services/worker/src/index.ts` — `createQueue` + `registerXxx` pattern
- `packages/queue/src/publish.ts` — `enqueueOutboundWhatsApp` signature; singletonKey pattern
- `packages/queue/src/types.ts` — `OutboundWhatsAppPayload` shape
- `apps/hq/server/db/brain-schema.ts` — Brain table set (fork source for GOB if full Brain chosen)
- `apps/hq/server/db/index.ts` — DB schema barrel merge pattern
- `services/worker/node_modules/pg-boss/dist/types.d.ts` — `ScheduleOptions.tz?: string` confirmed; pg-boss 12.18.2
- `apps/staff-web/app/routes/gymos.tsx` — layout shell; `<Outlet />` for child routes
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — tab pattern; admin gating
- `apps/staff-web/app/routes/gymos.campaigns.tsx` — `useChangeVersions(["action"])` live-refresh pattern

### Secondary (MEDIUM confidence — from planning docs, verified against code)
- `.planning/research/ARCHITECTURE.md` §V2-7 — GOD job flow design; `studio_owner_config` table spec
- `.planning/STATE.md` — stagger offset decision (`hash(studio_id) % 60`); BD2-03 decisions
- `BD4-CONTEXT.md` — all D-01..D-15 locked decisions

### Tertiary (LOW confidence — unverified in this research pass)
- Whether `services/worker/src/` has an `anthropic.ts` wrapper — not read; assume absent until confirmed
- Exact pg-boss behavior on duplicate `boss.schedule()` calls with different tz — assumed idempotent based on documentation pattern; the `telemetry-push.ts` precedent (`{ tz: "UTC" } as any`) confirms the call succeeds

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all stack choices pre-confirmed in prior BD phases
- Schema/migration pattern: HIGH — verified in `db.ts` through version 15
- pg-boss `tz` option: HIGH — verified in `types.d.ts` of installed 12.18.2
- Owner config source: HIGH — confirmed no existing table; env.ts already has STUDIO_TIMEZONE
- Chokepoint / queue producer API: HIGH — read actual source files
- Brain fork pattern: HIGH — BD3 `brain-schema.ts` is the verified fork source
- Pitfalls: HIGH — based on actual code inspection, not theory

**Research date:** 2026-06-19
**Valid until:** 2026-07-15 (stable stack for v1 timeline; pg-boss 12.x API stable)
