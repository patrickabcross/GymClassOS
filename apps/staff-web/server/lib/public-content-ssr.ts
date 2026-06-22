// public-content-ssr.ts — CV4-01
//
// Public SSR content page renderer for /c/:slug.
// Lives in server/lib (NEVER server/plugins — Nitro bundling rule).
//
// WHY Nitro server route (not React Router app route):
//   root.tsx wraps the entire RR app in <ClientOnly> (line 299).
//   Any RR route's body renders only on the client (SSR emits just a spinner).
//   → RR routes are NOT crawlable. Nitro server routes return self-contained
//     HTML strings = real HTML in source = crawlable (like /f, /preview, /embed).
//
// Exports:
//   renderPublicContent(event)     — H3 handler used by server/routes/c/[...slug].get.ts
//   renderPublicContentHtml(url)   — pure function; unit-testable without H3
//
// Published-only: drafts → 404. All interpolated plain text escaped via escapeHtml.
// Body HTML: sanitized via sanitizeContentHtml before injection (never escaped).
//
// Mirror of features/forms/lib/public-form-ssr.ts pattern.

import { getMethod, getRequestURL, type H3Event } from "h3";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { sanitizeContentHtml } from "./sanitize-html.js";
import { getTenantBrand } from "./tenant-brand-resolver.js";
import type { TenantBrand } from "./tenant-brand.js";

// ─── In-memory cache (60s TTL) ───────────────────────────────────────────────

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60_000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) return entry.data;
  return null;
}

// ─── DB lookup ───────────────────────────────────────────────────────────────

type ContentDoc = {
  id: string;
  title: string;
  body: string;
  status: string;
  slug: string | null;
  createdAt: string;
  updatedAt: string;
};

async function getPublishedDocBySlugOrId(
  slugOrId: string,
): Promise<ContentDoc | null> {
  const cached = getCached(slugOrId);
  if (cached) return cached as ContentDoc;

  const db = getDb();

  // guard:allow-unscoped — single-tenant content; public SSR lookup by slug/id
  // Try slug first
  let row = await db
    .select()
    .from(schema.contentDocuments)
    .where(eq(schema.contentDocuments.slug, slugOrId))
    .limit(1)
    .then((rows) => (rows as ContentDoc[])[0] ?? null);

  // Fall back to id
  if (!row) {
    row = await db
      .select()
      .from(schema.contentDocuments)
      .where(eq(schema.contentDocuments.id, slugOrId))
      .limit(1)
      .then((rows) => (rows as ContentDoc[])[0] ?? null);
  }

  if (!row || row.status !== "published") return null;

  cache.set(slugOrId, { data: row, ts: Date.now() });
  return row;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function escapeHtml(value: unknown): string {
  const str = typeof value === "string" ? value : String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── 404 page ────────────────────────────────────────────────────────────────

function notFoundPage(brand: TenantBrand): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${brand.googleFontsHref}" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-family:${brand.fontFamily}}
body{background:#fff;color:#111;min-height:100vh;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:32px 16px}
.not-found{text-align:center}
.not-found h1{font-size:1.5rem;font-weight:600;margin-bottom:8px}
.not-found p{font-size:0.9375rem;color:#555;margin-top:6px}
</style>
</head>
<body>
<div class="not-found">
  <h1>Page not found</h1>
  <p>This content may have been removed or is not yet published.</p>
</div>
</body>
</html>`;
}

// ─── Content page renderer ────────────────────────────────────────────────────

function renderContentPage(doc: ContentDoc, brand: TenantBrand): string {
  // Generate a plain-text excerpt for the meta description (strip tags, truncate)
  const plainBody = doc.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const description = plainBody.slice(0, 160);

  const sanitizedBody = sanitizeContentHtml(doc.body);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${brand.googleFontsHref}" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-family:${brand.fontFamily};font-feature-settings:"cv02","cv03","cv04","cv11"}
body{background:#fff;color:#111;min-height:100vh;-webkit-font-smoothing:antialiased}
.page{max-width:720px;margin:0 auto;padding:48px 24px 96px}
h1.doc-title{font-size:2rem;font-weight:700;line-height:1.2;letter-spacing:-0.02em;margin-bottom:24px;color:#0f172a}
.content-body{line-height:1.7;color:#1e293b}
.content-body h1,.content-body h2,.content-body h3{font-weight:600;line-height:1.3;margin-top:1.5em;margin-bottom:0.5em;color:#0f172a}
.content-body h1{font-size:1.75rem}
.content-body h2{font-size:1.375rem}
.content-body h3{font-size:1.125rem}
.content-body p{margin-bottom:1em}
.content-body ul,.content-body ol{margin:0 0 1em 1.5em}
.content-body li{margin-bottom:0.25em}
.content-body a{color:#2563eb;text-decoration:underline}
.content-body a:hover{color:#1d4ed8}
.content-body strong,.content-body b{font-weight:600}
.content-body em,.content-body i{font-style:italic}
.content-body blockquote{border-left:3px solid #e2e8f0;padding:0.5em 0 0.5em 1em;margin:1em 0;color:#475569;font-style:italic}
.content-body code{font-family:"Fira Code","Cascadia Code",monospace;font-size:0.875em;background:#f1f5f9;border-radius:3px;padding:0.15em 0.35em}
.content-body pre{background:#f1f5f9;border-radius:6px;padding:1em;overflow-x:auto;font-size:0.875em;margin-bottom:1em}
.content-body pre code{background:none;padding:0;border-radius:0}
.content-body img{max-width:100%;height:auto;border-radius:6px;margin:0.5em 0}
.content-body hr{border:none;border-top:1px solid #e2e8f0;margin:2em 0}
@media(max-width:640px){.page{padding:32px 16px 64px}.doc-title{font-size:1.5rem}}
</style>
</head>
<body>
<div class="page">
  <h1 class="doc-title">${escapeHtml(doc.title)}</h1>
  <article class="content-body">${sanitizedBody}</article>
</div>
</body>
</html>`;
}

// ─── Pure renderer (unit-testable without H3) ─────────────────────────────────

export async function renderPublicContentHtml(
  url: string,
): Promise<{ html: string; status: number }> {
  // Resolve live tenant brand (30s cache; falls back to DEFAULT_TENANT_BRAND on error).
  const tenantBrand = await getTenantBrand();

  // Strip the /c/ prefix + decode URI component to get the slug/id
  const pathname = url.split("?")[0];
  const slugOrId = decodeURIComponent(pathname.replace(/^\/c\//, ""));

  if (!slugOrId) {
    return { html: notFoundPage(tenantBrand), status: 404 };
  }

  const doc = await getPublishedDocBySlugOrId(slugOrId);
  if (!doc) {
    return { html: notFoundPage(tenantBrand), status: 404 };
  }

  return { html: renderContentPage(doc, tenantBrand), status: 200 };
}

// ─── H3 handler wrapper ───────────────────────────────────────────────────────

export async function renderPublicContent(event: H3Event) {
  const reqUrl = getRequestURL(event);
  const url = reqUrl.pathname + reqUrl.search;
  const { html, status } = await renderPublicContentHtml(url);

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
  };
  if (status === 200) {
    headers["Cache-Control"] =
      "public, s-maxage=60, stale-while-revalidate=300";
  }

  return new Response(getMethod(event) === "HEAD" ? null : html, {
    status,
    headers,
  });
}
