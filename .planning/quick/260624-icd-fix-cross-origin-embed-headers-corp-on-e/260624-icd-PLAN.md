---
type: quick
slug: 260624-icd
title: Fix cross-origin embed headers (CORP + X-Frame-Options) so embeds work on third-party sites
status: ready
created: 2026-06-24
files_modified:
  - apps/staff-web/server/routes/embed.js.get.ts
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
  - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
autonomous: true
---

<objective>
The RunStudio embed (lead-capture form + schedule widget) is blocked from loading on third-party
sites like doyouhustle.co.uk by two framework security headers set in
`packages/core/src/server/security-headers.ts` on every prod response:

1. `Cross-Origin-Resource-Policy: same-site` — blocks the cross-origin `<script src>` load of
   `/embed.js` from a different site.
2. `X-Frame-Options: DENY` — blocks the form/schedule iframes from being framed cross-origin
   (even though both already set `Content-Security-Policy: frame-ancestors *`, which would permit it).

The framework's documented contract (security-headers.ts JSDoc, lines 22-24 and 75-80): route
handlers run AFTER the middleware, and "the latest write wins" — a handler can relax a header by
overwriting (`setResponseHeader`) or removing (`removeResponseHeader`) it on the h3 event before
the response is sent. The middleware-set headers live on `event.node.res` and merge into the final
response, which is why `X-Frame-Options: DENY` appears alongside each handler's own
`new Response(..., { headers })`.

Fix = three handler-level overrides, ALL in `apps/staff-web`. We do NOT edit `packages/core`
(upstream-merge rule), do NOT touch CORS (`00-public-cors.ts` already sets
`Access-Control-Allow-Origin: *` — CORS is fine), and add no migration / no Fly change.

Purpose: let the studio drop one `<script>` tag on their marketing site and get both iframes.
Output: 3 edited files; `npx tsc --noEmit` clean. staff-web only — orchestrator handles git push.

Scope notes:
- staff-web ONLY. No Fly, no worker, no edge-webhooks, no migration.
- Deploy (git push → Vercel) is handled by the orchestrator, NOT the executor.
</objective>

<context>
@.planning/STATE.md
@apps/staff-web/CLAUDE.md

<interfaces>
<!-- h3 exports the executor needs. All already importable from "h3". -->
- `setResponseHeader(event, name, value)` — overwrites a header on the h3 event (last write wins).
- `removeResponseHeader(event, name)` — deletes a header from the h3 event before send.
  (h3 exports `removeResponseHeader` — confirmed available.)

Existing imports per file:
- embed.js.get.ts (line 21):       `import { defineEventHandler, setResponseHeader } from "h3";`
- public-form-ssr.ts (line 1):     `import { getMethod, getRequestURL, type H3Event } from "h3";`
- schedule-widget-ssr.ts (line 23):`import { getRequestURL, type H3Event } from "h3";`

Framework header source (READ ONLY — DO NOT EDIT, it's @agent-native/core):
- packages/core/src/server/security-headers.ts sets, in production, on every response:
  `X-Frame-Options: DENY` and `Cross-Origin-Resource-Policy: same-site`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Allow cross-origin script load of /embed.js (CORP override)</name>
  <read_first>apps/staff-web/server/routes/embed.js.get.ts</read_first>
  <files>apps/staff-web/server/routes/embed.js.get.ts</files>
  <action>
    This is THE primary fix — it lets the embed snippet itself load from a different site.

    The handler already imports `setResponseHeader` from "h3" (line 21) and already sets
    Content-Type and Cache-Control via `setResponseHeader(event, ...)`. Add one more
    `setResponseHeader` call inside the handler, BEFORE `return js;`, to override the
    framework middleware's `Cross-Origin-Resource-Policy: same-site`:

        setResponseHeader(event, "Cross-Origin-Resource-Policy", "cross-origin");

    Place it alongside the existing Content-Type / Cache-Control `setResponseHeader` calls
    (after the Cache-Control call, before `return js;`). Add a short comment, e.g.:
    `// CORP cross-origin lets the <script src> load from third-party sites (e.g. doyouhustle.co.uk);`
    `// framework middleware defaults to same-site which blocks it.`

    Do NOT add or change CORS headers — `Access-Control-Allow-Origin: *` is already set by
    00-public-cors.ts. Do NOT touch the import line (setResponseHeader is already imported).
  </action>
  <verify>
    <automated>cd apps/staff-web && grep -q '"Cross-Origin-Resource-Policy", "cross-origin"' server/routes/embed.js.get.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    embed.js.get.ts contains the literal strings `"Cross-Origin-Resource-Policy"` and
    `"cross-origin"` in a `setResponseHeader(event, ...)` call within the handler.
    The h3 import line is unchanged (setResponseHeader already present).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Drop X-Frame-Options:DENY on the public form + schedule-widget SSR handlers</name>
  <read_first>apps/staff-web/features/forms/lib/public-form-ssr.ts (renderPublicForm ~line 304), apps/staff-web/features/forms/lib/schedule-widget-ssr.ts (renderScheduleWidget ~line 513)</read_first>
  <files>apps/staff-web/features/forms/lib/public-form-ssr.ts, apps/staff-web/features/forms/lib/schedule-widget-ssr.ts</files>
  <action>
    Both handlers already emit `Content-Security-Policy: frame-ancestors *` (which permits any
    site to iframe them), but the framework middleware ALSO emits `X-Frame-Options: DENY`, which
    blocks framing across all browsers. Remove the middleware's XFO from each handler's h3 event
    before the response is returned. Keep the existing CSP `frame-ancestors *` — do not change it.

    --- public-form-ssr.ts ---
    1. Update the h3 import on line 1 to add `removeResponseHeader`:
       `import { getMethod, getRequestURL, removeResponseHeader, type H3Event } from "h3";`
    2. In `renderPublicForm(event)` (~line 304), BEFORE the `return new Response(...)` (~line 317),
       add:
           // Drop the framework middleware's X-Frame-Options: DENY so the form iframes
           // cross-origin; CSP frame-ancestors * (set above) already permits it.
           removeResponseHeader(event, "X-Frame-Options");
       Leave the `headers` object (Content-Type, Content-Security-Policy frame-ancestors *,
       Cache-Control) exactly as-is.

    --- schedule-widget-ssr.ts ---
    1. Update the h3 import on line 23 to add `removeResponseHeader`:
       `import { getRequestURL, removeResponseHeader, type H3Event } from "h3";`
    2. In `renderScheduleWidget(event)` (~line 513), BEFORE the `return new Response(...)`
       (~line 533), add:
           // Drop the framework middleware's X-Frame-Options: DENY so the widget iframes
           // cross-origin; CSP frame-ancestors * (set below) already permits it.
           removeResponseHeader(event, "X-Frame-Options");
       Leave the returned `headers` object (Content-Type, CSP frame-ancestors *, Cache-Control)
       exactly as-is.

    Note: the handler builds the body via `renderPage(...)` / `renderPublicFormHtml(...)` first,
    then returns the Response. Call `removeResponseHeader(event, ...)` after the body is built and
    before `return new Response(...)`. Do NOT touch CORS or the CSP value.
  </action>
  <verify>
    <automated>cd apps/staff-web && grep -q 'removeResponseHeader(event, "X-Frame-Options")' features/forms/lib/public-form-ssr.ts && grep -q 'removeResponseHeader(event, "X-Frame-Options")' features/forms/lib/schedule-widget-ssr.ts && grep -q 'removeResponseHeader' features/forms/lib/public-form-ssr.ts && grep -q 'removeResponseHeader' features/forms/lib/schedule-widget-ssr.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    Both public-form-ssr.ts and schedule-widget-ssr.ts: (a) import `removeResponseHeader` from "h3",
    and (b) call `removeResponseHeader(event, "X-Frame-Options")` inside their handler before the
    `return new Response(...)`. The existing `Content-Security-Policy: frame-ancestors *` header is
    still present in each returned Response (unchanged). No CORS changes.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Typecheck gate</name>
  <read_first>—</read_first>
  <files>(no edits — verification only)</files>
  <action>
    Run the staff-web TypeScript compiler with no emit to confirm all three edits typecheck.
    `removeResponseHeader` and `setResponseHeader` are both standard h3 exports, so this should
    pass with zero errors. If tsc reports an error about `removeResponseHeader` not being exported
    from "h3", STOP and report — do not invent a workaround (the prior diagnosis confirmed h3
    exports it; an error here would mean the installed h3 version differs and needs a decision).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit && echo TSC_CLEAN</automated>
  </verify>
  <acceptance_criteria>
    `cd apps/staff-web && npx tsc --noEmit` exits 0 (prints TSC_CLEAN).
  </acceptance_criteria>
</task>

</tasks>

<git>
Stay on the current branch (master). Do NOT create branches, worktrees, or stash.
Commit atomically per task with `--no-verify`:
- After Task 1: `git commit --no-verify -m "fix(embed): set CORP cross-origin on /embed.js so the snippet loads on third-party sites"`
- After Task 2: `git commit --no-verify -m "fix(embed): drop X-Frame-Options:DENY on public form + schedule widget SSR so they iframe cross-origin"`
- Task 3 is verification-only (no commit unless a trivial typecheck-driven fixup was needed).

Do NOT edit packages/core. Do NOT touch CORS / 00-public-cors.ts. Do NOT push — the orchestrator
handles `git push origin master` → Vercel.
</git>

<verification>
- Task 1: `grep '"Cross-Origin-Resource-Policy", "cross-origin"' apps/staff-web/server/routes/embed.js.get.ts`
- Task 2: `grep 'removeResponseHeader(event, "X-Frame-Options")'` matches in BOTH
  public-form-ssr.ts and schedule-widget-ssr.ts; both still contain `frame-ancestors *`.
- Task 3: `cd apps/staff-web && npx tsc --noEmit` exits 0.
- Post-deploy (orchestrator/manual, out of executor scope): `curl -sI https://runstudioai.com/embed.js`
  shows `cross-origin-resource-policy: cross-origin` and `access-control-allow-origin: *`;
  `curl -sI https://runstudioai.com/f/<slug>` shows `content-security-policy: frame-ancestors *`
  and NO `x-frame-options` header.
</verification>

<success_criteria>
- /embed.js responds with `Cross-Origin-Resource-Policy: cross-origin` (override applied).
- /f/{slug} and the schedule widget no longer emit `X-Frame-Options: DENY`; they keep
  `Content-Security-Policy: frame-ancestors *`.
- staff-web typechecks clean (`npx tsc --noEmit` exit 0).
- No changes to packages/core, CORS, schema, or any Fly/worker code.
</success_criteria>

<output>
After completion, create
`.planning/quick/260624-icd-fix-cross-origin-embed-headers-corp-on-e/260624-icd-SUMMARY.md`
noting: files changed, the header overrides applied, tsc result, and the reminder that production
verification requires a deploy (git push → Vercel) which the orchestrator/user performs.
</output>
