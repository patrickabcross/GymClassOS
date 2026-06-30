---
phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/lib/gated-actions.ts
  - apps/staff-web/actions/approve-proposal.ts
  - apps/staff-web/actions/propose-action.ts
  - apps/staff-web/server/lib/mobile-admin-tools.ts
  - apps/staff-web/server/lib/mobile-admin-tools.test.ts
autonomous: true
requirements: [AI-02]
must_haves:
  truths:
    - "The five gated Tier-3 verbs live in exactly one exported constant, imported by both approve-proposal.ts and propose-action.ts"
    - "The mobile admin tool list is built from an explicit 12-verb allow-list (read + dashboard only), never by ALL−GATED subtraction"
    - "Even if a gated verb is added to the allow-list, the built tool list structurally excludes it (defensive filter)"
    - "A unit test fails if any gated verb appears in the built tool list or if any mutating verb is present"
  artifacts:
    - path: "apps/staff-web/server/lib/gated-actions.ts"
      provides: "Single GATED_ACTION_LIST tuple + GATED_ACTIONS Set source of truth"
      contains: "GATED_ACTION_LIST"
    - path: "apps/staff-web/server/lib/mobile-admin-tools.ts"
      provides: "MOBILE_ADMIN_ALLOWLIST (12 verbs) + pure buildAdminToolList(registry, allowlist?)"
      contains: "MOBILE_ADMIN_ALLOWLIST"
    - path: "apps/staff-web/server/lib/mobile-admin-tools.test.ts"
      provides: "AI-02 keystone proof — gated verbs absent, no mutating verb present"
      contains: "buildAdminToolList"
  key_links:
    - from: "apps/staff-web/actions/approve-proposal.ts"
      to: "apps/staff-web/server/lib/gated-actions.ts"
      via: "import GATED_ACTION_LIST"
      pattern: "gated-actions"
    - from: "apps/staff-web/actions/propose-action.ts"
      to: "apps/staff-web/server/lib/gated-actions.ts"
      via: "import GATED_ACTION_LIST for the Zod enum"
      pattern: "gated-actions"
    - from: "apps/staff-web/server/lib/mobile-admin-tools.ts"
      to: "apps/staff-web/server/lib/gated-actions.ts"
      via: "import GATED_ACTIONS for the defensive filter"
      pattern: "GATED_ACTIONS"
---

<objective>
Build the MA4 security keystone (AI-02): a single source-of-truth `GATED_ACTIONS` constant, an explicit `MOBILE_ADMIN_ALLOWLIST` of the 12 read+dashboard verbs the phone admin agent may call, a pure `buildAdminToolList()` that defensively strips any gated verb, and a vitest unit test that proves no gated/mutating verb can ever reach the mobile admin tool list.

Purpose: This is the load-bearing security boundary of the whole phase. The endpoint (MA4-02) and client (MA4-03) consume these constants. Getting this list — and its test — right is what makes "read + dashboard only" structurally true, not just a prompt convention.

Output: 1 new pure constants file, 1 new pure helper + test file, 2 refactored action files that now import the shared gated set (collapsing the standing "update both files" rule into one edit point).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-CONTEXT.md
@.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-RESEARCH.md

<interfaces>
<!-- Current gated set, duplicated across two files, kept in sync by a standing rule. -->
<!-- This plan extracts it to ONE exported constant. -->

apps/staff-web/actions/approve-proposal.ts (current inline list — to be replaced by import):
```ts
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
  "cancel-occurrence",
  "reschedule-occurrence",
] as const;
// used as: ACTION_ALLOWLIST.includes(proposal.actionName as (typeof ACTION_ALLOWLIST)[number])
```

apps/staff-web/actions/propose-action.ts (current inline Zod enum — to be replaced by import):
```ts
actionName: z.enum([
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
  "cancel-occurrence",
  "reschedule-occurrence",
]).describe("...")
```

ActionEntry registry shape (from loadActionsFromStaticRegistry — DO NOT import in the test, see Task 2):
```ts
// registry[name] = { tool: { description: string; parameters: object /* JSON Schema */ }, run: (input) => Promise<any>, http?, ... }
```

LOCKED allow-list (MA4-CONTEXT.md — read + dashboard only, exactly 12 verbs):
  Tier-1 reads:  list-fill-rate, list-renewals, list-revenue, list-payments,
                 list-at-risk-members, list-inbox-summary, list-classes, list-members, list-trainers
  Tier-2 author: upsert-section-note, create-task, complete-task
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract GATED_ACTIONS to one source of truth; re-import in both action files</name>
  <read_first>
    - apps/staff-web/actions/approve-proposal.ts (the file being modified — current inline ACTION_ALLOWLIST at lines 10-16)
    - apps/staff-web/actions/propose-action.ts (the file being modified — current inline Zod enum at lines 20-29)
    - apps/staff-web/server/lib/role-resolver.ts (sibling example of a pure server/lib module with no @agent-native/core import)
  </read_first>
  <files>apps/staff-web/server/lib/gated-actions.ts (new), apps/staff-web/actions/approve-proposal.ts (edit), apps/staff-web/actions/propose-action.ts (edit)</files>
  <action>
1. Create `apps/staff-web/server/lib/gated-actions.ts` as a PURE module (NO imports — must be safe to import under vitest.unit.config.ts which cannot load @agent-native/core). Exact contents:
```ts
// Single source of truth for the five gated Tier-3 verbs.
// Re-imported by approve-proposal.ts (ACTION_ALLOWLIST), propose-action.ts
// (Zod enum), AND mobile-admin-tools.ts (defensive filter). Collapses the
// standing v1.2 "update both files" rule (2026-06-18) into one edit point.
// PURE: no imports — safe under vitest.unit.config.ts.
export const GATED_ACTION_LIST = [
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
  "cancel-occurrence",
  "reschedule-occurrence",
] as const;

export type GatedActionName = (typeof GATED_ACTION_LIST)[number];

export const GATED_ACTIONS = new Set<string>(GATED_ACTION_LIST);
```
2. Edit `apps/staff-web/actions/approve-proposal.ts`: delete the inline `ACTION_ALLOWLIST` const (lines 10-16) and add at the top `import { GATED_ACTION_LIST } from "../server/lib/gated-actions.js";` then `const ACTION_ALLOWLIST = GATED_ACTION_LIST;`. Leave the existing `.includes(proposal.actionName as (typeof ACTION_ALLOWLIST)[number])` usage unchanged (it still type-checks). Do NOT change the dynamic-import-and-revalidate logic.
3. Edit `apps/staff-web/actions/propose-action.ts`: add `import { GATED_ACTION_LIST } from "../server/lib/gated-actions.js";` and replace the inline `z.enum([...])` array with `z.enum(GATED_ACTION_LIST)`. Keep the `.describe(...)` call. (Zod v4 `z.enum` accepts a readonly tuple.)
4. Use `.js` extensions in the import specifiers (project ESM convention — match neighbouring imports like `../server/db/index.js`).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -E "approve-proposal|propose-action|gated-actions" || echo "TSC CLEAN for touched files"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export const GATED_ACTION_LIST" apps/staff-web/server/lib/gated-actions.ts` (constant exported)
    - `grep -q "export const GATED_ACTIONS" apps/staff-web/server/lib/gated-actions.ts` (Set exported)
    - `grep -q "gated-actions" apps/staff-web/actions/approve-proposal.ts` (approve-proposal imports the shared set)
    - `grep -q "gated-actions" apps/staff-web/actions/propose-action.ts` (propose-action imports the shared set)
    - `grep -q "z.enum(GATED_ACTION_LIST)" apps/staff-web/actions/propose-action.ts` (Zod enum derives from the shared tuple)
    - `! grep -q "^import" apps/staff-web/server/lib/gated-actions.ts` (gated-actions.ts has NO imports — stays vitest-safe)
  </acceptance_criteria>
  <done>The five gated verbs exist in exactly one file; approve-proposal.ts and propose-action.ts both import it; tsc is clean for the touched files; gated-actions.ts has zero imports.</done>
</task>

<task type="auto">
  <name>Task 2: MOBILE_ADMIN_ALLOWLIST + pure buildAdminToolList + AI-02 unit test</name>
  <read_first>
    - apps/staff-web/server/lib/gated-actions.ts (created in Task 1 — import GATED_ACTIONS from here)
    - apps/staff-web/vitest.unit.config.ts (confirms server/lib/**/*.test.ts is picked up AND that @agent-native/core CANNOT be imported in unit tests)
    - apps/staff-web/server/lib/role-resolver.test.ts (established pure-unit-test pattern in server/lib)
    - .planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-CONTEXT.md (the LOCKED 12-verb allow-list)
  </read_first>
  <files>apps/staff-web/server/lib/mobile-admin-tools.ts (new), apps/staff-web/server/lib/mobile-admin-tools.test.ts (new)</files>
  <action>
1. Create `apps/staff-web/server/lib/mobile-admin-tools.ts` — PURE module, only import is `./gated-actions.js`. Contents:
```ts
import { GATED_ACTIONS } from "./gated-actions.js";

// LOCKED scope (MA4-CONTEXT.md): READ + DASHBOARD ONLY. Exactly these 12 verbs.
// NOT ALL−GATED subtraction (the static registry has ~80 actions incl. upstream
// Mail + staff-only verbs that subtraction would leak). Explicit allow-list only.
export const MOBILE_ADMIN_ALLOWLIST = [
  // Tier 1 — reads
  "list-fill-rate",
  "list-renewals",
  "list-revenue",
  "list-payments",
  "list-at-risk-members",
  "list-inbox-summary",
  "list-classes",
  "list-members",
  "list-trainers",
  // Tier 2 — dashboard / board authoring
  "upsert-section-note",
  "create-task",
  "complete-task",
] as const;

// Minimal structural shape of a loaded action registry entry we depend on.
type RegistryLike = Record<
  string,
  { tool: { description: string; parameters: unknown }; run: (input: any) => Promise<any> }
>;

export type AdminTool = { name: string; description: string; input_schema: unknown };

// PURE + testable: takes the registry (and optionally the allow-list) as args so
// the unit test can pass a stub registry / a deliberately-polluted allow-list
// WITHOUT importing @agent-native/core (vitest ESM/CJS caveat — BD4-01).
export function buildAdminToolList(
  registry: RegistryLike,
  allowlist: readonly string[] = MOBILE_ADMIN_ALLOWLIST,
): AdminTool[] {
  return allowlist
    .filter((name) => !GATED_ACTIONS.has(name)) // defensive structural filter
    .filter((name) => Boolean(registry[name])) // skip anything missing from registry
    .map((name) => ({
      name,
      description: registry[name].tool.description,
      input_schema: registry[name].tool.parameters,
    }));
}
```
2. Create `apps/staff-web/server/lib/mobile-admin-tools.test.ts`. It MUST NOT import `@agent-native/core` or `../../.generated/actions-registry` (both pull CJS React → break under vitest.unit.config.ts). Use a hand-written stub registry. Contents:
```ts
import { describe, it, expect } from "vitest";
import { GATED_ACTIONS, GATED_ACTION_LIST } from "./gated-actions.js";
import { MOBILE_ADMIN_ALLOWLIST, buildAdminToolList } from "./mobile-admin-tools.js";

const GATED = [
  "send-template-to-members",
  "create-checkout-link",
  "cancel-occurrence",
  "reschedule-occurrence",
  "publish-form",
];

// Verbs that mutate studio data — must NEVER be in the read+dashboard allow-list.
const MUTATING = [
  ...GATED,
  "update-member",
  "create-class-definition",
  "create-class-occurrence",
  "set-occurrence-capacity",
  "update-class-definition",
  "mark-occurrence-complete",
  "create-trainer",
  "update-trainer",
  "create-schedule-rule",
  "update-schedule-rule",
  "deactivate-schedule-rule",
  "save-segment",
  "import-leads",
  "content-create-document",
  "content-update-document",
  "video-create-composition",
  "send-email",
  "archive-email",
];

function stubRegistry(names: string[]) {
  const reg: Record<string, any> = {};
  for (const n of names) reg[n] = { tool: { description: `desc ${n}`, parameters: { type: "object", properties: {} } }, run: async () => ({}) };
  return reg;
}

describe("mobile admin tool allow-list (AI-02)", () => {
  it("GATED_ACTIONS is exactly the five gated Tier-3 verbs", () => {
    expect([...GATED_ACTIONS].sort()).toEqual([...GATED].sort());
    expect([...GATED_ACTION_LIST].sort()).toEqual([...GATED].sort());
  });

  it("MOBILE_ADMIN_ALLOWLIST is exactly the 12 locked read+dashboard verbs", () => {
    expect([...MOBILE_ADMIN_ALLOWLIST].sort()).toEqual(
      [
        "complete-task",
        "create-task",
        "list-at-risk-members",
        "list-classes",
        "list-fill-rate",
        "list-inbox-summary",
        "list-members",
        "list-payments",
        "list-renewals",
        "list-revenue",
        "list-trainers",
        "upsert-section-note",
      ].sort(),
    );
  });

  it("the allow-list contains no gated or mutating verb", () => {
    for (const m of MUTATING) expect(MOBILE_ADMIN_ALLOWLIST).not.toContain(m);
  });

  it("the BUILT tool list excludes every gated verb even when present in the registry", () => {
    const reg = stubRegistry([...MOBILE_ADMIN_ALLOWLIST, ...GATED]);
    const names = buildAdminToolList(reg).map((t) => t.name);
    for (const g of GATED) expect(names).not.toContain(g);
    expect(names.sort()).toEqual([...MOBILE_ADMIN_ALLOWLIST].sort());
  });

  it("the defensive GATED_ACTIONS filter strips a gated verb wrongly added to the allow-list", () => {
    const polluted = [...MOBILE_ADMIN_ALLOWLIST, "cancel-occurrence", "create-checkout-link"];
    const reg = stubRegistry(polluted);
    const names = buildAdminToolList(reg, polluted).map((t) => t.name);
    expect(names).not.toContain("cancel-occurrence");
    expect(names).not.toContain("create-checkout-link");
  });
});
```
3. Run the test and confirm green.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run --config vitest.unit.config.ts server/lib/mobile-admin-tools.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export const MOBILE_ADMIN_ALLOWLIST" apps/staff-web/server/lib/mobile-admin-tools.ts`
    - `grep -q "export function buildAdminToolList" apps/staff-web/server/lib/mobile-admin-tools.ts`
    - `grep -q "GATED_ACTIONS.has" apps/staff-web/server/lib/mobile-admin-tools.ts` (defensive filter present)
    - `! grep -q "agent-native/core" apps/staff-web/server/lib/mobile-admin-tools.ts` (helper stays pure)
    - `! grep -q "agent-native/core\|actions-registry" apps/staff-web/server/lib/mobile-admin-tools.test.ts` (test uses a stub registry, no CJS pull-in)
    - `grep -c "list-" apps/staff-web/server/lib/mobile-admin-tools.ts` returns ≥ 9 (the nine Tier-1 reads)
    - vitest exits 0 with all assertions passing
  </acceptance_criteria>
  <done>buildAdminToolList is a pure, testable function; the 12-verb allow-list is locked; the unit test proves every gated AND mutating verb is absent from both the allow-list and the built tool list; test is green under vitest.unit.config.ts without importing @agent-native/core.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean for gated-actions.ts, mobile-admin-tools.ts, approve-proposal.ts, propose-action.ts.
- `npx vitest run --config vitest.unit.config.ts server/lib/mobile-admin-tools.test.ts` passes.
- The five gated verbs exist in exactly one file (gated-actions.ts); both action files import it.
- buildAdminToolList structurally excludes gated verbs even when injected (defensive filter proven by test).
</verification>

<success_criteria>
- AI-02 keystone foundation in place: explicit allow-list + single gated source + defensive filter + passing unit test.
- No mutating verb (gated or non-gated) appears in MOBILE_ADMIN_ALLOWLIST.
- gated-actions.ts and mobile-admin-tools.ts are pure (no @agent-native/core import) so they remain importable from the unit test runner.
</success_criteria>

<output>
After completion, create `.planning/phases/MA4-admin-mobile-ai-agent-differentiator-security-keystone/MA4-01-SUMMARY.md`.
</output>
