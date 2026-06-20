---
phase: CV1-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/package.json
  - apps/staff-web/server/plugins/db.ts
  - apps/staff-web/features/content/README.md
  - apps/staff-web/features/video/README.md
  - apps/staff-web/app/routes/gymos.content.tsx
  - apps/staff-web/app/routes/gymos.video.tsx
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
  - apps/staff-web/app/components/gymos/GymosNavBridge.tsx
  - apps/staff-web/app/routes/gymos.tsx
  - apps/staff-web/actions/navigate.ts
  - apps/staff-web/actions/view-screen.ts
autonomous: true
requirements: [DEP-01, MIG-01, NAV-01]

must_haves:
  truths:
    - "pnpm --filter @gymos/staff-web exec tsc --noEmit passes after adding remotion + @remotion/player"
    - "content_documents and video_compositions tables exist in gymos-demo Neon (additive v20/v21 migrations), and re-running the migration is a no-op (CREATE TABLE IF NOT EXISTS)"
    - "Content and Video tabs render in GymosTopNav and route to /gymos/content and /gymos/video (placeholder pages this phase)"
    - "The agent can call navigate({view:'content'}) / navigate({view:'video'}) and the gymos UI routes to the matching tab"
    - "view-screen reports the active gymos tab via navigation application_state, and 'content'/'video' views return a content/video screen branch (NOT a Gmail fetch fall-through)"
  artifacts:
    - path: "apps/staff-web/package.json"
      provides: "remotion + @remotion/player deps (no @remotion/renderer, no @remotion/lambda); Tiptap non-collab already present"
      contains: "@remotion/player"
    - path: "apps/staff-web/server/plugins/db.ts"
      provides: "additive v20 content_documents + v21 video_compositions migrations"
      contains: "content_documents"
    - path: "apps/staff-web/app/routes/gymos.content.tsx"
      provides: "/gymos/content placeholder route that syncs view='content' to navigation app-state"
      min_lines: 15
    - path: "apps/staff-web/app/routes/gymos.video.tsx"
      provides: "/gymos/video placeholder route that syncs view='video' to navigation app-state"
      min_lines: 15
    - path: "apps/staff-web/app/components/gymos/GymosNavBridge.tsx"
      provides: "consumes the agent navigate one-shot command and routes to /gymos/<view>"
      min_lines: 20
    - path: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      provides: "Content + Video tab links (Tabler file-text + video icons)"
      contains: "/gymos/content"
    - path: "apps/staff-web/features/content/README.md"
      provides: "fork scaffold marker for the Content feature (CV2 fills it)"
    - path: "apps/staff-web/features/video/README.md"
      provides: "fork scaffold marker for the Video feature (CV3 fills it)"
  key_links:
    - from: "apps/staff-web/app/components/gymos/GymosNavBridge.tsx"
      to: "useNavigationState().command"
      via: "reads navigate one-shot command, navigate(`/gymos/${view}`), clearCommand()"
      pattern: "clearCommand"
    - from: "apps/staff-web/app/routes/gymos.tsx"
      to: "GymosNavBridge"
      via: "mounted once in the gymos layout so every /gymos/* child inherits the agent-navigate bridge"
      pattern: "GymosNavBridge"
    - from: "apps/staff-web/actions/navigate.ts"
      to: "writeAppState('navigate', nav)"
      via: "view enum + description extended with content + video"
      pattern: "content"
    - from: "apps/staff-web/actions/view-screen.ts"
      to: "content_documents / video_compositions"
      via: "nav.view === 'content' / 'video' branches before the Gmail fall-through"
      pattern: "view === \"content\""
---

<objective>
Lay the foundation for the v2.1 Content & Video Studio: add the only two missing
dependencies (Remotion player + core), create the two additive Neon tables, scaffold
the `features/content` + `features/video` fork directories, and wire Content + Video
as navigable gymos tabs (UI link + route + agent `navigate` + `view-screen`
context-awareness + active-tab `application_state`).

Purpose: every later CV phase (CV2 Content editor, CV3 Video editor, CV4 publish)
builds on these tables, deps, routes, and nav plumbing being in place and green.
This phase is plumbing only — the route pages are intentionally placeholders.

Output: green `tsc`, a clean Vercel/Nitro build, two additive tables in gymos-demo
Neon, two scaffold dirs, two new tabs the user and the agent can both reach.

IMPORTANT context the executor MUST internalize before starting:
- **Tiptap is ALREADY installed** in `apps/staff-web/package.json` devDependencies at
  `^3.22.2` (starter-kit, react, pm, image, link, placeholder, code-block-lowlight,
  tiptap-markdown, lowlight). There are **zero** collaboration / Yjs deps present
  (verified). So DEP-01's Tiptap half is already satisfied — do NOT add or re-pin
  Tiptap, and do NOT add any `@tiptap/extension-collaboration*`, `y-prosemirror`,
  `yjs`, or `y-indexeddb`. The ONLY deps to add are `remotion` + `@remotion/player`.
- **Migrations are appended to the `runMigrations([...])` array in
  `server/plugins/db.ts`**, table `mail_migrations`. The current MAX version is **19**.
  Use **v20** and **v21**. NEVER renumber or reorder existing entries. (Note: the array
  is intentionally not in strict numeric order — v15 sits after v19 — runMigrations
  applies by version number, so just append v20/v21 at the end.)
- **No local dev server** (NitroViteError). Verification is `tsc --noEmit` + (after
  merge to master) the Vercel build + a Neon MCP table check. Do NOT plan or attempt a
  local HTTP walkthrough.
- **Nitro build gotcha:** any helper/test file goes in `server/lib`, NEVER
  `server/plugins` (only Nitro plugin objects belong there — a plain helper there
  fails the Vercel build). This phase adds no server helpers, but keep it in mind.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@apps/staff-web/AGENTS.md
@apps/staff-web/server/plugins/db.ts
@apps/staff-web/app/components/gymos/GymosTopNav.tsx
@apps/staff-web/app/routes/gymos.tsx
@apps/staff-web/app/routes/gymos.campaigns.tsx
@apps/staff-web/actions/navigate.ts
@apps/staff-web/actions/view-screen.ts
@apps/staff-web/app/hooks/use-navigation-state.ts
@apps/staff-web/app/pages/MessagesPage.tsx

<interfaces>
<!-- Contracts extracted from the codebase. Use these directly — do NOT re-explore. -->

From apps/staff-web/app/hooks/use-navigation-state.ts:
```typescript
export interface NavigationState {
  view: string;            // gymos tab key, e.g. "content" | "video" | "schedule"
  threadId?: string;
  // ...other optional fields
  _ts?: number;
}
export function useNavigationState(): {
  sync: (state: NavigationState) => void;          // UI -> app-state, debounced (write so the agent can read current tab)
  command: { data: NavigationState | null };       // agent's one-shot navigate write
  clearCommand: () => void;                          // delete the one-shot command after consuming it
};
```

From apps/staff-web/actions/navigate.ts (the agent tool):
```typescript
// schema.view is a free-form z.string().optional() today; description lists the
// allowed gymos routes. It calls: await writeAppState("navigate", nav);
// You will EXTEND the description (and keep it a string) to include content + video.
```

From apps/staff-web/actions/view-screen.ts (the context-awareness reporter):
```typescript
// run() does: const navigation = await readAppState("navigation");
// then branches on nav.view: "draft-queue" | "forms" | "schedule" | "members" |
// "campaigns" | (else) fetchEmailList(nav.view ...)  <-- the Gmail fall-through.
// PROBLEM: an unrecognised view like "content"/"video" currently falls through to
// fetchEmailList -> Gmail. You MUST add explicit "content" and "video" branches
// BEFORE the final `else if (nav.view)` Gmail branch.
// Lazy db import pattern already used in this file:
//   const { getDb, schema } = await import("../server/db/index.js");
//   const { desc } = await import("drizzle-orm");
```

navigate one-shot command consumer (existing precedent — MessagesPage.tsx ~L428-464):
```typescript
const { data: navCommand } = navState.command;
useEffect(() => {
  if (!navCommand) return;
  // ...dedupe via lastCommandRef...
  // navigate(`/${targetView}`) for the LEGACY MAIL surface.
  navState.clearCommand();
}, [navCommand, ...]);
// NOTE: this legacy consumer routes to "/<view>" (mail). The gymos surface has NO
// such consumer today — that is why this plan adds GymosNavBridge, which routes to
// "/gymos/<view>". The gymos surface is wrapped ONLY by <AgentSidebar> in
// AppLayout.tsx (the `location.pathname.startsWith("/gymos")` branch) — no MessagesPage.
```

Migration row shape already used (BD4, db.ts v16-v18) — mirror for v20/v21:
```sql
CREATE TABLE IF NOT EXISTS studio_brain_docs (
  id         TEXT PRIMARY KEY,
  ...
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```
(TEXT ids via nanoid at write time, TEXT ISO timestamps, datetime('now') default —
matches gym_members / studio_brain_docs conventions. Postgres accepts datetime('now')?
No — but the BD4 rows already use it and run against gymos-demo Neon successfully via
the framework's dialect shim. Mirror the EXACT existing pattern; do not invent
NOW()/CURRENT_TIMESTAMP variants.)
```

Gymos route placeholder precedent: read apps/staff-web/app/routes/gymos.campaigns.tsx
for the `meta()` + default-export component + (for sync) the useChangeVersions/loader
shape. Your placeholders are far simpler — see Task 2.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Remotion deps + additive Neon migrations (DEP-01, MIG-01)</name>
  <files>apps/staff-web/package.json, apps/staff-web/server/plugins/db.ts</files>
  <action>
TWO independent changes; both must leave `tsc` green and the workspace consistent.

A) DEP-01 — add ONLY the Remotion deps to `apps/staff-web/package.json`:
   - Add to `dependencies` (these are runtime — the in-browser player ships to the
     client and SSR):
       "@remotion/player": "^4"   (pin the exact latest 4.x patch at install time;
                                    verify with `pnpm view @remotion/player version`)
       "remotion": "^4"           (same major as @remotion/player — they MUST match
                                    exactly; Remotion enforces lockstep versions)
   - Do NOT add `@remotion/renderer` or `@remotion/lambda` (server render is the
     GATED CV-RENDER phase — out of scope, heavy, headless-Chromium).
   - Do NOT touch Tiptap (already present, non-collab) and do NOT add any
     `@tiptap/extension-collaboration*` / `y-prosemirror` / `yjs` / `y-indexeddb`.
   - Install from the REPO ROOT to keep the pnpm workspace + lockfile consistent:
       `pnpm --filter @gymos/staff-web add @remotion/player@<ver> remotion@<ver>`
     (respect the pnpm catalog: these packages are not catalog-managed, so an
     explicit version is correct here.) Confirm `pnpm-lock.yaml` updated.
   - If `@remotion/player` and `remotion` resolve to different exact versions,
     re-pin so they are identical (Remotion fails at runtime on version skew).

B) MIG-01 — append two additive migrations to the `runMigrations([...])` array in
   `server/plugins/db.ts` (current MAX version = 19; use 20 then 21). Mirror the
   EXACT BD4 row style (TEXT ids, TEXT timestamps, datetime('now') defaults,
   CREATE TABLE IF NOT EXISTS for idempotency). NEVER edit/renumber existing rows.

   version 20:
     CREATE TABLE IF NOT EXISTS content_documents (
       id         TEXT PRIMARY KEY,
       title      TEXT NOT NULL DEFAULT '',
       body       TEXT NOT NULL DEFAULT '',                 -- Tiptap JSON or HTML as TEXT
       status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
       slug       TEXT,                                     -- nullable; public page (CV4)
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )

   version 21:
     CREATE TABLE IF NOT EXISTS video_compositions (
       id         TEXT PRIMARY KEY,
       title      TEXT NOT NULL DEFAULT '',
       spec       TEXT NOT NULL DEFAULT '{}',               -- Remotion composition JSON as TEXT
       status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
       slug       TEXT,                                     -- nullable; public page (CV4)
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )

   Add a short comment block above v20 (matching the existing comment style) noting:
   "CV1 MIG-01: additive content + video tables. Single-tenant — NO studio_id, NO
   ownableColumns. Reads use // guard:allow-unscoped. NEVER DROP/RENAME."

   Do NOT add Drizzle schema definitions in this task unless `tsc` requires them — the
   placeholder routes in Task 2 must NOT query these tables (they render static
   placeholders), so no schema export is needed yet. (CV2/CV3 add the Drizzle defs
   + CRUD.) If you find it cleaner to add the two Drizzle table defs to
   `apps/staff-web/server/db/schema.ts` now so view-screen (Task 3) can reference
   them, that is acceptable AS LONG AS it stays additive and tsc is green — but the
   simplest path is: view-screen reports a static/empty content+video screen this
   phase and does NOT query the new tables (see Task 3).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <done>
- package.json dependencies include @remotion/player + remotion at matching 4.x
  versions; NO @remotion/renderer, @remotion/lambda, or any tiptap-collaboration/y-* dep.
- pnpm-lock.yaml updated; `pnpm install` from root reports no changes afterward.
- db.ts runMigrations array has new v20 (content_documents) + v21 (video_compositions),
  both CREATE TABLE IF NOT EXISTS, existing rows untouched.
- tsc --noEmit passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Scaffold feature dirs + placeholder routes + GymosTopNav tabs (NAV-01 UI half)</name>
  <files>apps/staff-web/features/content/README.md, apps/staff-web/features/video/README.md, apps/staff-web/app/routes/gymos.content.tsx, apps/staff-web/app/routes/gymos.video.tsx, apps/staff-web/app/components/gymos/GymosTopNav.tsx</files>
  <action>
A) Scaffold fork dirs (CV2/CV3 copy the agent-native Content/Videos templates into
   these, then modify — fork-boundary discipline; templates/ never edited in place):
   - `apps/staff-web/features/content/README.md` — one short paragraph:
     "Content feature (CV2). Tiptap (non-collab) rich-doc editor + agent tools.
      Backed by content_documents (db.ts v20). Copy agent-native templates/content
      here in CV2, strip all collaboration/Yjs extensions, then adapt."
   - `apps/staff-web/features/video/README.md` — analogous:
     "Video feature (CV3). @remotion/player in-browser composition editor + agent
      tools. Backed by video_compositions (db.ts v21). Copy agent-native
      templates/videos here in CV3 (player only; NO @remotion/renderer/lambda)."
   (Markdown scaffold markers are enough — they keep the dirs in git and document
   intent without committing premature code.)

B) Placeholder routes under the gymos layout (flat-route dot = path segment, like
   gymos.campaigns.tsx). Each must (i) render a minimal placeholder, and (ii) SYNC the
   active tab into navigation application_state so view-screen + the agent know the
   current tab (NAV-01 context-awareness). Use the existing useNavigationState().sync.

   apps/staff-web/app/routes/gymos.content.tsx:
   ```tsx
   import { useEffect } from "react";
   import { IconFileText } from "@tabler/icons-react";
   import { useNavigationState } from "@/hooks/use-navigation-state";

   export function meta() {
     return [{ title: "GymClassOS — Content" }];
   }

   export default function ContentPage() {
     const navState = useNavigationState();
     useEffect(() => {
       navState.sync({ view: "content" });
       // eslint-disable-next-line react-hooks/exhaustive-deps
     }, []);
     return (
       <div className="flex flex-col gap-3 p-6 max-w-3xl mx-auto">
         <div className="flex items-center gap-2">
           <IconFileText size={18} className="text-muted-foreground" aria-hidden />
           <h1 className="text-base font-semibold">Content</h1>
         </div>
         <p className="text-[13px] text-muted-foreground">
           Rich content documents arrive in CV2 (Tiptap editor + agent tools).
         </p>
       </div>
     );
   }
   ```

   apps/staff-web/app/routes/gymos.video.tsx — identical shape with
   `IconVideo`, title "GymClassOS — Video", `view: "video"`, h1 "Video", and copy
   "In-browser video compositions arrive in CV3 (Remotion player + agent tools)."

   Confirm `@/hooks/use-navigation-state` is the correct alias (it is — other gymos
   code imports from `@/...`). If the route file naming needs `_index`-style
   handling, it does NOT: `gymos.content.tsx` nests under `gymos.tsx` and renders in
   its <Outlet />, exactly like `gymos.campaigns.tsx`.

C) GymosTopNav.tsx — add Content + Video tabs. Follow the EXACT existing pattern:
   - Add `const isContent = path.startsWith("/gymos/content");` and
     `const isVideo = path.startsWith("/gymos/video");` alongside the other `is*`.
   - These are studio-authoring surfaces. Place them with the admin-gated cluster
     (after Brain, before the right-aligned Settings/Sign-out group), each wrapped in
     `{isAdmin && (...)}` to match Campaigns/Forms/Brain (keeps the coach view clean):
       <Link to="/gymos/content" className={tabClass(isContent)}>Content</Link>
       <Link to="/gymos/video" className={tabClass(isVideo)}>Video</Link>
   - Text labels only in the nav (matches every other tab — they are text, not icon
     buttons). The Tabler icons (file-text / video) are used on the route pages
     (Task 2B), satisfying "pick sensible Tabler icons" without cluttering the strip.
   - Do NOT add emojis. Do NOT build any custom dropdown. shadcn/Tabler only.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <done>
- features/content/README.md + features/video/README.md exist (dirs tracked in git).
- gymos.content.tsx + gymos.video.tsx render placeholders and call navState.sync({view}).
- GymosTopNav shows Content + Video links to /gymos/content + /gymos/video (admin cluster).
- tsc --noEmit passes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Agent navigation — navigate enum + view-screen branches + gymos nav bridge (NAV-01 agent half)</name>
  <files>apps/staff-web/actions/navigate.ts, apps/staff-web/actions/view-screen.ts, apps/staff-web/app/components/gymos/GymosNavBridge.tsx, apps/staff-web/app/routes/gymos.tsx</files>
  <action>
Make the agent able to navigate to the new tabs AND make view-screen report them.

A) actions/navigate.ts — extend the `view` description string to include the new
   gymos routes so the agent knows they exist. Change the description text in BOTH
   the action-level `description` and the `view` field `.describe(...)` to append
   `content, video` to the route list (e.g. "...campaigns, forms, content, video,
   settings"). `view` stays a free-form `z.string().optional()` — no enum to widen.
   No other logic changes; it already does `writeAppState("navigate", nav)`.

B) actions/view-screen.ts — add explicit `content` and `video` branches BEFORE the
   final `else if (nav.view) { ...fetchEmailList... }` Gmail fall-through. Without
   this, view-screen on the Content/Video tab wrongly hits Gmail. Keep it lightweight
   this phase — report the active tab; do NOT require the new tables. Insert after the
   `nav.view === "campaigns"` branch:
   ```ts
   } else if (nav?.view === "content") {
     // CV1 NAV-01 — context-aware of the Content tab. CV2 will surface the
     // content_documents list here; for now report the active tab so the agent
     // knows where the user is.
     screen.content = { note: "Content tab — documents arrive in CV2." };
   } else if (nav?.view === "video") {
     // CV1 NAV-01 — context-aware of the Video tab. CV3 will surface the
     // video_compositions list here.
     screen.video = { note: "Video tab — compositions arrive in CV3." };
   }
   ```
   (If you DID add Drizzle defs for the new tables in Task 1, you MAY instead select
   id/title/status/updated_at with a `// guard:allow-unscoped — single-tenant` comment
   and the lazy `await import("../server/db/index.js")` pattern already in this file.
   Either is acceptable; the static note is the minimal green path.)

C) Create apps/staff-web/app/components/gymos/GymosNavBridge.tsx — the missing
   consumer that turns the agent's one-shot `navigate` write into a real route change
   ON THE GYMOS SURFACE (the legacy MessagesPage consumer routes to "/<view>" for
   mail and is NOT mounted on /gymos). Model the dedupe pattern on MessagesPage
   (~L428-464). It renders nothing (a side-effect-only component):
   ```tsx
   import { useEffect, useRef } from "react";
   import { useNavigate } from "react-router";
   import { useNavigationState } from "@/hooks/use-navigation-state";

   // Maps the agent's navigate({view}) command to a /gymos/<view> route. Mounted
   // once in the gymos layout so every /gymos/* child inherits it.
   const VIEW_TO_PATH: Record<string, string> = {
     home: "/gymos",
     inbox: "/gymos/messages",      // "inbox" is the WhatsApp conversations list
     messages: "/gymos/messages",
     schedule: "/gymos/schedule",
     members: "/gymos/members",
     analytics: "/gymos/analytics",
     campaigns: "/gymos/campaigns",
     forms: "/gymos/forms",
     brain: "/gymos/brain",
     content: "/gymos/content",
     video: "/gymos/video",
     settings: "/gymos/settings/integrations",
   };

   export function GymosNavBridge() {
     const navigate = useNavigate();
     const navState = useNavigationState();
     const { data: cmd } = navState.command;
     const lastRef = useRef<string>("");
     useEffect(() => {
       if (!cmd) return;
       const key = JSON.stringify(cmd);
       if (key === lastRef.current) return;
       lastRef.current = key;
       const target = cmd.view ? VIEW_TO_PATH[cmd.view] : undefined;
       if (target) navigate(target);
       navState.clearCommand();
       // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [cmd]);
     return null;
   }
   ```
   Verify the path map against GymosTopNav's actual `to=` values (messages, schedule,
   members, analytics, campaigns, forms, brain, settings/integrations) so existing
   agent navigation keeps working too — this bridge is also the first correct gymos
   navigate consumer, so confirm those routes exist (they all do per the routes dir).

D) Mount the bridge in apps/staff-web/app/routes/gymos.tsx so it lives on every
   /gymos/* page (it renders null — purely a command consumer). Add the import and
   render it inside the layout, e.g. just under <GymosTopNav />:
   ```tsx
   import { GymosNavBridge } from "@/components/gymos/GymosNavBridge";
   // ...
   <GymosTopNav />
   <GymosNavBridge />
   ```
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <done>
- navigate.ts description lists content + video as reachable gymos routes.
- view-screen.ts returns a content/video screen branch for nav.view content|video
  (no Gmail fall-through for those views).
- GymosNavBridge.tsx consumes navState.command and routes view -> /gymos/<view>,
  clearing the command; mounted once in gymos.tsx.
- tsc --noEmit passes.
  </done>
</task>

</tasks>

<verification>
Phase-level checks (all must hold after the three tasks):

1. Build/type safety (the only local gate — no dev server):
   `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0.

2. Dependency hygiene:
   - `apps/staff-web/package.json` contains `@remotion/player` + `remotion` (matching
     4.x), and contains NEITHER `@remotion/renderer`/`@remotion/lambda` NOR any
     `@tiptap/extension-collaboration*` / `y-prosemirror` / `yjs` / `y-indexeddb`.
   - `pnpm install` from repo root is a no-op (lockfile already consistent).

3. Migrations (verified AFTER merge to master, against gymos-demo Neon via Neon MCP —
   project billowing-sun-51091059):
   - `content_documents` and `video_compositions` tables exist with the columns above.
   - Idempotency: both are CREATE TABLE IF NOT EXISTS, so a second boot/migration run
     does not error.
   (db.ts migrations auto-run on server boot via runMigrations — but note the standing
   gotcha that standalone server/db/migrations/*.sql files are NOT auto-run; these are
   in the runMigrations array, so they DO auto-apply on the Vercel deploy boot.)

4. Nav wiring (smoke-verified on the Vercel deploy gym-class-os.vercel.app after
   merge — NOT locally):
   - Content + Video tabs appear in GymosTopNav (admin) and route to /gymos/content,
     /gymos/video (placeholder pages render).
   - Asking the agent to "go to the content tab" / "open video" routes the gymos UI to
     the matching tab (GymosNavBridge consumes the navigate command).
   - view-screen on those tabs returns a content/video screen object, not a Gmail list.

Post-merge Vercel build success (no server/plugins helper-file bundling error) is the
final gate for Success Criteria #2 — there are no new server/lib or server/plugins
files in this phase, so the risk is low, but confirm the deploy is green.
</verification>

<success_criteria>
- tsc --noEmit green with Remotion installed (Tiptap already present).
- content_documents + video_compositions exist in gymos-demo Neon; migration idempotent.
- /gymos/content + /gymos/video routes exist and render placeholders; tabs in GymosTopNav.
- Agent navigate({view:'content'|'video'}) routes the gymos UI; view-screen reports the
  active tab for content/video (no Gmail fall-through).
- application_state navigation reflects the active tab (each route calls navState.sync).
- features/content + features/video scaffold dirs exist for CV2/CV3 to fork into.
</success_criteria>

<output>
After completion, create `.planning/phases/CV1-foundation/CV1-01-SUMMARY.md` recording:
- exact Remotion versions installed,
- the migration versions used (20, 21) and the two table DDLs,
- the new files (routes, GymosNavBridge, feature READMEs) and the GymosTopNav diff,
- the navigate/view-screen edits,
- and a note for CV2/CV3 that Tiptap is already present (no dep work needed in CV2) and
  that GymosNavBridge is the gymos navigate consumer to reuse.
</output>
