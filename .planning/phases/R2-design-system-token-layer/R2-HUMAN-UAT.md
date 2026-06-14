---
status: partial
phase: R2-design-system-token-layer
source: [R2-VERIFICATION.md]
started: 2026-06-13T00:00:00Z
updated: 2026-06-13T00:00:00Z
---

## Current Test

[awaiting human testing — requires a live Vercel deploy of branch `redesign/ui-refresh`]

## Tests

### 1. Deploy-time skin switch (DSGN-02 / DSGN-03)
expected: Set `GYMOS_STUDIO_SKIN=hustle` in the Vercel dashboard and redeploy. Open `/gymos` — nav renders "Hustle" (not "GymClassOS"), primary color is indigo (not orange), and `<html data-studio="hustle">` appears in DevTools Elements. No code change required to switch.
result: [pending]

### 2. Radix portal skin inheritance (pitfall R-14)
expected: With `GYMOS_STUDIO_SKIN=hustle` active, open a Radix portal (Dialog / Tooltip / Popover / Select) on `/gymos`. The portalled content renders in indigo (not orange) — confirming `data-studio` on `<html>` reaches elements mounted at `document.body`.
result: [pending]

### 3. No FOUC on hard reload (pitfall R-15)
expected: Hard-reload `/gymos` with `GYMOS_STUDIO_SKIN=hustle` set and cache disabled. No flash of orange (default skin) before indigo renders — confirms `data-studio` is set SSR-inline, not via `useEffect`.
result: [pending]

### 4. No Google Fonts request on staff-web pages (DSGN-04)
expected: Open DevTools Network tab on `/gymos`, `/gymos/schedule`, `/gymos/inbox` and filter for `fonts.googleapis.com`. Zero requests; Inter loads as `/fonts/inter-variable.woff2` (200, same-origin).
result: [pending]

### 5. No Google Fonts request on embed/SSR pages (DSGN-04)
expected: Open an embed page (`/embed/schedule` or a public form `/f/<slug>`) and check the Network tab for `fonts.googleapis.com`. Zero requests — each SSR page's inline `@font-face` covers it.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
