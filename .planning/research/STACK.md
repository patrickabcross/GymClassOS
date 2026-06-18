# Stack Research — GymClassOS v1.2 Agentic Tab Editing (Write Tools)

**Domain:** Agent write-tool layer for Forms, Schedule, Members tabs in an existing agent-native staff-web
**Researched:** 2026-06-18
**Confidence:** HIGH — all findings are based on direct inspection of the live codebase (actions/, .generated/, server/plugins/, AGENTS.md, skills/). No new dependencies are required; every primitive already exists and is in production use.

> **Scope note.** This file covers ONLY what is needed for v1.2 (adding agent WRITE tools for the three tabs). The base platform stack (React Router v7, Drizzle, Better-auth, Neon, pg-boss, Hono, WhatsApp, Stripe) is decided and locked. The v1.1 theming stack (gymos-tokens, @theme inline, ThemeContext) is also decided. Nothing below revisits those choices.

---

## The Single Most Important Finding

**Zero new dependencies are needed.** Every primitive required for agent write-tools is already in the codebase and in production use. The work is purely additive TypeScript in `apps/staff-web/actions/` — the same pattern already used by `upsert-section-note.ts`, `create-task.ts`, and `suggest-template-vars.ts`. Adding a write tool is a five-step workflow (create action file → regenerate registry → document in AGENTS.md → add to system prompt tool list → wire optimistic UI), all using existing tools.

---

## Existing Primitives to Reuse

### 1. `defineAction` — the only path for all new operations

**File:** `@agent-native/core` (imported in every action)
**Pattern:** Verified by inspecting `apps/staff-web/actions/upsert-section-note.ts`, `suggest-template-vars.ts`, `send-template-to-members.ts`, `propose-action.ts`, `create-task.ts`.

A `defineAction` call does three things simultaneously:
- Registers the action as an LLM tool (name, description, Zod-typed parameters, structured return)
- Auto-exposes it as an HTTP endpoint at `/_agent-native/actions/<action-name>` for the UI to call via `useActionMutation`
- Triggers an automatic UI poll event on completion (non-GET actions cause `useDbSync` to invalidate all `["action"]` React Query keys)

For write tools, omit `http` (default POST) or use `http: { method: "PUT" }` for update semantics. Never set `http: { method: "GET" }` on a mutation — that suppresses the automatic UI refresh.

The Zod `schema` field is required for new actions. It provides runtime validation (400 for HTTP callers, error result for the agent), full TypeScript type inference for `run()` args, and auto-generates the JSON Schema the LLM tool definition uses.

**Concrete write-action template (from production pattern):**

```typescript
// apps/staff-web/actions/update-member.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Update a gym member's profile fields (name, phone_e164, email, notes). " +
    "Does NOT touch whatsapp_opt_in or marketing_consent — those are consent fields, " +
    "never silently changed by the agent. Returns the updated member row.",
  schema: z.object({
    memberId: z.string().min(1).describe("gym_members.id to update"),
    name: z.string().optional().describe("Display name"),
    phoneE164: z.string().optional().describe("Phone in E.164 format"),
    email: z.string().email().optional().describe("Email address"),
    notes: z.string().max(2000).optional().describe("Coach notes"),
  }),
  run: async ({ memberId, name, phoneE164, email, notes }) => {
    const db = getDb();
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (phoneE164 !== undefined) patch.phoneE164 = phoneE164;
    if (email !== undefined) patch.email = email;
    if (notes !== undefined) patch.notes = notes;
    if (Object.keys(patch).length === 0) return { error: "No fields to update" };
    // guard:allow-unscoped — single-tenant gym deploy; gym_members has no ownableColumns()
    await db
      .update(schema.gymMembers)
      .set(patch)
      .where(eq(schema.gymMembers.id, memberId));
    return { updated: true, memberId };
  },
});
```

### 2. `.generated/actions-registry.ts` — the static import registry

**File:** `apps/staff-web/.generated/actions-registry.ts`
**Status:** AUTO-GENERATED. Do not edit manually.

The registry is a flat object mapping every action name (kebab-case string) to its `* as` namespace import. `createAgentChatPlugin` in `agent-chat.ts` calls `loadActionsFromStaticRegistry(actionsRegistry)` to derive the LLM tool list — the registry IS the source of truth for which actions the agent can call. Every new action file must appear here.

**How to trigger regeneration:** In a normal dev flow, the Vite plugin regenerates this file automatically when `actions/` files change. Since local dev server is broken (Nitro/Vite bug per PROJECT.md), regenerate manually by running `pnpm generate` or the equivalent Vite build invocation, then verify the new action name appears in the modules object before deploying.

The companion `.generated/action-types.d.ts` augments the `ActionRegistry` interface in `@agent-native/core/client` so `useActionQuery` and `useActionMutation` infer exact return types — both files regenerate together.

### 3. `createAgentChatPlugin` + `loadActionsFromStaticRegistry` — agent tool wiring

**File:** `apps/staff-web/server/plugins/agent-chat.ts` (entire file is 54 lines)

```typescript
export default createAgentChatPlugin({
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  appId: "gymos",
  resolveOrgId: ...,
  systemPrompt: `...`,
});
```

`loadActionsFromStaticRegistry` normalises each module to an `ActionEntry` shape. An `ActionEntry` requires `description` and `schema` (or `parameters`) from the `defineAction` call. The agent sees EVERY action in the registry as a potential tool — but the system prompt controls which tools it knows to use.

**Critical distinction:** The registry makes a tool technically callable; the system prompt `Available tools:` list is what teaches the agent it exists and how to use it. A new write action that is missing from the system prompt will be technically available but the agent will not know to call it. Both must be updated.

### 4. System prompt tool list — the agent's knowledge of its own tools

**File:** `apps/staff-web/server/plugins/agent-chat.ts`, lines 29–43

The current tool list is a flat bullet list inside the `systemPrompt` string. For v1.2, each new write action needs a bullet with:
- Tool name (exactly matching the action file name in kebab-case)
- One-line description of when to use it (distinct from the action's own `description` which is used for the JSON Schema `description` field)
- Any constraint the agent must know at invocation time (e.g., "does NOT touch whatsapp_opt_in")

The system prompt also needs a per-tab capability section so the agent leads with the right tools based on the active tab (which it already receives via the navigation state block injected into every message).

### 5. `readAppState` / `writeAppState` — application_state read/write

**Imports:** `@agent-native/core/application-state`
**In production use:** `suggest-template-vars.ts` calls `writeAppState(key, vars)` to write template variable suggestions back to the UI; `view-screen.ts` calls `readAppState("navigation")` to see the current tab.

The `navigation` key is written by the UI's `use-navigation-state.ts` hook on every route change. Its shape for the gymos app includes `{ view: "forms" | "schedule" | "members" | "inbox" | ... }` and optionally selected item IDs. The agent already receives navigation state as a `<current-screen>` block injected into every user message (framework behaviour documented in the context-awareness skill), so `view-screen` is only needed for richer per-item data.

For v1.2, the `navigation` key should also carry the active selected item ID (e.g., `formId`, `occurrenceId`, `memberId`) when the user has an item open. The write-action context-awareness additions are:
- Extend the navigation state writer in the UI to include the selected item ID per tab
- Update `view-screen.ts` to fetch the item's current data when that tab/item is active

### 6. Human-in-the-loop: `propose-action` / `approve-proposal` pattern

**Files:** `apps/staff-web/actions/propose-action.ts`, `apps/staff-web/actions/approve-proposal.ts`

The existing propose→approve pattern is already production-hardened. It:
- Inserts a `dashboard_proposals` row with `status='pending'` (the agent calls `propose-action`)
- Renders a one-click card on the noticeboard (the UI reads pending proposals via `useActionQuery`)
- On coach click, `approve-proposal` re-validates stored params against the target action's own Zod schema, then calls `run()` directly

**The `ACTION_ALLOWLIST` in `approve-proposal.ts` must be extended** for any v1.2 write action that goes through the propose→approve path (currently `["send-template-to-members", "create-checkout-link"]`). Extending the allowlist is a one-line edit.

**Decision by operation (from PROJECT.md v1.2 constraints):**
- Draft form edits, class capacity adjustment → direct write (agent calls action, no proposal)
- Form publish/unpublish → propose→approve (affects what members see)
- Schedule cancel/reschedule → propose→approve (affects existing bookings)
- Member profile field edits (name, phone, email, notes) → direct write (low-risk, no member messaging implied)
- Any action that sends WhatsApp or touches payments → always propose→approve (existing rule)

For direct-write actions, no changes to the propose/approve machinery are needed. For propose→approve-gated actions, add the new action name to the `ACTION_ALLOWLIST` array.

### 7. `// guard:allow-unscoped` — the single-tenant scoping bypass

All gym domain tables (`gym_members`, `class_definitions`, `class_occurrences`, `bookings`, `passes`, `whatsapp_templates`, etc.) do NOT use `ownableColumns()`. They are single-tenant by design. Every action that queries these tables must include the comment `// guard:allow-unscoped — single-tenant gym deploy; gym_members has no ownableColumns()` (or equivalent reason) to satisfy the `guard-no-unscoped-queries.mjs` CI script. This is already the pattern in every existing gym action (verified in `send-template-to-members.ts`, `propose-action.ts`, `upsert-section-note.ts`).

### 8. Automatic UI refresh after write actions

The framework's `useDbSync` polls `/_agent-native/poll` every 2s and invalidates all `["action"]` React Query keys when any non-GET action completes successfully. This means any UI component using `useActionQuery` to fetch form/schedule/member data will automatically refetch after the agent writes — without any additional wiring. The UI does NOT need to listen for a specific event from the new action; the framework refresh is universal.

For optimistic UI (AGENTS.md convention: "the UI must feel instant"), the mutation in the UI component should follow the standard pattern: update React Query cache in `onMutate`, call `useActionMutation`, roll back in `onError`, replace in `onSuccess`.

---

## New Additions (if any)

**None.** v1.2 requires zero new npm packages, zero new infrastructure, zero new framework primitives.

The work is entirely:
1. New `.ts` files in `apps/staff-web/actions/` using existing `defineAction` + Drizzle + Zod
2. Regenerating `.generated/actions-registry.ts` and `.generated/action-types.d.ts`
3. Editing `agent-chat.ts` system prompt to add tool bullets and per-tab capability sections
4. Editing `apps/staff-web/AGENTS.md` Agent Actions table to document the new actions
5. Optimistic UI wiring in existing tab components using already-present `useActionMutation`
6. Extending the navigation state writer to include selected item IDs per tab (UI-side only, ~10 lines per tab)
7. Updating `view-screen.ts` to fetch item data for the three new tabs when they are active

---

## What NOT to Add

| Avoid | Why | What to Do Instead |
|-------|-----|--------------------|
| Any new npm package for "confirmation dialogs" | shadcn `AlertDialog` is already in `app/components/ui/` per AGENTS.md convention | Use `<AlertDialog>` for destructive confirms (cancel class, archive form) |
| A custom HTTP route in `server/routes/api/` for write operations | All CRUD goes through `defineAction`; the framework auto-exposes it as `/_agent-native/actions/<name>` | `defineAction` with no `http` key (defaults to POST) |
| A separate LLM call inside a write action | Rule 2: "All AI goes through the agent chat." Actions are tools the agent calls, not agents themselves | If the action needs to generate text (e.g., suggest a form description), the agent calls a read action first, computes in the chat loop, then calls the write action with the computed values |
| `http: { method: "GET" }` on write actions | GET suppresses the automatic `useDbSync` poll invalidation — the UI will not refresh after agent writes | Omit `http` (POST default) or use `http: { method: "PUT" }` for update semantics |
| Modifying `approve-proposal.ts` run() to dynamically call any arbitrary action | The allowlist in approve-proposal is a security boundary — it must remain an explicit enum | Add only the specific new action name to the `ACTION_ALLOWLIST` array if it requires propose→approve gating |
| `drizzle-kit push` | Forbidden by the `guard:no-drizzle-push` CI script and PROJECT.md constraints | `drizzle-kit generate` + `drizzle-kit migrate` for any schema additions (v1.2 likely needs none) |
| Putting business logic in `agent-chat.ts` | The system prompt should name tools and describe when to use them — not contain logic | All logic lives in the action's `run()` function |

---

## Integration Points (Concrete, File-Referenced)

### Adding one write action end-to-end

**Step 1 — Create action file**
`apps/staff-web/actions/<action-name>.ts` — `defineAction` with `description`, `schema` (Zod), `run`. No `http` key for POST default. Add `// guard:allow-unscoped` comment on any gym table query.

**Step 2 — Regenerate registry**
Triggers regeneration of `.generated/actions-registry.ts` (add `import * as a_<name> from "../actions/<name>"` and add entry to the `modules` object) and `.generated/action-types.d.ts` (add `"<name>": ActionEntry<...>` to `ActionRegistry`). In local dev, Vite plugin does this automatically on file save. Since local dev is broken, trigger manually before deploy.

**Step 3 — Document in AGENTS.md**
Add a row to the Agent Actions table in `apps/staff-web/AGENTS.md`. Include: tool name, tier (2 for direct writes, 3 for propose→approve), use-for description, return shape.

**Step 4 — Add to system prompt**
Edit `apps/staff-web/server/plugins/agent-chat.ts` `systemPrompt` string. Add a bullet under `Available tools:`. Include: exact tool name, when to use it, any constraint the agent must know (e.g., which fields are off-limits).

**Step 5 — Wire UI**
In the relevant tab component, use `useActionMutation("<action-name>")` for the coach-facing mutation. Follow optimistic UI pattern: `onMutate` → update cache → fire mutation → `onError` → rollback + toast → `onSuccess` → replace optimistic entry with server value.

### For propose→approve-gated write actions (additional step)

**Step 6 — Extend allowlist**
In `apps/staff-web/actions/approve-proposal.ts`, add the new action name to `ACTION_ALLOWLIST` and add a dynamic import branch in the `run()` body (follow the existing `if/else` pattern for `send-template-to-members` / `create-checkout-link`). Also extend the `actionName` Zod enum in `propose-action.ts` to include the new name.

### Navigation state extension for per-tab item context

The UI's navigation state writer (wherever `PUT /_agent-native/application-state/navigation` is called on tab/item selection changes) should be extended to include:
- `formId` when a form is open in the Forms tab
- `occurrenceId` when a class occurrence is selected in the Schedule tab
- `memberId` when a member detail panel is open in the Members tab

This lets the agent know which item the coach is looking at without needing to call `view-screen` first for basic context. The `view-screen.ts` action should then be updated to branch on `nav.view === "forms"` / `"schedule"` / `"members"` and fetch the relevant item data from those IDs.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| `defineAction` mutation pattern | HIGH | Direct inspection of 10+ production action files; pattern is consistent and proven |
| Registry regeneration mechanism | HIGH | `.generated/actions-registry.ts` header comment is explicit: "AUTO-GENERATED by @agent-native/core — do not edit manually"; Vite plugin triggers on actions/ changes |
| System prompt tool exposure | HIGH | `agent-chat.ts` is 54 lines; mechanism is transparent: loadActionsFromStaticRegistry feeds tool defs, systemPrompt bullets teach the agent to use them |
| `readAppState`/`writeAppState` API | HIGH | Used in production by `suggest-template-vars.ts` and `navigate.ts`; imports verified |
| Propose→approve extension for new actions | HIGH | `approve-proposal.ts` allowlist and import pattern is explicit in source; extension is mechanical |
| guard:allow-unscoped requirement | HIGH | `guard-no-unscoped-queries.mjs` CI script is active; pattern is consistent across all existing gym actions |
| Automatic UI refresh after write | HIGH | Documented in actions SKILL.md and verified by framework behaviour description in adding-a-feature SKILL.md |
| Zero new dependencies | HIGH | Every required import (`defineAction`, `getDb`, `schema`, `eq`, `z`, `writeAppState`, `readAppState`, `nanoid`) is already in package.json and used in production |

---

## Sources

All findings are from direct codebase inspection (no web search required — this is a confirmed-stack milestone):

- `apps/staff-web/server/plugins/agent-chat.ts` — `createAgentChatPlugin`, `loadActionsFromStaticRegistry`, system prompt structure
- `apps/staff-web/.generated/actions-registry.ts` — registry format, regeneration header comment, full module map
- `apps/staff-web/.generated/action-types.d.ts` — `ActionRegistry` augmentation pattern
- `apps/staff-web/actions/upsert-section-note.ts` — canonical direct-write action (Tier 2)
- `apps/staff-web/actions/suggest-template-vars.ts` — `writeAppState` usage pattern
- `apps/staff-web/actions/send-template-to-members.ts` — gated write action with `guard:allow-unscoped`
- `apps/staff-web/actions/propose-action.ts` + `approve-proposal.ts` — propose→approve pattern; `ACTION_ALLOWLIST` extension point
- `apps/staff-web/actions/navigate.ts` — `writeAppState("navigate", ...)` pattern; `http: false` for agent-only
- `apps/staff-web/actions/view-screen.ts` — `readAppState("navigation")`; per-view branching pattern for `view-screen` updates
- `.agents/skills/actions/SKILL.md` — `http` option semantics; auto-refresh behaviour; `useActionMutation` / `useActionQuery`
- `.agents/skills/context-awareness/SKILL.md` — navigation state shape; `<current-screen>` auto-injection; `view-screen` purpose
- `.agents/skills/adding-a-feature/SKILL.md` — four-area checklist; `useChangeVersions` wiring for non-action queries
- `apps/staff-web/AGENTS.md` — "Adding a New Gym Action" five-step procedure; Agent Actions table; `guard:allow-unscoped` convention

---

*Stack research for: v1.2 Agentic Tab Editing — agent write tools for Forms, Schedule, Members*
*Researched: 2026-06-18*
*Confidence: HIGH across all areas — codebase-verified, no external sources needed*
