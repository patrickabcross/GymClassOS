---
phase: R3-naming-ia-pass
plan: 03
subsystem: ui
tags: [identifier-rename, naming, gym-domain, staff-web, name-04, email-vocabulary]

# Dependency graph
requires:
  - phase: R3-naming-ia-pass
    plan: 02
    provides: CSS class renames complete; .compose-* and .email-* CSS names retired
provides:
  - Gym-domain component identifiers: ConversationList, ConversationListItem, ConversationThread
  - Gym-domain modal/editor identifiers: MessageComposerModal, MessageEditor, MessageBubbleToolbar, MessageSlashMenu
  - Gym-domain page identifiers: MessagesPage, ScheduledMessagesPage
  - All import sites updated; zero Compose*/Email* PascalCase identifiers remain in code
affects: [R3-04-route-rename-shims]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "File rename mechanic: cp old -> new (with identifier edits), then delete old; git rm old + git add new gives git rename detection at 99%"
    - "Intra-plan ordering: Task 2 edits InboxPage.tsx imports before Task 3 renames the file — avoids file-overlap collision"

key-files:
  created:
    - apps/staff-web/app/components/email/MessageComposerModal.tsx
    - apps/staff-web/app/components/email/MessageEditor.tsx
    - apps/staff-web/app/components/email/MessageSlashMenu.tsx
    - apps/staff-web/app/components/email/MessageBubbleToolbar.tsx
    - apps/staff-web/app/components/email/ConversationList.tsx
    - apps/staff-web/app/components/email/ConversationListItem.tsx
    - apps/staff-web/app/components/email/ConversationThread.tsx
    - apps/staff-web/app/pages/MessagesPage.tsx
    - apps/staff-web/app/pages/ScheduledMessagesPage.tsx
  modified:
    - apps/staff-web/app/components/layout/AppLayout.tsx
    - apps/staff-web/app/components/email/InlineReplyComposer.tsx
    - apps/staff-web/app/routes/draft-queue.tsx
    - apps/staff-web/app/routes/draft-queue.$id.tsx

key-decisions:
  - "InboxZero export kept unchanged in ConversationList.tsx — it is an empty-state UI component, not email vocabulary; plan explicitly deferred it"
  - "InlineReplyComposer.tsx import updated as Rule 3 auto-fix: plan's consumer_graph omitted it but it imported ComposeEditor (now deleted file); fix required to prevent dangling import"
  - "Prose comments referencing old names (EmailThread in AppLayout.tsx, InboxPage in inbox-tabs.ts) left as-is per plan acceptance criteria ('prose comments tolerated')"
  - "components/email/ directory rename deferred per plan scope — files carry gym-domain names but folder stays 'email/' to limit blast radius"
  - "SnoozeModal/SnoozePopover/RecipientInput/InlineReplyComposer NOT renamed — explicitly deferred per plan scope discipline"

requirements-completed: [NAME-04]

# Metrics
duration: 12min
completed: 2026-06-13
---

# Phase R3 Plan 03: Identifier Renames Summary

**9 component/page files renamed from email-vocabulary identifiers to gym-domain names (Compose* -> Message*, Email* -> Conversation*, InboxPage -> MessagesPage, DraftQueuePage -> ScheduledMessagesPage); all import sites updated; zero PascalCase email-vocabulary identifiers remain in code**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-13T17:56:02Z
- **Completed:** 2026-06-13T18:08:30Z
- **Tasks:** 3 planned, 3 completed
- **Files modified:** 13 (9 renamed/created, 4 import-site consumers updated)

## Accomplishments

- Task 1: Renamed 4 Compose* components to Message* (MessageComposerModal, MessageEditor, MessageSlashMenu, MessageBubbleToolbar); updated AppLayout.tsx consumer; also updated InlineReplyComposer.tsx (Rule 3 auto-fix — unlisted consumer with dangling import).
- Task 2: Renamed EmailList, EmailListItem, EmailThread to ConversationList, ConversationListItem, ConversationThread; updated all internal references (ConversationList imports ConversationListItem; InboxPage imports updated to Conversation* names before Task 3 renames the file).
- Task 3: Renamed InboxPage.tsx -> MessagesPage.tsx and DraftQueuePage.tsx -> ScheduledMessagesPage.tsx; updated draft-queue.tsx and draft-queue.$id.tsx route consumers. Route path strings unchanged (Wave 4 scope).

## Task Commits

1. **Task 1: Compose* -> Message* component tree** — `8815dcf0` (refactor)
2. **Task 2: Email* -> Conversation*** — `db10e237` (refactor)
3. **Task 3: InboxPage/DraftQueuePage page renames** — `e4a54eae` (refactor)

## Files Created/Modified

### Renamed (old -> new)
- `components/email/ComposeModal.tsx` -> `MessageComposerModal.tsx` — export + props interface renamed
- `components/email/ComposeEditor.tsx` -> `MessageEditor.tsx` — export, handle type (MessageEditorHandle), props type (MessageEditorProps) renamed
- `components/email/ComposeSlashMenu.tsx` -> `MessageSlashMenu.tsx` — export + props type renamed
- `components/email/ComposeBubbleToolbar.tsx` -> `MessageBubbleToolbar.tsx` — export + props type renamed
- `components/email/EmailList.tsx` -> `ConversationList.tsx` — export EmailList -> ConversationList; EmailListProps -> ConversationListProps; internal EmailListItem -> ConversationListItem import updated
- `components/email/EmailListItem.tsx` -> `ConversationListItem.tsx` — export + memo function + props interface renamed
- `components/email/EmailThread.tsx` -> `ConversationThread.tsx` — export function renamed
- `pages/InboxPage.tsx` -> `pages/MessagesPage.tsx` — export function InboxPage -> MessagesPage
- `pages/DraftQueuePage.tsx` -> `pages/ScheduledMessagesPage.tsx` — export function renamed

### Import-site consumers updated
- `components/layout/AppLayout.tsx` — ComposeModal -> MessageComposerModal import + JSX
- `components/email/InlineReplyComposer.tsx` — ComposeEditor/ComposeEditorHandle -> MessageEditor/MessageEditorHandle (Rule 3 auto-fix)
- `routes/draft-queue.tsx` — DraftQueuePage -> ScheduledMessagesPage import + JSX; route path unchanged
- `routes/draft-queue.$id.tsx` — same as above

## Decisions Made

- InboxZero kept as-is in ConversationList.tsx — it is an empty-state UI element, neutral (not email vocabulary), and was explicitly deferred by plan scope.
- `components/email/` directory itself NOT renamed — plan explicitly deferred the directory rename to limit blast radius (a known residual; see below).
- SnoozeModal, SnoozePopover, RecipientInput, InlineReplyComposer (the component itself), CodeBlockLangPicker, AttachmentStrip, IntegrationsSidebar, MobileActionBar, SendLaterButton all left unchanged — explicitly deferred/kept per plan scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended Task 1 to update InlineReplyComposer.tsx**
- **Found during:** Task 1 post-rename verification grep
- **Issue:** Plan's `consumer_graph` did not list `InlineReplyComposer.tsx` as a consumer of `ComposeEditor`, but it imported `ComposeEditor` and `ComposeEditorHandle` from `./ComposeEditor`. Once `ComposeEditor.tsx` was deleted, this import would be a dangling broken reference.
- **Fix:** Updated `InlineReplyComposer.tsx` import to `MessageEditor` / `MessageEditorHandle` from `./MessageEditor`; updated `useRef<MessageEditorHandle>` and `<MessageEditor` JSX usage. Included in Task 1 commit `8815dcf0`.
- **Files modified:** `apps/staff-web/app/components/email/InlineReplyComposer.tsx`
- **Commit:** `8815dcf0`

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue)
**Impact on plan:** Required — without this fix, InlineReplyComposer.tsx would have a broken import to a deleted file.

## Issues Encountered

- None — all line refs in the plan were accurate. Git detected all moves as renames (99% similarity).

## Known Stubs

None — this plan renames code identifiers only. No data, API, or rendering logic introduced. No placeholder values.

## Known Residuals (Explicitly Deferred)

- **`components/email/` directory** — the folder is still named `email/` even though the files within now carry gym-domain names. Renaming the directory would require updating every `@/components/email/*` import path across the codebase (~30+ files). Deferred to a future pass (potential R3-05 or post-R3 cleanup).
- **`InboxZero`** — export name kept as-is. Neutral-ish name; plan explicitly deferred.
- **`SnoozeModal` / `SnoozePopover`** — NAMING-RECORD flags "review whether snooze functionality survives the v1.1 naming pass"; out of scope for a pure naming pass.
- **`RecipientInput`** — optional/low priority per NAMING-RECORD; deferred.
- **Prose comments** — a handful of `//` and `/** */` comments still reference old names (e.g. "InboxPage" in inbox-tabs.ts JSDoc, "EmailThread" in AppLayout.tsx inline comments). These are non-functional documentation artifacts; updating them would be noise with no correctness benefit.

## User Setup Required

None.

## Next Phase Readiness

- Identifier layer complete: all email-vocabulary component, file, and page names carry gym-domain names
- Import graph is clean: zero dangling imports from the renamed symbols
- Ready for R3-04 (route rename + redirect shims): the page components and route consumers already use gym-domain names; the route file rename + shim work can proceed cleanly

---
*Phase: R3-naming-ia-pass*
*Completed: 2026-06-13*
