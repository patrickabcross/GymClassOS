# Phase MC1: Foundation + Lead event — Research

**Researched:** 2026-06-23
**Domain:** Meta Pixel + Conversions API (Graph v23), pg-boss queue patterns, cross-iframe attribution capture
**Confidence:** HIGH (architecture + code patterns), MEDIUM (Meta API specifics cross-verified via multiple third-party sources; official docs truncate on WebFetch)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** The Fly worker performs the CAPI POST to Meta (honors CAPI-04 — durable pg-boss retry). The Nitro/staff-web app does NOT call Meta directly; it only enqueues.

**D-02:** `META_CAPI_TOKEN` is stored in the encrypted `app_secrets` table (single source of truth, honors CAPI-01). The operator pastes it once via the Settings card.

**D-03:** The worker decrypts `app_secrets` using `BETTER_AUTH_SECRET` via the existing fallback key material (`sha256(SECRETS_ENCRYPTION_KEY || BETTER_AUTH_SECRET)`). `BETTER_AUTH_SECRET` MUST be the identical value on Vercel (staff-web) and on the Fly worker. The plan must include an explicit task/checklist item to verify this equality.

**D-04 (Claude's discretion — recommended):** Add a boot-time decrypt self-test in the worker: attempt to read a known `app_secret` at startup and log a clear FATAL if decryption fails.

**D-05:** Build the full server-side `stageEventMap` resolver now with all four sensible defaults (`Lead`/`Contact`/`Purchase`/`Schedule`), even though MC1 only USES `Lead`.

**D-06:** Studio Meta config lives as additive columns on the existing `studio_owner_config` singleton. Suggested additive columns: `meta_pixel_id` (text), `meta_test_event_code` (text), `meta_stage_event_map` (JSONB, defaults resolved server-side when null/missing). `META_CAPI_TOKEN` is NOT a column — it stays in `app_secrets`.

**D-07:** `pixelId` and `testEventCode` are studio-global (resolved by key, not hardcoded to HUSTLE — repeatable per client deploy).

**D-08:** New Settings card sits as a sibling of the Stripe Connect card in `apps/staff-web/app/routes/gymos.settings.integrations.tsx`, with a new `action()` intent (modeled on the existing `rotate-key` pattern).

**D-09:** Status indicator shows config completeness AND last-send health.

**D-10:** "Send test event" fires a real CAPI `Lead` with the studio's `testEventCode` + a synthetic `event_id`, proving the full path.

**D-11:** Token field is masked with a "configured" / "Replace token" state (like Stripe rotate-key) — never displays the stored token. Presence is resolved by-key server-side.

**D-12:** `embed.js` passes attribution via query params on the iframe `src` (`?fbc=…&fbp=…&fbclid=…`), read from the parent page's `fbclid` (URL) + `_fbc`/`_fbp` cookies.

**D-13:** Synthesize `fbc` as `fb.1.<timestamp>.<fbclid>` (Meta's spec) when the parent has an `fbclid` but no `_fbc` cookie.

**D-14:** Always fire the CAPI `Lead` even for organic leads with no Meta attribution — send hashed email/phone + client IP/UA, just omit `fbc`/`fbp`. Every lead is a Lead.

**D-15:** The in-iframe browser Pixel and the server CAPI event share one `event_id` generated at submit time. The `event_id` (plus `fbc`/`fbp`) is persisted on `meta_lead_attribution` keyed to the resolved member.

**D-16:** No consent gate on our side.

**D-17:** PII (email, phone) sent to CAPI must be SHA-256 hashed; `META_CAPI_TOKEN` is never logged and never sent client-side.

**D-18:** A failing send for one tenant/event is isolated — does not break other events/tenants.

### Claude's Discretion

- Exact `event_id` generation (nanoid vs uuid) — any collision-safe scheme, shared browser↔server.
- PII normalization before hashing (lowercase/trim email, E.164 phone) — follow Meta's standard normalization rules.
- Graph API version pin — Graph **v23** per requirements; confirm latest stable at implement time.
- Retry/backoff specifics on the worker queue (`singletonKey` on `event_id` for idempotency/dedup is the expected shape).
- Boot-time decrypt self-test (D-04) implementation details.

### Deferred Ideas (OUT OF SCOPE)

- Contact / Purchase / Schedule lifecycle events — Phase MC2.
- Meta Lead Ads / Instant Forms ingestion — Phase MC3.
- Per-studio cookie/origin isolation for the shared iframe origin — only relevant once a second studio shares a deploy.
- Advanced match-quality (EMQ) surfacing in the UI beyond last-send health.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIX-01 | Public form page loads studio's Meta Pixel and fires browser `Lead` event on successful submit, sharing `event_id` with server event | Section: Pixel Base Code + fbq snippet |
| PIX-02 | `embed.js` reads `fbclid` + `_fbc`/`_fbp` from parent page and passes into cross-origin iframe | Section: fbc/fbp mechanics, embed.js extension pattern |
| CAPI-01 | Studio Meta config storage — `pixelId` + `testEventCode` + `stageEventMap` + `META_CAPI_TOKEN` as `app_secret` | Section: Config Storage Pattern |
| CAPI-02 | Additive `meta_lead_attribution` table persists `fbc`/`fbp`/`initial_event_id` at submit time | Section: Schema Migration |
| CAPI-03 | `/api/submit/:id` extended to accept and persist `fbc`/`fbp`/`event_id`/`pageUrl`, enqueue `meta-capi-event` | Section: submissions.ts extension pattern |
| CAPI-04 | pg-boss `meta-capi-event` queue + Fly worker sender POSTs to Meta CAPI with hashed PII, retrying on 5xx | Section: CAPI POST payload, Worker Queue Pattern, Error Semantics |
| CAPI-05 | Browser `Lead` and server `Lead` share identical `event_id` so Meta deduplicates | Section: Dedup Mechanics |
| CAPI-06 | "Meta Conversion Tracking" Settings card — Pixel ID, CAPI token (masked), Test Event Code, status indicator, "Send test event" | Section: Settings Card Pattern |
</phase_requirements>

---

## Summary

Phase MC1 wires a Meta Conversions API `Lead` event pipeline onto the existing public form submit flow. The architecture is already well-decided (CONTEXT.md): browser Pixel fires from inside the form iframe (`/f/:slug`), parent-page `fbclid`/`_fbc`/`_fbp` cookies flow across the cross-origin boundary via `embed.js` query params, the submit handler persists attribution to a new `meta_lead_attribution` table and enqueues a `meta-capi-event` pg-boss job, and the Fly worker performs the CAPI POST.

The codebase provides exact patterns for every integration point. The queue/worker pattern (`outbound-whatsapp.ts`) is a complete template for `meta-capi-event.ts`. The `app_secrets` decrypt infrastructure (`readAppSecretByKey`) exists on both staff-web and the worker and is already proven to work with `BETTER_AUTH_SECRET`. The Settings card `rotate-key` pattern in `gymos.settings.integrations.tsx` is the exact UX model for the masked CAPI token field.

**Primary recommendation:** Model `services/worker/src/queues/meta-capi-event.ts` directly on `outbound-whatsapp.ts` (terminal vs retryable error split, `includeMetadata: true`, final-attempt write). Extend `embed-snippet.ts`/`public-form-ssr.ts` with the fbc/fbp query-param threading pattern already proven for `accent`/`radius`. The Meta CAPI payload is straightforward — the main precision requirement is correct SHA-256 normalization order (normalize first, then hash) and `test_event_code` at the top-level of the JSON body (not inside each event).

---

## Standard Stack

### Core (already in repo — no new deps)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `node:crypto` | built-in | SHA-256 hashing for PII (email, phone) | Already used in `appSecrets.ts` (`createHash`) |
| `pg-boss` | v12 (already in worker) | `meta-capi-event` queue + retry | Worker already runs pg-boss v12 |
| `zod` | `^4.x` (catalog) | `MetaCapiEventPayload` schema in `packages/queue/src/types.ts` | Already in repo |
| `nanoid` | `^5.1.x` (catalog) | `event_id` generation (collision-safe, shared browser↔server) | Already in submissions.ts |
| `fetch` | Node built-in (Node 22) | CAPI POST from worker (`global.fetch`) | Worker runs Node 22 per CLAUDE.md |

### No new npm dependencies needed

The CAPI POST is a plain `fetch()` call. No Meta SDK needed (CONTEXT.md D-14 implies direct Graph API calls). The `@great-detail/whatsapp` SDK is WhatsApp-only; CAPI is a separate REST endpoint.

### Supporting (UI only — already in repo)

| Library | Purpose |
|---------|---------|
| `@tabler/icons-react` | Settings card icon (`IconBrandMeta` or `IconAd2`) |
| shadcn `Button`, `Input`, `Badge` | Settings card form fields (masked token, pixel ID) |

**Version verification:** No new packages to install. All required capabilities are already available.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
packages/queue/src/
├── types.ts                          # ADD: META_CAPI_EVENT queue name + MetaCapiEventPayload Zod schema
└── publish.ts                        # ADD: enqueueMetaCapiEvent() with singletonKey on event_id

services/worker/src/
├── index.ts                          # EXTEND: createQueue + registerMetaCapiEventWorker
└── queues/
    └── meta-capi-event.ts            # NEW: modeled on outbound-whatsapp.ts

apps/staff-web/
├── server/db/schema.ts               # ADD: metaLeadAttribution Drizzle export
├── server/plugins/db.ts              # ADD: migration v31 (meta_lead_attribution) + v32 (studio_owner_config columns)
├── server/register-secrets.ts        # ADD: registerRequiredSecret for META_CAPI_TOKEN
├── features/forms/handlers/submissions.ts  # EXTEND: read fbc/fbp/event_id from body, persist attribution, enqueue
├── features/forms/lib/public-form-ssr.ts   # EXTEND: Pixel snippet + event_id generation in inline <script>
├── features/forms/lib/embed-snippet.ts     # EXTEND: read fbclid/_fbc/_fbp from parent, pass as query params
└── app/routes/gymos.settings.integrations.tsx  # EXTEND: Meta Conversion Tracking card + action intents
```

### Pattern 1: CAPI POST Payload (Graph v23)

**What:** POST to `https://graph.facebook.com/v23.0/<pixel_id>/events?access_token=<token>`

**Request body (confirmed via multiple third-party sources cross-referencing official Meta docs):**

```typescript
// Source: Meta Conversions API docs (via watsspace.com/blog/meta-conversions-api-the-complete-guide/)
// Confidence: MEDIUM (cross-verified; official docs truncated on WebFetch)
{
  "data": [
    {
      "event_name": "Lead",                    // REQUIRED — exactly "Lead" (capital L)
      "event_time": 1719100000,                // REQUIRED — Unix timestamp in SECONDS (not ms)
      "event_id": "mc1_<nanoid>",              // REQUIRED for dedup — same value as browser Pixel
      "action_source": "website",              // REQUIRED for website events
      "event_source_url": "https://example.com/trial-signup",  // RECOMMENDED — parent page URL
      "user_data": {
        "em": ["<sha256(lowercase_trimmed_email)>"],  // hashed array
        "ph": ["<sha256(digits_only_phone)>"],        // hashed array; E.164 digits only (strip +)
        "fn": "<sha256(lowercase_fn)>",               // optional; hashed
        "ln": "<sha256(lowercase_ln)>",               // optional; hashed
        "fbc": "fb.1.1719100000000.AQzXy...",         // NOT hashed — plain string
        "fbp": "fb.1.1719000000000.987654321",         // NOT hashed — plain string
        "client_ip_address": "1.2.3.4",              // NOT hashed — plain string
        "client_user_agent": "Mozilla/5.0..."         // NOT hashed — plain string
      },
      "custom_data": {}  // optional for Lead — empty object is fine
    }
  ],
  "test_event_code": "TEST12345"  // TOP-LEVEL (not inside event) — omit in production
}
```

**Key distinctions:**
- `event_time` is UNIX SECONDS, not milliseconds (opposite of fbc/fbp which use ms)
- `em` and `ph` are sent as **arrays** (Meta accepts single-element arrays)
- `test_event_code` is a **top-level** field alongside `data`, not inside the event object
- `access_token` is a **URL query parameter**, not in the request body
- `client_ip_address` field name (not `ip_address`) — confirmed in user_data sub-object

**Success response:**
```json
{ "events_received": 1, "messages": [], "fbtrace_id": "Dk2abcXYZ", "success": true }
```

### Pattern 2: PII Normalization + SHA-256 Hashing

**Confirmed normalization order: NORMALIZE FIRST, then hash. Wrong order = wrong hash.**

```typescript
// Source: ceaksan.com/en/facebook-pixel-and-events + watsspace.com confirmed rules
import { createHash } from "node:crypto";

function hashField(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// em (email): lowercase + trim, then hash
const hashedEmail = hashField(email.toLowerCase().trim());

// ph (phone): digits only (remove all non-digits including leading +), then hash
// Meta wants E.164 digits without the + (e.g. "447700900123" not "+447700900123")
const hashedPhone = hashField(phoneE164.replace(/\D/g, ""));

// fn (first name): lowercase letters only, no spaces or punctuation, then hash
const hashedFn = hashField(firstName.toLowerCase().replace(/[^a-z]/g, ""));

// ln (last name): lowercase, then hash
const hashedLn = hashField(lastName.toLowerCase().trim());

// NOT hashed — sent as plain strings:
// fbc, fbp, client_ip_address, client_user_agent
```

**Confidence: HIGH** — confirmed by multiple sources (ceaksan.com table, watsspace.com guide, Meta's own Advanced Matching documentation behavior observed in CAPI implementations).

### Pattern 3: fbc / fbp Mechanics

**fbc format (click attribution):**
```
fb.1.<creation_time_ms>.<fbclid_value>
```
- `fb.1` = version prefix (always "fb.1")
- `creation_time_ms` = Unix timestamp in **milliseconds** (13-digit, e.g. `1719100000000`)
- `fbclid_value` = the raw fbclid URL param value

**Synthesis when fbclid in URL but no `_fbc` cookie:**
```javascript
// Source: watsspace.com/blog/meta-conversions-api-fbc-and-fbp-parameters/ — MEDIUM confidence
const fbc = `fb.1.${Date.now()}.${fbclid}`;
```
This is exactly what D-13 requires. The `Date.now()` produces milliseconds, which is correct.

**fbp format (browser ID):**
```
fb.1.<creation_time_ms>.<random_number>
```
The `_fbp` cookie is set by the Meta Pixel base code and has this exact format. Read it as-is from the cookie — do NOT re-synthesize or hash it.

**embed.js extension:** Read from parent page in `buildEmbedScript()`:
```javascript
// Add to embed-snippet.ts after existing buildParams(accent, radius) calls
function readCookie(name) {
  var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
  return m ? decodeURIComponent(m[1]) : '';
}

function buildAttributionParams() {
  var fbclid = new URLSearchParams(location.search).get('fbclid') || '';
  var fbc = readCookie('_fbc');
  var fbp = readCookie('_fbp');
  // Synthesize fbc if fbclid present but no _fbc cookie (D-13)
  if (fbclid && !fbc) {
    fbc = 'fb.1.' + Date.now() + '.' + fbclid;
  }
  var p = '';
  if (fbc) p += '&fbc=' + encodeURIComponent(fbc);
  if (fbp) p += '&fbp=' + encodeURIComponent(fbp);
  if (fbclid) p += '&fbclid=' + encodeURIComponent(fbclid);
  return p;
}
// Then append buildAttributionParams() to the iframe src
```

**iframe `src` extension (in `injectEmbeds()`):**
```javascript
var src = BASE + "/f/" + encodeURIComponent(slug) + "?embed=1" + buildParams(accent, radius) + buildAttributionParams();
```

### Pattern 4: Browser Pixel Snippet (in-iframe)

The Pixel fires INSIDE the form iframe (not on the parent page). `public-form-ssr.ts` renders the form HTML as a self-contained SSR string, so the Pixel snippet goes directly into `renderFormPage()`.

**Pixel base code + Lead event:**
```html
<!-- Inline in renderFormPage() — Pixel base code -->
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

**Lead event fired at submit success (inside the existing `.then()` handler in the IIFE):**
```javascript
// Generate event_id here — shared with server via submit body
var EVENT_ID = 'mc1_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
// ... include EVENT_ID in the fetch() POST body as body.event_id ...
// After successful submit:
if (typeof fbq !== 'undefined') {
  fbq('track', 'Lead', {}, { eventID: EVENT_ID });
}
```

**Critical notes:**
- `eventID` (camelCase with capital ID) is the correct param name for the 4th fbq() argument — verified across multiple sources
- The event_id must be generated BEFORE the fetch() call so the same value can be sent in both the POST body and the fbq() call
- `fbq('init', pixelId)` must be called with the pixelId template variable from the server (SSR-injected)
- `pixelId` is resolved from `studio_owner_config.meta_pixel_id` at render time in `renderFormPage()`

**Pixel base code on parent page:** The parent site may or may not have the Pixel base code. Per D-13, we synthesize `fbc` from `fbclid` regardless of whether the parent Pixel is installed. The iframe's own Pixel initialization is sufficient for the browser-side Lead event.

### Pattern 5: Browser↔Server Deduplication

**How dedup works (MEDIUM confidence — verified via bradfarleigh.com + taggrs.io + meta docs behavior):**
- Meta matches events by `event_name` (case-sensitive: "Lead" not "lead") AND `event_id` (exact string match)
- Deduplication window: **48 hours**
- The browser Pixel event must use `{ eventID: '<same_string>' }` as the 4th parameter to `fbq('track', 'Lead', {}, { eventID })`
- The server CAPI event must include `"event_id": "<same_string>"` in the event object
- Both must fire against the same Pixel (same `pixel_id`)
- In **Test Events** (when `test_event_code` is set), deduplication IS visible — the Test Events tab shows both events arriving but counts them once. This is the verification path for success criterion #1.
- The Events Manager shows a "Deduplication" column in the data quality view

**event_id generation strategy:**
Generate in the browser BEFORE submit, pass in the POST body, fire in `fbq()` after success. A simple collision-safe string works:
```javascript
// Browser-side generation (in the form IIFE, before the fetch() call)
var EVENT_ID = 'mc1_' + Math.random().toString(36).slice(2,9) + '_' + Date.now().toString(36);
```
The same value arrives at `submissions.ts` as `body.event_id`, gets persisted on `meta_lead_attribution.initial_event_id`, and is included in `MetaCapiEventPayload`.

### Pattern 6: pg-boss Queue + Worker (meta-capi-event.ts)

Model on `services/worker/src/queues/outbound-whatsapp.ts`. The key structural elements:

**In `packages/queue/src/types.ts` (ADD):**
```typescript
export const QUEUE_NAMES = {
  // ... existing ...
  META_CAPI_EVENT: "meta-capi-event",
} as const;

export const MetaCapiEventPayload = z.object({
  eventId: z.string().min(1),        // the shared browser↔server event_id
  memberId: z.string().min(1),       // for idempotency tracking + attribution lookup
  pixelId: z.string().min(1),        // from studio_owner_config
  eventName: z.string().min(1),      // default: "Lead" (from stageEventMap)
  actionSource: z.string().min(1),   // "website" for form leads
  eventTime: z.number().int(),       // Unix seconds
  eventSourceUrl: z.string().optional(),
  // Hashed PII (pre-hashed by submissions.ts before enqueue — never store raw PII in queue)
  hashedEmail: z.string().optional(),
  hashedPhone: z.string().optional(),
  hashedFn: z.string().optional(),
  hashedLn: z.string().optional(),
  // Attribution (plain — not hashed per Meta spec)
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  clientIp: z.string().optional(),
  clientUserAgent: z.string().optional(),
});
export type MetaCapiEventPayload = z.infer<typeof MetaCapiEventPayload>;
```

**In `packages/queue/src/publish.ts` (ADD):**
```typescript
export async function enqueueMetaCapiEvent(
  args: MetaCapiEventPayload,
): Promise<string | null> {
  const data = MetaCapiEventPayload.parse(args);
  const boss = await startBoss();
  return boss.send(QUEUE_NAMES.META_CAPI_EVENT, data, {
    singletonKey: `${QUEUE_NAMES.META_CAPI_EVENT}:${data.eventId}`,
    retryLimit: 5,
    retryBackoff: true,
    expireInSeconds: 60 * 60 * 24,  // 24h — within Meta's dedup window
  });
}
```

**In `services/worker/src/queues/meta-capi-event.ts` (NEW):**

Structure mirrors `outbound-whatsapp.ts` exactly:
- `boss.work(QUEUE_NAMES.META_CAPI_EVENT, { batchSize: 1, localConcurrency: 1, includeMetadata: true }, async (jobs) => { ... })`
- `MetaCapiEventPayload.parse(job.data)` for typed access
- Read `META_CAPI_TOKEN` via `readAppSecretByKey("META_CAPI_TOKEN", db)` — returns null if not configured
- If token or pixelId missing: unconfigured-skip pattern (log warn, return cleanly — same as `telemetry-push.ts`)
- Build the CAPI payload, POST to `https://graph.facebook.com/v23.0/${data.pixelId}/events?access_token=${token}`
- **On success (HTTP 2xx):** return normally (pg-boss marks complete)
- **On permanent error (HTTP 400 with non-transient error, e.g. bad token code 190, bad pixel, bad data):** log the error and return normally (do NOT retry — these will never succeed). Detect via `resp.status === 400` + `error.is_transient === false` in the JSON response, OR via specific error codes (190 = invalid token, 100 = invalid parameter).
- **On retryable error (HTTP 5xx, network error, timeout, `is_transient: true`):** re-throw so pg-boss retries. On final attempt (`retryCount >= retryLimit`): log FATAL + return (don't re-throw — the event is lost but isolated, per D-18).

### Pattern 7: Meta Error Semantics (Retryable vs Permanent)

**Confirmed via Meta Graph API error handling docs and CAPI community resources:**

| Error | HTTP | Behavior | Code | Retry? |
|-------|------|---------|------|--------|
| Invalid/expired access token | 400 | `error.type="OAuthException"`, `code=190` | 190 | NO — permanent until token is replaced |
| Invalid pixel ID / dataset not found | 400 | `error.code=100` or similar | 100 | NO — permanent |
| Invalid parameter / bad data | 400 | `error.code=100`, `is_transient=false` | 100 | NO — fix the payload |
| Transient server error | 500/503 | `error.is_transient=true` or network timeout | 1/2 | YES |
| Rate limit | 400/429 | `error.code=4` or `error.code=17` | 4/17 | YES — with backoff |
| Network timeout / connection refused | N/A (fetch throw) | `ECONNREFUSED`/`ETIMEDOUT` | n/a | YES |

**Detection pattern in worker:**
```typescript
// After: const respJson = await resp.json()
const metaError = respJson?.error;
const isPermanent =
  !resp.ok &&
  (metaError?.is_transient === false ||
   metaError?.code === 190 ||  // bad token
   (resp.status >= 400 && resp.status < 500 && metaError?.is_transient !== true));

if (isPermanent) {
  log.warn({ eventId: data.eventId, error: metaError }, "[meta-capi-event] permanent error — not retrying");
  return; // pg-boss marks complete; event is not retried
}
if (!resp.ok) {
  throw new Error(`Meta CAPI ${resp.status}: ${JSON.stringify(metaError)}`);
}
```

### Pattern 8: Config Storage (studio_owner_config additive columns)

**Current `studio_owner_config` (from schema.ts line 646 + db.ts migration v17):**
- `id`, `owner_phone_e164`, `studio_timezone`, `digest_enabled`, `heartbeat_enabled`, `heartbeat_batch_size`, `created_at`, `updated_at`

**Additive columns to add (migration v31 in db.ts — NEXT FREE VERSION after v30):**
```sql
-- v31: Meta Conversion Tracking config (MC1-CAPI-01)
-- Additive only — NO DROP/RENAME. meta_pixel_id and meta_test_event_code are plain text.
-- meta_stage_event_map is JSONB in Postgres (TEXT in SQLite for dev compatibility).
ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;
ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT;
ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_stage_event_map TEXT;
```

The `meta_stage_event_map` stores a JSON object mapping stage keys to Meta event names:
```json
{
  "lead": "Lead",
  "contact": "Contact",
  "purchase": "Purchase",
  "schedule": "Schedule"
}
```
When null, the worker/resolver applies these exact defaults. This satisfies D-05 (full map built now) and CAPI-01.

**Drizzle export addition in schema.ts:**
```typescript
export const studioOwnerConfig = table("studio_owner_config", {
  // ...existing columns...
  metaPixelId: text("meta_pixel_id"),
  metaTestEventCode: text("meta_test_event_code"),
  metaStageEventMap: text("meta_stage_event_map"), // JSON TEXT
});
```

### Pattern 9: meta_lead_attribution Table (CAPI-02)

**Migration v32 (after v31):**
```sql
-- v32: Meta lead attribution — keyed by member_id.
-- One row per member; updated on re-submit (ON CONFLICT DO UPDATE).
-- Stores attribution at first form submit; per-stage fired markers for MC2 dedup.
CREATE TABLE IF NOT EXISTS meta_lead_attribution (
  id                TEXT PRIMARY KEY,
  member_id         TEXT NOT NULL UNIQUE,  -- natural key: one attribution per member
  fbc               TEXT,                  -- fb.1.timestamp.fbclid (NOT hashed)
  fbp               TEXT,                  -- fb.1.timestamp.random (NOT hashed)
  fbclid            TEXT,                  -- raw fbclid URL param
  initial_event_id  TEXT,                  -- shared browser+server event_id for Lead dedup
  page_url          TEXT,                  -- event_source_url for CAPI
  client_ip         TEXT,                  -- for EMQ; not hashed
  client_user_agent TEXT,                  -- for EMQ; not hashed
  lead_sent_at      TEXT,                  -- ISO timestamp when CAPI Lead was fired
  lead_status       TEXT,                  -- 'queued' | 'sent' | 'failed' | null
  -- MC2 stage markers (additive — set to ISO timestamp when fired, null = not yet)
  contact_sent_at   TEXT,
  purchase_sent_at  TEXT,
  schedule_sent_at  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Index:
```sql
CREATE INDEX IF NOT EXISTS idx_meta_lead_attribution_member ON meta_lead_attribution(member_id)
```

### Pattern 10: submissions.ts Extension

**Where to add (after step 13, before the WhatsApp lead-ack in step 14):**

```typescript
// § NEW — Meta Lead Attribution + CAPI enqueue (MC1-CAPI-03)
//
// Read from submit body (browser passes these from the iframe query params):
const metaFbc = typeof body.fbc === "string" ? body.fbc.slice(0, 200) : null;
const metaFbp = typeof body.fbp === "string" ? body.fbp.slice(0, 100) : null;
const metaEventId = typeof body.event_id === "string" ? body.event_id.slice(0, 100) : null;
const metaPageUrl = typeof body.page_url === "string" ? body.page_url.slice(0, 500) : null;
const userAgent = getRequestHeader(event, "user-agent") ?? null;

// Hash PII before enqueue — raw PII must never enter the queue.
// (import createHash from 'node:crypto' at top of file)
const hashedEmail = email ? hashForCapi(email.toLowerCase().trim()) : null;
const hashedPhone = phoneE164 ? hashForCapi(phoneE164.replace(/\D/g, "")) : null;

// Upsert attribution (ON CONFLICT(member_id) DO UPDATE — re-submit updates attribution)
await db2.execute(sql`
  INSERT INTO meta_lead_attribution
    (id, member_id, fbc, fbp, fbclid, initial_event_id, page_url, client_ip, client_user_agent, created_at, updated_at)
  VALUES
    (${nanoid()}, ${resolvedMemberId}, ${metaFbc}, ${metaFbp}, ${body.fbclid ?? null},
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

// Enqueue CAPI Lead — only if pixelId is configured (read from studio_owner_config)
// (Worker handles unconfigured-skip too, but avoid unnecessary jobs)
try {
  const { enqueueMetaCapiEvent } = await import("../../app/lib/queue-client.js");
  if (metaEventId) {
    await enqueueMetaCapiEvent({
      eventId: metaEventId,
      memberId: resolvedMemberId,
      pixelId: "", // resolved by worker from studio_owner_config
      eventName: "Lead",
      actionSource: "website",
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: metaPageUrl ?? undefined,
      hashedEmail: hashedEmail ?? undefined,
      hashedPhone: hashedPhone ?? undefined,
      fbc: metaFbc ?? undefined,
      fbp: metaFbp ?? undefined,
      clientIp: ip ?? undefined,
      clientUserAgent: userAgent ?? undefined,
    });
  }
} catch (err) {
  // Lead capture always succeeds even if CAPI enqueue fails — same resilience as WhatsApp ack
  console.error("[submitLeadForm] CAPI enqueue failed:", err);
}
```

**Note:** `pixelId` can be resolved by the worker from `studio_owner_config` rather than being passed in the payload. This avoids a DB read in the submit handler and keeps the payload lean. Worker reads `studio_owner_config` at job execution time (already does this for other config lookups).

### Pattern 11: Settings Card (gymos.settings.integrations.tsx)

The integrations page (`gymos.settings.integrations.tsx`) already has:
- `loader()` that returns config/status data
- `action()` function with intent-based dispatch (`_intent` hidden input)
- `rotate-key` pattern for masked secrets (lines 475+, behind `?devKeyEntry=1`)

**New intent handlers to add:**
1. `save-meta-config` — saves `meta_pixel_id`, `meta_test_event_code` to `studio_owner_config` via `UPDATE ... SET meta_pixel_id = ... WHERE id = 'singleton'`; upserts `META_CAPI_TOKEN` to `app_secrets` via the framework's `writeAppSecret` function (same mechanism as Settings → API Keys)
2. `rotate-meta-token` — clear + re-save the `META_CAPI_TOKEN` (same as rotate-key pattern)
3. `send-meta-test-event` — fire a real CAPI Lead to Meta with `testEventCode`, synthetic `event_id`, synthetic PII (or real operator data if available). Returns `{ ok, fbtrace_id, error }` to surface in the UI.

**Token presence detection (D-11 — by-key, avoids scoping quirk):**
```typescript
// In loader() — mirrors the pattern from 260620-c8p quick task
const { readAppSecretByKey } = await import("../../server/lib/app-secrets.js");
const tokenPresent = !!(await readAppSecretByKey("META_CAPI_TOKEN"));
```

**Status indicator data from loader:**
- `metaConfigured`: `!!(meta_pixel_id && tokenPresent && meta_test_event_code)`
- `lastSendStatus`: from `meta_lead_attribution` — select most recent `lead_status` across all rows
- `lastSendAt`: most recent `lead_sent_at`

**Boot-time self-test (D-04):**
```typescript
// In services/worker/src/index.ts after boss.start():
// Attempt to decrypt META_CAPI_TOKEN — if key material is wrong, fail loudly
const testDecrypt = await readAppSecretByKey("META_CAPI_TOKEN", db);
if (testDecrypt === null) {
  // Could be unconfigured (fine) or wrong BETTER_AUTH_SECRET (fatal ambiguity)
  // Log a clear warning — only FATAL if we have reason to expect the key to be set
  log.warn("[worker] boot-self-test: META_CAPI_TOKEN not readable. " +
    "If configured in app_secrets, verify BETTER_AUTH_SECRET matches staff-web.");
}
// (Can also test WHATSAPP_ACCESS_TOKEN as a known-configured key)
```

### Pattern 12: stageEventMap Resolver (D-05)

Build a pure function in a new `services/worker/src/lib/stageEventMap.ts`:
```typescript
const DEFAULT_STAGE_EVENT_MAP = {
  lead: "Lead",
  contact: "Contact",
  purchase: "Purchase",
  schedule: "Schedule",
} as const;

export function resolveStageEvent(
  configJson: string | null | undefined,
  stage: "lead" | "contact" | "purchase" | "schedule",
): string {
  if (!configJson) return DEFAULT_STAGE_EVENT_MAP[stage];
  try {
    const map = JSON.parse(configJson) as Record<string, string>;
    return map[stage] ?? DEFAULT_STAGE_EVENT_MAP[stage];
  } catch {
    return DEFAULT_STAGE_EVENT_MAP[stage];
  }
}
```
MC1 calls `resolveStageEvent(config.metaStageEventMap, "lead")` → `"Lead"`. MC2 will call with `"contact"`, `"purchase"`, `"schedule"`.

### Anti-Patterns to Avoid

- **Calling Meta CAPI from staff-web (Vercel):** Violates D-01 — chokepoint rule. Staff-web only enqueues.
- **Hashing fbc/fbp:** These must be sent plain. Hashing breaks matching.
- **Normalizing event_time in milliseconds:** CAPI requires Unix SECONDS. fbc/fbp timestamps are milliseconds. Don't mix.
- **event_id mismatch:** Any whitespace difference, case difference, or generation-order bug between browser and server causes dedup to fail and events to double-count.
- **Putting `test_event_code` inside the `data[]` event object:** It belongs at the top level alongside `data`. Inside the event causes it to be ignored.
- **Creating a competing `app_secrets` row on re-save:** D-11 — use `resolve-by-key` presence check; don't re-paste if already configured. The masked token field shows "configured" state sourced from `readAppSecretByKey`, not from the framework's `resolveSecret()` which has scoping quirks.
- **Logging `META_CAPI_TOKEN`:** D-17 — never log the token. Log only presence/absence.
- **Forgetting `includeMetadata: true` in `boss.work()`:** Without it, `retryCount`/`retryLimit` are unavailable and the final-attempt write path cannot distinguish the last retry.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-256-GCM decrypt of app_secrets | Custom crypto | `readAppSecretByKey()` (both worker + staff-web) | Already correct and tested; worker + staff-web twins exist |
| Job queue idempotency | Manual dedup table | `singletonKey` on `event_id` in `boss.send()` | pg-boss handles it atomically at the DB level |
| Retry with exponential backoff | `setTimeout` loop | `retryLimit: 5, retryBackoff: true` in `boss.send()` | pg-boss handles scheduling, persistence, and visibility |
| PII hashing | `btoa()` or third-party | `node:crypto createHash('sha256')` | Node built-in; no import needed; identical to how appSecrets.ts works already |
| SHA-256 comparison/token masking | Strip first N chars | `readAppSecretByKey()` presence check (returns null or string) | Already solves the scoping quirk (260620-c8p pattern) |

**Key insight:** The entire cryptographic and queue infrastructure is already built. This phase is a wiring exercise: connect the existing form submit pipeline to the existing queue infrastructure with a new payload shape, and add a new worker handler that does one authenticated `fetch()`.

---

## Common Pitfalls

### Pitfall 1: Wrong timestamp unit in event_time vs fbc/fbp

**What goes wrong:** Using `Date.now()` (milliseconds) for `event_time` instead of `Math.floor(Date.now() / 1000)` (seconds). Meta rejects events with future timestamps or timestamps too far in the past.

**Why it happens:** fbc/fbp use milliseconds; CAPI `event_time` uses seconds. Easy to mix up.

**How to avoid:** Always compute `event_time = Math.floor(Date.now() / 1000)` in submissions.ts at enqueue time, pass it in the payload. Never re-compute in the worker (stale by then).

**Warning signs:** Meta Events Manager shows events with wildly wrong timestamps.

### Pitfall 2: event_id generated AFTER fetch() completes

**What goes wrong:** `event_id` is generated after the submit succeeds (e.g. from `responseId`), but `fbq('track', 'Lead', {}, { eventID })` fires immediately. The server sends a different `event_id` (or no `event_id`). Dedup fails.

**Why it happens:** Tempting to use the form submission `responseId` as the `event_id`, but the browser needs it before the fetch resolves.

**How to avoid:** Generate `EVENT_ID` at the top of the submit handler IIFE, BEFORE calling `fetch()`. Pass it in the request body (`body.event_id`). Fire `fbq()` with it after success. The server receives the same value.

**Warning signs:** Test Events tab shows 2 Lead events (not 1), "Deduplication" column is 0%.

### Pitfall 3: `test_event_code` inside event object vs top-level

**What goes wrong:** Events don't appear in Meta's Test Events tab despite including `test_event_code`.

**Why it happens:** `test_event_code` placed inside `data[0]` instead of at the root of the JSON body.

**How to avoid:** Always structure as `{ data: [...], test_event_code: "TEST..." }` at the root. Remove entirely for production (not just set to null — omit the field).

**Warning signs:** No events appear in Test Events tab, but no error either.

### Pitfall 4: BETTER_AUTH_SECRET drift between Vercel and Fly

**What goes wrong:** `readAppSecretByKey("META_CAPI_TOKEN", db)` returns null on the worker even though the token is in `app_secrets`. The worker silently skips every CAPI event.

**Why it happens:** `BETTER_AUTH_SECRET` was rotated on Vercel but not updated on the Fly worker (or vice versa). The AES-256-GCM key is derived from this value, so a mismatch means the ciphertext cannot be decrypted.

**How to avoid:** D-03 requires explicit verification checklist item. D-04 adds boot-time self-test. Procedure: `fly secrets list` on the worker to verify `BETTER_AUTH_SECRET` is set; compare (carefully) with the Vercel env var.

**Warning signs:** Worker logs show `[meta-capi-event] META_CAPI_TOKEN not configured — skipping`; no CAPI events in Meta Events Manager; `meta_lead_attribution.lead_status` stays `null` or `queued` forever.

### Pitfall 5: Hashing fbc or fbp

**What goes wrong:** EMQ (Event Match Quality) score tanks; Meta cannot attribute the event.

**Why it happens:** Developer sees the "hash PII" rule and applies it to all user_data fields.

**How to avoid:** Only hash: `em`, `ph`, `fn`, `ln`. Never hash: `fbc`, `fbp`, `client_ip_address`, `client_user_agent`.

**Warning signs:** Meta Events Manager EMQ score lower than expected even with attribution cookies present.

### Pitfall 6: Phone normalization for hashing

**What goes wrong:** Phone hashes don't match between browser Pixel advanced matching (if used) and CAPI.

**Why it happens:** E.164 phones include a `+` prefix (`+447700900123`). Meta wants digits only (`447700900123`).

**How to avoid:** Strip all non-digits before hashing: `phoneE164.replace(/\D/g, "")`. Do this consistently in both submit handler (for CAPI) and any browser-side advanced matching (if added later).

### Pitfall 7: duplicate app_secrets row for META_CAPI_TOKEN

**What goes wrong:** Operator saves the token twice, creating two rows. The `ORDER BY updated_at DESC LIMIT 1` query returns the newer one, which may be incomplete or incorrect if the second paste was accidental.

**Why it happens:** The Settings UI doesn't clearly signal "token already configured". Operator pastes again thinking it wasn't saved.

**How to avoid:** D-11 — masked "configured" state in the UI. Only show the "Replace token" flow if operator explicitly clicks a replace button. Never show a pre-filled token field.

### Pitfall 8: No `meta_pixel_id` on `studio_owner_config` singleton row

**What goes wrong:** The `studio_owner_config` singleton row may not exist yet (seeded by provisioner in BD2). The additive `ALTER TABLE ADD COLUMN IF NOT EXISTS` migration v31 will add the columns, but if no singleton row exists, reading `meta_pixel_id` returns no rows.

**How to avoid:** The Settings card `save-meta-config` action should use `INSERT ... ON CONFLICT (id) DO UPDATE` to upsert the singleton. Worker should handle the case where `studio_owner_config` has no row (return early with a warn).

---

## Code Examples

### SHA-256 helper (pure, Node built-in)

```typescript
// apps/staff-web/features/forms/handlers/submissions.ts (add near top)
// Source: node:crypto (built-in)
import { createHash } from "node:crypto";

function hashForCapi(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}
```

### CAPI POST fetch (in meta-capi-event.ts worker)

```typescript
// Source: Meta Conversions API docs (watsspace.com/blog verified pattern)
const endpoint = `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${token}`;

const capiBody = {
  data: [{
    event_name: data.eventName,       // "Lead"
    event_time: data.eventTime,       // Unix SECONDS
    event_id: data.eventId,           // shared with browser Pixel
    action_source: data.actionSource, // "website"
    event_source_url: data.eventSourceUrl,
    user_data: {
      ...(data.hashedEmail ? { em: [data.hashedEmail] } : {}),
      ...(data.hashedPhone ? { ph: [data.hashedPhone] } : {}),
      ...(data.fbc ? { fbc: data.fbc } : {}),
      ...(data.fbp ? { fbp: data.fbp } : {}),
      ...(data.clientIp ? { client_ip_address: data.clientIp } : {}),
      ...(data.clientUserAgent ? { client_user_agent: data.clientUserAgent } : {}),
    },
  }],
  // Only include test_event_code if configured (omit entirely in production)
  ...(testEventCode ? { test_event_code: testEventCode } : {}),
};

const resp = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(capiBody),
});
```

### fbc synthesis (in embed-snippet.ts, inside the IIFE)

```javascript
// Source: watsspace.com/blog/meta-conversions-api-fbc-and-fbp-parameters/
// Synthesize fbc from fbclid URL param when no _fbc cookie exists
var fbclid = new URLSearchParams(location.search).get('fbclid') || '';
var fbc = readCookie('_fbc');
var fbp = readCookie('_fbp');
if (fbclid && !fbc) {
  // fb.1.<timestamp_ms>.<fbclid> — timestamp in MILLISECONDS (not seconds)
  fbc = 'fb.1.' + Date.now() + '.' + fbclid;
}
```

### event_id generation (public-form-ssr.ts inline script)

```javascript
// Generated before fetch() call, used in both fbq() and POST body
var EVENT_ID = 'mc1_' + Math.random().toString(36).slice(2,9) + '_' + Date.now().toString(36);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Meta official Node SDK `WhatsApp/WhatsApp-Nodejs-SDK` | `@great-detail/whatsapp` (fork, v9 April 2026) | Already handled for WhatsApp; CAPI has no equivalent SDK dependency — use `fetch()` directly |
| Browser-only Pixel tracking | Pixel + server CAPI with shared `event_id` dedup | Required for iOS/browser cookie restrictions; this is what we're building |
| `event_time` in the future (common mistake) | Unix SECONDS of actual event occurrence | Meta validates; events with future timestamps are rejected |

**Current Graph API version:** v23 (locked per requirements). v19.0 and v20.0 are in the wild in documentation examples — always substitute v23 as required.

---

## Open Questions

1. **`pixelId` resolution in worker vs passed in payload**
   - What we know: CONTEXT.md says pixelId is studio-global config on `studio_owner_config`. The worker already reads `studio_owner_config` for other config.
   - What's unclear: Should `pixelId` be passed in the `MetaCapiEventPayload` (set at enqueue time) or resolved by the worker at execution time?
   - Recommendation: Resolve at execution time in the worker (read `studio_owner_config` once per job). Avoids stale pixelId in queued jobs if operator changes it. Does require one extra DB read per job, but this is negligible. Alternatively pass in payload for simplicity — planner decides.

2. **`hashedFn`/`hashedLn` availability**
   - What we know: `firstName` and `lastName` are extracted in `submissions.ts` (lines 212-252). Both are available at enqueue time.
   - What's unclear: EMQ benefit vs privacy principle of sending minimal data.
   - Recommendation: Include them — they improve EMQ and are already in the DB. Follow Meta's normalization (lowercase, letters only, no punctuation).

3. **`meta_lead_attribution` `lead_status` update**
   - What we know: The worker needs to write back `lead_status = 'sent'` or `'failed'` after the CAPI POST, plus `lead_sent_at`.
   - What's unclear: The worker's DB connection uses `DATABASE_URL_UNPOOLED` (confirmed in `services/worker/src/lib/env.ts`). Schema.ts `metaLeadAttribution` export needs to be importable from the worker's DB module.
   - Recommendation: The worker's `getDb()` uses the same Neon connection; add the Drizzle table export to the shared schema. Planner should confirm the worker schema import path.

4. **Test event dedup verification**
   - What we know: The Stape CAPIG docs mentioned "event deduplication does not work for test events in CAPIG". However, this applies specifically to CAPIG (Meta's gateway product), NOT to direct CAPI calls. Direct CAPI + Pixel test event dedup does work in Test Events.
   - Recommendation: Confirm during integration testing that Test Events shows "1 Lead" (not 2) when both Pixel and CAPI fire. The CAPIG note is irrelevant — this project calls the Graph API directly.

---

## Environment Availability

No new external services or CLI tools required for this phase. The Fly worker, Neon DB, and Meta Graph API endpoints are all already established dependencies.

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Meta Graph API v23 | CAPI POST | ✓ (external) | No auth setup needed beyond META_CAPI_TOKEN in app_secrets |
| `node:crypto` | SHA-256 hashing | ✓ | Node 22 built-in; worker already uses it in appSecrets.ts |
| `global.fetch` | CAPI POST from worker | ✓ | Node 22 has native fetch; worker already uses fetch in telemetry-push.ts |
| pg-boss v12 | meta-capi-event queue | ✓ | Already running in the worker |
| `BETTER_AUTH_SECRET` on Fly worker | app_secrets decrypt | Must verify | D-03 checklist item — see Pitfall 4 |

---

## Project Constraints (from CLAUDE.md)

These directives apply to all MC1 implementation:

- **Additive-only DB changes:** Migrations v31 (studio_owner_config columns) and v32 (meta_lead_attribution table) must use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. No DROP/RENAME/TRUNCATE.
- **No `drizzle-kit push`:** `guard:no-drizzle-push` is active. Migrations go through `runMigrations` in `server/plugins/db.ts` only.
- **`server/plugins/` files must export a default plugin function:** The `register-secrets.ts` file is correctly kept OUTSIDE `server/plugins/` (it's a side-effect module imported at top of `agent-chat.ts`). Any new helper for the Settings card must follow the same pattern — helpers in `server/lib/`, not `server/plugins/`.
- **No local dev server:** NitroViteError prevents `pnpm dev` on staff-web. Verification via deploy + Meta Events Manager Test Events tab.
- **TypeScript everywhere:** All new files `.ts`/`.tsx`. No `.js` or `.mjs`.
- **Tabler icons only:** Settings card uses Tabler icons (e.g. `IconAd2` or `IconBrandFacebook` for Meta branding).
- **shadcn/ui primitives:** Settings card form fields use shadcn `Input`, `Button`, `Badge`, not custom HTML.
- **guard:allow-unscoped on gym tables:** `meta_lead_attribution` is single-tenant; add the comment on all unscoped queries.
- **Optimistic UI:** Settings card should show optimistic update on save (disable button, show spinner — no await before visual feedback).
- **No drizzle-kit push:** Repeated for emphasis — `drizzle-kit push` is permanently forbidden.
- **Idempotent migrations:** Both migration versions must be safe to run twice without error.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `services/worker/src/queues/outbound-whatsapp.ts` — worker queue pattern
- Codebase inspection: `services/worker/src/lib/appSecrets.ts` + `apps/staff-web/server/lib/app-secrets.ts` — decrypt infrastructure
- Codebase inspection: `apps/staff-web/features/forms/handlers/submissions.ts` — submit handler
- Codebase inspection: `apps/staff-web/features/forms/lib/embed-snippet.ts` — iframe injection pattern
- Codebase inspection: `apps/staff-web/features/forms/lib/public-form-ssr.ts` — SSR form HTML structure
- Codebase inspection: `packages/queue/src/types.ts` + `publish.ts` — queue payload/enqueue pattern
- Codebase inspection: `services/worker/src/queues/telemetry-push.ts` — outbound HTTP + unconfigured-skip pattern
- Codebase inspection: `apps/staff-web/server/plugins/db.ts` — migrations up to v30; next version is v31
- Codebase inspection: `apps/staff-web/server/db/schema.ts` — `studioOwnerConfig` columns (line 646)
- Codebase inspection: `apps/staff-web/server/register-secrets.ts` — `registerRequiredSecret` pattern
- Codebase inspection: `services/worker/src/index.ts` — worker boot, queue registration pattern

### Secondary (MEDIUM confidence)
- [watsspace.com — Meta Conversions API Complete Guide](https://watsspace.com/blog/meta-conversions-api-the-complete-guide/) — CAPI JSON body structure, `test_event_code` top-level placement, `access_token` as query param, Node.js SHA-256 snippet, success response format
- [watsspace.com — fbc and fbp parameters](https://watsspace.com/blog/meta-conversions-api-fbc-and-fbp-parameters/) — fbc synthesis formula, millisecond timestamps, no-hash rule
- [ceaksan.com — Facebook Pixel Advanced Matching](https://ceaksan.com/en/facebook-pixel-and-events) — PII normalization table (em lowercase+trim, ph digits only, fn/ln lowercase)
- [bradfarleigh.com — Facebook Pixel deduplication](https://www.bradfarleigh.com/2025/02/facebook-pixel-signal-deduplication-using-event_id/) — `eventID` camelCase param, 48-hour dedup window, browser+server shared event_id mechanism

### Tertiary (LOW confidence — flag for validation)
- [taggrs.io — Meta CAPI docs](https://taggrs.io/docs/server-side-tracking/facebook/meta-capi) — general CAPI structure references
- [audiencelab.ai — Meta CAPI Setup 2025](https://audiencelab.ai/blog/facebook-conversions-api-setup-guide) — general dedup requirements

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all in-repo; no new packages
- Architecture patterns: HIGH — modeled on existing working code in repo
- CAPI payload structure: MEDIUM — cross-verified via 3+ third-party sources; official docs truncated on WebFetch; main risk is minor field naming variation
- fbc/fbp mechanics: MEDIUM — confirmed by watsspace.com authoritative-seeming source; `fb.1.ms.fbclid` synthesis is also documented in CONTEXT.md Specifics section
- Dedup mechanics: MEDIUM — confirmed behavior across multiple sources; 48h window is stated consistently; `eventID` (camelCase) vs `event_id` — research found both conventions; the 4th fbq() param object key is `eventID` (camelCase) based on Meta's own documentation examples
- PII normalization: HIGH — consistent across all sources (email: lowercase+trim; phone: digits only; fn/ln: lowercase)
- Error semantics: MEDIUM — `is_transient` field confirmed; code 190 = bad token confirmed; overall retry strategy is standard practice

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (30 days — Graph API versioning is stable; Meta API behavior is stable)
