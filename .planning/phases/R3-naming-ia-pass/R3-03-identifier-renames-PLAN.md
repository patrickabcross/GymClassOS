---
phase: R3-naming-ia-pass
plan: 03
type: execute
wave: 3
depends_on: [R3-02]
files_modified:
  - apps/staff-web/app/components/email/EmailList.tsx
  - apps/staff-web/app/components/email/EmailListItem.tsx
  - apps/staff-web/app/components/email/EmailThread.tsx
  - apps/staff-web/app/components/email/ComposeModal.tsx
  - apps/staff-web/app/components/email/ComposeEditor.tsx
  - apps/staff-web/app/components/email/ComposeSlashMenu.tsx
  - apps/staff-web/app/components/email/ComposeBubbleToolbar.tsx
  - apps/staff-web/app/pages/InboxPage.tsx
  - apps/staff-web/app/pages/DraftQueuePage.tsx
  - apps/staff-web/app/components/layout/AppLayout.tsx
  - apps/staff-web/app/routes/draft-queue.tsx
  - apps/staff-web/app/routes/draft-queue.$id.tsx
autonomous: true
requirements: [NAME-04]
must_haves:
  truths:
    - "Email-vocabulary component names are renamed to gym-domain names"
    - "Page component names InboxPage/DraftQueuePage are renamed (Messages/ScheduledMessages)"
    - "All import sites compile against the new names (no dangling imports)"
  artifacts:
    - path: "apps/staff-web/app/components/email/ConversationList.tsx"
      provides: "Renamed ConversationList component (was EmailList)"
      contains: "export function ConversationList"
    - path: "apps/staff-web/app/pages/MessagesPage.tsx"
      provides: "Renamed MessagesPage component (was InboxPage)"
      contains: "export function MessagesPage"
  key_links:
    - from: "apps/staff-web/app/pages/MessagesPage.tsx"
      to: "apps/staff-web/app/components/email/ConversationList.tsx"
      via: "import { ConversationList }"
      pattern: "import \\{ ConversationList"
    - from: "apps/staff-web/app/components/layout/AppLayout.tsx"
      to: "apps/staff-web/app/components/email/MessageComposerModal.tsx"
      via: "import { MessageComposerModal }"
      pattern: "MessageComposerModal"
---

<objective>
Wave 3 of R3 (identifier layer). Rename email-vocabulary code identifiers (component files, exported component names, intra-file references, import sites) to gym-domain names per NAMING-RECORD §Identifier Layer. Zero user impact — pure refactor. Runs after R3-02 (CSS migrated) and before R3-04 (route rename) per CONTEXT D-05.

Purpose: Code reads as a gym product. The `components/email/*` tree and the `InboxPage`/`DraftQueuePage` page components carry email metaphors; rename to Conversation/Message vocabulary so the route rename in R3-04 lands on already-gym-named files.

Output: Files renamed (git mv-equivalent: create new path, remove old) + exported names + all import sites updated. Project still compiles (imports resolve).

SCOPE DISCIPLINE — what this plan renames (NAME-04 mandated, high value):
- `EmailList` → `ConversationList`, `EmailListItem` → `ConversationListItem`, `EmailThread` → `ConversationThread`
- `ComposeModal` → `MessageComposerModal`, `ComposeEditor` → `MessageEditor`, `ComposeBubbleToolbar` → `MessageBubbleToolbar`, `ComposeSlashMenu` → `MessageSlashMenu`
- `InboxPage` → `MessagesPage`, `DraftQueuePage` → `ScheduledMessagesPage`

EXPLICITLY DEFERRED / NOT renamed in this plan (NAMING-RECORD marks "keep" or "optional/low priority" — do NOT touch, to limit blast radius):
- `CodeBlockLangPicker`, `InlineReplyComposer`, `AttachmentStrip`, `IntegrationsSidebar`, `MobileActionBar`, `SendLaterButton` (all "keep" — neutral terms)
- `RecipientInput` → `ContactInput` ("optional, low priority" — skip)
- `SnoozePopover`/`SnoozeModal` → `ScheduledMessage*` (NAMING-RECORD flags "review whether snooze functionality survives" — out of scope for a pure naming pass; leave as-is, do NOT rename)
- The directory `components/email/` itself stays named `email/` this wave (renaming the dir is a larger move; the files within get gym names but the folder rename is deferred to avoid a massive import churn — note this in the SUMMARY as a known residual).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/R3-naming-ia-pass/R3-CONTEXT.md
@.planning/phases/R1-audit-baseline/NAMING-RECORD.md

<consumer_graph>
Grep-verified import/usage sites (2026-06-13):
- `InboxPage.tsx` imports `{ EmailList, InboxZero }` from `@/components/email/EmailList`, `{ EmailThread }` from `@/components/email/EmailThread`, `{ IntegrationsSidebar }` from `@/components/email/IntegrationsSidebar`. Uses `<EmailThread>` (~624), `<EmailList>` (~637).
- `AppLayout.tsx` imports `{ ComposeModal }` from `@/components/email/ComposeModal` (~line 6), uses `<ComposeModal>` (~1563). Also imports `{ SnoozeModal }` (NOT renamed this plan).
- `ComposeModal.tsx` imports `{ ComposeEditor, type ComposeEditorHandle }` from `./ComposeEditor` (~50); uses `ComposeEditorHandle` (~196, ~883), `<ComposeEditor>` (~918).
- `ComposeEditor.tsx` imports `{ ComposeSlashMenu }` (~16), `{ ComposeBubbleToolbar }` (~17); uses `<ComposeBubbleToolbar>` (~194), `<ComposeSlashMenu>` (~200); exports `ComposeEditor`, interface `ComposeEditorHandle` (~32), `ComposeEditorProps` (~40).
- `EmailList.tsx` renders `EmailListItem`; `EmailListItem.tsx` exports `EmailListItem` (memo, ~141).
- `DraftQueuePage.tsx` exports `DraftQueuePage` (~595). Imported by `routes/draft-queue.tsx` (~line 1) and `routes/draft-queue.$id.tsx` (~line 1).
- The live `/gymos/inbox` route (`gymos.inbox.tsx`) does NOT import any of these — it is self-contained. So this rename does not touch the live coach surface.
</consumer_graph>

<constraints>
- Fork boundary: edit ONLY apps/staff-web/. Never touch templates/*, packages-vendored/*, mobile, DB.
- No local dev server. Verify by grep (no dangling old names) + a TypeScript check if available.
- File rename mechanic: create the file at the new path with renamed contents, then delete the old file (the executor may use `git mv` then edit, or Write new + delete old — either way the old path must not remain). Do NOT leave both.
- Rename the EXPORTED symbol, its interfaces/handle types (`ComposeEditorHandle` → `MessageEditorHandle`, `ComposeEditorProps` → `MessageEditorProps`, `EmailListItemProps` → `ConversationListItemProps`, etc.), the intra-file `function`/`const` declaration, and EVERY import + JSX usage across the consumer graph above.
- Do NOT rename `InboxZero` (exported alongside EmailList) unless it is purely internal — grep its usages; if it is user-facing empty-state copy keep the export name but it may stay `InboxZero` (neutral-ish); to stay safe, KEEP `InboxZero` as-is this plan and note it.
- Do NOT rename the `components/email/` directory. Do NOT rename any DEFERRED component listed in the objective.
- Do NOT change any route path, `to=`/`href=`/`action=` string (that is R3-04). draft-queue route files are edited ONLY to update the `DraftQueuePage` import/JSX name — their paths stay `/draft-queue`.
- Run `npx prettier --write` on all touched files.
</constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename the Compose* editor/modal component tree → Message* (NAME-04)</name>
  <read_first>
    - apps/staff-web/app/components/email/ComposeModal.tsx, ComposeEditor.tsx, ComposeSlashMenu.tsx, ComposeBubbleToolbar.tsx (files being renamed)
    - apps/staff-web/app/components/layout/AppLayout.tsx (consumer — imports ComposeModal ~line 6, uses ~1563)
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md (Identifier Layer rename targets)
  </read_first>
  <files>apps/staff-web/app/components/email/ComposeModal.tsx, apps/staff-web/app/components/email/ComposeEditor.tsx, apps/staff-web/app/components/email/ComposeSlashMenu.tsx, apps/staff-web/app/components/email/ComposeBubbleToolbar.tsx, apps/staff-web/app/components/layout/AppLayout.tsx</files>
  <action>
    Rename files (new path in same `email/` dir, delete old) + exported names + types + all references:
    - `ComposeModal.tsx` → `MessageComposerModal.tsx`: export `ComposeModal` → `MessageComposerModal`, interface `ComposeModalProps` → `MessageComposerModalProps`. Update its import of ComposeEditor (see below).
    - `ComposeEditor.tsx` → `MessageEditor.tsx`: export `ComposeEditor` → `MessageEditor`, interface `ComposeEditorHandle` → `MessageEditorHandle`, `ComposeEditorProps` → `MessageEditorProps`, inner `function ComposeEditor(` → `function MessageEditor(`.
    - `ComposeSlashMenu.tsx` → `MessageSlashMenu.tsx`: export `ComposeSlashMenu` → `MessageSlashMenu`, `ComposeSlashMenuProps` → `MessageSlashMenuProps`.
    - `ComposeBubbleToolbar.tsx` → `MessageBubbleToolbar.tsx`: export `ComposeBubbleToolbar` → `MessageBubbleToolbar`, `ComposeBubbleToolbarProps` → `MessageBubbleToolbarProps`.

    Update import sites:
    - In `MessageComposerModal.tsx` (was ComposeModal): `import { ComposeEditor, type ComposeEditorHandle } from "./ComposeEditor"` → `import { MessageEditor, type MessageEditorHandle } from "./MessageEditor"`; update `useRef<ComposeEditorHandle>` → `MessageEditorHandle`, `<ComposeEditor ...>` → `<MessageEditor ...>`.
    - In `MessageEditor.tsx` (was ComposeEditor): `import { ComposeSlashMenu } from "./ComposeSlashMenu"` → `from "./MessageSlashMenu"` with `{ MessageSlashMenu }`; `import { ComposeBubbleToolbar } from "./ComposeBubbleToolbar"` → `from "./MessageBubbleToolbar"` with `{ MessageBubbleToolbar }`; update JSX `<ComposeBubbleToolbar>` → `<MessageBubbleToolbar>`, `<ComposeSlashMenu>` → `<MessageSlashMenu>`.
    - In `AppLayout.tsx`: `import { ComposeModal } from "@/components/email/ComposeModal"` → `import { MessageComposerModal } from "@/components/email/MessageComposerModal"`; update `<ComposeModal ...>` (~1563) → `<MessageComposerModal ...>`. Do NOT change the `SnoozeModal` import (deferred).

    Run `npx prettier --write` on all five files.
  </action>
  <acceptance_criteria>
    - `ls apps/staff-web/app/components/email/MessageComposerModal.tsx apps/staff-web/app/components/email/MessageEditor.tsx apps/staff-web/app/components/email/MessageSlashMenu.tsx apps/staff-web/app/components/email/MessageBubbleToolbar.tsx` — all exist.
    - The old files `ComposeModal.tsx`, `ComposeEditor.tsx`, `ComposeSlashMenu.tsx`, `ComposeBubbleToolbar.tsx` no longer exist (`ls` errors / `git status` shows deletions/renames).
    - `grep -rn "ComposeModal\|ComposeEditor\|ComposeSlashMenu\|ComposeBubbleToolbar" apps/staff-web/app` returns 0 matches (no dangling references; comments mentioning "compose" prose are fine but no PascalCase identifiers).
    - `grep -n "MessageComposerModal" apps/staff-web/app/components/layout/AppLayout.tsx` matches (consumer migrated).
    - `grep -n "import { MessageEditor" apps/staff-web/app/components/email/MessageComposerModal.tsx` matches.
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "ComposeModal\|ComposeEditor\|ComposeSlashMenu\|ComposeBubbleToolbar" apps/staff-web/app ; test $? -ne 0 && echo "PASS: no dangling Compose* identifiers"</automated>
  </verify>
  <done>Four compose components renamed to Message* with all types/usages/imports updated; AppLayout consumes MessageComposerModal; zero Compose* PascalCase identifiers remain.</done>
</task>

<task type="auto">
  <name>Task 2: Rename EmailList/EmailListItem/EmailThread → Conversation* (NAME-04)</name>
  <read_first>
    - apps/staff-web/app/components/email/EmailList.tsx, EmailListItem.tsx, EmailThread.tsx (files being renamed)
    - apps/staff-web/app/pages/InboxPage.tsx (consumer — imports EmailList/EmailThread)
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md
  </read_first>
  <files>apps/staff-web/app/components/email/EmailList.tsx, apps/staff-web/app/components/email/EmailListItem.tsx, apps/staff-web/app/components/email/EmailThread.tsx, apps/staff-web/app/pages/InboxPage.tsx</files>
  <action>
    Rename files (new path in same `email/` dir, delete old) + exports + references:
    - `EmailList.tsx` → `ConversationList.tsx`: export `EmailList` → `ConversationList`. KEEP the `InboxZero` export name as-is (deferred). Update the internal import/usage of `EmailListItem` → `ConversationListItem` (see next), and the `from "./EmailListItem"` → `from "./ConversationListItem"`.
    - `EmailListItem.tsx` → `ConversationListItem.tsx`: export `EmailListItem` → `ConversationListItem`, interface `EmailListItemProps` → `ConversationListItemProps`, the `memo(function EmailListItem(` → `memo(function ConversationListItem(`.
    - `EmailThread.tsx` → `ConversationThread.tsx`: export `EmailThread` → `ConversationThread` (rename the exported component + its Props interface if present; grep within the file).

    Update consumer `InboxPage.tsx` (this file is itself renamed in Task 3 — but update its imports/usages here so it stays consistent; Task 3 will rename the file):
    - `import { EmailList, InboxZero } from "@/components/email/EmailList"` → `import { ConversationList, InboxZero } from "@/components/email/ConversationList"`.
    - `import { EmailThread } from "@/components/email/EmailThread"` → `import { ConversationThread } from "@/components/email/ConversationThread"`.
    - JSX `<EmailThread ...>` (~624) → `<ConversationThread ...>`; `<EmailList ...>` (~637) → `<ConversationList ...>`.
    - Comments referencing EmailThread/EmailList are prose — optional to update; do not break them.

    NOTE: This task edits `InboxPage.tsx` in place (imports/JSX). Task 3 then renames the FILE to MessagesPage.tsx. To avoid a file-overlap collision, run Task 2 fully before Task 3 (Task 3 depends on Task 2 within this plan; both touch InboxPage.tsx, so they are sequential).

    Run `npx prettier --write` on all four files.
  </action>
  <acceptance_criteria>
    - `ls apps/staff-web/app/components/email/ConversationList.tsx apps/staff-web/app/components/email/ConversationListItem.tsx apps/staff-web/app/components/email/ConversationThread.tsx` — all exist; old Email* files gone.
    - `grep -rn "EmailList\b\|EmailListItem\|EmailThread" apps/staff-web/app` returns 0 PascalCase identifier matches (prose comments tolerated; verify any remaining are inside `//` comments).
    - `grep -n "ConversationList\|ConversationThread" apps/staff-web/app/pages/InboxPage.tsx` matches (consumer migrated).
    - `grep -n "InboxZero" apps/staff-web/app/components/email/ConversationList.tsx` STILL matches (deferred export preserved).
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "EmailListItem\|EmailThread\|\bEmailList\b" apps/staff-web/app | grep -v "//" ; test $? -ne 0 && echo "PASS: no dangling Email* identifiers in code"</automated>
  </verify>
  <done>EmailList/EmailListItem/EmailThread renamed to Conversation* with usages updated in InboxPage; InboxZero preserved; zero Email* code identifiers remain.</done>
</task>

<task type="auto">
  <name>Task 3: Rename page components InboxPage → MessagesPage, DraftQueuePage → ScheduledMessagesPage (NAME-04)</name>
  <read_first>
    - apps/staff-web/app/pages/InboxPage.tsx (file being renamed; export ~213 — already import-migrated in Task 2)
    - apps/staff-web/app/pages/DraftQueuePage.tsx (file being renamed; export ~595)
    - apps/staff-web/app/routes/draft-queue.tsx, draft-queue.$id.tsx (consumers — import DraftQueuePage)
  </read_first>
  <files>apps/staff-web/app/pages/InboxPage.tsx, apps/staff-web/app/pages/DraftQueuePage.tsx, apps/staff-web/app/routes/draft-queue.tsx, apps/staff-web/app/routes/draft-queue.$id.tsx</files>
  <action>
    - Rename `pages/InboxPage.tsx` → `pages/MessagesPage.tsx`: export `function InboxPage()` → `function MessagesPage()` (~213). Grep for any other consumer of `InboxPage` across `apps/staff-web/app` (the routes grep showed none import it for `/gymos`; legacy `$view`/mail wiring may — grep and update any `import { InboxPage }` to `import { MessagesPage }` from the new path `@/pages/MessagesPage`). If NO importer exists, the page is reachable only via legacy mail routing — still rename the file + export and leave a note in SUMMARY.
    - Rename `pages/DraftQueuePage.tsx` → `pages/ScheduledMessagesPage.tsx`: export `function DraftQueuePage()` → `function ScheduledMessagesPage()` (~595).
    - Update `routes/draft-queue.tsx` and `routes/draft-queue.$id.tsx`: `import { DraftQueuePage } from "@/pages/DraftQueuePage"` → `import { ScheduledMessagesPage } from "@/pages/ScheduledMessagesPage"`; JSX `<DraftQueuePage />` → `<ScheduledMessagesPage />`. Do NOT change the route file names or the `/draft-queue` paths (route handling is R3-04).

    Run `npx prettier --write` on all touched files.
  </action>
  <acceptance_criteria>
    - `ls apps/staff-web/app/pages/MessagesPage.tsx apps/staff-web/app/pages/ScheduledMessagesPage.tsx` — both exist; old `InboxPage.tsx`/`DraftQueuePage.tsx` gone.
    - `grep -rn "InboxPage\|DraftQueuePage" apps/staff-web/app` returns 0 matches in code (prose comments tolerated).
    - `grep -n "ScheduledMessagesPage" apps/staff-web/app/routes/draft-queue.tsx apps/staff-web/app/routes/draft-queue.$id.tsx` matches in both.
    - `grep -n "export function MessagesPage" apps/staff-web/app/pages/MessagesPage.tsx` matches.
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "InboxPage\|DraftQueuePage" apps/staff-web/app | grep -v "//" ; test $? -ne 0 && echo "PASS: page components renamed, no dangling refs"</automated>
  </verify>
  <done>InboxPage→MessagesPage and DraftQueuePage→ScheduledMessagesPage; draft-queue route consumers import the new name; route paths untouched.</done>
</task>

</tasks>

<verification>
After all tasks (grep + optional typecheck, no dev server):
- Zero dangling identifiers: `grep -rn "ComposeModal\|ComposeEditor\|ComposeSlashMenu\|ComposeBubbleToolbar\|EmailListItem\|EmailThread\|\bEmailList\b\|InboxPage\|DraftQueuePage" apps/staff-web/app | grep -v "//"` returns nothing.
- New files exist; old files deleted (git status shows renames).
- If a TS check is available (`npx tsc --noEmit` from apps/staff-web, or the repo's typecheck script), it passes with no "Cannot find module"/"has no exported member" errors for the renamed symbols. If tsc cannot run in this environment, rely on the grep-based dangling-reference check.
- The live coach route `gymos.inbox.tsx` was NOT modified (it does not import these components) — `git status` should not list it.
- NAME-05 + fork boundary: no schema/migration file touched; no edits outside apps/staff-web/app/.
- DEFERRED items untouched: `grep -rn "SnoozeModal\|SnoozePopover\|RecipientInput\|InlineReplyComposer" apps/staff-web/app` still resolves to their original names (we did not rename them).
</verification>

<success_criteria>
- NAME-04 (identifier portion): the email/compose component tree + the two page components carry gym-domain names; all import sites and JSX usages updated; project compiles.
- Clean separation: no route/path/href changes (that is R3-04), no CSS changes (done in R3-02), no DB changes.
- Deferred/low-value renames explicitly NOT done, recorded in SUMMARY as known residuals for a possible later pass.
</success_criteria>

<output>
After completion, create `.planning/phases/R3-naming-ia-pass/R3-03-SUMMARY.md`
</output>
