// Public SSR homepage — United States. Standalone marketing HTML, no auth.
// Auth bypass: "/us" is listed in server/plugins/auth.ts publicPaths + allowlist skip.
export { renderHomeUS as default } from "../../features/marketing/lib/marketing-ssr.js";
