/**
 * CORS for public embed endpoints.
 *
 * The public form schema (`/api/forms/public/*`), submission (`/api/submit/*`),
 * public form SSR pages (`/f/*`), and embed script/widget routes are designed
 * to be called cross-origin from embedded lead-capture forms and schedule
 * widgets on the studio's marketing site (e.g. doyouhustle.co.uk). They always
 * return a permissive CORS header. Preflight OPTIONS are short-circuited to 204
 * so they skip the auth guard (Pitfall 4 — CORS must run before auth).
 *
 * Runs before `auth.ts` thanks to the `00-` filename prefix (Nitro loads
 * middleware alphabetically — P1c-RESEARCH Pattern 3).
 *
 * Forked from templates/forms/server/middleware/00-public-cors.ts.
 * Extended to cover all P1c public surfaces.
 */
import {
  defineEventHandler,
  getMethod,
  getRequestURL,
  setResponseHeader,
} from "h3";

const PUBLIC_EMBED_PREFIXES = [
  "/api/forms/public/",
  "/api/submit/",
  "/f/",       // public SSR form pages
  "/embed.js", // embed snippet (P1c-06)
  "/embed/",   // schedule widget (P1c-05)
];

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname;
  const isPublic = PUBLIC_EMBED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isPublic) return;

  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  setResponseHeader(
    event,
    "Access-Control-Allow-Headers",
    "Content-Type,Accept",
  );

  if (getMethod(event) === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
});
