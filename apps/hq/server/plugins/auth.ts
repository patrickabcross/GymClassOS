/**
 * apps/hq/server/plugins/auth.ts
 *
 * HQ Better-auth plugin — single super-admin gate (D-05, D-06).
 *
 * ISOLATION: HQ has its own Better-auth instance backed by its own Neon project
 * (separate DATABASE_URL, separate BETTER_AUTH_SECRET). A studio staff credential
 * (issued by a studio's Better-auth instance) CANNOT authenticate to HQ because:
 *   1. Each studio's Better-auth uses a different secret and a different Neon project.
 *   2. Session cookies are signed with the secret — a studio cookie cannot be
 *      verified by HQ's Better-auth instance.
 *   3. This allowlist adds an additional gate: even if an email is known to HQ's
 *      Better-auth, it is blocked unless it exactly matches HQ_SUPER_ADMIN_EMAIL.
 *
 * INTENTIONAL DIVERGENCE FROM STAFF-WEB: staff-web allows all authenticated
 * users when CUSTOMER_ALLOWED_EMAILS is unset (dev fallback). HQ DENIES ALL
 * when HQ_SUPER_ADMIN_EMAIL is unset — a missing operator email must not silently
 * open the operator control plane. This is the right policy for a control plane.
 *
 * HQ-FND-01: single super-admin sign-in with deployment-level isolation.
 * HQ-FUT-01: multi-user/roles are deferred — do NOT add them here.
 */
import {
  createAuthPlugin,
  getH3App,
  getSession,
} from "@agent-native/core/server";
import { defineEventHandler, sendRedirect } from "h3";

// ---------------------------------------------------------------------------
// Single-super-admin allowlist helpers.
//
// Live in auth-helpers.ts (no @agent-native/core deps) so they can be
// unit-tested without a dev server (no-local-dev-server constraint).
// Re-exported here so callers can import from a single auth plugin entry point.
// ---------------------------------------------------------------------------
import {
  parseSuperAdminEmail as _parseSuperAdminEmail,
  isSuperAdmin as _isSuperAdmin,
} from "./auth-helpers.js";
export { _parseSuperAdminEmail as parseSuperAdminEmail, _isSuperAdmin as isSuperAdmin };

// ---------------------------------------------------------------------------
// HQ Better-auth plugin
// ---------------------------------------------------------------------------

// No googleOnly — HQ uses email/password (+ magic link if configured via env).
// Google OAuth is deferred (D-05). Operators don't need Google for a control plane.
const authPlugin = createAuthPlugin({
  marketing: {
    appName: "GymClassOS HQ",
    tagline: "Operator control plane for the GymClassOS platform.",
    description:
      "Sign in as the operator to provision studios, monitor platform health, and manage the HQ Brain/Dispatcher.",
    features: [
      "Provision and manage studio workspaces",
      "Platform health cohorts and customer analytics (BD3)",
      "HQ Dispatcher for owner-level communications (BD3)",
    ],
  },
  // HQ has minimal public paths — the access-denied page must be reachable so
  // the post-allowlist redirect doesn't loop the user into a sign-in wall.
  publicPaths: ["/access-denied"],
});

// ---------------------------------------------------------------------------
// Single-super-admin allowlist handler (runs AFTER the framework auth guard
// so the session cookie is already set by the time this middleware runs).
// ---------------------------------------------------------------------------
const allowlistHandler = defineEventHandler(async (event) => {
  const url = event.node?.req?.url ?? event.path ?? "/";
  const queryStart = url.indexOf("?");
  const pathname = queryStart >= 0 ? url.slice(0, queryStart) : url;

  // Skip framework auth/OAuth routes, the access-denied page, and static
  // assets. The framework guard already handles unauthenticated redirects;
  // this allowlist only needs to filter already-authenticated sessions.
  // Skipping the full /_* prefix covers all Better-auth routes safely.
  if (
    pathname.startsWith("/_") ||
    pathname.startsWith("/access-denied") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/assets/") ||
    pathname === "/__manifest" ||
    pathname.includes(".")
  ) {
    return;
  }

  const session = await getSession(event);
  if (!session) return; // unauthenticated — framework auth guard handles sign-in redirect

  const email = session.email;
  if (!email) return;

  if (!_isSuperAdmin(email)) {
    // Redirect to the access-denied page. We do NOT sign out here — the
    // /access-denied page can prompt the user to try a different account.
    // Signing out inside this middleware risks an OAuth-loop trap (Pitfall 4,
    // P1b.1-RESEARCH: sign-out before cookie is cleared causes infinite redirect).
    return sendRedirect(event, "/access-denied", 302);
  }
});

// ---------------------------------------------------------------------------
// Compose: run the framework auth plugin first (mounts auth routes + guard),
// then attach the allowlist handler so it runs AFTER the session cookie has
// been set by Better-auth.
// ---------------------------------------------------------------------------
export default async function hqAuthPlugin(nitroApp: unknown) {
  await authPlugin(nitroApp as never);
  const app = getH3App(nitroApp as never);
  app.use(allowlistHandler);
}
