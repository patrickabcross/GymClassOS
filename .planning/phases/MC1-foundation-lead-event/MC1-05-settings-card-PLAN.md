---
phase: MC1-foundation-lead-event
plan: 05
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - apps/staff-web/app/routes/gymos.settings.integrations.tsx
  - apps/staff-web/server/lib/meta-capi-test-send.ts
autonomous: true
requirements: [CAPI-01, CAPI-06]

must_haves:
  truths:
    - "The operator can enter Pixel ID + Test Event Code (plain fields) and a masked Conversions API token in a 'Meta Conversion Tracking' card in /gymos/settings/integrations"
    - "Saving writes meta_pixel_id + meta_test_event_code to studio_owner_config and the token to app_secrets (single stable row, no duplicate) in the framework v1: AES-GCM format the worker decrypts"
    - "Any operator login (not just support@myutik.com) sees the token as 'configured' in the Settings card once saved — by-key presence resolution dodges the app_secrets scoping quirk; the stored token is never displayed"
    - "A status indicator shows config completeness AND last-send health (ok / failed / never sent)"
    - "'Send test event' ENQUEUES a meta-capi-event Lead (synthetic event_id + synthetic hashed PII); the Fly worker — the sole CAPI sender (D-01) — resolves testEventCode at execution time and POSTs it to Meta Test Events"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.settings.integrations.tsx"
      provides: "Meta Conversion Tracking card + save-meta-config / rotate-meta-token / send-meta-test-event intents"
      contains: "save-meta-config"
    - path: "apps/staff-web/server/lib/meta-capi-test-send.ts"
      provides: "Synthetic test-Lead ENQUEUE helper (enqueues meta-capi-event; does NOT call Meta directly — D-01)"
      contains: "enqueueMetaCapiEvent"
  key_links:
    - from: "gymos.settings.integrations.tsx loader"
      to: "app_secrets META_CAPI_TOKEN presence + meta_lead_attribution last-send"
      via: "appSecretExistsByKey (by-key) + studio_owner_config + attribution read"
      pattern: "appSecretExistsByKey"
    - from: "save-meta-config intent"
      to: "app_secrets (token) + studio_owner_config (pixel/test code)"
      via: "writeAppSecret + UPDATE studio_owner_config"
      pattern: "writeAppSecret"
    - from: "send-meta-test-event intent"
      to: "meta-capi-event queue (worker is sole CAPI sender, D-01)"
      via: "enqueueMetaCapiEvent with synthetic Lead"
      pattern: "enqueueMetaCapiEvent"
---

<objective>
Add the "Meta Conversion Tracking" card to `/gymos/settings/integrations` (sibling of the Stripe Connect card): Pixel ID + Test Event Code plain fields, a masked Conversions API token (rotate-key UX), a status indicator showing config-completeness + last-send health, and a "Send test event" button that ENQUEUES a synthetic CAPI `Lead` so the Fly worker (the sole CAPI sender — D-01) sends it and it appears in Meta's Test Events within seconds.

Purpose: The single operator entry point for Meta config (CAPI-06). The token goes to `app_secrets` via the framework `writeAppSecret` (so the Fly worker can decrypt it — D-02/D-03), with a single stable row + by-key presence to dodge the scoping quirk (D-11). The test send honors D-01 (staff-web only enqueues) + D-10 (a real, full token+pixel+worker path proof).
Output: Extended `gymos.settings.integrations.tsx` (loader status + 3 new intents + card UI) and a synthetic-Lead enqueue helper.
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
<!-- ============================================================================
     CONCRETE secrets API (VERIFIED by reading packages/core/src/secrets/storage.ts
     and packages/core/src/index.ts at plan-revision time) — DO NOT defer to implement time.
     ============================================================================

  writeAppSecret — DEFINED in packages/core/src/secrets/storage.ts, RE-EXPORTED from the
  top-level barrel packages/core/src/index.ts (line ~264). IMPORT EXACTLY:
      import { writeAppSecret } from "@agent-native/core";
  SIGNATURE (verified):
      writeAppSecret(args: {
        key: string;
        value: string;
        scope: "user" | "workspace" | "org";   // SecretScope
        scopeId: string;                         // REQUIRED — non-empty
        description?: string;
        urlAllowlist?: string;
      }): Promise<string>
  It encrypts `value` to the `v1:<iv>:<ct>:<tag>` AES-256-GCM format and UPSERTS by
  (scope, scope_id, key) — keeping a single stable row id. This IS the format the worker's
  readAppSecretByKey decrypts (worker resolves by KEY ALONE, ignoring scope/scopeId — verified
  in services/worker/src/lib/appSecrets.ts: `WHERE key = ${key} ORDER BY updated_at DESC LIMIT 1`).
  → CALL IT EXACTLY:
      await writeAppSecret({
        key: "META_CAPI_TOKEN",
        value: token,
        scope: "workspace",
        scopeId: "global",
        description: "Meta Conversions API access token",
      });
  Use the SAME scope/scopeId ("workspace"/"global") in BOTH save-meta-config and rotate-meta-token
  so the upsert-by-(scope,scope_id,key) always hits the SAME row (no competing duplicate — D-11).
  `scope:"workspace"` IS a valid SecretScope (verified in packages/core/src/secrets/register.ts).

  ⛔ NEVER use the Stripe rotate-key path: that writes `pgp_sym_encrypt(...)` into a DIFFERENT
  `secrets` table that the worker does NOT read — the worker reads `app_secrets`. Using it would
  silently break decryption and every CAPI send would skip.

  appSecretExistsByKey — DEFINED in packages/core/src/secrets/storage.ts (presence-only, by KEY
  alone, never decrypts → exactly the D-11 quirk fix). IMPORTANT: it is NOT currently re-exported
  from the top-level barrel NOR from "@agent-native/core/secrets". TWO acceptable import paths:
    (A) PREFERRED — add a one-line re-export of `appSecretExistsByKey` to
        packages/core/src/secrets/index.ts (next to `writeAppSecret`), then import from
        "@agent-native/core/secrets". Because packages/core is a publishable package, this edit
        REQUIRES a changeset: add `.changeset/meta-secret-presence.md` with:
            ---
            "@agent-native/core": patch
            ---
            Re-export appSecretExistsByKey from the secrets barrel.
    (B) FALLBACK (no core edit, no changeset) — do NOT import appSecretExistsByKey at all; instead
        resolve presence with the already-importable staff-web reader:
            import { readAppSecretByKey } from "../../server/lib/app-secrets.js"; // match real depth
            const metaTokenConfigured = (await readAppSecretByKey("META_CAPI_TOKEN")) !== null;
        This is ALSO by-key (the same D-11 quirk fix); it decrypts server-side only for a boolean
        and never returns the value to the client. Pick (A) if you can land the changeset cleanly;
        otherwise (B). Either way the loader's `tokenConfigured` is resolved BY KEY, not by session.

  readAppSecretByKey (staff-web) — apps/staff-web/server/lib/app-secrets.ts:
      readAppSecretByKey(key): Promise<string|null> — by-key AES-GCM decrypt (latest row).
-->

<!-- Frozen queue contract from MC1-02 (enqueue from app/lib/queue-client). -->
enqueueMetaCapiEvent(args: { eventId, memberId, eventName, actionSource, eventTime /* Unix seconds */,
  eventSourceUrl?, hashedEmail?, hashedPhone?, hashedFn?, hashedLn?, fbc?, fbp?, clientIp?, clientUserAgent? })
Import in staff-web from: apps/staff-web/app/lib/queue-client.(js)  (MC1-02 adds enqueueMetaCapiEvent here.)
The WORKER (MC1-03) resolves pixelId + testEventCode from studio_owner_config at execution time and
places test_event_code at the TOP LEVEL of the POST body — the test send needs NO direct Meta call here.

<!-- Existing route patterns (gymos.settings.integrations.tsx, verified) -->
  - loader({ request }) returns config/status JSON (line 46)
  - action({ request }) dispatches on `const intent = String(fd.get("_intent"))` (line 129)
  - rotate-key intent (line 224) is the masked-secret UX MODEL (button → reveal field → submit) — copy the UX, NOT the storage (it uses the wrong `secrets` table).
  - getDb() + sql`...` raw execute with `// guard:allow-unscoped` markers on studio-global tables.

studio_owner_config is a singleton row. Columns added in MC1-01: meta_pixel_id, meta_test_event_code, meta_stage_event_map.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Synthetic test-Lead ENQUEUE helper (server-side, D-01 — enqueues, never POSTs to Meta)</name>
  <files>apps/staff-web/server/lib/meta-capi-test-send.ts</files>
  <read_first>
    - apps/staff-web/app/lib/queue-client.ts — confirm `enqueueMetaCapiEvent` is re-exported here (MC1-02 adds it). The helper imports the enqueue from here, NOT from `@gymos/queue` directly (matches the established staff-web enqueue convention).
    - apps/staff-web/server/lib/app-secrets.ts — `readAppSecretByKey(key)` (used ONLY for a presence pre-check so the helper can return a friendly "token not configured" message before enqueuing; NEVER to POST).
    - apps/staff-web/server/lib/ — confirm this is the right home for the helper (NOT server/plugins/, which require a default plugin export — Vercel/Nitro gotcha).
    - .planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md D-01 (staff-web only ENQUEUES; the Fly worker is the SOLE CAPI sender) and D-10 (the test event still proves the FULL token+pixel+worker path).
  </read_first>
  <action>
    Create `apps/staff-web/server/lib/meta-capi-test-send.ts` exporting an async helper the Settings `action()` calls. CRITICAL (Blocker fix — D-01 LOCKED): this helper does NOT call `fetch("https://graph.facebook.com/...")`. staff-web (Vercel) MUST NOT POST to Meta directly. It ENQUEUES a `meta-capi-event` Lead job; the Fly worker (MC1-03) is the single chokepoint that talks to Meta and resolves `testEventCode` from `studio_owner_config` at execution time:
    ```typescript
    import { createHash } from "node:crypto";
    import { enqueueMetaCapiEvent } from "../../app/lib/queue-client.js"; // match real relative depth
    import { readAppSecretByKey } from "./app-secrets.js";

    export interface MetaTestSendResult {
      ok: boolean;
      eventId?: string;
      error?: string;
    }

    function sha256Hex(normalized: string): string {
      return createHash("sha256").update(normalized).digest("hex");
    }

    /**
     * D-10 + D-01: enqueue a REAL (synthetic) CAPI Lead so the Fly worker sends it
     * to Meta Test Events. staff-web never POSTs to Meta itself.
     */
    export async function enqueueMetaTestLead(args: {
      pixelId: string;
      memberId: string; // a real member id so the worker's attribution write-back has a row (e.g. the most recent lead, or a known synthetic member)
    }): Promise<MetaTestSendResult> {
      if (!args.pixelId) return { ok: false, error: "Pixel ID not configured." };
      // Presence pre-check only (so the UI gives a clear message); the worker reads the token itself.
      const tokenPresent = (await readAppSecretByKey("META_CAPI_TOKEN")) !== null;
      if (!tokenPresent) return { ok: false, error: "Conversions API token not configured." };

      const eventId =
        "mc1_test_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now().toString(36);
      try {
        await enqueueMetaCapiEvent({
          eventId,                                   // synthetic — shared id (no browser counterpart; this is a test)
          memberId: args.memberId,
          eventName: "Lead",
          actionSource: "website",
          eventTime: Math.floor(Date.now() / 1000),  // Unix SECONDS
          // synthetic hashed PII so the event is well-formed (D-10) — normalized then SHA-256:
          hashedEmail: sha256Hex("test@example.com"),
          // NOTE: pixelId + testEventCode are NOT passed — the worker resolves them from
          // studio_owner_config at execution time and puts test_event_code top-level in the POST.
        });
        return { ok: true, eventId };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    ```
    The synthetic `hashedEmail` is a real SHA-256 hex of a normalized synthetic email so the Lead is complete (D-10). NEVER POST to Meta from here, NEVER read/return the token value (only a boolean presence pre-check). The worker (MC1-03) attaches `test_event_code` top-level from config, so the event lands in Meta's Test Events tab — proving the full token+pixel+worker path while honoring D-01. Run prettier.
  </action>
  <verify>
    <automated>grep -n "enqueueMetaCapiEvent" apps/staff-web/server/lib/meta-capi-test-send.ts && grep -n "enqueueMetaTestLead" apps/staff-web/server/lib/meta-capi-test-send.ts && ! grep -n "graph.facebook.com" apps/staff-web/server/lib/meta-capi-test-send.ts && grep -n "Math.floor(Date.now() / 1000)" apps/staff-web/server/lib/meta-capi-test-send.ts</automated>
  </verify>
  <acceptance_criteria>
    - `meta-capi-test-send.ts` exports `enqueueMetaTestLead({ pixelId, memberId })` returning `{ ok, eventId?, error? }`
    - The helper ENQUEUES via `enqueueMetaCapiEvent` and does NOT contain `graph.facebook.com` or any direct `fetch(...)` to Meta (D-01)
    - It pre-checks token presence via `readAppSecretByKey("META_CAPI_TOKEN")` (boolean only) and returns a clear error if absent — without returning/logging the token
    - `eventTime` is `Math.floor(Date.now() / 1000)` (Unix seconds); `eventName: "Lead"`, `actionSource: "website"`
    - The `hashedEmail` user-data value is a SHA-256 hex hash (not a raw email)
    - It does NOT pass pixelId/testEventCode into the payload (the worker resolves them from studio_owner_config)
    - File lives in `server/lib/`, not `server/plugins/`
  </acceptance_criteria>
  <done>A server helper enqueues a real, well-formed synthetic Graph Lead via the worker chokepoint (D-01) so it lands in Meta Test Events — staff-web never calls Meta directly.</done>
</task>

<task type="auto">
  <name>Task 2: Loader status + save-meta-config / rotate-meta-token / send-meta-test-event intents</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx — READ the `loader` (line 46), the `action` intent dispatch (line 129+), and the FULL `rotate-key` intent (lines 224-285) so you copy the masked-secret UX flow. NOTE: do NOT reuse rotate-key's `pgp_sym_encrypt`/`secrets`-table storage — the worker reads `app_secrets`, not `secrets`.
    - packages/core/src/secrets/storage.ts — `writeAppSecret` (re-exported from `@agent-native/core`) + `appSecretExistsByKey` signatures (CONCRETE in <interfaces> above — import paths + exact call there).
    - apps/staff-web/server/lib/app-secrets.ts — `readAppSecretByKey` (the FALLBACK presence path (B), and the helper's token pre-check).
    - .planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md D-09/D-10/D-11; D-01 (test send enqueues only).
    - WARNING (Warning 2): Tasks 2 and 3 BOTH edit this one file (`gymos.settings.integrations.tsx`). Do Task 2 and Task 3 in the SAME editing pass — add the loader fields + 3 intents (Task 2) AND the card JSX (Task 3) before saving/typechecking, so the file is never left half-edited (a referenced loader field with no producer, or an intent with no UI, would fail typecheck between tasks).
  </read_first>
  <action>
    Extend the existing `loader` and `action` (do not create new exported loaders/actions — add to the existing ones).

    Import the secrets writer concretely (see <interfaces>): `import { writeAppSecret } from "@agent-native/core";`. For token presence resolution, use path (A) `import { appSecretExistsByKey } from "@agent-native/core/secrets";` (after adding the barrel re-export + changeset) OR the FALLBACK (B) `const metaTokenConfigured = (await readAppSecretByKey("META_CAPI_TOKEN")) !== null;` — both are by-KEY (D-11), pick one and use it consistently.

    LOADER additions — return Meta status fields:
    ```typescript
    // guard:allow-unscoped — studio-global config
    const cfgRows = await (getDb() as any).execute(sql`
      SELECT meta_pixel_id, meta_test_event_code FROM studio_owner_config LIMIT 1
    `);
    const cfg = (cfgRows?.rows ?? cfgRows)?.[0] ?? {};
    const metaTokenConfigured = await appSecretExistsByKey("META_CAPI_TOKEN"); // (A) — OR fallback (B) readAppSecretByKey !== null
    // Last-send health from attribution (most recent row):
    // guard:allow-unscoped — single-tenant meta attribution
    const lastRows = await (getDb() as any).execute(sql`
      SELECT lead_status, lead_sent_at FROM meta_lead_attribution
      WHERE lead_status IS NOT NULL
      ORDER BY lead_sent_at DESC NULLS LAST LIMIT 1
    `);
    const last = (lastRows?.rows ?? lastRows)?.[0] ?? null;
    const meta = {
      pixelId: cfg.meta_pixel_id ?? "",
      testEventCode: cfg.meta_test_event_code ?? "",
      tokenConfigured: metaTokenConfigured,
      configured: !!(cfg.meta_pixel_id && metaTokenConfigured && cfg.meta_test_event_code),
      lastSendStatus: last?.lead_status ?? "never",   // 'sent' | 'failed' | 'never'
      lastSendAt: last?.lead_sent_at ?? null,
    };
    ```
    Add `meta` to the loader's returned object.

    ACTION additions — three new intent branches. Token storage uses `writeAppSecret` with the FIXED scope/scopeId from <interfaces> so re-saves UPSERT one row (no duplicate — D-11):

    1. `save-meta-config` — pixelId + testEventCode to studio_owner_config (upsert the singleton so a missing row is created — RESEARCH Pitfall 8); token to app_secrets only if a non-empty token was provided:
    ```typescript
    if (intent === "save-meta-config") {
      const pixelId = String(fd.get("pixelId") ?? "").trim().replace(/[^0-9]/g, "");
      const testEventCode = String(fd.get("testEventCode") ?? "").trim();
      const token = String(fd.get("token") ?? "").trim();
      // guard:allow-unscoped — studio-global config
      await (getDb() as any).execute(sql`
        INSERT INTO studio_owner_config (id, meta_pixel_id, meta_test_event_code, updated_at)
        VALUES ('singleton', ${pixelId || null}, ${testEventCode || null}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          meta_pixel_id = ${pixelId || null},
          meta_test_event_code = ${testEventCode || null},
          updated_at = NOW()
      `);
      if (token) {
        await writeAppSecret({ key: "META_CAPI_TOKEN", value: token, scope: "workspace", scopeId: "global",
          description: "Meta Conversions API access token" });
      }
      return { ok: true, intent };
    }
    ```
    IMPORTANT: confirm the singleton primary-key value used elsewhere for `studio_owner_config` (it may be a fixed id like `'singleton'` or `'default'` — read how BD4/MC1-01 seeds/reads it and match it EXACTLY; if the table uses a different conflict target, adapt the `ON CONFLICT` accordingly). Do NOT invent a new key.

    2. `rotate-meta-token` — re-save only the token (clears + replaces), SAME fixed scope/scopeId:
    ```typescript
    if (intent === "rotate-meta-token") {
      const token = String(fd.get("token") ?? "").trim();
      if (!token) return { ok: false, error: "Paste a token first.", intent };
      await writeAppSecret({ key: "META_CAPI_TOKEN", value: token, scope: "workspace", scopeId: "global",
        description: "Meta Conversions API access token" });
      return { ok: true, intent };
    }
    ```

    3. `send-meta-test-event` — ENQUEUE a synthetic Lead via the Task 1 helper (D-01: no direct Meta call). Resolve a real `memberId` for the worker's attribution write-back (most recent attribution member, else most recent gym member); read current pixelId:
    ```typescript
    if (intent === "send-meta-test-event") {
      // guard:allow-unscoped — studio-global config
      const rows = await (getDb() as any).execute(sql`SELECT meta_pixel_id FROM studio_owner_config LIMIT 1`);
      const c = (rows?.rows ?? rows)?.[0] ?? {};
      // guard:allow-unscoped — single-tenant; resolve a member id for the test event's attribution row
      const mRows = await (getDb() as any).execute(sql`SELECT id FROM gym_members ORDER BY created_at DESC LIMIT 1`);
      const memberId = ((mRows?.rows ?? mRows)?.[0]?.id) ?? "";
      const { enqueueMetaTestLead } = await import("../../server/lib/meta-capi-test-send.js"); // match real relative depth
      const result = await enqueueMetaTestLead({ pixelId: c.meta_pixel_id ?? "", memberId });
      return { ok: result.ok, intent, eventId: result.eventId, error: result.error };
    }
    ```
    Verify the actual relative import path to `server/lib/meta-capi-test-send` and to the `writeAppSecret`/`appSecretExistsByKey` exports (paths in <interfaces>). NEVER log or echo the token. Run prettier.
  </action>
  <verify>
    <automated>grep -n "save-meta-config" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "send-meta-test-event" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "enqueueMetaTestLead" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "writeAppSecret" apps/staff-web/app/routes/gymos.settings.integrations.tsx</automated>
  </verify>
  <acceptance_criteria>
    - The loader returns a `meta` object with `pixelId, testEventCode, tokenConfigured, configured, lastSendStatus, lastSendAt`
    - `tokenConfigured` is resolved BY KEY — via `appSecretExistsByKey("META_CAPI_TOKEN")` (path A) or `(await readAppSecretByKey("META_CAPI_TOKEN")) !== null` (fallback B) — NOT by session/scope
    - `lastSendStatus` reads `meta_lead_attribution.lead_status` (most recent), values `'sent' | 'failed' | 'never'`
    - The action handles `save-meta-config`, `rotate-meta-token`, and `send-meta-test-event` intents
    - Token storage imports `writeAppSecret` from `@agent-native/core` and calls it with `{ key: "META_CAPI_TOKEN", scope: "workspace", scopeId: "global" }` (NOT `pgp_sym_encrypt`, NOT the `secrets` table); save + rotate use the SAME scope/scopeId
    - `save-meta-config` upserts `studio_owner_config` with `ON CONFLICT` on the singleton (creates the row if absent), using the SAME pk/conflict-target the rest of the codebase uses for that table
    - `pixelId` is sanitized to digits-only before storage
    - `send-meta-test-event` calls `enqueueMetaTestLead(...)` (ENQUEUE — no `graph.facebook.com` in this route) and returns `{ ok, eventId, error }`
    - No `token` value appears in any `console.log`
  </acceptance_criteria>
  <done>Loader exposes Meta config + last-send health (token presence by-key); three intents save config to app_secrets+studio_owner_config (single stable row) and the test intent ENQUEUES a synthetic Lead via the worker (D-01).</done>
</task>

<task type="auto" type-note="UI">
  <name>Task 3: "Meta Conversion Tracking" card UI (sibling of the Stripe card) — same editing pass as Task 2</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx — READ the Stripe card JSX (~line 342) and the rotate-key reveal field JSX (~line 475-544): copy the shadcn primitives used (Card/Button/Input/Badge), the `useFetcher` pattern, the hidden `_intent` input convention, and the masked-secret reveal UX. The new card sits as a SIBLING after the Stripe card.
    - root AGENTS.md — shadcn primitives only, Tabler icons only (no emojis as icons), no browser dialogs (use AlertDialog), optimistic UI.
    - WARNING (Warning 2): this task edits the SAME file as Task 2. Perform Task 2 and Task 3 together in ONE editing pass — add the loader fields + intents (Task 2) and this card JSX (Task 3) before the first typecheck — so the file is never committed/typechecked in a half-edited state (loader field with no UI consumer, or a `_intent` with no producer).
  </read_first>
  <action>
    Add a "Meta Conversion Tracking" `Card` after the Stripe card, fed by `loaderData.meta`. Use shadcn `Card`, `Input`, `Button`, `Badge` and a Tabler icon (`IconBrandMeta` or `IconAd2` from `@tabler/icons-react`). Use `useFetcher` (one per concern, mirroring the existing `keyFetcher`) so the page does not full-reload.

    Card contents:
    1. Header: icon + "Meta Conversion Tracking" + a STATUS `Badge`:
       - if `meta.configured` and `meta.lastSendStatus === 'sent'` → green "Active" badge.
       - if `meta.configured` and `meta.lastSendStatus === 'failed'` → red/amber "Last send failed" badge.
       - if `meta.configured` and `meta.lastSendStatus === 'never'` → neutral "Configured — no sends yet" badge.
       - else → outline "Not configured" badge.
       Show `meta.lastSendAt` (formatted) when present (D-09 — config completeness AND last-send health).
    2. A form (`fetcher.Form method="post"`) with hidden `_intent=save-meta-config`:
       - `Input name="pixelId"` (plain) defaulted to `meta.pixelId`, label "Pixel ID", placeholder "e.g. 1234567890".
       - `Input name="testEventCode"` (plain) defaulted to `meta.testEventCode`, label "Test Event Code", placeholder "TEST12345".
       - Token field (D-11 masked): if `meta.tokenConfigured`, show a "Conversions API token: configured" line + a "Replace token" `Button` that reveals an empty `Input name="token" type="password"`; if NOT configured, show the empty `Input name="token" type="password"` directly. NEVER prefill the token. (Mirror the rotate-key reveal UX.)
       - Save `Button` (optimistic: disable + show a spinner/"Saving…" while `fetcher.state !== 'idle'`; do not block the click on an await).
    3. A separate "Send test event" `Button` in its own `fetcher.Form` with hidden `_intent=send-meta-test-event` (D-10). On result, render an OPTIMISTIC confirmation: "Test event queued — check Meta Events Manager → Test Events in ~30s" (the worker sends it; surface the returned `eventId` when present, or the `error`). Disable the button while in flight.

    Use the loader's `configured` to disable "Send test event" with a hint ("Enter Pixel ID, token, and Test Event Code first") when not configured. No `window.confirm`/`alert` — if any confirmation is needed use shadcn `AlertDialog`. Run prettier.
  </action>
  <verify>
    <automated>grep -n "Meta Conversion Tracking" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "send-meta-test-event" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "pixelId" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "@tabler/icons-react" apps/staff-web/app/routes/gymos.settings.integrations.tsx</automated>
  </verify>
  <acceptance_criteria>
    - A card titled "Meta Conversion Tracking" renders after the Stripe card
    - It renders a status `Badge` whose text/variant depends on `meta.configured` + `meta.lastSendStatus` (Active / Last send failed / Configured — no sends yet / Not configured)
    - Inputs exist for `pixelId` and `testEventCode` (plain), and a `token` field that is masked and never prefilled (a "Replace token" reveal when already configured)
    - A "Send test event" button posts `_intent=send-meta-test-event` and surfaces the optimistic "queued — check Test Events" message (with `eventId` when present) or the `error`
    - Uses shadcn `Card`/`Input`/`Button`/`Badge` and a `@tabler/icons-react` icon (no emoji icons)
    - No `window.confirm` / `window.alert` / `window.prompt` is used
    - The save button shows optimistic in-flight state (disabled + label change) keyed on `fetcher.state`
  </acceptance_criteria>
  <done>Operators have a complete Meta Conversion Tracking card: Pixel ID + Test Event Code + masked token + status/health + a test-send that enqueues to the worker (written in the same pass as Task 2).</done>
</task>

</tasks>

<verification>
- Card + 3 intents + loader status present; token stored to app_secrets via `writeAppSecret` (worker-decryptable v1: AES-GCM), presence resolved by-key.
- Test-send ENQUEUES a synthetic Lead (no `graph.facebook.com` in staff-web) — the worker is the sole CAPI sender (D-01).
- `npx tsc --noEmit` in apps/staff-web has no new errors.
- Post-deploy (no local dev server): operator enters config, clicks "Send test event", and confirms one Lead in Meta Events Manager → Test Events tab (sent by the worker).
</verification>

<success_criteria>
- CAPI-06: "Meta Conversion Tracking" card lets the operator enter Pixel ID (→ studio config), masked CAPI token (→ app_secrets, single row), and Test Event Code (→ studio config), with a config + last-send status indicator and a "Send test event" that enqueues to the worker.
- CAPI-01 (UI completion): pixelId/testEventCode persisted studio-global; META_CAPI_TOKEN stored as an app_secret via the single documented entry point (`writeAppSecret`, no duplicate row); the worker is the sole CAPI sender (D-01).
</success_criteria>

<output>
After completion, create `.planning/phases/MC1-foundation-lead-event/MC1-05-SUMMARY.md`.
Note the post-deploy operator walkthrough (enter config → Send test event → see Lead in Test Events, sent by the worker per D-01) as the CAPI-06 verification, since there is no local dev server.
</output>
