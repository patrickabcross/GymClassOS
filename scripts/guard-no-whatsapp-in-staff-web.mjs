#!/usr/bin/env node
/**
 * D-11 guard: apps/staff-web/ must NEVER import @gymos/whatsapp.
 * Worker is the only legal caller (24h-window + opt-in gates live there).
 *
 * Enforces two layers:
 *  1. package.json: no @gymos/whatsapp in dependencies / devDependencies
 *  2. source scan: no `from "@gymos/whatsapp"` or require("@gymos/whatsapp")
 *     anywhere under apps/staff-web/
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STAFF_WEB_DIR = join(ROOT, "apps", "staff-web");
const PKG_PATH = join(STAFF_WEB_DIR, "package.json");

// 1. package.json check
const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
if (deps["@gymos/whatsapp"]) {
  console.error(
    "[guard] apps/staff-web/package.json must NOT depend on @gymos/whatsapp (P1b D-11).",
  );
  process.exit(1);
}

// 2. Source scan — walk apps/staff-web/ recursively
const SKIP_DIRS = new Set([
  "node_modules",
  ".react-router",
  "dist",
  "build",
  ".vercel",
  ".netlify",
  ".cache",
  ".turbo",
]);
const SOURCE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const IMPORT_RE =
  /from\s+['"]@gymos\/whatsapp['"]|require\(\s*['"]@gymos\/whatsapp['"]\s*\)/;

const offenders = [];
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const dot = name.lastIndexOf(".");
    if (dot < 0) continue;
    const ext = name.slice(dot);
    if (!SOURCE_EXTS.has(ext)) continue;
    const text = readFileSync(full, "utf8");
    const m = text.match(IMPORT_RE);
    if (m) {
      offenders.push({ file: relative(ROOT, full), snippet: m[0] });
    }
  }
}
walk(STAFF_WEB_DIR);

if (offenders.length > 0) {
  console.error(
    "[guard] Source import of @gymos/whatsapp found in apps/staff-web/:",
  );
  for (const o of offenders) {
    console.error(`  ${o.file}: ${o.snippet}`);
  }
  process.exit(1);
}

console.log("[guard] OK: apps/staff-web does not import @gymos/whatsapp");
