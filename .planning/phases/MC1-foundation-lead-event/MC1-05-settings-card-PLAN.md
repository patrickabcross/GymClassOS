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
    - "Saving writes meta_pixel_id + meta_test_event_code to studio_owner_config and the token to app_secrets (single stable row, no duplicate)"
    - "The token field shows a 'configured' / 'Replace token' state by-key, never displays the stored token"
    - "A status indicator shows config completeness AND last-send health (ok / failed / never sent)"
    - "'Send test event' fires a REAL CAPI Lead with the studio's testEventCode + synthetic event_id and surfaces the fbtrace_id / error"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.settings.integrations.tsx"
      provides: "Meta Conversion Tracking card + save-meta-config / rotate-meta-token / send-meta-test-event intents"
      contains: "save-meta-config"
    - path: "apps/staff-web/server/lib/meta-capi-test-send.ts"
      provides: "Real CAPI Lead test-send helper (server-side, reused by send-meta-test-event intent)"
      contains: "graph.facebook.com/v23.0"
  key_links:
    - from: "gymos.settings.integrations.tsx loader"
      to: "app_secrets META_CAPI_TOKEN presence + meta_lead_attribution last-send"
      via: "appSecretExistsByKey + studio_owner_config + attribution read"
      pattern: "appSecretExistsByKey"
    - from: "save-meta-config intent"
      to: "app_secrets (token) + studio_owner_config (pixel/test code)"
      via: "writeAppSecret + UPDATE studio_owner_config"
      pattern: "writeAppSecret"
---

<objective>
Add the "Meta Conversion Tracking" card to `/gymos/settings/integrations` (sibling of the Stripe Connect card): Pixel ID + Test Event Code plain fields, a masked Conversions API token (rotate-key UX), a status indicator showing config-completeness + last-send health, and a "Send test event" button that fires a REAL CAPI Lead so it appears in Meta's Test Events within seconds.

Purpose: The single operator entry point for Meta config (CAPI-06). The token goes to `app_secrets` via the framework `writeAppSecret` (so the Fly worker can decrypt it — D-02/D-03), with a single stable row + by-key presence to dodge the scoping quirk (D-11).
Output: Extended `gymos.settings.integrations.tsx` (loader status + 3 new intents + card UI) and a reusable server-side test-send helper.
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

<interfaces>
<!-- CRITICAL: the token MUST land in app_secrets in the framework v1: AES-GCM format the worker decrypts.
     Do NOT use the Stripe rotate-key path (it writes pgp_sym_encrypt into a DIFFERENT `secrets` table the
     worker does NOT read). Use the framework writeAppSecret / appSecretExistsByKey instead. -->

From @agent-native/core (packages/core/src/secrets/storage.ts):
  writeAppSecret({ key: string, value: string, scope: SecretScope, scopeId: string, description?, urlAllowlist? }): Promise<string>
    — encrypts value to `v1:<iv>:<ct>:<tag>` and upserts by (scope, scope_id, key).
  appSecretExistsByKey(key: string): Promise<boolean>
    — presence-only, resolves by KEY alone (ignores scope) — exactly the D-11 quirk fix. Never decrypts.

From apps/staff-web/server/lib/app-secrets.ts:
  readAppSecretByKey(key): Promise<string|null> — by-key AES-GCM decrypt (latest row). Used by the test-send helper.

Existing route patterns (gymos.settings.integrations.tsx, verified):
  - loader({ request }) returns config/status JSON (line 46)
  - action({ request }) dispatches on `const intent = String(fd.get("_intent"))` (line 129)
  - rotate-key intent (line 224) is the masked-secret UX MODEL (button → reveal field → submit) — copy the UX, NOT the storage (it uses the wrong table).
  - getDb() + sql`...` raw execute with `// guard:allow-unscoped` markers on studio-global tables.

studio_owner_config is a singleton row. Columns added in MC1-01: meta_pixel_id, meta_test_event_code, meta_stage_event_map.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Real CAPI Lead test-send helper (server-side)</name>
  <files>apps/staff-web/server/lib/meta-capi-test-send.ts</files>
  <read_first>
    - apps/staff-web/server/lib/app-secrets.ts — `readAppSecretByKey(key)` (decrypts META_CAPI_TOKEN).
    - apps/staff-web/server/lib/ — confirm this is the right home for the helper (NOT server/plugins/, which require a default plugin export — Vercel/Nitro gotcha).
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 1" and "Code Examples → CAPI POST fetch" for the exact payload shape.
    - .planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md D-10 — the test event must be a REAL CAPI Lead, not a credentials ping.
  </read_first>
  <action>
    Create `apps/staff-web/server/lib/meta-capi-test-send.ts` exporting an async helper the Settings `action()` calls:
    ```typescript
    import { readAppSecretByKey } from "./app-secrets.js";

    export interface MetaTestSendResult {
      ok: boolean;
      fbtraceId?: string;
      error?: string;
    }

    export async function sendMetaTestLead(args: {
      pixelId: string;
      testEventCode: string;
    }): Promise<MetaTestSendResult> {
      const token = await readAppSecretByKey("META_CAPI_TOKEN");
      if (!token) return { ok: false, error: "Conversions API token not configured." };
      if (!args.pixelId) return { ok: false, error: "Pixel ID not configured." };

      const eventId = "mc1_test_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now().toString(36);
      const body: Record<string, unknown> = {
        data: [{
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000), // Unix SECONDS
          event_id: eventId,
          action_source: "website",
          user_data: {
            // synthetic test identifiers (hashed) — RESEARCH Pattern 2 normalization
            em: ["..."], // sha256 of a synthetic normalized email, e.g. "test@example.com"
          },
        }],
      };
      if (args.testEventCode) body.test_event_code = args.testEventCode; // TOP LEVEL

      const endpoint = `https://graph.facebook.com/v23.0/${encodeURIComponent(args.pixelId)}/events?access_token=${token}`;
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json: any = await resp.json().catch(() => ({}));
        if (resp.ok && json?.events_received >= 1) {
          return { ok: true, fbtraceId: json?.fbtrace_id };
        }
        return { ok: false, fbtraceId: json?.fbtrace_id, error: json?.error?.message || `Meta returned ${resp.status}` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    ```
    Fill the `em` value with a real SHA-256 (Node `node:crypto createHash("sha256").update("test@example.com").digest("hex")`) of a synthetic normalized email so the event is well-formed (D-10 — a real, complete CAPI Lead). `test_event_code` MUST be at the TOP LEVEL of the body (sibling of `data`), never inside the event (RESEARCH Pitfall 3). Graph v23. NEVER log or return the token. Run prettier.
  </action>
  <verify>
    <automated>grep -n "graph.facebook.com/v23.0" apps/staff-web/server/lib/meta-capi-test-send.ts && grep -n "test_event_code" apps/staff-web/server/lib/meta-capi-test-send.ts && grep -n "readAppSecretByKey" apps/staff-web/server/lib/meta-capi-test-send.ts && grep -n "Math.floor(Date.now() / 1000)" apps/staff-web/server/lib/meta-capi-test-send.ts</automated>
  </verify>
  <acceptance_criteria>
    - `meta-capi-test-send.ts` exports `sendMetaTestLead({ pixelId, testEventCode })` returning `{ ok, fbtraceId?, error? }`
    - Endpoint is `https://graph.facebook.com/v23.0/.../events?access_token=...` (v23)
    - `test_event_code` is set on the body at the top level (sibling of `data`), guarded by `args.testEventCode`
    - `event_time` is `Math.floor(Date.now() / 1000)` (Unix seconds)
    - The `em` user_data value is a SHA-256 hex hash (not a raw email)
    - The token is read via `readAppSecretByKey("META_CAPI_TOKEN")` and never returned/logged
    - File lives in `server/lib/`, not `server/plugins/`
  </acceptance_criteria>
  <done>A reusable server helper fires a real, well-formed Graph v23 Lead with the studio's test code and returns fbtrace/error.</done>
</task>

<task type="auto">
  <name>Task 2: Loader status + save-meta-config / rotate-meta-token / send-meta-test-event intents</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx — READ the `loader` (line 46), the `action` intent dispatch (line 129+), and the FULL `rotate-key` intent (lines 224-285) so you copy the masked-secret UX flow. NOTE the warning below: do NOT reuse rotate-key's `pgp_sym_encrypt`/`secrets`-table storage — the worker reads `app_secrets`, not `secrets`.
    - packages/core/src/secrets/storage.ts — `writeAppSecret` + `appSecretExistsByKey` signatures (in <interfaces>).
    - apps/staff-web/server/lib/app-secrets.ts — `readAppSecretByKey`.
    - .planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md D-09/D-10/D-11.
  </read_first>
  <action>
    Extend the existing `loader` and `action` (do not create new exported loaders/actions — add to the existing ones).

    LOADER additions — return Meta status fields:
    ```typescript
    import { appSecretExistsByKey } from "@agent-native/core"; // or the correct secrets export path used elsewhere
    // ... inside loader, read the singleton config:
    // guard:allow-unscoped — studio-global config
    const cfgRows = await (getDb() as any).execute(sql`
      SELECT meta_pixel_id, meta_test_event_code FROM studio_owner_config LIMIT 1
    `);
    const cfg = (cfgRows?.rows ?? cfgRows)?.[0] ?? {};
    const metaTokenConfigured = await appSecretExistsByKey("META_CAPI_TOKEN");
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

    ACTION additions — three new intent branches. The token MUST be stored via the framework writer with a FIXED scope/scopeId so re-saves UPSERT one row (no duplicate — D-11). Use `scope: "workspace", scopeId: "global"` consistently across save + rotate so the upsert-by-(scope,scope_id,key) hits the same row:

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
    IMPORTANT: confirm the singleton primary-key value used elsewhere for `studio_owner_config` (it may be a fixed id like `'singleton'` or `'default'` — read how BD4 seeds/reads it and match it EXACTLY; if the table has no `id` text PK or uses a different conflict target, adapt the `ON CONFLICT` accordingly). Do NOT invent a new key.

    2. `rotate-meta-token` — re-save only the token (clears + replaces), same fixed scope:
    ```typescript
    if (intent === "rotate-meta-token") {
      const token = String(fd.get("token") ?? "").trim();
      if (!token) return { ok: false, error: "Paste a token first.", intent };
      await writeAppSecret({ key: "META_CAPI_TOKEN", value: token, scope: "workspace", scopeId: "global",
        description: "Meta Conversions API access token" });
      return { ok: true, intent };
    }
    ```

    3. `send-meta-test-event` — fire a real CAPI Lead via the Task 1 helper, reading current config:
    ```typescript
    if (intent === "send-meta-test-event") {
      // guard:allow-unscoped — studio-global config
      const rows = await (getDb() as any).execute(sql`
        SELECT meta_pixel_id, meta_test_event_code FROM studio_owner_config LIMIT 1
      `);
      const c = (rows?.rows ?? rows)?.[0] ?? {};
      const { sendMetaTestLead } = await import("../../server/lib/meta-capi-test-send.js"); // match real relative depth
      const result = await sendMetaTestLead({
        pixelId: c.meta_pixel_id ?? "",
        testEventCode: c.meta_test_event_code ?? "",
      });
      return { ok: result.ok, intent, fbtraceId: result.fbtraceId, error: result.error };
    }
    ```
    Verify the actual relative import path to `server/lib/meta-capi-test-send` and to the `writeAppSecret`/`appSecretExistsByKey` exports (they may come from `@agent-native/core` or a `@agent-native/core/server` subpath — match how other files import core secrets). NEVER log or echo the token. Run prettier.
  </action>
  <verify>
    <automated>grep -n "save-meta-config" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "send-meta-test-event" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "appSecretExistsByKey" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "writeAppSecret" apps/staff-web/app/routes/gymos.settings.integrations.tsx</automated>
  </verify>
  <acceptance_criteria>
    - The loader returns a `meta` object with `pixelId, testEventCode, tokenConfigured, configured, lastSendStatus, lastSendAt`
    - `tokenConfigured` is sourced from `appSecretExistsByKey("META_CAPI_TOKEN")` (by-key, not by-session)
    - `lastSendStatus` reads `meta_lead_attribution.lead_status` (most recent), values `'sent' | 'failed' | 'never'`
    - The action handles `save-meta-config`, `rotate-meta-token`, and `send-meta-test-event` intents
    - Token storage uses `writeAppSecret({ key: "META_CAPI_TOKEN", ..., scope: "workspace", scopeId: "global" })` (NOT `pgp_sym_encrypt`, NOT the `secrets` table)
    - `save-meta-config` upserts `studio_owner_config` with `ON CONFLICT` on the singleton (creates the row if absent), using the SAME pk/conflict-target the rest of the codebase uses for that table
    - `pixelId` is sanitized to digits-only before storage
    - `send-meta-test-event` calls `sendMetaTestLead(...)` and returns `{ ok, fbtraceId, error }`
    - No `token` value appears in any `console.log`
  </acceptance_criteria>
  <done>Loader exposes Meta config + last-send health; three intents save config to app_secrets+studio_owner_config and fire a real test Lead — single stable token row.</done>
</task>

<task type="auto" type-note="UI">
  <name>Task 3: "Meta Conversion Tracking" card UI (sibling of the Stripe card)</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx — READ the Stripe card JSX (~line 342) and the rotate-key reveal field JSX (~line 475-544): copy the shadcn primitives used (Card/Button/Input/Badge), the `useFetcher` pattern, the hidden `_intent` input convention, and the masked-secret reveal UX. The new card sits as a SIBLING after the Stripe card.
    - root AGENTS.md — shadcn primitives only, Tabler icons only (no emojis as icons), no browser dialogs (use AlertDialog), optimistic UI.
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
    3. A separate "Send test event" `Button` in its own `fetcher.Form` with hidden `_intent=send-meta-test-event` (D-10). On result, render the returned `fbtraceId` ("Test event sent — fbtrace {id}; check Meta Events Manager → Test Events") or the `error`. Disable the button while in flight.

    Use the loader's `configured` to disable "Send test event" with a hint ("Enter Pixel ID, token, and Test Event Code first") when not configured. No `window.confirm`/`alert` — if any confirmation is needed use shadcn `AlertDialog`. Run prettier.
  </action>
  <verify>
    <automated>grep -n "Meta Conversion Tracking" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "send-meta-test-event" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "pixelId" apps/staff-web/app/routes/gymos.settings.integrations.tsx && grep -n "@tabler/icons-react" apps/staff-web/app/routes/gymos.settings.integrations.tsx</automated>
  </verify>
  <acceptance_criteria>
    - A card titled "Meta Conversion Tracking" renders after the Stripe card
    - It renders a status `Badge` whose text/variant depends on `meta.configured` + `meta.lastSendStatus` (Active / Last send failed / Configured — no sends yet / Not configured)
    - Inputs exist for `pixelId` and `testEventCode` (plain), and a `token` field that is masked and never prefilled (a "Replace token" reveal when already configured)
    - A "Send test event" button posts `_intent=send-meta-test-event` and surfaces the returned `fbtraceId` or `error`
    - Uses shadcn `Card`/`Input`/`Button`/`Badge` and a `@tabler/icons-react` icon (no emoji icons)
    - No `window.confirm` / `window.alert` / `window.prompt` is used
    - The save button shows optimistic in-flight state (disabled + label change) keyed on `fetcher.state`
  </acceptance_criteria>
  <done>Operators have a complete Meta Conversion Tracking card: Pixel ID + Test Event Code + masked token + status/health + real test-send.</done>
</task>

</tasks>

<verification>
- Card + 3 intents + loader status present; token stored to app_secrets via writeAppSecret (worker-decryptable), presence by-key.
- Test-send helper fires a real Graph v23 Lead with top-level test_event_code.
- `npx tsc --noEmit` in apps/staff-web has no new errors.
- Post-deploy (no local dev server): operator enters config, clicks "Send test event", and confirms one Lead in Meta Events Manager → Test Events tab.
</verification>

<success_criteria>
- CAPI-06: "Meta Conversion Tracking" card lets the operator enter Pixel ID (→ studio config), masked CAPI token (→ app_secrets, single row), and Test Event Code (→ studio config), with a config + last-send status indicator and a working "Send test event".
- CAPI-01 (UI completion): pixelId/testEventCode persisted studio-global; META_CAPI_TOKEN stored as an app_secret via the single documented entry point (no duplicate row).
</success_criteria>

<output>
After completion, create `.planning/phases/MC1-foundation-lead-event/MC1-05-SUMMARY.md`.
Note the post-deploy operator walkthrough (enter config → Send test event → see Lead in Test Events) as the CAPI-06 verification, since there is no local dev server.
</output>
