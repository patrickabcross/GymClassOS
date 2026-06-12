# Pitfalls Research — v1.1 UI Redesign (GymClassOS Design System)

**Domain:** Retrofitting a token-based design system + naming overhaul onto a shipped Tailwind v4 + Radix/shadcn staff-web app and an Expo RN member app, while running work on a long-lived parallel branch with a live customer in production.
**Researched:** 2026-06-12
**Milestone:** v1.1 UI Redesign — branch `redesign/ui-refresh`
**Confidence:** HIGH for Tailwind v4 token mechanics (verified against official docs + community post-mortems); HIGH for RN StyleSheet divergence (confirmed by direct codebase grep); HIGH for branch merge mechanics (git fundamentals); MEDIUM for embed widget CSS isolation (verified against GitHub discussion + production build guides); MEDIUM for DB identifier rename risk (verified against Drizzle GitHub issues + Postgres constraints).

> **SCOPE NOTE:** This file covers pitfalls SPECIFIC to ADDING the redesign to this system. It is a COMPANION to (not a replacement for) the original platform-level pitfalls (WhatsApp, Stripe, booking races, etc.) which remain in git history. Both sets of pitfalls are in scope for this milestone.

---

## How to Read This Document

Each pitfall carries:

1. **What goes wrong** — the failure mode in concrete terms for THIS project
2. **Why it happens** — the root cause specific to this codebase
3. **How to avoid** — specific, actionable prevention (no "be careful")
4. **Warning signs** — early detection before disaster
5. **Phase to address** — which phase of the UI redesign roadmap should prevent this
6. **Severity** — CRITICAL / HIGH / MEDIUM / LOW

Phase references use the redesign milestone structure: **Audit** (baseline gsd:ui-review), **Tokens** (design token layer), **Label** (naming/IA pass), **Web** (staff-web visual refresh), **Widget** (embed widget), **Mobile** (Expo app alignment), **Merge** (integration back to master).

---

## Critical Pitfalls

### Pitfall R-01: `@theme inline` bakes hex values — wrapper-class overrides silently ignored

**Severity:** CRITICAL — causes studio-skinnable theming to silently fail; every skin after Hustle fails to apply

**What goes wrong:**
Tokens declared as `@theme inline { --color-primary: #1a1a1a; }` get compiled into utility classes as literal hex values at build time. Any CSS wrapper class attempting to override the token at runtime (e.g., `[data-studio="hustle"] { --color-primary: #e63946; }`) is completely ignored — the compiled utility already has the hex baked in. The per-studio skinning mechanism appears to work in isolation but does nothing in practice.

**Why it happens:**
The codebase already uses bare `@theme` (not `@theme inline`) in `packages/core/src/styles/agent-native.css` — the tokens correctly resolve to `hsl(var(--border))` etc. But if a developer adding new GymClassOS-specific tokens reaches for `@theme inline` (a pattern shown in many Tailwind v4 migration guides for simple cases), they accidentally use the compile-time version. Tailwind v4's two `@theme` modes are visually identical in syntax and the difference is not obvious from the code.

**How to avoid:**
- All GymClassOS brand tokens MUST use bare `@theme` (not `@theme inline`) so utilities compile to `var(--color-*)` references, not literal values.
- The studio skin mechanism must override CSS custom properties at the `:root` level (or a `[data-studio]` attribute selector on `<html>`), not utility class values.
- The correct pattern: `:root { --primary: <bare HSL values>; }` in `global.css` drives `@theme { --color-primary: hsl(var(--primary)); }` in the shared layer. Studio overrides swap `--primary` in a `:root[data-studio="hustle"]` block.
- Add a lint step: grep for `@theme inline` in any new CSS. Fail CI if found.

**Warning signs:**
- Changing a CSS custom property in DevTools on a deployed preview has no effect on a Tailwind utility (`bg-primary` stays the same color regardless of the variable change).
- A second studio configuration produces identical visual output to Hustle.

**Phase to address:** Tokens — establish the `@theme` vs `@theme inline` convention before any brand token is written.

---

### Pitfall R-02: `hsl(var(--token))` vs bare `var(--token)` mismatch breaks opacity modifiers

**Severity:** CRITICAL — subtle rendering bugs across all surfaces; opacity modifiers like `bg-primary/50` silently output wrong values

**What goes wrong:**
The current `agent-native.css` correctly wraps HSL values in `hsl()` inside `@theme` (`--color-primary: hsl(var(--primary))`). If the GymClassOS token layer defines a variable as a full `hsl(...)` string in `:root` (e.g., `--primary: hsl(220 10% 15%)`) and then also wraps it again in `@theme` (`--color-primary: hsl(var(--primary))`), the result is double-wrapping: `hsl(hsl(220 10% 15%))` — invalid CSS. Tailwind v4 opacity modifiers like `/50` also fail when the variable already contains the `hsl()` wrapper because Tailwind cannot extract the channel values to inject the alpha channel.

**Why it happens:**
`global.css` currently defines `:root { --primary: 220 10% 15%; }` (bare space-separated HSL — correct). If the redesign team copies tokens from an external source (e.g., shadcn theme generator, which outputs full `hsl()` strings), they introduce the double-wrap. This mismatch is invisible until an opacity modifier is used.

**How to avoid:**
- `:root` / `.dark` variables must always be bare space-separated HSL values: `220 10% 15%` — no `hsl()` wrapper.
- `@theme` layer always wraps: `--color-primary: hsl(var(--primary))`.
- Never copy token values from a shadcn theme generator without stripping the `hsl()` wrapper.
- Verification: after adding any token, test `bg-primary/50` on a Vercel preview to confirm half-opacity renders correctly.

**Warning signs:**
- `bg-primary/50` renders as fully opaque or fully transparent on the Vercel preview.
- Browser DevTools computed styles show `hsl(hsl(...))` or an empty color value.
- A freshly added token works in isolation but breaks when used with an opacity modifier.

**Phase to address:** Tokens — enforce the bare-HSL-in-`:root` convention in the token definition phase before any component is styled.

---

### Pitfall R-03: Dark mode variable definitions inside `@layer base` break Tailwind v4 specificity

**Severity:** HIGH — dark mode stops working on the Vercel deploy; impossible to diagnose without knowing the root cause

**What goes wrong:**
In Tailwind v3, putting `:root` and `.dark { ... }` inside `@layer base` was the recommended shadcn pattern. In Tailwind v4 this causes specificity conflicts: `@layer base` styles have lower cascade weight than component/utility layers, so a `.dark` selector inside `@layer base` can be overridden by `:root` definitions in a higher layer. The result is that `.dark` color overrides are silently ignored — dark mode fails.

**Why it happens:**
The current `global.css` already has `:root` and `.dark` outside `@layer base` — correctly structured for Tailwind v4. But if the redesign adds a studio-skin layer and a developer follows a Tailwind v3 guide or shadcn v3 blog post, they may wrap the overrides in `@layer base`. The code looks identical to the working pattern at a glance.

**How to avoid:**
- Keep ALL `:root`, `.dark`, and `[data-studio]` selector blocks OUTSIDE `@layer base` in `global.css`.
- The pattern in `global.css` is already correct — maintain it, never wrap override selectors in any `@layer`.
- When adding a `[data-studio="hustle"]` override block, add it directly after the `.dark` block, not inside a layer.

**Warning signs:**
- On a Vercel preview, toggling the dark mode class has no visible effect.
- DevTools shows the `.dark` variable overrides as "crossed out" (overridden by a lower-specificity rule from a higher cascade layer).

**Phase to address:** Tokens — documented as an explicit constraint in the token layer design before touching `global.css`.

---

### Pitfall R-04: React Native `StyleSheet.create` with hardcoded hex values — no CSS variable cascade

**Severity:** CRITICAL — mobile app cannot be studio-skinned without a full file-by-file rewrite; design system tokens on web don't propagate to native at all

**What goes wrong:**
Every screen in `packages/mobile-app` currently uses `StyleSheet.create` with hardcoded hex values (`#111`, `#fff`, `#1f2937`, `#3b82f6`, `#999`, `#666`, etc.) confirmed by direct grep of all `.tsx` files. CSS custom properties do not exist in React Native's layout engine. If the redesign simply changes web tokens and hopes the mobile app visually aligns, nothing changes on mobile — the two surfaces diverge completely. Studio skinning on mobile requires an entirely different mechanism than the CSS variable cascade on web.

**Why it happens:**
The mobile app was built to demo fast. React Native StyleSheet has no notion of CSS variables. The web token system is browser-native; extending it to RN requires an explicit bridging layer (a JS constants file, a React context, or NativeWind).

**How to avoid:**
- Create `packages/mobile-app/lib/tokens.ts` — a single source-of-truth object (`{ colors: { background: '#111', primary: '#3b82f6', ... } }`) that mirrors the web CSS variables by name.
- ALL `StyleSheet.create` calls reference `tokens.colors.X` instead of literal hex strings.
- For studio skinning, the tokens object is produced by a `studioConfig` lookup (e.g., injected at app startup from an API response or `app.config.js` extra).
- NativeWind v4 is production-ready but adds Babel transform complexity and introduces a divergence from the current plain-StyleSheet patterns. The JS constants bridge is lower risk for this milestone.
- Defer dark mode on mobile to a follow-on; light/dark via `useColorScheme` + a token set is viable later but out of scope now.

**Warning signs:**
- Expo Go screenshot after web token changes still shows the old dark-background palette.
- Any new screen added during the redesign uses `#111` or `#3b82f6` directly.

**Phase to address:** Mobile — first task in the mobile phase is creating `tokens.ts` and migrating all `StyleSheet.create` calls before any visual changes.

---

### Pitfall R-05: Embed widget CSS leaks onto host page — or host page CSS overrides widget

**Severity:** CRITICAL for the `/embed/schedule` widget (planned P1c scope, but design system decisions made in this milestone affect it permanently)

**What goes wrong:**
Two failure modes exist: (1) The widget's Tailwind stylesheet (which includes preflight / base reset styles) leaks onto the host page (`doyouhustle.co.uk`), breaking the gym's existing site layout — headlines change size, link colors reset, body font changes. (2) The host page's own CSS overrides the widget's styles — widget buttons take on the gym site's button theme, breaking the GymClassOS design language.

**Why it happens:**
Tailwind's `@layer base` (preflight) resets global element styles. When the widget is embedded via a `<script>` tag that appends a React root to a host-page `<div>`, the widget's compiled CSS is injected into the host page's `<head>` — affecting all elements on the page, not just the widget's container. Conversely, the host page's CSS selectors can reach inside the widget container with any non-scoped selectors.

**How to avoid:**
- The embed widget MUST render inside a Shadow DOM root (using `element.attachShadow({ mode: 'open' })`), with its compiled CSS injected as a `<style>` tag inside the shadow root — not in `<head>`.
- Tailwind's preflight should be excluded from the widget's CSS build (set `preflight: false` in the widget's Tailwind config or add a `@layer base { /* intentionally empty */ }` override).
- The widget build must use a Tailwind prefix (`tw-`) or CSS module scope to prevent class name collisions with any Tailwind-based host page.
- This is a BUILD-TIME decision: the embed widget must be a separate Vite entry point with its own `tailwind.config` — not a shared build with `staff-web`.
- Document this constraint NOW so P1c doesn't inherit a CSS-leaking embed.

**Warning signs:**
- Embedding a test widget on a plain HTML page with existing styles causes layout shifts in the surrounding content.
- The widget's buttons look styled by the host page's CSS theme, not GymClassOS tokens.
- Shadow DOM is absent from the widget's mount code.

**Phase to address:** Widget phase (P1c-level work) — but the build separation decision must be captured during this milestone's Tokens phase so the embed widget inherits the right Tailwind configuration from day one.

---

### Pitfall R-06: Route renames break live customer deep links, WhatsApp flow links, and browser bookmarks

**Severity:** CRITICAL — live customer (Hustle) uses the app today; a URL rename without a redirect silently breaks any bookmarked or shared link

**What goes wrong:**
The naming/IA pass will likely rename routes (e.g., `/gymos/inbox` to `/gymos/conversations`, `/draft-queue` to a gym-domain equivalent). If a renamed route has no redirect, any bookmark, WhatsApp message containing a URL, or coach muscle-memory navigation lands on a 404 or root redirect. The staff app does not yet have a documented route contract — but the customer has been using the live URL for weeks.

Currently risky routes from direct codebase inspection:
- `/gymos/inbox` (primary daily-use surface, hardcoded in `GymosTopNav.tsx` and `gymos.inbox.tsx`)
- `/gymos/inbox?filter=leads` (leads filter)
- `/draft-queue` and `/draft-queue/:id` (mail-template legacy — not yet retired)
- `/settings` (referenced from `RecipientInput.tsx` via hardcoded `navigate('/settings?alias=...')`)
- `/inbox` (hardcoded in `AppLayout.tsx`, `CommandPalette.tsx`, `SearchBar.tsx`, `NotFound.tsx`)

**Why it happens:**
Route renames feel purely cosmetic during development but are breaking changes from a user perspective. The naming pass is renaming internal component file names AND route paths simultaneously, conflating two different concerns. Internal file/component renames have zero user impact; route path renames are a breaking change.

**How to avoid:**
- Decouple internal rename from URL rename: rename files and component names freely (zero user impact); rename URL paths as a SEPARATE deliberate step with explicit redirect coverage.
- For every URL path renamed, add a React Router `redirect()` loader in the old route file: `export const loader = () => redirect('/gymos/conversations', 301)`. Keep the old route file alive until at least one full deploy cycle after the redirect is confirmed working.
- Inventory ALL hardcoded navigate/Link/href calls before renaming any route: `grep -r "navigate\|to=\"/\|href=\"/"` in `apps/staff-web/app` — every reference must be updated.
- Test redirects on a Vercel preview URL before merging: `curl -I <old-url>` must return `301`.
- For routes shared externally (WhatsApp links, onboarding flows), keep the old URL alive indefinitely via redirect rather than deleting it.

**Warning signs:**
- A `grep` for `navigate('/inbox')` or `to="/draft-queue"` still returns results after a rename.
- The 404 page starts logging hits on the old URL path in Vercel analytics.
- Hustle staff report "the app went blank" after a deploy.

**Phase to address:** Label phase — every route rename decision must list the old URL, the redirect target, and a deployed-and-verified confirmation before the rename PR merges.

---

## High-Severity Pitfalls

### Pitfall R-07: DB text enum identifier renames — Drizzle-kit generates dangerous migrations on a live Postgres database

**Severity:** HIGH — a Drizzle migration that renames an enum value or column on a live Postgres database can table-lock or data-corrupt; Neon is the single customer's database

**What goes wrong:**
The schema uses `text("status", { enum: [...] })` patterns extensively (booking status, conversation status, message status, pass acquisition type, etc.). If the naming pass decides a status value should be renamed (e.g., `"in_review"` to `"pending_approval"` for draft queue items), Drizzle-kit's `generate` step emits an `ALTER TABLE` migration. On Postgres, renaming an enum type requires dropping and recreating it: Drizzle follows the workaround of `ALTER COLUMN type → text`, drop enum, recreate enum, `ALTER COLUMN type → enum`. Each step can lock the table. This causes visible downtime on the live Hustle database.

A confirmed Drizzle bug (GitHub issue #1409): Postgres cannot rename ENUM columns on schema change — Drizzle-kit silently generates broken SQL for this case.

**Why it happens:**
The redesign naming pass will touch TypeScript identifiers and may conflate "rename a TypeScript enum value" (zero DB impact) with "rename what is stored in the Postgres column" (migration required, lock risk). Both look like the same change in the Drizzle schema file.

**How to avoid:**
- The naming pass MUST NOT change the string values stored in `text(..., { enum: [...] })` columns — only rename TypeScript-side identifiers (type aliases, const maps, display labels).
- If a DB-level string rename is genuinely needed (not just a display label), it must go through a multi-step migration: (1) Add the new value alongside the old, (2) backfill all rows, (3) drop the old value — never in a single migration, never during the redesign milestone.
- Create a naming decision record that explicitly separates "DB storage identifier" (frozen, never changed lightly) from "display label" (change freely in the UI layer).
- Run `drizzle-kit generate --dry-run` before every migration and review the SQL diff for `DROP COLUMN`, `DROP TYPE`, or any `ALTER TABLE` that isn't purely additive.

**Warning signs:**
- `drizzle-kit generate` output contains `DROP TYPE` or `ALTER TABLE ... USING`.
- A status value that exists in the DB is no longer in the Drizzle schema enum array.
- TypeScript type for a status column changes but the column definition string values remain the same — this is the SAFE path; verify before assuming it needs a migration.

**Phase to address:** Label phase — the naming decision record must explicitly flag every DB-stored identifier as "storage-frozen" before the rename pass begins.

---

### Pitfall R-08: shadcn CLI `add` overwrites local component customizations — design token work lost

**Severity:** HIGH — running `npx shadcn add button` after customizing `components/ui/button.tsx` silently overwrites the customization with the upstream version

**What goes wrong:**
During the redesign, existing shadcn components (`Button`, `Dialog`, `Sidebar`, etc.) will be restyled via token changes in `global.css`. If at any point a new shadcn component is added via `npx shadcn add`, or if an existing component is "updated" via the CLI, any local modifications to the component file are overwritten. The CLI does not merge — it replaces.

**Why it happens:**
The shadcn model is "copy components into your codebase, own them." The CLI `add` command is a write, not an update. Developers reach for it when adding a new component and accidentally pass an already-customized component name.

**How to avoid:**
- Never run `npx shadcn add <component>` for any component that has been locally modified during the redesign.
- Use `npx shadcn diff <component>` to inspect upstream changes before any CLI operation.
- The redesign strategy should modify tokens in `global.css` (safe — the CLI never touches CSS files) and avoid modifying the `components/ui/*.tsx` files where possible. CSS-variable-based theming means component files rarely need touching.
- If a component file must be modified (e.g., to add a `data-slot` attribute or change a default variant), document it in `MODIFICATIONS.md` alongside the upstream fork boundary entries.
- Commit all component customizations before any `npx shadcn` operation so `git diff` shows exactly what would be lost.

**Warning signs:**
- A `git diff` after adding a shadcn component shows changes to an already-customized file.
- A custom `variant` on Button disappears after a new component is added.

**Phase to address:** Tokens phase — establish the "CSS variables only, no component-file edits where avoidable" rule before touching any component.

---

### Pitfall R-09: `@custom-variant dark` + `[data-studio]` attribute — specificity war when both are active

**Severity:** HIGH — studio theming and dark mode break each other when both are active simultaneously

**What goes wrong:**
The upstream `agent-native.css` declares `@custom-variant dark (&:is(.dark *))` — dark mode is a class on an ancestor. If GymClassOS adds studio theming via `[data-studio="hustle"]` attribute on `<html>`, the combined dark+studio state requires two attributes on the root element. A component using `dark:bg-primary` relies on `.dark` being an ancestor class. A component overriding `--primary` for Hustle relies on `[data-studio="hustle"]`. If the dark mode and studio skin selectors are at the same specificity level and the studio overrides are declared after the dark overrides (or vice versa), one silently overrides the other.

**How to avoid:**
- Studio overrides: `[data-studio="hustle"] { --primary: ...; }` — a single attribute selector (specificity 0,1,0).
- Dark mode overrides: `.dark { --primary: ...; }` — a single class selector (specificity 0,1,0).
- Both have the same specificity, so cascade order determines which wins when both are present. Define studio overrides AFTER dark mode overrides in `global.css` so that when both `.dark` and `[data-studio="hustle"]` are present on the root, the studio skin wins over the default dark palette.
- If a studio has a custom dark palette (e.g., Hustle dark mode uses `#1a0000` background), define a combined selector: `html.dark[data-studio="hustle"] { --background: ... }`.
- Test on the Vercel preview with both dark mode ON and `data-studio="hustle"` set simultaneously before calling any skin complete.

**Warning signs:**
- Toggling dark mode on a Hustle-skinned deploy changes colors in unexpected ways (some tokens flip, some don't).
- DevTools shows a variable being set by both `.dark` and `[data-studio="hustle"]` with one crossing out the other.

**Phase to address:** Tokens phase — define the specificity ordering rule before writing any studio override.

---

### Pitfall R-10: Long-lived `redesign/ui-refresh` branch accumulates structural conflicts with master

**Severity:** HIGH — the longer the branch diverges, the harder the merge; new features on master (WhatsApp deep wire, EAS build work) touch the same files being redesigned

**What goes wrong:**
The redesign branch renames files, moves components into new directory structures, and changes CSS class names throughout `apps/staff-web/app/`. Meanwhile, `master` continues receiving WhatsApp integration work, mobile EAS hardening, and P1c widget work. When the redesign branch finally merges, Git encounters conflicts not just in CSS/component files but also in route files and layout components — because two parallel tracks modified the same file for different reasons. A rename in the redesign branch + a logic change in master on the same file produces a "both modified" conflict that requires understanding both changes simultaneously.

**Why it happens:**
Long-lived branches with widespread file renames are the hardest merge scenario in Git. A file rename in the redesign branch causes Git to see a "delete + add" for master's modifications to the pre-rename file, even if the changes are orthogonal.

**How to avoid:**
- Weekly rebase rule: every 7 days (or before any master merge to production), rebase `redesign/ui-refresh` onto `master`. Small rebases each week are far cheaper than one large merge at the end.
- Label-layer-first strategy: tackle the internal component renames (file renames, component name changes) as the FIRST PR that merges back to master — while master is relatively fresh. This eliminates the rename + modify conflict class immediately.
- Isolate CSS-only changes from structural changes: a PR that only modifies `global.css` and `components/ui/*.tsx` can merge to master with zero conflicts as long as master hasn't touched those files. Merge CSS-only PRs to master early.
- Never rename route files and modify their logic in the same commit: route file renames must be isolated from logic changes so Git can track the rename correctly.
- Keep `MODIFICATIONS.md` current: every renamed file and moved component must be logged. This acts as a conflict-resolution guide during the final merge.
- Weekly divergence audit: run `git log --oneline master..redesign/ui-refresh` to count how many commits have accumulated. More than 20 commits is a danger signal.

**Warning signs:**
- `git log --oneline master..redesign/ui-refresh` shows more than 30 commits.
- A rebase attempt produces more than 5 conflict files.
- A file appears in both master's recent diff AND the redesign branch's rename list.

**Phase to address:** Cross-cutting — establish the weekly rebase cadence at the start of the Tokens phase. Do the label-layer rename commit within the first sprint.

---

### Pitfall R-11: Visual regressions are invisible until a Vercel deploy — slow feedback loop compounds mistakes

**Severity:** HIGH — the no-local-server constraint (NitroViteError) means every visual change requires a Vercel deploy to verify; a wrong token change discovered 3 deploys later means 3 deploys of broken production

**What goes wrong:**
Without a local dev server, a developer changes a CSS token value, commits, pushes, waits for Vercel to build and deploy (typically 3–7 minutes), then opens the preview URL to check the result. If the change is wrong (e.g., contrast too low, dark mode broken, a component not consuming the token), the fix requires another full deploy cycle. Three wrong attempts = 20+ minutes of wait time per UI iteration. This slows the redesign to a crawl and increases the temptation to ship unreviewed visual changes.

**Why it happens:**
The NitroViteError is a known bug in the local dev server that cannot be quickly fixed within this milestone's scope. It is a hard constraint.

**How to avoid:**
- Batch token changes: change multiple tokens in a single commit rather than one token per deploy. Verify 10 tokens in one deploy rather than 10 deploys.
- Use Vercel's branch preview URL as the dev environment: set the Vercel project to auto-deploy `redesign/ui-refresh` commits as preview deployments. Keep the preview URL open in a dedicated browser window.
- Capture before-state screenshots BEFORE the redesign begins (this is the `gsd:ui-review` baseline audit — the first work item in the milestone). Compare after-state screenshots against them systematically.
- A simple Playwright script (run locally, pointing at the Vercel preview URL) can capture screenshots of `/gymos`, `/gymos/schedule`, `/gymos/members`, `/gymos/payments`, `/gymos/analytics` after each deploy. Paste before/after screenshots into PR descriptions.
- Mobile verification via Expo Go URL: for RN, every `expo start --tunnel` session provides a QR-code verifiable state. Test on a real device for RN styling (StyleSheet computed values differ subtly between simulator and device).

**Warning signs:**
- A route is not checked on the Vercel preview before its PR is merged.
- Dark mode has not been toggled in the last 5 deploys.
- The mobile EAS build is more than 2 weeks behind the web redesign progress.

**Phase to address:** Cross-cutting — establish the Playwright-against-preview screenshot workflow at the start of the Audit phase, BEFORE any redesign changes are made.

---

### Pitfall R-12: `email-*` CSS class names in `global.css` orphaned when components are renamed

**Severity:** HIGH — the existing `.email-list-row`, `.email-body-content` class names in `global.css` are applied to the WhatsApp inbox components. Renaming components without renaming the CSS classes leaves orphan style rules; renaming CSS classes without updating component usage breaks all styling.

**What goes wrong:**
`global.css` contains 30+ `.email-list-row` and `.email-body-content` CSS rules tied to the mail-template component names. The WhatsApp inbox components (`EmailList.tsx`, `EmailListItem.tsx`, `EmailThread.tsx`) apply these class names via `className="email-list-row"`. During the naming pass, if the component files are renamed but `global.css` retains `.email-list-row`, the styling either disappears entirely or silently bleeds onto any new element that happens to use the old class name.

**How to avoid:**
- Rename the CSS class names and their usage in components in the SAME commit. Never rename one side without the other.
- Run a post-rename grep: `grep -r "email-list-row\|email-body-content" apps/staff-web/app` must return zero results after the rename is complete.
- Replace `.email-*` CSS class names with semantic gym-domain names: `.conversation-row`, `.message-body-content`, etc.
- These are hand-authored CSS classes (not Tailwind utilities), so they are not in `components.json` and can be safely renamed without shadcn CLI concerns.

**Warning signs:**
- After renaming a component file, the WhatsApp inbox loses its list-row hover/selection styles.
- A grep returns `.email-list-row` references in both `global.css` AND a renamed component file — mismatched rename.

**Phase to address:** Label phase — CSS class renames are part of the naming pass; must be done atomically with component renaming.

---

## Medium-Severity Pitfalls

### Pitfall R-13: Upstream `agent-native.css` import order — upstream `@theme` wins on collisions if not declared after

**Severity:** MEDIUM — unexpected color values on components that use `@agent-native/core/client` primitives

**What goes wrong:**
`global.css` imports `tailwindcss` then `@agent-native/core/styles/agent-native.css`. The upstream file declares its own `@theme` block. If the GymClassOS token additions define overlapping token names in another `@theme` block placed BEFORE the upstream import, the upstream values win. Because the upstream `@theme` is imported second, it takes precedence.

**How to avoid:**
- GymClassOS brand-specific tokens must be declared in a `@theme` block in `global.css` AFTER the `@import "@agent-native/core/styles/agent-native.css"` line.
- Do not add new GymClassOS tokens to the upstream `agent-native.css` (fork boundary violation). All additions go in `global.css`.
- For tokens that already exist in the upstream `@theme` (e.g., `--color-primary`), the `:root` variable they reference (`--primary`) is the override point — change the `:root { --primary: ... }` value, not the `@theme` mapping.

**Phase to address:** Tokens.

---

### Pitfall R-14: Radix portal elements render outside `[data-studio]` attribute scope

**Severity:** MEDIUM — studio skin tokens don't apply to modal overlays, tooltips, and popovers

**What goes wrong:**
Radix UI's `Dialog`, `Tooltip`, `Popover`, and `Select` components portal their content to `document.body`. If studio skin tokens are applied via a `[data-studio="hustle"]` attribute on an inner app container `<div>` instead of on `<html>` (or `<body>`), the portalled elements escape the attribute scope and render with default tokens.

**How to avoid:**
- Apply the `data-studio` attribute to `<html>` (via a static inline attribute in `root.tsx`'s `<html>` JSX), not to an inner `<div>`.
- Test modals and dropdowns explicitly on a Vercel preview with a studio skin active before signing off the Tokens phase.

**Phase to address:** Tokens — verify portal inheritance as part of the token layer validation checklist.

---

### Pitfall R-15: `next-themes` provider and `[data-studio]` attribute on `<html>` — hydration race causes FOUC

**Severity:** MEDIUM — dark mode toggle stops working or produces a flash of unstyled content after studio theming is added

**What goes wrong:**
`next-themes` (v0.4.6 installed) manages the dark mode class on `<html>` via JavaScript after hydration. If GymClassOS sets `data-studio` on `<html>` via a separate `useEffect`, the two DOM mutations can race during hydration, causing a flash of unstyled content (FOUC) or a state where the attribute is set but the class hasn't been applied yet.

**How to avoid:**
- Set `data-studio` as an inline HTML attribute in `root.tsx`'s `<html>` JSX directly (not in a `useEffect`), so it is present in the server-rendered HTML before `next-themes` hydrates.

**Phase to address:** Tokens.

---

### Pitfall R-16: `@source` directive may not scan new GymClassOS feature directories

**Severity:** MEDIUM — Tailwind utilities used in new `features/` directories may not appear in the compiled CSS

**What goes wrong:**
`agent-native.css` declares `@source "../client/**/*.{js,mjs,ts,tsx}"`. `global.css` declares `@source "./**/*.{ts,tsx}"` (relative to `app/`). New GymClassOS features added to `apps/staff-web/features/` are covered only if they are imported from inside `app/`. If a feature component is added outside the covered source paths, its Tailwind classes may not be scanned and the utilities silently fall back to no style.

**How to avoid:**
- Keep all GymClassOS components under paths covered by the existing `@source` directive.
- If adding a new top-level directory, add a corresponding `@source` line in `global.css`.
- After each deploy, verify that new Tailwind utility classes render correctly on the Vercel preview.

**Phase to address:** Tokens.

---

### Pitfall R-17: EAS build lag means mobile visual state is days behind web — demo risk

**Severity:** MEDIUM — if the redesign milestone ends with a customer demo and mobile is not rebuilt via EAS, the customer sees the old palette on their phone

**What goes wrong:**
The Expo mobile app runs as a native binary installed on the customer's phone via EAS. A web token change is live on Vercel immediately after deploy; a mobile visual change requires an EAS build + OTA update or a new App Store install. The feedback loop for mobile is 15–45 minutes per iteration. If the web redesign advances faster than mobile, a demo shows a mismatched experience.

**How to avoid:**
- Do the mobile token migration (`tokens.ts` file) early in the Mobile phase, but defer EAS builds until a meaningful visual milestone is reached (not after every token change).
- Use Expo Go for rapid iteration on non-native-module work during the Mobile phase — Expo Go picks up JS bundle changes via Metro without an EAS rebuild.
- Before any customer-facing demo, ensure an EAS build has been produced AFTER the final mobile token changes.
- Track the mobile visual state explicitly in the phase checklist: "EAS build #X produced at [date] reflects these token values."

**Phase to address:** Mobile.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Leave `StyleSheet.create` hex values in place and only change web tokens | Faster Tokens phase | Mobile never aligns to design system; studio skinning impossible on native | Never for this milestone |
| Apply `@theme inline` for simpler syntax | Marginally less typing | Studio skin overrides silently ignored at runtime | Never |
| Keep `.email-*` CSS class names and only rename component files | Rename pass runs faster | Class names bleed meaning; future contributors confused | Never — rename atomically |
| Skip route redirects and just rename the path | Faster routing refactor | Live customer bookmarks and WhatsApp message links 404 silently | Never for live routes |
| Add `data-studio` on an inner `<div>` instead of `<html>` | Contained scope | Radix portals miss the skin; modals render with default tokens | Acceptable during development iteration only, not in production |
| Run the Tokens phase without weekly master rebases | No context switching | Final merge is a multi-day conflict resolution exercise | Never |
| Verify visual changes only by code review without screenshots | Faster PRs | Regressions ship undetected; no before/after evidence | Never for this milestone |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tailwind v4 + shadcn tokens | Adding new tokens with `@theme inline` | Use bare `@theme` so utilities compile to `var()` references, not literal values |
| shadcn CLI + local customizations | Running `npx shadcn add` on a customized component | Use `npx shadcn diff` to check; never `add` a component already modified locally |
| Radix portals + studio skin | Scoping `[data-studio]` to app container `<div>` | Apply `data-studio` to `<html>` element so portals (rendered at `body`) inherit it |
| RN StyleSheet + web tokens | Assuming CSS variable changes propagate to native | Maintain a separate `tokens.ts` JS constant file mirroring web CSS variable values |
| Vercel preview + no local server | Treating a code review as sufficient visual verification | Every visual change must be verified on a Vercel preview deploy before merge |
| Expo Go + EAS | Assuming Expo Go reflects the same build as EAS | Expo Go is fine for JS-only iteration; any native module or build config change requires EAS |
| next-themes + custom `data-*` attributes | Setting `data-studio` in a `useEffect` that races hydration | Set `data-studio` as a static inline attribute in the SSR `<html>` tag |
| Drizzle schema + naming pass | Renaming string values in `enum: [...]` arrays thinking it's TypeScript-only | String values inside `text("col", { enum: [...] })` map directly to Postgres; changing them requires a migration |

---

## "Looks Done But Isn't" Checklist

- [ ] **Token layer complete:** Every Tailwind utility in the app resolves to a CSS variable, not a hardcoded value. Verify by changing `--primary` in DevTools and observing the change propagate without a page reload.
- [ ] **Studio skinning works end-to-end:** Adding `data-studio="hustle2"` with different token values produces a visually distinct skin on the Vercel preview.
- [ ] **Dark mode intact after token work:** Toggle dark mode on Vercel preview. All surfaces respond: sidebar, main content area, dialogs (Radix portals), tooltips, and dropdowns.
- [ ] **Mobile tokens.ts in place:** `grep -r "'#\|\"#" packages/mobile-app/app --include="*.tsx"` returns zero results.
- [ ] **Route redirects in place:** Every renamed route has a `loader = () => redirect(...)` in the old route file. Test with `curl -I <old-url>` against the Vercel preview — must return `301`.
- [ ] **Embed widget isolated build confirmed:** Widget CSS is not present in the main staff-web bundle. Widget renders in Shadow DOM. Embedding the widget on a blank HTML page with conflicting styles shows no leakage.
- [ ] **DB enum strings not renamed:** `git diff master...redesign/ui-refresh -- apps/staff-web/server/db/schema.ts` shows no changes to string values inside `enum: [...]` arrays.
- [ ] **CSS class rename atomic:** `grep -r "email-list-row\|email-body-content" apps/staff-web/app` returns zero results.
- [ ] **Weekly rebase current:** `git log --oneline master..redesign/ui-refresh` shows fewer than 20 commits.
- [ ] **Vercel preview screenshot captured:** Before/after screenshots for every top-level route exist in the PR description or a shared folder.
- [ ] **Radix portal skin verified:** Dialog and Popover render with correct studio tokens on Vercel preview (not default grey palette).
- [ ] **No FOUC on hard reload:** Hard-reload the Vercel preview with studio skin active — no flash of unstyled/default content.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `@theme inline` used — skin overrides silently ignored | MEDIUM | Find all `@theme inline` occurrences, change to `@theme`, rebuild and redeploy. No data loss. |
| Route renamed without redirect — customer 404s | LOW-MEDIUM | Add `redirect()` loader to the old route file immediately; deploy within minutes. Customer's next navigation resolves. If customer shared a URL in a WhatsApp thread, that thread link is broken until they re-send a new URL. |
| DB enum value string renamed — migration fails in production | HIGH | Roll back the migration immediately via `drizzle-kit drop` or manual SQL `ALTER TYPE ... RENAME VALUE`. Replan as a multi-step additive migration. Data loss risk if rows were already written with the new string value. |
| shadcn CLI overwrote a customized component | LOW | `git restore apps/staff-web/app/components/ui/<component>.tsx` to recover the customized version. Compare against upstream with `diff` to verify no security fix was lost. |
| Branch merge produces more than 20 conflict files | HIGH | Cherry-pick individual logical units (CSS-only PRs, rename PRs) onto master one at a time rather than merging the full branch. Rebuild the branch from the series of PRs. |
| Mobile still showing old tokens at demo time | MEDIUM | Trigger an EAS build immediately; distribute via Expo internal distribution link. Worst case: use Expo Go with a development build URL for the demo. |
| Embed widget CSS leaking onto host page | MEDIUM | Wrap widget mount in Shadow DOM, inject styles inside the shadow root. Requires a widget build config change and a new deploy to Hustle's embed script URL. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| R-01: `@theme inline` bakes hex values | Tokens | `grep -r "@theme inline" apps/staff-web` returns zero results |
| R-02: HSL double-wrap breaks opacity modifiers | Tokens | `bg-primary/50` renders 50% opacity on Vercel preview |
| R-03: Dark definitions inside `@layer base` | Tokens | Toggle dark mode on preview; all tokens respond |
| R-04: RN hardcoded hex values | Mobile (first task) | `grep -r "'#\|\"#" packages/mobile-app/app` returns zero results |
| R-05: Embed widget CSS leakage | Widget phase planning (build config decision in Tokens) | Embed widget in blank HTML page; surrounding styles unchanged |
| R-06: Route renames break live deep links | Label | `curl -I <old-url>` returns 301; zero 404s in Vercel logs for renamed paths |
| R-07: DB enum rename migration risk | Label (naming decision record) | `drizzle-kit generate` diff shows no `DROP TYPE` or `USING` clauses |
| R-08: shadcn CLI overwrites customizations | Tokens | `git diff HEAD` shows no unexpected component file regressions after any `npx shadcn` operation |
| R-09: Dark mode + studio skin specificity conflict | Tokens | Both `.dark` and `[data-studio]` active simultaneously on preview; correct studio palette renders |
| R-10: Long-lived branch merge hell | Cross-cutting (weekly) | `git log --oneline master..redesign/ui-refresh` shows fewer than 20 commits |
| R-11: Slow deploy feedback loop | Cross-cutting (Audit) | Playwright screenshot workflow operational; before screenshots exist before any change |
| R-12: `email-*` CSS class orphaning | Label | `grep -r "email-list-row\|email-body-content" apps/staff-web/app` returns zero |
| R-13: Upstream `@theme` import order collision | Tokens | GymClassOS `@theme` block declared after upstream import in `global.css` |
| R-14: Radix portals miss studio skin | Tokens | Dialog, Tooltip, and Popover render with correct studio tokens on preview |
| R-15: next-themes + data-studio hydration race | Tokens | No FOUC on hard page reload with studio skin active |
| R-16: `@source` misses new feature directories | Tokens | New utility classes appear in compiled CSS; no invisible/unstyled elements |
| R-17: EAS build lag at demo time | Mobile | EAS build confirmed produced AFTER final mobile token changes; build number logged |

---

## Sources

- Tailwind v4 `@theme` vs `@theme inline` gotcha: [DEV Community — Forrest Miller, 2026](https://dev.to/forrestmiller/tailwind-v4-dark-mode-the-theme-vs-theme-inline-gotcha-that-broke-my-contrast-tests-3p3o)
- shadcn/ui Tailwind v4 migration guide: [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4)
- Tailwind v4 theming best practices discussion (multi-theme patterns): [github.com/tailwindlabs/tailwindcss/discussions/18471](https://github.com/tailwindlabs/tailwindcss/discussions/18471)
- Tailwind v4 dark mode CSS variable discussion: [github.com/tailwindlabs/tailwindcss/discussions/15083](https://github.com/tailwindlabs/tailwindcss/discussions/15083)
- Radix dark mode: [radix-ui.com/themes/docs/theme/dark-mode](https://www.radix-ui.com/themes/docs/theme/dark-mode)
- shadcn component update strategy: [vercel.com/academy/shadcn-ui/updating-and-maintaining-components](https://vercel.com/academy/shadcn-ui/updating-and-maintaining-components)
- Scoped CSS for embedded widgets (Shadow DOM approach): [github.com/tailwindlabs/tailwindcss/discussions/11922](https://github.com/tailwindlabs/tailwindcss/discussions/11922)
- Production embeddable React widgets guide: [makerkit.dev/blog/tutorials/embeddable-widgets-react](https://makerkit.dev/blog/tutorials/embeddable-widgets-react)
- Drizzle ORM enum rename bug (confirmed Postgres limitation): [github.com/drizzle-team/drizzle-orm/issues/1409](https://github.com/drizzle-team/drizzle-orm/issues/1409)
- Drizzle ORM zero-downtime migrations: [DEV Community — whoffagents, 2025](https://dev.to/whoffagents/drizzle-orm-migrations-in-production-zero-downtime-schema-changes-e71)
- React Native design token / white labeling approach: [atomicrobot.com — RN White Labeling Part 2](https://atomicrobot.com/blog/react-native-white-labeling-part-2/)
- NativeWind v4 (production) vs v5 (pre-release, not recommended): [nativewind.dev/v5](https://www.nativewind.dev/v5)
- Vercel preview deployment regression testing with Playwright: [getautonoma.com/blog/regression-testing-vercel-preview-deployments](https://getautonoma.com/blog/regression-testing-vercel-preview-deployments)
- React Router v7 `redirect()` API: [reactrouter.com/api/utils/redirect](https://reactrouter.com/api/utils/redirect)
- Git advanced merging / long-lived branches: [git-scm.com/book/en/v2/Git-Tools-Advanced-Merging](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging)
- Direct codebase inspection (HIGH confidence, all verified by grep):
  - `packages/mobile-app/app/**/*.tsx` — all screens confirmed using hardcoded hex in `StyleSheet.create`
  - `apps/staff-web/app/global.css` — `.email-*` class names, HSL token format (bare, no wrapper), `@layer base` structure
  - `packages/core/src/styles/agent-native.css` — `@theme` block (not `@theme inline`), `@custom-variant dark` declaration, token mapping pattern
  - `apps/staff-web/components.json` — `cssVariables: true`, `baseColor: "slate"`, Tailwind v4 confirmed
  - `apps/staff-web/package.json` — `next-themes: ^0.4.6`, full Radix UI component list, `tailwindcss: catalog:`

---
*Pitfalls research for: v1.1 UI Redesign — GymClassOS Design System + Naming Overhaul*
*Researched: 2026-06-12*
*Scope: Redesign-specific pitfalls only. Platform-level pitfalls (WhatsApp, Stripe, booking races) are in git history.*
