---
phase: quick-260624-klo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
autonomous: true
requirements: [KLO-01]

must_haves:
  truths:
    - "A required/invalid field shows its error message inline, directly under that field"
    - "An invalid field gets a red border and aria-invalid=true"
    - "On submit-with-errors, the first invalid field scrolls into view and receives focus"
    - "Editing an invalid field (input/change) clears its error"
    - "The fixed-position toast is NO LONGER used for field validation — only for the network/submit .catch fallback"
    - "Existing behavior preserved: conditional visibility, min/max/pattern rules, honeypot, Turnstile, Pixel/CAPI event flow"
  artifacts:
    - path: "apps/staff-web/features/forms/lib/public-form-ssr.ts"
      provides: "Inline per-field validation UX in the SSR'd public/embed lead form"
      contains: "field-error"
  key_links:
    - from: "onsubmit handler"
      to: ".field-error elements + .fi invalid state"
      via: "showFieldErrors(errors) replacing showToast(err)"
      pattern: "showFieldErrors"
    - from: "validate(data)"
      to: "per-field error map"
      via: "returns array/map of {fieldId, message} instead of a single string"
      pattern: "validate"
---

<objective>
Replace the single-string + toast validation UX on the public/embedded lead form with clean inline per-field validation. Today `validate(data)` returns one error string and the onsubmit handler calls `showToast(err)`; the toast is `position:fixed; bottom:24px`, so inside a short iframe embed it lands on top of the submit button and the WhatsApp-consent text.

After this change: each invalid field shows its message inline (under the field), gets a red border + `aria-invalid="true"`, the first invalid field scrolls into view and is focused, and editing a field clears its error. The toast survives ONLY as the network/submit-failure fallback in the fetch `.catch` path.

Purpose: usable error feedback inside short embed iframes; no more red box covering the CTA.
Output: modified `apps/staff-web/features/forms/lib/public-form-ssr.ts` (single file — HTML-string SSR + inline vanilla `<script>` + inline `<style>`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/staff-web/AGENTS.md

# THE file to change — read it fully before editing
@apps/staff-web/features/forms/lib/public-form-ssr.ts

<interfaces>
<!-- Key shapes the executor works with. All inside ONE file; no external imports change. -->

renderField(field) — line ~151. Already emits, per field:
  `<div class="field${widthClass}" data-field-id="${id}"${cond}>
     <label class="field-label">...</label>
     ${desc}${input}</div>`
The `.field-error` element should be added INSIDE this div (after the input), so it
sits under the field. It starts empty/hidden.

The inline client <script> (line ~425) is a single IIFE. Relevant closures:
  - collectData()       line ~532 — builds `data` keyed by field id. UNCHANGED.
  - validate(data)      line ~557 — CURRENTLY returns the first error as a single
                         string (e.g. `f.label + " is required"`). Change to collect
                         ALL field errors as `[{fieldId, message}, ...]` (or {} map).
  - showToast(msg,type) line ~471 — KEEP, but only call it from the fetch .catch.
  - onsubmit handler    line ~604 — CURRENTLY: `var err = validate(data); if (err) { showToast(err); return; }`
                         Change to drive inline errors.
  - FIELDS array        line ~430 — already carries {id, type, required, validation, label, conditional}.

CSS() — line ~701. `.field` (line ~734), `.fi` / `.fi:focus` (line ~740), `.req` red
(line ~738, uses `#ef4444` with a guard:allow-color comment), `.toast` (line ~805).
Add `.field-error` + `.fi.invalid` / `[aria-invalid="true"]` styles here. Reuse the
existing `#ef4444` red and add a matching `// guard:allow-color` comment (this embed
renderer has its own functional CSS with guard:allow-color markers — do NOT introduce
studio tokens or shadcn here).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Render an inline .field-error element + add invalid-state CSS</name>
  <files>apps/staff-web/features/forms/lib/public-form-ssr.ts</files>
  <action>
Two edits in this one file:

1. In `renderField()` (~line 225-227), add an empty error element inside the `.field`
   div, after `${input}`. Give it a stable id derived from the field id so the script
   can target it without re-querying:
     `<div class="field-error" id="err-${id}" role="alert" aria-live="polite"></div>`
   (`id` here is already `escapeHtml(field.id)` from line 152 — safe to interpolate.)
   The element renders empty; it only becomes visible when populated (CSS below hides
   empty `.field-error`).

2. In `CSS()` (~line 738, near `.req` / `.fi`), add the styling. Reuse the existing
   functional red `#ef4444` already used by `.req`, and carry a guard:allow-color
   comment (matches the file's existing convention — see `.toast`, `.req`, `.success-icon`):

     .field-error{display:none;font-size:0.75rem;color:#ef4444;margin-top:2px} /* guard:allow-color — embed widget functional inline validation red; mirrors .req; no studio token equivalent */
     .field-error.show{display:block}
     .fi.invalid,.fi[aria-invalid="true"]{border-color:#ef4444} /* guard:allow-color — embed widget functional invalid-field border red; no studio token equivalent */
     .field.invalid .field-label{color:#ef4444} /* guard:allow-color — embed widget functional invalid-field label red; no studio token equivalent */

   Note: for multiselect/radio/checkbox/rating/scale the `.fi` class may not be on the
   control itself — the `.field.invalid` label color + the inline `.field-error` text
   are the universal signal for those. Do NOT over-engineer per-type border styling.

Do NOT touch: conditional `data-cond-*`/`data-hidden` rendering, the honeypot, Turnstile
wrap, Pixel snippet, or the `.toast` styles (those stay for the network fallback).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>renderField output includes a `.field-error` element with `id="err-${id}"` inside each `.field` div; CSS() includes `.field-error`, `.field-error.show`, and `.fi.invalid`/`[aria-invalid]` rules each carrying a guard:allow-color comment; tsc is clean.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite validate() to collect per-field errors + drive inline UX from onsubmit</name>
  <files>apps/staff-web/features/forms/lib/public-form-ssr.ts</files>
  <action>
All edits are inside the inline `<script>` IIFE (line ~425-662). Keep it vanilla JS
(this is NOT React) and preserve all existing behavior.

1. Rewrite `validate(data)` (~line 557) to return an ARRAY of `{fieldId, message}` for
   EVERY failing visible field (not just the first). Keep the exact existing rule logic
   and messages — required check, then `validation.min`/`max`/`pattern` with
   `f.validation.message` fallback. Skip hidden fields (`el.dataset.hidden === "1"`) as
   today. Return `[]` when all pass.

2. Add two small helper closures near `showToast` (~line 471):

   - `clearFieldError(fieldId)`:
       finds `[data-field-id="<fieldId>"]`, removes class `invalid` from it; finds the
       inner control(s) (`input, textarea, select`) and removes `aria-invalid` +
       `invalid` class; finds `#err-<fieldId>`, removes `show` class and clears
       textContent.

   - `showFieldErrors(errors)`:
       first clears ALL fields (iterate FIELDS, call clearFieldError) so stale errors
       from a prior submit go away. Then for each `{fieldId, message}`: get the
       `.field` div, add `invalid`; the inner control(s) get `aria-invalid="true"` +
       `invalid` class; `#err-<fieldId>` gets textContent = message and class `show`.
       Track the FIRST errored field's `.field` element; after the loop, call
       `firstEl.scrollIntoView({ behavior: "smooth", block: "center" })` and focus its
       first focusable control (`input, textarea, select` — guard for null). Then
       `sendResize()` so the embed iframe grows to fit the newly shown errors.

   For controls: query `el.querySelectorAll("input, textarea, select")` and apply
   aria-invalid to each (covers multiselect/radio groups). Use a `.field-error` text +
   `.field.invalid` label color as the universal signal.

3. In the onsubmit handler (~line 604-609), replace:
       `var err = validate(data); if (err) { showToast(err); return; }`
   with:
       `var errs = validate(data); if (errs.length) { showFieldErrors(errs); return; }`

4. Wire error-clearing on edit. The form already has delegated `input` + `change`
   listeners that call `updateVisibility` (lines ~527-528). Add error-clearing there:
   in those same listeners (or a small added delegated listener on `#mainForm`),
   resolve the event target's owning `.field` via `e.target.closest(".field")`, read its
   `data-field-id`, and call `clearFieldError(thatId)`. Do this WITHOUT disturbing the
   existing `updateVisibility` call. (Cleanest: add one new
   `mainForm.addEventListener("input", onFieldEdit)` and the same for `"change"`, where
   `onFieldEdit` does the closest/clear logic. Leave the existing visibility listeners
   intact.)

5. Leave the fetch `.catch` (~line 655-660) EXACTLY as-is — `showToast(err.message || ...)`
   remains the network/submit-failure fallback. The toast is now ONLY reached from this
   path. Do NOT remove showToast or the `#toast` element or its CSS.

Preserve untouched: EVENT_ID/Pixel/CAPI flow, fbc/fbp/fbclid query params, honeypot
`_hp`, `_t` timestamp, Turnstile token, REDIRECT handling, success view + postMessage,
and the `submitting`/button-disable lifecycle.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>validate() returns `{fieldId,message}[]`; onsubmit calls `showFieldErrors(errs)` (no `showToast` in the validation path); showFieldErrors marks fields invalid (red border + aria-invalid), shows inline messages, scrolls+focuses the first invalid field, and calls sendResize(); input/change clears the edited field's error; the fetch `.catch` still calls showToast; tsc clean.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Inline per-field validation on the public/embedded lead form — error messages render under each field, invalid fields get a red border + aria-invalid, the first invalid field scrolls into view and focuses, errors clear on edit, and the toast is gone from field validation (kept only for network errors).</what-built>
  <how-to-verify>
After deploy (git push origin master → Vercel; per STATE.md `vercel` CLI is NOT used), open a published form. Use the HUSTLE HYROX-level form if available; otherwise any published form at `https://gym-class-os.vercel.app/f/{slug}` and the embedded variant at `/preview/{slug}` (or the live embed on doyouhustle.co.uk).

1. Submit the form empty (or with a required select unfilled). Expect: each required field shows a red message directly under it, the field shows a red border, and the page scrolls to + focuses the first invalid field. NO toast pops over the submit button / consent text.
2. In a short embed iframe specifically, confirm the "...is required" message sits UNDER the field, not on top of the "Get HYROX" CTA, and the iframe grew to fit (sendResize).
3. Type into one invalid field — its error clears immediately on input.
4. Trigger a network failure path if convenient (e.g. submit while offline) — confirm the toast STILL appears for that case.
5. Sanity-check preserved behavior: a conditional field still shows/hides, min/max/pattern messages still read correctly, and a valid submission still reaches the success view + fires the Lead event.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues (e.g. wrong field focused, error not clearing, toast still firing on validation).</resume-signal>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` is clean (the file is server-side TS; the inline `<script>` is a template-literal string, so its JS isn't type-checked — correctness of the browser JS is confirmed at the human-verify checkpoint).
- Grep the file: `showFieldErrors` and `.field-error` exist; `showToast` is referenced ONLY inside the fetch `.catch` (plus its definition) — NOT in the onsubmit validation branch.
- No new imports, no DB/schema/migration changes, no new actions.
</verification>

<success_criteria>
- Required and rule (min/max/pattern) violations render inline under the offending field with a red border + `aria-invalid="true"`.
- First invalid field scrolls into view and is focused on a failed submit; iframe resizes to fit.
- Editing a field clears that field's error on input/change.
- Toast is used ONLY in the fetch `.catch` (network/submit failure) — never for field validation.
- Conditional visibility, honeypot, Turnstile, Pixel/CAPI event flow, redirect, and success view all unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/260624-klo-improve-validation-error-ux-on-the-publi/260624-klo-SUMMARY.md`.
</output>
