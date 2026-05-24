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
