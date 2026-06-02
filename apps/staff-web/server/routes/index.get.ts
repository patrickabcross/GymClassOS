// Public SSR homepage at `/`. A concrete `index` route outranks the
// `[...page].get.ts` React Router catch-all in Nitro, so a hard load of the
// root returns this standalone marketing HTML instead of the staff app shell.
// Auth bypass: "/" is listed in server/plugins/auth.ts publicPaths + allowlist skip.
export { renderHomePage as default } from "../../features/marketing/lib/marketing-ssr.js";
