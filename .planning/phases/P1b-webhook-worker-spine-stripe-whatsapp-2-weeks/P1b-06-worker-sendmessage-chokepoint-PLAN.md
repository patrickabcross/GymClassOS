---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 06
type: execute
wave: 4
depends_on: [01, 02, 03, 05]
files_modified:
  - apps/worker/src/domain/sendMessage.ts
  - apps/worker/src/domain/gates/optInGate.ts
  - apps/worker/src/domain/gates/windowGate.ts
  - apps/worker/src/domain/gates/templateGate.ts
  - apps/worker/src/queues/outbound-whatsapp.ts
  - apps/worker/src/domain/sendMessage.test.ts
  - apps/worker/src/domain/gates/optInGate.test.ts
  - apps/worker/src/domain/gates/windowGate.test.ts
  - apps/worker/src/domain/gates/templateGate.test.ts
  - apps/worker/src/index.ts
autonomous: true
requirements: [WA-05, WA-06, WA-07, WA-08, WA-09]
must_haves:
  truths:
    - "sendMessage() is the ONLY call site of packages/whatsapp/ in the worker (D-09, D-11)"
    - "sendMessage() reads whatsapp_opt_in BEFORE Meta API call; throws NoOptInError if missing (WA-07, PITFALL #17)"
    - "sendMessage() reads conversations.last_inbound_at BEFORE Meta API call; computes (now - lastInbound < 24h); throws WindowExpiredError for text outside window (WA-06, PITFALL #1)"
    - "sendMessage() text outside window throws BEFORE any fetch to Meta — verified by test counting fetch mock calls = 0"
    - "sendMessage() with payload.type='template' validates templateName in whatsapp_templates with status='approved'; throws TemplateNotApprovedError otherwise (WA-08)"
    - "On Meta 2xx: UPDATE messages SET status='sent', external_id=<wamid>, sent_at=now"
    - "On Meta 4xx: UPDATE messages SET status='failed', error_code=<...>; do not retry (4xx is terminal)"
    - "On Meta 5xx: throw — let pg-boss retry (transient)"
    - "outbound-whatsapp queue handler concurrency=1, rate=80/sec (D-14)"
    - "pg-boss singletonKey 'outbound-whatsapp:msg_<id>' dedupes staff retries of same draft (D-13, PITFALL #20)"
  artifacts:
    - path: "apps/worker/src/domain/sendMessage.ts"
      provides: "THE chokepoint (D-10): opt-in → window → template-approved → adapter call → status update"
      exports: ["sendMessage"]
    - path: "apps/worker/src/domain/gates/optInGate.ts"
      provides: "hasOptIn(memberId, db) → boolean; pure read of whatsapp_opt_in"
      exports: ["hasOptIn"]
    - path: "apps/worker/src/domain/gates/windowGate.ts"
      provides: "isInWindow(lastInboundAt, now) → boolean; pure function, no DB access"
      exports: ["isInWindow", "WINDOW_HOURS"]
    - path: "apps/worker/src/domain/gates/templateGate.ts"
      provides: "isTemplateApproved(name, db) → boolean; reads whatsapp_templates"
      exports: ["isTemplateApproved"]
    - path: "apps/worker/src/queues/outbound-whatsapp.ts"
      provides: "pg-boss handler for outbound-whatsapp queue; concurrency=1; calls sendMessage()"
      contains: "teamSize: 1"
  key_links:
    - from: "apps/worker/src/queues/outbound-whatsapp.ts"
      to: "apps/worker/src/domain/sendMessage.ts"
      via: "import + call with { memberId, messageId, payload, db }"
      pattern: "sendMessage\\("
    - from: "apps/worker/src/domain/sendMessage.ts"
      to: "@gymos/whatsapp sendText / sendTemplate"
      via: "switch on payload.type; only call after all 3 gates pass"
      pattern: "sendText|sendTemplate"
    - from: "apps/worker/src/domain/sendMessage.ts"
      to: "apps/worker/src/lib/errors.ts"
      via: "throw NoOptInError, WindowExpiredError, TemplateNotApprovedError"
      pattern: "throw new (NoOptInError|WindowExpiredError|TemplateNotApprovedError)"
---

<objective>
Build `apps/worker/src/domain/sendMessage.ts` — the SINGLE chokepoint for outbound WhatsApp sends (D-10, WA-05). Every staff-web Send action enqueues; the worker dequeues; this function runs three gates IN ORDER before calling the Meta API via `@gymos/whatsapp`: (1) opt-in gate (WA-07), (2) 24h-window gate (WA-06, text only), (3) template-approved gate (WA-08, template only). Throws typed errors on gate failure WITHOUT calling Meta. On success, updates `messages.status` + `external_id`. Wires the outbound-whatsapp queue handler with concurrency=1 + pg-boss singletonKey discipline (D-13).

Purpose: WA-05 chokepoint, WA-06 window, WA-07 opt-in, WA-08 template list, WA-09 thin adapter consumption. PITFALL #1 (24h window), #17 (opt-in), #20 (idempotent send).
Output: Send pipeline complete. Staff-web action (Plan 08) can enqueue with confidence that gates are enforced server-side.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@apps/staff-web/server/db/schema.ts
@apps/worker/src/lib/errors.ts
@apps/worker/src/lib/db.ts
@apps/worker/src/index.ts
@packages/whatsapp/src/index.ts
@packages/queue/src/types.ts
@CLAUDE.md

<interfaces>
<!-- @gymos/whatsapp public API (Plan 03 Task 1) -->
sendText({ to, body }) → { messageId }
sendTemplate({ to, name, vars, language? }) → { messageId }

<!-- @gymos/queue OutboundWhatsAppPayload (Plan 03 Task 2) -->
{ messageId: string, memberId: string, payload: { type: "text", body } | { type: "template", name, vars, language? } }

<!-- Schema reads -->
whatsapp_opt_in: { member_id PK, opted_in_at, evidence_message_id, evidence_payload, source }
whatsapp_templates: { name PK, status, category, language, components_json, last_synced_at }
conversations: { id, member_id, channel, last_inbound_at, ... }
gym_members: { id, phone_e164, ... }
messages: { id, conversation_id, direction, status, external_id, sent_at, body, payload, error_code, ... }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement three gate functions with isolated tests (optInGate, windowGate, templateGate)</name>
  <files>apps/worker/src/domain/gates/optInGate.ts, apps/worker/src/domain/gates/windowGate.ts, apps/worker/src/domain/gates/templateGate.ts, apps/worker/src/domain/gates/optInGate.test.ts, apps/worker/src/domain/gates/windowGate.test.ts, apps/worker/src/domain/gates/templateGate.test.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts (whatsappOptIn, whatsappTemplates table definitions)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 2: Outbound Send" lines 444-578 (full sendMessage code)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-10 gate order)
    - apps/worker/src/lib/db.ts (Drizzle client + schema imports)
    - apps/worker/src/lib/errors.ts (typed errors)
    - CLAUDE.md (TypeScript everywhere; no .js source)
  </read_first>
  <behavior>
    - windowGate.ts:
      * WINDOW_HOURS = 24 constant
      * isInWindow(lastInboundAt: Date | null, now: Date) → boolean
      * isInWindow(null, ...) → false
      * isInWindow(within 24h, now) → true
      * isInWindow(>24h ago, now) → false
      * Pure function — no DB access; takes Date inputs
    - optInGate.ts:
      * hasOptIn(memberId: string, db): Promise<boolean>
      * Queries whatsapp_opt_in for member_id = memberId; returns true if any row exists
      * No mutations
    - templateGate.ts:
      * isTemplateApproved(name: string, db): Promise<boolean>
      * Queries whatsapp_templates WHERE name = name AND status = 'approved'; returns true if found
    - Tests:
      * windowGate.test.ts: pure-function tests, no mocks — 4 cases (null, exactly 24h, just under 24h, just over 24h)
      * optInGate.test.ts: mock db.select chain; verify hasOptIn returns true on row found, false otherwise
      * templateGate.test.ts: mock db.select chain; verify only status='approved' returns true; status='pending'/'rejected'/'paused'/'disabled' returns false
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/domain/gates/windowGate.ts`:
       ```ts
       /**
        * 24-hour window gate (WA-06; PITFALL #1).
        *
        * Per Meta's Cloud API policy: a business may send free-text messages to
        * a customer only within 24 hours of the customer's most recent inbound
        * message. Outside this window, only approved templates may be sent.
        *
        * Pure function — no DB access. Caller loads lastInboundAt from
        * conversations.last_inbound_at and passes it here.
        */
       export const WINDOW_HOURS = 24;

       export function isInWindow(
         lastInboundAt: Date | null,
         now: Date = new Date(),
       ): boolean {
         if (lastInboundAt === null) return false;
         const elapsedMs = now.getTime() - lastInboundAt.getTime();
         const elapsedHours = elapsedMs / (1000 * 60 * 60);
         return elapsedHours < WINDOW_HOURS;
       }
       ```

    2. Create `apps/worker/src/domain/gates/windowGate.test.ts`:
       ```ts
       import { describe, it, expect } from "vitest";
       import { isInWindow, WINDOW_HOURS } from "./windowGate.js";

       describe("isInWindow", () => {
         const now = new Date("2026-05-20T12:00:00.000Z");

         it("returns false for null lastInboundAt", () => {
           expect(isInWindow(null, now)).toBe(false);
         });

         it("returns true for inbound just now", () => {
           const lastInbound = new Date("2026-05-20T11:59:00.000Z");
           expect(isInWindow(lastInbound, now)).toBe(true);
         });

         it("returns true for inbound 23h59m ago", () => {
           const lastInbound = new Date("2026-05-19T12:01:00.000Z");
           expect(isInWindow(lastInbound, now)).toBe(true);
         });

         it("returns false for inbound exactly 24h ago", () => {
           const lastInbound = new Date("2026-05-19T12:00:00.000Z");
           expect(isInWindow(lastInbound, now)).toBe(false);
         });

         it("returns false for inbound 24h01s ago", () => {
           const lastInbound = new Date("2026-05-19T11:59:59.000Z");
           expect(isInWindow(lastInbound, now)).toBe(false);
         });

         it("returns false for inbound 48h ago", () => {
           const lastInbound = new Date("2026-05-18T12:00:00.000Z");
           expect(isInWindow(lastInbound, now)).toBe(false);
         });

         it("exposes WINDOW_HOURS = 24", () => {
           expect(WINDOW_HOURS).toBe(24);
         });
       });
       ```

    3. Create `apps/worker/src/domain/gates/optInGate.ts`:
       ```ts
       import { eq } from "drizzle-orm";
       import type { getDb } from "../../lib/db.js";
       import { schema } from "../../lib/db.js";

       /**
        * Opt-in gate (WA-07; PITFALL #17).
        *
        * Returns true if the member has at least one row in whatsapp_opt_in.
        * Caller (sendMessage chokepoint) throws NoOptInError on false.
        */
       export async function hasOptIn(
         memberId: string,
         db: ReturnType<typeof getDb>,
       ): Promise<boolean> {
         // guard:allow-unscoped — sendMessage chokepoint is the gate; no per-user
         // scoping needed at this point (the gate IS the access check).
         const row = await db
           .select({ memberId: schema.whatsappOptIn.memberId })
           .from(schema.whatsappOptIn)
           .where(eq(schema.whatsappOptIn.memberId, memberId))
           .limit(1)
           .then((r) => r[0]);
         return Boolean(row);
       }
       ```

    4. Create `apps/worker/src/domain/gates/templateGate.ts`:
       ```ts
       import { and, eq } from "drizzle-orm";
       import type { getDb } from "../../lib/db.js";
       import { schema } from "../../lib/db.js";

       /**
        * Template-approved gate (WA-08).
        *
        * Returns true if a row exists in whatsapp_templates with the given name
        * AND status='approved'. Caller throws TemplateNotApprovedError on false.
        */
       export async function isTemplateApproved(
         name: string,
         db: ReturnType<typeof getDb>,
       ): Promise<boolean> {
         // guard:allow-unscoped — template list is studio-global, not per-user
         const row = await db
           .select({ name: schema.whatsappTemplates.name })
           .from(schema.whatsappTemplates)
           .where(
             and(
               eq(schema.whatsappTemplates.name, name),
               eq(schema.whatsappTemplates.status, "approved"),
             ),
           )
           .limit(1)
           .then((r) => r[0]);
         return Boolean(row);
       }
       ```

    5. Create `apps/worker/src/domain/gates/optInGate.test.ts`:
       ```ts
       import { describe, it, expect, vi } from "vitest";

       const selectChain = {
         from: vi.fn().mockReturnThis(),
         where: vi.fn().mockReturnThis(),
         limit: vi.fn().mockReturnThis(),
         then: vi.fn(),
       };
       const mockDb = { select: vi.fn().mockReturnValue(selectChain) };

       vi.mock("../../lib/db.js", () => ({
         getDb: () => mockDb,
         schema: {
           whatsappOptIn: { memberId: { name: "member_id" } },
         },
       }));

       import { hasOptIn } from "./optInGate.js";

       describe("hasOptIn", () => {
         it("returns true when row exists", async () => {
           selectChain.then.mockResolvedValueOnce({ memberId: "mem_1" });
           expect(await hasOptIn("mem_1", mockDb as any)).toBe(true);
         });
         it("returns false when no row", async () => {
           selectChain.then.mockResolvedValueOnce(undefined);
           expect(await hasOptIn("mem_unknown", mockDb as any)).toBe(false);
         });
       });
       ```

    6. Create `apps/worker/src/domain/gates/templateGate.test.ts`:
       ```ts
       import { describe, it, expect, vi } from "vitest";

       const selectChain = {
         from: vi.fn().mockReturnThis(),
         where: vi.fn().mockReturnThis(),
         limit: vi.fn().mockReturnThis(),
         then: vi.fn(),
       };
       const mockDb = { select: vi.fn().mockReturnValue(selectChain) };

       vi.mock("../../lib/db.js", () => ({
         getDb: () => mockDb,
         schema: {
           whatsappTemplates: {
             name: { name: "name" },
             status: { name: "status" },
           },
         },
       }));

       import { isTemplateApproved } from "./templateGate.js";

       describe("isTemplateApproved", () => {
         it("returns true for approved template", async () => {
           selectChain.then.mockResolvedValueOnce({ name: "class_reminder" });
           expect(await isTemplateApproved("class_reminder", mockDb as any)).toBe(true);
         });
         it("returns false for missing template", async () => {
           selectChain.then.mockResolvedValueOnce(undefined);
           expect(await isTemplateApproved("missing", mockDb as any)).toBe(false);
         });
         // Note: the WHERE clause filters status='approved'; if the row exists with
         // a different status, the query returns no row → false. This is correct.
       });
       ```

    7. Run `pnpm --filter @gymos/worker test` — gate tests pass.
    8. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    9. Run `npx prettier --write apps/worker/src/domain/gates/**/*.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test apps/worker/src/domain/gates 2>&amp;1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/src/domain/gates/windowGate.ts` contains string `WINDOW_HOURS = 24`
    - `apps/worker/src/domain/gates/windowGate.ts` contains string `if (lastInboundAt === null) return false`
    - `apps/worker/src/domain/gates/optInGate.ts` contains string `whatsappOptIn` AND `eq(schema.whatsappOptIn.memberId`
    - `apps/worker/src/domain/gates/templateGate.ts` contains string `whatsappTemplates` AND `status` AND `"approved"`
    - `pnpm --filter @gymos/worker test` exits 0 with gate tests passing (≥7 windowGate + ≥2 optInGate + ≥2 templateGate = ≥11)
    - `pnpm --filter @gymos/worker typecheck` exits 0
  </acceptance_criteria>
  <done>Three pure gate functions tested in isolation. Window gate is fully deterministic (pure fn). Opt-in + template gates verify DB access patterns.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement sendMessage() chokepoint with all 3 gates in correct order + status state machine</name>
  <files>apps/worker/src/domain/sendMessage.ts, apps/worker/src/domain/sendMessage.test.ts</files>
  <read_first>
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 2: Outbound Send" lines 444-578 (full sendMessage code reference)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-10 gate order, D-19 defence-in-depth: worker enforces re-check)
    - apps/worker/src/domain/gates/windowGate.ts (created in Task 1)
    - apps/worker/src/domain/gates/optInGate.ts (created in Task 1)
    - apps/worker/src/domain/gates/templateGate.ts (created in Task 1)
    - apps/worker/src/lib/errors.ts (NoOptInError, WindowExpiredError, TemplateNotApprovedError)
    - apps/staff-web/server/db/schema.ts (gymMembers.phoneE164, conversations.lastInboundAt, messages columns)
    - packages/whatsapp/src/index.ts (sendText, sendTemplate signatures)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-19 failed-bubble error_code copy)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Specific Ideas" Failed message bubble copy lines (in CONTEXT)
  </read_first>
  <behavior>
    - sendMessage({ memberId, messageId, payload, db }): Promise<{ externalId: string }>
    - Step 1: hasOptIn(memberId, db) — if false, throw NoOptInError(memberId). NO Meta call.
    - Step 2: load gymMembers row by id; if no phoneE164, throw new Error("member has no phone")
    - Step 3: load conversations row for memberId + channel='whatsapp'; extract lastInboundAt
    - Step 4: If payload.type === 'text' AND !isInWindow(lastInboundAt) → throw WindowExpiredError(memberId, lastInboundAt). NO Meta call.
    - Step 5: If payload.type === 'template' → isTemplateApproved(payload.name, db); if false, throw TemplateNotApprovedError(payload.name). NO Meta call.
    - Step 6: Call adapter — sendText or sendTemplate. Catch errors:
      * 4xx response: UPDATE messages SET status='failed', error_code=<msg>; return { externalId: "" } — pg-boss treats as success (don't retry — terminal)
      * 5xx response or fetch error: throw — let pg-boss retry
    - Step 7: UPDATE messages SET status='sent', external_id=<wamid>, sent_at=now
    - Step 8: UPDATE conversations SET last_outbound_at=now (for analytics; no behavioural impact)
    - Tests:
      * No opt-in → throws NoOptInError; adapter fetch NOT called
      * Out-of-window text → throws WindowExpiredError; adapter NOT called
      * In-window text → adapter sendText called; messages.status updated to 'sent'
      * Out-of-window template (any name, approved) → adapter sendTemplate called (template send works outside window)
      * Template with status='pending' → throws TemplateNotApprovedError; adapter NOT called
      * Adapter throws 4xx → status='failed', error_code set; returns externalId=""
      * Adapter throws 5xx → re-throws (pg-boss retries)
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/domain/sendMessage.ts`:
       ```ts
       import { eq, and } from "drizzle-orm";
       import { sendText, sendTemplate } from "@gymos/whatsapp";
       import type { getDb } from "../lib/db.js";
       import { schema } from "../lib/db.js";
       import { NoOptInError, WindowExpiredError, TemplateNotApprovedError } from "../lib/errors.js";
       import { hasOptIn } from "./gates/optInGate.js";
       import { isInWindow } from "./gates/windowGate.js";
       import { isTemplateApproved } from "./gates/templateGate.js";

       export type SendMessagePayload =
         | { type: "text"; body: string }
         | { type: "template"; name: string; vars: Record<string, string>; language?: string };

       export type SendMessageArgs = {
         memberId: string;
         messageId: string; // local PK 'msg_<nanoid>' — already inserted with status='queued' by caller
         payload: SendMessagePayload;
         db: ReturnType<typeof getDb>;
       };

       export type SendMessageResult = { externalId: string };

       /**
        * THE chokepoint for outbound WhatsApp sends (D-10, WA-05).
        *
        * Per CONTEXT.md "rejected at sender layer (not just discouraged in UI)":
        * even if the staff-web UI pre-gates, this function re-checks at call time
        * because UI state can be stale (D-19 defence in depth).
        *
        * Gate order (D-10):
        *   1. opt-in (WA-07; PITFALL #17)  — refuse if member never opted in
        *   2. window (WA-06; PITFALL #1)   — refuse free-text outside 24h
        *   3. template approved (WA-08)    — refuse unapproved template
        *
        * Then call @gymos/whatsapp adapter; update messages.status based on result.
        *
        * Throws on gate failure WITHOUT calling Meta.
        * Returns { externalId } on success.
        * Returns { externalId: "" } and marks status='failed' on 4xx terminal.
        * Re-throws on 5xx / network — pg-boss retries.
        */
       export async function sendMessage(args: SendMessageArgs): Promise<SendMessageResult> {
         const { memberId, messageId, payload, db } = args;

         // 1. Opt-in gate (WA-07)
         if (!(await hasOptIn(memberId, db))) {
           throw new NoOptInError(memberId);
         }

         // 2. Load member + conversation for phone + lastInboundAt
         // guard:allow-unscoped — worker chokepoint; the gate above is the access check
         const member = await db
           .select()
           .from(schema.gymMembers)
           .where(eq(schema.gymMembers.id, memberId))
           .limit(1)
           .then((r) => r[0]);
         if (!member?.phoneE164) {
           throw new Error(`member ${memberId} has no phone_e164`);
         }

         // guard:allow-unscoped — worker chokepoint
         const conversation = await db
           .select()
           .from(schema.conversations)
           .where(
             and(
               eq(schema.conversations.memberId, memberId),
               eq(schema.conversations.channel, "whatsapp"),
             ),
           )
           .limit(1)
           .then((r) => r[0]);

         const lastInboundAt = conversation?.lastInboundAt
           ? new Date(conversation.lastInboundAt)
           : null;

         // 3. Window gate (WA-06) — applies to free-text only
         if (payload.type === "text" && !isInWindow(lastInboundAt)) {
           throw new WindowExpiredError(memberId, lastInboundAt);
         }

         // 4. Template-approved gate (WA-08)
         if (payload.type === "template") {
           if (!(await isTemplateApproved(payload.name, db))) {
             throw new TemplateNotApprovedError(payload.name);
           }
         }

         // 5. Call adapter — STRIP leading + from E.164 per Meta's API
         const to = member.phoneE164.replace(/^\+/, "");
         let externalId: string;
         try {
           if (payload.type === "text") {
             const result = await sendText({ to, body: payload.body });
             externalId = result.messageId;
           } else {
             const result = await sendTemplate({
               to,
               name: payload.name,
               vars: payload.vars,
               language: payload.language,
             });
             externalId = result.messageId;
           }
         } catch (err: unknown) {
           // 4xx from Meta is terminal — mark failed, don't retry
           // 5xx / fetch error → re-throw, pg-boss retries
           const status = (err as { status?: number; statusCode?: number })?.status
             ?? (err as { statusCode?: number })?.statusCode;
           const message = err instanceof Error ? err.message : String(err);
           const errorCode = message.slice(0, 500);

           if (typeof status === "number" && status >= 400 && status < 500) {
             // guard:allow-unscoped — worker writes own state
             await db
               .update(schema.messages)
               .set({ status: "failed", errorCode })
               .where(eq(schema.messages.id, messageId));
             return { externalId: "" };
           }
           throw err; // 5xx — let pg-boss retry
         }

         // 6. Mark sent
         // guard:allow-unscoped — worker writes own state
         await db
           .update(schema.messages)
           .set({
             status: "sent",
             externalId,
             sentAt: new Date().toISOString(),
           })
           .where(eq(schema.messages.id, messageId));

         // 7. Update last_outbound_at (analytics; no behaviour gate uses it)
         if (conversation) {
           // guard:allow-unscoped — worker writes own state
           await db
             .update(schema.conversations)
             .set({ lastOutboundAt: new Date().toISOString() })
             .where(eq(schema.conversations.id, conversation.id));
         }

         return { externalId };
       }
       ```

    2. Create `apps/worker/src/domain/sendMessage.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";

       // Mock the gates (we tested them separately in Task 1)
       const hasOptIn = vi.fn();
       const isInWindow = vi.fn();
       const isTemplateApproved = vi.fn();
       vi.mock("./gates/optInGate.js", () => ({ hasOptIn }));
       vi.mock("./gates/windowGate.js", () => ({ isInWindow, WINDOW_HOURS: 24 }));
       vi.mock("./gates/templateGate.js", () => ({ isTemplateApproved }));

       // Mock adapter
       const sendText = vi.fn();
       const sendTemplate = vi.fn();
       vi.mock("@gymos/whatsapp", () => ({ sendText, sendTemplate }));

       // Mock db
       const selectChain = {
         from: vi.fn().mockReturnThis(),
         where: vi.fn().mockReturnThis(),
         limit: vi.fn().mockReturnThis(),
         then: vi.fn(),
       };
       const updateChain = {
         set: vi.fn().mockReturnThis(),
         where: vi.fn().mockResolvedValue(undefined),
       };
       const mockDb = {
         select: vi.fn().mockReturnValue(selectChain),
         update: vi.fn().mockReturnValue(updateChain),
       };
       vi.mock("../lib/db.js", () => ({
         getDb: () => mockDb,
         schema: {
           gymMembers: { id: {}, phoneE164: {} },
           conversations: { memberId: {}, channel: {}, id: {} },
           messages: { id: {} },
         },
       }));

       import { sendMessage } from "./sendMessage.js";
       import {
         NoOptInError,
         WindowExpiredError,
         TemplateNotApprovedError,
       } from "../lib/errors.js";

       describe("sendMessage chokepoint (D-10)", () => {
         beforeEach(() => {
           hasOptIn.mockReset();
           isInWindow.mockReset();
           isTemplateApproved.mockReset();
           sendText.mockReset();
           sendTemplate.mockReset();
           selectChain.then.mockReset();
           updateChain.set.mockReset();
         });

         it("throws NoOptInError + does NOT call adapter when opt-in missing (WA-07)", async () => {
           hasOptIn.mockResolvedValueOnce(false);
           await expect(
             sendMessage({
               memberId: "mem_1",
               messageId: "msg_1",
               payload: { type: "text", body: "hi" },
               db: mockDb as any,
             }),
           ).rejects.toBeInstanceOf(NoOptInError);
           expect(sendText).not.toHaveBeenCalled();
           expect(sendTemplate).not.toHaveBeenCalled();
         });

         it("throws WindowExpiredError + does NOT call adapter for text outside window (WA-06)", async () => {
           hasOptIn.mockResolvedValueOnce(true);
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" })
             .mockResolvedValueOnce({
               id: "conv_1",
               lastInboundAt: "2026-05-18T12:00:00.000Z", // 2 days ago vs default test now
             });
           isInWindow.mockReturnValueOnce(false);

           await expect(
             sendMessage({
               memberId: "mem_1",
               messageId: "msg_1",
               payload: { type: "text", body: "hi" },
               db: mockDb as any,
             }),
           ).rejects.toBeInstanceOf(WindowExpiredError);
           expect(sendText).not.toHaveBeenCalled();
         });

         it("allows template send OUTSIDE window (WA-06 + WA-08 happy path)", async () => {
           hasOptIn.mockResolvedValueOnce(true);
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" })
             .mockResolvedValueOnce({ id: "conv_1", lastInboundAt: null });
           isTemplateApproved.mockResolvedValueOnce(true);
           sendTemplate.mockResolvedValueOnce({ messageId: "wamid_sent_abc" });

           const result = await sendMessage({
             memberId: "mem_1",
             messageId: "msg_2",
             payload: { type: "template", name: "class_reminder", vars: { 1: "Yoga" } },
             db: mockDb as any,
           });
           expect(result.externalId).toBe("wamid_sent_abc");
           expect(sendTemplate).toHaveBeenCalledWith({
             to: "447700900000",
             name: "class_reminder",
             vars: { 1: "Yoga" },
             language: undefined,
           });
           // isInWindow should NOT have been consulted (template path)
           expect(isInWindow).not.toHaveBeenCalled();
         });

         it("throws TemplateNotApprovedError for unapproved template name (WA-08)", async () => {
           hasOptIn.mockResolvedValueOnce(true);
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" })
             .mockResolvedValueOnce({ id: "conv_1", lastInboundAt: null });
           isTemplateApproved.mockResolvedValueOnce(false);

           await expect(
             sendMessage({
               memberId: "mem_1",
               messageId: "msg_3",
               payload: { type: "template", name: "unapproved", vars: {} },
               db: mockDb as any,
             }),
           ).rejects.toBeInstanceOf(TemplateNotApprovedError);
           expect(sendTemplate).not.toHaveBeenCalled();
         });

         it("text in window calls sendText + marks status='sent'", async () => {
           hasOptIn.mockResolvedValueOnce(true);
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" })
             .mockResolvedValueOnce({
               id: "conv_1",
               lastInboundAt: new Date().toISOString(),
             });
           isInWindow.mockReturnValueOnce(true);
           sendText.mockResolvedValueOnce({ messageId: "wamid_OK" });

           const result = await sendMessage({
             memberId: "mem_1",
             messageId: "msg_5",
             payload: { type: "text", body: "hello" },
             db: mockDb as any,
           });
           expect(result.externalId).toBe("wamid_OK");
           expect(sendText).toHaveBeenCalledWith({ to: "447700900000", body: "hello" });
           // Two updates: messages.status='sent' + conversations.last_outbound_at
           expect(updateChain.set).toHaveBeenCalled();
           const setArgs = updateChain.set.mock.calls.map((c) => c[0]);
           expect(setArgs.some((s) => s.status === "sent" && s.externalId === "wamid_OK")).toBe(true);
         });

         it("marks status='failed' on 4xx Meta response without re-throwing", async () => {
           hasOptIn.mockResolvedValueOnce(true);
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" })
             .mockResolvedValueOnce({ id: "conv_1", lastInboundAt: new Date().toISOString() });
           isInWindow.mockReturnValueOnce(true);
           const err = new Error("Invalid phone number") as Error & { status?: number };
           err.status = 400;
           sendText.mockRejectedValueOnce(err);

           const result = await sendMessage({
             memberId: "mem_1",
             messageId: "msg_6",
             payload: { type: "text", body: "hi" },
             db: mockDb as any,
           });
           expect(result.externalId).toBe("");
           const setArgs = updateChain.set.mock.calls.map((c) => c[0]);
           expect(setArgs.some((s) => s.status === "failed" && typeof s.errorCode === "string")).toBe(true);
         });

         it("re-throws on 5xx (pg-boss retries)", async () => {
           hasOptIn.mockResolvedValueOnce(true);
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" })
             .mockResolvedValueOnce({ id: "conv_1", lastInboundAt: new Date().toISOString() });
           isInWindow.mockReturnValueOnce(true);
           const err = new Error("Bad gateway") as Error & { status?: number };
           err.status = 502;
           sendText.mockRejectedValueOnce(err);

           await expect(
             sendMessage({
               memberId: "mem_1",
               messageId: "msg_7",
               payload: { type: "text", body: "hi" },
               db: mockDb as any,
             }),
           ).rejects.toThrow(/Bad gateway/);
         });

         it("strips leading + from phone before passing to adapter", async () => {
           hasOptIn.mockResolvedValueOnce(true);
           selectChain.then
             .mockResolvedValueOnce({ id: "mem_p", phoneE164: "+447700900123" })
             .mockResolvedValueOnce({ id: "conv_p", lastInboundAt: new Date().toISOString() });
           isInWindow.mockReturnValueOnce(true);
           sendText.mockResolvedValueOnce({ messageId: "wamid_p" });
           await sendMessage({
             memberId: "mem_p",
             messageId: "msg_p",
             payload: { type: "text", body: "x" },
             db: mockDb as any,
           });
           const sendArgs = sendText.mock.calls[0][0];
           expect(sendArgs.to).toBe("447700900123");
           expect(sendArgs.to).not.toMatch(/^\+/);
         });
       });
       ```

    3. Run `pnpm --filter @gymos/worker test apps/worker/src/domain/sendMessage` — all 8 tests pass.
    4. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    5. Run `npx prettier --write apps/worker/src/domain/sendMessage*.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test 2>&amp;1 | tail -40</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/src/domain/sendMessage.ts` contains string `throw new NoOptInError` (gate 1)
    - `apps/worker/src/domain/sendMessage.ts` contains string `throw new WindowExpiredError` (gate 2)
    - `apps/worker/src/domain/sendMessage.ts` contains string `throw new TemplateNotApprovedError` (gate 3)
    - Gate order in source code: `hasOptIn` check appears BEFORE the `isInWindow` check, which appears BEFORE the `isTemplateApproved` check (verify by reading file linearly)
    - `apps/worker/src/domain/sendMessage.ts` contains string `sendText({ to, body` AND `sendTemplate({` (adapter calls)
    - `apps/worker/src/domain/sendMessage.ts` contains string `status >= 400 && status < 500` (4xx terminal handling)
    - All 8+ sendMessage tests pass
    - Critical assertion in tests: "throws NoOptInError" test verifies `sendText/sendTemplate.toHaveBeenCalledTimes(0)` (must_haves: success criterion #3 — no fetch to Meta on gate failure)
  </acceptance_criteria>
  <done>sendMessage chokepoint enforces all 3 gates with typed errors. All 4 P1b success criteria gate scenarios covered by tests (NoOptIn, WindowExpired, in-window happy path, template-approved happy path).</done>
</task>

<task type="auto">
  <name>Task 3: Register outbound-whatsapp queue handler with concurrency=1 + wire into worker index.ts</name>
  <files>apps/worker/src/queues/outbound-whatsapp.ts, apps/worker/src/index.ts</files>
  <read_first>
    - apps/worker/src/queues/inbound-whatsapp.ts (Plan 05 — copy structure)
    - apps/worker/src/domain/sendMessage.ts (created in Task 2)
    - packages/queue/src/types.ts (OutboundWhatsAppPayload schema; QUEUE_NAMES.OUTBOUND_WHATSAPP = 'outbound-whatsapp')
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-14 concurrency=1 rate=80/sec for outbound)
    - apps/worker/src/lib/errors.ts (typed errors to inspect job result)
  </read_first>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/queues/outbound-whatsapp.ts`:
       ```ts
       import type PgBoss from "pg-boss";
       import { QUEUE_NAMES, OutboundWhatsAppPayload } from "@gymos/queue";
       import { getDb } from "../lib/db.js";
       import { getLogger } from "../lib/logger.js";
       import { sendMessage } from "../domain/sendMessage.js";
       import {
         NoOptInError,
         WindowExpiredError,
         TemplateNotApprovedError,
       } from "../lib/errors.js";

       export async function registerOutboundWhatsAppWorker(boss: PgBoss) {
         const log = getLogger();

         await boss.work(
           QUEUE_NAMES.OUTBOUND_WHATSAPP,
           {
             teamSize: 1,         // D-14: concurrency=1 for outbound
             teamConcurrency: 1,
             // pg-boss enforces rate-limit at the producer level via newJobCheckIntervalSeconds;
             // 80/sec/phone (Meta's cap) is the upstream limit. With concurrency=1 + ~50ms-200ms
             // per send, throughput is ~5-20/sec — well under Meta's cap.
           },
           async (jobs) => {
             const job = Array.isArray(jobs) ? jobs[0] : jobs;
             const data = OutboundWhatsAppPayload.parse(job.data);
             const db = getDb();

             try {
               const result = await sendMessage({
                 memberId: data.memberId,
                 messageId: data.messageId,
                 payload: data.payload,
                 db,
               });
               log.info(
                 { messageId: data.messageId, externalId: result.externalId },
                 "[outbound-whatsapp] sent",
               );
             } catch (err) {
               // Gate failures are terminal — mark failed in messages, don't retry.
               // The status update happens inside sendMessage for the 4xx path; for
               // gate errors we need to UPDATE here.
               if (
                 err instanceof NoOptInError ||
                 err instanceof WindowExpiredError ||
                 err instanceof TemplateNotApprovedError
               ) {
                 log.warn(
                   { messageId: data.messageId, code: (err as { code?: string }).code, error: err.message },
                   "[outbound-whatsapp] gate refused",
                 );
                 const { eq } = await import("drizzle-orm");
                 const { schema } = await import("../lib/db.js");
                 await db
                   .update(schema.messages)
                   .set({
                     status: "failed",
                     errorCode: (err as { code?: string }).code ?? err.name,
                   })
                   .where(eq(schema.messages.id, data.messageId));
                 return; // pg-boss marks job complete — no retry
               }
               // Unknown error → re-throw, pg-boss retries up to retryLimit (D-13: retryLimit=3)
               log.error({ err, messageId: data.messageId }, "[outbound-whatsapp] transient error");
               throw err;
             }
           },
         );
       }
       ```

    2. Update `apps/worker/src/index.ts` to register the outbound worker:
       ```ts
       // ...existing imports...
       import { registerInboundWhatsAppWorker } from "./queues/inbound-whatsapp.js";
       import { registerOutboundWhatsAppWorker } from "./queues/outbound-whatsapp.js";

       // ...inside main(), after registerInboundWhatsAppWorker:
       await registerOutboundWhatsAppWorker(boss);
       log.info("[worker] outbound-whatsapp queue registered");
       ```

    3. Run `pnpm --filter @gymos/worker test` — all tests still pass.
    4. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    5. Run `pnpm --filter @gymos/worker build` — emits dist/.
    6. Run `npx prettier --write apps/worker/src/queues/outbound-whatsapp.ts apps/worker/src/index.ts`.

    7. Deploy to Fly: `fly deploy -a gymos-edge-webhooks --remote-only` (worker process picks up new entrypoint with both queues registered).

    8. Smoke test via direct pg-boss enqueue (manual test — full UI integration is Plan 08):
       ```sql
       -- Manually enqueue an outbound job for a known member with opt-in (or insert opt-in first)
       INSERT INTO whatsapp_opt_in (member_id, opted_in_at, source) VALUES (
         (SELECT id FROM gym_members LIMIT 1),
         NOW(),
         'manual_admin'
       );

       -- Insert a queued message
       INSERT INTO messages (id, conversation_id, direction, message_type, body, status)
       VALUES ('msg_test_outbound_1',
         (SELECT id FROM conversations LIMIT 1),
         'out', 'text', 'test from P1b-06', 'queued');

       -- Enqueue via pg-boss directly (or via psql + the JSON shape)
       -- The worker should pick it up + run sendMessage()
       ```
       Then watch fly logs and the messages.status column.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker build 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/src/queues/outbound-whatsapp.ts` contains string `boss.work` AND `OUTBOUND_WHATSAPP`
    - `apps/worker/src/queues/outbound-whatsapp.ts` contains string `teamSize: 1` AND `teamConcurrency: 1` (D-14 concurrency=1)
    - `apps/worker/src/queues/outbound-whatsapp.ts` contains string `sendMessage(` (calls the chokepoint)
    - `apps/worker/src/queues/outbound-whatsapp.ts` contains strings `NoOptInError` AND `WindowExpiredError` AND `TemplateNotApprovedError` (catches typed errors as terminal)
    - `apps/worker/src/queues/outbound-whatsapp.ts` contains string `status: "failed"` (marks message failed on gate refusal)
    - `apps/worker/src/index.ts` contains string `registerOutboundWhatsAppWorker`
    - `pnpm --filter @gymos/worker build` exits 0
    - `pnpm --filter @gymos/worker typecheck` exits 0
  </acceptance_criteria>
  <done>outbound-whatsapp queue handler wired into worker. Gates enforced at worker layer. Staff-web (Plan 08) can enqueue knowing the chokepoint will run all 3 gates.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/worker test` exits 0 with all gate + sendMessage tests passing (≥19 tests)
- sendMessage source code has gates in correct order (opt-in → window → template) with explicit throws BEFORE adapter call
- Test "throws WindowExpiredError + does NOT call adapter for text outside window" verifies fetch mock count = 0 (success criterion #3)
- Test "throws NoOptInError + does NOT call adapter" verifies fetch mock count = 0 (success criterion #4)
- outbound-whatsapp registered at concurrency=1 (D-14)
- 4xx terminal handling: messages.status='failed' without re-throw
- 5xx transient: re-throws (pg-boss retries)
</verification>

<success_criteria>
1. sendMessage() enforces all 3 gates in order — opt-in → window → template-approved (D-10)
2. NoOptInError, WindowExpiredError, TemplateNotApprovedError typed errors (lib/errors.ts already exists from Plan 05)
3. NO Meta API call on gate failure — verified by test assertions on fetch mock call count
4. 4xx → terminal (mark failed, return); 5xx → retry (re-throw)
5. Worker is the ONLY caller of @gymos/whatsapp (enforced by Plan 03 D-11 guard)
6. pg-boss singletonKey 'outbound-whatsapp:msg_<id>' (D-13) — already in @gymos/queue/publish.ts
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-06-SUMMARY.md` recording:
- Test count for sendMessage + gates
- The 4 P1b success-criteria gate scenarios covered by unit tests (success #3 WindowExpiredError, success #4 NoOptInError)
- Concurrency profile applied (outbound=1, inbound=5)
- One end-to-end manual outbound trace (messages.status: queued → sent + external_id populated)
- Notes for Plan 08 (staff-web action) about which queue to enqueue + which singletonKey format
</output>
