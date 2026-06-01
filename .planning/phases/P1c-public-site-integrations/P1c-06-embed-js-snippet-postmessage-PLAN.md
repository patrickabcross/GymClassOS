---
phase: P1c-public-site-integrations
plan: 06
type: execute
wave: 3
depends_on: ["P1c-02", "P1c-05"]
files_modified:
  - apps/staff-web/server/routes/embed.js.get.ts
  - apps/staff-web/features/forms/lib/embed-snippet.ts
autonomous: false
requirements: [FORMS-04, EMBED-04]
must_haves:
  truths:
    - "GET /embed.js returns JavaScript (Content-Type application/javascript) that the studio drops on doyouhustle.co.uk with one <script> line"
    - "The script injects an iframe for every [data-gymos-form] element pointing at /f/<slug> and for every [data-gymos-schedule] element pointing at /embed/schedule, forwarding ?accent/?radius from data attributes"
    - "The script auto-resizes each iframe from the gymos:resize postMessage"
    - "The script re-dispatches lead:submitted and enquiry:created as CustomEvents on the host page, but ONLY for messages whose origin is the staff-web domain (origin check)"
  artifacts:
    - path: "apps/staff-web/server/routes/embed.js.get.ts"
      provides: "Public route serving the embed.js snippet with the correct JS content-type"
      contains: "application/javascript"
    - path: "apps/staff-web/features/forms/lib/embed-snippet.ts"
      provides: "The embed.js source string (origin check, iframe injection, postMessage relay)"
      contains: "event.origin"
  key_links:
    - from: "apps/staff-web/features/forms/lib/embed-snippet.ts"
      to: "/f/:slug and /embed/schedule iframes"
      via: "querySelectorAll data attributes + createElement iframe"
      pattern: "data-gymos-form|data-gymos-schedule"
    - from: "apps/staff-web/features/forms/lib/embed-snippet.ts"
      to: "host page CustomEvents"
      via: "postMessage listener with origin check + dispatchEvent"
      pattern: "event.origin|dispatchEvent"
---

<objective>
Ship the `<script>` embed snippet (FORMS-04 + EMBED-04): `GET /embed.js` returns vanilla JS the
studio pastes onto `doyouhustle.co.uk`. It injects iframes for `[data-gymos-form]` (→ `/f/<slug>`)
and `[data-gymos-schedule]` (→ `/embed/schedule`), forwards `data-accent`/`data-radius` theming,
auto-resizes iframes via the `gymos:resize` postMessage, and re-dispatches `lead:submitted` /
`enquiry:created` as host-page CustomEvents — guarded by an origin check (RESEARCH Pitfall 6).

Purpose: This is the one-line install the studio needs to replace GoHighLevel. It depends on
P1c-02 (the /f/:slug form pages + the lead:submitted event) and P1c-05 (the /embed/schedule
widget + enquiry:created + gymos:resize). The CORS + auth publicPaths for /embed.js were already
added in P1c-02 — this plan does NOT touch auth.ts or the CORS middleware.

Output: the embed.js source + the route that serves it with the right content-type.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md
@.planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md

<interfaces>
<!-- postMessage contract this script consumes (emitted by P1c-02 form SSR + P1c-05 schedule SSR):
       { type: "gymos:resize", height: <number> }      -> resize the sending iframe
       { type: "lead:submitted", formId, responseId }   -> re-dispatch as CustomEvent
       { type: "enquiry:created", occurrenceId, responseId } -> re-dispatch as CustomEvent
     The iframes post to window.parent with targetOrigin "*" (they can't know the parent origin).
     The PARENT (this script) MUST check event.origin === BASE before processing (Pitfall 6). -->

<!-- BASE origin: the staff-web deploy = https://gym-class-os.vercel.app (CONTEXT.md §Specific Ideas).
     Inject BASE at render time from process.env.STAFF_WEB_URL with that production default, so the
     origin check and the iframe src both use the same value. -->

<!-- Snippet usage on the host site (from RESEARCH §"Pattern 6"):
       <div data-gymos-form="trial-signup" data-accent="#ff5733" data-radius="8"></div>
       <div data-gymos-schedule data-accent="#ff5733"></div>
       <script src="https://gym-class-os.vercel.app/embed.js" async></script>
     Full reference vanilla-JS implementation is in RESEARCH §"Code Examples" embed.js snippet — copy it. -->

<!-- Route file naming: Nitro serves a literal "/embed.js" from server/routes/embed.js.get.ts.
     This is NOT under /embed/ (that prefix is the schedule route) — but /embed.js is covered by
     both the auth publicPaths "/embed" startsWith AND the CORS "/embed.js" exact prefix from P1c-02. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author the embed.js snippet source + serve it from /embed.js</name>
  <files>apps/staff-web/features/forms/lib/embed-snippet.ts, apps/staff-web/server/routes/embed.js.get.ts</files>
  <read_first>
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Code Examples" `embed.js snippet structure` — copy the reference vanilla-JS IIFE verbatim, then extend per the action below
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Pattern 6" + Pitfall 6 (origin check)
    - apps/staff-web/server/routes/f/[...slug].get.ts (P1c-02) — confirms the /f/<slug> iframe target path + the embed=1 param convention
    - apps/staff-web/server/routes/embed/schedule.get.ts (P1c-05) — confirms the /embed/schedule iframe target + that it emits gymos:resize + enquiry:created
    - .planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md §Specific Ideas — BASE = https://gym-class-os.vercel.app
  </read_first>
  <action>
1. **Create `apps/staff-web/features/forms/lib/embed-snippet.ts`** exporting a function
   `buildEmbedScript(baseOrigin: string): string` that returns the vanilla-JS IIFE as a string.
   Copy the reference implementation from RESEARCH §"Code Examples" and make these exact behaviours
   present:
   - `var BASE = "<baseOrigin>";` interpolated at build time (the function injects it).
   - For each `document.querySelectorAll("[data-gymos-form]")`: read `data-gymos-form` (slug),
     `data-accent`, `data-radius`; build `BASE + "/f/" + encodeURIComponent(slug) + "?embed=1" + accent/radius params`;
     create an iframe (`border:none; width:100%; min-height:300px; display:block`).
   - For each `document.querySelectorAll("[data-gymos-schedule]")`: read `data-accent` (+ optional
     `data-radius`); build `BASE + "/embed/schedule?embed=1" + accent param`; create the iframe.
   - A single `window.addEventListener("message", handler)` that:
     - **`if (ev.origin !== BASE) return;`** (Pitfall 6 — origin check FIRST).
     - on `gymos:resize`: find the iframe whose `contentWindow === ev.source` and set its
       `style.height = data.height + "px"`.
     - on `lead:submitted` OR `enquiry:created`: `document.dispatchEvent(new CustomEvent(d.type, { detail: d }))`
       so the host page's analytics can react.
   - Wrap the DOM-scan in a DOMContentLoaded-safe guard (run immediately if `document.readyState`
     is interactive/complete, else attach to `DOMContentLoaded`) so `async` script loading works.

2. **Create `apps/staff-web/server/routes/embed.js.get.ts`** — a Nitro resource route that:
   - computes `const base = process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";`
   - returns `buildEmbedScript(base)` with `Content-Type: application/javascript; charset=utf-8`
     and a cache header (e.g. `Cache-Control: public, max-age=300`).
   - This route is public (auth publicPaths "/embed" + CORS "/embed.js" from P1c-02 — do NOT edit
     auth.ts or the CORS middleware).

Run `pnpm --filter @gymos/staff-web typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/features/forms/lib/embed-snippet.ts` exists; exports `buildEmbedScript`
    - The returned script string contains `data-gymos-form` and `data-gymos-schedule` selectors
    - Contains `/f/` and `/embed/schedule` iframe target paths
    - Contains an `event.origin !== BASE` (or `ev.origin !== BASE`) origin check
    - Contains `gymos:resize`, `lead:submitted`, `enquiry:created`, and `dispatchEvent`/`CustomEvent`
    - `apps/staff-web/server/routes/embed.js.get.ts` exists; calls `buildEmbedScript`
    - The route sets `Content-Type` to `application/javascript`
    - The route reads `process.env.STAFF_WEB_URL` with the `gym-class-os.vercel.app` default
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
  </acceptance_criteria>
  <done>
GET /embed.js returns origin-checked vanilla JS that injects + auto-resizes form/schedule
iframes and relays lead:submitted / enquiry:created to the host page.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify the cross-origin embed on a throwaway page</name>
  <what-built>
The /embed.js snippet + route. This checkpoint serves it, checks the content-type, and runs a
real cross-origin embed on a throwaway HTML page to verify iframe injection, auto-resize, the
origin check, and the CustomEvent relay (all runtime-only behaviours).
  </what-built>
  <how-to-verify>
1. Boot: `pnpm --filter @gymos/staff-web dev` (:8081).
2. **Content-type**: `curl -i http://localhost:8081/embed.js` → `Content-Type: application/javascript`
   and the body contains `data-gymos-form` + the origin check. (For local testing the injected BASE
   will be the production URL unless STAFF_WEB_URL is set — set
   `$env:STAFF_WEB_URL="http://localhost:8081"` before booting so the local iframes load.)
3. **Throwaway host page**: create a temp file `embed-test.html` anywhere with:
   ```html
   <!doctype html><html><body>
   <h1>Host page</h1>
   <div data-gymos-form="schedule-enquiry" data-accent="#ff5733" data-radius="10"></div>
   <div data-gymos-schedule data-accent="#ff5733"></div>
   <script>
     document.addEventListener("lead:submitted", e => console.log("HOST got lead:submitted", e.detail));
     document.addEventListener("enquiry:created", e => console.log("HOST got enquiry:created", e.detail));
   </script>
   <script src="http://localhost:8081/embed.js" async></script>
   </body></html>
   ```
   Open it via a simple static server (or `file://` — note file:// origin will fail the iframe's
   same-origin fetch; prefer `npx serve` on a different port to simulate cross-origin). 
4. Confirm: both iframes appear (a form + the schedule), themed with the accent colour, and
   auto-size to their content (no inner scrollbar) — proving the `gymos:resize` relay works.
5. Submit the embedded form → the browser console logs `HOST got lead:submitted {...}` — proving
   the origin-checked CustomEvent relay works. Click a schedule slot + enquire → console logs
   `HOST got enquiry:created {...}`.
6. Confirm the lead lands in `/gymos?filter=leads`.

Confirm content-type + both iframes + auto-resize + the two CustomEvents fire, or describe issues.
  </how-to-verify>
  <resume-signal>Type "embed working" once the snippet injects both iframes, auto-resizes, and relays the events, or describe the failure.</resume-signal>
</task>

</tasks>

<verification>
- /embed.js served with application/javascript content-type
- Origin check present (ev.origin !== BASE)
- Both [data-gymos-form] and [data-gymos-schedule] injected as iframes with theming
- gymos:resize auto-resizes; lead:submitted + enquiry:created relayed as CustomEvents
- Cross-origin embed test on a throwaway page passes
</verification>

<success_criteria>
1. One-line <script> embed serves both form + schedule iframes (FORMS-04 + EMBED-04)
2. Theming forwarded via data attributes
3. Origin-checked postMessage relay (no XSS vector) + iframe auto-resize
</success_criteria>

<output>
After completion, create `.planning/phases/P1c-public-site-integrations/P1c-06-embed-js-snippet-postmessage-SUMMARY.md` documenting:
- The BASE origin resolution (env vs default) and how local testing overrode it
- Confirmation the origin check runs before any message processing
- The cross-origin test method used (static server vs file://) and that both CustomEvents fired
- The final copy-paste embed snippet for doyouhustle.co.uk
</output>
