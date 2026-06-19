---
phase: BD3
plan: 04
type: execute
wave: 2
depends_on: ["BD3-03"]
files_modified:
  - apps/hq/actions/send-owner-whatsapp.ts
  - apps/hq/actions/send-owner-whatsapp.test.ts
  - apps/hq/server/plugins/agent-chat.ts
  - apps/hq/MODIFICATIONS.md
  - services/hq-worker/src/queues/hq-owner-send.ts
  - services/hq-worker/src/index.ts
autonomous: true
requirements: [HQD-02, HQD-03]
must_haves:
  truths:
    - "The send-owner-whatsapp action's .strict() Zod schema rejects any unknown field (e.g. memberId/memberEmail/memberPhone) at parse time"
    - "The action schema has no field capable of expressing a member target — only studioId, a topic enum, and a system/product payload"
    - "The HQD agent system prompt states the operator-comms constraint (gym-owners only, never members/PII)"
    - "The send-owner-whatsapp action enqueues to the hq-owner-send queue; the worker processes it through sendOwnerMessage with the WABA client (mock when creds absent)"
  artifacts:
    - path: "apps/hq/actions/send-owner-whatsapp.ts"
      provides: "Member-excluded owner-send defineAction"
      contains: ".strict()"
    - path: "apps/hq/actions/send-owner-whatsapp.test.ts"
      provides: "Unit proof of structural member exclusion"
    - path: "services/hq-worker/src/queues/hq-owner-send.ts"
      provides: "hq-owner-send queue handler (injected HqWabaClient)"
      exports: ["registerOwnerSend"]
    - path: "apps/hq/server/plugins/agent-chat.ts"
      provides: "HQD system-prompt constraint wrapper"
  key_links:
    - from: "apps/hq/actions/send-owner-whatsapp.ts"
      to: "hq-owner-send queue"
      via: "getBoss().send('hq-owner-send', ...)"
      pattern: "hq-owner-send"
    - from: "services/hq-worker/src/queues/hq-owner-send.ts"
      to: "services/hq-worker/src/domain/sendOwnerMessage.ts"
      via: "calls sendOwnerMessage with injected client"
      pattern: "sendOwnerMessage"
    - from: "services/hq-worker/src/index.ts"
      to: "registerOwnerSend"
      via: "createQueue + register in boot"
      pattern: "registerOwnerSend"
---

<objective>
Expose the HQD owner-send capability to the operator's dispatcher agent via a structurally member-excluded action (D-08), reinforce it with the HQD system-prompt constraint, and wire the `hq-owner-send` pg-boss queue that runs the BD3-03 `sendOwnerMessage` orchestrator (deferred-on-external-dependency mock client, D-13).

Purpose: HQD-02 (member-excluded owner-send action), HQD-03 (routes through the gated send path).
Output: `send-owner-whatsapp` defineAction + test, HQD system-prompt constraint in agent-chat.ts (copy-out fork if needed, recorded in MODIFICATIONS.md), and the `hq-owner-send` queue registered in hq-worker.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md
@apps/hq/actions/ask-brain.ts
@apps/hq/server/plugins/agent-chat.ts
@services/hq-worker/src/index.ts

<interfaces>
From BD3-03:
- `services/hq-worker/src/domain/sendOwnerMessage.ts`: `sendOwnerMessage({ studioId, messageId, payload, db, client })` + typed errors.
- `services/hq-worker/src/lib/hq-waba-client.ts`: `HqWabaClient`, `mockHqWabaClient`, `createHqWabaClient`, `SendOwnerMessagePayload`.

Queue producer in apps/hq: BD2-06 added `@gymos/queue` as a workspace dep to @gymos/hq and used `getBoss()` in the signup intake handler. Use the same `getBoss()` to enqueue from the action's `run`.

hq-worker boot (services/hq-worker/src/index.ts): the `for (const q of ["provision-studio","hq-watchdog"])` createQueue loop + `registerProvisionStudio(boss, apis)` pattern. Add "hq-owner-send" to the loop and call `registerOwnerSend(boss, client)`.

agent-chat.ts is currently `export { dispatchAgentChatPlugin as default } from "@agent-native/dispatch/server";` (one line). Open Question 1: check whether dispatchAgentChatPlugin accepts a systemPromptSuffix/additionalInstructions option before forking.

HQD constraint text (RESEARCH lines 560-567):
"HQD CONSTRAINT: You may only send messages to gym-owners about GymClassOS product features, system updates, onboarding guidance, or aggregate performance insights ... You MUST NEVER send a message that references, implies knowledge of, or derives from any specific gym member, booking, conversation, or any PII. HQ Neon contains only aggregate telemetry and studio registry data — never member records."

defineAction shape: see ask-brain.ts (`defineAction({ description, schema, run })`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: send-owner-whatsapp action with .strict() member-excluded schema (RED→GREEN)</name>
  <files>apps/hq/actions/send-owner-whatsapp.ts, apps/hq/actions/send-owner-whatsapp.test.ts</files>
  <read_first>
    - apps/hq/actions/ask-brain.ts (defineAction pattern in apps/hq)
    - apps/hq/actions/_schemas.ts (shared schema helpers, if used by HQ actions)
    - services/hq-worker/src/lib/hq-waba-client.ts (SendOwnerMessagePayload — keep action payload shape identical)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 509-549, 844-872 (schema + defineAction body verbatim)
    - apps/hq/actions/AE3-01 update-member pattern is in staff-web; the v1.2 `.strict()` consent-exclusion is the precedent — mirror that structural approach
  </read_first>
  <behavior>
    - Parsing `{ studioId, topic, payload }` with a valid text payload SUCCEEDS
    - Parsing the same object PLUS `memberId: "x"` THROWS ZodError (.strict() rejects unknown key) — this is the structural member-exclusion proof
    - Parsing with `memberEmail` / `memberPhone` / `to` likewise THROWS
    - topic outside the enum (system_update | feature_announcement | onboarding_guidance | performance_insight | billing_notice) THROWS
    - template payload requires name + vars; text payload requires body (discriminated union)
  </behavior>
  <action>
    Create `apps/hq/actions/send-owner-whatsapp.ts` via `defineAction` per RESEARCH lines 844-872. Schema EXACTLY:
    ```typescript
    schema: z.object({
      studioId: z.string().min(1).describe("HQ studio registry ID — resolves owner contact"),
      topic: z.enum(["system_update","feature_announcement","onboarding_guidance","performance_insight","billing_notice"]),
      payload: z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), body: z.string().min(1).max(4096) }),
        z.object({ type: z.literal("template"), name: z.string().min(1), vars: z.record(z.string(), z.string()), language: z.string().default("en_US") }),
      ]),
    }).strict()
    ```
    The `.strict()` is load-bearing (D-08): there is NO member-target field, and any unknown key (memberId etc.) throws at parse. description text per RESEARCH lines 852-856 (states owner-only, never members/PII, sends from HQ's own WABA).
    `run`: `const db = getHqDb()` (or getDb from apps/hq server/db); insert an HQ message row if a messages table exists (otherwise generate `messageId = crypto.randomUUID()` — note BD2-06 used randomUUID since nanoid isn't an hq dep); then `await getBoss().send("hq-owner-send", { studioId, messageId, payload })`. Return `{ enqueued: true, messageId }`. Do NOT call the WABA client directly from the action — the worker owns the gated send (consistent with the integration-webhooks queue pattern and the provision-studio producer/consumer split).
    Write `apps/hq/actions/send-owner-whatsapp.test.ts`: import the action's schema (export the `OwnerSendSchema` const so the test can `.parse()` it directly without invoking `run`/getBoss) and assert every <behavior> bullet. The key assertion: `expect(() => OwnerSendSchema.parse({ studioId, topic:"system_update", payload:{type:"text",body:"hi"}, memberId:"x" })).toThrow()`.
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq test --run send-owner-whatsapp</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/actions/send-owner-whatsapp.ts` contains `.strict()` and `discriminatedUnion` and `getBoss().send("hq-owner-send"` (or equivalent enqueue)
    - file has NO `member` substring in any schema field name (grep `member` in the schema object returns only the description text, not a field)
    - `send-owner-whatsapp.test.ts` asserts a `memberId`-bearing payload throws
    - `pnpm -F @gymos/hq test --run send-owner-whatsapp` exits 0
  </acceptance_criteria>
  <done>Owner-send action exists; the schema structurally cannot express a member target; enqueues to hq-owner-send.</done>
</task>

<task type="auto">
  <name>Task 2: HQD system-prompt constraint in agent-chat.ts (copy-out fork if needed)</name>
  <files>apps/hq/server/plugins/agent-chat.ts, apps/hq/MODIFICATIONS.md</files>
  <read_first>
    - apps/hq/server/plugins/agent-chat.ts (current one-line re-export)
    - apps/hq/server/plugins/setup-dispatch.ts (sibling re-export — see how dispatch is configured)
    - node_modules/@agent-native/dispatch/server (inspect dispatchAgentChatPlugin signature — does it accept systemPromptSuffix/additionalInstructions? Open Question 1)
    - apps/hq/MODIFICATIONS.md (the BD1 copy-out ledger — append any new copy-out here)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 551-569, 888-891 (constraint text + fork guidance)
  </read_first>
  <action>
    First inspect `@agent-native/dispatch/server`'s `dispatchAgentChatPlugin`. TWO paths:
    (a) If it accepts an option like `systemPromptSuffix` / `additionalInstructions` / `extraSystemPrompt`: replace the one-line re-export with a wrapper that calls `dispatchAgentChatPlugin({ ...existingOpts, systemPromptSuffix: HQD_CONSTRAINT })` and default-exports it. No copy-out needed.
    (b) If NO such option exists: copy-out fork the plugin into `apps/hq/server/plugins/agent-chat.ts` (record the origin path in apps/hq/MODIFICATIONS.md with date + reason "append HQD operator-comms constraint to system prompt"), and append the HQD_CONSTRAINT to the system prompt string. Keep the copy minimal — only the system-prompt assembly is forked.
    Define `const HQD_CONSTRAINT` containing the verbatim text from RESEARCH lines 560-567 (gym-owners only; never reference/derive from any member, booking, conversation, or PII; HQ Neon contains only aggregate telemetry + registry).
    This is defense-in-depth on top of the structural schema exclusion from Task 1 (D-08) — the schema makes member targeting impossible; the prompt discourages member-referencing freeform body content (Pitfall 4).
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/server/plugins/agent-chat.ts` contains the string `HQD CONSTRAINT` (or references a const containing it)
    - if a copy-out was performed, `apps/hq/MODIFICATIONS.md` gained a new entry naming the origin path
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0
    - `pnpm guard:hq-fork-boundary` exits 0
  </acceptance_criteria>
  <done>The HQD agent system prompt carries the operator-comms constraint; any copy-out is recorded in MODIFICATIONS.md.</done>
</task>

<task type="auto">
  <name>Task 3: hq-owner-send pg-boss queue + worker registration</name>
  <files>services/hq-worker/src/queues/hq-owner-send.ts, services/hq-worker/src/index.ts, services/hq-worker/src/lib/env.ts</files>
  <read_first>
    - services/hq-worker/src/index.ts (createQueue loop + registerProvisionStudio(boss, apis) boot pattern)
    - services/hq-worker/src/queues/provision-studio.ts (registerProvisionStudio signature + injected-client/useMockApis deferred pattern from BD2-05)
    - services/hq-worker/src/domain/sendOwnerMessage.ts (called by the handler)
    - services/hq-worker/src/lib/hq-waba-client.ts (mockHqWabaClient / createHqWabaClient — choose based on creds)
    - services/hq-worker/src/lib/env.ts (how env/creds are read — add HQ_WABA_PHONE_NUMBER_ID / HQ_WABA_API_TOKEN as OPTIONAL)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 571-581, 636-653 (queue location + injected-client mock pattern)
  </read_first>
  <action>
    Create `services/hq-worker/src/queues/hq-owner-send.ts` exporting `registerOwnerSend(boss: PgBoss, client: HqWabaClient): Promise<void>`. Mirror registerProvisionStudio: `boss.work("hq-owner-send", async (jobs) => { const { studioId, messageId, payload } = jobs[0].data; const db = getHqDb(); await sendOwnerMessage({ studioId, messageId, payload, db, client }); })`. Note pg-boss v12 passes `Job<T>[]` (array) — destructure `jobs[0]` (BD2-05 decision). Set a sensible `retryLimit` on the queue. On a typed gate error (OwnerNoOptInError etc.) log via pino and do NOT infinitely retry (rethrow only transient errors) — mirror how provision-studio classifies terminal vs transient.
    In `services/hq-worker/src/index.ts`: add `"hq-owner-send"` to the createQueue loop array; after the provision-studio registration add:
    ```typescript
    const wabaClient = (env.HQ_WABA_PHONE_NUMBER_ID && env.HQ_WABA_API_TOKEN)
      ? createHqWabaClient(env.HQ_WABA_PHONE_NUMBER_ID, env.HQ_WABA_API_TOKEN)
      : mockHqWabaClient;  // deferred-on-external-dependency (D-13): mock until Meta WABA registered
    await registerOwnerSend(boss, wabaClient);
    log.info("[hq-worker] hq-owner-send queue registered");
    ```
    Add `HQ_WABA_PHONE_NUMBER_ID` and `HQ_WABA_API_TOKEN` as OPTIONAL env fields in services/hq-worker/src/lib/env.ts (so absence falls back to mock cleanly — no boot failure). Note in a comment that these are set by the operator AFTER Meta WABA registration (manual external step).
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq-worker exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `services/hq-worker/src/queues/hq-owner-send.ts` exports `registerOwnerSend` and calls `sendOwnerMessage`
    - `services/hq-worker/src/index.ts` contains `"hq-owner-send"` in the createQueue list AND `registerOwnerSend(boss,`
    - index.ts falls back to `mockHqWabaClient` when WABA env vars are absent (deferred-on-external-dependency)
    - `pnpm -F @gymos/hq-worker exec tsc --noEmit` exits 0
    - `pnpm guard:hqd-no-worker-import` exits 0 (no services/worker import introduced)
  </acceptance_criteria>
  <done>hq-owner-send queue is registered in the worker, drives sendOwnerMessage, and uses the mock WABA client until the operator sets HQ WABA creds.</done>
</task>

</tasks>

<verification>
- `pnpm -F @gymos/hq test --run` green (send-owner-whatsapp schema exclusion).
- `pnpm -F @gymos/hq-worker exec tsc --noEmit` clean; `pnpm guard:hqd-no-worker-import` passes.
- `pnpm guard:hq-fork-boundary` passes (agent-chat copy-out, if any, recorded in MODIFICATIONS.md).
- Live owner sends: DEFERRED-ON-EXTERNAL-DEPENDENCY (D-13) — the queue runs the mock client until the operator completes Meta WABA second-phone-number registration + template approval and sets HQ_WABA_* env. No live send walkthrough in this plan.
</verification>

<success_criteria>
- HQD-02: the dispatcher agent can request an owner send through an action whose schema structurally excludes member targets/PII.
- HQD-03: that send routes through the BD3-03 gated chokepoint via the hq-owner-send queue.
- System-prompt constraint reinforces operator-comms boundary (defense in depth).
</success_criteria>

<output>
After completion, create `.planning/phases/BD3-hq-brain-dispatcher/BD3-04-SUMMARY.md`
</output>
