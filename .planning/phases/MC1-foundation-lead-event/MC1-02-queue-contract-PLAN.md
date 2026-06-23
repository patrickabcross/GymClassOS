---
phase: MC1-foundation-lead-event
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/queue/src/types.ts
  - packages/queue/src/publish.ts
  - apps/staff-web/app/lib/queue-client.ts
autonomous: true
requirements: [CAPI-04]

must_haves:
  truths:
    - "QUEUE_NAMES includes META_CAPI_EVENT mapped to the string 'meta-capi-event'"
    - "MetaCapiEventPayload Zod schema validates the enqueue arguments (pre-hashed PII, plain fbc/fbp, Unix-seconds eventTime)"
    - "enqueueMetaCapiEvent() sets singletonKey on the event_id so duplicate enqueues dedup"
    - "staff-web can import enqueueMetaCapiEvent from app/lib/queue-client"
  artifacts:
    - path: "packages/queue/src/types.ts"
      provides: "META_CAPI_EVENT queue name + MetaCapiEventPayload schema/type"
      contains: "META_CAPI_EVENT"
    - path: "packages/queue/src/publish.ts"
      provides: "enqueueMetaCapiEvent() with singletonKey on event_id"
      contains: "enqueueMetaCapiEvent"
    - path: "apps/staff-web/app/lib/queue-client.ts"
      provides: "staff-web re-export of enqueueMetaCapiEvent"
      contains: "enqueueMetaCapiEvent"
  key_links:
    - from: "publish.ts enqueueMetaCapiEvent"
      to: "QUEUE_NAMES.META_CAPI_EVENT queue"
      via: "boss.send with singletonKey on eventId"
      pattern: "singletonKey.*eventId"
---

<objective>
Define the queue contract for Meta CAPI events: the `META_CAPI_EVENT` queue name, the `MetaCapiEventPayload` Zod schema (the wire shape staff-web sends and the worker parses), the `enqueueMetaCapiEvent()` publisher with `singletonKey` idempotency on the shared `event_id`, and the staff-web re-export wrapper.

Purpose: This is the interface contract both MC1-03 (worker sender) and MC1-04 (submit wiring) build against. Defining it as its own wave-1 plan lets the worker and submit handler be implemented in parallel against a frozen payload shape.
Output: A new queue name + payload schema in `packages/queue`, an `enqueueMetaCapiEvent()` function, and a staff-web re-export.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md
@.planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md

<interfaces>
<!-- Existing queue contract (verified from packages/queue/src). Match this style exactly. -->

From packages/queue/src/types.ts:
```typescript
export const QUEUE_NAMES = {
  OUTBOUND_WHATSAPP: "outbound-whatsapp",
  INBOUND_WHATSAPP: "inbound-whatsapp",
  STRIPE_EVENT: "stripe-event",
  CLASS_REMINDER: "class-reminder",
  CLASS_MATERIALIZE: "class-materialize",
} as const;
export const OutboundWhatsAppPayload = z.object({ /* ... */ });
```

From packages/queue/src/publish.ts (the pattern to mirror):
```typescript
import { startBoss } from "./boss.js";
export async function enqueueOutboundWhatsApp(args /* ... */) {
  const data = OutboundWhatsAppPayload.parse(args);
  const boss = await startBoss();
  return boss.send(QUEUE_NAMES.OUTBOUND_WHATSAPP, data, {
    singletonKey: `${QUEUE_NAMES.OUTBOUND_WHATSAPP}:${data.messageId}`,
    /* retryLimit, retryBackoff, ... */
  });
}
```

From apps/staff-web/app/lib/queue-client.ts (the re-export pattern):
```typescript
import { enqueueOutboundWhatsApp } from "@gymos/queue";
export { enqueueOutboundWhatsApp };
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: META_CAPI_EVENT queue name + MetaCapiEventPayload schema</name>
  <files>packages/queue/src/types.ts</files>
  <read_first>
    - packages/queue/src/types.ts — read the full file: the `QUEUE_NAMES` object and the existing `z.object(...)` payload schemas (OutboundWhatsAppPayload etc.) to match field-naming style and the `z.infer` export convention.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 6" for the exact payload field list.
  </read_first>
  <action>
    Add a `META_CAPI_EVENT: "meta-capi-event"` entry to the `QUEUE_NAMES` const object (keep the `as const`).

    Add the payload schema + inferred type, exactly matching the contract MC1-03 and MC1-04 will use. PII is PRE-HASHED by the submit handler before enqueue (raw PII must never enter the queue); `fbc`/`fbp`/`clientIp`/`clientUserAgent` are PLAIN (Meta requires them unhashed); `eventTime` is Unix SECONDS:
    ```typescript
    export const MetaCapiEventPayload = z.object({
      eventId: z.string().min(1),        // shared browser <-> server event_id (dedup key)
      memberId: z.string().min(1),       // attribution lookup + idempotency
      eventName: z.string().min(1),      // "Lead" for MC1 (resolved from stageEventMap)
      actionSource: z.string().min(1),   // "website" for form leads
      eventTime: z.number().int(),       // Unix SECONDS (NOT milliseconds)
      eventSourceUrl: z.string().optional(),
      // Pre-hashed PII (SHA-256 hex) — never raw PII in the queue
      hashedEmail: z.string().optional(),
      hashedPhone: z.string().optional(),
      hashedFn: z.string().optional(),
      hashedLn: z.string().optional(),
      // Attribution + match signals — PLAIN, never hashed
      fbc: z.string().optional(),
      fbp: z.string().optional(),
      clientIp: z.string().optional(),
      clientUserAgent: z.string().optional(),
    });
    export type MetaCapiEventPayload = z.infer<typeof MetaCapiEventPayload>;
    ```
    Note: `pixelId` is intentionally NOT in the payload — the worker resolves it from `studio_owner_config` at execution time (avoids stale pixelId in queued jobs; per RESEARCH Open Question 1 recommendation). Document this with a one-line comment.
  </action>
  <verify>
    <automated>grep -n 'META_CAPI_EVENT: "meta-capi-event"' packages/queue/src/types.ts && grep -n "MetaCapiEventPayload" packages/queue/src/types.ts && grep -n "eventTime: z.number().int()" packages/queue/src/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/queue/src/types.ts` contains `META_CAPI_EVENT: "meta-capi-event"` inside `QUEUE_NAMES`
    - `MetaCapiEventPayload` exports a Zod schema with fields `eventId, memberId, eventName, actionSource, eventTime, eventSourceUrl, hashedEmail, hashedPhone, hashedFn, hashedLn, fbc, fbp, clientIp, clientUserAgent`
    - `eventTime` is `z.number().int()` (seconds, not a string/date)
    - `eventId` and `memberId` are `z.string().min(1)` (required)
    - A comment notes that `pixelId` is resolved by the worker, not passed in the payload
    - `MetaCapiEventPayload` type is exported via `z.infer`
  </acceptance_criteria>
  <done>META_CAPI_EVENT queue name + MetaCapiEventPayload schema/type added matching the existing queue style.</done>
</task>

<task type="auto">
  <name>Task 2: enqueueMetaCapiEvent() publisher + staff-web re-export</name>
  <files>packages/queue/src/publish.ts, apps/staff-web/app/lib/queue-client.ts</files>
  <read_first>
    - packages/queue/src/publish.ts — read `enqueueOutboundWhatsApp` and `enqueueStripeEvent` to copy the exact `startBoss()` + `boss.send(...)` + `singletonKey` + retry-options shape (verified: `enqueueOutboundWhatsApp` uses `singletonKey: ${QUEUE_NAMES.OUTBOUND_WHATSAPP}:${data.messageId}`).
    - apps/staff-web/app/lib/queue-client.ts — read the full file (currently re-exports `enqueueOutboundWhatsApp` from `@gymos/queue`).
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 6" → `enqueueMetaCapiEvent` reference snippet.
  </read_first>
  <action>
    In `packages/queue/src/publish.ts`, add:
    ```typescript
    export async function enqueueMetaCapiEvent(
      args: MetaCapiEventPayload,
    ): Promise<string | null> {
      const data = MetaCapiEventPayload.parse(args);
      const boss = await startBoss();
      return boss.send(QUEUE_NAMES.META_CAPI_EVENT, data, {
        singletonKey: `${QUEUE_NAMES.META_CAPI_EVENT}:${data.eventId}`,
        retryLimit: 5,
        retryBackoff: true,
        expireInSeconds: 60 * 60 * 24, // 24h — within Meta's 48h dedup window
      });
    }
    ```
    Import `MetaCapiEventPayload` (and `QUEUE_NAMES` if not already imported) from `./types.js`. The `singletonKey` on `eventId` gives idempotency: a duplicate enqueue of the same event_id collapses to one job (D-15 / RESEARCH "Don't Hand-Roll").

    In `apps/staff-web/app/lib/queue-client.ts`, add the re-export so staff-web handlers import from here (NOT directly from `@gymos/queue` — matches the established indirection):
    ```typescript
    import { enqueueMetaCapiEvent } from "@gymos/queue";
    export { enqueueMetaCapiEvent };
    ```
    Confirm `enqueueMetaCapiEvent` is exported from the `@gymos/queue` package entrypoint (check `packages/queue/src/index.ts` or the package's main export barrel; if `enqueueOutboundWhatsApp` is re-exported there, add `enqueueMetaCapiEvent` alongside it).

    Run prettier on all three files.
  </action>
  <verify>
    <automated>grep -n "enqueueMetaCapiEvent" packages/queue/src/publish.ts && grep -rn "enqueueMetaCapiEvent" apps/staff-web/app/lib/queue-client.ts && grep -n "singletonKey" packages/queue/src/publish.ts | grep -i meta</automated>
  </verify>
  <acceptance_criteria>
    - `packages/queue/src/publish.ts` exports `async function enqueueMetaCapiEvent`
    - It calls `MetaCapiEventPayload.parse(args)` and `boss.send(QUEUE_NAMES.META_CAPI_EVENT, ...)`
    - The `singletonKey` interpolates `data.eventId` (e.g. `${QUEUE_NAMES.META_CAPI_EVENT}:${data.eventId}`)
    - `retryLimit: 5` and `retryBackoff: true` are set
    - `apps/staff-web/app/lib/queue-client.ts` re-exports `enqueueMetaCapiEvent`
    - `enqueueMetaCapiEvent` is importable from `@gymos/queue` (present in the package's export barrel)
  </acceptance_criteria>
  <done>enqueueMetaCapiEvent() publishes to META_CAPI_EVENT with event_id singletonKey + retries; staff-web re-exports it.</done>
</task>

</tasks>

<verification>
- `META_CAPI_EVENT` + `MetaCapiEventPayload` present in types.ts.
- `enqueueMetaCapiEvent` present in publish.ts with singletonKey on eventId + retryLimit 5.
- staff-web queue-client re-exports it; importable from `@gymos/queue`.
- `npx tsc --noEmit` in packages/queue has no new errors.
</verification>

<success_criteria>
- CAPI-04 (queue contract portion): the `meta-capi-event` queue name + payload schema + idempotent enqueue exist, ready for the worker sender (MC1-03) and submit wiring (MC1-04) to build against in parallel.
</success_criteria>

<output>
After completion, create `.planning/phases/MC1-foundation-lead-event/MC1-02-SUMMARY.md`. Include the frozen `MetaCapiEventPayload` field list so MC1-03 and MC1-04 executors can build against it verbatim.
</output>
