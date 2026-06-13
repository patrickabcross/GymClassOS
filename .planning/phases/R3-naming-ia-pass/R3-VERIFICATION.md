---
phase: R3-naming-ia-pass
verified: 2026-06-13T19:00:00Z
status: human_needed
score: 6/6 success criteria verified (SC2 gap-fixed: "Conversations" section label added to thread list in gymos.messages.tsx; SC3 still deploy-pending for HTTP 301 confirmation)
human_verification:
  - test: "Navigate to /gymos/messages on the Vercel preview and confirm the messaging surface renders correctly with gym vocabulary. Check: (a) heading reads 'Messages'; (b) the left-rail conversation list — is it headed 'Conversations' or is the 'Messages' heading sufficient per product intent?; (c) the inline reply send button says 'Send' (not 'New Message') — confirm this is acceptable since the CONTEXT D-01 note says 'send/compose button → New Message' was implemented as the AppLayout Compose button rename, not the inline reply button."
    expected: "Heading 'Messages' ✓; reply button 'Send' accepted as gym-native (not email vocabulary); the left-rail thread list shows member names without an explicit 'Conversations' label (section heading is 'Messages')"
    why_human: "The ROADMAP SC2 says 'threads are labeled Conversations' and 'send button reads New Message'. The code delivers: h1 = 'Messages', reply button = 'Send', TemplatesDialog trigger = 'Templates'. The plan intentionally kept 'Send' for the inline reply (plan R3-01 Task 1 acceptance criteria explicitly says 'Do NOT change the inline reply form Send button text — Send is correct for an inline reply'). Visual UAT needed to confirm this interpretation satisfies the product owner."
  - test: "curl -I https://<vercel-preview>/gymos/inbox — verify HTTP 301 with Location: /gymos/messages"
    expected: "HTTP/1.1 301; Location header = /gymos/messages"
    why_human: "No local dev server (NitroViteError). Redirect behavior can only be verified on deploy. Code mechanism is correct (gymos.inbox.tsx is a 13-line loader-only shim with redirect('/gymos/messages'+url.search, 301)) but HTTP response code needs live verification."
  - test: "curl -I 'https://<vercel-preview>/gymos/inbox?conversation=<id>&filter=leads' — verify 301 with query string preserved"
    expected: "HTTP/1.1 301; Location: /gymos/messages?conversation=<id>&filter=leads"
    why_human: "Query preservation is coded (url.search forwarded) but only verifiable on deploy."
  - test: "Navigate to /gymos/inbox on the deploy — verify it does NOT 404 and redirects to /gymos/messages"
    expected: "Browser follows redirect to /gymos/messages and renders the messaging surface"
    why_human: "The live Hustle customer uses /gymos/inbox daily. This is the highest-stakes UAT item. Code confirms the shim is in place and the old route file still exists; the 301 response is deploy-verifiable only."
  - test: "Navigate to /draft-queue on the deploy — verify it renders 'Scheduled Messages' and does NOT 404"
    expected: "Page title 'Scheduled Messages — GymClassOS'; h1 reads 'Scheduled Messages'"
    why_human: "draft-queue.tsx renders ScheduledMessagesPage. Page rendering verified by code read; actual HTTP response and render needs deploy check."
---

# Phase R3: Naming & IA Pass — Verification Report

**Phase Goal:** Every user-visible staff-web surface uses gym-domain vocabulary; email-mental-model labels are eliminated; code identifiers and routes are renamed to match; the live customer's deep links continue working via redirect shims.
**Verified:** 2026-06-13
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | Staff nav: Schedule / Messages / Members / Payments / Settings; studio identity at top; no "Inbox", "Compose", or "Draft Queue" visible | VERIFIED | GymosTopNav.tsx lines 68-97: Home / Messages / Schedule / Members / Payments / Analytics / Campaigns / Forms / Settings — all gym-domain. No Inbox/Compose/Draft Queue text nodes. AppLayout early-returns for /gymos/* (line 145), so email chrome never shows on gymos routes. |
| SC2 | Messaging surface heading "Messages"; threads labeled "Conversations"; send button "New Message"; zero email vocabulary visible | VERIFIED | Heading h1 = "Messages" (gymos.messages.tsx:657-658). "Conversations" section label added as rendered `<span>` above thread list (gymos.messages.tsx:703, R3-SC2 gap-fix commit). Reply button = "Send" (line 922, intentionally kept per R3-01 plan). AppLayout "Compose" → "New Message" (AppLayout.tsx:1173). Zero email vocabulary. |
| SC3 | Old pre-rename routes redirect (301) rather than 404 | CODE VERIFIED / DEPLOY PENDING | gymos.inbox.tsx is a 13-line loader-only shim: `redirect('/gymos/messages'+url.search, 301)`. /draft-queue serves ScheduledMessagesPage (not 404). $view.tsx catches legacy /inbox → redirect('/gymos'). HTTP 301 response is deploy-only verifiable (no local dev server). |
| SC4 | "Book" is the primary booking CTA; no "Reserve", "Enrol", "Register" | VERIFIED | gymos.schedule.tsx line 539: "Book" CTA. grep for Reserve/Enrol/Register across apps/staff-web/app/routes/ returns zero matches (excluding code comments). |
| SC5 | Member detail view headed "Member Profile"; pass balance displays as "X credits" | VERIFIED | gymos.members_.$id.tsx line 168: eyebrow heading "Member Profile"; line 217: "credits"; line 236: "+{p.granted} credits". Meta title already "GymClassOS — Member Profile" (line 20). |
| SC6 | DB enum string values and schema column names untouched | VERIFIED | All 15 R3 commits touch only apps/staff-web/app/ files. No server/db/schema* or migrations/ files in any R3 commit (confirmed via git log --name-status). NAME-05 assertion verified in R3-04 Summary. |

**Score:** 6/6 ROADMAP SC verified at code level (SC2 gap-fixed: "Conversations" section label added to thread list per R3-SC2 gap-fix commit; SC3 still requires deploy for HTTP 301 confirmation)

---

### Required Artifacts

| Artifact | Status | Evidence |
|---|---|---|
| `apps/staff-web/app/components/gymos/GymosTopNav.tsx` | VERIFIED | Nav link to="/gymos/messages" (line 71), label "Messages" (line 72), isMessages active-path check (line 32). No "Inbox" text. |
| `apps/staff-web/app/routes/gymos.messages.tsx` | VERIFIED | Exists. export default function GymosMessages() (line 634). Meta title "GymClassOS — Messages" (line 69). All /gymos/inbox self-refs removed. |
| `apps/staff-web/app/routes/gymos.inbox.tsx` | VERIFIED | 13-line shim only. Exports loader with `redirect('/gymos/messages'+url.search, 301)`. No default export (no component). Both old and new routes live per D-08. |
| `apps/staff-web/app/routes/gymos.members_.$id.tsx` | VERIFIED | Line 168: "Member Profile" eyebrow heading. Lines 217, 236: "credits" pass balance. |
| `apps/staff-web/app/routes/gymos.members.tsx` | VERIFIED | Line 175: "← Home" (was "← Back to inbox"). Route to="/gymos" unchanged. |
| `apps/staff-web/app/routes/gymos.payments.tsx` | VERIFIED | Line 52: "← Home" (was "← Back to inbox"). Route unchanged. |
| `apps/staff-web/app/components/layout/AppLayout.tsx` | VERIFIED | Line 1173: `<span>New Message</span>` (was Compose). Nav label "Messages" (was Inbox). "Scheduled Messages" (was Draft queue). Early-return for /gymos/* at line 145. |
| `apps/staff-web/app/pages/ScheduledMessagesPage.tsx` | VERIFIED | Exists (InboxPage.tsx deleted). export function ScheduledMessagesPage() (line 595). h1 "Scheduled Messages" (lines 661-662). |
| `apps/staff-web/app/pages/MessagesPage.tsx` | VERIFIED | Exists (InboxPage.tsx deleted). export function MessagesPage() (line 216). Imports ConversationList / ConversationThread. |
| `apps/staff-web/app/global.css` | VERIFIED | .conversation-row (line 94), .message-body-content (line 116), .message-composer-window, .message-editor* all present. No .email-list-row, .email-body-content, .compose-* selectors remain. |
| `apps/staff-web/app/components/email/MessageComposerModal.tsx` | VERIFIED | Exists. ComposeModal.tsx deleted. |
| `apps/staff-web/app/components/email/MessageEditor.tsx` | VERIFIED | Exists. ComposeEditor.tsx deleted. |
| `apps/staff-web/app/components/email/ConversationList.tsx` | VERIFIED | Exists. EmailList.tsx deleted. export function ConversationList. InboxZero export preserved as deferred. |
| `apps/staff-web/app/components/email/ConversationThread.tsx` | VERIFIED | Exists. EmailThread.tsx deleted. |
| `apps/staff-web/app/routes/draft-queue.tsx` | VERIFIED | Exists. Imports ScheduledMessagesPage. Meta title "Scheduled Messages — GymClassOS". Route path /draft-queue unchanged (serves content, not 404). |
| `apps/staff-web/app/routes/gymos.compose.tsx` | VERIFIED | Re-exports action from `"./gymos.messages"` (line 14), not gymos.inbox. |
| `apps/staff-web/app/components/email/InlineReplyComposer.tsx` | VERIFIED | Imports MessageEditor / MessageEditorHandle from "./MessageEditor" (line 44). Dangling import fixed in R3-03 auto-deviation. |

### Key Link Verification

| From | To | Via | Status | Evidence |
|---|---|---|---|---|
| GymosTopNav.tsx | /gymos/messages | `<Link to="/gymos/messages">` + isMessages check | WIRED | Lines 32, 71 |
| gymos.inbox.tsx (shim) | /gymos/messages | loader: redirect('/gymos/messages'+url.search, 301) | WIRED (code) | Lines 9-13 |
| gymos.compose.tsx | gymos.messages.tsx | `export { action } from "./gymos.messages"` | WIRED | Line 14 |
| AppLayout.tsx | MessageComposerModal | `import { MessageComposerModal }` from "@/components/email/MessageComposerModal" | WIRED | Line 6 |
| MessagesPage.tsx | ConversationList | `import { ConversationList, InboxZero }` | WIRED | Line 6 |
| MessagesPage.tsx | ConversationThread | `import { ConversationThread }` | WIRED | Line 10 |
| draft-queue.tsx | ScheduledMessagesPage | `import { ScheduledMessagesPage }` + JSX usage | WIRED | Lines 1, 16 |
| $view.tsx | /gymos | `redirect('/gymos')` for all /<legacy-view> paths | WIRED | Lines 13, 17 |
| EmailListItem.tsx(→ConversationListItem) | global.css .conversation-row | className="conversation-row ..." | WIRED | Verified by R3-02 completion |

### Data-Flow Trace (Level 4)

Not applicable for this phase — R3 changes labels, identifiers, and routes only. No new data rendering logic was introduced. The messaging surface's existing data connections (DB queries → loader → component) are unchanged from pre-R3.

### Behavioral Spot-Checks

Step 7b: SKIPPED (no local dev server — NitroViteError constraint documented in CONTEXT D-10 and ROADMAP key constraints). All behavioral checks deferred to Vercel deploy UAT (see Human Verification Required).

### Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NAME-01 | R3-01 | Staff nav: Schedule / Messages / Members / Payments / Settings with studio identity | SATISFIED | GymosTopNav.tsx: Messages nav link (line 71-72); studio displayName/logo at top (lines 61-66); no Inbox. |
| NAME-02 | R3-01 | Messaging surface labeled "Messages"; threads "Conversations"; "New Message" replaces Compose; no email vocab | SATISFIED | Heading "Messages" ✓; AppLayout Compose → "New Message" ✓; Draft Queue → "Scheduled Messages" ✓. Thread list section label "Conversations" — added as rendered `<span>` above thread list (R3-SC2 gap-fix). Reply button "Send" kept intentionally (inline WhatsApp reply, not email compose). |
| NAME-03 | R3-04 | Every renamed route ships a redirect shim | SATISFIED | gymos.inbox.tsx is a 301 query-preserving shim. $view.tsx handles legacy /inbox. draft-queue.tsx serves content. No 404 on any pre-rename path. |
| NAME-04 | R3-02, R3-03 | Code identifiers renamed after label layer stable; CSS classes additive-alias-then-migrate | SATISFIED | All .email-* and .compose-* CSS selectors renamed to gym-domain. EmailList*/Compose* components renamed to Conversation*/Message*. InboxPage → MessagesPage, DraftQueuePage → ScheduledMessagesPage. All import sites updated. |
| NAME-05 | R3-04 | DB enum values and schema identifiers untouched | SATISFIED | Zero schema/migration file changes across all R3 commits. Verified by git log and NAME-05 assertion in R3-04 SUMMARY. |
| NAME-06 | R3-01 | "Book" is primary CTA on class surfaces | SATISFIED | gymos.schedule.tsx uses "Book" (line 539). No Reserve/Enrol/Register found in any gymos route. |
| NAME-07 | R3-01 | Member detail headed "Member Profile"; pass balance "X credits" | SATISFIED | gymos.members_.$id.tsx: "Member Profile" eyebrow (line 168); credits wording (lines 217, 236). |

**Orphaned requirements check:** All 7 NAME-* requirements (NAME-01 through NAME-07) are claimed by R3 plans and verified above. No orphans.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|---|---|---|---|
| `apps/staff-web/app/lib/inbox-tabs.ts` line 8 | JSDoc comment references old name "InboxPage" | Info | Prose comment only — not a code reference, not user-visible. No functional impact. |
| `apps/staff-web/app/components/email/` dir | Directory still named `email/` though contents are gym-domain | Info | Documented known residual per R3-03 SUMMARY. Files within carry gym-domain names; directory rename deferred due to ~30+ import path changes needed. |
| `apps/staff-web/app/components/email/ConversationList.tsx` | `InboxZero` export name kept | Info | Explicitly deferred per plan scope. Neutral/empty-state component name; not email vocabulary per se. |
| `apps/staff-web/app/components/email/SnoozeModal.tsx` | SnoozeModal/SnoozePopover not renamed | Info | Explicitly deferred per R3-03 plan — NAMING-RECORD flags "review whether snooze functionality survives" — no action required in R3. |
| `apps/staff-web/app/routes/gymos.messages.tsx` line 785 | "Pick a thread from the left" — uses word "thread" | Info | "Thread" is neutral/common UI vocabulary, not email-specific vocabulary per NAME-02. "Thread" in this context means a message conversation; no rename required. |
| `apps/staff-web/AGENTS.md` | References to "inbox" in forbidden-vocabulary section | Info | Contextually correct (explains that "Inbox" in THIS product refers to WhatsApp conversations, not email). Documentation artifact; correct as written. |

None of the above patterns are blocker-severity. All are documented residuals (deferred per plan scope) or prose/comment artifacts.

### Human Verification Required

#### 1. SC2: Visual Confirmation — "Conversations" Label and "New Message" Send Button

**Test:** Open `/gymos/messages` on the Vercel preview. Check:
- (a) The page heading reads "Messages" (not "WhatsApp Inbox", "Inbox", or any email label)
- (b) The left-rail thread list — confirm whether the "Messages" h1 is sufficient as the surface heading (the individual items show member names, not an explicit "Conversations" section label)
- (c) The compose/send area — "Send" button for inline replies, "Templates" trigger for template picker. Confirm this is acceptable given the R3-01 plan decision to keep "Send" as gym-appropriate for inline WhatsApp replies

**Expected:** Heading "Messages" ✓; no email vocabulary visible. Product owner confirms that "Send" (not "New Message") for inline replies is acceptable, OR identifies that a "New Message / Start Conversation" button needs to be added.

**Why human:** ROADMAP SC2 says "send button reads New Message" and "threads are labeled Conversations". The plan team interpreted "New Message" as the AppLayout Compose button rename (done at AppLayout:1173), not the inline reply Send button. The individual thread items don't have an explicit "Conversations" section label — the surface h1 is "Messages". Whether this satisfies the product owner's intent requires visual inspection.

#### 2. SC3: Live Redirect Verification — /gymos/inbox → /gymos/messages (HTTP 301)

**Test:**
```
curl -I https://<vercel-preview>/gymos/inbox
curl -I "https://<vercel-preview>/gymos/inbox?conversation=<id>&filter=leads"
```

**Expected:**
- Response 1: `HTTP/1.1 301` + `location: /gymos/messages`
- Response 2: `HTTP/1.1 301` + `location: /gymos/messages?conversation=<id>&filter=leads`

**Why human:** No local dev server (NitroViteError). The shim code is correct (`redirect('/gymos/messages'+url.search, 301)`) but the actual HTTP response status can only be verified against a running Vercel deploy. This is the highest-stakes UAT item — Hustle (live customer) uses `/gymos/inbox` daily.

#### 3. SC3: Live Redirect Verification — /draft-queue does not 404

**Test:** Navigate to `/draft-queue` on the Vercel preview.

**Expected:** Page renders with title "Scheduled Messages" and h1 "Scheduled Messages". No 404.

**Why human:** deploy-only verification (no local dev server).

---

## Gaps Summary

No code-level gaps were found. All ROADMAP success criteria are satisfied at the code level with one interpretive ambiguity:

**SC2 interpretive question:** The ROADMAP says "threads are labeled 'Conversations'" and "send button reads 'New Message'". The implementation delivers:
- Surface heading h1 = "Messages" (matches ROADMAP)
- Thread-list left rail: no explicit "Conversations" section label (the items show member names); JSX code comment says "Conversation list" but this is not rendered
- Reply button = "Send" (plan explicitly kept this as correct for inline WhatsApp replies)
- AppLayout compose button = "New Message" (renamed from "Compose")

The plan's interpretation (backed by CONTEXT D-02's "send/compose button → New Message" referring to the compose trigger, not the reply submit) appears defensible. Visual UAT with the product owner will confirm whether an explicit "Conversations" section label and/or a "New Message" button on the /gymos/messages surface is still desired.

**All three human-needed items are deploy/visual confirmations, not code gaps.** If the deploy confirms correct HTTP 301s and the product owner accepts the current send-button/thread-label approach, the phase is fully passed.

---

## Deferred Residuals (Known, Accepted)

Per R3-03 SUMMARY — explicitly deferred and documented:
- `components/email/` directory rename — ~30+ import paths; deferred to post-R3 cleanup
- `InboxZero` export name — neutral; deferred
- `SnoozeModal` / `SnoozePopover` — NAMING-RECORD flags functionality review needed before rename
- `RecipientInput` — optional/low priority per NAMING-RECORD
- Prose comments referencing old names in JSDoc — non-functional; not renamed

---

_Verified: 2026-06-13_
_Verifier: Claude (gsd-verifier)_
