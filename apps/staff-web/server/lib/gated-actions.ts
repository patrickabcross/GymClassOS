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
