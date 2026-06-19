---
phase: BD1-hq-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/hq/package.json
  - apps/hq/tsconfig.json
  - apps/hq/react-router.config.ts
  - apps/hq/vite.config.ts
  - apps/hq/ssr-entry.ts
  - apps/hq/components.json
  - apps/hq/MODIFICATIONS.md
  - apps/hq/app/
  - apps/hq/actions/
  - apps/hq/server/
  - apps/hq/public/
autonomous: true
requirements: [HQ-FND-02]
user_setup: []

must_haves:
  truths:
    - "apps/hq exists as a React Router v7 SSR app forked (copy-out) from templates/dispatch + templates/brain"
    - "templates/ is byte-for-byte unchanged — no template file is edited in place"
    - "Every copied file's origin is recorded in apps/hq/MODIFICATIONS.md"
    - "Videos template is excluded; Content real-time collab (Yjs) is not copied"
    - "apps/hq typechecks cleanly with the standard agent-native build/typecheck toolchain"
  artifacts:
    - path: "apps/hq/package.json"
      provides: "HQ app workspace package (@gymos/hq), forked from dispatch shell"
      contains: "@gymos/hq"
    - path: "apps/hq/MODIFICATIONS.md"
      provides: "Fork-origin ledger (every copied file -> source template path)"
      min_lines: 20
    - path: "apps/hq/react-router.config.ts"
      provides: "RR v7 framework-mode config"
  key_links:
    - from: "apps/hq/package.json"
      to: "@agent-native/core"
      via: "workspace dependency"
      pattern: "@agent-native/core"
    - from: "pnpm-workspace.yaml"
      to: "apps/hq"
      via: "apps/* glob (already present — verify, do not duplicate)"
      pattern: "apps/\\*"
---

<objective>
Stand up `apps/hq` as a running React Router v7 SSR control-plane app, created by copy-out fork of agent-native's **Dispatch** template (the app shell) plus **Brain** surfaces (the customer-context layer). This is the operator control plane — visually and functionally distinct from `apps/staff-web`, NOT a studio surface.

Purpose: Establish the HQ app substrate that every later BD phase builds on (BD1-03 adds auth, BD2 adds telemetry/provisioning routes, BD3 adds Brain/Dispatch). Fork-boundary discipline (HQ-FND-02) is enforced from the first commit.
Output: `apps/hq/` directory with package.json (@gymos/hq), RR-v7 config, a minimal HQ dashboard route, and `apps/hq/MODIFICATIONS.md` recording every copied file's template origin.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md
@.planning/research/ARCHITECTURE.md
@.planning/REQUIREMENTS.md
@CLAUDE.md
@AGENTS.md

<read_first>
The decisions that bound this plan (BD1-CONTEXT.md):
- D-01: Fork Dispatch as the app shell; copy Brain surfaces into apps/hq/ for the customer-context layer. Copy-out only — templates/ is NEVER edited in place (matches how apps/staff-web adapted Mail/Calendar).
- D-02: EXCLUDE the Videos template (Remotion + react-three — no BD1/BD3 feature needs it).
- D-03: DEFER Content real-time collab (Yjs). If a Content surface is copied later for HQD-04, take the non-collab path. Do NOT copy Yjs/y-websocket wiring now.
- D-04: Record every copied file's origin in apps/hq/MODIFICATIONS.md.

Fork precedent to mirror exactly: apps/staff-web/ is itself a copy-out fork (see apps/staff-web/package.json `description: "...forked from agent-native Mail template"`). It uses `@agent-native/core` as a workspace dep, RR v7 framework mode, the `agent-native` CLI for dev/build/typecheck, and keeps original template tables for upstream-merge compatibility.

Source templates (do NOT edit; read + copy out):
- templates/dispatch/ — app shell (package.json deps, react-router.config.ts, vite.config.ts, ssr-entry.ts, components.json, app/, actions/, server/, shared/, public/, tsconfig.json)
- templates/brain/ — customer-context surfaces (app/, actions/, server/ — copy the Brain UI/action surfaces but NOT its Yjs/collab wiring)

Workspace glob: pnpm-workspace.yaml ALREADY contains `apps/*` and `packages/*` and `services/*`. apps/hq is auto-included. Do NOT add a new glob entry; just verify the glob covers it.

No-local-dev-server constraint: NitroViteError prevents `pnpm dev` / `agent-native dev` on these apps. Verify via `tsc`/typecheck and file/grep checks ONLY — never boot a dev server.
</read_first>

<interfaces>
From apps/staff-web/package.json (the proven fork shape to mirror):
```json
{
  "name": "@gymos/staff-web",
  "type": "module",
  "scripts": {
    "dev": "agent-native dev",
    "build": "node ../../packages/core/dist/cli/index.js build && node scripts/post-vercel-build.mjs",
    "start": "agent-native start",
    "typecheck": "agent-native typecheck"
  },
  "dependencies": { "@agent-native/core": "workspace:*", ... }
}
```
From templates/dispatch/package.json (the shell source):
```json
{
  "name": "dispatch",
  "scripts": { "dev": "agent-native dev", "build": "agent-native build", "typecheck": "agent-native typecheck" },
  "dependencies": { "@agent-native/core": "workspace:*", "@agent-native/dispatch": "workspace:*", ... }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy-out the Dispatch shell into apps/hq and rename the package</name>
  <read_first>templates/dispatch/package.json, templates/dispatch/react-router.config.ts, templates/dispatch/vite.config.ts, templates/dispatch/tsconfig.json, templates/dispatch/ssr-entry.ts, templates/dispatch/components.json, apps/staff-web/package.json (fork-rename precedent)</read_first>
  <files>apps/hq/package.json, apps/hq/react-router.config.ts, apps/hq/vite.config.ts, apps/hq/tsconfig.json, apps/hq/ssr-entry.ts, apps/hq/components.json, apps/hq/app/, apps/hq/actions/, apps/hq/server/, apps/hq/shared/, apps/hq/public/</files>
  <action>
Copy the Dispatch template's app-shell files out of templates/dispatch/ into apps/hq/ (a real file copy — do NOT symlink, do NOT edit templates/ in place). Copy: package.json, react-router.config.ts, vite.config.ts, tsconfig.json, ssr-entry.ts, components.json, and the directories app/, actions/, server/, shared/, public/. Do NOT copy node_modules, dist, .react-router, netlify.toml (HQ ships to Vercel like staff-web, not Netlify), DEVELOPING.md, _gitignore.

Then modify ONLY the copies under apps/hq/:
- package.json: set `"name": "@gymos/hq"`, add `"displayName": "GymClassOS HQ"`, `"description": "GymClassOS operator control plane (forked from agent-native Dispatch + Brain templates)"`, and `"private": true`. Keep `"type": "module"`. Set scripts identical to apps/staff-web's pattern: `"dev": "agent-native dev"`, `"build": "node ../../packages/core/dist/cli/index.js build"`, `"start": "agent-native start"`, `"typecheck": "agent-native typecheck"`, `"test": "vitest --run"`. Keep `"@agent-native/core": "workspace:*"` and `"@agent-native/dispatch": "workspace:*"`. Keep the rest of dispatch's deps. Set `"packageManager"` to match apps/staff-web's pnpm version.
- Verify react-router.config.ts / vite.config.ts / tsconfig.json reference no template-relative paths that break under apps/hq (they should be self-contained; fix any `../../templates/...` path to the workspace-correct equivalent if present).

Add a top-of-file comment block to apps/hq/package.json's sibling MODIFICATIONS.md (created in Task 3) is NOT done here — just note origins as you copy for Task 3.
  </action>
  <verify>
    <automated>node -e "const p=require('./apps/hq/package.json'); if(p.name!=='@gymos/hq') process.exit(1); if(!p.dependencies['@agent-native/core']) process.exit(1); console.log('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/package.json` exists with `"name": "@gymos/hq"` and a `@agent-native/core: workspace:*` dependency (grep: `grep '"@gymos/hq"' apps/hq/package.json` returns a hit).
    - `apps/hq/react-router.config.ts`, `apps/hq/vite.config.ts`, `apps/hq/tsconfig.json`, `apps/hq/ssr-entry.ts` all exist (`ls apps/hq/` shows them).
    - `git status --porcelain templates/` returns EMPTY (no template file modified).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Copy Brain context surfaces into apps/hq (no Yjs, no Videos)</name>
  <read_first>templates/brain/app/ (route + component surfaces), templates/brain/actions/, templates/brain/server/, templates/brain/package.json (to know which deps the Brain surfaces need)</read_first>
  <files>apps/hq/app/, apps/hq/actions/, apps/hq/server/, apps/hq/package.json</files>
  <action>
Copy the Brain template's customer-context surfaces out of templates/brain/ into apps/hq/, namespacing to avoid collisions with the Dispatch-shell files already present:
- Copy Brain route/component files into apps/hq/app/ (e.g. under apps/hq/app/routes/ and apps/hq/app/components/, preserving Brain's filenames; if a filename collides with a Dispatch file, prefix the Brain copy with `brain-`).
- Copy Brain actions into apps/hq/actions/ (prefix any colliding action filename with `brain-` per the staff-web collision-avoidance convention noted in research V2 fork discipline).
- Copy Brain server-side helpers into apps/hq/server/ as needed by the copied surfaces.
- Merge any Brain-only dependencies (from templates/brain/package.json) into apps/hq/package.json dependencies — EXCEPT any Yjs / y-websocket / collaborative-editing packages (D-03: defer collab) and any Remotion / react-three / Videos packages (D-02: exclude Videos). If a copied Brain file imports a Yjs/collab module, either copy the non-collab variant or stub the import out and note it in MODIFICATIONS.md as "collab deferred (D-03)".

Do NOT wire Brain to a database yet — that is BD1-02 (hq-schema) + BD1-03 (org seed). At this stage Brain surfaces may render against empty/placeholder data; full data wiring lands when the HQ org seed exists.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const files=fs.readdirSync('apps/hq/app/routes',{recursive:true}); const hasBrain=files.some(f=>String(f).toLowerCase().includes('brain')); process.exit(hasBrain?0:1)"</automated>
  </verify>
  <acceptance_criteria>
    - At least one Brain-derived route exists under `apps/hq/app/` (grep -ri "brain" apps/hq/app/routes returns hits).
    - No Yjs/collab dependency is present in apps/hq/package.json (`grep -E "yjs|y-websocket|y-protocols" apps/hq/package.json` returns NOTHING).
    - No Remotion/Videos dependency present (`grep -E "remotion|react-three|@react-three" apps/hq/package.json` returns NOTHING).
    - `git status --porcelain templates/` still returns EMPTY.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Write apps/hq/MODIFICATIONS.md fork ledger and verify typecheck</name>
  <read_first>apps/staff-web/AGENTS.md (fork-origin documentation precedent), the set of files copied in Tasks 1-2</read_first>
  <files>apps/hq/MODIFICATIONS.md</files>
  <action>
Create apps/hq/MODIFICATIONS.md documenting the fork boundary (D-04). Include:
- A header explaining apps/hq is a copy-out fork of templates/dispatch (shell) + templates/brain (context surfaces); templates/ is never edited in place.
- A table with columns: `apps/hq path | source template path | modification`. One row per copied file or directory group (e.g. `apps/hq/app/routes/brain.* | templates/brain/app/routes/* | renamed brain- prefix on collision`). Group whole directories where per-file rows would be noise, but name every distinct source.
- An "Exclusions" section listing: Videos template (D-02), Yjs/Content collab (D-03), netlify.toml (HQ deploys to Vercel).
- A "Two-commit discipline" note: when later merging upstream changes into a copied surface, copy first then modify, keeping templates/ pristine.
- An "Upstream merge" note: origin templates remain in templates/ untouched so `git diff upstream/main HEAD -- templates/` stays empty.

Then run the HQ typecheck to confirm the fork compiles. If typecheck surfaces missing-dep or broken-import errors from the Brain copy, resolve by adding the missing dep to apps/hq/package.json (running `pnpm install` at repo root) or fixing the import path — record any such fix in MODIFICATIONS.md.
  </action>
  <verify>
    <automated>test -f apps/hq/MODIFICATIONS.md && grep -qi "templates/dispatch" apps/hq/MODIFICATIONS.md && grep -qi "templates/brain" apps/hq/MODIFICATIONS.md && echo ok</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/MODIFICATIONS.md` exists, references both `templates/dispatch` and `templates/brain`, and has an Exclusions section naming Videos + Yjs (grep: `grep -i "videos" apps/hq/MODIFICATIONS.md` and `grep -i "yjs\|collab" apps/hq/MODIFICATIONS.md` both hit).
    - `pnpm --filter @gymos/hq typecheck` exits 0 (HQ app compiles).
    - `git status --porcelain templates/` returns EMPTY (final fork-boundary check).
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `apps/hq/` exists with RR-v7 config, package.json (@gymos/hq), and copied Dispatch+Brain surfaces.
- `git status --porcelain templates/` is empty (HQ-FND-02 fork boundary preserved — the success-criteria check `git diff upstream/main HEAD -- templates/` returns empty).
- `pnpm --filter @gymos/hq typecheck` passes.
- `apps/hq/MODIFICATIONS.md` records every copied file's origin + exclusions (Videos, Yjs).
- No Yjs/Remotion deps leaked into apps/hq/package.json.
</verification>

<success_criteria>
HQ-FND-02 satisfied: apps/hq is a copy-out fork of Dispatch + Brain following fork-boundary discipline; templates/ untouched; modifications recorded under apps/hq/. App typechecks clean (verified without a dev server).
</success_criteria>

<output>
After completion, create `.planning/phases/BD1-hq-foundation/BD1-01-SUMMARY.md`
</output>
