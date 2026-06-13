---
phase: R3-naming-ia-pass
plan: 02
subsystem: ui
tags: [css, naming, gym-domain, staff-web, r-12, email-vocabulary]

# Dependency graph
requires:
  - phase: R3-naming-ia-pass
    plan: 01
    provides: Label layer stable; no email vocabulary in user-visible copy
provides:
  - Gym-domain CSS class selectors (.conversation-row, .message-body-content, .message-composer-window, .message-editor*)
  - All .email-* and .compose-* class names fully retired from global.css and all consumer components
affects: [R3-03-identifier-rename, R3-04-route-rename-shims]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "R-12 additive-rename-in-place: since all 8 files are changed in the same commit per task, the rename is atomic — no window where old selector exists without matching consumer usage"
    - "Longest-first rename order: .compose-image-placeholder before .compose-image prevents partial-token corruption"

key-files:
  created: []
  modified:
    - apps/staff-web/app/global.css
    - apps/staff-web/app/components/email/EmailListItem.tsx
    - apps/staff-web/app/components/email/EmailThread.tsx
    - apps/staff-web/app/components/email/ComposeModal.tsx
    - apps/staff-web/app/components/email/ComposeEditor.tsx
    - apps/staff-web/app/components/email/ComposeSlashMenu.tsx
    - apps/staff-web/app/components/email/CodeBlockLangPicker.tsx
    - apps/staff-web/app/components/email/extensions/ComposeImageBlock.tsx

key-decisions:
  - "CSS variable --compose-right left unchanged: it is a layout variable (sidebar offset), not a CSS class name. Plan scope is class names only."
  - "ComposeSlashMenu.tsx and CodeBlockLangPicker.tsx included as deviation (Rule 2): plan listed them as grep-verify-only, but both contain .closest('.compose-editor-wrapper') DOM selectors that would have orphaned post-rename."
  - "InlineReplyComposer.tsx compose- occurrence is an AI context string literal (not a CSS class name) — left unchanged per scope."

requirements-completed: [NAME-04]

# Metrics
duration: 4min
completed: 2026-06-13
---

# Phase R3 Plan 02: CSS Class Renames Summary

**Hand-authored `.email-*` and `.compose-*` CSS class names replaced with gym-domain names (`.conversation-row`, `.message-body-content`, `.message-composer-window`, `.message-editor*`) across global.css and all 8 consumer files — R-12 zero-orphan criterion met in both tasks**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-13T17:49:18Z
- **Completed:** 2026-06-13T17:52:58Z
- **Tasks:** 2 planned, 2 completed
- **Files modified:** 8

## Accomplishments

- Task 1: `.email-list-row` (18 selectors in global.css including `.focused`/`.selected`/`.multi-selected`, `.row-action-rail`, `.hover-actions`, `.row-time`, and two `@media` blocks) renamed to `.conversation-row`; `EmailListItem.tsx` className migrated.
- Task 1: `.email-body-content` (6 selectors: prose reset + `a`/`p`/`img`/`pre,table` descendants) renamed to `.message-body-content`; `EmailThread.tsx` className migrated.
- Task 2: All 10 `.compose-*` class tokens renamed in order (longest-first per plan) across global.css (87 `message-editor` lines now) and consumer components.
- Task 2: `ComposeEditor.tsx` — Tiptap `HTMLAttributes.class` and `editorProps.attributes.class` strings updated; wrapper div className updated.
- Task 2: `ComposeSlashMenu.tsx` and `CodeBlockLangPicker.tsx` — `.closest()` DOM selector strings updated (deviation — see below).
- Task 2: `extensions/ComposeImageBlock.tsx` — all 6 className tokens updated.

## Task Commits

1. **Task 1: .email-list-row + .email-body-content renamed** — `d8283459` (feat)
2. **Task 2: .compose-* renamed** — `06fc6c4b` (feat)

## Files Created/Modified

- `apps/staff-web/app/global.css` — 18 `.email-list-row` + 6 `.email-body-content` + 87-line `.message-editor*` block all renamed
- `apps/staff-web/app/components/email/EmailListItem.tsx` — className `email-list-row` → `conversation-row`
- `apps/staff-web/app/components/email/EmailThread.tsx` — className `email-body-content` → `message-body-content`
- `apps/staff-web/app/components/email/ComposeModal.tsx` — className `compose-window` → `message-composer-window`
- `apps/staff-web/app/components/email/ComposeEditor.tsx` — `HTMLAttributes.class`, `editorProps.attributes.class`, wrapper div className
- `apps/staff-web/app/components/email/ComposeSlashMenu.tsx` — `.closest()` DOM selector string
- `apps/staff-web/app/components/email/CodeBlockLangPicker.tsx` — `.closest()` DOM selector string
- `apps/staff-web/app/components/email/extensions/ComposeImageBlock.tsx` — 6 className tokens (placeholder, wrapper, overlay, btn, btn--danger, image)

## Decisions Made

- CSS variable `--compose-right` was left unchanged — it is a layout offset variable for the sidebar (used in `calc(100vw-var(--compose-right)-1rem)`), not a CSS class name. Plan scope is class names only; CSS variable names are a different namespace.
- `InlineReplyComposer.tsx` contains `compose-${draft.id}.json` — this is a string literal for an application state file path, not a CSS class name token. Not changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Extended scope to include ComposeSlashMenu.tsx and CodeBlockLangPicker.tsx DOM selector strings**
- **Found during:** Task 2 pre-read grep scan
- **Issue:** Plan listed ComposeSlashMenu.tsx and CodeBlockLangPicker.tsx as "likely none, but verify" (ComposeSlashMenu) and implicitly out of scope (CodeBlockLangPicker). Both files use `.closest(".compose-editor-wrapper")` as DOM query selectors — these would silently orphan post-rename because the DOM element uses the new class name `.message-editor-wrapper` while the `closest()` call still searched for the old name.
- **Fix:** Updated both `.closest()` calls to `.closest(".message-editor-wrapper")` in the same Task 2 commit.
- **Files modified:** apps/staff-web/app/components/email/ComposeSlashMenu.tsx, apps/staff-web/app/components/email/CodeBlockLangPicker.tsx
- **Commit:** `06fc6c4b`

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical functionality)
**Impact on plan:** Necessary to satisfy R-12 zero-orphan requirement. DOM selector strings that reference CSS class names are functionally equivalent to CSS class names in the rename scope — the R-12 pattern requires that no code path references the old class name after migration.

## Issues Encountered

- None — rename proceeded cleanly. All line refs in the plan were accurate.

## Known Stubs

None — this plan renames class names only. No data, API, or rendering logic introduced. No placeholder values.

## User Setup Required

None.

## Next Phase Readiness

- CSS class layer complete: all `.email-*` and `.compose-*` class names replaced with gym-domain names
- Global.css now reads gym-domain throughout: `.conversation-row`, `.message-body-content`, `.message-composer-window`, `.message-editor*`
- Ready for R3-03 (identifier renames): component file renames, exported function/component names
- Route paths unchanged in this wave — that remains R3-04

---
*Phase: R3-naming-ia-pass*
*Completed: 2026-06-13*
