---
phase: CV4-publish-pipeline
plan: "01"
subsystem: staff-web
tags: [publish, status, member-api, public-ssr, sanitizer, nitro, seo, crawlable]
dependency_graph:
  requires: [content_documents-table-status-slug, video_compositions-table-status-slug, /api/m-prefix-public, /f-public-ssr-pattern]
  provides: [content-set-status-action, video-set-status-action, /api/m/content-member-api, /c/:slug-public-ssr, /v/:slug-public-ssr, sanitize-html-lib]
  affects: [auth.ts-publicPaths, 00-public-cors.ts, agent-chat.ts, AGENTS.md, gymos.content_.$id.tsx, gymos.video_.$id.tsx]
tech_stack:
  added: []
  patterns:
    - slug-on-first-publish-only (stable URL across publish/unpublish cycles)
    - nitro-server-route-vs-rr-app-route (root.tsx ClientOnly → RR not crawlable → Nitro for SSR)
    - published-only-filter-everywhere (drafts never exposed by any surface)
    - conservative-regex-allowlist-sanitizer (no new dep; defense-in-depth for staff HTML)
    - poster-plus-watch-caption (no server-side Remotion; deferred client-mounted player)
    - two-exposure-direct-action (action file + agent-chat.ts + AGENTS.md)
    - guard-allow-unscoped-single-tenant
key_files:
  created:
    - apps/staff-web/actions/content-set-status.ts
    - apps/staff-web/actions/video-set-status.ts
    - apps/staff-web/server/lib/sanitize-html.ts
    - apps/staff-web/server/lib/sanitize-html.test.ts (7 tests)
    - apps/staff-web/server/lib/public-content-ssr.ts
    - apps/staff-web/server/lib/public-content-ssr.test.ts (3 tests)
    - apps/staff-web/server/lib/public-video-ssr.ts
    - apps/staff-web/server/lib/public-video-ssr.test.ts (4 tests)
    - apps/staff-web/server/routes/c/[...slug].get.ts
    - apps/staff-web/server/routes/v/[...slug].get.ts
    - apps/staff-web/app/routes/api.m.content.tsx
  modified:
    - apps/staff-web/app/routes/gymos.content_.$id.tsx (Publish/Unpublish button + published URL link)
    - apps/staff-web/app/routes/gymos.video_.$id.tsx (Publish/Unpublish button, outside ClientOnly)
    - apps/staff-web/server/plugins/agent-chat.ts (content-set-status + video-set-status entries)
    - apps/staff-web/AGENTS.md (two new action rows + CV4 two-exposure note + Data Sources update)
    - apps/staff-web/server/plugins/auth.ts (/c and /v in publicPaths + allowlistHandler skip list)
    - apps/staff-web/server/middleware/00-public-cors.ts (/c/ and /v/ in PUBLIC_EMBED_PREFIXES)
decisions:
  - "Nitro server routes (/c, /v) over React Router app routes: root.tsx wraps the entire RR app in <ClientOnly> (line 299) — RR routes emit only a spinner during SSR, not crawlable HTML. Nitro routes return self-contained HTML strings = real SEO-crawlable content. Mirrors /f, /preview, /embed."
  - "Poster + Watch caption for /v (no server-side Remotion): @remotion/player requires browser globals (window/document/requestAnimationFrame) — importing in a Nitro server module would crash SSR. Plan explicitly accepts this branch. Client-mounted public Player deferred."
  - "slug-on-first-publish-only: slug assigned from slugify(title)||id on first publish; never overwritten on subsequent unpublish/re-publish cycles so the public URL stays stable."
  - "No new npm dependency for sanitizer: body is staff-authored Tiptap HTML, so a conservative regex/allowlist is sufficient defense-in-depth. Would not be appropriate for member-authored content."
  - "Test mock pattern: vi.mock + fluent chain mock with as any cast avoids Drizzle type complexity in unit tests while keeping tests pure (no real DB connection needed)."
metrics:
  duration: 834s
  completed: "2026-06-20"
  tasks: 3
  files: 17
---

# Phase CV4 Plan 01: Publish Pipeline Summary

**One-liner:** Two status-toggle actions (content + video, slug-on-publish) + Publish/Unpublish buttons in both editors + member API /api/m/content (requireDemoMember + published-only filter) + Nitro SSR /c/:slug (sanitized Tiptap HTML, 14-test sanitizer) + Nitro SSR /v/:slug (poster + Watch caption, malformed-spec fallback) + auth.ts /c /v publicPaths + CORS parity.

## What Was Built

### Task 1 — Publish/Unpublish status actions + editor buttons + two-exposure

**content-set-status.ts (actions/):**
- `defineAction` mutation, no `http` key, `// guard:allow-unscoped — single-tenant content`
- Schema: `{ id: z.string().min(1), status: z.enum(["draft","published"]) }`
- On publish: if `doc.slug` is null/empty → `slug = slugify(doc.title) || doc.id`; if slug already set, left intact (URL stability)
- On unpublish: status → 'draft', slug unchanged
- Sets `updatedAt`, calls `writeAppState("refresh-signal")`
- Returns `{ updated: true, status, slug }` or `{ error: 'NOT_FOUND' }`

**video-set-status.ts (actions/):** Same shape for `schema.videoCompositions`. Status toggle is independent of spec validity — the spec is NOT parsed here.

**Editor buttons:**
- `gymos.content_.$id.tsx`: `handleSetStatus()` posts to `/_agent-native/actions/content-set-status`; button reads `doc.status` and shows "Publish" (default Button) or "Unpublish" (outline). Published URL `/c/{slug}` shown as green link below toolbar. Both use Tabler icons `IconWorld` / `IconWorldOff`.
- `gymos.video_.$id.tsx`: same pattern with `video-set-status`. Button placed in toolbar OUTSIDE the `<ClientOnly>` Player wrapper (plain UI, no Remotion dependency).

**Two-exposure:**
- `agent-chat.ts`: `content-set-status` added to Content tab section; `video-set-status` to Video tab section. Both described as DIRECT. Instructions confirm intent before publishing and note that only published items reach members.
- `AGENTS.md`: two new rows in Agent Actions table; two-exposure notes updated; CV4 two-exposure note added; old "deferred to CV4" caveats replaced; Data Sources table updated.

### Task 2 — Member API + /c/:slug SSR + HTML sanitizer + publicPaths (TDD)

**sanitize-html.ts (server/lib):** Pure conservative HTML sanitizer. No new npm dependency.

Threat model documented in header comment:
- Strip `<script>...</script>` and `<style>...</style>` wholesale (content removed too)
- Strip all `on*=` event handler attributes globally
- Tag allowlist: h1–h6, p, blockquote, pre, ul, ol, li, hr, br, strong, b, em, i, u, s, code, span, a, img
- Attribute allowlist per tag: `a` → href only; `img` → src + alt; all others → no attributes
- URL scheme validation: reject `javascript:`, `data:`, `vbscript:`; allow http/https/mailto/relative
- Normalization: trims + strips control chars + strips HTML entity references before scheme check

7 unit tests (all GREEN via TDD RED→GREEN cycle).

**public-content-ssr.ts (server/lib):** Mirror of `features/forms/lib/public-form-ssr.ts`.
- `getPublishedDocBySlugOrId(slugOrId)`: 60s in-memory cache; slug-first lookup, id fallback; returns null if `!row || row.status !== "published"`
- `renderPublicContentHtml(url)`: strips `/c/` prefix + decodeURIComponent; null → notFoundPage() + 404; else clean reader page with `escapeHtml(title)` + `sanitizeContentHtml(doc.body)` injected into `<article class="content-body">`
- `renderPublicContent(event)`: H3 wrapper with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on 200

3 unit tests (published→200+body, draft→404, unknown→404). All GREEN.

**server/routes/c/[...slug].get.ts:** One-line re-export — `export { renderPublicContent as default }`. The `c/` nesting makes Nitro match it before the RR catch-all route, just like `/f`.

**api.m.content.tsx (app/routes):** Resource route (loader only, no default component). Mirrors `api.m.schedule.tsx` exactly:
- `await requireDemoMember(request)` — gate (throws 401 if DEMO_MODE !== true or missing header)
- `eq(schema.contentDocuments.status, "published")` filter — drafts NEVER returned
- `// guard:allow-unscoped — single-tenant content (published-only member API)`
- Returns `{ items: [{ id, title, slug, body, updatedAt }] }` ordered by `desc(updatedAt)`

**auth.ts:** Two edits made:
1. `publicPaths`: added `"/c"` and `"/v"` (with CV4 comment block)
2. `allowlistHandler` skip list: added `pathname.startsWith("/c/")` and `pathname.startsWith("/v/")`

**00-public-cors.ts:** Added `"/c/"` and `"/v/"` to `PUBLIC_EMBED_PREFIXES` for CORS parity with /f.

### Task 3 — Public SSR /v/:slug video page (TDD)

**public-video-ssr.ts (server/lib):** Mirror of public-content-ssr.ts.
- `getPublishedCompositionBySlugOrId(slugOrId)`: same 60s cache pattern; null if draft
- `renderPublicVideoHtml(url)`: strips `/v/` prefix; null → notFoundPage() + 404
- Poster rendering: `parseSpec(row.spec)` wrapped in `try/catch` → `defaultSpec()` fallback (never throws). First scene bgColor validated as `^#[0-9a-fA-F]{3,8}$` (CSS injection prevention). First scene imageUrl validated as http/https only (SSRF prevention). CSS poster `<div class="poster poster-{format}">` with correct aspect ratio. If safe imageUrl: `<img class="poster-img">` (covers poster). Otherwise: `<div class="poster-text">{escapeHtml(text)}</div>`.
- `<p class="watch">Watch — preview available in the GymClassOS app</p>` below poster

**NO Remotion imports:** `@remotion/player`, `@remotion/renderer`, `@remotion/lambda`, `remotion` are NOT imported in any `server/lib/` file. The live `@remotion/player` embed remains the staff-editor preview (CV3). A client-mounted public Player is a deferred follow-up.

4 unit tests (published→200+title+poster+watch, draft→404, unknown→404, malformed-spec→200). All GREEN.

**server/routes/v/[...slug].get.ts:** One-line re-export matching /c pattern.

## Key Architectural Decision: Nitro Server Routes vs. React Router App Routes

`root.tsx` line 299 wraps the **entire RR app** in `<ClientOnly>`:
```tsx
<ClientOnly fallback={<SplashScreen />}>
  {() => <Outlet />}
</ClientOnly>
```

This means: **any React Router route's HTML body is rendered only in the browser** — SSR emits a spinner placeholder, not real content. Google/Bing crawl the source and see no meaningful content.

**Nitro server routes** (`server/routes/c/[...slug].get.ts`, `server/routes/v/[...slug].get.ts`) bypass this entirely: they return complete, self-contained HTML strings directly from the server. Nitro matches more-specific paths first, so `/c/:slug` is handled by the Nitro route before the RR catch-all route sees it.

This is why all public/crawlable pages in this app are Nitro server routes: `/f/*`, `/preview/*`, `/embed/*` — and now `/c/*` and `/v/*`.

## Verification

- `npx tsc --noEmit`: CLEAN (0 errors) after each task and final
- `npx vitest run --config vitest.unit.config.ts server/lib/sanitize-html.test.ts server/lib/public-content-ssr.test.ts server/lib/public-video-ssr.test.ts`: 14/14 PASSED
- No `http` key in content-set-status.ts / video-set-status.ts
- Both status actions carry `// guard:allow-unscoped`
- No `@remotion/player|@remotion/renderer|@remotion/lambda|"remotion"` imports in any `server/lib/public-*-ssr.ts`
- `requireDemoMember` present in api.m.content.tsx; loader filters `eq(status, "published")`
- auth.ts: `/c` and `/v` in publicPaths array AND `startsWith("/c/")` + `startsWith("/v/")` in allowlistHandler skip list
- No new migration: `contentDocuments.status/slug` and `videoCompositions.status/slug` already existed (CV1/CV2/CV3)
- No `drizzle-kit push`, no DDL changes in db.ts, no schema.ts column additions
- All helper/test files in `server/lib` (never `server/plugins`)
- No mutation has an `http` key; no destructive UI uses `window.confirm/alert/prompt`
- No new npm dependency added

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock type mismatch (public-content-ssr.test.ts)**
- **Found during:** Task 2 tsc run
- **Issue:** First draft of test file used complex fluent mock builder that didn't match Drizzle's exact TypeScript types, causing ~12 tsc errors in the test file
- **Fix:** Rewrote test mock with a simpler `makeDb()` helper + `as any` cast on `vi.mocked(getDb).mockReturnValue()`. Tests still pass correctly (runtime behavior identical); type errors eliminated.
- **Files modified:** `server/lib/public-content-ssr.test.ts`
- **Commit:** 55d58dbe

**2. [Rule 1 - Bug] Test assertion: poster class check (public-video-ssr.test.ts)**
- **Found during:** Task 3 initial test run (2 of 4 failed)
- **Issue:** Test asserted `class="poster"` exactly, but the generated HTML uses `class="poster poster-square"` (compound class). The `toContain` match failed.
- **Fix:** Changed assertion to `toMatch(/class="poster[\s"]/)` — matches the poster class whether it has additional classes or not.
- **Files modified:** `server/lib/public-video-ssr.test.ts`
- **Commit:** 0dc794cd

### Implementation Notes

**Client-mounted public Remotion Player deferred:**
The plan notes "/v allows an 'embedded player OR poster + Watch caption' branch". We shipped the poster + Watch caption branch (correct for this phase). A future follow-up could add a client-side `<Player>` using a non-ClientOnly React Router route or an Alpine.js extension. Not required by CV4 success criteria.

## Known Stubs

None — all plan artifacts are fully implemented. The publish pipeline is functional end-to-end:
- Staff click Publish → status = 'published', slug assigned
- Published content appears at /c/{slug} (crawlable SSR), /api/m/content (member API)
- Published video appears at /v/{slug} (crawlable SSR poster + Watch caption)
- Unpublish reverts to draft, slug preserved for URL stability
- Drafts are never exposed by any surface

## Self-Check: PASSED

Files verified present:
- FOUND: apps/staff-web/actions/content-set-status.ts
- FOUND: apps/staff-web/actions/video-set-status.ts
- FOUND: apps/staff-web/server/lib/sanitize-html.ts
- FOUND: apps/staff-web/server/lib/sanitize-html.test.ts
- FOUND: apps/staff-web/server/lib/public-content-ssr.ts
- FOUND: apps/staff-web/server/lib/public-content-ssr.test.ts
- FOUND: apps/staff-web/server/lib/public-video-ssr.ts
- FOUND: apps/staff-web/server/lib/public-video-ssr.test.ts
- FOUND: apps/staff-web/server/routes/c/[...slug].get.ts
- FOUND: apps/staff-web/server/routes/v/[...slug].get.ts
- FOUND: apps/staff-web/app/routes/api.m.content.tsx
- FOUND: apps/staff-web/app/routes/gymos.content_.$id.tsx (Publish/Unpublish button added)
- FOUND: apps/staff-web/app/routes/gymos.video_.$id.tsx (Publish/Unpublish button added)
- FOUND: apps/staff-web/server/plugins/agent-chat.ts (content-set-status + video-set-status)
- FOUND: apps/staff-web/AGENTS.md (action rows + two-exposure note)
- FOUND: apps/staff-web/server/plugins/auth.ts (/c and /v in publicPaths + allowlistHandler)
- FOUND: apps/staff-web/server/middleware/00-public-cors.ts (/c/ and /v/ added)

Commits verified:
- 60a4136a feat(CV4-01): status-toggle actions (content/video) + Publish/Unpublish buttons + two-exposure
- 55d58dbe feat(CV4-01): member API /api/m/content + public SSR /c/:slug + HTML sanitizer + publicPaths
- 0dc794cd feat(CV4-01): public SSR /v/:slug video page (poster + Watch caption, published-only)
