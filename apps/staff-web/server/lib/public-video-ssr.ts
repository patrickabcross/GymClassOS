// public-video-ssr.ts — CV4-01
//
// Public SSR video page renderer for /v/:slug.
// Lives in server/lib (NEVER server/plugins — Nitro bundling rule).
//
// WHY Nitro server route (not React Router app route):
//   Same reason as /c: root.tsx wraps the entire RR app in <ClientOnly>.
//   Nitro server routes return real HTML = crawlable.
//
// WHY no Remotion import server-side:
//   @remotion/player requires a browser environment (window/document/
//   requestAnimationFrame). Importing it in a Nitro server module would
//   crash the build and SSR. The live @remotion/player embed remains in the
//   staff editor preview (CV3). Public /v pages render a CSS poster + Watch
//   caption instead (the plan explicitly accepts this branch). A client-mounted
//   public Player is deferred as a follow-up; noted in CV4-01-SUMMARY.md.
//
// Exports:
//   renderPublicVideo(event)     — H3 handler used by server/routes/v/[...slug].get.ts
//   renderPublicVideoHtml(url)   — pure function; unit-testable without H3
//
// Published-only: drafts → 404. All interpolated plain text escaped via escapeHtml.
// Poster bgColor: validated as ^#[0-9a-fA-F]{3,8}$ only (CSS injection prevention).
// Poster imageUrl: validated as http/https scheme only (SSRF prevention).
//
// Mirror of server/lib/public-content-ssr.ts pattern.
//
// DO NOT import @remotion/player, @remotion/renderer, @remotion/lambda, or remotion here.

import { getMethod, getRequestURL, type H3Event } from "h3";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { parseSpec, defaultSpec } from "./video-spec.js";
import type { VideoSpec } from "./video-spec.js";
import { tenantBrand } from "./tenant-brand.js";

// ─── In-memory cache (60s TTL) ───────────────────────────────────────────────

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60_000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) return entry.data;
  return null;
}

// ─── DB lookup ───────────────────────────────────────────────────────────────

type VideoComp = {
  id: string;
  title: string;
  spec: string;
  status: string;
  slug: string | null;
  createdAt: string;
  updatedAt: string;
};

async function getPublishedCompositionBySlugOrId(
  slugOrId: string,
): Promise<VideoComp | null> {
  const cached = getCached(slugOrId);
  if (cached) return cached as VideoComp;

  const db = getDb();

  // guard:allow-unscoped — single-tenant video; public SSR lookup by slug/id
  // Try slug first
  let row = await db
    .select()
    .from(schema.videoCompositions)
    .where(eq(schema.videoCompositions.slug, slugOrId))
    .limit(1)
    .then((rows) => (rows as VideoComp[])[0] ?? null);

  // Fall back to id
  if (!row) {
    row = await db
      .select()
      .from(schema.videoCompositions)
      .where(eq(schema.videoCompositions.id, slugOrId))
      .limit(1)
      .then((rows) => (rows as VideoComp[])[0] ?? null);
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

/** Validates a hex colour for safe CSS injection into a style attribute. */
function sanitizeBgColor(raw: string | undefined): string {
  if (!raw) return "#0F172A";
  const v = raw.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : "#0F172A";
}

/** Validates an image URL: only http/https allowed, blocks data:, javascript:, etc. */
function sanitizeImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    // Relative URLs or invalid: do not render as img
  }
  return null;
}

// ─── 404 page ────────────────────────────────────────────────────────────────

function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${tenantBrand.googleFontsHref}" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-family:${tenantBrand.fontFamily}}
body{background:#fff;color:#111;min-height:100vh;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:32px 16px}
.not-found{text-align:center}
.not-found h1{font-size:1.5rem;font-weight:600;margin-bottom:8px}
.not-found p{font-size:0.9375rem;color:#555;margin-top:6px}
</style>
</head>
<body>
<div class="not-found">
  <h1>Page not found</h1>
  <p>This video may have been removed or is not yet published.</p>
</div>
</body>
</html>`;
}

// ─── Video page renderer ──────────────────────────────────────────────────────

function renderVideoPage(comp: VideoComp): string {
  // Parse spec safely — fall back to defaultSpec() on any error
  let spec: VideoSpec;
  try {
    spec = parseSpec(comp.spec);
  } catch {
    spec = defaultSpec();
  }

  const firstScene = spec.scenes[0];
  const bgColor = sanitizeBgColor(firstScene?.bgColor);
  const posterText = firstScene?.text ?? comp.title;
  const imageUrl = sanitizeImageUrl(firstScene?.imageUrl);

  // Aspect ratio from spec format
  const isSquare = spec.format === "square";
  const aspectClass = isSquare ? "poster-square" : "poster-landscape";

  // Description from title + first scene text
  const description = `${comp.title} — Watch preview in the ${tenantBrand.displayName} app`;

  const posterContent = imageUrl
    ? `<img class="poster-img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(posterText)}">`
    : `<div class="poster-text">${escapeHtml(posterText)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(comp.title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${tenantBrand.googleFontsHref}" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-family:${tenantBrand.fontFamily};font-feature-settings:"cv02","cv03","cv04","cv11"}
body{background:#fff;color:#111;min-height:100vh;-webkit-font-smoothing:antialiased}
.page{max-width:640px;margin:0 auto;padding:48px 24px 96px}
h1.vid-title{font-size:1.75rem;font-weight:700;line-height:1.25;letter-spacing:-0.02em;margin-bottom:24px;color:#0f172a}
.poster{position:relative;width:100%;border-radius:10px;overflow:hidden;background:${bgColor};display:flex;align-items:center;justify-content:center}
.poster-square{aspect-ratio:1/1}
.poster-landscape{aspect-ratio:16/9}
.poster-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.poster-text{font-size:clamp(1rem,4vw,1.75rem);font-weight:700;color:#fff;text-align:center;padding:24px;z-index:1;text-shadow:0 2px 8px rgba(0,0,0,0.5)}
.watch{margin-top:16px;font-size:0.9375rem;color:#475569;text-align:center;line-height:1.5}
@media(max-width:640px){.page{padding:32px 16px 64px}.vid-title{font-size:1.375rem}}
</style>
</head>
<body>
<div class="page">
  <h1 class="vid-title">${escapeHtml(comp.title)}</h1>
  <div class="poster ${aspectClass}">
    ${posterContent}
  </div>
  <p class="watch">Watch — preview available in the ${escapeHtml(tenantBrand.displayName)} app</p>
</div>
</body>
</html>`;
}

// ─── Pure renderer (unit-testable without H3) ─────────────────────────────────

export async function renderPublicVideoHtml(
  url: string,
): Promise<{ html: string; status: number }> {
  // Strip the /v/ prefix + decode URI component to get the slug/id
  const pathname = url.split("?")[0];
  const slugOrId = decodeURIComponent(pathname.replace(/^\/v\//, ""));

  if (!slugOrId) {
    return { html: notFoundPage(), status: 404 };
  }

  const comp = await getPublishedCompositionBySlugOrId(slugOrId);
  if (!comp) {
    return { html: notFoundPage(), status: 404 };
  }

  return { html: renderVideoPage(comp), status: 200 };
}

// ─── H3 handler wrapper ───────────────────────────────────────────────────────

export async function renderPublicVideo(event: H3Event) {
  const reqUrl = getRequestURL(event);
  const url = reqUrl.pathname + reqUrl.search;
  const { html, status } = await renderPublicVideoHtml(url);

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
