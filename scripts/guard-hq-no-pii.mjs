#!/usr/bin/env node
/**
 * guard-hq-no-pii.mjs
 *
 * CI guard: HQ schema and config must never store PII-shaped columns
 * or a real studio Neon connection string.
 *
 * This enforces two invariants from HQ-FND-06 (D-14 / D-15 in BD1-CONTEXT.md):
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE A — COLUMN-NAME RULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Scan packages/hq-schema/** and apps/hq/server/db/** for Drizzle column
 * declarations whose name matches /connection|database_url|dsn/i.
 *
 * We detect two syntactic forms:
 *   (a) String-literal name inside a column helper:
 *         text("database_url")        → flagged
 *         integer("dsn_port")         → flagged
 *         text("studio_connection")   → flagged
 *   (b) JS property name before a column helper call:
 *         studioConnectionUrl: text(...) → flagged (property name matches)
 *
 * Why these three patterns?
 *   HQ stores provider RESOURCE IDs (Neon project IDs, Vercel project IDs),
 *   not connection strings. A column named *connection*, *database_url*, or
 *   *dsn* is almost certainly storing a credential or URL that must live only
 *   in the provider's own system. If HQ needs the connection string at
 *   runtime, it fetches it via the Neon/Vercel API at that time (BD2 PROV).
 *   See PITFALLS.md §T-03/T-04 + BD1-CONTEXT.md D-14.
 *
 * Comment lines are skipped so docstrings that explain the rule (like the
 * comment at the top of packages/hq-schema/src/schema.ts) don't self-trip.
 * Guard script files themselves are excluded from scanning.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE B — STUDIO CONN-STRING RULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Scan HQ env/config files for a committed postgres connection-string LITERAL
 * that is NOT an obvious placeholder.
 *
 * Scanned paths:
 *   - apps/hq/.env.example
 *   - services/hq-worker/.env.example
 *   - services/hq-worker/fly.toml
 *   - apps/hq/**\/fly.toml  (if one is ever added)
 *
 * The postgres URI regex is:
 *   /postgres(?:ql)?:\/\/[^@\s]+@[^/\s]+\/\S+/i
 *
 * A match is a PLACEHOLDER (safe) if ANY of these are true:
 *   - Contains <...>  (angle-bracket template, e.g. <hq-neon-host>)
 *   - Contains YOUR_ or your-  (e.g. YOUR_PASSWORD)
 *   - Contains "changeme" (case-insensitive)
 *   - Contains "example" (case-insensitive)
 *   - Contains "placeholder" (case-insensitive)
 *   - The credentials portion is literally "user:password" (example values)
 *   - The line itself starts with # (comment in .env / fly.toml)
 *
 * A REAL URI (violation) is any postgres:// URI that clears all the above
 * exclusions. False-positive risk: very low — a real Neon URL looks like
 * postgres://user:<token>@ep-xxx-yyy.us-east-2.aws.neon.tech/neondb
 * and contains none of the placeholder patterns.
 *
 * Heuristic rationale: we want to catch the case where a developer
 * accidentally commits their personal HQ Neon credentials or, worse, a
 * STUDIO Neon connection string. A studio conn string in HQ config is the
 * exact PII-up boundary violation. A real URI will never look like
 * "postgres://user:password@<host>/db".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPT-OUT (last resort — requires reviewer approval):
 *
 *   studioConnection: text("studio_connection"), // guard:allow-hq-pii — reason
 *
 *   The marker may be on the SAME LINE or the LINE IMMEDIATELY ABOVE (which
 *   must be a comment). A reason phrase after the em-dash (—) or hyphen (-)
 *   is REQUIRED.
 *
 * Wired into: package.json "guard:hq-no-pii" + "guards" chain (D-15).
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

// ─── Opt-out ──────────────────────────────────────────────────────────────────
const OPT_OUT_MARKER = /\/\/\s*guard:allow-hq-pii\b[^\n]*/;
const OPT_OUT_WITH_REASON = /\/\/\s*guard:allow-hq-pii\s*[—-]\s*\S/;

// ─── Rule A — PII column names ────────────────────────────────────────────────
// Matches column names (string literals or JS property names) that suggest
// storing a connection string or DSN.
const PII_COLUMN_NAME_RE = /connection|database_url|dsn/i;

// Drizzle column-helper patterns:
//   text("column_name", ...)  integer("dsn_port")  real("database_url")  etc.
// Captures the string literal inside the first argument.
const COLUMN_LITERAL_RE =
  /\b(?:text|integer|real|numeric|boolean|timestamp|serial|bigint|bigserial|varchar|char|uuid|json|jsonb|date|time|interval|decimal)\s*\(\s*(['"`])((?:[^'"`\\]|\\[\s\S])*)\1/g;

// JS property name preceding a column helper call:
//   studioConnectionUrl: text(...)
//   databaseUrl: integer(...)
const PROPERTY_NAME_RE =
  /\b([a-zA-Z_$][\w$]*)\s*:\s*(?:text|integer|real|numeric|boolean|timestamp|serial|bigint|bigserial|varchar|char|uuid|json|jsonb|date|time|interval|decimal)\s*\(/g;

// ─── Rule B — Postgres connection string ─────────────────────────────────────
// Matches any postgres:// or postgresql:// URI.
const POSTGRES_URI_RE = /postgres(?:ql)?:\/\/[^@\s]+@[^/\s]+\/\S+/gi;

// A URI is a placeholder (not a violation) if it matches any of these.
function isPlaceholderUri(uri, line) {
  // Line is a comment (env files use #, fly.toml uses #).
  if (/^\s*#/.test(line)) return true;
  // Angle-bracket templates: <something>
  if (/<[^>]+>/.test(uri)) return true;
  // Literal "user:password" credentials (the canonical example pair).
  if (/\/\/user:password@/.test(uri)) return true;
  // Uppercase placeholder tokens (YOUR_TOKEN, YOUR_PASSWORD, etc.).
  if (/YOUR_/i.test(uri)) return true;
  // Common placeholder words.
  if (/changeme|example|placeholder|your-/i.test(uri)) return true;
  return false;
}

// ─── Shared utilities ─────────────────────────────────────────────────────────
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

function hasOptOutOnLine(lines, lineIdx) {
  const cur = lines[lineIdx] ?? "";
  if (OPT_OUT_MARKER.test(cur)) return true;
  const prev = lines[lineIdx - 1] ?? "";
  if (/^\s*\/\//.test(prev) && OPT_OUT_MARKER.test(prev)) return true;
  return false;
}

function optOutHasReason(lines, lineIdx) {
  const cur = lines[lineIdx] ?? "";
  if (OPT_OUT_WITH_REASON.test(cur)) return true;
  const prev = lines[lineIdx - 1] ?? "";
  if (OPT_OUT_WITH_REASON.test(prev)) return true;
  return false;
}

// ─── Rule A scan ─────────────────────────────────────────────────────────────
async function scanColumnNames() {
  const violations = [];

  for await (const file of walk(REPO_ROOT)) {
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) continue;
    if (file.endsWith(".d.ts")) continue;

    const rel = path.relative(REPO_ROOT, file).replaceAll("\\", "/");

    // Scan packages/hq-schema and apps/hq/server/db only.
    if (
      !rel.startsWith("packages/hq-schema/") &&
      !rel.startsWith("apps/hq/server/db/")
    ) {
      continue;
    }

    // Skip this guard script itself (redundant here since scripts/ is excluded
    // by the path filter above, but kept for clarity).
    if (rel.startsWith("scripts/guard-hq-")) continue;

    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    // Cheap pre-filter.
    if (!PII_COLUMN_NAME_RE.test(contents)) continue;
    PII_COLUMN_NAME_RE.lastIndex = 0;

    const lines = contents.split("\n");

    // (a) Check string-literal column names inside column helpers.
    COLUMN_LITERAL_RE.lastIndex = 0;
    let m;
    while ((m = COLUMN_LITERAL_RE.exec(contents)) !== null) {
      const colName = m[2];
      if (!PII_COLUMN_NAME_RE.test(colName)) continue;
      PII_COLUMN_NAME_RE.lastIndex = 0;

      const { line } = lineColForOffset(contents, m.index);
      const lineIdx = line - 1;
      const lineText = lines[lineIdx] ?? "";
      const trimmed = lineText.trimStart();

      // Skip comment lines.
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      ) {
        continue;
      }

      if (hasOptOutOnLine(lines, lineIdx)) {
        if (optOutHasReason(lines, lineIdx)) continue;
        violations.push({
          rule: "A",
          file: rel,
          line,
          name: colName,
          form: "string-literal",
          reason: "opt-out marker is missing a required reason phrase",
          snippet: lineText.trim(),
        });
        continue;
      }

      violations.push({
        rule: "A",
        file: rel,
        line,
        name: colName,
        form: "string-literal column name",
        reason: `column name "${colName}" matches /connection|database_url|dsn/i`,
        snippet: lineText.trim(),
      });
    }

    // (b) Check JS property names preceding column helper calls.
    PROPERTY_NAME_RE.lastIndex = 0;
    while ((m = PROPERTY_NAME_RE.exec(contents)) !== null) {
      const propName = m[1];
      if (!PII_COLUMN_NAME_RE.test(propName)) continue;
      PII_COLUMN_NAME_RE.lastIndex = 0;

      const { line } = lineColForOffset(contents, m.index);
      const lineIdx = line - 1;
      const lineText = lines[lineIdx] ?? "";
      const trimmed = lineText.trimStart();

      // Skip comment lines.
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      ) {
        continue;
      }

      if (hasOptOutOnLine(lines, lineIdx)) {
        if (optOutHasReason(lines, lineIdx)) continue;
        violations.push({
          rule: "A",
          file: rel,
          line,
          name: propName,
          form: "JS property name",
          reason: "opt-out marker is missing a required reason phrase",
          snippet: lineText.trim(),
        });
        continue;
      }

      violations.push({
        rule: "A",
        file: rel,
        line,
        name: propName,
        form: "JS property name",
        reason: `property name "${propName}" matches /connection|database_url|dsn/i`,
        snippet: lineText.trim(),
      });
    }
  }

  return violations;
}

// ─── Rule B scan ─────────────────────────────────────────────────────────────
// HQ env/config paths to check for committed postgres connection strings.
const HQ_CONFIG_PATHS = [
  "apps/hq/.env.example",
  "services/hq-worker/.env.example",
  "services/hq-worker/fly.toml",
];

async function scanConnStrings() {
  const violations = [];

  for (const relPath of HQ_CONFIG_PATHS) {
    const absPath = path.join(REPO_ROOT, relPath.replaceAll("/", path.sep));
    let contents;
    try {
      contents = readFileSync(absPath, "utf8");
    } catch {
      // File doesn't exist yet — skip.
      continue;
    }

    const lines = contents.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comment lines (# for env/toml).
      if (/^\s*#/.test(line)) continue;
      // Skip lines with the opt-out marker.
      if (OPT_OUT_MARKER.test(line)) continue;

      POSTGRES_URI_RE.lastIndex = 0;
      let m;
      while ((m = POSTGRES_URI_RE.exec(line)) !== null) {
        const uri = m[0];
        if (isPlaceholderUri(uri, line)) continue;

        violations.push({
          rule: "B",
          file: relPath,
          line: i + 1,
          uri,
          reason:
            "real postgres connection string committed to HQ env/config — " +
            "HQ must never hold a studio Neon connection string; " +
            "use a placeholder like DATABASE_URL= (empty) or DATABASE_URL=<your-hq-neon-url>",
          snippet: line.trim(),
        });
      }
    }
  }

  return violations;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const [columnViolations, connStringViolations] = await Promise.all([
  scanColumnNames(),
  scanConnStrings(),
]);

const allViolations = [...columnViolations, ...connStringViolations];

if (allViolations.length > 0) {
  const bar = "=".repeat(72);
  console.error(`\n${bar}`);
  console.error("ERROR: HQ PII-up boundary violation(s) detected.");
  console.error(bar);
  console.error("");
  console.error(
    "HQ is the operator control plane. It stores provider RESOURCE IDs",
  );
  console.error(
    "(Neon project IDs, Vercel project IDs), NEVER connection strings,",
  );
  console.error(
    "member PII, or studio credentials. Connection strings are fetched",
  );
  console.error(
    "at provisioning/runtime via the Neon/Vercel API (BD2 PROV), never",
  );
  console.error(
    "persisted in HQ. See PITFALLS.md §T-03/T-04 + HQ-FND-06 (D-14).",
  );
  console.error("");

  const ruleA = allViolations.filter((v) => v.rule === "A");
  const ruleB = allViolations.filter((v) => v.rule === "B");

  if (ruleA.length > 0) {
    console.error(
      "RULE A — Column name(s) in HQ schema match /connection|database_url|dsn/i:",
    );
    for (const v of ruleA) {
      console.error(`  ${v.file}:${v.line} (${v.form})`);
      console.error(`    name: "${v.name}"`);
      console.error(`    reason: ${v.reason}`);
      if (v.snippet) console.error(`    ${v.snippet}`);
    }
    console.error("");
  }

  if (ruleB.length > 0) {
    console.error(
      "RULE B — Real postgres URI committed to HQ env/config:",
    );
    for (const v of ruleB) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    uri: ${v.uri}`);
      console.error(`    reason: ${v.reason}`);
      if (v.snippet) console.error(`    ${v.snippet}`);
    }
    console.error("");
  }

  console.error(bar);
  console.error("Fix:");
  console.error("");
  console.error(
    "  RULE A: Rename the column to store only the Neon/Vercel resource ID,",
  );
  console.error(
    '    not a connection string (e.g. "neon_project_id" instead of "database_url").',
  );
  console.error("");
  console.error(
    "  RULE B: Replace the real connection string in the config file with",
  );
  console.error(
    "    an empty placeholder (DATABASE_URL=) or angle-bracket form",
  );
  console.error("    (DATABASE_URL=<your-hq-neon-url>).");
  console.error(
    "    Real secrets belong in Fly secrets / Vercel env (never committed).",
  );
  console.error("");
  console.error("  Last-resort opt-out (requires reviewer approval):");
  console.error(
    "    databaseUrl: text('database_url'), // guard:allow-hq-pii — reason",
  );
  console.error(`${bar}\n`);
  process.exit(1);
}

console.log(
  "guard-hq-no-pii: clean (no PII-shaped columns in HQ schema; no real studio conn strings in HQ config).",
);
