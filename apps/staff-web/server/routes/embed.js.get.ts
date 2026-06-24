/**
 * Public Nitro resource route — GET /embed.js
 *
 * Returns the GymClassOS vanilla-JS embed snippet with the correct
 * Content-Type so the studio can drop a single <script> tag onto
 * doyouhustle.co.uk and get both iframes (lead-capture form + schedule
 * widget) injected automatically.
 *
 * CORS + auth bypass are already configured in:
 *   - apps/staff-web/server/middleware/00-public-cors.ts  ("/embed.js" exact prefix)
 *   - apps/staff-web/server/plugins/auth.ts               ("/embed" publicPath)
 * DO NOT modify those files here — P1c-02 owns them.
 *
 * The BASE origin is read from the STAFF_WEB_URL env var at request time so
 * that local development can override the production default:
 *
 *   $env:STAFF_WEB_URL="http://localhost:8081"
 *
 * Without STAFF_WEB_URL the snippet defaults to the production deploy URL.
 */
import { defineEventHandler, setResponseHeader } from "h3";
import { buildEmbedScript } from "../../features/forms/lib/embed-snippet.js";

export default defineEventHandler((event) => {
  const base = process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";

  const js = buildEmbedScript(base);

  setResponseHeader(
    event,
    "Content-Type",
    "application/javascript; charset=utf-8",
  );
  // 5-minute CDN cache so the snippet stays fresh after a deploy.
  setResponseHeader(
    event,
    "Cache-Control",
    "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
  );
  // CORP cross-origin lets the <script src> load from third-party sites (e.g. doyouhustle.co.uk);
  // framework middleware defaults to same-site which blocks it.
  setResponseHeader(event, "Cross-Origin-Resource-Policy", "cross-origin");

  return js;
});
