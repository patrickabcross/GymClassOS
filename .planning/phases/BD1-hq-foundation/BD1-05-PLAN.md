---
phase: BD1-hq-foundation
plan: 05
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md
autonomous: true
requirements: [HQ-FND-03]
user_setup: []

must_haves:
  truths:
    - "The exact Anthropic SDK invocation path inside createAgentChatPlugin (and its delegate runAgentLoop) is located and documented"
    - "The precise interception point where input_tokens/output_tokens are available is named with file + function + line-anchored quote"
    - "A wrapper-insertion spec exists that BD2 TEL-01 can implement WITHOUT re-auditing the framework, respecting the fork boundary (no in-place edit of @agent-native/core)"
    - "No token wiring is added in BD1 — this plan produces a SPEC only"
  artifacts:
    - path: ".planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md"
      provides: "Anthropic call-site audit + token-usage wrapper insertion spec for BD2 TEL-01"
      min_lines: 60
  key_links:
    - from: "BD1-ANTHROPIC-AUDIT.md"
      to: "packages/core/src/agent/production-agent.ts (runAgentLoop usage accumulation)"
      via: "documented interception point"
      pattern: "runAgentLoop|production-agent"
---

<objective>
Audit the Anthropic SDK call-site inside `createAgentChatPlugin` (in `@agent-native/core`) and produce a precise token-usage wrapper-insertion spec. This is the hard prerequisite that BD2 TEL-01 consumes — a concrete deliverable, not a nice-to-have. No token capture is wired in BD1.

Purpose: TEL-01 (BD2) must capture per-studio input+output tokens at the Anthropic call-site with zero prompt/response content retained. Because the call-site lives in the vendored, fork-boundary-protected `@agent-native/core` package (NEVER edited in place), the spec must identify both (a) where tokens are produced and (b) a fork-safe interception seam at the app/plugin boundary that does not require modifying core.
Output: `.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md
@.planning/research/SUMMARY.md
@CLAUDE.md
@AGENTS.md

<read_first>
Bounding decision (BD1-CONTEXT.md D-16): Locate the exact Anthropic SDK invocation inside createAgentChatPlugin where `response.usage.input_tokens`/`output_tokens` are available. Document a wrapper insertion spec (file, function, interception point). TEL-01 wires the per-studio token-usage capture in BD2. NO token wiring in BD1.

Research context (.planning/research/SUMMARY.md): "apps/staff-web/server/lib/anthropic.ts (new): wraps anthropic.messages.create; intercepts response.usage.*; calls accumulator on studio_telemetry_state singleton; exact call-site needs BD1 audit of createAgentChatPlugin internals." The research's assumed shape (an `anthropic.messages.create` wrapper) is a HYPOTHESIS — the audit must confirm or CORRECT it against the actual code.

PRE-AUDIT FINDINGS (the planner already located the call-site; the executor must VERIFY against current source, capture exact current line numbers — they drift, so re-grep — and write them into the audit doc):
1. `createAgentChatPlugin` is defined in `packages/core/src/server/agent-chat-plugin.ts` (planner saw it near line 2948). It delegates the agent run loop to `runAgentLoop`.
2. The Anthropic token counts are accumulated inside `runAgentLoop` in `packages/core/src/agent/production-agent.ts`. The loop consumes an engine event stream; the usage branch (planner saw it near lines 1397-1401) increments usage.inputTokens / usage.outputTokens / usage.cacheReadTokens / usage.cacheWriteTokens from `event.type === "usage"`. `runAgentLoop` RETURNS the accumulated `AgentLoopUsage` ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, model }).
3. The actual provider HTTP call is NOT a direct `anthropic.messages.create` in the plugin — it goes through `engine.stream(streamOpts)` (an AgentEngine abstraction). There IS a direct `fetch("https://api.anthropic.com/v1/messages", ...)` in agent-chat-plugin.ts (planner saw it near line 5499) but that is the TITLE-GENERATION path (claude-haiku, max_tokens 30), NOT the main chat run — record it as a secondary, low-volume call-site.
4. The CONSUMER seam: agent-chat-plugin.ts imports and calls `recordUsage` (from `../usage/store.js`) after the run completes (planner saw calls near lines 2399 and 2654, passing inputTokens/outputTokens/orgId/label). This `recordUsage` call is the most promising fork-safe interception seam because it already receives the final per-run token totals plus the resolved owner/org.

Fork boundary (CLAUDE.md / AGENTS.md): `@agent-native/core` is vendored and NEVER edited in place. The spec's recommended interception MUST be implementable from the app side (apps/staff-web for TEL-01) — e.g. via a wrapper module, a plugin-level hook/callback if createAgentChatPlugin exposes one, or by decorating recordUsage — NOT by patching core. If createAgentChatPlugin exposes NO suitable hook, the spec must say so explicitly and propose the least-invasive fork-safe option (and flag that BD2 may need a tiny upstream-able core hook as a documented deviation/fallback).

Constraints: This is a READ-ONLY audit. Do NOT modify any source file. The ONLY file this plan creates is the audit markdown. No dev server (doc-only).
</read_first>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify and pin the Anthropic call-site + usage accumulation</name>
  <read_first>packages/core/src/server/agent-chat-plugin.ts (grep: createAgentChatPlugin, runAgentLoop, recordUsage, anthropic.com), packages/core/src/agent/production-agent.ts (grep: runAgentLoop, the "usage" event branch, AgentLoopUsage, "return usage"), packages/core/src/usage/store.ts (recordUsage signature)</read_first>
  <files>.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md</files>
  <action>
Re-grep the source to confirm the PRE-AUDIT FINDINGS against CURRENT code and capture exact current line numbers (they will have drifted). For each of the four findings, record in the audit doc:
- File path, enclosing function/symbol name, current line number(s), and a short verbatim code quote (the load-bearing 1-5 lines only — the `event.type === "usage"` branch, the `runAgentLoop` return, and each `recordUsage(...)` call's argument shape).
- Confirm whether the main chat run reaches the provider via `engine.stream(...)` (AgentEngine abstraction) vs a direct `anthropic.messages.create` / `fetch`. Document the engine indirection explicitly so BD2 does not wrongly try to wrap `messages.create`.
- Document the title-generation `fetch("https://api.anthropic.com/v1/messages")` path as a SECONDARY call-site (low token volume, max_tokens 30) and state whether TEL-01 should include it (recommendation: capture the main run; the title path is per-thread and tiny — optionally includable).
- Capture the exact shape of `AgentLoopUsage` and the exact argument object passed to `recordUsage` (field names: inputTokens, outputTokens, orgId, label, etc.) by reading the recordUsage signature in packages/core/src/usage/store.ts.
  </action>
  <verify>
    <automated>grep -q "production-agent.ts" .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md && grep -q "runAgentLoop" .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md && grep -qi "recordUsage" .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md && echo ok</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md` exists and names `packages/core/src/agent/production-agent.ts`, `runAgentLoop`, and `recordUsage` (all three grep-hittable).
    - The doc includes current (re-grepped) line numbers for the usage-event branch, the runAgentLoop return, and at least one recordUsage call.
    - The doc explicitly states the main run uses `engine.stream(...)` (NOT a direct anthropic.messages.create) and documents the title-gen fetch as a secondary call-site.
    - The doc records the `recordUsage` argument field names found in usage/store.ts.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Write the fork-safe wrapper-insertion spec for BD2 TEL-01</name>
  <read_first>Task 1's findings in BD1-ANTHROPIC-AUDIT.md; the createAgentChatPlugin options type (grep its parameter type — does it expose an onUsage/onRunComplete/usageLabel/recordUsage-injection hook?); apps/staff-web/server/plugins/agent-chat.ts (how staff-web instantiates createAgentChatPlugin — the seam TEL-01 will extend)</read_first>
  <files>.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md</files>
  <action>
Append a "Wrapper Insertion Spec (BD2 TEL-01 input)" section to the audit doc. It MUST give BD2 an executable recipe WITHOUT re-auditing core, and MUST respect the fork boundary. Include:
- INTERCEPTION POINT: the single recommended seam, named precisely (file + function + the exact value to read). Evaluate these candidates and pick one with justification:
  (a) the per-run totals returned by `runAgentLoop` / passed to `recordUsage` (preferred if reachable from the app side),
  (b) a createAgentChatPlugin option hook if one exists (grep the options type to confirm),
  (c) a new thin `apps/staff-web/server/lib/anthropic.ts` wrapper IF AND ONLY IF the main run actually goes through a wrappable anthropic client (the engine indirection likely makes this NOT viable for the main run — say so).
- WHY FORK-SAFE: explain how the chosen seam avoids editing packages/core (app-side wrapper / plugin option / decoration). If NO clean app-side seam exists, state that plainly and recommend the minimal fallback (a small core hook that should be contributed upstream), explicitly flagging it as a fork-boundary deviation requiring sign-off.
- DATA TO CAPTURE: input_tokens + output_tokens (and optionally cacheRead/cacheWrite) per run, attributed to the studio. Explicitly state NO prompt/response content, NO message text, NO session/thread identifiers beyond what aggregation needs — to keep TEL-01 PII-free (the ai_token_usage studio table stores counts only).
- ACCUMULATOR TARGET: note that BD2 writes these into a studio-side `studio_telemetry_state` singleton (per research) — this audit does NOT create it; it only specifies what feeds it.
- OPEN QUESTIONS / RISKS: list anything BD2 must verify at implementation time (e.g. whether streaming usage events fire on aborted runs, whether the title-gen path needs separate capture, whether cache tokens count toward billing).
  </action>
  <verify>
    <automated>grep -qi "Wrapper Insertion Spec" .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md && grep -qi "fork" .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md && grep -qi "no prompt\|no content\|PII-free\|counts only" .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md && echo ok</automated>
  </verify>
  <acceptance_criteria>
    - The audit doc contains a "Wrapper Insertion Spec (BD2 TEL-01 input)" section (grep hit).
    - The spec names ONE recommended interception seam with file + function + the exact value to read, and justifies why it is fork-safe (no in-place edit of packages/core), or explicitly flags a core-hook fallback as a deviation requiring sign-off.
    - The spec states the data captured is counts only (input_tokens + output_tokens), with NO prompt/response content and no PII (grep: "no prompt"/"counts only"/"PII-free" hits).
    - The spec names `studio_telemetry_state` as the BD2 accumulator target and lists at least one open question/risk for BD2.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md` exists with: (1) verified call-site findings (file/function/line + verbatim quotes) and (2) a fork-safe wrapper-insertion spec.
- The interception point is named precisely enough that BD2 TEL-01 can implement without re-auditing core.
- The spec respects the fork boundary (app-side seam preferred; any core hook explicitly flagged).
- No source file was modified (read-only audit) — `git status --porcelain` shows only the new audit doc under .planning/.
</verification>

<success_criteria>
HQ-FND prerequisite satisfied: the Anthropic call-site is audited and a concrete, fork-safe token-usage wrapper-insertion spec exists. This unblocks BD2 TEL-01 (no token wiring done in BD1, by design).
</success_criteria>

<output>
After completion, create `.planning/phases/BD1-hq-foundation/BD1-05-SUMMARY.md`
</output>
