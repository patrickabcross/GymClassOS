---
phase: BD4-studio-brain-dispatcher
plan: 02
type: execute
wave: 2
depends_on: [BD4-01]
files_modified:
  - services/worker/src/lib/db.ts
  - services/worker/src/queues/daily-owner-digest.ts
  - services/worker/src/queues/heartbeat-reactivate.ts
  - services/worker/src/queues/daily-owner-digest.test.ts
  - services/worker/src/queues/heartbeat-reactivate.test.ts
  - services/worker/src/index.ts
autonomous: true
requirements: [GOD-01, GOD-02, GOD-03, GOD-04, GOD-05]
must_haves:
  truths:
    - "A daily pg-boss digest job sends the gym owner a WhatsApp digest of the studio's own metrics via the existing chokepoint"
    - "A daily heartbeat pg-boss job runs at 09:00 in the studio's IANA timezone and detects dormant members deterministically"
    - "Dormant members are reactivated by enqueueing into outbound-whatsapp — sendMessage.ts is NOT modified"
    - "A member with 3 reactivation attempts in any rolling 90-day window receives no further heartbeat messages, and opted-out members are excluded synchronously — from day one"
    - "Reactivation copy is personalized from studio_brain_docs brand-voice with a generic fallback when GOB is unseeded"
  artifacts:
    - path: "services/worker/src/queues/daily-owner-digest.ts"
      provides: "registerDailyOwnerDigest: boss.work + boss.schedule with tz; unconfigured-skip; reuses buildTelemetrySnapshot; enqueues owner digest"
      contains: "boss.schedule"
    - path: "services/worker/src/queues/heartbeat-reactivate.ts"
      provides: "registerHeartbeatReactivate: dormant SQL + suppression ceiling + opt-out exclusion + brand-voice personalization + enqueueOutboundWhatsApp"
      contains: "boss.schedule"
    - path: "services/worker/src/lib/db.ts"
      provides: "Drizzle mirrors for studio_owner_config, reactivation_attempts, studio_brain_docs, class_definitions/bookings as needed (Postgres pg-core, kept in sync)"
      contains: "studio_owner_config"
    - path: "services/worker/src/index.ts"
      provides: "createQueue + register calls for daily-owner-digest and heartbeat-reactivate"
      contains: "registerHeartbeatReactivate"
  key_links:
    - from: "services/worker/src/queues/heartbeat-reactivate.ts"
      to: "outbound-whatsapp queue"
      via: "enqueueOutboundWhatsApp from @gymos/queue (producer; never imports sendMessage)"
      pattern: "enqueueOutboundWhatsApp"
    - from: "services/worker/src/queues/heartbeat-reactivate.ts"
      to: "reactivation_attempts table"
      via: "synchronous 3/90-day COUNT check before enqueue + INSERT attempt"
      pattern: "reactivation"
    - from: "services/worker/src/queues/heartbeat-reactivate.ts"
      to: "studio_brain_docs brand-voice"
      via: "select body where id='brand-voice'; generic fallback when null"
      pattern: "brand-voice"
    - from: "services/worker/src/queues/daily-owner-digest.ts"
      to: "buildTelemetrySnapshot"
      via: "reuse existing aggregate for digest metrics"
      pattern: "buildTelemetrySnapshot"
    - from: "services/worker/src/index.ts"
      to: "daily-owner-digest + heartbeat-reactivate queues"
      via: "boss.createQueue + registerXxx in main()"
      pattern: "heartbeat-reactivate"
---

<objective>
Give each studio deploy a gym-owner Dispatcher in `services/worker`: a daily owner WhatsApp digest of the studio's own metrics, and a daily heartbeat that detects dormant members and reactivates them through the EXISTING `outbound-whatsapp` chokepoint — with a 3-attempts-per-90-day suppression ceiling and synchronous opt-out exclusion enforced from day one, and brand-voice personalization (generic fallback when GOB unseeded).

Purpose: GOD-01..05. Both jobs mirror `telemetry-push.ts` exactly (consumer-first, idempotent `boss.schedule`, unconfigured-skip). GOD is a new PRODUCER into `outbound-whatsapp` via `@gymos/queue` — `sendMessage.ts` and the gate modules (optInGate/windowGate/templateGate) are NEVER modified; all compliance gates apply unchanged at the chokepoint.

Output: two pg-boss jobs + their unit tests, worker DB mirrors for the new tables, and registration in index.ts. Live member/owner WhatsApp sends are deferred-on-external-dependency (D-15): build + unit-test now with the send mocked; live activation waits on Meta template approval (member_reactivation + owner_daily_digest).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/BD4-studio-brain-dispatcher/BD4-CONTEXT.md
@.planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md

<interfaces>
<!-- Extracted from codebase. Use these directly — no exploration needed. -->

Scheduled-job pattern — services/worker/src/queues/telemetry-push.ts (COPY THIS SHAPE):
  export async function registerTelemetryPush(boss: PgBoss): Promise<void> {
    const log = getLogger();
    await boss.work(QUEUE_NAME, async () => {
      const env = getEnv();
      if (!env.SOMETHING) { log.warn("...skipping"); return; }   // unconfigured-skip
      const db = getDb();
      ...
    });
    await boss.schedule(QUEUE_NAME, "0 2 * * *", {}, { tz: "UTC" } as any);  // idempotent
  }
  Imports: import type { PgBoss } from "pg-boss"; import { eq } from "drizzle-orm";
  import { getDb, schema } from "../lib/db.js"; import { getEnv } from "../lib/env.js";
  import { getLogger } from "../lib/logger.js";
  import { buildTelemetrySnapshot } from "../domain/buildTelemetrySnapshot.js";

pg-boss 12.18.2 schedule signature (CONFIRMED in node_modules types):
  ScheduleOptions = SendOptions & { tz?: string; key?: string };
  boss.schedule(queue, cron, data, { tz: ianaTz })  — tz is typed; `as any` optional (telemetry-push uses it).

Producer API — packages/queue/src/publish.ts + types.ts:
  import { enqueueOutboundWhatsApp } from "@gymos/queue";   // OR the workspace import path used by worker
  enqueueOutboundWhatsApp(args: OutboundWhatsAppPayload): Promise<string | null>
  OutboundWhatsAppPayload = {
    messageId: string,   // 'msg_<nanoid>' — MUST be pre-inserted in messages (status='queued') first
    memberId: string,    // gym_members.id
    payload:
      | { type: "text"; body: string }
      | { type: "template"; name: string; vars: Record<string,string>; language?: string },
  }
  singletonKey is auto-set to `outbound-whatsapp:${messageId}` (per-message dedupe).

env — services/worker/src/lib/env.ts:
  STUDIO_TIMEZONE: z.string().optional();   // already present — primary tz source
  STUDIO_ID: z.string().min(1).optional();  // for the hash(studio_id)%60 stagger

Worker DB mirror — services/worker/src/lib/db.ts:
  Postgres pg-core mirror (drizzle-orm/pg-core) of the staff-web tables the worker reads/writes.
  Already mirrors: gymMembers, conversations, messages, whatsappOptIn, whatsappTemplates,
  studioTelemetryState. Add NEW mirrors for studio_owner_config, reactivation_attempts,
  studio_brain_docs (+ class_definitions / bookings if dormancy SQL needs typed refs — raw SQL
  via db.execute() is also acceptable for the dormancy LEFT JOIN). Append to the `schema` object.
  "KEEP THIS FILE IN SYNC with apps/staff-web/server/db/schema.ts" — mirror only what GOD reads.

Chokepoint (DO NOT MODIFY) — services/worker/src/domain/sendMessage.ts:
  Gate order: opt-in → window → template-approved. Out-of-window text is REJECTED; out-of-window
  sends MUST be type:"template" with an approved name. GOD heartbeat = out-of-window by definition
  → always use payload { type:"template", name: "member_reactivation", vars }.

Opt-in storage — whatsapp_opt_in: memberId PK, optedInAt, optedOutAt (nullable; set = opted out).
  Synchronous pre-check: skip member if no row OR opted_out_at IS NOT NULL.

index.ts registration — services/worker/src/index.ts:
  Add queue names to the `for (const q of [...])` createQueue loop, then call
  registerDailyOwnerDigest(boss) + registerHeartbeatReactivate(boss) after the existing
  registerTelemetryPush(boss) line.
</interfaces>

<deferred_dependency>
D-15: LIVE owner + member WhatsApp sends are DEFERRED pending Meta approval of templates
`owner_daily_digest` and `member_reactivation`. Build + unit-test now with the send MOCKED
(vi.mock the `@gymos/queue` enqueue OR a thin domain wrapper). The chokepoint's template gate
will reject unapproved templates in production until the rows exist with status='approved' —
this is the intended deferred-activation seam. Do NOT call sendViaMyutik directly.
</deferred_dependency>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Worker DB mirrors for studio_owner_config, reactivation_attempts, studio_brain_docs</name>
  <files>services/worker/src/lib/db.ts</files>
  <read_first>
    - services/worker/src/lib/db.ts (existing pg-core mirrors + `schema` object + getDb)
    - apps/staff-web/server/db/schema.ts (the studioOwnerConfig / reactivationAttempts / studioBrainDocs defs added by BD4-01 Task 1 — mirror their columns exactly)
    - .planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md (Section 2 — column shapes; Section 4 — owner config resolution)
  </read_first>
  <action>
    BD4-01 owns the migration + Drizzle defs in staff-web (versions 16/17/18/19). This task only adds the worker-side pg-core MIRRORS so the worker can read/write them. Do NOT edit apps/staff-web here. Do NOT add any migration in the worker.

    In `services/worker/src/lib/db.ts`, using `pgTable, text, integer` from `drizzle-orm/pg-core` (already imported), append:

      export const studioOwnerConfig = pgTable("studio_owner_config", {
        id: text("id").primaryKey(),
        ownerPhoneE164: text("owner_phone_e164").notNull().default(""),
        studioTimezone: text("studio_timezone").notNull().default("Europe/London"),
        digestEnabled: integer("digest_enabled").notNull().default(1),
        heartbeatEnabled: integer("heartbeat_enabled").notNull().default(1),
        heartbeatBatchSize: integer("heartbeat_batch_size").notNull().default(50),
        createdAt: text("created_at").notNull().default(sql`now()`),
        updatedAt: text("updated_at").notNull().default(sql`now()`),
      });

      export const reactivationAttempts = pgTable("reactivation_attempts", {
        id: text("id").primaryKey(),
        memberId: text("member_id").notNull(),
        sentAt: text("sent_at").notNull().default(sql`now()`),
        createdAt: text("created_at").notNull().default(sql`now()`),
      });

      export const studioBrainDocs = pgTable("studio_brain_docs", {
        id: text("id").primaryKey(),
        docType: text("doc_type").notNull(),
        title: text("title").notNull().default(""),
        body: text("body").notNull().default(""),
        seededAt: text("seeded_at"),
        createdAt: text("created_at").notNull().default(sql`now()`),
        updatedAt: text("updated_at").notNull().default(sql`now()`),
      });

      export const classDefinitions = pgTable("class_definitions", {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        active: integer("active").notNull().default(1),
      });

      export const bookings = pgTable("bookings", {
        id: text("id").primaryKey(),
        occurrenceId: text("occurrence_id").notNull(),
        memberId: text("member_id").notNull(),
        status: text("status").notNull().default("booked"),
        bookedAt: text("booked_at").notNull().default(sql`now()`),
        attendedAt: text("attended_at"),
      });

    Add all five to the exported `schema` object literal at the bottom of the file (alongside gymMembers, conversations, messages, whatsappOptIn, studioTelemetryState, ...).
    (`integer` columns for the boolean flags use 1/0 — the worker treats `heartbeat_enabled !== 0` as enabled. `note(mode:"boolean")` is NOT used here because this file uses bare pg-core, not the core schema helper.)
  </action>
  <verify>
    <automated>cd services/worker && grep -q "studio_owner_config" src/lib/db.ts && grep -q "reactivation_attempts" src/lib/db.ts && grep -q "studio_brain_docs" src/lib/db.ts && grep -q "studioOwnerConfig" src/lib/db.ts && grep -q "reactivationAttempts" src/lib/db.ts && grep -q "studioBrainDocs" src/lib/db.ts && npx tsc --noEmit && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/lib/db.ts` contains `pgTable("studio_owner_config"`, `pgTable("reactivation_attempts"`, `pgTable("studio_brain_docs"`, `pgTable("class_definitions"`, `pgTable("bookings"`
    - The exported `schema` object contains `studioOwnerConfig`, `reactivationAttempts`, `studioBrainDocs`, `classDefinitions`, `bookings`
    - `services/worker/src/lib/db.ts` contains no `DROP`/`TRUNCATE`
    - `cd services/worker && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Worker mirrors the three new tables (plus class_definitions/bookings for dormancy) in pg-core; in the schema barrel; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Heartbeat job — dormant detection + suppression ceiling + opt-out + personalization + enqueue (mock-first) + test</name>
  <files>services/worker/src/queues/heartbeat-reactivate.ts, services/worker/src/queues/heartbeat-reactivate.test.ts</files>
  <read_first>
    - services/worker/src/queues/telemetry-push.ts (consumer-first + boss.schedule + unconfigured-skip + idempotent — COPY THIS SHAPE)
    - services/worker/src/domain/sendMessage.ts (gate order; out-of-window MUST be template; DO NOT MODIFY — read only to confirm payload shape)
    - services/worker/src/domain/gates/optInGate.ts (opt-out logic: row must exist AND opted_out_at IS NULL)
    - packages/queue/src/publish.ts + packages/queue/src/types.ts (enqueueOutboundWhatsApp + OutboundWhatsAppPayload)
    - services/worker/src/lib/db.ts (mirrors from Task 1; messages/conversations/gymMembers shapes)
    - .planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md (Sections 5, 6, 7 — dormancy SQL, suppression SQL, conversation/messages pre-insert, brand-voice read, Pitfalls 2/3)
  </read_first>
  <action>
    Create `services/worker/src/queues/heartbeat-reactivate.ts`. Mirror telemetry-push.ts exactly (consumer-first → boss.schedule). Imports: `import type { PgBoss } from "pg-boss"; import { sql, eq, and } from "drizzle-orm"; import { nanoid } from "nanoid"; import { getDb, schema } from "../lib/db.js"; import { getEnv } from "../lib/env.js"; import { getLogger } from "../lib/logger.js"; import { enqueueOutboundWhatsApp } from "@gymos/queue";`

    Named constants at top:
      const HEARTBEAT_QUEUE = "heartbeat-reactivate";
      const DORMANCY_DAYS = 30;                  // dormant = no attended/booked class in 30 days
      const SUPPRESSION_MAX = 3;                 // max attempts...
      const SUPPRESSION_WINDOW_DAYS = 90;        // ...per rolling 90-day window (GOD-04, day one)
      const REACTIVATION_TEMPLATE = "member_reactivation";  // pending Meta approval (D-15)

    Stagger (roadmap decision W-02): compute a deterministic minute offset so studios don't all fire at 09:00.
      function simpleHash(s: string): number { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
      const minuteOffset = simpleHash(getEnv().STUDIO_ID ?? "default") % 60;
      const cron = `${minuteOffset} 9 * * *`;

    registerHeartbeatReactivate(boss):
      await boss.work(HEARTBEAT_QUEUE, async () => {
        const db = getDb();
        // 1. Read studio_owner_config singleton; if missing OR heartbeat_enabled === 0 → unconfigured-skip (log.warn, return).
        // 2. Dormant detection (deterministic SQL, no LLM). Use raw db.execute(sql`...`) — LEFT JOIN per RESEARCH Section 6:
        //    SELECT gm.id AS member_id FROM gym_members gm
        //      LEFT JOIN bookings b ON b.member_id = gm.id
        //        AND b.status IN ('attended','booked')
        //        AND b.booked_at >= (NOW() - (${DORMANCY_DAYS} || ' days')::interval)
        //      LEFT JOIN whatsapp_opt_in woi ON woi.member_id = gm.id AND woi.opted_out_at IS NULL
        //     WHERE b.id IS NULL AND woi.member_id IS NOT NULL AND gm.phone_e164 IS NOT NULL
        //     GROUP BY gm.id
        //     LIMIT ${batchSize}
        //    (batchSize = ownerConfig.heartbeatBatchSize ?? 50)
        // 3. Read brand-voice once: select body from studio_brain_docs where id='brand-voice'; brandVoice = row?.body || null (GOD-05).
        // 4. For each dormant member:
        //    a. SUPPRESSION CHECK (synchronous, BEFORE enqueue — GOD-04 day one):
        //       SELECT COUNT(*) FROM reactivation_attempts WHERE member_id=? AND sent_at >= (NOW() - INTERVAL '90 days')
        //       if count >= SUPPRESSION_MAX → skip (continue).
        //    b. OPT-OUT CHECK (defense in depth, synchronous): SELECT opted_out_at FROM whatsapp_opt_in WHERE member_id=?
        //       skip if no row OR opted_out_at IS NOT NULL. (The dormancy SQL already filters opted-out, but re-check.)
        //    c. Find or create conversation: SELECT id FROM conversations WHERE member_id=? AND channel='whatsapp' LIMIT 1;
        //       if none, INSERT a conversations row (status='closed') with nanoid id.
        //    d. const messageId = `msg_${nanoid()}`;
        //       INSERT messages (id=messageId, conversation_id, direction='out', message_type='template', status='queued', body=null, created_at=now()).
        //    e. INSERT reactivation_attempts (id=nanoid(), member_id, sent_at=now()).  // counted in same path that enqueues (D-12)
        //    f. const vars = buildReactivationVars(brandVoice);  // GOD-05 personalization with generic fallback
        //       try { await enqueueOutboundWhatsApp({ messageId, memberId, payload: { type:'template', name: REACTIVATION_TEMPLATE, vars } }); }
        //       catch (err) { // rollback the attempt row so a failed enqueue doesn't leave a ghost (RESEARCH Section 5)
        //         await db.delete(schema.reactivationAttempts).where(eq(schema.reactivationAttempts.id, attemptId)); throw err; }
        // 5. log.info counts (dormant found, sent, suppressed, optedOut).
      });
      await boss.schedule(HEARTBEAT_QUEUE, cron, {}, { tz: getEnv().STUDIO_TIMEZONE ?? "Europe/London" } as any);

    Export a PURE helper for unit testing the day-one safety + personalization logic without a DB:
      export function isSuppressed(attemptCount: number): boolean { return attemptCount >= SUPPRESSION_MAX; }
      export function isExcludedOptOut(row: { optedOutAt: string | null } | undefined): boolean { return !row || row.optedOutAt != null; }
      export function buildReactivationVars(brandVoice: string | null): Record<string,string> {
        // brandVoice present → studio-voice greeting var; null → generic fallback (GOD-05). No member PII in vars.
        return { "1": brandVoice ? deriveGreeting(brandVoice) : "We miss you at the studio!" };
      }
    Keep `deriveGreeting` deterministic (e.g. first non-empty line of brandVoice, trimmed/truncated) — NO LLM (out-of-window template constraint + auditability).

    DO NOT import or modify sendMessage.ts or any gate module. The CI no-worker-import discipline (BD3 established a guard for HQD) applies in spirit: this file enqueues only.

    Create `services/worker/src/queues/heartbeat-reactivate.test.ts` (Vitest, services/worker/vitest.config.ts already exists). Cover GOD-04 + GOD-05 deterministically via the pure helpers:
      - isSuppressed(2) === false; isSuppressed(3) === true; isSuppressed(4) === true.  (3/90 ceiling)
      - isExcludedOptOut(undefined) === true (no opt-in row → excluded)
      - isExcludedOptOut({ optedOutAt: "2026-01-01" }) === true (opted out → excluded)
      - isExcludedOptOut({ optedOutAt: null }) === false (opted in, active → included)
      - buildReactivationVars(null) returns the generic fallback string in var "1"
      - buildReactivationVars("Energetic, friendly...") returns a non-generic, brand-derived var "1"
  </action>
  <verify>
    <automated>cd services/worker && grep -q "boss.schedule(HEARTBEAT_QUEUE" src/queues/heartbeat-reactivate.ts && grep -q "tz:" src/queues/heartbeat-reactivate.ts && grep -q "enqueueOutboundWhatsApp" src/queues/heartbeat-reactivate.ts && grep -q "reactivationAttempts" src/queues/heartbeat-reactivate.ts && grep -q "brand-voice" src/queues/heartbeat-reactivate.ts && ! grep -q "sendMessage" src/queues/heartbeat-reactivate.ts && npx vitest run src/queues/heartbeat-reactivate.test.ts && npx tsc --noEmit && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/queues/heartbeat-reactivate.ts` contains `boss.schedule(HEARTBEAT_QUEUE`, `tz:`, `enqueueOutboundWhatsApp`, `reactivationAttempts`, `brand-voice`, `DORMANCY_DAYS`, `SUPPRESSION_MAX = 3`, `SUPPRESSION_WINDOW_DAYS = 90`, `simpleHash`
    - `services/worker/src/queues/heartbeat-reactivate.ts` does NOT contain the string `sendMessage` and does NOT import from `../domain/gates/` (grep returns nothing)
    - payload uses `type: 'template'` with name `member_reactivation` (NOT type:'text') — confirms out-of-window Meta compliance
    - `npx vitest run src/queues/heartbeat-reactivate.test.ts` exits 0 with all isSuppressed/isExcludedOptOut/buildReactivationVars cases passing
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Heartbeat detects dormant members deterministically, enforces 3/90 suppression + synchronous opt-out exclusion from day one, personalizes from brand-voice with generic fallback, enqueues via the chokepoint producer without touching sendMessage; pure-helper tests green; tsc clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Daily owner digest job + index.ts registration (mock-first)</name>
  <files>services/worker/src/queues/daily-owner-digest.ts, services/worker/src/queues/daily-owner-digest.test.ts, services/worker/src/index.ts</files>
  <read_first>
    - services/worker/src/queues/telemetry-push.ts (consumer-first + boss.schedule + unconfigured-skip + buildTelemetrySnapshot reuse)
    - services/worker/src/domain/buildTelemetrySnapshot.ts (signature: buildTelemetrySnapshot(db, studioId, state) → snapshot with activeMembers/bookings/etc.)
    - services/worker/src/index.ts (createQueue loop + registerXxx call sequence in main())
    - services/worker/src/lib/db.ts (studioOwnerConfig + gymMembers + messages mirrors from Task 1)
    - .planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md (Section 3 — digest job; Open Questions 1 (skip LLM, send numeric metrics) + 2 (owner gym_members row resolution))
  </read_first>
  <action>
    Create `services/worker/src/queues/daily-owner-digest.ts`. Mirror telemetry-push.ts. Imports same set as telemetry-push plus `import { enqueueOutboundWhatsApp } from "@gymos/queue"; import { nanoid } from "nanoid";` and `import { buildTelemetrySnapshot } from "../domain/buildTelemetrySnapshot.js";`

    Constants:
      const DIGEST_QUEUE = "daily-owner-digest";
      const DIGEST_TEMPLATE = "owner_daily_digest";   // pending Meta approval (D-15)

    registerDailyOwnerDigest(boss):
      await boss.work(DIGEST_QUEUE, async () => {
        const env = getEnv();
        const db = getDb();
        // 1. Read studio_owner_config singleton. Unconfigured-skip if missing, digest_enabled===0, or owner_phone_e164 === '' (log.warn, return).
        // 2. Read studio_telemetry_state singleton (same as telemetry-push). If missing → skip.
        // 3. Build metrics: const snap = await buildTelemetrySnapshot(db, env.STUDIO_ID ?? 'studio', state);
        //    Per RESEARCH Open Question 1: SKIP LLM in BD4 — send a STRUCTURED NUMERIC digest. Assemble template vars
        //    from snap numbers only (e.g. activeMembers, bookings, retentionRate). NO member PII, NO names.
        // 4. Resolve owner member row (RESEARCH Open Question 2): SELECT id FROM gym_members WHERE phone_e164 = ownerConfig.ownerPhoneE164 LIMIT 1.
        //    If found → use that memberId. If NOT found → unconfigured-skip (log.warn that owner has no gym_members row; do NOT
        //    auto-create here — document as a one-time provisioning/manual seed step). messages.member look-up in sendMessage
        //    needs the member's phone, which the owner row provides.
        // 5. const messageId = `msg_${nanoid()}`;
        //    Find or create the owner's conversations row (channel='whatsapp'); INSERT messages (status='queued', message_type='template').
        // 6. const vars = buildDigestVars(snap);  // numeric-only
        //    await enqueueOutboundWhatsApp({ messageId, memberId: ownerMemberId, payload: { type:'template', name: DIGEST_TEMPLATE, vars } });
      });
      // Schedule daily at 06:00 studio timezone (distinct from telemetry-push 02:00 UTC and heartbeat 09:00).
      const tz = getEnv().STUDIO_TIMEZONE ?? "Europe/London";
      await boss.schedule(DIGEST_QUEUE, "0 6 * * *", {}, { tz } as any);

    Export a pure helper for the test:
      export function buildDigestVars(snap: { activeMembers?: number; bookings?: number; retentionRate?: number }): Record<string,string> {
        return {
          "1": String(snap.activeMembers ?? 0),
          "2": String(snap.bookings ?? 0),
          "3": `${Math.round((snap.retentionRate ?? 0) * 100)}%`,
        };
      }
    (Adjust var keys/labels to the actual buildTelemetrySnapshot field names confirmed in read_first — keep it numeric-only, no PII.)

    DO NOT import or modify sendMessage.ts. Enqueue only.

    Register in `services/worker/src/index.ts`:
      - Add `"daily-owner-digest"` and `"heartbeat-reactivate"` to the `for (const q of [...])` createQueue loop.
      - import { registerDailyOwnerDigest } from "./queues/daily-owner-digest.js";
        import { registerHeartbeatReactivate } from "./queues/heartbeat-reactivate.js";
      - After the existing `await registerTelemetryPush(boss);` line, add:
          await registerDailyOwnerDigest(boss);  log.info("[worker] daily-owner-digest registered");
          await registerHeartbeatReactivate(boss); log.info("[worker] heartbeat-reactivate registered");

    Create `services/worker/src/queues/daily-owner-digest.test.ts` covering GOD-01 numeric digest assembly:
      - buildDigestVars({ activeMembers: 18, bookings: 42, retentionRate: 0.72 }) → { "1":"18", "2":"42", "3":"72%" }
      - buildDigestVars({}) → { "1":"0", "2":"0", "3":"0%" } (safe defaults, no PII, no NaN)
  </action>
  <verify>
    <automated>cd services/worker && grep -q "boss.schedule(DIGEST_QUEUE" src/queues/daily-owner-digest.ts && grep -q "buildTelemetrySnapshot" src/queues/daily-owner-digest.ts && grep -q "enqueueOutboundWhatsApp" src/queues/daily-owner-digest.ts && ! grep -q "sendMessage" src/queues/daily-owner-digest.ts && grep -q "registerHeartbeatReactivate" src/index.ts && grep -q "registerDailyOwnerDigest" src/index.ts && grep -q "daily-owner-digest" src/index.ts && grep -q "heartbeat-reactivate" src/index.ts && npx vitest run src/queues/daily-owner-digest.test.ts && npx tsc --noEmit && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/queues/daily-owner-digest.ts` contains `boss.schedule(DIGEST_QUEUE`, `"0 6 * * *"`, `buildTelemetrySnapshot`, `enqueueOutboundWhatsApp`, `owner_daily_digest`, `export function buildDigestVars`
    - daily-owner-digest.ts does NOT contain `sendMessage` and uses `type: 'template'` (no member/owner PII in vars — numeric only)
    - `services/worker/src/index.ts` contains `"daily-owner-digest"` and `"heartbeat-reactivate"` in the createQueue loop AND `registerDailyOwnerDigest(boss)` + `registerHeartbeatReactivate(boss)` calls
    - `npx vitest run src/queues/daily-owner-digest.test.ts` exits 0
    - `cd services/worker && npx tsc --noEmit` exits 0 and `npx vitest run` (full worker suite) exits 0
  </acceptance_criteria>
  <done>Daily owner digest job (06:00 studio tz) reuses buildTelemetrySnapshot, sends numeric-only metrics via the chokepoint producer (LLM deferred), resolves the owner gym_members row or skips; both jobs registered in index.ts; digest var test green; full worker tsc + vitest clean.</done>
</task>

</tasks>

<verification>
- `cd services/worker && npx tsc --noEmit` exits 0
- `cd services/worker && npx vitest run` exits 0 (heartbeat + digest tests + existing suite)
- Both jobs use `boss.schedule(..., { tz })` (heartbeat 09:00 staggered studio tz; digest 06:00 studio tz)
- Heartbeat enforces 3/90 suppression + synchronous opt-out exclusion (pure-helper tests) and personalizes from brand-voice with generic fallback
- `grep -L sendMessage` confirms NEITHER new queue file imports or references domain/sendMessage; sendMessage.ts is NOT in files_modified
- index.ts registers daily-owner-digest + heartbeat-reactivate queues + handlers
</verification>

<success_criteria>
GOD-01: daily owner digest via existing chokepoint (numeric metrics, LLM deferred). GOD-02: heartbeat pg-boss schedule at 09:00 studio IANA tz (staggered) with deterministic dormant detection. GOD-03: reactivation enqueued into outbound-whatsapp; sendMessage.ts unmodified. GOD-04: 3-attempts/90-day suppression ceiling + synchronous opt-out exclusion from day one. GOD-05: brand-voice personalization with generic fallback when GOB unseeded. All live sends mock-first/deferred-on-external-dependency per D-15.
</success_criteria>

<output>
After completion, create `.planning/phases/BD4-studio-brain-dispatcher/BD4-02-SUMMARY.md`
</output>
