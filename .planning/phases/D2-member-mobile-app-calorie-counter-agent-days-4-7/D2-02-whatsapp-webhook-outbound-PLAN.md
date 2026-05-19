---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - templates/mail/app/routes/webhooks.whatsapp.tsx
  - templates/mail/app/routes/gymos.tsx
autonomous: false
requirements: [WA-01, WA-02]
user_setup:
  - service: meta-whatsapp
    why: "WA-01 / WA-02 demo requires a Meta Business app + WhatsApp test phone number + app secret. Without these, the webhook returns 401 every time and the outbound send returns 401 from Meta."
    env_vars:
      - name: WHATSAPP_APP_SECRET
        source: "Meta App Dashboard → Settings → Basic → App Secret (click Show)"
      - name: WHATSAPP_VERIFY_TOKEN
        source: "Arbitrary string you choose; must match the value you enter in Meta's webhook config UI"
      - name: WHATSAPP_PHONE_NUMBER_ID
        source: "Meta WhatsApp → API Setup → 'From' phone number ID (numeric)"
      - name: WHATSAPP_ACCESS_TOKEN
        source: "Meta WhatsApp → API Setup → Temporary access token (24h, free) OR a permanent system-user token (preferred for the demo day)"
    dashboard_config:
      - task: "Start an ngrok tunnel"
        location: "Terminal: `ngrok http 8081` (after `pnpm --filter mail dev` is running) — copy the https://*.ngrok-free.app URL"
      - task: "Register webhook in Meta"
        location: "Meta App Dashboard → WhatsApp → Configuration → Webhook → Callback URL = {ngrok-url}/webhooks/whatsapp, Verify token = WHATSAPP_VERIFY_TOKEN value, Subscribe to 'messages' field"
      - task: "Add a test recipient phone number"
        location: "Meta WhatsApp → API Setup → 'To' → Add phone number → verify via OTP. This is the phone that will SEND inbound + RECEIVE outbound during the demo."
must_haves:
  truths:
    - "GET /webhooks/whatsapp with hub.mode=subscribe + correct hub.verify_token returns 200 with the challenge value (Meta's handshake passes)"
    - "GET /webhooks/whatsapp with an incorrect verify token returns 403"
    - "POST /webhooks/whatsapp with a body that fails HMAC verification returns 401 'Bad signature' WITHOUT parsing the JSON body"
    - "POST /webhooks/whatsapp with a valid HMAC and a real Meta inbound payload (text message from a seeded member's phone) inserts a row in messages + upserts conversations + records the wamid in webhook_events"
    - "Re-POSTing the same wamid (Meta retry) inserts NO duplicate rows in messages or webhook_events"
    - "Pressing 'Send' in /gymos with a member who has lastInboundAt < 24h ago performs a real fetch to https://graph.facebook.com/v23.0/{phone_number_id}/messages and the recipient's phone receives the WhatsApp message"
    - "After outbound send, /gymos shows a 'Sent (real)' indicator (or the existing ?sent=1 banner is preserved) AND the messages row has status='sent' + a non-null externalId returned by Meta"
  artifacts:
    - path: "templates/mail/app/routes/webhooks.whatsapp.tsx"
      provides: "GET handshake + POST inbound receiver with HMAC-SHA256 verification on raw body before any JSON parsing"
      exports: ["loader", "action"]
      min_lines: 100
    - path: "templates/mail/app/routes/gymos.tsx"
      provides: "Outbound send action augmented with real Meta Graph API call (gated by env var presence — falls back to demo-stub when WHATSAPP_ACCESS_TOKEN is missing)"
      exports: ["loader", "action", "default"]
      contains: "graph.facebook.com"
  key_links:
    - from: "webhooks.whatsapp.tsx action"
      to: "node:crypto createHmac + timingSafeEqual"
      via: "HMAC-SHA256 over request.text() BEFORE JSON.parse"
      pattern: "createHmac\\(.sha256."
    - from: "webhooks.whatsapp.tsx action"
      to: "schema.webhookEvents + schema.messages + schema.conversations"
      via: "idempotent insert keyed on `whatsapp:${wamid}` + upsert conversation by member phone"
      pattern: "schema\\.webhookEvents"
    - from: "gymos.tsx action"
      to: "https://graph.facebook.com/v23.0"
      via: "direct fetch POST with Bearer token"
      pattern: "graph\\.facebook\\.com/v23"
---

<objective>
Stand up the demo-grade WhatsApp surface: a publicly-tunnelled inbound webhook that signature-verifies and persists messages, plus a real outbound send from the existing `/gymos` staff inbox. Both endpoints target Meta Cloud API v23 directly — no SDK, no worker queue, no 24h-window enforcement (those are P1b — see RESEARCH.md §Pitfall #3 and PROJECT constraints).

Purpose: Demo Sprint deliverable for WA-01 (one real inbound message visible in the staff inbox) + WA-02 (one real outbound message delivered to a real phone). Closes the "real WhatsApp" beat of success criterion #8 in ROADMAP D2.

Output:
- New `templates/mail/app/routes/webhooks.whatsapp.tsx` (RR v7 resource route at `/webhooks/whatsapp`) with GET handshake + POST inbound receiver
- Modified `templates/mail/app/routes/gymos.tsx` `action` — the existing stub send is replaced/augmented with a real Meta Graph API POST, gated by env var presence so devs without WhatsApp config still get the existing stubbed flow

Hosting topology: This phase **hosts on the existing Mail dev server (Vite SSR on :8081), tunnelled via ngrok**. Production target is `apps/edge-webhooks/` (Hono on Fly) — flagged in P1b/WEB-01 but explicitly out of scope for D2 per CONTEXT D-claude-discretion. The file header includes that pointer.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md
@templates/mail/server/db/schema.ts
@templates/mail/app/routes/gymos.tsx

<interfaces>
<!-- Key types and exports the executor needs. -->

From templates/mail/server/db/schema.ts:
```typescript
// conversations
export const conversations: { id, memberId, channel: "whatsapp", status, unreadCount: number, lastInboundAt, lastOutboundAt, lastMessagePreview, createdAt, updatedAt }

// messages
export const messages: { id, conversationId, externalId /* wamid */, direction: "in"|"out", messageType, body, payload /* JSON */, status: "queued"|"sent"|"delivered"|"read"|"failed"|"rejected", error, requestedByUserId, agentInitiated: boolean, createdAt, sentAt, deliveredAt, readAt }

// webhook_events
export const webhookEvents: { id /* e.g. "whatsapp:wamid..." */, provider: "stripe"|"whatsapp", eventType, payloadRaw, receivedAt, processedAt, error }

// gym_members — natural key by phoneE164
export const gymMembers: { id, firstName, lastName, phoneE164: string|null, ... }
```

From templates/mail/server/db/index.ts:
```typescript
export const getDb: () => DrizzleDb;
export { schema };
```

Existing `templates/mail/app/routes/gymos.tsx` action (lines 181-216) currently does:
1. Parse formData (conversationId + body)
2. INSERT message with direction="out", status="sent"  // DEMO STUB — DOES NOT CALL META
3. UPDATE conversations.lastOutboundAt + preview + updated_at
4. redirect to /gymos?conversation=X&sent=1

This plan REPLACES the demo stub with: optional real Meta call BEFORE the message INSERT; if env vars present, capture wamid into externalId; if env vars missing, preserve the existing stub behaviour with a console.warn.

Meta Cloud API v23 send-text endpoint:
- URL: `https://graph.facebook.com/v23.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`
- Method: POST
- Headers: `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}`, `Content-Type: application/json`
- Body: `{ messaging_product: "whatsapp", to: "<E.164 without +>", type: "text", text: { body: "<msg>" } }`
- Success response: `{ messages: [{ id: "wamid.HBg..." }] }` — the `messages[0].id` is the wamid we record into messages.externalId

Inbound webhook payload shape (Meta v23):
```
{
  object: "whatsapp_business_account",
  entry: [{
    id: "<biz_id>",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "...", phone_number_id: "..." },
        contacts: [{ profile: { name: "..." }, wa_id: "<E.164 without +>" }],
        messages: [{
          from: "<E.164 without +>",
          id: "wamid.HBg...",
          timestamp: "1727..." /* unix s */,
          text: { body: "<message text>" },
          type: "text"
        }]
      }
    }]
  }]
}
```

HMAC verification: `X-Hub-Signature-256` header is the literal string `sha256=<hex>` where `<hex>` is HMAC-SHA256(WHATSAPP_APP_SECRET, raw_request_body).
</interfaces>

</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create webhooks.whatsapp.tsx — GET handshake + POST receiver with HMAC + idempotent insert</name>
  <files>
    - templates/mail/app/routes/webhooks.whatsapp.tsx
  </files>
  <read_first>
    - templates/mail/server/db/schema.ts lines 141-185 (conversations + messages columns) + 318-326 (webhookEvents columns)
    - templates/mail/server/db/schema.ts lines 115-138 (gymMembers.phoneE164 — the natural key for member lookup)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 7: WhatsApp inbound webhook (WA-01)" — full source pattern + the "HMAC before JSON" discipline
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Common Pitfalls" → Pitfall #2 (the JSON-before-HMAC footgun)
    - templates/mail/app/routes/gymos.tsx (for the existing import pattern: getDb, schema, react-router types)
  </read_first>
  <action>
Create new file `templates/mail/app/routes/webhooks.whatsapp.tsx`. This is an RR v7 framework-mode resource route at URL `/webhooks/whatsapp` (dot separator = path segment).

The full file content (mirror the structure of Pattern 7 in RESEARCH.md exactly, with the discipline that `await request.text()` MUST come before any JSON parse):

```ts
//
// WhatsApp Cloud API webhook receiver — Demo Sprint D2 (WA-01).
//
// DEMO ONLY hosting: this route lives in templates/mail/ and is tunnelled to
// Meta via ngrok during the demo. Production target is apps/edge-webhooks/
// on Fly.io with min_machines=1 (see PITFALLS #8 + REQUIREMENTS WEB-01).
// Move to Fly in Phase P1b — until then, ngrok is the documented demo path.
//
// HMAC verification follows Meta's docs:
//   X-Hub-Signature-256: sha256=<HMAC-SHA256(APP_SECRET, raw_body)>
// CRITICAL: HMAC is computed on the EXACT bytes Meta sent. Any JSON parse
// before the signature check destroys the hash (PITFALLS #9).
//

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

// ─── GET — verify-token handshake (Meta calls this once at webhook registration) ──
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expectedToken) {
    return new Response("WHATSAPP_VERIFY_TOKEN not configured", { status: 500 });
  }
  if (mode === "subscribe" && token === expectedToken) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ─── POST — inbound messages + status updates ────────────────────────────────
export async function action({ request }: ActionFunctionArgs) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return new Response("WHATSAPP_APP_SECRET not configured", { status: 500 });
  }

  // 1. RAW BODY FIRST. Do NOT touch request.json() before this.
  const raw = await request.text();
  const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(raw).digest("hex");

  const sigBuf = Buffer.from(sigHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return new Response("Bad signature", { status: 401 });
  }

  // 2. Signature OK — now parse.
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const db = getDb();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      // Inbound messages
      for (const msg of value.messages ?? []) {
        const externalId = msg.id; // wamid
        const fromE164 = `+${msg.from}`;
        const messageType = (msg.type as string) ?? "text";
        const body = messageType === "text" ? (msg.text?.body ?? "") : null;

        // Idempotency — webhook_events keyed on `whatsapp:<wamid>`
        const eventKey = `whatsapp:${externalId}`;
        // guard:allow-unscoped — demo D-07 (webhook event store; no per-user scoping)
        const existing = await db
          .select()
          .from(schema.webhookEvents)
          .where(eq(schema.webhookEvents.id, eventKey))
          .limit(1)
          .then((r) => r[0]);
        if (existing) continue; // Meta retry — already processed

        await db.insert(schema.webhookEvents).values({
          id: eventKey,
          provider: "whatsapp",
          eventType: "messages.inbound",
          payloadRaw: raw,
        });

        // Lookup member by phone (natural key)
        // guard:allow-unscoped — demo D-07
        const member = await db
          .select()
          .from(schema.gymMembers)
          .where(eq(schema.gymMembers.phoneE164, fromE164))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (!member) {
          // Demo: skip unrecognised numbers. Production (WA-03) creates a stub member.
          console.warn(`[whatsapp webhook] inbound from unknown phone ${fromE164} — skipped`);
          continue;
        }

        // Upsert conversation
        // guard:allow-unscoped — demo D-07
        let conv = await db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.memberId, member.id))
          .limit(1)
          .then((r) => r[0] ?? null);

        const now = new Date().toISOString();
        if (!conv) {
          const convId = `conv_${crypto.randomUUID()}`;
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

        await db.insert(schema.messages).values({
          id: `msg_${crypto.randomUUID()}`,
          conversationId: conv.id,
          externalId,
          direction: "in",
          messageType: messageType as any,
          body,
          payload: JSON.stringify(msg),
          status: "delivered",
        });
      }

      // Status webhooks (sent/delivered/read/failed) — out of scope for demo
      // (WA-04 in P1b handles status updates via ordinal-guarded UPDATE).
      // Acknowledge but don't process.
    }
  }

  return new Response("OK", { status: 200 });
}
```

After saving, run `npx prettier --write templates/mail/app/routes/webhooks.whatsapp.tsx`.

Note: `auth.ts` publicPaths is updated by plan D2-01 (Task 4) to include `/webhooks/whatsapp`. This plan does NOT touch `auth.ts` to avoid a merge conflict with D2-01 (both running in Wave 1).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('templates/mail/app/routes/webhooks.whatsapp.tsx','utf8');const checks=['export async function loader','export async function action','crypto.createHmac','timingSafeEqual','request.text()','sha256=','hub.verify_token','schema.webhookEvents','schema.messages','schema.conversations','schema.gymMembers','phoneE164'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}const order=s.indexOf('request.text()');const parseIdx=s.indexOf('JSON.parse(raw)');const hmacIdx=s.indexOf('timingSafeEqual');if(!(order>0&&hmacIdx>order&&parseIdx>hmacIdx)){console.error('Wrong order: must be text() → HMAC → JSON.parse, got order',order,'hmac',hmacIdx,'parse',parseIdx);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/webhooks.whatsapp.tsx` exists
    - `grep -c 'export async function loader' templates/mail/app/routes/webhooks.whatsapp.tsx` returns 1
    - `grep -c 'export async function action' templates/mail/app/routes/webhooks.whatsapp.tsx` returns 1
    - `grep -c 'crypto.createHmac' templates/mail/app/routes/webhooks.whatsapp.tsx` returns 1
    - `grep -c 'timingSafeEqual' templates/mail/app/routes/webhooks.whatsapp.tsx` returns 1
    - `grep -c 'await request.text()' templates/mail/app/routes/webhooks.whatsapp.tsx` returns 1
    - `grep -c 'hub.verify_token' templates/mail/app/routes/webhooks.whatsapp.tsx` returns 1
    - `grep -c 'WHATSAPP_VERIFY_TOKEN' templates/mail/app/routes/webhooks.whatsapp.tsx` returns at least 1
    - `grep -c 'WHATSAPP_APP_SECRET' templates/mail/app/routes/webhooks.whatsapp.tsx` returns at least 1
    - `grep -c 'schema.webhookEvents' templates/mail/app/routes/webhooks.whatsapp.tsx` returns at least 2 (idempotency lookup + insert)
    - `grep -c 'schema.messages' templates/mail/app/routes/webhooks.whatsapp.tsx` returns at least 1
    - `grep -c 'schema.conversations' templates/mail/app/routes/webhooks.whatsapp.tsx` returns at least 2 (lookup + update + insert paths)
    - `grep -c 'schema.gymMembers' templates/mail/app/routes/webhooks.whatsapp.tsx` returns at least 1
    - Order check: `request.text()` appears BEFORE `timingSafeEqual` which appears BEFORE `JSON.parse(raw)` (text-then-HMAC-then-parse discipline)
    - File has at least 100 lines
  </acceptance_criteria>
  <done>The route signature-verifies on raw body before any JSON parsing, is idempotent on wamid via webhook_events, upserts conversation, inserts inbound message — all the WA-01 demo path needs</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Augment gymos.tsx action — real Meta Graph API send, gated by WHATSAPP_ACCESS_TOKEN presence</name>
  <files>
    - templates/mail/app/routes/gymos.tsx
  </files>
  <read_first>
    - templates/mail/app/routes/gymos.tsx (FULL FILE — must preserve the existing loader, member-context aggregation, send-form UI, and ?sent=1 banner; only modify the action function at lines 181-216)
    - templates/mail/server/db/schema.ts lines 159-185 (messages columns — note: externalId is nullable; we set it after the Meta call succeeds)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 8: WhatsApp outbound from staff inbox" — the Meta v23 POST shape
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Common Pitfalls" → Pitfall #3 (24h window) — demo discipline replaces enforcement; document the constraint inline as a comment but do NOT block the send
  </read_first>
  <action>
Modify ONLY the `action` function in `templates/mail/app/routes/gymos.tsx` (currently at lines 181-216 — see the read_first dump). Preserve every other export (`loader`, `meta`, default component) UNCHANGED.

The augmented action:

1. Parses formData as before (conversationId + body).
2. Resolves the recipient's `phoneE164` from the conversation → member chain.
3. **Calls Meta Graph API v23 if `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are both set**. Captures the returned `wamid` into `externalId`. On Meta error: insert the message row anyway with `status="failed"`, `error=<meta msg>`, then redirect with `?sent=0`.
4. **Falls back to the existing demo stub if env vars missing** — same INSERT path, externalId stays null, console.warn that the send was stubbed.
5. Updates the conversation lastOutboundAt + preview + updated_at (existing behaviour).
6. Redirects to `/gymos?conversation=X&sent=1` (existing) on success, `&sent=0` on Meta failure.

Replace the existing `action` function body with this:

```ts
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || !body) {
    return { error: "Missing conversation or body" };
  }
  const db = getDb();
  const id = `msg_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // Resolve recipient phone via conversation → member
  // guard:allow-unscoped — demo D-07
  const conv = await db
    .select({ memberId: schema.conversations.memberId, lastInboundAt: schema.conversations.lastInboundAt })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!conv) {
    return { error: "Conversation not found" };
  }
  // guard:allow-unscoped — demo D-07
  const member = await db
    .select({ phoneE164: schema.gymMembers.phoneE164 })
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, conv.memberId))
    .limit(1)
    .then((r) => r[0] ?? null);
  const toPhone = member?.phoneE164 ?? null;

  // DEMO ONLY: 24h window NOT enforced here (deferred to P1b / WA-05/WA-06).
  // Demo discipline: send only to a number that just messaged inbound.
  // UI shows lastInboundAt; operator chooses not to send out-of-window.

  // Try Meta Graph API v23 if configured
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  let externalId: string | null = null;
  let sendStatus: "sent" | "failed" = "sent";
  let sendError: string | null = null;

  if (phoneNumberId && accessToken && toPhone) {
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: toPhone.replace(/^\+/, ""),
            type: "text",
            text: { body },
          }),
        },
      );
      const json = (await metaRes.json()) as any;
      if (!metaRes.ok) {
        sendStatus = "failed";
        sendError = `Meta ${metaRes.status}: ${JSON.stringify(json?.error ?? json)}`;
        console.error("[whatsapp outbound]", sendError);
      } else {
        externalId = json?.messages?.[0]?.id ?? null;
      }
    } catch (err: any) {
      sendStatus = "failed";
      sendError = `Network: ${err?.message ?? String(err)}`;
      console.error("[whatsapp outbound]", sendError);
    }
  } else {
    // Demo fallback: env not configured — keep the stub behaviour.
    console.warn(
      "[whatsapp outbound] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — stubbing send (status='sent', externalId=null)",
    );
  }

  await db.insert(schema.messages).values({
    id,
    conversationId,
    direction: "out",
    messageType: "text",
    body,
    externalId,
    status: sendStatus,
    error: sendError,
    createdAt: now,
    sentAt: sendStatus === "sent" ? now : null,
  });

  await db
    .update(schema.conversations)
    .set({
      lastOutboundAt: sendStatus === "sent" ? now : conv.lastInboundAt ?? undefined,
      lastMessagePreview: body,
      updatedAt: now,
    })
    .where(eq(schema.conversations.id, conversationId));

  const sentParam = sendStatus === "sent" ? "1" : "0";
  return redirect(`/gymos?conversation=${conversationId}&sent=${sentParam}`);
}
```

The existing imports (`eq`, `redirect`, `crypto`, `getDb`, `schema`, `ActionFunctionArgs`) should already be present from the file's current state — verify by reading the import block first. If `eq` is not imported, add `import { eq } from "drizzle-orm"` to the existing drizzle-orm import line.

After saving, run `npx prettier --write templates/mail/app/routes/gymos.tsx`.

Do NOT modify the `default` component (the JSX). Do NOT modify `loader`. The UI's existing `?sent=1` banner already reads the search param and renders a green confirmation — `?sent=0` will fall through to a no-banner state, which is acceptable for demo (or the executor can extend the banner to handle both — discretion).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('templates/mail/app/routes/gymos.tsx','utf8');const checks=['graph.facebook.com/v23.0','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','messaging_product: \"whatsapp\"','externalId','sendStatus','redirect(`/gymos?conversation=']; const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)} const loaderCount=(s.match(/export async function loader/g)||[]).length;const actionCount=(s.match(/export async function action/g)||[]).length;const defaultCount=(s.match(/export default function/g)||[]).length;if(loaderCount!==1||actionCount!==1||defaultCount!==1){console.error('Expected exactly 1 loader, 1 action, 1 default export; got',{loaderCount,actionCount,defaultCount});process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'graph.facebook.com/v23.0' templates/mail/app/routes/gymos.tsx` returns at least 1
    - `grep -c 'WHATSAPP_ACCESS_TOKEN' templates/mail/app/routes/gymos.tsx` returns at least 1
    - `grep -c 'WHATSAPP_PHONE_NUMBER_ID' templates/mail/app/routes/gymos.tsx` returns at least 1
    - `grep -c 'messaging_product' templates/mail/app/routes/gymos.tsx` returns at least 1
    - `grep -c 'externalId' templates/mail/app/routes/gymos.tsx` returns at least 1 (captured wamid)
    - `grep -c 'Bearer ${accessToken}' templates/mail/app/routes/gymos.tsx` returns at least 1 (auth header)
    - Existing exports still present: exactly 1 `export async function loader`, 1 `export async function action`, 1 `export default function`
    - File still imports `getDb`, `schema`, `eq`, `redirect` from their existing sources
    - File still defines `relativeTime` and `windowState` helpers (preserved from existing implementation)
    - `npx tsc --noEmit -p templates/mail` returns 0 errors (or `pnpm --filter mail exec tsc --noEmit`)
  </acceptance_criteria>
  <done>The send action calls Meta v23 when env vars are present, falls back to the existing stub when not, captures wamid into externalId on success, marks failed sends with status='failed' + error message, and redirects with the appropriate sent=1/0 query param</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Live WhatsApp smoke test — inbound webhook + outbound send</name>
  <what-built>
End-to-end WhatsApp demo path: ngrok tunnel + Meta webhook registration + one real inbound (member's phone → /gymos shows new message) + one real outbound (/gymos send button → member's phone receives the message). Closes ROADMAP D2 success criterion #8.
  </what-built>
  <files>
    - (no file changes — this is a live integration smoke test that exercises Tasks 1-2 end-to-end against the real Meta Cloud API)
  </files>
  <action>SEE <what-built> + <how-to-verify> ABOVE. The executor walks through the 9-step Meta integration verification: ngrok tunnel, register webhook in Meta dashboard, send inbound message, verify HMAC tamper rejection, send outbound, verify wamid captured. No files modified — this checkpoint VERIFIES Tasks 1-2 end-to-end. The executor pauses for human approval.</action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('templates/mail/app/routes/webhooks.whatsapp.tsx','utf8');const o=s.indexOf('request.text()');const h=s.indexOf('timingSafeEqual');const p=s.indexOf('JSON.parse(raw)');if(!(o>0&&h>o&&p>h)){console.error('Order wrong');process.exit(1)}const g=fs.readFileSync('templates/mail/app/routes/gymos.tsx','utf8');if(!g.includes('graph.facebook.com/v23.0')){console.error('Outbound missing');process.exit(1)}"</automated>
  </verify>
  <how-to-verify>
1. Ensure all WhatsApp env vars are set in `templates/mail/.env.local`:
   ```
   WHATSAPP_APP_SECRET=<from Meta App → Settings → Basic>
   WHATSAPP_VERIFY_TOKEN=gymos-demo-verify
   WHATSAPP_PHONE_NUMBER_ID=<numeric ID from Meta WhatsApp API Setup>
   WHATSAPP_ACCESS_TOKEN=<24h temp token or permanent system-user token>
   ```

2. Boot the dev server:
   ```bash
   pnpm --filter mail dev   # :8081
   ```

3. In a second terminal, start ngrok (or use an existing tunnel):
   ```bash
   ngrok http 8081
   ```
   Copy the printed `https://*.ngrok-free.app` URL.

4. **Register the webhook in Meta:**
   - Meta App Dashboard → WhatsApp → Configuration → Webhook → Edit
   - Callback URL: `https://<your-ngrok-id>.ngrok-free.app/webhooks/whatsapp`
   - Verify token: the EXACT value of `WHATSAPP_VERIFY_TOKEN` (e.g. `gymos-demo-verify`)
   - Click **Verify and Save** → expected: success (Meta hit the GET endpoint and got the challenge back)
   - Subscribe to the **messages** field

5. **Ensure a seeded member's `phoneE164` matches your test phone:**
   - In Neon SQL: `UPDATE gym_members SET phone_e164 = '+<your-test-phone-E164>' WHERE id = 'mem_sarah_patel';` (or any of the 5 seeds)
   - Use the test phone that's authorised as a recipient in Meta's API Setup (the WhatsApp Cloud sandbox restricts sends to verified test numbers)

6. **WA-01 — Inbound test:**
   - From the test phone, send a WhatsApp message to the Meta-provided sandbox number (or your own number if it's the configured `WHATSAPP_PHONE_NUMBER_ID`)
   - In the Mail dev terminal, expect logs from the webhook handler (signature verified, inbound persisted)
   - Reload `http://localhost:8081/gymos` → expect the new conversation/message to appear in the inbox UI
   - Verify in Neon: `SELECT id, direction, body, external_id, status FROM messages ORDER BY created_at DESC LIMIT 1;` — direction='in', body=<your message>, external_id starts with `wamid.`
   - Verify idempotency: send the same payload twice (use Meta's "Resend" button in the webhook UI, or curl-replay the captured payload) — `SELECT COUNT(*) FROM webhook_events WHERE id = 'whatsapp:<wamid>';` returns exactly 1

7. **HMAC tamper test:**
   - From a terminal:
     ```bash
     curl -X POST https://<ngrok>/webhooks/whatsapp \
       -H 'X-Hub-Signature-256: sha256=deadbeef' \
       -H 'Content-Type: application/json' \
       -d '{"entry":[]}'
     ```
   - Expect: HTTP 401 "Bad signature" (no row written to webhook_events, no row written to messages)

8. **WA-02 — Outbound test:**
   - Open `http://localhost:8081/gymos` → click the conversation with the test phone
   - Type a short message (e.g. "Hi from GymOS demo") and press Send
   - Expected: the message appears in the staff inbox UI; `?sent=1` banner shows (existing UI); the test phone receives the WhatsApp message within ~5 seconds
   - Verify in Neon: `SELECT id, direction, status, external_id, error FROM messages WHERE direction='out' ORDER BY created_at DESC LIMIT 1;` — status='sent', external_id starts with `wamid.`, error IS NULL

9. **Out-of-window guard reminder (manual discipline, NOT enforced in code):**
   - Do NOT attempt to send to a number whose `lastInboundAt` is > 24h ago — Meta will return a 24h-window error. This is intentional per RESEARCH §Pitfall #3 (worker-layer enforcement is P1b).

If any step fails (especially webhook verify, HMAC tamper test, or the outbound 24h-window guard), do NOT approve. Capture the dev server logs + Meta dashboard error message and ask for help.
  </how-to-verify>
  <resume-signal>Type `approved` once both inbound + outbound work end-to-end, or describe the failure mode</resume-signal>
  <acceptance_criteria>
    - User has confirmed Meta webhook verification succeeded (GET handshake)
    - User has confirmed an inbound message persisted to messages table with direction='in' and a real wamid in external_id
    - User has confirmed sending the same wamid twice does NOT create duplicate rows in webhook_events or messages
    - User has confirmed the HMAC tamper test returned 401 with no DB writes
    - User has confirmed an outbound send delivered to the test phone AND the messages row has status='sent' + a wamid in external_id
  </acceptance_criteria>
  <done>WA-01 and WA-02 are demo-verified end-to-end; idempotency holds under Meta retry; HMAC verification rejects tampered payloads</done>
</task>

</tasks>

<verification>
**Automated (after Task 2):**

```bash
# Both files exist with required wiring
node -e "const fs=require('fs');const c=[['templates/mail/app/routes/webhooks.whatsapp.tsx','timingSafeEqual'],['templates/mail/app/routes/webhooks.whatsapp.tsx','schema.webhookEvents'],['templates/mail/app/routes/gymos.tsx','graph.facebook.com/v23.0'],['templates/mail/app/routes/gymos.tsx','WHATSAPP_ACCESS_TOKEN']];for(const[f,s] of c){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}console.log('OK')"

# TS compiles
pnpm --filter mail exec tsc --noEmit
```

**Manual (Task 3 checkpoint):** Real Meta round-trip (inbound + outbound + HMAC tamper + idempotency replay) per the 9-step checklist above.
</verification>

<success_criteria>
- [ ] `templates/mail/app/routes/webhooks.whatsapp.tsx` exists with both GET handshake and POST receiver
- [ ] HMAC verification uses `await request.text()` BEFORE any `JSON.parse(raw)`
- [ ] Idempotency via `webhook_events` keyed on `whatsapp:<wamid>`
- [ ] Member lookup via `gymMembers.phoneE164` natural key
- [ ] `gymos.tsx` action does real Meta v23 POST when env vars present
- [ ] Real outbound captures `wamid` into `messages.externalId`
- [ ] Env-not-set path falls back to existing stub with console.warn
- [ ] Failed Meta call inserts row with `status='failed'` + `error` populated, redirect with `?sent=0`
- [ ] All 12 GymOS-relevant schema tables touched correctly (no `studio_id` introduced — single-tenant invariant preserved)
- [ ] Live demo: real inbound visible in `/gymos`, real outbound delivered to test phone
</success_criteria>

<output>
After completion, create `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-02-whatsapp-webhook-outbound-SUMMARY.md` documenting:
- Files created/modified
- The exact ngrok URL used (if persistent across sessions) and the Meta App ID
- The test phone number used (E.164)
- The wamid of the first successful inbound + outbound (for evidence)
- Decision log: tunnel host (ngrok vs Cloudflare Tunnel), test-number choice (Meta sandbox vs customer's real number)
- Demo limitations noted inline in code: no 24h-window enforcement (deferred WA-05/06), no opt-in gate (WA-07), webhook on Vite/Vercel not Fly (deferred WEB-01)
</output>
</content>
</invoke>