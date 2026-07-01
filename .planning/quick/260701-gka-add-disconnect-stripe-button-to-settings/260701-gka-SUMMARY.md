---
phase: quick-260701-gka
plan: 01
subsystem: staff-web / Settings / Stripe Connect
tags: [stripe, disconnect, settings, shadcn, alert-dialog, tabler]
dependency_graph:
  requires: []
  provides: [deleteConnectedAccount, disconnect-stripe-intent]
  affects: [gymos.settings.integrations, connected-account]
tech_stack:
  added: []
  patterns: [disconnect-stripe action intent, AlertDialog-guarded fetcher form, scoped-DELETE with guard:allow-unscoped]
key_files:
  created: []
  modified:
    - apps/staff-web/server/lib/connected-account.ts
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx
decisions:
  - "Non-destructive disconnect: DELETE connected_accounts row only; Stripe account object untouched and reconnectable via existing Connect Stripe flow"
  - "Scoped DELETE (WHERE id = accountId) with guard:allow-unscoped comment satisfies the unscoped-query guard scanner"
  - "AlertDialogAction type=submit inside disconnectFetcher.Form submits the form while Radix closes the dialog — no custom onClick needed"
  - "disconnectButton defined as a const JSX element (not a component) and shared between pending and ready blocks to keep styling identical"
metrics:
  duration_seconds: 360
  completed_date: "2026-07-01"
  tasks: 2
  files_changed: 2
---

# Quick 260701-gka: Add Disconnect Stripe Button to Settings — Summary

One-liner: Non-destructive Stripe disconnect: scoped DELETE helper + AlertDialog-guarded fetcher button in both connected states of the Integrations Stripe card.

## What Was Built

Added a "Disconnect" affordance to the Stripe Connect card on `/gymos/settings/integrations` so an operator can clear the local Stripe connection and reconnect (e.g. swap a test connected account for a live one) without manual DB surgery.

### Task 1 — `deleteConnectedAccount` server helper

Added `export async function deleteConnectedAccount(accountId: string): Promise<void>` at the end of `apps/staff-web/server/lib/connected-account.ts`.

- Runs `DELETE FROM connected_accounts WHERE id = ${accountId}` — a scoped DELETE, never unscoped
- Carries both the JSDoc `* guard:allow-unscoped — ...` and the inline `// guard:allow-unscoped — ...` comment so the guard scanner is satisfied
- Reuses existing top-of-file `sql` and `getDb` imports — no new imports
- Does NOT import or call Stripe — the Stripe account object is never touched

### Task 2 — `disconnect-stripe` action intent + AlertDialog UI

Three changes in `apps/staff-web/app/routes/gymos.settings.integrations.tsx`:

1. **Action intent**: new `disconnect-stripe` branch between `continue-onboarding` and `rotate-key`. Reads the account via `readConnectedAccount()`, calls `deleteConnectedAccount(account.id)` if present (idempotent no-op if already cleared), returns `{ ok: true, intent: "disconnect-stripe" }`. Loader revalidates automatically after the fetcher POST returns data, causing the card to re-render in the not-connected state.

2. **Imports + fetcher**: added `IconPlugConnectedX` to the Tabler import; added full `AlertDialog*` import block from `../components/ui/alert-dialog`; added `disconnectFetcher = useFetcher<{ok, error?, intent?}>()`.

3. **UI**: defined `disconnectButton` const (a reusable JSX fragment) once before `return (`, then rendered `{disconnectButton}` in both connected states:
   - Pending state (`isConnected && !isReady`): after the account id paragraph
   - Ready state (`isReady`): after the account id paragraph
   - Trigger: subtle bordered button with `IconPlugConnectedX size={12}` — visually secondary, not competing with "Continue onboarding"
   - Dialog: title "Disconnect Stripe?", description explaining reconnectability, Cancel + a destructive `AlertDialogAction type="submit"` inside `disconnectFetcher.Form`
   - Error surface: inline `mt-2` destructive callout below the dialog trigger, keyed on `intent === "disconnect-stripe"`

## Verification

- `tsc --noEmit` in `apps/staff-web`: no errors in changed files
- `prettier --write`: both files formatted
- `grep accounts.del`: only appears in the JSDoc comment (not a function call) — no Stripe delete
- `grep "DELETE FROM connected_accounts"`: one occurrence with `WHERE id = ${accountId}` immediately below
- `grep "guard:allow-unscoped"`: present in both JSDoc and inline comment in `deleteConnectedAccount`
- `grep "disconnect-stripe"`: action intent branch (line 323), return statement (line 333), hidden input (line 649), error guard (line 661)

## Deviations from Plan

None — plan executed exactly as written. Used `IconPlugConnectedX` (confirmed available in @tabler/icons-react@3.41.1 before implementing; fallback to `IconUnlink` was not needed).

## Known Stubs

None. The disconnect flow is fully wired: button → AlertDialog → fetcher → action → deleteConnectedAccount → loader revalidation → not-connected card state.

## Self-Check: PASSED

Files exist:
- `apps/staff-web/server/lib/connected-account.ts` — FOUND (modified)
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — FOUND (modified)

Commit `0a808064` exists in git log.
