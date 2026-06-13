---
phase: R3-naming-ia-pass
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
  - apps/staff-web/app/routes/gymos.inbox.tsx
  - apps/staff-web/app/routes/gymos.members.tsx
  - apps/staff-web/app/routes/gymos.payments.tsx
  - apps/staff-web/app/routes/gymos.members_.$id.tsx
  - apps/staff-web/app/components/layout/AppLayout.tsx
autonomous: true
requirements: [NAME-01, NAME-02, NAME-06, NAME-07]
must_haves:
  truths:
    - "The staff nav shows 'Messages' (not 'Inbox') as the WhatsApp surface label"
    - "The messaging surface heading reads 'Messages' (not 'WhatsApp Inbox')"
    - "No user-visible 'Inbox', 'Compose', or 'Draft Queue' text remains in staff-web"
    - "The member detail view shows an explicit 'Member Profile' heading"
    - "Pass balance is displayed as 'X credits'"
  artifacts:
    - path: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      provides: "Nav label 'Messages' for the WhatsApp surface"
      contains: ">\\n        Messages"
    - path: "apps/staff-web/app/routes/gymos.inbox.tsx"
      provides: "Messaging surface heading + meta title using 'Messages'"
      contains: "Messages"
    - path: "apps/staff-web/app/routes/gymos.members_.$id.tsx"
      provides: "Explicit 'Member Profile' heading"
      contains: "Member Profile"
  key_links:
    - from: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      to: "the rendered nav label text node"
      via: "JSX text inside <Link to=\"/gymos/inbox\">"
      pattern: "Messages"
---

<objective>
Wave 1 of R3 (label layer). Replace all user-visible email-client vocabulary on the live staff-web `/gymos/*` surfaces AND the legacy mail chrome with gym-domain copy. Labels only — NO route, file, component, CSS class, or DB changes in this plan. This is the lowest-risk pass and is sequenced first per CONTEXT D-05 (label → CSS → identifier → route).

Purpose: Coaches read "Messages", not "Inbox"; "Member Profile", not a bare name; pass balance as "X credits". Eliminates the email mental model from every screen a user reads. Satisfies ROADMAP R3 success criteria 1 (nav), 2 (messaging heading), 5 (member profile + credits).

Output: Six files edited with copy changes only. Routes, component names, and CSS classes are UNCHANGED (those are waves 2-4). The `to="/gymos/inbox"` props stay as-is in this wave — the route rename happens in R3-04 with its shim.
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

<constraints>
- Fork boundary: edit ONLY files under apps/staff-web/. Never touch templates/*, packages-vendored/*, packages/mobile-app, or any DB schema/migration file.
- No local dev server (NitroViteError). Verification is grep-based only — NO local HTTP walkthrough.
- This wave changes user-visible STRINGS ONLY. Do NOT rename any route path, file, component, function, or CSS class. Do NOT change any `to=`/`href=`/`navigate()`/`redirect()` target. Do NOT change `action="/gymos/compose"`.
- RR v7: loaders return plain objects/Response (no json()). `@/` import alias.
- Run `npx prettier --write` on every edited file after changes.
</constraints>

<line_refs_note>
Line numbers below were grep-verified on 2026-06-13 but may shift after edits within the same file. Each task says to grep-locate the current string, not trust the literal line number.
</line_refs_note>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Nav label + live messaging surface labels (NAME-01, NAME-02)</name>
  <read_first>
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (the file being edited; nav label "Inbox" ~line 71-73)
    - apps/staff-web/app/routes/gymos.inbox.tsx (the file being edited; meta ~line 64, heading ~line 653, chip ~line 677)
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md (Label Layer table — rename targets)
  </read_first>
  <files>apps/staff-web/app/components/gymos/GymosTopNav.tsx, apps/staff-web/app/routes/gymos.inbox.tsx</files>
  <action>
    In GymosTopNav.tsx — change ONLY the visible nav link TEXT for the WhatsApp surface. Grep for the `<Link to="/gymos/inbox">` whose child text is `Inbox` (currently ~lines 71-73):
    ```
          <Link to="/gymos/inbox" className={tabClass(isInbox)}>
            Inbox
          </Link>
    ```
    Change the child text `Inbox` → `Messages`. Keep `to="/gymos/inbox"` UNCHANGED (route rename is R3-04). Keep the `isInbox` variable name and all other nav items (Home, Schedule, Members, Payments, Analytics, Campaigns, Forms, Settings) UNCHANGED — CONTEXT D-01 keeps those.

    In gymos.inbox.tsx — three string-only edits (grep-locate each):
    1. `meta()` return (~line 64): `{ title: "GymClassOS — WhatsApp Inbox" }` → `{ title: "GymClassOS — Messages" }`.
    2. Surface heading (~line 653): the JSX expression `{isLeadsView ? "Leads" : "WhatsApp Inbox"}` → `{isLeadsView ? "Leads" : "Messages"}`. (Keep the `"Leads"` branch — already gym-domain per NAMING-RECORD.)
    3. Filter chip text (~line 677): the chip text node `Inbox` inside `<Link to="/gymos/inbox">` (the chip next to the `<IconInbox>`) → `Messages`. Keep the `to="/gymos/inbox"` prop and the `IconInbox` import/usage UNCHANGED (icon rename is not in scope; route is R3-04). Keep the `Leads` chip (`<Link to="/gymos/inbox?filter=leads">`) text UNCHANGED.

    Do NOT change the inline reply form `Send` button text (~line 917) — "Send" is correct for an inline reply and is not email vocabulary. Do NOT change `action="/gymos/compose"`.

    Run `npx prettier --write apps/staff-web/app/components/gymos/GymosTopNav.tsx apps/staff-web/app/routes/gymos.inbox.tsx`.
  </action>
  <acceptance_criteria>
    - `grep -n ">\s*Messages\s*<\|>Messages<" apps/staff-web/app/components/gymos/GymosTopNav.tsx` shows the nav label is now Messages (the Inbox text node is gone).
    - `grep -c ">Inbox<\|>\s*Inbox\s*<" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns 0 (no visible "Inbox" text node; the `isInbox` variable and `IconInbox` are NOT text nodes so they may still appear — verify by checking the grep matches only the JSX child).
    - `grep -n "GymClassOS — Messages" apps/staff-web/app/routes/gymos.inbox.tsx` matches (meta updated).
    - `grep -n "WhatsApp Inbox" apps/staff-web/app/routes/gymos.inbox.tsx` returns 0 matches in user-visible strings (the `meta` title and the heading no longer say "WhatsApp Inbox"; a code comment mentioning it is acceptable — verify any remaining match is inside a `//` comment, not JSX/string).
    - `grep -n "to=\"/gymos/inbox\"" apps/staff-web/app/components/gymos/GymosTopNav.tsx` STILL matches (route unchanged this wave — proves we did labels only).
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "WhatsApp Inbox" apps/staff-web/app/routes/gymos.inbox.tsx apps/staff-web/app/components/gymos/GymosTopNav.tsx | grep -v "^.*//.*WhatsApp Inbox" | grep -v "WhatsApp Inbox —" ; test $? -ne 0 && echo "PASS: no visible WhatsApp Inbox label"</automated>
  </verify>
  <done>Nav reads "Messages"; messaging surface heading + page title read "Messages"; filter chip reads "Messages"; routes/icons/variables untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Member profile heading + back-link copy + payments back-link (NAME-07, NAME-01)</name>
  <read_first>
    - apps/staff-web/app/routes/gymos.members_.$id.tsx (the file being edited; h1 ~line 167, "credits" ~line 212/231)
    - apps/staff-web/app/routes/gymos.members.tsx (the file being edited; "← Back to inbox" ~line 175, links to /gymos)
    - apps/staff-web/app/routes/gymos.payments.tsx (the file being edited; "← Back to inbox" ~line 52, links to /gymos)
  </read_first>
  <files>apps/staff-web/app/routes/gymos.members_.$id.tsx, apps/staff-web/app/routes/gymos.members.tsx, apps/staff-web/app/routes/gymos.payments.tsx</files>
  <action>
    In gymos.members_.$id.tsx (NAME-07) — add an explicit "Member Profile" heading. Grep-locate the member name `<h1 className="text-sm font-semibold">{fullName}</h1>` (~line 167). Immediately ABOVE that `<h1>`, inside the same `<div>`, add a small eyebrow label so the view is explicitly headed "Member Profile":
    ```
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Member Profile
                </div>
    ```
    Keep `{fullName}` as the `<h1>`. Do NOT change the `meta()` (already "GymClassOS — Member Profile"). The pass balance already renders as `{...} credits` (~lines 212, 231) — leave the "credits" wording as-is (it already satisfies NAME-07); do NOT restyle (that is R4).

    In gymos.members.tsx — grep-locate the back-link text `← Back to inbox` (~line 175). Its `<Link>` `to` prop is `/gymos` (the Noticeboard Home, NOT the messages surface). Change ONLY the text `← Back to inbox` → `← Home` (accurate: it returns to `/gymos` Home). Keep `to="/gymos"` UNCHANGED.

    In gymos.payments.tsx — grep-locate the back-link text `← Back to inbox` (~line 52). Same situation: `to="/gymos"`. Change ONLY the text `← Back to inbox` → `← Home`. Keep `to="/gymos"` UNCHANGED.

    Run `npx prettier --write apps/staff-web/app/routes/gymos.members_.\$id.tsx apps/staff-web/app/routes/gymos.members.tsx apps/staff-web/app/routes/gymos.payments.tsx`.
  </action>
  <acceptance_criteria>
    - `grep -n "Member Profile" apps/staff-web/app/routes/gymos.members_.$id.tsx` matches BOTH the meta title and the new eyebrow heading (2+ matches).
    - `grep -rn "Back to inbox" apps/staff-web/app/routes/gymos.members.tsx apps/staff-web/app/routes/gymos.payments.tsx` returns 0 matches.
    - `grep -n "← Home" apps/staff-web/app/routes/gymos.members.tsx apps/staff-web/app/routes/gymos.payments.tsx` returns 2 matches.
    - `grep -n "credits" apps/staff-web/app/routes/gymos.members_.$id.tsx` STILL matches (pass balance label preserved).
    - `grep -cn "to=\"/gymos\"" apps/staff-web/app/routes/gymos.members.tsx` STILL matches (back-link route unchanged).
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "Back to inbox" apps/staff-web/app/routes/ ; test $? -ne 0 && echo "PASS: no Back to inbox text in gymos routes"</automated>
  </verify>
  <done>Member detail view shows an explicit "Member Profile" eyebrow + name; pass balance still reads "X credits"; both back-links read "← Home" with their `/gymos` targets intact.</done>
</task>

<task type="auto">
  <name>Task 3: Eliminate legacy mail chrome vocabulary — Compose, Draft queue (NAME-02)</name>
  <read_first>
    - apps/staff-web/app/components/layout/AppLayout.tsx (the file being edited; "Compose" ~line 1173, "Draft queue" labels ~lines 1396, 1701, 1754)
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md (Label Layer — Compose/Draft Queue are email vocabulary to remove)
    - .planning/phases/R3-naming-ia-pass/R3-CONTEXT.md (D-01/D-02: no "Compose" or "Draft Queue" visible anywhere)
  </read_first>
  <files>apps/staff-web/app/components/layout/AppLayout.tsx</files>
  <action>
    AppLayout.tsx is the legacy mail chrome (wraps non-`/gymos` routes; reachable via `/inbox`, `/draft-queue`). CONTEXT D-01/D-02 require NO visible "Compose" or "Draft Queue" anywhere. Change visible TEXT ONLY — do NOT rename routes, hrefs, ids, handlers, or the `/draft-queue` paths (route handling is R3-04; this wave is labels only).

    1. Grep-locate `<span>Compose</span>` (~line 1173). Change the visible text `Compose` → `New Message` (NAME-02). Keep the surrounding button/handler (`onCompose`, `handleCompose`) UNCHANGED.
    2. Grep-locate every `label: "Draft queue"` (~lines 1396, 1754) — change the string value `"Draft queue"` → `"Scheduled Messages"` (NAME-02). Keep the `href: "/draft-queue"` and `id` values UNCHANGED.
    3. Grep-locate the title return `if (location.pathname.startsWith("/draft-queue")) return "Draft queue";` (~line 1701) — change the returned string `"Draft queue"` → `"Scheduled Messages"`. Keep the `pathname.startsWith("/draft-queue")` check UNCHANGED.
    4. Grep-locate any nav entry `{ id: "inbox", label: "Inbox", href: "/inbox" }` (~lines 1389, 1747) — change the `label` value `"Inbox"` → `"Messages"`. Keep `id: "inbox"` and `href: "/inbox"` UNCHANGED.

    Run `npx prettier --write apps/staff-web/app/components/layout/AppLayout.tsx`.
  </action>
  <acceptance_criteria>
    - `grep -n ">Compose<\|\"Compose\"\|'Compose'" apps/staff-web/app/components/layout/AppLayout.tsx` returns 0 visible-text matches (handler/hook identifiers like `handleCompose`, `onCompose`, `useComposeState` are NOT visible text and may remain — confirm matches are only identifiers).
    - `grep -n "Draft queue\|Draft Queue" apps/staff-web/app/components/layout/AppLayout.tsx` returns 0 matches in `label:`/return-string positions (a `/draft-queue` href/path is NOT the words "Draft queue" — those stay).
    - `grep -n "label: \"Inbox\"" apps/staff-web/app/components/layout/AppLayout.tsx` returns 0 matches.
    - `grep -cn "href: \"/inbox\"\|href: \"/draft-queue\"" apps/staff-web/app/components/layout/AppLayout.tsx` STILL matches (routes unchanged this wave).
  </acceptance_criteria>
  <verify>
    <automated>grep -rn "Draft queue\|Draft Queue" apps/staff-web/app/components/layout/AppLayout.tsx | grep "label:\|return \"" ; test $? -ne 0 && echo "PASS: no Draft Queue labels"</automated>
  </verify>
  <done>Legacy mail chrome shows "New Message" (not Compose), "Scheduled Messages" (not Draft queue), and "Messages" (not Inbox) — all routes/hrefs/ids/handlers untouched.</done>
</task>

</tasks>

<verification>
After all three tasks (grep-based, no dev server):
- `grep -rn ">Compose<\|>Inbox<\|Draft queue\|Draft Queue\|WhatsApp Inbox\|Back to inbox" apps/staff-web/app` returns only: code comments, route-path strings (`/inbox`, `/draft-queue`), and identifier names (`isInbox`, `IconInbox`, `handleCompose`) — ZERO user-visible label strings.
- `grep -rn "Member Profile" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns 2+ (meta + heading).
- No file outside `apps/staff-web/app/` was modified. No `to=`/`href=`/`navigate`/`redirect`/`action=` target changed. No CSS class, component, or file renamed.
- NAME-05 guard: `git diff --name-only` shows NO change to any `*/server/db/schema*` or `*/migrations/*` file.
</verification>

<success_criteria>
- ROADMAP R3 SC1 (partial — nav label): nav shows "Messages" not "Inbox".
- ROADMAP R3 SC2 (partial — heading): messaging surface heading + title read "Messages".
- ROADMAP R3 SC5: member detail headed "Member Profile"; pass balance "X credits".
- No "Inbox"/"Compose"/"Draft Queue" user-visible text anywhere in staff-web.
- Routes, components, CSS, DB all untouched (proves clean layer separation for waves 2-4).
</success_criteria>

<output>
After completion, create `.planning/phases/R3-naming-ia-pass/R3-01-SUMMARY.md`
</output>
