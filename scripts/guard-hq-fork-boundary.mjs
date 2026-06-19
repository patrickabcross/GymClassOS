#!/usr/bin/env node
/**
 * guard-hq-fork-boundary.mjs
 *
 * CI guard: apps/hq must NEVER import from templates/ in place.
 *
 * Rule (D-14 in BD1-CONTEXT.md):
 *   apps/hq must consume framework code exclusively via @agent-native/* and
 *   @gymos/* workspace packages. It is a copied-out fork of the Dispatch +
 *   Brain templates (per D-01/D-04 — every copied file recorded in
 *   apps/hq/MODIFICATIONS.md). After the copy-out, templates/ is never touched
 *   again as part of HQ work. Therefore:
 *
 *   - Any import whose specifier resolves INTO templates/ is a fork-boundary
 *     violation. apps/hq must use the package name, not a relative path that
 *     punches through into templates/.
 *   - This guard scans apps/hq/ source files only. It is a pure file scan
 *     for determinism and Windows safety (no shell-out to git).
 *
 * "templates/ byte-unchanged" integrity check:
 *   The guarantee that templates/ source files are unmodified is enforced by
 *   the BD1-01 verification step (git diff HEAD templates/ in CI), not by
 *   this guard. This guard catches the import-path violation ONLY.
 *
 * Opt-out (last resort — requires reviewer approval):
 *
 *   import something from "../../templates/foo"; // guard:allow-hq-template-import — reason
 *
 *   The marker may be on the SAME LINE as the import or on the LINE IMMEDIATELY
 *   ABOVE it (which must be a comment line). A reason phrase after the em-dash
 *   (—) or hyphen (-) is REQUIRED; the guard will reject opt-outs without one.
 *
 * Wired into: package.json "guard:hq-fork-boundary" + "guards" chain (D-15).
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  ".turbo",
  ".netlify",
  ".vercel",
  ".wrangler",
  ".react-router",
  ".generated",
  "coverage",
]);

// Marker that opts a specific import out of this guard.
// A reason phrase (after — or -) is required.
const OPT_OUT_MARKER = /\/\/\s*guard:allow-hq-template-import\b[^\n]*/;
const OPT_OUT_WITH_REASON =
  /\/\/\s*guard:allow-hq-template-import\s*[—-]\s*\S/;

// Detect ES import specifiers, CommonJS require(), and dynamic import()
// that contain a "templates/" path segment.
//
// We match:
//   from "../../templates/..."
//   from '../templates/...'
//   require("../templates/...")
//   import("../../templates/...")
//
// The regex captures the quote-delimited specifier string. We then check
// whether the captured value contains the path segment "templates/".
const IMPORT_SPECIFIER_RE =
  /(?:from\s*|require\s*\(|import\s*\()(['"`])((?:[^'"`\\]|\\[\s\S])*)\1/g;

/**
 * Async generator: recursively yield every file under `dir`, skipping
 * SKIP_DIRS. Windows-safe: uses node:fs/promises readdir with withFileTypes.
 */
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * Convert a byte offset in `contents` to { line, col } (1-based).
 */
function lineColForOffset(contents, offset) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (contents.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, col: offset - lineStart + 1 };
}

/**
 * Return true if the line at `lineIdx` (0-based) has an opt-out marker,
 * or if the line immediately above it is a comment containing the marker.
 */
function hasOptOutOnLine(lines, lineIdx) {
  const cur = lines[lineIdx] ?? "";
  if (OPT_OUT_MARKER.test(cur)) return true;
  const prev = lines[lineIdx - 1] ?? "";
  if (/^\s*\/\//.test(prev) && OPT_OUT_MARKER.test(prev)) return true;
  return false;
}

/**
 * Return true if the opt-out marker has a required reason phrase.
 */
function optOutHasReason(lines, lineIdx) {
  const cur = lines[lineIdx] ?? "";
  if (OPT_OUT_WITH_REASON.test(cur)) return true;
  const prev = lines[lineIdx - 1] ?? "";
  if (OPT_OUT_WITH_REASON.test(prev)) return true;
  return false;
}

async function scan() {
  const violations = [];

  for await (const file of walk(REPO_ROOT)) {
    // Only scan TypeScript / JavaScript source files (not .d.ts).
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) continue;
    if (file.endsWith(".d.ts")) continue;

    // Normalize to forward-slash relative path (Windows-safe).
    const rel = path.relative(REPO_ROOT, file).replaceAll("\\", "/");

    // This guard only covers apps/hq/ source files.
    if (!rel.startsWith("apps/hq/")) continue;

    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    // Cheap pre-filter: skip files that don't mention "templates".
    if (!contents.includes("templates")) continue;

    const lines = contents.split("\n");
    IMPORT_SPECIFIER_RE.lastIndex = 0;
    let m;

    while ((m = IMPORT_SPECIFIER_RE.exec(contents)) !== null) {
      const specifier = m[2];

      // Check if the specifier references a templates/ path segment.
      // We normalize backslashes and check for the segment.
      const normalizedSpec = specifier.replaceAll("\\", "/");
      if (!normalizedSpec.includes("templates/")) continue;

      const { line } = lineColForOffset(contents, m.index);
      const lineIdx = line - 1;

      // Skip comment lines (// or * or /*).
      const lineText = lines[lineIdx] ?? "";
      const trimmed = lineText.trimStart();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      ) {
        continue;
      }

      // Check for opt-out.
      if (hasOptOutOnLine(lines, lineIdx)) {
        if (optOutHasReason(lines, lineIdx)) continue;
        // Opt-out exists but is missing a reason — treat as violation.
        violations.push({
          file: rel,
          line,
          specifier,
          reason: "opt-out marker is missing a required reason phrase",
          snippet: lineText.trim(),
        });
        continue;
      }

      violations.push({
        file: rel,
        line,
        specifier,
        reason: "import/require into templates/ — fork boundary violation",
        snippet: lineText.trim(),
      });
    }
  }

  return violations;
}

const violations = await scan();

if (violations.length > 0) {
  const bar = "=".repeat(72);
  console.error(`\n${bar}`);
  console.error("ERROR: apps/hq import(s) reach into templates/ in place.");
  console.error(bar);
  console.error("");
  console.error(
    "apps/hq is a copied-out fork of the Dispatch + Brain templates.",
  );
  console.error(
    "After the copy-out, templates/ must never be imported by apps/hq.",
  );
  console.error("");
  console.error("Fork-boundary discipline (D-01 / D-04 / HQ-FND-06):");
  console.error(
    "  - apps/hq consumes framework code via @agent-native/* workspace packages.",
  );
  console.error("  - apps/hq consumes GymClassOS packages via @gymos/* workspace packages.");
  console.error(
    "  - Every copied file's origin is recorded in apps/hq/MODIFICATIONS.md.",
  );
  console.error(
    "  - templates/ source is never imported directly from apps/hq.",
  );
  console.error("");
  console.error("Violations:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.reason}`);
    console.error(`    specifier: "${v.specifier}"`);
    if (v.snippet) console.error(`    ${v.snippet}`);
  }
  console.error("");
  console.error(bar);
  console.error("Fix:");
  console.error("");
  console.error(
    "  - If you need code from templates/, COPY the file into apps/hq/",
  );
  console.error("    and record the origin in apps/hq/MODIFICATIONS.md.");
  console.error("  - Then import from the local copy, NOT from templates/.");
  console.error("");
  console.error("  Last-resort opt-out (requires reviewer approval):");
  console.error(
    "    import x from '../../templates/...'; // guard:allow-hq-template-import — explain why",
  );
  console.error(`${bar}\n`);
  process.exit(1);
}

console.log(
  "guard-hq-fork-boundary: clean (no apps/hq imports reach into templates/).",
);
