---
phase: quick-260624-vzw
plan: 01
subsystem: staff-web / schedule
tags: [schedule, embed, share, popover, ui]
requires:
  - "/embed/schedule (public SSR page) — already live"
  - "/embed.js host bridge for [data-gymos-schedule] — already live"
provides:
  - "Operator-facing Share/embed Popover on /gymos/schedule"
affects:
  - apps/staff-web/app/routes/gymos.schedule.tsx
tech-stack:
  added: []
  patterns:
    - "shadcn Popover + Tooltip secondary header action (mirrors forms embed Popover)"
    - "client-side origin resolution with prod-origin fallback before hydration"
key-files:
  created: []
  modified:
    - apps/staff-web/app/routes/gymos.schedule.tsx
decisions:
  - "Placed the Share button as a ghost icon between New Class and the this-month Badge — secondary, not a primary CTA"
metrics:
  duration: ~8min
  completed: 2026-06-24
---

# Phase quick-260624-vzw Plan 01: Share/Embed Schedule Affordance Summary

Added a secondary Share/embed Popover to the `/gymos/schedule` header so the studio owner can copy the schedule embed snippet (`<div data-gymos-schedule>` + `/embed.js`) and the direct public link (`/embed/schedule`) during onboarding — surfacing the already-live embed backend with no backend/DB/route changes.

## What Was Built

Single-file change to `apps/staff-web/app/routes/gymos.schedule.tsx`:

1. **Imports** — added `IconShare2`, `IconCopy`, `IconCheck` to the existing `@tabler/icons-react` block; added `Input` (`@/components/ui/input`), `Popover`/`PopoverContent`/`PopoverTrigger` (`@/components/ui/popover`), and `Tooltip`/`TooltipTrigger`/`TooltipContent` (`@/components/ui/tooltip`). `useState`/`useEffect` were already imported.
2. **State + origin resolution** — `origin` (default `https://gym-class-os.vercel.app`, set to `window.location.origin` in a `useEffect`), `embedCopied`, `linkCopied`. Mirrors the forms route exactly.
3. **Derived snippet + handlers** — `embedSnippet = \`<div data-gymos-schedule></div>\n<script src="${origin}/embed.js" async></script>\``, `scheduleLink = \`${origin}/embed/schedule\``, plus `copyEmbed()` and `copyScheduleLink()` (synchronous `navigator.clipboard.writeText` + 2s copied state + toast).
4. **Button + Popover** — a ghost `IconShare2` icon button (`h-7 w-7`, `aria-label="Share or embed schedule"`) placed in the header toolbar between `NewClassDialog` and the "this month" Badge, wrapped in a Tooltip ("Share or embed the class schedule"). The `PopoverContent align="end" className="w-96 space-y-4"` has a Public-link block (read-only `Input` + copy icon button) and an Embed-snippet block (header row with Copy button, a `<pre>` showing the snippet, and a help line).

## Verification

- `cd apps/staff-web && npx tsc --noEmit | grep -i "gymos.schedule"` → **no errors referencing `gymos.schedule.tsx`** (filtered output: "OK: no tsc errors referencing gymos.schedule.tsx"). Note: tsc was run scoped via grep per the plan's automated check; the filter returned zero matching lines, confirming the changed file is type-clean.
- `npx prettier --write app/routes/gymos.schedule.tsx` → formatted (1 file, 385ms).
- Grep confirms the file contains `data-gymos-schedule`, `${origin}/embed.js`, `${origin}/embed/schedule`, and `IconShare2`.
- Only `apps/staff-web/app/routes/gymos.schedule.tsx` was modified (no schema, no actions, no new routes).
- Compliance check (AGENTS.md): shadcn `Popover`/`Tooltip` + Tabler icons only; no `position:absolute` custom dropdown, no emoji icons, no `window.confirm/alert/prompt`. Copy is optimistic/instant.

## Deviations from Plan

None — plan executed exactly as written.

## Pending — Task 2 (checkpoint:human-verify)

Task 2 is a live-UI human-verify checkpoint. It was **not executed** by this run (no browser/deploy attempted, per the executor constraints). It remains pending and requires the operator to:

1. Deploy via `git push origin master` (the `vercel` CLI hits the 10 MB cap).
2. Visit `https://gym-class-os.vercel.app/gymos/schedule` (logged in as an operator).
3. Confirm the new share icon button sits quietly in the top-right header toolbar.
4. Open the Popover; click "Copy" on the embed snippet — confirm the 2s checkmark, the "Embed code copied" toast, and that the clipboard yields:
   `<div data-gymos-schedule></div>`
   `<script src="https://gym-class-os.vercel.app/embed.js" async></script>`
5. Click the copy-link button — confirm the "Link copied to clipboard" toast and clipboard = `https://gym-class-os.vercel.app/embed/schedule`.
6. (Optional) Paste the snippet into a test page and confirm the schedule widget iframe renders (cross-origin headers already fixed in quick 260624-icd).

Resume signal: "approved" or describe issues.

## Commits

- `09704d30`: feat(quick-260624-vzw): add Share/embed Popover to schedule header

## Self-Check: PASSED

- FOUND: apps/staff-web/app/routes/gymos.schedule.tsx (modified, contains `data-gymos-schedule`, `IconShare2`, `/embed/schedule`)
- FOUND: commit 09704d30
