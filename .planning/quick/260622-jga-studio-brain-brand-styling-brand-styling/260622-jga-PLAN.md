---
phase: quick-260622-jga
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/brain-init.ts
  - apps/staff-web/actions/update-brain-doc.ts
  - apps/staff-web/server/lib/tenant-brand.ts
  - apps/staff-web/server/lib/tenant-brand-resolver.ts
  - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
  - apps/staff-web/features/forms/lib/embed-buy-handler.ts
  - apps/staff-web/server/lib/public-video-ssr.ts
  - apps/staff-web/server/lib/public-content-ssr.ts
  - apps/staff-web/server/lib/safe-fetch.ts
  - apps/staff-web/actions/brain-extract-brand.ts
  - apps/staff-web/app/routes/gymos.brain.tsx
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [GOB-BRAND-STYLING]

must_haves:
  truths:
    - "The brand-styling Brain doc (DB row) is the source of truth for customer-facing styling — editing it re-themes all 5 public SSR surfaces with no redeploy."
    - "Behavior is unchanged until the doc is first edited (seed = current tenant-brand.ts values via onConflictDoNothing)."
    - "An operator can paste a URL, click Fetch & extract, and Claude fills editable brand-token fields for review (no auto-save)."
    - "Save persists the tokens as JSON in the brand-styling doc; the server brand cache refreshes so embeds re-theme within ~30s."
    - "Malformed JSON / missing fields in the doc fall back to DEFAULT_TENANT_BRAND per-field — public surfaces never break."
    - "The URL fetcher is SSRF-guarded: only http/https public hosts, no private/loopback/link-local IPs, no credentialed URLs, size + timeout capped."
  artifacts:
    - path: "apps/staff-web/server/lib/tenant-brand.ts"
      provides: "DEFAULT_TENANT_BRAND (pure, client-safe) + TenantBrand interface"
      contains: "DEFAULT_TENANT_BRAND"
    - path: "apps/staff-web/server/lib/tenant-brand-resolver.ts"
      provides: "server-only async getTenantBrand() reading brand-styling doc, deep-merged over default, cached"
      contains: "getTenantBrand"
    - path: "apps/staff-web/server/lib/safe-fetch.ts"
      provides: "SSRF-guarded fetch helper"
      contains: "safeFetch"
    - path: "apps/staff-web/actions/brain-extract-brand.ts"
      provides: "POST action: URL -> Claude-extracted brand tokens (no DB write)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/brain-init.ts"
      provides: "seeds brand-styling row from DEFAULT_TENANT_BRAND (onConflictDoNothing)"
      contains: "brand-styling"
    - path: "apps/staff-web/actions/update-brain-doc.ts"
      provides: "enum allows brand-styling; validates JSON token body"
      contains: "brand-styling"
    - path: "apps/staff-web/app/routes/gymos.brain.tsx"
      provides: "Brand & Styling card: URL fetch + editable token fields + Save"
      contains: "Brand & Styling"
  key_links:
    - from: "apps/staff-web/features/forms/lib/schedule-widget-ssr.ts"
      to: "apps/staff-web/server/lib/tenant-brand-resolver.ts"
      via: "await getTenantBrand() replacing static tenantBrand import"
      pattern: "getTenantBrand"
    - from: "apps/staff-web/actions/brain-extract-brand.ts"
      to: "apps/staff-web/server/lib/safe-fetch.ts"
      via: "import { safeFetch }"
      pattern: "safeFetch"
    - from: "apps/staff-web/app/routes/gymos.brain.tsx"
      to: "/_agent-native/actions/update-brain-doc"
      via: "fetch POST { id: 'brand-styling', body: JSON.stringify(tokens) }"
      pattern: "brand-styling"
---

<objective>
Make the Studio Brain "Brand & Styling" doc the live source of truth for customer-facing styling (Path A), and add a URL → Claude-extract → review/edit → Save flow that lets an operator capture a gym's brand from its website.

Purpose: Today customer-facing brand lives in a hardcoded `tenant-brand.ts` constant (quick task 260622-ifj). To onboard a new gym you edit code + redeploy. This makes brand editable from the Brain UI and auto-fillable from a URL, with the static values demoted to a per-field fallback default.

Output: a DB-backed brand resolver, an SSRF-guarded URL-extract action, and a new Brain card — behavior unchanged until the doc is first edited.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260622-ifj-customer-facing-hustle-brand-restyle-ten/260622-ifj-SUMMARY.md
@apps/staff-web/AGENTS.md
@.agents/skills/security/SKILL.md

# Verified facts (do not re-explore):
# - studio_brain_docs table + columns EXIST (schema.ts ~L567; migration v16 in db.ts). NO new migration — brand-styling is a new ROW.
# - tenant-brand.ts is a PURE module today (no DB imports). It exports `export const tenantBrand: TenantBrand` and `interface TenantBrand`.
#   ACTUAL keys: displayName, fontFamily, googleFontsHref, primary, primaryText, secondaryAccent, ink, bg, bgAlt, radius (number), logoUrl.
#   (The spec's "secondary" == the file's `secondaryAccent`; keep the EXISTING key names — do not rename existing keys.)
# - GymPromo.tsx does NOT import tenant-brand (grep-confirmed L13-18 import block). So no client bundle currently pulls server code.
#   Forward-safe rule: keep getTenantBrand() (DB) in a SEPARATE file so the pure default module stays client-importable.
# - 5 SSR consumers all do a SYNC `import { tenantBrand }` and read fields inline:
#     schedule-widget-ssr.ts (import L27; uses L234,410,440,469,520,522 — accent/radius fallback in renderScheduleWidget)
#     public-form-ssr.ts      (import L5;  uses L251,253,325,609,649,693)
#     embed-buy-handler.ts    (import L23; uses L56,66,95,186,188,229,230 — GET renderEmbedBuy + POST handleEmbedBuyPost)
#     public-video-ssr.ts     (import L35; uses L138,141,178,193,196,215)
#     public-content-ssr.ts   (import L25; uses L106,109,143,146)
#   ALL five are inside async handlers, so `await getTenantBrand()` is fine.
# - update-brain-doc.ts: `.strict()` enum at L21: z.enum(["brand-voice","ethos"]); body z.string().max(20000); run mutates studioBrainDocs.
# - get-brain-docs.ts: GET, returns [{id,docType,title,body,seededAt,updatedAt}].
# - brain-init.ts: onConflictDoNothing pattern for brand-voice/ethos rows (L67-93). Add a brand-styling block alongside.
# - Anthropic pattern to COPY: app/routes/api.m.foods.analyze.tsx — `new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY})`, MODEL="claude-sonnet-4-6",
#   messages.create, join text blocks, defensive parse (strip ```json fences, slice first { .. last }).
# - shadcn primitives PRESENT in app/components/ui: input, button, label, card, textarea, select, skeleton, alert, alert-dialog. (No Tooltip/Switch — don't need them.)
# - NOT packages/core — no changeset.
</context>

<tasks>

<task type="auto">
  <name>Task 1: brand-styling doc data layer + DB-backed resolver + refactor 5 SSR renderers to getTenantBrand()</name>
  <files>apps/staff-web/server/lib/tenant-brand.ts, apps/staff-web/server/lib/tenant-brand-resolver.ts, apps/staff-web/actions/brain-init.ts, apps/staff-web/actions/update-brain-doc.ts, apps/staff-web/features/forms/lib/schedule-widget-ssr.ts, apps/staff-web/features/forms/lib/public-form-ssr.ts, apps/staff-web/features/forms/lib/embed-buy-handler.ts, apps/staff-web/server/lib/public-video-ssr.ts, apps/staff-web/server/lib/public-content-ssr.ts</files>
  <action>
PATH A data + resolver, then re-point the 5 SSR renderers. Keep all existing TenantBrand KEY NAMES (do NOT rename secondaryAccent → secondary).

1. `tenant-brand.ts` (PURE — stays client-importable, NO DB imports):
   - Keep the `TenantBrand` interface unchanged.
   - Rename the exported constant `tenantBrand` → `DEFAULT_TENANT_BRAND` (same value object). KEEP a back-compat alias `export const tenantBrand = DEFAULT_TENANT_BRAND;` so nothing breaks if a stray import lingers — but you WILL re-point the 5 known importers below, so the alias is belt-and-braces.
   - Update the file header comment: this is now the DEFAULT / fallback brand; live values come from the brand-styling Brain doc via tenant-brand-resolver.ts.

2. CREATE `tenant-brand-resolver.ts` (SERVER-ONLY — this is the file that imports the DB):
   - `import { getDb, schema } from "../db/index.js";` and `import { eq } from "drizzle-orm";` and `import { DEFAULT_TENANT_BRAND, type TenantBrand } from "./tenant-brand.js";`
   - Module-level cache: `let cache: { brand: TenantBrand; at: number } | null = null;` with `const TTL_MS = 30_000;`.
   - `export function invalidateTenantBrandCache() { cache = null; }`
   - `export async function getTenantBrand(): Promise<TenantBrand>`:
     - if cache fresh (Date.now() - cache.at < TTL_MS) return cache.brand.
     - read the row: `const rows = await db.select().from(schema.studioBrainDocs).where(eq(schema.studioBrainDocs.id, "brand-styling")); // guard:allow-unscoped — single-tenant studio Brain`
     - if no row or empty body → result = DEFAULT_TENANT_BRAND.
     - else JSON.parse(body) inside try/catch; on throw → DEFAULT_TENANT_BRAND.
     - DEEP-MERGE per field over DEFAULT: for each TenantBrand key, take parsed[key] ONLY if it is the right type & non-empty (string keys: typeof === "string" && trim length; radius: Number.isFinite(Number(parsed.radius)) → Number(...)); otherwise keep the default. This makes a partial/garbage doc safe.
     - cache and return.
     - Wrap the whole DB read in try/catch → on ANY error return DEFAULT_TENANT_BRAND (never throw out of a renderer).

3. `brain-init.ts` — add a brand-styling seed block AFTER the ethos block (mirror the onConflictDoNothing shape at L81-93). Seed body = `JSON.stringify(DEFAULT_TENANT_BRAND)` (import DEFAULT_TENANT_BRAND from "../server/lib/tenant-brand.js"). id="brand-styling", docType="brand-styling", title="Brand & Styling". This guarantees behavior is UNCHANGED until edited. Keep the `// guard:allow-unscoped` comment.

4. `update-brain-doc.ts`:
   - Extend the `.strict()` enum: `z.enum(["brand-voice", "ethos", "brand-styling"])` and update the .describe() + header comment.
   - Keep `body: z.string().max(20000)`.
   - In `run`, BEFORE the db.update: if `id === "brand-styling"`, validate the body parses as JSON and contains the expected token shape. Define a small zod object (all OPTIONAL but typed): displayName/fontFamily/googleFontsHref/primary/primaryText/secondaryAccent/ink/bg/bgAlt as `z.string()`, radius as `z.number()`, logoUrl as `z.string()` — `.passthrough()` is fine. Try JSON.parse(body) in try/catch; run safeParse; if parse throws OR safeParse fails → `return { updated: false, reason: "INVALID_BRAND_JSON" };` (no DB write). brand-voice/ethos stay free text (skip this validation). Reuse the existing char limit.
   - AFTER a successful brand-styling update, call `invalidateTenantBrandCache()` (import from "../server/lib/tenant-brand-resolver.js") so the next render re-reads. Guard with `if (id === "brand-styling")`.

5. Re-point the 5 SSR renderers from the sync `import { tenantBrand }` to `await getTenantBrand()`. Each renderer's HTML-producing function is already async (Nitro handler). Mechanical change per file:
   - Replace the import line with `import { getTenantBrand } from "<relative>/tenant-brand-resolver.js";` (forms/lib files → "../../../server/lib/tenant-brand-resolver.js"; the two server/lib files → "./tenant-brand-resolver.js").
   - At the TOP of the async function that builds the page (the one that currently reads tenantBrand.* — see the verified line numbers in <context>), add `const tenantBrand = await getTenantBrand();` as a local const. This keeps EVERY downstream `tenantBrand.fontFamily` / `.primary` / `.primaryText` / `.googleFontsHref` / `.radius` / `.displayName` reference working UNCHANGED (just now a local, not a module import).
   - CRITICAL: keep the `?accent=` / `?radius=` override logic EXACTLY (the `accentParam ? sanitizeHexColor(accentParam) : tenantBrand.primary` and `radiusParam !== null ? sanitizeIntPx(radiusParam) : tenantBrand.radius` lines stay — `tenantBrand` is now the resolved local).
   - If a file reads tenantBrand in MORE THAN ONE function (e.g. public-form-ssr has renderFormPage + notFoundPage + renderPublicFormHtml; embed-buy has GET renderEmbedBuy + POST handleEmbedBuyPost; public-video has renderVideoPage + notFoundPage), add `const tenantBrand = await getTenantBrand();` at the top of EACH such function that references it. Verify each function is async first; all the page-builders here are. Do NOT thread it as a param unless a referencing function is sync — they aren't.
   - Preserve ALL `guard:allow-color` markers verbatim.
   - Do NOT touch GymPromo.tsx (it doesn't import tenant-brand; live video re-theme is OUT OF SCOPE).

Run `cd apps/staff-web && pnpm typecheck` after wiring. If a renderer function that reads tenantBrand turns out to be sync, make it async and `await` its callers (last resort) — but verify first; the page-builders are async.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <done>tenant-brand.ts exports DEFAULT_TENANT_BRAND (+ alias); tenant-brand-resolver.ts exports async getTenantBrand() + invalidateTenantBrandCache() with 30s cache and full per-field fallback; brain-init seeds a brand-styling row via onConflictDoNothing from DEFAULT_TENANT_BRAND; update-brain-doc accepts "brand-styling", validates JSON token body (rejects malformed with {updated:false,reason}), and invalidates the cache on success; all 5 SSR renderers call `await getTenantBrand()` and keep ?accent/?radius overrides + guard:allow-color markers. `pnpm typecheck` exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: SSRF-guarded fetch helper + brain-extract-brand Claude action</name>
  <files>apps/staff-web/server/lib/safe-fetch.ts, apps/staff-web/actions/brain-extract-brand.ts</files>
  <action>
1. CREATE `apps/staff-web/server/lib/safe-fetch.ts` — MANDATORY SSRF guard (none exists today; read the security skill — this is the input-validation surface). Export `async function safeFetch(rawUrl: string, opts?: { maxBytes?: number; timeoutMs?: number }): Promise<{ status: number; contentType: string; text: string }>`:
   - Parse with `new URL(rawUrl)`; throw a clear Error on parse failure.
   - Reject unless `protocol === "http:" || protocol === "https:"`.
   - Reject if `url.username || url.password` (credentialed URLs).
   - Hostname checks (lowercase the hostname):
     - reject exact "localhost", any host ending ".internal" or ".local", and the metadata host "metadata.google.internal".
     - If hostname is an IP literal (regex for IPv4 dotted-quad, or contains ":" for IPv6), reject private/loopback/link-local ranges: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0, and IPv6 ::1 / fc00::/7 / fe80::/10. Implement IPv4 with a small octet parse (split "." → 4 numbers → range tests); for IPv6 reject "::1", and any host whose first hextet is fc/fd (ULA) or fe8-feb (link-local) — a conservative startsWith check on the normalized lowercase host is acceptable for v1. Note in a comment that DNS-rebinding (hostname resolving to a private IP) is NOT fully mitigated here — acceptable for an admin-only operator action; do not claim full protection.
   - Fetch with an AbortController timeout (default 10_000ms): `fetch(url, { redirect: "follow", signal, headers: { "user-agent": "RunStudio-brand-fetch/1.0", accept: "text/html,*/*" } })`. (Node fetch follows redirects; note in a comment that redirect targets are not individually re-validated — acceptable for v1 admin-only.)
   - Read the body as a stream / text but CAP at maxBytes (default 2_000_000): if you read `res.text()`, slice to maxBytes after; better, check `content-length` header first and bail if it exceeds, then still slice the text. Keep it simple: `const text = (await res.text()).slice(0, maxBytes);`.
   - Return `{ status: res.status, contentType: res.headers.get("content-type") ?? "", text }`. Clear up the timeout in a finally.
   - All rejections throw `Error` with a short message (e.g. "URL not allowed: private host") — caller turns these into a clean action error.

2. CREATE `apps/staff-web/actions/brain-extract-brand.ts` — `defineAction` (admin/operator surface). It does NOT write the DB (UI reviews + the operator saves via update-brain-doc).
   - Header comment + `// guard:allow-unscoped — studio-global single-tenant Brain (no ownableColumns)` (matches the other brain actions; no ownable table is touched, but include the marker for consistency).
   - schema: `z.object({ url: z.string().url() }).strict()`.
   - NO `http` key → POST-only mutation-style mount (consistent with the other write-ish brain actions; it performs network I/O so keep it POST).
   - run({ url }):
     - if `!process.env.ANTHROPIC_API_KEY` → `return { ok: false, error: "ANTHROPIC_API_KEY not configured" };`
     - `let page; try { page = await safeFetch(url); } catch (e) { return { ok: false, error: String((e as Error).message) }; }` (import safeFetch from "../server/lib/safe-fetch.js").
     - Reduce HTML to relevant signal to keep tokens small — write a small local helper `reduceHtml(html: string): string` that extracts: the `<head>...</head>` slice (capped ~8KB), then within it keep `<link ...>` tags (so Google Fonts hrefs survive), `<style>...</style>` blocks (capped), `<meta name="theme-color" ...>` and `<meta property="og:..." ...>` tags, plus a ~2KB sample of body text/markup. Use simple regex slices (no DOM lib). Cap the TOTAL reduced string to ~12KB before sending to Claude. (Plain string ops — no user HTML is rendered, so no XSS surface; this is input TO an LLM only.)
     - Anthropic call — COPY the pattern from api.m.foods.analyze.tsx: `const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); const msg = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: [{ type: "text", text: PROMPT + "\n\nPAGE:\n" + reduced }] }] });` then join text blocks. Wrap in try/catch → `{ ok:false, error }` on failure.
     - PROMPT: instruct STRICT JSON only (no prose, no fences). Schema to extract: `{ "fontFamily": string (CSS font-family stack), "googleFontsHref": string (the Google Fonts css2 href if present else ""), "primary": string (hex like #RRGGBB), "primaryText": string (hex, readable ON primary), "secondaryAccent": string (hex), "ink": string (hex body text), "bg": string (hex page bg), "bgAlt": string (hex muted bg), "radius": number (px), "logoUrl": string (absolute URL to a logo image if found else ""), "displayName": string (the brand/business name) }`. Tell it to infer reasonable values and use "" / 8 when unknown — never null.
     - Defensive JSON parse — COPY the foods.analyze pattern: strip ```json fences, slice first `{` to last `}`, JSON.parse in try/catch → on failure `{ ok:false, error: "Could not parse brand tokens" }`.
     - Coerce each field defensively (string fields → String(...) or ""; radius → Number.isFinite(Number(x)) ? Number(x) : 8) and return `{ ok: true, tokens: {...} }`. Do NOT write the DB.
   - Add `import Anthropic from "@anthropic-ai/sdk";` (already a dep — foods.analyze uses it).
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <done>safe-fetch.ts exports `safeFetch` that rejects non-http(s), credentialed URLs, localhost/.internal/.local, and private/loopback/link-local IPv4+IPv6 literals, with a ~10s timeout and ~2MB body cap. brain-extract-brand.ts is a defineAction POST taking {url}, calls safeFetch, reduces the HTML to head/links/style/meta + body sample, calls claude-sonnet-4-6, defensively parses to `{ ok:true, tokens:{...11 fields...} }` or `{ ok:false, error }`, and does NOT write the DB. `pnpm typecheck` exits 0.</done>
</task>

<task type="auto">
  <name>Task 3: Brand & Styling card in the Brain tab (fetch → review → save)</name>
  <files>apps/staff-web/app/routes/gymos.brain.tsx, apps/staff-web/AGENTS.md</files>
  <action>
Add a new "Brand & Styling" Card to gymos.brain.tsx, placed ABOVE the existing Brand Voice card (it's the styling control). shadcn only, Tabler icons, NO emojis, no browser dialogs, optimistic. Do NOT disturb Brand Voice / Studio Ethos / Class Methods.

1. Imports: add `Input` (@/components/ui/input), `Label` (@/components/ui/label) to the existing imports. Add Tabler icons `IconPalette`, `IconWorldSearch` (or `IconWorld`), `IconLink`. Keep existing icon imports.

2. Token type + state:
   - `type BrandTokens = { displayName: string; fontFamily: string; googleFontsHref: string; primary: string; primaryText: string; secondaryAccent: string; ink: string; bg: string; bgAlt: string; radius: number; logoUrl: string };`
   - `const [brand, setBrand] = useState<BrandTokens | null>(null);`
   - `const [brandUrl, setBrandUrl] = useState("");`
   - `const [fetching, setFetching] = useState(false);`
   - `const [fetchErr, setFetchErr] = useState<string | null>(null);`
   - `const [savingBrand2, setSavingBrand2] = useState(false);` (name distinct from existing savingBrand for Brand Voice — do NOT reuse it).

3. Load current brand-styling in the existing initial-load useEffect AND in fetchDocs(): after the existing `bv`/`eth` finds, add `const bs = data.find((d) => d.id === "brand-styling"); if (bs?.body) { try { setBrand(JSON.parse(bs.body) as BrandTokens); } catch { /* leave null */ } }`. (The row is seeded by brain-init, which already fires via seedIfNeeded — but brand-styling is independent of class-catalog. To guarantee the row exists, in seedIfNeeded's condition ALSO trigger brain-init when `!data.find(d => d.id === "brand-styling")`. Re-fetch already happens after init.)

4. "Fetch & extract" handler:
   - `const handleFetchBrand = async () => { if (!brandUrl.trim()) return; setFetching(true); setFetchErr(null); try { const res = await fetch("/_agent-native/actions/brain-extract-brand", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ url: brandUrl.trim() }) }); const data = await res.json(); if (!res.ok || !data?.ok) { setFetchErr(data?.error ?? "Could not extract brand"); return; } setBrand((prev) => ({ ...(prev ?? DEFAULTS), ...data.tokens })); toast.success("Brand extracted — review and Save"); } catch { setFetchErr("Network error"); } finally { setFetching(false); } };`
   - Define a `DEFAULTS` const literal at module scope mirroring DEFAULT_TENANT_BRAND values so the form is never empty before first load. (Hardcode the HUSTLE defaults inline — do NOT import the server resolver into this client route. Importing the pure tenant-brand.ts is technically client-safe, but to be safe and avoid any bundler chasing the .js server path, inline a small DEFAULTS literal here.)
   - Populate fields; do NOT auto-save.

5. Editable fields — render one labeled Input per token inside the card (use a 2-col grid on sm+). Text Inputs for displayName, fontFamily, googleFontsHref, primary, primaryText, secondaryAccent, ink, bg, bgAlt, logoUrl; a `type="number"` Input for radius. Each: `<Label>` + `<Input value={brand?.X ?? ""} onChange={(e)=> setBrand(b => ({...(b ?? DEFAULTS), X: e.target.value}))} />` (radius coerces Number). Bind to `brand` (fall back to DEFAULTS when null).

6. Live preview (nice-to-have, keep small): a sample box styled inline `style={{ background: brand?.primary, color: brand?.primaryText, fontFamily: brand?.fontFamily, borderRadius: (brand?.radius ?? 8) + "px" }}` containing a short label like "Book a class" — gives instant visual feedback. (Inline style with values the operator typed is fine — this is the operator's own input, rendered only to them, not stored HTML; no XSS surface beyond self.)

7. URL row: a `<Label>` "Import from website", an `<Input placeholder="https://your-gym.co.uk" value={brandUrl} ... />` and a `<Button onClick={handleFetchBrand} disabled={fetching}>` with `<IconWorldSearch className="size-3.5 mr-1.5" />{fetching ? "Fetching…" : "Fetch & extract"}`. Show `fetchErr` as a small destructive-text `<p>` when set (no browser alert).

8. Save handler (optimistic toast pattern, mirror handleSave):
   - `const handleSaveBrand = async () => { if (!brand) return; setSavingBrand2(true); try { const res = await fetch("/_agent-native/actions/update-brain-doc", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id:"brand-styling", body: JSON.stringify({ ...brand, radius: Number(brand.radius) }) }) }); const data = await res.json().catch(()=>({})); if (!res.ok || data?.updated === false) { toast.error(\`Failed to save — \${data?.reason ?? data?.error ?? res.statusText}\`); fetchDocs(); return; } toast.success("Brand & Styling saved — embeds will re-theme shortly"); fetchDocs(); } catch { toast.error("Network error — changes not saved"); fetchDocs(); } finally { setSavingBrand2(false); } };`
   - Save button: `<Button size="sm" disabled={savingBrand2} onClick={handleSaveBrand}><IconDeviceFloppy className="size-3.5 mr-1.5" />{savingBrand2 ? "Saving…" : "Save"}</Button>`.

9. Card chrome: `<Card>` with `<CardHeader>` title `<IconPalette /> Brand & Styling` and a one-line muted description: "Controls the look of your public booking pages, forms, and embeds. Import from your website, review, then Save." Body: URL row, then the field grid, then the preview, then a right-aligned Save button. Place the whole card ABOVE the Brand Voice card in the returned JSX.

10. Update `apps/staff-web/AGENTS.md`: add `brain-extract-brand` to the Agent Actions table (Tier — operator/admin; "Fetch a URL and Claude-extract brand tokens for the Brand & Styling Brain doc; returns {ok, tokens} or {ok,error}; does NOT write DB"). Add a note under the Brain section that the `brand-styling` doc (JSON token body) is the live source of truth for customer-facing styling, edited via update-brain-doc (now accepts brand-styling) and consumed by tenant-brand-resolver.getTenantBrand(). Keep it brief.

Run `npx prettier --write` on the touched files, then `cd apps/staff-web && pnpm typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <done>gymos.brain.tsx renders a "Brand & Styling" Card above Brand Voice: a URL Input + "Fetch & extract" button (loading + inline error states) that calls brain-extract-brand and populates editable token Inputs without auto-saving; labeled Inputs for all 11 tokens (radius numeric); a small live preview using primary/primaryText/font/radius; and a Save button that POSTs {id:"brand-styling", body:JSON.stringify(tokens)} to update-brain-doc with optimistic toast + rollback. Existing Brand Voice/Ethos/Class Methods sections untouched. AGENTS.md documents brain-extract-brand + the brand-styling source-of-truth. No emojis, no browser dialogs, shadcn+Tabler only. `pnpm typecheck` exits 0.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && pnpm typecheck` exits 0 after each task.
- Grep: `getTenantBrand` appears in all 5 SSR renderers and in tenant-brand-resolver.ts.
- Grep: `brand-styling` appears in brain-init.ts, update-brain-doc.ts, gymos.brain.tsx, tenant-brand-resolver.ts.
- Grep: `safeFetch` is imported by brain-extract-brand.ts.
- No new migration added to db.ts (brand-styling is a row, not a table).
- GymPromo.tsx unchanged. No packages/core edits (no changeset). All `guard:allow-color` and `guard:allow-unscoped` markers preserved.
- Behavior unchanged until first edit: seed body == JSON.stringify(DEFAULT_TENANT_BRAND), resolver falls back per-field.
</verification>

<success_criteria>
- The brand-styling Brain doc is the live source of truth: editing + saving it re-themes all 5 public SSR surfaces within ~30s (cache TTL / invalidate-on-write), no redeploy.
- Operator can paste a URL, Fetch & extract (Claude-filled tokens), review/edit, and Save.
- URL fetch is SSRF-guarded (http/https only, no private/loopback/link-local, no credentialed URLs, size+timeout capped).
- Malformed/missing doc fields fall back to defaults; public surfaces never break.
- ?accent / ?radius overrides still honoured.
</success_criteria>

<output>
After completion, create `.planning/quick/260622-jga-studio-brain-brand-styling-brand-styling/260622-jga-SUMMARY.md`.
</output>
