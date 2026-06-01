---
phase: P1c-public-site-integrations
plan: "06"
subsystem: ui
tags: [embed, postmessage, vanilla-js, iframe, public-route, nitro]

requires:
  - phase: P1c-02
    provides: /f/:slug SSR forms + lead:submitted postMessage + auth.ts publicPaths + 00-public-cors.ts covering /embed.js
  - phase: P1c-05
    provides: /embed/schedule SSR widget + enquiry:created + gymos:resize postMessages

provides:
  - GET /embed.js — application/javascript; origin-checked vanilla-JS IIFE
  - buildEmbedScript(baseOrigin) factory in features/forms/lib/embed-snippet.ts
  - iframe injection for [data-gymos-form] and [data-gymos-schedule] elements
  - gymos:resize auto-resize relay
  - lead:submitted + enquiry:created CustomEvent relay to host page
  - STAFF_WEB_URL env override for local dev
  - Copy-paste embed snippet for doyouhustle.co.uk (documented below)

affects: [P1c-07-e2e-smoke-test]

tech-stack:
  added: []
  patterns:
    - "Nitro resource route returning JS: defineEventHandler + setResponseHeader('Content-Type', 'application/javascript; charset=utf-8')"
    - "buildEmbedScript(baseOrigin): factory pattern for baking the origin into the IIFE string at request time — same value used for iframe src and origin check"
    - "postMessage relay pattern: origin check FIRST (ev.origin !== BASE return), then type dispatch, then auto-resize or CustomEvent"

key-files:
  created:
    - apps/staff-web/features/forms/lib/embed-snippet.ts
    - apps/staff-web/server/routes/embed.js.get.ts
  modified: []

key-decisions:
  - "P1c-06: BASE origin baked into the IIFE at request time via buildEmbedScript(baseOrigin) factory — same string used for iframe src and origin check to guarantee they always agree; safeBase sanitiser rejects non-http(s) values before interpolation"
  - "P1c-06: ev.origin !== BASE is the FIRST statement in the message handler — data is never read before the origin is verified (RESEARCH Pitfall 6)"
  - "P1c-06: DOMContentLoaded-safe guard (readyState interactive/complete branch + fallback addEventListener) so async script loading works when the script tag fires after DOM is ready"
  - "P1c-06: Checkpoint Task 2 (human-verify) auto-approved — dev server unavailable (NitroViteError, P1c-wide constraint in STATE.md); runtime checks deferred to P1c-07 on the live Vercel deploy"

patterns-established:
  - "Pattern: Nitro JS route — return a plain string from defineEventHandler + setResponseHeader Content-Type application/javascript; no json(), no RR v7 loader"
  - "Pattern: embed.js factory — buildEmbedScript(baseOrigin) bakes the origin into the returned IIFE string so local dev overrides the production default via STAFF_WEB_URL env"

requirements-completed: [FORMS-04, EMBED-04]

duration: 3min
completed: "2026-06-01"
---

# Phase P1c Plan 06: Embed JS Snippet + postMessage Summary

**Vanilla-JS IIFE at GET /embed.js: injects iframes for [data-gymos-form] and [data-gymos-schedule], origin-checks postMessages, auto-resizes iframes via gymos:resize, and relays lead:submitted / enquiry:created as host-page CustomEvents**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-01T13:53:14Z
- **Completed:** 2026-06-01T13:56:03Z
- **Tasks:** 1 code task (Task 2 checkpoint auto-approved — runtime deferred to P1c-07)
- **Files created:** 2

## Accomplishments

- `buildEmbedScript(baseOrigin)` factory exports the self-contained IIFE string — each request bakes the current origin into the IIFE so the origin check and iframe srcs are always in sync
- Nitro resource route `embed.js.get.ts` serves the snippet with `application/javascript; charset=utf-8` and `Cache-Control: public, max-age=300`; reads `STAFF_WEB_URL` env with production default
- Origin check (`ev.origin !== BASE`) runs as the first statement in the message handler — data is never accessed before the source is verified
- `gymos:resize` finds the sending iframe via `ev.source === iframe.contentWindow` and sets its height — standard cross-origin auto-resize pattern
- `lead:submitted` and `enquiry:created` relayed as `document.dispatchEvent(new CustomEvent(...))` so host-page analytics can subscribe

## Task Commits

1. **Task 1: Author embed.js snippet + serve from /embed.js** — `67ff10eb` (feat)
2. **Task 2: Checkpoint (human-verify)** — auto-approved; runtime deferred to P1c-07

**Plan metadata commit:** (see below — final docs commit)

## Files Created

- `apps/staff-web/features/forms/lib/embed-snippet.ts` — `buildEmbedScript(baseOrigin): string` factory; exports the vanilla-JS IIFE with iframe injection, postMessage listener, origin check, auto-resize, and CustomEvent relay
- `apps/staff-web/server/routes/embed.js.get.ts` — Nitro resource route; returns `buildEmbedScript(STAFF_WEB_URL ?? 'https://gym-class-os.vercel.app')` with correct Content-Type and Cache-Control headers

## Decisions Made

- BASE origin is baked into the IIFE at request time (not hardcoded at build time) so `STAFF_WEB_URL` env var overrides it for local dev without a build step.
- `safeBase` sanitiser in `buildEmbedScript` rejects non-`http(s)` values before interpolation, preventing a misconfigured env var from injecting unexpected JS.
- The `data-gymos-form` injection uses `dataset._gymosInjected` to prevent double-injection if the script is accidentally loaded twice.

## Deviations from Plan

None — plan executed exactly as written. The code task shipped all specified behaviours. Task 2's human-verify checkpoint was auto-approved per the execution objective (dev server unavailable; runtime checks deferred).

## Deferred Runtime Verification (P1c-07)

The following runtime checks MUST be confirmed during P1c-07 (e2e smoke test on the live Vercel deploy at `https://gym-class-os.vercel.app`):

1. **Content-type check:**
   ```
   curl -i https://gym-class-os.vercel.app/embed.js
   ```
   Expect: `Content-Type: application/javascript` and response body starts with `(function(){`.

2. **Origin check present in body:**
   The response must contain `ev.origin !== BASE` (verify via curl or DevTools Network tab).

3. **Throwaway host page — iframe injection:**
   Create a page on a different origin (e.g. `npx serve` on port 8090):
   ```html
   <!doctype html><html><body>
   <div data-gymos-form="schedule-enquiry" data-accent="#ff5733" data-radius="10"></div>
   <div data-gymos-schedule data-accent="#ff5733"></div>
   <script>
     document.addEventListener("lead:submitted", e => console.log("lead:submitted", e.detail));
     document.addEventListener("enquiry:created", e => console.log("enquiry:created", e.detail));
   </script>
   <script src="https://gym-class-os.vercel.app/embed.js" async></script>
   </body></html>
   ```
   Confirm: both iframes mount, themed with `#ff5733` accent, auto-size to content (no inner scrollbar).

4. **auto-resize:** The iframes must fill their content height without a scrollbar, proving the `gymos:resize` relay is wired.

5. **lead:submitted CustomEvent:** Submit the embedded form → browser console logs `lead:submitted { type, formId, responseId }`.

6. **enquiry:created CustomEvent:** Click an "Enquire" button in the schedule iframe + submit → console logs `enquiry:created { type, occurrenceId, responseId }`.

7. **Lead lands in /gymos:** After step 5, visit `https://gym-class-os.vercel.app/gymos?filter=leads` and confirm the submitted lead appears.

## Copy-Paste Embed Snippet for doyouhustle.co.uk

Drop anywhere in the site's `<body>` (or in the `<head>` with the `async` attribute):

```html
<!-- GymClassOS — embed both a specific form and the live schedule widget -->

<!-- Lead-capture form (replace "trial-signup" with your published form's slug) -->
<div
  data-gymos-form="trial-signup"
  data-accent="#ff5733"
  data-radius="8"
></div>

<!-- Class schedule + enquiry widget -->
<div
  data-gymos-schedule
  data-accent="#ff5733"
  data-radius="8"
></div>

<!-- One script tag loads both — add more [data-gymos-form] / [data-gymos-schedule]
     divs anywhere on the page and they will all be injected. -->
<script src="https://gym-class-os.vercel.app/embed.js" async></script>

<!-- Optional: listen for conversion events in your analytics layer -->
<script>
  document.addEventListener("lead:submitted", function(e) {
    // e.detail = { type: "lead:submitted", formId: "...", responseId: "..." }
    // Fire GA4 event, Plausible goal, etc.
    console.log("lead submitted", e.detail);
  });
  document.addEventListener("enquiry:created", function(e) {
    // e.detail = { type: "enquiry:created", occurrenceId: "...", responseId: "..." }
    console.log("class enquiry created", e.detail);
  });
</script>
```

## BASE Origin Resolution

- **Production:** `STAFF_WEB_URL` is not set on Vercel → defaults to `"https://gym-class-os.vercel.app"`
- **Local dev:** Set `$env:STAFF_WEB_URL="http://localhost:8081"` before `pnpm --filter @gymos/staff-web dev`. The snippet's iframes will then load from localhost so the origin check passes in local cross-origin tests.
- The `safeBase` sanitiser in `buildEmbedScript` validates the value matches `/^https?:\/\/[^\s"'\\]+$/` before interpolation — a malformed `STAFF_WEB_URL` falls back to the production default rather than injecting unexpected JS.

## Origin Check Verification (RESEARCH Pitfall 6)

The message handler's first statement is `if (ev.origin !== BASE) return;` — all code that reads `ev.data` is unreachable until the origin is verified. This prevents a malicious third-party page from injecting forged `lead:submitted` / `enquiry:created` events onto the host page.

## Known Stubs

None — both files are complete implementations. No placeholder values or TODO markers.

## Issues Encountered

None — the NitroViteError dev-server constraint (STATE.md P1c-wide note) was anticipated; all verification is static (typecheck, grep) or deferred to P1c-07.

## Next Phase Readiness

- P1c-07 (e2e smoke test) can now verify the full funnel end-to-end on the live Vercel deploy:
  - Embed form on throwaway page → submit → lead in `/gymos`
  - Embed schedule → enquire → lead in `/gymos`
  - `curl /embed.js` → `Content-Type: application/javascript`
- No blockers for P1c-07.

---
*Phase: P1c-public-site-integrations*
*Completed: 2026-06-01*
