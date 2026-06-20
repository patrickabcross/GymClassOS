// Public SSR video renderer — returns a self-contained standalone HTML page.
// No auth required. Runs BEFORE the React Router app catch-all because
// the `v/` nesting creates a more-specific path that Nitro matches first.
// CORS + auth bypass configured in middleware/00-public-cors.ts + auth.ts.
// No Remotion import: poster + Watch caption served as static HTML (crawlable).
export { renderPublicVideo as default } from "../../lib/public-video-ssr.js";
