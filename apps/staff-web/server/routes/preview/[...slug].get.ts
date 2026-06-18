// Public SSR form renderer — alias of /f/:slug at a friendlier /preview/:slug URL.
// No auth required. Runs BEFORE the React Router app catch-all because
// the `preview/` nesting creates a more-specific path that Nitro matches first.
// CORS + auth bypass configured in middleware/00-public-cors.ts + auth.ts.
export { renderPublicForm as default } from "../../../features/forms/lib/public-form-ssr.js";
