---
phase: R3-naming-ia-pass
plan: 02
type: execute
wave: 2
depends_on: [R3-01]
files_modified:
  - apps/staff-web/app/global.css
  - apps/staff-web/app/components/email/EmailListItem.tsx
  - apps/staff-web/app/components/email/EmailThread.tsx
  - apps/staff-web/app/components/email/ComposeModal.tsx
  - apps/staff-web/app/components/email/ComposeEditor.tsx
  - apps/staff-web/app/components/email/ComposeSlashMenu.tsx
autonomous: true
requirements: [NAME-04]
must_haves:
  truths:
    - "Hand-authored email-vocabulary CSS classes are renamed to gym-domain names"
    - "Every component that used a .email-* / .compose-* class now uses the gym-domain class"
    - "No orphaned .email-* / .compose-* class selectors remain after migration"
  artifacts:
    - path: "apps/staff-web/app/global.css"
      provides: "Gym-domain CSS class selectors (.conversation-row, .message-body-content, .message-composer-window, .message-editor*)"
      contains: ".conversation-row"
    - path: "apps/staff-web/app/components/email/EmailListItem.tsx"
      provides: "className using .conversation-row"
      contains: "conversation-row"
  key_links:
    - from: "apps/staff-web/app/components/email/EmailListItem.tsx"
      to: "apps/staff-web/app/global.css .conversation-row rules"
      via: "className=\"conversation-row ...\""
      pattern: "conversation-row"
    - from: "apps/staff-web/app/components/email/ComposeEditor.tsx"
      to: "apps/staff-web/app/global.css .message-editor* rules"
      via: "className=\"message-editor ...\""
      pattern: "message-editor"
---

<objective>
Wave 2 of R3 (CSS layer). Rename the hand-authored `.email-*` and `.compose-*` CSS classes in `global.css` to gym-domain names, migrating their component usage atomically per PITFALL R-12 (additive alias → migrate usage → drop old class → grep returns zero). Runs after R3-01 (labels stable) per CONTEXT D-05.

Purpose: Remove email-vocabulary from the styling layer so a future contributor reading `global.css` sees gym-domain class names, and so the identifier rename (R3-03, which renames the components that USE these classes) lands cleanly. These are hand-authored classes (not Tailwind utilities, not shadcn `components.json` files) so they rename safely.

Output: `global.css` selectors renamed + the five `components/email/*` consumer files migrated. `grep` for the old class names returns zero in `apps/staff-web/app` after this plan.

Scope note: These `.email-*`/`.compose-*` classes are used by the LEGACY mail component tree (`EmailListItem`, `EmailThread`, `ComposeModal`, `ComposeEditor`, `ComposeSlashMenu`) reachable via `/inbox` and `/draft-queue`. The live `/gymos/inbox` route has its own inline Tailwind and does NOT use these classes — but R-12 requires renaming them regardless to keep the diff legible before R3-03 renames the files.
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
@.planning/research/PITFALLS.md

<rename_map>
Authoritative old→new from NAMING-RECORD §CSS Layer:
- `.email-list-row`          → `.conversation-row`
- `.email-body-content`      → `.message-body-content`
- `.compose-window`          → `.message-composer-window`
- `.compose-editor-wrapper`  → `.message-editor-wrapper`
- `.compose-editor`          → `.message-editor`
- `.compose-code-block`      → `.message-editor-code-block`
- `.compose-image`           → `.message-editor-image`
- `.compose-image-placeholder` → `.message-editor-image-placeholder`
- `.compose-image-wrapper`   → `.message-editor-image-wrapper`
- `.compose-image-overlay`   → `.message-editor-image-overlay`
- `.compose-image-btn`       → `.message-editor-image-btn`
- `.compose-link`            → `.message-editor-link`
</rename_map>

<constraints>
- Fork boundary: edit ONLY apps/staff-web/. Never touch templates/*, packages-vendored/*, mobile, DB.
- No local dev server. Verify by grep only.
- R-12 ORDER MATTERS within each task: (a) add the new class selector as an alias alongside the old in global.css, (b) migrate the component `className` usage to the new name, (c) remove the old selector from global.css. Net result after the plan: only the new class exists, and grep for the old name returns zero across `apps/staff-web/app`.
- Do NOT rename component files or exported component names in this plan (that is R3-03). Only `className` string values inside them change here.
- Be precise: `.compose-editor` is a prefix of `.compose-editor-wrapper`, `.compose-image*`, etc. When replacing, match the FULL token + its sub-selectors. Replace longest/most-specific names first to avoid partial-token corruption (e.g. rename `.compose-image-placeholder` before `.compose-image`, and `.compose-editor-wrapper`/`.compose-code-block`/`.compose-image*`/`.compose-link` are distinct tokens — treat each as a whole word bounded by `.`, whitespace, `{`, `,`, `>`, `:`, or end).
- Run `npx prettier --write` on each edited file.
</constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename .email-list-row and .email-body-content (R-12 atomic)</name>
  <read_first>
    - apps/staff-web/app/global.css (the file being edited; `.email-list-row` ~line 77 + sub-rules through ~240; `.email-body-content` ~lines 99-119)
    - apps/staff-web/app/components/email/EmailListItem.tsx (the file being edited; `className="email-list-row ..."` ~line 424)
    - apps/staff-web/app/components/email/EmailThread.tsx (the file being edited; uses `.email-body-content`)
    - .planning/research/PITFALLS.md (R-12 — rename CSS class + component usage in same commit; grep must return zero)
  </read_first>
  <files>apps/staff-web/app/global.css, apps/staff-web/app/components/email/EmailListItem.tsx, apps/staff-web/app/components/email/EmailThread.tsx</files>
  <action>
    `.email-list-row` → `.conversation-row`:
    1. In global.css, grep all `.email-list-row` occurrences (selector ~line 77 plus combinators `.email-list-row.focused`, `.selected`, `.multi-selected`, `.row-action-rail`, `.hover-actions`, `.row-time`, and the mobile breakpoint rules ~lines 144-240). Replace every `.email-list-row` token with `.conversation-row`, preserving all combinator/child selectors and the mobile `@media` rules exactly (only the class token changes).
    2. In EmailListItem.tsx (~line 424), the className is `cn("email-list-row group relative flex ...", ...)`. Replace the `email-list-row` token with `conversation-row` inside that string. Grep the rest of the file for any other `email-list-row` usage and replace.

    `.email-body-content` → `.message-body-content`:
    3. In global.css, grep all `.email-body-content` occurrences (block ~line 99 plus descendant rules `a`, `p`, `img`, `pre, table` ~lines 107-119). Replace every `.email-body-content` token with `.message-body-content`, preserving descendant selectors.
    4. In EmailThread.tsx, grep for `email-body-content` in `className` strings and replace with `message-body-content`.

    Run `npx prettier --write apps/staff-web/app/global.css apps/staff-web/app/components/email/EmailListItem.tsx apps/staff-web/app/components/email/EmailThread.tsx`.
  </action>
  <acceptance_criteria>
    - `grep -rn "email-list-row" apps/staff-web/app` returns 0 matches.
    - `grep -rn "email-body-content" apps/staff-web/app` returns 0 matches.
    - `grep -cn "conversation-row" apps/staff-web/app/global.css` returns the same count of rules previously held by `.email-list-row` (selector + combinators + media rules all renamed).
    - `grep -n "conversation-row" apps/staff-web/app/components/email/EmailListItem.tsx` matches (consumer migrated).
    - `grep -n "message-body-content" apps/staff-web/app/global.css apps/staff-web/app/components/email/EmailThread.tsx` matches in both files.
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "email-list-row\|email-body-content" apps/staff-web/app ; test $? -ne 0 && echo "PASS: no orphaned email-* list/body classes"</automated>
  </verify>
  <done>`.conversation-row` and `.message-body-content` exist in global.css; consumers migrated; zero `.email-list-row`/`.email-body-content` remain anywhere in app/.</done>
</task>

<task type="auto">
  <name>Task 2: Rename .compose-* classes → .message-composer-window / .message-editor* (R-12 atomic)</name>
  <read_first>
    - apps/staff-web/app/global.css (the file being edited; `.compose-window` ~line 162, `.compose-editor*` block ~lines 286-577 with many sub-selectors, `.compose-link` ~482, `.compose-image*` ~391-464, `.compose-code-block` ~368)
    - apps/staff-web/app/components/email/ComposeModal.tsx (the file being edited; uses `.compose-window`)
    - apps/staff-web/app/components/email/ComposeEditor.tsx (the file being edited; uses `.compose-editor*`, `.compose-image*`, `.compose-code-block`, `.compose-link`)
    - apps/staff-web/app/components/email/ComposeSlashMenu.tsx (the file being edited; grep for any compose-* className usage)
    - .planning/research/PITFALLS.md (R-12)
  </read_first>
  <files>apps/staff-web/app/global.css, apps/staff-web/app/components/email/ComposeModal.tsx, apps/staff-web/app/components/email/ComposeEditor.tsx, apps/staff-web/app/components/email/ComposeSlashMenu.tsx</files>
  <action>
    Apply the rename_map for all `.compose-*` classes. To avoid partial-token corruption, replace the MORE-SPECIFIC tokens before the shorter prefixes. Recommended replacement order (longest/most-specific first):
    1. `.compose-image-placeholder` → `.message-editor-image-placeholder`
    2. `.compose-image-wrapper`     → `.message-editor-image-wrapper`
    3. `.compose-image-overlay`     → `.message-editor-image-overlay`
    4. `.compose-image-btn`         → `.message-editor-image-btn`
    5. `.compose-image`             → `.message-editor-image`  (only remaining `.compose-image` tokens — the four above are already renamed)
    6. `.compose-code-block`        → `.message-editor-code-block`
    7. `.compose-editor-wrapper`    → `.message-editor-wrapper`
    8. `.compose-editor`            → `.message-editor`  (the large block ~286-577 including `> *:first-child`, `h1/h2/h3/p/ul/ol/li/blockquote/pre/code/strong/em/s`, `::selection`, `hr` descendant rules — only the leading class token changes; preserve every descendant selector)
    9. `.compose-link`              → `.message-editor-link`
    10. `.compose-window`           → `.message-composer-window`

    Apply each rename in BOTH global.css (selectors) AND the consumer components (className strings) in the same task:
    - global.css: all selectors + combinators + descendant rules per the order above.
    - ComposeModal.tsx: grep `compose-window` in className strings → `message-composer-window`.
    - ComposeEditor.tsx: grep every `compose-editor`, `compose-image*`, `compose-code-block`, `compose-link` token in className strings (and any Tiptap `editorProps.attributes.class` strings) → the mapped name.
    - ComposeSlashMenu.tsx: grep for any `compose-` className token → mapped name (likely none, but verify).

    Run `npx prettier --write` on all four files.
  </action>
  <acceptance_criteria>
    - `grep -rn "compose-window\|compose-editor\|compose-image\|compose-code-block\|compose-link" apps/staff-web/app` returns 0 matches (note: this pattern also covers the `-wrapper`/`-placeholder`/`-overlay`/`-btn` suffixed variants because they start with `compose-image`/`compose-editor`).
    - `grep -cn "message-editor" apps/staff-web/app/global.css` matches (renamed editor block present).
    - `grep -n "message-composer-window" apps/staff-web/app/global.css apps/staff-web/app/components/email/ComposeModal.tsx` matches in both.
    - `grep -n "message-editor" apps/staff-web/app/components/email/ComposeEditor.tsx` matches (consumer migrated).
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "compose-window\|compose-editor\|compose-image\|compose-code-block\|compose-link" apps/staff-web/app ; test $? -ne 0 && echo "PASS: no orphaned compose-* classes"</automated>
  </verify>
  <done>All `.compose-*` selectors renamed to `.message-composer-window`/`.message-editor*`; consumers migrated; zero `compose-*` class tokens remain in app/.</done>
</task>

</tasks>

<verification>
After both tasks (grep-based, no dev server):
- R-12 verification: `grep -rn "email-list-row\|email-body-content\|compose-window\|compose-editor\|compose-image\|compose-code-block\|compose-link" apps/staff-web/app` returns ZERO matches.
- New gym-domain classes exist in global.css: `grep -cn "conversation-row\|message-body-content\|message-composer-window\|message-editor" apps/staff-web/app/global.css` > 0.
- No component FILE or exported component name was renamed (that is R3-03) — `git diff --name-status` shows only modifications (M), no renames (R) for `components/email/*`.
- Fork boundary + NAME-05: `git diff --name-only` shows no change outside `apps/staff-web/app/`, and no schema/migration file touched.
</verification>

<success_criteria>
- NAME-04 (CSS portion): email-legacy CSS classes carry gym-domain names; component usage migrated atomically; zero orphans (R-12 satisfied).
- No styling lost: every old selector has a renamed equivalent with all combinators/descendants/media-queries preserved.
- Clean separation maintained: no file renames, no route changes, no DB changes.
</success_criteria>

<output>
After completion, create `.planning/phases/R3-naming-ia-pass/R3-02-SUMMARY.md`
</output>
