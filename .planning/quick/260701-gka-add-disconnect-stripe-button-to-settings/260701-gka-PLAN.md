---
phase: quick-260701-gka
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/lib/connected-account.ts
  - apps/staff-web/app/routes/gymos.settings.integrations.tsx
autonomous: true
requirements: [DISCONNECT-STRIPE]
must_haves:
  truths:
    - "Operator sees a Disconnect button on the Stripe Connect card in both the pending and ready connected states"
    - "Clicking Disconnect opens a shadcn AlertDialog confirm (no window.confirm)"
    - "Confirming clears the local connected_accounts row and the card re-renders in the not-connected state"
    - "Disconnecting is reconnectable — the Connect Stripe button returns and re-onboarding works"
    - "The Stripe account object itself is NOT deleted (no accounts.del call)"
  artifacts:
    - path: "apps/staff-web/server/lib/connected-account.ts"
      provides: "deleteConnectedAccount(accountId) scoped DELETE helper"
      contains: "export async function deleteConnectedAccount"
    - path: "apps/staff-web/app/routes/gymos.settings.integrations.tsx"
      provides: "disconnect-stripe action intent + AlertDialog UI wired to disconnectFetcher"
      contains: "disconnect-stripe"
  key_links:
    - from: "gymos.settings.integrations.tsx action()"
      to: "deleteConnectedAccount"
      via: "intent === 'disconnect-stripe' branch calls it after readConnectedAccount()"
      pattern: "deleteConnectedAccount"
    - from: "Stripe Connect card AlertDialog action button"
      to: "disconnect-stripe action intent"
      via: "disconnectFetcher.Form method=post with hidden _intent"
      pattern: "disconnectFetcher"
---

<objective>
Add a non-destructive "Disconnect" affordance to the Stripe Connect card on the staff-web Integrations page so an operator can clear the local Stripe connection and reconnect (e.g. swap a test connected account for a live one). Scope is DISCONNECT-ONLY: clear the local `connected_accounts` row; never call Stripe `accounts.del` — the Stripe account object stays intact and reconnectable.

Purpose: Operators currently have no in-app way to detach a connected account. Switching a test account to live requires manual DB surgery today.
Output: One new server helper (`deleteConnectedAccount`) + one new action intent + a confirm-guarded Disconnect button in both connected states of the Stripe Connect card.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@apps/staff-web/server/lib/connected-account.ts
@apps/staff-web/app/routes/gymos.settings.integrations.tsx
@apps/staff-web/app/components/ui/alert-dialog.tsx

<interfaces>
<!-- Existing helpers/patterns the executor uses directly — no exploration needed. -->

From apps/staff-web/server/lib/connected-account.ts (existing):
```typescript
export interface ConnectedAccount {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
}
export async function readConnectedAccount(): Promise<ConnectedAccount | null>;
// DB access pattern used throughout this file:
//   const db = getDb();
//   // guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
//   await (db as any).execute(sql`...`);
// (sql from "drizzle-orm"; getDb from "../db/index.js")
```

Action + fetcher conventions already in gymos.settings.integrations.tsx:
- action() reads `const intent = String(fd.get("_intent") ?? "").trim();` and branches on `if (intent === "...")`.
- Each fetcher form: `<connectFetcher.Form method="post"><input type="hidden" name="_intent" value="..." />...`.
- Fetcher hooks declared as `const connectFetcher = useFetcher<{ ok: boolean; error?: string; intent?: string }>();`.
- Error surfacing pattern: `{fetcher.data?.ok === false && (<div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[12px] text-destructive">{fetcher.data.error}</div>)}`.
- After a fetcher POST returns data (not a redirect), React Router revalidates the loader automatically → the card re-reads `readConnectedAccount()` and re-renders in the `!isConnected` state.

shadcn AlertDialog exports available from ../components/ui/alert-dialog:
```typescript
AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
AlertDialogCancel, AlertDialogAction
```
(Verify the exact export names when opening the file; use whatever it exports.)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add scoped deleteConnectedAccount server helper</name>
  <files>apps/staff-web/server/lib/connected-account.ts</files>
  <action>
Add a new exported async function `deleteConnectedAccount(accountId: string): Promise<void>` at the end of the file, mirroring the existing helpers' DB access pattern exactly:

```typescript
/**
 * Clear the local connected account row (disconnect).
 *
 * NON-DESTRUCTIVE to Stripe: this only removes RunStudio's local record so the
 * operator can reconnect (e.g. swap a test connected account for a live one).
 * It does NOT call Stripe accounts.del() — the Stripe account object stays
 * intact and reconnectable.
 *
 * Scoped DELETE (WHERE id = accountId) — never an unscoped DELETE.
 *
 * guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
 */
export async function deleteConnectedAccount(accountId: string): Promise<void> {
  const db = getDb();
  // guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
  await (db as any).execute(sql`
    DELETE FROM connected_accounts
    WHERE id = ${accountId}
  `);
}
```

Constraints:
- The `WHERE id = ${accountId}` clause is mandatory — the guard scanner rejects an unscoped DELETE, and the `// guard:allow-unscoped` comment on the line above the query keeps it consistent with the other functions here.
- Do NOT import or call Stripe. No `accounts.del`.
- Reuse the existing top-of-file imports (`sql` from "drizzle-orm", `getDb` from "../db/index.js") — do not re-import.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -i "connected-account" || echo "no tsc errors in connected-account.ts"</automated>
  </verify>
  <done>`deleteConnectedAccount` is exported, runs a `DELETE FROM connected_accounts WHERE id = ${accountId}` with the guard comment, makes no Stripe call, and tsc is clean for the file.</done>
</task>

<task type="auto">
  <name>Task 2: Wire disconnect-stripe action intent + AlertDialog-guarded Disconnect button</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <action>
Three edits in this one file.

1) ACTION INTENT — in `action()`, add a new branch (place it after the `continue-onboarding` branch, before `rotate-key`):

```typescript
// ── Connect: disconnect (clear local connected_accounts row — reconnectable) ─
if (intent === "disconnect-stripe") {
  try {
    const { readConnectedAccount: readAcct, deleteConnectedAccount } =
      await import("../../server/lib/connected-account.js");
    const account = await readAcct();
    if (account) {
      await deleteConnectedAccount(account.id);
    }
    // Idempotent: no account → no-op success. Loader revalidates → card
    // re-renders in the not-connected state.
    return { ok: true, intent: "disconnect-stripe" };
  } catch (err) {
    return {
      ok: false,
      error: `Could not disconnect Stripe: ${err instanceof Error ? err.message : String(err)}`,
      intent,
    };
  }
}
```

Follow the existing dynamic-import pattern (the other Stripe branches `await import("../../server/lib/connected-account.js")`). Do NOT call Stripe here — no `accounts.del`.

2) IMPORTS + FETCHER — at the top of the component `StripeIntegrations()`, add a new fetcher next to the existing ones:

```typescript
const disconnectFetcher = useFetcher<{
  ok: boolean;
  error?: string;
  intent?: string;
}>();
```

Add a Tabler disconnect icon to the existing `@tabler/icons-react` import (use `IconPlugConnectedX`; if that name is not exported by the installed version, fall back to `IconUnlink`). Add the shadcn AlertDialog imports:

```typescript
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../components/ui/alert-dialog";
```
(Open apps/staff-web/app/components/ui/alert-dialog.tsx and match the exact export names/casing it provides; note the route file lives in app/routes/ so the relative path is `../components/ui/alert-dialog`.)

3) UI — add a reusable Disconnect control and render it in BOTH connected blocks (the `isConnected && !isReady` pending block near line 693 after the continue-onboarding form, AND the `isReady` ready block near line 729). Define a small inline element once (e.g. a `const disconnectButton = (...)` just before the `return (`), then drop `{disconnectButton}` into both blocks so styling stays identical. The control:

```tsx
const disconnectButton = (
  <div className="pt-1">
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/60 text-[12px] font-medium text-muted-foreground bg-background hover:bg-muted/40"
        >
          <IconPlugConnectedX size={12} />
          Disconnect
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Stripe?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Stripe connection from RunStudio. You can reconnect
            anytime — your Stripe account itself isn&apos;t deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <disconnectFetcher.Form method="post">
            <input type="hidden" name="_intent" value="disconnect-stripe" />
            <AlertDialogAction
              type="submit"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </disconnectFetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {disconnectFetcher.data?.ok === false &&
      disconnectFetcher.data.intent === "disconnect-stripe" && (
        <div className="mt-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[12px] text-destructive">
          {disconnectFetcher.data.error}
        </div>
      )}
  </div>
);
```

Notes:
- Keep the button subtle/secondary (bordered, muted text) — it is NOT the primary action; the AlertDialog's action button is the destructive one.
- If `AlertDialogAction` does not accept `type="submit"` cleanly in the installed shadcn version, wrap the whole `<AlertDialog>` so the fetcher form is the parent and the action button submits it; the simplest robust form is putting `<disconnectFetcher.Form>` inside the footer as shown. Verify it type-checks; if `AlertDialogAction` renders an `<button>` already, `type="submit"` inside a form submits correctly.
- No emojis. Tabler icon only.
- Do not alter the `!isConnected` block — Disconnect only shows when connected.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -i "gymos.settings.integrations" || echo "no tsc errors in integrations route"</automated>
  </verify>
  <done>action() has a `disconnect-stripe` branch calling `deleteConnectedAccount` (no Stripe call); a `disconnectFetcher` + AlertDialog Disconnect button renders in both the pending and ready connected states with the exact title/description copy; the fetcher error surfaces inline; tsc is clean for the route file.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` in apps/staff-web is clean (no NEW errors introduced by these two files; pre-existing unrelated LibSQL-type errors elsewhere are out of scope).
- `npx prettier --write apps/staff-web/server/lib/connected-account.ts apps/staff-web/app/routes/gymos.settings.integrations.tsx` run after edits.
- Grep confirms no `accounts.del` anywhere in the diff.
- Grep confirms `DELETE FROM connected_accounts` is guarded by a `WHERE id =` clause and carries the `// guard:allow-unscoped` comment.
</verification>

<success_criteria>
- Operator can click Disconnect (visible in both connected states), confirm via shadcn AlertDialog, and the card returns to the not-connected "Connect Stripe" state on loader revalidation.
- The local `connected_accounts` row is cleared; the Stripe account object is untouched and reconnecting works via the existing Connect Stripe flow.
- No window.confirm, no emojis, Tabler icon used, scoped DELETE with guard comment, no unscoped-query guard violation.
- Web-only change; deploys via `git push origin master` to Vercel; no mobile rebuild.
</success_criteria>

<output>
After completion, create `.planning/quick/260701-gka-add-disconnect-stripe-button-to-settings/260701-gka-SUMMARY.md`
</output>
