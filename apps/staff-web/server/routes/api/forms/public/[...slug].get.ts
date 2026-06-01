// Public form GET endpoint — returns published form fields + settings JSON.
// Unauthenticated — used by the embed.js script and the SSR renderer to
// load form metadata before rendering. CORS handled by 00-public-cors.ts.
export { getPublicForm as default } from "../../../../../features/forms/handlers/forms.js";
