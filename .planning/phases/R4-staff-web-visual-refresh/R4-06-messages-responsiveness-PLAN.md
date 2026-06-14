---
phase: R4-staff-web-visual-refresh
plan: 06
type: execute
wave: 2
depends_on: [R4-05]
files_modified:
  - apps/staff-web/app/routes/gymos.messages.tsx
autonomous: true
requirements: [SWEB-06]
must_haves:
  truths:
    - "On desktop (>=768px) Messages keeps the three-pane side-by-side layout"
    - "On mobile (<768px) Messages is single-column; the member-context panel is hidden"
    - "On mobile, opening a conversation reveals a member icon-button that opens the member context in a bottom Sheet"
    - "On mobile, an open thread shows a back affordance to return to the conversation list"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.messages.tsx"
      provides: "Responsive 3-pane→single-column layout with bottom-Sheet member context on mobile"
      contains: "side=\"bottom\""
  key_links:
    - from: "apps/staff-web/app/routes/gymos.messages.tsx"
      to: "member context bottom Sheet"
      via: "shadcn Sheet side=bottom triggered by a thread-header IconUser button"
      pattern: "SheetContent|side=\"bottom\""
---

<objective>
Make the Messages surface responsive per R4-UI-SPEC §5: keep the desktop 3-pane layout, collapse to single column on mobile, and move the member-context widget cards into a bottom Sheet triggered from the thread header.

Purpose: SWEB-06 — Messages is responsive; single column at mobile widths with member context as a bottom sheet (coaches check from phones on the gym floor).
Output: Updated `gymos.messages.tsx` responsive classes + a Sheet. Depends on R4-05 (this file's member-context widget cards must already exist so the same card stack can render inside the Sheet). Reuse the widget-card markup from R4-05 — extract it to a small local component so it renders in both the desktop aside and the Sheet.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md
@.planning/phases/R4-staff-web-visual-refresh/R4-05-member-context-widget-cards-PLAN.md

<interfaces>
After R4-05 the layout is: `<aside w-[320px]>` (conversation list) | `<main flex-1>` (thread) | `<aside w-[300px]>` (member-context widget cards). The thread header is at lines ~813-848 (member name/phone + window-state badge). Selected conversation is URL-driven via `?conversation=<id>`.
Available shadcn primitives: Sheet, SheetTrigger, SheetContent (apps/staff-web/app/components/ui/sheet.tsx), Button, Avatar. Tabler IconUser. Tailwind `md:` breakpoint = 768px.
The component already imports `Link` and `useSearchParams` from react-router.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract member-context widget stack into a reusable local component</name>
  <files>apps/staff-web/app/routes/gymos.messages.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.messages.tsx (the member-context `<aside>` built in R4-05)
    - R4-UI-SPEC.md §5 "Bottom Sheet trigger (mobile member context)" — content identical to desktop panel
  </read_first>
  <action>
    Extract the three-widget-card markup (Avatar+name+phone header, Pass Balance, Next Class, Last Visit cards, View Member Profile button) from the desktop `<aside>` into a local function component in the same file, e.g. `function MemberContextCards({ member, stats, upcomingBooking, lastVisit }: {...})`, returning just the inner card stack (no `<aside>` wrapper). Render it inside the existing desktop `<aside>`. This makes the same content reusable in the mobile Sheet (Task 2) without duplication. Pass the loader-derived props through.

    No behavior change on desktop — same cards, same data.
  </action>
  <acceptance_criteria>
    - `grep -n "function MemberContextCards\|MemberContextCards(" apps/staff-web/app/routes/gymos.messages.tsx` returns matches (defined + used in the aside)
    - `grep -n "PASS BALANCE\|NEXT CLASS\|LAST VISIT" apps/staff-web/app/routes/gymos.messages.tsx` still returns matches (content preserved)
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>The member-context card stack is a reusable local component rendered in the desktop aside; no content/behavior change on desktop.</done>
</task>

<task type="auto">
  <name>Task 2: Responsive layout — single-column mobile + bottom Sheet member context</name>
  <files>apps/staff-web/app/routes/gymos.messages.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.messages.tsx (root layout `<div className="flex h-full w-full overflow-hidden">` line ~650, the three panes, thread header lines ~813-848)
    - R4-UI-SPEC.md §5 Messages Responsiveness (desktop 3-pane, mobile single-column, bottom Sheet trigger, breakpoint, back navigation)
  </read_first>
  <action>
    Apply Tailwind responsive classes per R4-UI-SPEC §5. Use `md` (768px) as the breakpoint. Layout state is URL-driven by `?conversation=` (no new state needed): when no conversation is selected, the conversation list is the visible pane on mobile; when one is selected, the thread is visible.

    1. Conversation-list `<aside>` (w-[320px]): make it `w-full md:w-[320px]` and hide it on mobile when a conversation is selected: `className={cn("... w-full md:w-[320px]", selectedId && "hidden md:flex")}`. On desktop it always shows.
    2. Thread `<main flex-1>`: hide on mobile when NO conversation is selected so the list owns the screen: `className={cn("flex-1 ... min-w-0", !selectedId && "hidden md:flex")}`.
    3. Desktop member-context `<aside w-[300px]>`: add `hidden md:flex` (per §5 "Below md, hide the context panel").
    4. In the thread header (lines ~813-848), add a mobile-only member-context trigger + a back affordance:
       - Back: a Link "← Messages" shown `md:hidden` that navigates to `/gymos/messages${isLeadsView ? "?filter=leads" : ""}` (drops the ?conversation param), placed before the member name.
       - Member Sheet trigger (`md:hidden`):
         ```tsx
         <Sheet>
           <SheetTrigger asChild>
             <Button variant="outline" size="icon" className="h-9 w-9 md:hidden">
               <IconUser size={18} aria-hidden />
               <span className="sr-only">Member context</span>
             </Button>
           </SheetTrigger>
           <SheetContent side="bottom" className="h-[60vh] overflow-y-auto rounded-t-[calc(var(--radius)+0.25rem)]">
             <MemberContextCards member={data.selectedMember} stats={data.memberStats} upcomingBooking={data.upcomingBooking} lastVisit={data.memberStats?.lastVisit} />
           </SheetContent>
         </Sheet>
         ```
         Only render the Sheet trigger when `data.selectedMember && data.memberStats` exist.
    5. Import `Sheet, SheetTrigger, SheetContent` from "@/components/ui/sheet" and `IconUser` from "@tabler/icons-react".

    Keep the existing window-state badge in the thread header. Do not change the reply form or message bubbles.
  </action>
  <acceptance_criteria>
    - `grep -n "side=\"bottom\"" apps/staff-web/app/routes/gymos.messages.tsx` returns a match
    - `grep -n "SheetContent\|SheetTrigger" apps/staff-web/app/routes/gymos.messages.tsx` returns matches
    - `grep -n "hidden md:flex\|hidden md:block" apps/staff-web/app/routes/gymos.messages.tsx` returns at least 2 matches (list + context panel responsive)
    - `grep -n "md:hidden" apps/staff-web/app/routes/gymos.messages.tsx` returns matches (mobile trigger + back nav)
    - `grep -n "← Messages" apps/staff-web/app/routes/gymos.messages.tsx` returns a match
    - `grep -n "IconUser" apps/staff-web/app/routes/gymos.messages.tsx` returns a match (Tabler, no emoji)
    - `grep -n "rounded-t-\[calc(var(--radius)" apps/staff-web/app/routes/gymos.messages.tsx` returns a match (skin-correct sheet radius)
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Desktop keeps 3 panes; mobile shows a single column (list, then thread on select) with a back affordance and an IconUser button that opens the member-context cards in a bottom Sheet; guard exits 0.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0.
- `npx prettier --write apps/staff-web/app/routes/gymos.messages.tsx` runs clean.
- Static grep confirms responsive classes, bottom Sheet, mobile trigger + back nav, Tabler icon.
- Mobile single-column, sheet-slide, and desktop 3-pane are deploy/UAT (375px + 1280px screenshots via scripts/ui-baseline/).
</verification>

<success_criteria>
SWEB-06: Messages is responsive — desktop 3-pane, mobile single-column with the member context in a bottom Sheet and a back-to-list affordance. Reuses the R4-05 widget cards in both surfaces.
</success_criteria>

<output>
After completion, create `.planning/phases/R4-staff-web-visual-refresh/R4-06-messages-responsiveness-SUMMARY.md`
Run `npx prettier --write` on the modified file.
</output>
