---
phase: quick-260609-fcm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/suggest-template-vars.ts
  - apps/staff-web/app/components/gymos/TemplatesDialog.tsx
  - apps/staff-web/app/routes/gymos.inbox.tsx
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [QUICK-260609-FCM]
must_haves:
  truths:
    - "Selecting an approved template with >=1 variable automatically kicks off an AI fill (no button click)"
    - "While the agent reasons, an inline 'Filling with AI…' indicator shows in the variable form area"
    - "When the agent returns, variable inputs the coach has NOT yet edited are populated with suggested values"
    - "Variable inputs the coach already typed into are NOT overwritten by the AI suggestion"
    - "The coach can still review/edit every value and must click Send manually — nothing auto-sends"
    - "The fill fires exactly once per (conversationId, templateName) per dialog session"
  artifacts:
    - path: "apps/staff-web/actions/suggest-template-vars.ts"
      provides: "Write-back action that stores AI-suggested vars into application_state (NO LLM call)"
      contains: "writeAppState"
    - path: "apps/staff-web/app/components/gymos/TemplatesDialog.tsx"
      provides: "Auto-fill trigger + poll + merge + inline indicator; new memberContext prop"
      contains: "sendToAgentChat"
    - path: "apps/staff-web/app/routes/gymos.inbox.tsx"
      provides: "memberContext assembled from loader data and passed to TemplatesDialog"
      contains: "memberContext"
    - path: "apps/staff-web/server/plugins/agent-chat.ts"
      provides: "suggest-template-vars named in the agent tool list with mapping guidance"
      contains: "suggest-template-vars"
  key_links:
    - from: "TemplatesDialog.tsx (template select)"
      to: "agent chat"
      via: "sendToAgentChat({submit:true, background:true, newTab:true, openSidebar:false})"
      pattern: "sendToAgentChat"
    - from: "agent chat loop"
      to: "application_state gymos-template-vars-<conv>-<template>"
      via: "suggest-template-vars action -> writeAppState"
      pattern: "writeAppState"
    - from: "TemplatesDialog.tsx (poll)"
      to: "application_state key"
      via: "GET /_agent-native/application-state/:key, value under payload.value"
      pattern: "application-state"
---

<objective>
Add AI auto-fill of WhatsApp template variables in the staff-web inbox TemplatesDialog. When a coach selects an approved template that has at least one `{{N}}` variable, the dialog automatically delegates to the agent chat (in a background tab) to map the open conversation's member context onto the template's variable slots. The agent calls a new write-back action that stores its suggestion in `application_state`; the dialog polls that key and merges suggestions into the variable inputs the coach hasn't already edited. The coach reviews/edits and clicks Send — nothing auto-sends.

Purpose: cut the manual typing of every `{{N}}` slot (first name, class name, expiry date, etc.) while keeping the worker compliance chokepoint and human Send-step authoritative.

Output: a new write-back action, an enhanced TemplatesDialog (UI + Application State), updated loader wiring, an updated agent prompt (Instructions), and an updated AGENTS.md actions table — all four agent-native areas (UI / Action / Instructions / Application State) covered per the adding-a-feature skill.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@./apps/staff-web/AGENTS.md

# EXACT PRECEDENT — copy the readRequest/clearRequest helpers, the dispatched-ref
# idempotency pattern, and the sendToAgentChat options from this file:
@./templates/clips/app/hooks/use-auto-title.ts

# The component to modify (read fully before editing):
@./apps/staff-web/app/components/gymos/TemplatesDialog.tsx

# The loader + mount site (TemplatesDialog rendered ~line 889; loader builds
# selectedMember/memberStats/upcomingBooking ~lines 224-333):
@./apps/staff-web/app/routes/gymos.inbox.tsx

# The agent system prompt + tool list (tool bullets at lines 29-42):
@./apps/staff-web/server/plugins/agent-chat.ts

<interfaces>
<!-- Contracts the executor needs — use these directly, no exploration required. -->

Framework client imports (from "@agent-native/core/client"):
  sendToAgentChat(opts: { message: string; context?: string; submit?: boolean;
      openSidebar?: boolean; newTab?: boolean; background?: boolean }): void
  agentNativePath(path: string): string   // prefixes the framework base path

Server-side application_state write (from "@agent-native/core/application-state"):
  writeAppState(key: string, value: unknown): Promise<void>
  // (clips actions import { writeAppState } from "@agent-native/core/application-state")

Application_state READ (HTTP, mirror clips use-auto-title.ts readRequest):
  GET  agentNativePath(`/_agent-native/application-state/${encodeURIComponent(key)}`)
       -> JSON; the stored value is wrapped under payload.value (fall back to payload)
  DELETE same url  -> clears the key

defineAction shape (from "@agent-native/core" — see upsert-section-note.ts):
  export default defineAction({ description, schema: z.object({...}), run: async (params) => {...} })
  // mutations: NO `http` key. DB access: import { getDb, schema } from "../server/db/index.js"

TemplatesDialog CURRENT props (TemplatesDialog.tsx lines 61-65):
  { conversationId: string; templates: TemplateRow[]; hasOptIn: boolean }
TemplatesDialog already has: extractVariables(componentsJson) -> sorted string[] of {{N}} numbers;
  getBodyText(componentsJson) -> body text; `vars` state Record<string,string>;
  selected (TemplateRow|null); selectedName; handleSelect(name,status).

Loader data available to assemble memberContext (gymos.inbox.tsx):
  data.selectedMember: { firstName, lastName, phoneE164, goal?, activityLevel? }
  data.memberStats: { passBalance, passProduct, passExpiresAt, lifetimeBookings,
                      todayKcal, todayProtein, todayFoodCount }
  data.upcomingBooking: { className, startsAt } | undefined
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create the suggest-template-vars write-back action (Action + Application State areas)</name>
  <files>apps/staff-web/actions/suggest-template-vars.ts</files>
  <action>
Create a NEW action file `apps/staff-web/actions/suggest-template-vars.ts` using `defineAction` from `@agent-native/core`, mirroring the shape of `apps/staff-web/actions/upsert-section-note.ts`.

CRITICAL (framework_constraint): this action is a PURE write-back tool. It MUST NOT call any LLM / Anthropic / fetch-to-model. The agent's chat loop does the reasoning and calls THIS action with the already-computed `vars`.

Imports:
  import { z } from "zod";
  import { defineAction } from "@agent-native/core";
  import { writeAppState } from "@agent-native/core/application-state";

Schema (z.object):
  - conversationId: z.string() — the inbox conversation the dialog is open on
  - templateName: z.string() — the WhatsApp template the coach selected
  - vars: z.record(z.string(), z.string()) — map of variable slot number ("1","2",...) to suggested value

description (agent-facing): explain it writes suggested WhatsApp template variable values back to the staff inbox so the coach can review/edit them before sending. Make clear the coach must still review and Send; this does NOT send anything.

run: async ({ conversationId, templateName, vars }) => {
  const key = `gymos-template-vars-${conversationId}-${templateName}`;
  // guard:allow-unscoped — single-tenant gym deploy; application_state is framework-scoped, no ownable gym table touched
  await writeAppState(key, JSON.stringify(vars));
  return { ok: true, key, count: Object.keys(vars).length };
}

NO `http` key (it's a mutation). Run `npx prettier --write apps/staff-web/actions/suggest-template-vars.ts` after writing.

NOTE FOR SUMMARY (manual step, not runtime-verifiable here): adding a new action requires a dev-server restart to regenerate `.generated/actions-registry.js` before the agent can call it — the executor cannot verify the live tool registration from CLI.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p apps/staff-web/tsconfig.json 2>&1 | Select-String "suggest-template-vars" ; if ($LASTEXITCODE -eq 0 -or $true) { Get-Content apps/staff-web/actions/suggest-template-vars.ts | Select-String "writeAppState","defineAction","guard:allow-unscoped" }</automated>
  </verify>
  <done>File exists, exports a defineAction with the three-field schema, writes `gymos-template-vars-${conversationId}-${templateName}` via writeAppState, contains the guard:allow-unscoped marker, and contains NO LLM/model call. Prettier-clean.</done>
</task>

<task type="auto">
  <name>Task 2: Auto-fill trigger + poll + merge + inline indicator in TemplatesDialog (UI + Application State areas)</name>
  <files>apps/staff-web/app/components/gymos/TemplatesDialog.tsx</files>
  <action>
Modify `apps/staff-web/app/components/gymos/TemplatesDialog.tsx`.

1. Imports: add `useRef` to the existing react import; add
   `import { sendToAgentChat, agentNativePath } from "@agent-native/core/client";`
   Add a Tabler MESSAGE/robot-style icon for the indicator, e.g. `IconMessageChatbot` — append it to the existing `@tabler/icons-react` import. (Per conventions: NO sparkle/wand/emoji icons.)

2. Props: extend `TemplatesDialogProps` with an optional
   `memberContext?: Record<string, unknown>;`
   and accept it in the component signature. (Loader wires it in Task 3; keep optional so the component compiles standalone.)

3. State: add
   `const [filling, setFilling] = useState(false);`
   `const dispatched = useRef<Set<string>>(new Set());`

4. Helpers (module scope, mirror clips use-auto-title.ts readRequest/clearRequest exactly — the stored value is under payload.value):
   - `stateKey(conversationId, templateName)` -> `gymos-template-vars-${conversationId}-${templateName}`
   - `readVars(key)`: GET agentNativePath(`/_agent-native/application-state/${encodeURIComponent(key)}`); on res.ok parse JSON; `const value = payload?.value ?? payload;` then JSON.parse(value) if it's a string; return the Record<string,string> or null on any failure.
   - `clearVars(key)`: DELETE the same url, catch-swallow.

5. Auto-fill trigger — in `handleSelect(name, status)` (after the existing `setSelectedName(name); setVars({});`), OR in a `useEffect` keyed on `[selectedName]`: when a template is newly selected AND `status === "approved"` AND it has `>= 1` variable (use the existing `extractVariables` on the selected template's componentsJson) AND `memberContext` is provided:
   - Build a once-per key `const dispatchKey = `${conversationId}:${name}``; if `dispatched.current.has(dispatchKey)` return; else add it (idempotency, mirroring use-auto-title.ts).
   - `setFilling(true);`
   - Call sendToAgentChat with the SAME background options as the clips precedent:
       sendToAgentChat({
         message: "Auto-fill the WhatsApp template variables for the open conversation. Map each {{N}} slot to the right value from the member context and template body, then call the suggest-template-vars action with conversationId, templateName, and a vars map ({\"1\":\"...\"}). Do NOT send anything — the coach reviews and sends.",
         context: JSON.stringify({
           conversationId,
           templateName: name,
           templateBody: getBodyText(selectedTemplate.componentsJson),
           variableSlots: extractVariables(selectedTemplate.componentsJson),
           memberContext,
         }),
         submit: true,
         openSidebar: false,
         newTab: true,
         background: true,
       });
     (Resolve `selectedTemplate` from `templates.find(t => t.name === name)`.)

6. Poll for the result — a `useEffect` that runs while `filling` is true and a template is selected: setInterval(~2500ms) calling readVars(stateKey(conversationId, selectedName)). When it returns a non-null map:
   - MERGE into `vars` ONLY for slots the coach hasn't edited: `setVars(prev => { const next = {...prev}; for (const [k,v] of Object.entries(incoming)) { if (!(next[k] && next[k].trim().length > 0)) next[k] = v; } return next; });`  (Do NOT clobber typed input.)
   - `setFilling(false);`
   - `void clearVars(key);`  (so it doesn't re-fire on next open)
   - clearInterval. Always clear the interval in the effect cleanup. Cancel-guard with a local `cancelled` flag like use-auto-title.ts.

7. Inline indicator — in the right pane, when `filling` is true, render a small inline row near the variable inputs:
   `{filling && (<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><IconMessageChatbot size={13} aria-hidden className="animate-pulse" />Filling with AI…</div>)}`
   Keep it minimal — NO new buttons, NO toolbar, NO extra panels (UX-minimal convention).

8. Reset: in `resetState()` add `setFilling(false);` and DELETE the dispatched key on close so reopening can re-fire (e.g. in handleOpenChange when closing, `dispatched.current.clear();` and clearVars for the current selection if any). Selecting a DIFFERENT template in the same session should still fire (the dispatchKey includes templateName, so that already works).

Do NOT touch the existing send/sync fetchers, the worker chokepoint, or `canSend`. Auto-send is forbidden. Run `npx prettier --write apps/staff-web/app/components/gymos/TemplatesDialog.tsx`.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p apps/staff-web/tsconfig.json 2>&1 | Select-String "TemplatesDialog" ; Get-Content apps/staff-web/app/components/gymos/TemplatesDialog.tsx | Select-String "sendToAgentChat","background: true","Filling with AI","memberContext","dispatched"</automated>
  </verify>
  <done>TemplatesDialog compiles; on selecting an approved template with >=1 var it fires sendToAgentChat exactly once per (conversationId, templateName) with background:true/newTab:true/openSidebar:false; polls the application_state key; merges suggested vars only into non-edited slots; shows an inline "Filling with AI…" message-style indicator while waiting and clears it on arrival; no auto-send; no new buttons.</done>
</task>

<task type="auto">
  <name>Task 3: Wire memberContext from loader + name the tool in the agent prompt + document it (Instructions area)</name>
  <files>apps/staff-web/app/routes/gymos.inbox.tsx, apps/staff-web/server/plugins/agent-chat.ts, apps/staff-web/AGENTS.md</files>
  <action>
A) apps/staff-web/app/routes/gymos.inbox.tsx — at the `<TemplatesDialog>` mount (~line 889), pass a compact `memberContext` prop assembled INLINE from existing loader data (do NOT add new queries). Build it from `data.selectedMember` / `data.memberStats` / `data.upcomingBooking`, e.g.:

  memberContext={
    data.selectedMember
      ? {
          firstName: data.selectedMember.firstName,
          lastName: data.selectedMember.lastName,
          passBalance: data.memberStats?.passBalance,
          passProduct: data.memberStats?.passProduct,
          passExpiresAt: data.memberStats?.passExpiresAt,
          lifetimeBookings: data.memberStats?.lifetimeBookings,
          nextClassName: data.upcomingBooking?.className,
          nextClassStartsAt: data.upcomingBooking?.startsAt,
        }
      : undefined
  }

Keep the existing conversationId/templates/hasOptIn props unchanged. (Only compact, non-PII-sensitive fields the agent needs to map slots — first name, class name, pass info, dates.)

B) apps/staff-web/server/plugins/agent-chat.ts — add ONE bullet to the "Available tools" list (after the existing tool bullets, ~line 41), naming the new tool so the LLM will call it (per the documented "system prompt as tool gate" pattern):

  - suggest-template-vars — fill in a WhatsApp template's {{N}} variables for the open inbox conversation, then write them back for the coach to review. When asked to auto-fill template variables, map each {{N}} placeholder using the provided template body text and member context: {{1}} is usually the member's first name; infer the others from the words immediately around each placeholder in the body (e.g. a class name, a date, a pass/credit count). Pass conversationId, templateName, and a vars map (e.g. {"1":"Sarah","2":"Reformer Pilates"}). This does NOT send the message — the coach reviews and sends.

Do not change any other prompt text or the gym/compliance language.

C) apps/staff-web/AGENTS.md — add ONE row to the "Agent Actions (LLM tools)" table (after the propose-action / approve-proposal rows). Tier "—" (LLM-callable helper):

  | `suggest-template-vars` | — | Auto-fill a WhatsApp template's {{N}} variables from open-conversation member context; writes the suggestion to application_state for the inbox TemplatesDialog to merge in. Does NOT send. | `{ok, key, count}` |

Run `npx prettier --write apps/staff-web/app/routes/gymos.inbox.tsx apps/staff-web/server/plugins/agent-chat.ts`. (AGENTS.md is markdown — prettier optional but fine.)
  </action>
  <verify>
    <automated>npx tsc --noEmit -p apps/staff-web/tsconfig.json 2>&1 | Select-String "gymos.inbox" ; Get-Content apps/staff-web/app/routes/gymos.inbox.tsx | Select-String "memberContext" ; Get-Content apps/staff-web/server/plugins/agent-chat.ts | Select-String "suggest-template-vars" ; Get-Content apps/staff-web/AGENTS.md | Select-String "suggest-template-vars"</automated>
  </verify>
  <done>Loader passes a compact memberContext to TemplatesDialog; suggest-template-vars is named in the agent tool list with mapping guidance ({{1}}=first name, infer rest from surrounding body text); AGENTS.md actions table has the new row. tsc clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/staff-web/tsconfig.json` reports no NEW errors in the four touched files.
- suggest-template-vars.ts contains NO LLM/model call (pure writeAppState write-back) — grep confirms only writeAppState + defineAction.
- TemplatesDialog: sendToAgentChat fired with background:true/newTab:true/openSidebar:false; once-per (conversationId, templateName) via dispatched ref; merge guard preserves coach-typed slots; inline "Filling with AI…" indicator; NO auto-send (handleSend/canSend untouched).
- All four agent-native areas updated: UI (TemplatesDialog), Action (suggest-template-vars), Instructions (agent-chat.ts + AGENTS.md), Application State (the gymos-template-vars-* key read/write).
- Prettier run on all changed .ts/.tsx files.
</verification>

<success_criteria>
- Selecting an approved template with >=1 variable auto-starts an AI fill (no button), shows "Filling with AI…", and populates non-edited variable slots when the agent returns.
- Coach-typed values are never overwritten; the coach must click Send manually; nothing auto-sends (worker chokepoint + human Send-step intact).
- The new action is a pure write-back tool (no LLM); the agent does the reasoning per Six Rules #2 / delegate-to-agent.
- Tool is named in the prompt and documented in AGENTS.md.
- Dev-server restart to regenerate `.generated` is noted as a manual post-step in the SUMMARY (not runtime-verifiable from CLI).
</success_criteria>

<output>
After completion, create `.planning/quick/260609-fcm-ai-auto-fill-of-whatsapp-template-variab/260609-fcm-SUMMARY.md`
</output>
