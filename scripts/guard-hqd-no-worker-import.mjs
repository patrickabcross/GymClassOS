#!/usr/bin/env node
/**
 * guard-hqd-no-worker-import.mjs
 *
 * CI guard: apps/hq/ and services/hq-worker/ must NEVER import from
 * services/worker/ or services/edge-webhooks/.
 *
 * Rule (D-07 in BD3-CONTEXT.md):
 *   HQD mirrors the studio chokepoint gate logic — it does NOT share
 *   implementation with services/worker. The HQ send path (HQ WABA → gym owners)
 *   must be structurally separate from the studio send path (studio WABA →
 *   gym members). Using a studio WABA for B2B owner comms is a Meta compliance
 *   violation (PITFALL #2 — B2B sends from a member WABA).
 *
 *   Any import whose specifier resolves into services/worker/ or
 *   services/edge-webhooks/ from within apps/hq/ or services/hq-worker/ is
 *   a WABA-separation boundary violation.
 *
 * Patterns detected:
 *   from "../../services/worker/..."       → FAIL
 *   from "../services/worker/..."          → FAIL
 *   from "services/worker/..."            → FAIL
 *   require("../../services/edge-webhooks/...") → FAIL
 *   (same patterns for services/edge-webhooks)
 *
 * Comment lines (// and *) are skipped.
 * The guard script itself is excluded from scanning.
 *
 * Wired into: package.json "guard:hqd-no-worker-import" + "guards" chain.
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

// Patterns that indicate a cross-boundary import into services/worker or
// services/edge-webhooks. We match path segments (not exact file names)
// so relative paths like ../../services/worker/ are caught regardless of
// nesting depth.
const FORBIDDEN_SEGMENTS = ["services/worker", "services/edge-webhooks"];

// Detect ES import specifiers, CommonJS require(), and dynamic import()
const IMPORT_SPECIFIER_RE =
  /(?:from\s*|require\s*\(|import\s*\()(['"`])((?:[^'"`\\]|\\[\s\S])*)\1/g;

/**
 * Async generator: recursively yield every file under `dir`, skipping SKIP_DIRS.
 * Windows-safe: uses node:fs/promises readdir with withFileTypes.
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

async function scan() {
  const violations = [];

  for await (const file of walk(REPO_ROOT)) {
    // Only scan TypeScript / JavaScript source files (not .d.ts).
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) continue;
    if (file.endsWith(".d.ts")) continue;

    // Normalize to forward-slash relative path (Windows-safe).
    const rel = path.relative(REPO_ROOT, file).replaceAll("\\", "/");

    // This guard covers apps/hq/ and services/hq-worker/ only.
    if (!rel.startsWith("apps/hq/") && !rel.startsWith("services/hq-worker/"))
      continue;

    // Skip this guard script itself.
    if (rel === "scripts/guard-hqd-no-worker-import.mjs") continue;

    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    // Cheap pre-filter: skip files that don't mention either forbidden segment.
    const hasForbidden = FORBIDDEN_SEGMENTS.some((seg) =>
      contents.includes(seg),
    );
    if (!hasForbidden) continue;

    const lines = contents.split("\n");
    IMPORT_SPECIFIER_RE.lastIndex = 0;
    let m;

    while ((m = IMPORT_SPECIFIER_RE.exec(contents)) !== null) {
      const specifier = m[2];
      const normalizedSpec = specifier.replaceAll("\\", "/");

      // Check if the specifier references a forbidden path segment.
      const forbidden = FORBIDDEN_SEGMENTS.find((seg) =>
        normalizedSpec.includes(seg),
      );
      if (!forbidden) continue;

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

      violations.push({
        file: rel,
        line,
        specifier,
        forbidden,
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
  console.error(
    "ERROR: HQ code imports from the studio worker/edge boundary.",
  );
  console.error(bar);
  console.error("");
  console.error(
    "apps/hq/ and services/hq-worker/ must NEVER import from",
  );
  console.error(
    "services/worker/ or services/edge-webhooks/ (D-07 / BD3-CONTEXT.md).",
  );
  console.error("");
  console.error("Why this rule exists:");
  console.error(
    "  HQD uses HQ's own WhatsApp Business Account (WABA) to message gym",
  );
  console.error(
    "  owners about product/system topics. The studio worker uses each studio's",
  );
  console.error(
    "  WABA to message gym members. These are structurally separate send paths.",
  );
  console.error(
    "  Using a studio WABA for B2B owner comms is a Meta compliance violation.",
  );
  console.error(
    "  The HQ gate functions (ownerOptInGate, ownerWindowGate, ownerTemplateGate)",
  );
  console.error(
    "  are MIRRORS of the studio gates — same logic, HQ-owned tables, no import.",
  );
  console.error("");
  console.error("Violations:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — imports from "${v.forbidden}"`);
    console.error(`    specifier: "${v.specifier}"`);
    if (v.snippet) console.error(`    ${v.snippet}`);
  }
  console.error("");
  console.error(bar);
  console.error("Fix:");
  console.error("");
  console.error(
    "  - Copy the required gate logic into services/hq-worker/src/lib/gates/",
  );
  console.error(
    "    (or apps/hq/server/domain/gates/) and adapt to HQ tables.",
  );
  console.error("  - Do NOT import the studio implementation.");
  console.error(`${bar}\n`);
  process.exit(1);
}

console.log(
  "guard-hqd-no-worker-import: clean (no HQ code imports from services/worker or services/edge-webhooks).",
);
