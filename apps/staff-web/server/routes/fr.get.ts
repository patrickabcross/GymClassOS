// Public SSR homepage — France (français). Standalone marketing HTML, no auth.
// Auth bypass: "/fr" is listed in server/plugins/auth.ts publicPaths + allowlist skip.
export { renderHomeFR as default } from "../../features/marketing/lib/marketing-ssr.js";
