---
type: ui-polish-summary
phase: P1b.1-customer-pilot-enablement
created: 2026-05-26
source_review: P1b.1-UI-REVIEW.md
---

# P1b.1 UI Polish — Applied Fixes

Applied 10/10 fixes from UI-REVIEW.md (+ AGENTS.md doc fix). Every Top-Fix item was addressed; the only "deferred" item (Skeleton on Analytics + Templates) is documented inline as a deliberate non-action because both surfaces source data from synchronous SSR loaders with no client-fetcher state that would trigger a Skeleton.

`pnpm --filter @gymos/staff-web typecheck` exits 0 after every commit.

## Commits

| #   | SHA        | Subject                                                              | Fixes        |
| --- | ---------- | -------------------------------------------------------------------- | ------------ |
| A   | `fdde5225` | customer-facing copy sweep                                           | #1           |
| B   | `c9939c26` | use Discard in schedule booking; disable Book at capacity            | #2, #6       |
| C   | `3883c7ed` | normalize typography to UI-SPEC 4-size scale + drop font-medium      | #3, #4       |
| D   | `50e5fbd1` | use destructive semantic token; document Skeleton deferral           | #5, #8       |
| E   | `800cdab5` | MetricCard snapshot mode; access-denied header; uniform nav tabs     | #7, #9, #10  |
| F   | `e1643b2a` | fix passes.status reference in staff-web AGENTS.md                   | doc bug      |

## Per-Fix Notes

### #1 Copy sweep (Commit A)
Stripped dev/demo scaffolding language the pilot customer would have read on day one.
- `gymos._index.tsx:662` right-rail subtitle — "Why GymClassOS > Mindbody — this panel" → "Member at a glance"
- `gymos._index.tsx:646-650` reply-form pg-boss/worker/Meta-v23 internals footnote — removed entirely
- `gymos.schedule.tsx:350-354` booking dialog "Demo: inserts a bookings row..." transaction-internals paragraph — removed
- `gymos.schedule.tsx:322` "(over capacity — demo allows this)" — handled in Commit B (replaced with "At capacity")
- `gymos.members.tsx:180-183` "Demo-grade: no pagination, no search, no edit (MEM-03 / MEM-05 in Production v1)" footer — removed
- `gymos.members.$id.tsx:381-385` "Demo-grade: shows the snapshotted kcal/protein..." food-entries footer — removed
- **Bonus (out-of-audit-scope but obviously dev language):** `gymos.payments.tsx:30-39` "Stripe Checkout link generation... Demo Sprint D1-03 is paused awaiting STRIPE_SECRET_KEY in the env file. Production payments + Stripe webhook spine ship in Phase P1b" — replaced with neutral "Stripe Checkout link generation and pass-grant reconciliation are coming soon."

### #2 Discard rename in schedule booking dialog (Commit B)
- `gymos.schedule.tsx:357-363` — `>Cancel<` → `>Discard<`. UI-SPEC blocklists generic "Cancel" labels; same fix that was applied to the Templates dialog footer.

### #3 Typography normalized to declared 4-size scale (Commit C)
Replaced 8 off-scale font sizes with the 4 sizes UI-SPEC declares (10/11px, 12px, 13px, 14px).
- Page titles in `gymos.members.tsx:101`, `gymos.payments.tsx:25`, `gymos.members.$id.tsx:167`: `text-2xl font-semibold tracking-tight` → `text-sm font-semibold`
- Pass balance hero in `gymos.members.$id.tsx:211`: `text-3xl` → `text-sm font-semibold` (deliberately did NOT escalate to a new 5th hero size — Pass Balance is one of many cards on the profile, not the focal point)
- 3× `CardTitle text-base` in `gymos.members.$id.tsx:207, 255, 340`: passed `className="text-sm font-semibold"` to override shadcn's default text-2xl (same pattern as the analytics route)
- `gymos.settings.integrations.tsx:147` h1: `text-xl font-semibold` → `text-sm font-semibold`
- `gymos.settings.integrations.tsx:164` "Current key" label: `text-xs` → `text-[12px]` (consistent with rest of file)
- `gymos.settings.integrations.tsx:202` key textarea: `font-mono text-xs` → `font-mono text-[12px]`
- `gymos._index.tsx:670, 723` right-rail metric values: `text-[15px]` → `text-sm` (14px)

### #4 font-medium (weight 500) removed across 14 usages (Commit C)
UI-SPEC declares only 400 and 600. Replaced every `font-medium` in scope with `font-semibold`.
- `GymosTopNav.tsx:24` active-tab — promoted to `font-semibold` (most-visible regression — top of every gymos page)
- `gymos._index.tsx` conversation name, two window-state badges, next-class heading → `font-semibold`
- `gymos.schedule.tsx` occurrence time + member label → `font-semibold`
- `gymos.members.tsx` member-name list → `font-semibold`
- `gymos.members.$id.tsx` pass productName, upcoming className, past className, food kcal → `font-semibold`
- `gymos.settings.integrations.tsx` "set" status, "New restricted key" label, Validate & rotate button → `font-semibold`

### #5 Destructive semantic token replaces raw red-500 (Commit D)
- `gymos._index.tsx:592` failed bubble: `bg-red-500/10 text-red-900 dark:text-red-200 border border-red-500/30` → `bg-destructive/10 text-destructive border border-destructive/30`
- `gymos._index.tsx:605` failed-bubble error copy: `text-red-600 dark:text-red-400` → `text-destructive`
- `gymos.settings.integrations.tsx:223` rotation error banner: raw red palette → `bg-destructive/10 border border-destructive/20 text-destructive`

**Deliberate non-change:** Settings rotation success banner stays `bg-emerald-500/10`. The audit explicitly offered the choice between "add a success row to the spec" or "repurpose the emerald in-window token". Repurposing emerald felt wrong (it's declared for one specific affordance), and adding a generic success semantic to the spec is out-of-scope for a polish PR. Left as-is; note in future spec revision.

### #6 Book button disabled at capacity (Commit B)
- `gymos.schedule.tsx:364` — added `disabled={occFull}`; replaced "over capacity — demo allows this" with "At capacity" in the dialog description.
- Comment added: production atomicity (BKG-03/BKG-04) still owns the authoritative gate inside the booking transaction. This is a UI-only safety net.

### #7 Pass Utilisation card no longer duplicates 7d as 30d (Commit E)
Refactored `MetricCard` to accept a discriminated `variant` prop:
- `"default"` (Fill Rate, Cancellation Rate): renders 7d / 30d comparison with both value rows + badges.
- `"snapshot"` (Pass Utilisation): renders single primary value, no 7d/30d badge split, no secondary row. Context line ends "· snapshot" to mark it as point-in-time.

TypeScript discriminated union prevents passing `secondaryValue`/`secondaryContext` when `variant="snapshot"`.

### #8 Skeleton loading state — documented deferral (Commit D)
Both Analytics and TemplatesDialog source their data from synchronous parent-route loaders. There is no `fetcher.state === "loading"` path that would trigger a Skeleton on revalidation. Added header-comment documentation in both files:
- `gymos.analytics.tsx` — notes the deferral and the trigger conditions that would warrant wiring Skeleton later (e.g. a date-range fetcher).
- `TemplatesDialog.tsx` — notes that templates ship in the parent route loader, so the list is already populated by the time the Dialog opens; a Skeleton would only matter if templates moved to a client fetcher (e.g. polling for Meta approval).

This matches the audit's own recommendation ("This is a defer-to-P2 candidate. For now, document the deviation...").

### #9 Access-denied wordmark moved to top of page (Commit E)
- `access-denied.tsx:48-65` — restructured from a single vertically-centered flex stack into two sections: a `<header className="px-6 py-4">` carrying the GymClassOS wordmark, and a `flex-1` region below centering the lock icon + heading + body + CTA.
- Matches UI-SPEC §4 "Brand wordmark ... at top".

### #10 Settings tab now plain text, matching siblings (Commit E)
- `GymosTopNav.tsx:52-62` — removed `<IconSettings>` and `aria-label="Settings"`; removed `inline-flex items-center gap-1`; removed unused `IconSettings` import.
- All six tabs (Inbox, Schedule, Members, Payments, Analytics, Settings) are now visually uniform plain-text tabs per UI-SPEC §3 "text-only tabs" pattern. Chose option (a) from the audit (drop the icon) over option (b) (icon-ify all) — the smaller diff and the cleaner top-nav.

### Doc fix — `passes.status` in staff-web AGENTS.md (Commit F)
- `apps/staff-web/AGENTS.md` Data Sources table claimed `passes.status` (active/expired/void) — but `schema.ts:235` has no `status` column. Updated to "granted (credits), expires_at (active = NULL or future). No status column; 'active' is derived from expires_at."
- This matches the definition every action in `apps/staff-web/actions/` uses (list-at-risk-members.ts, list-renewals.ts, gymos.analytics.tsx, gymos.members.tsx).

## Skipped / Deferred

- **Settings success banner `bg-emerald-500/10`** — left as-is. See #5 note above. Would need either a spec revision (add a `success` semantic) or a deliberate repurpose of the in-window `emerald` token. Not blocking; the banner reads cleanly.
- **Schedule "full class" `text-amber-600` indicator** — flagged in the audit as an "undeclared warning semantic" but not in the Top 10. Left in place — it's used consistently in 2 spots (occurrence pill + dialog description) and reading it as "warning" is intuitive. Would benefit from a declared `warning` semantic in the next UI-SPEC revision; not blocking for the pilot.
- **Minor off-multiple-of-4 spacing** (`py-1.5`, `mt-0.5`, `space-y-0.5`) — flagged in audit as a minor slip but not in Top 10. Out of scope for this polish pass.
- **Backlog items** from UI-REVIEW.md §Backlog — all explicitly P2.

## Estimated New Score

Starting from 16/24, conservative re-scoring with these polish fixes:

| Pillar             | Before | After (est) | Reasoning |
| ------------------ | -----: | ----------: | --------- |
| Copywriting        |  2 / 4 |       4 / 4 | All blocklist + dev/demo language stripped; only fallback strings ("Unknown" / "Unnamed" / "Untitled class") remain, all acceptable per audit. |
| Visuals            |  4 / 4 |       4 / 4 | No regression; Settings tab uniformity fix is a refinement, not a score change. |
| Color              |  3 / 4 |     3.5 / 4 | Destructive token now used throughout; emerald success + amber warning slips remain but are non-blocking and called out in the deferred list. |
| Typography         |  1 / 4 |       4 / 4 | All 8 off-scale sizes brought into the declared 4-size scale; zero `font-medium` remaining in scope. |
| Spacing            |  3 / 4 |       3 / 4 | No change; out of scope. |
| Experience Design  |  3 / 4 |       4 / 4 | Pass Utilisation snapshot fix + Book-at-capacity disable + access-denied header. Skeleton documented as deliberate deferral matching the audit's own recommendation. |
| **Total**          | **16 / 24** | **22.5 / 24** | Single round of focused polish moves the pre-existing surfaces in line with the spec the new-code surfaces already met. |

The remaining 1.5 points are deliberate — they're spec-revision territory (add success + warning semantics, decide whether 4px or 6px is the floor) rather than implementation defects.

## Self-Check: PASSED

Verified all 6 commits exist on master:

```
e1643b2a docs(P1b.1-polish): fix passes.status reference in staff-web AGENTS.md
800cdab5 style(P1b.1-polish): MetricCard snapshot mode; access-denied header; uniform nav tabs
50e5fbd1 style(P1b.1-polish): use destructive semantic token; document Skeleton deferral
3883c7ed style(P1b.1-polish): normalize typography to UI-SPEC 4-size scale + drop font-medium
c9939c26 style(P1b.1-polish): use Discard in schedule booking; disable Book at capacity
fdde5225 style(P1b.1-polish): customer-facing copy sweep
```

`pnpm --filter @gymos/staff-web typecheck` exits 0 at HEAD.

`Grep "font-medium"` against in-scope gymos files returns zero matches (was 14+).

`Grep "text-(2xl|3xl|xl|base|xs|lg)"` against in-scope gymos files returns zero matches (was 9).

`Grep "text-\[15px\]"` against in-scope gymos files returns zero matches (was 2).
