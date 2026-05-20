---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - packages/queue/package.json
  - packages/queue/tsconfig.json
  - packages/queue/src/index.ts
  - packages/queue/src/boss.ts
  - packages/queue/src/publish.ts
  - packages/queue/src/types.ts
  - packages/whatsapp/package.json
  - packages/whatsapp/tsconfig.json
  - packages/whatsapp/src/index.ts
  - packages/whatsapp/src/sdk-impl.ts
  - packages/whatsapp/src/types.ts
  - packages/whatsapp/src/verify-signature.ts
autonomous: true
requirements: [WA-09]
must_haves:
  truths:
    - "packages/queue/ exports typed publishers enqueueOutboundWhatsApp, enqueueInboundWhatsApp, enqueueStripeEvent, enqueueClassReminder (last stubbed for P2/NOTIF-01)"
    - "packages/queue/ uses pg-boss against DATABASE_URL_UNPOOLED (throws at construction if env var includes -pooler)"
    - "InboundWhatsAppPayload is a Zod discriminated union with kind='message' | kind='status' — status payloads carry explicit fields (statusFor, newStatus, timestamp, errorCode?) so the worker reads them directly without parsing a synthetic concat string (HIGH #6)"
    - "Each publisher applies pg-boss singletonKey per D-13: outbound-whatsapp:msg_<id>, stripe-event:stripe_<eventId>, inbound-whatsapp:msg_<externalId> for messages OR inbound-whatsapp:status_<statusFor>_<newStatus>_<timestamp> for statuses (status singletonKey must be derived from the structured fields, not a synthetic externalId)"
    - "packages/whatsapp/ exports sendText, sendTemplate, verifySignature — transport only, no gate logic"
    - "packages/whatsapp/ default impl uses @great-detail/whatsapp v9; verifySignature uses crypto.timingSafeEqual (preserved from demo pattern)"
    - "apps/staff-web/package.json MUST NOT depend on @gymos/whatsapp (compile-time enforced — D-11)"
  artifacts:
    - path: "packages/queue/src/publish.ts"
      provides: "Typed publisher functions consumed by apps/staff-web (Vercel) AND apps/edge-webhooks (Fly)"
      exports: ["enqueueOutboundWhatsApp", "enqueueInboundWhatsApp", "enqueueStripeEvent", "enqueueClassReminder"]
    - path: "packages/queue/src/types.ts"
      provides: "Zod-validated payload schemas — single source of truth for queue contracts. InboundWhatsAppPayload is a discriminated union (kind: 'message' | 'status') with explicit fields per variant (HIGH #6)"
      exports: ["OutboundWhatsAppPayload", "InboundWhatsAppPayload", "StripeEventPayload"]
    - path: "packages/queue/src/boss.ts"
      provides: "getBoss(env) PgBoss singleton with UNPOOLED connection guard"
      contains: "if (url.includes(\"-pooler\")) throw"
    - path: "packages/whatsapp/src/index.ts"
      provides: "Public API surface for transport adapter"
      exports: ["sendText", "sendTemplate", "verifySignature"]
    - path: "packages/whatsapp/src/sdk-impl.ts"
      provides: "Current implementation using @great-detail/whatsapp v9 sdk.message.createMessage"
  key_links:
    - from: "packages/queue/src/boss.ts"
      to: "process.env.DATABASE_URL_UNPOOLED"
      via: "ENV var read + -pooler hostname guard"
      pattern: "DATABASE_URL_UNPOOLED"
    - from: "packages/queue/src/publish.ts enqueueOutboundWhatsApp"
      to: "pg-boss boss.send with singletonKey"
      via: "singletonKey: `outbound-whatsapp:${data.messageId}`"
      pattern: "singletonKey.*outbound-whatsapp"
    - from: "packages/queue/src/types.ts InboundWhatsAppPayload"
      to: "discriminatedUnion on `kind` field"
      via: "z.discriminatedUnion('kind', [messageVariant, statusVariant]) — structured fields per variant"
      pattern: "discriminatedUnion.*kind"
    - from: "packages/whatsapp/src/verify-signature.ts"
      to: "crypto.timingSafeEqual"
      via: "constant-time HMAC comparison (preserved from templates/mail/app/routes/webhooks.whatsapp.tsx demo)"
      pattern: "timingSafeEqual"
---

<objective>
Stand up two new workspace packages: `packages/queue/` (typed pg-boss publishers consumed by both apps/staff-web AND apps/edge-webhooks) and `packages/whatsapp/` (thin transport adapter wrapping `@great-detail/whatsapp` v9 — the one and only path to Meta's send API per D-09, D-11). These packages are pure libraries — no apps consume them yet in this plan (Plans 04/05/06 do). Goal is to have stable contracts published as workspace packages so the next wave of plans builds against typed interfaces, not strings.

InboundWhatsAppPayload is a discriminated union with two variants (HIGH #6 fix): `{ kind: "message", externalId, from, messageType, body?, timestamp }` for inbound user-sent messages, and `{ kind: "status", statusFor, newStatus, timestamp, errorCode? }` for Meta-sent delivery/read/failed status updates. This replaces the previous fragile synthetic-string `wamid_status_<id>_<timestamp>_<status>` externalId reconstruction between receiver (Plan 04) and worker (Plan 05) — those two boundaries now share an explicit typed schema.

Purpose: D-09 (transport-only adapter, swap to hand-rolled is one-file change per PITFALL #19), D-11 (worker is the only caller of packages/whatsapp/), D-12 (shared typed publisher imported by Vercel + Fly), D-13 (singletonKey discipline per queue).
Output: Two workspace packages exporting tested, type-safe interfaces. apps/staff-web does NOT depend on packages/whatsapp.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@pnpm-workspace.yaml
@CLAUDE.md
@AGENTS.md
@templates/mail/app/routes/webhooks.whatsapp.tsx

<interfaces>
<!-- packages/queue/ public API -->

// publish.ts exports:
export async function enqueueOutboundWhatsApp(args: {
  messageId: string;       // local PK 'msg_<nanoid>'
  memberId: string;
  payload:
    | { type: "text"; body: string }
    | { type: "template"; name: string; vars: Record<string, string>; language?: string };
}): Promise<string | null>;   // pg-boss job ID or null on duplicate singletonKey

// HIGH #6: structured discriminated union — no synthetic string concat between receiver↔worker
export async function enqueueInboundWhatsApp(args: InboundWhatsAppPayload): Promise<string | null>;

export async function enqueueStripeEvent(args: {
  eventId: string;          // Stripe event.id 'evt_xxx'
}): Promise<string | null>;

export async function enqueueClassReminder(args: {
  bookingId: string;
  remindAt: string;         // ISO8601
}): Promise<string | null>;   // STUBBED in P1b — fully implemented in P2 NOTIF-01

// boss.ts exports:
export function getBoss(env?: { DATABASE_URL_UNPOOLED: string }): PgBoss;

// types.ts exports (Zod schemas):
export const OutboundWhatsAppPayload = z.object({...});

// HIGH #6 — discriminated union, NOT a flat { externalId, isStatus } object
export const InboundWhatsAppPayload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("message"),
    externalId: z.string().min(1),           // wamid of the inbound message
    from: z.string().min(7),                 // sender phone E.164 without +
    messageType: z.string().min(1),          // "text" | "image" | ...
    body: z.string().optional(),             // text only
    timestamp: z.string().optional(),        // Meta unix timestamp string
  }),
  z.object({
    kind: z.literal("status"),
    statusFor: z.string().min(1),            // wamid of the outbound message being updated
    newStatus: z.enum(["sent", "delivered", "read", "failed"]),
    timestamp: z.string().min(1),            // Meta unix timestamp string
    errorCode: z.string().optional(),        // Meta error code on "failed"
  }),
]);
export type InboundWhatsAppPayload = z.infer<typeof InboundWhatsAppPayload>;

export const StripeEventPayload = z.object({...});

<!-- packages/whatsapp/ public API -->

// index.ts exports:
export async function sendText(args: { to: string; body: string }): Promise<{ messageId: string }>;
export async function sendTemplate(args: {
  to: string;
  name: string;
  vars: Record<string, string>;
  language?: string;
}): Promise<{ messageId: string }>;
export function verifySignature(rawBody: string, sigHeader: string, appSecret: string): boolean;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create packages/whatsapp/ thin transport adapter (D-09)</name>
  <files>packages/whatsapp/package.json, packages/whatsapp/tsconfig.json, packages/whatsapp/src/index.ts, packages/whatsapp/src/sdk-impl.ts, packages/whatsapp/src/types.ts, packages/whatsapp/src/verify-signature.ts, packages/whatsapp/src/verify-signature.test.ts</files>
  <read_first>
    - templates/mail/app/routes/webhooks.whatsapp.tsx lines 52-67 (existing demo HMAC verify pattern — preserve byte-for-byte)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-09 transport-only, D-11 worker-only consumer)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"packages/whatsapp adapter — sdk-impl.ts" lines 1128-1181
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Standard Stack" — @great-detail/whatsapp version pin
    - CLAUDE.md (TypeScript only — never .js/.mjs; Node 22+ for @great-detail/whatsapp v9)
    - AGENTS.md (no-emojis-as-icons doesn't apply here — pure library)
  </read_first>
  <behavior>
    - sendText({to, body}) → calls sdk.message.createMessage with type='text', returns { messageId } from result.messages[0].id
    - sendTemplate({to, name, vars, language?}) → calls sdk.message.createMessage with type='template', language defaults 'en_US', returns { messageId }
    - verifySignature(rawBody, sigHeader, appSecret) → computes 'sha256=' + HMAC-SHA256, uses crypto.timingSafeEqual; returns true/false
    - verifySignature returns false for length mismatch (no timing attack)
    - verifySignature returns true for valid signature (round-trip test: compute valid sig, then verify it)
    - verifySignature returns false for empty signature header
    - Test file `verify-signature.test.ts` covers: valid sig → true; tampered body → false; wrong secret → false; length mismatch → false
  </behavior>
  <action>
    Concrete steps:

    1. Create `packages/whatsapp/package.json`:
       ```json
       {
         "name": "@gymos/whatsapp",
         "version": "0.1.0",
         "private": true,
         "type": "module",
         "main": "./src/index.ts",
         "types": "./src/index.ts",
         "exports": {
           ".": {
             "types": "./src/index.ts",
             "import": "./src/index.ts"
           }
         },
         "scripts": {
           "typecheck": "tsc --noEmit",
           "test": "vitest run"
         },
         "dependencies": {
           "@great-detail/whatsapp": "^9.0.0",
           "zod": "^4.0.0"
         },
         "devDependencies": {
           "typescript": "catalog:",
           "vitest": "^2.0.0",
           "@types/node": "^22.0.0"
         },
         "engines": {
           "node": ">=22"
         }
       }
       ```

    2. Create `packages/whatsapp/tsconfig.json`:
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
           "allowSyntheticDefaultImports": true,
           "isolatedModules": true,
           "noEmit": true
         },
         "include": ["src/**/*"]
       }
       ```

    3. Create `packages/whatsapp/src/types.ts`:
       ```ts
       import { z } from "zod";

       export const SendTextArgs = z.object({
         to: z.string().min(7), // E.164 without leading +, e.g. "447700900000"
         body: z.string().min(1).max(4096),
       });
       export type SendTextArgs = z.infer<typeof SendTextArgs>;

       export const SendTemplateArgs = z.object({
         to: z.string().min(7),
         name: z.string().min(1),
         vars: z.record(z.string(), z.string()),
         language: z.string().optional().default("en_US"),
       });
       export type SendTemplateArgs = z.infer<typeof SendTemplateArgs>;

       export type SendResult = { messageId: string };
       ```

    4. Create `packages/whatsapp/src/verify-signature.ts` — PRESERVE the demo's pattern verbatim:
       ```ts
       import crypto from "node:crypto";

       /**
        * Verify Meta's X-Hub-Signature-256 header against the raw body.
        *
        * Pattern preserved from templates/mail/app/routes/webhooks.whatsapp.tsx
        * lines 52-67 (the demo's HMAC verify is correct; do not deviate).
        *
        * Returns false on:
        *  - empty/missing signature header
        *  - length mismatch (which timingSafeEqual would reject anyway)
        *  - HMAC mismatch
        */
       export function verifySignature(
         rawBody: string,
         sigHeader: string,
         appSecret: string,
       ): boolean {
         if (!sigHeader || !appSecret) return false;
         const expected =
           "sha256=" +
           crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
         const sigBuf = Buffer.from(sigHeader);
         const expBuf = Buffer.from(expected);
         if (sigBuf.length !== expBuf.length) return false;
         return crypto.timingSafeEqual(sigBuf, expBuf);
       }
       ```

    5. Create `packages/whatsapp/src/sdk-impl.ts`:
       ```ts
       import { SDK } from "@great-detail/whatsapp";
       import type { SendTextArgs, SendTemplateArgs, SendResult } from "./types.js";
       import { SendTextArgs as SendTextSchema, SendTemplateArgs as SendTemplateSchema } from "./types.js";

       let _sdk: SDK | undefined;

       function getSdk(): SDK {
         if (_sdk) return _sdk;
         const token = process.env.WHATSAPP_ACCESS_TOKEN;
         if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
         _sdk = new SDK({ accessToken: token });
         return _sdk;
       }

       function getPhoneNumberId(): string {
         const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
         if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
         return id;
       }

       export async function sendText(args: SendTextArgs): Promise<SendResult> {
         const validated = SendTextSchema.parse(args);
         const sdk = getSdk();
         const result = await sdk.message.createMessage({
           phoneNumberID: getPhoneNumberId(),
           to: validated.to,
           type: "text",
           text: { body: validated.body },
         });
         return { messageId: result.messages[0].id };
       }

       export async function sendTemplate(args: SendTemplateArgs): Promise<SendResult> {
         const validated = SendTemplateSchema.parse(args);
         const components = Object.values(validated.vars).map((v) => ({
           type: "body" as const,
           parameters: [{ type: "text" as const, text: v }],
         }));
         const sdk = getSdk();
         const result = await sdk.message.createMessage({
           phoneNumberID: getPhoneNumberId(),
           to: validated.to,
           type: "template",
           template: {
             name: validated.name,
             language: { code: validated.language ?? "en_US" },
             components,
           },
         });
         return { messageId: result.messages[0].id };
       }
       ```

    6. Create `packages/whatsapp/src/index.ts` (barrel export):
       ```ts
       export { sendText, sendTemplate } from "./sdk-impl.js";
       export { verifySignature } from "./verify-signature.js";
       export type { SendTextArgs, SendTemplateArgs, SendResult } from "./types.js";
       ```

    7. Create `packages/whatsapp/src/verify-signature.test.ts`:
       ```ts
       import { describe, it, expect } from "vitest";
       import crypto from "node:crypto";
       import { verifySignature } from "./verify-signature.js";

       const SECRET = "test_app_secret_abcdef";
       const BODY = '{"object":"whatsapp_business_account","entry":[{}]}';

       function validSig(body: string, secret: string): string {
         return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
       }

       describe("verifySignature", () => {
         it("returns true for valid signature", () => {
           const sig = validSig(BODY, SECRET);
           expect(verifySignature(BODY, sig, SECRET)).toBe(true);
         });

         it("returns false for tampered body", () => {
           const sig = validSig(BODY, SECRET);
           expect(verifySignature(BODY + "X", sig, SECRET)).toBe(false);
         });

         it("returns false for wrong secret", () => {
           const sig = validSig(BODY, SECRET);
           expect(verifySignature(BODY, sig, "wrong_secret")).toBe(false);
         });

         it("returns false for length mismatch", () => {
           expect(verifySignature(BODY, "sha256=tooshort", SECRET)).toBe(false);
         });

         it("returns false for empty header", () => {
           expect(verifySignature(BODY, "", SECRET)).toBe(false);
         });

         it("returns false for empty secret", () => {
           const sig = validSig(BODY, SECRET);
           expect(verifySignature(BODY, sig, "")).toBe(false);
         });
       });
       ```

    8. Run `pnpm install` at repo root (registers the workspace).
    9. Run `pnpm --filter @gymos/whatsapp test` — all 6 tests must pass.
    10. Run `pnpm --filter @gymos/whatsapp typecheck` — must exit 0.
    11. Run `npx prettier --write packages/whatsapp/**/*.{ts,json,md}`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/whatsapp test 2>&amp;1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `packages/whatsapp/package.json` exists AND contains `"name": "@gymos/whatsapp"` AND `"@great-detail/whatsapp"` in dependencies
    - `packages/whatsapp/src/verify-signature.ts` contains string `crypto.timingSafeEqual` (constant-time compare per templates/mail demo pattern)
    - `packages/whatsapp/src/sdk-impl.ts` contains string `sdk.message.createMessage` (the v9 API)
    - `packages/whatsapp/src/sdk-impl.ts` contains string `WHATSAPP_ACCESS_TOKEN` AND `WHATSAPP_PHONE_NUMBER_ID` (env reads)
    - `packages/whatsapp/src/index.ts` contains `export.*sendText` AND `export.*sendTemplate` AND `export.*verifySignature`
    - `pnpm --filter @gymos/whatsapp test` exits 0 with all 6 tests passing
    - `pnpm --filter @gymos/whatsapp typecheck` exits 0
    - File extension is `.ts` everywhere — `grep -r "\.js$\|\.mjs$" packages/whatsapp/src/` returns nothing (CLAUDE.md TypeScript-everywhere rule)
  </acceptance_criteria>
  <done>packages/whatsapp/ is published as workspace package @gymos/whatsapp with sendText / sendTemplate / verifySignature exports; 6 unit tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create packages/queue/ typed pg-boss publisher (D-12, D-13) with discriminated InboundWhatsAppPayload (HIGH #6)</name>
  <files>packages/queue/package.json, packages/queue/tsconfig.json, packages/queue/src/index.ts, packages/queue/src/boss.ts, packages/queue/src/publish.ts, packages/queue/src/types.ts, packages/queue/src/boss.test.ts, packages/queue/src/publish.test.ts</files>
  <read_first>
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-12 publisher names, D-13 singletonKey convention)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 4: pg-boss on Neon — UNPOOLED Connection (CRITICAL)" lines 826-916
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pitfall 1: pg-boss against the pooled Neon endpoint"
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Open Questions #3" (edge-webhooks pooled, worker unpooled)
    - CLAUDE.md (TypeScript everywhere; no .js/.mjs)
  </read_first>
  <behavior>
    - getBoss() reads DATABASE_URL_UNPOOLED env var
    - getBoss() throws if DATABASE_URL_UNPOOLED is missing
    - getBoss() throws if DATABASE_URL_UNPOOLED contains "-pooler" (Neon pooler hostname check per PITFALL #1)
    - getBoss() returns same instance on subsequent calls (singleton)
    - enqueueOutboundWhatsApp validates payload via Zod, calls boss.send with singletonKey 'outbound-whatsapp:msg_<messageId>'
    - enqueueStripeEvent uses singletonKey 'stripe-event:stripe_<eventId>'
    - enqueueInboundWhatsApp accepts a discriminated union (HIGH #6):
        * `kind: "message"` variant — singletonKey = `inbound-whatsapp:msg_${data.externalId}` (wamid of inbound)
        * `kind: "status"` variant — singletonKey = `inbound-whatsapp:status_${data.statusFor}_${data.newStatus}_${data.timestamp}` (no synthetic concat — fields are explicit)
    - enqueueClassReminder is stubbed for P2 — function signature exists but throws Error("not implemented in P1b — see P2/NOTIF-01")
    - Zod validation rejects invalid payloads at the publisher (compile-time + runtime safety)
    - Tests: getBoss throws on -pooler URL; payload Zod schemas reject malformed input; both InboundWhatsAppPayload variants round-trip through .safeParse; singletonKey strings match D-13 convention
  </behavior>
  <action>
    Concrete steps:

    1. Create `packages/queue/package.json`:
       ```json
       {
         "name": "@gymos/queue",
         "version": "0.1.0",
         "private": true,
         "type": "module",
         "main": "./src/index.ts",
         "types": "./src/index.ts",
         "exports": {
           ".": {
             "types": "./src/index.ts",
             "import": "./src/index.ts"
           }
         },
         "scripts": {
           "typecheck": "tsc --noEmit",
           "test": "vitest run"
         },
         "dependencies": {
           "pg-boss": "^12.18.0",
           "pg": "^8.13.0",
           "zod": "^4.0.0"
         },
         "devDependencies": {
           "typescript": "catalog:",
           "vitest": "^2.0.0",
           "@types/pg": "^8.11.0",
           "@types/node": "^22.0.0"
         },
         "engines": {
           "node": ">=22"
         }
       }
       ```

    2. Create `packages/queue/tsconfig.json` (same shape as packages/whatsapp/tsconfig.json).

    3. Create `packages/queue/src/types.ts` — HIGH #6: InboundWhatsAppPayload is a discriminated union, NOT a flat object:
       ```ts
       import { z } from "zod";

       export const QUEUE_NAMES = {
         OUTBOUND_WHATSAPP: "outbound-whatsapp",
         INBOUND_WHATSAPP: "inbound-whatsapp",
         STRIPE_EVENT: "stripe-event",
         CLASS_REMINDER: "class-reminder",
       } as const;

       export const OutboundWhatsAppPayload = z.object({
         messageId: z.string().min(1),
         memberId: z.string().min(1),
         payload: z.discriminatedUnion("type", [
           z.object({ type: z.literal("text"), body: z.string().min(1).max(4096) }),
           z.object({
             type: z.literal("template"),
             name: z.string().min(1),
             vars: z.record(z.string(), z.string()),
             language: z.string().optional(),
           }),
         ]),
       });
       export type OutboundWhatsAppPayload = z.infer<typeof OutboundWhatsAppPayload>;

       /**
        * Inbound WhatsApp payload — HIGH #6 fix.
        *
        * Two variants. Both arrive from the Fly receiver (Plan 04) and are
        * processed by the worker (Plan 05). The receiver MUST construct the
        * payload from structured Meta webhook fields; the worker MUST read
        * structured fields directly. Do NOT reconstruct synthetic strings.
        */
       export const InboundWhatsAppMessagePayload = z.object({
         kind: z.literal("message"),
         externalId: z.string().min(1),        // wamid of inbound
         from: z.string().min(7),              // E.164 sender without +
         messageType: z.string().min(1),        // "text" | "image" | "audio" | ...
         body: z.string().optional(),           // text body if type="text"
         timestamp: z.string().optional(),      // Meta unix timestamp string
       });

       export const InboundWhatsAppStatusPayload = z.object({
         kind: z.literal("status"),
         statusFor: z.string().min(1),         // wamid of the OUTBOUND message this status updates
         newStatus: z.enum(["sent", "delivered", "read", "failed"]),
         timestamp: z.string().min(1),         // Meta unix timestamp string
         errorCode: z.string().optional(),     // Meta error code on "failed"
       });

       export const InboundWhatsAppPayload = z.discriminatedUnion("kind", [
         InboundWhatsAppMessagePayload,
         InboundWhatsAppStatusPayload,
       ]);
       export type InboundWhatsAppPayload = z.infer<typeof InboundWhatsAppPayload>;

       export const StripeEventPayload = z.object({
         eventId: z.string().min(1).regex(/^evt_/, "Stripe event IDs start with evt_"),
       });
       export type StripeEventPayload = z.infer<typeof StripeEventPayload>;

       export const ClassReminderPayload = z.object({
         bookingId: z.string().min(1),
         remindAt: z.string().datetime(),
       });
       export type ClassReminderPayload = z.infer<typeof ClassReminderPayload>;
       ```

    4. Create `packages/queue/src/boss.ts`:
       ```ts
       import PgBoss from "pg-boss";

       let _boss: PgBoss | undefined;

       /**
        * Get a singleton PgBoss instance bound to DATABASE_URL_UNPOOLED.
        *
        * CRITICAL (PITFALL #1 in P1b research): pg-boss uses LISTEN/NOTIFY,
        * advisory locks, and prepared statements. ALL THREE are broken by Neon's
        * -pooler endpoint (PgBouncer transaction mode). Must use the direct/
        * unpooled hostname.
        *
        * The DATABASE_URL_UNPOOLED env var is set per-app in Fly Secrets +
        * .env.local. Strip the -pooler suffix from the existing DATABASE_URL.
        */
       export function getBoss(): PgBoss {
         if (_boss) return _boss;
         const url = process.env.DATABASE_URL_UNPOOLED;
         if (!url) {
           throw new Error(
             "DATABASE_URL_UNPOOLED is not set — pg-boss requires the unpooled Neon endpoint",
           );
         }
         if (url.includes("-pooler")) {
           throw new Error(
             "DATABASE_URL_UNPOOLED must NOT include the -pooler hostname suffix. " +
               "Strip '-pooler' from the existing DATABASE_URL to get the direct endpoint.",
           );
         }
         _boss = new PgBoss({
           connectionString: url,
           max: 10,
           schema: "pgboss",
           retentionDays: 7,
           archiveCompletedAfterSeconds: 3600,
           deleteAfterDays: 30,
         });
         return _boss;
       }

       /** For tests only — reset the cached singleton. */
       export function _resetBossForTests() {
         _boss = undefined;
       }
       ```

    5. Create `packages/queue/src/publish.ts` — HIGH #6: derive singletonKey from the variant's structured fields:
       ```ts
       import { getBoss } from "./boss.js";
       import {
         QUEUE_NAMES,
         OutboundWhatsAppPayload,
         InboundWhatsAppPayload,
         StripeEventPayload,
         ClassReminderPayload,
       } from "./types.js";

       /**
        * Enqueue an outbound WhatsApp send job. Singleton-keyed by messageId
        * (D-13) so a staff retry on the same draft doesn't double-send.
        */
       export async function enqueueOutboundWhatsApp(
         args: OutboundWhatsAppPayload,
       ): Promise<string | null> {
         const data = OutboundWhatsAppPayload.parse(args);
         const boss = getBoss();
         return boss.send(QUEUE_NAMES.OUTBOUND_WHATSAPP, data, {
           singletonKey: `${QUEUE_NAMES.OUTBOUND_WHATSAPP}:${data.messageId}`,
           retryLimit: 3,
           retryBackoff: true,
           expireInSeconds: 60,
         });
       }

       /**
        * Enqueue an inbound WhatsApp processing job.
        *
        * HIGH #6 fix: payload is a discriminated union (`kind: "message" | "status"`).
        * singletonKey is derived from the variant's structured fields — no synthetic
        * `wamid_status_<id>_<ts>_<status>` concat strings. The receiver constructs
        * the payload from typed Meta webhook fields and the worker reads them
        * directly (statusFor, newStatus, timestamp).
        */
       export async function enqueueInboundWhatsApp(
         args: InboundWhatsAppPayload,
       ): Promise<string | null> {
         const data = InboundWhatsAppPayload.parse(args);
         const boss = getBoss();

         // Per-variant singletonKey — see D-13 convention
         const singletonKey =
           data.kind === "message"
             ? `${QUEUE_NAMES.INBOUND_WHATSAPP}:msg_${data.externalId}`
             : `${QUEUE_NAMES.INBOUND_WHATSAPP}:status_${data.statusFor}_${data.newStatus}_${data.timestamp}`;

         return boss.send(QUEUE_NAMES.INBOUND_WHATSAPP, data, {
           singletonKey,
           retryLimit: 5,
           retryBackoff: true,
         });
       }

       /**
        * Enqueue a Stripe event processing job. Singleton-keyed by event.id
        * so Stripe replays produce exactly one worker job.
        */
       export async function enqueueStripeEvent(
         args: StripeEventPayload,
       ): Promise<string | null> {
         const data = StripeEventPayload.parse(args);
         const boss = getBoss();
         return boss.send(QUEUE_NAMES.STRIPE_EVENT, data, {
           singletonKey: `${QUEUE_NAMES.STRIPE_EVENT}:stripe_${data.eventId}`,
           retryLimit: 5,
           retryBackoff: true,
         });
       }

       /**
        * STUB for P2 NOTIF-01 (class reminders). Defined so worker file structure
        * doesn't churn between P1b and P2. Throws to make accidental P1b use loud.
        */
       export async function enqueueClassReminder(
         args: ClassReminderPayload,
       ): Promise<string | null> {
         ClassReminderPayload.parse(args);
         throw new Error(
           "enqueueClassReminder is stubbed — full impl ships in P2/NOTIF-01",
         );
       }
       ```

    6. Create `packages/queue/src/index.ts` (barrel):
       ```ts
       export {
         enqueueOutboundWhatsApp,
         enqueueInboundWhatsApp,
         enqueueStripeEvent,
         enqueueClassReminder,
       } from "./publish.js";
       export { getBoss, _resetBossForTests } from "./boss.js";
       export {
         QUEUE_NAMES,
         OutboundWhatsAppPayload,
         InboundWhatsAppPayload,
         InboundWhatsAppMessagePayload,
         InboundWhatsAppStatusPayload,
         StripeEventPayload,
         ClassReminderPayload,
       } from "./types.js";
       ```

    7. Create `packages/queue/src/boss.test.ts`:
       ```ts
       import { describe, it, expect, beforeEach, afterEach } from "vitest";
       import { getBoss, _resetBossForTests } from "./boss.js";

       describe("getBoss", () => {
         const savedUrl = process.env.DATABASE_URL_UNPOOLED;
         beforeEach(() => _resetBossForTests());
         afterEach(() => {
           if (savedUrl) process.env.DATABASE_URL_UNPOOLED = savedUrl;
           else delete process.env.DATABASE_URL_UNPOOLED;
         });

         it("throws if DATABASE_URL_UNPOOLED is missing", () => {
           delete process.env.DATABASE_URL_UNPOOLED;
           expect(() => getBoss()).toThrow(/DATABASE_URL_UNPOOLED is not set/);
         });

         it("throws if DATABASE_URL_UNPOOLED contains -pooler", () => {
           process.env.DATABASE_URL_UNPOOLED =
             "postgres://user:pass@ep-foo-pooler.c-8.us-east-1.aws.neon.tech/db";
           expect(() => getBoss()).toThrow(/-pooler/);
         });

         it("does not throw with a clean (unpooled) URL", () => {
           process.env.DATABASE_URL_UNPOOLED =
             "postgres://user:pass@ep-foo.c-8.us-east-1.aws.neon.tech/db";
           // We don't actually connect — just verify construction succeeds
           expect(() => getBoss()).not.toThrow();
         });
       });
       ```

    8. Create `packages/queue/src/publish.test.ts`:
       ```ts
       import { describe, it, expect } from "vitest";
       import {
         OutboundWhatsAppPayload,
         InboundWhatsAppPayload,
         StripeEventPayload,
         QUEUE_NAMES,
       } from "./types.js";

       describe("payload schemas", () => {
         it("OutboundWhatsAppPayload accepts text send", () => {
           const result = OutboundWhatsAppPayload.safeParse({
             messageId: "msg_abc",
             memberId: "mem_1",
             payload: { type: "text", body: "hi" },
           });
           expect(result.success).toBe(true);
         });

         it("OutboundWhatsAppPayload rejects empty body", () => {
           const result = OutboundWhatsAppPayload.safeParse({
             messageId: "msg_abc",
             memberId: "mem_1",
             payload: { type: "text", body: "" },
           });
           expect(result.success).toBe(false);
         });

         it("OutboundWhatsAppPayload accepts template send", () => {
           const result = OutboundWhatsAppPayload.safeParse({
             messageId: "msg_abc",
             memberId: "mem_1",
             payload: {
               type: "template",
               name: "class_reminder",
               vars: { 1: "Yoga", 2: "07:00" },
             },
           });
           expect(result.success).toBe(true);
         });

         it("StripeEventPayload rejects non-evt_ IDs", () => {
           const result = StripeEventPayload.safeParse({ eventId: "abc123" });
           expect(result.success).toBe(false);
         });

         it("StripeEventPayload accepts evt_ IDs", () => {
           const result = StripeEventPayload.safeParse({ eventId: "evt_test_abc" });
           expect(result.success).toBe(true);
         });

         it("InboundWhatsAppPayload accepts message variant", () => {
           const result = InboundWhatsAppPayload.safeParse({
             kind: "message",
             externalId: "wamid.ABC",
             from: "447700900000",
             messageType: "text",
             body: "hi",
             timestamp: "1700000000",
           });
           expect(result.success).toBe(true);
         });

         it("InboundWhatsAppPayload accepts status variant with explicit fields (HIGH #6)", () => {
           const result = InboundWhatsAppPayload.safeParse({
             kind: "status",
             statusFor: "wamid.XYZ",
             newStatus: "delivered",
             timestamp: "1700000000",
             errorCode: undefined,
           });
           expect(result.success).toBe(true);
         });

         it("InboundWhatsAppPayload status variant rejects unknown newStatus", () => {
           const result = InboundWhatsAppPayload.safeParse({
             kind: "status",
             statusFor: "wamid.XYZ",
             newStatus: "exploded",
             timestamp: "1700000000",
           });
           expect(result.success).toBe(false);
         });

         it("InboundWhatsAppPayload rejects payloads without kind discriminator", () => {
           const result = InboundWhatsAppPayload.safeParse({
             externalId: "wamid.OLD",
             isStatus: false,
           });
           expect(result.success).toBe(false);
         });
       });

       describe("QUEUE_NAMES", () => {
         it("uses kebab-case queue names (D-13)", () => {
           expect(QUEUE_NAMES.OUTBOUND_WHATSAPP).toBe("outbound-whatsapp");
           expect(QUEUE_NAMES.INBOUND_WHATSAPP).toBe("inbound-whatsapp");
           expect(QUEUE_NAMES.STRIPE_EVENT).toBe("stripe-event");
         });
       });
       ```

    9. Run `pnpm install` at repo root.
    10. Run `pnpm --filter @gymos/queue test` — must pass.
    11. Run `pnpm --filter @gymos/queue typecheck` — must exit 0.
    12. Run `npx prettier --write packages/queue/**/*.{ts,json,md}`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/queue test 2>&amp;1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - `packages/queue/package.json` exists AND contains `"name": "@gymos/queue"` AND `"pg-boss": "^12"` (or `^12.18`)
    - `packages/queue/src/boss.ts` contains string `DATABASE_URL_UNPOOLED` (env var name per PITFALL #1)
    - `packages/queue/src/boss.ts` contains string `if (url.includes("-pooler"))` (the guard)
    - `packages/queue/src/types.ts` contains string `z.discriminatedUnion("kind"` (HIGH #6 — InboundWhatsAppPayload is a typed discriminated union)
    - `packages/queue/src/types.ts` contains string `kind: z.literal("message")` AND `kind: z.literal("status")`
    - `packages/queue/src/types.ts` contains string `statusFor: z.string()` (explicit field — no synthetic concat)
    - `packages/queue/src/types.ts` contains string `newStatus: z.enum(["sent", "delivered", "read", "failed"])`
    - `packages/queue/src/publish.ts` contains string `outbound-whatsapp:${data.messageId}` (singletonKey per D-13)
    - `packages/queue/src/publish.ts` contains string `stripe-event:stripe_${data.eventId}` (singletonKey per D-13)
    - `packages/queue/src/publish.ts` contains string `inbound-whatsapp:msg_${data.externalId}` (message-variant singletonKey)
    - `packages/queue/src/publish.ts` contains string `inbound-whatsapp:status_${data.statusFor}_${data.newStatus}_${data.timestamp}` (status-variant singletonKey — derived from structured fields, not synthetic concat)
    - `packages/queue/src/publish.ts` contains string `enqueueClassReminder` AND `throw new Error.*stubbed` (P2 stub per D-12)
    - `pnpm --filter @gymos/queue test` exits 0 with all tests passing (3 boss + 9 schema/queue-names = at least 12)
    - `pnpm --filter @gymos/queue typecheck` exits 0
  </acceptance_criteria>
  <done>packages/queue/ exports typed publishers + boss singleton with UNPOOLED guard. InboundWhatsAppPayload is a discriminated union with structured per-variant fields (HIGH #6). Tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Compile-time enforce that apps/staff-web does NOT depend on @gymos/whatsapp (D-11)</name>
  <files>apps/staff-web/package.json</files>
  <read_first>
    - apps/staff-web/package.json (verify post-Plan-01 state — dependencies list)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-11: worker is the ONLY caller of packages/whatsapp/; staff-web NEVER imports it)
    - packages/whatsapp/package.json (the package whose import is forbidden in staff-web)
  </read_first>
  <action>
    Concrete steps:

    1. Read `apps/staff-web/package.json` and verify that `@gymos/whatsapp` is NOT in `dependencies` or `devDependencies`.

    2. Add a comment block at the top of the package.json's "dependencies" section (using a special "_comments" key since JSON doesn't support comments — alternatively store as a top-level "gymos" custom field). Add:
       ```json
       {
         "name": "@gymos/staff-web",
         "...": "...",
         "gymos": {
           "forbiddenDependencies": [
             "@gymos/whatsapp"
           ],
           "forbiddenReason": "D-11 (P1b-CONTEXT): staff-web never calls Meta directly. Outbound WhatsApp sends go through @gymos/queue → worker → @gymos/whatsapp. If a future change adds @gymos/whatsapp here, the worker chokepoint is bypassed and 24h-window + opt-in gates are no longer enforced."
         }
       }
       ```

    3. Add `@gymos/queue` to `apps/staff-web/package.json` dependencies as a workspace ref (this IS allowed — staff-web enqueues outbound sends per D-12 + D-18):
       ```json
       "dependencies": {
         "...existing entries preserved...",
         "@gymos/queue": "workspace:*"
       }
       ```

    4. Create a guard script `scripts/guard-no-whatsapp-in-staff-web.mjs` at repo root:
       ```js
       #!/usr/bin/env node
       /**
        * D-11 guard: apps/staff-web/ must NEVER import @gymos/whatsapp.
        * Worker is the only legal caller (24h-window + opt-in gates live there).
        */
       import { readFileSync } from "node:fs";
       import { execSync } from "node:child_process";

       const pkg = JSON.parse(readFileSync("apps/staff-web/package.json", "utf8"));
       const deps = { ...pkg.dependencies, ...pkg.devDependencies };
       if (deps["@gymos/whatsapp"]) {
         console.error("[guard] apps/staff-web/package.json must NOT depend on @gymos/whatsapp (P1b D-11).");
         process.exit(1);
       }

       // Also scan source for direct imports
       try {
         const out = execSync(
           `grep -rE "from ['\\"]@gymos/whatsapp['\\"]|require\\(['\\"]@gymos/whatsapp['\\"]\\)" apps/staff-web/`,
           { encoding: "utf8" },
         );
         if (out.trim()) {
           console.error("[guard] Source import of @gymos/whatsapp found in apps/staff-web/:");
           console.error(out);
           process.exit(1);
         }
       } catch (err) {
         // grep returns non-zero when no match — that's the success path
         if (err.status !== 1) {
           console.error("[guard] grep failed unexpectedly:", err.message);
           process.exit(2);
         }
       }

       console.log("[guard] OK: apps/staff-web does not import @gymos/whatsapp");
       ```

    5. Wire the guard into the root `package.json` scripts (if a "prep" or similar already exists, append; otherwise add as new):
       ```json
       "scripts": {
         "...existing...": "...",
         "guard:no-whatsapp-in-staff-web": "node scripts/guard-no-whatsapp-in-staff-web.mjs"
       }
       ```

    6. Run `pnpm run guard:no-whatsapp-in-staff-web` — must exit 0.

    7. Run `pnpm install` to wire `@gymos/queue` workspace dep.

    8. Run `npx prettier --write apps/staff-web/package.json scripts/guard-no-whatsapp-in-staff-web.mjs`.
  </action>
  <verify>
    <automated>pnpm run guard:no-whatsapp-in-staff-web 2>&amp;1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/package.json` does NOT contain string `"@gymos/whatsapp"` (no dep)
    - `apps/staff-web/package.json` contains string `"@gymos/queue": "workspace:*"` (queue dep IS allowed)
    - `apps/staff-web/package.json` contains `"forbiddenDependencies"` JSON block with `"@gymos/whatsapp"` listed
    - `scripts/guard-no-whatsapp-in-staff-web.mjs` EXISTS
    - `pnpm run guard:no-whatsapp-in-staff-web` exits 0 with message "OK: apps/staff-web does not import @gymos/whatsapp"
    - Root `package.json` contains script entry `guard:no-whatsapp-in-staff-web`
  </acceptance_criteria>
  <done>D-11 enforced at compile time + via guard script. staff-web can enqueue (via @gymos/queue) but cannot import the WhatsApp transport adapter.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/whatsapp test` exits 0
- `pnpm --filter @gymos/queue test` exits 0
- `pnpm run guard:no-whatsapp-in-staff-web` exits 0
- `packages/whatsapp/src/verify-signature.ts` preserves the demo's crypto.timingSafeEqual pattern
- `packages/queue/src/boss.ts` throws on -pooler URLs
- `packages/queue/src/types.ts` defines InboundWhatsAppPayload as a discriminated union with kind='message' | kind='status' variants (HIGH #6)
- All publishers use D-13 singletonKey convention; status singletonKey uses structured fields not synthetic concat
</verification>

<success_criteria>
1. Two new workspace packages installed and tested (@gymos/whatsapp, @gymos/queue)
2. Worker-only consumption of @gymos/whatsapp enforced by guard script (D-11)
3. pg-boss connection guard prevents accidental use of pooled Neon endpoint (PITFALL #1)
4. Typed payload schemas (Zod) provide compile-time + runtime safety for queue contracts
5. InboundWhatsAppPayload is a typed discriminated union — receiver↔worker boundary no longer relies on synthetic string concat (HIGH #6)
6. enqueueClassReminder stub keeps file structure stable for P2 NOTIF-01 work
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-03-SUMMARY.md` recording:
- Final test count + pass status per package
- Confirmation that @gymos/whatsapp is NOT in apps/staff-web/package.json
- Confirmation that InboundWhatsAppPayload is a discriminated union (HIGH #6 fix)
- Exact pg-boss version pinned (verify `npm view pg-boss version` matches what was installed)
- Notes for Plan 04 (edge-webhooks) and Plan 06 (worker sendMessage) on how to import these packages
</output>
