// Public form submission endpoint — unauthenticated lead upsert.
// CORS is handled by apps/staff-web/server/middleware/00-public-cors.ts.
// Auth bypass is configured in apps/staff-web/server/plugins/auth.ts publicPaths.
export { submitLeadForm as default } from "../../../../features/forms/handlers/submissions.js";
