---
phase: quick
plan: 260622-jga
subsystem: staff-web/brain
tags: [brand, styling, ssr, brain, anthropic, ssrf]
dependency_graph:
  requires: [260622-ifj]
  provides: [brand-styling-db-row, getTenantBrand, brain-extract-brand, safe-fetch]
  affects: [schedule-widget-ssr, public-form-ssr, embed-buy-handler, public-video-ssr, public-content-ssr]
tech_stack:
  added: [brain-extract-brand, safe-fetch, tenant-brand-resolver]
  patterns: [DB-backed brand resolver with in-process cache, SSRF-guarded server fetch, per-field fallback merge]
key_files:
  created:
    - apps/staff-web/server/lib/tenant-brand-resolver.ts
    - apps/staff-web/server/lib/safe-fetch.ts
    - apps/staff-web/actions/brain-extract-brand.ts
  modified:
    - apps/staff-web/server/lib/tenant-brand.ts
    - apps/staff-web/actions/brain-init.ts
    - apps/staff-web/actions/update-brain-doc.ts
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/lib/embed-buy-handler.ts
    - apps/staff-web/server/lib/public-video-ssr.ts
    - apps/staff-web/server/lib/public-content-ssr.ts
    - apps/staff-web/app/routes/gymos.brain.tsx
    - apps/staff-web/AGENTS.md
decisions:
  - Thread brand as parameter to sync SSR inner functions; resolve at top of outermost async function
  - DEFAULT_TENANT_BRAND stays in tenant-brand.ts (client-safe); DB resolver in separate tenant-brand-resolver.ts
  - brain-extract-brand returns tokens without writing; operator reviews then calls update-brain-doc
  - SSRF guard blocks all RFC-1918 + loopback + link-local for both IPv4 and IPv6 (including ::ffff: mapped)
metrics:
  duration: ~90 min (continued from previous session)
  completed: 2026-06-22
  tasks_completed: 3
  files_modified: 10
  files_created: 3
---

# Quick 260622-jga: Studio Brain Brand Styling — Summary

## One-liner

DB-backed TenantBrand resolver with 30s cache, SSRF-guarded URL extractor calling claude-sonnet-4-6, and Brain tab UI for URL-to-tokens-to-save workflow.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| T1 | Brand-styling data layer: DEFAULT_TENANT_BRAND rename, tenant-brand-resolver.ts (getTenantBrand + invalidateTenantBrandCache), seed row in brain-init, update-brain-doc enum + validation, refactor 5 SSR renderers | 9a8ddad2 |
| T2 | safe-fetch.ts (SSRF guard) + brain-extract-brand action (Claude extraction, no DB write) | 789aa4da |
| T3 | Brand & Styling card in gymos.brain.tsx (URL extractor, 11 token inputs, live preview, save) + AGENTS.md documentation | 39accbd4 |

## What Was Built

### T1 — Brand-styling data layer

`tenant-brand.ts` renames `tenantBrand` to `DEFAULT_TENANT_BRAND` (back-compat alias preserved). `tenant-brand-resolver.ts` adds `getTenantBrand()` (DB read from `studio_brain_docs` id=`brand-styling`, 30s in-process cache, per-field fallback merge) and `invalidateTenantBrandCache()`. `brain-init.ts` seeds the brand-styling row on first call using `DEFAULT_TENANT_BRAND` as the JSON body. `update-brain-doc.ts` accepts `brand-styling` as an editable doc, validates JSON against `brandTokenSchema`, and calls `invalidateTenantBrandCache()` after a successful write.

Five SSR renderers refactored: `schedule-widget-ssr.ts`, `public-form-ssr.ts`, `embed-buy-handler.ts`, `public-video-ssr.ts`, `public-content-ssr.ts`. All import `getTenantBrand()` from resolver and thread `brand: TenantBrand` to inner CSS/render functions. All `guard:allow-color` comments preserved verbatim.

### T2 — SSRF-guarded safe-fetch + brain-extract-brand

`safe-fetch.ts` enforces: http/https only, no credentials in URL, no private/loopback/link-local IPs (RFC-1918, IPv6 loopback/link-local/unique-local, IPv4-mapped IPv6), 10s timeout via AbortController, 2MB body cap via streaming reader. Returns `{ok, body}` or `{ok, error}`.

`brain-extract-brand.ts`: `defineAction` POST `{url}`. Calls `safeFetch`, reduces HTML to `<head>` + 3KB body sample (scripts stripped, 12KB absolute cap). Calls `claude-sonnet-4-6` with structured extraction prompt. Defensive JSON parse (strip fences, slice `{` to `}`). Per-field fallback to `DEFAULT_TENANT_BRAND`. Returns `{ok:true, tokens}` or `{ok:false, error}`. Does NOT write to DB.

### T3 — Brain tab UI + AGENTS.md

`gymos.brain.tsx` adds a "Brand & Styling" card above Brand Voice: URL input + "Fetch & extract" button; 11 labeled `Input` fields in a 2-column responsive grid; live preview swatch showing studio name, logo, primary "Book now" button, secondary accent "Learn more" button with real radius; "Save brand tokens" button calling `update-brain-doc`. State hydrates from `brand-styling` brain doc on load and fetchDocs refresh. All shadcn primitives (Input, Label, Card, Button, Badge); Tabler icons (IconPalette, IconWorld); no emojis.

`AGENTS.md` updated: `brain-extract-brand` row added to Agent Actions table (staff-only, NOT an agent LLM tool); `studio_brain_docs` brand-styling row documented in Data Sources table as source of truth.

## Deviations from Plan

None — plan executed exactly as written. All critical executor notes followed: no migration (seed row), client-bundle safety (separate resolver file), TenantBrand key names preserved, SSRF guard fully implemented, Anthropic pattern copied from foods/analyze, enum extended + validated + cache invalidated, UI uses shadcn only.

## Known Stubs

None — all 11 token fields are wired to state, save path persists to DB, resolver reads from DB on every SSR.

## Self-Check: PASSED

Files created: tenant-brand-resolver.ts, safe-fetch.ts, brain-extract-brand.ts — all exist.
Commits: 9a8ddad2 (T1), 789aa4da (T2), 39accbd4 (T3) — all in git log.
