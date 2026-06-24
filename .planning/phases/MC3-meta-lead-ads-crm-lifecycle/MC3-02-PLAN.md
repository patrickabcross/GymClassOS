---
phase: MC3-meta-lead-ads-crm-lifecycle
plan: "02"
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - services/edge-webhooks/src/routes/meta-lead.ts
  - services/edge-webhooks/src/lib/db.ts
  - services/edge-webhooks/src/lib/idempotency.ts
  - services/edge-webhooks/src/server.ts
  - services/worker/src/domain/meta-lead-ingest.ts
  - services/worker/src/queues/meta-lead.ts
  - services/worker/src/index.ts
autonomous: true
requirements: [LEAD-01, LEAD-03]
must_haves:
  truths:
    - "A signed Meta Leadgen POST is signature-verified, idempotency-recorded on leadgen_id, and enqueues a retrieval job exactly once"
    - "A GET handshake on /webhooks/meta-lead echoes hub.challenge when the verify token matches"
    - "The worker retrieves field_data via Graph GET /{leadgen_id}, reconciles a member via the dual-unique-key logic, upserts a lead conversation, stores meta_lead_id, and writes an opt-in row source='meta_lead_ads'"
    - "The ingest does NOT enqueue a Lead CAPI event (D-03 — avoid double-count)"
    - "A lead with neither email nor phone is parked + logged (still 200, idempotency recorded), not ingested"
  artifacts:
    - path: "services/edge-webhooks/src/routes/meta-lead.ts"
      provides: "POST + GET /meta-lead Hono route — raw-body verify, idempotency, enqueue"
      contains: "verifySignature"
    - path: "services/worker/src/domain/meta-lead-ingest.ts"
      provides: "field_data → member reconcile + conversation + attribution(meta_lead_id) + opt-in"
      contains: "meta_lead_ads"
    - path: "services/worker/src/queues/meta-lead.ts"
      provides: "META_LEAD worker handler — Graph GET /{leadgen_id} + ingest, retry on 404/code100"
      contains: "graph.facebook.com"
    - path: "services/worker/src/index.ts"
      provides: "META_LEAD queue created + registerMetaLeadWorker called"
      contains: "registerMetaLeadWorker"
  key_links:
    - from: "services/edge-webhooks/src/routes/meta-lead.ts"
      to: "enqueueMetaLead (MC3-01)"
      via: "enqueue only when insertWebhookEvent inserted===true"
      pattern: "enqueueMetaLead"
    - from: "services/worker/src/queues/meta-lead.ts"
      to: "Meta Graph v23 GET /{leadgen_id}"
      via: "fetch with Page access token from app_secrets"
      pattern: "graph\\.facebook\\.com/v23\\.0"
    - from: "services/worker/src/domain/meta-lead-ingest.ts"
      to: "meta_lead_attribution.meta_lead_id + whatsapp_opt_in.source='meta_lead_ads'"
      via: "raw SQL upsert with guard:allow-unscoped"
      pattern: "meta_lead_id"
---

<objective>
Build the new inbound path for Meta Lead Ads: a signature-verified Leadgen webhook at the edge (verify + idempotency + enqueue only) and a worker handler that retrieves the lead's field_data from the Graph API and ingests it as a member + lead conversation — a sibling of the website-form path that SKIPS the Lead CAPI enqueue (D-03/D-04) and stores the Meta lead_id (LEAD-01). WhatsApp follow-up stays on the existing chokepoint via an opt-in row source='meta_lead_ads' (LEAD-03 — no new outbound path).

Purpose: Leads captured inside Facebook/Instagram land in the studio DB and become reachable + advanceable exactly like website leads, with their meta_lead_id stored so MC3-01's lifecycle passthrough reports progression back to Meta's Leads Center.

Output: services/edge-webhooks/src/routes/meta-lead.ts (POST + GET), the 'meta_lead' provider added to the edge-webhooks db mirror + idempotency type, server.ts route registration, a worker ingest module + META_LEAD queue handler, and worker index.ts wiring.
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
@.agents/skills/integration-webhooks/SKILL.md

<interfaces>
<!-- Current contracts. Use directly — no codebase exploration needed. -->

DEPENDS ON MC3-01 (already merged): packages/queue exports `QUEUE_NAMES.META_LEAD`, `MetaLeadPayload` ({ leadgenId, formId, pageId, adId }), and `enqueueMetaLead(args)`. Run `pnpm --filter @gymos/queue build` before worker/edge tsc.

services/edge-webhooks/src/routes/whatsapp.ts — THE MODEL to mirror exactly:
- `const raw = await c.req.text();` is the FIRST statement (raw-body-first; never c.req.json()).
- `const sigHeader = c.req.header("x-hub-signature-256") ?? "";`
- `const appSecret = await getWhatsAppAppSecret(getDb());` (AFTER raw read)
- `if (!verifySignature(raw, sigHeader, appSecret)) return c.text("Bad signature", 401);`
- GET handler: hub.mode/hub.verify_token/hub.challenge → echo challenge on match, 403 otherwise.

services/edge-webhooks/src/lib/idempotency.ts — insertWebhookEvent({ provider, eventType, externalId, payloadRaw }) → { inserted: boolean, eventKey }. `WebhookProvider` type = `"stripe" | "whatsapp"` (line 3) — ADD "meta_lead". ON CONFLICT (provider, external_id) DO NOTHING.

services/edge-webhooks/src/lib/db.ts — webhookEvents pgTable mirror, line 28: `provider: text("provider", { enum: ["stripe", "whatsapp"] })` — ADD "meta_lead".

services/edge-webhooks/src/lib/secrets.ts — getWhatsAppVerifyToken(db) + getWhatsAppAppSecret(db), both TTL-cached, DB-first then env. Meta Lead Ads uses the SAME Facebook App Secret + the SAME verify token (one app). REUSE getWhatsAppAppSecret + getWhatsAppVerifyToken directly — no new secret resolver needed.

services/edge-webhooks/src/server.ts — `app.route("/webhooks", whatsappRoutes); app.route("/webhooks", stripeRoutes);` — ADD `app.route("/webhooks", metaLeadRoutes);`.

services/worker/src/lib/appSecrets.ts — readAppSecretByKey(key, db) → string | null (AES-256-GCM via BETTER_AUTH_SECRET). Use to read "META_PAGE_ACCESS_TOKEN".

services/worker/src/queues/inbound-whatsapp.ts + services/worker/src/domain/conversations.ts — the model for a worker queue handler that materialises a member/conversation from an inbound event (registerXWorker(boss) + boss.work pattern).

services/worker/src/index.ts — boss.createQueue loop includes QUEUE_NAMES.META_CAPI_EVENT (line ~54); ADD QUEUE_NAMES.META_LEAD. registerMetaCapiEventWorker(boss) called ~line 112; ADD registerMetaLeadWorker(boss).

THE DUAL-UNIQUE-KEY RECONCILE (mirror verbatim, swap source) — apps/staff-web/features/forms/handlers/submissions.ts lines ~295-419 + ~614-625:
- gym_members has SEPARATE unique indexes on email AND phone_e164.
- Lookup byEmail (SELECT id, phone_e164 WHERE email=...) and byPhone (SELECT id WHERE phone_e164=...).
- If byEmail: reuse that id; backfill phone only if member has none AND phone not taken by another.
- Else if byPhone: reuse that id; backfill email via COALESCE.
- Else if email||phone: INSERT a fresh gym_members row.
- Upsert conversations ON CONFLICT (member_id, channel='whatsapp') with status 'lead'; re-select canonical conv id.
- Insert a messages row payload {kind:"meta_lead_ad", leadgenId, formId, fieldData} (Claude's Discretion — recommended for parity).
- Insert whatsapp_opt_in (member_id, opted_in_at, evidence_payload, source) VALUES (..., 'meta_lead_ads') ON CONFLICT (member_id) DO NOTHING.
- meta_lead_attribution upsert MUST set meta_lead_id = leadgenId.
- NOTE: worker uses raw db.execute(sql`...`) with `// guard:allow-unscoped` markers — NEVER import apps/staff-web schema (MC1-03 boundary).

Worker DB shape note: db.execute returns `{ rows: [] }` (Neon) — read via `(result as any)?.rows ?? (result as any) ?? []` then `[0]`, same as metaLifecycle.ts.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: edge-webhooks — meta_lead provider + Leadgen route (verify, idempotency, enqueue)</name>
  <files>services/edge-webhooks/src/lib/db.ts, services/edge-webhooks/src/lib/idempotency.ts, services/edge-webhooks/src/routes/meta-lead.ts, services/edge-webhooks/src/server.ts</files>
  <read_first>
    - services/edge-webhooks/src/routes/whatsapp.ts (THE model — copy the raw-body-first verify + GET handshake structure)
    - services/edge-webhooks/src/lib/db.ts (the file being modified — provider enum line 28)
    - services/edge-webhooks/src/lib/idempotency.ts (the file being modified — WebhookProvider type line 3)
    - services/edge-webhooks/src/lib/secrets.ts (getWhatsAppAppSecret + getWhatsAppVerifyToken — reuse both)
    - services/edge-webhooks/src/server.ts (the file being modified — route registration)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "Pattern 1: Leadgen Webhook Route" + Pitfall 1 (leadgen_id precision) + Pitfall 2 (raw body) + Pitfall 3 (enum mirror)
  </read_first>
  <action>
    1. services/edge-webhooks/src/lib/db.ts — change line 28 provider enum to `{ enum: ["stripe", "whatsapp", "meta_lead"] }` (additive). This is the TypeScript mirror only; the Postgres column is plain TEXT (no constraint) — no DB change needed (the staff-web schema is source of truth).
    2. services/edge-webhooks/src/lib/idempotency.ts — change line 3 to `export type WebhookProvider = "stripe" | "whatsapp" | "meta_lead";`
    3. Create services/edge-webhooks/src/routes/meta-lead.ts. Export `metaLeadRoutes = new Hono()`. Two handlers on path "/meta-lead":
       GET — mirror whatsapp GET handshake exactly, but resolve via getWhatsAppVerifyToken(getDb()) (same Facebook App):
       ```typescript
       metaLeadRoutes.get("/meta-lead", async (c) => {
         const mode = c.req.query("hub.mode");
         const token = c.req.query("hub.verify_token");
         const challenge = c.req.query("hub.challenge");
         const verifyToken = await getWhatsAppVerifyToken(getDb());
         if (mode === "subscribe" && token === verifyToken) return c.text(challenge ?? "", 200);
         return c.text("Forbidden", 403);
       });
       ```
       POST — raw-body-first verify, then per-change idempotency + enqueue:
       ```typescript
       metaLeadRoutes.post("/meta-lead", async (c) => {
         const raw = await c.req.text();            // FIRST statement (Pitfall 2)
         const sigHeader = c.req.header("x-hub-signature-256") ?? "";
         const appSecret = await getWhatsAppAppSecret(getDb());  // same FB App Secret
         if (!verifySignature(raw, sigHeader, appSecret)) return c.text("Bad signature", 401);
         let payload: any;
         try { payload = JSON.parse(raw); } catch { return c.text("Bad JSON", 400); }
         const entries = payload?.entry ?? [];
         for (const entry of entries) {
           for (const change of entry?.changes ?? []) {
             if (change.field !== "leadgen") continue;
             const v = change.value ?? {};
             // Pitfall 1: leadgen_id is a 15-16 digit int > Number.MAX_SAFE_INTEGER.
             // Extract as STRING from the RAW body via regex BEFORE precision loss.
             const m = raw.match(/"leadgen_id"\s*:\s*"?(\d+)"?/);
             const leadgenId = m?.[1] ?? String(v.leadgen_id ?? "");
             if (!leadgenId) continue;
             const result = await insertWebhookEvent({
               provider: "meta_lead",
               eventType: "leadgen",
               externalId: leadgenId,
               payloadRaw: raw,
             });
             if (result.inserted) {
               await enqueueMetaLead({
                 leadgenId,
                 formId: String(v.form_id ?? ""),
                 pageId: String(v.page_id ?? ""),
                 adId: String(v.ad_id ?? ""),
               });
             }
           }
         }
         return c.text("OK", 200);  // always 200 after verify (D-07 park-don't-fail)
       });
       ```
       Imports: `import { Hono } from "hono"; import { verifySignature } from "@gymos/whatsapp"; import { enqueueMetaLead } from "@gymos/queue"; import { insertWebhookEvent } from "../lib/idempotency.js"; import { getWhatsAppVerifyToken, getWhatsAppAppSecret } from "../lib/secrets.js"; import { getDb } from "../lib/db.js";`
       NOTE: if multiple changes are in one POST the regex matches only the first leadgen_id — acceptable: Meta sends one change per POST in practice; document this single-change assumption in a comment.
    4. services/edge-webhooks/src/server.ts — import metaLeadRoutes and add `app.route("/webhooks", metaLeadRoutes);` after the stripe route.
  </action>
  <verify>
    <automated>cd services/edge-webhooks && pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `services/edge-webhooks/src/lib/db.ts` provider enum line contains `"meta_lead"`
    - `services/edge-webhooks/src/lib/idempotency.ts` contains `"meta_lead"` in WebhookProvider
    - `services/edge-webhooks/src/routes/meta-lead.ts` exists and contains `verifySignature`, `enqueueMetaLead`, `"leadgen"`, and the leadgen_id regex `"leadgen_id"`
    - `services/edge-webhooks/src/routes/meta-lead.ts`: `await c.req.text()` appears BEFORE `verifySignature` (raw-body-first)
    - `services/edge-webhooks/src/routes/meta-lead.ts` does NOT contain `c.req.json()`
    - `services/edge-webhooks/src/server.ts` contains `metaLeadRoutes`
    - `cd services/edge-webhooks && pnpm tsc --noEmit` passes (after `pnpm --filter @gymos/queue build`)
    - `cd services/edge-webhooks && pnpm test` passes (if a test suite exists; otherwise tsc is the gate)
  </acceptance_criteria>
  <done>POST /webhooks/meta-lead verifies the HMAC, records idempotency on leadgen_id (string-safe), and enqueues a retrieval job only on first delivery; GET handshake echoes the challenge; edge-webhooks typechecks.</done>
</task>

<task type="auto">
  <name>Task 2: worker — meta-lead-ingest module (dual-key reconcile, meta_lead_id, opt-in, NO Lead enqueue)</name>
  <files>services/worker/src/domain/meta-lead-ingest.ts</files>
  <read_first>
    - apps/staff-web/features/forms/handlers/submissions.ts (THE blueprint — dual-unique-key reconcile ~lines 295-419, conversation upsert ~374-389, attribution upsert ~494-516, opt-in insert ~614-625, Lead enqueue ~518-543 which MC3 SKIPS)
    - services/worker/src/domain/metaLifecycle.ts (raw db.execute + guard:allow-unscoped pattern + Neon { rows } shape)
    - services/worker/src/domain/conversations.ts (worker member/conversation materialisation pattern)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "Pattern 2: Worker Retrieval + Ingest" + "Standard Field Names" + D-05/D-06/D-07
  </read_first>
  <action>
    Create services/worker/src/domain/meta-lead-ingest.ts exporting `ingestMetaLead(db, lead, leadgenId)` where `lead` is the Graph response ({ field_data: [{name, values}] }) and leadgenId is the string id. ALL DB access is raw `db.execute(sql\`...\`)` with `// guard:allow-unscoped — single-tenant gym tables` / `// guard:allow-unscoped — single-tenant meta attribution` markers. NEVER import apps/staff-web schema (MC1-03 boundary). Use `nanoid` for new ids.

    Steps inside ingestMetaLead:
    1. Build fieldMap: `Object.fromEntries((lead.field_data ?? []).map((f) => [f.name, f.values?.[0] ?? ""]))`.
    2. Extract standard fields (D-05): `const fullName = fieldMap["full_name"] ?? ""; const email = (fieldMap["email"] ?? "").trim() || null;` and phone: prefer `fieldMap["phone_number"]`; fallback (RESEARCH note) — if absent, find any key whose lowercased name includes "phone". Normalize phone to E.164: strip spaces; if it doesn't start with "+" leave as-is digits (mirror submissions.ts normalizePhone intent — but the worker has no normalize-phone import; do a minimal normalize: keep leading +, strip non [+\d]). Split fullName best-effort: firstName = parts[0] || "Lead"; lastName = parts.slice(1).join(" ") || null.
    3. D-07 PARK: `if (!email && !phone) { log.warn({ leadgenId }, "[meta-lead] no email or phone — parking lead"); return; }`
    4. Dual-unique-key reconcile (mirror submissions.ts EXACTLY, raw SQL): SELECT byEmail (id, phone_e164), SELECT byPhone (id); branch byEmail / byPhone / fresh INSERT; resolve `resolvedMemberId`. Use the same backfill-only-when-safe rules.
    5. Conversation upsert: INSERT INTO conversations (...) VALUES (..., 'whatsapp', 'lead', NOW(), NOW()) ON CONFLICT (member_id, channel) DO UPDATE SET status = CASE WHEN conversations.status='closed' THEN 'lead' ELSE conversations.status END, updated_at=NOW(); then re-SELECT canonical conv id.
    6. messages row (Claude's Discretion parity): INSERT INTO messages (id, conversation_id, direction, message_type, body, payload, status, created_at) VALUES (nanoid(), resolvedConvId, 'in', 'text', 'New lead via Meta Lead Ad', `${JSON.stringify({ kind: "meta_lead_ad", leadgenId, formId, fieldData: fieldMap })}`, 'delivered', NOW()).
    7. meta_lead_attribution upsert WITH meta_lead_id (the key MC3 addition):
       INSERT INTO meta_lead_attribution (id, member_id, meta_lead_id, created_at, updated_at) VALUES (nanoid(), resolvedMemberId, ${leadgenId}, NOW(), NOW()) ON CONFLICT (member_id) DO UPDATE SET meta_lead_id = COALESCE(EXCLUDED.meta_lead_id, meta_lead_attribution.meta_lead_id), updated_at = NOW().
    8. opt-in (D-01, LEAD-03): INSERT INTO whatsapp_opt_in (member_id, opted_in_at, evidence_payload, source) VALUES (resolvedMemberId, NOW()::text or ISO, ${JSON.stringify({ kind: "meta_lead_ad", leadgenId, fieldData: fieldMap })}, 'meta_lead_ads') ON CONFLICT (member_id) DO NOTHING.
    9. **DO NOT enqueue a Lead CAPI event (D-03/D-04).** No enqueueMetaCapiEvent call here. Add an explicit comment: `// D-03: NO Lead CAPI enqueue — Meta already counted this in-platform lead (avoids double-count).`
    Return `{ memberId: resolvedMemberId }`.
  </action>
  <verify>
    <automated>cd services/worker && pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/domain/meta-lead-ingest.ts` exists and exports `ingestMetaLead`
    - contains `'meta_lead_ads'` (opt-in source)
    - contains `meta_lead_id` in the attribution INSERT
    - contains the dual-key reconcile markers: `phone_e164` byPhone lookup AND `WHERE email =` byEmail lookup
    - contains a D-03 comment explaining NO Lead CAPI enqueue
    - does NOT contain `enqueueMetaCapiEvent`
    - does NOT import from `apps/staff-web` (MC1-03 boundary)
    - every db.execute on gym/attribution/opt-in tables carries a `guard:allow-unscoped` marker
    - `cd services/worker && pnpm tsc --noEmit` passes
  </acceptance_criteria>
  <done>ingestMetaLead reconciles a member via dual-unique-key, upserts a lead conversation, stores meta_lead_id, writes the meta_lead_ads opt-in, parks identity-less leads, and never enqueues a Lead event.</done>
</task>

<task type="auto">
  <name>Task 3: worker — META_LEAD queue handler (Graph retrieval + retry) + index wiring</name>
  <files>services/worker/src/queues/meta-lead.ts, services/worker/src/index.ts</files>
  <read_first>
    - services/worker/src/queues/meta-capi-event.ts (registerXWorker + boss.work + readAppSecretByKey + fetch-with-retry pattern; retryCount/retryLimit via includeMetadata)
    - services/worker/src/index.ts (the file being modified — createQueue loop ~line 48-66, registration calls ~line 72-113)
    - services/worker/src/lib/appSecrets.ts (readAppSecretByKey for META_PAGE_ACCESS_TOKEN)
    - services/worker/src/domain/meta-lead-ingest.ts (Task 2 output — ingestMetaLead)
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-RESEARCH.md § "Graph API Lead Retrieval" + Pitfall 5 (retrieval race) + Pitfall 6 (Leads Access) + "Page Access Token Details"
  </read_first>
  <action>
    Task 2 + MC3-01 must be built first (`pnpm --filter @gymos/queue build`) so types resolve.

    1. Create services/worker/src/queues/meta-lead.ts exporting `registerMetaLeadWorker(boss: PgBoss)`:
       ```typescript
       export async function registerMetaLeadWorker(boss: PgBoss) {
         const log = getLogger();
         await boss.work(
           QUEUE_NAMES.META_LEAD,
           { batchSize: 1, localConcurrency: 1, includeMetadata: true },
           async (jobs: any) => {
             const job = Array.isArray(jobs) ? jobs[0] : jobs;
             const data = MetaLeadPayload.parse(job.data);
             const db = getDb();
             // 1. Page access token from app_secrets (D-08). Never logged.
             const pageToken = await readAppSecretByKey("META_PAGE_ACCESS_TOKEN", db);
             if (!pageToken) {
               log.warn({ leadgenId: data.leadgenId }, "[meta-lead] META_PAGE_ACCESS_TOKEN not configured — skipping");
               return; // unconfigured-skip, same posture as meta-capi-event
             }
             // 2. Graph v23 retrieval.
             const url = `https://graph.facebook.com/v23.0/${data.leadgenId}?access_token=${pageToken}`;
             const resp = await fetch(url);
             const body: any = await resp.json().catch(() => ({}));
             if (!resp.ok) {
               // Pitfall 5: 404 / code 100 = availability lag — retry. code 190 = bad token — permanent.
               const code = body?.error?.code;
               if (code === 190) {
                 log.error({ leadgenId: data.leadgenId }, "[meta-lead] Page token invalid (code 190) — not retrying. Re-enter token in Settings.");
                 return; // permanent — give up
               }
               throw new Error(`Graph ${resp.status} code=${code} — retrying`); // retryable (incl. 404/code100)
             }
             // 3. Ingest.
             const { memberId } = (await ingestMetaLead(db, body, data.leadgenId)) ?? {};
             log.info({ leadgenId: data.leadgenId, memberId }, "[meta-lead] ingested");
           },
         );
       }
       ```
       Imports: PgBoss type, sql (if needed), QUEUE_NAMES + MetaLeadPayload from "@gymos/queue", getDb, getLogger, readAppSecretByKey, ingestMetaLead from "../domain/meta-lead-ingest.js". ingestMetaLead returns `{ memberId } | void` — handle the void case.
       NOTE on retry config: pg-boss retry uses the enqueue-time options (MC3-01 set retryLimit:5, retryBackoff). Throwing here triggers those retries — handles both the retrieval race (Pitfall 5) and transient network errors. Do NOT add a separate retryDelay loop.
    2. services/worker/src/index.ts:
       (a) Add `QUEUE_NAMES.META_LEAD` to the createQueue loop array (alongside META_CAPI_EVENT).
       (b) `import { registerMetaLeadWorker } from "./queues/meta-lead.js";`
       (c) After the `registerMetaCapiEventWorker(boss)` block, add:
           `await registerMetaLeadWorker(boss);`
           `log.info("[worker] meta-lead queue registered");`
  </action>
  <verify>
    <automated>cd services/worker && pnpm tsc --noEmit && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `services/worker/src/queues/meta-lead.ts` exists and contains `graph.facebook.com/v23.0`
    - contains `readAppSecretByKey("META_PAGE_ACCESS_TOKEN"` (Page token resolution)
    - contains `ingestMetaLead`
    - handles code 190 as permanent (no throw) and throws on other non-ok responses (retry — covers 404/code100)
    - `services/worker/src/index.ts` contains `QUEUE_NAMES.META_LEAD` in the createQueue loop
    - `services/worker/src/index.ts` contains `registerMetaLeadWorker(boss)`
    - `services/worker/src/queues/meta-lead.ts` does NOT log the pageToken value
    - `cd services/worker && pnpm tsc --noEmit && pnpm test` passes (after `pnpm --filter @gymos/queue build`)
  </acceptance_criteria>
  <done>The META_LEAD queue is created + registered; the handler resolves the Page token, retrieves field_data from Graph v23, retries on availability-lag/transient errors, treats code 190 as permanent, and ingests via Task 2; worker typechecks + tests pass.</done>
</task>

</tasks>

<verification>
- `cd services/edge-webhooks && pnpm tsc --noEmit` green
- `cd services/worker && pnpm tsc --noEmit && pnpm test` green (after `pnpm --filter @gymos/queue build`)
- grep: meta-lead.ts route has raw-body-first + verifySignature + enqueueMetaLead + leadgen_id regex; ingest has meta_lead_id + meta_lead_ads + NO enqueueMetaCapiEvent; queue handler has graph.facebook.com/v23.0 + META_PAGE_ACCESS_TOKEN; index has registerMetaLeadWorker + META_LEAD in createQueue loop
- D-03 honored: no Lead CAPI enqueue anywhere in the ingest path
- D-07 honored: identity-less leads parked, POST still returns 200
</verification>

<success_criteria>
- A signed Leadgen POST is verified, idempotency-recorded on leadgen_id, and enqueues exactly one retrieval job (LEAD-01).
- The worker retrieves field_data, reconciles a member via dual-unique-key, stores meta_lead_id, upserts a lead conversation, and writes opt-in source='meta_lead_ads' — without firing a Lead CAPI event (D-03).
- Follow-up routes through the existing opt-in/window/template chokepoint (LEAD-03) — the opt-in row only marks reachability; no new outbound path is added.
- Identity-less leads are parked + logged (D-07).
</success_criteria>

<output>
After completion, create `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-02-SUMMARY.md`.
Flag operator setup needed before live: (1) Page subscription to the `leadgen` field, (2) META_PAGE_ACCESS_TOKEN entered in Settings (MC3-03), (3) leads_retrieval + pages_manage_ads app permissions (may need Meta App Review) — see MC3-03 ops note.
</output>
