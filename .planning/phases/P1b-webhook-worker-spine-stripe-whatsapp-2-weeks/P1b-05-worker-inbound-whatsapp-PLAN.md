---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - apps/worker/package.json
  - apps/worker/tsconfig.json
  - apps/worker/src/index.ts
  - apps/worker/src/boss.ts
  - apps/worker/src/lib/db.ts
  - apps/worker/src/lib/env.ts
  - apps/worker/src/lib/errors.ts
  - apps/worker/src/lib/logger.ts
  - apps/worker/src/queues/inbound-whatsapp.ts
  - apps/worker/src/domain/conversations.ts
  - apps/worker/src/domain/messageStatus.ts
  - apps/worker/src/domain/conversations.test.ts
  - apps/worker/src/domain/messageStatus.test.ts
autonomous: false
requirements: [WEB-04, WEB-05, WA-03, WA-04]
must_haves:
  truths:
    - "apps/worker boots pg-boss using DATABASE_URL_UNPOOLED — same Neon project as edge-webhooks but unpooled hostname (PITFALL #1)"
    - "pgboss.* schema is created automatically on first boss.start() (D-16)"
    - "inbound-whatsapp queue handler concurrency=5 (D-14); processes inbound messages AND status updates from a typed InboundWhatsAppPayload discriminated union (HIGH #6)"
    - "Inbound message handler upserts conversations.last_inbound_at + appends to messages (WA-03). messages INSERT uses .onConflictDoNothing({ target: schema.messages.externalId }) for race-safety under concurrency=5 (HIGH #4 — partial UNIQUE index from Plan 02 backs this)"
    - "Status webhook handler reads payload.statusFor + payload.newStatus + payload.timestamp + payload.errorCode directly from the structured payload — no synthetic externalId concat parsing (HIGH #6)"
    - "Status webhook handler uses ordinal-guarded UPDATE: status only moves forward (queued < sent < delivered < read; failed terminal) — never downgrades (PITFALL #11, WA-04). UPDATE sets updated_at = NOW() (column added by Plan 02 Blocker #2 fix)"
    - "Worker marks webhook_events.processed_at on successful handle; failed handles stay processed_at NULL for pg-boss retry"
    - "Worker /healthz exposed on internal_port 3002 — Fly's worker process check (MEDIUM #10) probes this endpoint"
    - "Replaying same WA inbound payload twice → exactly 1 messages row (success criterion #2)"
  artifacts:
    - path: "apps/worker/src/queues/inbound-whatsapp.ts"
      provides: "pg-boss handler for inbound-whatsapp queue — concurrency=5, dispatches on payload.kind to message materialiser OR status updater (HIGH #6)"
      contains: "boss.work"
    - path: "apps/worker/src/domain/conversations.ts"
      provides: "upsertConversationAndMessage helper — idempotent on messages.external_id via onConflictDoNothing (HIGH #4 + WA-03)"
      exports: ["upsertConversationAndMessage"]
    - path: "apps/worker/src/domain/messageStatus.ts"
      provides: "applyOrdinalStatusUpdate — single SQL UPDATE with rank guard, never downgrades; writes updated_at = NOW() (WA-04, PITFALL #11, Blocker #2 — updated_at column added by Plan 02)"
      exports: ["applyOrdinalStatusUpdate", "STATUS_RANK"]
    - path: "apps/worker/src/index.ts"
      provides: "Worker entrypoint — env validate + boss.start + register all queues + Hono /healthz on internal_port 3002 (replaces Plan 04 stub; same endpoint contract per MEDIUM #10)"
      contains: "boss.start()"
  key_links:
    - from: "apps/worker/src/boss.ts"
      to: "process.env.DATABASE_URL_UNPOOLED"
      via: "PgBoss connectionString reads unpooled URL; throws on -pooler"
      pattern: "DATABASE_URL_UNPOOLED"
    - from: "apps/worker/src/queues/inbound-whatsapp.ts"
      to: "apps/worker/src/domain/conversations.ts and messageStatus.ts"
      via: "switch on data.kind ('message' | 'status') → either upsertConversationAndMessage OR applyOrdinalStatusUpdate (HIGH #6)"
      pattern: "data\\.kind"
    - from: "apps/worker/src/domain/conversations.ts"
      to: "messages.external_id partial UNIQUE index"
      via: ".onConflictDoNothing({ target: schema.messages.externalId }) — race-safe insert (HIGH #4)"
      pattern: "onConflictDoNothing.*externalId"
    - from: "apps/worker/src/domain/messageStatus.ts"
      to: "STATUS_RANK ordering"
      via: "CASE status WHEN 'queued' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4"
      pattern: "STATUS_RANK"
    - from: "apps/worker/src/domain/messageStatus.ts UPDATE"
      to: "messages.updated_at column"
      via: "SET updated_at = NOW() in the same UPDATE (Plan 02 Blocker #2 — column added)"
      pattern: "updated_at\\s*=\\s*NOW\\(\\)"
---

<objective>
Build the worker tier of P1b: `apps/worker/` runs pg-boss subscribers against the same Neon DB as edge-webhooks (but via UNPOOLED endpoint). This plan ships the worker bootstrap + the **inbound** WhatsApp queue handler. The handler dispatches on the structured `InboundWhatsAppPayload` discriminated union (HIGH #6): `kind='message'` → materialise conversation + message; `kind='status'` → ordinal-guarded status UPDATE. Messages INSERT uses `.onConflictDoNothing({ target: schema.messages.externalId })` for race-safety under concurrency=5 (HIGH #4 — backed by Plan 02's partial UNIQUE index). Status UPDATE writes `updated_at = NOW()` to the column Plan 02 adds (Blocker #2). Worker /healthz on port 3002 (MEDIUM #10).

Outbound `sendMessage` chokepoint ships in Plan 06; Stripe reducers in Plan 07.

Purpose: WEB-04 (worker on Fly with pg-boss), WEB-05 (idempotent processing), WA-03 (materialise conversations + messages, dedup on messages.external_id — handled at INSERT level via onConflictDoNothing), WA-04 (ordinal-guarded status updates).
Output: Worker process boots on Fly's worker process slot, drains inbound-whatsapp queue, materialises conversations/messages. Status updates never downgrade. Concurrent inbound inserts on the same wamid never produce duplicate rows.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@templates/mail/app/routes/webhooks.whatsapp.tsx
@apps/staff-web/server/db/schema.ts
@apps/edge-webhooks/src/lib/db.ts
@apps/edge-webhooks/src/lib/env.ts
@apps/edge-webhooks/fly.toml
@packages/queue/src/index.ts
@packages/queue/src/types.ts
@CLAUDE.md
@AGENTS.md

<interfaces>
<!-- pg-boss work() API per RESEARCH §"Pattern 4" -->

boss.work(queueName, options, handler)
  options: { teamSize, teamConcurrency }
  handler: async ([job]) => { /* process job.data */ }

<!-- HIGH #6: Inbound queue payload is a discriminated union (from @gymos/queue InboundWhatsAppPayload) -->
type InboundWhatsAppPayload =
  | { kind: "message"; externalId: string; from: string; messageType: string; body?: string; timestamp?: string }
  | { kind: "status"; statusFor: string; newStatus: "sent"|"delivered"|"read"|"failed"; timestamp: string; errorCode?: string };

<!-- webhook_events row shape (apps/staff-web/server/db/schema.ts) -->
{ id, provider, eventType, externalId, payloadRaw, receivedAt, processedAt, error }

<!-- messages columns post-Plan-02 (relevant for this plan) -->
- id, conversationId, externalId (partial UNIQUE WHERE NOT NULL — HIGH #4)
- direction, messageType, body, payload
- status, error, error_code (NEW from Plan 02)
- createdAt, sentAt, deliveredAt, readAt, updatedAt (NEW from Plan 02 Blocker #2)

<!-- Ordinal status ranking (RESEARCH §"Pattern 5", PITFALL #11) -->
queued: 0
sent: 1
delivered: 2
read: 3
failed: 4 (terminal — but allow transition from any non-failed to failed)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Replace apps/worker/ stub with real bootstrap — env, db, boss, errors, logger; preserve /healthz on port 3002</name>
  <files>apps/worker/package.json, apps/worker/tsconfig.json, apps/worker/src/index.ts, apps/worker/src/boss.ts, apps/worker/src/lib/db.ts, apps/worker/src/lib/env.ts, apps/worker/src/lib/errors.ts, apps/worker/src/lib/logger.ts</files>
  <read_first>
    - apps/worker/package.json (current stub from Plan 04 Task 3)
    - apps/worker/src/index.ts (current Plan 04 stub — already binds /healthz on port 3002; preserve this endpoint contract per MEDIUM #10)
    - apps/edge-webhooks/src/lib/env.ts (env schema pattern to copy)
    - apps/edge-webhooks/src/lib/db.ts (Drizzle setup pattern to copy)
    - apps/edge-webhooks/fly.toml (worker [[services]] block — confirms internal_port 3002 + /healthz check)
    - packages/queue/src/boss.ts (getBoss singleton — worker may import OR mirror; D-12 allows publisher import)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 4" + §"Worker entrypoint" lines 826-885
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-14 concurrency profile)
    - CLAUDE.md (TypeScript everywhere; Node 22+)
  </read_first>
  <behavior>
    - env.ts: same shape as edge-webhooks but requires DATABASE_URL_UNPOOLED (worker is the heavy pg-boss user)
    - env.ts: also requires WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (for Plan 06 sendMessage), STRIPE_SECRET_KEY (for Plan 07 Stripe reducers), PGCRYPTO_MASTER_KEY (for Plan 07 secret reads). All optional in P1b boot (loaded but not yet consumed in Plan 05).
    - db.ts: same Drizzle setup as edge-webhooks but uses DATABASE_URL_UNPOOLED (since worker shares connection pool with pg-boss process)
    - boss.ts: imports getBoss from @gymos/queue (single source of truth — D-12)
    - errors.ts: exports typed error classes NoOptInError, WindowExpiredError, TemplateNotApprovedError (Plan 06 consumes; defined here so file structure stable)
    - logger.ts: exports Pino instance with sensible defaults (full PII redaction deferred to OBS-01/P1a)
    - index.ts: env validate → boss.start() → register all queue workers → mount Hono /healthz on PORT 3002 (replaces Plan 04 stub but keeps the same endpoint shape so the fly.toml worker check from Plan 04 continues to pass — MEDIUM #10)
  </behavior>
  <action>
    Concrete steps:

    1. Overwrite `apps/worker/package.json` with full dependencies:
       ```json
       {
         "name": "@gymos/worker",
         "version": "0.1.0",
         "private": true,
         "type": "module",
         "scripts": {
           "dev": "tsx watch src/index.ts",
           "build": "tsc -p tsconfig.json",
           "start": "node dist/index.js",
           "typecheck": "tsc --noEmit",
           "test": "vitest run"
         },
         "dependencies": {
           "@gymos/queue": "workspace:*",
           "@gymos/whatsapp": "workspace:*",
           "@hono/node-server": "^1.13.0",
           "@neondatabase/serverless": "^1.1.0",
           "date-fns": "^4.1.0",
           "drizzle-orm": "^0.45.0",
           "hono": "^4.6.0",
           "nanoid": "^5.1.0",
           "pg": "^8.13.0",
           "pg-boss": "^12.18.0",
           "pino": "^9.5.0",
           "stripe": "^19.0.0",
           "ws": "^8.18.0",
           "zod": "^4.0.0"
         },
         "devDependencies": {
           "@types/node": "^22.0.0",
           "@types/pg": "^8.11.0",
           "@types/ws": "^8.5.0",
           "tsx": "catalog:",
           "typescript": "catalog:",
           "vitest": "^2.0.0"
         },
         "engines": { "node": ">=22" }
       }
       ```

    2. `apps/worker/tsconfig.json` — same shape as apps/edge-webhooks/tsconfig.json (with the same paths mapping for `@staff-web-schema/*`).

    3. Create `apps/worker/src/lib/env.ts`:
       ```ts
       import { z } from "zod";

       const EnvSchema = z.object({
         // DB (worker MUST use unpooled — pg-boss requires LISTEN/NOTIFY + advisory locks)
         DATABASE_URL_UNPOOLED: z
           .string()
           .url()
           .refine((u) => !u.includes("-pooler"), {
             message: "DATABASE_URL_UNPOOLED must not include -pooler (PITFALL #1)",
           }),

         // WhatsApp (Plan 06 sendMessage chokepoint)
         WHATSAPP_ACCESS_TOKEN: z.string().min(8),
         WHATSAPP_PHONE_NUMBER_ID: z.string().min(4),

         // Stripe (Plan 07 reducers)
         STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/),

         // pgcrypto master key (Plan 07 secrets read)
         PGCRYPTO_MASTER_KEY: z.string().min(16),

         // Runtime
         PORT: z.coerce.number().int().positive().default(3002),
         GIT_SHA: z.string().optional().default("dev"),
         NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
         LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
       });

       export type Env = z.infer<typeof EnvSchema>;

       let _env: Env | undefined;
       export function getEnv(): Env {
         if (_env) return _env;
         const parsed = EnvSchema.safeParse(process.env);
         if (!parsed.success) {
           console.error("[worker env] validation failed:", parsed.error.flatten().fieldErrors);
           throw new Error("Invalid worker env");
         }
         _env = parsed.data;
         return _env;
       }
       ```

    4. Create `apps/worker/src/lib/db.ts`:
       ```ts
       import { drizzle } from "drizzle-orm/neon-serverless";
       import { Pool, neonConfig } from "@neondatabase/serverless";
       import ws from "ws";
       import { getEnv } from "./env.js";
       import * as schema from "../../../staff-web/server/db/schema.js";

       neonConfig.webSocketConstructor = ws;

       let _db: ReturnType<typeof drizzle> | undefined;
       export function getDb() {
         if (_db) return _db;
         const env = getEnv();
         // Worker uses UNPOOLED endpoint — shared with pg-boss
         const pool = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED });
         _db = drizzle(pool, { schema });
         return _db;
       }

       export { schema };
       ```

    5. Create `apps/worker/src/boss.ts`:
       ```ts
       import { getBoss } from "@gymos/queue";
       export { getBoss };
       ```

    6. Create `apps/worker/src/lib/errors.ts`:
       ```ts
       /**
        * Typed errors for the sendMessage chokepoint (Plan 06).
        * Defined in Plan 05 so the file structure is stable across plans.
        */

       export class NoOptInError extends Error {
         readonly code = "NO_OPT_IN" as const;
         constructor(public readonly memberId: string) {
           super(`Member ${memberId} has no whatsapp_opt_in record`);
           this.name = "NoOptInError";
         }
       }

       export class WindowExpiredError extends Error {
         readonly code = "WINDOW_EXPIRED" as const;
         constructor(
           public readonly memberId: string,
           public readonly lastInboundAt: Date | null,
         ) {
           super(
             `24h window expired for member ${memberId} (lastInboundAt=${lastInboundAt?.toISOString() ?? "null"}) — template send required`,
           );
           this.name = "WindowExpiredError";
         }
       }

       export class TemplateNotApprovedError extends Error {
         readonly code = "TEMPLATE_NOT_APPROVED" as const;
         constructor(public readonly templateName: string) {
           super(`Template '${templateName}' is not approved in whatsapp_templates`);
           this.name = "TemplateNotApprovedError";
         }
       }
       ```

    7. Create `apps/worker/src/lib/logger.ts`:
       ```ts
       import pino from "pino";
       import { getEnv } from "./env.js";

       let _logger: pino.Logger | undefined;
       export function getLogger(): pino.Logger {
         if (_logger) return _logger;
         const env = getEnv();
         _logger = pino({
           level: env.LOG_LEVEL,
           // Full PII redaction config is OBS-01 / P1a; minimal defaults here.
           // P1a will add: redact: ["msg.payload.from", "msg.body", "*.access_token"]
         });
         return _logger;
       }
       ```

    8. Create `apps/worker/src/index.ts` — preserves /healthz on port 3002 (MEDIUM #10 — fly.toml worker check probes this):
       ```ts
       import { serve } from "@hono/node-server";
       import { Hono } from "hono";
       import { getBoss } from "./boss.js";
       import { getEnv } from "./lib/env.js";
       import { getLogger } from "./lib/logger.js";
       import { registerInboundWhatsAppWorker } from "./queues/inbound-whatsapp.js";

       async function main() {
         const env = getEnv();
         const log = getLogger();
         log.info({ version: env.GIT_SHA }, "[worker] booting");

         const boss = getBoss();
         boss.on("error", (err) => log.error({ err }, "[pgboss] error"));

         await boss.start();
         log.info("[pgboss] started — schema migration auto-applied");

         await registerInboundWhatsAppWorker(boss);
         log.info("[worker] inbound-whatsapp queue registered");

         // Tiny admin/healthz HTTP for Fly health checks (MEDIUM #10).
         // MUST listen on PORT 3002 — fly.toml [[services]] for the worker
         // process targets internal_port=3002 and probes /healthz. Plan 04's
         // stub bound the same endpoint; we replace the stub here but keep
         // the contract identical so the live check stays passing.
         const admin = new Hono();
         admin.get("/healthz", (c) =>
           c.json({ ok: true, version: env.GIT_SHA, app: "worker" }),
         );

         serve({ fetch: admin.fetch, port: env.PORT }, (info) => {
           log.info({ port: info.port }, "[worker] admin healthz listening");
         });
       }

       main().catch((err) => {
         console.error("[worker] fatal", err);
         process.exit(1);
       });
       ```
       NOTE: registerInboundWhatsAppWorker is implemented in Task 2 — keep this import to fail clearly if missing.

    9. Run `pnpm install` at repo root.
    10. Run `pnpm --filter @gymos/worker typecheck` — must exit 0 (will fail until Task 2 creates registerInboundWhatsAppWorker). Acceptable for this task alone if only that one import is missing — Task 2 fixes it.

       Workaround for typecheck pass in this task: temporarily comment out the `registerInboundWhatsAppWorker` import + call in index.ts; Task 2 uncomments them.

    11. Run `npx prettier --write apps/worker/**/*.{ts,json}`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker typecheck 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/package.json` contains `"name": "@gymos/worker"` AND `"pg-boss"`, `"@gymos/queue"`, `"pino"`, `"drizzle-orm"` in deps
    - `apps/worker/src/lib/env.ts` contains string `DATABASE_URL_UNPOOLED` AND `!u.includes("-pooler")` (the guard)
    - `apps/worker/src/lib/env.ts` contains string `PORT: z.coerce.number().int().positive().default(3002)` (MEDIUM #10 — worker /healthz must bind on 3002)
    - `apps/worker/src/lib/db.ts` contains string `DATABASE_URL_UNPOOLED` (uses unpooled URL for the Drizzle Pool too — workers share the unpooled endpoint)
    - `apps/worker/src/lib/errors.ts` contains `class NoOptInError extends Error`
    - `apps/worker/src/lib/errors.ts` contains `class WindowExpiredError extends Error`
    - `apps/worker/src/lib/errors.ts` contains `class TemplateNotApprovedError extends Error`
    - `apps/worker/src/index.ts` contains string `await boss.start()`
    - `apps/worker/src/index.ts` contains string `/healthz` (MEDIUM #10 — same endpoint as Plan 04 stub)
    - `pnpm --filter @gymos/worker typecheck` exits 0 (with Task 2 import commented if needed; uncomment in Task 2)
  </acceptance_criteria>
  <done>Worker bootstrap files in place; env + db + boss + logger + errors all wired; index.ts boots boss + admin /healthz on port 3002 (preserves Plan 04 fly.toml check contract). Queue handlers added in Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement inbound-whatsapp queue handler + domain helpers (HIGH #6 structured payload + HIGH #4 race-safe insert + Blocker #2 updated_at)</name>
  <files>apps/worker/src/queues/inbound-whatsapp.ts, apps/worker/src/domain/conversations.ts, apps/worker/src/domain/messageStatus.ts, apps/worker/src/domain/conversations.test.ts, apps/worker/src/domain/messageStatus.test.ts</files>
  <read_first>
    - templates/mail/app/routes/webhooks.whatsapp.tsx (demo's conversation upsert pattern at lines 124-167 — port to worker)
    - apps/staff-web/server/db/schema.ts (conversations, messages, gymMembers shapes — for the upsert). VERIFY: messages.updated_at column exists (Plan 02 must have added it — if not, this task fails)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 5: Ordinal-Guarded Status Updates" lines 920-960
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #11
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-14 concurrency=5 for inbound-whatsapp)
    - packages/queue/src/types.ts (InboundWhatsAppPayload discriminated union — HIGH #6)
    - apps/worker/src/lib/db.ts (getDb + schema imports — created in Task 1)
    - apps/worker/src/lib/logger.ts (logger pattern)
  </read_first>
  <behavior>
    - registerInboundWhatsAppWorker(boss) calls boss.work("inbound-whatsapp", { teamSize: 5, teamConcurrency: 5 }, handler)
    - handler dispatches on payload.kind ("message" | "status") — HIGH #6, NOT on a deprecated isStatus flag
    - For kind="message": looks up webhook_events row by (provider=whatsapp, externalId=data.externalId), parses payloadRaw, finds the matching msg, calls upsertConversationAndMessage(db, msg, raw). (The webhook_events lookup is still useful to know what raw payload to write into messages.payload; if missing, we synthesise from the structured payload fields.)
    - For kind="status": no payloadRaw parsing needed — calls applyOrdinalStatusUpdate(db, data.statusFor, data.newStatus, data.timestamp, data.errorCode). Reads structured fields directly (HIGH #6 — no reconstruction of a synthetic externalId concat string).
    - On successful handle: UPDATE webhook_events SET processed_at = NOW() WHERE id = ... (only for the row this job corresponds to)
    - On error: let pg-boss retry (don't mark processed); error is logged
    - upsertConversationAndMessage: looks up member by phoneE164; if no member, log warn + skip (P1b parity with demo — WA-03's "stub member" is deferred since CONTEXT doesn't lock it in); upserts conversations.last_inbound_at + unread_count + last_message_preview; INSERT messages row with externalId AND .onConflictDoNothing({ target: schema.messages.externalId }) (HIGH #4 — backed by Plan 02's partial UNIQUE index — race-safe under concurrency=5)
    - applyOrdinalStatusUpdate: single SQL UPDATE with rank guard via CASE expression; STATUS_RANK = {queued:0, sent:1, delivered:2, read:3, failed:4}; sets delivered_at/read_at/sent_at column based on newStatus; sets updated_at = NOW() (Plan 02 Blocker #2 — column now exists)
    - Tests: messageStatus.test.ts verifies rank ordering returns expected SQL for each transition AND that the SQL contains `updated_at = NOW()`; conversations.test.ts mocks db and verifies upsert calls + that the INSERT chain ends with .onConflictDoNothing
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/domain/messageStatus.ts` — Blocker #2: writes `updated_at = NOW()` (column now exists after Plan 02 fix):
       ```ts
       import { sql } from "drizzle-orm";
       import type { getDb } from "../lib/db.js";

       export const STATUS_RANK = {
         queued: 0,
         sent: 1,
         delivered: 2,
         read: 3,
         failed: 4,
       } as const;

       export type MessageStatus = keyof typeof STATUS_RANK;

       /**
        * Apply an ordinal-guarded status update to messages.status.
        *
        * Per PITFALL #11 + WA-04: status webhooks arrive out-of-order and at-least-once.
        * We must never DOWNGRADE a status (e.g. delivered → sent). The UPDATE uses a
        * CASE rank guard: only applies when the new rank exceeds the current rank.
        *
        * Idempotent: replaying the same (externalId, status) is a no-op.
        *
        * Writes updated_at = NOW() per Plan 02 Blocker #2 (the column is now part of
        * the additive migration; the SET clause below is safe).
        */
       export async function applyOrdinalStatusUpdate(
         db: ReturnType<typeof getDb>,
         externalId: string,
         newStatus: MessageStatus,
         timestampUnix: string | number | null,
         errorCode?: string | null,
       ): Promise<{ updatedRows: number }> {
         const newRank = STATUS_RANK[newStatus];
         if (newRank === undefined) {
           throw new Error(`Unknown message status: ${newStatus}`);
         }

         const timestampISO = timestampUnix
           ? new Date(Number(timestampUnix) * 1000).toISOString()
           : new Date().toISOString();

         // Single UPDATE with rank guard. Uses raw SQL for the CASE expression
         // because Drizzle's typed query builder doesn't easily compose this.
         const result = await db.execute(sql`
           UPDATE messages
           SET status = ${newStatus},
               sent_at      = COALESCE(sent_at,      CASE WHEN ${newStatus} = 'sent'      THEN ${timestampISO} END),
               delivered_at = COALESCE(delivered_at, CASE WHEN ${newStatus} = 'delivered' THEN ${timestampISO} END),
               read_at      = COALESCE(read_at,      CASE WHEN ${newStatus} = 'read'      THEN ${timestampISO} END),
               error_code   = COALESCE(error_code,   CASE WHEN ${newStatus} = 'failed'    THEN ${errorCode ?? null} END),
               updated_at = NOW()
           WHERE external_id = ${externalId}
             AND (
               CASE status
                 WHEN 'queued'    THEN 0
                 WHEN 'sent'      THEN 1
                 WHEN 'delivered' THEN 2
                 WHEN 'read'      THEN 3
                 WHEN 'failed'    THEN 4
                 ELSE -1
               END
             ) < ${newRank}
         `);

         // neon-serverless drizzle returns the underlying pg result on .execute
         const rowCount = (result as any)?.rowCount ?? (result as any)?.rows?.length ?? 0;
         return { updatedRows: rowCount };
       }
       ```

    2. Create `apps/worker/src/domain/conversations.ts` — HIGH #4: INSERT uses .onConflictDoNothing on externalId (partial UNIQUE index added by Plan 02):
       ```ts
       import { eq, and } from "drizzle-orm";
       import { nanoid } from "nanoid";
       import type { getDb } from "../lib/db.js";
       import { schema } from "../lib/db.js";

       export type InboundMessage = {
         id: string; // wamid
         from: string; // phone WITHOUT leading + (e.g. "447700900000")
         type: "text" | "image" | "audio" | "video" | "document" | "location" | "sticker" | "interactive" | string;
         text?: { body?: string };
         timestamp?: string;
       };

       /**
        * Upsert conversation + insert messages row for an inbound WA message (WA-03).
        *
        * Race-safe (HIGH #4): messages.external_id is the partial UNIQUE index
        * (Plan 02). The INSERT uses .onConflictDoNothing({ target: externalId })
        * so two concurrent jobs racing on the same wamid produce exactly one row.
        *
        * Returns { processed: true } if the message was newly written,
        * { processed: false, reason } if skipped (member not found OR duplicate).
        */
       export async function upsertConversationAndMessage(
         db: ReturnType<typeof getDb>,
         msg: InboundMessage,
         rawPayload: string,
       ): Promise<{ processed: boolean; reason?: string }> {
         const externalId = msg.id;
         const fromE164 = `+${msg.from}`;
         const messageType = (msg.type ?? "text") as string;
         const body = messageType === "text" ? (msg.text?.body ?? "") : null;

         // 1. Look up member by phone (natural key)
         //    guard:allow-unscoped — webhook processor
         const member = await db
           .select()
           .from(schema.gymMembers)
           .where(eq(schema.gymMembers.phoneE164, fromE164))
           .limit(1)
           .then((r) => r[0] ?? null);

         if (!member) {
           // Demo parity (templates/mail/.../webhooks.whatsapp.tsx line 117).
           // Full WA-03 "stub member" path is deferred — CONTEXT does not lock it in.
           return { processed: false, reason: "unknown_phone" };
         }

         // 2. Upsert conversation
         //    guard:allow-unscoped — webhook processor
         const now = new Date().toISOString();
         let conv = await db
           .select()
           .from(schema.conversations)
           .where(
             and(
               eq(schema.conversations.memberId, member.id),
               eq(schema.conversations.channel, "whatsapp"),
             ),
           )
           .limit(1)
           .then((r) => r[0] ?? null);

         if (!conv) {
           const convId = `conv_${nanoid()}`;
           await db.insert(schema.conversations).values({
             id: convId,
             memberId: member.id,
             channel: "whatsapp",
             status: "open",
             unreadCount: 1,
             lastInboundAt: now,
             lastMessagePreview: body ?? `(${messageType})`,
           });
           conv = { id: convId, unreadCount: 0 } as any;
         } else {
           await db
             .update(schema.conversations)
             .set({
               lastInboundAt: now,
               unreadCount: (conv.unreadCount ?? 0) + 1,
               lastMessagePreview: body ?? `(${messageType})`,
               updatedAt: now,
             })
             .where(eq(schema.conversations.id, conv.id));
         }

         // 3. INSERT message row — HIGH #4: race-safe via .onConflictDoNothing on the
         //    partial UNIQUE index (Plan 02). Two concurrent jobs on the same wamid
         //    won't produce duplicate rows even at concurrency=5.
         const insertResult = await db
           .insert(schema.messages)
           .values({
             id: `msg_${nanoid()}`,
             conversationId: conv.id,
             externalId,
             direction: "in",
             messageType: messageType as any,
             body,
             payload: JSON.stringify(msg),
             status: "delivered",
           })
           .onConflictDoNothing({ target: schema.messages.externalId })
           .returning({ id: schema.messages.id });

         if (insertResult.length === 0) {
           // ON CONFLICT triggered — another concurrent job won the race for this wamid
           return { processed: false, reason: "duplicate_wamid" };
         }

         return { processed: true };
       }
       ```

    3. Create `apps/worker/src/queues/inbound-whatsapp.ts` — HIGH #6: dispatch on payload.kind, read structured fields directly:
       ```ts
       import type PgBoss from "pg-boss";
       import { eq, and } from "drizzle-orm";
       import { QUEUE_NAMES, InboundWhatsAppPayload } from "@gymos/queue";
       import { getDb, schema } from "../lib/db.js";
       import { getLogger } from "../lib/logger.js";
       import { upsertConversationAndMessage } from "../domain/conversations.js";
       import { applyOrdinalStatusUpdate, type MessageStatus } from "../domain/messageStatus.js";

       export async function registerInboundWhatsAppWorker(boss: PgBoss) {
         const log = getLogger();
         await boss.work(
           QUEUE_NAMES.INBOUND_WHATSAPP,
           { teamSize: 5, teamConcurrency: 5 }, // D-14
           async (jobs) => {
             const job = Array.isArray(jobs) ? jobs[0] : jobs;
             const data = InboundWhatsAppPayload.parse(job.data);
             const db = getDb();

             // HIGH #6: dispatch on the typed discriminator — no synthetic-string parsing.
             if (data.kind === "status") {
               // Status path — read structured fields directly. No webhook_events
               // load needed (the structured payload carries everything we need).
               const result = await applyOrdinalStatusUpdate(
                 db,
                 data.statusFor,                 // wamid of the OUTBOUND message
                 data.newStatus as MessageStatus, // "sent" | "delivered" | "read" | "failed"
                 data.timestamp,
                 data.errorCode ?? null,
               );
               log.info(
                 { statusFor: data.statusFor, newStatus: data.newStatus, updatedRows: result.updatedRows },
                 "[inbound-whatsapp] status update applied",
               );

               // Mark the matching webhook_events row processed (best-effort — the
               // dedup key from Plan 04 receiver is wamid_status_<id>_<ts>_<status>).
               // guard:allow-unscoped — webhook processor
               const dedupKey = `wamid_status_${data.statusFor}_${data.timestamp}_${data.newStatus}`;
               await db
                 .update(schema.webhookEvents)
                 .set({ processedAt: new Date().toISOString() })
                 .where(
                   and(
                     eq(schema.webhookEvents.provider, "whatsapp"),
                     eq(schema.webhookEvents.externalId, dedupKey),
                   ),
                 );
               return;
             }

             // kind === "message" — materialise conversation + message
             // Try to load the original raw payload from webhook_events; if missing,
             // synthesise a minimal payload from the structured fields.
             // guard:allow-unscoped — webhook processor
             const row = await db
               .select()
               .from(schema.webhookEvents)
               .where(
                 and(
                   eq(schema.webhookEvents.provider, "whatsapp"),
                   eq(schema.webhookEvents.externalId, data.externalId),
                 ),
               )
               .limit(1)
               .then((r) => r[0]);

             if (row?.processedAt) {
               // Idempotency (success criterion #2): already processed, no-op
               return;
             }

             const inboundMsg = {
               id: data.externalId,
               from: data.from,
               type: data.messageType,
               text: data.body != null ? { body: data.body } : undefined,
               timestamp: data.timestamp,
             };
             const rawPayload = row?.payloadRaw ?? JSON.stringify({ synthetic: true, ...data });

             await upsertConversationAndMessage(db, inboundMsg as any, rawPayload);

             // Mark processed (best-effort if row is null)
             if (row) {
               await db
                 .update(schema.webhookEvents)
                 .set({ processedAt: new Date().toISOString() })
                 .where(eq(schema.webhookEvents.id, row.id));
             }
           },
         );
       }
       ```

    4. Create `apps/worker/src/domain/messageStatus.test.ts` — assert `updated_at = NOW()` is in the SQL (Blocker #2):
       ```ts
       import { describe, it, expect, vi } from "vitest";
       import { STATUS_RANK, applyOrdinalStatusUpdate } from "./messageStatus.js";

       describe("STATUS_RANK", () => {
         it("enforces strict ordering queued < sent < delivered < read < failed", () => {
           expect(STATUS_RANK.queued).toBe(0);
           expect(STATUS_RANK.sent).toBe(1);
           expect(STATUS_RANK.delivered).toBe(2);
           expect(STATUS_RANK.read).toBe(3);
           expect(STATUS_RANK.failed).toBe(4);
         });
       });

       describe("applyOrdinalStatusUpdate", () => {
         it("throws on unknown status", async () => {
           const mockDb = { execute: vi.fn() } as any;
           await expect(
             // @ts-expect-error — invalid status by design
             applyOrdinalStatusUpdate(mockDb, "wamid_x", "unknown", null),
           ).rejects.toThrow(/Unknown message status/);
         });

         it("uses ordinal-guard CASE WHEN in SQL", async () => {
           const mockDb = { execute: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
           await applyOrdinalStatusUpdate(mockDb, "wamid_x", "delivered", "1234567890");
           const sqlObj = mockDb.execute.mock.calls[0][0];
           const sqlStr = JSON.stringify(sqlObj);
           expect(sqlStr).toContain("CASE status");
           expect(sqlStr).toContain("queued");
           expect(sqlStr).toContain("sent");
           expect(sqlStr).toContain("delivered");
           expect(sqlStr).toContain("read");
           expect(sqlStr).toContain("failed");
         });

         it("writes updated_at = NOW() in the UPDATE (Blocker #2)", async () => {
           const mockDb = { execute: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
           await applyOrdinalStatusUpdate(mockDb, "wamid_x", "sent", "1234567890");
           const sqlStr = JSON.stringify(mockDb.execute.mock.calls[0][0]);
           expect(sqlStr).toContain("updated_at = NOW()");
         });

         it("returns updatedRows from execute result", async () => {
           const mockDb = { execute: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
           const result = await applyOrdinalStatusUpdate(mockDb, "wamid_y", "sent", "1234567890");
           expect(result.updatedRows).toBe(1);
         });

         it("converts unix timestamp to ISO", async () => {
           const mockDb = { execute: vi.fn().mockResolvedValue({ rowCount: 0 }) } as any;
           await applyOrdinalStatusUpdate(mockDb, "wamid_z", "delivered", "1700000000");
           const sqlStr = JSON.stringify(mockDb.execute.mock.calls[0][0]);
           // 1700000000 unix = 2023-11-14T22:13:20.000Z
           expect(sqlStr).toContain("2023-11-14T22:13:20.000Z");
         });

         it("propagates errorCode for failed status", async () => {
           const mockDb = { execute: vi.fn().mockResolvedValue({ rowCount: 1 }) } as any;
           await applyOrdinalStatusUpdate(mockDb, "wamid_f", "failed", "1700000000", "131047");
           const sqlStr = JSON.stringify(mockDb.execute.mock.calls[0][0]);
           expect(sqlStr).toContain("131047");
         });
       });
       ```

    5. Create `apps/worker/src/domain/conversations.test.ts` — assert .onConflictDoNothing is called on the INSERT (HIGH #4):
       ```ts
       import { describe, it, expect, vi } from "vitest";

       // Mock db module — chained INSERT must end with .onConflictDoNothing.returning(...)
       const selectChain = {
         from: vi.fn().mockReturnThis(),
         where: vi.fn().mockReturnThis(),
         limit: vi.fn().mockReturnThis(),
         then: vi.fn(),
       };
       const insertChain = {
         values: vi.fn().mockReturnThis(),
         onConflictDoNothing: vi.fn().mockReturnThis(),
         returning: vi.fn(),
       };
       const conversationInsertChain = {
         values: vi.fn().mockResolvedValue(undefined),
       };
       const updateChain = {
         set: vi.fn().mockReturnThis(),
         where: vi.fn().mockResolvedValue(undefined),
       };
       let insertCallCount = 0;
       const mockDb = {
         select: vi.fn().mockReturnValue(selectChain),
         insert: vi.fn().mockImplementation(() => {
           insertCallCount += 1;
           // First insert call (conversation) doesn't need onConflictDoNothing;
           // second insert call (messages) does (HIGH #4).
           return insertCallCount === 1 && conversationInsertChain.values.mock.calls.length === 0
             ? conversationInsertChain
             : insertChain;
         }),
         update: vi.fn().mockReturnValue(updateChain),
       };

       vi.mock("../lib/db.js", () => ({
         getDb: () => mockDb,
         schema: {
           messages: { externalId: { name: "external_id" }, id: { name: "id" } },
           gymMembers: { phoneE164: { name: "phone_e164" }, id: { name: "id" } },
           conversations: {
             memberId: { name: "member_id" },
             channel: { name: "channel" },
             id: { name: "id" },
           },
         },
       }));

       import { upsertConversationAndMessage } from "./conversations.js";

       describe("upsertConversationAndMessage", () => {
         it("returns unknown_phone if no member matches", async () => {
           selectChain.then.mockResolvedValueOnce(null); // no member
           const result = await upsertConversationAndMessage(
             mockDb as any,
             { id: "wamid_new", from: "447700900099", type: "text", text: { body: "x" } },
             "{}",
           );
           expect(result.processed).toBe(false);
           expect(result.reason).toBe("unknown_phone");
         });

         it("creates conversation + message for known member with no prior conversation", async () => {
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" }) // member found
             .mockResolvedValueOnce(null); // no existing conversation
           insertChain.returning.mockResolvedValueOnce([{ id: "msg_new" }]); // INSERT messages OK
           const result = await upsertConversationAndMessage(
             mockDb as any,
             { id: "wamid_new", from: "447700900000", type: "text", text: { body: "hello" } },
             '{"raw":"hello"}',
           );
           expect(result.processed).toBe(true);
         });

         it("messages INSERT uses .onConflictDoNothing on externalId (HIGH #4 — race-safe)", async () => {
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_2", phoneE164: "+447700900001" })
             .mockResolvedValueOnce({ id: "conv_existing", unreadCount: 3 });
           insertChain.returning.mockResolvedValueOnce([{ id: "msg_y" }]);
           await upsertConversationAndMessage(
             mockDb as any,
             { id: "wamid_y", from: "447700900001", type: "text", text: { body: "hi again" } },
             "{}",
           );
           // The messages INSERT chain must have .onConflictDoNothing called with target=externalId
           expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
           const args = insertChain.onConflictDoNothing.mock.calls[0][0];
           expect(args?.target).toBeDefined();
         });

         it("returns duplicate_wamid when .onConflictDoNothing triggers (concurrent race)", async () => {
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_3", phoneE164: "+447700900002" })
             .mockResolvedValueOnce({ id: "conv_dup", unreadCount: 0 });
           insertChain.returning.mockResolvedValueOnce([]); // ON CONFLICT triggered — empty return
           const result = await upsertConversationAndMessage(
             mockDb as any,
             { id: "wamid_race", from: "447700900002", type: "text", text: { body: "race" } },
             "{}",
           );
           expect(result.processed).toBe(false);
           expect(result.reason).toBe("duplicate_wamid");
         });

         it("updates existing conversation when prior conversation exists", async () => {
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_4", phoneE164: "+447700900003" })
             .mockResolvedValueOnce({ id: "conv_existing_2", unreadCount: 2 });
           insertChain.returning.mockResolvedValueOnce([{ id: "msg_z" }]);
           await upsertConversationAndMessage(
             mockDb as any,
             { id: "wamid_existing", from: "447700900003", type: "text", text: { body: "again" } },
             "{}",
           );
           expect(updateChain.set).toHaveBeenCalled();
           // unread_count incremented to 3 (2 + 1)
           const setCall = updateChain.set.mock.calls[updateChain.set.mock.calls.length - 1][0];
           expect(setCall.unreadCount).toBe(3);
         });
       });
       ```

    6. Wire `registerInboundWhatsAppWorker` into `apps/worker/src/index.ts` (uncomment the import + call from Task 1 step 8).

    7. Run `pnpm --filter @gymos/worker test` — all tests pass.
    8. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    9. Run `pnpm --filter @gymos/worker build` — emits dist/.
    10. Run `npx prettier --write apps/worker/src/**/*.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test 2>&amp;1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/src/queues/inbound-whatsapp.ts` contains string `boss.work` AND `INBOUND_WHATSAPP` AND `teamSize: 5` (concurrency per D-14)
    - `apps/worker/src/queues/inbound-whatsapp.ts` contains string `data.kind === "status"` (HIGH #6 — dispatch on typed discriminator)
    - `apps/worker/src/queues/inbound-whatsapp.ts` contains string `data.statusFor` AND `data.newStatus` (HIGH #6 — reads structured fields directly, no synthetic concat parsing)
    - `apps/worker/src/queues/inbound-whatsapp.ts` does NOT contain string `wamid_status_${status.id}` reconstruction inside the kind="status" branch (the synthetic concat is only used as a best-effort dedup key when marking webhook_events processed, NOT for routing)
    - `apps/worker/src/queues/inbound-whatsapp.ts` contains string `processedAt: new Date().toISOString()` (idempotency mark)
    - `apps/worker/src/queues/inbound-whatsapp.ts` contains string `if (row?.processedAt)` OR `if (row.processedAt)` (skip already-processed — idempotency)
    - `apps/worker/src/domain/messageStatus.ts` contains string `CASE status` AND all 5 status names (`queued|sent|delivered|read|failed`) in the rank guard SQL
    - `apps/worker/src/domain/messageStatus.ts` contains string `updated_at = NOW()` (Blocker #2 — column added by Plan 02; this SET clause is now valid)
    - `apps/worker/src/domain/messageStatus.ts` contains string `STATUS_RANK` exported
    - `apps/worker/src/domain/conversations.ts` contains string `onConflictDoNothing({ target: schema.messages.externalId })` (HIGH #4 — race-safe INSERT)
    - `apps/worker/src/domain/conversations.ts` contains string `duplicate_wamid` (idempotency reason — returned when onConflictDoNothing fires)
    - `apps/worker/src/domain/conversations.ts` contains string `unknown_phone` (member-not-found path)
    - `apps/worker/src/domain/conversations.ts` contains `// guard:allow-unscoped` comments on the unscoped reads (webhook processor, no per-user scoping at this layer)
    - All tests pass — `pnpm --filter @gymos/worker test` exits 0 (≥5 conversations tests + ≥6 messageStatus tests = ≥11 total)
    - Tests include explicit assertions for `updated_at = NOW()` (Blocker #2) AND `.onConflictDoNothing` on the messages INSERT (HIGH #4)
    - `pnpm --filter @gymos/worker typecheck` exits 0
    - `pnpm --filter @gymos/worker build` exits 0
  </acceptance_criteria>
  <done>Worker drains inbound-whatsapp queue, dispatches on typed payload.kind (HIGH #6), materialises conversations + messages with race-safe onConflictDoNothing (HIGH #4), ordinal-guards status updates with updated_at = NOW() (Blocker #2). Tests cover the rank-guard SQL + the conflict-target INSERT.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Deploy worker to Fly + verify it drains inbound-whatsapp queue (web + worker fly checks pass)</name>
  <what-built>
    apps/worker/ process now boots pg-boss, registers the inbound-whatsapp queue handler, and processes jobs from `pgboss.job` table. Worker /healthz on port 3002 (MEDIUM #10). Connected to same Neon DB as edge-webhooks but via UNPOOLED endpoint.
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
    1. Confirm DATABASE_URL_UNPOOLED is set on the Fly app (in addition to the pooled DATABASE_URL set in Plan 04):
       ```pwsh
       # Take the existing DATABASE_URL and strip "-pooler" from the hostname
       # Example: ep-holy-thunder-aqsb7xp1-pooler.c-8.us-east-1.aws.neon.tech
       #       → ep-holy-thunder-aqsb7xp1.c-8.us-east-1.aws.neon.tech
       fly secrets set -a gymos-edge-webhooks DATABASE_URL_UNPOOLED=<unpooled-url>
       ```

    2. Re-deploy so the worker process picks up the new entrypoint (replaces the Plan 04 stub):
       ```pwsh
       fly deploy -a gymos-edge-webhooks --remote-only
       ```

    3. Scale up the worker process to 1 machine (the web process auto-scales separately):
       ```pwsh
       fly scale count web=1 worker=1 -a gymos-edge-webhooks
       fly status -a gymos-edge-webhooks
       ```
       Expected: 2 machines, one per process.

    4. Verify BOTH fly checks still pass after the worker stub was replaced (MEDIUM #10):
       ```pwsh
       fly checks list -a gymos-edge-webhooks
       ```
       Expected: web /healthz passing AND worker /healthz on port 3002 passing.

    5. Check logs for worker boot:
       ```pwsh
       fly logs -a gymos-edge-webhooks
       ```
       Expected: `[worker] booting`, `[pgboss] started`, `[worker] inbound-whatsapp queue registered`, `[worker] admin healthz listening`.

    6. Verify pg-boss schema created (one-time, on first boss.start()):
       ```sql
       SELECT table_name FROM information_schema.tables WHERE table_schema = 'pgboss';
       ```
       Expected: at least `job`, `archive`, `version`, `subscription`.

    7. Trigger an inbound WhatsApp event via the Fly receiver — send a real WA message from a test phone whose number matches one of the seeded gym_members rows. Watch:
       a. `webhook_events` table gets a new row (provider='whatsapp', event_type='messages.inbound').
       b. `pgboss.job` gets a row with name='inbound-whatsapp', state transitions created → active → completed within ~5s. The job.data should show structured `{ "kind": "message", "externalId": "wamid...", "from": "...", ... }` (HIGH #6).
       c. `messages` table gets a new row (direction='in', externalId=<wamid>, status='delivered').
       d. `conversations` table — either a new row (first-time number) or last_inbound_at updated + unread_count incremented.

       Query template:
       ```sql
       SELECT * FROM webhook_events WHERE provider='whatsapp' ORDER BY received_at DESC LIMIT 3;
       SELECT id, name, state, data, completedon FROM pgboss.job WHERE name='inbound-whatsapp' ORDER BY createdon DESC LIMIT 3;
       SELECT id, external_id, direction, status, body, updated_at FROM messages WHERE external_id LIKE 'wamid%' ORDER BY id DESC LIMIT 3;
       ```

    8. Replay test (success criterion #2): send the same WA payload twice via curl (use the body + sig from a saved fixture, or copy from logs). Expect:
       - 1 row in webhook_events (the second insert hits ON CONFLICT DO NOTHING from Plan 04)
       - 1 row in messages (idempotency at receiver layer; even if a race were to slip through, the worker's onConflictDoNothing on messages.external_id (HIGH #4) provides belt-and-braces — the partial UNIQUE index from Plan 02 enforces this at the DB level)

    9. Concurrency race test (HIGH #4 — optional but recommended): manually enqueue TWO jobs to inbound-whatsapp with the same externalId before the worker processes them. Use:
       ```sql
       -- Insert two pgboss.job rows directly with the SAME singletonKey
       -- (this normally wouldn't happen because publish.ts uses singletonKey, but
       -- if you bypass the publisher and insert directly, the worker should still
       -- produce only 1 messages row because of the partial UNIQUE index +
       -- .onConflictDoNothing in upsertConversationAndMessage).
       ```
       Expected: SELECT COUNT(*) FROM messages WHERE external_id='<race-wamid>' → 1, regardless of how many concurrent worker slots processed it.

    10. Status webhook test (optional — may need test phone to mark message as "read"):
        After step 7, send an outbound message via the demo /gymos UI (which still uses the old direct-Meta call). Wait for status webhooks to flow. Verify messages.status column transitions: queued → sent → delivered → read (each via separate webhook). At each transition, the ordinal-guarded UPDATE should apply only the rank-superseding update. Verify `updated_at` is populated and monotonically increasing per transition (Blocker #2 evidence).

        Out-of-order test: pause the worker (`fly scale count worker=0`), trigger 2 status webhooks (e.g. delivered + read) in any order — both land in webhook_events + pgboss.job in arrival order. The job.data should be structured `{ kind: "status", statusFor: "wamid.X", newStatus: "delivered" / "read", ... }` (HIGH #6 — verify via `SELECT data FROM pgboss.job WHERE name='inbound-whatsapp' AND data->>'kind' = 'status'`). Resume worker (`fly scale count worker=1`). Worker processes both jobs. Final state of `messages.status` should be 'read' (the higher rank wins regardless of processing order).

    Report any failures. Type "approved" only if steps 4 (both fly checks pass), 7 (inbound flow end-to-end), AND 8 (replay→1 row) succeed.
  </how-to-verify>
  <resume-signal>Type "approved" if worker processes inbound message end-to-end (webhook_events → pgboss.job → messages row inserted) AND both fly checks (web + worker) report passing AND replay produces exactly 1 messages row. Otherwise paste the SQL row counts + fly logs tail.</resume-signal>
  <acceptance_criteria>
    - User confirms `fly deploy` succeeded with worker process running
    - User confirms `fly checks list` shows both web + worker passing (MEDIUM #10)
    - User confirms `pgboss` schema exists in Neon
    - User confirms inbound WA message creates webhook_events row + pgboss.job row (with structured `{ kind: "message", ... }` payload — HIGH #6) + messages row (end-to-end flow)
    - User confirms replay of same WA payload does NOT create second messages row (success criterion #2 — HIGH #4 backed by Plan 02's partial UNIQUE index)
    - User confirms status webhook job.data has structured `{ kind: "status", statusFor, newStatus, ... }` shape (HIGH #6)
    - User confirms messages.updated_at populated by status transitions (Blocker #2)
  </acceptance_criteria>
  <done>Worker tier live. inbound-whatsapp queue drains. messages + conversations are materialised idempotently and race-safely. Status webhook ordinal-guard verified. Both fly checks pass.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/worker test` exits 0 (≥11 tests)
- `pnpm --filter @gymos/worker build` produces dist/
- Worker boots on Fly worker process slot AND /healthz on port 3002 keeps the fly check passing (MEDIUM #10)
- pgboss schema exists in Neon
- Replay of same WA payload yields exactly 1 messages row (success criterion #2)
- Status update never downgrades (rank-guarded SQL verified by test) AND writes updated_at = NOW() (Blocker #2)
- Worker dispatches on data.kind from the typed InboundWhatsAppPayload (HIGH #6)
- messages INSERT uses .onConflictDoNothing on externalId (HIGH #4)
</verification>

<success_criteria>
1. Worker process drains inbound-whatsapp queue at concurrency=5 (D-14)
2. webhook_events.processed_at marked only on successful handle (PG-boss retries on error)
3. messages.external_id partial UNIQUE + .onConflictDoNothing prevents duplicate inserts under concurrency=5 (HIGH #4 + success criterion #2)
4. Ordinal status updates use single SQL UPDATE with CASE rank guard AND set updated_at = NOW() (PITFALL #11 + Blocker #2)
5. DATABASE_URL_UNPOOLED used (PITFALL #1)
6. Worker dispatches on typed payload.kind discriminator — no synthetic-string parsing between receiver↔worker (HIGH #6)
7. Worker /healthz on port 3002 keeps Fly worker check passing (MEDIUM #10)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-05-SUMMARY.md` recording:
- Worker test count + pass status
- pgboss.* schema tables auto-created
- One end-to-end inbound trace (webhook_events row + pgboss.job row showing structured `{ kind: "message", ... }` + messages row IDs)
- One end-to-end status trace (pgboss.job row showing structured `{ kind: "status", statusFor, newStatus, ... }` + messages.updated_at populated)
- Confirmation of replay-twice idempotency (HIGH #4)
- Confirmation that both fly checks (web + worker) pass (MEDIUM #10)
- Notes for Plan 06 (sendMessage chokepoint) about the lib/errors.ts types and where to register the outbound-whatsapp worker
</output>
