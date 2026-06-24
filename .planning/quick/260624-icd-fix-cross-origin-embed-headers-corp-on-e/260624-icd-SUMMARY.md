---
type: quick-summary
slug: 260624-icd
title: Fix cross-origin embed headers (CORP + X-Frame-Options) so embeds work on third-party sites
status: complete
completed: 2026-06-24
duration_min: ~8
tasks_completed: 3
files_changed: 3
commits:
  - hash: 8c5ce184
    message: "fix(embed): set CORP cross-origin on /embed.js so the snippet loads on third-party sites"
  - hash: 5f6e19b1
    message: "fix(embed): drop X-Frame-Options:DENY on public form + schedule widget SSR so they iframe cross-origin"
---

# Quick Task 260624-icd — Summary

**One-liner:** Added `Cross-Origin-Resource-Policy: cross-origin` to `/embed.js` and `removeResponseHeader(event, "X-Frame-Options")` to both public SSR handlers so the embed snippet and its iframes load on doyouhustle.co.uk.

## Problem

Two framework security headers set by `packages/core/src/server/security-headers.ts` on every production response blocked the embed from working cross-origin:

1. `Cross-Origin-Resource-Policy: same-site` — blocked the `<script src="/embed.js">` from being fetched by a third-party site.
2. `X-Frame-Options: DENY` — blocked the form and schedule-widget iframes even though both handlers already emitted `Content-Security-Policy: frame-ancestors *`.

## Fix Applied

### Task 1 — CORP override on /embed.js

**File:** `apps/staff-web/server/routes/embed.js.get.ts`

Added after the existing `Cache-Control` `setResponseHeader` call (before `return js`):

```ts
// CORP cross-origin lets the <script src> load from third-party sites (e.g. doyouhustle.co.uk);
// framework middleware defaults to same-site which blocks it.
setResponseHeader(event, "Cross-Origin-Resource-Policy", "cross-origin");
```

`setResponseHeader` was already imported from `"h3"` — no import change needed.

**Commit:** `8c5ce184`

### Task 2 — Remove X-Frame-Options on public form + schedule widget SSR

**Files:**
- `apps/staff-web/features/forms/lib/public-form-ssr.ts`
- `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts`

Both files had their h3 import updated to add `removeResponseHeader`, and a call to `removeResponseHeader(event, "X-Frame-Options")` was inserted immediately before each `return new Response(...)`. The existing `Content-Security-Policy: frame-ancestors *` headers were left untouched.

**public-form-ssr.ts** — import change:
```ts
import { getMethod, getRequestURL, removeResponseHeader, type H3Event } from "h3";
```

**schedule-widget-ssr.ts** — import change:
```ts
import { getRequestURL, removeResponseHeader, type H3Event } from "h3";
```

**Commit:** `5f6e19b1`

### Task 3 — TypeScript gate

`cd apps/staff-web && npx tsc --noEmit` exited 0. `removeResponseHeader` is a standard h3 export — no type errors.

## What Was NOT Changed

- `packages/core` — not touched (upstream-merge rule).
- `server/middleware/00-public-cors.ts` — not touched (CORS / `Access-Control-Allow-Origin: *` already correct).
- No schema changes, no Fly/worker changes, no migration.

## Production Verification (post-deploy — orchestrator/user action)

Deploy is `git push origin master` → Vercel auto-deploy. After deploy:

```bash
# Should show: cross-origin-resource-policy: cross-origin  AND  access-control-allow-origin: *
curl -sI https://gym-class-os.vercel.app/embed.js | grep -i -E "cross-origin-resource-policy|access-control-allow-origin"

# Should show: content-security-policy: frame-ancestors *  AND  no x-frame-options line
curl -sI "https://gym-class-os.vercel.app/f/<slug>" | grep -i -E "x-frame-options|content-security-policy"
```

## Self-Check

- [x] `apps/staff-web/server/routes/embed.js.get.ts` — CORP header present (commit `8c5ce184`)
- [x] `apps/staff-web/features/forms/lib/public-form-ssr.ts` — `removeResponseHeader` imported + called (commit `5f6e19b1`)
- [x] `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` — `removeResponseHeader` imported + called (commit `5f6e19b1`)
- [x] Both SSR files still contain `frame-ancestors *` CSP (unchanged)
- [x] `npx tsc --noEmit` → exit 0 (TSC_CLEAN)
- [x] No `packages/core` edits
- [x] No CORS edits
- [x] No Fly/worker/migration changes

## Self-Check: PASSED
