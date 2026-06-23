# Phase MC1: Foundation + Lead event - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A public-form submission fires a **deduplicated `Lead`** to the studio's own Meta Pixel — both browser-side (Pixel JS inside the form iframe) and server-side (Conversions API) — sharing one `event_id` so Meta counts it once. Ad-click attribution (`fbclid` → `fbc`, plus `_fbc`/`_fbp`) is captured on the **parent** page and threaded across the cross-origin iframe boundary. The server send is durable (pg-boss queue + Fly worker, retries on 5xx/network). The operator configures everything (Pixel ID, CAPI token, Test Event Code) in a new "Meta Conversion Tracking" card in `/gymos/settings/integrations`, and it's provable end-to-end in Meta's Test Events.

**This phase is greenfield** — no Meta/Pixel/CAPI/`fbclid` code exists anywhere in the repo today.

**In scope (MC1):** browser Pixel `Lead` + server CAPI `Lead`, dedup via shared `event_id`, cross-iframe attribution capture, `meta_lead_attribution` table, `meta-capi-event` queue + worker sender, studio Meta config + Settings card.

**Out of scope (later phases):** Contact/Purchase/Schedule lifecycle events (MC2), Meta Lead Ads / Instant Forms ingestion (MC3).

</domain>

<decisions>
## Implementation Decisions

### CAPI token storage + send origin
- **D-01:** The **Fly worker** performs the CAPI POST to Meta (honors CAPI-04 — durable pg-boss retry). The Nitro/staff-web app does NOT call Meta directly; it only enqueues.
- **D-02:** `META_CAPI_TOKEN` is stored in the encrypted `app_secrets` table (single source of truth, honors CAPI-01). The operator pastes it once via the Settings card.
- **D-03:** The worker decrypts `app_secrets` using **`BETTER_AUTH_SECRET`** via the existing fallback key material (`sha256(SECRETS_ENCRYPTION_KEY || BETTER_AUTH_SECRET)`). **Setup requirement: `BETTER_AUTH_SECRET` MUST be the identical value on Vercel (staff-web) and on the Fly worker** so the worker can decrypt what staff-web encrypted. The plan must include an explicit task/checklist item to verify this equality.
- **D-04 (Claude's discretion — recommended):** Add a **boot-time decrypt self-test** in the worker: attempt to read a known `app_secret` at startup and log a clear FATAL if decryption fails, so env-var drift fails loudly instead of silently dropping every CAPI event.

### stageEventMap scope + config storage
- **D-05:** Build the **full server-side `stageEventMap` resolver now** with all four sensible defaults (`Lead`/`Contact`/`Purchase`/`Schedule`), even though **MC1 only USES `Lead`**. This means MC2 just adds senders — no resolver rework, and it satisfies MC2's future "rename event without code change" criterion.
- **D-06:** Studio Meta config lives as **additive columns on the existing `studio_owner_config` singleton** (the worker already reads this table). Suggested additive columns: `meta_pixel_id` (text), `meta_test_event_code` (text), `meta_stage_event_map` (JSONB, defaults resolved server-side when null/missing). `META_CAPI_TOKEN` is NOT a column — it stays in `app_secrets`.
- **D-07:** `pixelId` and `testEventCode` are studio-global (resolved by key, not hardcoded to HUSTLE — repeatable per client deploy).

### Settings card UX ("Meta Conversion Tracking")
- **D-08:** New card sits as a sibling of the Stripe Connect card in `apps/staff-web/app/routes/gymos.settings.integrations.tsx`, with a new `action()` intent (model on the existing `rotate-key` pattern).
- **D-09:** **Status indicator shows config completeness AND last-send health** — i.e. whether Pixel ID + token + test code are present, plus the result of the most recent CAPI send (ok / failed / never sent), surfaced from job/attribution state. Not just "field is set."
- **D-10:** **"Send test event" fires a real CAPI `Lead`** with the studio's `testEventCode` + a synthetic `event_id`, so it lands in Meta's Test Events tab within seconds — proving the full token+pixel+worker path. (Not a credentials-only ping.)
- **D-11:** **Token field is masked with a "configured" / "Replace token" state** (like Stripe rotate-key) — never displays the stored token. Presence is resolved **by-key server-side**, ignoring the `app_secrets` scoping quirk, so it shows "configured" for ANY operator login (not empty for non-support logins). Avoids creating a competing duplicate `app_secrets` row on re-paste.

### Attribution capture (cross-iframe)
- **D-12:** **embed.js passes attribution via query params on the iframe `src`** (`?fbc=…&fbp=…&fbclid=…`), read from the parent page's `fbclid` (URL) + `_fbc`/`_fbp` cookies. Synchronous on first paint — matches the existing `accent`/`radius` query-param pattern in `embed-snippet.ts`. (Not postMessage — avoids the Pixel-fires-before-data race.)
- **D-13:** **Synthesize `fbc` as `fb.1.<timestamp>.<fbclid>`** (Meta's spec) when the parent has an `fbclid` but no `_fbc` cookie (e.g. Pixel base code not on the parent site, or cookie blocked/partitioned). Required by success criterion #2.
- **D-14:** **Always fire the CAPI `Lead` even for organic leads** with no Meta attribution — send hashed email/phone + client IP/UA for matching, just omit `fbc`/`fbp`. Every lead is a Lead. Browser + server still share `event_id`.
- **D-15:** The in-iframe browser Pixel and the server CAPI event **share one `event_id`** generated at submit time (CAPI-05). The `event_id` (plus `fbc`/`fbp`) is persisted on `meta_lead_attribution` keyed to the resolved member.

### Carried forward from milestone v2.2 / prior context (NOT re-decided)
- **D-16:** **No consent gate on our side** — Meta consent is the customer's own site responsibility (per v2.2 docs decision).
- **D-17:** PII (email, phone) sent to CAPI must be **SHA-256 hashed** (CAPI-04); `META_CAPI_TOKEN` is never logged and never sent client-side (CAPI-04).
- **D-18:** A failing send for one tenant/event is **isolated** — does not break other events/tenants (CAPI-04).

### Claude's Discretion
- Exact `event_id` generation (nanoid vs uuid) — any collision-safe scheme, shared browser↔server.
- PII normalization before hashing (lowercase/trim email, E.164 phone) — follow Meta's standard normalization rules; researcher to confirm exact spec.
- Graph API version pin — Graph **v23** per requirements; confirm latest stable at implement time.
- Retry/backoff specifics on the worker queue (singletonKey on `event_id` for idempotency/dedup is the expected shape).
- Boot-time decrypt self-test (D-04) implementation details.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase + requirements
- `.planning/ROADMAP.md` § "Phase MC1: Foundation + Lead event" — goal + success criteria.
- `.planning/REQUIREMENTS.md` § PIX-01/02, CAPI-01..06 — the authoritative requirement text.

### Public form + embed (attribution capture)
- `apps/staff-web/features/forms/lib/public-form-ssr.ts` — `renderFormPage()`; client submit `fetch("/api/submit/"+FORM_ID,...)` at ~line 570; postMessages `lead:submitted`; already parses `searchParams`. **Where browser Pixel fires + fbclid/fbc/fbp read into the submit body.**
- `apps/staff-web/features/forms/lib/embed-snippet.ts` — `buildEmbedScript(baseOrigin)`; injects iframe for `[data-gymos-form]` → `/f/<slug>?embed=1`; origin-checked postMessage. **Where parent-page `_fbc`/`_fbp`/`fbclid` are read and appended as iframe query params.**
- `apps/staff-web/server/routes/embed.js.get.ts` — serves `/embed.js`.
- `apps/staff-web/server/routes/f/[...slug].get.ts` and `preview/[...slug].get.ts` — public form routes.

### Form submit (persist attribution + enqueue)
- `apps/staff-web/server/routes/api/submit/[id].post.ts` — re-exports `submitLeadForm`.
- `apps/staff-web/features/forms/handlers/submissions.ts` — THE submit handler; member upsert (dual-unique-key reconcile), conversation/message inserts, §14 lead-ack enqueue. **Where to persist `meta_lead_attribution` + enqueue `meta-capi-event`.**
- `apps/staff-web/features/forms/lib/lead-ack.ts` — model for "enqueue a side-effect after lead capture."

### Config + secrets
- `apps/staff-web/server/db/schema.ts` — Drizzle exports; `studioOwnerConfig` (~line 646), `gymMembers` (~line 109), `formSubmissions`. **Add `metaLeadAttribution` export + meta columns on `studioOwnerConfig` here.**
- `apps/staff-web/server/plugins/db.ts` — `runMigrations([{version, sql}])`; currently ~v30. **Additive migration (next free version) goes here**, NOT the `server/db/migrations/*.sql` snapshots (not auto-run).
- `apps/staff-web/server/lib/app-secrets.ts` — `readAppSecretByKey(key)` (staff-web side).
- `services/worker/src/lib/appSecrets.ts` — `readAppSecretByKey(key, db)` (worker side, same crypto). **Worker decrypts `META_CAPI_TOKEN` here.**
- `apps/staff-web/server/register-secrets.ts` — register `META_CAPI_TOKEN` so it surfaces in Settings; note worker reads at runtime.

### Settings UI
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — page with loader + `action()` intents (`connect-stripe`, `rotate-key`); Stripe card ~line 342. **Add "Meta Conversion Tracking" card ~line 473 + `save-meta-config`/`rotate` intent.**

### Queue + worker
- `packages/queue/src/types.ts` — `QUEUE_NAMES` + Zod payload schemas. **Add `META_CAPI_EVENT: "meta-capi-event"` + `MetaCapiEventPayload`.**
- `packages/queue/src/publish.ts` — enqueue fns. **Add `enqueueMetaCapiEvent()` (singletonKey on `event_id`).**
- `apps/staff-web/app/lib/queue-client.ts` — staff-web re-export wrapper handlers import from.
- `services/worker/src/index.ts` — worker boot; `createQueue` loop + `boss.work()` registration. **Register `META_CAPI_EVENT` queue + worker.**
- `services/worker/src/queues/outbound-whatsapp.ts` — canonical register+handler+retry example. **Model `services/worker/src/queues/meta-capi-event.ts` on this**; `telemetry-push.ts` is the closest outbound-HTTP-to-external analog.

### Project rules
- `CLAUDE.md` / `AGENTS.md` — additive-only migrations (no drop/rename), no `drizzle-kit push`, access-scoping rules, shadcn/Tabler UI rules, optimistic UI.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`outbound-whatsapp.ts` worker queue** — exact register/handler/retry/final-attempt shape to copy for the CAPI sender.
- **`lead-ack.ts` + §14 of `submissions.ts`** — proven "enqueue a durable side-effect right after lead capture" pattern.
- **Stripe `rotate-key` intent** in `gymos.settings.integrations.tsx` — masked-secret + replace UX to copy for the CAPI token field.
- **`readAppSecretByKey` (both staff-web and worker twins)** — already-implemented AES-256-GCM read; reuse for `META_CAPI_TOKEN`.
- **`studio_owner_config` singleton** — already worker-readable; additive columns avoid a new table for config.
- **Query-param threading (`accent`/`radius`)** in `embed-snippet.ts` + `public-form-ssr.ts` — pattern to extend for `fbc`/`fbp`/`fbclid`.

### Established Patterns
- **Migrations** = inline versioned SQL in `server/plugins/db.ts` `runMigrations`, strictly additive. The `*.sql` snapshots are NOT auto-run (documented gotcha).
- **Enqueue** = staff-web imports enqueue fns from `app/lib/queue-client.ts` (not `@gymos/queue` directly); worker registers one `boss.work()` per `QUEUE_NAMES` entry.
- **Public form HTML** = a single self-contained SSR string with inline `<script>` IIFE — the browser Pixel snippet and `event_id` generation live inside this string.

### Integration Points
- Submit body: `submissions.ts` reads new `fbc`/`fbp`/`event_id`/`pageUrl` fields → writes `meta_lead_attribution` → `enqueueMetaCapiEvent()`.
- Worker boot loop in `services/worker/src/index.ts` gains the new queue + handler.
- Settings page `action()` gains a `save-meta-config` / token-rotate intent.

### Constraints / gotchas to respect
- Worker historically can't decrypt some `app_secrets` — **mitigated by D-03** (identical `BETTER_AUTH_SECRET` on both) + **D-04** (boot self-test).
- `app_secrets` scoping quirk: keys appear empty for non-support logins — **mitigated by D-11** (by-key presence resolution, masked field).
- Member upsert dual-unique-key reconcile (email AND phone) — attribution row keys off the resolved `member_id` AFTER reconcile.
- Single iframe origin (`gym-class-os.vercel.app`) shared across studios today — fine under current single-studio (HUSTLE) deploy; note for future per-studio cookie isolation.

</code_context>

<specifics>
## Specific Ideas

- `fbc` synthesis format is literally `fb.1.<unix_ms_timestamp>.<fbclid>`.
- Dedup is proven by browser `Lead` + server `Lead` sharing an **identical `event_id`** in Events Manager → Test Events (counted once).
- "Send test event" must produce a visible row in Meta's **Test Events** tab using the studio's `testEventCode`.
- Graph API **v23** for the CAPI POST endpoint (`/v23.0/<pixel_id>/events`).
- Queue idempotency: singletonKey on the Meta `event_id`.

</specifics>

<deferred>
## Deferred Ideas

- **Contact / Purchase / Schedule lifecycle events** — Phase MC2 (the `stageEventMap` resolver is built now so MC2 only adds senders).
- **Meta Lead Ads / Instant Forms ingestion** — Phase MC3.
- **Per-studio cookie/origin isolation** for the shared iframe origin — only relevant once a second studio shares a deploy; out of scope for single-tenant HUSTLE.
- **Advanced match-quality (EMQ) surfacing in the UI** beyond last-send health — could be a later polish; MC1 status shows ok/failed/never-sent.

None of these block MC1.

</deferred>

---

*Phase: MC1-foundation-lead-event*
*Context gathered: 2026-06-23*
