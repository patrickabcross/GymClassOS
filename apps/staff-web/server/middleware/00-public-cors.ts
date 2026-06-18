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
  getRequestHeader,
  getRequestURL,
  setResponseHeader,
} from "h3";

const PUBLIC_EMBED_PREFIXES = [
  "/api/forms/public/",
  "/api/submit/",
  "/f/", // public SSR form pages
  "/preview/", // public SSR form pages (alias of /f/)
  "/embed.js", // embed snippet (P1c-06)
  "/embed/", // schedule widget (P1c-05)
];

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname;

  // Member mobile API (/api/m/*) preflight. The member app is native (no CORS)
  // in production, but during browser-based testing (react-native-web via
  // `expo start --web`) it is cross-origin and sends the `X-Demo-Member-Id`
  // header, which the framework's default CORS allow-headers list omits — so
  // the preflight fails. Short-circuit OPTIONS here (before auth) with that
  // header allowed. Only when DEMO_MODE is on; in production these routes
  // self-gate to 401 regardless, so this opens nothing real. The actual
  // GET/POST keeps the framework's CORS headers (allow-headers is enforced
  // only on the preflight).
  if (
    process.env.DEMO_MODE === "true" &&
    pathname.startsWith("/api/m/") &&
    getMethod(event) === "OPTIONS"
  ) {
    setResponseHeader(
      event,
      "Access-Control-Allow-Origin",
      getRequestHeader(event, "origin") ?? "*",
    );
    setResponseHeader(event, "Access-Control-Allow-Credentials", "true");
    setResponseHeader(
      event,
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    setResponseHeader(
      event,
      "Access-Control-Allow-Headers",
      "Content-Type,Accept,Authorization,X-Demo-Member-Id",
    );
    return new Response(null, { status: 204 });
  }

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
