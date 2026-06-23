---
phase: MC2-deep-funnel-lifecycle
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/queue/src/types.ts
  - services/worker/src/queues/meta-capi-event.ts
  - services/worker/src/domain/metaLifecycle.ts
  - packages/queue/src/__tests__/lifecycle-payload.test.ts
  - services/worker/src/__tests__/meta-lifecycle.test.ts
autonomous: true
requirements: [LIFE-02, LIFE-04]
must_haves:
  truths:
    - "The meta-capi-event queue payload carries optional value, currency, and stageKey fields"
    - "A Purchase event POSTed to Meta includes custom_data.value + custom_data.currency"
    - "On a successful CAPI send, the worker stamps the per-stage marker column matching stageKey (contact_sent_at / purchase_sent_at / schedule_sent_at)"
    - "A shared worker helper exposes toMajorUnits (zero-decimal aware), SHA-256 PII hashing, and a member-keyed attribution upsert for the three fire points to reuse"
  artifacts:
    - path: "packages/queue/src/types.ts"
      provides: "Extended MetaCapiEventPayload with value/currency/stageKey"
      contains: "value: z.number"
    - path: "services/worker/src/queues/meta-capi-event.ts"
      provides: "custom_data block + per-stage marker write-back"
      contains: "custom_data"
    - path: "services/worker/src/domain/metaLifecycle.ts"
      provides: "toMajorUnits + hashForCapi + getOrUpsertAttribution + getMemberHashes helpers"
      contains: "ZERO_DECIMAL_CURRENCIES"
  key_links:
    - from: "services/worker/src/queues/meta-capi-event.ts"
      to: "meta_lead_attribution per-stage marker columns"
      via: "raw SQL UPDATE keyed on stageKey"
      pattern: "contact_sent_at|purchase_sent_at|schedule_sent_at"
---

<objective>
Extend the MC1 CAPI contract and worker handler additively so the three MC2 fire points (Contact, Purchase, Schedule) can flow through the existing single sender. This plan adds `value`/`currency`/`stageKey` to the queue payload, builds the Purchase `custom_data` block and the per-stage marker write-back in the worker handler, and creates one shared worker helper module that all three Wave 2 fire points reuse (currency-correct minor-units conversion, SHA-256 PII hashing, and the member-keyed attribution upsert).

Purpose: This is the foundation Wave 2 depends on. Without the payload fields and handler write-back, Purchase cannot carry value and no fire point can stamp its idempotency marker.
Output: Extended `MetaCapiEventPayload`, extended worker CAPI handler, new `metaLifecycle.ts` helper module, unit tests.
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
Current MetaCapiEventPayload (packages/queue/src/types.ts ~line 100) — MC2 ADDS three optional fields, changes nothing else:
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
});
```

Worker handler success block (services/worker/src/queues/meta-capi-event.ts ~line 213-230) currently stamps ONLY lead_status + lead_sent_at. The handler uses raw `db.execute(sql\`...\`)` with `// guard:allow-unscoped — worker post-send status write (single-tenant meta attribution)` markers. The worker NEVER imports apps/staff-web schema (MC1-03 decision).

Worker meta_lead_attribution columns (already exist, no migration): member_id (UNIQUE), fbc, fbp, fbclid, client_ip, client_user_agent, lead_sent_at, lead_status, last_error, contact_sent_at, purchase_sent_at, schedule_sent_at, created_at, updated_at.

Existing SHA-256 hash pattern (apps/staff-web/features/forms/handlers/submissions.ts line 25): `createHash("sha256").update(normalized).digest("hex")`. Email normalize = toLowerCase().trim(); phone normalize = digits-only (strip non-digits).

Worker gym_members has email + phoneE164 columns (services/worker/src/lib/db.ts line 41-42).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend MetaCapiEventPayload with value, currency, stageKey</name>
  <files>packages/queue/src/types.ts, packages/queue/src/__tests__/lifecycle-payload.test.ts</files>
  <read_first>
    - packages/queue/src/types.ts (the MetaCapiEventPayload definition ~line 100-118 — the file being modified)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (section "Payload Extension for MetaCapiEventPayload" ~line 492-519)
  </read_first>
  <behavior>
    - Parsing a payload with `value: 29.99, currency: "gbp", stageKey: "purchase"` succeeds.
    - Parsing a payload with NONE of the three new fields still succeeds (Contact/Schedule callers omit value/currency).
    - `stageKey` only accepts one of "lead" | "contact" | "purchase" | "schedule"; any other string fails parse.
    - `value` rejects a negative number.
    - `currency` rejects a string whose length is not 3.
  </behavior>
  <action>
    In packages/queue/src/types.ts, add exactly these three OPTIONAL fields to the `MetaCapiEventPayload` z.object (do not remove or rename any existing field — additive only):

    ```typescript
    // MC2: Purchase value/currency (LIFE-02). Optional — only Purchase populates them.
    value: z.number().nonnegative().optional(), // MAJOR units, already divided by caller
    currency: z.string().length(3).optional(),  // ISO-4217 lowercase (e.g. "gbp")
    // MC2: stage marker write-back key (handler stamps the matching *_sent_at column).
    stageKey: z.enum(["lead", "contact", "purchase", "schedule"]).optional(),
    ```

    The inferred `export type MetaCapiEventPayload = z.infer<...>` line at the end already picks up the new fields automatically — do not duplicate it.

    Create packages/queue/src/__tests__/lifecycle-payload.test.ts with Vitest cases covering the five behaviors above (parse with all three fields; parse with none; reject bad stageKey enum; reject negative value; reject 2-char currency). Import `MetaCapiEventPayload` from "../types.js" (or the package's existing test import convention — check a sibling test if one exists).

    Run prettier on both files conceptually (the repo runs `npx prettier --write`).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/queue test 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "value: z.number().nonnegative().optional()" packages/queue/src/types.ts` matches.
    - `grep -n "currency: z.string().length(3).optional()" packages/queue/src/types.ts` matches.
    - `grep -n 'stageKey: z.enum(\["lead", "contact", "purchase", "schedule"\]).optional()' packages/queue/src/types.ts` matches.
    - packages/queue/src/__tests__/lifecycle-payload.test.ts exists and its tests pass.
    - No existing field of MetaCapiEventPayload was renamed or removed (diff is purely additive).
  </acceptance_criteria>
  <done>The queue payload accepts the three new optional fields; old payloads (no value/currency/stageKey) still parse; tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Build the metaLifecycle worker helper (toMajorUnits + hashing + attribution upsert)</name>
  <files>services/worker/src/domain/metaLifecycle.ts, services/worker/src/__tests__/meta-lifecycle.test.ts</files>
  <read_first>
    - services/worker/src/queues/meta-capi-event.ts (the existing raw-SQL + guard:allow-unscoped pattern this helper mirrors)
    - services/worker/src/lib/db.ts (worker getDb + gymMembers schema, lines 36-42)
    - apps/staff-web/features/forms/handlers/submissions.ts (lines 22-26 hashForCapi; lines 476-487 normalize-then-hash; lines 494-509 attribution upsert COALESCE pattern)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (Spec Q3 zero-decimal list ~line 224-251; Risk #2 no-row upsert ~line 534-544)
  </read_first>
  <action>
    Create services/worker/src/domain/metaLifecycle.ts exporting four pure/DB helpers that the three Wave 2 fire points reuse. Worker uses raw `db.execute(sql\`...\`)` only — do NOT import apps/staff-web schema (MC1-03 decision).

    1. Zero-decimal currency conversion (LIFE-02, D-08). Use this EXACT set (lowercase) from RESEARCH Spec Q3:
    ```typescript
    export const ZERO_DECIMAL_CURRENCIES = new Set([
      "bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf",
    ]);
    export function toMajorUnits(amountMinorUnits: number, currency: string): number {
      return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? amountMinorUnits
        : amountMinorUnits / 100;
    }
    ```

    2. SHA-256 PII hashing (D-16) — mirror submissions.ts hashForCapi:
    ```typescript
    import { createHash } from "node:crypto";
    function hashForCapi(normalized: string): string {
      return createHash("sha256").update(normalized).digest("hex");
    }
    // Returns { hashedEmail?, hashedPhone? } for a member id. email: toLowerCase().trim();
    // phone: strip non-digits. Omit a field when the source value is null/empty.
    export async function getMemberHashes(db, memberId: string): Promise<{ hashedEmail?: string; hashedPhone?: string }>
    ```
    Implement getMemberHashes with raw SQL: `SELECT email, phone_e164 FROM gym_members WHERE id = ${memberId} LIMIT 1` with `// guard:allow-unscoped — single-tenant meta attribution`. Hash email as `hashForCapi(email.toLowerCase().trim())` and phone as `hashForCapi(phone.replace(/\D/g, ""))`, omitting when null.

    3. Member-keyed attribution upsert + read (D-04/D-05). Ensure a row exists, then return fbc/fbp:
    ```typescript
    // INSERT ... ON CONFLICT (member_id) DO NOTHING, then SELECT fbc, fbp, client_ip, client_user_agent.
    export async function getOrUpsertAttribution(db, memberId: string): Promise<{ fbc?: string; fbp?: string; clientIp?: string; clientUserAgent?: string }>
    ```
    Implement with two raw SQL statements, both carrying `// guard:allow-unscoped — single-tenant meta attribution`:
    - `INSERT INTO meta_lead_attribution (id, member_id, created_at, updated_at) VALUES (${nanoid()}, ${memberId}, NOW(), NOW()) ON CONFLICT (member_id) DO NOTHING` (import nanoid from "nanoid").
    - `SELECT fbc, fbp, client_ip, client_user_agent FROM meta_lead_attribution WHERE member_id = ${memberId} LIMIT 1`.
    Normalize the row-extraction the same way meta-capi-event.ts does (`(rows as any)?.rows ?? (rows as any) ?? []`). Map nulls to undefined (Meta omits absent fields).

    Add a unit test services/worker/src/__tests__/meta-lifecycle.test.ts covering toMajorUnits for: gbp 2999 -> 29.99, jpy 500 -> 500, krw 1000 -> 1000, usd 100 -> 1, and an UPPERCASE "GBP" 2999 -> 29.99 (case-insensitive). DB helpers do not need DB mocks in this plan — test only the pure toMajorUnits.

    Run prettier conceptually.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test 2>&1 | tail -20 || pnpm --filter worker test 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - services/worker/src/domain/metaLifecycle.ts exists.
    - `grep -n "ZERO_DECIMAL_CURRENCIES" services/worker/src/domain/metaLifecycle.ts` matches and the set contains exactly: bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf.
    - `grep -n "export function toMajorUnits" services/worker/src/domain/metaLifecycle.ts` matches.
    - `grep -n "export async function getOrUpsertAttribution" services/worker/src/domain/metaLifecycle.ts` matches.
    - `grep -n "export async function getMemberHashes" services/worker/src/domain/metaLifecycle.ts` matches.
    - `grep -c "guard:allow-unscoped" services/worker/src/domain/metaLifecycle.ts` is at least 3 (member hash SELECT, upsert INSERT, attribution SELECT).
    - `grep -n "ON CONFLICT (member_id) DO NOTHING" services/worker/src/domain/metaLifecycle.ts` matches.
    - meta-lifecycle.test.ts toMajorUnits cases pass.
  </acceptance_criteria>
  <done>The shared helper module exports toMajorUnits (zero-decimal aware), getMemberHashes (SHA-256), and getOrUpsertAttribution (member-keyed, no-row safe); toMajorUnits unit tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Extend the worker CAPI handler — custom_data + per-stage marker write-back</name>
  <files>services/worker/src/queues/meta-capi-event.ts</files>
  <read_first>
    - services/worker/src/queues/meta-capi-event.ts (the FULL file being modified — Step 4 payload build ~line 117-152, Step 7 success block ~line 213-231)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (Spec Q1 Purchase custom_data required ~line 176-203; handler success block snippet ~line 505-519)
    - .planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md (carried decisions — D-18 Graph v23 / top-level test_event_code already handled; do not re-touch)
  </read_first>
  <action>
    Modify services/worker/src/queues/meta-capi-event.ts in two places only. Do NOT change the error-classification, retry, or test_event_code logic.

    A) In Step 4 (the `capiBody` build, after `user_data: userData` is set in the event object ~line 144), add a Purchase custom_data block. Place it immediately after constructing `capiBody` (after line ~147), before the test_event_code block:
    ```typescript
    // MC2 (LIFE-02): Purchase carries custom_data.value + custom_data.currency.
    // Meta REQUIRES both for revenue optimisation. Contact/Schedule omit custom_data.
    if (data.value != null && data.currency) {
      (capiBody.data as any[])[0].custom_data = {
        value: data.value,      // already MAJOR units (caller divided)
        currency: data.currency, // ISO-4217 lowercase
      };
    }
    ```

    B) In Step 7 (the success block, inside `if (resp.ok) { ... }`), AFTER the existing `UPDATE meta_lead_attribution SET lead_status='sent', lead_sent_at=NOW() ...` statement and BEFORE the `return;`, add a per-stage marker stamp keyed on `data.stageKey`. Keep the existing lead write-back untouched (it is harmless for non-lead events — it sets lead_status='sent' on the same member row; the per-stage stamp is the MC2 addition that actually gates idempotency):
    ```typescript
    // MC2: stamp the per-stage marker column so the fire point's idempotency
    // gate (contact/schedule) flips only on a confirmed successful send.
    if (data.stageKey && data.stageKey !== "lead") {
      const markerCol = {
        contact: "contact_sent_at",
        purchase: "purchase_sent_at",
        schedule: "schedule_sent_at",
      }[data.stageKey];
      if (markerCol) {
        // guard:allow-unscoped — worker post-send status write (single-tenant meta attribution)
        await db.execute(sql`
          UPDATE meta_lead_attribution
          SET ${sql.raw(markerCol)} = NOW(), updated_at = NOW()
          WHERE member_id = ${data.memberId}
        `);
      }
    }
    ```

    `sql` and `sql.raw` are already imported from "drizzle-orm" at the top of the file. `markerCol` is chosen from a fixed literal map (NOT from user input), so `sql.raw` is safe here.

    Run prettier conceptually.
  </action>
  <verify>
    <automated>cd services/worker && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "custom_data" services/worker/src/queues/meta-capi-event.ts` matches and appears inside the `if (data.value != null && data.currency)` guard.
    - `grep -n "purchase_sent_at" services/worker/src/queues/meta-capi-event.ts` matches inside the marker map.
    - `grep -n "data.stageKey && data.stageKey !== \"lead\"" services/worker/src/queues/meta-capi-event.ts` matches.
    - The marker UPDATE sits inside the `if (resp.ok)` success block (after the existing lead_status='sent' UPDATE).
    - `sql.raw(markerCol)` is used (markerCol from the fixed literal map, never from payload free-text).
    - Worker tsc is clean (no new errors introduced by this change).
  </acceptance_criteria>
  <done>Purchase events POST custom_data.value + custom_data.currency; on a successful send the handler stamps contact_sent_at / purchase_sent_at / schedule_sent_at according to stageKey; lead path unchanged.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/queue test` passes (payload extension).
- Worker `tsc --noEmit` clean.
- Grep confirms: value/currency/stageKey on payload; custom_data guard; per-stage marker map with purchase_sent_at; toMajorUnits + zero-decimal set in metaLifecycle.ts.
- No migration added (RESEARCH confirms all marker columns pre-exist).
- Diff to MetaCapiEventPayload is strictly additive (no rename/remove).
</verification>

<success_criteria>
- MetaCapiEventPayload carries optional value, currency, stageKey.
- Worker handler builds custom_data for Purchase and stamps the correct per-stage marker on success.
- metaLifecycle.ts exports toMajorUnits (zero-decimal aware), getMemberHashes, getOrUpsertAttribution — all worker-raw-SQL, guard-marked, no cross-app schema import.
- Wave 2 plans (02 Contact, 03 Purchase, 04 Schedule) can import these helpers and rely on the handler write-back.
</success_criteria>

<output>
After completion, create `.planning/phases/MC2-deep-funnel-lifecycle/MC2-01-SUMMARY.md`.
</output>
