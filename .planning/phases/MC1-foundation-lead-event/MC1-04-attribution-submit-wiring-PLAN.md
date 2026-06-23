---
phase: MC1-foundation-lead-event
plan: 04
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - apps/staff-web/features/forms/lib/embed-snippet.ts
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
  - apps/staff-web/features/forms/handlers/submissions.ts
autonomous: true
requirements: [PIX-01, PIX-02, CAPI-03, CAPI-05]

must_haves:
  truths:
    - "embed.js reads fbclid (parent URL) + _fbc/_fbp (parent cookies) and appends them as query params on the iframe src"
    - "When fbclid is present but no _fbc cookie, fbc is synthesized as fb.1.<unix_ms>.<fbclid>"
    - "The form page loads the studio's Meta Pixel (templated pixelId) and fires fbq('track','Lead',{},{eventID}) on successful submit"
    - "The browser generates one event_id before fetch(), fires the Pixel with it, AND sends it in the submit body — browser and server share it"
    - "submissions.ts reads fbc/fbp/event_id/page_url, hashes email/phone, persists meta_lead_attribution keyed to resolved member_id, and enqueues meta-capi-event"
    - "A Lead is always enqueued even with no Meta attribution (organic) — hashed PII + IP/UA only (D-14)"
  artifacts:
    - path: "apps/staff-web/features/forms/lib/embed-snippet.ts"
      provides: "Parent-page fbclid/_fbc/_fbp capture + fbc synthesis + iframe query-param threading"
      contains: "fb.1."
    - path: "apps/staff-web/features/forms/lib/public-form-ssr.ts"
      provides: "Pixel base code + Lead event with shared event_id"
      contains: "fbq('track', 'Lead'"
    - path: "apps/staff-web/features/forms/handlers/submissions.ts"
      provides: "attribution persist + meta-capi-event enqueue"
      contains: "enqueueMetaCapiEvent"
  key_links:
    - from: "public-form-ssr.ts browser EVENT_ID"
      to: "submissions.ts body.event_id"
      via: "POST body field shared with fbq eventID"
      pattern: "event_id"
    - from: "submissions.ts"
      to: "meta_lead_attribution + meta-capi-event queue"
      via: "upsert + enqueueMetaCapiEvent"
      pattern: "enqueueMetaCapiEvent"
---

<objective>
Wire the browser-side capture and server-side persist/enqueue: extend `embed.js` to thread parent-page `fbclid`/`_fbc`/`_fbp` (synthesizing `fbc` per D-13) across the cross-origin iframe boundary; load the studio Pixel and fire a deduplicated browser `Lead` from the form page using a shared `event_id`; and in `submissions.ts` persist `meta_lead_attribution` (keyed to the reconciled member) and enqueue the `meta-capi-event` Lead.

Purpose: This closes the dedup loop (CAPI-05 — identical event_id browser+server), captures ad-click attribution despite the iframe having no `fbclid` (PIX-02), and persists/enqueues the server Lead (CAPI-03). Always fires, even organic (D-14).
Output: Extended `embed-snippet.ts`, `public-form-ssr.ts`, and `submissions.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md
@.planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md
@.planning/phases/MC1-foundation-lead-event/MC1-01-SUMMARY.md
@.planning/phases/MC1-foundation-lead-event/MC1-02-SUMMARY.md

<interfaces>
<!-- Frozen queue contract from MC1-02 (enqueue from app/lib/queue-client). -->
enqueueMetaCapiEvent(args: { eventId, memberId, eventName, actionSource, eventTime /* Unix seconds */,
  eventSourceUrl?, hashedEmail?, hashedPhone?, hashedFn?, hashedLn?, fbc?, fbp?, clientIp?, clientUserAgent? })
Import in staff-web handlers from: apps/staff-web/app/lib/queue-client.(js)

<!-- meta_lead_attribution columns (from MC1-01): id, member_id (UNIQUE), fbc, fbp, fbclid,
     initial_event_id, page_url, client_ip, client_user_agent, lead_status, lead_sent_at, created_at, updated_at -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: embed.js — capture parent fbclid/_fbc/_fbp, synthesize fbc, thread to iframe (PIX-02)</name>
  <files>apps/staff-web/features/forms/lib/embed-snippet.ts</files>
  <read_first>
    - apps/staff-web/features/forms/lib/embed-snippet.ts — READ IN FULL. Find `buildEmbedScript(baseOrigin)`, the existing `buildParams(accent, radius)` helper, and the `injectEmbeds()` function where the iframe `src` is assembled as `BASE + "/f/" + slug + "?embed=1" + buildParams(...)`. The attribution params append to this exact src string. Note this whole script is a serialized client-side IIFE string — new helpers go inside the same string.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 3" and "Code Examples → fbc synthesis".
  </read_first>
  <action>
    Inside the embed IIFE string (mirroring the `accent`/`radius` query-param pattern), add two helpers and append their output to the iframe `src`:
    ```javascript
    function readCookie(name) {
      var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
      return m ? decodeURIComponent(m[1]) : '';
    }
    function buildAttributionParams() {
      var fbclid = new URLSearchParams(location.search).get('fbclid') || '';
      var fbc = readCookie('_fbc');
      var fbp = readCookie('_fbp');
      // D-13: synthesize fbc when fbclid present but no _fbc cookie. Timestamp in MILLISECONDS.
      if (fbclid && !fbc) { fbc = 'fb.1.' + Date.now() + '.' + fbclid; }
      var p = '';
      if (fbc) p += '&fbc=' + encodeURIComponent(fbc);
      if (fbp) p += '&fbp=' + encodeURIComponent(fbp);
      if (fbclid) p += '&fbclid=' + encodeURIComponent(fbclid);
      return p;
    }
    ```
    Then in `injectEmbeds()`, change the iframe src to append `+ buildAttributionParams()` AFTER the existing `buildParams(accent, radius)`:
    ```javascript
    var src = BASE + "/f/" + encodeURIComponent(slug) + "?embed=1" + buildParams(accent, radius) + buildAttributionParams();
    ```
    `location` here is the PARENT page (embed.js runs on the customer's site), which is exactly where `fbclid` lands and `_fbc`/`_fbp` cookies live — the iframe's own URL never has them (that's the whole point of PIX-02). Keep everything synchronous on first paint (no postMessage — avoids the Pixel-fires-before-data race, D-12). Run prettier.
  </action>
  <verify>
    <automated>grep -n "buildAttributionParams" apps/staff-web/features/forms/lib/embed-snippet.ts && grep -n "fb.1." apps/staff-web/features/forms/lib/embed-snippet.ts && grep -n "readCookie" apps/staff-web/features/forms/lib/embed-snippet.ts</automated>
  </verify>
  <acceptance_criteria>
    - `embed-snippet.ts` defines `readCookie` and `buildAttributionParams` inside the embed IIFE string
    - `buildAttributionParams` reads `fbclid` from `location.search`, `_fbc`/`_fbp` from cookies
    - Synthesizes `fbc = 'fb.1.' + Date.now() + '.' + fbclid` when `fbclid && !fbc` (milliseconds, `fb.1.` prefix)
    - The iframe `src` assembly appends `buildAttributionParams()` after `buildParams(accent, radius)`
    - Params are URL-encoded (`encodeURIComponent`)
    - No postMessage is introduced for attribution (synchronous query-param threading only)
  </acceptance_criteria>
  <done>embed.js threads parent fbclid/_fbc/_fbp (with fbc synthesis) onto the iframe src as query params.</done>
</task>

<task type="auto">
  <name>Task 2: public-form-ssr.ts — Pixel base code + shared event_id + Lead on submit (PIX-01, CAPI-05)</name>
  <files>apps/staff-web/features/forms/lib/public-form-ssr.ts</files>
  <read_first>
    - apps/staff-web/features/forms/lib/public-form-ssr.ts — READ IN FULL. Find `renderFormPage()`, where it parses `searchParams` (the iframe receives `?fbc=&fbp=&fbclid=` from Task 1), the inline `<script>` IIFE, and the client submit `fetch("/api/submit/" + FORM_ID, ...)` around line 570 (with its `.then()` success handler and the `lead:submitted` postMessage). Identify how the pixelId reaches this function — `renderFormPage` must receive/resolve `studio_owner_config.meta_pixel_id` to SSR-inject it. Check the function signature and its caller (`server/routes/f/[...slug].get.ts`) to see how to pass the resolved pixelId in.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 4", "Pattern 5", "Pitfall 2".
  </read_first>
  <action>
    1. Resolve `pixelId` server-side: in `renderFormPage()` (or its caller route `f/[...slug].get.ts`), read `studio_owner_config.meta_pixel_id`. Pass it into the SSR string as a template variable. If null/empty, render NO Pixel snippet (the form still works; the server CAPI Lead still fires via submit). Add the `// guard:allow-unscoped — single-tenant meta config` marker if reading the singleton with raw SQL.

    2. Pixel base code (inject only when pixelId present), RESEARCH Pattern 4:
    ```html
    <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
    </script>
    ```
    `${pixelId}` is the SSR-injected studio pixel id (escape/validate it is a plain numeric-ish string before interpolation — strip anything not `[0-9]` to avoid breaking the inline script).

    3. In the existing submit IIFE, generate ONE `event_id` BEFORE the `fetch()` (Pitfall 2 — must exist before the call), read the iframe's `?fbc/?fbp/?fbclid` from `searchParams`, include them + `event_id` + `page_url` in the POST body, and fire the Pixel Lead AFTER success with the SAME id:
    ```javascript
    var EVENT_ID = 'mc1_' + Math.random().toString(36).slice(2,9) + '_' + Date.now().toString(36);
    var qp = new URLSearchParams(location.search);
    // ...inside the fetch body object, add:
    //   event_id: EVENT_ID,
    //   fbc: qp.get('fbc') || undefined,
    //   fbp: qp.get('fbp') || undefined,
    //   fbclid: qp.get('fbclid') || undefined,
    //   page_url: (document.referrer || location.href),
    // ...then in the .then() success branch, AFTER the existing lead:submitted postMessage:
    if (typeof fbq !== 'undefined') { fbq('track', 'Lead', {}, { eventID: EVENT_ID }); }
    ```
    `eventID` is camelCase (4th fbq arg). `page_url` should prefer `document.referrer` (the parent page URL) since the iframe's own URL is `/f/:slug`; fall back to `location.href`. Keep the existing submit behavior intact — only ADD fields to the body and the one fbq call. Run prettier.
  </action>
  <verify>
    <automated>grep -n "fbq('track', 'Lead'" apps/staff-web/features/forms/lib/public-form-ssr.ts && grep -n "eventID: EVENT_ID" apps/staff-web/features/forms/lib/public-form-ssr.ts && grep -n "fbq('init'" apps/staff-web/features/forms/lib/public-form-ssr.ts && grep -n "event_id" apps/staff-web/features/forms/lib/public-form-ssr.ts</automated>
  </verify>
  <acceptance_criteria>
    - `public-form-ssr.ts` injects the Pixel base code with `fbq('init', '${pixelId}')` only when a pixelId is resolved
    - A single `EVENT_ID` is generated BEFORE the `fetch()` call
    - The POST body includes `event_id` (= EVENT_ID), `fbc`, `fbp`, `fbclid` (from `searchParams`), and `page_url`
    - `fbq('track', 'Lead', {}, { eventID: EVENT_ID })` fires in the submit-success branch using the SAME EVENT_ID (`eventID` camelCase)
    - The pixelId is sanitized (digits-only) before interpolation into the inline script
    - When pixelId is absent, no Pixel snippet is rendered and the form still submits
  </acceptance_criteria>
  <done>Form page loads the studio Pixel and fires a Lead with a shared event_id that is also sent in the submit body.</done>
</task>

<task type="auto">
  <name>Task 3: submissions.ts — hash PII, persist meta_lead_attribution, enqueue meta-capi-event (CAPI-03, D-14)</name>
  <files>apps/staff-web/features/forms/handlers/submissions.ts</files>
  <read_first>
    - apps/staff-web/features/forms/handlers/submissions.ts — READ IN FULL. Find: the member upsert dual-unique-key reconcile and the resulting resolved member id variable (the attribution row keys off the member id AFTER reconcile — see the member-upsert dual-unique-key gotcha in project memory), the extraction of `email`/`phoneE164`/`firstName`/`lastName`, the request `ip`/headers access, the `body` object the client posts, the DB handle (e.g. `db2`), and §14 lead-ack enqueue (the proven "enqueue a durable side-effect after lead capture" pattern to mirror placement).
    - apps/staff-web/features/forms/lib/lead-ack.ts — model for fire-and-forget enqueue resilience (lead capture must succeed even if enqueue fails).
    - .planning/phases/MC1-foundation-lead-event/MC1-02-SUMMARY.md — the frozen MetaCapiEventPayload field list.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 2", "Pattern 10", "Pitfall 6", "Pitfall 8".
  </read_first>
  <action>
    Add a new section AFTER the member is reconciled (so `resolvedMemberId` is known) and near §14, mirroring the lead-ack enqueue placement/resilience.

    1. SHA-256 hash helper (add near top of file): `import { createHash } from "node:crypto";` then
    ```typescript
    function hashForCapi(normalized: string): string {
      return createHash("sha256").update(normalized).digest("hex");
    }
    ```

    2. Read new attribution fields from `body` (the client posts them from Task 2) + request context:
    ```typescript
    const metaFbc = typeof body.fbc === "string" ? body.fbc.slice(0, 200) : null;
    const metaFbp = typeof body.fbp === "string" ? body.fbp.slice(0, 100) : null;
    const metaFbclid = typeof body.fbclid === "string" ? body.fbclid.slice(0, 200) : null;
    const metaEventId = typeof body.event_id === "string" ? body.event_id.slice(0, 100) : null;
    const metaPageUrl = typeof body.page_url === "string" ? body.page_url.slice(0, 500) : null;
    const userAgent = getRequestHeader(event, "user-agent") ?? null; // match this file's header-access pattern
    ```
    Use whatever IP variable this handler already computes (e.g. `ip`).

    3. Normalize + hash PII (RESEARCH Pattern 2 — normalize FIRST, then hash). Email: `toLowerCase().trim()`. Phone: digits only `replace(/\D/g, "")` (strip the `+`, Pitfall 6). fn/ln: `toLowerCase().replace(/[^a-z]/g, "")` / `toLowerCase().trim()`:
    ```typescript
    const hashedEmail = email ? hashForCapi(email.toLowerCase().trim()) : undefined;
    const hashedPhone = phoneE164 ? hashForCapi(phoneE164.replace(/\D/g, "")) : undefined;
    const hashedFn = firstName ? hashForCapi(firstName.toLowerCase().replace(/[^a-z]/g, "")) : undefined;
    const hashedLn = lastName ? hashForCapi(lastName.toLowerCase().trim()) : undefined;
    ```

    4. Upsert attribution keyed to `resolvedMemberId` (`ON CONFLICT (member_id) DO UPDATE` — re-submit refreshes; RESEARCH Pattern 10). Add the `// guard:allow-unscoped — single-tenant meta attribution` marker above the raw query:
    ```typescript
    // guard:allow-unscoped — single-tenant meta attribution
    await db2.execute(sql`
      INSERT INTO meta_lead_attribution
        (id, member_id, fbc, fbp, fbclid, initial_event_id, page_url, client_ip, client_user_agent, created_at, updated_at)
      VALUES
        (${nanoid()}, ${resolvedMemberId}, ${metaFbc}, ${metaFbp}, ${metaFbclid},
         ${metaEventId}, ${metaPageUrl}, ${ip}, ${userAgent}, NOW(), NOW())
      ON CONFLICT (member_id) DO UPDATE SET
        fbc = COALESCE(EXCLUDED.fbc, meta_lead_attribution.fbc),
        fbp = COALESCE(EXCLUDED.fbp, meta_lead_attribution.fbp),
        fbclid = COALESCE(EXCLUDED.fbclid, meta_lead_attribution.fbclid),
        initial_event_id = COALESCE(EXCLUDED.initial_event_id, meta_lead_attribution.initial_event_id),
        page_url = COALESCE(EXCLUDED.page_url, meta_lead_attribution.page_url),
        client_ip = EXCLUDED.client_ip,
        client_user_agent = EXCLUDED.client_user_agent,
        updated_at = NOW()
    `);
    ```

    5. ALWAYS enqueue the Lead (D-14 — organic leads fire too; just omit fbc/fbp). Wrap in try/catch so lead capture never fails on enqueue error (mirror lead-ack resilience). `eventTime` = Unix SECONDS computed HERE (Pitfall 1):
    ```typescript
    try {
      const { enqueueMetaCapiEvent } = await import("../../../app/lib/queue-client.js"); // match this file's relative depth
      if (metaEventId) {
        await enqueueMetaCapiEvent({
          eventId: metaEventId,
          memberId: resolvedMemberId,
          eventName: "Lead",
          actionSource: "website",
          eventTime: Math.floor(Date.now() / 1000), // Unix SECONDS
          eventSourceUrl: metaPageUrl ?? undefined,
          hashedEmail, hashedPhone, hashedFn, hashedLn,
          fbc: metaFbc ?? undefined,
          fbp: metaFbp ?? undefined,
          clientIp: ip ?? undefined,
          clientUserAgent: userAgent ?? undefined,
        });
      }
    } catch (err) {
      console.error("[submitLeadForm] CAPI enqueue failed:", err);
    }
    ```
    Verify the exact relative import path to `app/lib/queue-client` from this handler (depth may differ — check against how §14 imports its enqueue). Confirm `nanoid` + `sql` are already imported in this file (they are used elsewhere); add imports only if missing. Run prettier.
  </action>
  <verify>
    <automated>grep -n "enqueueMetaCapiEvent" apps/staff-web/features/forms/handlers/submissions.ts && grep -n "meta_lead_attribution" apps/staff-web/features/forms/handlers/submissions.ts && grep -n "hashForCapi" apps/staff-web/features/forms/handlers/submissions.ts && grep -n "Math.floor(Date.now() / 1000)" apps/staff-web/features/forms/handlers/submissions.ts</automated>
  </verify>
  <acceptance_criteria>
    - `submissions.ts` imports `createHash` from `node:crypto` and defines `hashForCapi`
    - Reads `body.fbc`, `body.fbp`, `body.fbclid`, `body.event_id`, `body.page_url`
    - Email hashed after `toLowerCase().trim()`; phone hashed after `replace(/\D/g, "")` (no `+`)
    - Inserts/updates `meta_lead_attribution` keyed by `resolvedMemberId` with `ON CONFLICT (member_id) DO UPDATE`, preceded by a `guard:allow-unscoped` marker comment
    - The attribution insert uses the member id resolved AFTER the dual-unique-key reconcile (not a pre-reconcile/raw value)
    - `enqueueMetaCapiEvent` is called with `eventTime: Math.floor(Date.now() / 1000)` (seconds), `eventName: "Lead"`, `actionSource: "website"`
    - The enqueue is wrapped in try/catch so a failure does not fail the submission
    - Hashed fields are passed (not raw email/phone) — no raw PII appears in the enqueue args
  </acceptance_criteria>
  <done>submissions.ts hashes PII, upserts attribution to the reconciled member, and always enqueues the Lead with a Unix-seconds event_time.</done>
</task>

</tasks>

<verification>
- embed.js threads fbclid/_fbc/_fbp + synthesizes fbc.
- Form page loads Pixel + fires Lead with shared event_id, sends same id in body.
- submissions.ts persists attribution + enqueues meta-capi-event with hashed PII.
- `npx tsc --noEmit` in apps/staff-web has no new errors.
- Post-deploy (no local dev server): verify in Meta Test Events that one form submit shows ONE Lead (dedup), and that an `fbclid`-bearing parent-page link produces an `fbc` in Event Match Quality.
</verification>

<success_criteria>
- PIX-01: form page loads studio Pixel + fires browser Lead sharing event_id with server.
- PIX-02: embed.js carries parent fbclid/_fbc/_fbp across the iframe boundary.
- CAPI-03: /api/submit accepts + persists fbc/fbp/event_id/page_url and enqueues meta-capi-event (does not call Meta directly).
- CAPI-05: browser + server Lead share identical event_id for Meta dedup.
</success_criteria>

<output>
After completion, create `.planning/phases/MC1-foundation-lead-event/MC1-04-SUMMARY.md`.
Note the post-deploy Test Events verification (dedup counts once; fbclid → fbc in EMQ) since there is no local dev server.
</output>
