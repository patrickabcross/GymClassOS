---
phase: quick-260622-f8j
plan: 01
subsystem: agent-panel / composer
tags: [operator-gate, white-label, model-picker, workspace, feedback-button]
dependency_graph:
  requires: [quick-260622-e4a]
  provides: [showOperatorChrome prop on AgentSidebar/AgentPanel/AssistantChat]
  affects: [packages/core/src/client/AgentPanel.tsx, packages/core/src/client/AssistantChat.tsx, apps/staff-web/app/components/layout/AppLayout.tsx]
tech_stack:
  added: []
  patterns: [prop-gate, undefined-to-hide-model-picker]
key_files:
  created:
    - .changeset/260622-f8j-operator-chrome-gate.md
  modified:
    - packages/core/src/client/AgentPanel.tsx
    - packages/core/src/client/AssistantChat.tsx
    - apps/staff-web/app/components/layout/AppLayout.tsx
decisions:
  - "Workspace button gated at the JSX level (conditional render), not via event handler, because there is no agent-panel:open-resources event — the button is the sole resources entry point plus the persisted-mode restore (both gated)."
  - "FeedbackButton gated by wrapping in {showOperatorChrome && (...)}, with showOperatorChrome added to renderHeaderActions useMemo deps."
  - "Model picker hidden by passing undefined for all five model props to TiptapComposer (selectedModel/selectedEffort/availableModels/onModelChange/onEffortChange). TiptapComposer already hides ModelSelector when selectedModel && availableModels && onModelChange is falsy — shared-composer rule honored, TiptapComposer NOT modified."
  - "execMode/onExecModeChange (Act mode picker) left entirely unchanged — stays visible for all users including non-operators."
  - "dist/client/AgentPanel.d.ts and dist/client/AssistantChat.d.ts in main tree patched locally (gitignored) so staff-web typecheck resolves the new prop. Vercel regenerates dist from source on build."
metrics:
  duration_seconds: ~900
  completed: "2026-06-22"
  tasks: 3
  files: 4
---

# Quick Task 260622-f8j: Generalize Operator Chrome Gate

**One-liner:** Renamed `showSettingsGear` to `showOperatorChrome` (default true) and extended the gate to also hide the Workspace button, FeedbackButton, and composer model picker when false, completing the white-label agent sidebar for non-operator gym staff.

## What Was Built

Extended quick task 260622-e4a's single-gear gate into a four-element operator chrome gate:

**Task 1 — AgentPanel.tsx: rename + gate Workspace + FeedbackButton + resources back-door**

- Renamed `showSettingsGear` -> `showOperatorChrome` at all 10 sites (AgentPanelProps interface, AgentPanelInner destructure, initial-mode restore guard, open-settings event back-door guard + deps, renderModeButtons gear conditional + deps, AgentSidebarProps interface, AgentSidebar destructure, AgentSidebar -> AgentPanel pass-through).
- Wrapped the Workspace `<Tooltip>` block (`onClick={() => switchMode("resources")}`, `IconLayoutGrid`, text "Workspace") in `{showOperatorChrome && (...)}`.
- Changed `saved === "resources" ||` to `(saved === "resources" && showOperatorChrome) ||` in the persisted-mode restore so a cached "resources" mode is not restored for non-operators.
- Wrapped `<FeedbackButton variant="icon" side="bottom" align="end" />` in `{showOperatorChrome && (...)}` and added `showOperatorChrome` to `renderHeaderActions` useMemo deps.
- Added `showOperatorChrome={showOperatorChrome}` to the `<MultiTabAssistantChat />` render so the flag threads through to AssistantChat.

**Task 2 — AssistantChat.tsx: model picker gate**

- Added `showOperatorChrome?: boolean` to `AssistantChatProps` interface.
- Destructured `showOperatorChrome = true` in `AssistantChatInner` (the component that renders the TiptapComposer).
- When `showOperatorChrome` is false, passes `undefined` for all five model props to `<TiptapComposer>`: `selectedModel`, `selectedEffort`, `availableModels`, `onModelChange`, `onEffortChange`. TiptapComposer's `ModelSelector` condition (`selectedModel && availableModels && onModelChange`) then hides the picker without any modification to TiptapComposer itself.
- `execMode`/`onExecModeChange` (Act mode picker) left untouched — visible for everyone.
- The outer `AssistantChat` forwardRef spreads `{...props}` into `AssistantChatInner`, so `showOperatorChrome` flows automatically — no change needed to `MultiTabAssistantChat.tsx` either.

**Task 3 — AppLayout.tsx + changeset**

- Renamed `showSettingsGear={isOperator}` to `showOperatorChrome={isOperator}` on the `/gymos` `<AgentSidebar>` mount. The non-gymos mount (email sidebar, ~line 191+) passes no such prop and stays default true — unaffected.
- Updated the comment block describing `isOperator` gating to reference "operator chrome (settings, Workspace, Feedback, model picker)" rather than just "settings gear".
- Created `.changeset/260622-f8j-operator-chrome-gate.md` (`"@agent-native/core": patch`).

## Typecheck Results

```
packages/core tsc --noEmit    EXIT:0  (main tree pnpm exec tsc 5.3.3)
apps/staff-web pnpm typecheck EXIT:0  (main tree, via dist .d.ts patch)
```

`packages/core/dist/client/AgentPanel.d.ts` — both `showSettingsGear` occurrences replaced with `showOperatorChrome`; `AgentSidebar` destructure declaration updated to include the new prop.
`packages/core/dist/client/AssistantChat.d.ts` — `showOperatorChrome?: boolean` added after `onForkChat`.
Both `.d.ts` files are gitignored; Vercel regenerates `dist/` from source on build.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The gate is wired end-to-end: AppLayout `isOperator` → AgentSidebar `showOperatorChrome` → AgentPanel (four chrome elements + resources back-door) → MultiTabAssistantChat → AssistantChat → TiptapComposer model props.

## Commits

| Task | Hash | Message |
|------|------|---------|
| T1 | 4d9171e8 | feat(quick-260622-f8j-01): rename showSettingsGear -> showOperatorChrome; gate Workspace, FeedbackButton, resources back-door |
| T2 | 7e7314d6 | feat(quick-260622-f8j-02): showOperatorChrome on AssistantChat; hide model picker via undefined model props when false |
| T3 | 88bc6766 | feat(quick-260622-f8j-03): AppLayout showOperatorChrome={isOperator} + @agent-native/core patch changeset |

## Self-Check: PASSED

- `showSettingsGear` in worktree source: 0 matches (grep confirmed)
- `showOperatorChrome` in worktree source: 21 matches across 3 files (all expected sites)
- `.changeset/260622-f8j-operator-chrome-gate.md`: exists, `"@agent-native/core": patch`
- `4d9171e8` in git log: FOUND
- `7e7314d6` in git log: FOUND
- `88bc6766` in git log: FOUND
- TiptapComposer.tsx: UNCHANGED (not in diff)
- MultiTabAssistantChat.tsx: UNCHANGED (not in diff)
- Act mode picker (execMode/onExecModeChange): UNCHANGED in AssistantChat
