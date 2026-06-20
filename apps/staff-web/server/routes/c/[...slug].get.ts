// Public SSR content renderer — returns a self-contained standalone HTML page.
// No auth required. Runs BEFORE the React Router app catch-all because
// the `c/` nesting creates a more-specific path that Nitro matches first.
// CORS + auth bypass configured in middleware/00-public-cors.ts + auth.ts.
export { renderPublicContent as default } from "../../lib/public-content-ssr.js";
