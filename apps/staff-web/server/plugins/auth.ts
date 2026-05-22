import { createAuthPlugin } from "@agent-native/core/server";

// Google sign-in gates all staff surfaces (/gymos*). Scopes intentionally
// narrowed to just identity — GymClassOS does not read Gmail/Calendar/
// Contacts on the staff side. Re-add scopes only when a feature needs them
// so the OAuth consent screen stays minimal.
export default createAuthPlugin({
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
    // Demo: /gymos* surfaces are public so the deployed URL can be shared
    // without a sign-in. Better-auth's Google adapter init triggers a
    // class-extends ESM bundling bug under Nitro presets (vercel + netlify
    // both reproduce); making routes public lets visitors browse the demo
    // without exercising that code path. Re-gate behind sign-in once the
    // upstream bundling bug is resolved.
    //
    // "/" exact-matches the root so the _index.tsx redirect (/ → /gymos)
    // fires without the sign-in page intercepting first.
    "/",
    "/gymos",
    "/gymos/schedule",
    "/gymos/members",
    "/gymos/payments",
    // Mobile-app server routes — each gates itself via requireDemoMember
    // (DEMO_MODE + X-Demo-Member-Id). Prefix match covers
    // /api/m/members/list, /api/m/profile, /api/m/schedule, /api/m/bookings,
    // /api/m/food-entries, /api/m/foods/*, /api/m/agent, etc.
    "/api/m",
    "/pick-member",
    // WhatsApp webhook receiver (HMAC-verified inside the handler).
    "/webhooks/whatsapp",
  ],
});
