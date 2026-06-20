---
phase: CV4-publish-pipeline
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/content-set-status.ts
  - apps/staff-web/actions/video-set-status.ts
  - apps/staff-web/app/routes/gymos.content_.$id.tsx
  - apps/staff-web/app/routes/gymos.video_.$id.tsx
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
  - apps/staff-web/app/routes/api.m.content.tsx
  - apps/staff-web/server/lib/sanitize-html.ts
  - apps/staff-web/server/lib/sanitize-html.test.ts
  - apps/staff-web/server/lib/public-content-ssr.ts
  - apps/staff-web/server/lib/public-content-ssr.test.ts
  - apps/staff-web/server/routes/c/[...slug].get.ts
  - apps/staff-web/server/lib/public-video-ssr.ts
  - apps/staff-web/server/lib/public-video-ssr.test.ts
  - apps/staff-web/server/routes/v/[...slug].get.ts
  - apps/staff-web/server/plugins/auth.ts
  - apps/staff-web/server/middleware/00-public-cors.ts
autonomous: true
requirements: [PUB-01, PUB-02, PUB-03, PUB-04]

must_haves:
  truths:
    - "Staff can click Publish on a content document; status becomes 'published'; clicking Unpublish reverts to 'draft' (PUB-01)"
    - "Staff can click Publish on a video composition; status becomes 'published'; Unpublish reverts to 'draft' (PUB-01)"
    - "Publishing a document with no slug assigns a slug (slugify(title) || id) so the public URL resolves (PUB-01/03)"
    - "GET /api/m/content returns ONLY status='published' documents, gated by requireDemoMember; drafts never returned (PUB-02)"
    - "Visiting /c/:slug (no login) returns server-rendered HTML containing the document body; a draft or unknown slug returns 404 (PUB-03)"
    - "The /c/:slug body HTML is sanitized on output (no <script>, no on*= handlers, no javascript: URLs) (PUB-03)"
    - "Visiting /v/:slug (no login) returns server-rendered HTML with the composition title, a poster/first-frame, and a Watch caption; a draft or unknown slug returns 404 (PUB-04)"
    - "Only status='published' is ever exposed by /api/m/content, /c/:slug, /v/:slug — every surface filters on published"
  artifacts:
    - path: "apps/staff-web/actions/content-set-status.ts"
      provides: "Publish/unpublish a content document (status toggle + slug-on-publish)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/video-set-status.ts"
      provides: "Publish/unpublish a video composition (status toggle + slug-on-publish)"
      contains: "defineAction"
    - path: "apps/staff-web/app/routes/api.m.content.tsx"
      provides: "Member API — published-only content list, requireDemoMember-gated"
      contains: "requireDemoMember"
    - path: "apps/staff-web/server/lib/sanitize-html.ts"
      provides: "Pure server-side Tiptap-HTML sanitizer (tag/attr allowlist)"
      exports: ["sanitizeContentHtml"]
    - path: "apps/staff-web/server/lib/public-content-ssr.ts"
      provides: "Public SSR content page renderer (published-only lookup, 404 fallback)"
      exports: ["renderPublicContent", "renderPublicContentHtml"]
    - path: "apps/staff-web/server/routes/c/[...slug].get.ts"
      provides: "Nitro server route mounting the content SSR renderer at /c/:slug"
      contains: "renderPublicContent"
    - path: "apps/staff-web/server/lib/public-video-ssr.ts"
      provides: "Public SSR video page renderer (poster + Watch caption, published-only, 404 fallback)"
      exports: ["renderPublicVideo", "renderPublicVideoHtml"]
    - path: "apps/staff-web/server/routes/v/[...slug].get.ts"
      provides: "Nitro server route mounting the video SSR renderer at /v/:slug"
      contains: "renderPublicVideo"
  key_links:
    - from: "apps/staff-web/server/routes/c/[...slug].get.ts"
      to: "apps/staff-web/server/lib/public-content-ssr.ts"
      via: "re-export renderPublicContent as default (mirrors /f route)"
      pattern: "renderPublicContent"
    - from: "apps/staff-web/server/lib/public-content-ssr.ts"
      to: "apps/staff-web/server/lib/sanitize-html.ts"
      via: "sanitizeContentHtml(doc.body) before interpolating into the page"
      pattern: "sanitizeContentHtml"
    - from: "apps/staff-web/server/plugins/auth.ts"
      to: "/c, /v"
      via: "publicPaths array + allowlistHandler skip list both add /c/ and /v/ prefixes"
      pattern: "\"/c\"|/c/"
    - from: "apps/staff-web/app/routes/api.m.content.tsx"
      to: "schema.contentDocuments"
      via: "loader filters eq(status,'published') after requireDemoMember"
      pattern: "published"
---

<objective>
Close the CV4 publish pipeline: staff promote content documents and video compositions from `draft` to `published`; published items reach members via a demo-member-gated member API (`/api/m/content`) and reach the public via crawlable SSR marketing pages (`/c/:slug`, `/v/:slug`). No new member web portal; no staff-login-required member routes. Only `published` items are ever exposed beyond staff.

Purpose: This is the final phase of v2.1 — it turns the CV2 content tab and CV3 video tab (both stuck at status='draft') into a real publish-and-distribute pipeline, satisfying PUB-01..04.

Output: Two status-toggle actions (two-exposed) + Publish/Unpublish buttons in both editors; one member API resource route; two Nitro public-SSR pages with a tested sanitizer; auth.ts publicPaths widened to `/c` and `/v`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/CV2-content-tab/CV2-01-SUMMARY.md
@.planning/phases/CV3-video-tab/CV3-01-SUMMARY.md

# Patterns to mirror exactly
@apps/staff-web/server/routes/f/[...slug].get.ts
@apps/staff-web/features/forms/lib/public-form-ssr.ts
@apps/staff-web/app/routes/api.m.schedule.tsx
@apps/staff-web/server/lib/demo-member.ts
@apps/staff-web/actions/content-update-document.ts
@apps/staff-web/server/lib/content-slug.ts
@apps/staff-web/server/plugins/auth.ts
@apps/staff-web/server/middleware/00-public-cors.ts

<interfaces>
<!-- Key contracts — use directly, no codebase exploration needed. -->

From apps/staff-web/server/db/schema.ts (both tables already exist; status + slug columns present — NO migration needed):
```typescript
export const contentDocuments = table("content_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),        // Tiptap HTML
  status: text("status").notNull().default("draft"), // 'draft' | 'published'
  slug: text("slug"),                                // nullable until first publish
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
export const videoCompositions = table("video_compositions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  spec: text("spec").notNull().default("{}"),       // JSON TEXT — VideoSpec
  status: text("status").notNull().default("draft"),
  slug: text("slug"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
```

From apps/staff-web/server/lib/content-slug.ts:
```typescript
export function slugify(s: string): string; // lowercases, strips non-ASCII, hyphenates; "" if empty
```

From apps/staff-web/server/lib/demo-member.ts:
```typescript
export type DemoMember = typeof schema.gymMembers.$inferSelect;
export async function requireDemoMember(request: Request): Promise<DemoMember>;
// Throws 401 if NODE_ENV==='production' OR DEMO_MODE!=='true' OR missing X-Demo-Member-Id; 404 if member not found.
```

From apps/staff-web/server/lib/video-spec.ts (CV3):
```typescript
export function parseSpec(json: string): VideoSpec;     // throws on invalid — wrap in try/catch, fall back to defaultSpec()
export function defaultSpec(): VideoSpec;
export const DIMENSIONS: Record<"square"|"landscape", { width: number; height: number }>;
// VideoSpec.scenes[0] carries { text, subtitle?, bgColor?, imageUrl? } — use for poster text/color/first-frame image
```

PUBLIC SSR PATTERN (the load-bearing one — from server/routes/f/[...slug].get.ts + features/forms/lib/public-form-ssr.ts):
- Public pages are **Nitro server routes** under `server/routes/<prefix>/[...slug].get.ts`, NOT React Router app routes.
  WHY: root.tsx wraps the ENTIRE RR app in `<ClientOnly>` (line 299) — any RR app route's body renders only on the client (SSR emits just a spinner), so RR routes are NOT crawlable. Nitro server routes return self-contained HTML strings = real HTML in source = crawlable. This is why /f, /preview, /embed are all server routes.
- The route file is a one-line re-export: `export { renderPublicX as default } from "../../lib/public-x-ssr.js";`
- The renderer lib exports an H3 handler `renderPublicX(event: H3Event)` that:
  1. reads `getRequestURL(event)`, strips the `/c/` or `/v/` prefix + decodeURIComponent to get slug
  2. looks up the row by slug (then fall back to id), returns null if `!row || row.status !== "published"`
  3. returns `new Response(html, { status, headers })` with `Content-Type: text/html; charset=utf-8` and (on 200) `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
  4. on null → a `notFoundPage()` HTML string with status 404
- Split a PURE `renderPublicXHtml(url): Promise<{html, status}>` from the H3 wrapper so it is unit-testable without H3 (mirror renderPublicFormHtml).
- Use `escapeHtml()` for ALL interpolated plain text (title, slug, poster text). Copy the escapeHtml helper from public-form-ssr.ts.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Publish/unpublish status actions (content + video) + editor buttons + two-exposure</name>
  <files>apps/staff-web/actions/content-set-status.ts, apps/staff-web/actions/video-set-status.ts, apps/staff-web/app/routes/gymos.content_.$id.tsx, apps/staff-web/app/routes/gymos.video_.$id.tsx, apps/staff-web/server/plugins/agent-chat.ts, apps/staff-web/AGENTS.md</files>
  <action>
Create TWO new direct (ungated) status-toggle actions, mirroring content-update-document.ts exactly (defineAction from "@agent-native/core"; getDb/schema from "../server/db/index.js"; writeAppState("refresh-signal"); `// guard:allow-unscoped — single-tenant content/video`; NO `http` key; NO accessFilter/assertAccess/ownableColumns imports).

1. **content-set-status.ts** — schema `{ id: z.string().min(1), status: z.enum(["draft","published"]) }`.
   - Look up the doc by id; if missing return `{ error: "NOT_FOUND" }`.
   - On publish (status==='published'): if `doc.slug` is null/empty, set `slug = slugify(doc.title) || doc.id` (import slugify from "../server/lib/content-slug.js"). Otherwise keep existing slug.
   - On unpublish: just set status='draft' (leave slug intact so the URL stays stable if re-published).
   - Set `updatedAt = new Date().toISOString()`. Update the row. writeAppState. Return `{ updated: true, status, slug }`.
   - Description must say DIRECT, single-tenant; "Publish makes the document live at /c/{slug} and exposes it to members via /api/m/content; unpublish reverts to draft and removes it from all member-facing/public surfaces."

2. **video-set-status.ts** — same shape for `schema.videoCompositions` (slug = slugify(doc.title) || doc.id on publish if missing). Description: "Publish makes the composition live at /v/{slug}; unpublish reverts to draft." Do NOT parse/validate the spec here — status toggle is independent of spec validity.

3. **Editor buttons (PUB-01 UI):**
   - In `gymos.content_.$id.tsx`: add a shadcn `<Button>` in the editor toolbar that reads the current status from the loaded doc and shows "Publish" (when draft) or "Unpublish" (when published), with a Tabler icon (IconWorld / IconWorldOff or IconCircleCheck). On click: optimistic — POST to the action endpoint (`/_agent-native/actions/content-set-status` via the existing fetch pattern used by other mutations in this file), then revalidate (useRevalidator) so the badge/button flip. Publish is a deliberate action; a small shadcn confirmation is optional, NOT required (status is reversible). Reuse the existing IconDeviceFloppy/save fetch idiom already in the file.
   - In `gymos.video_.$id.tsx`: same Publish/Unpublish button wired to `video-set-status`. Keep it OUTSIDE the ClientOnly Player wrapper (it's plain UI, not Remotion).
   - Both: when published, optionally surface the public URL (`/c/{slug}` or `/v/{slug}`) as a small link/copy affordance — nice-to-have, not required.

4. **Two-exposure (CV2/CV3 convention):**
   - `agent-chat.ts`: in BOTH the Content tab section and the Video tab section, name the new tool (`content-set-status` / `video-set-status`) as DIRECT. Instruct: "Publishing exposes the item to members and the public; unpublishing removes it. Confirm intent before publishing. Only published items reach members."
   - `apps/staff-web/AGENTS.md`: add a row for each new action to the Agent Actions table (Tier `—`, mutation) with the publish/unpublish description + returns `{updated, status, slug}`. Update the existing CV2/CV3 two-exposure notes (or add a CV4 note) to record that status is now mutable to 'published' (the old "stays 'draft' until CV4" caveat is now realized).

VERIFY all CV2/CV3 invariants still hold: mutations have NO `http` key; carry `// guard:allow-unscoped`; no accessFilter/assertAccess; destructive UI uses shadcn (no window.confirm/alert/prompt).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <done>Both content-set-status.ts and video-set-status.ts exist with the slug-on-publish logic; both editor routes render a working Publish/Unpublish button; both actions are named in agent-chat.ts and listed in AGENTS.md; `tsc --noEmit` is clean. No mutation has an `http` key; slug is assigned on first publish.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Member API /api/m/content + public SSR /c/:slug content page + sanitizer + publicPaths</name>
  <files>apps/staff-web/app/routes/api.m.content.tsx, apps/staff-web/server/lib/sanitize-html.ts, apps/staff-web/server/lib/sanitize-html.test.ts, apps/staff-web/server/lib/public-content-ssr.ts, apps/staff-web/server/lib/public-content-ssr.test.ts, apps/staff-web/server/routes/c/[...slug].get.ts, apps/staff-web/server/plugins/auth.ts, apps/staff-web/server/middleware/00-public-cors.ts</files>
  <behavior>
sanitize-html.ts (sanitizeContentHtml):
  - Test 1: `<p>Hello <strong>world</strong></p>` passes through unchanged (allowlisted tags kept)
  - Test 2: `<script>alert(1)</script>` is removed entirely (no <script> in output)
  - Test 3: `<img src=x onerror=alert(1)>` → onerror attribute stripped; src kept
  - Test 4: `<a href="javascript:alert(1)">x</a>` → href stripped or neutralized (no "javascript:" substring in output)
  - Test 5: `<a href="https://example.com">x</a>` keeps the safe https href
  - Test 6: allowlisted Tiptap tags survive: h1-h3, p, ul/ol/li, a, strong, em, img, br, blockquote, code, pre
  - Test 7: a disallowed tag like `<iframe>` is removed (content unwrapped or dropped)
public-content-ssr.ts (renderPublicContentHtml(url)):
  - Test 8: a published doc slug → { status: 200, html } where html contains the (sanitized) body and the title (escaped)
  - Test 9: a draft doc slug → { status: 404 } (drafts never publicly visible)
  - Test 10: an unknown slug → { status: 404 }
  </behavior>
  <action>
RED→GREEN. Write the two test files first (vitest.unit.config.ts), confirm RED, then implement.

1. **sanitize-html.ts** (server/lib — NEVER server/plugins): pure `sanitizeContentHtml(html: string): string`. NO new dependency — implement a conservative regex/allowlist sanitizer (the body is staff-authored Tiptap HTML, so this is defense-in-depth, not adversarial-grade). Steps: strip `<script>...</script>` and `<style>...</style>` blocks; strip any tag NOT in the allowlist (h1,h2,h3,p,br,ul,ol,li,a,strong,b,em,i,u,s,blockquote,code,pre,img,hr); for surviving tags strip every attribute except a per-tag allowlist (`a`→href, `img`→src+alt); drop any href/src whose value (after trimming + lowercasing + stripping whitespace/control chars) starts with `javascript:` or `data:` (allow http/https/relative/mailto only); strip all `on*=` handler attributes globally. Document the threat model in a header comment. 8 focused unit tests.

2. **public-content-ssr.ts** (server/lib): mirror features/forms/lib/public-form-ssr.ts structure:
   - `getPublishedDocBySlugOrId(slugOrId)` with the same 60s in-memory cache pattern; query `schema.contentDocuments` by slug, fall back to id; return null if `!row || row.status !== "published"`.
   - Copy the `escapeHtml()` helper from public-form-ssr.ts.
   - Pure `renderPublicContentHtml(url): Promise<{html, status}>`: strip `/c/` prefix + decodeURIComponent → slug; null → `notFoundPage()` + 404; else render a clean reader page: `<!DOCTYPE html>` + escaped `<title>` + `<meta name="description">` (first ~160 chars of text-stripped body) + Inter @font-face (copy from public-form-ssr) + minimal article CSS + `<h1>${escapeHtml(title)}</h1>` + `<article class="content-body">${sanitizeContentHtml(doc.body)}</article>`. The body is the ONLY place sanitized HTML is injected un-escaped — import sanitizeContentHtml from "./sanitize-html.js".
   - H3 wrapper `renderPublicContent(event)`: same headers/cache as renderPublicForm (text/html, s-maxage=60 SWR on 200). Export both `renderPublicContent` (default-ish) and `renderPublicContentHtml`.

3. **server/routes/c/[...slug].get.ts**: one-line re-export — `export { renderPublicContent as default } from "../../lib/public-content-ssr.js";` (mirror server/routes/f/[...slug].get.ts; the `c/` nesting makes Nitro match it before the RR catch-all).

4. **api.m.content.tsx** (app/routes — RR resource route): mirror api.m.schedule.tsx exactly. `loader({ request })`: `await requireDemoMember(request)` (import from "../../server/lib/demo-member"); then query `schema.contentDocuments` where `eq(status,'published')`, ordered `desc(updatedAt)`, selecting `{ id, title, slug, body, updatedAt }`; `// guard:allow-unscoped — single-tenant content (published-only member API)`. Return `{ items }`. Drafts MUST NOT appear (filter on status). No default React component — resource route, loader only (like api.m.schedule.tsx).

5. **auth.ts — make /c public (BOTH edits required):**
   - Add `"/c"` to the `publicPaths` array (with a comment: public SSR content marketing pages, mirrors /f). Note: `/api/m` is already public-prefixed, so /api/m/content needs NO change there — but VERIFY it: the existing `"/api/m"` prefix covers it.
   - Add `pathname.startsWith("/c/")` to the `allowlistHandler` skip list (the second list around line 110) so the email allowlist does not intercept it.
   - Do NOT widen `/_agent-native` or `/api` beyond the existing `/api/m`.

6. **00-public-cors.ts (optional, consistent):** add `"/c/"` to `PUBLIC_EMBED_PREFIXES` so the page returns permissive CORS like /f (harmless; the page is visited directly, not embedded — include for parity).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run --config vitest.unit.config.ts server/lib/sanitize-html.test.ts server/lib/public-content-ssr.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>sanitize-html.test.ts + public-content-ssr.test.ts pass (drafts→404, published→200 with sanitized body, script/onerror/javascript: stripped); api.m.content.tsx loader is requireDemoMember-gated and filters status='published'; server/routes/c/[...slug].get.ts re-exports the renderer; auth.ts has /c in BOTH publicPaths and the allowlist skip list; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Public SSR /v/:slug video page (poster + Watch caption, published-only) + publicPaths</name>
  <files>apps/staff-web/server/lib/public-video-ssr.ts, apps/staff-web/server/lib/public-video-ssr.test.ts, apps/staff-web/server/routes/v/[...slug].get.ts, apps/staff-web/server/plugins/auth.ts, apps/staff-web/server/middleware/00-public-cors.ts</files>
  <behavior>
public-video-ssr.ts (renderPublicVideoHtml(url)):
  - Test 1: a published composition slug → { status: 200, html } containing the escaped title, a "Watch" caption, and a poster element
  - Test 2: a draft composition slug → { status: 404 }
  - Test 3: an unknown slug → { status: 404 }
  - Test 4: a composition whose spec JSON is malformed still renders 200 (parseSpec wrapped in try/catch → defaultSpec fallback; poster uses a neutral color/title) — never throws
  </behavior>
  <action>
RED→GREEN. Write public-video-ssr.test.ts first, confirm RED, then implement.

1. **public-video-ssr.ts** (server/lib): mirror public-content-ssr.ts structure (same cache, escapeHtml, H3 wrapper, headers).
   - `getPublishedCompositionBySlugOrId(slugOrId)`: query `schema.videoCompositions` by slug then id; null if `!row || row.status !== "published"`.
   - Pure `renderPublicVideoHtml(url)`: strip `/v/` prefix + decode → slug; null → notFoundPage + 404; else render a crawlable SSR page with REAL HTML (NOT ClientOnly — this is a Nitro HTML string, inherently SSR):
     - escaped `<title>` + `<meta name="description">` (from title/first scene text)
     - `<h1>${escapeHtml(title)}</h1>`
     - **Poster as real HTML** (crawlable): wrap spec parse in try/catch — `let spec; try { spec = parseSpec(row.spec); } catch { spec = defaultSpec(); }` (import parseSpec/defaultSpec/DIMENSIONS from "./video-spec.js"). Build a CSS poster `<div class="poster">` using the first scene's `bgColor` (sanitize: only accept `^#[0-9a-fA-F]{3,8}$`, else neutral) and first scene `text` (escaped), at the aspect ratio from `DIMENSIONS[spec.format]`. If the first scene has a safe http(s) `imageUrl`, render it as an `<img class="poster-img">` first-frame instead of/over the CSS poster (validate the URL scheme — http/https only).
     - A **"Watch" caption** beneath the poster (e.g. `<p class="watch">Watch — preview available in the GymClassOS app</p>`) — satisfies the success criterion's "poster + Watch caption" branch.
   - DO NOT import `@remotion/player`, `@remotion/renderer`, `@remotion/lambda`, or `remotion` — a standalone Nitro HTML page cannot mount a React Remotion Player without a client bundle, and root.tsx's ClientOnly shell means an RR route would NOT be crawlable. The live `@remotion/player` embed remains the staff-editor preview (CV3). The success criterion explicitly accepts "embedded player OR poster + Watch caption" — we ship the crawlable poster+caption branch. (If a future client-mounted public Player is wanted, it is a follow-up; note it in the SUMMARY as deferred.)
   - H3 wrapper `renderPublicVideo(event)` + export `renderPublicVideoHtml`.

2. **server/routes/v/[...slug].get.ts**: one-line re-export — `export { renderPublicVideo as default } from "../../lib/public-video-ssr.js";`

3. **auth.ts — make /v public (BOTH edits):** add `"/v"` to `publicPaths`; add `pathname.startsWith("/v/")` to the allowlistHandler skip list. Do NOT widen /_agent-native or /api.

4. **00-public-cors.ts (optional, parity):** add `"/v/"` to `PUBLIC_EMBED_PREFIXES`.

Final sweep (note in SUMMARY): no Remotion imports in any server/lib file; both /c and /v are Nitro server routes (crawlable real HTML); only status='published' is exposed by /api/m/content, /c, and /v.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run --config vitest.unit.config.ts server/lib/public-video-ssr.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>public-video-ssr.test.ts passes (published→200 with title+poster+Watch caption, draft/unknown→404, malformed spec→200 via fallback); server/routes/v/[...slug].get.ts re-exports the renderer; auth.ts has /v in BOTH lists; NO Remotion import in server/lib; tsc clean.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` is clean after every task.
- `npx vitest run --config vitest.unit.config.ts server/lib/sanitize-html.test.ts server/lib/public-content-ssr.test.ts server/lib/public-video-ssr.test.ts` all pass.
- Grep checks:
  - No `http:` key in content-set-status.ts / video-set-status.ts; both carry `// guard:allow-unscoped`.
  - No `@remotion/player|@remotion/renderer|@remotion/lambda|"remotion"` import in any `server/lib/public-*-ssr.ts`.
  - `requireDemoMember` present in api.m.content.tsx; loader filters `eq(...status, "published")`.
  - auth.ts contains `/c` and `/v` in the publicPaths array AND `startsWith("/c/")` + `startsWith("/v/")` in the allowlistHandler skip list.
  - No mutation sets a status other than 'draft'|'published'; both editors use shadcn (no window.confirm/alert/prompt).
- No new migration: contentDocuments.status/slug and videoCompositions.status/slug already exist (CV1/CV2/CV3). Confirm no DDL change in db.ts and no schema.ts column additions.
- Helper/test files live in server/lib (never server/plugins).
</verification>

<success_criteria>
- PUB-01: Publish/Unpublish buttons toggle status on both content + video; slug assigned on first publish; reversible.
- PUB-02: GET /api/m/content returns published-only docs, requireDemoMember-gated; drafts never returned.
- PUB-03: /c/:slug is a crawlable Nitro SSR page rendering the sanitized published body; draft/unknown → 404.
- PUB-04: /v/:slug is a crawlable Nitro SSR page with title + poster/first-frame + Watch caption; draft/unknown → 404; no server-side MP4 render required.
- Only status='published' is ever exposed beyond staff across all three surfaces.
- tsc clean; all unit tests green; no new dependency; no DB migration; fork boundary preserved (all work in apps/staff-web).
</success_criteria>

<output>
After completion, create `.planning/phases/CV4-publish-pipeline/CV4-01-SUMMARY.md` using the summary template — record the action shape (single set-status action per type with slug-on-publish), the sanitize-html threat model + allowlist, the Nitro-server-route-vs-RR-app-route decision (root.tsx ClientOnly → RR routes are not crawlable → public pages must be Nitro server routes), and the /v poster+caption-vs-client-Player split (client-mounted public Player deferred).
</output>
