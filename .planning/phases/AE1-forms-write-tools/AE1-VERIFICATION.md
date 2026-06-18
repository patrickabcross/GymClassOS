---
phase: AE1-forms-write-tools
verified: 2026-06-18T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Create a form via the agent in the deployed app"
    expected: "Tell the agent 'create a form called Membership Enquiry' on the Forms tab — a draft row should appear in the forms list without a manual page reload, and the agent should return { id, title, slug }."
    why_human: "No local dev server (NitroViteError). Requires a deployed Vercel build."
  - test: "Agent adds a field with a malformed id and the action rejects it"
    expected: "Tell the agent to add a field with id='x\" onfocus=alert(1)' — update-form-fields should return { error: '...' } and the form's fields column in Neon must be unchanged."
    why_human: "Requires runtime execution against the deployed app + Neon database."
  - test: "Agent proposes publish and the form does NOT go live until the coach approves"
    expected: "On a draft form, tell the agent 'publish this form' — a pending dashboard_proposals row must appear (status='pending'); form status in Neon must remain 'draft' until the coach clicks Approve on the noticeboard."
    why_human: "End-to-end propose→approve flow requires the live Vercel UI + Neon."
  - test: "Agent unpublishes a published form"
    expected: "On a published form, tell the agent 'unpublish this form' — form status in Neon must flip to 'draft' immediately (no approval step)."
    why_human: "Requires runtime execution and Neon state verification."
  - test: "Forms tab live-refreshes after any agent write"
    expected: "After the agent completes any write action (create/update/unpublish/archive/restore), the Forms tab list updates without the coach needing to reload the page."
    why_human: "useChangeVersions polling behaviour can only be confirmed in a running browser session."
---

# Phase AE1: Forms Write Tools — Verification Report

**Phase Goal:** Coach can use the agent to manage the full forms lifecycle — create, edit, publish, unpublish, archive, restore — and the active-tab context and propose→approve gate are established as the cross-cutting pattern for the whole milestone.
**Verified:** 2026-06-18
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent can create a draft form — `create-form` exists + Forms tab live-refreshes | ✓ VERIFIED | `actions/create-form.ts` uses `defineAction`, imports `slugify`, inserts with `status:"draft"`. `gymos.forms._index.tsx` imports `useRevalidator` + `useChangeVersions(["action"])` wired in a `useEffect([actionVersion])`. |
| 2 | Agent can add fields, Zod-validated — `update-form-fields` validates against `FormFieldSchema` + `assertValidFields` | ✓ VERIFIED | `actions/update-form-fields.ts` imports `FormFieldSchema` from `../features/forms/lib/form-field-schema.js` and `assertValidFields` from `../features/forms/lib/validate-fields.js`. Run body calls `assertValidFields(fields)` inside try/catch returning `{ error }` on failure. Returns `FORM_IS_ARCHIVED` guard. |
| 3 | Agent "publish" routes through propose→approve gate — `publish-form` is in ACTION_ALLOWLIST + dispatch + propose-action enum + schema enum | ✓ VERIFIED | `approve-proposal.ts` ACTION_ALLOWLIST contains `"publish-form"` (line 13); dispatch chain has `else if (proposal.actionName === "publish-form") { mod = await import("./publish-form.js") }` (line 63). `propose-action.ts` Zod enum contains `"publish-form"` (3-member enum). `schema.ts` dashboardProposals.actionName `enum` array contains `"publish-form"` (line 479). No `.sql` migration added. |
| 4 | Agent "unpublish" is a direct action — status reverts to draft without approval | ✓ VERIFIED | `actions/unpublish-form.ts` directly `UPDATE SET { status: "draft" }` with no propose-action involvement; no `http:` key (agent-only). |
| 5 | After any agent write, Forms tab live-refreshes via change-version hook | ✓ VERIFIED | `gymos.forms._index.tsx` lines 223–232: `const revalidator = useRevalidator(); const actionVersion = useChangeVersions(["action"]);` + `useEffect(() => { if (actionVersion > 0) { revalidator.revalidate(); } }, [actionVersion])`. Dependency array correctly excludes `revalidator` (anti-loop guard present). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/staff-web/features/forms/lib/slugify.ts` | `slugify()` export | ✓ VERIFIED | Exists, 9 lines, exports `slugify`, implements lowercase/trim/replace logic with "form" fallback |
| `apps/staff-web/features/forms/lib/form-field-schema.ts` | `FormFieldSchema` Zod object, all 11 type enum members | ✓ VERIFIED | Exists, imports `FIELD_ID_PATTERN` from `./validate-fields.js`, exports `FormFieldSchema` with all 11 type enum values |
| `apps/staff-web/actions/create-form.ts` | `defineAction`, imports slugify | ✓ VERIFIED | 51 lines, `defineAction`, imports `slugify` from `../features/forms/lib/slugify.js`, unique-slug loop, `guard:allow-unscoped` ×2 |
| `apps/staff-web/actions/update-form-fields.ts` | `defineAction`, imports `FormFieldSchema` + `assertValidFields` | ✓ VERIFIED | Imports both; schema uses `z.array(FormFieldSchema)`; run calls `assertValidFields`; returns `FORM_IS_ARCHIVED` |
| `apps/staff-web/actions/update-form-meta.ts` | `defineAction`, never sets status or slug | ✓ VERIFIED | Patch object only sets `updatedAt`, `title`, `description`, `settings` — grep confirms no `status:` or `slug:` key in patch |
| `apps/staff-web/actions/unpublish-form.ts` | `defineAction`, sets status to 'draft' directly | ✓ VERIFIED | Direct `UPDATE SET { status: "draft" }`, no http key |
| `apps/staff-web/actions/archive-form.ts` | `defineAction`, sets deletedAt | ✓ VERIFIED | Sets `deletedAt: new Date().toISOString()` |
| `apps/staff-web/actions/restore-form.ts` | `defineAction`, clears deletedAt | ✓ VERIFIED | Sets `deletedAt: null` |
| `apps/staff-web/actions/publish-form.ts` | Gated `defineAction`, re-validates fields, no http key | ✓ VERIFIED | Re-parses `form.fields` JSON, runs `z.array(FormFieldSchema).safeParse(fields)`, returns `FIELDS_INVALID` before any UPDATE; no `http:` key |
| `apps/staff-web/app/routes/gymos.forms._index.tsx` | `useChangeVersions(["action"])` + `useRevalidator` wired | ✓ VERIFIED | Both imports present; `useEffect([actionVersion])` present; revalidator NOT in dep array |
| `apps/staff-web/actions/view-screen.ts` | `else if (nav?.view === "forms")` branch before email branch | ✓ VERIFIED | Branch at line 272, before `else if (nav?.view)` email branch at line 305; queries `schema.forms` with `isNull(schema.forms.deletedAt)`; sets `screen.forms` and `screen.selectedForm` |
| `apps/staff-web/server/plugins/agent-chat.ts` | Per-tab Forms section with all 6 direct actions named; publish only via propose-action | ✓ VERIFIED | Forms section present at line 44–50; names create-form, update-form-fields, update-form-meta, unpublish-form, archive-form/restore-form; publish instruction routes through `propose-action({ actionName: "publish-form" })`; no standalone `- publish-form —` bullet |
| `apps/staff-web/AGENTS.md` | All 7 forms action rows + two-exposure note | ✓ VERIFIED | All 7 rows present in Agent Actions table; publish-form row marked gated; `propose-action` row updated to include publish-form; two-exposure note at bottom of table section |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `update-form-fields.ts` | `form-field-schema.ts` | `import { FormFieldSchema }` | ✓ WIRED | Line 5 import present |
| `update-form-fields.ts` | `validate-fields.ts` | `import { assertValidFields }` | ✓ WIRED | Line 6 import present; called at run-time in try/catch |
| `approve-proposal.ts` | `publish-form.ts` | `else if (proposal.actionName === "publish-form") { await import("./publish-form.js") }` | ✓ WIRED | Lines 63–65 |
| `publish-form.ts` | `form-field-schema.ts` | `import { FormFieldSchema }` | ✓ WIRED | Line 5 import present; used in `z.array(FormFieldSchema).safeParse()` |
| `gymos.forms._index.tsx` | `@agent-native/core/client` | `useChangeVersions(["action"])` | ✓ WIRED | Line 20 import; used line 224 |
| `view-screen.ts` | `schema.forms` | `nav?.view === "forms"` branch | ✓ WIRED | Lines 272–304; dynamic imports `getDb`/`schema` + `isNull`/`eq` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `create-form.ts` | `{ id, title, slug }` | `db.insert(schema.forms)` | Yes — inserts into Neon via `getDb()` | ✓ FLOWING |
| `update-form-fields.ts` | `{ updated, fieldCount }` | `db.update(schema.forms).set({ fields: JSON.stringify(fields) })` | Yes | ✓ FLOWING |
| `publish-form.ts` | `{ published, slug }` | `db.update(schema.forms).set({ status: "published" })` after re-validation | Yes | ✓ FLOWING |
| `unpublish-form.ts` | `{ unpublished }` | `db.update(schema.forms).set({ status: "draft" })` | Yes | ✓ FLOWING |
| `view-screen.ts` (forms branch) | `screen.forms` | `db.select(...).from(schema.forms).where(isNull(schema.forms.deletedAt))` | Yes — real Neon query | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no local dev server available (NitroViteError prevents `pnpm dev`). Runtime behaviour deferred to human verification items above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AEF-01 | AE1-01 | Agent creates a draft form (title, optional description) | ✓ SATISFIED | `create-form.ts` — `defineAction` inserts with `status:"draft"`; unique-slug loop; returns `{id, title, slug}` |
| AEF-02 | AE1-01 | Agent edits form fields, Zod-validated, malformed rejected | ✓ SATISFIED | `update-form-fields.ts` — `FormFieldSchema` array parse + `assertValidFields` double validation; returns `{error}` on failure, never writes |
| AEF-03 | AE1-01 | Agent edits title/description/settings, never changes status or slug | ✓ SATISFIED | `update-form-meta.ts` — patch object provably never sets `status` or `slug` |
| AEF-04 | AE1-02 | Agent publishes via propose→approve only (never auto-publishes) | ✓ SATISFIED | `publish-form.ts` target action exists; gate wired atomically in approve-proposal ACTION_ALLOWLIST + dispatch + propose-action Zod enum + schema.ts Drizzle enum |
| AEF-05 | AE1-01 | Agent unpublishes a published form (back to draft, direct) | ✓ SATISFIED | `unpublish-form.ts` — direct UPDATE, no approval, no http key |
| AEF-06 | AE1-01 | Agent archives or restores a form | ✓ SATISFIED | `archive-form.ts` sets `deletedAt`; `restore-form.ts` clears `deletedAt` |
| AEX-01 | AE1-03 | Agent is context-aware of active tab; per-tab system prompt | ✓ SATISFIED | `view-screen.ts` forms branch (lines 272–304); `agent-chat.ts` per-tab Forms section |
| AEX-02 | AE1-02 | Risky actions route through propose→approve; gate is atomic | ✓ SATISFIED | All four gate locations (ACTION_ALLOWLIST, dispatch branch, propose-action enum, schema.ts enum) updated atomically; no .sql migration added |
| AEX-03 | AE1-01 | Tab UI live-refreshes after agent write, no manual reload | ✓ SATISFIED | `gymos.forms._index.tsx` useChangeVersions(["action"]) + useRevalidator + useEffect([actionVersion]) — dep array excludes revalidator (anti-loop) |
| AEX-04 | AE1-03 | Every new write action documented in AGENTS.md AND agent-chat.ts | ✓ SATISFIED | All 7 forms actions in AGENTS.md Agent Actions table; all 6 direct actions + publish-via-propose path in agent-chat.ts Forms section; two-exposure note present |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No TODOs, no stubs, no empty handlers, no hardcoded empty returns found in any of the 7 action files or the 2 lib files |

### Human Verification Required

#### 1. End-to-end: Agent creates a form

**Test:** On the deployed Vercel app (`gym-class-os.vercel.app`), navigate to the Forms tab, open the agent chat, and say "create a form called Membership Enquiry with a brief description about our trial pass".
**Expected:** The agent calls `create-form`, a new draft row appears in the forms list without a manual reload, and the agent responds with the form's id and slug.
**Why human:** No local dev server available (NitroViteError). Requires Vercel deployment + Neon.

#### 2. Field validation rejects a malformed id

**Test:** On a draft form, tell the agent to add a field with id `x" onfocus=alert(1)`.
**Expected:** The agent calls `update-form-fields`, receives `{ error: "..." }` (assertValidFields rejects the id), and the form's fields column in Neon is unchanged.
**Why human:** XSS rejection requires runtime execution; static analysis confirms the guard exists but cannot confirm the exact error message surfaced to the agent.

#### 3. Publish proposal card appears; form stays draft until approval

**Test:** On a draft form with at least one valid field, tell the agent "publish this form".
**Expected:** The agent calls `propose-action({ actionName: "publish-form", ... })`, a proposal card appears on the noticeboard. Verify the `dashboard_proposals` row in Neon has `status='pending'` and the form's `status` is still `'draft'`. Then click Approve — the form's `status` must flip to `'published'`.
**Why human:** End-to-end propose→approve flow requires the live UI + Neon state inspection.

#### 4. Unpublish reverts to draft directly (no approval card)

**Test:** On a published form, tell the agent "take this form offline".
**Expected:** The agent calls `unpublish-form`, the form's `status` in Neon flips to `'draft'` immediately — NO pending proposal row is created.
**Why human:** Requires runtime + Neon inspection to confirm no spurious proposal was created.

#### 5. Forms tab live-refresh observable in browser

**Test:** With the Forms tab open and the browser DevTools Network tab visible, tell the agent to archive a form.
**Expected:** A loader re-fetch fires for the Forms route within ~2 seconds of the action completing, and the forms list updates to reflect the archive — without the coach refreshing the page.
**Why human:** `useChangeVersions` polling behaviour requires an active browser session; cannot be tested statically or via tsc.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are satisfied at the code level:

1. `create-form` exists and is substantive; `useChangeVersions(["action"])` + `useRevalidator` are wired correctly in the Forms route with a non-looping dependency array.
2. `update-form-fields` imports both `FormFieldSchema` and `assertValidFields`, applies them in sequence, returns `{error}` before any DB write on failure.
3. `publish-form` is in all four gate locations (ACTION_ALLOWLIST, dispatch `else if` branch, `propose-action` Zod enum, `schema.ts` Drizzle enum) — atomically, with no SQL migration.
4. `unpublish-form` is a direct action (no gating) that sets `status:'draft'`.
5. `gymos.forms._index.tsx` has `useChangeVersions(["action"])` + `useEffect([actionVersion])` — `revalidator` excluded from dependency array (anti-loop guard confirmed).

All 10 requirement IDs (AEF-01..06, AEX-01..04) are marked complete in REQUIREMENTS.md and backed by substantive, wired implementation. TypeScript compilation passes (`npx tsc --noEmit` exits 0). The only remaining items are runtime-behaviour checks that require the deployed Vercel app.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_
