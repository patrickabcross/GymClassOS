#!/usr/bin/env node
/**
 * guard-no-hardcoded-colors.mjs
 *
 * DSGN-01 enforcement: no hardcoded hex colors or Tailwind arbitrary-color
 * values in apps/staff-web/{app,server,features} source files outside
 * apps/staff-web/app/skins/ (skin files contain intentional overrides).
 *
 * Exemptions:
 *   1. WHOLE-FILE SENTINEL: if the file text contains `// guard:allow-color-file`
 *      or `/* guard:allow-color-file`, the entire file is skipped.
 *   2. PER-LINE MARKER: if a line contains `// guard:allow-color` or
 *      `/* guard:allow-color`, that specific line is skipped.
 *      (Note: the sentinel string contains the marker as a prefix — the whole-file
 *      check short-circuits before per-line scanning, so this is fine.)
 *   3. EXEMPT PATHS: any file under apps/staff-web/app/skins/ is skipped entirely.
 *
 * Regexes:
 *   Hex literals:   /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/
 *   TW arbitrary:   /(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|caret|accent)-\[#[0-9a-fA-F]{3,8}\]/
 *
 * NOT flagged: rgb(), rgba(), hsl(), named colors — the token system uses hsl(var(...)).
 *
 * Wiring: pnpm guard:no-hardcoded-colors (appended to the "guards" chain, which
 * is run by "prep" via concurrently). Also added as a job in .github/workflows/ci.yml.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Directories to skip entirely when walking. */
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

/** Only scan these file extensions. */
const SOURCE_EXTS = new Set([".ts", ".tsx", ".css"]);

/** Scan roots: apps/staff-web/{app,server,features} */
const SCAN_ROOTS = [
  join(ROOT, "apps", "staff-web", "app"),
  join(ROOT, "apps", "staff-web", "server"),
  join(ROOT, "apps", "staff-web", "features"),
];

/** Exempt path prefix — skins directory contains intentional brand overrides. */
const SKINS_PREFIX = join(ROOT, "apps", "staff-web", "app", "skins");

/**
 * Hex literal regex.
 * Matches 3, 4, 6, or 8 hex-character sequences preceded by #.
 * \b after the hex ensures we don't partially match longer hex strings.
 */
const HEX_RE =
  /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/;

/**
 * Tailwind arbitrary-color regex.
 * Matches utility classes like bg-[#fff], text-[#3b82f6], border-[#abc123], etc.
 */
const TW_ARBITRARY_RE =
  /(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|caret|accent)-\[#[0-9a-fA-F]{3,8}\]/;

/** Per-line exemption marker — any of these strings on the line skip it. */
const LINE_MARKER = "guard:allow-color";

/** Whole-file sentinel — if present anywhere in the file, skip the whole file. */
const FILE_SENTINEL = "guard:allow-color-file";

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

    // Exempt skins directory
    if (full.startsWith(SKINS_PREFIX)) continue;

    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }

    // Whole-file sentinel check — skip the entire file if present
    if (text.includes(FILE_SENTINEL)) continue;

    // Per-line scan
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Per-line marker exemption
      if (line.includes(LINE_MARKER)) continue;

      // Check for hex literal or Tailwind arbitrary-color
      if (HEX_RE.test(line) || TW_ARBITRARY_RE.test(line)) {
        offenders.push({
          file: relative(ROOT, full),
          line: i + 1,
          snippet: line.trim(),
        });
      }
    }
  }
}

for (const root of SCAN_ROOTS) {
  walk(root);
}

if (offenders.length > 0) {
  console.error(
    "[guard] Hardcoded hex or Tailwind arbitrary-color found in apps/staff-web (outside skins/):",
  );
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  ${o.snippet}`);
  }
  console.error(
    "\nFix: convert to a CSS custom-property token, or add `// guard:allow-color — <reason>` on the line,",
  );
  console.error(
    "or add `// guard:allow-color-file — <reason>` near the top of the file (for dense walls of technical hex).",
  );
  console.error(
    "Skin files in apps/staff-web/app/skins/ are unconditionally exempt.",
  );
  process.exit(1);
}

console.log(
  "[guard] OK: no hardcoded colors in apps/staff-web (outside skins/)",
);
