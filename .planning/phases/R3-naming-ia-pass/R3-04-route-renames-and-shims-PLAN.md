---
phase: R3-naming-ia-pass
plan: 04
type: execute
wave: 4
depends_on: [R3-03]
files_modified:
  - apps/staff-web/app/routes/gymos.messages.tsx
  - apps/staff-web/app/routes/gymos.inbox.tsx
  - apps/staff-web/app/routes/gymos.compose.tsx
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
autonomous: true
requirements: [NAME-03, NAME-05]
must_haves:
  truths:
    - "The live messaging surface is served at /gymos/messages"
    - "Navigating to the old /gymos/inbox path 301-redirects to /gymos/messages (not 404)"
    - "Query params (?conversation=, ?filter=leads) survive the redirect"
    - "Both old (shim) and new routes remain live — old route is NOT removed in R3"
    - "No DB enum value or schema column was renamed (NAME-05)"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.messages.tsx"
      provides: "The relocated messaging surface (was gymos.inbox.tsx)"
      contains: "export default function GymosMessages"
    - path: "apps/staff-web/app/routes/gymos.inbox.tsx"
      provides: "301 redirect shim to /gymos/messages preserving query string"
      contains: "redirect("
  key_links:
    - from: "apps/staff-web/app/routes/gymos.inbox.tsx (shim)"
      to: "/gymos/messages"
      via: "loader = ({ request }) => redirect(...)"
      pattern: "redirect\\("
    - from: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      to: "/gymos/messages"
      via: "<Link to=\"/gymos/messages\">"
      pattern: "to=\"/gymos/messages\""
---

<objective>
Wave 4 of R3 (route layer) — the highest-risk pass, sequenced last per CONTEXT D-05. Rename the live coach route `/gymos/inbox` → `/gymos/messages`, add a 301 redirect shim on the OLD path (so the live customer Hustle's daily-use bookmarks/deep links never 404, per PITFALL R-06), update ALL hardcoded refs atomically, and rename the route file + default export. Plus a standing NAME-05 verification that no DB identifier was touched.

Purpose: Completes ROADMAP R3 SC1 (route reads gym-domain), SC3 (old route 301-redirects, not 404), and SC6 (DB untouched). The live URL `https://gym-class-os.vercel.app/gymos/inbox` is used daily by Hustle — the shim is mandatory and STAYS in place through R3 (D-08: old-route removal is a later post-deploy-verification step, NOT in this plan).

Output: New `gymos.messages.tsx` (the relocated surface), `gymos.inbox.tsx` reduced to a query-preserving redirect shim, `gymos.compose.tsx` re-export repointed, GymosTopNav link repointed, all self-referential refs updated. Old + new routes both live.

CRITICAL ordering within this plan: add the shim and update refs ATOMICALLY (one commit) per R-06, so there is never a window where a ref points at a renamed-away file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/R3-naming-ia-pass/R3-CONTEXT.md
@.planning/phases/R1-audit-baseline/NAMING-RECORD.md
@.planning/research/PITFALLS.md

<ref_inventory>
Grep-verified `/gymos/inbox` references (2026-06-13). ALL must be updated atomically:
- `app/components/gymos/GymosTopNav.tsx:71` — `<Link to="/gymos/inbox" ...>` (the nav link; label was changed to "Messages" in R3-01, route still /gymos/inbox). Also `:32` `const isInbox = path.startsWith("/gymos/inbox")` — update the path check to `/gymos/messages`.
- `app/routes/gymos.inbox.tsx:551` — `return redirect(\`/gymos/inbox?conversation=${conversationId}&sent=1\`)` (template-send branch)
- `app/routes/gymos.inbox.tsx:593` — `return redirect(\`/gymos/inbox?conversation=${conversationId}&sent=1\`)` (send-text branch)
- `app/routes/gymos.inbox.tsx:667` — `<Link to="/gymos/inbox">` (Messages filter chip)
- `app/routes/gymos.inbox.tsx:680` — `<Link to="/gymos/inbox?filter=leads">` (Leads chip)
- `app/routes/gymos.inbox.tsx:705` — `to={\`/gymos/inbox?conversation=${c.id}...\`}` (conversation list row link)
- `app/routes/gymos.inbox.tsx:785` — `to={\`/gymos/inbox?conversation=${data.conversations[0].id}\`}` (empty-state CTA)
- `app/routes/gymos.compose.tsx` — resource route; the inbox `<Form action="/gymos/compose">` posts here and it re-exports `{ action } from "./gymos.inbox"`. After the file rename, repoint this re-export to `./gymos.messages`.
Note: `gymos.inbox.tsx:22-23,765` are CODE COMMENTS mentioning /gymos/inbox — update for accuracy where trivial, not required for correctness.
The legacy `/inbox` (mail) refs in AppLayout/CommandPalette/SearchBar/NotFound already funnel to `/gymos` via `$view.tsx` and are NOT the live `/gymos/inbox` route — they are out of scope for this route rename (they were addressed at the label level in R3-01 where user-visible; their `/inbox` hrefs stay shimmed by `$view`).
</ref_inventory>

<rr_v7_redirect_note>
React Router v7 `redirect(url, init)` from a loader. To preserve the query string, the shim loader must read the incoming request URL's search and append it to the target. Pattern:
```ts
import { redirect, type LoaderFunctionArgs } from "react-router";
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/gymos/messages${url.search}`, 301);
}
```
This forwards `?conversation=...`, `?filter=leads`, `?sent=1` etc. unchanged. Loaders return the Response from `redirect()` (no `json()`).
</rr_v7_redirect_note>

<constraints>
- Fork boundary: edit ONLY apps/staff-web/. Never touch templates/*, packages-vendored/*, mobile, DB schema/migrations.
- No local dev server. Redirect-on-deploy proof is a HUMAN-UAT item (curl -I against the Vercel preview must return 301) — NOT verifiable locally. Local verification is grep/static only.
- KEEP BOTH routes live. Do NOT delete `gymos.inbox.tsx` — it becomes the shim. (D-08: removal is post-verification, later.)
- File rename mechanic: create `gymos.messages.tsx` with the FULL current contents of `gymos.inbox.tsx` (surface + loader + action + default export), then REPLACE `gymos.inbox.tsx`'s contents with the shim. Both files exist at the end.
- The relocated surface's OWN self-referential refs (the redirect targets ~551/593, the chip/list/CTA links ~667/680/705/785) must point to `/gymos/messages` in the NEW file.
- NAME-05: do NOT rename any DB enum value or schema column. The `?filter=leads` query and `status='lead'` DB value are untouched (only the URL path changes).
- Run `npx prettier --write` on all touched files.
</constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Relocate the surface to gymos.messages.tsx + rename export (NAME-03)</name>
  <read_first>
    - apps/staff-web/app/routes/gymos.inbox.tsx (the file being relocated; full file — loader/action/default export GymosInbox ~629; self-refs at 551/593/667/680/705/785)
    - apps/staff-web/app/routes/gymos.compose.tsx (re-exports action from ./gymos.inbox)
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md (Route Layer — /gymos/inbox → /gymos/messages; Identifier — GymosInbox → GymosMessages)
  </read_first>
  <files>apps/staff-web/app/routes/gymos.messages.tsx, apps/staff-web/app/routes/gymos.compose.tsx</files>
  <action>
    1. Create `app/routes/gymos.messages.tsx` containing the ENTIRE current contents of `gymos.inbox.tsx` (do not yet delete the old file — Task 2 converts it to a shim). In the new file:
       - Rename the default export `export default function GymosInbox()` (~629) → `export default function GymosMessages()`.
       - Repoint every self-referential `/gymos/inbox` to `/gymos/messages`:
         - redirect targets ~551 and ~593: `redirect(\`/gymos/inbox?conversation=...&sent=1\`)` → `redirect(\`/gymos/messages?conversation=...&sent=1\`)`.
         - filter chip ~667: `to="/gymos/inbox"` → `to="/gymos/messages"`.
         - leads chip ~680: `to="/gymos/inbox?filter=leads"` → `to="/gymos/messages?filter=leads"`.
         - list row ~705: `/gymos/inbox?conversation=...` → `/gymos/messages?conversation=...`.
         - empty-state CTA ~785: `/gymos/inbox?conversation=...` → `/gymos/messages?conversation=...`.
       - Update the `<Form action="/gymos/compose">` — leave `action="/gymos/compose"` AS-IS (the compose resource route keeps its path; Task updates its re-export source, not its URL). Keep `meta()` title "GymClassOS — Messages" (set in R3-01).
       - Update trivial code comments mentioning `/gymos/inbox` to `/gymos/messages` for accuracy (optional, non-blocking).
    2. In `gymos.compose.tsx`: change the re-export source `export { action } from "./gymos.inbox";` → `export { action } from "./gymos.messages";` (the action implementation now lives in the relocated file). Keep the route path `/gymos/compose` unchanged.

    Run `npx prettier --write apps/staff-web/app/routes/gymos.messages.tsx apps/staff-web/app/routes/gymos.compose.tsx`.
  </action>
  <acceptance_criteria>
    - `ls apps/staff-web/app/routes/gymos.messages.tsx` exists.
    - `grep -n "export default function GymosMessages" apps/staff-web/app/routes/gymos.messages.tsx` matches.
    - `grep -c "/gymos/inbox" apps/staff-web/app/routes/gymos.messages.tsx` returns 0 in non-comment lines (all self-refs repointed; any residual is a `//` comment).
    - `grep -c "/gymos/messages" apps/staff-web/app/routes/gymos.messages.tsx` returns >= 6 (redirect x2, chip, leads chip, list row, CTA).
    - `grep -n "from \"./gymos.messages\"" apps/staff-web/app/routes/gymos.compose.tsx` matches; `grep -n "from \"./gymos.inbox\"" apps/staff-web/app/routes/gymos.compose.tsx` returns 0.
  </acceptance_criteria>
  <verify>
    <automated>grep -n "/gymos/inbox" apps/staff-web/app/routes/gymos.messages.tsx | grep -v "//" ; test $? -ne 0 && echo "PASS: relocated surface has no live /gymos/inbox refs"</automated>
  </verify>
  <done>The messaging surface lives at gymos.messages.tsx with export GymosMessages; all self-refs point to /gymos/messages; compose resource route re-exports from gymos.messages.</done>
</task>

<task type="auto">
  <name>Task 2: Convert gymos.inbox.tsx to a query-preserving 301 redirect shim (NAME-03, R-06)</name>
  <read_first>
    - apps/staff-web/app/routes/gymos.inbox.tsx (the file being replaced with a shim)
    - .planning/research/PITFALLS.md (R-06 — add redirect() loader to OLD route; keep old route alive; preserve query)
    - .planning/phases/R3-naming-ia-pass/R3-CONTEXT.md (D-06/D-08 — shim stays; query params must survive)
  </read_first>
  <files>apps/staff-web/app/routes/gymos.inbox.tsx</files>
  <action>
    REPLACE the entire contents of `gymos.inbox.tsx` with a minimal redirect shim that preserves the query string and returns 301. The old file keeps existing (it is the shim) — do NOT delete it (D-08). Full file contents:
    ```ts
    // R3-04 route shim — /gymos/inbox → /gymos/messages (301, query-preserving).
    // The messaging surface was relocated to gymos.messages.tsx in R3 (NAME-03).
    // Hustle (live customer) uses /gymos/inbox daily; this shim keeps their
    // bookmarks / deep links / WhatsApp-shared URLs working. Per CONTEXT D-08
    // the shim STAYS through R3 — removing the old route is a later step, only
    // after the redirect is verified on the live Vercel deploy.
    import { redirect, type LoaderFunctionArgs } from "react-router";

    export function loader({ request }: LoaderFunctionArgs) {
      const url = new URL(request.url);
      // Forward ?conversation=, ?filter=leads, ?sent=1 etc. unchanged.
      return redirect(`/gymos/messages${url.search}`, 301);
    }
    ```
    No default export / no component (the loader redirects before render). The send `action` now lives in gymos.messages.tsx (compose route re-exports from there per Task 1), so the shim does NOT need to re-export an action.

    Run `npx prettier --write apps/staff-web/app/routes/gymos.inbox.tsx`.
  </action>
  <acceptance_criteria>
    - `grep -n "redirect(\`/gymos/messages\${url.search}\`, 301)" apps/staff-web/app/routes/gymos.inbox.tsx` matches (301 + query preserved).
    - `grep -n "export function loader" apps/staff-web/app/routes/gymos.inbox.tsx` matches.
    - `grep -c "export default" apps/staff-web/app/routes/gymos.inbox.tsx` returns 0 (shim has no component).
    - The file is short (< 25 lines) — `wc -l apps/staff-web/app/routes/gymos.inbox.tsx` confirms it is now a shim, not the full surface.
    - `ls apps/staff-web/app/routes/gymos.inbox.tsx apps/staff-web/app/routes/gymos.messages.tsx` — BOTH exist (old route kept live per D-08).
  </acceptance_criteria>
  <verify>
    <automated>grep -n "redirect(\`/gymos/messages" apps/staff-web/app/routes/gymos.inbox.tsx && test -f apps/staff-web/app/routes/gymos.messages.tsx && echo "PASS: shim in place, both routes live"</automated>
  </verify>
  <done>gymos.inbox.tsx is a 301 query-preserving shim to /gymos/messages; both old and new routes exist; no surface logic duplicated in the shim.</done>
</task>

<task type="auto">
  <name>Task 3: Update GymosTopNav route + path-active check; NAME-05 no-DB-touch verification</name>
  <read_first>
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (the file being edited; nav link ~71, isInbox check ~32)
    - .planning/phases/R3-naming-ia-pass/R3-CONTEXT.md (D-09 NAME-05 standing constraint)
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md (§NAME-05 — Do Not Touch table)
  </read_first>
  <files>apps/staff-web/app/components/gymos/GymosTopNav.tsx</files>
  <action>
    In GymosTopNav.tsx:
    1. Nav link (~71): `<Link to="/gymos/inbox" className={tabClass(isInbox)}>` → `<Link to="/gymos/messages" className={tabClass(isMessages)}>`. (Its child text is already "Messages" from R3-01.)
    2. Active-path check (~32): `const isInbox = path.startsWith("/gymos/inbox");` → `const isMessages = path.startsWith("/gymos/messages");`. Update the `tabClass(isInbox)` usage to `tabClass(isMessages)`. (Optional nicety: the active highlight will now match `/gymos/messages`; the old `/gymos/inbox` immediately redirects so its highlight state is irrelevant.)
    3. Keep all other nav items unchanged.

    NAME-05 VERIFICATION (no edits — assertion only). Run a grep to PROVE this entire R3 phase touched no DB identifier:
    - Confirm no schema/migration file appears in this plan's diff. The DB enum values in NAMING-RECORD §NAME-05 (`open`/`closed`/`snoozed`/`lead` on conversations.status; `scheduled`/`cancelled`/`completed`; `booked`/`waitlist`/`attended`/`no_show`; `draft`/`published`; `pending`/`processing`/`done`) must be unchanged. Record the grep result in the SUMMARY.

    Run `npx prettier --write apps/staff-web/app/components/gymos/GymosTopNav.tsx`.
  </action>
  <acceptance_criteria>
    - `grep -n "to=\"/gymos/messages\"" apps/staff-web/app/components/gymos/GymosTopNav.tsx` matches.
    - `grep -n "to=\"/gymos/inbox\"" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns 0 (nav link repointed).
    - `grep -n "isMessages" apps/staff-web/app/components/gymos/GymosTopNav.tsx` matches; `grep -n "isInbox" ...` returns 0.
    - NAME-05: `git diff --name-only` lists NO file matching `*/server/db/schema*` or `*/migrations/*`. Running `git diff -- 'apps/staff-web/server/db/**'` produces empty output.
    - Final phase-wide assertion: `grep -rn "to=\"/gymos/inbox\"\|navigate(\"/gymos/inbox\"\|navigate('/gymos/inbox" apps/staff-web/app` returns 0 LIVE refs (only the shim's own redirect target string `/gymos/messages` and code comments remain; the shim file itself does not contain `to="/gymos/inbox"`).
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "to=\"/gymos/inbox\"" apps/staff-web/app ; test $? -ne 0 && git diff --name-only | grep -E "server/db/schema|migrations/" ; test $? -ne 0 && echo "PASS: nav repointed + NAME-05 DB untouched"</automated>
  </verify>
  <done>Nav links to /gymos/messages with matching active-path check; no live /gymos/inbox refs remain (only the shim); NAME-05 verified — zero DB schema/enum/migration changes across the phase.</done>
</task>

</tasks>

<verification>
Static/grep verification (no dev server):
- New route exists + old route is a shim: both `gymos.messages.tsx` and `gymos.inbox.tsx` present; shim has a `redirect(.../gymos/messages, 301)` loader and no default export.
- Zero live `/gymos/inbox` navigation refs: `grep -rn "to=\"/gymos/inbox\"\|navigate(\"/gymos/inbox\|redirect(\`/gymos/inbox" apps/staff-web/app` returns nothing (shim's loader redirects FROM the route, it does not link TO /gymos/inbox).
- Query preservation encoded: the shim builds `/gymos/messages${url.search}`.
- NAME-05: `git diff -- 'apps/staff-web/server/db'` is empty; no enum-array string value changed anywhere in the phase.
- Fork boundary: no edits outside apps/staff-web/.

HUMAN-UAT (deferred — no local dev server; runs on the next Vercel deploy):
- `curl -I https://<preview>/gymos/inbox` returns `301` with `location: /gymos/messages`.
- `curl -I "https://<preview>/gymos/inbox?conversation=<id>"` redirects preserving `?conversation=<id>`.
- `/gymos/messages` renders the messaging surface; the old `/gymos/inbox` does NOT 404.
</verification>

<success_criteria>
- ROADMAP R3 SC1 (route): the messaging surface is at /gymos/messages; nav links there.
- ROADMAP R3 SC3: old /gymos/inbox path 301-redirects (query-preserving), does not 404; both routes live (D-08).
- ROADMAP R3 SC6 / NAME-05: DB enum values + schema columns untouched across the whole phase (verified by empty schema diff).
- NAME-03 satisfied: every renamed route ships a redirect shim; all hardcoded refs updated atomically.
</success_criteria>

<output>
After completion, create `.planning/phases/R3-naming-ia-pass/R3-04-SUMMARY.md`
</output>
