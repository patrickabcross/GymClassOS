# BD1 Anthropic Call-Site Audit

**Produced by:** BD1-05 execution  
**Date:** 2026-06-19  
**Purpose:** Confirm the exact Anthropic SDK interception point inside `createAgentChatPlugin` and document a fork-safe token-usage wrapper-insertion spec for BD2 TEL-01.  
**Status:** READ-ONLY audit — no source files were modified.

---

## Part 1 — Verified Call-Site Findings

### 1.1 AgentLoopUsage Type Definition

**File:** `packages/core/src/agent/production-agent.ts`  
**Lines:** 934–941  
**Symbol:** `AgentLoopUsage` (exported interface)

```typescript
/** Accumulated token usage from an agent loop run */
export interface AgentLoopUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
}
```

`model` was confirmed present in the interface — the planner's description was accurate. All four token fields are live.

---

### 1.2 Token Accumulation Inside `runAgentLoop`

**File:** `packages/core/src/agent/production-agent.ts`  
**Function:** `runAgentLoop` (exported async function, starts at line 1258)  
**Return type:** `Promise<AgentLoopUsage>` (line 1274)

**Accumulator initialisation (lines 1286–1292):**

```typescript
const usage: AgentLoopUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  model,
};
```

**Usage event branch (lines 1397–1401):**

```typescript
} else if (event.type === "usage") {
  usage.inputTokens += event.inputTokens;
  usage.outputTokens += event.outputTokens;
  usage.cacheReadTokens += event.cacheReadTokens ?? 0;
  usage.cacheWriteTokens += event.cacheWriteTokens ?? 0;
}
```

These events arrive from `engine.stream(streamOpts)` (line 1342 — see §1.3 below). Usage events are accumulated per iteration of the tool-calling loop; the loop keeps calling `engine.stream()` until a non-tool-call final answer arrives or `maxIterations` is exceeded.

**Return statement (line 1795):**

```typescript
return usage;
```

`runAgentLoop` returns the *fully accumulated* totals across all LLM iterations in the run — not per-call.

---

### 1.3 Provider Call-Site: AgentEngine Abstraction (NOT a direct `messages.create`)

**File:** `packages/core/src/agent/production-agent.ts`  
**Line:** 1342

```typescript
const eventStream = engine.stream(streamOpts);
```

**`engine` type:** `AgentEngine` — defined in `packages/core/src/agent/engine/types.ts` (lines 248–265):

```typescript
export interface AgentEngine {
  readonly name: string;
  readonly label: string;
  readonly defaultModel: string;
  readonly supportedModels: readonly string[];
  readonly capabilities: EngineCapabilities;
  stream(opts: EngineStreamOptions): AsyncIterable<EngineEvent>;
}
```

The `engine.stream()` call is the ONLY path through which the main chat run reaches Anthropic (or any other LLM provider). There is NO direct `anthropic.messages.create` or `new Anthropic().messages.stream()` call in the main agent loop. The `AgentEngine` interface is the adapter; the concrete Anthropic implementation lives inside `packages/core` and is opaque from the app side.

**BD2 implication:** Wrapping `anthropic.messages.create` at the Anthropic SDK level is NOT viable for the main chat run. Any wrapper approach must intercept at the framework level, not the HTTP level. See Part 2.

---

### 1.4 `recordUsage` Call-Site Inside `createProductionAgentHandler`

**File:** `packages/core/src/agent/production-agent.ts`  
**Function:** `createProductionAgentHandler` (exported function, starts at line 1798)  
**Lines:** 2641–2667 (inside the run executor closure)

```typescript
// Record token usage for cost monitoring so the Usage panel in
// settings works in every mode, including local dev.
try {
  const ownerEmail = options.resolveOwnerEmail
    ? await options.resolveOwnerEmail(event)
    : getRequestUserEmail();
  if (
    ownerEmail &&
    (loopUsage.inputTokens > 0 ||
      loopUsage.outputTokens > 0 ||
      loopUsage.cacheReadTokens > 0 ||
      loopUsage.cacheWriteTokens > 0)
  ) {
    const { recordUsage } = await import("../usage/store.js");
    await recordUsage({
      ownerEmail,
      inputTokens: loopUsage.inputTokens,
      outputTokens: loopUsage.outputTokens,
      cacheReadTokens: loopUsage.cacheReadTokens,
      cacheWriteTokens: loopUsage.cacheWriteTokens,
      model: loopUsage.model,
      label: body.usageLabel || "chat",
    });
  }
} catch {
  // Usage recording failed — don't break the run
}
```

**Key facts confirmed:**
- `recordUsage` is called inside `createProductionAgentHandler`, NOT inside `createAgentChatPlugin`.
- `createAgentChatPlugin` wraps `createProductionAgentHandler` internally; the plugin has no direct `recordUsage` import.
- The call passes `{ ownerEmail, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, model, label }` — matching the `UsageRecord` interface exactly.

---

### 1.5 `recordUsage` Signature in `packages/core/src/usage/store.ts`

**File:** `packages/core/src/usage/store.ts`  
**Lines:** 192–213

```typescript
export interface UsageRecord {
  ownerEmail: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model: string;
  /** Category for this call — e.g. "chat", "automation", "job", "custom-agent". */
  label?: string;
  /** Optional template/app name (e.g. "mail"). Falls back to AGENT_APP / APP_NAME env. */
  app?: string;
}

export async function recordUsage(record: UsageRecord): Promise<void>;
export async function recordUsage(
  ownerEmail: string,
  inputTokens: number,
  outputTokens: number,
  model: string,
): Promise<void>;
```

The object overload (`UsageRecord`) is the current call-site shape used by `createProductionAgentHandler`. The `app` field defaults to `process.env.AGENT_APP ?? process.env.APP_NAME ?? ""` inside the function body.

`recordUsage` writes to a `token_usage` table in the *studio's* Neon DB (the same DB the studio app connects to). This is per-studio local storage — it is NOT HQ-visible without telemetry push (TEL-01's job).

---

### 1.6 Secondary Call-Site: Title-Generation `fetch` to `api.anthropic.com`

**File:** `packages/core/src/server/agent-chat-plugin.ts`  
**Line:** 5499

```typescript
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 30,
    messages: [/* 3-6 word title generation prompt */],
  }),
});
```

This is a direct `fetch` call, NOT routed through `engine.stream()`. It fires once per new thread to generate the conversation title. Token volume is trivially small (`max_tokens: 30`) and it does NOT call `recordUsage` — the token cost is not tracked even in the framework's own usage table.

**TEL-01 recommendation:** Capture the main run only. The title-gen path is per-thread, tiny (haiku, 30 tokens max), and structurally separate. If HQ needs title-gen costs attributed, it would require a separate intercept in `agent-chat-plugin.ts` lines 5490–5527; this is low-priority and can be addressed post-launch.

---

### 1.7 `AgentChatPluginOptions`: Hook Audit

**File:** `packages/core/src/server/agent-chat-plugin.ts`  
**Lines:** 1812–2002

A full audit of `AgentChatPluginOptions` confirmed there is NO `onUsage`, `onTokens`, `usageCallback`, or similar hook. The options that exist related to run lifecycle are:

- `onRunComplete?: (run: ActiveRun, threadId: string | undefined) => void` — fires after run, receives the `ActiveRun` object (events, runId, threadId). Does NOT receive token counts.
- `onRunPrepared?` — fires before run, no token context.
- `onRunStart?` — fires at run start, no token context.
- `resolveOrgId?` — org resolution for DB scoping.
- `resolveOwnerEmail` — NOT in `AgentChatPluginOptions` (it IS in `ProductionAgentOptions` which is internal to `createProductionAgentHandler`).

**Conclusion:** `AgentChatPluginOptions` exposes NO hook that delivers per-run token totals to the caller. The `onRunComplete` callback receives the raw `ActiveRun` (an in-memory event buffer), not the `AgentLoopUsage` struct returned by `runAgentLoop`. The `loopUsage` variable is local to the `createProductionAgentHandler` run closure (lines 2615–2667) and is not forwarded to any app-provided callback.

---

## Part 2 — Wrapper Insertion Spec (BD2 TEL-01 Input)

### 2.1 Interception Point Analysis

Three candidate seams evaluated:

| Seam | Viable? | Reason |
|------|---------|--------|
| (a) `recordUsage` in `packages/core/src/usage/store.ts` | YES — preferred | Called after every run with complete token totals; `ownerEmail` is already resolved; can be decorated from the app side via module aliasing or wrapping |
| (b) `AgentChatPluginOptions.onRunComplete` callback | NO | Does not receive token counts (`loopUsage` is not forwarded to the callback) |
| (c) Wrapping `anthropic.messages.create` at the SDK level | NO | The main run uses `engine.stream()` (an `AgentEngine` abstraction), not a direct SDK call. There is no wrappable `Anthropic` client instance visible from the app side for the main chat loop. |

---

### 2.2 Recommended Interception Point

**Seam:** Wrap `packages/core/src/usage/store.ts:recordUsage` at the module level from within `apps/staff-web`.

**How:** Create a thin module in `apps/staff-web/server/lib/telemetry-usage-bridge.ts` that patches the studio-side `token_usage` write to also publish a telemetry snapshot. The bridge runs during server startup (Nitro plugin init), before the first agent run.

There are two practical options for reaching `recordUsage` from the app side:

**Option A: Drizzle trigger / DB-level intercept (PREFERRED for fork safety)**

After `recordUsage` inserts a row into the studio's `token_usage` table, a Postgres `AFTER INSERT` trigger (or a Drizzle extension on the studio DB) fires a `NOTIFY` or writes into a `studio_telemetry_pending` table. The studio's pg-boss worker picks up the pending row and pushes a token-count snapshot to HQ via HTTP. This approach:
- Never touches `packages/core`
- Survives upstream merges without rebase
- Is fully additive (new trigger + new table + new pg-boss queue handler in `services/worker`)
- The telemetry row carries `{ input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model, label, created_at }` — no `owner_email`, no message content, no PII

**Option B: ES module shimming via pnpm workspace patch or Node `--require`**

Before the Nitro server starts, intercept the `@agent-native/core` module resolution so `../usage/store.js` resolves to a thin wrapper in `apps/staff-web/server/lib/usage-store-wrapper.ts` that:
1. Calls the original `recordUsage` (pass-through — no behaviour change)
2. Calls a side-channel `enqueueTokenSnapshot(record)` that feeds `studio_telemetry_state`

This option works but carries moderate risk: pnpm patching (`pnpm patch`) or Node `--require` module shimming can be fragile across Nitro/Vite SSR bundling (the bundler may inline the import and bypass the shim). Requires verification at BD2 implementation time.

**BD2 recommendation:** Implement Option A first (DB-level trigger path). It is the cleanest fork-safe mechanism and is compatible with the existing pg-boss + Neon architecture. Fall back to Option B only if the trigger approach adds unacceptable latency or requires infrastructure not available at studio deploy time.

---

### 2.3 Why Fork-Safe

Option A requires zero changes to `packages/core`. The trigger is installed via an additive SQL migration in `apps/staff-web/server/db/migrations/` (or equivalent in `packages/db/`), which already follows the project's `runMigrations` additive-only pattern. The pg-boss queue handler is a new file in `services/worker/src/queues/telemetry-push.ts` — entirely GymClassOS-owned.

Option B, if needed, operates via pnpm patching of `@agent-native/core` (a supported pnpm workspace mechanism). The patch is stored in `.patches/` and applied automatically on `pnpm install`. A patch to `packages/core/src/usage/store.ts` of this form is a small additive shim — no behaviour change, only a side-call. It can be upstreamed to `BuilderIO/agent-native` as a `onUsage` hook PR.

Neither option requires editing the TypeScript source files inside `packages/core/src/` in place.

**If NO clean app-side seam proves viable at BD2:** The fallback is to open a PR to `BuilderIO/agent-native` upstream adding an `onUsage?: (record: UsageRecord) => void` option to `ProductionAgentOptions`. This would expose the token totals to `createAgentChatPlugin` callers cleanly. Until the PR is merged, BD2 can use Option B (pnpm patch) as a local shim that implements the same hook interface so the final migration is a search-and-replace. Flag this as a deviation requiring BD2 sign-off if Options A and B both fail validation.

---

### 2.4 Data to Capture

TEL-01 MUST capture:

| Field | Source | Notes |
|-------|--------|-------|
| `input_tokens` | `loopUsage.inputTokens` / `UsageRecord.inputTokens` | Integer count — no prompt content |
| `output_tokens` | `loopUsage.outputTokens` / `UsageRecord.outputTokens` | Integer count — no response content |
| `cache_read_tokens` | `loopUsage.cacheReadTokens` / `UsageRecord.cacheReadTokens` | Optional; 0 if not used |
| `cache_write_tokens` | `loopUsage.cacheWriteTokens` / `UsageRecord.cacheWriteTokens` | Optional; 0 if not used |
| `model` | `loopUsage.model` / `UsageRecord.model` | e.g. `"claude-sonnet-4-6"` |
| `label` | `UsageRecord.label` | e.g. `"chat"` — run category |
| `created_at` | timestamp at push time | UTC epoch ms |
| studio identifier | deployment env var (e.g. `GYMOS_STUDIO_ID` or Neon project ID) | Attribution key — NOT a `studio_id` DB column |

TEL-01 MUST NOT capture:

- `owner_email` — this is per-user PII; studio-level telemetry is aggregated, not per-user
- Message text, prompt content, response content — zero LLM content retained
- Thread IDs, run IDs, or session identifiers — counts only
- Pass balance, booking data, member records — unrelated

This keeps the HQ `ai_token_usage` table PII-free: `{ studio_id_ref, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model, label, recorded_at }`.

---

### 2.5 Accumulator Target (BD2)

BD2 TEL-01 writes captured counts into `studio_telemetry_state` (a singleton row per studio in the HQ Neon DB — name per the research SUMMARY). This audit does NOT create that table; it only specifies what feeds it.

The push path is:
```
studio token_usage INSERT
  → trigger / shim fires
  → studio worker enqueues telemetry-push job (pg-boss)
  → worker calls HQ telemetry ingest endpoint (HTTP POST, counts only)
  → HQ ingest writes to hq_schema.ai_token_usage
  → HQ Brain/Dispatcher reads aggregated cohort data
```

---

### 2.6 Open Questions / Risks for BD2 to Verify

1. **Aborted runs:** If a user cancels a run mid-stream, the `signal.aborted` path fires (`production-agent.ts:1794`) before `return usage`. The `createProductionAgentHandler` run closure still reaches the `recordUsage` block (line 2643) because the try-catch wraps the whole block — BUT the tokens accumulated up to abort ARE included in `loopUsage`. Verify: does Neon fire the trigger on a partial-token row? Does the stub accumulate correctly on abort?

2. **Title-gen tokens:** The secondary `fetch` at line 5499 does NOT call `recordUsage` and will NOT be captured by Option A's trigger. If HQ needs title-gen attribution, a separate intercept is required. Recommendation: defer; title-gen is negligible volume.

3. **Cache token billing:** Anthropic charges cache write tokens at 125% of input price and cache read at 10%. `calculateCost` in `usage/store.ts` already handles this. Verify HQ's `ai_token_usage` schema stores raw counts (not costs) so HQ can re-price as Anthropic pricing changes.

4. **pnpm workspace bundling (Option B only):** Nitro/Vite SSR bundling may inline the `recordUsage` import from `@agent-native/core`. If the shim is bypassed by the bundler, Option B silently fails. Test with `NODE_DEBUG=module` to confirm interception before relying on Option B.

5. **pg-boss queue at low volume:** The studio `services/worker` already has pg-boss running. The `telemetry-push` queue job adds minimal overhead. Confirm `pg_boss` schema is available in the studio Neon DB (it is — worker bootstrap runs `PgBoss.start()` against the same DB).

6. **HQ ingest endpoint auth:** The studio worker pushes to HQ. This requires a shared secret (studio-to-HQ API key). This secret is NOT per-studio-user PII — it is a server-to-server credential. Plan its provisioning as part of BD2 PROV (the studio deploy receives it during the provisioning saga).

---

## Summary

The Anthropic token-usage data flows as follows in the current framework:

```
User message → createAgentChatPlugin (agent-chat-plugin.ts:2948)
  → createProductionAgentHandler (production-agent.ts:1798)
    → runAgentLoop (production-agent.ts:1258)
      → engine.stream() [AgentEngine abstraction] (production-agent.ts:1342)
        → LLM provider HTTP call (opaque inside engine implementation)
      ← EngineEvent { type: "usage", inputTokens, outputTokens, ... } (production-agent.ts:1397)
      → usage.inputTokens += ... (production-agent.ts:1398-1401)
    ← returns AgentLoopUsage (production-agent.ts:1795)
  → recordUsage({ ownerEmail, inputTokens, outputTokens, ..., label }) (production-agent.ts:2654)
    → INSERT INTO token_usage ... (usage/store.ts:242-258)
```

**BD2 TEL-01 should intercept at the `token_usage` INSERT** (Option A: DB trigger) or at the `recordUsage` function boundary (Option B: pnpm patch / module shim). There is no app-level hook in `AgentChatPluginOptions` or `ProductionAgentOptions` that delivers token totals to callers today — BD2 must work around this or contribute an upstream hook.

No source files were modified during this audit. The only new file produced is this document.
