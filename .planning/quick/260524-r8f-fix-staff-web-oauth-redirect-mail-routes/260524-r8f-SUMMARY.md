---
phase: 260524-r8f-fix-staff-web-oauth-redirect-mail-routes
plan: 01
subsystem: staff-web (Vercel deploy)
tags: [oauth, google-auth, gmail-watch, mail-routes, demo, vercel, security]
type: quick
requires: []
provides:
  - "Identity-only Google OAuth consent screen for gym-class-os.vercel.app sign-in"
  - "Any leftover /<view> or /<view>/<threadId> URL redirects to /gymos"
  - "Gmail-watch account hook removed from the post-OAuth path + cron renewal path"
affects:
  - apps/staff-web/app/routes/$view.tsx
  - apps/staff-web/app/routes/$view.$threadId.tsx
  - apps/staff-web/server/lib/google-auth.ts
  - apps/staff-web/server/plugins/mail-jobs.ts
tech-stack:
  added: []
  patterns:
    - "loader+clientLoader twin-redirect pattern (mirrors apps/staff-web/app/routes/_index.tsx) for any RR v7 route that needs to retire to /gymos"
key-files:
  created: []
  modified:
    - apps/staff-web/app/routes/$view.tsx
    - apps/staff-web/app/routes/$view.$threadId.tsx
    - apps/staff-web/server/lib/google-auth.ts
    - apps/staff-web/server/plugins/mail-jobs.ts
untouched:
  - apps/staff-web/vite.config.ts            # load-bearing pg-externalization for Vercel
  - apps/staff-web/scripts/post-vercel-build.mjs  # post-build pg inject into .vercel/output
  - apps/staff-web/package.json              # pg direct-deps for Vercel
decisions:
  - "Edit staff-web's fork copy of SCOPES rather than touching packages/core: the /_agent-native/google/* routes the framework would normally serve are already overridden in apps/staff-web/server/routes/_agent-native/google/*.ts → server/handlers/google-auth.ts → server/lib/google-auth.ts. Editing the fork copy is the lowest-risk fix."
  - "Keep startWatch + stopWatch + getClientForAccount + getClientFromAccount + getWatchTopic alive in google-auth.ts even though exchangeCode no longer calls startWatch. Two callers still reference them: server/routes/api/gmail/watch/renew.post.ts and actions/bootstrap-watches.ts. Both are env-gated by GMAIL_WATCH_TOPIC (unset in production) so they no-op. Pulling the functions out would be a wider refactor not warranted by this quick task."
  - "Delete BOTH imports from mail-jobs.ts (getClientForAccount AND startWatch — and listOAuthAccounts which had only renewAllWatches as caller from this file). Verified by grep that no other code paths in mail-jobs.ts referenced them after renewAllWatches was deleted."
metrics:
  duration_minutes: 4
  tasks_completed: 2  # plus Task 3 deferred-to-user
  commits: 2
  files_modified: 4
  files_created: 0
  completed: 2026-05-24
---

# 260524-r8f Quick Task: Fix staff-web OAuth scopes + redirect Mail routes Summary

Surgical demo-blocker fix: production https://gym-class-os.vercel.app now redirects any leftover Mail-template path (`/inbox`, `/sent`, `/<view>/<threadId>`, etc.) to `/gymos`, Google OAuth consent only requests `userinfo.profile` + `userinfo.email`, and the Mail-template Gmail-watch account hook is removed from both the post-OAuth callback path and the background-jobs cron.

## What Was Done

### Task 1 — Redirect leftover Mail routes to /gymos
**Commit:** `471fe10a`
**Files:**
- `apps/staff-web/app/routes/$view.tsx` — full rewrite: was `import { InboxPage }` → render `<InboxPage />`; now exports `loader`, `clientLoader` (both `throw redirect("/gymos")`), `HydrateFallback`, and a `default` component returning `null`. Mirrors the existing `apps/staff-web/app/routes/_index.tsx` pattern exactly. (19 lines)
- `apps/staff-web/app/routes/$view.$threadId.tsx` — same rewrite pattern, same content modulo the component name (`ThreadRoute`). (19 lines)

Covers every URL the upstream Mail template would have matched: `/inbox`, `/unread`, `/starred`, `/sent`, `/drafts`, `/archive`, `/trash`, `/spam`, `/important`, `/snoozed`, and `/<view>/<threadId>`. None of these can now render `InboxPage` and leak Gmail data.

### Task 2 — Narrow OAuth SCOPES + remove Gmail-watch account hook
**Commit:** `8351022e`
**Files:**

**`apps/staff-web/server/lib/google-auth.ts`** (2 edits, net −12 lines + comment block):
- Replaced the 8-entry `SCOPES` constant (which requested `gmail.{readonly,send,modify,settings.basic}`, `userinfo.profile`, `contacts.readonly`, `contacts.other.readonly`, `calendar.events`) with the 2-entry identity-only list (`userinfo.profile` + `userinfo.email`).
- Removed the `try { await startWatch(tokens.access_token); } catch { ... }` block from `exchangeCode`. Replaced with an explanatory comment so future readers don't re-add it.
- `startWatch` itself is intentionally left in place — `server/routes/api/gmail/watch/renew.post.ts` and `actions/bootstrap-watches.ts` still reference it; both are env-gated by `GMAIL_WATCH_TOPIC` which is unset in production, so they no-op.

**`apps/staff-web/server/plugins/mail-jobs.ts`** (3 edits, net −24 lines):
- Deleted the entire `import { getClientForAccount, startWatch } from "../lib/google-auth.js"` line and the `import { listOAuthAccounts } from "@agent-native/core/oauth-tokens"` line (the latter was only a caller of `renewAllWatches`). Replaced with an explanatory comment block.
- Deleted the `renewAllWatches` async function (18 lines) plus the `WATCH_RENEW_INTERVAL_MS` constant and `lastWatchRenewalAt` mutable module-scope.
- Deleted the watch-renewal block inside `setInterval`. Replaced with a one-line comment pointer to the import block above.

## Files Touched (Exact List + Line-Range Deltas)

| File | Before | After | Net Delta |
| --- | --- | --- | --- |
| `apps/staff-web/app/routes/$view.tsx` | 19 lines | 31 lines | +12 |
| `apps/staff-web/app/routes/$view.$threadId.tsx` | 19 lines | 31 lines | +12 |
| `apps/staff-web/server/lib/google-auth.ts` | 1796 lines | 1796 lines | net 0 (−5 SCOPES entries, +2 SCOPES entries + comment block, −4 startWatch block + comment block) |
| `apps/staff-web/server/plugins/mail-jobs.ts` | 146 lines | 122 lines | −24 |

## Confirmation: Untouched Files Stayed Untouched

The 16-hour-investigation Vercel deploy fix lives in three files that this plan explicitly must not touch. Confirmed via `git diff --stat HEAD~2 HEAD -- <file>`:

| File | Status |
| --- | --- |
| `apps/staff-web/vite.config.ts` | UNTOUCHED (no diff) |
| `apps/staff-web/scripts/post-vercel-build.mjs` | UNTOUCHED (no diff) |
| `apps/staff-web/package.json` | UNTOUCHED (no diff) |

## Verification Performed (Local — Pre-Deploy)

Step | Command | Result
--- | --- | ---
**V1** TypeScript clean? | `cd apps/staff-web && pnpm exec tsc --noEmit` | PASS (exit 0)
**V2** Full Vercel-target build? | `pnpm --filter @gymos/staff-web build` | PASS — Nitro build complete, 42.6 MB total / 15.2 MB gzip, "Build complete" + `[postbuild] Skipped — NITRO_PRESET is not 'vercel' (got: unset)` (correct: only Vercel sets `NITRO_PRESET=vercel`, so the pg-externals inject runs only on the real deploy)
**V3** SCOPES exactly 2 entries? | `grep -n "userinfo.profile\|userinfo.email" apps/staff-web/server/lib/google-auth.ts` | PASS — lines 34-35 only
**V4** Zero gmail/calendar/contacts strings? | `grep -c "gmail\.\\|calendar\.\\|contacts\." apps/staff-web/server/lib/google-auth.ts` | PASS — 0 matches
**V5** `startWatch` no longer called from `exchangeCode`? | `grep -n "startWatch" apps/staff-web/server/lib/google-auth.ts` | PASS — definition at line 183 + a doc comment at line 246; no live call
**V6** mail-jobs.ts no longer references removed symbols? | `grep -n "renewAllWatches\\|WATCH_RENEW_INTERVAL_MS\\|lastWatchRenewalAt\\|startWatch\\|getClientForAccount" apps/staff-web/server/plugins/mail-jobs.ts` | PASS — only the explanatory comment block remains
**V7** No InboxPage import in the two route files? | `grep -n "InboxPage" apps/staff-web/app/routes/$view.tsx apps/staff-web/app/routes/$view.$threadId.tsx` | PASS — 0 matches
**V8** Three load-bearing files unchanged? | `git diff --stat HEAD~2 HEAD -- apps/staff-web/vite.config.ts apps/staff-web/scripts/post-vercel-build.mjs apps/staff-web/package.json` | PASS — empty output / no diff

## Task 3 — Human Verification on Vercel Production (DEFERRED TO USER)

This task is a `checkpoint:human-verify` step that must be run by the user against the live Vercel deploy after pushing the two commits in this plan. The agent cannot drive an incognito browser against the production URL, complete a Google OAuth round-trip, or read Vercel runtime logs.

**Pre-deploy local sanity** (already done by agent — recorded above as V1, V2):
- [x] `cd apps/staff-web && pnpm exec tsc --noEmit` — passes
- [x] `pnpm --filter @gymos/staff-web build` — succeeds; Vercel-target Nitro build pipeline confirmed working

**To run after `git push` + Vercel auto-deploy (~2 min):**

1. **Mail-route redirect probe (anonymous)** — Open an incognito window. Visit `https://gym-class-os.vercel.app/inbox/19e590b0b2d0cb41` directly. Expected: HTTP 302/307 redirect to `/gymos` (visible in Network panel), then either the GymOS sign-in interstitial (if not signed in) or the GymOS WhatsApp inbox (if a session cookie is present). DO NOT see the agent-native Mail UI rendering any Gmail data.

2. **Mail-route redirect probe (other view paths)** — Try `https://gym-class-os.vercel.app/inbox`, `/sent`, `/starred`, `/drafts`, `/archive`, `/trash`, `/unread`, `/snoozed`. Each should redirect to `/gymos`.

3. **Google consent screen** — Click "Sign in with Google" from the sign-in page. Expected on Google's consent screen: ONLY
    - "See your primary Google Account email address"
    - "See your personal info, including any personal info you've made publicly available"
   Confirm NO prompts for "Read, compose, send, and permanently delete all your email from Gmail", "See and edit your calendar", or "See and download your contacts".

4. **Post-sign-in landing** — Complete the OAuth flow. Expected: land on `/gymos` with the WhatsApp inbox UI (the existing /gymos route — list of conversations + thread + member context panel). The address bar must NOT pass through `/inbox` at any point in history.

5. **Vercel runtime logs (5-minute window after sign-in)** — Open the Vercel project's Runtime Logs (or `vercel logs gym-class-os --since=5m` from CLI). Expected: NO `[gmail-watch] start after OAuth failed` warnings. NO `Gmail API has not been used` errors. NO 5xx errors triggered by the OAuth callback. Look especially at the response from `/_agent-native/google/callback`.

6. **Live deploy still healthy** — `curl -I https://gym-class-os.vercel.app/gymos` returns 200 (with a signed-in cookie) or the auth-plugin sign-in HTML (when anonymous). NOT 500.

7. **Settings sanity** — Confirm `/gymos/settings/integrations` still loads (the Stripe rotation route added in P1b-08 must continue to work, since this plan touched neither it nor its underlying Stripe code path).

**Acceptance:** the AND of all seven steps. If any one fails, reply with which step + observed behaviour and the executor will diagnose (likely Rule 1 or Rule 3 follow-up — do NOT roll forward).

**Resume signal (per plan):** Type `approved` when all seven pass, or describe the failure.

## Drift Discovered Between Plan Snippets and Actual Code

For future quick-plan snippet-extraction refinement, the only drift observed:

- **mail-jobs.ts imports** — Plan §Task 2/Edit 2B/(i) said "Then **delete the now-unused `getClientForAccount` import too**" implying it's a separate import statement. In the actual file (line 14), `getClientForAccount` and `startWatch` were combined in a single named-import line, and `listOAuthAccounts` was on the line above (also only used by `renewAllWatches`). Resolved correctly — the executor merged both deletions and replaced with an explanatory comment block. Plan extraction step might want to capture the exact import-line shape (single combined line vs separate) so the deletion guidance reads cleanly.

- **Plan SCOPES line numbers** — Plan said "currently lines 28-37" for SCOPES; actual was lines 28-37 (exact match). The `exchangeCode` block "currently lines 210-252" was also accurate (the `startWatch` call was at lines 245-249). No drift.

- **Plan-prescribed Spinner import path** `@/components/ui/spinner` matched the existing `_index.tsx` and the resolvable path under `apps/staff-web/app/components/ui/spinner.tsx`. No drift.

## Deviations from Plan

**Auto-fixed Issues:** None — the plan executed exactly as written.

**Architectural Decisions:** None required.

**Authentication Gates:** None encountered. Task 3 (Vercel human-verify) is deferred to the user by explicit instruction in the executor constraints, not because of an auth gate.

## Known Stubs

None introduced by this plan. The 4 modified files contain no placeholder/empty data, no "coming soon" text, no TODO/FIXME comments.

(Pre-existing stubs elsewhere in staff-web — e.g. the `/gymos` reply form that persists to DB but stubs the Meta WhatsApp send — are tracked separately in STATE.md "Blockers/Concerns" and are not in scope for this quick task.)

## Self-Check: PASSED

- [x] Both route files (`$view.tsx`, `$view.$threadId.tsx`) modified, both committed (`471fe10a`), `InboxPage` import gone from both, `loader`+`clientLoader`+`HydrateFallback`+default component returning `null` all present.
- [x] `google-auth.ts` modified, SCOPES narrowed to identity-only, `startWatch` no longer called from `exchangeCode`. Committed `8351022e`.
- [x] `mail-jobs.ts` modified, `renewAllWatches`/`WATCH_RENEW_INTERVAL_MS`/`lastWatchRenewalAt`/cron call site all removed; imports of `getClientForAccount`+`startWatch`+`listOAuthAccounts` all removed. Committed `8351022e`.
- [x] Three load-bearing files (`vite.config.ts`, `post-vercel-build.mjs`, `package.json`) verified untouched.
- [x] `pnpm exec tsc --noEmit` clean (exit 0).
- [x] `pnpm --filter @gymos/staff-web build` clean (Nitro build complete, post-vercel-build correctly skipped locally).
- [x] Two atomic commits with proper `fix({phase}-{plan}):` format.
- [x] SUMMARY.md created at `.planning/quick/260524-r8f-fix-staff-web-oauth-redirect-mail-routes/260524-r8f-SUMMARY.md`.
- [x] Task 3 (human-verify) deferred to user, full 7-step checklist documented above.
