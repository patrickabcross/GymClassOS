/**
 * Public SSR schedule widget — /embed/schedule
 *
 * Returns a standalone self-contained HTML page showing the studio's upcoming
 * classes. Anonymous, no auth required. Designed to be embedded as an <iframe>
 * on the studio's marketing site (e.g. doyouhustle.co.uk).
 *
 * URL-param theming: ?accent=#rrggbb &radius=<px>
 * Both are sanitised server-side (see schedule-widget-ssr.ts + public-form-ssr.ts).
 *
 * CORS + auth bypass: already configured in
 *   - apps/staff-web/server/middleware/00-public-cors.ts  (/embed/ prefix)
 *   - apps/staff-web/server/plugins/auth.ts               ("/embed" publicPath)
 * DO NOT modify those files here — P1c-02 owns them.
 */
export { renderScheduleWidget as default } from "../../../features/forms/lib/schedule-widget-ssr.js";
