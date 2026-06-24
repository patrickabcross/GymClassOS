---
phase: quick-260624-klo
plan: 01
subsystem: forms / public lead-form SSR
tags: [forms, validation, ux, embed, ssr, accessibility]
requirements: [KLO-01]
dependency_graph:
  requires:
    - "apps/staff-web/features/forms/lib/public-form-ssr.ts (existing /f/:slug + /preview/:slug SSR renderer)"
  provides:
    - "Inline per-field validation UX on the public/embedded lead form"
  affects:
    - "All published forms served at /f/{slug} and the embedded /preview/{slug} variant"
tech_stack:
  added: []
  patterns:
    - "Inline vanilla-JS field-level validation in an SSR HTML-string renderer (no React)"
    - "Per-field error map ({fieldId, message}[]) replacing single-string + toast"
key_files:
  created: []
  modified:
    - "apps/staff-web/features/forms/lib/public-form-ssr.ts"
decisions:
  - "Tasks 1 + 2 committed as ONE atomic commit — the .field-error element + CSS (Task 1) are inert without the Task 2 script that populates them; they share an identical verification gate and are interdependent in a single file."
  - "Verified with TypeScript 6.0.3 from the main checkout's apps/staff-web/node_modules. The worktree has NO node_modules installed, so a bare `npx tsc` resolved a stale global TypeScript 4.1.5 that emits spurious TS1005 on valid TS5/TS6 inline `type` imports and JSX across every file (including untouched ones). Running the project's real tsc reports zero errors for the changed file."
metrics:
  duration: ~22min
  completed: 2026-06-24
  tasks_completed: 2
  tasks_total: 3
  files_changed: 1
---

# Phase quick-260624-klo Plan 01: Inline Validation Error UX on the Public Lead Form Summary

Replaced the single-string + fixed-position toast validation UX on the public/embedded lead form with clean inline per-field validation: each invalid field now shows its message directly underneath it, gets a red border + `aria-invalid="true"`, the first invalid field scrolls into view and is focused on a failed submit, and editing a field clears its error. The toast survives only as the network/submit-failure fallback in the fetch `.catch`.

## What Changed

### Task 1 — Inline `.field-error` element + invalid-state CSS (commit dc7d893d)
- `renderField()` now emits an empty `<div class="field-error" id="err-${id}" role="alert" aria-live="polite"></div>` inside each `.field` div, after the input. It renders empty and is hidden by CSS until populated.
- `CSS()` gained four rules near `.req`, each carrying a `guard:allow-color` comment mirroring the file's existing functional-red convention:
  - `.field-error{display:none;...color:#ef4444;...}`
  - `.field-error.show{display:block}`
  - `.fi.invalid,.fi[aria-invalid="true"]{border-color:#ef4444}`
  - `.field.invalid .field-label{color:#ef4444}` — the universal signal for multiselect/radio/checkbox/rating/scale fields that don't carry `.fi` on the control.

### Task 2 — Per-field validate() + inline-driven onsubmit (commit dc7d893d)
- `validate(data)` now returns `[{fieldId, message}, ...]` for EVERY failing visible field (was: the first error as a single string). The exact rule logic and messages are preserved — required check, then `validation.min`/`max`/`pattern` with `f.validation.message` fallback; hidden fields (`dataset.hidden === "1"`) still skipped; returns `[]` when all pass.
- Added `clearFieldError(fieldId)` and `showFieldErrors(errors)` closures near `showToast`:
  - `showFieldErrors` first clears ALL fields (stale errors from a prior submit), then marks each errored `.field` invalid, sets `aria-invalid="true"` + `invalid` on inner `input/textarea/select`, writes the message into `#err-<id>` + adds `show`, scrolls the first errored field into view (`smooth`/`center`), focuses its first focusable control, and calls `sendResize()` so the embed iframe grows to fit.
- Added delegated `input` + `change` listeners (`onFieldEdit`) on `#mainForm` that resolve `e.target.closest(".field")` and call `clearFieldError` — left the existing `updateVisibility` listeners untouched.
- onsubmit: `var err = validate(data); if (err) { showToast(err); return; }` → `var errs = validate(data); if (errs.length) { showFieldErrors(errs); return; }`.
- The fetch `.catch` is unchanged: `showToast(err.message || ...)` remains the network/submit-failure fallback — now the only path that reaches the toast.

Preserved untouched: conditional `data-cond-*`/`data-hidden` visibility, honeypot `_hp`, Turnstile, EVENT_ID/Pixel/CAPI flow (fbc/fbp/fbclid), `_t` timestamp, redirect handling, success view + postMessage, and the `submitting`/button-disable lifecycle.

## Verification (reported honestly)

- **Prettier:** `prettier --write features/forms/lib/public-form-ssr.ts` ran clean (formatted the multi-line `h3` import; no semantic change).
- **Typecheck:** `tsc --noEmit -p tsconfig.json` reports **zero errors for `public-form-ssr.ts`** when run with the project's actual TypeScript (6.0.3, from the main checkout's `apps/staff-web/node_modules`).
  - **Caveat — worktree has no node_modules.** A bare `npx tsc` inside this worktree resolves a stale global **TypeScript 4.1.5** which predates inline `type` import modifiers and emits spurious `TS1005 ',' expected` on ~80 lines across many untouched `.tsx`/`.ts` files (e.g. `app/components/ui/button.tsx`, and even line 1 of `public-form-ssr.ts` at the `type H3Event` token). These are a toolchain-version artifact of the un-provisioned worktree, NOT defects in the change. The real (TS6) typecheck is clean.
- **Grep checks (plan verification section):**
  - `showFieldErrors` exists — defined (line 501) + called in the onsubmit validation branch (line 672). ✅
  - `.field-error` exists — rendered element (line 232) + CSS (lines 803–804). ✅
  - `showToast` referenced ONLY in its definition (line 476) and the fetch `.catch` (line 719) — NOT in the onsubmit validation path. ✅
- No new imports, no DB/schema/migration changes, no new actions.

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were committed together as one atomic commit (see Decisions) rather than two separate commits; this is a packaging choice, not a deviation from the specified work.

## Known Stubs

None.

## Checkpoint — Task 3 (HUMAN-VERIFY) — PENDING

Task 3 is a `checkpoint:human-verify` gate and was intentionally NOT executed here (no browser/live-form verification was attempted, per the execution constraints). It requires deploying to production and manually verifying the live form.

**What was built (for the verifier):** Inline per-field validation on the public/embedded lead form — error messages render under each field, invalid fields get a red border + `aria-invalid`, the first invalid field scrolls into view and focuses, errors clear on edit, and the toast is gone from field validation (kept only for network errors).

**How to verify** (after `git push origin master` → Vercel; the `vercel` CLI is NOT used per STATE.md):
1. Open a published form (HUSTLE HYROX-level form if available, else any `https://gym-class-os.vercel.app/f/{slug}` and the embedded `/preview/{slug}` or the live embed on doyouhustle.co.uk). Submit empty / with a required select unfilled → each required field shows a red message directly under it, a red border, and the page scrolls to + focuses the first invalid field. NO toast over the submit button / consent text.
2. In a short embed iframe, confirm the "…is required" message sits UNDER the field (not on top of the "Get HYROX" CTA) and the iframe grew to fit (sendResize).
3. Type into one invalid field → its error clears immediately on input.
4. Trigger a network-failure path (e.g. submit while offline) → the toast STILL appears for that case.
5. Sanity-check preserved behavior: a conditional field still shows/hides, min/max/pattern messages read correctly, and a valid submission reaches the success view + fires the Lead event.

**Resume signal:** "approved" or a description of issues (wrong field focused, error not clearing, toast still firing on validation).

## Commits

- `dc7d893d` — feat(quick-260624-klo): inline per-field validation on public lead form (Tasks 1 + 2)

## Self-Check: PASSED

- FOUND: `.planning/quick/260624-klo-improve-validation-error-ux-on-the-publi/260624-klo-SUMMARY.md`
- FOUND: `apps/staff-web/features/forms/lib/public-form-ssr.ts`
- FOUND commit: `dc7d893d`
