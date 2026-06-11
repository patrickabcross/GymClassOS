---
phase: quick-260611-rrh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/queue/src/types.ts
  - services/edge-webhooks/src/routes/whatsapp.ts
  - services/edge-webhooks/src/routes/whatsapp.test.ts
  - services/worker/src/domain/conversations.ts
  - services/worker/src/domain/conversations.test.ts
  - services/worker/src/queues/inbound-whatsapp.ts
  - services/worker/scripts/backfill-outbound-mirrors.ts
autonomous: true
requirements: [WA-03, WA-04]
must_haves:
  truths:
    - "MYÜTIK outbound mirror webhooks are detected (msg.from === metadata.phone_number_id) and stored as direction='out' messages rows"
    - "Outbound mirror matches the gym member by the customer's wa_id (contacts[0].wa_id), not by the business number"
    - "Storing an outbound message does NOT bump unreadCount, does NOT auto-capture opt-in, does NOT force status='open'"
    - "Outbound mirror sets conversations.lastOutboundAt + lastMessagePreview"
    - "Old in-flight queue jobs without the new direction/customerWaId fields still parse (backward compatible)"
    - "Self-send mirrors dedupe via the existing external_id partial unique index (onConflictDoNothing)"
    - "Dropped June 5 + June 10 outbound replies are backfilled from webhook_events; affected conversations have corrected lastOutboundAt + unreadCount"
  artifacts:
    - path: "packages/queue/src/types.ts"
      provides: "InboundWhatsAppMessagePayload extended with optional direction + customerWaId"
      contains: "direction"
    - path: "services/edge-webhooks/src/routes/whatsapp.ts"
      provides: "phone_number_id + wa_id capture and direction computation in the receiver"
      contains: "phone_number_id"
    - path: "services/worker/src/domain/conversations.ts"
      provides: "outbound mirror materialisation path (no unread bump, no opt-in, no status promote)"
      contains: "lastOutboundAt"
    - path: "services/worker/scripts/backfill-outbound-mirrors.ts"
      provides: "one-off dry-run-by-default backfill of dropped outbound mirrors"
      contains: "--commit"
  key_links:
    - from: "services/edge-webhooks/src/routes/whatsapp.ts"
      to: "enqueueInboundWhatsApp"
      via: "direction + customerWaId in the kind:'message' payload"
      pattern: "direction"
    - from: "services/worker/src/queues/inbound-whatsapp.ts"
      to: "services/worker/src/domain/conversations.ts"
      via: "dispatch on data.direction === 'out'"
      pattern: "direction"
---

<objective>
Fix the WhatsApp webhook consumer silently dropping outbound mirror messages. MYÜTIK mirrors BOTH inbound customer messages AND outbound agent replies to the gym-class-os Fly receiver. The outbound mirror marks itself by `messages[0].from === metadata.phone_number_id` (business number 302631896256150) with the customer in `contacts[0].wa_id`. The receiver currently drops `metadata.phone_number_id` and `contacts[].wa_id`, enqueues every message as generic inbound, and the worker's `upsertConversationAndMessage` hardcodes `direction:'in'`, matches the member by `from` (the business number — no member owns it → `unknown_phone`), and silently drops the message after marking it processedAt. Result: zero `direction='out'` rows from agent replies, `conversations.last_outbound_at` null, `unread_count` inflated, and June 5 + June 10 replies stranded in `webhook_events.payload_raw`.

Purpose: Make the staff inbox show agent replies in thread, fix unread inflation, and recover the two stranded reply dates.
Output: Receiver direction detection + queue schema extension + worker outbound path + a one-off backfill script + extended unit tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@AGENTS.md

<interfaces>
<!-- Key contracts the executor needs — already extracted; no codebase exploration required. -->

packages/queue/src/types.ts — the kind:"message" variant to extend (KEEP the union backward compatible):
```typescript
export const InboundWhatsAppMessagePayload = z.object({
  kind: z.literal("message"),
  externalId: z.string().min(1),     // wamid
  from: z.string().min(7),           // E.164 sender WITHOUT +
  messageType: z.string().min(1),
  body: z.string().optional(),
  timestamp: z.string().optional(),
});
// part of: z.discriminatedUnion("kind", [InboundWhatsAppMessagePayload, InboundWhatsAppStatusPayload])
```

services/edge-webhooks/src/routes/whatsapp.ts — current receiver `value` shape (lines 77-91) only types `messages` + `statuses`. The MYÜTIK/Meta `value` object ALSO carries `metadata.phone_number_id` (string) and `contacts: [{ wa_id: string, profile?: {...} }]`. The enqueue call is at lines 104-112.

services/worker/src/domain/conversations.ts — `upsertConversationAndMessage(db, msg, rawPayload)` is the inbound path. It (a) computes `fromE164 = "+" + msg.from`, (b) matches member by phoneE164, (c) upserts conversation bumping unreadCount + setting lastInboundAt + forcing status='open', (d) inserts messages row with direction:'in' via onConflictDoNothing on the partial unique index `{ target: schema.messages.externalId, where: sql\`${schema.messages.externalId} is not null\` }`, (e) auto-captures opt-in. The outbound path must reuse the member-lookup + the same onConflictDoNothing insert shape, but skip (c)'s unread/status/lastInboundAt AND skip (e)'s opt-in.

services/worker/src/queues/inbound-whatsapp.ts — consumer. Line 38 parses `InboundWhatsAppPayload.parse(job.data)`. The `kind === "message"` branch (lines 80-138) loads webhook_events for the raw payload, builds `inboundMsg`, calls `upsertConversationAndMessage`, marks processedAt. Dispatch the new outbound path here on `data.direction === "out"`.

services/worker/src/lib/db.ts — `schema` mirror. `messages` has columns: id, conversationId, externalId, direction('in'|'out'), messageType, body, payload, status('queued'|'sent'|'delivered'|'read'|'failed'|'rejected'), error, errorCode, sentAt... `conversations` has: id, memberId, channel, status, unreadCount, lastInboundAt, lastOutboundAt, lastMessagePreview, createdAt, updatedAt. NOTE: this mirror's conversations.status enum lacks 'lead' — that's fine, the outbound path NEVER writes status.

apps/staff-web/scripts/import-ghl-contacts.ts — backfill conventions to mirror: dotenv.config of .env.local then .env; CLI arg parse BEFORE db access; `--commit` flag, dry-run default; `const { getDb } = await import("../server/db/index.js")` lazy import; chunked writes. For the worker-side backfill use `import { getDb, schema } from "../src/lib/db.js"` instead (worker has its own pg-dialect mirror with all tables).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Receiver direction detection + queue schema extension</name>
  <files>packages/queue/src/types.ts, services/edge-webhooks/src/routes/whatsapp.ts, services/edge-webhooks/src/routes/whatsapp.test.ts</files>
  <behavior>
    - Queue: an old payload `{kind:"message", externalId, from, messageType}` (no direction, no customerWaId) still parses; `.parse(...).direction === "in"` (default applied).
    - Queue: a payload with `direction:"out", customerWaId:"447700900000"` parses and round-trips both fields.
    - Receiver: when `messages[0].from === metadata.phone_number_id`, the enqueued payload has `direction:"out"` and `customerWaId` set to `contacts[0].wa_id`.
    - Receiver: when `messages[0].from !== metadata.phone_number_id` (normal inbound), the enqueued payload has `direction:"in"` (or omits direction — keep parity with the existing test that asserts the exact object). customerWaId may be set from contacts but direction stays "in".
    - Receiver: existing inbound + status + dedup tests still pass.
  </behavior>
  <action>
    1. packages/queue/src/types.ts — extend `InboundWhatsAppMessagePayload` with two OPTIONAL fields that preserve backward compatibility:
       - `direction: z.enum(["in", "out"]).default("in")` (default makes old in-flight jobs parse as inbound).
       - `customerWaId: z.string().optional()` (the customer's wa_id, used for outbound member matching; absent on legacy + normal inbound).
       Keep the discriminated union intact (the discriminator stays `kind`). Do NOT touch the status variant.

    2. services/edge-webhooks/src/routes/whatsapp.ts — in the change-loop (line 76), extend the `value` cast type to include `metadata?: { phone_number_id?: string }` and `contacts?: Array<{ wa_id?: string }>`. Before the messages loop, read:
       - `const phoneNumberId = String(value.metadata?.phone_number_id ?? "");`
       - `const customerWaId = value.contacts?.[0]?.wa_id != null ? String(value.contacts[0].wa_id) : undefined;`
       Inside the `for (const msg of value.messages ?? [])` loop, compute:
       - `const direction = phoneNumberId && String(msg.from) === phoneNumberId ? "out" : "in";`
       Add `direction` and (when present) `customerWaId` to the existing `enqueueInboundWhatsApp({ kind: "message", ... })` call. Keep the wamid dedup on `insertWebhookEvent` exactly as-is (eventType stays "messages.inbound"; the dedup key stays `msg.id`). The webhook_events row already stores the full raw payload so the backfill (Task 3) can re-derive direction.
       IMPORTANT: do NOT reorder the raw-body-first HMAC discipline (await c.req.text() before verifySignature) — only edit inside the entries loop.

    3. services/edge-webhooks/src/routes/whatsapp.test.ts — add cases:
       (a) outbound mirror: a payload whose `value.metadata.phone_number_id === messages[0].from` and `value.contacts[0].wa_id` is the customer → assert `enqueueInboundWhatsApp` called with `direction: "out"` and `customerWaId` = the customer wa_id.
       (b) the EXISTING "enqueues STRUCTURED message payload" test asserts an exact object — update its expected object to include `direction: "in"` (and `customerWaId: undefined` if you pass it through; otherwise keep the receiver from emitting customerWaId on inbound so the exact-match assertion stays minimal — your call, but the test and the receiver MUST agree).
       Pin the business number in the test fixture (e.g. "302631896256150") so direction detection is exercised against a realistic value.

    Run prettier on all three files after editing.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/queue test 2>&1 | tail -20 && pnpm --filter @gymos/edge-webhooks test 2>&1 | tail -30</automated>
  </verify>
  <done>Queue tests green incl. backward-compat parse; edge-webhooks tests green incl. new outbound-detection case; inbound/status/dedup tests unchanged-green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Worker outbound mirror materialisation + consumer dispatch</name>
  <files>services/worker/src/domain/conversations.ts, services/worker/src/queues/inbound-whatsapp.ts, services/worker/src/domain/conversations.test.ts</files>
  <behavior>
    - Outbound path matches member by `"+" + customerWaId` (NOT by `from`, which is the business number).
    - Outbound path inserts a messages row with direction:'out', status:'sent', messageType from the payload, body from the payload, using the SAME onConflictDoNothing partial-index shape as inbound (self-send mirrors written by sendMessage.ts dedupe on external_id → returns processed:false, reason:'duplicate_wamid').
    - Outbound path updates conversation: sets lastOutboundAt + lastMessagePreview + updatedAt. Does NOT touch unreadCount. Does NOT set lastInboundAt. Does NOT set status. Does NOT insert whatsapp_opt_in.
    - If no member matches the customerWaId → returns processed:false, reason:'unknown_phone' (parity with inbound).
    - If no conversation exists for the matched member yet → create one (status default 'open' from the column default — do not pass status), unreadCount 0, lastOutboundAt + lastMessagePreview set.
    - Consumer: a job with direction:'out' routes to the new path; direction:'in' (or absent/default) routes to the existing upsertConversationAndMessage unchanged.
  </behavior>
  <action>
    1. services/worker/src/domain/conversations.ts — add a new exported function `materialiseOutboundMirror(db, args, rawPayload)` where args = `{ externalId, customerWaId, messageType, body, timestamp }`. Implementation:
       - `const toE164 = "+" + customerWaId;` match member by `schema.gymMembers.phoneE164 === toE164` (reuse the existing select-by-phone shape). If no member → `return { processed: false, reason: "unknown_phone" }`.
       - Find conversation by `(memberId, channel='whatsapp')`. If none, INSERT a conversations row: id `conv_${nanoid()}`, memberId, channel 'whatsapp', unreadCount 0, lastOutboundAt now, lastMessagePreview (body ?? `(${messageType})`). DO NOT set status (column default applies) and DO NOT set lastInboundAt.
       - INSERT the messages row with the SAME `.onConflictDoNothing({ target: schema.messages.externalId, where: sql\`${schema.messages.externalId} is not null\` })` shape used by the inbound path, but with `direction: "out"`, `status: "sent"`, `messageType`, `body`, `payload: rawPayload`, `externalId`. `.returning({ id })` — if empty → `return { processed: false, reason: "duplicate_wamid" }` (this is the self-send dedup path; leave it as a clean no-op).
       - If the conversation already existed, UPDATE it: set lastOutboundAt = now, lastMessagePreview = body ?? `(${messageType})`, updatedAt = now. NEVER set unreadCount / lastInboundAt / status.
       - NO whatsapp_opt_in insert anywhere in this function (an agent reply is not opt-in evidence).
       - Keep `// guard:allow-unscoped — webhook processor` comments on each query.
       Reuse the `InboundMessage` type style but define a small `OutboundMirror` arg type at the top.

    2. services/worker/src/queues/inbound-whatsapp.ts — in the `kind === "message"` branch, after loading the webhook_events row + the processedAt idempotency check, branch on `data.direction`:
       - if `data.direction === "out"`: require `data.customerWaId` (if missing, log a warn and treat as no-op processed=false reason='missing_customer_wa_id' so the job completes — do NOT throw, or pg-boss will retry a permanently-unprocessable job). Call `materialiseOutboundMirror(db, { externalId: data.externalId, customerWaId: data.customerWaId, messageType: data.messageType, body: data.body, timestamp: data.timestamp }, rawPayload)`.
       - else: existing `upsertConversationAndMessage(...)` call unchanged.
       Mark the webhook_events row processedAt in BOTH branches (the existing post-call `if (row) { update processedAt }` already covers this — keep it after the branch).
       Import `materialiseOutboundMirror` alongside the existing `upsertConversationAndMessage` import.

    3. services/worker/src/domain/conversations.test.ts — add cases for `materialiseOutboundMirror` (reuse the existing mockDb harness + insertCallSequence routing):
       (a) member matched by customerWaId, no prior conversation → creates conversation + message; assert conversationInsertChain.values called; assert the messages insert values include `direction: "out"` and `status: "sent"`; assert NO optIn insert in the sequence.
       (b) existing conversation → updateChain.set called with lastOutboundAt + lastMessagePreview and the set object has NO `unreadCount` key and NO `lastInboundAt` key and NO `status` key.
       (c) unknown customerWaId → processed:false, reason:'unknown_phone'.
       (d) duplicate wamid (returning [] ) → processed:false, reason:'duplicate_wamid' and NO opt-in insert attempted.
       Keep the existing inbound tests untouched and green.

    Run prettier on all three files.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test 2>&1 | tail -40</automated>
  </verify>
  <done>Worker test suite green; new materialiseOutboundMirror cases pass (out direction, member-by-wa_id, no unread bump, no opt-in, dedup no-op); existing inbound + sendMessage tests unchanged-green; `pnpm --filter @gymos/worker exec tsc --noEmit` clean.</done>
</task>

<task type="auto">
  <name>Task 3: One-off backfill script for stranded outbound replies</name>
  <files>services/worker/scripts/backfill-outbound-mirrors.ts</files>
  <action>
    Create a tsx backfill script (dry-run by default, `--commit` to write) mirroring apps/staff-web/scripts/import-ghl-contacts.ts conventions (dotenv .env.local then .env; CLI parse before any DB access; clear console report). Use the worker's own db mirror: `import { getDb, schema } from "../src/lib/db.js"` and `import { materialiseOutboundMirror } from "../src/domain/conversations.js"`.

    Logic:
    1. Select all webhook_events WHERE provider='whatsapp' AND eventType='messages.inbound' (these are the receiver-stored rows; the dropped outbound mirrors live here too because the OLD receiver stored every message under eventType 'messages.inbound').
    2. For each row, JSON.parse payloadRaw and walk entry[].changes[].value. For each `value` compute `phoneNumberId = value.metadata?.phone_number_id` and `customerWaId = value.contacts?.[0]?.wa_id`. For each `msg` in `value.messages`, if `phoneNumberId && msg.from === phoneNumberId` it is an OUTBOUND mirror that the old worker dropped.
    3. Skip any whose wamid (`msg.id`) ALREADY has a matching messages row (SELECT 1 FROM messages WHERE external_id = wamid) — those were self-sends already written by sendMessage.ts.
    4. For the remainder: in dry-run, just count + print (group by customerWaId / date). In --commit, call `materialiseOutboundMirror(db, { externalId: msg.id, customerWaId, messageType: msg.type ?? 'text', body: msg.text?.body, timestamp: msg.timestamp }, payloadRaw)`. Collect the set of affected conversation memberIds.
       - DEVIATION NOTE in code: materialiseOutboundMirror stamps lastOutboundAt = now() (not the historical timestamp) because the conversations columns are coarse "last_*" markers, not per-message history — the per-message createdAt should reflect the original send time. SET the inserted messages.createdAt + messages.sentAt to the payload timestamp where available: after materialise, if the row was newly inserted, UPDATE messages SET created_at = to_timestamp(<msg.timestamp>)::text, sent_at = same WHERE external_id = wamid. (msg.timestamp is a unix-seconds string from Meta.) If timestamp absent, leave the column default. Keep this UPDATE inside the --commit branch only.
    5. After materialising all outbound rows in --commit, RECOMPUTE the affected conversations' lastOutboundAt as MAX(messages.created_at) over direction='out' rows, and CORRECT inflated unread_count: set unread_count = (count of direction='in' messages in that conversation that are newer than the conversation's lastOutboundAt). This is the simplest defensible correction given the schema has no per-conversation read marker — document this choice in a top-of-file comment. (Rationale: an agent reply implies the coach has seen everything up to that reply; only inbound messages arriving AFTER the latest outbound are genuinely unread.) Run this recompute as a single SQL UPDATE per affected conversation, or a set-based UPDATE...FROM if cleaner.
    6. Print a final summary: outbound rows found, already-present (skipped), newly materialised, conversations touched, unread corrections (old → new). Add a package.json script entry `"db:backfill-outbound": "tsx scripts/backfill-outbound-mirrors.ts"` under services/worker if a scripts block exists; otherwise document the raw `pnpm --filter @gymos/worker exec tsx scripts/backfill-outbound-mirrors.ts` invocation in the file header.

    Idempotency: re-running --commit must materialise 0 new rows (the external_id partial unique index + the SELECT-1 skip guarantee this). Verify this property is honoured by the SELECT-1 pre-check AND the onConflictDoNothing inside materialiseOutboundMirror.

    Run prettier on the file.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker exec tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <done>Script typechecks; dry-run is the default (no writes without --commit); re-run --commit is a documented no-op; header comment documents the unread-recount choice + the manual Neon-run convention (gymos scripts are applied by hand per project memory).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/queue test` — backward-compat parse (no direction → 'in') + new fields round-trip green.
- `pnpm --filter @gymos/edge-webhooks test` — outbound detection (from === phone_number_id → direction 'out' + customerWaId), inbound/status/dedup unchanged.
- `pnpm --filter @gymos/worker test` — materialiseOutboundMirror: member-by-wa_id, direction 'out', no unread bump, no opt-in, dedup no-op; inbound path unchanged.
- `pnpm --filter @gymos/worker exec tsc --noEmit` — backfill script + domain changes typecheck.
- Manual (post-deploy, by the user): flyctl deploy gymos-edge-webhooks (web + worker), then run the backfill dry-run against gymos-demo Neon, review the report, then `--commit`.
</verification>

<success_criteria>
- Receiver emits `direction:'out'` + `customerWaId` for MYÜTIK outbound mirrors; `direction:'in'` for customer messages.
- Queue payload remains backward compatible (legacy in-flight jobs parse).
- Worker stores agent replies as `direction='out'` messages, matched to the member via the customer wa_id, without bumping unread / capturing opt-in / promoting lead→open.
- conversations.lastOutboundAt populated on outbound; self-send mirrors dedupe cleanly.
- Backfill recovers June 5 + June 10 stranded replies and corrects inflated unread_count, dry-run by default.
- No schema changes (last_outbound_at + direction='out' already exist). No staff-web UI changes.
</success_criteria>

<output>
After completion, create `.planning/quick/260611-rrh-fix-whatsapp-webhook-consumer-dropping-o/260611-rrh-SUMMARY.md`.

Deployment note (for the user, not the executor): worker + edge-webhooks deploy to Fly via `flyctl deploy` from each service dir (the gymos-edge-webhooks app rolls both web + worker processes). The backfill runs by hand against Neon — gymos scripts/migrations are applied manually per project memory.
</output>
