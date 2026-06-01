---
phase: P1c-public-site-integrations
plan: "04"
subsystem: staff-web
tags: [forms, builder, leads, inbox, CRUD, RR-v7]
dependency_graph:
  requires: [P1c-01, P1c-02]
  provides: [forms-builder-UI, leads-inbox-filter, forms-staff-CRUD-API]
  affects: [gymos._index, GymosTopNav, forms-schema]
tech_stack:
  added: []
  patterns:
    - RR v7 loader/action (Path B) for all form routes — no upstream TanStack hooks needed
    - tsconfig features/**/* include extension for form types resolution
    - ne() from drizzle-orm for excluding leads from default inbox view
    - Drizzle count() for response-count aggregation on list page
key_files:
  created:
    - apps/staff-web/app/components/forms/FieldRenderer.tsx
    - apps/staff-web/app/components/forms/FieldPropertiesPanel.tsx
    - apps/staff-web/app/routes/gymos.forms._index.tsx
    - apps/staff-web/app/routes/gymos.forms.$id.tsx
    - apps/staff-web/server/routes/api/forms/[...path].ts
  modified:
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
    - apps/staff-web/app/routes/gymos._index.tsx
    - apps/staff-web/tsconfig.json
decisions:
  - id: adaptation-path
    summary: "RR v7 loader/action (Path B) for forms routes — staff-web has no useForms/useCreateForm hooks; loader/action is the established pattern"
  - id: stripped-upstream
    summary: "AgentToggleButton, ShareButton, VisibilityBadge, CloudUpgrade, NotificationsBell, useAgentPromptRun stripped from builder — pilot is single-tenant, no sharing model, always Neon cloud"
  - id: default-inbox-behaviour
    summary: "Default /gymos EXCLUDES leads (ne(status,'lead')); /gymos?filter=leads shows ONLY leads — inbox stays focused, leads don't clutter active conversations"
  - id: filter-chip-design
    summary: "Two chips (Inbox / Leads) added to the conversation-list header — no heavy filter toolbar; progressive disclosure per CLAUDE.md"
  - id: tsconfig-features-include
    summary: "Added features/**/* to tsconfig include array so FieldRenderer/FieldPropertiesPanel can resolve types from features/forms/types.ts via relative ../../../ import"
metrics:
  duration_min: 25
  completed_date: "2026-06-01"
  tasks_completed: 2
  tasks_total: 3
  files_created: 5
  files_modified: 3
---

# Phase P1c Plan 04: Forms Builder and Leads Inbox Summary

**One-liner:** Staff forms builder (CRUD list + field editor + responses view) with RR v7 loader/action, forms CRUD API at staff-only /api/forms/*, Forms tab in nav, and inbox ?filter=leads chip pair to distinguish lead conversations from active inbox.

## What Was Built

### Task 1 — Field components, builder routes, staff CRUD API

**FieldRenderer.tsx** and **FieldPropertiesPanel.tsx** forked from `templates/forms/app/components/builder/` into `apps/staff-web/app/components/forms/`. Key changes:
- `@shared/types` (mail-domain) replaced with `../../../features/forms/types` (gym-domain)
- No `@agent-native/core/client` imports
- No `~/` aliases — all `@/` + relative paths only

**gymos.forms._index.tsx** — forms list route:
- RR v7 loader queries forms + response counts from Neon
- Action handles create, archive, restore, publish-toggle, purge
- Optimistic create: `fetcher.submit` + navigate to real id via `fetcher.data`
- Active/Archive tabs via query param (`?view=archive`)
- Embed snippet hint (`/f/<slug>`) shown for published forms
- shadcn AlertDialog for purge confirmation (no `window.confirm`)

**gymos.forms.$id.tsx** — builder route:
- RR v7 loader fetches form + responses (results tab)
- Action handles `_intent=update` (title, description, fields, settings, status)
- Debounced save (500ms) via `useFetcher.submit`
- Three tabs: Edit / Results / Settings
- Edit tab: field add (DropdownMenu of all 11 types), drag-to-reorder, Popover properties panel
- Results tab: sortable table + search + CSV export
- Settings tab: submit text, success message, redirect URL, allowed origins

**server/routes/api/forms/[...path].ts** — staff-only H3 catch-all:
- NOT in publicPaths — auth guard protects automatically
- Dispatch table: GET list, POST create, GET /:id, PATCH /:id, DELETE /:id, POST /:id/restore, GET /:id/responses
- All reads use `schema.forms` and `schema.responses` (guard:allow-unscoped — single-tenant)

**tsconfig.json** — added `"features/**/*"` to the include array so the relative import path `../../../features/forms/types` resolves correctly from `app/components/forms/`.

### Task 2 — GymosTopNav Forms tab + inbox Leads filter

**GymosTopNav.tsx** — added Forms tab between Campaigns and Settings:
```tsx
const isForms = path.startsWith("/gymos/forms");
<Link to="/gymos/forms" className={tabClass(isForms)}>Forms</Link>
```

**gymos._index.tsx** — Leads filter:
- Loader reads `url.searchParams.get("filter")` → `isLeadsView = filter === "leads"`
- Conversations query gains a `.where()`: leads view = `eq(status, "lead")`; default = `ne(status, "lead")`
- Inbox header now shows two filter chips: `Inbox` (/) and `Leads` (/gymos?filter=leads) using `IconInbox` + `IconUsers` (Tabler)
- `isLeadsView` returned from loader and used to title the sidebar ("Leads" vs "WhatsApp Inbox") and drive chip active state
- Existing send action, member-context panel, window-state badges all preserved

## Adaptation Decisions

| Decision | Choice | Reason |
|---|---|---|
| Upstream hooks vs RR v7 | **RR v7 loader/action (Path B)** | staff-web has no useForms/useCreateForm hooks; loader/action is the codebase pattern |
| Features stripped from builder | AgentToggleButton, ShareButton, VisibilityBadge, CloudUpgrade, NotificationsBell, useAgentPromptRun | Single-tenant pilot; no sharing model; Neon is always cloud |
| Default inbox behaviour | **Exclude leads** (ne filter) | Inbox stays focused on active conversations; leads behind the chip |
| Filter affordance | **Two chips in header** | Minimal progressive disclosure; no heavy filter toolbar per CLAUDE.md |
| Types resolution | **../../../features/forms/types** + tsconfig include | features/ is outside app/server/shared; relative path + include array fix |

## Deferred Runtime Verification (P1c-07)

The local dev server cannot boot (`NitroViteError: Vite environment "nitro" is unavailable`). All code and typecheck tasks completed. The following runtime checks are deferred to the P1c-07 e2e smoke test on the Fly/Vercel deploy:

1. **Forms tab navigation** — click Forms in GymosTopNav → lands on `/gymos/forms` list
2. **Create a form** — "New Form" → navigates to builder with real id; form persists to `forms` table
3. **Add fields** — add Name (text), Email (email), Phone (text); verify FieldPropertiesPanel opens on click
4. **Publish** — "Publish" button → form status → `published`; badge updates; `/f/<slug>` link appears
5. **Public submission** — open `/f/<slug>` in private window → submit → responses tab shows entry
6. **Leads filter** — `/gymos?filter=leads` → lead conversation from step 5 appears
7. **Inbox default** — `/gymos` (no filter) → lead conversations absent; working inbox clean
8. **UI cleanliness** — no AgentToggle/Share remnants; no heavy filter toolbar

## Known Stubs

- **Embed `<script>` snippet** — list page shows `/f/<slug>` only; the `<script>` snippet for client-side embed (`P1c-06`) is not yet wired. Documented as intentional: P1c-06 owns the embed script generation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig missing features/**/* include**
- **Found during:** Task 1
- **Issue:** FieldRenderer/FieldPropertiesPanel imported types via `../../../features/forms/types` but `features/**/*` was not in tsconfig `include`, causing TS2307 "Cannot find module"
- **Fix:** Added `"features/**/*"` to tsconfig `include` array
- **Files modified:** apps/staff-web/tsconfig.json
- **Commit:** b2e57fdd

**2. [Rule 1 - Bug] readBody() returns unknown in H3 TypeScript types**
- **Found during:** Task 1 (API route)
- **Issue:** `readBody(event)` typed as `unknown`; accessing `.title`, `.fields`, etc. caused TS2339
- **Fix:** Cast result to `Record<string, any>` inline
- **Files modified:** apps/staff-web/server/routes/api/forms/[...path].ts
- **Commit:** b2e57fdd

## Self-Check: PASSED

Files verified:
- apps/staff-web/app/components/forms/FieldRenderer.tsx — FOUND
- apps/staff-web/app/components/forms/FieldPropertiesPanel.tsx — FOUND
- apps/staff-web/app/routes/gymos.forms._index.tsx — FOUND
- apps/staff-web/app/routes/gymos.forms.$id.tsx — FOUND
- apps/staff-web/server/routes/api/forms/[...path].ts — FOUND

Commits verified:
- b2e57fdd feat(P1c-04): forms builder routes, field components, staff CRUD API
- 6be85064 feat(P1c-04): Forms tab in GymosTopNav + Leads filter in /gymos inbox

Typecheck: PASSED (no errors)
