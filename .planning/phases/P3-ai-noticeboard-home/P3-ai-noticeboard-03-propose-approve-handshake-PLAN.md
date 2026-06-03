---
phase: P3-ai-noticeboard-home
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - apps/staff-web/actions/propose-action.ts
  - apps/staff-web/actions/approve-proposal.ts
  - apps/staff-web/actions/reject-proposal.ts
autonomous: true
requirements: [SC-5]
must_haves:
  truths:
    - "Agent can create a pending proposal that persists and surfaces on the noticeboard"
    - "Coach approving a proposal executes the stored action via the EXISTING gated action (send-template-to-members / create-checkout-link) — no direct Meta/Stripe call from the approve handler"
    - "An out-of-window or no-opt-in WhatsApp send is still rejected by the worker chokepoint when approved (one-click approve is NOT a bypass)"
    - "Coach can dismiss a proposal (status='rejected') so the agent has feedback"
  artifacts:
    - path: "apps/staff-web/actions/propose-action.ts"
      provides: "Agent creates a pending dashboard_proposals row"
      contains: "actionName"
    - path: "apps/staff-web/actions/approve-proposal.ts"
      provides: "Coach-triggered execution of a proposal via allowlisted existing action"
      contains: "ACTION_ALLOWLIST"
    - path: "apps/staff-web/actions/reject-proposal.ts"
      provides: "Coach dismisses a proposal (status='rejected')"
      contains: "rejected"
  key_links:
    - from: "apps/staff-web/actions/approve-proposal.ts"
      to: "send-template-to-members.ts / create-checkout-link.ts (existing gated actions)"
      via: "dynamic import of the action module + .run(validatedParams) — routes through enqueueOutboundWhatsApp worker chokepoint"
      pattern: "import\\(\"\\./(send-template-to-members|create-checkout-link)"
    - from: "apps/staff-web/actions/approve-proposal.ts"
      to: "dashboard_proposals status lifecycle"
      via: "status pending -> executed (or error left pending)"
      pattern: "status: \"executed\""
---

<objective>
Build the propose→approve→execute handshake as three actions. `propose-action` (agent) writes a pending proposal. `approve-proposal` (coach, one-click) re-validates the stored params against the target action's own Zod schema, then executes via the EXISTING gated action (`send-template-to-members` or `create-checkout-link`) — which routes WhatsApp through `enqueueOutboundWhatsApp` → worker `sendMessage()` chokepoint, preserving opt-in/24h-window/approved-template gates. `reject-proposal` lets the coach dismiss.

Purpose: Backs SC-5 — the propose→approve→execute round-trip with gates intact. This is the most security-sensitive plan.
Output: 3 new `defineAction` files. The approve handler NEVER touches Meta/Stripe directly; it only calls the same already-gated actions.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md
@apps/staff-web/actions/send-template-to-members.ts
@apps/staff-web/actions/create-checkout-link.ts
@apps/staff-web/server/db/schema.ts

<interfaces>
<!-- Target gated actions (verified):
       send-template-to-members.ts: defineAction, POST.
         params: { memberIds: string[] (1..500), templateName: string, variables?: Record<string,string> }
         returns: { queued, conversationsCreated, failed } OR { error, queued:0, ... } if template not approved.
         Internally: pre-gates template approval, then enqueueOutboundWhatsApp per member -> worker sendMessage() re-checks opt-in + window + template. NO direct Meta call. THIS is the chokepoint that must stay in force.
       create-checkout-link.ts: defineAction, POST.
         params: { memberId: string, priceId: string, productName?: string }
         returns: { url, sessionId, productName }

     - defineAction default export is an object; its .run is the callable. Invoking server-side:
         const mod = await import("./send-template-to-members.js");
         const result = await mod.default.run(validatedParams);
       The .schema property is the Zod schema — use mod.default.schema.safeParse(params) BEFORE run() (Pitfall 2: stored paramsJson must be re-validated; do NOT call run() with unvalidated JSON).
     - dashboard_proposals columns (Plan 01): id, taskId, actionName, paramsJson, rationale, status, proposedAt, executedAt, rejectedAt, resultJson.
     - guard:allow-unscoped required on every dashboard_proposals query. nanoid for ids. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create propose-action (agent queues a pending proposal)</name>
  <read_first>
    - apps/staff-web/actions/send-template-to-members.ts (to mirror the exact param shape the agent must store for that actionName)
    - apps/staff-web/actions/create-checkout-link.ts (param shape for the other allowlisted action)
    - apps/staff-web/server/db/schema.ts (dashboardProposals export — confirm paramsJson/rationale/status/proposedAt columns)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"Pattern 3: Propose→Approve→Execute Handshake"
  </read_first>
  <action>
Create `apps/staff-web/actions/propose-action.ts` (POST mutation):

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";

export default defineAction({
  description:
    "Propose a one-click action for the coach to approve on the noticeboard. " +
    "Use this AFTER gathering data (e.g. list-at-risk-members) when you want to recommend a send/checkout. " +
    "The coach approves with one click; the existing gated action then executes (WhatsApp still passes the " +
    "worker's opt-in + 24h-window + approved-template gates — you are NOT bypassing them). " +
    "actionName must be 'send-template-to-members' or 'create-checkout-link'. " +
    "params must match that action's schema exactly. Returns { proposalId }.",
  schema: z.object({
    taskId: z.string().optional().describe("Optional dashboard_tasks.id to link this proposal to a task"),
    actionName: z.enum(["send-template-to-members", "create-checkout-link"])
      .describe("The existing gated action this proposal will execute on approval"),
    params: z.record(z.string(), z.unknown())
      .describe("Params for the target action (e.g. {memberIds, templateName} for send-template-to-members)"),
    rationale: z.string().max(500)
      .describe("Why you are recommending this — shown to the coach before they approve"),
  }),
  run: async ({ taskId, actionName, params, rationale }) => {
    const db = getDb();
    const id = `dprop_${nanoid()}`;
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db.insert(schema.dashboardProposals).values({
      id,
      taskId: taskId ?? null,
      actionName,
      paramsJson: JSON.stringify(params ?? {}),
      rationale,
      status: "pending",
      proposedAt: new Date().toISOString(),
    });
    return { proposalId: id };
  },
});
```
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/propose-action.ts contains "defineAction(" and z.enum(["send-template-to-members", "create-checkout-link"])
    - File stores params via "JSON.stringify(params" into paramsJson and sets status "pending"
    - File contains a "guard:allow-unscoped" comment; is a POST mutation (no http GET)
    - Replay against gymos-demo Neon: INSERT a dprop_test pending proposal with actionName='send-template-to-members', confirm 1 row status='pending', then DELETE it — verify via Neon MCP
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>propose-action persists a pending proposal with the target actionName + JSON params + rationale; verified via Neon replay + cleanup; typechecks.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create approve-proposal (allowlist + re-validate + execute via existing gated action)</name>
  <read_first>
    - apps/staff-web/actions/propose-action.ts (just created — proposal row shape)
    - apps/staff-web/actions/send-template-to-members.ts (confirm default export has .run and .schema; confirm it uses enqueueOutboundWhatsApp NOT a direct Meta call)
    - apps/staff-web/actions/create-checkout-link.ts (confirm default export .run + .schema)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"approve-proposal.ts" + §"Pitfall 2"
  </read_first>
  <action>
Create `apps/staff-web/actions/approve-proposal.ts` (POST mutation). SECURITY-CRITICAL: hardcoded allowlist + re-validate stored params against the target action's own Zod schema before calling its run():

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq } from "drizzle-orm";

// Only these two actions may ever be executed via a proposal. Both route
// through their own gates (send-template-to-members -> enqueueOutboundWhatsApp
// -> worker sendMessage() chokepoint: opt-in + 24h window + approved-template).
// This handler NEVER calls Meta or Stripe directly.
const ACTION_ALLOWLIST = ["send-template-to-members", "create-checkout-link"] as const;

export default defineAction({
  description:
    "Approve a pending AI proposal and execute it via the existing gated action. " +
    "Looks up the proposal, validates it is pending and in the allowlist, re-validates the stored " +
    "params against the target action's schema, then runs it. For WhatsApp sends this still passes " +
    "the worker's opt-in/window/template gates. Returns { executed, result } or { error }.",
  schema: z.object({
    proposalId: z.string().min(1).describe("dashboard_proposals.id to approve and execute"),
  }),
  run: async ({ proposalId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    const [proposal] = await db
      .select()
      .from(schema.dashboardProposals)
      .where(
        and(
          eq(schema.dashboardProposals.id, proposalId),
          eq(schema.dashboardProposals.status, "pending"),
        ),
      )
      .limit(1);

    if (!proposal) return { error: "Proposal not found or already actioned" };
    if (!ACTION_ALLOWLIST.includes(proposal.actionName as any)) {
      return { error: "Action not in allowlist" };
    }

    let rawParams: unknown;
    try {
      rawParams = JSON.parse(proposal.paramsJson);
    } catch {
      return { error: "Stored params are not valid JSON" };
    }

    // Dynamically import the target action and re-validate params against ITS schema
    // (Pitfall 2 — never call run() with unvalidated stored JSON).
    let mod: any;
    if (proposal.actionName === "send-template-to-members") {
      mod = await import("./send-template-to-members.js");
    } else {
      mod = await import("./create-checkout-link.js");
    }
    const parsed = mod.default.schema.safeParse(rawParams);
    if (!parsed.success) {
      return { error: "Stored params failed validation", issues: parsed.error.issues };
    }

    const result = await mod.default.run(parsed.data);

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.dashboardProposals)
      .set({
        status: "executed",
        executedAt: new Date().toISOString(),
        resultJson: JSON.stringify(result),
      })
      .where(eq(schema.dashboardProposals.id, proposalId));

    return { executed: true, result };
  },
});
```

Note the dynamic import paths use the `.js` ESM extension (matches sibling actions' import convention). Do NOT add `@gymos/whatsapp` here — execution flows through send-template-to-members which uses the queue client (the guard script forbids @gymos/whatsapp in staff-web).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/approve-proposal.ts contains "const ACTION_ALLOWLIST" with both "send-template-to-members" and "create-checkout-link"
    - File contains "mod.default.schema.safeParse" (re-validation before run — Pitfall 2)
    - File contains import("./send-template-to-members.js") and import("./create-checkout-link.js")
    - File sets status "executed" + executedAt + resultJson on success
    - File does NOT import "@gymos/whatsapp" (grep returns no match) — execution routes through send-template-to-members's queue client
    - File contains "guard:allow-unscoped"; is a POST mutation
    - staff-web tsc --noEmit exits 0
    - Guard passes: running the repo guard chain (e.g. guard-no-whatsapp-in-staff-web.mjs) reports no @gymos/whatsapp import in apps/staff-web
  </acceptance_criteria>
  <done>approve-proposal validates allowlist + re-validates stored params against the target action schema, executes via the existing gated action (no direct Meta/Stripe), and stamps the proposal executed; typechecks; no @gymos/whatsapp import.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Create reject-proposal (dismiss with feedback)</name>
  <read_first>
    - apps/staff-web/actions/approve-proposal.ts (just created — mirror the lookup-by-pending pattern)
    - apps/staff-web/server/db/schema.ts (dashboardProposals.rejectedAt column from Plan 01)
  </read_first>
  <action>
Create `apps/staff-web/actions/reject-proposal.ts` (POST mutation):

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq } from "drizzle-orm";

export default defineAction({
  description:
    "Dismiss a pending AI proposal without executing it. Sets status='rejected' and stamps rejected_at " +
    "so the agent has feedback and does not immediately re-propose the same thing. Returns { rejected }.",
  schema: z.object({
    proposalId: z.string().min(1).describe("dashboard_proposals.id to dismiss"),
  }),
  run: async ({ proposalId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
    await db
      .update(schema.dashboardProposals)
      .set({ status: "rejected", rejectedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.dashboardProposals.id, proposalId),
          eq(schema.dashboardProposals.status, "pending"),
        ),
      );
    return { rejected: true };
  },
});
```
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/reject-proposal.ts contains "defineAction(" and "status: \"rejected\"" and "rejectedAt"
    - The UPDATE only affects rows where status='pending' (and(... eq(status, "pending")))
    - File contains "guard:allow-unscoped"; is a POST mutation
    - Replay against gymos-demo Neon: INSERT a dprop_test pending proposal, run the reject UPDATE, confirm status='rejected' + rejected_at non-null, then DELETE — verify via Neon MCP
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>reject-proposal flips a pending proposal to rejected with a timestamp; verified via Neon replay + cleanup; typechecks.</done>
</task>

</tasks>

<verification>
- All three action files compile (staff-web `tsc --noEmit` clean).
- approve-proposal carries the hardcoded ACTION_ALLOWLIST AND re-validates stored params against the target action schema (Pitfall 2) AND imports no @gymos/whatsapp (guard passes).
- The security invariant holds by construction: approve executes ONLY via send-template-to-members / create-checkout-link, both of which keep the worker chokepoint gates. The approve handler makes no Meta/Stripe call itself.
- VERIFICATION CONSTRAINT honored: no local HTTP. Proposal lifecycle (pending -> rejected, and the row read/update SQL) verified via Neon MCP replay + cleanup. The full propose→approve→execute over HTTP — including confirming an out-of-window/no-opt-in send still lands status='failed' with the typed worker error — is deferred to the Plan 06 e2e smoke on the live Vercel deploy (which exercises the real worker).
</verification>

<success_criteria>
SC-5's action layer is complete: a proposal can be created, approved (executing the gated action), or rejected. Plan 04 wires the noticeboard Approve/Dismiss buttons (AlertDialog for sends) to approve-proposal/reject-proposal. Plan 05 names propose-action in the system prompt so the agent can queue proposals. Plan 06 proves the end-to-end gate-still-holds claim over HTTP.
</success_criteria>

<output>
After completion, create `.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-03-SUMMARY.md` recording: the dynamic-import re-validation approach, confirmation the guard chain passed (no @gymos/whatsapp), and the Neon replay results for the proposal lifecycle.
</output>
