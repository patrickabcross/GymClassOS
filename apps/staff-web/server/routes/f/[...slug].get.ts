// Public SSR form renderer — returns a self-contained standalone HTML page.
// No auth required. Runs BEFORE the React Router app catch-all because
// the `f/` nesting creates a more-specific path that Nitro matches first.
// CORS + auth bypass configured in middleware/00-public-cors.ts + auth.ts.
export { renderPublicForm as default } from "../../../features/forms/lib/public-form-ssr.js";
