---
phase: quick-260624-p2x
plan: 01
subsystem: forms / lead-ack WhatsApp auto-reply
tags: [whatsapp, llm-prompt, lead-ack, meta-conversion, forms]
requires:
  - apps/staff-web/features/forms/lib/lead-ack.ts (buildLeadAckVars)
  - apps/staff-web/features/forms/handlers/submissions.ts (caller, unchanged)
provides:
  - "Lead-ack {{N}} fill now produces a personalized qualifying question in the pre-reply slot"
affects:
  - "Form-submission WhatsApp auto-reply copy (the message a NEW lead receives)"
tech-stack:
  added: []
  patterns:
    - "LLM prompt instructs full-message fill (read template body) rather than per-slot best-match class"
key-files:
  created: []
  modified:
    - apps/staff-web/features/forms/lib/lead-ack.ts
decisions:
  - "Keep model id claude-sonnet-4-6 exactly — current and correct, no provider/model change"
  - "Per-slot truncation raised 60 -> 200 so a full ~80-160 char qualifying question is not decapitated"
  - "max_tokens bumped 300 -> 400 to give the longer question headroom (well under the <=400 ceiling)"
metrics:
  duration: ~15min
  completed: 2026-06-24
  tasks: 2
  files: 1
---

# Quick 260624-p2x: Rework Lead-Ack WhatsApp Auto-Reply Middle Variable Summary

Reworked the lead-ack WhatsApp auto-reply AI fill so the conversational middle template variable becomes a personalized open qualifying question (referencing the lead's form answers) instead of a bare class name — driving the lead to reply, which opens the 24h WhatsApp window and fires the Meta Contact campaign-optimisation event.

## What Changed

Single-file edit to `apps/staff-web/features/forms/lib/lead-ack.ts`, inside `buildLeadAckVars`'s `try` block only:

1. **Prompt rewrite (~lines 139-159).** The Claude prompt no longer biases each slot toward "the single best-matching class / our X sessions". It now instructs the model to read the template body and fill each `{{N}}` so the FINAL assembled message flows naturally and is personalized from the lead's form answers. For a slot that sits just before an invitation to reply (e.g. "Feel free to reply here"), the model must reference what the lead told us (the class they enquired about plus any level / experience / goal) and END that slot with ONE warm, open qualifying question. Hard rules preserved verbatim: slot `"1"` MUST be the first name (`${firstName}` interpolation kept), JSON-only contract kept, NO emojis / NO newlines / NO markdown kept.
2. **Truncation cap raised 60 -> 200.** `result[key] = raw.trim().slice(0, 60)` became `slice(0, 200)`. A full qualifying question is ~80-160 chars; the old cap decapitated it. 200 is a safe ceiling well under WhatsApp body-variable limits. (Slot `"1"` is force-set to `firstName` two lines later, so its cap is irrelevant.)
3. **max_tokens bumped 300 -> 400** to give the longer question room to generate. `model: "claude-sonnet-4-6"` is unchanged; provider unchanged.

Ran Prettier on the file per AGENTS.md.

## Preserved Behaviors (verified after editing)

- `varCount === 0` -> returns `{}` (early exit at top) — Test 6 green.
- `!process.env.ANTHROPIC_API_KEY` -> returns `fallback()` (slot 1 = firstName, all others = "our classes") — Test 5 green.
- Whole body stays wrapped in `try { ... } catch { return fallback(); }` — never throws.
- `result["1"] = firstName;` after the loop (force slot 1 regardless of model output) — intact.
- `parseTemplateBody` byte-for-byte unchanged — Tests 1-4 green.
- `formContext` and `catalogStr` builders reused unchanged.
- Caller `apps/staff-web/features/forms/handlers/submissions.ts` unchanged (input contract identical; imports `buildLeadAckVars` from `../lib/lead-ack.js`).

## Deviations from Plan

None — plan executed exactly as written. CHANGE 3 (the optional `max_tokens` bump) was judged useful for a longer question and applied within the plan's stated `<= 400` ceiling.

## Verification

- **vitest (`features/forms/lib/lead-ack.test.ts`): all 6 tests PASS.**
  `Test Files 1 passed (1)`, `Tests 6 passed (6)`. parseTemplateBody Tests 1-4 + fallback Test 5 (slot "1"="Sarah", slot "2"="our classes") + varCount-0 Test 6 ({}).
  Note on how it was run: this executor runs inside an isolated git worktree with **no installed `node_modules`** and the app `vite.config.ts` requires `@react-router/dev`. To run the plan's verification honestly, the main checkout's `node_modules` were exposed to the worktree via Windows directory junctions (`mklink /J`) for both the repo root and `apps/staff-web`, and the suite was run with a throwaway Vitest config including only `features/forms/lib/lead-ack.test.ts` (the repo's `vitest.unit.config.ts` include globs do not cover `features/**`; the plan's `npx vitest run features/forms/lib/lead-ack.test.ts` uses the default `vite.config.ts` runner, which is the same code path the temp config exercised for this pure file). The throwaway config was deleted after the run. The junctions are under gitignored `node_modules` and are not committed.

- **tsc --noEmit: ZERO errors attributable to `lead-ack.ts`** (grep count for `lead-ack` = 0). tsc surfaced 6 pre-existing, unrelated errors in OTHER files — all framework-codegen/virtual-module artifacts that appear only because the worktree has not run the dev/build codegen step:
  - `app/root.tsx(29,28)` — `Cannot find module './+types/root'`
  - `server/plugins/agent-chat.ts(8,29)` — `Cannot find module '../../.generated/actions-registry.js'`
  - `server/routes/[...page].get.ts` / `[...page].post.ts` / `api/m/[...all].get.ts` / `api/m/[...all].post.ts` — `Cannot find module 'virtual:react-router/server-build'`
  These are not introduced by this change (lead-ack.ts has no codegen dependencies and none of these files were touched). Per the plan's done criteria, pre-existing errors in unrelated files do not block this task.

- **Manual diff read-back:** prompt rewritten (no longer says "single best-matching class" / "our X sessions"; now instructs natural full-message fill ending the pre-reply slot with one open qualifying question), `slice(0, 200)`, `max_tokens: 400`, `model: "claude-sonnet-4-6"` unchanged, try/catch->fallback wrapper + `result["1"] = firstName` post-loop force intact, `parseTemplateBody` untouched.

## Commits

- `6dcd05a2` feat(quick-260624-p2x): rework lead-ack prompt into a personalized qualifying question — `apps/staff-web/features/forms/lib/lead-ack.ts`

## Operator Note (out of scope for this change)

The new copy assumes an approved 2-slot WhatsApp template whose body reads like
"Hey {{1}}, thanks for your interest in {{2}} Feel free to reply here."
The operator creates/approves that template in Meta separately — no DB, migration, new action, or new template ships in this change.

## Self-Check: PASSED

- `apps/staff-web/features/forms/lib/lead-ack.ts` — FOUND (modified, committed)
- Commit `6dcd05a2` — FOUND in git log
