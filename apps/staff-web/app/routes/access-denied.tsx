import { IconLock } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

// Branded denial page for sign-ins where the Google account is not in
// CUSTOMER_ALLOWED_EMAILS. Reached via 302 from the allowlist hook in
// server/plugins/auth.ts (Pilot single-tenant ACL — replaced by org-based
// ACL in P1a/AUTH-02).
//
// This page is in publicPaths so an unauthenticated visitor can see it after
// the redirect — that is also why we do the sign-out from inside the CTA
// handler instead of from inside the allowlist middleware (P1b.1-RESEARCH
// Pitfall 4: signing out inside the gate risks an OAuth loop).
//
// Sign-out endpoint: /_agent-native/auth/logout (verified by reading
// node_modules/@agent-native/core/dist/server/auth.js — the framework mounts
// Better-auth's catch-all at /_agent-native/auth/ba/* and a back-compat
// POST /_agent-native/auth/logout that wraps auth.api.signOut).
//
// Sign-in entrypoint: /_agent-native/google/auth-url?redirect=1 — the
// framework's standard Google OAuth start endpoint that builds the consent
// URL and 302s the browser to Google.

export function meta() {
  return [
    { title: "Access not permitted — GymClassOS" },
    { name: "robots", content: "noindex" },
  ];
}

export default function AccessDenied() {
  const handleSignInDifferent = async () => {
    // Tear down the current Better-auth session, then start a fresh Google
    // sign-in. `.catch(() => {})` is intentional — if sign-out fails (e.g.
    // session already gone), still kick the user back into the sign-in flow.
    try {
      await fetch("/_agent-native/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Swallow — proceed to sign-in regardless.
    }
    window.location.href = "/_agent-native/google/auth-url?redirect=1";
  };

  return (
    <main
      role="main"
      className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-6"
    >
      <div className="text-sm font-semibold text-foreground">GymClassOS</div>
      <IconLock size={40} className="text-muted-foreground" aria-hidden />
      <h1 className="text-sm font-semibold text-foreground">
        Access not permitted
      </h1>
      <p className="max-w-[320px] text-center text-[13px] leading-[1.5] text-muted-foreground">
        Your account isn't on the approved list for this studio. Contact your
        studio admin to get access.
      </p>
      <Button variant="outline" onClick={handleSignInDifferent}>
        Sign in with a different account
      </Button>
    </main>
  );
}
