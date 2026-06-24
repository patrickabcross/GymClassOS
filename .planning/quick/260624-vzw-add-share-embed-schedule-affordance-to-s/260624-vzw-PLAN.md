---
phase: quick-260624-vzw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.schedule.tsx
autonomous: false
requirements: [QUICK-260624-vzw]
must_haves:
  truths:
    - "Studio owner sees a secondary Share/embed button in the schedule page header toolbar"
    - "Clicking the button opens a shadcn Popover containing the schedule embed snippet and a direct public link"
    - "Copy embed writes `<div data-gymos-schedule></div>\\n<script src=\"${origin}/embed.js\" async></script>` to the clipboard, shows a 2s copied state, and toasts \"Embed code copied\""
    - "Copy link writes `${origin}/embed/schedule` to the clipboard with its own copied state + toast"
    - "origin resolves client-side the same way the forms route does (prod-origin fallback before hydration)"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.schedule.tsx"
      provides: "Share/embed Popover affordance for the schedule embed snippet"
      contains: "data-gymos-schedule"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.schedule.tsx"
      to: "/embed.js + /embed/schedule"
      via: "embed snippet string + direct link copied to clipboard"
      pattern: "data-gymos-schedule"
---

<objective>
Add a secondary "Share / embed schedule" affordance to the staff schedule page header so the studio owner can copy the schedule embed snippet (and the direct public link) during onboarding.

Purpose: The schedule embed BACKEND is already fully built and live (`/embed/schedule` SSR route + `/embed.js` already handles `<div data-gymos-schedule>`). The ONLY missing piece is operator-facing UI to surface the snippet — this plan adds exactly that, mirroring the existing form embed Popover.

Output: A single-file change to `apps/staff-web/app/routes/gymos.schedule.tsx` adding a Tabler-icon header button that opens a shadcn `<Popover>` with two copy actions.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# THE FILE TO CHANGE — read its header toolbar (lines 427-471) and existing imports (lines 28-101)
@apps/staff-web/app/routes/gymos.schedule.tsx

# THE REFERENCE PATTERN — mirror the forms embed Popover exactly
@apps/staff-web/app/routes/gymos.forms.$id.tsx

# Confirms the data-gymos-schedule host element + snippet shape the embed.js host site uses
@apps/staff-web/features/forms/lib/embed-snippet.ts

<interfaces>
<!-- Contracts extracted from the codebase. Use these directly — no exploration needed. -->

shadcn primitives already present in staff-web (import paths confirmed):
```typescript
// @/components/ui/popover
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// @/components/ui/tooltip
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
```

Schedule page ALREADY imports (do NOT re-import): `Button` (@/components/ui/button), `Badge` (@/components/ui/badge), `Input` (NOT imported — add it if used), `useState`/`useEffect` (from react), `toast` (from sonner), `cn` (@/lib/utils), Tabler icons from `@tabler/icons-react`.

origin-resolution pattern from gymos.forms.$id.tsx (mirror EXACTLY — there is NO shared helper):
```typescript
// Origin is only known client-side (logged-in CSR page). Default to the prod
// origin so the snippet is correct if read before hydration.
const [origin, setOrigin] = useState("https://gym-class-os.vercel.app");
useEffect(() => { setOrigin(window.location.origin); }, []);
```

Forms copyEmbed pattern (mirror for the schedule version):
```typescript
const embedSnippet = `<div data-gymos-schedule></div>\n<script src="${origin}/embed.js" async></script>`;
const scheduleLink = `${origin}/embed/schedule`;
function copyEmbed() {
  navigator.clipboard.writeText(embedSnippet);
  setEmbedCopied(true);
  setTimeout(() => setEmbedCopied(false), 2000);
  toast.success("Embed code copied");
}
```

Schedule header toolbar insertion point — gymos.schedule.tsx lines 427-471, the right-hand
`<div className="flex items-center gap-2">` cluster containing ManageTrainersDialog,
NewClassDialog, the "this month" Badge, the Today button, and the prev/next month controls.
The Share button is a SECONDARY action — place it in this cluster (e.g. right after
NewClassDialog or alongside the Today button), as an icon/ghost `<Button>`, NOT a loud
primary CTA, NOT a new always-visible panel.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Share/embed Popover to the schedule header</name>
  <files>apps/staff-web/app/routes/gymos.schedule.tsx</files>
  <action>
Single-file change. Mirror the form embed Popover from `apps/staff-web/app/routes/gymos.forms.$id.tsx` (origin resolution, copyEmbed, the Popover markup at lines ~504-579). Do NOT touch the loader, the booking action, the booking dialog, or the series-cancel logic.

1. **Imports** (add to existing import blocks — do NOT duplicate existing imports):
   - Add `Input` from `@/components/ui/input` (used for the read-only snippet/link fields, matching the forms popover).
   - Add `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`.
   - Add `Tooltip, TooltipTrigger, TooltipContent` from `@/components/ui/tooltip`.
   - Add Tabler icons to the existing `@tabler/icons-react` import: `IconShare2` (or `IconShare` — trigger icon), `IconCopy`, `IconCheck`. `useState`/`useEffect` are already imported from "react".

2. **State + origin resolution** (inside `GymosSchedule()`, near the other `useState` hooks ~line 300-318):
   ```typescript
   const [origin, setOrigin] = useState("https://gym-class-os.vercel.app");
   const [embedCopied, setEmbedCopied] = useState(false);
   const [linkCopied, setLinkCopied] = useState(false);
   useEffect(() => { setOrigin(window.location.origin); }, []);
   ```
   This mirrors the forms route exactly (prod-origin fallback before hydration). Do NOT hardcode `https://gym-class-os.vercel.app` anywhere else inline — only as this fallback initial state.

3. **Derived snippet + handlers** (near the other derived values, before the `return`):
   ```typescript
   const embedSnippet = `<div data-gymos-schedule></div>\n<script src="${origin}/embed.js" async></script>`;
   const scheduleLink = `${origin}/embed/schedule`;
   function copyEmbed() {
     navigator.clipboard.writeText(embedSnippet);
     setEmbedCopied(true);
     setTimeout(() => setEmbedCopied(false), 2000);
     toast.success("Embed code copied");
   }
   function copyScheduleLink() {
     navigator.clipboard.writeText(scheduleLink);
     setLinkCopied(true);
     setTimeout(() => setLinkCopied(false), 2000);
     toast.success("Link copied to clipboard");
   }
   ```

4. **Button + Popover** in the header toolbar cluster (the `<div className="flex items-center gap-2">` at line ~427). Insert a secondary ghost icon button — e.g. right after `<NewClassDialog ... />` (line ~429-433), BEFORE the "this month" Badge — so the share affordance sits with the page-level actions, not the calendar nav. Mirror the forms Popover (lines ~504-579), adapted for the schedule:
   - `<Popover>` wrapping a `<Tooltip>` whose `<PopoverTrigger asChild>` is a `<Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Share or embed schedule">` containing `<IconShare2 className="h-4 w-4" />` (size to match neighbouring h-7 controls). The button is NOT disabled (the schedule embed is always available — unlike a draft form). Tooltip content: "Share or embed the class schedule".
   - `<PopoverContent align="end" className="w-96 space-y-4">` with two blocks:
     - **Public link** block: label `<p className="text-xs font-medium">Public link</p>`, a read-only `<Input readOnly value={scheduleLink} onFocus={(e) => e.currentTarget.select()} className="h-8 text-xs font-mono" />` + a `<Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copyScheduleLink} aria-label="Copy public link">` showing `{linkCopied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}`.
     - **Embed snippet** block: a header row with `<p className="text-xs font-medium">Embed on your website</p>` and a ghost Copy button `onClick={copyEmbed}` showing `{embedCopied ? <IconCheck .../> : <IconCopy .../>}` + the text `{embedCopied ? "Copied" : "Copy"}`; then a `<pre className="rounded-md bg-muted p-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all">{embedSnippet}</pre>`; then a `<p className="text-[11px] text-muted-foreground">` help line e.g. "Paste this on your website where you want the class timetable to appear. It auto-resizes to fit."

CONSTRAINTS (per AGENTS.md): shadcn `Popover` + Tabler icons only — NO custom `position:absolute` dropdown, NO emojis, NO `window.confirm/alert/prompt`. Copy is a synchronous `navigator.clipboard.writeText` + instant `toast` (optimistic/instant UX). Keep the header clean — the button is a secondary icon action in the existing toolbar, NOT a new always-visible panel. No backend, no DB, no migration, no new route, no new action — `/embed/schedule` and `/embed.js` already exist and already handle `data-gymos-schedule`.

Run `npx prettier --write apps/staff-web/app/routes/gymos.schedule.tsx` after editing.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -i "gymos.schedule" || echo "OK: no tsc errors referencing gymos.schedule.tsx"</automated>
  </verify>
  <done>
    `tsc --noEmit` reports zero errors referencing `gymos.schedule.tsx`. The file imports `Popover`/`PopoverContent`/`PopoverTrigger` from `@/components/ui/popover`, `Tooltip`* from `@/components/ui/tooltip`, and `IconShare2`/`IconCopy`/`IconCheck` from `@tabler/icons-react`. The header toolbar contains a ghost icon `<Button>` that opens a `<Popover>` whose content includes a `<pre>` with `data-gymos-schedule`, a Copy-embed button (2s `embedCopied` state + `toast.success("Embed code copied")`), and a Copy-link button for `${origin}/embed/schedule` (2s `linkCopied` state + toast). `origin` defaults to the prod origin and is set to `window.location.origin` in a `useEffect`. No loader/action/booking-dialog logic changed.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
A secondary "Share / embed schedule" icon button (Tabler `IconShare2`) in the `/gymos/schedule` page header toolbar that opens a shadcn Popover with (1) a copyable direct public link to `/embed/schedule` and (2) the `<div data-gymos-schedule></div>` + `<script src=".../embed.js" async></script>` embed snippet with its own Copy button. Copy actions write to the clipboard synchronously, flip a 2-second copied checkmark, and toast.
  </what-built>
  <how-to-verify>
1. Deploy is via `git push origin master` (per STATE.md — the `vercel` CLI hits the 10 MB cap). Once live, visit `https://gym-class-os.vercel.app/gymos/schedule` (logged in as an operator).
2. Confirm the new share icon button sits in the top-right header toolbar as a quiet secondary action (not a loud primary CTA), next to New Class / Today.
3. Click it — a Popover opens showing the public link field and the embed snippet `<pre>`.
4. Click "Copy" on the embed snippet — confirm the checkmark appears for ~2s, a "Embed code copied" toast shows, and pasting elsewhere yields exactly:
   `<div data-gymos-schedule></div>`
   `<script src="https://gym-class-os.vercel.app/embed.js" async></script>`
5. Click the copy-link button — confirm "Link copied to clipboard" toast and the clipboard contains `https://gym-class-os.vercel.app/embed/schedule`.
6. (Optional end-to-end) Paste the embed snippet into a test HTML page / Squarespace block and confirm the schedule widget iframe renders (the backend already supports this — cross-origin headers fixed in quick 260624-icd).
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues (e.g. wrong copy text, button too prominent, snippet malformed).</resume-signal>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` produces no error referencing `gymos.schedule.tsx`.
- Only `apps/staff-web/app/routes/gymos.schedule.tsx` is modified (no schema, no actions, no new routes).
- Grep confirms the snippet string contains `data-gymos-schedule` and `${origin}/embed.js`, and the link uses `${origin}/embed/schedule`.
- No `position:absolute` custom dropdown, no emoji icons, no `window.confirm/alert/prompt` introduced.
</verification>

<success_criteria>
- A secondary, quiet header button on `/gymos/schedule` opens a shadcn Popover surfacing the schedule embed snippet and direct link.
- Copy embed → clipboard gets `<div data-gymos-schedule></div>\n<script src="${origin}/embed.js" async></script>`, 2s copied state, "Embed code copied" toast.
- Copy link → clipboard gets `${origin}/embed/schedule`, 2s copied state, toast.
- `origin` resolves client-side with the prod-origin fallback (mirrors the forms route).
- staff-web `tsc --noEmit` clean for this file; schedule layout stays clean (no new always-visible panel).
</success_criteria>

<output>
After completion, create `.planning/quick/260624-vzw-add-share-embed-schedule-affordance-to-s/260624-vzw-SUMMARY.md`
</output>
