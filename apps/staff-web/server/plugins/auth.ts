import { createAuthPlugin } from "@agent-native/core/server";

// Mail requires a Google connection to read/send emails, so the onboarding
// page only offers "Sign in with Google" — no email/password account
// creation, since that path can't be used to access mail.
//
// Gmail/Calendar/Contacts scopes are requested up front during the
// primary "Sign in with Google" flow. Tokens land in the framework's
// `oauth_tokens` table automatically (via a Better Auth account hook)
// so the existing `templates/mail/server/lib/google-auth.ts` client
// works on first sign-in — no separate "Connect Google" page needed.
// The template-specific routes under `/_agent-native/google/*` remain
// available for "add another account" flows.
export default createAuthPlugin({
  googleOnly: true,
  mountGoogleOAuthRoutes: false,
  googleScopes: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts.other.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  marketing: {
    appName: "Agent-Native Mail",
    tagline: "Your AI agent reads, drafts, and organizes email alongside you.",
    features: [
      "Replies that match your tone and style",
      "Multi-account Gmail in a single unified inbox",
      "Autonomous triage, archiving, and follow-ups",
    ],
    runLocalCommand:
      "npx @agent-native/core create my-mail-app --template mail",
  },
  googleSignInNotice: {
    host: "mail.agent-native.com",
    title: "Hosted Mail may show Google warnings",
    body: [
      "This demo uses Agent-Native's shared Google OAuth client. Because Mail asks for Gmail access, Google may show extra consent or warning screens before continuing.",
      "Self-hosting Mail with your own Google OAuth client avoids this hosted-demo warning. Use Run Locally on the left to start that path.",
    ],
    continueLabel: "Continue to Google",
    cancelLabel: "Not now",
  },
  // Gmail Pub/Sub push notifications POST here from Google's servers — no
  // user session. The handler itself verifies the OIDC token when
  // GMAIL_PUSH_AUDIENCE is configured.
  // Cloud Scheduler POSTs to /api/gmail/watch/renew every 6h for watch
  // lifecycle; same OIDC-verification pattern.
  publicPaths: [
    "/api/gmail/push",
    "/api/gmail/watch/renew",
    // GymClassOS Demo Sprint — bypass auth on demo routes so we can show the inbox
    // without a Google sign-in. Production v1 wires Better-auth with magic-link
    // (member side) + admin/coach roles (staff side).
    //
    // "/" exact-matches the root so the _index.tsx redirect (/ → /gymos)
    // fires without the upstream Mail Google-sign-in page intercepting first.
    // matchesPathList() in @agent-native/core/server treats "/" as exact-only
    // (it won't prefix-match every path) so this is safe.
    "/",
    "/gymos",
    "/gymos/schedule",
    "/gymos/members",
    "/gymos/payments",
    // D2-01: mobile-app server routes. /api/m is a prefix match covering
    // /api/m/members/list, /api/m/profile, /api/m/schedule, /api/m/bookings,
    // /api/m/food-entries, /api/m/foods/*, /api/m/agent, etc. Each route
    // gates itself via requireDemoMember (DEMO_MODE + X-Demo-Member-Id).
    "/api/m",
    "/pick-member",
    // D2-02: WhatsApp webhook receiver (HMAC-verified inside the handler).
    "/webhooks/whatsapp",
  ],
});
