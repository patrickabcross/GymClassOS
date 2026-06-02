// Public SSR privacy policy at `/privacy`. Required as the Meta app's Privacy
// Policy URL before the WhatsApp app can go live. Standalone HTML, no auth.
// Auth bypass: "/privacy" is listed in server/plugins/auth.ts publicPaths + allowlist skip.
export { renderPrivacyPage as default } from "../../features/marketing/lib/marketing-ssr.js";
