import {
  createAuthPlugin,
  getH3App,
  getSession,
} from "@agent-native/core/server";
import { defineEventHandler, sendRedirect } from "h3";

// Google sign-in gates all staff surfaces (/gymos*). Scopes intentionally
// narrowed to just identity — GymClassOS does not read Gmail/Calendar/
// Contacts on the staff side. Re-add scopes only when a feature needs them
// so the OAuth consent screen stays minimal.
const authPlugin = createAuthPlugin({
  googleOnly: true,
  mountGoogleOAuthRoutes: false,
  googleScopes: [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
  marketing: {
    appName: "GymClassOS",
    tagline: "Run your studio's day from one inbox-and-schedule surface.",
    features: [
      "WhatsApp conversations alongside member context",
      "Class schedule, bookings, and pass balances",
      "Calorie counter and coaching agent on member mobile",
    ],
  },
  publicPaths: [
    // Public marketing pages — homepage + privacy policy (SSR via
    // server/routes/index.get.ts + privacy.get.ts). The privacy policy is the
    // Meta app's required Privacy Policy URL. matchesPathList normalizes "/" to
    // an exact-only match (it never prefix-matches the bare root), so listing
    // "/" here makes ONLY the root public — not the whole app.
    "/",
    "/privacy",
    // Mobile-app server routes — each gates itself via requireDemoMember
    // (DEMO_MODE + X-Demo-Member-Id). Prefix match covers
    // /api/m/members/list, /api/m/profile, /api/m/schedule, /api/m/bookings,
    // /api/m/food-entries, /api/m/foods/*, /api/m/agent, etc.
    "/api/m",
    "/pick-member",
    // WhatsApp webhook receiver (HMAC-verified inside the handler).
    "/webhooks/whatsapp",
    // Branded access-denied page must be reachable without a session so the
    // post-sign-out redirect from the allowlist hook below lands cleanly.
    "/access-denied",
    // P1c additions — public marketing-site integrations (lead-capture forms + schedule widget).
    // These paths are CORS-open and require no staff session.
    // IMPORTANT: Only these 4 specific prefixes are public — do NOT widen
    // /_agent-native/* or /api/* beyond what is listed here.
    "/f", // public SSR form pages (GET /f/:slug)
    "/api/forms/public", // public form metadata GET (used by embed.js)
    "/api/submit", // public form POST — anonymous lead upsert only
    "/embed", // /embed/schedule (P1c-05) and /embed.js (P1c-06)
  ],
});

// Pilot single-tenant ACL — gate `/gymos` (and everything else under it) by
// an env-var email allowlist so only the customer's nominated Google accounts
// can reach the inbox. Replaced by org-based ACL in P1a (AUTH-02).
//
// CUSTOMER_ALLOWED_EMAILS — comma-separated emails (case-insensitive). When
// empty or unset the allowlist is bypassed (dev fallback: any authenticated
// Google account can sign in). This lives behind the framework auth guard so
// `session` is already established by the time this handler runs.
function parseAllowedEmails(): string[] {
  return (process.env.CUSTOMER_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const allowlistHandler = defineEventHandler(async (event) => {
  const url = event.node?.req?.url ?? event.path ?? "/";
  const queryStart = url.indexOf("?");
  const pathname = queryStart >= 0 ? url.slice(0, queryStart) : url;

  // Never gate framework auth/OAuth routes, public app routes, or static
  // assets. The framework guard (createAuthPlugin) already skips these, but
  // the allowlist hook runs as a separate middleware so it must repeat the
  // skip list — otherwise a redirect to /access-denied could intercept the
  // OAuth callback flow and pin the user in a sign-in loop (Pitfall 4 from
  // P1b.1-RESEARCH).
  //
  // Note: the framework's better-auth + Google OAuth routes live under
  // /_agent-native/auth/* and /_agent-native/google/* (not /_better_auth/* as
  // the plan referenced — verified by reading node_modules/@agent-native/
  // core/dist/server/auth.js). Skipping the whole /_agent-native/* and /_*
  // prefixes covers every framework route safely.
  if (
    pathname.startsWith("/_agent-native/auth/") ||
    pathname.startsWith("/_agent-native/google/") ||
    pathname.startsWith("/_better_auth") ||
    pathname.startsWith("/_") ||
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname.startsWith("/api/m") ||
    pathname.startsWith("/pick-member") ||
    pathname.startsWith("/webhooks/") ||
    pathname.startsWith("/access-denied") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname === "/__manifest" ||
    pathname.includes(".") ||
    // P1c additions — public marketing-site integration paths (must mirror publicPaths above).
    // These are anonymous surfaces that must not be intercepted by the email allowlist.
    pathname.startsWith("/f/") ||
    pathname.startsWith("/api/forms/public") ||
    pathname.startsWith("/api/submit") ||
    pathname.startsWith("/embed")
  ) {
    return;
  }

  const allowed = parseAllowedEmails();
  // Dev fallback: empty/unset allowlist = everyone authenticated passes.
  if (allowed.length === 0) return;

  const session = await getSession(event);
  if (!session) return; // unauthenticated — framework auth guard handles sign-in redirect

  const email = (session as { user?: { email?: string } })?.user?.email;
  if (!email) return;

  if (!allowed.includes(email.toLowerCase())) {
    // Force a 302 to the branded denial page. We do NOT call sign-out from
    // inside this middleware — the /access-denied page CTA re-triggers
    // sign-in on a different account. Signing out here risks the OAuth-loop
    // trap from P1b.1-RESEARCH Pitfall 4.
    return sendRedirect(event, "/access-denied", 302);
  }
});

// Compose: run the framework auth plugin first (mounts auth routes + guard),
// then attach the allowlist handler so it runs AFTER the session cookie has
// been set by Better-auth / Google OAuth.
export default async function staffWebAuthPlugin(nitroApp: unknown) {
  await authPlugin(nitroApp as never);
  const app = getH3App(nitroApp as never);
  app.use(allowlistHandler);
}
