---
phase: P1b.1-customer-pilot-enablement
type: ui-review
created: 2026-05-25
audited_against: P1b.1-UI-SPEC.md
audit_method: static
overall_score: 16/24
---

# P1b.1 — UI Review

**Overall: 16/24** — Phase-new surfaces (Templates dialog, Analytics, Access denied) land cleanly against the UI-SPEC; the pre-existing inbox + demo-grade Members/Schedule/Payments surfaces drag the score down with undeclared font sizes, leaked dev copy, and a `Cancel` blocklist hit.

## Scores

| Pillar | Score | Verdict |
|--------|-------|---------|
| Copywriting | 2/4 | New surfaces verbatim per spec; pre-existing inbox/schedule/members leak dev banter ("Why GymClassOS > Mindbody — this panel", "demo allows this", "Demo-grade: no pagination", "Cancel" blocklist hit) |
| Visuals | 4/4 | Tabler icons only, no emojis, no sparkle/wand; window-state dots use `IconPointFilled` correctly across two surfaces |
| Color | 3/4 | Strong semantic-token discipline; no hex; small slips: raw `bg-red-500/10` for failed bubble instead of `--destructive`, `text-amber-600` for "full class" introduces an undeclared semantic |
| Typography | 1/4 | UI-SPEC declares 4 sizes + 2 weights; actual surfaces use 8 sizes (`text-xs`/`base`/`lg`/`xl`/`2xl`/`3xl` plus `[15px]`) and weight 500 (`font-medium`) appears 14+ times despite explicit prohibition |
| Spacing | 3/4 | Scale mostly respected (`p-4`, `gap-3`, `py-3`); minor non-multiple-of-4 leaks (`py-1.5`, `mt-0.5`, `space-y-0.5`) and one `px-2.5` (pre-existing per UI-SPEC note). No arbitrary `[Npx]` spacing in new files |
| Experience Design | 3/4 | Optimistic UI on template send is exemplary; empty states + error bubbles complete; gaps: no Skeleton on analytics/template-list per UI-SPEC, Pass Utilisation 30d duplicates 7d value, access-denied wordmark vertically centered instead of "at top" |

## Top Fixes (prioritized for /gsd:quick polish PR)

Ordered by impact-per-effort. Each fix is specific enough to implement without re-auditing.

### 1. Strip dev/demo language from customer-facing copy — Copywriting — S
**Files:**
- `apps/staff-web/app/routes/gymos._index.tsx:662` — right-rail subtitle reads `"Why GymClassOS > Mindbody — this panel"` (visible to coach on every conversation)
- `apps/staff-web/app/routes/gymos.schedule.tsx:322` — booking dialog shows `"(over capacity — demo allows this)"`
- `apps/staff-web/app/routes/gymos.schedule.tsx:350-354` — `"Demo: inserts a bookings row directly. Production wraps capacity check..."`
- `apps/staff-web/app/routes/gymos.members.tsx:180-183` — `"Demo-grade: no pagination, no search, no edit (MEM-03 / MEM-05 in Production v1)"`
- `apps/staff-web/app/routes/gymos.members.$id.tsx:381-385` — `"Demo-grade: shows the snapshotted kcal/protein..."`

**Problem:** The pilot customer is being handed a "real" product. References to "demo", "Production v1", `MEM-03 / MEM-05`, "over capacity — demo allows this", and competitive jabs at Mindbody all read as unshipped scaffolding.

**Fix:**
- Replace `"Why GymClassOS > Mindbody — this panel"` with a neutral subtitle like `"Member at a glance"` or remove the subtitle entirely.
- Replace `"(over capacity — demo allows this)"` with `"At capacity"` (and disable the Book button — see fix #6).
- Delete the schedule dialog "Demo: inserts a bookings row..." paragraph entirely; coaches don't need to know about transaction wrapping.
- Replace Members footer with nothing (or `"Search and pagination coming soon"` if context is genuinely useful).
- Delete the Recent Food Entries footer; the data speaks for itself.

### 2. Replace `Cancel` with `Discard draft` (or similar) in schedule booking dialog — Copywriting — S
**File:** `apps/staff-web/app/routes/gymos.schedule.tsx:357-363`
**Problem:** UI-SPEC checker BLOCK-listed generic "Cancel" labels (the same fix was applied to the Templates dialog footer per UI-SPEC §"Checker revision notes"). The booking dialog regresses this rule for an in-scope `/gymos/*` surface.
**Fix:** Change `>Cancel<` to `>Discard<` or `>Close<`. Keep `variant="outline"` to preserve visual hierarchy. (Note: this is a pre-existing schedule.tsx button, not P1b.1-new, but it's in the audit scope and is the only explicit blocklist hit.)

### 3. Bring Members/Payments/Settings titles into the declared 4-size type scale — Typography — M
**Files:**
- `apps/staff-web/app/routes/gymos.members.tsx:101` — `text-2xl font-semibold tracking-tight`
- `apps/staff-web/app/routes/gymos.payments.tsx:25` — `text-2xl font-semibold tracking-tight`
- `apps/staff-web/app/routes/gymos.members.$id.tsx:167` — `text-2xl font-semibold tracking-tight`
- `apps/staff-web/app/routes/gymos.members.$id.tsx:211` — `text-3xl font-semibold tabular-nums` (pass balance number)
- `apps/staff-web/app/routes/gymos.members.$id.tsx:207, 255, 340` — `CardTitle text-base` (3× section titles)
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx:147` — `text-xl font-semibold`
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx:164` — `text-xs text-muted-foreground`
- `apps/staff-web/app/routes/gymos._index.tsx:670, 723` — `text-[15px] font-semibold` (right-rail metric values)

**Problem:** UI-SPEC §Typography declares exactly 4 sizes — `10-11px`, `12px`, `13px`, `14px` — and `text-2xl` (24px) is the same violation Plan 06 went out of its way to avoid in analytics by bypassing shadcn `CardTitle` (see `gymos.analytics.tsx:200-208` for the correct pattern). The pre-existing members/payments/settings routes regress this rule. `text-[15px]` is also off-scale.

**Fix:**
- Page-title `h1`: replace `text-2xl font-semibold tracking-tight` → `text-sm font-semibold` everywhere (this is the "Heading / section" role from UI-SPEC Typography table).
- Pass balance hero: drop `text-3xl` → `text-sm font-semibold` and let the number stand on its own; or escalate to a deliberately-declared 5th hero size if Pass Balance is genuinely meant to be the visual focal point of the profile (then update UI-SPEC).
- CardTitle: pass `className="text-sm"` to override, or follow the analytics pattern and render a plain `<div className="text-sm font-semibold">…</div>` inside `CardHeader` instead of `CardTitle`.
- Settings page: `text-xl` → `text-sm font-semibold`; `text-xs` (12px-ish) → `text-[12px]` for consistency.
- Right-rail metrics: `text-[15px]` → `text-sm` (14px).

### 4. Remove `font-medium` (weight 500) — Typography — S
**Files (representative — see Grep results):**
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx:24` — active nav tab `font-medium`
- `apps/staff-web/app/routes/gymos._index.tsx:485, 554, 566, 696` — `font-medium` on conversation name, window-state badges, next-class heading
- `apps/staff-web/app/routes/gymos.schedule.tsx:247, 332` — `font-medium` on time + member label
- `apps/staff-web/app/routes/gymos.members.tsx:148` — `font-medium` on member name in list
- `apps/staff-web/app/routes/gymos.members.$id.tsx:229, 275, 316, 368` — `font-medium` in card lists
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx:196, 211` — `font-medium` on label + submit button

**Problem:** UI-SPEC §Typography: "Weights declared: regular (400) and semibold (600) only. Do not use 500 (medium) or 700 (bold) in new gymos surfaces". Currently 14+ usages of `font-medium`.

**Fix:** Replace all `font-medium` in these files with `font-semibold` where bold-ness is wanted (active nav tab, emphasised member name, submit button label) and drop it entirely where it was just adding subtle weight (the right-rail "Next class" heading reads fine at regular). The active-tab `font-medium` in `GymosTopNav.tsx:24` is the most-visible one — promote to `font-semibold` to match the page-title weight.

### 5. Use `text-destructive` / `bg-destructive` semantic tokens instead of raw `red-500` — Color — S
**Files:**
- `apps/staff-web/app/routes/gymos._index.tsx:592` — `bg-red-500/10 text-red-900 dark:text-red-200 border border-red-500/30` (failed message bubble)
- `apps/staff-web/app/routes/gymos._index.tsx:605` — `text-red-600 dark:text-red-400` (failed-bubble error copy)
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx:223` — `bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300` (rotation error)
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx:218` — `bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300` (rotation success — undeclared semantic)

**Problem:** UI-SPEC §Color reserves `--destructive` (red) for "Failed-send error bubble text, destructive confirmation buttons only". Raw Tailwind palette colors bypass the semantic token system and won't follow dark-mode tweaks if the palette is ever re-tuned. Emerald is declared only for the "window open" badge, not as a generic success token.

**Fix:**
- Failed bubble: `bg-destructive/10 text-destructive border border-destructive/30` (the UI-SPEC's intended target).
- Error copy: `text-destructive` (already used elsewhere in TemplatesDialog at line 308).
- Settings success banner: either accept the new semantic and add a "success" row to the UI-SPEC color table, OR repurpose `text-emerald-600 dark:text-emerald-400` (the declared in-window token) for consistency.

### 6. Disable Schedule "Book" button when the occurrence is full — Experience Design — S
**File:** `apps/staff-web/app/routes/gymos.schedule.tsx:356-365`
**Problem:** When the occurrence is at-capacity, the dialog shows `"(over capacity — demo allows this)"` and still allows the Book submit, producing an over-booked row. This is both a copywriting leak (fix #1) AND a UX leak — coaches expect the button to gate.
**Fix:** Add `disabled={occFull}` to the submit button (line 364). Update copy: "At capacity" instead of "over capacity — demo allows this". Note in code comment that production atomicity (BKG-03/BKG-04) is a separate concern.

### 7. Fix Pass Utilisation "30d" card to not duplicate the 7d snapshot — Experience Design — M
**File:** `apps/staff-web/app/routes/gymos.analytics.tsx:277-287`
**Problem:** The card shows the same `data.passUtil.pct` value for both the `7d` and `30d` slots (lines 279 and 285), with the secondary context labeled `"Snapshot — all active passes"`. Reading the card, a coach sees two identical percentages stacked on top of each other and asks "why is this here twice?" — the metric is genuinely snapshot-only, but the duplication makes it look like a bug.
**Fix:** Drop the secondary value/context entirely for Pass Utilisation, OR refactor `MetricCard` to accept an optional `snapshot` prop that renders a single primary value with no `7d/30d` badge split. Cleanest: render the Pass Utilisation card without the second value row — show just the snapshot pct + badge + context line, and skip the secondary block. Means a small `MetricCard` API tweak (`secondaryValue?: string`).

### 8. Add Skeleton loading state to Analytics + Templates list per UI-SPEC — Experience Design — M
**Files:**
- `apps/staff-web/app/routes/gymos.analytics.tsx` — loader is server-side; first render shows real data only after SSR completes. No client-side loading affordance.
- `apps/staff-web/app/components/gymos/TemplatesDialog.tsx:197-262` — template list assumes `templates` is already loaded (it is, from the route loader). No Skeleton path.

**Problem:** UI-SPEC §"Loading states" requires `Skeleton (h-8 w-24 + h-4 w-32)` per analytics card, and `Skeleton rows (h-8 w-full, 3 rows)` for the templates list. SSR-only loading is acceptable for the first request but degrades on slow networks / loader revalidation.

**Fix:** This is a defer-to-P2 candidate. For now, document the deviation in `gymos.analytics.tsx` and `TemplatesDialog.tsx` header comments. If we want to ship the Skeleton path: in analytics, wrap each `MetricCard` value/context in a `<Skeleton>` when a `fetcher.state === "loading"` (only fires on revalidation). In TemplatesDialog, no realistic case triggers loading since templates ship with the route loader — defer entirely.

### 9. Move access-denied wordmark to top, not vertically centered — Visuals — S
**File:** `apps/staff-web/app/routes/access-denied.tsx:48-65`
**Problem:** UI-SPEC §4 says "Brand wordmark: 'GymClassOS' (14px semibold ...) at top". Current layout is `flex flex-col items-center justify-center gap-6` which stacks **all** five elements (wordmark, lock icon, heading, body, CTA) vertically-centered together — so the wordmark sits mid-screen above the icon, not as a page-top brand affordance.
**Fix:** Restructure to a two-section layout:
```tsx
<main className="min-h-screen flex flex-col bg-background">
  <header className="px-6 py-4">
    <div className="text-sm font-semibold text-foreground">GymClassOS</div>
  </header>
  <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
    <IconLock size={40} ... />
    <h1 ...>Access not permitted</h1>
    <p ...>...</p>
    <Button ...>Sign in with a different account</Button>
  </div>
</main>
```

### 10. Make the Settings tab icon-or-no-icon consistent with siblings — Visuals — S
**File:** `apps/staff-web/app/components/gymos/GymosTopNav.tsx:52-62`
**Problem:** Settings is the only tab with an icon (`IconSettings size={14}`) — every other tab (Inbox, Schedule, Members, Payments, Analytics) is text-only. The asymmetric visual treatment makes Settings read as "special" when it should be just another text tab.
**Fix:** Either (a) drop `<IconSettings>` and the `aria-label` and ship Settings as a plain text tab to match siblings, OR (b) add icons to every other tab (Inbox=`IconInbox`, Schedule=`IconCalendar`, Members=`IconUsers`, Payments=`IconCreditCard`, Analytics=`IconChartBar`) for a uniform iconographic nav. Option (a) is the smaller diff and matches the "text-only tabs" pattern UI-SPEC §3 references for the Analytics tab.

## Per-Pillar Findings

### Copywriting (2/4)

**New phase surfaces:** Verbatim per UI-SPEC §"Copywriting Contract".
- `TemplatesDialog.tsx`: all 10+ declared strings ("Send a template", "Approved WhatsApp message templates", "Select a template from the list", "Approved", "Awaiting approval", "Awaiting Meta approval — submit templates via your Meta Business Manager", "Discard draft", "Send template", "Template queued", "Member hasn't opted in to WhatsApp messages") — exact matches.
- `access-denied.tsx:54-63`: "Access not permitted", body copy, "Sign in with a different account" — verbatim.
- `gymos.analytics.tsx:241-279`: "Analytics", "Last 7 days · Last 30 days", "Fill Rate", "Cancellation Rate", "Pass Utilisation", "No data yet", "–" — verbatim.
- `gymos._index.tsx:631`: out-of-window placeholder now reads `"Out of 24h window — use a template"` (the `(P2)` debug suffix was correctly removed per Plan 05).

**Pre-existing surfaces leak dev/demo language to the pilot customer:**
- `gymos._index.tsx:662` — right-rail subtitle `"Why GymClassOS > Mindbody — this panel"` (visible on every selected conversation; competitive jab + dev banter).
- `gymos.schedule.tsx:322` — `"(over capacity — demo allows this)"`.
- `gymos.schedule.tsx:350-354` — dialog footnote about transaction atomicity.
- `gymos.members.tsx:180-183` — `"Demo-grade: no pagination, no search, no edit (MEM-03 / MEM-05 in Production v1)"`.
- `gymos.members.$id.tsx:381-385` — `"Demo-grade: shows the snapshotted kcal/protein..."`.

**Blocklist hit:**
- `gymos.schedule.tsx:362` — booking dialog has `>Cancel<` (UI-SPEC checker blocked this generic label in the Templates dialog footer; same fix needed here).

**Minor:** `"Untitled class"` (schedule.tsx:262), `"Unknown"` (gymos._index.tsx:470), `"Unnamed"` (members.tsx:136, members.$id.tsx:144) are graceful fallbacks; acceptable.

### Visuals (4/4)

- All icons are Tabler — `IconLock`, `IconTemplate`, `IconSettings`, `IconPointFilled`. Zero emoji-as-icon usages. Zero sparkle/wand.
- Window-state semantic dots use `IconPointFilled` (correct per AGENTS.md LOW #12 rule that originally specified Tabler over `U+25CF`).
- `IconTemplate` paired with text label "Templates" — accessible.
- All icon-only affordances have `aria-hidden` set; the icon-paired Settings link has `aria-label="Settings"`.
- One inconsistency: Settings is the only nav tab with an icon (see fix #10). Cosmetic, not blocking.
- Hierarchy: page-title weight + size is visually clear; window-state badges have meaningful color + dot. No issues here.

### Color (3/4)

Strong semantic discipline overall:
- All new files use `bg-background`, `bg-card`, `bg-muted`, `text-muted-foreground`, `border-border` — semantic tokens, no hex.
- `text-emerald-600 dark:text-emerald-400` for in-window badge — matches UI-SPEC §Color "Window open" declaration.
- `text-muted-foreground` for out-of-window — matches spec.
- Accent (`bg-accent`) only on selected nav tab + template-row selection + hover states — matches "Accent reserved for active navigation tab background only" rule.
- No raw `#` hex anywhere in scope; no `rgb()` / `rgba()` either (grep returned zero matches).

Slips:
- `bg-red-500/10` / `text-red-{600,700,900}` used for failed-message bubble and rotation error (gymos._index.tsx:592, 605; settings.integrations:223) instead of the declared `--destructive` token.
- `text-amber-600 dark:text-amber-400` for "full class" indicator (schedule.tsx:254, 317) — introduces an undeclared "warning" semantic.
- `bg-emerald-500/10` for rotation success banner (settings.integrations:218) — emerald is declared for window-open badge only; using it as a generic success token is undeclared.
- `text-primary text-primary-foreground` on unread badge (gymos._index.tsx:490) — accepts because unread badges are tertiary affordance; not a blocking issue.

### Typography (1/4)

UI-SPEC §Typography declares exactly **4 sizes** (10-11px caption, 12px label, 13px body, 14px heading) and **2 weights** (400 regular, 600 semibold). Actual surface count: **8 distinct sizes** plus widespread `font-medium`.

Distinct sizes found across audit scope:
- Spec-declared: `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`, `text-sm` (14px), `text-[14px]` ✓
- **Off-scale:** `text-base` (16px, members.$id.tsx CardTitle ×3), `text-[15px]` (gymos._index.tsx ×2), `text-lg` (none in scope but `text-xl` settings:147), `text-xl` (settings:147), `text-2xl` (members ×3, payments ×1), `text-3xl` (members.$id.tsx:211), `text-xs` (settings:164).
- Plan 06 (analytics) explicitly worked around shadcn `CardTitle`'s default `text-2xl` (see comments in `gymos.analytics.tsx:22-25`) — the pre-existing `CardTitle` usages in `gymos.members.$id.tsx` and the `text-2xl`/`text-3xl` heroes in the members + payments routes regress that discipline.

Weight violations:
- `font-medium` (500) appears 14+ times across `GymosTopNav.tsx`, `gymos._index.tsx`, `gymos.schedule.tsx`, `gymos.members.tsx`, `gymos.members.$id.tsx`, `gymos.settings.integrations.tsx`.
- UI-SPEC: "Do not use 500 (medium) or 700 (bold) in new gymos surfaces".
- The active-tab `font-medium` in GymosTopNav is the most-visible regression because it sits at the top of every gymos page.

This is the lowest-scoring pillar by a wide margin and is the single highest-leverage area for a polish pass: a global find-replace from `font-medium` → `font-semibold` and a typography sweep on members/payments/settings would restore conformance with the declared 4-size, 2-weight scale.

### Spacing (3/4)

Largely conformant:
- All new + most pre-existing spacing uses Tailwind defaults — `p-4`, `px-4`, `py-3`, `gap-2`, `gap-3`, `gap-4`, `gap-6`, `space-y-3`, `space-y-4`, `space-y-6` — all multiples of 4px ✓
- Reply form `px-5 py-3` (20px / 12px) — declared as an exception in UI-SPEC §Spacing ✓
- TemplatesDialog `max-w-[640px] h-[520px]`, member context panel `w-[300px]`, conversation list `w-[320px]`, template list pane `w-[200px]` — all match UI-SPEC §Surface Specifications ✓
- Touch target 44px (`h-11` nav, `min-h-[44px]` on AppLayoutInner sidebar items) ✓
- 104 `text-[Npx]` arbitrary values are font sizes, not spacing — typography concern, not spacing.

Minor slips (off-multiple-of-4 spacing):
- `space-y-0.5` (2px) in TemplatesDialog header (`DialogHeader space-y-0.5`).
- `mt-0.5`, `pb-0.5` in GymosTopNav + inbox header subtitle (2px) — `text-[11px] text-muted-foreground mt-0.5`.
- `py-1.5`, `gap-1.5`, `mt-1.5` (6px) in inbox + members directory rows.
- `px-2.5 py-1` in GymosTopNav:22 — pre-existing per UI-SPEC note, not introduced by this phase.
- No arbitrary `[Npx]` *spacing* values in scope (the `[640px]`/`[520px]`/`[300px]` etc are dimension contracts from the UI-SPEC).

Not blocking — the spec's 4px floor is more aspirational than absolute (Tailwind's `gap-1.5` = 6px is widely treated as harmless). Worth tightening in a polish pass.

### Experience Design (3/4)

Strong patterns:
- **Optimistic UI** is exemplary on template send (`TemplatesDialog.tsx:147-161`): toast fires + dialog closes immediately on Send click; the fetcher.submit settles in the background; failed-bubble copy renders on next loader re-fetch. Matches CLAUDE.md "no-spinner-after-click" mandate.
- **Empty states** complete: analytics ("No data yet" + en-dash per spec), inbox ("Select a conversation to start"), members ("No members yet"), member profile ("No upcoming class", "No past bookings", "Nothing logged yet"), templates dialog ("Select a template from the list").
- **Error states** complete: typed failed-bubble copy (gymos._index.tsx:421-433 `failedCopy()` maps NO_OPT_IN / WINDOW_EXPIRED / TEMPLATE_NOT_APPROVED to friendly strings), settings rotation success/error banners, inline "Required" on template variable inputs.
- **Disabled states** for template Send button respect approval + opt-in + variable-presence; reply Input + Send disabled when out-of-window or no opt-in.
- **Keyboard / ARIA:** TemplatesDialog uses `role="listbox"` + `role="option"` + `aria-selected` (lines 201-211), tooltips on disabled rows, `aria-hidden` on icons. Analytics cards `role="region"` + `aria-label` per card.
- **Cross-surface deep-link:** "Open WhatsApp conversation" in member profile (members.$id.tsx:197-199) closes the inbox ↔ profile loop nicely.

Gaps:
- **No Skeleton loading state on Analytics or Templates list** per UI-SPEC §"Loading states". Both rely on route-loader SSR so first paint is real data, but loader revalidation has no progress affordance. Defer fix to P2 (see Top Fix #8).
- **Pass Utilisation card duplicates the 7d value as the 30d value** with only the context label changing. Visually reads as a bug to a non-developer (Top Fix #7).
- **Access-denied wordmark vertically centered with the rest of the stack** instead of "at top" (Top Fix #9).
- **Schedule booking allows over-capacity submission** despite showing "over capacity — demo allows this" (Top Fix #6).
- **Booking dialog uses `Cancel`** — UI-SPEC blocklist hit (Top Fix #2).

## Registry Safety

- `apps/staff-web/components.json` exists (shadcn initialized).
- UI-SPEC §"Registry Safety" declares: `shadcn official` only, no third-party registries.
- Confirmed by grep: every shadcn import in scope comes from `@/components/ui/*` (the local shadcn-installed components), no third-party registry blocks.
- **Result: 0 third-party blocks audited; no flags.**

## Files Audited

In-scope (per task `<scope>`):
- `apps/staff-web/app/routes/gymos.tsx`
- `apps/staff-web/app/routes/gymos._index.tsx` (focused on header/list/thread/reply form/right-rail; action handlers out of UI scope)
- `apps/staff-web/app/routes/gymos.schedule.tsx`
- `apps/staff-web/app/routes/gymos.members.tsx`
- `apps/staff-web/app/routes/gymos.members.$id.tsx`
- `apps/staff-web/app/routes/gymos.payments.tsx`
- `apps/staff-web/app/routes/gymos.analytics.tsx` (new this phase)
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx`
- `apps/staff-web/app/routes/access-denied.tsx` (new this phase)
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx`
- `apps/staff-web/app/components/gymos/TemplatesDialog.tsx` (new this phase)
- `apps/staff-web/app/components/layout/AppLayout.tsx` (gym branch at lines 131-148; email branch ignored)

Reference reads:
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md`
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md`
- All 7 `P1b.1-*-SUMMARY.md` files (01, 02, 03, 04, 05, 06, 07)
- `CLAUDE.md` + `AGENTS.md` (root)
- `apps/staff-web/AGENTS.md`
- `apps/staff-web/app/components/ui/card.tsx` (confirmed `CardTitle` defaults to `text-2xl`)

## Backlog (lower-priority, defer to P2)

- Add `IconTemplate` to the Templates button's left margin: it currently uses `mr-1` (4px) which collapses against the label — bump to `mr-1.5` for visual balance.
- TemplatesDialog right-pane "Preview" block uses `whitespace-pre-wrap break-words` — verify with a long template body to ensure no awkward wrapping.
- The conversation-list unread badge uses `bg-primary` (an accent color) — UI-SPEC §Color reserves accent for nav tabs. Consider `bg-foreground text-background` instead.
- Settings textarea has no character-counter / clearer affordance for the `rk_` prefix validation — minor UX polish.
- Members directory pass-balance badge uses `variant="default"` when `> 0` (so positive balances render in `bg-primary text-primary-foreground` — accent overuse). Switch to `variant="secondary"` or a neutral muted badge.
- The schedule dialog footer button uses `<Button type="button" variant="outline">Cancel</Button>` — even after the Cancel → Discard rename (Top Fix #2), consider making the dialog close-on-overlay-click sufficient and dropping the button entirely (shadcn Dialog already supports Escape + overlay close).
- Pass Utilisation card 30d slot fix (Top Fix #7) is technically a P1 concern but feels P2-able if the customer isn't going to scrutinize it on demo day.

## Out of Scope

- **Email surfaces** (`/inbox`, `/sent`, `/settings`, `/draft-queue`, `/team`, etc. — the Mail template) — not part of P1b.1 audit. The email AppLayout chrome lives behind the `if (location.pathname.startsWith("/gymos"))` early-return branch (per Plan 01) and was intentionally not touched.
- **AppLayoutInner** (the giant 2194-line file's email-only branch) — outside scope per task instructions. Only the gymos branch (lines 131-148) was audited.
- **Mobile responsiveness on non-primary breakpoints** — none of the audited files use a mobile-first responsive grid beyond the analytics `grid-cols-1 md:grid-cols-3` and TemplatesDialog's fixed `max-w-[640px]`. Mobile audit deferred to P2.
- **Visual screenshots** — task explicitly requested static audit only. Dev server detection found a server on port 8080 but no captures were taken per task scope.
- **Worker / pg-boss / Stripe SDK integration code** in action handlers — non-UI.

## Conclusion

## UI REVIEW COMPLETE

The three P1b.1-new surfaces — Templates dialog, Analytics route, Access-denied page — land cleanly against the UI-SPEC and demonstrate the discipline (Plan 06's deliberate avoidance of `CardTitle`'s `text-2xl`, Plan 05's verbatim copy reproduction) that the spec was written to enforce. The audit's low score comes overwhelmingly from the pre-existing inbox / schedule / members / payments / settings routes that were carried into the pilot from earlier demo-sprint work but never harmonised with the UI-SPEC that emerged in P1b.1. The Typography pillar (1/4) is the single highest-leverage fix area — a global `font-medium` → `font-semibold` sweep plus four `h1` font-size adjustments and three `CardTitle` overrides would reclaim 2 full points. The Copywriting pillar (2/4) is the second highest-impact area, because the leaked dev banter ("Why GymClassOS > Mindbody", "demo allows this", "Demo-grade", `MEM-03 / MEM-05`) is what the pilot customer will literally read on day one — a 30-minute string sweep would reclaim the other point. Phase shipped on contract for the new code; the pre-existing surfaces need a focused `/gsd:quick` polish pass before the customer onboarding.
