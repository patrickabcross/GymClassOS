---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified:
  - apps/edge-webhooks/package.json
  - apps/edge-webhooks/tsconfig.json
  - apps/edge-webhooks/Dockerfile
  - apps/edge-webhooks/fly.toml
  - apps/edge-webhooks/.env.example
  - apps/edge-webhooks/src/index.ts
  - apps/edge-webhooks/src/server.ts
  - apps/edge-webhooks/src/routes/whatsapp.ts
  - apps/edge-webhooks/src/routes/stripe.ts
  - apps/edge-webhooks/src/lib/db.ts
  - apps/edge-webhooks/src/lib/env.ts
  - apps/edge-webhooks/src/lib/idempotency.ts
  - apps/edge-webhooks/src/lib/stripe.ts
  - apps/edge-webhooks/src/routes/whatsapp.test.ts
  - apps/edge-webhooks/src/routes/stripe.test.ts
  - apps/edge-webhooks/src/lib/idempotency.test.ts
autonomous: false
requirements: [WEB-01, WEB-02, WEB-03]
must_haves:
  truths:
    - "apps/edge-webhooks runs on Fly.io region iad (NOT lhr per research finding — overrides CONTEXT D-02; rationale: Neon is us-east-1, lhr→Neon costs ~80ms RTT per query)"
    - "min_machines_running = 1, auto_stop_machines = false (PITFALL #8 — Vercel cold-start storms forbidden)"
    - "POST /webhooks/whatsapp reads raw body via c.req.text() BEFORE any JSON parse (PITFALL #9)"
    - "POST /webhooks/whatsapp verifies HMAC via @gymos/whatsapp verifySignature with timingSafeEqual"
    - "POST /webhooks/stripe verifies via stripe.webhooks.constructEvent() with apiVersion '2026-04-22.dahlia' pinned"
    - "Inserts to webhook_events use ON CONFLICT (provider, external_id) DO NOTHING — idempotent across Stripe + Meta retries"
    - "Enqueues to pg-boss via @gymos/queue publishers; returns 200 in <100ms (NO business logic in receiver)"
    - "GET /webhooks/whatsapp returns hub.challenge string when hub.mode=subscribe AND token matches WHATSAPP_VERIFY_TOKEN"
    - "GET /healthz returns 200 OK + JSON {ok:true, version:<git_sha>}"
    - "Tampered body to /webhooks/stripe returns 400 BEFORE any DB write or enqueue (success criterion #5)"
  artifacts:
    - path: "apps/edge-webhooks/src/routes/stripe.ts"
      provides: "Stripe webhook endpoint — constructEvent verify + idempotent insert + enqueue"
      contains: "stripe.webhooks.constructEvent"
    - path: "apps/edge-webhooks/src/routes/whatsapp.ts"
      provides: "WhatsApp webhook endpoint — GET verify-token + POST raw-body HMAC + idempotent insert + enqueue"
      contains: "await c.req.text()"
    - path: "apps/edge-webhooks/src/lib/idempotency.ts"
      provides: "insertWebhookEvent helper — ON CONFLICT (provider, external_id) DO NOTHING + returns boolean (newly-inserted)"
      contains: "onConflictDoNothing"
    - path: "apps/edge-webhooks/fly.toml"
      provides: "Fly deploy config — region iad, min_machines_running=1, auto_stop_machines=false, two-process block (web + worker)"
      contains: "auto_stop_machines = false"
    - path: "apps/edge-webhooks/Dockerfile"
      provides: "Multi-stage Docker build for Node 22 + pnpm workspace + both apps (edge-webhooks + worker)"
  key_links:
    - from: "apps/edge-webhooks/src/routes/whatsapp.ts"
      to: "@gymos/whatsapp verifySignature"
      via: "import + call with raw body + sigHeader + WHATSAPP_APP_SECRET"
      pattern: "verifySignature\\("
    - from: "apps/edge-webhooks/src/routes/stripe.ts"
      to: "stripe.webhooks.constructEvent"
      via: "Stripe SDK with pinned apiVersion"
      pattern: "constructEvent"
    - from: "apps/edge-webhooks/src/lib/idempotency.ts"
      to: "webhook_events table (provider, external_id) UNIQUE index"
      via: "Drizzle insert .onConflictDoNothing({ target: [schema.webhookEvents.provider, schema.webhookEvents.externalId] })"
      pattern: "onConflictDoNothing.*provider.*externalId"
    - from: "apps/edge-webhooks/src/routes/*.ts"
      to: "@gymos/queue publishers"
      via: "enqueueInboundWhatsApp / enqueueStripeEvent calls AFTER successful insert"
      pattern: "enqueue(InboundWhatsApp|StripeEvent)"
---

<objective>
Stand up `apps/edge-webhooks/` — the Hono receiver that lives on Fly.io with `min_machines = 1`. It is the only ingress for Meta (WhatsApp) and Stripe webhooks. Its job: verify signatures against raw bytes BEFORE any JSON parsing (PITFALL #9), persist to `webhook_events` with `ON CONFLICT DO NOTHING` (idempotency), enqueue via pg-boss for worker processing, return 200 inside the platform-required ack window. ZERO business logic. ZERO outbound HTTP calls (except Stripe's signature verify which is local). Deployed to Fly region `iad` (NOT `lhr` per research finding — overrides CONTEXT D-02 because Neon is us-east-1; revisit at P0 cutover).

Purpose: WEB-01 (always-on Fly app), WEB-02 (raw-body HMAC before parse), WEB-03 (idempotent insert + enqueue + 200 <100ms).
Output: Working Fly app at `https://gymos-edge-webhooks.fly.dev/` (or chosen name) ready for Plan 09 to flip Meta URL.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@templates/mail/app/routes/webhooks.whatsapp.tsx
@CLAUDE.md
@AGENTS.md
@packages/queue/src/publish.ts
@packages/whatsapp/src/verify-signature.ts
@apps/staff-web/server/db/schema.ts

<interfaces>
<!-- packages/queue/ enqueueInboundWhatsApp and enqueueStripeEvent are imported from @gymos/queue -->
<!-- packages/whatsapp/ verifySignature is imported from @gymos/whatsapp (allowed — edge-webhooks IS the worker tier for verify purposes; rule D-11 forbids staff-web import only) -->
<!-- apps/staff-web/server/db/schema.ts is imported via workspace ref. webhookEvents columns: id PK, provider, eventType, externalId, payloadRaw, receivedAt, processedAt, error -->

Stripe SDK constructor:
new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" })

Stripe webhook signature verify:
const event = stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret);
// Throws on invalid sig — must be try/catch wrapped, return 400 on throw

Hono raw body access:
const raw = await c.req.text();   // MUST come before any c.req.json()
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Scaffold apps/edge-webhooks/ with Hono + Stripe + Drizzle + env validation</name>
  <files>apps/edge-webhooks/package.json, apps/edge-webhooks/tsconfig.json, apps/edge-webhooks/Dockerfile, apps/edge-webhooks/.env.example, apps/edge-webhooks/.dockerignore, apps/edge-webhooks/src/lib/env.ts, apps/edge-webhooks/src/lib/db.ts, apps/edge-webhooks/src/lib/stripe.ts, apps/edge-webhooks/src/lib/idempotency.ts, apps/edge-webhooks/src/lib/idempotency.test.ts</files>
  <read_first>
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Standard Stack" (Hono 4, Stripe 19 with apiVersion 2026-04-22.dahlia, Drizzle 0.45, @neondatabase/serverless 1.1)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Recommended Project Structure" (lines 199-287)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 1: Webhook Receiver → Idempotency Table → Worker Queue" lines 302-441
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Open Questions #3" (edge-webhooks uses pooled, worker uses unpooled)
    - apps/staff-web/server/db/schema.ts (webhookEvents shape — needed for Drizzle import)
    - packages/queue/src/index.ts (publisher imports)
    - CLAUDE.md (TypeScript everywhere, prettier, Node 22+)
  </read_first>
  <behavior>
    - env.ts Zod-validates required env vars at boot: DATABASE_URL, DATABASE_URL_UNPOOLED, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, GIT_SHA (optional)
    - env.ts throws (with named fields list) if any required var missing — fail-fast on boot
    - db.ts exports getDb() returning Drizzle client using @neondatabase/serverless WebSocket driver (Fly = long-lived process)
    - stripe.ts exports getStripe() returning Stripe SDK with apiVersion '2026-04-22.dahlia' PINNED
    - idempotency.ts exports insertWebhookEvent(db, args) → returns { inserted: boolean, eventKey: string }
    - insertWebhookEvent uses .onConflictDoNothing({ target: [provider, externalId] }) — returns inserted=false on duplicate
    - insertWebhookEvent test (idempotency.test.ts): mock db.insert chain returns inserted=true first call, inserted=false on conflict
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/edge-webhooks/package.json`:
       ```json
       {
         "name": "@gymos/edge-webhooks",
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
           "drizzle-orm": "^0.45.0",
           "hono": "^4.6.0",
           "pino": "^9.5.0",
           "stripe": "^19.0.0",
           "zod": "^4.0.0",
           "ws": "^8.18.0"
         },
         "devDependencies": {
           "@types/node": "^22.0.0",
           "@types/ws": "^8.5.0",
           "tsx": "catalog:",
           "typescript": "catalog:",
           "vitest": "^2.0.0"
         },
         "engines": { "node": ">=22" }
       }
       ```
       NOTE: workspace ref to `apps/staff-web/server/db/schema.ts` is NOT done via npm dep — we import the schema via relative path in Task 2 or workspace path alias. For now, no @gymos/db package; defer extraction per RESEARCH Open Question #2.

    2. Create `apps/edge-webhooks/tsconfig.json`:
       ```json
       {
         "compilerOptions": {
           "target": "ES2022",
           "module": "ESNext",
           "moduleResolution": "bundler",
           "strict": true,
           "esModuleInterop": true,
           "skipLibCheck": true,
           "resolveJsonModule": true,
           "isolatedModules": true,
           "outDir": "./dist",
           "rootDir": "./src",
           "declaration": false,
           "sourceMap": true,
           "paths": {
             "@staff-web-schema/*": ["../staff-web/server/db/*"]
           }
         },
         "include": ["src/**/*"]
       }
       ```

    3. Create `apps/edge-webhooks/src/lib/env.ts`:
       ```ts
       import { z } from "zod";

       const EnvSchema = z.object({
         // DB
         DATABASE_URL: z.string().url("DATABASE_URL must be a valid postgres URL"),
         DATABASE_URL_UNPOOLED: z
           .string()
           .url()
           .refine((u) => !u.includes("-pooler"), {
             message: "DATABASE_URL_UNPOOLED must not include -pooler (PITFALL #1)",
           }),
         // Stripe
         STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, "Must be sk_/rk_ key"),
         STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/),
         // WhatsApp
         WHATSAPP_VERIFY_TOKEN: z.string().min(8),
         WHATSAPP_APP_SECRET: z.string().min(8),
         // Optional
         PORT: z.coerce.number().int().positive().default(3001),
         GIT_SHA: z.string().optional().default("dev"),
         NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
       });

       export type Env = z.infer<typeof EnvSchema>;

       let _env: Env | undefined;
       export function getEnv(): Env {
         if (_env) return _env;
         const parsed = EnvSchema.safeParse(process.env);
         if (!parsed.success) {
           console.error("[env] validation failed:", parsed.error.flatten().fieldErrors);
           throw new Error("Invalid env — see [env] output above");
         }
         _env = parsed.data;
         return _env;
       }
       ```

    4. Create `apps/edge-webhooks/src/lib/db.ts`:
       ```ts
       import { drizzle } from "drizzle-orm/neon-serverless";
       import { Pool, neonConfig } from "@neondatabase/serverless";
       import ws from "ws";
       import { getEnv } from "./env.js";
       // Import schema from apps/staff-web/ via relative path (workspace symlink)
       import * as schema from "../../../staff-web/server/db/schema.js";

       neonConfig.webSocketConstructor = ws;

       let _db: ReturnType<typeof drizzle> | undefined;
       export function getDb() {
         if (_db) return _db;
         const env = getEnv();
         const pool = new Pool({ connectionString: env.DATABASE_URL });
         _db = drizzle(pool, { schema });
         return _db;
       }

       export { schema };
       ```
       NOTE: The relative import path assumes apps/edge-webhooks/ and apps/staff-web/ are siblings. If the import resolution fails at runtime (RESEARCH Open Question #2), refactor to packages/db/ in a separate plan.

    5. Create `apps/edge-webhooks/src/lib/stripe.ts`:
       ```ts
       import Stripe from "stripe";
       import { getEnv } from "./env.js";

       let _stripe: Stripe | undefined;
       export function getStripe(): Stripe {
         if (_stripe) return _stripe;
         const env = getEnv();
         _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
           apiVersion: "2026-04-22.dahlia", // PINNED — PITFALL #3
         });
         return _stripe;
       }
       ```

    6. Create `apps/edge-webhooks/src/lib/idempotency.ts`:
       ```ts
       import { eq, and } from "drizzle-orm";
       import { getDb, schema } from "./db.js";

       export type WebhookProvider = "stripe" | "whatsapp";

       export type InsertWebhookEventArgs = {
         provider: WebhookProvider;
         eventType: string;
         externalId: string;
         payloadRaw: string;
         /** Optional id override; default uses `${provider}:${externalId}` to match demo format */
         idOverride?: string;
       };

       export type InsertResult =
         | { inserted: true; eventKey: string }
         | { inserted: false; eventKey: string };

       /**
        * Insert into webhook_events with ON CONFLICT (provider, external_id) DO NOTHING.
        *
        * Returns inserted=true if the row was new; inserted=false if the (provider, external_id)
        * pair already existed (duplicate Stripe/Meta delivery).
        *
        * Callers should ONLY enqueue downstream work when inserted=true — duplicates are
        * already in the pipeline.
        */
       export async function insertWebhookEvent(
         args: InsertWebhookEventArgs,
       ): Promise<InsertResult> {
         const db = getDb();
         const eventKey = args.idOverride ?? `${args.provider}:${args.externalId}`;
         const result = await db
           .insert(schema.webhookEvents)
           .values({
             id: eventKey,
             provider: args.provider,
             eventType: args.eventType,
             externalId: args.externalId,
             payloadRaw: args.payloadRaw,
           })
           .onConflictDoNothing({
             target: [schema.webhookEvents.provider, schema.webhookEvents.externalId],
           })
           .returning({ id: schema.webhookEvents.id });

         if (result.length === 0) {
           return { inserted: false, eventKey };
         }
         return { inserted: true, eventKey };
       }
       ```

    7. Create `apps/edge-webhooks/src/lib/idempotency.test.ts` with mock-DB tests:
       ```ts
       import { describe, it, expect, vi } from "vitest";

       // Mock the db module — it's the dependency we want to control
       vi.mock("./db.js", () => {
         const insertChain = {
           values: vi.fn().mockReturnThis(),
           onConflictDoNothing: vi.fn().mockReturnThis(),
           returning: vi.fn(),
         };
         return {
           getDb: () => ({ insert: vi.fn().mockReturnValue(insertChain) }),
           schema: {
             webhookEvents: {
               provider: { name: "provider" },
               externalId: { name: "external_id" },
               id: { name: "id" },
             },
           },
           __insertChain: insertChain,
         };
       });

       import { insertWebhookEvent } from "./idempotency.js";
       const dbModule = await import("./db.js");
       // @ts-expect-error — test-only export
       const insertChain = dbModule.__insertChain;

       describe("insertWebhookEvent", () => {
         it("returns inserted=true on new row", async () => {
           insertChain.returning.mockResolvedValueOnce([{ id: "stripe:evt_1" }]);
           const result = await insertWebhookEvent({
             provider: "stripe",
             eventType: "checkout.session.completed",
             externalId: "evt_1",
             payloadRaw: "{}",
           });
           expect(result.inserted).toBe(true);
           expect(result.eventKey).toBe("stripe:evt_1");
         });

         it("returns inserted=false on conflict", async () => {
           insertChain.returning.mockResolvedValueOnce([]);
           const result = await insertWebhookEvent({
             provider: "whatsapp",
             eventType: "messages.inbound",
             externalId: "wamid_abc",
             payloadRaw: "{}",
           });
           expect(result.inserted).toBe(false);
           expect(result.eventKey).toBe("whatsapp:wamid_abc");
         });
       });
       ```

    8. Create `apps/edge-webhooks/.env.example`:
       ```
       # Database (Neon)
       DATABASE_URL=postgres://user:pass@ep-foo-pooler.c-8.us-east-1.aws.neon.tech/db
       DATABASE_URL_UNPOOLED=postgres://user:pass@ep-foo.c-8.us-east-1.aws.neon.tech/db

       # Stripe
       STRIPE_SECRET_KEY=sk_test_xxx
       STRIPE_WEBHOOK_SECRET=whsec_xxx

       # WhatsApp
       WHATSAPP_VERIFY_TOKEN=demo_verify_token
       WHATSAPP_APP_SECRET=demo_app_secret

       # Runtime
       PORT=3001
       NODE_ENV=development
       GIT_SHA=dev
       ```

    9. Create `apps/edge-webhooks/.dockerignore`:
       ```
       node_modules
       dist
       .env*
       *.log
       .git
       ```

    10. Run `pnpm install` at repo root.
    11. Run `pnpm --filter @gymos/edge-webhooks test` — idempotency tests must pass.
    12. Run `pnpm --filter @gymos/edge-webhooks typecheck` — must exit 0.
    13. Run `npx prettier --write apps/edge-webhooks/**/*.{ts,json}`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/edge-webhooks typecheck 2>&amp;1 | tail -10 &amp;&amp; pnpm --filter @gymos/edge-webhooks test 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `apps/edge-webhooks/package.json` contains `"name": "@gymos/edge-webhooks"` AND `"hono"`, `"stripe"`, `"@gymos/queue"`, `"@gymos/whatsapp"` in dependencies
    - `apps/edge-webhooks/src/lib/env.ts` contains string `DATABASE_URL_UNPOOLED` AND `!u.includes("-pooler")` (the guard)
    - `apps/edge-webhooks/src/lib/stripe.ts` contains string `"2026-04-22.dahlia"` (apiVersion pin)
    - `apps/edge-webhooks/src/lib/idempotency.ts` contains string `onConflictDoNothing` AND `provider` AND `externalId`
    - `pnpm --filter @gymos/edge-webhooks test` exits 0
    - `pnpm --filter @gymos/edge-webhooks typecheck` exits 0
    - No `.js` source files in src/ — `grep -rn "" apps/edge-webhooks/src/ --include="*.js"` returns nothing
  </acceptance_criteria>
  <done>edge-webhooks workspace package exists with lib/ helpers + env validation; idempotency helper tested; typechecks clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement Hono routes — WhatsApp (GET verify + POST inbound/status) + Stripe (POST) + /healthz</name>
  <files>apps/edge-webhooks/src/server.ts, apps/edge-webhooks/src/index.ts, apps/edge-webhooks/src/routes/whatsapp.ts, apps/edge-webhooks/src/routes/stripe.ts, apps/edge-webhooks/src/routes/whatsapp.test.ts, apps/edge-webhooks/src/routes/stripe.test.ts</files>
  <read_first>
    - templates/mail/app/routes/webhooks.whatsapp.tsx (full file — port the patterns verbatim, change from RR-v7 action() to Hono c.req.text())
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 1" (lines 302-441) — exact Hono code
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #9 (raw body before parse)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-03 endpoints, D-04 parallel-run cutover)
    - packages/whatsapp/src/verify-signature.ts (the verify function)
    - packages/queue/src/publish.ts (the publisher signatures)
    - apps/edge-webhooks/src/lib/idempotency.ts (insertWebhookEvent from Task 1)
  </read_first>
  <behavior>
    - GET /webhooks/whatsapp returns hub.challenge text on subscribe+token match (200); returns 403 on mismatch
    - POST /webhooks/whatsapp:
      * Reads `await c.req.text()` BEFORE any JSON parse
      * Calls verifySignature(raw, sigHeader, env.WHATSAPP_APP_SECRET) — returns 401 on false
      * Parses JSON only after verify
      * For each msg in payload.entry[].changes[].value.messages: inserts webhook_events with externalId=msg.id, eventType="messages.inbound" — enqueueInboundWhatsApp({ externalId, isStatus: false })
      * For each status in payload.entry[].changes[].value.statuses: inserts with externalId=`wamid_status_${status.id}_${status.timestamp}`, eventType="messages.status" — enqueueInboundWhatsApp({ externalId, isStatus: true })
      * Only enqueues if insertWebhookEvent returns inserted=true
      * Returns 200 OK in <100ms
    - POST /webhooks/stripe:
      * Reads `await c.req.text()` BEFORE any JSON parse
      * Calls stripe.webhooks.constructEvent(raw, sigHeader, env.STRIPE_WEBHOOK_SECRET) — try/catch; returns 400 on throw
      * Inserts webhook_events with provider="stripe", externalId=event.id, eventType=event.type, payloadRaw=raw
      * Only enqueues if insertWebhookEvent returns inserted=true — enqueueStripeEvent({ eventId: event.id })
      * Returns 200 OK
    - GET /healthz returns 200 + JSON { ok: true, version: env.GIT_SHA, app: "edge-webhooks" }
    - server.ts mounts routes at /webhooks/* + /healthz; listens on env.PORT (default 3001)
    - Tests: tampered Stripe body → 400 (BEFORE any DB call); valid Stripe sig → 200; invalid WA HMAC → 401; valid WA inbound → 200 + enqueue called
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/edge-webhooks/src/routes/whatsapp.ts`:
       ```ts
       import { Hono } from "hono";
       import { verifySignature } from "@gymos/whatsapp";
       import { enqueueInboundWhatsApp } from "@gymos/queue";
       import { getEnv } from "../lib/env.js";
       import { insertWebhookEvent } from "../lib/idempotency.js";

       export const whatsappRoutes = new Hono();

       // GET — Meta verify_token handshake (called once at webhook registration)
       whatsappRoutes.get("/whatsapp", (c) => {
         const env = getEnv();
         const mode = c.req.query("hub.mode");
         const token = c.req.query("hub.verify_token");
         const challenge = c.req.query("hub.challenge");
         if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
           return c.text(challenge ?? "", 200);
         }
         return c.text("Forbidden", 403);
       });

       // POST — inbound messages + status updates
       whatsappRoutes.post("/whatsapp", async (c) => {
         const env = getEnv();

         // 1. RAW BODY FIRST (PITFALL #9 — never c.req.json() before this)
         const raw = await c.req.text();
         const sigHeader = c.req.header("x-hub-signature-256") ?? "";

         // 2. Verify HMAC using @gymos/whatsapp adapter
         if (!verifySignature(raw, sigHeader, env.WHATSAPP_APP_SECRET)) {
           return c.text("Bad signature", 401);
         }

         // 3. Parse JSON (safe AFTER verify)
         let payload: unknown;
         try {
           payload = JSON.parse(raw);
         } catch {
           return c.text("Bad JSON", 400);
         }

         // 4. Persist + enqueue each item (idempotent on (provider, external_id))
         //    Receiver does NO business logic — worker handles materialisation.
         const entries: any[] = (payload as any)?.entry ?? [];
         for (const entry of entries) {
           const changes: any[] = entry?.changes ?? [];
           for (const change of changes) {
             const value = change?.value;
             // Inbound messages (WA-03)
             for (const msg of value?.messages ?? []) {
               const externalId = msg.id; // wamid
               const result = await insertWebhookEvent({
                 provider: "whatsapp",
                 eventType: "messages.inbound",
                 externalId,
                 payloadRaw: raw,
               });
               if (result.inserted) {
                 await enqueueInboundWhatsApp({ externalId, isStatus: false });
               }
             }
             // Status updates (WA-04) — different externalId namespace so status
             // for same wamid as inbound isn't deduped against the inbound row
             for (const status of value?.statuses ?? []) {
               const externalId = `wamid_status_${status.id}_${status.timestamp ?? ""}_${status.status ?? ""}`;
               const result = await insertWebhookEvent({
                 provider: "whatsapp",
                 eventType: "messages.status",
                 externalId,
                 payloadRaw: raw,
               });
               if (result.inserted) {
                 await enqueueInboundWhatsApp({ externalId, isStatus: true });
               }
             }
           }
         }

         return c.text("OK", 200);
       });
       ```

    2. Create `apps/edge-webhooks/src/routes/stripe.ts`:
       ```ts
       import { Hono } from "hono";
       import type Stripe from "stripe";
       import { enqueueStripeEvent } from "@gymos/queue";
       import { getEnv } from "../lib/env.js";
       import { getStripe } from "../lib/stripe.js";
       import { insertWebhookEvent } from "../lib/idempotency.js";

       export const stripeRoutes = new Hono();

       stripeRoutes.post("/stripe", async (c) => {
         const env = getEnv();
         const sigHeader = c.req.header("stripe-signature");
         if (!sigHeader) return c.text("Missing stripe-signature", 400);

         // 1. RAW BODY FIRST (PITFALL #9)
         const raw = await c.req.text();

         // 2. constructEvent verifies HMAC + parses atomically. Throws on tamper.
         //    Per success criterion #5: tampered body returns 400 BEFORE any business work.
         let event: Stripe.Event;
         try {
           event = getStripe().webhooks.constructEvent(raw, sigHeader, env.STRIPE_WEBHOOK_SECRET);
         } catch {
           return c.text("invalid signature", 400);
         }

         // 3. Idempotency
         const result = await insertWebhookEvent({
           provider: "stripe",
           eventType: event.type,
           externalId: event.id,
           payloadRaw: raw,
         });

         if (!result.inserted) {
           // Stripe retry — already in the pipeline. Acknowledge to stop retries.
           return c.text("ok (dedup)", 200);
         }

         // 4. Enqueue for worker
         await enqueueStripeEvent({ eventId: event.id });

         return c.text("ok", 200); // budget <100ms
       });
       ```

    3. Create `apps/edge-webhooks/src/server.ts`:
       ```ts
       import { Hono } from "hono";
       import { whatsappRoutes } from "./routes/whatsapp.js";
       import { stripeRoutes } from "./routes/stripe.js";
       import { getEnv } from "./lib/env.js";

       export function buildApp() {
         const app = new Hono();

         app.get("/healthz", (c) => {
           const env = getEnv();
           return c.json({ ok: true, version: env.GIT_SHA, app: "edge-webhooks" });
         });

         app.route("/webhooks", whatsappRoutes);
         app.route("/webhooks", stripeRoutes);

         return app;
       }
       ```

    4. Create `apps/edge-webhooks/src/index.ts`:
       ```ts
       import { serve } from "@hono/node-server";
       import { buildApp } from "./server.js";
       import { getEnv } from "./lib/env.js";

       const env = getEnv(); // fail-fast on bad env
       const app = buildApp();

       serve({ fetch: app.fetch, port: env.PORT }, (info) => {
         console.log(`[edge-webhooks] listening on :${info.port} (version=${env.GIT_SHA})`);
       });
       ```

    5. Create `apps/edge-webhooks/src/routes/stripe.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";

       // Mock env
       vi.mock("../lib/env.js", () => ({
         getEnv: () => ({
           STRIPE_SECRET_KEY: "sk_test_xxx",
           STRIPE_WEBHOOK_SECRET: "whsec_xxx",
           WHATSAPP_VERIFY_TOKEN: "demo",
           WHATSAPP_APP_SECRET: "demo",
           DATABASE_URL: "postgres://x",
           DATABASE_URL_UNPOOLED: "postgres://x",
           GIT_SHA: "test",
           NODE_ENV: "test",
           PORT: 3001,
         }),
       }));

       // Mock stripe SDK
       const constructEvent = vi.fn();
       vi.mock("../lib/stripe.js", () => ({
         getStripe: () => ({ webhooks: { constructEvent } }),
       }));

       // Mock idempotency + queue
       const insertWebhookEvent = vi.fn();
       vi.mock("../lib/idempotency.js", () => ({ insertWebhookEvent }));
       const enqueueStripeEvent = vi.fn();
       vi.mock("@gymos/queue", () => ({ enqueueStripeEvent }));

       import { buildApp } from "../server.js";

       describe("POST /webhooks/stripe", () => {
         beforeEach(() => {
           constructEvent.mockReset();
           insertWebhookEvent.mockReset();
           enqueueStripeEvent.mockReset();
         });

         it("returns 400 for tampered body (BEFORE any DB write)", async () => {
           constructEvent.mockImplementation(() => {
             throw new Error("Invalid signature");
           });
           const app = buildApp();
           const res = await app.request("/webhooks/stripe", {
             method: "POST",
             headers: { "stripe-signature": "t=1,v1=bad" },
             body: '{"id":"evt_tampered"}',
           });
           expect(res.status).toBe(400);
           expect(insertWebhookEvent).not.toHaveBeenCalled();
           expect(enqueueStripeEvent).not.toHaveBeenCalled();
         });

         it("returns 400 when stripe-signature header missing", async () => {
           const app = buildApp();
           const res = await app.request("/webhooks/stripe", {
             method: "POST",
             body: "{}",
           });
           expect(res.status).toBe(400);
           expect(constructEvent).not.toHaveBeenCalled();
         });

         it("returns 200 and enqueues on new event", async () => {
           constructEvent.mockReturnValue({ id: "evt_abc", type: "checkout.session.completed" });
           insertWebhookEvent.mockResolvedValue({ inserted: true, eventKey: "stripe:evt_abc" });
           const app = buildApp();
           const res = await app.request("/webhooks/stripe", {
             method: "POST",
             headers: { "stripe-signature": "t=1,v1=good" },
             body: '{"id":"evt_abc"}',
           });
           expect(res.status).toBe(200);
           expect(enqueueStripeEvent).toHaveBeenCalledWith({ eventId: "evt_abc" });
         });

         it("returns 200 but skips enqueue on duplicate", async () => {
           constructEvent.mockReturnValue({ id: "evt_dup", type: "checkout.session.completed" });
           insertWebhookEvent.mockResolvedValue({ inserted: false, eventKey: "stripe:evt_dup" });
           const app = buildApp();
           const res = await app.request("/webhooks/stripe", {
             method: "POST",
             headers: { "stripe-signature": "t=1,v1=good" },
             body: '{"id":"evt_dup"}',
           });
           expect(res.status).toBe(200);
           expect(enqueueStripeEvent).not.toHaveBeenCalled();
         });
       });

       describe("GET /healthz", () => {
         it("returns 200 with ok + version", async () => {
           const app = buildApp();
           const res = await app.request("/healthz");
           expect(res.status).toBe(200);
           const json = (await res.json()) as { ok: boolean; version: string };
           expect(json.ok).toBe(true);
           expect(json.version).toBe("test");
         });
       });
       ```

    6. Create `apps/edge-webhooks/src/routes/whatsapp.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";
       import crypto from "node:crypto";

       vi.mock("../lib/env.js", () => ({
         getEnv: () => ({
           STRIPE_SECRET_KEY: "sk_test",
           STRIPE_WEBHOOK_SECRET: "whsec_x",
           WHATSAPP_VERIFY_TOKEN: "demo_token",
           WHATSAPP_APP_SECRET: "demo_secret",
           DATABASE_URL: "postgres://x",
           DATABASE_URL_UNPOOLED: "postgres://x",
           GIT_SHA: "test",
           NODE_ENV: "test",
           PORT: 3001,
         }),
       }));

       const insertWebhookEvent = vi.fn();
       vi.mock("../lib/idempotency.js", () => ({ insertWebhookEvent }));
       const enqueueInboundWhatsApp = vi.fn();
       vi.mock("@gymos/queue", () => ({ enqueueInboundWhatsApp }));

       import { buildApp } from "../server.js";

       function validSig(body: string, secret: string): string {
         return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
       }

       describe("GET /webhooks/whatsapp", () => {
         it("returns challenge on valid token", async () => {
           const app = buildApp();
           const res = await app.request("/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=demo_token&hub.challenge=test123");
           expect(res.status).toBe(200);
           expect(await res.text()).toBe("test123");
         });

         it("returns 403 on invalid token", async () => {
           const app = buildApp();
           const res = await app.request("/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=test");
           expect(res.status).toBe(403);
         });
       });

       describe("POST /webhooks/whatsapp", () => {
         beforeEach(() => {
           insertWebhookEvent.mockReset();
           enqueueInboundWhatsApp.mockReset();
         });

         it("returns 401 on bad HMAC", async () => {
           const app = buildApp();
           const res = await app.request("/webhooks/whatsapp", {
             method: "POST",
             headers: { "x-hub-signature-256": "sha256=bad" },
             body: '{"entry":[]}',
           });
           expect(res.status).toBe(401);
           expect(insertWebhookEvent).not.toHaveBeenCalled();
         });

         it("enqueues inbound message on valid HMAC", async () => {
           insertWebhookEvent.mockResolvedValue({ inserted: true, eventKey: "whatsapp:wamid_abc" });
           const body = JSON.stringify({
             entry: [
               {
                 changes: [
                   {
                     value: {
                       messages: [{ id: "wamid_abc", from: "447700900000", type: "text", text: { body: "hi" } }],
                     },
                   },
                 ],
               },
             ],
           });
           const sig = validSig(body, "demo_secret");
           const app = buildApp();
           const res = await app.request("/webhooks/whatsapp", {
             method: "POST",
             headers: { "x-hub-signature-256": sig },
             body,
           });
           expect(res.status).toBe(200);
           expect(enqueueInboundWhatsApp).toHaveBeenCalledWith({ externalId: "wamid_abc", isStatus: false });
         });

         it("skips enqueue on duplicate (idempotency)", async () => {
           insertWebhookEvent.mockResolvedValue({ inserted: false, eventKey: "whatsapp:wamid_dup" });
           const body = JSON.stringify({
             entry: [{ changes: [{ value: { messages: [{ id: "wamid_dup", from: "1", type: "text", text: { body: "x" } }] } }] }],
           });
           const sig = validSig(body, "demo_secret");
           const app = buildApp();
           const res = await app.request("/webhooks/whatsapp", {
             method: "POST",
             headers: { "x-hub-signature-256": sig },
             body,
           });
           expect(res.status).toBe(200);
           expect(enqueueInboundWhatsApp).not.toHaveBeenCalled();
         });
       });
       ```

    7. Run `pnpm --filter @gymos/edge-webhooks test` — all tests pass.
    8. Run `pnpm --filter @gymos/edge-webhooks typecheck` — exits 0.
    9. Run `npx prettier --write apps/edge-webhooks/src/**/*.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/edge-webhooks test 2>&amp;1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `apps/edge-webhooks/src/routes/whatsapp.ts` contains string `await c.req.text()` (raw body discipline per PITFALL #9)
    - `apps/edge-webhooks/src/routes/whatsapp.ts` contains string `verifySignature(raw, sigHeader, env.WHATSAPP_APP_SECRET)` (HMAC verify)
    - `apps/edge-webhooks/src/routes/whatsapp.ts` contains string `enqueueInboundWhatsApp` (publisher call)
    - `apps/edge-webhooks/src/routes/stripe.ts` contains string `stripe.webhooks.constructEvent` OR `getStripe().webhooks.constructEvent` (constructEvent pattern)
    - `apps/edge-webhooks/src/routes/stripe.ts` contains string `enqueueStripeEvent` (publisher call)
    - `apps/edge-webhooks/src/routes/stripe.ts` returns 400 on constructEvent throw BEFORE calling insertWebhookEvent (verified by test "returns 400 for tampered body (BEFORE any DB write)")
    - `apps/edge-webhooks/src/server.ts` contains string `/healthz`
    - All tests pass — `pnpm --filter @gymos/edge-webhooks test` exits 0 (minimum 8 test cases: 2 healthz + 4 stripe + 4 whatsapp)
    - `pnpm --filter @gymos/edge-webhooks typecheck` exits 0
  </acceptance_criteria>
  <done>Hono app receives both webhook types with proper raw-body-first HMAC discipline; idempotent inserts; enqueues only on inserted=true; tests cover the 6 invariants from must_haves.</done>
</task>

<task type="auto">
  <name>Task 3: Author fly.toml + Dockerfile for two-process Fly app (web + worker placeholder)</name>
  <files>apps/edge-webhooks/fly.toml, Dockerfile, .dockerignore</files>
  <read_first>
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-01 two-process model)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"fly.toml — two-process app" lines 1352-1410
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Dockerfile (shared, repo root)" lines 1412-1439
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #2 (Fly region — choose iad NOT lhr)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #8 (Vercel cold-start storms — auto_stop_machines=false)
    - apps/edge-webhooks/src/index.ts (worker entry will exist in Plan 05 — placeholder for now)
    - CLAUDE.md (no-emojis-as-icons doesn't apply to ops config)
  </read_first>
  <action>
    Concrete steps:

    1. Create `apps/edge-webhooks/fly.toml` with two-process [processes] block, region iad, min_machines_running=1, auto_stop_machines=false:
       ```toml
       # GymOS edge-webhooks + worker — single Fly app, two processes (D-01).
       #
       # CRITICAL: region = "iad" (Virginia) NOT "lhr" (London) per P1b RESEARCH finding.
       # Neon project gymos-demo lives in us-east-1; lhr⇄us-east-1 RTT is ~75-90ms which
       # blows the webhook hot path budget. Revisit at P0 cutover if customer-facing
       # latency becomes the priority (option: migrate Neon to eu-west-1 + Fly to lhr).
       app = "gymos-edge-webhooks"
       primary_region = "iad"

       [build]
       dockerfile = "../../Dockerfile"

       [env]
       NODE_ENV = "production"
       PORT = "3001"

       # Two processes — same image, different entrypoints.
       # The worker process is wired up in Plan P1b-05; this file references it now so
       # we don't have to re-deploy after Plan 05 lands.
       [processes]
       web = "node apps/edge-webhooks/dist/index.js"
       worker = "node apps/worker/dist/index.js"

       # HTTP service — ONLY for web process (worker has no port)
       [[services]]
       protocol = "tcp"
       internal_port = 3001
       processes = ["web"]

         [[services.ports]]
         port = 443
         handlers = ["tls", "http"]

         [[services.ports]]
         port = 80
         handlers = ["http"]
         force_https = true

         [services.concurrency]
         type = "requests"
         hard_limit = 200
         soft_limit = 100

       # Per-process VM sizing
       [[vm]]
       size = "shared-cpu-1x"
       memory = "512mb"
       processes = ["web"]

       [[vm]]
       size = "shared-cpu-1x"
       memory = "512mb"
       processes = ["worker"]

       # CRITICAL: always-on machine policy (PITFALL #8 + WEB-01)
       [http_service]
       internal_port = 3001
       force_https = true
       auto_stop_machines = false
       auto_start_machines = true
       min_machines_running = 1
       processes = ["web"]

         [[http_service.checks]]
         grace_period = "10s"
         interval = "30s"
         method = "GET"
         path = "/healthz"
         protocol = "http"
         timeout = "5s"
       ```

    2. Create repo-root `Dockerfile` (shared for both apps — multi-stage):
       ```dockerfile
       # syntax=docker/dockerfile:1.7

       # GymOS Fly image — builds BOTH apps/edge-webhooks AND apps/worker.
       # fly.toml [processes] selects which entrypoint runs.

       FROM node:22-alpine AS base
       RUN corepack enable && corepack prepare pnpm@10.29.1 --activate
       WORKDIR /repo

       # ---- deps stage: install workspace deps ----
       FROM base AS deps
       COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
       COPY apps/edge-webhooks/package.json apps/edge-webhooks/
       COPY apps/worker/package.json apps/worker/
       COPY apps/staff-web/package.json apps/staff-web/
       COPY packages/ packages/
       RUN pnpm install --frozen-lockfile \
           --filter "@gymos/edge-webhooks..." \
           --filter "@gymos/worker..." \
           --ignore-scripts

       # ---- build stage: compile TS ----
       FROM deps AS build
       COPY apps/edge-webhooks/ apps/edge-webhooks/
       COPY apps/worker/ apps/worker/
       COPY apps/staff-web/server/db/ apps/staff-web/server/db/
       COPY packages/ packages/
       RUN pnpm --filter @gymos/edge-webhooks build
       RUN pnpm --filter @gymos/worker build

       # ---- runtime stage ----
       FROM base AS runtime
       COPY --from=deps  /repo/node_modules /repo/node_modules
       COPY --from=deps  /repo/apps/edge-webhooks/node_modules /repo/apps/edge-webhooks/node_modules
       COPY --from=deps  /repo/apps/worker/node_modules /repo/apps/worker/node_modules
       COPY --from=build /repo/apps/edge-webhooks/dist /repo/apps/edge-webhooks/dist
       COPY --from=build /repo/apps/worker/dist /repo/apps/worker/dist
       COPY --from=build /repo/apps/staff-web/server/db /repo/apps/staff-web/server/db
       COPY --from=build /repo/packages /repo/packages
       # fly.toml [processes] picks the entrypoint; default is web.
       CMD ["node", "apps/edge-webhooks/dist/index.js"]
       ```

    3. Create / update repo-root `.dockerignore` (append, don't replace):
       ```
       **/node_modules
       **/dist
       **/.env
       **/.env.*
       !**/.env.example
       .git
       .planning
       templates
       *.log
       ```

    4. Add a build script to `apps/edge-webhooks/package.json` if not already there:
       ```json
       "scripts": {
         "build": "tsc -p tsconfig.json"
       }
       ```
       (Task 1 already added it.)

    5. Update `apps/edge-webhooks/tsconfig.json` to set `noEmit: false` for build mode. Actually keep `noEmit: false` in a separate `tsconfig.build.json` OR set `noEmit: false` and rely on `outDir`. Simpler: change `noEmit` to `false` and ensure `outDir: "./dist"`. The typecheck script uses `tsc --noEmit` flag which overrides.

    6. Run `pnpm --filter @gymos/edge-webhooks build` locally to verify TS compiles cleanly. Should emit to `apps/edge-webhooks/dist/`.

    7. Worker placeholder: Plan 05 creates apps/worker/. To keep Dockerfile honest in the meantime, create a stub `apps/worker/package.json` + `apps/worker/src/index.ts` with `console.log("worker not yet implemented — Plan 05")` so the Dockerfile COPY+build steps don't fail. Plan 05 will replace these files.

       Files to create as stubs:
       - apps/worker/package.json: name=@gymos/worker, scripts.build=tsc, peer Node 22
       - apps/worker/tsconfig.json: same shape as edge-webhooks/tsconfig.json
       - apps/worker/src/index.ts: `console.log("[worker] placeholder — see Plan P1b-05"); setInterval(() => {}, 60000);`

    8. Run `pnpm --filter @gymos/worker build` to confirm Dockerfile-build path works.

    9. Run `npx prettier --write apps/edge-webhooks/fly.toml apps/worker/**/*.{ts,json}`. (prettier doesn't format .toml but won't crash.)
  </action>
  <verify>
    <automated>pnpm --filter @gymos/edge-webhooks build 2>&amp;1 | tail -10 &amp;&amp; pnpm --filter @gymos/worker build 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `apps/edge-webhooks/fly.toml` contains string `primary_region = "iad"` (NOT "lhr" — research override of CONTEXT D-02)
    - `apps/edge-webhooks/fly.toml` contains string `auto_stop_machines = false` (PITFALL #8)
    - `apps/edge-webhooks/fly.toml` contains string `min_machines_running = 1` (WEB-01)
    - `apps/edge-webhooks/fly.toml` contains string `[processes]` AND `web =` AND `worker =`
    - Root-level `Dockerfile` EXISTS AND contains string `FROM node:22-alpine` (Node 22 for @great-detail/whatsapp v9)
    - `Dockerfile` contains string `corepack enable` (pnpm via corepack)
    - `Dockerfile` contains string `pnpm install --frozen-lockfile`
    - `pnpm --filter @gymos/edge-webhooks build` exits 0 AND emits `apps/edge-webhooks/dist/index.js`
    - `pnpm --filter @gymos/worker build` exits 0 (stub builds — Plan 05 fills it in)
    - `apps/worker/src/index.ts` EXISTS as placeholder with comment referencing Plan P1b-05
  </acceptance_criteria>
  <done>fly.toml + Dockerfile ready for `fly deploy`. Build chain produces dist/ for both apps.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Deploy to Fly + smoke-test signatures, idempotency, healthz</name>
  <what-built>
    apps/edge-webhooks/ Hono receiver compiled and ready to deploy to Fly.io region `iad`. Stripe + WhatsApp + healthz endpoints implemented with raw-body HMAC discipline + ON CONFLICT DO NOTHING idempotency + pg-boss enqueue. NOT yet wired to live Meta or Stripe — just a standalone receiver that's verifiable via curl + Stripe CLI.
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
    1. Ensure flyctl is installed: `flyctl version` (Windows install: `iwr https://fly.io/install.ps1 | iex`). Authenticate: `fly auth signup` (free; one-machine cost ~$5/mo) OR `fly auth login` if account exists.

    2. From repo root: create the Fly app:
       ```pwsh
       fly launch --copy-config --no-deploy --name gymos-edge-webhooks --region iad
       ```
       Accept the config at `apps/edge-webhooks/fly.toml`. Decline DB / Redis provisioning offers.

    3. Set Fly Secrets (NOT env vars — secrets are encrypted at rest):
       ```pwsh
       fly secrets set -a gymos-edge-webhooks `
         DATABASE_URL=<pooled-neon-url-from-.env.local> `
         DATABASE_URL_UNPOOLED=<unpooled-neon-url-strip-pooler-suffix> `
         STRIPE_SECRET_KEY=<sk_test_...> `
         STRIPE_WEBHOOK_SECRET=<whsec_test_...> `
         WHATSAPP_VERIFY_TOKEN=<same-as-templates/mail-.env.local> `
         WHATSAPP_APP_SECRET=<same-as-templates/mail-.env.local> `
         GIT_SHA=$(git rev-parse --short HEAD)
       ```

    4. Deploy:
       ```pwsh
       fly deploy -a gymos-edge-webhooks --remote-only
       ```
       Expected: build completes in ~3-5 min; machine starts in iad.

    5. Smoke tests against `https://gymos-edge-webhooks.fly.dev`:

       a. **Healthz**:
       ```pwsh
       curl https://gymos-edge-webhooks.fly.dev/healthz
       ```
       Expected: `{"ok":true,"version":"<git_sha>","app":"edge-webhooks"}`

       b. **WhatsApp verify handshake**:
       ```pwsh
       curl "https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test123"
       ```
       Expected: `test123` (200)

       c. **WhatsApp bad signature**:
       ```pwsh
       curl -X POST https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp `
         -H "x-hub-signature-256: sha256=bad" `
         -H "Content-Type: application/json" `
         -d '{"entry":[]}'
       ```
       Expected: `Bad signature` (401). Confirm NO new row in webhook_events.

       d. **Stripe tampered body** (success criterion #5):
       ```pwsh
       curl -X POST https://gymos-edge-webhooks.fly.dev/webhooks/stripe `
         -H "stripe-signature: t=1234567890,v1=bad" `
         -H "Content-Type: application/json" `
         -d '{"id":"evt_tampered"}'
       ```
       Expected: `invalid signature` (400). Confirm NO new row in webhook_events.

       e. **Stripe valid event via Stripe CLI**:
       ```pwsh
       # Install Stripe CLI if missing: scoop install stripe
       stripe listen --forward-to https://gymos-edge-webhooks.fly.dev/webhooks/stripe
       # In another terminal:
       stripe trigger checkout.session.completed
       ```
       Expected: receiver returns 200; one new row in `webhook_events` with `provider='stripe'`, `event_type='checkout.session.completed'`. Verify via mcp__Neon__run_sql:
       ```sql
       SELECT id, provider, event_type, external_id, received_at FROM webhook_events
       WHERE provider = 'stripe' ORDER BY received_at DESC LIMIT 5;
       ```

       f. **Stripe replay (idempotency)**:
       ```pwsh
       stripe events resend <event_id_from_step_e>
       ```
       Expected: receiver returns `ok (dedup)` (200) — no new row inserted. SELECT COUNT(*) WHERE id matches → still 1.

       g. **Confirm pg-boss received the enqueue**:
       ```sql
       SELECT id, name, state, data, singletonkey FROM pgboss.job
       WHERE name = 'stripe-event' ORDER BY createdon DESC LIMIT 5;
       ```
       Expected: 1 row with `state='created'` (or `'completed'` if worker is running — but worker isn't yet, so expect 'created' or 'active').

    6. Confirm latency budget: `time curl https://gymos-edge-webhooks.fly.dev/healthz` — expect < 500ms total round-trip from your local machine. Webhook POST cold-path expect < 1s; warm path < 200ms.

    Report any failures. Type "approved" only if all 7 smoke tests pass.
  </how-to-verify>
  <resume-signal>Type "approved" if all smoke tests pass. Otherwise paste the failing curl output + which step.</resume-signal>
  <acceptance_criteria>
    - User confirms `fly deploy` succeeded
    - User confirms /healthz returns expected JSON
    - User confirms WA verify-token handshake works
    - User confirms tampered Stripe body returns 400 (success criterion #5)
    - User confirms valid Stripe event creates webhook_events row + pgboss.job row
    - User confirms Stripe replay returns 200 dedup without creating new webhook_events row (success criterion #1 foundation — full replay-twice test in Plan 09)
  </acceptance_criteria>
  <done>apps/edge-webhooks/ is live on Fly at https://gymos-edge-webhooks.fly.dev/ with verified raw-body HMAC + idempotency + enqueue. Ready for Plans 05-07 to attach workers.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/edge-webhooks test` exits 0 (≥8 tests)
- `pnpm --filter @gymos/edge-webhooks build` produces dist/
- Fly deploy succeeds; /healthz returns 200
- Tampered body returns 400 BEFORE DB write (verified in test + smoke test)
- Stripe replay returns 200 without inserting duplicate
- pgboss.job rows appear after enqueue
</verification>

<success_criteria>
1. apps/edge-webhooks/ deployed to Fly region iad with min_machines=1 + auto_stop=false (PITFALL #8)
2. Raw-body-first HMAC verification on both endpoints (PITFALL #9)
3. ON CONFLICT (provider, external_id) DO NOTHING idempotency (WEB-03)
4. Stripe apiVersion pinned to '2026-04-22.dahlia' (PITFALL #3)
5. Two-process fly.toml provisioned (D-01) — web active, worker placeholder ready for Plan 05
6. All env vars Zod-validated at boot (fail-fast)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-04-SUMMARY.md` recording:
- Fly app name + URL
- Region chosen (iad — note the override of CONTEXT D-02 lhr based on RESEARCH finding)
- Test count + smoke-test results
- pgboss.job table sample showing enqueued jobs
- Any deviations (e.g. if Fly CLI auth was already configured, if Dockerfile needed adjustment)
- Notes for Plan 05 (worker) about how to read pgboss.job rows + where to set DATABASE_URL_UNPOOLED
</output>
