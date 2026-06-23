---
phase: MC2-deep-funnel-lifecycle
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - services/worker/src/domain/metaLifecycle.ts
  - services/worker/src/domain/conversations.ts
  - services/worker/src/queues/inbound-whatsapp.ts
autonomous: true
requirements: [LIFE-01, LIFE-04]
must_haves:
  truths:
    - "A lead's first inbound WhatsApp reply enqueues exactly one Contact CAPI event"
    - "A second inbound reply from the same member does NOT enqueue another Contact event (contact_sent_at gate)"
    - "The Contact event uses event_id = memberId:contact and action_source = system_generated"
    - "A Contact enqueue failure never aborts the inbound message processing (best-effort try/catch, D-17)"
  artifacts:
    - path: "services/worker/src/domain/metaLifecycle.ts"
      provides: "fireContactCapiIfFirstReply helper"
      contains: "fireContactCapiIfFirstReply"
    - path: "services/worker/src/queues/inbound-whatsapp.ts"
      provides: "Contact fire hook after processed:true inbound"
      contains: "fireContactCapiIfFirstReply"
  key_links:
    - from: "services/worker/src/queues/inbound-whatsapp.ts"
      to: "fireContactCapiIfFirstReply"
      via: "call after upsertConversationAndMessage returns processed:true (inbound branch only)"
      pattern: "fireContactCapiIfFirstReply"
    - from: "fireContactCapiIfFirstReply"
      to: "enqueueMetaCapiEvent"
      via: "@gymos/queue enqueue with eventId memberId:contact"
      pattern: "enqueueMetaCapiEvent"
---

<objective>
Fire a Contact CAPI event the first time a lead replies on WhatsApp. The fire point lives in the worker inbound path — after a new inbound message is successfully materialised — gated on the durable `contact_sent_at` marker so a repeat inbound weeks later does not re-fire. Reuses the shared helpers from Plan 01 (attribution upsert, member hashing) and the existing stageEventMap resolver.

Purpose: LIFE-01 — deep-funnel "replied" signal reaches Meta with stored fbc/fbp, optimising campaigns for genuine engagement.
Output: `fireContactCapiIfFirstReply` helper + wiring in inbound-whatsapp.ts; `upsertConversationAndMessage` returns the resolved memberId.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MC2-deep-funnel-lifecycle/MC2-CONTEXT.md
@.planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md
@.planning/REQUIREMENTS.md

<interfaces>
From Plan 01 — services/worker/src/domain/metaLifecycle.ts exports:
```typescript
export function toMajorUnits(amountMinorUnits: number, currency: string): number;
export async function getMemberHashes(db, memberId): Promise<{ hashedEmail?: string; hashedPhone?: string }>;
export async function getOrUpsertAttribution(db, memberId): Promise<{ fbc?: string; fbp?: string; clientIp?: string; clientUserAgent?: string }>;
```

enqueueMetaCapiEvent (import from "@gymos/queue") — worker already imports enqueueOutboundWhatsApp from "@gymos/queue" the same way (services/worker/src/queues/daily-owner-digest.ts line 40). Extended payload now accepts value/currency/stageKey.

resolveStageEvent (services/worker/src/lib/stage-event-map.ts): `resolveStageEvent(config, "contact")` -> "Contact" (or configured override). Pass the meta_stage_event_map from studio_owner_config, or null for the default.

upsertConversationAndMessage (services/worker/src/domain/conversations.ts ~line 74) currently returns `{ processed: boolean; reason?: string }`. It resolves/creates `member` internally (line 86-134) but does NOT return member.id. MC2 must add `memberId?: string` to the return and populate it when processed === true.

inbound-whatsapp.ts (services/worker/src/queues/inbound-whatsapp.ts) — the normal inbound branch (data.direction !== "out") calls upsertConversationAndMessage at ~line 147 and stores the result. The outbound mirror branch (direction === "out") must NOT fire Contact.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Return memberId from upsertConversationAndMessage + add fireContactCapiIfFirstReply helper</name>
  <files>services/worker/src/domain/conversations.ts, services/worker/src/domain/metaLifecycle.ts</files>
  <read_first>
    - services/worker/src/domain/conversations.ts (FULL file — return shape at line 78, member resolution at lines 86-134, the processed:true return at line 235)
    - services/worker/src/domain/metaLifecycle.ts (Plan 01 helpers being extended — getOrUpsertAttribution, getMemberHashes)
    - services/worker/src/lib/stage-event-map.ts (resolveStageEvent signature + Contact default)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (LIFE-01 breakdown ~line 295-332; Spec Q5 first-reply race safety ~line 270-289)
  </read_first>
  <action>
    Two edits.

    1. In services/worker/src/domain/conversations.ts, change the return type of `upsertConversationAndMessage` from `{ processed: boolean; reason?: string }` to `{ processed: boolean; reason?: string; memberId?: string }`. The `member` variable is in scope at the final `return { processed: true };` (line 235) — change it to `return { processed: true, memberId: member.id };`. Do NOT change the `{ processed: false, reason }` returns (no memberId needed there). This is the minimal change from RESEARCH option (b).

    2. In services/worker/src/domain/metaLifecycle.ts, add a new exported helper `fireContactCapiIfFirstReply(db, memberId, stageEventMapConfig)`:
    ```typescript
    export async function fireContactCapiIfFirstReply(
      db: any,
      memberId: string,
      stageEventMapConfig?: string | Record<string, string> | null,
    ): Promise<void> {
      // 1. Ensure attribution row exists (D-04/D-05) and read fbc/fbp.
      const attr = await getOrUpsertAttribution(db, memberId);
      // 2. Durable idempotency gate: contact_sent_at must be NULL.
      //    guard:allow-unscoped — single-tenant meta attribution
      const rows = await db.execute(sql`
        SELECT contact_sent_at FROM meta_lead_attribution WHERE member_id = ${memberId} LIMIT 1
      `);
      const row = ((rows as any)?.rows ?? (rows as any) ?? [])[0];
      if (row?.contact_sent_at != null) return; // already sent — idempotent no-op
      // 3. Hashed PII for matching.
      const { hashedEmail, hashedPhone } = await getMemberHashes(db, memberId);
      // 4. Resolve event name via the shared resolver (LIFE-04).
      const eventName = resolveStageEvent(stageEventMapConfig ?? null, "contact");
      // 5. Enqueue. event_id = memberId:contact (verbatim LIFE-01). action_source literal.
      await enqueueMetaCapiEvent({
        eventId: `${memberId}:contact`,
        memberId,
        eventName,
        actionSource: "system_generated",
        stageKey: "contact",
        eventTime: Math.floor(Date.now() / 1000),
        hashedEmail,
        hashedPhone,
        fbc: attr.fbc,
        fbp: attr.fbp,
        clientIp: attr.clientIp,
        clientUserAgent: attr.clientUserAgent,
      });
      // NOTE: contact_sent_at is stamped by the worker CAPI handler on SUCCESS
      // (Plan 01 stageKey write-back). If the enqueue or send fails, the marker
      // stays NULL and the next inbound retries — correct retry-until-success.
    }
    ```
    Add imports at the top of metaLifecycle.ts: `import { sql } from "drizzle-orm";`, `import { enqueueMetaCapiEvent } from "@gymos/queue";`, `import { resolveStageEvent } from "../lib/stage-event-map.js";` (only if not already present).

    Note: do NOT stamp contact_sent_at inside this helper — the handler stamps it on confirmed success (D-17 retry semantics). This means rapid double-inbound before the first send completes could enqueue twice, but pg-boss singletonKey (`meta-capi-event:memberId:contact`) collapses them — acceptable and documented.

    Run prettier conceptually.
  </action>
  <verify>
    <automated>cd services/worker && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "memberId: member.id" services/worker/src/domain/conversations.ts` matches in the processed:true return.
    - The return type annotation of upsertConversationAndMessage includes `memberId?: string`.
    - `grep -n "export async function fireContactCapiIfFirstReply" services/worker/src/domain/metaLifecycle.ts` matches.
    - `grep -n '`${memberId}:contact`' services/worker/src/domain/metaLifecycle.ts` (the event_id formula) matches.
    - `grep -n 'actionSource: "system_generated"' services/worker/src/domain/metaLifecycle.ts` matches.
    - `grep -n 'stageKey: "contact"' services/worker/src/domain/metaLifecycle.ts` matches.
    - `grep -n "contact_sent_at" services/worker/src/domain/metaLifecycle.ts` matches (the null gate SELECT).
    - The helper does NOT contain any `UPDATE meta_lead_attribution SET contact_sent_at` (the handler owns that write).
    - Worker tsc clean.
  </acceptance_criteria>
  <done>upsertConversationAndMessage returns memberId on success; fireContactCapiIfFirstReply enqueues a Contact event keyed memberId:contact with action_source system_generated, gated on contact_sent_at IS NULL, deferring the marker stamp to the handler.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the Contact fire into inbound-whatsapp.ts (inbound branch only, best-effort)</name>
  <files>services/worker/src/queues/inbound-whatsapp.ts</files>
  <read_first>
    - services/worker/src/queues/inbound-whatsapp.ts (FULL file — the inbound branch at line 138-152, the mark-processed at line 164-172)
    - services/worker/src/domain/metaLifecycle.ts (fireContactCapiIfFirstReply added in Task 1)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (LIFE-01 fire-point timing ~line 297-313: "after upsertConversationAndMessage returns processed:true, before mark-processed")
  </read_first>
  <action>
    In services/worker/src/queues/inbound-whatsapp.ts:

    1. Add import at the top: `import { fireContactCapiIfFirstReply } from "../domain/metaLifecycle.js";`

    2. The normal inbound branch (the `else` at ~line 138 that calls `upsertConversationAndMessage`) stores the result in `result`. AFTER that branch completes and the result is logged (~after line 162), but BEFORE the `if (row) { mark webhook_events processedAt }` block, add a best-effort Contact fire. It must fire ONLY for the inbound branch (NOT the outbound mirror) and ONLY when a new message was materialised:
    ```typescript
    // MC2 LIFE-01: Contact on first inbound reply. Only the inbound branch,
    // only when a NEW message was materialised (result.processed === true).
    // Best-effort (D-17): a CAPI enqueue failure must never abort inbound handling.
    if (data.direction !== "out" && result.processed && result.memberId) {
      try {
        await fireContactCapiIfFirstReply(db, result.memberId);
      } catch (err) {
        log.warn(
          { err, externalId: data.externalId },
          "[inbound-whatsapp] Contact CAPI enqueue failed — non-fatal (D-17)",
        );
      }
    }
    ```
    Placement: this sits between the existing `log.info({...}, "[inbound-whatsapp] message materialised")` call and the `if (row) { ... processedAt ... }` block. `result` and `data` and `db` and `log` are all in scope there.

    Do NOT pass a stageEventMapConfig (omit the 3rd arg) — the helper falls back to the default "Contact" via resolveStageEvent(null, "contact"). The worker CAPI handler ALSO resolves the configured map at send time, so a renamed event still flows through (LIFE-04). Keeping the fire-point arg null avoids an extra config read in the hot inbound path.

    Run prettier conceptually.
  </action>
  <verify>
    <automated>cd services/worker && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "fireContactCapiIfFirstReply" services/worker/src/queues/inbound-whatsapp.ts` matches (import + call = 2 hits).
    - `grep -n 'data.direction !== "out" && result.processed && result.memberId' services/worker/src/queues/inbound-whatsapp.ts` matches (gates inbound-only + new-message-only).
    - The call is wrapped in try/catch with a log.warn carrying "non-fatal (D-17)".
    - The Contact fire appears AFTER the "message materialised" log and BEFORE the `if (row)` processedAt update.
    - The outbound mirror branch (direction === "out") does NOT call fireContactCapiIfFirstReply.
    - Worker tsc clean.
  </acceptance_criteria>
  <done>First inbound reply from a lead enqueues one Contact event; a queue failure logs a warning and lets inbound processing complete; the outbound mirror never fires Contact.</done>
</task>

</tasks>

<verification>
- Worker `tsc --noEmit` clean.
- Grep confirms: event_id memberId:contact; action_source system_generated; stageKey contact; contact_sent_at null gate; inbound-only + processed-only guard; try/catch D-17.
- No migration (contact_sent_at pre-exists v32).
- No cross-app schema import in the worker (raw SQL + guard markers only).
</verification>

<success_criteria>
- A lead replying for the first time produces exactly one Contact CAPI enqueue (event_id memberId:contact, action_source system_generated, with fbc/fbp + hashed PII when available).
- A repeat inbound from the same member does not re-enqueue (contact_sent_at gate, after the first send stamps it via Plan 01 handler).
- An enqueue failure is isolated — inbound message handling completes (D-17).
</success_criteria>

<output>
After completion, create `.planning/phases/MC2-deep-funnel-lifecycle/MC2-02-SUMMARY.md`.
</output>
