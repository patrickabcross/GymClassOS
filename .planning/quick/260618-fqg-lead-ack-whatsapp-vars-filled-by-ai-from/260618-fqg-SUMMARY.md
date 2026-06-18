---
phase: quick-260618-fqg
plan: "01"
subsystem: forms / whatsapp
tags: [whatsapp, forms, lead-capture, ai, anthropic, templates]
dependency_graph:
  requires:
    - quick-260618-ezc (step-14 opt-in + enqueue skeleton created there)
  provides:
    - lead-ack AI fill: N-variable WhatsApp template vars from form + class catalog
  affects:
    - apps/staff-web/features/forms/handlers/submissions.ts (step-14)
tech_stack:
  added: []
  patterns:
    - server-side Anthropic call (claude-sonnet-4-6) mirroring api.m.foods.analyze.tsx pattern
    - deterministic fallback on any LLM/parse/network error
    - template lookup + approved gate before any LLM or enqueue work
key_files:
  created:
    - apps/staff-web/features/forms/lib/lead-ack.ts
    - apps/staff-web/features/forms/lib/lead-ack.test.ts
  modified:
    - apps/staff-web/features/forms/handlers/submissions.ts
decisions:
  - "Language resolved from whatsapp_templates.language row (not hardcoded en_US)"
  - "Template must be approved in DB; missing/not-approved causes block self-skip (not error)"
  - "varCount derived from BODY componentsJson so fill adapts to any template shape"
  - "Slot 1 always forced to firstName after LLM response (safety constraint)"
metrics:
  duration: "~10 min"
  completed: "2026-06-18"
  tasks: 2
  files: 3
---

# Quick Task 260618-fqg: Lead Ack WhatsApp Vars Filled by AI from Form + Catalog

One-liner: AI-fills all `{{N}}` WhatsApp template slots from form submission + active class catalog, with deterministic fallback and real language from the template row.

## What Was Built

### Task 1 — `lead-ack.ts` module (TDD)

`apps/staff-web/features/forms/lib/lead-ack.ts` exports two functions:

**`parseTemplateBody(componentsJson: string): { bodyText: string; varCount: number }`**
- Pure, never-throws function
- Parses the `components_json` column from `whatsapp_templates`
- Extracts the BODY component's text and the max N across all `{{N}}` placeholders
- Returns `{ bodyText: "", varCount: 0 }` on any error/missing BODY

**`buildLeadAckVars(input): Promise<Record<string,string>>`**
- Fills all `{{N}}` slots using `claude-sonnet-4-6`
- Prompt includes form submission context (field label + value pairs) and the active class catalog
- Slot `"1"` is always forced to `firstName` after LLM response (safety)
- Deterministic fallback: `{ "1": firstName, "2": "our classes", ... }` on ANY failure (API key unset, network error, parse error, missing slot)
- Never throws

### Task 2 — Reworked step-14 in `submissions.ts`

The `if (phoneE164 && leadAckTemplate)` block now:

1. Looks up the template row in `whatsapp_templates` by name
2. Skips entirely (returns `{ success: true }`) if the template is missing or not `approved`
3. Calls `parseTemplateBody` to get `bodyText` + `varCount`
4. Resolves `language` from `tpl.language` (fallback `"en"` — no more hardcoded `"en_US"`)
5. For `varCount > 0`: loads active `classDefinitions` catalog and calls `buildLeadAckVars`
6. Inserts opt-in row, queued message row, conversation preview update, then enqueues via `enqueueOutboundWhatsApp` with the real `language`

Lead capture path is unchanged — the entire step-14 block is wrapped in a `try/catch` that logs and continues.

## Verification

### Vitest: `cd apps/staff-web && npx vitest run features/forms/lib/lead-ack.test.ts`
**Result: 6/6 PASSED**

```
Test Files  1 passed (1)
     Tests  6 passed (6)
```

Tests covered:
- Test 1: 2-var BODY → `{ bodyText: "...", varCount: 2 }`
- Test 2: 0-var BODY → `varCount: 0`
- Test 3: malformed JSON → `{ bodyText: "", varCount: 0 }`
- Test 4: missing BODY component (HEADER/FOOTER only) → `{ bodyText: "", varCount: 0 }`
- Test 5: ANTHROPIC_API_KEY unset → fallback `{ "1": "Sarah", "2": "our classes" }`
- Test 6: `varCount === 0` → `{}` without throwing

No live Anthropic API calls in the test suite.

### TypeScript: `cd apps/staff-web && npx tsc --noEmit`
**Result: 0 errors (no output)**

## Operational Caveats

- **Only staff-web (Vercel) needs `LEAD_ACK_TEMPLATE_NAME`** — the LLM fill and enqueue happen in staff-web. The worker just processes the job's vars and does NOT need this env var. `ANTHROPIC_API_KEY` is already set in staff-web's Vercel env (confirmed by prior task 260609-fcm / 260615-k8m analyze route).

- **Template must be approved before any send fires** — the template row must exist in `whatsapp_templates` with `status = 'approved'` (synced via the inbox "Update templates" button / MYÜTIK cron). Until then, the step-14 block self-skips and the lead lands in the inbox without an ack.

- **LLM call adds ~1–2s synchronous latency** to the form-submit response. Acceptable for the demo. Possible follow-up: move the fill to an async self-fired task (integration-webhooks pattern) or to the worker if latency matters — do NOT use Vercel `after()`/`waitUntil` (forbidden by AGENTS.md).

- **Variable count is derived from the approved template body** — the fill adapts automatically if the final approved template differs from the 2-var draft. No code change needed.

## Commits

| Hash | Message |
|------|---------|
| `587e9d4f` | feat(quick-260618-fqg): add lead-ack module with parseTemplateBody + buildLeadAckVars |
| `712353b8` | feat(quick-260618-fqg): rework step-14 to AI-fill template vars + real language |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/staff-web/features/forms/lib/lead-ack.ts` — FOUND
- `apps/staff-web/features/forms/lib/lead-ack.test.ts` — FOUND
- `apps/staff-web/features/forms/handlers/submissions.ts` — modified, FOUND
- commit `587e9d4f` — FOUND
- commit `712353b8` — FOUND
