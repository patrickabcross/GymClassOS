---
phase: R4-staff-web-visual-refresh
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.members.tsx
autonomous: true
requirements: [SWEB-05]
must_haves:
  truths:
    - "Members directory defaults to a card grid (card view is primary)"
    - "Each member card shows an avatar, a membership status pill, and pass balance / next-class context"
    - "A Table view is available as a secondary toggle"
    - "The active view is reflected in a ?view URL param so it survives refresh"
    - "Clicking a member card or table row navigates to that member's profile"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.members.tsx"
      provides: "Card-default directory with Tabs card/table toggle, avatars, membership badges, search"
      contains: "TabsTrigger"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.members.tsx"
      to: "view toggle"
      via: "shadcn Tabs with ?view search param"
      pattern: "view=table|searchParams"
---

<objective>
Convert the Members directory from a single grid-table into a card-default view with a secondary Table view (shadcn Tabs, ?view param), per R4-UI-SPEC §4.

Purpose: SWEB-05 — directory defaults to card view (avatar, membership pill, next class); table remains as a secondary/filter view.
Output: Updated `gymos.members.tsx`. The loader is extended to also fetch each member's next upcoming class (small additive query) so cards can show it; no schema changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md

<interfaces>
Loader currently returns `{ members, balances }`. `members` each: `{ id, firstName, lastName, email, phoneE164, goal, activityLevel, createdAt, firstPurchaseAt }`. `balances[id]` is a number.
The component already has a client-side search filter over name/email/phone and a `<Input>` with `IconSearch`.
Drizzle imports available: `getDb, schema`, `eq, asc, sql` from drizzle-orm. Booking → occurrence → definition join pattern is shown in gymos.members_.$id.tsx loader (lines 60-79).
Available shadcn primitives: Tabs, TabsList, TabsTrigger, TabsContent, Card, Badge, Avatar, Input. Tabler: IconLayoutGrid, IconTable, IconSearch, IconUsers.
Use the @react-router useSearchParams hook to read/write ?view (the file already imports from "react-router").
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Loader — add next-upcoming-class per member</name>
  <files>apps/staff-web/app/routes/gymos.members.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.members.tsx (lines 20-115, loader)
    - apps/staff-web/app/routes/gymos.members_.$id.tsx (lines 60-79, bookings join pattern to copy)
  </read_first>
  <action>
    Add one additive query to the loader that resolves, per member, their next upcoming booked class (className + startsAt). Mirror the join in gymos.members_.$id.tsx: bookings leftJoin classOccurrences leftJoin classDefinitions, where `bookings.status = 'booked'` and `classOccurrences.startsAt > now`, ordered asc by startsAt. Reduce to a `nextClassByMember: Record<string, { className: string | null; startsAt: string }>` keeping the earliest per member.

    Add `// guard:allow-unscoped — single-tenant gym tables (no ownableColumns)` above the query (matches the existing pattern in this file's sibling routes).

    Return `nextClassByMember` alongside `members` and `balances`. Do NOT change the existing members/balances queries.
  </action>
  <acceptance_criteria>
    - `grep -n "nextClassByMember" apps/staff-web/app/routes/gymos.members.tsx` returns matches in both the loader return and the query build
    - `grep -n "guard:allow-unscoped" apps/staff-web/app/routes/gymos.members.tsx` returns a match
    - The loader still returns `members` and `balances` (grep both present)
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Loader returns nextClassByMember without altering existing members/balances queries; unscoped guard comment present.</done>
</task>

<task type="auto">
  <name>Task 2: Card-default directory with Tabs card/table toggle</name>
  <files>apps/staff-web/app/routes/gymos.members.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.members.tsx (lines 135-280, the component + GRID constant + row map)
    - R4-UI-SPEC.md §4 Members Directory (view toggle, card anatomy, membership badge variants, table anatomy, empty states, search)
  </read_first>
  <action>
    Rebuild the directory body per R4-UI-SPEC §4. Keep the header and the search `<Input>` (move search ABOVE the Tabs). Replace the `← Home` link disposition per discretion (leave it; out of scope).

    View state via URL: read `const [searchParams, setSearchParams] = useSearchParams();` and `const view = searchParams.get("view") === "table" ? "table" : "cards";`. Render a shadcn `<Tabs value={view} onValueChange={(v) => setSearchParams((p) => { const n = new URLSearchParams(p); if (v === "table") n.set("view","table"); else n.delete("view"); return n; })}>`.

    TabsList: `<TabsList className="bg-muted rounded-md p-0.5">` with two triggers:
    - `<TabsTrigger value="cards"><IconLayoutGrid size={14} aria-hidden /> Cards</TabsTrigger>`
    - `<TabsTrigger value="table"><IconTable size={14} aria-hidden /> Table</TabsTrigger>`

    TabsContent value="cards" — card grid `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">`. Each member is a clickable shadcn `<Card>` wrapped in a `<Link to={`/gymos/members/${m.id}`}>` with `className="p-4 hover:shadow-sm transition cursor-pointer"`:
    - Header row: `<Avatar className="h-10 w-10">` with `<AvatarFallback>` initials (first letter of firstName + lastName), then the name `<span className="text-sm font-semibold">`.
    - Membership status Badge per §4 variant map, computed from balance + lead state:
      - balance > 0 → `<Badge variant="default">Active</Badge>`
      - balance > 0 && balance < 3 → `<Badge variant="secondary" className="text-amber-700">Expiring</Badge>` ({/* guard:allow-color — expiring amber semantic, not a brand color */})
      - balance <= 0 && firstPurchaseAt → `<Badge variant="outline">No Pass</Badge>`
      - balance <= 0 && !firstPurchaseAt → `<Badge variant="secondary">Lead</Badge>`
      (Pick the single most-specific match; order the checks Expiring → Active → No Pass → Lead.)
    - `Next class: {nextClassByMember[m.id]?.className} · {short time}` in `text-[12px] text-muted-foreground`, or omit the line if none.
    - `Pass balance: {balance} credits` in `text-[12px] text-muted-foreground`.

    TabsContent value="table" — keep a compact `<table className="text-[12px]">` with headers `text-[11px] uppercase tracking-wide text-muted-foreground`: Name | Pass Balance | Next Class | Member Since. Rows min-height 40px; each row is a `<Link>`/clickable navigating to the profile. (Reuse the existing balance/date rendering; drop the avatar in table per §4.)

    Empty states (apply inside whichever Tab is active): no members → `IconUsers` + "No members yet" / "Members appear here when they join or enquire."; no search results → `IconSearch` + "No members found" / "Try a different name or phone number." (copy exact per Copywriting Contract).

    Drive both views off the existing `filtered` array so search applies to cards and table identically.
  </action>
  <acceptance_criteria>
    - `grep -n "TabsTrigger" apps/staff-web/app/routes/gymos.members.tsx` returns at least 2 matches (Cards + Table)
    - `grep -n "view\b\|view=table\|view === \"table\"" apps/staff-web/app/routes/gymos.members.tsx` shows the ?view param wiring via searchParams
    - `grep -n "lg:grid-cols-3" apps/staff-web/app/routes/gymos.members.tsx` returns a match (card grid)
    - `grep -n "AvatarFallback" apps/staff-web/app/routes/gymos.members.tsx` returns a match
    - `grep -n "No members yet\|No members found" apps/staff-web/app/routes/gymos.members.tsx` returns matches
    - `grep -n "IconLayoutGrid\|IconTable" apps/staff-web/app/routes/gymos.members.tsx` returns matches (Tabler, no emoji)
    - `grep -n "text-amber-700" apps/staff-web/app/routes/gymos.members.tsx` returns a match with a guard:allow-color marker on/above the line
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Directory defaults to a card grid (avatar + membership pill + next class + balance), a Table tab toggles via ?view=table, search filters both, empty states match the contract, cards/rows navigate to profiles; guard exits 0.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0.
- `npx prettier --write apps/staff-web/app/routes/gymos.members.tsx` runs clean.
- Static grep confirms Tabs toggle, ?view param, card grid with avatars + membership badges, table secondary view.
- Visual correctness + ?view-survives-refresh is deploy/UAT.
</verification>

<success_criteria>
SWEB-05: Members directory defaults to a card grid with avatar/membership-pill/next-class; a Table view is available behind a Tabs toggle persisted in ?view; both views share the search filter and navigate to profiles.
</success_criteria>

<output>
After completion, create `.planning/phases/R4-staff-web-visual-refresh/R4-03-members-directory-card-view-SUMMARY.md`
Run `npx prettier --write` on the modified file.
</output>
