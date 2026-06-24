---
phase: MC3-meta-lead-ads-crm-lifecycle
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/queue/src/types.ts
  - packages/queue/src/publish.ts
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/plugins/db.ts
  - services/worker/src/queues/meta-capi-event.ts
  - services/worker/src/domain/metaLifecycle.ts
  - services/worker/src/domain/stripeReducers/checkout-session-completed.ts
  - services/worker/src/domain/stripeReducers/invoice-paid.ts
  - apps/staff-web/actions/mark-booking-attended.ts
autonomous: true
requirements: [LEAD-02]
must_haves:
  truths:
    - "A Contact/Purchase/Schedule CAPI event for a member who has a stored meta_lead_id carries user_data.lead_id as a plain string"
    - "A lifecycle event for a member WITHOUT a meta_lead_id is unchanged — no lead_id key, no breakage (additive)"
    - "The meta_lead_attribution table has a meta_lead_id TEXT column after migration v34"
    - "The queue contract exposes a META_LEAD queue name + MetaLeadPayload + enqueueMetaLead() for MC3-02"
  artifacts:
    - path: "packages/queue/src/types.ts"
      provides: "QUEUE_NAMES.META_LEAD, MetaLeadPayload Zod schema, leadId? on MetaCapiEventPayload"
      contains: "META_LEAD"
    - path: "packages/queue/src/publish.ts"
      provides: "enqueueMetaLead() retrieval-job enqueue helper"
      contains: "enqueueMetaLead"
    - path: "apps/staff-web/server/plugins/db.ts"
      provides: "Additive migration v34 adding meta_lead_id"
      contains: "version: 34"
    - path: "services/worker/src/queues/meta-capi-event.ts"
      provides: "user_data.lead_id injection when payload.leadId present"
      contains: "userData.lead_id"
    - path: "services/worker/src/domain/metaLifecycle.ts"
      provides: "getOrUpsertAttribution returns metaLeadId; Contact passes leadId through"
      contains: "metaLeadId"
  key_links:
    - from: "lifecycle fire points (Contact/Purchase/Schedule)"
      to: "meta_lead_attribution.meta_lead_id"
      via: "getOrUpsertAttribution SELECT + enqueueMetaCapiEvent({ leadId })"
      pattern: "leadId"
    - from: "services/worker/src/queues/meta-capi-event.ts"
      to: "Meta Graph v23 user_data"
      via: "if (data.leadId) userData.lead_id = data.leadId"
      pattern: "userData\\.lead_id"
---

<objective>
Thread a single new identifier — the Meta `lead_id` (stored as `meta_lead_id`) — through the existing MC1/MC2 CAPI chain, and publish the queue contract MC3-02 needs to ingest Lead Ads. This is the MC3 foundation plan (mirrors MC2-01): purely additive, every change backward-compatible, no new outbound path.

Purpose: Lead-Ad leads (ingested in MC3-02) advance through the SAME Contact/Purchase/Schedule senders MC2 built, reported back to Meta's Leads Center keyed on `lead_id` (LEAD-02). The CAPI queue, worker sender, stageEventMap resolver, attribution table, per-stage idempotency markers, and the four fire points all already exist — this plan only adds `meta_lead_id` storage + a `leadId` passthrough.

Output: v34 migration (`meta_lead_id`), three additive enum/column edits in schema.ts, `leadId?` on `MetaCapiEventPayload`, `user_data.lead_id` injection in the worker CAPI handler, `getOrUpsertAttribution` returning `metaLeadId`, and `leadId` wired into all four lifecycle fire points. Plus the `META_LEAD` queue name + `MetaLeadPayload` + `enqueueMetaLead()` that MC3-02 consumes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-CONTEXT.md
@.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md
@.planning/phases/MC2-deep-funnel-lifecycle/MC2-01-SUMMARY.md

<interfaces>
<!-- Current contracts. Use directly — no codebase exploration needed. -->

packages/queue/src/types.ts — MetaCapiEventPayload (additive: add leadId? after stageKey):
```typescript
export const MetaCapiEventPayload = z.object({
  eventId: z.string().min(1),
  memberId: z.string().min(1),
  eventName: z.string().min(1),
  actionSource: z.string().min(1),
  eventTime: z.number().int(),
  eventSourceUrl: z.string().optional(),
  hashedEmail: z.string().optional(),
  hashedPhone: z.string().optional(),
  hashedFn: z.string().optional(),
  hashedLn: z.string().optional(),
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  clientIp: z.string().optional(),
  clientUserAgent: z.string().optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  stageKey: z.enum(["lead", "contact", "purchase", "schedule"]).optional(),
});
```

QUEUE_NAMES (add META_LEAD: "meta-lead"):
```typescript
export const QUEUE_NAMES = {
  OUTBOUND_WHATSAPP: "outbound-whatsapp",
  INBOUND_WHATSAPP: "inbound-whatsapp",
  STRIPE_EVENT: "stripe-event",
  CLASS_REMINDER: "class-reminder",
  CLASS_MATERIALIZE: "class-materialize",
  META_CAPI_EVENT: "meta-capi-event",
} as const;
```

services/worker/src/queues/meta-capi-event.ts — userData block (lines ~123-132). Add ONE line after the clientUserAgent line:
```typescript
const userData: Record<string, unknown> = {};
if (data.hashedEmail) userData.em = [data.hashedEmail];
if (data.hashedPhone) userData.ph = [data.hashedPhone];
if (data.hashedFn) userData.fn = data.hashedFn;
if (data.hashedLn) userData.ln = data.hashedLn;
if (data.fbc) userData.fbc = data.fbc;
if (data.fbp) userData.fbp = data.fbp;
if (data.clientIp) userData.client_ip_address = data.clientIp;
if (data.clientUserAgent) userData.client_user_agent = data.clientUserAgent;
// MC3: in-platform Lead Ad — plain string, NOT hashed, NOT top-level
if (data.leadId) userData.lead_id = data.leadId;
```

services/worker/src/domain/metaLifecycle.ts — getOrUpsertAttribution currently returns { fbc?, fbp?, clientIp?, clientUserAgent? } from a SELECT of fbc, fbp, client_ip, client_user_agent. fireContactCapiIfFirstReply calls it then enqueues a Contact event.

apps/staff-web/server/db/schema.ts:
- metaLeadAttribution table (~line 733) — add metaLeadId after lastError.
- whatsappOptIn.source enum (~line 416): ["inbound_reply","manual_admin","import","form_submission"] — add "meta_lead_ads".
- webhookEvents.provider enum (~line 389): ["stripe","whatsapp"] — add "meta_lead".

apps/staff-web/server/plugins/db.ts — runMigrations array; latest is `{ version: 33, sql: "ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS last_error TEXT" }`. Next free is v34. NOTE: whatsapp_opt_in.source and webhook_events.provider are plain TEXT columns with NO Postgres CHECK constraint (verified — the Drizzle enum is TypeScript-level only). Therefore NO constraint ALTER is needed; v34 only adds the meta_lead_id column.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Queue contract — META_LEAD + MetaLeadPayload + leadId? + enqueueMetaLead()</name>
  <files>packages/queue/src/types.ts, packages/queue/src/publish.ts, packages/queue/src/lifecycle-payload.test.ts</files>
  <read_first>
    - packages/queue/src/types.ts (the file being modified — QUEUE_NAMES + MetaCapiEventPayload)
    - packages/queue/src/publish.ts (the file being modified — existing enqueue* helpers, esp. enqueueMetaCapiEvent for the boss.send pattern)
    - packages/queue/src/lifecycle-payload.test.ts (existing MetaCapiEventPayload tests — MC2-01 added 7; extend, don't replace)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "MetaLeadPayload (new, types.ts)" + "MetaCapiEventPayload extension"
  </read_first>
  <behavior>
    - Test: MetaCapiEventPayload.parse({...valid, leadId: "55459717045641545"}) succeeds and returns leadId.
    - Test: MetaCapiEventPayload.parse({...valid}) (no leadId) succeeds — leadId is undefined (backward compatible).
    - Test: MetaLeadPayload.parse({ leadgenId: "551", formId: "1", pageId: "2", adId: "0" }) succeeds.
    - Test: MetaLeadPayload.parse({}) FAILS (leadgenId is required, min 1).
    - Test: MetaLeadPayload.parse({ leadgenId: "551" }) succeeds — formId/pageId/adId default to "".
  </behavior>
  <action>
    In packages/queue/src/types.ts:
    1. Add to QUEUE_NAMES (additive, after META_CAPI_EVENT): `/** MC3: Meta Lead Ads retrieval job — worker GET /{leadgen_id} + ingest */ META_LEAD: "meta-lead",`
    2. Add ONE optional field to MetaCapiEventPayload, after the stageKey line (additive, no existing field touched):
       `// MC3 (LEAD-02): Meta lead_id for in-platform Lead Ad leads. PLAIN string (NOT hashed), placed in user_data.lead_id by the worker. Stored as meta_lead_attribution.meta_lead_id.`
       `leadId: z.string().optional(),`
    3. Add a new exported schema + type:
       ```typescript
       export const MetaLeadPayload = z.object({
         leadgenId: z.string().min(1), // STRING — 15-16 digit int, stringified at the edge before precision loss
         formId: z.string().default(""),
         pageId: z.string().default(""),
         adId: z.string().default(""),
       });
       export type MetaLeadPayload = z.infer<typeof MetaLeadPayload>;
       ```
    In packages/queue/src/publish.ts:
    4. Add MetaLeadPayload to the import from "./types.js".
    5. Add enqueueMetaLead() modeled on enqueueStripeEvent (NO singletonKey — webhook idempotency via insertWebhookEvent is the dedup guard, per RESEARCH Open Question 3):
       ```typescript
       /**
        * MC3: Enqueue a Meta Lead Ads retrieval job. The worker GETs
        * /{leadgen_id} for field_data then ingests the member.
        * No singletonKey — duplicate enqueues are already prevented by
        * insertWebhookEvent ON CONFLICT (provider, external_id) at the edge.
        */
       export async function enqueueMetaLead(
         args: MetaLeadPayload,
       ): Promise<string | null> {
         const data = MetaLeadPayload.parse(args);
         const boss = await startBoss();
         return boss.send(QUEUE_NAMES.META_LEAD, data, {
           retryLimit: 5,
           retryBackoff: true,
           expireInSeconds: 60 * 60, // 1h — lead retrieval should resolve fast
         });
       }
       ```
    6. Extend packages/queue/src/lifecycle-payload.test.ts with the 5 tests in <behavior> (do not remove existing tests).
  </action>
  <verify>
    <automated>cd packages/queue && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `packages/queue/src/types.ts` contains `META_LEAD`
    - `packages/queue/src/types.ts` contains `leadId: z.string().optional()`
    - `packages/queue/src/types.ts` contains `export const MetaLeadPayload`
    - `packages/queue/src/publish.ts` contains `export async function enqueueMetaLead`
    - `packages/queue/src/publish.ts` does NOT contain `singletonKey` inside the enqueueMetaLead body
    - `cd packages/queue && pnpm test` passes (existing 30 + 5 new)
    - `cd packages/queue && pnpm build` succeeds (regenerates dist/index.d.ts so downstream worker tsc sees the new fields)
  </acceptance_criteria>
  <done>QUEUE_NAMES.META_LEAD, MetaLeadPayload, leadId? on MetaCapiEventPayload, and enqueueMetaLead() all exist, tested, and the package builds.</done>
</task>

<task type="auto">
  <name>Task 2: Schema + migration v34 — meta_lead_id column + two additive enum values</name>
  <files>apps/staff-web/server/db/schema.ts, apps/staff-web/server/plugins/db.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts (the file being modified — metaLeadAttribution ~line 733, whatsappOptIn.source ~line 416, webhookEvents.provider ~line 389)
    - apps/staff-web/server/plugins/db.ts (the file being modified — runMigrations array; v31/v32/v33 are the most recent additive examples ~lines 389-428)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "Migration v34" + Pitfall 7 (constraint check)
    - Memory note: "Migration drift gotcha" — db.ts migrations are NOT auto-run; flag in SUMMARY that v34 must be applied to gymos-demo Neon by hand.
  </read_first>
  <action>
    In apps/staff-web/server/db/schema.ts:
    1. Add to the metaLeadAttribution table object (after `lastError: text("last_error"),`, additive):
       `// MC3 (D-13/LEAD-02): Meta lead_id for in-platform Lead Ad leads. Stored at ingest`
       `// (MC3-02), read by the lifecycle fire points and passed as user_data.lead_id.`
       `metaLeadId: text("meta_lead_id"),`
    2. In whatsappOptIn.source enum, add "meta_lead_ads" (additive — last value):
       `enum: ["inbound_reply", "manual_admin", "import", "form_submission", "meta_lead_ads"],`
    3. In webhookEvents.provider enum, add "meta_lead" (additive — last value):
       `provider: text("provider", { enum: ["stripe", "whatsapp", "meta_lead"] }).notNull(),`
    In apps/staff-web/server/plugins/db.ts:
    4. Append a new migration object to the runMigrations array (additive only — IF NOT EXISTS; NO drop/rename; NO drizzle-kit push):
       ```javascript
       {
         version: 34,
         // MC3 (D-13): store the Meta lead_id on the attribution row so lifecycle
         // events (Contact/Purchase/Schedule) report back to Meta's Leads Center
         // keyed on lead_id (LEAD-02). Strictly additive. whatsapp_opt_in.source
         // and webhook_events.provider are plain TEXT (no CHECK constraint), so the
         // two new enum values need only the Drizzle schema edit — no SQL here.
         // Apply to gymos-demo Neon by hand after deploy (migration-drift gotcha).
         sql: `ALTER TABLE meta_lead_attribution ADD COLUMN IF NOT EXISTS meta_lead_id TEXT`,
       },
       ```
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/db/schema.ts` contains `metaLeadId: text("meta_lead_id")`
    - `apps/staff-web/server/db/schema.ts` contains `"meta_lead_ads"`
    - `apps/staff-web/server/db/schema.ts` contains `"meta_lead"` in the webhookEvents provider enum line
    - `apps/staff-web/server/plugins/db.ts` contains `version: 34`
    - `apps/staff-web/server/plugins/db.ts` v34 sql contains `ADD COLUMN IF NOT EXISTS meta_lead_id TEXT`
    - `apps/staff-web/server/plugins/db.ts` v34 contains NO `DROP`, NO `RENAME`, NO `drizzle-kit push`
    - `cd apps/staff-web && pnpm tsc --noEmit` passes
  </acceptance_criteria>
  <done>The v34 migration adds meta_lead_id additively; the Drizzle schema exposes meta_lead_id plus the two new enum values; staff-web typechecks clean.</done>
</task>

<task type="auto">
  <name>Task 3: lead_id passthrough — CAPI handler + all four lifecycle fire points</name>
  <files>services/worker/src/queues/meta-capi-event.ts, services/worker/src/domain/metaLifecycle.ts, services/worker/src/domain/stripeReducers/checkout-session-completed.ts, services/worker/src/domain/stripeReducers/invoice-paid.ts, apps/staff-web/actions/mark-booking-attended.ts</files>
  <read_first>
    - services/worker/src/queues/meta-capi-event.ts (the file being modified — userData block ~lines 123-132)
    - services/worker/src/domain/metaLifecycle.ts (the file being modified — getOrUpsertAttribution ~lines 134-171, fireContactCapiIfFirstReply ~lines 197-238)
    - services/worker/src/domain/stripeReducers/checkout-session-completed.ts (the file being modified — getOrUpsertAttribution + enqueueMetaCapiEvent ~lines 119-134)
    - services/worker/src/domain/stripeReducers/invoice-paid.ts (the file being modified — same pattern ~lines 116-...)
    - apps/staff-web/actions/mark-booking-attended.ts (the file being modified — the Schedule fire point; reads fbc/fbp via raw SQL ~lines 86-138)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "Pattern 3: lead_id Injection" + "Extracting lead_id from meta_lead_attribution"
  </read_first>
  <action>
    Task 1 must be built first (`pnpm --filter @gymos/queue build`) so the worker tsc sees the new payload fields (MC2-01 workspace build-order note).

    1. services/worker/src/queues/meta-capi-event.ts — after the `if (data.clientUserAgent) userData.client_user_agent = ...` line, add EXACTLY:
       `// MC3 (LEAD-02): in-platform Lead Ad lead_id — PLAIN string, NOT hashed (confirmed RESEARCH D-14).`
       `if (data.leadId) userData.lead_id = data.leadId;`
       No other change to the CAPI body. action_source already carries "system_generated" from the fire points; event_source_url stays conditionally omitted; this is sufficient for CRM/Leads-Center matching (RESEARCH).

    2. services/worker/src/domain/metaLifecycle.ts — extend getOrUpsertAttribution:
       (a) Add `meta_lead_id` to the SELECT: `SELECT fbc, fbp, client_ip, client_user_agent, meta_lead_id FROM meta_lead_attribution WHERE member_id = ${memberId} LIMIT 1`
       (b) Extend the return type with `metaLeadId?: string;`
       (c) Add to the returned object: `metaLeadId: (row.meta_lead_id as string | null) ?? undefined,`
       Then in fireContactCapiIfFirstReply, in the enqueueMetaCapiEvent call, add `leadId: attr.metaLeadId,` (additive — undefined when no Lead Ad).

    3. services/worker/src/domain/stripeReducers/checkout-session-completed.ts — in the enqueueMetaCapiEvent call (~line 121), add `leadId: attr.metaLeadId,` (attr is already `await getOrUpsertAttribution(db, memberId)`).

    4. services/worker/src/domain/stripeReducers/invoice-paid.ts — in its enqueueMetaCapiEvent call, add `leadId: attr.metaLeadId,` (attr is already `await getOrUpsertAttribution(db, resolvedMemberId)`).

    5. apps/staff-web/actions/mark-booking-attended.ts — the Schedule fire point reads attribution via raw SQL, not the worker helper. Update its SELECT and enqueue:
       (a) Change the attribution SELECT to also read meta_lead_id: `SELECT fbc, fbp, meta_lead_id FROM meta_lead_attribution WHERE member_id = ${booking.memberId} LIMIT 1`
       (b) In the enqueueMetaCapiEvent call (~line 127), add `leadId: (attrTyped.meta_lead_id as string | null) ?? undefined,`
  </action>
  <verify>
    <automated>cd services/worker && pnpm tsc --noEmit && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/queues/meta-capi-event.ts` contains `userData.lead_id = data.leadId`
    - `services/worker/src/domain/metaLifecycle.ts` SELECT contains `meta_lead_id`
    - `services/worker/src/domain/metaLifecycle.ts` contains `metaLeadId` in both the return type and the returned object
    - `services/worker/src/domain/metaLifecycle.ts` fireContactCapiIfFirstReply enqueue contains `leadId: attr.metaLeadId`
    - `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` contains `leadId: attr.metaLeadId`
    - `services/worker/src/domain/stripeReducers/invoice-paid.ts` contains `leadId: attr.metaLeadId`
    - `apps/staff-web/actions/mark-booking-attended.ts` SELECT contains `meta_lead_id` and the enqueue contains `leadId:`
    - `cd services/worker && pnpm tsc --noEmit` passes (after `pnpm --filter @gymos/queue build`)
    - `cd services/worker && pnpm test` passes
    - `cd apps/staff-web && pnpm tsc --noEmit` passes
  </acceptance_criteria>
  <done>All four lifecycle fire points pass leadId through; the worker CAPI handler injects user_data.lead_id only when present; both packages typecheck and tests pass.</done>
</task>

</tasks>

<verification>
- `cd packages/queue && pnpm test && pnpm build` green
- `cd apps/staff-web && pnpm tsc --noEmit` green
- `cd services/worker && pnpm tsc --noEmit && pnpm test` green
- grep confirms: `userData.lead_id` in meta-capi-event.ts; `meta_lead_id` in metaLifecycle.ts SELECT; `leadId: attr.metaLeadId` in both stripe reducers + Contact; `leadId:` in mark-booking-attended.ts; `version: 34` + `meta_lead_id TEXT` in db.ts; `META_LEAD` + `enqueueMetaLead` in queue
- Migration v34 is strictly additive (IF NOT EXISTS; no DROP/RENAME/push)
</verification>

<success_criteria>
- A lifecycle CAPI event for a member with a stored meta_lead_id carries `user_data.lead_id` (plain string); a member without one is unchanged (no lead_id key) — LEAD-02 prerequisite.
- meta_lead_attribution has a meta_lead_id TEXT column (v34); the source/provider enums carry the two new MC3 values.
- The queue contract exposes META_LEAD + MetaLeadPayload + enqueueMetaLead() for MC3-02.
- All three packages typecheck and all existing + new tests pass.
</success_criteria>

<output>
After completion, create `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-01-SUMMARY.md`.
Flag in the SUMMARY: migration v34 must be applied to gymos-demo Neon by hand after deploy (db.ts migrations are NOT auto-run — migration-drift gotcha).
</output>
