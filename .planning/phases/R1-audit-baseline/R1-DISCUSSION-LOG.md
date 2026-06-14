# Phase R1: Audit Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** R1-audit-baseline
**Areas discussed:** Screenshot tooling & viewports, Surface coverage scope, Naming record format & depth, Baseline diffability

---

## Screenshot tooling & viewports

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright script (Recommended) | Committed script run locally against the live Vercel deploy; repeatable per pitfall R-11 | ✓ |
| Manual browser captures | Faster to start, no after-state comparability | |
| Hybrid | Playwright for main routes, manual for awkward states | |

**User's choice:** Playwright script

| Option | Description | Selected |
|--------|-------------|----------|
| Desktop + mobile (Recommended) | 1440px + 390px; SWEB-06 needs a mobile-width before-state | ✓ |
| Desktop only | 1440px only | |
| Desktop + tablet + mobile | 1440/768/390; tablet not a requirement target | |

**User's choice:** Desktop + mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Saved storageState (Recommended) | Log in once manually, save gitignored storageState.json, script reuses | ✓ |
| Seeded test credentials | Would require a code change R1 shouldn't make (Google-OAuth-only today) | |
| Manual capture for authed pages | Loses repeatability on the most important pages | |

**User's choice:** Saved storageState

| Option | Description | Selected |
|--------|-------------|----------|
| Light + dark host pages (Recommended) | Matches WDGT-03's verification setup exactly | ✓ |
| Light host only | No before-state for R4's dark-host criterion | |

**User's choice:** Light + dark host pages

---

## Surface coverage scope

| Option | Description | Selected |
|--------|-------------|----------|
| All user-facing routes (Recommended) | Gymos + still-routable legacy email routes; excludes API/webhooks | |
| Gymos + embeds only | Legacy routes in naming record only | |
| **Other (free text)** | "everything but exclude /email" | ✓ |

**User's choice:** Everything (all user-facing routes including legacy), explicitly excluding `/email`
**Notes:** `/email` excluded from screenshot coverage; legacy `draft-queue`, `/settings`, `$view`, `/team` stay in.

| Option | Description | Selected |
|--------|-------------|----------|
| Pages + key states (Recommended) | Page loads + member context panel, Templates dialog, booking dialog, member detail | ✓ |
| Page loads only | No before-state for dialogs/panels | |

**User's choice:** Pages + key states

| Option | Description | Selected |
|--------|-------------|----------|
| You capture on real phone (Recommended) | User runs Expo Go on device; Claude provides screen/filename checklist | ✓ |
| iOS simulator | Not available (Windows machine) | |
| Defer mobile baseline to R5 start | Drift risk from master-branch mobile work | |

**User's choice:** User captures on real phone via Expo Go

| Option | Description | Selected |
|--------|-------------|----------|
| All screens + agent sheet (Recommended) | 4 tabs + member picker + food-add + food-barcode + agent chat sheet | ✓ |
| 4 tabs only | Misses modal screens R5 touches | |

**User's choice:** All screens + agent sheet

---

## Naming record format & depth

| Option | Description | Selected |
|--------|-------------|----------|
| Inventory + propose targets (Recommended) | current → proposed target → layer; targets from NAME-01..07 + FEATURES.md table | ✓ |
| Inventory + classify only | Leaves naming debates to R3 | |

**User's choice:** Inventory + propose targets

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown tables by layer (Recommended) | One doc, one table per rename layer | ✓ |
| CSV + markdown summary | Extra ceremony | |

**User's choice:** Markdown tables by layer

| Option | Description | Selected |
|--------|-------------|----------|
| Full provenance (Recommended) | name | file refs | target | layer | risk note | ✓ |
| Minimal (name + layer + target) | R3 would need to re-grep | |

**User's choice:** Full provenance

| Option | Description | Selected |
|--------|-------------|----------|
| All three surfaces (Recommended) | Staff-web + mobile tabs (MOBL-02) + widget vocabulary (NAME-06, WDGT-02) | ✓ |
| Staff-web only | Mobile/widget naming pushed to R5/R4 plan time | |

**User's choice:** All three surfaces

---

## Baseline diffability

| Option | Description | Selected |
|--------|-------------|----------|
| Per-surface folders (Recommended) | baseline/staff-web/, embeds/, mobile/ with viewport+state filename suffixes | ✓ |
| Flat directory | Hard to scan at ~60+ files | |

**User's choice:** Per-surface folders

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — INDEX.md manifest (Recommended) | Route, viewport, state, date, deploy SHA per capture; coverage-parity checklist | ✓ |
| No manifest | Parity relies on eyeballing | |

**User's choice:** INDEX.md manifest

| Option | Description | Selected |
|--------|-------------|----------|
| scripts/ui-baseline/ in repo (Recommended) | Parameterized by output dir; standing verification tool (R-11) | ✓ |
| Inside .planning/ui-reviews/ | Scripts in docs space rot unnoticed | |

**User's choice:** scripts/ui-baseline/

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-side review (Recommended) | Redesign changes everything; pixel-diff would flag 100% of pixels | ✓ |
| Pixel-diff ready | Extra scripting cost for surfaces not being redesigned | |

**User's choice:** Side-by-side review

---

## Claude's Discretion

- Playwright config details (wait strategies, animation settling, full-page vs viewport)
- Which legacy `$view` route variants to capture
- Naming record section ordering beyond per-layer tables
- Embed test page implementation (static HTML per STATE.md)

## Deferred Ideas

None — discussion stayed within phase scope.
