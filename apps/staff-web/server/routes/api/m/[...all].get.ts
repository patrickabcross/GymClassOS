// Catch-all GET handler for /api/m/* routes.
//
// Why this file exists: Vercel treats .vercel/output/functions/api/ as a
// "function directory" — any /api/* path that doesn't match a physical function
// in that directory is 404'd by Vercel's edge router BEFORE the Nitro catch-all
// route (?page -> /[...page]) fires. Since /api/m/* routes are React Router
// resource routes (not Nitro server routes), they were never registered as
// physical Vercel functions → direct GET /api/m/profile returned Vercel-404.
//
// Fix: this Nitro server route registers /api/m/[...all] as a physical Vercel
// function entry point. Nitro builds it as functions/api/m.func. Vercel routes
// GET /api/m/* requests here; this handler delegates to the React Router SSR
// handler (createH3SSRHandler) which then calls the actual api.m.*.tsx loader.
//
// POST requests are handled by apps/staff-web/server/routes/api/m/[...all].post.ts
// (same pattern).
import { createH3SSRHandler } from "@agent-native/core/server/ssr-handler";

export default createH3SSRHandler(
  () => import("virtual:react-router/server-build"),
);
