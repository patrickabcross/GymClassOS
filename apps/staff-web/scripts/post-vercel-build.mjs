// Postbuild fix-up for the Vercel preset.
//
// Why this exists: pg and pg-boss are marked external in apps/staff-web/
// vite.config.ts because their CJS class hierarchies (Pool extends Client)
// don't survive Vite's SSR bundling — they crash at module load with
// `TypeError: Class extends value #<Object> is not a constructor or null`.
//
// With them external, the bundle emits `import { PgBoss } from "pg-boss"`
// at runtime. Nitro's NFT (Node File Trace) tracer doesn't follow external
// imports through pnpm's isolated symlink layout, so pg/pg-boss don't land
// in the generated traced-node-modules package.json. Result on Vercel:
// `Cannot find package 'pg-boss'` at first request.
//
// This script adds pg + pg-boss to the traced package.json after the build
// completes so Vercel installs them into the function bundle.
//
// Skipped unless NITRO_PRESET=vercel — for other targets (node, fly, etc.)
// the traced bundle layout differs or doesn't apply.

import fs from "node:fs";
import path from "node:path";

if (process.env.NITRO_PRESET !== "vercel") {
  console.log(
    "[postbuild] Skipped — NITRO_PRESET is not 'vercel' (got: " +
      (process.env.NITRO_PRESET ?? "unset") +
      ")",
  );
  process.exit(0);
}

const pkgPath = path.resolve(
  ".vercel/output/functions/__server.func/package.json",
);

if (!fs.existsSync(pkgPath)) {
  console.error("[postbuild] Expected " + pkgPath + " to exist; skipping.");
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
pkg.dependencies = pkg.dependencies ?? {};
pkg.dependencies["pg"] = "^8.13.0";
pkg.dependencies["pg-boss"] = "^12.18.0";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log(
  "[postbuild] Added pg + pg-boss to .vercel/output/functions/__server.func/package.json",
);

// ---------------------------------------------------------------------------
// Fix: Route /api/m/*, /api/submit/*, /api/forms/*, /webhooks/* to __server.
//
// Why: Vercel's file-based routing treats /api/* as a serverless function
// directory. Paths under /api/* that don't have a physical output function in
// .vercel/output/functions/api/ are 404'd by Vercel's edge router BEFORE the
// Nitro-generated catch-all route (`/?(?<page>.+) -> /[...page]`) fires.
//
// These paths are React Router resource routes served by the Nitro SSR handler.
// The Nitro server handles them, but Vercel never forwards the request to it.
//
// Fix: prepend explicit src→dest route entries for these paths in the Nitro-
// generated config.json, BEFORE the `handle: filesystem` entry, so Vercel
// routes them directly to the __server Lambda without filesystem lookup.
// ---------------------------------------------------------------------------
const configPath = path.resolve(".vercel/output/config.json");

if (!fs.existsSync(configPath)) {
  console.warn("[postbuild] .vercel/output/config.json not found; skipping route fix.");
} else {
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Paths that Vercel's /api directory routing would otherwise intercept.
  // Each entry routes matching requests directly to the Nitro __server Lambda,
  // which then routes them through the React Router SSR handler.
  const gymosMobileRoutes = [
    { src: "^/api/m(/.*)?$", dest: "/__server" },
    { src: "^/api/submit(/.*)?$", dest: "/__server" },
    { src: "^/api/forms(/.*)?$", dest: "/__server" },
    { src: "^/webhooks(/.*)?$", dest: "/__server" },
  ];

  // Insert before `handle: filesystem` so these routes fire first.
  const filesystemIdx = config.routes.findIndex((r) => r.handle === "filesystem");
  const insertAt = filesystemIdx >= 0 ? filesystemIdx : 0;
  config.routes.splice(insertAt, 0, ...gymosMobileRoutes);

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(
    "[postbuild] Prepended /api/m, /api/submit, /api/forms, /webhooks routes to .vercel/output/config.json",
  );
}
