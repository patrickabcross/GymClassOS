---
phase: BD1-hq-foundation
plan: 06
type: execute
wave: 3
depends_on: ["01", "02"]
files_modified:
  - scripts/guard-hq-fork-boundary.mjs
  - scripts/guard-hq-no-pii.mjs
  - package.json
autonomous: true
requirements: [HQ-FND-06]
user_setup: []

must_haves:
  truths:
    - "A fork-boundary guard fails CI if apps/hq imports from or edits templates/ in place"
    - "A PII-up guard fails CI if any packages/hq-schema column name matches *connection*/*database_url*/*dsn*, or if a studio Neon connection string appears in HQ env/config"
    - "Both guards are wired into the pnpm guards chain (so they run in CI AND pnpm prep)"
    - "Both guards pass against the current apps/hq + packages/hq-schema (no false positives on the BD1 scaffold)"
  artifacts:
    - path: "scripts/guard-hq-fork-boundary.mjs"
      provides: "Node-native guard: apps/hq must not import/edit templates/ in place"
      min_lines: 40
    - path: "scripts/guard-hq-no-pii.mjs"
      provides: "Node-native guard: no PII-shaped columns / studio Neon creds in HQ"
      min_lines: 40
    - path: "package.json"
      provides: "guards chain extended with the two HQ guards"
      contains: "guard:hq-fork-boundary"
  key_links:
    - from: "package.json"
      to: "scripts/guard-hq-fork-boundary.mjs + scripts/guard-hq-no-pii.mjs"
      via: "guards chain + named scripts"
      pattern: "guard:hq-fork-boundary.*guard:hq-no-pii|guard:hq-no-pii.*guard:hq-fork-boundary"
---

<objective>
Add two CI guards that enforce the v2.0 structural invariants from day one: (a) `guard:hq-fork-boundary` — `apps/hq` never imports from or edits `templates/` in place; (b) `guard:hq-no-pii` — HQ schema/config never stores PII-shaped columns or a studio Neon connection string. Wire both into the existing `pnpm guards` chain.

Purpose: HQ-FND-06 — the fork boundary and PII-up boundary become mechanically enforced, not policy. The success criterion "pnpm guards fails if any HQ schema migration adds a column matching *connection*/*database_url*/*dsn*" must hold.
Output: scripts/guard-hq-fork-boundary.mjs + scripts/guard-hq-no-pii.mjs + package.json guards-chain wiring.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md
@.planning/research/PITFALLS.md
@CLAUDE.md
@AGENTS.md

<read_first>
Bounding decisions (BD1-CONTEXT.md):
- D-14: Add two guards to the existing pnpm guards chain (scripts/guard-*.mjs pattern, Node-native recursive walk — Windows-friendly): (a) fork-boundary guard ensuring apps/hq never imports/edits templates/ in place; (b) PII-up guard failing the build if any packages/hq-schema column name matches *connection*/*database_url*/*dsn*, or if a studio Neon connection string appears in HQ env/config.
- D-15: Guards are wired into both CI and pnpm prep so they block locally too (matches existing guard precedent). NOTE: the existing `guards` script is already invoked by `prep` (prep runs `pnpm guards`), so adding to the guards chain automatically covers prep.

Precedent to mirror EXACTLY (Node-native, Windows-friendly):
- scripts/guard-no-env-credentials.mjs — the canonical shape: a recursive async `walk(dir)` using node:fs/promises readdir withFileTypes, a SKIP_DIRS set (node_modules, .git, dist, build, .react-router, .generated, coverage, etc.), per-file regex scanning, an OPT_OUT_MARKER (`// guard:allow-...`), a violations array, and a clear console.error report + process.exit(1) on violations. COPY this structure. Use forward-slash-normalized relative paths (`.replaceAll("\\\\","/")`) for Windows.
- package.json: the `"guards"` script is a chained `pnpm guard:X && pnpm guard:Y && ...`. Add `"guard:hq-fork-boundary": "node scripts/guard-hq-fork-boundary.mjs"` and `"guard:hq-no-pii": "node scripts/guard-hq-no-pii.mjs"` as named scripts and append both to the end of the `"guards"` chain. `prep` already calls `pnpm guards` — no separate prep edit needed.

What the fork-boundary guard must catch (guard-hq-fork-boundary.mjs):
- Scan apps/hq/**. Flag any import/require/dynamic-import whose specifier resolves into `templates/` (e.g. `from "../../templates/..."`, `from "../../../templates/..."`, `require(".../templates/...")`, `import(".../templates/...")`). apps/hq must consume framework code via `@agent-native/*` and `@gymos/*` workspace packages, NOT by reaching into templates/.
- Also (cheap, high-value) re-assert that templates/ is not edited as part of HQ work: this guard scans apps/hq source only; the "templates/ untouched" git check belongs to BD1-01's verification, but ADD a note in the guard's header pointing to that. (Do NOT shell out to git here — keep the guard a pure file scan for determinism/Windows safety.)
- Provide an opt-out marker (`// guard:allow-hq-template-import — reason`) for the rare legitimate case, mirroring the precedent's opt-out handling (reason required).

What the PII-up guard must catch (guard-hq-no-pii.mjs):
- Scan packages/hq-schema/** (and optionally apps/hq/server/db/**) for Drizzle column declarations whose COLUMN NAME (the string literal in `text("...")` / `integer("...")` etc., OR the JS property name) matches /connection|database_url|dsn/i. Flag any hit. This is the literal HQ-FND-06 success criterion.
- Scan HQ env/config files (apps/hq/.env.example, services/hq-worker/.env.example, fly.toml files for HQ, any HQ config) for a STUDIO Neon connection string pattern. Since a real studio conn string won't be committed, the guard's tractable check is: flag any committed postgres connection string literal in HQ env/config that is NOT a placeholder (e.g. flag `postgres://...@...neon.tech/...` with real-looking host/credentials, while allowing obvious placeholders like empty `DATABASE_URL=` or `...=<your-...>` / `...=changeme`). Keep this conservative to avoid false positives — match a postgres URI regex but exclude lines that are clearly placeholders/examples. Document the heuristic in the guard header.
- Provide an opt-out marker (`// guard:allow-hq-pii — reason`) only as a last resort.
- IMPORTANT: the guard must NOT itself trip on its own forbidden-substring list — when scanning, skip comment lines and skip the guard scripts themselves (mirror how guard-no-env-credentials skips comment lines and excludes paths).

Constraints: Node-native, no new deps, Windows-friendly (forward-slash normalize, no shell-specific calls). Both guards must pass cleanly against the BD1 scaffold (apps/hq from BD1-01, packages/hq-schema from BD1-02/03) — if a guard would false-positive on legitimate scaffold code, refine the rule, do not weaken it to a no-op.
</read_first>
</context>

<tasks>

<task type="auto">
  <name>Task 1: guard-hq-fork-boundary.mjs (apps/hq must not import/edit templates/)</name>
  <read_first>scripts/guard-no-env-credentials.mjs (walk + SKIP_DIRS + opt-out + report shape), apps/hq/ source (to ensure no false positives — confirm apps/hq imports only @agent-native/* and @gymos/*)</read_first>
  <files>scripts/guard-hq-fork-boundary.mjs</files>
  <action>
Create scripts/guard-hq-fork-boundary.mjs mirroring guard-no-env-credentials.mjs structure:
- REPO_ROOT resolution from import.meta.url; SKIP_DIRS set; async recursive walk(dir).
- Scan ONLY files under apps/hq/ (filter rel path startsWith "apps/hq/"), TS/TSX/JS/MJS/CJS, skipping .d.ts.
- For each file, find import/require/dynamic-import specifiers and flag any specifier that contains a `templates/` path segment (regex over `from "..."`, `import("...")`, `require("...")`). Normalize backslashes. Skip comment lines (mirror the precedent's comment-skip).
- Honor an opt-out marker `// guard:allow-hq-template-import — <reason>` (same-line or line-above, reason required) exactly like the precedent.
- On violations: clear console.error explaining the fork boundary (apps/hq consumes framework via @agent-native/* + @gymos/* workspace packages; templates/ is never reached into; cite HQ-FND-06 + MODIFICATIONS.md discipline), list each file:line:specifier, then process.exit(1). On clean: console.log a success line.
- Header comment: explain the rule, cite D-14, and note that the "templates/ byte-unchanged" git check lives in BD1-01 verification (this guard is a pure file scan).
  </action>
  <verify>
    <automated>node scripts/guard-hq-fork-boundary.mjs</automated>
  </verify>
  <acceptance_criteria>
    - scripts/guard-hq-fork-boundary.mjs exists and uses a Node-native recursive walk (grep: "readdir" + "walk").
    - Running `node scripts/guard-hq-fork-boundary.mjs` against the current tree exits 0 (no false positive on the BD1 scaffold).
    - The guard scans apps/hq/ and flags templates/ specifiers (grep the script for "apps/hq" and "templates/").
    - It supports the `guard:allow-hq-template-import` opt-out with a required reason (grep hit).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: guard-hq-no-pii.mjs (no PII columns / studio Neon creds in HQ)</name>
  <read_first>scripts/guard-no-env-credentials.mjs (structure + opt-out + comment-skip), packages/hq-schema/src/schema.ts + src/migrations.ts (confirm no PII column exists so the guard passes), apps/hq/.env.example + services/hq-worker/.env.example</read_first>
  <files>scripts/guard-hq-no-pii.mjs</files>
  <action>
Create scripts/guard-hq-no-pii.mjs mirroring the precedent's structure:
- COLUMN-NAME RULE: scan packages/hq-schema/** (and apps/hq/server/db/**) TS files for Drizzle column declarations whose name matches /connection|database_url|dsn/i. Detect both the string-literal column name inside `text("...")`/`integer("...")`/`real("...")` etc. AND the JS property name preceding `: text(`/`: integer(` etc. Skip comment lines (so a comment forbidding these names doesn't trip it). Flag any real declaration.
- STUDIO-CONN-STRING RULE: scan HQ env/config (apps/hq/.env.example, services/hq-worker/.env.example, services/hq-worker/fly.toml, apps/hq config files) for a committed postgres connection-string LITERAL that is not a placeholder. Use a postgres URI regex (postgres(ql)?://user:pass@host/db) but EXCLUDE lines that are obvious placeholders (empty value, `<...>`, `changeme`, `your-`, `example`, all-caps token names). Document the heuristic in the header. This protects against a real studio Neon URL leaking into HQ config.
- Opt-out `// guard:allow-hq-pii — <reason>` (reason required), last-resort only.
- Exclude the guard script files themselves and comment lines from matching (so the script's own forbidden-substring list / docstring doesn't self-trip).
- On violation: clear console.error citing the PII-up boundary (HQ never stores member PII or a studio Neon connection string; HQ stores only provider resource IDs; cite Pitfall T-03/T-04 + HQ-FND-06), list hits, process.exit(1). On clean: success line.
  </action>
  <verify>
    <automated>node scripts/guard-hq-no-pii.mjs</automated>
  </verify>
  <acceptance_criteria>
    - scripts/guard-hq-no-pii.mjs exists; running it against the current tree exits 0 (no PII column in hq-schema, no real studio conn string in HQ config).
    - The guard's column rule matches /connection|database_url|dsn/i (grep the script for that pattern).
    - The guard scans packages/hq-schema (grep hit) and HQ env/config for a postgres URI with a placeholder exclusion (grep: "postgres" + a placeholder-exclusion term like "changeme"/"placeholder"/"your-").
    - It supports the `guard:allow-hq-pii` opt-out with a required reason (grep hit).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Wire both guards into the pnpm guards chain + verify negative cases</name>
  <read_first>package.json (the guard:* named scripts + the "guards" chain + "prep"), the two new guard scripts</read_first>
  <files>package.json</files>
  <action>
Wire the guards:
- Add named scripts to package.json: `"guard:hq-fork-boundary": "node scripts/guard-hq-fork-boundary.mjs"` and `"guard:hq-no-pii": "node scripts/guard-hq-no-pii.mjs"`.
- Append `&& pnpm guard:hq-fork-boundary && pnpm guard:hq-no-pii` to the END of the existing `"guards"` chain. (prep already runs `pnpm guards`, so no prep edit is needed — confirm prep references `pnpm guards` and leave it.)
- NEGATIVE-CASE VERIFICATION (prove the guards actually fail when they should — do NOT commit the temporary violation): in a scratch step, temporarily add a `database_url` column to a throwaway test fixture (or a temp line in a hq-schema file) and confirm `node scripts/guard-hq-no-pii.mjs` exits non-zero; temporarily add a `from "../../templates/foo"` import in a throwaway apps/hq file and confirm `node scripts/guard-hq-fork-boundary.mjs` exits non-zero. REVERT both temp changes immediately so the tree is clean. Record in the SUMMARY that both negative cases were exercised. (This is a manual verification within the task — the committed state must be clean and both guards green.)
- Final: run the FULL `pnpm guards` chain and confirm it exits 0 with the two new guards included.
  </action>
  <verify>
    <automated>pnpm guards</automated>
  </verify>
  <acceptance_criteria>
    - package.json contains `guard:hq-fork-boundary` and `guard:hq-no-pii` named scripts AND both appear in the `"guards"` chain (grep both in package.json).
    - `pnpm guards` exits 0 (full chain green, including the two new guards).
    - SUMMARY records that the negative cases were exercised (PII column -> guard fails; templates/ import -> guard fails) and reverted, leaving the tree clean.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- scripts/guard-hq-fork-boundary.mjs + scripts/guard-hq-no-pii.mjs exist, are Node-native (Windows-friendly), and pass against the BD1 scaffold.
- Both are wired into the `guards` chain (and thus `prep`).
- The HQ-FND-06 success criterion holds: a *connection*/*database_url*/*dsn* column in HQ schema makes `pnpm guards` fail (verified via the reverted negative case).
- `pnpm guards` exits 0 in the committed (clean) state.
</verification>

<success_criteria>
HQ-FND-06 satisfied: CI guards enforce (a) the apps/hq fork boundary and (b) that HQ schema/telemetry never stores PII-shaped columns or a studio Neon connection string. Both run in CI and pnpm prep.
</success_criteria>

<output>
After completion, create `.planning/phases/BD1-hq-foundation/BD1-06-SUMMARY.md`
</output>
